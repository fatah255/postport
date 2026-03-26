import test from "node:test";
import assert from "node:assert/strict";
import { getPlatformSupportNotes } from "../lib/platform-support";

test("platform support notes include Instagram publishing limits when provided", () => {
  const notes = getPlatformSupportNotes("INSTAGRAM", {
    supportsImage: true,
    supportsVideo: true,
    supportsCarousel: true,
    supportsStories: false,
    supportsDraftUpload: false,
    supportsDirectPost: true,
    supportsPrivacyLevel: false,
    supportsDisableComments: false,
    publishLimit24h: 50
  });

  assert.ok(notes.some((note) => note.includes("professional accounts only")));
  assert.ok(notes.some((note) => note.includes("50 published posts per 24-hour moving window limit")));
});

test("platform support notes surface TikTok unaudited and domain verification warnings", () => {
  const notes = getPlatformSupportNotes("TIKTOK", {
    supportsImage: true,
    supportsVideo: true,
    supportsCarousel: false,
    supportsStories: false,
    supportsDraftUpload: true,
    supportsDirectPost: true,
    supportsPrivacyLevel: true,
    supportsDisableComments: true,
    auditStatus: "UNAUDITED",
    requiresDomainVerificationForPullFromUrl: true
  });

  assert.ok(notes.some((note) => note.includes("Direct Post and Upload as Draft")));
  assert.ok(notes.some((note) => note.includes("unaudited")));
  assert.ok(notes.some((note) => note.includes("verified domain ownership")));
});

test("platform support notes describe Facebook Page-only publishing", () => {
  const notes = getPlatformSupportNotes("FACEBOOK", {
    supportsImage: true,
    supportsVideo: true,
    supportsCarousel: false,
    supportsStories: false,
    supportsDraftUpload: false,
    supportsDirectPost: true,
    supportsPrivacyLevel: false,
    supportsDisableComments: false
  });

  assert.ok(notes.some((note) => note.includes("Page targets only")));
  assert.ok(notes.some((note) => note.includes("CREATE_CONTENT")));
});
