import { Platform } from "@prisma/client";
import { decryptText } from "@postport/utils";
import { env } from "../config/env";
import { prisma } from "../services/prisma";
import { PlatformPublishError, ensureRecord } from "./errors";

interface StoredTokenPayload {
  accessToken: string;
  refreshToken?: string | null;
  tokenType?: string | null;
}

interface DecodedCredential {
  externalUserId: string;
  payload: StoredTokenPayload;
}

export interface ResolvedConnectionContext {
  connectedAccountId: string;
  remoteAccountId: string;
  remoteTargetId: string;
  linkedPageId: string | null;
  accessToken: string;
  refreshToken?: string | null;
  tokenType?: string | null;
  capabilityFlags: Record<string, unknown>;
  scopeSummary: Record<string, unknown>;
}

export class TokenStore {
  async resolveConnectionContext(input: {
    platform: Platform;
    connectedAccountId: string;
    remoteTargetId: string;
  }): Promise<ResolvedConnectionContext> {
    const account = await prisma.connectedAccount.findUnique({
      where: {
        id: input.connectedAccountId
      },
      include: {
        profiles: true,
        oauthCredentials: {
          include: {
            tokenSecrets: {
              orderBy: {
                createdAt: "desc"
              },
              take: 1
            }
          }
        }
      }
    });

    if (!account) {
      throw new PlatformPublishError("Connected account was not found.", "auth", "connection_missing", false);
    }

    const targetProfile =
      account.profiles.find((profile) => profile.remoteId === input.remoteTargetId) ??
      account.profiles.find((profile) => profile.isDefault) ??
      account.profiles[0] ??
      null;
    const capabilityFlags = ensureRecord(targetProfile?.capabilityFlags);
    const scopeSummary = ensureRecord(account.scopeSummary);
    const credentials = account.oauthCredentials
      .map((credential) => decodeCredential(credential.externalUserId, credential.tokenSecrets[0] ?? null))
      .filter((credential): credential is DecodedCredential => credential !== null);

    if (input.platform === Platform.TIKTOK) {
      const token =
        credentials.find((credential) => credential.externalUserId === input.remoteTargetId) ??
        credentials.find((credential) => credential.externalUserId === account.remoteAccountId);

      if (!token?.payload.accessToken) {
        throw new PlatformPublishError("TikTok access token is missing.", "auth", "missing_access_token", false);
      }

      return {
        connectedAccountId: account.id,
        remoteAccountId: account.remoteAccountId,
        remoteTargetId: input.remoteTargetId,
        linkedPageId: null,
        accessToken: token.payload.accessToken,
        refreshToken: token.payload.refreshToken ?? null,
        tokenType: token.payload.tokenType ?? null,
        capabilityFlags,
        scopeSummary
      };
    }

    const linkedPageId = resolveLinkedPageId(capabilityFlags, input.platform, input.remoteTargetId);
    const userToken = credentials.find((credential) => credential.externalUserId === account.remoteAccountId);
    const pageToken = linkedPageId
      ? credentials.find((credential) => credential.externalUserId === linkedPageId)
      : credentials.find((credential) => credential.externalUserId === input.remoteTargetId);
    const selected = pageToken ?? userToken;

    if (!selected?.payload.accessToken) {
      throw new PlatformPublishError("Meta access token is missing.", "auth", "missing_access_token", false);
    }

    return {
      connectedAccountId: account.id,
      remoteAccountId: account.remoteAccountId,
      remoteTargetId: input.remoteTargetId,
      linkedPageId,
      accessToken: selected.payload.accessToken,
      refreshToken: selected.payload.refreshToken ?? null,
      tokenType: selected.payload.tokenType ?? null,
      capabilityFlags,
      scopeSummary
    };
  }
}

const decodeCredential = (
  externalUserId: string,
  secret: {
    encryptedPayload: string;
    iv: string;
    tag: string;
  } | null
): DecodedCredential | null => {
  if (!secret) {
    return null;
  }

  const raw = decryptText(
    {
      value: secret.encryptedPayload,
      iv: secret.iv,
      tag: secret.tag
    },
    env.TOKEN_ENCRYPTION_KEY
  );

  const payload = JSON.parse(raw) as Partial<StoredTokenPayload>;
  if (typeof payload.accessToken !== "string" || payload.accessToken.length === 0) {
    return null;
  }

  return {
    externalUserId,
    payload: {
      accessToken: payload.accessToken,
      refreshToken: typeof payload.refreshToken === "string" ? payload.refreshToken : null,
      tokenType: typeof payload.tokenType === "string" ? payload.tokenType : null
    }
  };
};

const resolveLinkedPageId = (
  capabilityFlags: Record<string, unknown>,
  platform: Platform,
  remoteTargetId: string
) => {
  if (platform === Platform.FACEBOOK) {
    return remoteTargetId;
  }

  const linkedPageId = capabilityFlags.linkedPageId;
  if (typeof linkedPageId === "string" && linkedPageId.length > 0) {
    return linkedPageId;
  }

  return null;
};

export const tokenStore = new TokenStore();
