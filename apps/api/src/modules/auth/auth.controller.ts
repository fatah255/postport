import { Body, Controller, Get, Post, Req, Res, UseGuards } from "@nestjs/common";
import type { FastifyReply, FastifyRequest } from "fastify";
import { AuthService } from "./auth.service";
import { RegisterDto } from "./dto/register.dto";
import { LoginDto } from "./dto/login.dto";
import { SessionAuthGuard } from "./guards/session-auth.guard";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import type { AuthenticatedUser } from "../../common/types/authenticated-user";
import { env } from "../../config/env";

@Controller("auth")
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post("register")
  register(@Body() body: RegisterDto, @Req() req: FastifyRequest, @Res({ passthrough: true }) res: FastifyReply) {
    return this.authService.register(body, req, res);
  }

  @Post("login")
  login(@Body() body: LoginDto, @Req() req: FastifyRequest, @Res({ passthrough: true }) res: FastifyReply) {
    return this.authService.login(body, req, res);
  }

  @Post("logout")
  logout(@Req() request: FastifyRequest, @Res({ passthrough: true }) response: FastifyReply) {
    const token = request.cookies?.[env.SESSION_COOKIE_NAME];
    response.clearCookie(env.SESSION_COOKIE_NAME, { path: "/" });
    return this.authService.logout(token);
  }

  @Get("me")
  @UseGuards(SessionAuthGuard)
  me(@CurrentUser() user: AuthenticatedUser) {
    return this.authService.me(user.id);
  }
}
