import type { CanonicalPostModel } from "./canonical-post.js";
import type { PlatformTargetRef } from "./platform.js";

export type NormalizedErrorKind =
  | "transient"
  | "auth"
  | "permissions"
  | "validation"
  | "platform_limit"
  | "unsupported"
  | "media_processing";

export interface PublishContext {
  workspaceId: string;
  userId: string;
  draftId: string;
  jobId: string;
  attemptId: string;
  idempotencyKey: string;
}

export interface PublishRequest {
  target: PlatformTargetRef;
  canonicalPost: CanonicalPostModel;
  mediaAssetIds: string[];
  context: PublishContext;
}

export interface PublishResponse {
  remotePublishId: string;
  remoteUrl?: string | null;
  status: "WAITING_REMOTE" | "SUCCEEDED";
  raw: Record<string, unknown>;
}

export interface NormalizedError {
  kind: NormalizedErrorKind;
  code: string;
  message: string;
  retryable: boolean;
  raw?: Record<string, unknown>;
}

export interface PollStatusResponse {
  status: "WAITING_REMOTE" | "SUCCEEDED" | "FAILED";
  remoteUrl?: string | null;
  raw: Record<string, unknown>;
}
