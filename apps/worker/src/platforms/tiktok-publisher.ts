import { readFile, rm } from "node:fs/promises";
import { MediaType, Platform } from "@prisma/client";
import type {
  CapabilityFlags,
  NormalizedError,
  PlatformPublisherAdapter,
  PlatformTargetRef,
  PollStatusResponse,
  PublishRequest,
  PublishResponse,
  ValidateConnectionResult,
  ValidateMediaResult
} from "@postport/platform-sdk";
import { PlatformPublishError, ensureRecord } from "./errors";
import { mediaResolver } from "./media-resolver";
import {
  composeCaption,
  ensureString,
  materializeStorageObject,
  normalizeTikTokPrivacyLevel,
  readStringArray,
  readTikTokStatus,
  tiktokPost,
  truncate
} from "./shared";
import { tokenStore } from "./token-store";

export class TikTokPublisher implements PlatformPublisherAdapter {
  readonly platform = "TIKTOK" as const;

  async validateConnection(target: PlatformTargetRef): Promise<ValidateConnectionResult> {
    const connection = await tokenStore.resolveConnectionContext({
      platform: Platform.TIKTOK,
      connectedAccountId: target.connectedAccountId,
      remoteTargetId: target.remoteTargetId
    });
    const creatorInfo = await this.queryCreatorInfo(connection.accessToken);
    const auditStatus =
      connection.capabilityFlags.auditStatus === "AUDITED" || connection.capabilityFlags.auditStatus === "UNAUDITED"
        ? connection.capabilityFlags.auditStatus
        : undefined;
    const capabilities = {
      supportsImage: true,
      supportsVideo: true,
      supportsCarousel: false,
      supportsStories: false,
      supportsDraftUpload: true,
      supportsDirectPost: true,
      supportsPrivacyLevel: true,
      supportsDisableComments: true,
      auditStatus,
      supportedPrivacyLevels: readStringArray(creatorInfo.privacy_level_options)
    } satisfies CapabilityFlags;

    return {
      healthy: true,
      reasons: [],
      capabilities
    };
  }

  async validateMedia(request: PublishRequest): Promise<ValidateMediaResult> {
    const media = await mediaResolver.resolve(request.mediaAssetIds);
    if (media.length === 0) {
      return { valid: false, reasons: ["Select at least one media asset."] };
    }

    const mediaTypes = new Set(media.map((asset) => asset.mediaType));
    if (mediaTypes.size > 1) {
      return { valid: false, reasons: ["TikTok publishes cannot mix photo and video media."] };
    }
    if (mediaTypes.has(MediaType.VIDEO) && media.length > 1) {
      return { valid: false, reasons: ["TikTok video publishing supports one video asset per publish job."] };
    }

    return { valid: true, reasons: [] };
  }

  async mapDraftToPayload(request: PublishRequest): Promise<Record<string, unknown>> {
    return {
      publishMode: request.canonicalPost.publishMode,
      privacyLevel: normalizeTikTokPrivacyLevel(request.canonicalPost.privacyLevel)
    };
  }

  async createRemoteContainerIfNeeded(): Promise<Record<string, unknown> | null> {
    return null;
  }

  async uploadOrReferenceMedia(request: PublishRequest): Promise<Record<string, unknown>> {
    const media = await mediaResolver.resolve(request.mediaAssetIds);
    return {
      mediaUrls: media.map((asset) => asset.signedUrl)
    };
  }

