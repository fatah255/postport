export type Platform = "INSTAGRAM" | "FACEBOOK" | "TIKTOK";

export type PublishMode = "DIRECT" | "DRAFT_UPLOAD";

export type PlatformAccountType = "PROFESSIONAL" | "BUSINESS" | "CREATOR" | "PAGE";

export type PlatformAuditStatus = "AUDITED" | "UNAUDITED";

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
  accountType?: PlatformAccountType;
  isProfessionalAccount?: boolean;
  isBusinessAccount?: boolean;
  isPageTarget?: boolean;
  requiresPagePublishingAuthorization?: boolean;
  pagePublishingAuthorizationCompleted?: boolean;
  publishLimit24h?: number;
  requiresCreateContentTask?: boolean;
  hasCreateContentTask?: boolean;
  auditStatus?: PlatformAuditStatus;
  supportedPrivacyLevels?: string[];
  requiresDomainVerificationForPullFromUrl?: boolean;
  pullFromUrlDomainVerified?: boolean;
  linkedPageId?: string;
  linkedPageName?: string;
}

export interface PlatformTargetRef {
  connectedAccountId: string;
  remoteTargetId: string;
  platform: Platform;
}
