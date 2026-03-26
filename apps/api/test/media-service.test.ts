import test from "node:test";
import assert from "node:assert/strict";
import { MediaStatus, MediaType } from "@prisma/client";
import { BadRequestException } from "@nestjs/common";
import { MediaService } from "../src/modules/media/media.service";
import { QUEUES } from "../src/common/constants/queue-names";

const createMediaService = () => {
  const state = {
    duplicateLookup: null as
      | {
          id: string;
          originalFilename: string;
          createdAt: Date;
        }
      | null,
    currentAsset: {
      id: "media-1",
      workspaceId: "workspace-1",
      ownerId: "user-1",
      folderId: null as string | null,
      mediaType: MediaType.VIDEO,
      status: MediaStatus.UPLOADING,
      originalFilename: "Launch Clip.mp4",
      normalizedFilename: "launch-clip.mp4",
      mimeType: "video/mp4",
      fileExtension: "mp4",
      sizeBytes: BigInt(16 * 1024 * 1024),
      checksum: "checksum-1",
      storageKey: "workspaces/workspace-1/media/uploaded-object.mp4",
      sourceUploadId: "upload-seed",
      createdAt: new Date("2026-03-25T11:00:00.000Z"),
      uploadedAt: null as Date | null,
      deletedAt: null as Date | null
    },
    listItems: [] as Array<Record<string, unknown>>,
    detailAsset: null as Record<string, unknown> | null,
    multipartParts: [] as Array<{ partNumber: number; etag: string }>,
    queueCalls: [] as Array<{ queueName: string; name: string; data: unknown; options: unknown }>,
    abortCalls: [] as Array<{ objectKey: string; uploadId: string }>,
    updateCalls: [] as Array<Record<string, unknown>>
  };

  const prisma = {
    mediaFolder: {
      findFirst: async () => null
    },
    mediaAsset: {
      findFirst: async (args: Record<string, unknown>) => {
        const where = args.where as Record<string, unknown> | undefined;
        const include = args.include as Record<string, unknown> | undefined;
        if (where?.checksum) {
          return state.duplicateLookup;
        }

        if (where?.id === state.currentAsset.id && where?.workspaceId === state.currentAsset.workspaceId) {
          if (include?.variants || include?.thumbnails || include?.tags) {
            return (
              state.detailAsset ?? {
                ...state.currentAsset,
                variants: [],
                thumbnails: [],
                tags: []
              }
            );
          }
          return { ...state.currentAsset };
        }

        return null;
      },
      findMany: async () => state.listItems.map((item) => ({ ...item })),
      create: async (args: Record<string, unknown>) => {
        const data = args.data as Record<string, unknown>;
        state.currentAsset = {
          ...state.currentAsset,
          ownerId: String(data.ownerId),
          folderId: (data.folderId as string | null | undefined) ?? null,
          mediaType: data.mediaType as MediaType,
          status: data.status as MediaStatus,
          originalFilename: String(data.originalFilename),
          normalizedFilename: String(data.normalizedFilename),
          mimeType: String(data.mimeType),
          fileExtension: (data.fileExtension as string | null | undefined) ?? null,
          sizeBytes: data.sizeBytes as bigint,
          checksum: String(data.checksum),
          storageKey: String(data.storageKey),
          sourceUploadId: String(data.sourceUploadId)
        };

        return { ...state.currentAsset };
      },
      update: async (args: Record<string, unknown>) => {
        const data = args.data as Record<string, unknown>;
        state.updateCalls.push(data);
        state.currentAsset = {
          ...state.currentAsset,
          ...data,
          sizeBytes: state.currentAsset.sizeBytes
        };

        return { ...state.currentAsset };
      }
    }
  };

  const storageService = {
    createSignedUploadUrl: async () => "https://storage.test/upload",
    createMultipartUpload: async () => ({ uploadId: "multipart-123" }),
    createSignedMultipartPartUrl: async ({ partNumber }: { partNumber: number }) => `https://storage.test/part-${partNumber}`,
    completeMultipartUpload: async (input: { parts: Array<{ partNumber: number; etag: string }> }) => {
      state.multipartParts = input.parts;
    },
    abortMultipartUpload: async (input: { objectKey: string; uploadId: string }) => {
      state.abortCalls.push(input);
    },
    createSignedDownloadUrl: async (objectKey: string) => `https://signed.test/${objectKey}`,
    publicUrlForObject: (objectKey: string) => `https://cdn.test/${objectKey}`,
    objectExists: async () => true
  };

  const queueService = {
    enqueue: async (queueName: string, name: string, data: unknown, options: unknown) => {
      state.queueCalls.push({ queueName, name, data, options });
    }
  };

  const workspaceAccessService = {
    resolveWorkspaceIdForUser: async () => "workspace-1"
  };

  return {
    service: new MediaService(prisma as never, storageService as never, queueService as never, workspaceAccessService as never),
    state
  };
};

test("media service initializes multipart uploads and persists the remote upload id", async () => {
  const { service, state } = createMediaService();
  state.duplicateLookup = {
    id: "existing-media",
    originalFilename: "Launch Clip.mp4",
    createdAt: new Date("2026-03-24T10:00:00.000Z")
  };

  const result = await service.initMultipartUpload("user-1", {
    workspaceId: "workspace-1",
    fileName: "Launch Clip.mp4",
    mimeType: "video/mp4",
    sizeBytes: 16 * 1024 * 1024,
    checksum: "checksum-1"
  });

  assert.equal(result.upload.strategy, "multipart");
  assert.equal(result.upload.uploadId, "multipart-123");
  assert.equal(result.upload.partSizeBytes, 8 * 1024 * 1024);
  assert.equal(result.mediaAsset.sourceUploadId, "multipart-123");
  assert.equal(result.duplicateHint?.mediaAssetId, "existing-media");
});

