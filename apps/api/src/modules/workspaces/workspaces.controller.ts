import { Body, Controller, Get, Param, Post, UseGuards } from "@nestjs/common";
import { SessionAuthGuard } from "../auth/guards/session-auth.guard";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import type { AuthenticatedUser } from "../../common/types/authenticated-user";
import { WorkspacesService } from "./workspaces.service";
import { CreateWorkspaceDto } from "./dto/create-workspace.dto";

@Controller("workspaces")
@UseGuards(SessionAuthGuard)
export class WorkspacesController {
  constructor(private readonly workspacesService: WorkspacesService) {}

  @Get()
  list(@CurrentUser() user: AuthenticatedUser) {
    return this.workspacesService.listForUser(user.id);
  }

  @Post()
  create(@CurrentUser() user: AuthenticatedUser, @Body() body: CreateWorkspaceDto) {
    return this.workspacesService.createForUser(user.id, body);
  }

  @Get(":id")
  getById(@CurrentUser() user: AuthenticatedUser, @Param("id") id: string) {
    return this.workspacesService.getByIdForUser(id, user.id);
  }
}
