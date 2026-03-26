import { IsOptional, IsString } from "class-validator";

export class CompleteUploadDto {
  @IsString()
  mediaAssetId!: string;

  @IsOptional()
  @IsString()
  workspaceId?: string;
}
