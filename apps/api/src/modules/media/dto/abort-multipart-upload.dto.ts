import { IsOptional, IsString } from "class-validator";

export class AbortMultipartUploadDto {
  @IsString()
  mediaAssetId!: string;

  @IsString()
  uploadId!: string;

  @IsOptional()
  @IsString()
  workspaceId?: string;
}
