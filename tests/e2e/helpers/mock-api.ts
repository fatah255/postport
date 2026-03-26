import { randomUUID } from "node:crypto";
import type { Page, Route } from "@playwright/test";

type Platform = "INSTAGRAM" | "FACEBOOK" | "TIKTOK";
type JobStatus = "QUEUED" | "RUNNING" | "WAITING_REMOTE" | "SUCCEEDED" | "FAILED" | "CANCELLED" | "NEEDS_REAUTH";

interface MockConnection {
  id: string;
  platform: Platform;
  displayName: string;
  status: string;
  tokenExpiresAt: string | null;
  profiles: Array<{
    id: string;
    name: string;
    username?: string | null;
    isEligible: boolean;
    capabilityFlags?: Record<string, unknown> | null;
    publishModeAvailable?: { direct?: boolean; draftUpload?: boolean } | null;
  }>;
  health?: Partial<{
    tokenValid: boolean;
    accountStatus: string;
    requiredPermissionsPresent: boolean;
    targetEligible: boolean;
    warnings: string[];
    notes: string[];
    lastError: string | null;
    lastSuccessfulPublish: string | null;
    checks: Array<{
      key: string;
      label: string;
      status: "pass" | "warn" | "fail";
      message: string;
    }>;
  }>;
}

interface MockMedia {
  id: string;
  originalFilename: string;
  mediaType: "IMAGE" | "VIDEO";
  mimeType: string;
  status: string;
  sizeBytes: number;
  width: number | null;
  height: number | null;
  durationMs: number | null;
  createdAt: string;
  usageCount: number;
  thumbnail: string | null;
}

interface MockDraft {
  id: string;
  title: string | null;
  caption: string | null;
  description: string | null;
  status: string;
  timezone: string | null;
  scheduledAt: string | null;
  updatedAt: string;
  mediaCount: number;
  platforms: Platform[];
}

interface MockPublishJob {
  id: string;
  draftId: string;
  platform: Platform;
  status: JobStatus;
  runAt: string;
  updatedAt: string;
  remotePublishId: string | null;
  remoteUrl: string | null;
  lastErrorKind: string | null;
  lastErrorMessage: string | null;
  attempts: Array<{
    id: string;
    attemptNumber: number;
    status: string;
    normalizedErrorKind: string | null;
    normalizedErrorMessage: string | null;
    startedAt: string;
    endedAt: string | null;
  }>;
  events: Array<{
    id: string;
    eventType: string;
    message: string | null;
    createdAt: string;
  }>;
}

export interface MockState {
  signedIn: boolean;
  user: {
    id: string;
    email: string;
    fullName: string;
    memberships: Array<{ role: string; workspace: { id: string; name: string; slug: string } }>;
  };
  connections: MockConnection[];
  media: MockMedia[];
  drafts: MockDraft[];
  publishJobs: MockPublishJob[];
  publishNowFinalStatus: JobStatus;
}

