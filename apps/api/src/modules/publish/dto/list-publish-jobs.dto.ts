import { IsOptional, IsString } from "class-validator";

export class ListPublishJobsDto {
  @IsOptional()
  @IsString()
  workspaceId?: string;

  @IsOptional()
  @IsString()
  status?: string;

  @IsOptional()
  @IsString()
  platform?: string;
}
