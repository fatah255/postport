import { MediaType, Platform } from "@prisma/client";
import type {
  NormalizedError,
  PlatformPublisherAdapter,
  PlatformTargetRef,
  PollStatusResponse,
  PublishRequest,
  PublishResponse,
  ValidateConnectionResult,
  ValidateMediaResult
} from "@postport/platform-sdk";
import { PlatformPublishError } from "./errors";
import { mediaResolver } from "./media-resolver";
import { metaFormPost, metaGet, composeCaption, extractPostFormat, toCapabilityFlags } from "./shared";
import { type ResolvedConnectionContext, tokenStore } from "./token-store";

export class FacebookPublisher implements PlatformPublisherAdapter {
  readonly platform = "FACEBOOK" as const;

  async validateConnection(target: PlatformTargetRef): Promise<ValidateConnectionResult> {
    const connection = await tokenStore.resolveConnectionContext({
      platform: Platform.FACEBOOK,
      connectedAccountId: target.connectedAccountId,
      remoteTargetId: target.remoteTargetId
    });
    const capabilities = toCapabilityFlags(connection.capabilityFlags);
    const reasons: string[] = [];

    if (capabilities.isPageTarget === false) {
      reasons.push("Facebook publishing requires a Page target.");
    }

    if (capabilities.requiresCreateContentTask && capabilities.hasCreateContentTask === false) {
      reasons.push("This Facebook Page is missing CREATE_CONTENT task access.");
    }

    return {
      healthy: reasons.length === 0,
      reasons,
      capabilities
    };
  }

  async validateMedia(request: PublishRequest): Promise<ValidateMediaResult> {
    const media = await mediaResolver.resolve(request.mediaAssetIds);
    if (media.length !== 1) {
      return {
        valid: false,
        reasons: ["Facebook Page publishing supports one media asset per publish job in V1."]
      };
    }
    return { valid: true, reasons: [] };
  }

  async mapDraftToPayload(request: PublishRequest): Promise<Record<string, unknown>> {
    return {
      caption: composeCaption(request),
      postFormat: extractPostFormat(request)
    };
  }

  async createRemoteContainerIfNeeded(): Promise<Record<string, unknown> | null> {
    return null;
  }

  async uploadOrReferenceMedia(request: PublishRequest): Promise<Record<string, unknown>> {
    const media = await mediaResolver.resolve(request.mediaAssetIds);
    return {
      mediaUrl: media[0]?.signedUrl ?? null
    };
  }

  async submitPublish(request: PublishRequest): Promise<PublishResponse> {
    const connection = await tokenStore.resolveConnectionContext({
      platform: Platform.FACEBOOK,
      connectedAccountId: request.target.connectedAccountId,
      remoteTargetId: request.target.remoteTargetId
    });
    const media = await mediaResolver.resolve(request.mediaAssetIds);
    const asset = media[0];
    if (!asset) {
      throw new PlatformPublishError("Facebook publish request has no media.", "validation", "media_missing", false);
    }

    const pageId = connection.linkedPageId ?? request.target.remoteTargetId;
    const caption = composeCaption(request);
    const postFormat = extractPostFormat(request);

    if (asset.mediaType === MediaType.IMAGE) {
      const photo = await metaFormPost<{ id: string; post_id?: string }>(`/${pageId}/photos`, {
        access_token: connection.accessToken,
        url: asset.signedUrl,
        caption: caption || undefined,
        published: "true"
      });

      return {
        remotePublishId: photo.post_id ?? photo.id,
        remoteUrl: await this.fetchPermalink(connection, photo.post_id ?? photo.id),
        status: "SUCCEEDED",
        raw: photo
      };
    }

    if (postFormat === "REEL") {
      const reel = await this.publishReel(connection, asset.signedUrl, request);
      return {
        remotePublishId: reel.videoId,
        status: "WAITING_REMOTE",
        raw: reel
      };
    }

    const video = await metaFormPost<{ id: string }>(`/${pageId}/videos`, {
      access_token: connection.accessToken,
      file_url: asset.signedUrl,
      description: request.canonicalPost.description ?? (caption || undefined),
      title: request.canonicalPost.title ?? undefined,
      published: "true"
    });

    return {
      remotePublishId: video.id,
      status: "WAITING_REMOTE",
      raw: video
    };
  }