export async function installMockApi(page: Page) {
  const state: MockState = {
    signedIn: false,
    user: {
      id: "user-1",
      email: "admin@postport.local",
      fullName: "PostPort Admin",
      memberships: [
        {
          role: "OWNER",
          workspace: {
            id: "workspace-1",
            name: "PostPort Demo",
            slug: "postport-demo"
          }
        }
      ]
    },
    connections: [],
    media: [],
    drafts: [],
    publishJobs: [],
    publishNowFinalStatus: "SUCCEEDED"
  };

  await page.route("http://uploads.postport.local/**", async (route) => {
    await route.fulfill({
      status: 200,
      headers: {
        etag: `"mock-etag"`
      },
      body: ""
    });
  });

  await page.route("http://localhost:3001/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname;
    const method = request.method();
    const json = () => (request.postDataJSON?.() ?? {}) as Record<string, any>;

    if (path === "/auth/register" && method === "POST") {
      const body = json();
      state.signedIn = true;
      state.user.email = String(body.email ?? state.user.email);
      state.user.fullName = String(body.fullName ?? state.user.fullName);
      return fulfill(route, 200, {
        user: {
          id: state.user.id,
          email: state.user.email,
          fullName: state.user.fullName,
          locale: "EN"
        },
        workspace: state.user.memberships[0]?.workspace
      });
    }

    if (path === "/auth/login" && method === "POST") {
      state.signedIn = true;
      return fulfill(route, 200, {
        user: {
          id: state.user.id,
          email: state.user.email,
          fullName: state.user.fullName,
          locale: "EN"
        }
      });
    }

    if (path === "/auth/me" && method === "GET") {
      if (!state.signedIn) {
        return fulfill(route, 401, { message: "Unauthorized" });
      }
      return fulfill(route, 200, state.user);
    }

    if (path === "/connections" && method === "GET") {
      return fulfill(route, 200, { items: state.connections });
    }

    if (path.startsWith("/connections/") && path.endsWith("/start") && method === "POST") {
      const platform = path.split("/")[2]?.toUpperCase() as Platform;
      const connection = createConnection(platform);
      state.connections.push(connection);
      return fulfill(route, 200, {
        authUrl: "http://127.0.0.1:3000/en/connections",
        mode: "mock"
      });
    }

    if (/^\/connections\/[^/]+\/health$/.test(path) && method === "GET") {
      const connectionId = path.split("/")[2]!;
      const connection = state.connections.find((item) => item.id === connectionId);
      if (!connection) {
        return fulfill(route, 404, { message: "Connection not found" });
      }
      return fulfill(route, 200, buildConnectionHealth(connection));
    }

    if (path === "/media" && method === "GET") {
      const status = url.searchParams.get("status");
      const query = url.searchParams.get("query");
      const type = url.searchParams.get("type");
      let items = [...state.media];
      if (status) items = items.filter((item) => item.status === status);
      if (type) items = items.filter((item) => item.mediaType === type);
      if (query) items = items.filter((item) => item.originalFilename.toLowerCase().includes(query.toLowerCase()));
      return fulfill(route, 200, { items });
    }

    if (path === "/media/upload/init" && method === "POST") {
      const body = json();
      const duplicate = state.media.find((item) => item.originalFilename === body.fileName) ?? null;
      const asset = createMedia({
        originalFilename: String(body.fileName),
        mimeType: String(body.mimeType),
        sizeBytes: Number(body.sizeBytes),
        status: "UPLOADING"
      });
      state.media.unshift(asset);
      return fulfill(route, 200, {
        mediaAsset: { id: asset.id },
        upload: { uploadUrl: `http://uploads.postport.local/${asset.id}`, strategy: "single_part" },
        duplicateHint: duplicate
          ? {
              mediaAssetId: duplicate.id,
              originalFilename: duplicate.originalFilename,
              createdAt: duplicate.createdAt
            }
          : null
      });
    }

    if (path === "/media/upload/complete" && method === "POST") {
      const asset = state.media.find((item) => item.id === String(json().mediaAssetId));
      if (asset) {
        asset.status = "READY";
        asset.thumbnail = "https://placehold.co/640x360/png";
      }
      return fulfill(route, 200, { mediaAsset: asset, queued: true });
    }

    if (/^\/media\/[^/]+$/.test(path) && method === "GET") {
      const mediaId = path.split("/")[2]!;
      const asset = state.media.find((item) => item.id === mediaId);
      if (!asset) {
        return fulfill(route, 404, { message: "Media asset not found." });
      }
      return fulfill(route, 200, {
        ...asset,
        variants: [
          {
            id: `${asset.id}-variant`,
            variantKind: asset.mediaType === "VIDEO" ? "normalized" : "original",
            mimeType: asset.mimeType,
            publicUrl: asset.mediaType === "VIDEO" ? "https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.mp4" : "https://placehold.co/1280x720/png"
          }
        ],
        thumbnails: asset.thumbnail ? [{ id: `${asset.id}-thumb`, publicUrl: asset.thumbnail }] : [],
        ffprobeJson: { mock: true, mediaType: asset.mediaType }
      });
    }

    if (/^\/media\/[^/]+$/.test(path) && method === "DELETE") {
      const mediaId = path.split("/")[2]!;
      state.media = state.media.filter((item) => item.id !== mediaId);
      return fulfill(route, 200, { success: true });
    }

    if (path === "/media/bulk-delete" && method === "POST") {
      const ids = (json().mediaAssetIds ?? []) as string[];
      state.media = state.media.filter((item) => !ids.includes(item.id));
      return fulfill(route, 200, { deleted: ids.length, failed: [] });
    }

    if (/^\/media\/[^/]+\/reprocess$/.test(path) && method === "POST") {
      const mediaId = path.split("/")[2]!;
      const asset = state.media.find((item) => item.id === mediaId);
      if (asset) asset.status = "READY";
      return fulfill(route, 200, { mediaAsset: asset, queued: true });
    }

    if (path === "/drafts" && method === "GET") {
      return fulfill(route, 200, { items: state.drafts });
    }

    if (path === "/drafts" && method === "POST") {
      const body = json();
      const now = new Date().toISOString();
      const draft: MockDraft = {
        id: randomUUID(),
        title: body.title ?? null,
        caption: body.caption ?? null,
        description: body.description ?? null,
        status: body.scheduledAt ? "SCHEDULED" : "READY",
        timezone: body.timezone ?? "UTC",
        scheduledAt: body.scheduledAt ?? null,
        updatedAt: now,
        mediaCount: Array.isArray(body.mediaAssetIds) ? body.mediaAssetIds.length : 0,
        platforms: (body.platforms ?? []).map((item: Record<string, unknown>) => String(item.platform)) as Platform[]
      };
      state.drafts.unshift(draft);
      if (body.scheduledAt) {
        for (const platform of draft.platforms) {
          state.publishJobs.unshift(createJob({ draftId: draft.id, platform, status: "QUEUED", runAt: String(body.scheduledAt) }));
        }
      }
      return fulfill(route, 200, { id: draft.id });
    }

    if (/^\/drafts\/[^/]+\/publish-now$/.test(path) && method === "POST") {
      const draftId = path.split("/")[2]!;
      const draft = state.drafts.find((item) => item.id === draftId);
      if (!draft) return fulfill(route, 404, { message: "Draft not found" });
      for (const platform of draft.platforms) {
        state.publishJobs.unshift(createJob({ draftId, platform, status: state.publishNowFinalStatus }));
      }
      draft.status = state.publishNowFinalStatus === "SUCCEEDED" ? "PUBLISHED" : "READY";
      draft.updatedAt = new Date().toISOString();
      return fulfill(route, 200, { queued: draft.platforms.length, jobs: state.publishJobs.filter((job) => job.draftId === draftId) });
    }

    if (/^\/drafts\/[^/]+\/reschedule$/.test(path) && method === "POST") {
      const draftId = path.split("/")[2]!;
      const draft = state.drafts.find((item) => item.id === draftId);
      const body = json();
      if (draft) {
        draft.scheduledAt = String(body.scheduledAt);
        draft.updatedAt = new Date().toISOString();
        for (const job of state.publishJobs.filter((item) => item.draftId === draftId)) {
          job.runAt = String(body.scheduledAt);
          job.updatedAt = new Date().toISOString();
        }
      }
      return fulfill(route, 200, { rescheduledJobs: 1, scheduledAt: body.scheduledAt });
    }

    if (path === "/publish/jobs" && method === "GET") {
      const status = url.searchParams.get("status");
      const platform = url.searchParams.get("platform");
      let jobs = [...state.publishJobs];
      if (status) jobs = jobs.filter((item) => item.status === status);
      if (platform) jobs = jobs.filter((item) => item.platform === platform);
      return fulfill(route, 200, {
        items: jobs.map((job) => ({ ...job, draft: draftSummary(state, job.draftId) }))
      });
    }

    if (/^\/publish\/jobs\/[^/]+$/.test(path) && method === "GET") {
      const jobId = path.split("/")[3]!;
      const job = state.publishJobs.find((item) => item.id === jobId);
      if (!job) return fulfill(route, 404, { message: "Publish job not found" });
      return fulfill(route, 200, { ...job, draft: draftSummary(state, job.draftId) });
    }

    if (path === "/publish/history" && method === "GET") {
      const status = url.searchParams.get("status");
      const platform = url.searchParams.get("platform");
      let jobs = state.publishJobs.filter((item) => ["SUCCEEDED", "FAILED", "NEEDS_REAUTH", "CANCELLED"].includes(item.status));
      if (status && status !== "ALL") jobs = jobs.filter((item) => item.status === status);
      if (platform && platform !== "ALL") jobs = jobs.filter((item) => item.platform === platform);
      return fulfill(route, 200, {
        items: jobs.map((job) => ({ ...job, draft: draftSummary(state, job.draftId) }))
      });
    }

    if (/^\/publish\/jobs\/[^/]+\/retry$/.test(path) && method === "POST") {
      const jobId = path.split("/")[3]!;
      const job = state.publishJobs.find((item) => item.id === jobId);
      if (job) {
        job.status = "SUCCEEDED";
        job.updatedAt = new Date().toISOString();
        job.lastErrorKind = null;
        job.lastErrorMessage = null;
        job.attempts.unshift({
          id: randomUUID(),
          attemptNumber: job.attempts.length + 1,
          status: "SUCCEEDED",
          normalizedErrorKind: null,
          normalizedErrorMessage: null,
          startedAt: new Date().toISOString(),
          endedAt: new Date().toISOString()
        });
      }
      return fulfill(route, 200, job ?? { message: "Job not found" });
    }

    if (/^\/publish\/jobs\/[^/]+\/cancel$/.test(path) && method === "POST") {
      const jobId = path.split("/")[3]!;
      const job = state.publishJobs.find((item) => item.id === jobId);
      if (job) {
        job.status = "CANCELLED";
        job.updatedAt = new Date().toISOString();
      }
      return fulfill(route, 200, job ?? { message: "Job not found" });
    }

    if (path === "/settings/profile" && method === "GET") {
      return fulfill(route, 200, { id: state.user.id, email: state.user.email, fullName: state.user.fullName, locale: "EN" });
    }

    if (path === "/settings/team" && method === "GET") {
      return fulfill(route, 200, {
        memberships: state.user.memberships.map((membership) => ({
          workspace: membership.workspace,
          role: membership.role,
          user: { id: state.user.id, email: state.user.email, fullName: state.user.fullName }
        }))
      });
    }

    if (path === "/settings/billing-placeholder" && method === "GET") {
      return fulfill(route, 200, { plan: "Starter", status: "not_implemented_in_v1" });
    }

    return fulfill(route, 404, { message: `No mock handler for ${method} ${path}` });
  });

  return { state };
}

