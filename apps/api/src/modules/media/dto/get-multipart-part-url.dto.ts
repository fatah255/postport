import { IsInt, IsOptional, IsString, Min } from "class-validator";

export class GetMultipartPartUrlDto {
  @IsString()
  mediaAssetId!: string;

  @IsString()
  uploadId!: string;

  @IsInt()
  @Min(1)
  partNumber!: number;

  @IsOptional()
  @IsString()
  workspaceId?: string;
}