test("media service completes multipart uploads and queues media ingest processing", async () => {
  const { service, state } = createMediaService();
  state.currentAsset.sourceUploadId = "multipart-123";

  const result = await service.completeMultipartUpload("user-1", {
    workspaceId: "workspace-1",
    mediaAssetId: "media-1",
    uploadId: "multipart-123",
    parts: [
      {
        partNumber: 2,
        etag: "\"part-2\""
      },
      {
        partNumber: 1,
        etag: "\"part-1\""
      }
    ]
  });

  assert.equal(result.mediaAsset.status, MediaStatus.PROCESSING);
  assert.equal(result.queued, true);
  assert.deepEqual(state.multipartParts, [
    {
      partNumber: 2,
      etag: "\"part-2\""
    },
    {
      partNumber: 1,
      etag: "\"part-1\""
    }
  ]);
  assert.equal(state.queueCalls.length, 1);
  assert.equal(state.queueCalls[0]?.queueName, QUEUES.MEDIA_INGEST);
  assert.equal(state.queueCalls[0]?.name, "media.ingest");
});

test("media service rejects multipart part URL requests when the upload id does not match", async () => {
  const { service, state } = createMediaService();
  state.currentAsset.sourceUploadId = "multipart-123";

  await assert.rejects(
    service.getMultipartPartUrl("user-1", {
      workspaceId: "workspace-1",
      mediaAssetId: "media-1",
      uploadId: "wrong-upload",
      partNumber: 1
    }),
    (error: unknown) => {
      assert.ok(error instanceof BadRequestException);
      assert.equal(error.message, "Multipart upload id does not match the pending media asset.");
      return true;
    }
  );
});

test("media service aborts multipart uploads and tombstones the pending asset", async () => {
  const { service, state } = createMediaService();
  state.currentAsset.sourceUploadId = "multipart-123";

  const result = await service.abortMultipartUpload("user-1", {
    workspaceId: "workspace-1",
    mediaAssetId: "media-1",
    uploadId: "multipart-123"
  });

  assert.deepEqual(result, { success: true });
  assert.deepEqual(state.abortCalls, [
    {
      objectKey: "workspaces/workspace-1/media/uploaded-object.mp4",
      uploadId: "multipart-123"
    }
  ]);
  assert.equal(state.currentAsset.status, MediaStatus.DELETED);
  assert.ok(state.currentAsset.deletedAt instanceof Date);
});

test("media service signs thumbnail and source preview URLs for media listings", async () => {
  const { service, state } = createMediaService();
  state.listItems = [
    {
      ...state.currentAsset,
      id: "image-1",
      mediaType: MediaType.IMAGE,
      status: MediaStatus.PROCESSING,
      originalFilename: "draft-image.png",
      mimeType: "image/png",
      storageKey: "workspaces/workspace-1/media/draft-image.png",
      thumbnails: [],
      _count: {
        draftSelections: 0
      }
    },
    {
      ...state.currentAsset,
      id: "video-1",
      mediaType: MediaType.VIDEO,
      status: MediaStatus.READY,
      originalFilename: "launch.mp4",
      storageKey: "workspaces/workspace-1/media/launch.mp4",
      thumbnails: [
        {
          id: "thumb-1",
          storageKey: "workspaces/workspace-1/media/launch.mp4.thumb.jpg",
          createdAt: new Date("2026-03-25T12:00:00.000Z")
        }
      ],
      _count: {
        draftSelections: 3
      }
    }
  ];

  const result = await service.listMedia("user-1", {
    workspaceId: "workspace-1",
    sort: "newest"
  });

  assert.equal(result.items.length, 2);
  assert.equal(result.items[0]?.previewUrl, "https://signed.test/workspaces/workspace-1/media/draft-image.png");
  assert.equal(result.items[0]?.thumbnail, null);
  assert.equal(result.items[1]?.thumbnail, "https://signed.test/workspaces/workspace-1/media/launch.mp4.thumb.jpg");
  assert.equal(result.items[1]?.previewUrl, "https://signed.test/workspaces/workspace-1/media/launch.mp4");
});

test("media service signs source, variant, and thumbnail URLs for media previews", async () => {
  const { service, state } = createMediaService();
  state.currentAsset.status = MediaStatus.PROCESSING;
  state.currentAsset.mediaType = MediaType.IMAGE;
  state.currentAsset.mimeType = "image/png";
  state.currentAsset.storageKey = "workspaces/workspace-1/media/source-image.png";
  state.detailAsset = {
    ...state.currentAsset,
    variants: [
      {
        id: "variant-1",
        mediaAssetId: state.currentAsset.id,
        variantKind: "original",
        storageKey: "workspaces/workspace-1/media/source-image.png",
        mimeType: "image/png",
        sizeBytes: BigInt(2048),
        width: 100,
        height: 100,
        durationMs: null,
        codec: "png",
        bitrate: null,
        fps: null
      }
    ],
    thumbnails: [
      {
        id: "thumb-1",
        mediaAssetId: state.currentAsset.id,
        storageKey: "workspaces/workspace-1/media/source-image.png.thumb.jpg",
        width: 480,
        height: 480
      }
    ],
    tags: []
  };

  const result = await service.getMediaById("user-1", "media-1", "workspace-1");

  assert.equal(result.sourceUrl, "https://signed.test/workspaces/workspace-1/media/source-image.png");
  assert.equal(result.variants[0]?.publicUrl, "https://signed.test/workspaces/workspace-1/media/source-image.png");
  assert.equal(result.thumbnails[0]?.publicUrl, "https://signed.test/workspaces/workspace-1/media/source-image.png.thumb.jpg");
});
