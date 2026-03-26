import { IsIn, IsOptional, IsString } from "class-validator";

const sortValues = ["newest", "oldest", "name", "size"] as const;

export class ListMediaDto {
  @IsOptional()
  @IsString()
  workspaceId?: string;

  @IsOptional()
  @IsString()
  query?: string;

  @IsOptional()
  @IsString()
  type?: "VIDEO" | "IMAGE" | "CAROUSEL";

  @IsOptional()
  @IsString()
  status?: "UPLOADING" | "PROCESSING" | "READY" | "FAILED" | "DELETED";

  @IsOptional()
  @IsIn(sortValues)
  sort?: (typeof sortValues)[number];
}
