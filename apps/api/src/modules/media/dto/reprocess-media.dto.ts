import { IsOptional, IsString } from "class-validator";

export class ReprocessMediaDto {
  @IsOptional()
  @IsString()
  workspaceId?: string;
}
