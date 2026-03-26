import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { DraftStatus, MediaStatus, MediaType } from "@prisma/client";
import { randomUUID } from "node:crypto";
import { sha256 } from "@postport/utils";
import { PrismaService } from "../prisma/prisma.service";
import { StorageService } from "../storage/storage.service";
import { QueueService } from "../queue/queue.service";
import { WorkspaceAccessService } from "../../common/services/workspace-access.service";
import type { InitUploadDto } from "./dto/init-upload.dto";
import type { CompleteUploadDto } from "./dto/complete-upload.dto";
import type { InitMultipartUploadDto } from "./dto/init-multipart-upload.dto";
import type { GetMultipartPartUrlDto } from "./dto/get-multipart-part-url.dto";
import type { CompleteMultipartUploadDto } from "./dto/complete-multipart-upload.dto";
import type { AbortMultipartUploadDto } from "./dto/abort-multipart-upload.dto";
import type { ListMediaDto } from "./dto/list-media.dto";
import type { UpdateMediaDto } from "./dto/update-media.dto";
import type { BulkDeleteMediaDto } from "./dto/bulk-delete-media.dto";
import type { ReprocessMediaDto } from "./dto/reprocess-media.dto";
import { QUEUES } from "../../common/constants/queue-names";

const MULTIPART_PART_SIZE_BYTES = 8 * 1024 * 1024;

