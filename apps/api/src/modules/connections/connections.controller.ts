import { Body, Controller, Get, Param, Post, Query, Res, UseGuards } from "@nestjs/common";
import type { FastifyReply } from "fastify";
import { SessionAuthGuard } from "../auth/guards/session-auth.guard";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import type { AuthenticatedUser } from "../../common/types/authenticated-user";
import { ConnectionsService } from "./connections.service";
import { WorkspaceIdDto } from "./dto/workspace-id.dto";
import { env } from "../../config/env";

@Controller("connections")
@UseGuards(SessionAuthGuard)
export class ConnectionsController {
  constructor(private readonly connectionsService: ConnectionsService) {}

  @Get()
  list(@CurrentUser() user: AuthenticatedUser, @Query("workspaceId") workspaceId?: string) {
    return this.connectionsService.list(user.id, workspaceId);
  }

  @Post(":platform/start")
  start(
    @CurrentUser() user: AuthenticatedUser,
    @Param("platform") platform: string,
    @Body() body: WorkspaceIdDto
  ) {
    return this.connectionsService.startConnection(user.id, this.connectionsService.parsePlatform(platform), body.workspaceId);
  }

  @Get(":platform/callback")
  callback(
    @CurrentUser() user: AuthenticatedUser,
    @Param("platform") platform: string,
    @Query("code") code: string | undefined,
    @Query("state") state: string | undefined,
    @Query("error") error: string | undefined,
    @Query("error_description") errorDescription: string | undefined,
    @Query("mock") mock: string | undefined,
    @Res({ passthrough: false }) reply: FastifyReply
  ) {
    const successRedirect = `${env.CORS_ORIGIN}/en/connections?status=connected&platform=${platform.toLowerCase()}`;
    const errorRedirectBase = `${env.CORS_ORIGIN}/en/connections?status=error&platform=${platform.toLowerCase()}`;

    return this.connectionsService
      .callback(user.id, this.connectionsService.parsePlatform(platform), {
        code,
        state,
        error,
        errorDescription,
        mock: mock === "1" || mock === "true"
      })
      .then(() => {
        reply.status(302);
        return reply.redirect(successRedirect);
      })
      .catch((callbackError: unknown) => {
        const message = callbackError instanceof Error ? callbackError.message : "Connection failed";
        reply.status(302);
        return reply.redirect(`${errorRedirectBase}&message=${encodeURIComponent(message)}`);
      });
  }

  @Post(":id/reconnect")
  reconnect(@CurrentUser() user: AuthenticatedUser, @Param("id") connectionId: string, @Body() body: WorkspaceIdDto) {
    return this.connectionsService.reconnect(user.id, connectionId, body.workspaceId);
  }

  @Post(":id/disconnect")
  disconnect(@CurrentUser() user: AuthenticatedUser, @Param("id") connectionId: string, @Body() body: WorkspaceIdDto) {
    return this.connectionsService.disconnect(user.id, connectionId, body.workspaceId);
  }

  @Post(":id/refresh")
  refresh(@CurrentUser() user: AuthenticatedUser, @Param("id") connectionId: string, @Body() body: WorkspaceIdDto) {
    return this.connectionsService.refresh(user.id, connectionId, body.workspaceId);
  }

  @Get(":id/health")
  health(
    @CurrentUser() user: AuthenticatedUser,
    @Param("id") connectionId: string,
    @Query("workspaceId") workspaceId?: string
  ) {
    return this.connectionsService.health(user.id, connectionId, workspaceId);
  }
}