  async submitPublish(request: PublishRequest): Promise<PublishResponse> {
    const connection = await tokenStore.resolveConnectionContext({
      platform: Platform.TIKTOK,
      connectedAccountId: request.target.connectedAccountId,
      remoteTargetId: request.target.remoteTargetId
    });
    const media = await mediaResolver.resolve(request.mediaAssetIds);
    const creatorInfo = await this.queryCreatorInfo(connection.accessToken);
    const allowedPrivacyLevels = readStringArray(creatorInfo.privacy_level_options);
    const privacyLevel = normalizeTikTokPrivacyLevel(request.canonicalPost.privacyLevel);

    if (privacyLevel && allowedPrivacyLevels.length > 0 && !allowedPrivacyLevels.includes(privacyLevel)) {
      throw new PlatformPublishError(
        `TikTok privacy level ${privacyLevel} is not available for this creator.`,
        "validation",
        "privacy_level_option_mismatch",
        false,
        undefined,
        {
          allowedPrivacyLevels
        }
      );
    }

    const disableComment =
      typeof creatorInfo.comment_disabled === "boolean"
        ? creatorInfo.comment_disabled
          ? false
          : Boolean(request.canonicalPost.disableComments)
        : Boolean(request.canonicalPost.disableComments);

    if (media[0]?.mediaType === MediaType.IMAGE) {
      const photoPublish = await tiktokPost<{
        data?: {
          publish_id?: string;
        };
      }>("/post/publish/content/init/", connection.accessToken, {
        post_info: {
          title: request.canonicalPost.title ?? truncate(composeCaption(request), 90),
          description: composeCaption(request) || undefined,
          disable_comment: disableComment,
          privacy_level: privacyLevel ?? allowedPrivacyLevels[0] ?? "SELF_ONLY"
        },
        source_info: {
          source: "PULL_FROM_URL",
          photo_cover_index: 0,
          photo_images: media.map((asset) => asset.signedUrl)
        },
        post_mode: request.canonicalPost.publishMode === "DIRECT" ? "DIRECT_POST" : "MEDIA_UPLOAD",
        media_type: "PHOTO"
      });

      const publishId = ensureString(photoPublish.data, "publish_id");
      if (!publishId) {
        throw new PlatformPublishError(
          "TikTok did not return a publish id for the photo publish.",
          "transient",
          "missing_publish_id",
          true
        );
      }

      return {
        remotePublishId: publishId,
        status: "WAITING_REMOTE",
        raw: ensureRecord(photoPublish)
      };
    }

    const asset = media[0];
    if (!asset) {
      throw new PlatformPublishError("TikTok publish request has no media.", "validation", "media_missing", false);
    }

    const extension = asset.fileName.includes(".") ? asset.fileName.slice(asset.fileName.lastIndexOf(".")) : ".mp4";
    const localFilePath = await materializeStorageObject(asset.storageKey, extension);

    try {
      const buffer = await readFile(localFilePath);
      const endpoint =
        request.canonicalPost.publishMode === "DIRECT"
          ? "/post/publish/video/init/"
          : "/post/publish/inbox/video/init/";
      const initialized = await tiktokPost<{
        data?: {
          publish_id?: string;
          upload_url?: string;
        };
      }>(endpoint, connection.accessToken, {
        post_info:
          request.canonicalPost.publishMode === "DIRECT"
            ? {
                title: composeCaption(request) || undefined,
                privacy_level: privacyLevel ?? allowedPrivacyLevels[0] ?? "SELF_ONLY",
                disable_comment: disableComment
              }
            : undefined,
        source_info: {
          source: "FILE_UPLOAD",
          video_size: buffer.byteLength,
          chunk_size: buffer.byteLength,
          total_chunk_count: 1
        }
      });

      const publishId = ensureString(initialized.data, "publish_id");
      const uploadUrl = ensureString(initialized.data, "upload_url");
      if (!publishId || !uploadUrl) {
        throw new PlatformPublishError(
          "TikTok did not return upload details for the video publish.",
          "transient",
          "missing_upload_details",
          true
        );
      }

      const uploadResponse = await fetch(uploadUrl, {
        method: "PUT",
        headers: {
          "Content-Type": asset.mimeType,
          "Content-Range": `bytes 0-${buffer.byteLength - 1}/${buffer.byteLength}`
        },
        body: buffer
      });
      if (!uploadResponse.ok) {
        throw new PlatformPublishError(
          "TikTok video upload failed.",
          uploadResponse.status >= 500 ? "transient" : uploadResponse.status === 401 ? "auth" : "validation",
          `tiktok_upload_${uploadResponse.status}`,
          uploadResponse.status >= 500
        );
      }

      return {
        remotePublishId: publishId,
        status: "WAITING_REMOTE",
        raw: ensureRecord(initialized)
      };
    } finally {
      await rm(localFilePath, { force: true }).catch(() => undefined);
    }
  }

  async pollStatus(remotePublishId: string, target: PlatformTargetRef): Promise<PollStatusResponse> {
    const connection = await tokenStore.resolveConnectionContext({
      platform: Platform.TIKTOK,
      connectedAccountId: target.connectedAccountId,
      remoteTargetId: target.remoteTargetId
    });
    const response = await tiktokPost<Record<string, unknown>>("/post/publish/status/fetch/", connection.accessToken, {
      publish_id: remotePublishId
    });
    const data = ensureRecord(response.data);
    return {
      status: readTikTokStatus(data),
      remoteUrl: ensureString(data, "share_url") ?? ensureString(data, "post_url") ?? null,
      raw: response
    };
  }

  normalizeError(error: unknown): NormalizedError {
    if (error instanceof PlatformPublishError) {
      return error.toNormalizedError();
    }

    return {
      kind: "transient",
      code: "tiktok_unknown_error",
      message: error instanceof Error ? error.message : "Unexpected TikTok publish error.",
      retryable: true
    };
  }

  async refreshRemoteMetadata(target: PlatformTargetRef): Promise<Record<string, unknown>> {
    const connection = await tokenStore.resolveConnectionContext({
      platform: Platform.TIKTOK,
      connectedAccountId: target.connectedAccountId,
      remoteTargetId: target.remoteTargetId
    });
    return this.queryCreatorInfo(connection.accessToken);
  }

  private async queryCreatorInfo(accessToken: string) {
    const response = await tiktokPost<Record<string, unknown>>("/post/publish/creator_info/query/", accessToken, {});
    return ensureRecord(response.data);
  }
}