@Injectable()
export class MediaService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storageService: StorageService,
    private readonly queueService: QueueService,
    private readonly workspaceAccessService: WorkspaceAccessService
  ) {}

  async initUpload(userId: string, input: InitUploadDto) {
    const { mediaAsset, duplicateHint } = await this.createPendingMediaAsset(userId, input);

    const uploadUrl = await this.storageService.createSignedUploadUrl({
      objectKey: mediaAsset.storageKey,
      mimeType: mediaAsset.mimeType,
      contentLength: Number(mediaAsset.sizeBytes)
    });

    return {
      mediaAsset: this.serializeMediaAsset(mediaAsset),
      upload: {
        uploadUrl,
        objectKey: mediaAsset.storageKey,
        strategy: "single_part",
        expiresInSeconds: 900
      },
      duplicateHint
    };
  }

  async initMultipartUpload(userId: string, input: InitMultipartUploadDto) {
    const { mediaAsset, duplicateHint } = await this.createPendingMediaAsset(userId, input);
    const multipart = await this.storageService.createMultipartUpload({
      objectKey: mediaAsset.storageKey,
      mimeType: mediaAsset.mimeType,
      contentLength: Number(mediaAsset.sizeBytes)
    });

    const updated = await this.prisma.mediaAsset.update({
      where: {
        id: mediaAsset.id
      },
      data: {
        sourceUploadId: multipart.uploadId
      }
    });

    return {
      mediaAsset: this.serializeMediaAsset(updated),
      upload: {
        uploadId: multipart.uploadId,
        objectKey: updated.storageKey,
        strategy: "multipart",
        partSizeBytes: MULTIPART_PART_SIZE_BYTES,
        expiresInSeconds: 900
      },
      duplicateHint
    };
  }

  async getMultipartPartUrl(userId: string, input: GetMultipartPartUrlDto) {
    const workspaceId = await this.workspaceAccessService.resolveWorkspaceIdForUser(userId, input.workspaceId);
    const mediaAsset = await this.ensureMediaOwnership(input.mediaAssetId, workspaceId);

    if (mediaAsset.sourceUploadId !== input.uploadId) {
      throw new BadRequestException("Multipart upload id does not match the pending media asset.");
    }

    const uploadUrl = await this.storageService.createSignedMultipartPartUrl({
      objectKey: mediaAsset.storageKey,
      uploadId: input.uploadId,
      partNumber: input.partNumber
    });

    return {
      mediaAssetId: mediaAsset.id,
      uploadId: input.uploadId,
      partNumber: input.partNumber,
      uploadUrl,
      expiresInSeconds: 900
    };
  }

  async completeUpload(userId: string, input: CompleteUploadDto) {
    const workspaceId = await this.workspaceAccessService.resolveWorkspaceIdForUser(userId, input.workspaceId);
    const mediaAsset = await this.prisma.mediaAsset.findFirst({
      where: {
        id: input.mediaAssetId,
        workspaceId
      }
    });

    if (!mediaAsset) {
      throw new NotFoundException("Media asset not found.");
    }

    return this.finalizeUploadedAsset(mediaAsset.id, workspaceId);
  }

  async completeMultipartUpload(userId: string, input: CompleteMultipartUploadDto) {
    const workspaceId = await this.workspaceAccessService.resolveWorkspaceIdForUser(userId, input.workspaceId);
    const mediaAsset = await this.ensureMediaOwnership(input.mediaAssetId, workspaceId);

    if (mediaAsset.sourceUploadId !== input.uploadId) {
      throw new BadRequestException("Multipart upload id does not match the pending media asset.");
    }

    await this.storageService.completeMultipartUpload({
      objectKey: mediaAsset.storageKey,
      uploadId: input.uploadId,
      parts: input.parts.map((part) => ({
        partNumber: part.partNumber,
        etag: part.etag
      }))
    });

    return this.finalizeUploadedAsset(mediaAsset.id, workspaceId);
  }

  async abortMultipartUpload(userId: string, input: AbortMultipartUploadDto) {
    const workspaceId = await this.workspaceAccessService.resolveWorkspaceIdForUser(userId, input.workspaceId);
    const mediaAsset = await this.ensureMediaOwnership(input.mediaAssetId, workspaceId);

    if (mediaAsset.sourceUploadId !== input.uploadId) {
      throw new BadRequestException("Multipart upload id does not match the pending media asset.");
    }

    await this.storageService.abortMultipartUpload({
      objectKey: mediaAsset.storageKey,
      uploadId: input.uploadId
    });

    await this.prisma.mediaAsset.update({
      where: {
        id: mediaAsset.id
      },
      data: {
        status: MediaStatus.DELETED,
        deletedAt: new Date()
      }
    });

    return {
      success: true
    };
  }

  async listMedia(userId: string, input: ListMediaDto) {
    const workspaceId = await this.workspaceAccessService.resolveWorkspaceIdForUser(userId, input.workspaceId);
    const statusFilter = input.status as MediaStatus | undefined;
    const typeFilter = input.type as MediaType | undefined;

    const items = await this.prisma.mediaAsset.findMany({
      where: {
        workspaceId,
        status: statusFilter ?? {
          not: MediaStatus.DELETED
        },
        mediaType: typeFilter,
        originalFilename: input.query
          ? {
              contains: input.query,
              mode: "insensitive"
            }
          : undefined
      },
      include: {
        thumbnails: {
          orderBy: {
            createdAt: "desc"
          },
          take: 1
        },
        _count: {
          select: {
            draftSelections: true
          }
        }
      },
      orderBy: this.mapSort(input.sort)
    });

    return {
      items: items.map((item) => ({
        ...this.serializeMediaAsset(item),
        thumbnail: item.thumbnails[0] ? this.storageService.publicUrlForObject(item.thumbnails[0].storageKey) : null,
        usageCount: item._count.draftSelections
      }))
    };
  }

  async getMediaById(userId: string, mediaAssetId: string, workspaceIdHint?: string) {
    const workspaceId = await this.workspaceAccessService.resolveWorkspaceIdForUser(userId, workspaceIdHint);
    const item = await this.prisma.mediaAsset.findFirst({
      where: {
        id: mediaAssetId,
        workspaceId
      },
      include: {
        variants: true,
        thumbnails: true,
        tags: {
          include: {
            mediaTag: true
          }
        }
      }
    });

    if (!item) {
      throw new NotFoundException("Media asset not found.");
    }

    return {
      ...this.serializeMediaAsset(item),
      variants: item.variants.map((variant) => ({
        ...variant,
        sizeBytes: Number(variant.sizeBytes),
        publicUrl: this.storageService.publicUrlForObject(variant.storageKey)
      })),
      thumbnails: item.thumbnails.map((thumbnail) => ({
        ...thumbnail,
        publicUrl: this.storageService.publicUrlForObject(thumbnail.storageKey)
      })),
      tags: item.tags.map((tagRef) => tagRef.mediaTag)
    };
  }

  async updateMedia(userId: string, mediaAssetId: string, input: UpdateMediaDto) {
    const workspaceId = await this.workspaceAccessService.resolveWorkspaceIdForUser(userId, input.workspaceId);
    await this.ensureMediaOwnership(mediaAssetId, workspaceId);

    const updated = await this.prisma.mediaAsset.update({
      where: {
        id: mediaAssetId
      },
      data: {
        originalFilename: input.originalFilename,
        normalizedFilename: input.originalFilename ? this.normalizeFileName(input.originalFilename) : undefined,
        folderId: input.folderId
      }
    });

    return this.serializeMediaAsset(updated);
  }

  async deleteMedia(userId: string, mediaAssetId: string, workspaceIdHint?: string) {
    const workspaceId = await this.workspaceAccessService.resolveWorkspaceIdForUser(userId, workspaceIdHint);
    await this.ensureMediaOwnership(mediaAssetId, workspaceId);

    const inUseCount = await this.prisma.draftMediaSelection.count({
      where: {
        mediaAssetId,
        draft: {
          status: {
            in: [DraftStatus.READY, DraftStatus.SCHEDULED]
          }
        }
      }
    });

    if (inUseCount > 0) {
      throw new BadRequestException(
        "This media is used by draft(s) that are READY or SCHEDULED. Remove it from those drafts first."
      );
    }

    await this.prisma.mediaAsset.update({
      where: { id: mediaAssetId },
      data: {
        status: MediaStatus.DELETED,
        deletedAt: new Date()
      }
    });

    return { success: true };
  }

  async bulkDelete(userId: string, input: BulkDeleteMediaDto) {
    const workspaceId = await this.workspaceAccessService.resolveWorkspaceIdForUser(userId, input.workspaceId);
    let deleted = 0;
    const failed: Array<{ mediaAssetId: string; reason: string }> = [];

    for (const mediaAssetId of input.mediaAssetIds) {
      try {
        await this.deleteMedia(userId, mediaAssetId, workspaceId);
        deleted += 1;
      } catch (error) {
        failed.push({
          mediaAssetId,
          reason: error instanceof Error ? error.message : "Unknown delete error"
        });
      }
    }

    return {
      deleted,
      failed
    };
  }

  async reprocess(userId: string, mediaAssetId: string, input: ReprocessMediaDto) {
    const workspaceId = await this.workspaceAccessService.resolveWorkspaceIdForUser(userId, input.workspaceId);
    await this.ensureMediaOwnership(mediaAssetId, workspaceId);

    const updated = await this.prisma.mediaAsset.update({
      where: { id: mediaAssetId },
      data: {
        status: MediaStatus.PROCESSING
      }
    });

    await this.queueService.enqueue(
      QUEUES.MEDIA_INGEST,
      "media.reprocess",
      { mediaAssetId, workspaceId },
      {
        jobId: `media_reprocess_${mediaAssetId}_${Date.now()}`,
        attempts: 4
      }
    );

    return {
      mediaAsset: this.serializeMediaAsset(updated),
      queued: true
    };
  }

  private mapMimeType(mimeType: string): MediaType {
    if (mimeType.startsWith("image/")) {
      return MediaType.IMAGE;
    }
    if (mimeType.startsWith("video/")) {
      return MediaType.VIDEO;
    }
    throw new BadRequestException("Only image and video mime types are currently supported.");
  }

  private normalizeFileName(fileName: string): string {
    return fileName
      .trim()
      .replace(/\s+/g, "-")
      .replace(/[^a-zA-Z0-9._-]/g, "_")
      .toLowerCase();
  }

  private extractFileExtension(fileName: string): string | null {
    const index = fileName.lastIndexOf(".");
    if (index === -1 || index === fileName.length - 1) {
      return null;
    }
    return fileName.slice(index + 1).toLowerCase();
  }

  private async ensureMediaOwnership(mediaAssetId: string, workspaceId: string) {
    const mediaAsset = await this.prisma.mediaAsset.findFirst({
      where: {
        id: mediaAssetId,
        workspaceId
      }
    });
    if (!mediaAsset) {
      throw new NotFoundException("Media asset not found.");
    }
    return mediaAsset;
  }

  private mapSort(sort: string | undefined) {
    switch (sort) {
      case "oldest":
        return { createdAt: "asc" as const };
      case "name":
        return { originalFilename: "asc" as const };
      case "size":
        return { sizeBytes: "desc" as const };
      default:
        return { createdAt: "desc" as const };
    }
  }

  private serializeMediaAsset<T extends { sizeBytes: bigint }>(mediaAsset: T) {
    return {
      ...mediaAsset,
      sizeBytes: Number(mediaAsset.sizeBytes)
    };
  }

  private async createPendingMediaAsset(
    userId: string,
    input: Pick<InitUploadDto, "fileName" | "mimeType" | "sizeBytes" | "checksum" | "folderId" | "workspaceId">
  ) {
    const workspaceId = await this.workspaceAccessService.resolveWorkspaceIdForUser(userId, input.workspaceId);
    const mediaType = this.mapMimeType(input.mimeType);
    const normalizedFilename = this.normalizeFileName(input.fileName);
    const checksum = input.checksum ?? sha256(`${userId}:${input.fileName}:${input.sizeBytes}:${Date.now()}`);
    const objectKey = `workspaces/${workspaceId}/media/${Date.now()}-${randomUUID()}-${normalizedFilename}`;

    if (input.folderId) {
      const folder = await this.prisma.mediaFolder.findFirst({
        where: {
          id: input.folderId,
          workspaceId
        }
      });
      if (!folder) {
        throw new BadRequestException("Selected folder was not found in the active workspace.");
      }
    }

    const existingDuplicate = await this.prisma.mediaAsset.findFirst({
      where: {
        workspaceId,
        checksum,
        status: {
          not: MediaStatus.DELETED
        }
      },
      select: {
        id: true,
        originalFilename: true,
        createdAt: true
      }
    });

    const mediaAsset = await this.prisma.mediaAsset.create({
      data: {
        workspaceId,
        ownerId: userId,
        folderId: input.folderId ?? null,
        mediaType,
        status: MediaStatus.UPLOADING,
        originalFilename: input.fileName,
        normalizedFilename,
        mimeType: input.mimeType,
        fileExtension: this.extractFileExtension(input.fileName),
        sizeBytes: BigInt(input.sizeBytes),
        checksum,
        storageKey: objectKey,
        sourceUploadId: randomUUID()
      }
    });

    return {
      workspaceId,
      mediaAsset,
      duplicateHint: existingDuplicate
        ? {
            mediaAssetId: existingDuplicate.id,
            originalFilename: existingDuplicate.originalFilename,
            createdAt: existingDuplicate.createdAt
          }
        : null
    };
  }

  private async finalizeUploadedAsset(mediaAssetId: string, workspaceId: string) {
    const mediaAsset = await this.prisma.mediaAsset.findFirst({
      where: {
        id: mediaAssetId,
        workspaceId
      }
    });

    if (!mediaAsset) {
      throw new NotFoundException("Media asset not found.");
    }

    const objectExists = await this.storageService.objectExists(mediaAsset.storageKey);
    if (!objectExists) {
      throw new BadRequestException("Uploaded object was not found in storage. Complete the upload again.");
    }

    const updated = await this.prisma.mediaAsset.update({
      where: {
        id: mediaAsset.id
      },
      data: {
        status: MediaStatus.PROCESSING,
        uploadedAt: new Date()
      }
    });

    await this.queueService.enqueue(
      QUEUES.MEDIA_INGEST,
      "media.ingest",
      { mediaAssetId: mediaAsset.id, workspaceId },
      { jobId: `media_ingest_${mediaAsset.id}_${Date.now()}` }
    );

    return {
      mediaAsset: this.serializeMediaAsset(updated),
      queued: true
    };
  }
}
