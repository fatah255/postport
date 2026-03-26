import { IsOptional, IsString } from "class-validator";

export class ListDraftsDto {
  @IsOptional()
  @IsString()
  workspaceId?: string;

  @IsOptional()
  @IsString()
  status?: string;

  @IsOptional()
  @IsString()
  query?: string;
}
