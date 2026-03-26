import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { AccountStatus, Platform, PublishJobStatus } from "@prisma/client";
import { createHash, createHmac, randomBytes, randomUUID } from "node:crypto";
import { decryptText, encryptText, type EncryptedValue } from "@postport/utils";
import { getPlatformSupportNotes, type CapabilityFlags } from "@postport/platform-sdk";
import { PrismaService } from "../prisma/prisma.service";
import { WorkspaceAccessService } from "../../common/services/workspace-access.service";
import { env } from "../../config/env";

interface ConnectionStatePayload {
  workspaceId: string;
  userId: string;
  platform: Platform;
  nonce: string;
  exp: number;
  pkceVerifier?: EncryptedValue;
}

interface CallbackInput {
  code?: string;
  state?: string;
  error?: string;
  errorDescription?: string;
  mock?: boolean;
}

interface MetaPageTarget {
  id: string;
  name: string;
  access_token: string;
  tasks?: string[];
  instagram_business_account?: {
    id: string;
  };
}

@Injectable()
export class ConnectionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly workspaceAccessService: WorkspaceAccessService
  ) {}

  async list(userId: string, workspaceIdHint?: string) {
    const workspaceId = await this.workspaceAccessService.resolveWorkspaceIdForUser(userId, workspaceIdHint);
    const items = await this.prisma.connectedAccount.findMany({
      where: { workspaceId },
      include: {
        profiles: true
      },
      orderBy: {
        createdAt: "desc"
      }
    });
    return { items };
  }

  async startConnection(userId: string, platform: Platform, workspaceIdHint?: string) {
    const workspaceId = await this.workspaceAccessService.resolveWorkspaceIdForUser(userId, workspaceIdHint);
    const tikTokPkce = platform === Platform.TIKTOK ? this.createPkcePair() : null;
    const state = this.signConnectionState({
      workspaceId,
      userId,
      platform,
      nonce: randomUUID(),
      exp: Date.now() + 10 * 60 * 1000,
      pkceVerifier: tikTokPkce ? encryptText(tikTokPkce.verifier, env.TOKEN_ENCRYPTION_KEY) : undefined
    });
    const authUrl = this.buildAuthUrl(platform, state, tikTokPkce?.challenge);

    if (authUrl) {
      return {
        platform,
        workspaceId,
        authUrl,
        mode: "oauth"
      };
    }

    if (!env.ALLOW_MOCK_CONNECTIONS) {
      throw new BadRequestException(`${platform} OAuth is not configured in the current environment.`);
    }

    return {
      platform,
      workspaceId,
      authUrl: `${env.API_BASE_URL}/connections/${platform.toLowerCase()}/callback?mock=1&state=${encodeURIComponent(state)}`,
      note: "Mock connection flow for local development.",
      mode: "mock"
    };
  }

  async callback(userId: string, platform: Platform, input: CallbackInput) {
    if (input.error) {
      throw new BadRequestException(input.errorDescription ?? input.error);
    }

    const state = this.verifyConnectionState(input.state, userId, platform);
    const workspaceId = await this.workspaceAccessService.resolveWorkspaceIdForUser(userId, state.workspaceId);

    if (input.mock) {
      if (!env.ALLOW_MOCK_CONNECTIONS) {
        throw new BadRequestException("Mock connections are disabled in this environment.");
      }

      return this.createMockConnection({
        userId,
        workspaceId,
        platform
      });
    }

    if (!input.code) {
      throw new BadRequestException("Missing authorization code.");
    }

    if (platform === Platform.TIKTOK) {
      return this.handleTikTokCallback({
        userId,
        workspaceId,
        code: input.code,
        codeVerifier: state.pkceVerifier
          ? decryptText(state.pkceVerifier, env.TOKEN_ENCRYPTION_KEY)
          : undefined
      });
    }

    return this.handleMetaCallback({
      userId,
      workspaceId,
      platform,
      code: input.code
    });
  }

  private async createMockConnection(input: { userId: string; workspaceId: string; platform: Platform }) {
    const metadata = this.buildMockProfileMetadata(input.platform);
    const remoteAccountId = `${input.platform.toLowerCase()}_${randomUUID().slice(0, 10)}`;
    const account = await this.prisma.connectedAccount.create({
      data: {
        workspaceId: input.workspaceId,
        platform: input.platform,
        displayName: `Mock ${input.platform} Account`,
        remoteAccountId,
        status: AccountStatus.ACTIVE,
        tokenExpiresAt: new Date(Date.now() + 1000 * 60 * 60 * 24 * 60),
        scopeSummary: {
          scopes: ["publish_content", "read_profile"],
          grantedAt: new Date().toISOString(),
          capabilityFlags: metadata.capabilityFlags
        },
        profiles: {
          create: {
            remoteId: `${input.platform.toLowerCase()}_profile_${randomUUID().slice(0, 8)}`,
            name: `Mock ${input.platform} Target`,
            username: `mock_${input.platform.toLowerCase()}_${Math.floor(Math.random() * 1000)}`,
            isDefault: true,
            isEligible: true,
            capabilityFlags: metadata.capabilityFlags,
            publishModeAvailable: metadata.publishModeAvailable
          }
        }
      },
      include: {
        profiles: true
      }
    });

    await this.prisma.auditLog.create({
      data: {
        workspaceId: input.workspaceId,
        userId: input.userId,
        action: "CONNECTION_CREATED",
        entityType: "ConnectedAccount",
        entityId: account.id,
        metadata: {
          platform: input.platform,
          mode: "mock"
        }
      }
    });

    return account;
  }

  async reconnect(userId: string, connectionId: string, workspaceIdHint?: string) {
    const workspaceId = await this.workspaceAccessService.resolveWorkspaceIdForUser(userId, workspaceIdHint);
    const account = await this.ensureConnection(workspaceId, connectionId);

    return this.prisma.connectedAccount.update({
      where: { id: account.id },
      data: {
        status: AccountStatus.ACTIVE,
        lastError: null,
        tokenExpiresAt: new Date(Date.now() + 1000 * 60 * 60 * 24 * 60)
      }
    });
  }

  async disconnect(userId: string, connectionId: string, workspaceIdHint?: string) {
    const workspaceId = await this.workspaceAccessService.resolveWorkspaceIdForUser(userId, workspaceIdHint);
    const account = await this.ensureConnection(workspaceId, connectionId);

    return this.prisma.connectedAccount.update({
      where: { id: account.id },
      data: {
        status: AccountStatus.REVOKED
      }
    });
  }

  async refresh(userId: string, connectionId: string, workspaceIdHint?: string) {
    const workspaceId = await this.workspaceAccessService.resolveWorkspaceIdForUser(userId, workspaceIdHint);
    const account = await this.ensureConnection(workspaceId, connectionId);

    if (account.platform === Platform.FACEBOOK || account.platform === Platform.INSTAGRAM) {
      const { payload } = await this.getPrimaryTokenPayload(account.id, account.platform, account.remoteAccountId);
      if (!payload.accessToken) {
        throw new BadRequestException("Stored OAuth access token was not found for this connection.");
      }

      const pages = await this.fetchMetaPages(payload.accessToken);
      await this.syncMetaTargets({
        connectedAccountId: account.id,
        platform: account.platform,
        accessToken: payload.accessToken,
        expiresAt: account.tokenExpiresAt ?? null,
        pages
      });
    } else {
      await this.prisma.connectedPageOrProfile.updateMany({
        where: {
          connectedAccountId: account.id
        },
        data: {
          lastMetadataSyncAt: new Date()
        }
      });
    }

    return this.prisma.connectedAccount.update({
      where: {
        id: account.id
      },
      data: {
        updatedAt: new Date(),
        lastError: null,
        status: AccountStatus.ACTIVE
      },
      include: {
        profiles: true
      }
    });
  }

  async health(userId: string, connectionId: string, workspaceIdHint?: string) {
    const workspaceId = await this.workspaceAccessService.resolveWorkspaceIdForUser(userId, workspaceIdHint);
    const account = await this.ensureConnection(workspaceId, connectionId);
    const profile = await this.prisma.connectedPageOrProfile.findFirst({
      where: {
        connectedAccountId: account.id,
        isDefault: true
      }
    });

    const tokenValid = account.tokenExpiresAt ? account.tokenExpiresAt.getTime() > Date.now() : false;
    const capabilityFlags = this.extractCapabilityFlags(profile?.capabilityFlags ?? account.scopeSummary);
    const publishedPostsInLast24Hours =
      account.platform === Platform.INSTAGRAM
        ? await this.prisma.publishJob.count({
            where: {
              platform: Platform.INSTAGRAM,
              status: PublishJobStatus.SUCCEEDED,
              updatedAt: {
                gte: new Date(Date.now() - 24 * 60 * 60 * 1000)
              },
              platformTarget: {
                is: {
                  connectedAccountId: account.id
                }
              }
            }
          })
        : 0;
    const publishModeAvailable =
      profile?.publishModeAvailable ?? {
        direct: true,
        draftUpload: account.platform === Platform.TIKTOK
      };
    const checks = this.buildHealthChecks({
      platform: account.platform,
      tokenValid,
      accountStatus: account.status,
      targetEligible: profile?.isEligible ?? false,
      capabilityFlags,
      publishedPostsInLast24Hours
    });
    const warnings = checks
      .filter((check) => check.status !== "pass")
      .map((check) => `${check.label}: ${check.message}`);

    return {
      platform: account.platform,
      accountLabel: account.displayName,
      tokenValid,
      tokenExpiresAt: account.tokenExpiresAt,
      accountStatus: account.status,
      requiredPermissionsPresent: account.status === AccountStatus.ACTIVE,
      targetEligible: profile?.isEligible ?? false,
      publishModeAvailable,
      domainVerificationReminder: account.platform === Platform.TIKTOK ? "Required for URL pull mode" : null,
      lastSuccessfulPublish: account.lastSuccessfulPublishAt,
      lastError: account.lastError,
      capabilityFlags,
      publishedPostsInLast24Hours,
      checks,
      notes: getPlatformSupportNotes(account.platform, capabilityFlags),
      warnings
    };
  }

  private async ensureConnection(workspaceId: string, connectionId: string) {
    const account = await this.prisma.connectedAccount.findFirst({
      where: {
        id: connectionId,
        workspaceId
      }
    });
    if (!account) {
      throw new NotFoundException("Connection not found.");
    }
    return account;
  }

  parsePlatform(platformParam: string): Platform {
    const normalized = platformParam.toUpperCase();
    if (!Object.values(Platform).includes(normalized as Platform)) {
      throw new BadRequestException("Unsupported platform.");
    }
    return normalized as Platform;
  }

  private buildAuthUrl(platform: Platform, state: string, tikTokPkceChallenge?: string) {
    if (platform === Platform.TIKTOK) {
      if (!env.TIKTOK_CLIENT_KEY || !env.TIKTOK_CLIENT_SECRET) {
        return null;
      }

      const params = new URLSearchParams({
        client_key: env.TIKTOK_CLIENT_KEY,
        response_type: "code",
        scope: "user.info.basic,video.publish,video.upload",
        redirect_uri: this.resolveTikTokRedirectUri(),
        state,
        code_challenge: tikTokPkceChallenge ?? "",
        code_challenge_method: "S256"
      });

      return `https://www.tiktok.com/v2/auth/authorize/?${params.toString()}`;
    }

    if (!env.META_APP_ID || !env.META_APP_SECRET) {
      return null;
    }

    const scopes =
      platform === Platform.INSTAGRAM
        ? [
            "pages_show_list",
            "pages_read_engagement",
            "pages_manage_posts",
            "business_management",
            "instagram_basic",
            "instagram_content_publish"
          ]
        : ["pages_show_list", "pages_read_engagement", "pages_manage_posts", "business_management"];

    const params = new URLSearchParams({
      client_id: env.META_APP_ID,
      redirect_uri: this.resolveMetaRedirectUri(platform),
      response_type: "code",
      state
    });

    if (env.META_LOGIN_CONFIG_ID) {
      params.set("config_id", env.META_LOGIN_CONFIG_ID);
      params.set("override_default_response_type", "true");
    } else {
      params.set("scope", scopes.join(","));
    }

    return `https://www.facebook.com/${env.META_API_VERSION}/dialog/oauth?${params.toString()}`;
  }

  private signConnectionState(payload: ConnectionStatePayload) {
    const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url");
    const signature = createHmac("sha256", env.JWT_ACCESS_SECRET).update(encoded).digest("base64url");
    return `${encoded}.${signature}`;
  }

  private verifyConnectionState(state: string | undefined, userId: string, platform: Platform): ConnectionStatePayload {
    if (!state) {
      throw new BadRequestException("Missing OAuth state.");
    }

    const [encoded, signature] = state.split(".");
    if (!encoded) {
      throw new BadRequestException("Malformed OAuth state.");
    }
    const expectedSignature = createHmac("sha256", env.JWT_ACCESS_SECRET).update(encoded).digest("base64url");
    if (!signature || signature !== expectedSignature) {
      throw new BadRequestException("Invalid OAuth state signature.");
    }

    const payload = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8")) as ConnectionStatePayload;
    if (payload.userId !== userId || payload.platform !== platform) {
      throw new BadRequestException("OAuth state does not match the current user session.");
    }
    if (payload.exp < Date.now()) {
      throw new BadRequestException("OAuth state expired. Start the connection again.");
    }

    return payload;
  }

  private createPkcePair() {
    const verifier = randomBytes(32).toString("base64url");
    const challenge = createHash("sha256").update(verifier).digest("base64url");
    return {
      verifier,
      challenge
    };
  }

  private resolveMetaRedirectUri(platform: Platform) {
    const template = env.META_REDIRECT_URI;
    if (template) {
      return template.includes("{platform}") ? template.replace("{platform}", platform.toLowerCase()) : template;
    }

    return `${env.API_BASE_URL}/connections/${platform.toLowerCase()}/callback`;
  }

  private resolveTikTokRedirectUri() {
    return env.TIKTOK_REDIRECT_URI ?? `${env.API_BASE_URL}/connections/tiktok/callback`;
  }

  private async handleMetaCallback(input: {
    userId: string;
    workspaceId: string;
    platform: Platform;
    code: string;
  }) {
    if (!env.META_APP_ID || !env.META_APP_SECRET) {
      throw new BadRequestException("Meta OAuth is not configured.");
    }

    const redirectUri = this.resolveMetaRedirectUri(input.platform);
    const shortLived = await this.fetchJson<{
      access_token: string;
      token_type?: string;
    }>(
      `https://graph.facebook.com/${env.META_API_VERSION}/oauth/access_token?${new URLSearchParams({
        client_id: env.META_APP_ID,
        client_secret: env.META_APP_SECRET,
        redirect_uri: redirectUri,
        code: input.code
      }).toString()}`
    );

    const longLived = await this.fetchJson<{
      access_token: string;
      token_type?: string;
      expires_in?: number;
    }>(
      `https://graph.facebook.com/${env.META_API_VERSION}/oauth/access_token?${new URLSearchParams({
        client_id: env.META_APP_ID,
        client_secret: env.META_APP_SECRET,
        grant_type: "fb_exchange_token",
        fb_exchange_token: shortLived.access_token
      }).toString()}`
    );

    const accessToken = longLived.access_token ?? shortLived.access_token;
    const expiresAt = longLived.expires_in ? new Date(Date.now() + longLived.expires_in * 1000) : null;
    const metaUser = await this.fetchJson<{ id: string; name: string }>(
      `https://graph.facebook.com/${env.META_API_VERSION}/me?${new URLSearchParams({
        access_token: accessToken,
        fields: "id,name"
      }).toString()}`
    );

    const pages = await this.fetchMetaPages(accessToken);

    const connectedAccount = await this.prisma.connectedAccount.upsert({
      where: {
        workspaceId_platform_remoteAccountId: {
          workspaceId: input.workspaceId,
          platform: input.platform,
          remoteAccountId: metaUser.id
        }
      },
      create: {
        workspaceId: input.workspaceId,
        platform: input.platform,
        status: AccountStatus.ACTIVE,
        displayName: metaUser.name,
        remoteAccountId: metaUser.id,
        tokenExpiresAt: expiresAt,
        scopeSummary: {
          source: "oauth",
          scopes: input.platform === Platform.INSTAGRAM
            ? [
                "pages_show_list",
                "pages_read_engagement",
                "pages_manage_posts",
                "business_management",
                "instagram_basic",
                "instagram_content_publish"
              ]
            : ["pages_show_list", "pages_read_engagement", "pages_manage_posts", "business_management"]
        }
      },
      update: {
        status: AccountStatus.ACTIVE,
        displayName: metaUser.name,
        tokenExpiresAt: expiresAt,
        lastError: null,
        scopeSummary: {
          source: "oauth",
          scopes: input.platform === Platform.INSTAGRAM
            ? [
                "pages_show_list",
                "pages_read_engagement",
                "pages_manage_posts",
                "business_management",
                "instagram_basic",
                "instagram_content_publish"
              ]
            : ["pages_show_list", "pages_read_engagement", "pages_manage_posts", "business_management"]
        }
      }
    });

    await this.upsertCredentialSecret({
      connectedAccountId: connectedAccount.id,
      provider: input.platform,
      externalUserId: metaUser.id,
      scopesJson: connectedAccount.scopeSummary ?? undefined,
      payload: {
        accessToken,
        tokenType: longLived.token_type ?? shortLived.token_type ?? "bearer"
      },
      expiresAt
    });

    await this.syncMetaTargets({
      connectedAccountId: connectedAccount.id,
      platform: input.platform,
      accessToken,
      expiresAt,
      pages
    });

    await this.prisma.auditLog.create({
      data: {
        workspaceId: input.workspaceId,
        userId: input.userId,
        action: "CONNECTION_CREATED",
        entityType: "ConnectedAccount",
        entityId: connectedAccount.id,
        metadata: {
          platform: input.platform,
          mode: "oauth"
        }
      }
    });

    return this.prisma.connectedAccount.findUnique({
      where: {
        id: connectedAccount.id
      },
      include: {
        profiles: true
      }
    });
  }

  private async fetchMetaPages(accessToken: string) {
    const response = await this.fetchJson<{ data: MetaPageTarget[] }>(
      `https://graph.facebook.com/${env.META_API_VERSION}/me/accounts?${new URLSearchParams({
        access_token: accessToken,
        fields: "id,name,access_token,tasks,instagram_business_account"
      }).toString()}`
    );

    return response.data;
  }

  private async syncMetaTargets(input: {
    connectedAccountId: string;
    platform: Platform;
    accessToken: string;
    expiresAt: Date | null;
    pages: MetaPageTarget[];
  }) {
    if (input.platform === Platform.FACEBOOK) {
      for (const page of input.pages) {
        await this.prisma.connectedPageOrProfile.upsert({
          where: {
            connectedAccountId_remoteId: {
              connectedAccountId: input.connectedAccountId,
              remoteId: page.id
            }
          },
          create: {
            connectedAccountId: input.connectedAccountId,
            remoteId: page.id,
            name: page.name,
            isDefault: false,
            isEligible: (page.tasks ?? []).includes("CREATE_CONTENT"),
            capabilityFlags: {
              ...this.buildMockProfileMetadata(Platform.FACEBOOK).capabilityFlags,
              hasCreateContentTask: (page.tasks ?? []).includes("CREATE_CONTENT"),
              linkedPageId: page.id,
              linkedPageName: page.name
            },
            publishModeAvailable: {
              direct: true,
              draftUpload: false
            },
            lastMetadataSyncAt: new Date()
          },
          update: {
            status: AccountStatus.ACTIVE,
            name: page.name,
            isEligible: (page.tasks ?? []).includes("CREATE_CONTENT"),
            capabilityFlags: {
              ...this.buildMockProfileMetadata(Platform.FACEBOOK).capabilityFlags,
              hasCreateContentTask: (page.tasks ?? []).includes("CREATE_CONTENT"),
              linkedPageId: page.id,
              linkedPageName: page.name
            },
            publishModeAvailable: {
              direct: true,
              draftUpload: false
            },
            lastMetadataSyncAt: new Date()
          }
        });

        await this.upsertCredentialSecret({
          connectedAccountId: input.connectedAccountId,
          provider: input.platform,
          externalUserId: page.id,
          scopesJson: {
            tasks: page.tasks ?? []
          },
          payload: {
            accessToken: page.access_token,
            tokenType: "page"
          },
          expiresAt: input.expiresAt
        });
      }
    } else {
      const instagramTargets = input.pages.filter((page) => page.instagram_business_account?.id);
      if (instagramTargets.length === 0) {
        throw new BadRequestException("No Instagram professional accounts were found for this Meta login.");
      }

      for (const page of instagramTargets) {
        const instagramAccount = await this.fetchJson<{
          id: string;
          username?: string;
          name?: string;
          profile_picture_url?: string;
        }>(
          `https://graph.facebook.com/${env.META_API_VERSION}/${page.instagram_business_account!.id}?${new URLSearchParams({
            access_token: input.accessToken,
            fields: "id,username,name,profile_picture_url"
          }).toString()}`
        );

        await this.prisma.connectedPageOrProfile.upsert({
          where: {
            connectedAccountId_remoteId: {
              connectedAccountId: input.connectedAccountId,
              remoteId: instagramAccount.id
            }
          },
          create: {
            connectedAccountId: input.connectedAccountId,
            remoteId: instagramAccount.id,
            name: instagramAccount.name ?? instagramAccount.username ?? page.name,
            username: instagramAccount.username ?? null,
            avatarUrl: instagramAccount.profile_picture_url ?? null,
            isDefault: false,
            isEligible: true,
            capabilityFlags: {
              ...this.buildMockProfileMetadata(Platform.INSTAGRAM).capabilityFlags,
              linkedPageId: page.id,
              linkedPageName: page.name
            },
            publishModeAvailable: {
              direct: true,
              draftUpload: false
            },
            lastMetadataSyncAt: new Date()
          },
          update: {
            status: AccountStatus.ACTIVE,
            name: instagramAccount.name ?? instagramAccount.username ?? page.name,
            username: instagramAccount.username ?? null,
            avatarUrl: instagramAccount.profile_picture_url ?? null,
            isEligible: true,
            capabilityFlags: {
              ...this.buildMockProfileMetadata(Platform.INSTAGRAM).capabilityFlags,
              linkedPageId: page.id,
              linkedPageName: page.name
            },
            publishModeAvailable: {
              direct: true,
              draftUpload: false
            },
            lastMetadataSyncAt: new Date()
          }
        });

        await this.upsertCredentialSecret({
          connectedAccountId: input.connectedAccountId,
          provider: input.platform,
          externalUserId: page.id,
          scopesJson: {
            pageId: page.id
          },
          payload: {
            accessToken: page.access_token,
            tokenType: "page"
          },
          expiresAt: input.expiresAt
        });
      }
    }

    await this.ensureDefaultProfile(input.connectedAccountId);
  }

  private async ensureDefaultProfile(connectedAccountId: string) {
    const existingDefault = await this.prisma.connectedPageOrProfile.findFirst({
      where: {
        connectedAccountId,
        isDefault: true
      }
    });

    if (existingDefault) {
      return;
    }

    const firstProfile = await this.prisma.connectedPageOrProfile.findFirst({
      where: {
        connectedAccountId
      },
      orderBy: {
        createdAt: "asc"
      }
    });

    if (!firstProfile) {
      return;
    }

    await this.prisma.connectedPageOrProfile.update({
      where: {
        id: firstProfile.id
      },
      data: {
        isDefault: true
      }
    });
  }

  private async handleTikTokCallback(input: {
    userId: string;
    workspaceId: string;
    code: string;
    codeVerifier?: string;
  }) {
    if (!env.TIKTOK_CLIENT_KEY || !env.TIKTOK_CLIENT_SECRET) {
      throw new BadRequestException("TikTok OAuth is not configured.");
    }

    const tokenResponse = await this.fetchJson<{
      access_token: string;
      refresh_token?: string;
      open_id: string;
      scope?: string;
      expires_in?: number;
      refresh_expires_in?: number;
      token_type?: string;
    }>("https://open.tiktokapis.com/v2/oauth/token/", {
      method: "POST",
      headers: {
        "content-type": "application/x-www-form-urlencoded"
      },
      body: new URLSearchParams({
        client_key: env.TIKTOK_CLIENT_KEY,
        client_secret: env.TIKTOK_CLIENT_SECRET,
        code: input.code,
        grant_type: "authorization_code",
        redirect_uri: this.resolveTikTokRedirectUri(),
        ...(input.codeVerifier ? { code_verifier: input.codeVerifier } : {})
      }).toString()
    });

    const userInfo = await this.fetchJson<{
      data: {
        user: {
          open_id?: string;
          display_name?: string;
          avatar_url?: string;
          profile_deep_link?: string;
          username?: string;
        };
      };
    }>("https://open.tiktokapis.com/v2/user/info/?fields=open_id,display_name,avatar_url,profile_deep_link,username", {
      headers: {
        Authorization: `Bearer ${tokenResponse.access_token}`
      }
    });
    const creatorInfo = await this.fetchJson<{
      data?: {
        privacy_level_options?: string[];
        comment_disabled?: boolean;
      };
      error?: {
        code?: string;
      };
    }>("https://open.tiktokapis.com/v2/post/publish/creator_info/query/", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${tokenResponse.access_token}`,
        "Content-Type": "application/json; charset=UTF-8"
      },
      body: JSON.stringify({})
    }).catch(() => ({
      data: undefined
    }));

    const expiresAt = tokenResponse.expires_in ? new Date(Date.now() + tokenResponse.expires_in * 1000) : null;
    const refreshExpiresAt = tokenResponse.refresh_expires_in
      ? new Date(Date.now() + tokenResponse.refresh_expires_in * 1000)
      : null;
    const tiktokUser = userInfo.data.user;
    const tiktokCapabilities = this.buildTikTokCapabilityFlags(
      creatorInfo.data?.privacy_level_options,
      tokenResponse.scope?.split(",").filter(Boolean) ?? []
    );
    const tiktokPublishModes = this.buildTikTokPublishModeAvailability(tokenResponse.scope?.split(",").filter(Boolean) ?? []);

    const connectedAccount = await this.prisma.connectedAccount.upsert({
      where: {
        workspaceId_platform_remoteAccountId: {
          workspaceId: input.workspaceId,
          platform: Platform.TIKTOK,
          remoteAccountId: tokenResponse.open_id
        }
      },
      create: {
        workspaceId: input.workspaceId,
        platform: Platform.TIKTOK,
        status: AccountStatus.ACTIVE,
        displayName: tiktokUser.display_name ?? tiktokUser.username ?? "TikTok account",
        remoteAccountId: tokenResponse.open_id,
        tokenExpiresAt: expiresAt,
        scopeSummary: {
          source: "oauth",
          scopes: tokenResponse.scope?.split(",").filter(Boolean) ?? []
        }
      },
      update: {
        status: AccountStatus.ACTIVE,
        displayName: tiktokUser.display_name ?? tiktokUser.username ?? "TikTok account",
        tokenExpiresAt: expiresAt,
        lastError: null,
        scopeSummary: {
          source: "oauth",
          scopes: tokenResponse.scope?.split(",").filter(Boolean) ?? []
        }
      }
    });

    await this.prisma.connectedPageOrProfile.upsert({
      where: {
        connectedAccountId_remoteId: {
          connectedAccountId: connectedAccount.id,
          remoteId: tokenResponse.open_id
        }
      },
      create: {
        connectedAccountId: connectedAccount.id,
        remoteId: tokenResponse.open_id,
        name: tiktokUser.display_name ?? tiktokUser.username ?? "TikTok account",
        username: tiktokUser.username ?? null,
        avatarUrl: tiktokUser.avatar_url ?? null,
        isDefault: true,
        isEligible: true,
        capabilityFlags: tiktokCapabilities,
        publishModeAvailable: tiktokPublishModes,
        lastMetadataSyncAt: new Date()
      },
      update: {
        name: tiktokUser.display_name ?? tiktokUser.username ?? "TikTok account",
        username: tiktokUser.username ?? null,
        avatarUrl: tiktokUser.avatar_url ?? null,
        isEligible: true,
        capabilityFlags: tiktokCapabilities,
        publishModeAvailable: tiktokPublishModes,
        lastMetadataSyncAt: new Date()
      }
    });

    await this.upsertCredentialSecret({
      connectedAccountId: connectedAccount.id,
      provider: Platform.TIKTOK,
      externalUserId: tokenResponse.open_id,
      scopesJson: connectedAccount.scopeSummary ?? undefined,
      payload: {
        accessToken: tokenResponse.access_token,
        refreshToken: tokenResponse.refresh_token ?? null,
        tokenType: tokenResponse.token_type ?? "bearer"
      },
      expiresAt,
      refreshExpiresAt
    });

    await this.prisma.auditLog.create({
      data: {
        workspaceId: input.workspaceId,
        userId: input.userId,
        action: "CONNECTION_CREATED",
        entityType: "ConnectedAccount",
        entityId: connectedAccount.id,
        metadata: {
          platform: Platform.TIKTOK,
          mode: "oauth"
        }
      }
    });

    return this.prisma.connectedAccount.findUnique({
      where: {
        id: connectedAccount.id
      },
      include: {
        profiles: true
      }
    });
  }

  private async upsertCredentialSecret(input: {
    connectedAccountId: string;
    provider: Platform;
    externalUserId: string;
    scopesJson?: unknown;
    payload: Record<string, unknown>;
    expiresAt: Date | null;
    refreshExpiresAt?: Date | null;
  }) {
    const credential = await this.prisma.oAuthCredential.upsert({
      where: {
        connectedAccountId_provider_externalUserId: {
          connectedAccountId: input.connectedAccountId,
          provider: input.provider,
          externalUserId: input.externalUserId
        }
      },
      create: {
        connectedAccountId: input.connectedAccountId,
        provider: input.provider,
        externalUserId: input.externalUserId,
        scopesJson: (input.scopesJson ?? null) as never
      },
      update: {
        scopesJson: (input.scopesJson ?? null) as never
      }
    });

    const encrypted = encryptText(JSON.stringify(input.payload), env.TOKEN_ENCRYPTION_KEY);
    const existing = await this.prisma.tokenSecret.findFirst({
      where: {
        oauthCredentialId: credential.id
      },
      orderBy: {
        createdAt: "desc"
      }
    });

    if (existing) {
      await this.prisma.tokenSecret.update({
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
      return credential;
    }

    await this.prisma.tokenSecret.create({
      data: {
        oauthCredentialId: credential.id,
        encryptedPayload: encrypted.value,
        iv: encrypted.iv,
        tag: encrypted.tag,
        expiresAt: input.expiresAt,
        refreshExpiresAt: input.refreshExpiresAt ?? null
      }
    });

    return credential;
  }

  private async fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
    const response = await fetch(url, init);
    const body = (await response.json().catch(() => null)) as
      | T
      | {
          error?: {
            message?: string;
          };
          message?: string;
        }
      | null;

    if (!response.ok) {
      const message =
        (body && typeof body === "object" && "error" in body && body.error?.message) ||
        (body && typeof body === "object" && "message" in body && body.message) ||
        `Remote request failed with status ${response.status}`;
      throw new BadRequestException(message);
    }

    return body as T;
  }

  private async getPrimaryTokenPayload(connectionId: string, provider: Platform, externalUserId?: string) {
    const credential = await this.prisma.oAuthCredential.findFirst({
      where: {
        connectedAccountId: connectionId,
        provider,
        externalUserId
      },
      include: {
        tokenSecrets: {
          orderBy: {
            createdAt: "desc"
          },
          take: 1
        }
      }
    });

    if (!credential || credential.tokenSecrets.length === 0) {
      throw new BadRequestException("Stored OAuth credential was not found for this connection.");
    }

    const secret = credential.tokenSecrets[0];
    if (!secret) {
      throw new BadRequestException("Stored OAuth token secret was not found for this connection.");
    }
    return {
      credential,
      payload: JSON.parse(
        decryptText(
          {
            iv: secret.iv,
            tag: secret.tag,
            value: secret.encryptedPayload
          },
          env.TOKEN_ENCRYPTION_KEY
        )
      ) as Record<string, string>
    };
  }

  private buildMockProfileMetadata(platform: Platform) {
    switch (platform) {
      case Platform.INSTAGRAM:
        return {
          capabilityFlags: {
            supportsImage: true,
            supportsVideo: true,
            supportsCarousel: true,
            supportsStories: false,
            supportsDraftUpload: false,
            supportsDirectPost: true,
            supportsPrivacyLevel: false,
            supportsDisableComments: false,
            supportsReels: true,
            accountType: "PROFESSIONAL",
            isProfessionalAccount: true,
            requiresPagePublishingAuthorization: true,
            pagePublishingAuthorizationCompleted: true,
            publishLimit24h: 50
          } satisfies CapabilityFlags,
          publishModeAvailable: {
            direct: true,
            draftUpload: false
          }
        };

      case Platform.FACEBOOK:
        return {
          capabilityFlags: {
            supportsImage: true,
            supportsVideo: true,
            supportsCarousel: false,
            supportsStories: false,
            supportsDraftUpload: false,
            supportsDirectPost: true,
            supportsPrivacyLevel: false,
            supportsDisableComments: false,
            supportsReels: true,
            accountType: "PAGE",
            isPageTarget: true,
            requiresCreateContentTask: true,
            hasCreateContentTask: true
          } satisfies CapabilityFlags,
          publishModeAvailable: {
            direct: true,
            draftUpload: false
          }
        };

      case Platform.TIKTOK:
        return {
          capabilityFlags: {
            supportsImage: true,
            supportsVideo: true,
            supportsCarousel: false,
            supportsStories: false,
            supportsDraftUpload: true,
            supportsDirectPost: true,
            supportsPrivacyLevel: true,
            supportsDisableComments: true,
            supportsReels: false,
            accountType: "CREATOR",
            auditStatus: "UNAUDITED",
            supportedPrivacyLevels: ["SELF_ONLY"],
            requiresDomainVerificationForPullFromUrl: true,
            pullFromUrlDomainVerified: false
          } satisfies CapabilityFlags,
          publishModeAvailable: {
            direct: true,
            draftUpload: true
          }
        };
    }
  }

  private buildTikTokCapabilityFlags(privacyLevels: string[] | undefined, scopes: string[]) {
    return {
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
      supportedPrivacyLevels: privacyLevels?.length ? privacyLevels : ["SELF_ONLY"],
      requiresDomainVerificationForPullFromUrl: true,
      pullFromUrlDomainVerified: false
    } satisfies CapabilityFlags;
  }

  private buildTikTokPublishModeAvailability(scopes: string[]) {
    return {
      direct: scopes.includes("video.publish"),
      draftUpload: scopes.includes("video.upload")
    };
  }

  private extractCapabilityFlags(value: unknown): CapabilityFlags | null {
    if (!value || typeof value !== "object") {
      return null;
    }

    const directCapabilityFlags = (value as { capabilityFlags?: unknown }).capabilityFlags;
    if (directCapabilityFlags && typeof directCapabilityFlags === "object") {
      return directCapabilityFlags as CapabilityFlags;
    }

    return value as CapabilityFlags;
  }

  private buildHealthChecks(input: {
    platform: Platform;
    tokenValid: boolean;
    accountStatus: AccountStatus;
    targetEligible: boolean;
    capabilityFlags: CapabilityFlags | null;
    publishedPostsInLast24Hours: number;
  }) {
    const checks: Array<{ key: string; label: string; status: "pass" | "warn" | "fail"; message: string }> = [
      {
        key: "token",
        label: "Token validity",
        status: input.tokenValid ? "pass" : "fail",
        message: input.tokenValid ? "Access token is still valid." : "Reconnect the account to refresh the token."
      },
      {
        key: "account_status",
        label: "Account status",
        status: input.accountStatus === AccountStatus.ACTIVE ? "pass" : "fail",
        message:
          input.accountStatus === AccountStatus.ACTIVE
            ? "Account is active."
            : `Account status is ${input.accountStatus.toLowerCase()}.`
      },
      {
        key: "target_eligibility",
        label: "Target eligibility",
        status: input.targetEligible ? "pass" : "fail",
        message: input.targetEligible ? "Selected target is publish-eligible." : "Selected target is not eligible."
      }
    ];

    if (input.platform === Platform.INSTAGRAM) {
      checks.push({
        key: "professional_account",
        label: "Professional account",
        status: input.capabilityFlags?.isProfessionalAccount === false ? "fail" : "pass",
        message:
          input.capabilityFlags?.isProfessionalAccount === false
            ? "Instagram publishing requires a professional account."
            : "Professional account requirement satisfied."
      });
      checks.push({
        key: "ppa",
        label: "Page Publishing Authorization",
        status:
          input.capabilityFlags?.requiresPagePublishingAuthorization &&
          input.capabilityFlags.pagePublishingAuthorizationCompleted === false
            ? "fail"
            : "pass",
        message:
          input.capabilityFlags?.requiresPagePublishingAuthorization &&
          input.capabilityFlags.pagePublishingAuthorizationCompleted === false
            ? "Complete Page Publishing Authorization before publishing."
            : "PPA requirement is satisfied."
      });

      const publishLimit = input.capabilityFlags?.publishLimit24h ?? 50;
      checks.push({
        key: "publish_limit",
        label: "24-hour publish window",
        status:
          input.publishedPostsInLast24Hours >= publishLimit
            ? "fail"
            : input.publishedPostsInLast24Hours >= publishLimit - 5
              ? "warn"
              : "pass",
        message: `${input.publishedPostsInLast24Hours}/${publishLimit} Instagram publishes used in the last 24 hours.`
      });
    }

    if (input.platform === Platform.FACEBOOK) {
      checks.push({
        key: "page_target",
        label: "Page target",
        status: input.capabilityFlags?.isPageTarget === false ? "fail" : "pass",
        message:
          input.capabilityFlags?.isPageTarget === false
            ? "Facebook publishing supports Page targets only."
            : "Page target requirement satisfied."
      });
      checks.push({
        key: "create_content",
        label: "CREATE_CONTENT task",
        status:
          input.capabilityFlags?.requiresCreateContentTask && input.capabilityFlags.hasCreateContentTask === false
            ? "fail"
            : "pass",
        message:
          input.capabilityFlags?.requiresCreateContentTask && input.capabilityFlags.hasCreateContentTask === false
            ? "Grant CREATE_CONTENT task access on the Page."
            : "CREATE_CONTENT task requirement satisfied."
      });
    }

    if (input.platform === Platform.TIKTOK) {
      checks.push({
        key: "audit_status",
        label: "Client audit status",
        status: input.capabilityFlags?.auditStatus === "UNAUDITED" ? "warn" : "pass",
        message:
          input.capabilityFlags?.auditStatus === "UNAUDITED"
            ? "Direct posting may be restricted to SELF_ONLY visibility."
            : "Client audit status supports broader direct posting."
      });
      checks.push({
        key: "domain_verification",
        label: "URL pull domain verification",
        status:
          input.capabilityFlags?.requiresDomainVerificationForPullFromUrl &&
          input.capabilityFlags.pullFromUrlDomainVerified === false
            ? "warn"
            : "pass",
        message:
          input.capabilityFlags?.requiresDomainVerificationForPullFromUrl &&
          input.capabilityFlags.pullFromUrlDomainVerified === false
            ? "Verify your pull-from-URL domain before using that media source."
            : "Domain verification requirement is satisfied."
      });
    }

    return checks;
  }
}
