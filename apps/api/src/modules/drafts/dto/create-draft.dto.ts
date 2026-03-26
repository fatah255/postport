import {
  ArrayMinSize,
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

class DraftPlatformInputDto {
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

export class CreateDraftDto {
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

  @IsArray()
  @ArrayMinSize(1)
  @IsString({ each: true })
  mediaAssetIds!: string[];

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => DraftPlatformInputDto)
  platforms!: DraftPlatformInputDto[];

  @IsOptional()
  @IsDateString()
  scheduledAt?: string;

  @IsOptional()
  @IsString()
  timezone?: string;
}

export class DraftPlatformInput extends DraftPlatformInputDto {}
