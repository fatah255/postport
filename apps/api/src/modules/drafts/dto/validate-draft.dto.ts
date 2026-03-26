import { IsOptional, IsString } from "class-validator";

export class ValidateDraftDto {
  @IsOptional()
  @IsString()
  workspaceId?: string;
}
