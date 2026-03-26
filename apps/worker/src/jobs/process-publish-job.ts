import { DraftStatus, PublishJobStatus, type Platform, type Prisma } from "@prisma/client";
import {
  type CanonicalPostModel,
  type PlatformTargetRef,
  type PublishRequest,
  resolveDraftStatusFromPublishStatuses
} from "@postport/platform-sdk";
import { publishAdapters, pollUntilRemoteSettles } from "../platforms";
import { PlatformPublishError } from "../platforms/errors";
import { prisma } from "../services/prisma";
import { publishRetryQueue } from "../services/queue";

interface PublishPayload {
  publishJobId: string;
}

const toInputJson = (value: unknown): Prisma.InputJsonValue => value as Prisma.InputJsonValue;

export const processPublishJob = async (payload: PublishPayload) => {
  const publishJob = await prisma.publishJob.findUnique({
    where: {
      id: payload.publishJobId
    },
    include: {
      draft: {
        include: {
          mediaSelections: {
            orderBy: {
              orderIndex: "asc"
            }
          },
          captionVariants: true
        }
      },
      platformTarget: {
        include: {
          connectedAccount: true,
          connectedPageOrProfile: true
        }
      }
    }
  });

  if (!publishJob) {
    return { skipped: true, reason: "publish_job_not_found" };
  }
  if (publishJob.status === PublishJobStatus.CANCELLED || publishJob.status === PublishJobStatus.SUCCEEDED) {
    return { skipped: true, reason: "publish_job_already_finalized", status: publishJob.status };
  }

  const adapter = publishAdapters[publishJob.platform];
  if (!adapter) {
    return { skipped: true, reason: "adapter_not_found", platform: publishJob.platform };
  }

  const attemptNumber = publishJob.attemptCount + 1;

  await prisma.publishJob.update({
    where: { id: publishJob.id },
    data: {
      status: PublishJobStatus.RUNNING,
      attemptCount: attemptNumber
    }
  });

  const attempt = await prisma.publishAttempt.create({
    data: {
      publishJobId: publishJob.id,
      attemptNumber,
      status: PublishJobStatus.RUNNING,
      startedAt: new Date()
    }
  });

  await prisma.publishEvent.create({
    data: {
      publishJobId: publishJob.id,
      publishAttemptId: attempt.id,
      eventType: "ATTEMPT_STARTED",
      message: `Attempt ${attemptNumber} started`
    }
  });

  try {
    const platformTargetRef: PlatformTargetRef = {
      platform: publishJob.platform,
      connectedAccountId: publishJob.platformTarget?.connectedAccountId ?? publishJob.id,
      remoteTargetId:
        publishJob.platformTarget?.connectedPageOrProfile?.remoteId ??
        publishJob.platformTarget?.connectedAccount?.remoteAccountId ??
        publishJob.id
    };
    const request: PublishRequest = {
      target: platformTargetRef,
      canonicalPost: buildCanonicalPost(publishJob),
      mediaAssetIds: publishJob.draft.mediaSelections.map((selection: { mediaAssetId: string }) => selection.mediaAssetId),
      context: {
        workspaceId: publishJob.workspaceId,
        userId: publishJob.draft.createdById,
        draftId: publishJob.draftId,
        jobId: publishJob.id,
        attemptId: attempt.id,
        idempotencyKey: publishJob.idempotencyKey
      }
    };

    const connectionValidation = await adapter.validateConnection(platformTargetRef);
    if (!connectionValidation.healthy) {
      throw new PlatformPublishError(
        connectionValidation.reasons.join(" "),
        "permissions",
        "connection_validation_failed",
        false
      );
    }

    const mediaValidation = await adapter.validateMedia(request);
    if (!mediaValidation.valid) {
      throw new PlatformPublishError(
        mediaValidation.reasons.join(" "),
        "validation",
        "media_validation_failed",
        false
      );
    }

    const submission =
      publishJob.remotePublishId && publishJob.status === PublishJobStatus.WAITING_REMOTE
        ? {
            remotePublishId: publishJob.remotePublishId,
            remoteUrl: publishJob.remoteUrl,
            status: "WAITING_REMOTE" as const,
            raw: {
              resumedRemotePoll: true
            }
          }
        : await adapter.submitPublish(request);

    let finalStatus: PublishJobStatus =
      submission.status === "SUCCEEDED" ? PublishJobStatus.SUCCEEDED : PublishJobStatus.WAITING_REMOTE;
    let finalRemoteUrl = submission.remoteUrl ?? publishJob.remoteUrl ?? null;
    let responsePayload: Record<string, unknown> = submission.raw;

    if (finalStatus === PublishJobStatus.WAITING_REMOTE) {
      const polled = await pollUntilRemoteSettles(adapter, submission.remotePublishId, platformTargetRef);
      responsePayload = polled.raw;
      if (polled.status === "SUCCEEDED") {
        finalStatus = PublishJobStatus.SUCCEEDED;
        finalRemoteUrl = polled.remoteUrl ?? finalRemoteUrl;
      } else if (polled.status === "FAILED") {
        finalStatus = PublishJobStatus.FAILED;
      } else {
        await scheduleRemotePollRetry(publishJob.id);
      }
    }

    await prisma.publishAttempt.update({
      where: {
        id: attempt.id
      },
      data: {
        status: finalStatus,
        endedAt: new Date(),
        requestPayload: toInputJson(request),
        responsePayload: toInputJson(responsePayload)
      }
    });

    await prisma.publishJob.update({
      where: {
        id: publishJob.id
      },
      data: {
        status: finalStatus,
        remotePublishId: submission.remotePublishId,
        remoteUrl: finalRemoteUrl,
        lastErrorKind: null,
        lastErrorCode: null,
        lastErrorMessage: null,
        needsReauthReason: null
      }
    });

    await prisma.publishEvent.create({
      data: {
        publishJobId: publishJob.id,
        publishAttemptId: attempt.id,
        eventType: finalStatus === PublishJobStatus.SUCCEEDED ? "JOB_SUCCEEDED" : "JOB_WAITING_REMOTE",
        message: finalStatus === PublishJobStatus.SUCCEEDED ? "Publish succeeded" : "Waiting for remote status"
      }
    });
  } catch (error) {
    const normalized = adapter.normalizeError(error);
    const nextStatus =
      normalized.kind === "auth" || normalized.kind === "permissions"
        ? PublishJobStatus.NEEDS_REAUTH
        : PublishJobStatus.FAILED;

    await prisma.publishAttempt.update({
      where: {
        id: attempt.id
      },
      data: {
        status: nextStatus,
        endedAt: new Date(),
        normalizedErrorKind: normalized.kind,
        normalizedErrorCode: normalized.code,
        normalizedErrorMessage: normalized.message,
        retryable: normalized.retryable,
        responsePayload: toInputJson(normalized.raw ?? {})
      }
    });

    await prisma.publishJob.update({
      where: { id: publishJob.id },
      data: {
        status: nextStatus,
        lastErrorKind: normalized.kind,
        lastErrorCode: normalized.code,
        lastErrorMessage: normalized.message,
        needsReauthReason:
          nextStatus === PublishJobStatus.NEEDS_REAUTH ? normalized.message : null
      }
    });

    await prisma.publishEvent.create({
      data: {
        publishJobId: publishJob.id,
        publishAttemptId: attempt.id,
        eventType: "JOB_FAILED",
        message: normalized.message,
        payload: toInputJson(normalized.raw ?? {})
      }
    });

    if (normalized.kind === "transient") {
      throw error;
    }
  }

  await syncDraftStatus(publishJob.draftId);
  return {
    publishJobId: publishJob.id
  };
};

