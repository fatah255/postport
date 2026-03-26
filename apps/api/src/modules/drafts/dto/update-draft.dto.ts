import {
  IsBoolean,
  IsArray,
  IsDateString,
  IsEnum,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
  ValidateNested
} from "class-validator";
import { Type } from "class-transformer";
import { Platform, PublishMode } from "@prisma/client";

class UpdateDraftPlatformInputDto {
  @IsEnum(Platform)
  platform!: Platform;

  @IsOptional()
  @IsString()
  connectedAccountId?: string;

  @IsOptional()
  @IsString()
  connectedPageOrProfileId?: string;

  @IsOptional()
  @IsEnum(PublishMode)
  publishMode?: PublishMode;

  @IsOptional()
  @IsObject()
  platformSpecificJson?: Record<string, unknown>;
}

export class UpdateDraftDto {
  @IsOptional()
  @IsString()
  workspaceId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(150)
  title?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2200)
  caption?: string;

  @IsOptional()
  @IsString()
  @MaxLength(4000)
  description?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  hashtags?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  mentions?: string[];

  @IsOptional()
  @IsString()
  @MaxLength(50)
  privacyLevel?: string;

  @IsOptional()
  @IsBoolean()
  disableComments?: boolean;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  mediaAssetIds?: string[];

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => UpdateDraftPlatformInputDto)
  platforms?: UpdateDraftPlatformInputDto[];

  @IsOptional()
  @IsDateString()
  scheduledAt?: string;

  @IsOptional()
  @IsString()
  timezone?: string;
}

export class UpdateDraftPlatformInput extends UpdateDraftPlatformInputDto {}
