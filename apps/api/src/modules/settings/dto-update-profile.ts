import { IsEnum, IsOptional, IsString, MaxLength } from "class-validator";
import { LocaleCode } from "@prisma/client";

export class UpdateProfileDto {
  @IsOptional()
  @IsString()
  @MaxLength(120)
  fullName?: string;

  @IsOptional()
  @IsEnum(LocaleCode)
  locale?: LocaleCode;
}
