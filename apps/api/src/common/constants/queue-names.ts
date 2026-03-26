export const QUEUES = {
  MEDIA_INGEST: "media_ingest",
  MEDIA_TRANSCODE: "media_transcode",
  THUMBNAIL_GENERATION: "thumbnail_generation",
  PUBLISH_DISPATCH: "publish_dispatch",
  PUBLISH_RETRY: "publish_retry",
  TOKEN_REFRESH: "token_refresh",
  HOUSEKEEPING: "housekeeping"
} as const;

export type QueueName = (typeof QUEUES)[keyof typeof QUEUES];
