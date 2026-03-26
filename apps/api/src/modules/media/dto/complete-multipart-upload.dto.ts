import { Type } from "class-transformer";
import { ArrayMinSize, IsArray, IsInt, IsOptional, IsString, Min, ValidateNested } from "class-validator";

class MultipartCompletedPartDto {
  @IsInt()
  @Min(1)
  partNumber!: number;

  @IsString()
  etag!: string;
}

export class CompleteMultipartUploadDto {
  @IsString()
  mediaAssetId!: string;

  @IsString()
  uploadId!: string;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => MultipartCompletedPartDto)
  parts!: MultipartCompletedPartDto[];

  @IsOptional()
  @IsString()
  workspaceId?: string;
}
