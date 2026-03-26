import test from "node:test";
import assert from "node:assert/strict";
import { Platform } from "@prisma/client";
import { HealthController } from "../src/modules/health/health.controller";
import { ConnectionsService } from "../src/modules/connections/connections.service";

test("health controller exposes health and ready payloads", async () => {
  const controller = new HealthController({
    health: () => ({
      status: "ok",
      timestamp: "2026-03-26T10:00:00.000Z",
      service: "@postport/api"
    }),
    ready: async () => ({
      status: "ready",
      timestamp: "2026-03-26T10:00:00.000Z",
      checks: {
        database: {
          available: true,
          message: "ok"
        },
        redis: {
          available: true,
          message: "PONG"
        }
      }
    }),
    version: () => ({
      version: "0.1.0"
    }),
    metrics: async () => ({
      timestamp: "2026-03-26T10:00:00.000Z",
      queues: {
        depth: {
          publishDispatch: 0,
          publishRetry: 0,
          mediaIngest: 0,
          tokenRefresh: 0
        }
      }
    })
  } as never);

  assert.equal(controller.health().status, "ok");
  assert.equal((await controller.ready()).status, "ready");
  assert.equal(controller.version().version, "0.1.0");
  assert.equal((await controller.metrics()).queues.depth.publishDispatch, 0);
});

test("connections service normalizes supported platforms and rejects unknown ones", () => {
  const service = new ConnectionsService({} as never, {} as never);

  assert.equal(service.parsePlatform("instagram"), "INSTAGRAM");
  assert.throws(() => service.parsePlatform("linkedin"));
});

test("facebook refresh syncs newly available page targets from Meta", async () => {
  const syncedProfiles: Array<{ create: { name: string; remoteId: string } }> = [];
  const storedTokens: Array<{ externalUserId: string }> = [];
  let defaultAssigned = false;

  const prisma = {
    connectedAccount: {
      findFirst: async () => ({
        id: "connection-1",
        workspaceId: "workspace-1",
        platform: Platform.FACEBOOK,
        remoteAccountId: "meta-user-1",
        tokenExpiresAt: new Date("2026-05-01T00:00:00.000Z")
      }),
      update: async () => ({
        id: "connection-1",
        profiles: [{ id: "profile-1", name: "Fresh Page" }]
      })
    },
    connectedPageOrProfile: {
      upsert: async (args: { create: { name: string; remoteId: string } }) => {
        syncedProfiles.push(args);
        return {};
      },
      findFirst: async (args: { where?: { isDefault?: boolean } }) => {
        if (args.where?.isDefault) {
          return null;
        }
        return { id: "profile-1" };
      },
      update: async () => {
        defaultAssigned = true;
        return {};
      }
    }
  };

  const service = new ConnectionsService(
    prisma as never,
    {
      resolveWorkspaceIdForUser: async () => "workspace-1"
    } as never
  );

  (service as any).getPrimaryTokenPayload = async () => ({
    payload: {
      accessToken: "user-token"
    }
  });
  (service as any).fetchJson = async (url: string) => {
    assert.match(url, /me\/accounts/);
    return {
      data: [
        {
          id: "page-1",
          name: "Fresh Page",
          access_token: "page-token",
          tasks: ["CREATE_CONTENT"]
        }
      ]
    };
  };
  (service as any).upsertCredentialSecret = async (input: { externalUserId: string }) => {
    storedTokens.push(input);
  };

  const refreshed = await service.refresh("user-1", "connection-1");

  assert.equal(syncedProfiles.length, 1);
  assert.equal(syncedProfiles[0]?.create.name, "Fresh Page");
  assert.equal(syncedProfiles[0]?.create.remoteId, "page-1");
  assert.equal(storedTokens[0]?.externalUserId, "page-1");
  assert.equal(defaultAssigned, true);
  assert.equal((refreshed as { id: string }).id, "connection-1");
});
