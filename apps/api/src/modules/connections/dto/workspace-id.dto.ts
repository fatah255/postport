import { IsOptional, IsString } from "class-validator";

export class WorkspaceIdDto {
  @IsOptional()
  @IsString()
  workspaceId?: string;
}
