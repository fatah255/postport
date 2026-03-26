import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from "@nestjs/common";
import { SessionAuthGuard } from "../auth/guards/session-auth.guard";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import type { AuthenticatedUser } from "../../common/types/authenticated-user";
import { MediaService } from "./media.service";
import { InitUploadDto } from "./dto/init-upload.dto";
import { CompleteUploadDto } from "./dto/complete-upload.dto";
import { InitMultipartUploadDto } from "./dto/init-multipart-upload.dto";
import { GetMultipartPartUrlDto } from "./dto/get-multipart-part-url.dto";
import { CompleteMultipartUploadDto } from "./dto/complete-multipart-upload.dto";
import { AbortMultipartUploadDto } from "./dto/abort-multipart-upload.dto";
import { ListMediaDto } from "./dto/list-media.dto";
import { UpdateMediaDto } from "./dto/update-media.dto";
import { BulkDeleteMediaDto } from "./dto/bulk-delete-media.dto";
import { ReprocessMediaDto } from "./dto/reprocess-media.dto";

@Controller("media")
@UseGuards(SessionAuthGuard)
export class MediaController {
  constructor(private readonly mediaService: MediaService) {}

  @Post("upload/init")
  initUpload(@CurrentUser() user: AuthenticatedUser, @Body() body: InitUploadDto) {
    return this.mediaService.initUpload(user.id, body);
  }

  @Post("upload/multipart/init")
  initMultipartUpload(@CurrentUser() user: AuthenticatedUser, @Body() body: InitMultipartUploadDto) {
    return this.mediaService.initMultipartUpload(user.id, body);
  }

  @Post("upload/multipart/part-url")
  getMultipartPartUrl(@CurrentUser() user: AuthenticatedUser, @Body() body: GetMultipartPartUrlDto) {
    return this.mediaService.getMultipartPartUrl(user.id, body);
  }

  @Post("upload/complete")
  completeUpload(@CurrentUser() user: AuthenticatedUser, @Body() body: CompleteUploadDto) {
    return this.mediaService.completeUpload(user.id, body);
  }

  @Post("upload/multipart/complete")
  completeMultipartUpload(@CurrentUser() user: AuthenticatedUser, @Body() body: CompleteMultipartUploadDto) {
    return this.mediaService.completeMultipartUpload(user.id, body);
  }

  @Post("upload/multipart/abort")
  abortMultipartUpload(@CurrentUser() user: AuthenticatedUser, @Body() body: AbortMultipartUploadDto) {
    return this.mediaService.abortMultipartUpload(user.id, body);
  }

  @Get()
  list(@CurrentUser() user: AuthenticatedUser, @Query() query: ListMediaDto) {
    return this.mediaService.listMedia(user.id, query);
  }

  @Get(":id")
  getById(
    @CurrentUser() user: AuthenticatedUser,
    @Param("id") mediaAssetId: string,
    @Query("workspaceId") workspaceId?: string
  ) {
    return this.mediaService.getMediaById(user.id, mediaAssetId, workspaceId);
  }

  @Patch(":id")
  update(@CurrentUser() user: AuthenticatedUser, @Param("id") mediaAssetId: string, @Body() body: UpdateMediaDto) {
    return this.mediaService.updateMedia(user.id, mediaAssetId, body);
  }

  @Delete(":id")
  delete(
    @CurrentUser() user: AuthenticatedUser,
    @Param("id") mediaAssetId: string,
    @Query("workspaceId") workspaceId?: string
  ) {
    return this.mediaService.deleteMedia(user.id, mediaAssetId, workspaceId);
  }

  @Post("bulk-delete")
  bulkDelete(@CurrentUser() user: AuthenticatedUser, @Body() body: BulkDeleteMediaDto) {
    return this.mediaService.bulkDelete(user.id, body);
  }

  @Post(":id/reprocess")
  reprocess(@CurrentUser() user: AuthenticatedUser, @Param("id") mediaAssetId: string, @Body() body: ReprocessMediaDto) {
    return this.mediaService.reprocess(user.id, mediaAssetId, body);
  }
}
