import type { OnModuleDestroy } from "@nestjs/common";
import { Injectable, Logger } from "@nestjs/common";
import { Queue } from "bullmq";
import IORedis from "ioredis";
import { env } from "../../config/env";
import { QUEUES, type QueueName } from "../../common/constants/queue-names";

interface QueueJobData {
  [key: string]: unknown;
}

@Injectable()
export class QueueService implements OnModuleDestroy {
  private readonly logger = new Logger(QueueService.name);
  private readonly connection: IORedis;
  private readonly queues: Partial<Record<QueueName, Queue>> = {};
  private queueUnavailable = false;
  private queueUnavailableReason: string | null = null;

  constructor() {
    this.connection = new IORedis(env.REDIS_URL, { maxRetriesPerRequest: null });
    this.connection.on("error", (error) => {
      this.queueUnavailable = true;
      this.queueUnavailableReason = error.message;
      this.logger.warn(`Redis queue connection issue: ${error.message}`);
    });
    this.connection.on("ready", () => {
      if (this.queueUnavailable) {
        this.logger.log("Redis queue connection recovered.");
      }
      this.queueUnavailable = false;
      this.queueUnavailableReason = null;
    });
  }

  async enqueue<T extends QueueJobData>(
    queueName: QueueName,
    jobName: string,
    data: T,
    options?: {
      delayMs?: number;
      jobId?: string;
      attempts?: number;
      priority?: number;
      removeOnComplete?: number;
    }
  ): Promise<void> {
    if (this.queueUnavailable) {
      this.logger.warn(
        `Queue enqueue skipped for ${queueName} (${jobName}) because Redis is unavailable: ${
          this.queueUnavailableReason ?? "unknown reason"
        }`
      );
      return;
    }

    const queue = this.getQueue(queueName);
    try {
      await queue.add(jobName, data, {
        delay: options?.delayMs ?? 0,
        jobId: options?.jobId,
        attempts: options?.attempts ?? 5,
        backoff: {
          type: "exponential",
          delay: 30_000
        },
        priority: options?.priority,
        removeOnComplete: options?.removeOnComplete ?? 200,
        removeOnFail: false
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown Redis queue error";
      this.queueUnavailable = true;
      this.queueUnavailableReason = message;
      this.logger.warn(`Queue enqueue failed for ${queueName} (${jobName}): ${message}`);
    }
  }

  getQueue(queueName: QueueName): Queue {
    const existing = this.queues[queueName];
    if (existing) {
      return existing;
    }

    const queue = new Queue(queueName, {
      connection: this.connection
    });
    this.queues[queueName] = queue;
    return queue;
  }

  async onModuleDestroy() {
    await Promise.all(Object.values(this.queues).map(async (queue) => queue?.close()));
    try {
      await this.connection.quit();
    } catch {
      await this.connection.disconnect();
    }
  }

  publishDispatchQueue() {
    return this.getQueue(QUEUES.PUBLISH_DISPATCH);
  }

  publishRetryQueue() {
    return this.getQueue(QUEUES.PUBLISH_RETRY);
  }

  mediaIngestQueue() {
    return this.getQueue(QUEUES.MEDIA_INGEST);
  }

  async ping() {
    try {
      const response = await this.connection.ping();
      return {
        available: response === "PONG",
        message: response
      };
    } catch (error) {
      return {
        available: false,
        message: error instanceof Error ? error.message : "Redis ping failed"
      };
    }
  }

  async getQueueMetrics(queueName: QueueName) {
    if (this.queueUnavailable) {
      return {
        available: false,
        counts: {
          waiting: 0,
          active: 0,
          delayed: 0,
          failed: 0
        },
        reason: this.queueUnavailableReason
      };
    }

    try {
      const counts = await this.getQueue(queueName).getJobCounts("waiting", "active", "delayed", "failed");
      return {
        available: true,
        counts,
        reason: null
      };
    } catch (error) {
      return {
        available: false,
        counts: {
          waiting: 0,
          active: 0,
          delayed: 0,
          failed: 0
        },
        reason: error instanceof Error ? error.message : "Unable to fetch queue metrics"
      };
    }
  }
}
