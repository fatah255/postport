import type { CapabilityFlags, PlatformTargetRef } from "../types/platform.js";
import type {
  NormalizedError,
  PollStatusResponse,
  PublishRequest,
  PublishResponse
} from "../types/publish.js";

export interface ValidateConnectionResult {
  healthy: boolean;
  reasons: string[];
  capabilities: CapabilityFlags;
}

export interface ValidateMediaResult {
  valid: boolean;
  reasons: string[];
}

export interface PlatformPublisherAdapter {
  readonly platform: PlatformTargetRef["platform"];
  validateConnection(target: PlatformTargetRef): Promise<ValidateConnectionResult>;
  validateMedia(request: PublishRequest): Promise<ValidateMediaResult>;
  mapDraftToPayload(request: PublishRequest): Promise<Record<string, unknown>>;
  createRemoteContainerIfNeeded(request: PublishRequest): Promise<Record<string, unknown> | null>;
  uploadOrReferenceMedia(request: PublishRequest): Promise<Record<string, unknown>>;
  submitPublish(request: PublishRequest): Promise<PublishResponse>;
  pollStatus(remotePublishId: string, target: PlatformTargetRef): Promise<PollStatusResponse>;
  normalizeError(error: unknown): NormalizedError;
  refreshRemoteMetadata(target: PlatformTargetRef): Promise<Record<string, unknown>>;
}
