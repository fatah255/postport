import type { CanonicalPostModel } from "../types/canonical-post.js";
import type { CapabilityFlags, Platform, PublishMode } from "../types/platform.js";

export type CanonicalMediaType = "IMAGE" | "VIDEO" | "CAROUSEL";

export interface PlatformRuleIssue {
  platform: Platform;
  severity: "error" | "warning" | "info";
  code: string;
  message: string;
}

export interface DraftPlatformRuleInput {
  platform: Platform;
  mediaType: CanonicalMediaType;
  mediaCount: number;
  publishMode: PublishMode;
  capabilities?: CapabilityFlags | null;
  canonicalPost?: Pick<CanonicalPostModel, "privacyLevel" | "disableComments" | "platformSpecificJson"> | null;
  publishedPostsIn24Hours?: number;
}

const instagramLimit = 50;
const normalizeTikTokPrivacy = (value: string | null | undefined) => {
  if (value === "PRIVATE") {
    return "SELF_ONLY";
  }
  return value ?? null;
};

export const evaluateDraftPlatformRules = (input: DraftPlatformRuleInput): PlatformRuleIssue[] => {
  const issues: PlatformRuleIssue[] = [];
  const capabilities = input.capabilities;
  const publishLimit = capabilities?.publishLimit24h ?? instagramLimit;

  if (input.mediaType === "CAROUSEL" && capabilities?.supportsCarousel === false) {
    issues.push({
      platform: input.platform,
      severity: "error",
      code: "carousel_not_supported",
      message: "This platform target does not support carousel publishing."
    });
  }

  if (input.mediaType === "IMAGE" && capabilities?.supportsImage === false) {
    issues.push({
      platform: input.platform,
      severity: "error",
      code: "image_not_supported",
      message: "This platform target does not accept image publishing."
    });
  }

  if (input.mediaType === "VIDEO" && capabilities?.supportsVideo === false) {
    issues.push({
      platform: input.platform,
      severity: "error",
      code: "video_not_supported",
      message: "This platform target does not accept video publishing."
    });
  }

  if (input.canonicalPost?.disableComments && capabilities?.supportsDisableComments === false) {
    issues.push({
      platform: input.platform,
      severity: "error",
      code: "disable_comments_unsupported",
      message: "Disable comments is not officially supported for this platform target."
    });
  }

  if (input.canonicalPost?.privacyLevel && capabilities?.supportsPrivacyLevel === false) {
    issues.push({
      platform: input.platform,
      severity: "error",
      code: "privacy_level_unsupported",
      message: "Privacy selection is not officially supported for this platform target."
    });
  }

  if (
    input.canonicalPost?.privacyLevel &&
    capabilities?.supportedPrivacyLevels?.length &&
    !capabilities.supportedPrivacyLevels.includes(input.canonicalPost.privacyLevel)
  ) {
    issues.push({
      platform: input.platform,
      severity: "error",
      code: "privacy_level_invalid",
      message: `Privacy level ${input.canonicalPost.privacyLevel} is not available for this platform target.`
    });
  }

  if (
    capabilities?.requiresDomainVerificationForPullFromUrl &&
    hasPullFromUrlSource(input.canonicalPost?.platformSpecificJson) &&
    capabilities.pullFromUrlDomainVerified === false
  ) {
    issues.push({
      platform: input.platform,
      severity: "error",
      code: "pull_from_url_domain_unverified",
      message: "This platform target requires verified domain ownership for pull-from-URL media."
    });
  }

  switch (input.platform) {
    case "INSTAGRAM": {
      if (input.publishMode !== "DIRECT") {
        issues.push({
          platform: input.platform,
          severity: "error",
          code: "draft_upload_unsupported",
          message: "Instagram publishing is direct-only in this product."
        });
      }

      if (capabilities?.supportsDirectPost === false) {
        issues.push({
          platform: input.platform,
          severity: "error",
          code: "direct_post_unavailable",
          message: "Direct publishing is currently unavailable for this Instagram target."
        });
      }

      if (capabilities?.isProfessionalAccount === false) {
        issues.push({
          platform: input.platform,
          severity: "error",
          code: "professional_account_required",
          message: "Instagram publishing requires a professional account."
        });
      }

      if (
        capabilities?.requiresPagePublishingAuthorization &&
        capabilities.pagePublishingAuthorizationCompleted === false
      ) {
        issues.push({
          platform: input.platform,
          severity: "error",
          code: "page_publishing_authorization_required",
          message: "Publishing is blocked until Page Publishing Authorization is completed."
        });
      }

      const publishedPosts = input.publishedPostsIn24Hours ?? 0;
      if (publishedPosts >= publishLimit) {
        issues.push({
          platform: input.platform,
          severity: "error",
          code: "publish_limit_reached",
          message: `This Instagram target already reached the ${publishLimit} posts per 24-hour limit.`
        });
      } else if (publishedPosts >= publishLimit - 5) {
        issues.push({
          platform: input.platform,
          severity: "warning",
          code: "publish_limit_near",
          message: `This Instagram target is close to the ${publishLimit} posts per 24-hour limit.`
        });
      }

      break;
    }

    case "FACEBOOK": {
      if (input.publishMode !== "DIRECT") {
        issues.push({
          platform: input.platform,
          severity: "error",
          code: "draft_upload_unsupported",
          message: "Facebook Page publishing is direct-only in this product."
        });
      }

      if (capabilities?.isPageTarget === false) {
        issues.push({
          platform: input.platform,
          severity: "error",
          code: "page_target_required",
          message: "Facebook publishing is supported for Page targets only."
        });
      }

      if (capabilities?.requiresCreateContentTask && capabilities.hasCreateContentTask === false) {
        issues.push({
          platform: input.platform,
          severity: "error",
          code: "create_content_task_missing",
          message: "This Facebook Page target is missing the CREATE_CONTENT task."
        });
      }

      break;
    }

    case "TIKTOK": {
      if (input.publishMode === "DIRECT" && capabilities?.supportsDirectPost === false) {
        issues.push({
          platform: input.platform,
          severity: "error",
          code: "direct_post_unavailable",
          message: "Direct posting is currently unavailable for this TikTok target."
        });
      }

      if (input.publishMode === "DRAFT_UPLOAD" && capabilities?.supportsDraftUpload === false) {
        issues.push({
          platform: input.platform,
          severity: "error",
          code: "draft_upload_unavailable",
          message: "Upload as Draft is currently unavailable for this TikTok target."
        });
      }

      if (
        capabilities?.auditStatus === "UNAUDITED" &&
        input.publishMode === "DIRECT" &&
        normalizeTikTokPrivacy(input.canonicalPost?.privacyLevel) &&
        normalizeTikTokPrivacy(input.canonicalPost?.privacyLevel) !== "SELF_ONLY"
      ) {
        issues.push({
          platform: input.platform,
          severity: "error",
          code: "unaudited_private_only",
          message: "Unaudited TikTok clients are restricted to private direct posting."
        });
      }

      break;
    }
  }

  return issues;
};

