import { PublishJobStatus } from "@prisma/client";

const REMOTE_POLL_STALE_AFTER_MS = 60_000;
const RECOVERY_BATCH_SIZE = 100;

export interface PublishRecoveryDependencies {
  prisma: {
    publishJob: {
      findMany: (args: unknown) => Promise<Array<{ id: string; priority: number; updatedAt?: Date }>>;
    };
  };
  queues: {
    dispatch: {
      add: (
        name: string,
        data: { publishJobId: string },
        options: {
          jobId: string;
          attempts: number;
          backoff: { type: "exponential"; delay: number };
          priority?: number;
          removeOnComplete: number;
          removeOnFail: boolean;
        }
      ) => Promise<unknown>;
    };
    retry: {
      add: (
        name: string,
        data: { publishJobId: string },
        options: {
          jobId: string;
          attempts: number;
          backoff: { type: "exponential"; delay: number };
          removeOnComplete: number;
          removeOnFail: boolean;
        }
      ) => Promise<unknown>;
    };
  };
}

export const recoverPublishJobs = async (deps: PublishRecoveryDependencies, now = new Date()) => {
  const dueQueuedJobs = await deps.prisma.publishJob.findMany({
    where: {
      status: PublishJobStatus.QUEUED,
      runAt: {
        lte: now
      }
    },
    select: {
      id: true,
      priority: true
    },
    orderBy: {
      runAt: "asc"
    },
    take: RECOVERY_BATCH_SIZE
  });

  for (const job of dueQueuedJobs) {
    await deps.queues.dispatch.add(
      "publish.dispatch",
      { publishJobId: job.id },
      {
        jobId: `publish_dispatch_${job.id}`,
        attempts: 5,
        backoff: {
          type: "exponential",
          delay: 30_000
        },
        priority: job.priority,
        removeOnComplete: 200,
        removeOnFail: false
      }
    );
  }

  const staleWaitingRemoteJobs = await deps.prisma.publishJob.findMany({
    where: {
      status: PublishJobStatus.WAITING_REMOTE,
      updatedAt: {
        lte: new Date(now.getTime() - REMOTE_POLL_STALE_AFTER_MS)
      }
    },
    select: {
      id: true,
      priority: true
    },
    orderBy: {
      updatedAt: "asc"
    },
    take: RECOVERY_BATCH_SIZE
  });

  for (const job of staleWaitingRemoteJobs) {
    await deps.queues.retry.add(
      "publish.remote-status",
      { publishJobId: job.id },
      {
        jobId: `publish_remote_${job.id}`,
        attempts: 5,
        backoff: {
          type: "exponential",
          delay: 30_000
        },
        removeOnComplete: 200,
        removeOnFail: false
      }
    );
  }

  return {
    queuedDispatchJobs: dueQueuedJobs.length,
    queuedRemotePolls: staleWaitingRemoteJobs.length
  };
};
