import { Body, Controller, Get, Param, Post, Query, UseGuards } from "@nestjs/common";
import { SessionAuthGuard } from "../auth/guards/session-auth.guard";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import type { AuthenticatedUser } from "../../common/types/authenticated-user";
import { PublishService } from "./publish.service";
import { ListPublishJobsDto } from "./dto/list-publish-jobs.dto";
import { RetryPublishJobDto } from "./dto/retry-publish-job.dto";
import { CancelPublishJobDto } from "./dto/cancel-publish-job.dto";

@Controller("publish")
@UseGuards(SessionAuthGuard)
export class PublishController {
  constructor(private readonly publishService: PublishService) {}

  @Get("jobs")
  list(@CurrentUser() user: AuthenticatedUser, @Query() query: ListPublishJobsDto) {
    return this.publishService.listJobs(user.id, query);
  }

  @Get("jobs/:id")
  getById(
    @CurrentUser() user: AuthenticatedUser,
    @Param("id") publishJobId: string,
    @Query("workspaceId") workspaceId?: string
  ) {
    return this.publishService.getJob(user.id, publishJobId, workspaceId);
  }

  @Get("history")
  history(@CurrentUser() user: AuthenticatedUser, @Query() query: ListPublishJobsDto) {
    return this.publishService.history(user.id, query);
  }

  @Post("jobs/:id/retry")
  retry(@CurrentUser() user: AuthenticatedUser, @Param("id") publishJobId: string, @Body() body: RetryPublishJobDto) {
    return this.publishService.retryJob(user.id, publishJobId, body.workspaceId);
  }

  @Post("jobs/:id/cancel")
  cancel(@CurrentUser() user: AuthenticatedUser, @Param("id") publishJobId: string, @Body() body: CancelPublishJobDto) {
    return this.publishService.cancelJob(user.id, publishJobId, body.workspaceId);
  }
}