export function createConnection(platform: Platform, overrides?: Partial<MockConnection>): MockConnection {
  const id = overrides?.id ?? randomUUID();
  return {
    id,
    platform,
    displayName: overrides?.displayName ?? `${platform} Demo`,
    status: overrides?.status ?? "ACTIVE",
    tokenExpiresAt: overrides?.tokenExpiresAt ?? new Date(Date.now() + 86_400_000).toISOString(),
    profiles: overrides?.profiles ?? [
      {
        id: `${id}-profile`,
        name: `${platform} Target`,
        username: `mock_${platform.toLowerCase()}`,
        isEligible: true,
        capabilityFlags: platformCapabilities(platform),
        publishModeAvailable: platform === "TIKTOK" ? { direct: true, draftUpload: true } : { direct: true, draftUpload: false }
      }
    ],
    health: overrides?.health
  };
}

export function createMedia(overrides?: Partial<MockMedia>): MockMedia {
  const mimeType = overrides?.mimeType ?? "image/png";
  const mediaType = overrides?.mediaType ?? (mimeType.startsWith("video/") ? "VIDEO" : "IMAGE");
  return {
    id: overrides?.id ?? randomUUID(),
    originalFilename: overrides?.originalFilename ?? "asset.png",
    mediaType,
    mimeType,
    status: overrides?.status ?? "READY",
    sizeBytes: overrides?.sizeBytes ?? 512_000,
    width: overrides?.width ?? 1280,
    height: overrides?.height ?? 720,
    durationMs: overrides?.durationMs ?? (mediaType === "VIDEO" ? 15000 : null),
    createdAt: overrides?.createdAt ?? new Date().toISOString(),
    usageCount: overrides?.usageCount ?? 0,
    thumbnail: overrides?.thumbnail ?? "https://placehold.co/640x360/png"
  };
}

