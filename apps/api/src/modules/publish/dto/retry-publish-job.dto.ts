import { IsOptional, IsString } from "class-validator";

export class RetryPublishJobDto {
  @IsOptional()
  @IsString()
  workspaceId?: string;
}
