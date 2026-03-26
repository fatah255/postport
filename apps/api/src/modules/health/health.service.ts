import { Injectable, ServiceUnavailableException } from "@nestjs/common";
import { AccountStatus, MediaStatus, PublishJobStatus } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { QueueService } from "../queue/queue.service";
import { QUEUES } from "../../common/constants/queue-names";

@Injectable()
export class HealthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly queueService: QueueService
  ) {}

  health() {
    return {
      status: "ok",
      timestamp: new Date().toISOString(),
      service: "@postport/api"
    };
  }

  async ready() {
    const [database, redis] = await Promise.all([this.checkDatabase(), this.queueService.ping()]);
    const checks = {
      database,
      redis
    };

    if (!database.available || !redis.available) {
      throw new ServiceUnavailableException({
        status: "not_ready",
        timestamp: new Date().toISOString(),
        checks
      });
    }

    return {
      status: "ready",
      timestamp: new Date().toISOString(),
      checks
    };
  }

  version() {
    return {
      version: "0.1.0"
    };
  }

  async metrics() {
    const [publishDispatch, publishRetry, mediaIngest, tokenRefresh] = await Promise.all([
      this.queueService.getQueueMetrics(QUEUES.PUBLISH_DISPATCH),
      this.queueService.getQueueMetrics(QUEUES.PUBLISH_RETRY),
      this.queueService.getQueueMetrics(QUEUES.MEDIA_INGEST),
      this.queueService.getQueueMetrics(QUEUES.TOKEN_REFRESH)
    ]);

    const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const [succeededPublishes, failedPublishes, reauthPublishes, readyAssets, expiringConnections, expiredConnections] =
      await Promise.all([
        this.prisma.publishJob.count({
          where: {
            status: PublishJobStatus.SUCCEEDED,
            updatedAt: {
              gte: since
            }
          }
        }),
        this.prisma.publishJob.count({
          where: {
            status: PublishJobStatus.FAILED,
            updatedAt: {
              gte: since
            }
          }
        }),
        this.prisma.publishJob.count({
          where: {
            status: PublishJobStatus.NEEDS_REAUTH,
            updatedAt: {
              gte: since
            }
          }
        }),
        this.prisma.mediaAsset.findMany({
          where: {
            status: MediaStatus.READY,
            uploadedAt: {
              not: null,
              gte: since
            }
          },
          select: {
            uploadedAt: true,
            updatedAt: true
          }
        }),
        this.prisma.connectedAccount.count({
          where: {
            status: AccountStatus.ACTIVE,
            tokenExpiresAt: {
              gte: new Date(),
              lte: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
            }
          }
        }),
        this.prisma.connectedAccount.count({
          where: {
            status: {
              in: [AccountStatus.EXPIRED, AccountStatus.REVOKED, AccountStatus.PERMISSION_MISSING, AccountStatus.MISCONFIGURED]
            }
          }
        })
      ]);

    const completedPublishes = succeededPublishes + failedPublishes + reauthPublishes;
    const processingDurationsMs = readyAssets
      .map((asset) => {
        if (!asset.uploadedAt) {
          return null;
        }

        return asset.updatedAt.getTime() - asset.uploadedAt.getTime();
      })
      .filter((value): value is number => typeof value === "number" && value >= 0)
      .sort((left, right) => left - right);

    const averageProcessingMs =
      processingDurationsMs.length > 0
        ? Math.round(processingDurationsMs.reduce((total, current) => total + current, 0) / processingDurationsMs.length)
        : 0;
    const p95ProcessingMs =
      processingDurationsMs.length > 0
        ? processingDurationsMs[Math.min(processingDurationsMs.length - 1, Math.floor(processingDurationsMs.length * 0.95))]
        : 0;

    const queueDepth = {
      publishDispatch: publishDispatch.counts.waiting + publishDispatch.counts.active + publishDispatch.counts.delayed,
      publishRetry: publishRetry.counts.waiting + publishRetry.counts.active + publishRetry.counts.delayed,
      mediaIngest: mediaIngest.counts.waiting + mediaIngest.counts.active + mediaIngest.counts.delayed,
      tokenRefresh: tokenRefresh.counts.waiting + tokenRefresh.counts.active + tokenRefresh.counts.delayed
    };

    return {
      timestamp: new Date().toISOString(),
      queues: {
        depth: queueDepth,
        details: {
          publishDispatch,
          publishRetry,
          mediaIngest,
          tokenRefresh
        }
      },
      publishing: {
        completedLast24h: completedPublishes,
        succeededLast24h: succeededPublishes,
        failedLast24h: failedPublishes,
        needsReauthLast24h: reauthPublishes,
        successRateLast24h: completedPublishes > 0 ? Number((succeededPublishes / completedPublishes).toFixed(4)) : 0
      },
      tokens: {
        expiringWithin7Days: expiringConnections,
        nonHealthyConnections: expiredConnections
      },
      uploads: {
        processedAssetsLast24h: readyAssets.length,
        averageProcessingMs,
        p95ProcessingMs
      }
    };
  }

  private async checkDatabase() {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      return {
        available: true,
        message: "ok"
      };
    } catch (error) {
      return {
        available: false,
        message: error instanceof Error ? error.message : "Database check failed"
      };
    }
  }
}
