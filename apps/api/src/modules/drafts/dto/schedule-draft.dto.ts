import { IsDateString, IsOptional, IsString } from "class-validator";

export class ScheduleDraftDto {
  @IsOptional()
  @IsString()
  workspaceId?: string;

  @IsDateString()
  scheduledAt!: string;

  @IsString()
  timezone!: string;
}
