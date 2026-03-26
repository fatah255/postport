import { IsOptional, IsString } from "class-validator";

export class CancelDraftDto {
  @IsOptional()
  @IsString()
  workspaceId?: string;
}
