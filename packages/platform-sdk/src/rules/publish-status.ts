export type SharedDraftStatus =
  | "DRAFT"
  | "READY"
  | "SCHEDULED"
  | "PARTIALLY_PUBLISHED"
  | "PUBLISHED"
  | "FAILED"
  | "ARCHIVED";

export type SharedPublishJobStatus =
  | "QUEUED"
  | "RUNNING"
  | "WAITING_REMOTE"
  | "SUCCEEDED"
  | "FAILED"
  | "CANCELLED"
  | "NEEDS_REAUTH";

export const resolveDraftStatusFromPublishStatuses = (
  statuses: SharedPublishJobStatus[]
): SharedDraftStatus | null => {
  if (statuses.length === 0) {
    return null;
  }

  if (statuses.every((status) => status === "SUCCEEDED")) {
    return "PUBLISHED";
  }

  if (statuses.some((status) => status === "FAILED" || status === "NEEDS_REAUTH")) {
    return statuses.some((status) => status === "SUCCEEDED") ? "PARTIALLY_PUBLISHED" : "FAILED";
  }

  if (statuses.some((status) => status === "QUEUED" || status === "RUNNING" || status === "WAITING_REMOTE")) {
    return "SCHEDULED";
  }

  return "READY";
};