export function createDraft(overrides?: Partial<MockDraft>): MockDraft {
  return {
    id: overrides?.id ?? randomUUID(),
    title: overrides?.title ?? "Launch draft",
    caption: overrides?.caption ?? "Caption",
    description: overrides?.description ?? null,
    status: overrides?.status ?? "READY",
    timezone: overrides?.timezone ?? "Europe/Paris",
    scheduledAt: overrides?.scheduledAt ?? null,
    updatedAt: overrides?.updatedAt ?? new Date().toISOString(),
    mediaCount: overrides?.mediaCount ?? 1,
    platforms: overrides?.platforms ?? ["INSTAGRAM"]
  };
}

export function createJob(input: { draftId: string; platform: Platform; status?: JobStatus; runAt?: string }): MockPublishJob {
  const status = input.status ?? "SUCCEEDED";
  const now = new Date().toISOString();
  return {
    id: randomUUID(),
    draftId: input.draftId,
    platform: input.platform,
    status,
    runAt: input.runAt ?? now,
    updatedAt: now,
    remotePublishId: status === "SUCCEEDED" ? `remote_${Math.floor(Math.random() * 1000)}` : null,
    remoteUrl: status === "SUCCEEDED" ? "https://example.com/post/123" : null,
    lastErrorKind: status === "FAILED" ? "transient" : status === "NEEDS_REAUTH" ? "auth" : null,
    lastErrorMessage:
      status === "FAILED" ? "Temporary provider failure." : status === "NEEDS_REAUTH" ? "Reconnect account." : null,
    attempts: [
      {
        id: randomUUID(),
        attemptNumber: 1,
        status,
        normalizedErrorKind: status === "FAILED" ? "transient" : status === "NEEDS_REAUTH" ? "auth" : null,
        normalizedErrorMessage:
          status === "FAILED" ? "Temporary provider failure." : status === "NEEDS_REAUTH" ? "Reconnect account." : null,
        startedAt: now,
        endedAt: now
      }
    ],
    events: [
      {
        id: randomUUID(),
        eventType: status === "SUCCEEDED" ? "JOB_COMPLETED" : "JOB_QUEUED",
        message: status === "SUCCEEDED" ? "Publish completed successfully." : "Job queued.",
        createdAt: now
      }
    ]
  };
}

