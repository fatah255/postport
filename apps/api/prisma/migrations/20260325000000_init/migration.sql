-- CreateEnum
CREATE TYPE "Platform" AS ENUM ('INSTAGRAM', 'FACEBOOK', 'TIKTOK');

-- CreateEnum
CREATE TYPE "MediaType" AS ENUM ('VIDEO', 'IMAGE', 'CAROUSEL');

-- CreateEnum
CREATE TYPE "DraftStatus" AS ENUM ('DRAFT', 'READY', 'SCHEDULED', 'PARTIALLY_PUBLISHED', 'PUBLISHED', 'FAILED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "MediaStatus" AS ENUM ('UPLOADING', 'PROCESSING', 'READY', 'FAILED', 'DELETED');

-- CreateEnum
CREATE TYPE "PublishJobStatus" AS ENUM ('QUEUED', 'RUNNING', 'WAITING_REMOTE', 'SUCCEEDED', 'FAILED', 'CANCELLED', 'NEEDS_REAUTH');

-- CreateEnum
CREATE TYPE "AccountStatus" AS ENUM ('ACTIVE', 'EXPIRED', 'REVOKED', 'PERMISSION_MISSING', 'MISCONFIGURED');

-- CreateEnum
CREATE TYPE "PublishMode" AS ENUM ('DIRECT', 'DRAFT_UPLOAD');

-- CreateEnum
CREATE TYPE "LocaleCode" AS ENUM ('EN', 'FR', 'AR');

-- CreateEnum
CREATE TYPE "MembershipRole" AS ENUM ('OWNER', 'ADMIN', 'MEMBER');

-- CreateTable
CREATE TABLE "User" (
    "id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "fullName" TEXT NOT NULL,
    "locale" "LocaleCode" NOT NULL DEFAULT 'EN',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Workspace" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "ownerId" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Workspace_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Membership" (
    "id" UUID NOT NULL,
    "workspaceId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "role" "MembershipRole" NOT NULL DEFAULT 'MEMBER',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Membership_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Session" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" UUID NOT NULL,
    "workspaceId" UUID NOT NULL,
    "userId" UUID,
    "action" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ConnectedAccount" (
    "id" UUID NOT NULL,
    "workspaceId" UUID NOT NULL,
    "platform" "Platform" NOT NULL,
    "status" "AccountStatus" NOT NULL DEFAULT 'ACTIVE',
    "displayName" TEXT NOT NULL,
    "remoteAccountId" TEXT NOT NULL,
    "scopeSummary" JSONB,
    "tokenExpiresAt" TIMESTAMP(3),
    "lastSuccessfulPublishAt" TIMESTAMP(3),
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ConnectedAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ConnectedPageOrProfile" (
    "id" UUID NOT NULL,
    "connectedAccountId" UUID NOT NULL,
    "remoteId" TEXT NOT NULL,
    "status" "AccountStatus" NOT NULL DEFAULT 'ACTIVE',
    "name" TEXT NOT NULL,
    "username" TEXT,
    "avatarUrl" TEXT,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "isEligible" BOOLEAN NOT NULL DEFAULT true,
    "capabilityFlags" JSONB,
    "publishModeAvailable" JSONB,
    "lastMetadataSyncAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ConnectedPageOrProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OAuthCredential" (
    "id" UUID NOT NULL,
    "connectedAccountId" UUID NOT NULL,
    "provider" "Platform" NOT NULL,
    "externalUserId" TEXT NOT NULL,
    "scopesJson" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OAuthCredential_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TokenSecret" (
    "id" UUID NOT NULL,
    "oauthCredentialId" UUID NOT NULL,
    "encryptedPayload" TEXT NOT NULL,
    "iv" TEXT NOT NULL,
    "tag" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3),
    "refreshExpiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TokenSecret_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MediaFolder" (
    "id" UUID NOT NULL,
    "workspaceId" UUID NOT NULL,
    "parentId" UUID,
    "name" TEXT NOT NULL,
    "path" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MediaFolder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MediaTag" (
    "id" UUID NOT NULL,
    "workspaceId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "color" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MediaTag_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MediaAsset" (
    "id" UUID NOT NULL,
    "workspaceId" UUID NOT NULL,
    "ownerId" UUID NOT NULL,
    "folderId" UUID,
    "mediaType" "MediaType" NOT NULL,
    "status" "MediaStatus" NOT NULL DEFAULT 'UPLOADING',
    "originalFilename" TEXT NOT NULL,
    "normalizedFilename" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "fileExtension" TEXT,
    "sizeBytes" BIGINT NOT NULL,
    "checksum" TEXT NOT NULL,
    "storageKey" TEXT NOT NULL,
    "sourceUploadId" TEXT,
    "width" INTEGER,
    "height" INTEGER,
    "durationMs" INTEGER,
    "codec" TEXT,
    "bitrate" INTEGER,
    "fps" DOUBLE PRECISION,
    "ffprobeJson" JSONB,
    "uploadedAt" TIMESTAMP(3),
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MediaAsset_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MediaAssetTag" (
    "mediaAssetId" UUID NOT NULL,
    "mediaTagId" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MediaAssetTag_pkey" PRIMARY KEY ("mediaAssetId","mediaTagId")
);

-- CreateTable
CREATE TABLE "MediaVariant" (
    "id" UUID NOT NULL,
    "mediaAssetId" UUID NOT NULL,
    "variantKind" TEXT NOT NULL,
    "storageKey" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" BIGINT NOT NULL,
    "width" INTEGER,
    "height" INTEGER,
    "durationMs" INTEGER,
    "codec" TEXT,
    "bitrate" INTEGER,
    "fps" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MediaVariant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MediaThumbnail" (
    "id" UUID NOT NULL,
    "mediaAssetId" UUID NOT NULL,
    "mediaVariantId" UUID,
    "storageKey" TEXT NOT NULL,
    "width" INTEGER NOT NULL,
    "height" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MediaThumbnail_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Draft" (
    "id" UUID NOT NULL,
    "workspaceId" UUID NOT NULL,
    "createdById" UUID NOT NULL,
    "status" "DraftStatus" NOT NULL DEFAULT 'DRAFT',
    "title" TEXT,
    "description" TEXT,
    "caption" TEXT,
    "canonicalPostJson" JSONB,
    "scheduledAt" TIMESTAMP(3),
    "timezone" TEXT,
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Draft_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DraftPlatformTarget" (
    "id" UUID NOT NULL,
    "draftId" UUID NOT NULL,
    "connectedAccountId" UUID NOT NULL,
    "connectedPageOrProfileId" UUID,
    "capabilitySnapshotId" UUID,
    "platform" "Platform" NOT NULL,
    "publishMode" "PublishMode" NOT NULL DEFAULT 'DIRECT',
    "platformSpecificJson" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DraftPlatformTarget_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DraftCaptionVariant" (
    "id" UUID NOT NULL,
    "draftId" UUID NOT NULL,
    "platform" "Platform" NOT NULL,
    "locale" "LocaleCode" NOT NULL DEFAULT 'EN',
    "caption" TEXT,
    "description" TEXT,
    "hashtags" JSONB,
    "mentions" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DraftCaptionVariant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DraftMediaSelection" (
    "id" UUID NOT NULL,
    "draftId" UUID NOT NULL,
    "mediaAssetId" UUID NOT NULL,
    "orderIndex" INTEGER NOT NULL DEFAULT 0,
    "isCover" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DraftMediaSelection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PublishSchedule" (
    "id" UUID NOT NULL,
    "draftId" UUID NOT NULL,
    "scheduledAt" TIMESTAMP(3) NOT NULL,
    "timezone" TEXT NOT NULL,
    "isImmediate" BOOLEAN NOT NULL DEFAULT false,
    "cancelledAt" TIMESTAMP(3),
    "lockedAt" TIMESTAMP(3),
    "lockOwner" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PublishSchedule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PublishJob" (
    "id" UUID NOT NULL,
    "workspaceId" UUID NOT NULL,
    "draftId" UUID NOT NULL,
    "scheduleId" UUID,
    "platformTargetId" UUID,
    "platform" "Platform" NOT NULL,
    "status" "PublishJobStatus" NOT NULL DEFAULT 'QUEUED',
    "priority" INTEGER NOT NULL DEFAULT 100,
    "runAt" TIMESTAMP(3) NOT NULL,
    "dedupeKey" TEXT,
    "idempotencyKey" TEXT NOT NULL,
    "remotePublishId" TEXT,
    "remoteUrl" TEXT,
    "needsReauthReason" TEXT,
    "lastErrorKind" TEXT,
    "lastErrorCode" TEXT,
    "lastErrorMessage" TEXT,
    "attemptCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PublishJob_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PublishAttempt" (
    "id" UUID NOT NULL,
    "publishJobId" UUID NOT NULL,
    "attemptNumber" INTEGER NOT NULL,
    "status" "PublishJobStatus" NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endedAt" TIMESTAMP(3),
    "requestPayload" JSONB,
    "responsePayload" JSONB,
    "normalizedErrorKind" TEXT,
    "normalizedErrorCode" TEXT,
    "normalizedErrorMessage" TEXT,
    "retryable" BOOLEAN,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PublishAttempt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PublishEvent" (
    "id" UUID NOT NULL,
    "publishJobId" UUID NOT NULL,
    "publishAttemptId" UUID,
    "eventType" TEXT NOT NULL,
    "message" TEXT,
    "payload" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PublishEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlatformCapabilitySnapshot" (
    "id" UUID NOT NULL,
    "platform" "Platform" NOT NULL,
    "connectedAccountId" UUID,
    "connectedPageOrProfileId" UUID,
    "targetExternalId" TEXT,
    "flagsJson" JSONB NOT NULL,
    "rawJson" JSONB,
    "capturedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PlatformCapabilitySnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WebhookDelivery" (
    "id" UUID NOT NULL,
    "workspaceId" UUID NOT NULL,
    "platform" "Platform" NOT NULL,
    "endpoint" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "status" TEXT NOT NULL,
    "attemptCount" INTEGER NOT NULL DEFAULT 0,
    "lastAttemptAt" TIMESTAMP(3),
    "nextAttemptAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WebhookDelivery_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Notification" (
    "id" UUID NOT NULL,
    "workspaceId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "metadata" JSONB,
    "readAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ApiKey" (
    "id" UUID NOT NULL,
    "workspaceId" UUID NOT NULL,
    "createdById" UUID NOT NULL,
    "label" TEXT NOT NULL,
    "keyHash" TEXT NOT NULL,
    "lastUsedAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ApiKey_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IdempotencyKey" (
    "id" UUID NOT NULL,
    "workspaceId" UUID NOT NULL,
    "key" TEXT NOT NULL,
    "requestHash" TEXT NOT NULL,
    "responseCode" INTEGER,
    "responseBody" JSONB,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "IdempotencyKey_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FeatureFlag" (
    "id" UUID NOT NULL,
    "workspaceId" UUID NOT NULL,
    "key" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "configJson" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FeatureFlag_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Workspace_slug_key" ON "Workspace"("slug");

-- CreateIndex
CREATE INDEX "Membership_userId_idx" ON "Membership"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "Membership_workspaceId_userId_key" ON "Membership"("workspaceId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "Session_tokenHash_key" ON "Session"("tokenHash");

-- CreateIndex
CREATE INDEX "Session_userId_expiresAt_idx" ON "Session"("userId", "expiresAt");

-- CreateIndex
CREATE INDEX "AuditLog_workspaceId_createdAt_idx" ON "AuditLog"("workspaceId", "createdAt");

-- CreateIndex
CREATE INDEX "ConnectedAccount_workspaceId_platform_status_idx" ON "ConnectedAccount"("workspaceId", "platform", "status");

-- CreateIndex
CREATE UNIQUE INDEX "ConnectedAccount_workspaceId_platform_remoteAccountId_key" ON "ConnectedAccount"("workspaceId", "platform", "remoteAccountId");

-- CreateIndex
CREATE UNIQUE INDEX "ConnectedPageOrProfile_connectedAccountId_remoteId_key" ON "ConnectedPageOrProfile"("connectedAccountId", "remoteId");

-- CreateIndex
CREATE UNIQUE INDEX "OAuthCredential_connectedAccountId_provider_externalUserId_key" ON "OAuthCredential"("connectedAccountId", "provider", "externalUserId");

-- CreateIndex
CREATE INDEX "TokenSecret_oauthCredentialId_expiresAt_idx" ON "TokenSecret"("oauthCredentialId", "expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "MediaFolder_workspaceId_path_key" ON "MediaFolder"("workspaceId", "path");

-- CreateIndex
CREATE UNIQUE INDEX "MediaTag_workspaceId_name_key" ON "MediaTag"("workspaceId", "name");

-- CreateIndex
CREATE INDEX "MediaAsset_workspaceId_status_idx" ON "MediaAsset"("workspaceId", "status");

-- CreateIndex
CREATE INDEX "MediaAsset_workspaceId_checksum_idx" ON "MediaAsset"("workspaceId", "checksum");

-- CreateIndex
CREATE UNIQUE INDEX "MediaVariant_mediaAssetId_variantKind_key" ON "MediaVariant"("mediaAssetId", "variantKind");

-- CreateIndex
CREATE INDEX "Draft_workspaceId_status_createdAt_idx" ON "Draft"("workspaceId", "status", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "DraftPlatformTarget_draftId_platform_connectedAccountId_key" ON "DraftPlatformTarget"("draftId", "platform", "connectedAccountId");

-- CreateIndex
CREATE UNIQUE INDEX "DraftCaptionVariant_draftId_platform_locale_key" ON "DraftCaptionVariant"("draftId", "platform", "locale");

-- CreateIndex
CREATE UNIQUE INDEX "DraftMediaSelection_draftId_mediaAssetId_key" ON "DraftMediaSelection"("draftId", "mediaAssetId");

-- CreateIndex
CREATE INDEX "PublishSchedule_scheduledAt_cancelledAt_idx" ON "PublishSchedule"("scheduledAt", "cancelledAt");

-- CreateIndex
CREATE UNIQUE INDEX "PublishJob_idempotencyKey_key" ON "PublishJob"("idempotencyKey");

-- CreateIndex
CREATE INDEX "PublishJob_workspaceId_status_runAt_idx" ON "PublishJob"("workspaceId", "status", "runAt");

-- CreateIndex
CREATE INDEX "PublishJob_draftId_idx" ON "PublishJob"("draftId");

-- CreateIndex
CREATE UNIQUE INDEX "PublishAttempt_publishJobId_attemptNumber_key" ON "PublishAttempt"("publishJobId", "attemptNumber");

-- CreateIndex
CREATE INDEX "PublishEvent_publishJobId_createdAt_idx" ON "PublishEvent"("publishJobId", "createdAt");

-- CreateIndex
CREATE INDEX "PlatformCapabilitySnapshot_platform_capturedAt_idx" ON "PlatformCapabilitySnapshot"("platform", "capturedAt");

-- CreateIndex
CREATE INDEX "WebhookDelivery_workspaceId_platform_status_idx" ON "WebhookDelivery"("workspaceId", "platform", "status");

-- CreateIndex
CREATE INDEX "Notification_workspaceId_userId_readAt_idx" ON "Notification"("workspaceId", "userId", "readAt");

-- CreateIndex
CREATE UNIQUE INDEX "ApiKey_keyHash_key" ON "ApiKey"("keyHash");

-- CreateIndex
CREATE UNIQUE INDEX "IdempotencyKey_workspaceId_key_key" ON "IdempotencyKey"("workspaceId", "key");

-- CreateIndex
CREATE UNIQUE INDEX "FeatureFlag_workspaceId_key_key" ON "FeatureFlag"("workspaceId", "key");

-- AddForeignKey
ALTER TABLE "Workspace" ADD CONSTRAINT "Workspace_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Membership" ADD CONSTRAINT "Membership_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Membership" ADD CONSTRAINT "Membership_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConnectedAccount" ADD CONSTRAINT "ConnectedAccount_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConnectedPageOrProfile" ADD CONSTRAINT "ConnectedPageOrProfile_connectedAccountId_fkey" FOREIGN KEY ("connectedAccountId") REFERENCES "ConnectedAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OAuthCredential" ADD CONSTRAINT "OAuthCredential_connectedAccountId_fkey" FOREIGN KEY ("connectedAccountId") REFERENCES "ConnectedAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TokenSecret" ADD CONSTRAINT "TokenSecret_oauthCredentialId_fkey" FOREIGN KEY ("oauthCredentialId") REFERENCES "OAuthCredential"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MediaFolder" ADD CONSTRAINT "MediaFolder_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MediaFolder" ADD CONSTRAINT "MediaFolder_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "MediaFolder"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MediaTag" ADD CONSTRAINT "MediaTag_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MediaAsset" ADD CONSTRAINT "MediaAsset_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MediaAsset" ADD CONSTRAINT "MediaAsset_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MediaAsset" ADD CONSTRAINT "MediaAsset_folderId_fkey" FOREIGN KEY ("folderId") REFERENCES "MediaFolder"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MediaAssetTag" ADD CONSTRAINT "MediaAssetTag_mediaAssetId_fkey" FOREIGN KEY ("mediaAssetId") REFERENCES "MediaAsset"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MediaAssetTag" ADD CONSTRAINT "MediaAssetTag_mediaTagId_fkey" FOREIGN KEY ("mediaTagId") REFERENCES "MediaTag"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MediaVariant" ADD CONSTRAINT "MediaVariant_mediaAssetId_fkey" FOREIGN KEY ("mediaAssetId") REFERENCES "MediaAsset"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MediaThumbnail" ADD CONSTRAINT "MediaThumbnail_mediaAssetId_fkey" FOREIGN KEY ("mediaAssetId") REFERENCES "MediaAsset"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MediaThumbnail" ADD CONSTRAINT "MediaThumbnail_mediaVariantId_fkey" FOREIGN KEY ("mediaVariantId") REFERENCES "MediaVariant"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Draft" ADD CONSTRAINT "Draft_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Draft" ADD CONSTRAINT "Draft_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DraftPlatformTarget" ADD CONSTRAINT "DraftPlatformTarget_draftId_fkey" FOREIGN KEY ("draftId") REFERENCES "Draft"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DraftPlatformTarget" ADD CONSTRAINT "DraftPlatformTarget_connectedAccountId_fkey" FOREIGN KEY ("connectedAccountId") REFERENCES "ConnectedAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DraftPlatformTarget" ADD CONSTRAINT "DraftPlatformTarget_connectedPageOrProfileId_fkey" FOREIGN KEY ("connectedPageOrProfileId") REFERENCES "ConnectedPageOrProfile"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DraftPlatformTarget" ADD CONSTRAINT "DraftPlatformTarget_capabilitySnapshotId_fkey" FOREIGN KEY ("capabilitySnapshotId") REFERENCES "PlatformCapabilitySnapshot"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DraftCaptionVariant" ADD CONSTRAINT "DraftCaptionVariant_draftId_fkey" FOREIGN KEY ("draftId") REFERENCES "Draft"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DraftMediaSelection" ADD CONSTRAINT "DraftMediaSelection_draftId_fkey" FOREIGN KEY ("draftId") REFERENCES "Draft"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DraftMediaSelection" ADD CONSTRAINT "DraftMediaSelection_mediaAssetId_fkey" FOREIGN KEY ("mediaAssetId") REFERENCES "MediaAsset"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PublishSchedule" ADD CONSTRAINT "PublishSchedule_draftId_fkey" FOREIGN KEY ("draftId") REFERENCES "Draft"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PublishJob" ADD CONSTRAINT "PublishJob_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PublishJob" ADD CONSTRAINT "PublishJob_draftId_fkey" FOREIGN KEY ("draftId") REFERENCES "Draft"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PublishJob" ADD CONSTRAINT "PublishJob_scheduleId_fkey" FOREIGN KEY ("scheduleId") REFERENCES "PublishSchedule"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PublishJob" ADD CONSTRAINT "PublishJob_platformTargetId_fkey" FOREIGN KEY ("platformTargetId") REFERENCES "DraftPlatformTarget"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PublishAttempt" ADD CONSTRAINT "PublishAttempt_publishJobId_fkey" FOREIGN KEY ("publishJobId") REFERENCES "PublishJob"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PublishEvent" ADD CONSTRAINT "PublishEvent_publishJobId_fkey" FOREIGN KEY ("publishJobId") REFERENCES "PublishJob"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PublishEvent" ADD CONSTRAINT "PublishEvent_publishAttemptId_fkey" FOREIGN KEY ("publishAttemptId") REFERENCES "PublishAttempt"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlatformCapabilitySnapshot" ADD CONSTRAINT "PlatformCapabilitySnapshot_connectedAccountId_fkey" FOREIGN KEY ("connectedAccountId") REFERENCES "ConnectedAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlatformCapabilitySnapshot" ADD CONSTRAINT "PlatformCapabilitySnapshot_connectedPageOrProfileId_fkey" FOREIGN KEY ("connectedPageOrProfileId") REFERENCES "ConnectedPageOrProfile"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WebhookDelivery" ADD CONSTRAINT "WebhookDelivery_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApiKey" ADD CONSTRAINT "ApiKey_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApiKey" ADD CONSTRAINT "ApiKey_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IdempotencyKey" ADD CONSTRAINT "IdempotencyKey_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FeatureFlag" ADD CONSTRAINT "FeatureFlag_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

