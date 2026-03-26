import { MediaType } from "@prisma/client";
import { env } from "../config/env";
import { prisma } from "../services/prisma";
import { storage } from "../services/storage";
import { PlatformPublishError } from "./errors";

export interface PublishableMediaAsset {
  mediaAssetId: string;
  mediaType: MediaType;
  mimeType: string;
  storageKey: string;
  signedUrl: string;
  fileName: string;
  sizeBytes: number;
  width: number | null;
  height: number | null;
  durationMs: number | null;
  codec: string | null;
  thumbnailUrl: string | null;
}

export class MediaResolver {
  async resolve(mediaAssetIds: string[]): Promise<PublishableMediaAsset[]> {
    const assets = await prisma.mediaAsset.findMany({
      where: {
        id: {
          in: mediaAssetIds
        }
      },
      include: {
        variants: true,
        thumbnails: {
          orderBy: {
            createdAt: "desc"
          },
          take: 1
        }
      }
    });

    if (assets.length !== mediaAssetIds.length) {
      throw new PlatformPublishError("One or more media assets could not be resolved for publishing.", "validation", "media_missing", false);
    }

    const assetMap = new Map(assets.map((asset) => [asset.id, asset]));
    const orderedAssets = mediaAssetIds
      .map((mediaAssetId) => assetMap.get(mediaAssetId))
      .filter((asset): asset is NonNullable<typeof asset> => asset !== undefined);

    return Promise.all(
      orderedAssets.map(async (asset) => {
        const normalizedVariant = asset.variants.find((variant) => variant.variantKind === "normalized");
        const selectedSource =
          asset.mediaType === MediaType.VIDEO && normalizedVariant
            ? {
                storageKey: normalizedVariant.storageKey,
                mimeType: normalizedVariant.mimeType,
                sizeBytes: Number(normalizedVariant.sizeBytes),
                width: normalizedVariant.width,
                height: normalizedVariant.height,
                durationMs: normalizedVariant.durationMs,
                codec: normalizedVariant.codec
              }
            : {
                storageKey: asset.storageKey,
                mimeType: asset.mimeType,
                sizeBytes: Number(asset.sizeBytes),
                width: asset.width,
                height: asset.height,
                durationMs: asset.durationMs,
                codec: asset.codec
              };

        const signedUrl = await storage.createSignedDownloadUrl(selectedSource.storageKey);
        const thumbnail = asset.thumbnails[0]
          ? await storage.createSignedDownloadUrl(asset.thumbnails[0].storageKey, env.SIGNED_MEDIA_URL_EXPIRY_SECONDS)
          : null;

        return {
          mediaAssetId: asset.id,
          mediaType: asset.mediaType,
          mimeType: selectedSource.mimeType,
          storageKey: selectedSource.storageKey,
          signedUrl,
          fileName: asset.normalizedFilename,
          sizeBytes: selectedSource.sizeBytes,
          width: selectedSource.width,
          height: selectedSource.height,
          durationMs: selectedSource.durationMs,
          codec: selectedSource.codec,
          thumbnailUrl: thumbnail
        } satisfies PublishableMediaAsset;
      })
    );
  }
}

export const mediaResolver = new MediaResolver();
