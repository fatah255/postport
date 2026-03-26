import { MediaStatus, MediaType, type Prisma } from "@prisma/client";
import { mkdir, rm } from "node:fs/promises";
import { extname, join } from "node:path";
import { env } from "../config/env";
import { prisma } from "../services/prisma";
import { storage } from "../services/storage";
import {
  createImageThumbnail,
  extractVideoThumbnail,
  normalizeVideo,
  probeImage,
  probeVideo,
  shouldNormalizeVideo
} from "../services/media-processing";

const toInputJson = (value: unknown): Prisma.InputJsonValue => value as Prisma.InputJsonValue;

interface MediaIngestPayload {
  mediaAssetId: string;
}

export const processMediaIngest = async (payload: MediaIngestPayload) => {
  const mediaAsset = await prisma.mediaAsset.findUnique({
    where: {
      id: payload.mediaAssetId
    }
  });
  if (!mediaAsset) {
    return { skipped: true, reason: "media_not_found" };
  }

  const tempDir = join(env.MEDIA_PROCESSING_TEMP_DIR, mediaAsset.id);
  const sourceExtension = extname(mediaAsset.storageKey) || extname(mediaAsset.normalizedFilename) || ".bin";
  const sourcePath = join(tempDir, `source${sourceExtension}`);
  const thumbnailPath = join(tempDir, "thumbnail.jpg");
  const normalizedVideoPath = join(tempDir, "normalized.mp4");

  await mkdir(tempDir, { recursive: true });

  try {
    await storage.downloadObject(mediaAsset.storageKey, sourcePath);

    if (mediaAsset.mediaType === MediaType.IMAGE) {
      const image = await probeImage(sourcePath);
      await createImageThumbnail(sourcePath, thumbnailPath);
      await storage.uploadFile({
        objectKey: `${mediaAsset.storageKey}.thumb.jpg`,
        filePath: thumbnailPath,
        contentType: "image/jpeg"
      });

      await prisma.mediaVariant.upsert({
        where: {
          mediaAssetId_variantKind: {
            mediaAssetId: mediaAsset.id,
            variantKind: "original"
          }
        },
        update: {
          storageKey: mediaAsset.storageKey,
          mimeType: mediaAsset.mimeType,
          sizeBytes: mediaAsset.sizeBytes,
          width: image.width,
          height: image.height,
          durationMs: null,
          codec: image.codec,
          fps: null
        },
        create: {
          mediaAssetId: mediaAsset.id,
          variantKind: "original",
          storageKey: mediaAsset.storageKey,
          mimeType: mediaAsset.mimeType,
          sizeBytes: mediaAsset.sizeBytes,
          width: image.width,
          height: image.height,
          durationMs: null,
          codec: image.codec,
          fps: null
        }
      });

      await prisma.mediaThumbnail.deleteMany({
        where: {
          mediaAssetId: mediaAsset.id
        }
      });

      await prisma.mediaThumbnail.create({
        data: {
          mediaAssetId: mediaAsset.id,
          storageKey: `${mediaAsset.storageKey}.thumb.jpg`,
          width: 480,
          height: Math.max(1, Math.round((image.height ?? 480) * (480 / Math.max(image.width ?? 480, 1))))
        }
      });

      const updated = await prisma.mediaAsset.update({
        where: { id: mediaAsset.id },
        data: {
          status: MediaStatus.READY,
          width: image.width,
          height: image.height,
          durationMs: null,
          codec: image.codec,
          bitrate: null,
          fps: null,
          ffprobeJson: toInputJson({
            kind: "image",
            processedAt: new Date().toISOString(),
            metadata: image.raw
          })
        }
      });

      return {
        mediaAssetId: updated.id,
        status: updated.status
      };
    }

    const originalProbe = await probeVideo(sourcePath);
    const needsNormalization = shouldNormalizeVideo(mediaAsset.mimeType, originalProbe.codec);
    let processingPath = sourcePath;
    let normalizedProbe = originalProbe;

    if (needsNormalization) {
      const normalizedStats = await normalizeVideo(sourcePath, normalizedVideoPath);
      normalizedProbe = await probeVideo(normalizedVideoPath);
      processingPath = normalizedVideoPath;

      await storage.uploadFile({
        objectKey: `${mediaAsset.storageKey}.normalized.mp4`,
        filePath: normalizedVideoPath,
        contentType: "video/mp4"
      });

      await prisma.mediaVariant.upsert({
        where: {
          mediaAssetId_variantKind: {
            mediaAssetId: mediaAsset.id,
            variantKind: "normalized"
          }
        },
        update: {
          storageKey: `${mediaAsset.storageKey}.normalized.mp4`,
          mimeType: "video/mp4",
          sizeBytes: BigInt(normalizedStats.size),
          width: normalizedProbe.width,
          height: normalizedProbe.height,
          durationMs: normalizedProbe.durationMs,
          codec: normalizedProbe.codec,
          bitrate: normalizedProbe.bitrate,
          fps: normalizedProbe.fps
        },
        create: {
          mediaAssetId: mediaAsset.id,
          variantKind: "normalized",
          storageKey: `${mediaAsset.storageKey}.normalized.mp4`,
          mimeType: "video/mp4",
          sizeBytes: BigInt(normalizedStats.size),
          width: normalizedProbe.width,
          height: normalizedProbe.height,
          durationMs: normalizedProbe.durationMs,
          codec: normalizedProbe.codec,
          bitrate: normalizedProbe.bitrate,
          fps: normalizedProbe.fps
        }
      });
    }

    await extractVideoThumbnail(processingPath, thumbnailPath, normalizedProbe.durationMs);
    await storage.uploadFile({
      objectKey: `${mediaAsset.storageKey}.thumb.jpg`,
      filePath: thumbnailPath,
      contentType: "image/jpeg"
    });

    await prisma.mediaVariant.upsert({
      where: {
        mediaAssetId_variantKind: {
          mediaAssetId: mediaAsset.id,
          variantKind: "original"
        }
      },
      update: {
        storageKey: mediaAsset.storageKey,
        mimeType: mediaAsset.mimeType,
        sizeBytes: mediaAsset.sizeBytes,
        width: originalProbe.width,
        height: originalProbe.height,
        durationMs: originalProbe.durationMs,
        codec: originalProbe.codec,
        bitrate: originalProbe.bitrate,
        fps: originalProbe.fps
      },
      create: {
        mediaAssetId: mediaAsset.id,
        variantKind: "original",
        storageKey: mediaAsset.storageKey,
        mimeType: mediaAsset.mimeType,
        sizeBytes: mediaAsset.sizeBytes,
        width: originalProbe.width,
        height: originalProbe.height,
        durationMs: originalProbe.durationMs,
        codec: originalProbe.codec,
        bitrate: originalProbe.bitrate,
        fps: originalProbe.fps
      }
    });

    await prisma.mediaThumbnail.deleteMany({
      where: {
        mediaAssetId: mediaAsset.id
      }
    });

    await prisma.mediaThumbnail.create({
      data: {
        mediaAssetId: mediaAsset.id,
        storageKey: `${mediaAsset.storageKey}.thumb.jpg`,
        width: 480,
        height: Math.max(1, Math.round((normalizedProbe.height ?? 270) * (480 / Math.max(normalizedProbe.width ?? 480, 1))))
      }
    });

    const updated = await prisma.mediaAsset.update({
      where: { id: mediaAsset.id },
      data: {
        status: MediaStatus.READY,
        width: normalizedProbe.width,
        height: normalizedProbe.height,
        durationMs: normalizedProbe.durationMs,
        codec: normalizedProbe.codec,
        bitrate: normalizedProbe.bitrate,
        fps: normalizedProbe.fps,
        ffprobeJson: toInputJson({
          kind: "video",
          processedAt: new Date().toISOString(),
          original: originalProbe.raw,
          normalized: needsNormalization ? normalizedProbe.raw : null
        })
      }
    });

    return {
      mediaAssetId: updated.id,
      status: updated.status,
      normalized: needsNormalization
    };
  } catch (error) {
    await prisma.mediaAsset.update({
      where: { id: mediaAsset.id },
      data: {
        status: MediaStatus.FAILED,
        ffprobeJson: {
          error: error instanceof Error ? error.message : "Unknown media processing error",
          failedAt: new Date().toISOString()
        }
      }
    });

    throw error;
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
};
