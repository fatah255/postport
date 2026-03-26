import { ArrayMinSize, IsArray, IsOptional, IsString } from "class-validator";

export class BulkDeleteMediaDto {
  @IsArray()
  @ArrayMinSize(1)
  @IsString({ each: true })
  mediaAssetIds!: string[];

  @IsOptional()
  @IsString()
  workspaceId?: string;
}