  async pollStatus(remotePublishId: string, target: PlatformTargetRef): Promise<PollStatusResponse> {
    const connection = await tokenStore.resolveConnectionContext({
      platform: Platform.FACEBOOK,
      connectedAccountId: target.connectedAccountId,
      remoteTargetId: target.remoteTargetId
    });
    const response = await metaGet<{
      permalink_url?: string;
      status?: {
        video_status?: string;
        processing_phase?: { status?: string };
        publishing_phase?: { status?: string };
      };
    }>(`/${remotePublishId}`, {
      access_token: connection.accessToken,
      fields: "permalink_url,status"
    });

    const statuses = [
      response.status?.video_status,
      response.status?.processing_phase?.status,
      response.status?.publishing_phase?.status
    ]
      .filter((value): value is string => typeof value === "string")
      .map((value) => value.toLowerCase());

    if (statuses.some((value) => value.includes("fail") || value.includes("error"))) {
      return {
        status: "FAILED",
        raw: response
      };
    }

    if (statuses.some((value) => ["complete", "completed", "published", "ready"].includes(value))) {
      return {
        status: "SUCCEEDED",
        remoteUrl: response.permalink_url ?? null,
        raw: response
      };
    }

    return {
      status: "WAITING_REMOTE",
      remoteUrl: response.permalink_url ?? null,
      raw: response
    };
  }

  normalizeError(error: unknown): NormalizedError {
    if (error instanceof PlatformPublishError) {
      return error.toNormalizedError();
    }

    return {
      kind: "transient",
      code: "facebook_unknown_error",
      message: error instanceof Error ? error.message : "Unexpected Facebook publish error.",
      retryable: true
    };
  }

  async refreshRemoteMetadata(target: PlatformTargetRef): Promise<Record<string, unknown>> {
    const connection = await tokenStore.resolveConnectionContext({
      platform: Platform.FACEBOOK,
      connectedAccountId: target.connectedAccountId,
      remoteTargetId: target.remoteTargetId
    });
    return metaGet<Record<string, unknown>>(`/${target.remoteTargetId}`, {
      access_token: connection.accessToken,
      fields: "id,name"
    });
  }

  private async publishReel(
    connection: ResolvedConnectionContext,
    fileUrl: string,
    request: PublishRequest
  ) {
    const started = await metaFormPost<{ video_id: string; upload_url: string }>("/me/video_reels", {
      access_token: connection.accessToken,
      upload_phase: "start"
    });

    const uploadResponse = await fetch(started.upload_url, {
      method: "POST",
      headers: {
        Authorization: `OAuth ${connection.accessToken}`,
        file_url: fileUrl
      }
    });
    if (!uploadResponse.ok) {
      throw new PlatformPublishError(
        "Facebook reel upload failed.",
        uploadResponse.status >= 500 ? "transient" : "validation",
        `facebook_reel_upload_${uploadResponse.status}`,
        uploadResponse.status >= 500
      );
    }

    await metaFormPost<Record<string, unknown>>("/me/video_reels", {
      access_token: connection.accessToken,
      upload_phase: "finish",
      video_id: started.video_id,
      video_state: "PUBLISHED",
      description: request.canonicalPost.description ?? (composeCaption(request) || undefined),
      title: request.canonicalPost.title ?? undefined
    });

    return {
      videoId: started.video_id
    };
  }

  private async fetchPermalink(connection: ResolvedConnectionContext, remotePublishId: string) {
    const response = await metaGet<{ permalink_url?: string }>(`/${remotePublishId}`, {
      access_token: connection.accessToken,
      fields: "permalink_url"
    });
    return response.permalink_url ?? null;
  }
}
