import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { DraftStatus, Platform, Prisma, PublishJobStatus } from "@prisma/client";
import { resolveDraftStatusFromPublishStatuses } from "@postport/platform-sdk";
import { sha256 } from "@postport/utils";
import { PrismaService } from "../prisma/prisma.service";
import { QueueService } from "../queue/queue.service";
import { WorkspaceAccessService } from "../../common/services/workspace-access.service";
import { QUEUES } from "../../common/constants/queue-names";
import type { ListPublishJobsDto } from "./dto/list-publish-jobs.dto";

interface CreateJobsInput {
  draftId: string;
  workspaceId: string;
  runAt: Date;
  scheduleId?: string;
  platforms?: Platform[];
  priority?: number;
}

@Injectable()
export class PublishService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly queueService: QueueService,
    private readonly workspaceAccessService: WorkspaceAccessService
  ) {}

  async createJobs(input: CreateJobsInput) {
    const draft = await this.prisma.draft.findFirst({
      where: {
        id: input.draftId,
        workspaceId: input.workspaceId
      },
      include: {
        platformTargets: true,
        mediaSelections: true
      }
    });

    if (!draft) {
      throw new NotFoundException("Draft not found.");
    }

    const platforms = this.resolvePlatforms(draft, input.platforms);
    if (platforms.length === 0) {
      throw new BadRequestException("Draft has no selected platforms.");
    }
    if (draft.mediaSelections.length === 0) {
      throw new BadRequestException("Draft has no selected media.");
    }

    const createdJobs = [];
    for (const platform of platforms) {
      const platformTarget = draft.platformTargets.find((target) => target.platform === platform);
      const idempotencyKey = sha256(`${draft.id}:${platform}:${input.runAt.toISOString()}:${draft.updatedAt.toISOString()}`);
      const dedupeKey = sha256(`${draft.id}:${platform}:${input.runAt.toISOString()}`);

      const existingJob = await this.prisma.publishJob.findFirst({
        where: {
          draftId: draft.id,
          platform,
          dedupeKey,
          status: {
            in: [
              PublishJobStatus.QUEUED,
              PublishJobStatus.RUNNING,
              PublishJobStatus.WAITING_REMOTE,
              PublishJobStatus.SUCCEEDED
            ]
          }
        },
        orderBy: {
          createdAt: "desc"
        }
      });

      if (existingJob) {
        createdJobs.push(existingJob);
        continue;
      }

      let job;
      try {
        job = await this.prisma.publishJob.create({
          data: {
            workspaceId: draft.workspaceId,
            draftId: draft.id,
            scheduleId: input.scheduleId ?? null,
            platformTargetId: platformTarget?.id ?? null,
            platform,
            status: PublishJobStatus.QUEUED,
            priority: input.priority ?? 100,
            runAt: input.runAt,
            dedupeKey,
            idempotencyKey
          }
        });
      } catch (error) {
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
          const duplicateJob = await this.prisma.publishJob.findFirst({
            where: {
              idempotencyKey
            }
          });

          if (duplicateJob) {
            createdJobs.push(duplicateJob);
            continue;
          }
        }

        throw error;
      }

      await this.prisma.publishEvent.create({
        data: {
          publishJobId: job.id,
          eventType: "JOB_QUEUED",
          message: `Job queued for ${platform}`
        }
      });

      const delayMs = Math.max(0, input.runAt.getTime() - Date.now());
      await this.queueService.enqueue(
        QUEUES.PUBLISH_DISPATCH,
        "publish.dispatch",
        { publishJobId: job.id },
        {
          delayMs,
          jobId: `publish_dispatch_${job.id}`,
          priority: job.priority,
          attempts: 5
        }
      );

      createdJobs.push(job);
    }

    return createdJobs;
  }

  async listJobs(userId: string, query: ListPublishJobsDto) {
    const workspaceId = await this.workspaceAccessService.resolveWorkspaceIdForUser(userId, query.workspaceId);

    const jobs = await this.prisma.publishJob.findMany({
      where: {
        workspaceId,
        status: query.status ? (query.status as PublishJobStatus) : undefined,
        platform: query.platform ? (query.platform as Platform) : undefined
      },
      include: {
        draft: {
          select: {
            id: true,
            title: true,
            caption: true
          }
        },
        attempts: {
          orderBy: {
            startedAt: "desc"
          },
          take: 3
        }
      },
      orderBy: {
        createdAt: "desc"
      }
    });

    return {
      items: jobs
    };
  }

  async getJob(userId: string, publishJobId: string, workspaceIdHint?: string) {
    const workspaceId = await this.workspaceAccessService.resolveWorkspaceIdForUser(userId, workspaceIdHint);
    const job = await this.prisma.publishJob.findFirst({
      where: {
        id: publishJobId,
        workspaceId
      },
      include: {
        draft: true,
        attempts: {
          orderBy: {
            startedAt: "desc"
          }
        },
        events: {
          orderBy: {
            createdAt: "desc"
          }
        }
      }
    });

    if (!job) {
      throw new NotFoundException("Publish job not found.");
    }
    return job;
  }

  async history(userId: string, query: ListPublishJobsDto) {
    const workspaceId = await this.workspaceAccessService.resolveWorkspaceIdForUser(userId, query.workspaceId);
    const jobs = await this.prisma.publishJob.findMany({
      where: {
        workspaceId,
        status: {
          in: [PublishJobStatus.SUCCEEDED, PublishJobStatus.FAILED, PublishJobStatus.NEEDS_REAUTH]
        },
        platform: query.platform ? (query.platform as Platform) : undefined
      },
      include: {
        attempts: {
          orderBy: { startedAt: "desc" },
          take: 5
        }
      },
      orderBy: { updatedAt: "desc" }
    });
    return { items: jobs };
  }

  async retryJob(userId: string, publishJobId: string, workspaceIdHint?: string) {
    const workspaceId = await this.workspaceAccessService.resolveWorkspaceIdForUser(userId, workspaceIdHint);
    const job = await this.prisma.publishJob.findFirst({
      where: {
        id: publishJobId,
        workspaceId
      }
    });
    if (!job) {
      throw new NotFoundException("Publish job not found.");
    }
    if (
      job.status !== PublishJobStatus.FAILED &&
      job.status !== PublishJobStatus.NEEDS_REAUTH &&
      job.status !== PublishJobStatus.CANCELLED
    ) {
      throw new BadRequestException("Only failed, cancelled, or reauth jobs can be retried.");
    }

    const updated = await this.prisma.publishJob.update({
      where: { id: job.id },
      data: {
        status: PublishJobStatus.QUEUED,
        runAt: new Date(),
        needsReauthReason: null
      }
    });

    await this.prisma.publishEvent.create({
      data: {
        publishJobId: updated.id,
        eventType: "JOB_RETRY_QUEUED",
        message: "Retry queued by user"
      }
    });

    await this.queueService.enqueue(
      QUEUES.PUBLISH_RETRY,
      "publish.retry",
      { publishJobId: updated.id },
      { jobId: `publish_retry_${updated.id}_${Date.now()}`, attempts: 3, delayMs: 0 }
    );

    return updated;
  }

  async cancelJob(userId: string, publishJobId: string, workspaceIdHint?: string) {
    const workspaceId = await this.workspaceAccessService.resolveWorkspaceIdForUser(userId, workspaceIdHint);
    const job = await this.prisma.publishJob.findFirst({
      where: {
        id: publishJobId,
        workspaceId
      }
    });
    if (!job) {
      throw new NotFoundException("Publish job not found.");
    }

    if (job.status === PublishJobStatus.SUCCEEDED || job.status === PublishJobStatus.FAILED) {
      throw new BadRequestException("Completed jobs cannot be cancelled.");
    }

    const updated = await this.prisma.publishJob.update({
      where: { id: job.id },
      data: {
        status: PublishJobStatus.CANCELLED
      }
    });

    await this.prisma.publishEvent.create({
      data: {
        publishJobId: updated.id,
        eventType: "JOB_CANCELLED",
        message: "Job cancelled by user"
      }
    });

    await this.syncDraftStatus(updated.draftId);
    return updated;
  }

  async syncDraftStatus(draftId: string) {
    const jobs = await this.prisma.publishJob.findMany({
      where: { draftId },
      select: {
        status: true
      }
    });
    if (jobs.length === 0) {
      return;
    }

    const statuses: PublishJobStatus[] = jobs.map((job: { status: PublishJobStatus }) => job.status);
    const nextStatus = resolveDraftStatusFromPublishStatuses(statuses) ?? DraftStatus.READY;

    await this.prisma.draft.update({
      where: { id: draftId },
      data: {
        status: nextStatus
      }
    });
  }

  private resolvePlatforms(
    draft: {
      platformTargets: Array<{ platform: Platform }>;
      canonicalPostJson: unknown;
    },
    explicitPlatforms?: Platform[]
  ): Platform[] {
    if (explicitPlatforms?.length) {
      return [...new Set(explicitPlatforms)];
    }
    if (draft.platformTargets.length) {
      return [...new Set(draft.platformTargets.map((target) => target.platform))];
    }
    if (draft.canonicalPostJson && typeof draft.canonicalPostJson === "object") {
      const value = (draft.canonicalPostJson as { platforms?: unknown }).platforms;
      if (Array.isArray(value)) {
        return value.filter((platform): platform is Platform => Object.values(Platform).includes(platform as Platform));
      }
    }
    return [];
  }
}
