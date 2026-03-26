import { Queue, Worker } from "bullmq";
import pino from "pino";
import { redis } from "./queues/connection";
import { QUEUES } from "./queues/queue-names";
import { prisma } from "./services/prisma";
import { processMediaIngest } from "./jobs/process-media-ingest";
import { processPublishJob } from "./jobs/process-publish-job";
import { enqueueDueTokenRefreshJobs, processTokenRefresh } from "./jobs/process-token-refresh";
import { runPublishRecoverySweep } from "./jobs/run-publish-recovery-sweep";
import { publishDispatchQueue, publishRetryQueue, tokenRefreshQueue } from "./services/queue";

const logger = pino({
  level: process.env.LOG_LEVEL ?? "info"
});

const queues = Object.values(QUEUES).map((name) => {
  return new Queue(name, {
    connection: redis
  });
});

const workers = [
  new Worker(
    QUEUES.MEDIA_INGEST,
    async (job) => {
      logger.info({ jobId: job.id, queue: QUEUES.MEDIA_INGEST }, "media ingest job started");
      const result = await processMediaIngest(job.data as { mediaAssetId: string });
      logger.info({ jobId: job.id, result }, "media ingest job completed");
    },
    { connection: redis }
  ),
  new Worker(
    QUEUES.PUBLISH_DISPATCH,
    async (job) => {
      logger.info({ jobId: job.id, queue: QUEUES.PUBLISH_DISPATCH }, "publish dispatch job started");
      const result = await processPublishJob(job.data as { publishJobId: string });
      logger.info({ jobId: job.id, result }, "publish dispatch job completed");
    },
    { connection: redis }
  ),
  new Worker(
    QUEUES.PUBLISH_RETRY,
    async (job) => {
      logger.info({ jobId: job.id, queue: QUEUES.PUBLISH_RETRY }, "publish retry job started");
      const result = await processPublishJob(job.data as { publishJobId: string });
      logger.info({ jobId: job.id, result }, "publish retry job completed");
    },
    { connection: redis }
  ),
  new Worker(
    QUEUES.TOKEN_REFRESH,
    async (job) => {
      logger.info({ jobId: job.id, queue: QUEUES.TOKEN_REFRESH }, "token refresh job started");
      const result = await processTokenRefresh(job.data as { connectedAccountId: string });
      logger.info({ jobId: job.id, result }, "token refresh job completed");
    },
    { connection: redis }
  )
];

for (const worker of workers) {
  worker.on("failed", (job, error) => {
    logger.error({ jobId: job?.id, error: error.message }, "worker job failed");
  });
}

logger.info({ queues: queues.map((queue) => queue.name) }, "postport worker started");

const tokenRefreshSweep = async () => {
  const result = await enqueueDueTokenRefreshJobs();
  logger.info({ queued: result.queued }, "token refresh sweep completed");
};

const publishRecoverySweep = async () => {
  const result = await runPublishRecoverySweep();
  logger.info(result, "publish recovery sweep completed");
};

void publishRecoverySweep();
void tokenRefreshSweep();
const publishRecoverySweepInterval = setInterval(() => {
  void publishRecoverySweep();
}, 60 * 1000);
const tokenRefreshSweepInterval = setInterval(() => {
  void tokenRefreshSweep();
}, 30 * 60 * 1000);

const shutdown = async () => {
  logger.info("closing worker");
  clearInterval(publishRecoverySweepInterval);
  clearInterval(tokenRefreshSweepInterval);
  await Promise.all(workers.map((worker) => worker.close()));
  await Promise.all(queues.map((queue) => queue.close()));
  await publishDispatchQueue.close();
  await publishRetryQueue.close();
  await tokenRefreshQueue.close();
  await prisma.$disconnect();
  await redis.quit();
  process.exit(0);
};

process.on("SIGINT", () => void shutdown());
process.on("SIGTERM", () => void shutdown());
