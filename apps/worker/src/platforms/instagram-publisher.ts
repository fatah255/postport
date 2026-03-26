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
import { mediaResolver, type PublishableMediaAsset } from "./media-resolver";
import { metaFormPost, metaGet, composeCaption, extractPostFormat, sleep, toCapabilityFlags } from "./shared";
import { type ResolvedConnectionContext, tokenStore } from "./token-store";

const CONTAINER_POLL_DELAY_MS = 5_000;
const CONTAINER_POLL_ATTEMPTS = 24;

export class InstagramPublisher implements PlatformPublisherAdapter {
  readonly platform = "INSTAGRAM" as const;

  async validateConnection(target: PlatformTargetRef): Promise<ValidateConnectionResult> {
    const connection = await tokenStore.resolveConnectionContext({
      platform: Platform.INSTAGRAM,
      connectedAccountId: target.connectedAccountId,
      remoteTargetId: target.remoteTargetId
    });
    const capabilities = toCapabilityFlags(connection.capabilityFlags);
    const reasons: string[] = [];

    if (capabilities.isProfessionalAccount === false) {
      reasons.push("Instagram publishing requires a professional account.");
    }

    if (
      capabilities.requiresPagePublishingAuthorization &&
      capabilities.pagePublishingAuthorizationCompleted === false
    ) {
      reasons.push("Page Publishing Authorization is required before publishing.");
    }

    return {
      healthy: reasons.length === 0,
      reasons,
      capabilities
    };
  }

  async validateMedia(request: PublishRequest): Promise<ValidateMediaResult> {
    const media = await mediaResolver.resolve(request.mediaAssetIds);
    if (media.length === 0) {
      return { valid: false, reasons: ["Select at least one media asset."] };
    }
    if (media.length > 10) {
      return { valid: false, reasons: ["Instagram carousel publishing supports up to 10 items."] };
    }
    return { valid: true, reasons: [] };
  }

  async mapDraftToPayload(request: PublishRequest): Promise<Record<string, unknown>> {
    return {
      caption: composeCaption(request),
      mediaCount: request.mediaAssetIds.length,
      postFormat: extractPostFormat(request)
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
      platform: Platform.INSTAGRAM,
      connectedAccountId: request.target.connectedAccountId,
      remoteTargetId: request.target.remoteTargetId
    });
    const media = await mediaResolver.resolve(request.mediaAssetIds);
    const caption = composeCaption(request);

    if (media.length > 1) {
      const childContainerIds: string[] = [];
      for (const asset of media) {
        const child = await this.createMediaContainer(connection, asset, request, {
          caption: null,
          isCarouselItem: true
        });
        childContainerIds.push(child.id);
        await this.waitForContainer(connection, child.id);
      }

      const parent = await metaFormPost<{ id: string }>(`/${request.target.remoteTargetId}/media`, {
        access_token: connection.accessToken,
        media_type: "CAROUSEL",
        children: childContainerIds.join(","),
        caption
      });
      await this.waitForContainer(connection, parent.id);

      const published = await metaFormPost<{ id: string }>(`/${request.target.remoteTargetId}/media_publish`, {
        access_token: connection.accessToken,
        creation_id: parent.id
      });

      return {
        remotePublishId: published.id,
        remoteUrl: await this.fetchPermalink(connection, published.id),
        status: "SUCCEEDED",
        raw: {
          containerId: parent.id,
          childContainerIds
        }
      };
    }

    const single = media[0];
    if (!single) {
      throw new PlatformPublishError("Instagram publish request has no media.", "validation", "media_missing", false);
    }

    const container = await this.createMediaContainer(connection, single, request, {
      caption,
      isCarouselItem: false
    });
    await this.waitForContainer(connection, container.id);

    const published = await metaFormPost<{ id: string }>(`/${request.target.remoteTargetId}/media_publish`, {
      access_token: connection.accessToken,
      creation_id: container.id
    });

