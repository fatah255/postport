import { IsInt, IsOptional, IsString, MaxLength, Min } from "class-validator";

export class InitMultipartUploadDto {
  @IsString()
  @MaxLength(255)
  fileName!: string;

  @IsString()
  @MaxLength(255)
  mimeType!: string;

  @IsInt()
  @Min(1)
  sizeBytes!: number;

  @IsOptional()
  @IsString()
  checksum?: string;

  @IsOptional()
  @IsString()
  folderId?: string;

  @IsOptional()
  @IsString()
  workspaceId?: string;
}
