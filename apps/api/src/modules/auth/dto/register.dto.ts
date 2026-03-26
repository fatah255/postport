import { IsEmail, IsEnum, IsString, MinLength } from "class-validator";
import { LocaleCode } from "@prisma/client";

export class RegisterDto {
  @IsEmail()
  email!: string;

  @IsString()
  @MinLength(2)
  fullName!: string;

  @IsString()
  @MinLength(8)
  password!: string;

  @IsEnum(LocaleCode)
  locale: LocaleCode = LocaleCode.EN;
}
