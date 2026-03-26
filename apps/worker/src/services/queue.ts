import { Queue } from "bullmq";
import { redis } from "../queues/connection";
import { QUEUES } from "../queues/queue-names";

export const publishRetryQueue = new Queue(QUEUES.PUBLISH_RETRY, {
  connection: redis
});

export const publishDispatchQueue = new Queue(QUEUES.PUBLISH_DISPATCH, {
  connection: redis
});

export const tokenRefreshQueue = new Queue(QUEUES.TOKEN_REFRESH, {
  connection: redis
});
