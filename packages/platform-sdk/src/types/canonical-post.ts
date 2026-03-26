import type { PublishMode } from "./platform.js";

export interface CanonicalPostModel {
  title?: string | null;
  description?: string | null;
  caption?: string | null;
  hashtags: string[];
  mentions: string[];
  firstComment?: string | null;
  privacyLevel?: string | null;
  disableComments?: boolean | null;
  brandedContent?: boolean | null;
  brandedOrganic?: boolean | null;
  coverMediaReference?: string | null;
  thumbnailReference?: string | null;
  scheduledAt?: string | null;
  timezone?: string | null;
  publishMode: PublishMode;
  locationName?: string | null;
  altText?: string | null;
  platformSpecificJson?: Record<string, unknown>;
}
