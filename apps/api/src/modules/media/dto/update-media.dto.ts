import { IsOptional, IsString, MaxLength } from "class-validator";

export class UpdateMediaDto {
  @IsOptional()
  @IsString()
  @MaxLength(255)
  originalFilename?: string;

  @IsOptional()
  @IsString()
  folderId?: string;

  @IsOptional()
  @IsString()
  workspaceId?: string;
}
