export type Platform = "INSTAGRAM" | "FACEBOOK" | "TIKTOK";

export interface CapabilityFlags {
  supportsImage: boolean;
  supportsVideo: boolean;
  supportsCarousel: boolean;
  supportsStories: boolean;
  supportsDraftUpload: boolean;
  supportsDirectPost: boolean;
  supportsPrivacyLevel: boolean;
  supportsDisableComments: boolean;
  supportsReels?: boolean;
  accountType?: "PROFESSIONAL" | "BUSINESS" | "CREATOR" | "PAGE";
  isProfessionalAccount?: boolean;
  isBusinessAccount?: boolean;
  isPageTarget?: boolean;
  requiresPagePublishingAuthorization?: boolean;
  pagePublishingAuthorizationCompleted?: boolean;
  publishLimit24h?: number;
  requiresCreateContentTask?: boolean;
  hasCreateContentTask?: boolean;
  auditStatus?: "AUDITED" | "UNAUDITED";
  supportedPrivacyLevels?: string[];
  requiresDomainVerificationForPullFromUrl?: boolean;
  pullFromUrlDomainVerified?: boolean;
}

export function getPlatformSupportNotes(platform: Platform, capabilities?: CapabilityFlags | null) {
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
}
