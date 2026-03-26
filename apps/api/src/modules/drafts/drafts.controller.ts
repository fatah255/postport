import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from "@nestjs/common";
import { SessionAuthGuard } from "../auth/guards/session-auth.guard";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import type { AuthenticatedUser } from "../../common/types/authenticated-user";
import { DraftsService } from "./drafts.service";
import { ListDraftsDto } from "./dto/list-drafts.dto";
import { CreateDraftDto } from "./dto/create-draft.dto";
import { UpdateDraftDto } from "./dto/update-draft.dto";
import { ValidateDraftDto } from "./dto/validate-draft.dto";
import { ScheduleDraftDto } from "./dto/schedule-draft.dto";
import { CancelDraftDto } from "./dto/cancel-draft.dto";

@Controller("drafts")
@UseGuards(SessionAuthGuard)
export class DraftsController {
  constructor(private readonly draftsService: DraftsService) {}

  @Get()
  list(@CurrentUser() user: AuthenticatedUser, @Query() query: ListDraftsDto) {
    return this.draftsService.list(user.id, query);
  }

  @Post()
  create(@CurrentUser() user: AuthenticatedUser, @Body() body: CreateDraftDto) {
    return this.draftsService.create(user.id, body);
  }

  @Get(":id")
  getById(@CurrentUser() user: AuthenticatedUser, @Param("id") draftId: string, @Query("workspaceId") workspaceId?: string) {
    return this.draftsService.getById(user.id, draftId, workspaceId);
  }

  @Patch(":id")
  update(@CurrentUser() user: AuthenticatedUser, @Param("id") draftId: string, @Body() body: UpdateDraftDto) {
    return this.draftsService.update(user.id, draftId, body);
  }

  @Delete(":id")
  archive(
    @CurrentUser() user: AuthenticatedUser,
    @Param("id") draftId: string,
    @Query("workspaceId") workspaceId?: string
  ) {
    return this.draftsService.archive(user.id, draftId, workspaceId);
  }

  @Post(":id/duplicate")
  duplicate(
    @CurrentUser() user: AuthenticatedUser,
    @Param("id") draftId: string,
    @Query("workspaceId") workspaceId?: string
  ) {
    return this.draftsService.duplicate(user.id, draftId, workspaceId);
  }

  @Post(":id/validate")
  validate(@CurrentUser() user: AuthenticatedUser, @Param("id") draftId: string, @Body() body: ValidateDraftDto) {
    return this.draftsService.validate(user.id, draftId, body);
  }

  @Post(":id/publish-now")
  publishNow(
    @CurrentUser() user: AuthenticatedUser,
    @Param("id") draftId: string,
    @Query("workspaceId") workspaceId?: string
  ) {
    return this.draftsService.publishNow(user.id, draftId, workspaceId);
  }

  @Post(":id/schedule")
  schedule(@CurrentUser() user: AuthenticatedUser, @Param("id") draftId: string, @Body() body: ScheduleDraftDto) {
    return this.draftsService.schedule(user.id, draftId, body);
  }

  @Post(":id/cancel")
  cancel(@CurrentUser() user: AuthenticatedUser, @Param("id") draftId: string, @Body() body: CancelDraftDto) {
    return this.draftsService.cancel(user.id, draftId, body);
  }

  @Post(":id/reschedule")
  reschedule(@CurrentUser() user: AuthenticatedUser, @Param("id") draftId: string, @Body() body: ScheduleDraftDto) {
    return this.draftsService.reschedule(user.id, draftId, body);
  }
}
