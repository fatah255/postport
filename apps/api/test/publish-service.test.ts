import test from "node:test";
import assert from "node:assert/strict";
import { Platform, PublishJobStatus } from "@prisma/client";
import { PublishService } from "../src/modules/publish/publish.service";

test("publish service dedupes duplicate createJobs requests for the same draft/platform/runAt", async () => {
  let createdCount = 0;
  const queueCalls: Array<{ queueName: string; name: string }> = [];
  const createdJob = {
    id: "job-1",
    workspaceId: "workspace-1",
    draftId: "draft-1",
    scheduleId: null,
    platformTargetId: "target-1",
    platform: Platform.INSTAGRAM,
    status: PublishJobStatus.QUEUED,
    priority: 25,
    runAt: new Date("2026-03-26T12:00:00.000Z"),
    dedupeKey: "dedupe-key",
    idempotencyKey: "idempotency-key"
  };

  const prisma = {
    draft: {
      findFirst: async () => ({
        id: "draft-1",
        workspaceId: "workspace-1",
        updatedAt: new Date("2026-03-26T11:00:00.000Z"),
        platformTargets: [
          {
            id: "target-1",
            platform: Platform.INSTAGRAM
          }
        ],
        mediaSelections: [
          {
            mediaAssetId: "media-1"
          }
        ]
      })
    },
    publishJob: {
      findFirst: async (args: { where?: Record<string, unknown> }) => {
        if (args.where?.idempotencyKey) {
          return createdCount > 0 ? createdJob : null;
        }

        if (args.where?.dedupeKey) {
          return createdCount > 0 ? createdJob : null;
        }

        return null;
      },
      create: async () => {
        createdCount += 1;
        return createdJob;
      }
    },
    publishEvent: {
      create: async () => undefined
    }
  };

  const queueService = {
    enqueue: async (queueName: string, name: string) => {
      queueCalls.push({ queueName, name });
    }
  };

  const service = new PublishService(prisma as never, queueService as never, {} as never);
  const first = await service.createJobs({
    draftId: "draft-1",
    workspaceId: "workspace-1",
    runAt: new Date("2026-03-26T12:00:00.000Z"),
    priority: 25
  });
  const second = await service.createJobs({
    draftId: "draft-1",
    workspaceId: "workspace-1",
    runAt: new Date("2026-03-26T12:00:00.000Z"),
    priority: 25
  });

  assert.equal(first.length, 1);
  assert.equal(second.length, 1);
  assert.equal(createdCount, 1);
  assert.equal(queueCalls.length, 1);
});