    return {
      remotePublishId: published.id,
      remoteUrl: await this.fetchPermalink(connection, published.id),
      status: "SUCCEEDED",
      raw: {
        containerId: container.id
      }
    };
  }

  async pollStatus(remotePublishId: string, target: PlatformTargetRef): Promise<PollStatusResponse> {
    const connection = await tokenStore.resolveConnectionContext({
      platform: Platform.INSTAGRAM,
      connectedAccountId: target.connectedAccountId,
      remoteTargetId: target.remoteTargetId
    });
    const media = await metaGet<{ id: string; permalink?: string; status_code?: string }>(`/${remotePublishId}`, {
      access_token: connection.accessToken,
      fields: "id,permalink,status_code"
    });

    if (media.status_code === "ERROR") {
      return {
        status: "FAILED",
        raw: media
      };
    }

    return {
      status: media.permalink ? "SUCCEEDED" : "WAITING_REMOTE",
      remoteUrl: media.permalink ?? null,
      raw: media
    };
  }

  normalizeError(error: unknown): NormalizedError {
    if (error instanceof PlatformPublishError) {
      return error.toNormalizedError();
    }

    return {
      kind: "transient",
      code: "instagram_unknown_error",
      message: error instanceof Error ? error.message : "Unexpected Instagram publish error.",
      retryable: true
    };
  }

  async refreshRemoteMetadata(target: PlatformTargetRef): Promise<Record<string, unknown>> {
    const connection = await tokenStore.resolveConnectionContext({
      platform: Platform.INSTAGRAM,
      connectedAccountId: target.connectedAccountId,
      remoteTargetId: target.remoteTargetId
    });

    return metaGet<Record<string, unknown>>(`/${target.remoteTargetId}`, {
      access_token: connection.accessToken,
      fields: "id,username"
    });
  }

  private async createMediaContainer(
    connection: ResolvedConnectionContext,
    asset: PublishableMediaAsset,
    request: PublishRequest,
    options: { caption: string | null; isCarouselItem: boolean }
  ) {
    if (asset.mediaType === MediaType.IMAGE) {
      return metaFormPost<{ id: string }>(`/${request.target.remoteTargetId}/media`, {
        access_token: connection.accessToken,
        image_url: asset.signedUrl,
        caption: options.caption ?? undefined,
        is_carousel_item: options.isCarouselItem ? "true" : undefined,
        alt_text: request.canonicalPost.altText ?? undefined
      });
    }

    const postFormat = extractPostFormat(request);
    const mediaType =
      options.isCarouselItem ? "VIDEO" : postFormat === "REEL" ? "REELS" : "VIDEO";

    return metaFormPost<{ id: string }>(`/${request.target.remoteTargetId}/media`, {
      access_token: connection.accessToken,
      video_url: asset.signedUrl,
      caption: options.caption ?? undefined,
      media_type: mediaType,
      is_carousel_item: options.isCarouselItem ? "true" : undefined,
      share_to_feed: !options.isCarouselItem && mediaType === "REELS" ? "true" : undefined
    });
  }

  private async waitForContainer(connection: ResolvedConnectionContext, containerId: string) {
    for (let attempt = 0; attempt < CONTAINER_POLL_ATTEMPTS; attempt += 1) {
      const status = await metaGet<{ status_code?: string; status_message?: string }>(`/${containerId}`, {
        access_token: connection.accessToken,
        fields: "status_code,status_message"
      });

      if (!status.status_code || status.status_code === "FINISHED" || status.status_code === "PUBLISHED") {
        return status;
      }

      if (status.status_code === "ERROR" || status.status_code === "EXPIRED") {
        throw new PlatformPublishError(
          status.status_message ?? "Instagram media container failed processing.",
          "validation",
          "instagram_container_failed",
          false,
          undefined,
          status
        );
      }

      await sleep(CONTAINER_POLL_DELAY_MS);
    }

    throw new PlatformPublishError(
      "Instagram media container timed out while processing.",
      "transient",
      "instagram_container_timeout",
      true
    );
  }

  private async fetchPermalink(connection: ResolvedConnectionContext, remotePublishId: string) {
    const response = await metaGet<{ permalink?: string }>(`/${remotePublishId}`, {
      access_token: connection.accessToken,
      fields: "permalink"
    });
    return response.permalink ?? null;
  }
}
