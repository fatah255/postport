import { AccountStatus, Platform } from "@prisma/client";
import { decryptText, encryptText } from "@postport/utils";
import { PlatformPublishError, ensureRecord } from "../platforms/errors";

export const REFRESH_LOOKAHEAD_MS = 7 * 24 * 60 * 60 * 1000;

export interface TokenRefreshPayload {
  connectedAccountId: string;
}

interface StoredTokenPayload {
  accessToken: string;
  refreshToken?: string | null;
  tokenType?: string | null;
}

interface TokenSecretRecord {
  id: string;
  encryptedPayload: string;
  iv: string;
  tag: string;
  expiresAt?: Date | null;
  refreshExpiresAt?: Date | null;
  createdAt?: Date;
}

interface RefreshableCredential {
  id: string;
  externalUserId: string;
  tokenSecrets: TokenSecretRecord[];
}

interface RefreshableAccount {
  id: string;
  platform: Platform;
  remoteAccountId: string;
  oauthCredentials: RefreshableCredential[];
}

interface TokenRefreshEnv {
  META_APP_ID?: string;
  META_APP_SECRET?: string;
  META_API_VERSION: string;
  TIKTOK_CLIENT_KEY?: string;
  TIKTOK_CLIENT_SECRET?: string;
  TOKEN_ENCRYPTION_KEY: string;
}

interface TokenRefreshQueue {
  add: (
    name: string,
    data: TokenRefreshPayload,
    options: {
      jobId: string;
      removeOnComplete: number;
      removeOnFail: boolean;
    }
  ) => Promise<unknown>;
}

interface TokenRefreshPrisma {
  connectedAccount: {
    findMany: any;
    findUnique: any;
    update: any;
  };
  oAuthCredential: {
    upsert: any;
  };
  tokenSecret: {
    findFirst: any;
    update: any;
    create: any;
  };
  connectedPageOrProfile: {
    updateMany: any;
  };
}

type RequestJson = <T>(url: string, init?: RequestInit) => Promise<T>;

interface TokenRefreshServiceDependencies {
  env: TokenRefreshEnv;
  prisma: TokenRefreshPrisma;
  queue: TokenRefreshQueue;
  requestJson: RequestJson;
}

