import { IsOptional, IsString } from "class-validator";

export class CancelPublishJobDto {
  @IsOptional()
  @IsString()
  workspaceId?: string;
}