function draftSummary(state: MockState, draftId: string) {
  const draft = state.drafts.find((item) => item.id === draftId);
  return {
    id: draft?.id ?? draftId,
    title: draft?.title ?? null,
    caption: draft?.caption ?? null
  };
}

function buildConnectionHealth(connection: MockConnection) {
  const defaults = {
    platform: connection.platform,
    accountLabel: connection.displayName,
    tokenValid: true,
    tokenExpiresAt: connection.tokenExpiresAt,
    accountStatus: connection.status,
    requiredPermissionsPresent: true,
    targetEligible: connection.profiles[0]?.isEligible ?? true,
    publishModeAvailable: connection.profiles[0]?.publishModeAvailable ?? { direct: true, draftUpload: false },
    domainVerificationReminder: connection.platform === "TIKTOK" ? "Required for URL pull mode" : null,
    lastSuccessfulPublish: null,
    lastError: null,
    publishedPostsInLast24Hours: 0,
    warnings: [] as string[],
    notes: [] as string[],
    checks: [
      { key: "token", label: "Token validity", status: "pass", message: "Access token is still valid." },
      { key: "target", label: "Target eligibility", status: connection.profiles[0]?.isEligible === false ? "fail" : "pass", message: connection.profiles[0]?.isEligible === false ? "Selected target is not eligible." : "Selected target is publish-eligible." }
    ]
  };
  return { ...defaults, ...(connection.health ?? {}) };
}

function platformCapabilities(platform: Platform) {
  if (platform === "INSTAGRAM") {
    return { supportsImage: true, supportsVideo: true, supportsCarousel: true, supportsDirectPost: true, isProfessionalAccount: true, publishLimit24h: 50 };
  }
  if (platform === "FACEBOOK") {
    return { supportsImage: true, supportsVideo: true, supportsDirectPost: true, isPageTarget: true, requiresCreateContentTask: true, hasCreateContentTask: true };
  }
  return {
    supportsImage: true,
    supportsVideo: true,
    supportsDirectPost: true,
    supportsDraftUpload: true,
    supportsPrivacyLevel: true,
    supportsDisableComments: true,
    auditStatus: "UNAUDITED",
    supportedPrivacyLevels: ["SELF_ONLY", "PUBLIC_TO_EVERYONE"]
  };
}

async function fulfill(route: Route, status: number, body: unknown) {
  await route.fulfill({
    status,
    contentType: "application/json",
    body: JSON.stringify(body)
  });
}