export const createTokenRefreshService = (deps: TokenRefreshServiceDependencies) => {
  const enqueueDueTokenRefreshJobs = async () => {
    const dueAccounts = (await deps.prisma.connectedAccount.findMany({
      where: {
        status: AccountStatus.ACTIVE,
        tokenExpiresAt: {
          lte: new Date(Date.now() + REFRESH_LOOKAHEAD_MS)
        }
      },
      select: {
        id: true
      }
    })) as Array<{ id: string }>;

    for (const account of dueAccounts) {
      await deps.queue.add(
        "connections.token-refresh",
        { connectedAccountId: account.id },
        {
          jobId: `token_refresh_${account.id}`,
          removeOnComplete: 200,
          removeOnFail: false
        }
      );
    }

    return {
      queued: dueAccounts.length
    };
  };

  const processTokenRefresh = async (payload: TokenRefreshPayload) => {
    const account = (await deps.prisma.connectedAccount.findUnique({
      where: {
        id: payload.connectedAccountId
      },
      include: {
        oauthCredentials: {
          include: {
            tokenSecrets: {
              orderBy: {
                createdAt: "desc"
              },
              take: 1
            }
          }
        },
        profiles: true
      }
    })) as RefreshableAccount | null;

    if (!account) {
      return {
        skipped: true,
        reason: "connected_account_not_found"
      };
    }

    try {
      if (account.platform === Platform.TIKTOK) {
        return await refreshTikTokAccount(account);
      }

      if (account.platform === Platform.INSTAGRAM || account.platform === Platform.FACEBOOK) {
        return await refreshMetaAccount(account);
      }

      return {
        skipped: true,
        reason: "unsupported_platform"
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : "Token refresh failed.";
      await deps.prisma.connectedAccount.update({
        where: {
          id: account.id
        },
        data: {
          status: AccountStatus.EXPIRED,
          lastError: message
        }
      });

      throw error;
    }
  };

  const refreshMetaAccount = async (account: RefreshableAccount) => {
    if (!deps.env.META_APP_ID || !deps.env.META_APP_SECRET) {
      throw new PlatformPublishError(
        "Meta token refresh is not configured in the worker environment.",
        "auth",
        "meta_refresh_not_configured",
        false
      );
    }

    const userCredential = account.oauthCredentials.find(
      (credential) => credential.externalUserId === account.remoteAccountId
    );
    const userSecret = userCredential?.tokenSecrets[0];
    if (!userCredential || !userSecret) {
      throw new PlatformPublishError(
        "Meta user credential was not found for refresh.",
        "auth",
        "meta_user_credential_missing",
        false
      );
    }

    const currentPayload = decodeTokenPayload(userSecret);
    const refreshed = await deps.requestJson<{
      access_token: string;
      token_type?: string;
      expires_in?: number;
    }>(
      `https://graph.facebook.com/${deps.env.META_API_VERSION}/oauth/access_token?${new URLSearchParams({
        client_id: deps.env.META_APP_ID,
        client_secret: deps.env.META_APP_SECRET,
        grant_type: "fb_exchange_token",
        fb_exchange_token: currentPayload.accessToken
      }).toString()}`
    );

    const expiresAt = refreshed.expires_in ? new Date(Date.now() + refreshed.expires_in * 1000) : null;
    await upsertEncryptedSecret({
      credentialId: userCredential.id,
      payload: {
        accessToken: refreshed.access_token,
        tokenType: refreshed.token_type ?? currentPayload.tokenType ?? "bearer"
      },
      expiresAt
    });

    const pagesResponse = await deps.requestJson<{
      data: Array<{
        id: string;
        access_token?: string;
        tasks?: string[];
      }>;
    }>(
      `https://graph.facebook.com/${deps.env.META_API_VERSION}/me/accounts?${new URLSearchParams({
        access_token: refreshed.access_token,
        fields: "id,access_token,tasks"
      }).toString()}`
    );

    for (const page of pagesResponse.data) {
      if (!page.access_token) {
        continue;
      }

      const credential = await deps.prisma.oAuthCredential.upsert({
        where: {
          connectedAccountId_provider_externalUserId: {
            connectedAccountId: account.id,
            provider: account.platform,
            externalUserId: page.id
          }
        },
        create: {
          connectedAccountId: account.id,
          provider: account.platform,
          externalUserId: page.id,
          scopesJson: {
            tasks: page.tasks ?? []
          } as never
        },
        update: {
          scopesJson: {
            tasks: page.tasks ?? []
          } as never
        }
      });

      await upsertEncryptedSecret({
        credentialId: credential.id,
        payload: {
          accessToken: page.access_token,
          tokenType: "page"
        },
        expiresAt
      });
    }

    await deps.prisma.connectedAccount.update({
      where: {
        id: account.id
      },
      data: {
        tokenExpiresAt: expiresAt,
        status: AccountStatus.ACTIVE,
        lastError: null
      }
    });

    return {
      connectedAccountId: account.id,
      platform: account.platform,
      refreshed: true
    };
  };

  const refreshTikTokAccount = async (account: RefreshableAccount) => {
    if (!deps.env.TIKTOK_CLIENT_KEY || !deps.env.TIKTOK_CLIENT_SECRET) {
      throw new PlatformPublishError(
        "TikTok token refresh is not configured in the worker environment.",
        "auth",
        "tiktok_refresh_not_configured",
        false
      );
    }

    const credential = account.oauthCredentials.find((item) => item.externalUserId === account.remoteAccountId);
    const secret = credential?.tokenSecrets[0];
    if (!credential || !secret) {
      throw new PlatformPublishError("TikTok credential was not found for refresh.", "auth", "tiktok_credential_missing", false);
    }

    const currentPayload = decodeTokenPayload(secret);
    if (!currentPayload.refreshToken) {
      throw new PlatformPublishError("TikTok refresh token is missing.", "auth", "tiktok_refresh_token_missing", false);
    }

    const refreshed = await deps.requestJson<{
      access_token: string;
      refresh_token?: string;
      open_id?: string;
      scope?: string;
      expires_in?: number;
      refresh_expires_in?: number;
      token_type?: string;
    }>("https://open.tiktokapis.com/v2/oauth/token/", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded"
      },
      body: new URLSearchParams({
        client_key: deps.env.TIKTOK_CLIENT_KEY,
        client_secret: deps.env.TIKTOK_CLIENT_SECRET,
        grant_type: "refresh_token",
        refresh_token: currentPayload.refreshToken
      }).toString()
    });

    const expiresAt = refreshed.expires_in ? new Date(Date.now() + refreshed.expires_in * 1000) : null;
    const refreshExpiresAt = refreshed.refresh_expires_in
      ? new Date(Date.now() + refreshed.refresh_expires_in * 1000)
      : null;

    await upsertEncryptedSecret({
      credentialId: credential.id,
      payload: {
        accessToken: refreshed.access_token,
        refreshToken: refreshed.refresh_token ?? currentPayload.refreshToken,
        tokenType: refreshed.token_type ?? currentPayload.tokenType ?? "bearer"
      },
      expiresAt,
      refreshExpiresAt
    });

    const creatorInfo = await deps
      .requestJson<Record<string, unknown>>("https://open.tiktokapis.com/v2/post/publish/creator_info/query/", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${refreshed.access_token}`,
          "Content-Type": "application/json; charset=UTF-8"
        },
        body: JSON.stringify({})
      })
      .catch(() => ({} as Record<string, unknown>));

    const creatorInfoData = ensureRecord(creatorInfo["data"]);
    const scopes = refreshed.scope?.split(",").filter(Boolean) ?? [];
    const capabilityFlags = {
      supportsImage: true,
      supportsVideo: true,
      supportsCarousel: false,
      supportsStories: false,
      supportsDraftUpload: scopes.includes("video.upload"),
      supportsDirectPost: scopes.includes("video.publish"),
      supportsPrivacyLevel: true,
      supportsDisableComments: true,
      supportsReels: false,
      accountType: "CREATOR",
      auditStatus: "UNAUDITED",
      supportedPrivacyLevels: Array.isArray(creatorInfoData.privacy_level_options)
        ? creatorInfoData.privacy_level_options.filter((value): value is string => typeof value === "string")
        : ["SELF_ONLY"],
      requiresDomainVerificationForPullFromUrl: true,
      pullFromUrlDomainVerified: false
    };

    await deps.prisma.connectedPageOrProfile.updateMany({
      where: {
        connectedAccountId: account.id
      },
      data: {
        capabilityFlags: capabilityFlags as never,
        publishModeAvailable: {
          direct: scopes.includes("video.publish"),
          draftUpload: scopes.includes("video.upload")
        } as never,
        lastMetadataSyncAt: new Date()
      }
    });

    await deps.prisma.connectedAccount.update({
      where: {
        id: account.id
      },
      data: {
        tokenExpiresAt: expiresAt,
        status: AccountStatus.ACTIVE,
        lastError: null,
        scopeSummary: {
          source: "oauth",
          scopes
        } as never
      }
    });

    return {
      connectedAccountId: account.id,
      platform: account.platform,
      refreshed: true
    };
  };

  const decodeTokenPayload = (secret: {
    encryptedPayload: string;
    iv: string;
    tag: string;
  }) => {
    const payload = JSON.parse(
      decryptText(
        {
          value: secret.encryptedPayload,
          iv: secret.iv,
          tag: secret.tag
        },
        deps.env.TOKEN_ENCRYPTION_KEY
      )
    ) as Partial<StoredTokenPayload>;

    if (!payload.accessToken || typeof payload.accessToken !== "string") {
      throw new PlatformPublishError("Stored access token payload is invalid.", "auth", "stored_token_invalid", false);
    }

    return {
      accessToken: payload.accessToken,
      refreshToken: typeof payload.refreshToken === "string" ? payload.refreshToken : null,
      tokenType: typeof payload.tokenType === "string" ? payload.tokenType : null
    };
  };

  const upsertEncryptedSecret = async (input: {
    credentialId: string;
    payload: StoredTokenPayload;
    expiresAt: Date | null;
    refreshExpiresAt?: Date | null;
  }) => {
    const encrypted = encryptText(JSON.stringify(input.payload), deps.env.TOKEN_ENCRYPTION_KEY);
    const existing = await deps.prisma.tokenSecret.findFirst({
      where: {
        oauthCredentialId: input.credentialId
      },
      orderBy: {
        createdAt: "desc"
      }
    });

    if (existing) {
      return deps.prisma.tokenSecret.update({
        where: {
          id: existing.id
        },
        data: {
          encryptedPayload: encrypted.value,
          iv: encrypted.iv,
          tag: encrypted.tag,
          expiresAt: input.expiresAt,
          refreshExpiresAt: input.refreshExpiresAt ?? null
        }
      });
    }

    return deps.prisma.tokenSecret.create({
      data: {
        oauthCredentialId: input.credentialId,
        encryptedPayload: encrypted.value,
        iv: encrypted.iv,
        tag: encrypted.tag,
        expiresAt: input.expiresAt,
        refreshExpiresAt: input.refreshExpiresAt ?? null
      }
    });
  };

  return {
    enqueueDueTokenRefreshJobs,
    processTokenRefresh
  };
};
