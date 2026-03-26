import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { AccountStatus, DraftStatus, MediaStatus, MediaType, Platform, PublishJobStatus, PublishMode } from "@prisma/client";
import {
  evaluateDraftPlatformRules,
  type CanonicalMediaType,
  type CanonicalPostModel,
  type CapabilityFlags
} from "@postport/platform-sdk";
import { PrismaService } from "../prisma/prisma.service";
import { WorkspaceAccessService } from "../../common/services/workspace-access.service";
import type { CreateDraftDto } from "./dto/create-draft.dto";
import type { ListDraftsDto } from "./dto/list-drafts.dto";
import type { UpdateDraftDto } from "./dto/update-draft.dto";
import type { ValidateDraftDto } from "./dto/validate-draft.dto";
import type { ScheduleDraftDto } from "./dto/schedule-draft.dto";
import type { CancelDraftDto } from "./dto/cancel-draft.dto";
import { PublishService } from "../publish/publish.service";

@Injectable()
export class DraftsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly workspaceAccessService: WorkspaceAccessService,
    private readonly publishService: PublishService
  ) {}

  async list(userId: string, query: ListDraftsDto) {
    const workspaceId = await this.workspaceAccessService.resolveWorkspaceIdForUser(userId, query.workspaceId);

    const drafts = await this.prisma.draft.findMany({
      where: {
        workspaceId,
        status: query.status ? (query.status as DraftStatus) : undefined,
        OR: query.query
          ? [
              {
                title: {
                  contains: query.query,
                  mode: "insensitive"
                }
              },
              {
                caption: {
                  contains: query.query,
                  mode: "insensitive"
                }
              }
            ]
          : undefined
      },
      include: {
        mediaSelections: {
          include: {
            mediaAsset: true
          }
        },
        platformTargets: true,
        publishJobs: {
          orderBy: {
            createdAt: "desc"
          },
          take: 10
        }
      },
      orderBy: {
        updatedAt: "desc"
      }
    });

    return {
      items: drafts.map((draft) =>
        this.serializeDraft({
          ...draft,
          mediaCount: draft.mediaSelections.length,
          platforms: this.platformsFromDraft(draft),
          latestJobs: draft.publishJobs
        })
      )
    };
  }

  async getById(userId: string, draftId: string, workspaceIdHint?: string) {
    const workspaceId = await this.workspaceAccessService.resolveWorkspaceIdForUser(userId, workspaceIdHint);
    const draft = await this.prisma.draft.findFirst({
      where: {
        id: draftId,
        workspaceId
      },
      include: {
        mediaSelections: {
          include: {
            mediaAsset: true
          },
          orderBy: {
            orderIndex: "asc"
          }
        },
        platformTargets: true,
        captionVariants: true,
        schedules: {
          orderBy: {
            createdAt: "desc"
          }
        },
        publishJobs: {
          orderBy: {
            createdAt: "desc"
          },
          include: {
            attempts: {
              orderBy: {
                startedAt: "desc"
              },
              take: 3
            }
          }
        }
      }
    });

    if (!draft) {
      throw new NotFoundException("Draft not found.");
    }

    return this.serializeDraft({
      ...draft,
      platforms: this.platformsFromDraft(draft)
    });
  }

  async create(userId: string, input: CreateDraftDto) {
    const workspaceId = await this.workspaceAccessService.resolveWorkspaceIdForUser(userId, input.workspaceId);
    await this.ensureMediaIdsBelongToWorkspace(input.mediaAssetIds, workspaceId);

    const platformSet = [...new Set(input.platforms.map((item) => item.platform))];
    if (platformSet.length === 0) {
      throw new BadRequestException("At least one platform is required.");
    }

    const draft = await this.prisma.draft.create({
      data: {
        workspaceId,
        createdById: userId,
        title: input.title,
        caption: input.caption,
        description: input.description,
        timezone: input.timezone ?? "UTC",
        scheduledAt: input.scheduledAt ? new Date(input.scheduledAt) : null,
        status: DraftStatus.DRAFT,
        canonicalPostJson: this.buildCanonicalPostJson({
          title: input.title,
          description: input.description,
          caption: input.caption,
          hashtags: input.hashtags,
          mentions: input.mentions,
          privacyLevel: input.privacyLevel,
          disableComments: input.disableComments,
          timezone: input.timezone ?? "UTC",
          scheduledAt: input.scheduledAt ?? null,
          publishMode: input.platforms[0]?.publishMode ?? PublishMode.DIRECT,
          platforms: platformSet
        })
      }
    });

    await this.replaceMediaSelections(draft.id, input.mediaAssetIds);
    await this.replacePlatformTargets(draft.id, workspaceId, input.platforms);
    await this.replaceCaptionVariants(
      draft.id,
      platformSet,
      input.caption,
      input.description,
      input.hashtags,
      input.mentions
    );

    await this.updateDraftReadiness(draft.id);

    if (input.scheduledAt) {
      await this.schedule(userId, draft.id, {
        workspaceId,
        scheduledAt: input.scheduledAt,
        timezone: input.timezone ?? "UTC"
      });
    }

    return this.getById(userId, draft.id, workspaceId);
  }

  async update(userId: string, draftId: string, input: UpdateDraftDto) {
    const workspaceId = await this.workspaceAccessService.resolveWorkspaceIdForUser(userId, input.workspaceId);
    const existing = await this.getById(userId, draftId, workspaceId);
    const existingCanonicalPost = this.parseCanonicalPost(existing.canonicalPostJson);

    const data: Record<string, unknown> = {
      title: input.title,
      caption: input.caption,
      description: input.description
    };

    if (input.timezone !== undefined) {
      data.timezone = input.timezone;
    }
    if (input.scheduledAt !== undefined) {
      data.scheduledAt = input.scheduledAt ? new Date(input.scheduledAt) : null;
    }

    const nextPlatforms = input.platforms
      ? [...new Set(input.platforms.map((item) => item.platform))]
      : this.platformsFromDraft(existing);

    if (input.platforms) {
      await this.replacePlatformTargets(draftId, workspaceId, input.platforms);
    }

    if (
      input.platforms ||
      input.caption !== undefined ||
      input.description !== undefined ||
      input.hashtags !== undefined ||
      input.mentions !== undefined
    ) {
      await this.replaceCaptionVariants(
        draftId,
        nextPlatforms,
        input.caption ?? existing.caption ?? undefined,
        input.description ?? existing.description ?? undefined,
        input.hashtags ?? existingCanonicalPost.hashtags,
        input.mentions ?? existingCanonicalPost.mentions
      );
    }

    if (input.mediaAssetIds) {
      await this.ensureMediaIdsBelongToWorkspace(input.mediaAssetIds, workspaceId);
      await this.replaceMediaSelections(draftId, input.mediaAssetIds);
    }

    data.canonicalPostJson = this.buildCanonicalPostJson({
      title: input.title !== undefined ? input.title : existing.title ?? undefined,
      description: input.description !== undefined ? input.description : existing.description ?? undefined,
      caption: input.caption !== undefined ? input.caption : existing.caption ?? undefined,
      hashtags: input.hashtags !== undefined ? input.hashtags : existingCanonicalPost.hashtags,
      mentions: input.mentions !== undefined ? input.mentions : existingCanonicalPost.mentions,
      privacyLevel:
        input.privacyLevel !== undefined ? input.privacyLevel : (existingCanonicalPost.privacyLevel ?? undefined),
      disableComments:
        input.disableComments !== undefined
          ? input.disableComments
          : (existingCanonicalPost.disableComments ?? undefined),
      timezone: input.timezone !== undefined ? input.timezone : existing.timezone ?? undefined,
      scheduledAt:
        input.scheduledAt !== undefined
          ? (input.scheduledAt ?? null)
          : existing.scheduledAt
            ? existing.scheduledAt.toISOString()
            : null,
      publishMode: input.platforms?.[0]?.publishMode ?? existingCanonicalPost.publishMode ?? PublishMode.DIRECT,
      platforms: nextPlatforms
    });

    await this.prisma.draft.update({
      where: { id: draftId },
      data
    });
    await this.updateDraftReadiness(draftId);
    return this.getById(userId, draftId, workspaceId);
  }

  async archive(userId: string, draftId: string, workspaceIdHint?: string) {
    const workspaceId = await this.workspaceAccessService.resolveWorkspaceIdForUser(userId, workspaceIdHint);
    await this.getById(userId, draftId, workspaceId);

    await this.prisma.draft.update({
      where: { id: draftId },
      data: {
        status: DraftStatus.ARCHIVED,
        archivedAt: new Date()
      }
    });
    return { success: true };
  }

  async duplicate(userId: string, draftId: string, workspaceIdHint?: string) {
    const workspaceId = await this.workspaceAccessService.resolveWorkspaceIdForUser(userId, workspaceIdHint);
    const source = await this.getById(userId, draftId, workspaceId);

    const duplicated = await this.prisma.draft.create({
      data: {
        workspaceId,
        createdById: userId,
        title: source.title ? `${source.title} (Copy)` : "Untitled Draft Copy",
        caption: source.caption,
        description: source.description,
        canonicalPostJson: source.canonicalPostJson ?? undefined,
        timezone: source.timezone,
        status: DraftStatus.DRAFT
      }
    });

    await this.replaceMediaSelections(
      duplicated.id,
      source.mediaSelections.map((item) => item.mediaAssetId)
    );

    if (source.platformTargets.length > 0) {
      await this.replacePlatformTargets(
        duplicated.id,
        workspaceId,
        source.platformTargets.map((target) => ({
          platform: target.platform,
          connectedAccountId: target.connectedAccountId,
          connectedPageOrProfileId: target.connectedPageOrProfileId ?? undefined,
          publishMode: target.publishMode,
          platformSpecificJson:
            target.platformSpecificJson && typeof target.platformSpecificJson === "object"
              ? (target.platformSpecificJson as Record<string, unknown>)
              : undefined
        }))
      );
    }

    await this.replaceCaptionVariants(
      duplicated.id,
      this.platformsFromDraft(source),
      source.caption ?? undefined,
      source.description ?? undefined,
      this.parseCanonicalPost(source.canonicalPostJson).hashtags,
      this.parseCanonicalPost(source.canonicalPostJson).mentions
    );

    await this.updateDraftReadiness(duplicated.id);
    return this.getById(userId, duplicated.id, workspaceId);
  }

  async validate(userId: string, draftId: string, input: ValidateDraftDto) {
    const workspaceId = await this.workspaceAccessService.resolveWorkspaceIdForUser(userId, input.workspaceId);
    const draft = await this.getById(userId, draftId, workspaceId);
    const errors: string[] = [];
    const warnings: string[] = [];
    const canonicalPost = this.parseCanonicalPost(draft.canonicalPostJson);
    const mediaType = this.resolveDraftMediaType(draft.mediaSelections.map((item) => item.mediaAsset.mediaType));

    if (draft.mediaSelections.length === 0) {
      errors.push("Select at least one media asset.");
    }

    const processingMedia = draft.mediaSelections.filter((item) => item.mediaAsset.status !== "READY");
    if (processingMedia.length > 0) {
      errors.push("All selected media assets must be READY before publish.");
    }

    const platforms = this.platformsFromDraft(draft);
    if (platforms.length === 0) {
      errors.push("Select at least one platform.");
    }

    if (draft.scheduledAt && draft.scheduledAt.getTime() < Date.now()) {
      errors.push("Scheduled time is in the past.");
    }

    const targetDetails = await this.prisma.draftPlatformTarget.findMany({
      where: {
        draftId: draft.id
      },
      include: {
        connectedAccount: true,
        connectedPageOrProfile: true
      }
    });

    for (const platform of platforms) {
      const target = targetDetails.find((item) => item.platform === platform);
      if (!target) {
        errors.push(`Select a connected ${this.platformLabel(platform)} target before publishing.`);
        continue;
      }

      if (target.connectedAccount.status !== AccountStatus.ACTIVE) {
        errors.push(`${this.platformLabel(platform)} account needs reconnection before publishing.`);
      }

      if (target.connectedPageOrProfile && !target.connectedPageOrProfile.isEligible) {
        errors.push(`${this.platformLabel(platform)} target is not currently eligible for publishing.`);
      }

      const capabilityFlags = this.extractCapabilityFlags(
        target.connectedPageOrProfile?.capabilityFlags ?? target.connectedAccount.scopeSummary
      );
      const publishedPostsIn24Hours =
        platform === Platform.INSTAGRAM
          ? await this.prisma.publishJob.count({
              where: {
                platform,
                status: PublishJobStatus.SUCCEEDED,
                updatedAt: {
                  gte: new Date(Date.now() - 24 * 60 * 60 * 1000)
                },
                platformTarget: {
                  is: {
                    connectedAccountId: target.connectedAccountId
                  }
                }
              }
            })
          : undefined;

      const issues = evaluateDraftPlatformRules({
        platform,
        mediaType,
        mediaCount: draft.mediaSelections.length,
        publishMode: target.publishMode,
        capabilities: capabilityFlags,
        canonicalPost,
        publishedPostsIn24Hours
      });

      for (const issue of issues) {
        if (issue.severity === "error") {
          errors.push(issue.message);
        } else if (issue.severity === "warning") {
          warnings.push(issue.message);
        }
      }
    }

    const duplicatePublishStatuses: PublishJobStatus[] = [
      PublishJobStatus.QUEUED,
      PublishJobStatus.RUNNING,
      PublishJobStatus.WAITING_REMOTE,
      PublishJobStatus.SUCCEEDED
    ];
    const duplicatePublish = draft.publishJobs.some((job) => duplicatePublishStatuses.includes(job.status));
    if (duplicatePublish) {
      warnings.push("This draft already has existing publish activity. Review history before publishing it again.");
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
      summary: {
        mediaCount: draft.mediaSelections.length,
        platforms,
        mediaType
      }
    };
  }

  async publishNow(userId: string, draftId: string, workspaceIdHint?: string) {
    const workspaceId = await this.workspaceAccessService.resolveWorkspaceIdForUser(userId, workspaceIdHint);
    const validation = await this.validate(userId, draftId, { workspaceId });
    if (!validation.valid) {
      throw new BadRequestException({
        message: "Draft validation failed.",
        errors: validation.errors
      });
    }

    await this.prisma.draft.update({
      where: { id: draftId },
      data: {
        status: DraftStatus.READY
      }
    });

    const jobs = await this.publishService.createJobs({
      draftId,
      workspaceId,
      runAt: new Date(),
      priority: 10
    });
    await this.publishService.syncDraftStatus(draftId);
    return {
      queued: jobs.length,
      jobs
    };
  }

  async schedule(userId: string, draftId: string, input: ScheduleDraftDto) {
    const workspaceId = await this.workspaceAccessService.resolveWorkspaceIdForUser(userId, input.workspaceId);
    const runAt = new Date(input.scheduledAt);
    if (Number.isNaN(runAt.getTime())) {
      throw new BadRequestException("Invalid scheduledAt date.");
    }
    if (runAt.getTime() < Date.now() - 30_000) {
      throw new BadRequestException("Cannot schedule drafts in the past.");
    }

    await this.getById(userId, draftId, workspaceId);
    const validation = await this.validate(userId, draftId, { workspaceId });
    if (!validation.valid) {
      throw new BadRequestException({
        message: "Draft validation failed.",
        errors: validation.errors
      });
    }

    const schedule = await this.prisma.publishSchedule.create({
      data: {
        draftId,
        scheduledAt: runAt,
        timezone: input.timezone,
        isImmediate: false
      }
    });

    const jobs = await this.publishService.createJobs({
      draftId,
      workspaceId,
      runAt,
      scheduleId: schedule.id
    });

    await this.prisma.draft.update({
      where: { id: draftId },
      data: {
        status: DraftStatus.SCHEDULED,
        scheduledAt: runAt,
        timezone: input.timezone
      }
    });

    return {
      schedule,
      jobs
    };
  }

  async cancel(userId: string, draftId: string, input: CancelDraftDto) {
    const workspaceId = await this.workspaceAccessService.resolveWorkspaceIdForUser(userId, input.workspaceId);
    await this.getById(userId, draftId, workspaceId);

    await this.prisma.publishSchedule.updateMany({
      where: {
        draftId,
        cancelledAt: null
      },
      data: {
        cancelledAt: new Date()
      }
    });

    const jobs = await this.prisma.publishJob.findMany({
      where: {
        draftId,
        status: {
          in: [PublishJobStatus.QUEUED, PublishJobStatus.RUNNING, PublishJobStatus.WAITING_REMOTE]
        }
      },
      select: { id: true }
    });

    for (const job of jobs) {
      await this.publishService.cancelJob(userId, job.id, workspaceId);
    }

    await this.prisma.draft.update({
      where: { id: draftId },
      data: {
        status: DraftStatus.READY
      }
    });

    return {
      cancelledJobs: jobs.length
    };
  }

  async reschedule(userId: string, draftId: string, input: ScheduleDraftDto) {
    const workspaceId = await this.workspaceAccessService.resolveWorkspaceIdForUser(userId, input.workspaceId);
    const runAt = new Date(input.scheduledAt);
    if (runAt.getTime() < Date.now() - 30_000) {
      throw new BadRequestException("Cannot reschedule to the past.");
    }

    await this.getById(userId, draftId, workspaceId);

    const latestSchedule = await this.prisma.publishSchedule.findFirst({
      where: {
        draftId,
        cancelledAt: null
      },
      orderBy: {
        createdAt: "desc"
      }
    });
    if (!latestSchedule) {
      throw new BadRequestException("No active schedule exists for this draft.");
    }

    await this.prisma.publishSchedule.update({
      where: { id: latestSchedule.id },
      data: {
        scheduledAt: runAt,
        timezone: input.timezone
      }
    });

    const jobs = await this.prisma.publishJob.findMany({
      where: {
        draftId,
        scheduleId: latestSchedule.id,
        status: PublishJobStatus.QUEUED
      }
    });

    for (const job of jobs) {
      await this.prisma.publishJob.update({
        where: { id: job.id },
        data: {
          runAt
        }
      });
    }

    await this.prisma.draft.update({
      where: { id: draftId },
      data: {
        scheduledAt: runAt,
        timezone: input.timezone,
        status: DraftStatus.SCHEDULED
      }
    });

    return {
      rescheduledJobs: jobs.length,
      scheduledAt: runAt.toISOString()
    };
  }

  private async ensureMediaIdsBelongToWorkspace(mediaAssetIds: string[], workspaceId: string) {
    if (mediaAssetIds.length === 0) {
      throw new BadRequestException("At least one media asset is required.");
    }
    const count = await this.prisma.mediaAsset.count({
      where: {
        id: {
          in: mediaAssetIds
        },
        workspaceId
      }
    });
    if (count !== mediaAssetIds.length) {
      throw new BadRequestException("One or more selected media assets are invalid for this workspace.");
    }
  }

  private async replaceMediaSelections(draftId: string, mediaAssetIds: string[]) {
    await this.prisma.draftMediaSelection.deleteMany({
      where: {
        draftId
      }
    });
    if (mediaAssetIds.length === 0) {
      return;
    }
    await this.prisma.draftMediaSelection.createMany({
      data: mediaAssetIds.map((mediaAssetId, index) => ({
        draftId,
        mediaAssetId,
        orderIndex: index,
        isCover: index === 0
      }))
    });
  }

  private async replacePlatformTargets(
    draftId: string,
    workspaceId: string,
    platforms: Array<{
      platform: Platform;
      connectedAccountId?: string;
      connectedPageOrProfileId?: string;
      publishMode?: PublishMode;
      platformSpecificJson?: Record<string, unknown>;
    }>
  ) {
    await this.prisma.draftPlatformTarget.deleteMany({
      where: {
        draftId
      }
    });

    for (const item of platforms) {
      if (!item.connectedAccountId) {
        continue;
      }

      const connectedAccount = await this.prisma.connectedAccount.findFirst({
        where: {
          id: item.connectedAccountId,
          workspaceId,
          platform: item.platform
        }
      });
      if (!connectedAccount) {
        continue;
      }

      const selectedProfile = item.connectedPageOrProfileId
        ? await this.prisma.connectedPageOrProfile.findFirst({
            where: {
              id: item.connectedPageOrProfileId,
              connectedAccountId: connectedAccount.id
            }
          })
        : await this.prisma.connectedPageOrProfile.findFirst({
            where: {
              connectedAccountId: connectedAccount.id,
              isDefault: true
            }
          });

      if (item.connectedPageOrProfileId && !selectedProfile) {
        throw new BadRequestException("Selected page/profile target does not belong to the chosen connection.");
      }

      await this.prisma.draftPlatformTarget.create({
        data: {
          draftId,
          platform: item.platform,
          connectedAccountId: connectedAccount.id,
          connectedPageOrProfileId: selectedProfile?.id ?? null,
          publishMode: item.publishMode ?? PublishMode.DIRECT,
          platformSpecificJson: (item.platformSpecificJson ?? undefined) as never
        }
      });
    }
  }

  private async replaceCaptionVariants(
    draftId: string,
    platforms: Platform[],
    caption?: string,
    description?: string,
    hashtags?: string[],
    mentions?: string[]
  ) {
    await this.prisma.draftCaptionVariant.deleteMany({
      where: { draftId }
    });
    if (platforms.length === 0) {
      return;
    }
    await this.prisma.draftCaptionVariant.createMany({
      data: platforms.map((platform) => ({
        draftId,
        platform,
        locale: "EN",
        caption: caption ?? null,
        description: description ?? null,
        hashtags: hashtags ?? [],
        mentions: mentions ?? []
      }))
    });
  }

  private async updateDraftReadiness(draftId: string) {
    const draft = await this.prisma.draft.findUnique({
      where: { id: draftId },
      include: {
        mediaSelections: true,
        platformTargets: true
      }
    });
    if (!draft) {
      return;
    }
    const platforms = this.platformsFromDraft(draft);
    const ready =
      draft.mediaSelections.length > 0 &&
      draft.mediaSelections.length ===
        (await this.prisma.mediaAsset.count({
          where: {
            id: {
              in: draft.mediaSelections.map((selection) => selection.mediaAssetId)
            },
            status: MediaStatus.READY
          }
        })) &&
      platforms.length > 0;
    await this.prisma.draft.update({
      where: { id: draftId },
      data: {
        status: ready ? DraftStatus.READY : DraftStatus.DRAFT
      }
    });
  }

  private platformsFromDraft(draft: { platformTargets: Array<{ platform: Platform }>; canonicalPostJson: unknown }) {
    if (draft.platformTargets.length > 0) {
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

  private buildCanonicalPostJson(input: {
    title?: string;
    description?: string;
    caption?: string;
    hashtags?: string[];
    mentions?: string[];
    privacyLevel?: string;
    disableComments?: boolean;
    timezone?: string;
    scheduledAt?: string | null;
    publishMode: PublishMode;
    platforms: Platform[];
  }) {
    return {
      title: input.title ?? null,
      description: input.description ?? null,
      caption: input.caption ?? null,
      hashtags: input.hashtags ?? [],
      mentions: input.mentions ?? [],
      privacyLevel: input.privacyLevel ?? null,
      disableComments: input.disableComments ?? null,
      scheduledAt: input.scheduledAt ?? null,
      timezone: input.timezone ?? null,
      publishMode: input.publishMode,
      platforms: input.platforms
    };
  }

  private parseCanonicalPost(value: unknown): CanonicalPostModel & { platforms?: Platform[] } {
    if (!value || typeof value !== "object") {
      return {
        hashtags: [],
        mentions: [],
        publishMode: PublishMode.DIRECT
      };
    }

    const input = value as Partial<CanonicalPostModel> & { platforms?: Platform[] };
    return {
      title: input.title ?? null,
      description: input.description ?? null,
      caption: input.caption ?? null,
      hashtags: Array.isArray(input.hashtags) ? input.hashtags.filter((item): item is string => typeof item === "string") : [],
      mentions: Array.isArray(input.mentions) ? input.mentions.filter((item): item is string => typeof item === "string") : [],
      firstComment: input.firstComment ?? null,
      privacyLevel: input.privacyLevel ?? null,
      disableComments: input.disableComments ?? null,
      brandedContent: input.brandedContent ?? null,
      brandedOrganic: input.brandedOrganic ?? null,
      coverMediaReference: input.coverMediaReference ?? null,
      thumbnailReference: input.thumbnailReference ?? null,
      scheduledAt: input.scheduledAt ?? null,
      timezone: input.timezone ?? null,
      publishMode: input.publishMode ?? PublishMode.DIRECT,
      locationName: input.locationName ?? null,
      altText: input.altText ?? null,
      platformSpecificJson:
        input.platformSpecificJson && typeof input.platformSpecificJson === "object"
          ? (input.platformSpecificJson as Record<string, unknown>)
          : undefined,
      platforms: input.platforms
    };
  }

  private extractCapabilityFlags(value: unknown): CapabilityFlags | null {
    if (!value || typeof value !== "object") {
      return null;
    }

    return value as CapabilityFlags;
  }

  private resolveDraftMediaType(mediaTypes: MediaType[]): CanonicalMediaType {
    if (mediaTypes.length > 1) {
      return "CAROUSEL";
    }
    if (mediaTypes[0] === MediaType.VIDEO) {
      return "VIDEO";
    }
    return "IMAGE";
  }

  private platformLabel(platform: Platform) {
    switch (platform) {
      case Platform.INSTAGRAM:
        return "Instagram";
      case Platform.FACEBOOK:
        return "Facebook";
      case Platform.TIKTOK:
        return "TikTok";
    }
  }

  private serializeDraft<T extends { mediaSelections: Array<{ mediaAsset: { sizeBytes: bigint } }> }>(draft: T) {
    return {
      ...draft,
      mediaSelections: draft.mediaSelections.map((selection) => ({
        ...selection,
        mediaAsset: {
          ...selection.mediaAsset,
          sizeBytes: Number(selection.mediaAsset.sizeBytes)
        }
      }))
    };
  }
}