export const getPlatformSupportNotes = (
  platform: Platform,
  capabilities?: CapabilityFlags | null
): string[] => {
  const notes: string[] = [];

  if (platform === "INSTAGRAM") {
    notes.push("Instagram publishing supports professional accounts only.");
    notes.push("Stories are not enabled in this product.");
    if (capabilities?.publishLimit24h) {
      notes.push(`Instagram has a ${capabilities.publishLimit24h} published posts per 24-hour moving window limit.`);
    }
  }

  if (platform === "FACEBOOK") {
    notes.push("Facebook publishing uses Page targets only, not personal profiles.");
    notes.push("Video and Reels publishing requires CREATE_CONTENT task eligibility.");
  }

  if (platform === "TIKTOK") {
    notes.push("TikTok supports Direct Post and Upload as Draft with target-specific availability.");
    if (capabilities?.auditStatus === "UNAUDITED") {
      notes.push("This TikTok target is marked unaudited, so direct posting may be SELF_ONLY-only.");
    }
    if (capabilities?.requiresDomainVerificationForPullFromUrl) {
      notes.push("Pull-from-URL posting requires verified domain ownership.");
    }
  }

  return notes;
};

const hasPullFromUrlSource = (value: unknown): boolean => {
  if (!value || typeof value !== "object") {
    return false;
  }

  const mediaSource = (value as { mediaSource?: unknown }).mediaSource;
  return mediaSource === "PULL_FROM_URL";
};