const buildCanonicalPost = (publishJob: {
  draft: {
    title: string | null;
    description: string | null;
    caption: string | null;
    timezone: string | null;
    canonicalPostJson: unknown;
    captionVariants: Array<{
      platform: Platform;
      caption: string | null;
      description: string | null;
      hashtags: unknown;
      mentions: unknown;
    }>;
  };
  platform: Platform;
  platformTarget: {
    publishMode: "DIRECT" | "DRAFT_UPLOAD";
    platformSpecificJson: unknown;
  } | null;
  runAt: Date;
}): CanonicalPostModel => {
  const base = parseCanonicalPost(publishJob.draft.canonicalPostJson);
  const variant = publishJob.draft.captionVariants.find((item) => item.platform === publishJob.platform);
  const platformSpecificJson =
    publishJob.platformTarget?.platformSpecificJson && typeof publishJob.platformTarget.platformSpecificJson === "object"
      ? {
          ...(base.platformSpecificJson ?? {}),
          ...(publishJob.platformTarget.platformSpecificJson as Record<string, unknown>)
        }
      : base.platformSpecificJson;

  return {
    ...base,
    title: publishJob.draft.title ?? base.title ?? null,
    description: variant?.description ?? publishJob.draft.description ?? base.description ?? null,
    caption: variant?.caption ?? publishJob.draft.caption ?? base.caption ?? null,
    hashtags: readStringArray(variant?.hashtags) ?? base.hashtags,
    mentions: readStringArray(variant?.mentions) ?? base.mentions,
    publishMode: publishJob.platformTarget?.publishMode ?? base.publishMode ?? "DIRECT",
    scheduledAt: publishJob.runAt.toISOString(),
    timezone: publishJob.draft.timezone ?? base.timezone ?? null,
    platformSpecificJson
  };
};

const parseCanonicalPost = (value: unknown): CanonicalPostModel => {
  if (!value || typeof value !== "object") {
    return {
      hashtags: [],
      mentions: [],
      publishMode: "DIRECT"
    };
  }

  const input = value as Partial<CanonicalPostModel>;
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
    publishMode: input.publishMode ?? "DIRECT",
    locationName: input.locationName ?? null,
    altText: input.altText ?? null,
    platformSpecificJson:
      input.platformSpecificJson && typeof input.platformSpecificJson === "object"
        ? (input.platformSpecificJson as Record<string, unknown>)
        : undefined
  };
};

const readStringArray = (value: unknown) => {
  if (!Array.isArray(value)) {
    return undefined;
  }

  return value.filter((item): item is string => typeof item === "string");
};

const scheduleRemotePollRetry = async (publishJobId: string) => {
  await publishRetryQueue.add(
    "publish.remote-status",
    { publishJobId },
    {
      delay: 30_000,
      attempts: 5,
      backoff: {
        type: "exponential",
        delay: 30_000
      },
      jobId: `publish_remote_${publishJobId}`,
      removeOnComplete: 200,
      removeOnFail: false
    }
  );
};

const syncDraftStatus = async (draftId: string) => {
  const jobs = await prisma.publishJob.findMany({
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

  await prisma.draft.update({
    where: { id: draftId },
    data: {
      status: nextStatus
    }
  });
};
