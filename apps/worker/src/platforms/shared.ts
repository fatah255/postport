import { randomUUID } from "node:crypto";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import type {
  CapabilityFlags,
  PlatformAccountType,
  PlatformAuditStatus,
  PollStatusResponse,
  PublishRequest
} from "@postport/platform-sdk";
import { env } from "../config/env";
import { storage } from "../services/storage";
import { requestJson } from "./http";

export const REMOTE_STATUS_POLL_DELAY_MS = 10_000;
export const REMOTE_STATUS_POLL_ATTEMPTS = 6;

export const metaFormPost = async <T>(path: string, payload: Record<string, string | undefined>) => {
  const body = new URLSearchParams();
  for (const [key, value] of Object.entries(payload)) {
    if (value !== undefined && value !== null && value !== "") {
      body.set(key, value);
    }
  }

  return requestJson<T>(`https://graph.facebook.com/${env.META_API_VERSION}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded"
    },
    body: body.toString()
  });
};

export const metaGet = async <T>(path: string, query: Record<string, string | undefined>) => {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined && value !== null && value !== "") {
      params.set(key, value);
    }
  }

  return requestJson<T>(`https://graph.facebook.com/${env.META_API_VERSION}${path}?${params.toString()}`);
};

export const tiktokPost = async <T>(path: string, accessToken: string, payload: Record<string, unknown>) => {
  return requestJson<T>(`https://open.tiktokapis.com/v2${path}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json; charset=UTF-8"
    },
    body: JSON.stringify(payload),
    fallbackErrorCode: "tiktok_api_error"
  });
};

export const composeCaption = (request: PublishRequest) => {
  const parts = [
    request.canonicalPost.caption?.trim(),
    request.canonicalPost.hashtags.join(" ").trim(),
    request.canonicalPost.mentions.join(" ").trim()
  ].filter((value): value is string => Boolean(value && value.length > 0));

  return parts.join("\n").trim();
};

export const extractPostFormat = (request: PublishRequest) => {
  const platformSpecificJson =
    request.canonicalPost.platformSpecificJson && typeof request.canonicalPost.platformSpecificJson === "object"
      ? (request.canonicalPost.platformSpecificJson as Record<string, unknown>)
      : {};
  const value = platformSpecificJson.postFormat;
  return value === "REEL" || value === "FEED_POST" || value === "PAGE_POST" ? value : "AUTO";
};

export const toCapabilityFlags = (value: Record<string, unknown>): CapabilityFlags => {
  return {
    supportsImage: Boolean(value.supportsImage ?? true),
    supportsVideo: Boolean(value.supportsVideo ?? true),
    supportsCarousel: Boolean(value.supportsCarousel ?? false),
    supportsStories: Boolean(value.supportsStories ?? false),
    supportsDraftUpload: Boolean(value.supportsDraftUpload ?? false),
    supportsDirectPost: Boolean(value.supportsDirectPost ?? true),
    supportsPrivacyLevel: Boolean(value.supportsPrivacyLevel ?? false),
    supportsDisableComments: Boolean(value.supportsDisableComments ?? false),
    supportsReels: typeof value.supportsReels === "boolean" ? value.supportsReels : undefined,
    accountType: isPlatformAccountType(value.accountType) ? value.accountType : undefined,
    isProfessionalAccount: typeof value.isProfessionalAccount === "boolean" ? value.isProfessionalAccount : undefined,
    isBusinessAccount: typeof value.isBusinessAccount === "boolean" ? value.isBusinessAccount : undefined,
    isPageTarget: typeof value.isPageTarget === "boolean" ? value.isPageTarget : undefined,
    requiresPagePublishingAuthorization:
      typeof value.requiresPagePublishingAuthorization === "boolean"
        ? value.requiresPagePublishingAuthorization
        : undefined,
    pagePublishingAuthorizationCompleted:
      typeof value.pagePublishingAuthorizationCompleted === "boolean"
        ? value.pagePublishingAuthorizationCompleted
        : undefined,
    publishLimit24h: typeof value.publishLimit24h === "number" ? value.publishLimit24h : undefined,
    requiresCreateContentTask:
      typeof value.requiresCreateContentTask === "boolean" ? value.requiresCreateContentTask : undefined,
    hasCreateContentTask: typeof value.hasCreateContentTask === "boolean" ? value.hasCreateContentTask : undefined,
    auditStatus: isPlatformAuditStatus(value.auditStatus) ? value.auditStatus : undefined,
    supportedPrivacyLevels: Array.isArray(value.supportedPrivacyLevels)
      ? value.supportedPrivacyLevels.filter((item): item is string => typeof item === "string")
      : undefined,
    requiresDomainVerificationForPullFromUrl:
      typeof value.requiresDomainVerificationForPullFromUrl === "boolean"
        ? value.requiresDomainVerificationForPullFromUrl
        : undefined,
    pullFromUrlDomainVerified:
      typeof value.pullFromUrlDomainVerified === "boolean" ? value.pullFromUrlDomainVerified : undefined,
    linkedPageId: typeof value.linkedPageId === "string" ? value.linkedPageId : undefined,
    linkedPageName: typeof value.linkedPageName === "string" ? value.linkedPageName : undefined
  };
};

export const materializeStorageObject = async (storageKey: string, extension: string) => {
  const tempDir = join(process.cwd(), env.MEDIA_PROCESSING_TEMP_DIR, "publish");
  await mkdir(tempDir, { recursive: true });
  const filePath = join(tempDir, `${randomUUID()}${extension || ".bin"}`);
  await storage.downloadObject(storageKey, filePath);
  return filePath;
};

export const normalizeTikTokPrivacyLevel = (value?: string | null) => {
  if (!value) {
    return null;
  }

  if (value === "PRIVATE") {
    return "SELF_ONLY";
  }

  return value;
};

export const readTikTokStatus = (data: Record<string, unknown>): PollStatusResponse["status"] => {
  const candidates = [data.status, data.publish_status, data.post_status];
  const value = candidates.find((item): item is string => typeof item === "string")?.toUpperCase();

  if (!value) {
    return "WAITING_REMOTE";
  }

  if (value.includes("FAIL") || value.includes("ERROR") || value.includes("REJECT") || value.includes("CANCEL")) {
    return "FAILED";
  }

  if (
    value.includes("PUBLISH_COMPLETE") ||
    value.includes("PUBLISHED") ||
    value.includes("SUCCESS") ||
    value.includes("POST_COMPLETE")
  ) {
    return "SUCCEEDED";
  }

  return "WAITING_REMOTE";
};

export const readStringArray = (value: unknown) => {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
};

export const ensureString = (value: unknown, key: string) => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  const record = value as Record<string, unknown>;
  return typeof record[key] === "string" ? record[key] : null;
};

export const truncate = (value: string, length: number) => {
  if (value.length <= length) {
    return value;
  }

  return value.slice(0, length).trim();
};

export const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const isPlatformAccountType = (value: unknown): value is PlatformAccountType => {
  return value === "PROFESSIONAL" || value === "BUSINESS" || value === "CREATOR" || value === "PAGE";
};

const isPlatformAuditStatus = (value: unknown): value is PlatformAuditStatus => {
  return value === "AUDITED" || value === "UNAUDITED";
};
