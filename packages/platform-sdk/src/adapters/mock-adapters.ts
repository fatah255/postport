import type { PlatformPublisherAdapter } from "./platform-adapter.js";
import type { PlatformTargetRef } from "../types/platform.js";
import type { NormalizedError, PublishRequest, PublishResponse } from "../types/publish.js";

const defaultCapabilities = {
  supportsImage: true,
  supportsVideo: true,
  supportsCarousel: true,
  supportsStories: false,
  supportsDraftUpload: true,
  supportsDirectPost: true,
  supportsPrivacyLevel: true,
  supportsDisableComments: true
};

class BaseMockAdapter implements PlatformPublisherAdapter {
  constructor(public readonly platform: PlatformTargetRef["platform"]) {}

  async validateConnection() {
    return {
      healthy: true,
      reasons: [],
      capabilities: defaultCapabilities
    };
  }

  async validateMedia() {
    return {
      valid: true,
      reasons: []
    };
  }

  async mapDraftToPayload(request: PublishRequest): Promise<Record<string, unknown>> {
    return {
      platform: this.platform,
      draftId: request.context.draftId,
      publishMode: request.canonicalPost.publishMode
    };
  }

  async createRemoteContainerIfNeeded(): Promise<Record<string, unknown> | null> {
    return null;
  }

  async uploadOrReferenceMedia(request: PublishRequest): Promise<Record<string, unknown>> {
    return {
      mediaAssetIds: request.mediaAssetIds
    };
  }

  async submitPublish(request: PublishRequest): Promise<PublishResponse> {
    return {
      remotePublishId: `mock_${this.platform.toLowerCase()}_${request.context.jobId}`,
      status: "WAITING_REMOTE",
      raw: {
        accepted: true
      }
    };
  }

  async pollStatus(remotePublishId: string) {
    return {
      status: "SUCCEEDED" as const,
      remoteUrl: `https://example.com/post/${remotePublishId}`,
      raw: {
        status: "ok"
      }
    };
  }

  normalizeError(): NormalizedError {
    return {
      kind: "transient",
      code: "UNKNOWN",
      message: "Unexpected platform error",
      retryable: true
    };
  }

  async refreshRemoteMetadata() {
    return {
      refreshedAt: new Date().toISOString()
    };
  }
}

export class MockInstagramAdapter extends BaseMockAdapter {
  constructor() {
    super("INSTAGRAM");
  }
}

export class MockFacebookAdapter extends BaseMockAdapter {
  constructor() {
    super("FACEBOOK");
  }
}

export class MockTikTokAdapter extends BaseMockAdapter {
  constructor() {
    super("TIKTOK");
  }
}
