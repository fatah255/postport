import test from "node:test";
import assert from "node:assert/strict";
import {
  evaluateDraftPlatformRules,
  resolveDraftStatusFromPublishStatuses
} from "../dist/index.js";

test("Instagram warns when the 24-hour publish window is nearly exhausted", () => {
  const issues = evaluateDraftPlatformRules({
    platform: "INSTAGRAM",
    mediaType: "IMAGE",
    mediaCount: 1,
    publishMode: "DIRECT",
    publishedPostsIn24Hours: 48,
    capabilities: {
      supportsImage: true,
      supportsVideo: true,
      supportsCarousel: true,
      supportsStories: false,
      supportsDraftUpload: false,
      supportsDirectPost: true,
      supportsPrivacyLevel: false,
      supportsDisableComments: false,
      isProfessionalAccount: true,
      requiresPagePublishingAuthorization: true,
      pagePublishingAuthorizationCompleted: true,
      publishLimit24h: 50
    },
    canonicalPost: {
      disableComments: null,
      privacyLevel: null
    }
  });

  assert.equal(issues.some((issue) => issue.code === "publish_limit_near" && issue.severity === "warning"), true);
});

test("TikTok blocks public direct posting for unaudited clients", () => {
  const issues = evaluateDraftPlatformRules({
    platform: "TIKTOK",
    mediaType: "VIDEO",
    mediaCount: 1,
    publishMode: "DIRECT",
    capabilities: {
      supportsImage: true,
      supportsVideo: true,
      supportsCarousel: false,
      supportsStories: false,
      supportsDraftUpload: true,
      supportsDirectPost: true,
      supportsPrivacyLevel: true,
      supportsDisableComments: true,
      auditStatus: "UNAUDITED",
      supportedPrivacyLevels: ["PRIVATE"]
    },
    canonicalPost: {
      disableComments: false,
      privacyLevel: "PUBLIC"
    }
  });

  assert.equal(issues.some((issue) => issue.code === "unaudited_private_only" && issue.severity === "error"), true);
});

test("shared publish status resolver returns partially published when success and failure mix", () => {
  const result = resolveDraftStatusFromPublishStatuses(["SUCCEEDED", "FAILED"]);
  assert.equal(result, "PARTIALLY_PUBLISHED");
});
