import { Module } from "@nestjs/common";
import { MediaController } from "./media.controller";
import { MediaService } from "./media.service";
import { StorageModule } from "../storage/storage.module";
import { QueueModule } from "../queue/queue.module";
import { WorkspaceAccessService } from "../../common/services/workspace-access.service";

@Module({
  imports: [StorageModule, QueueModule],
  controllers: [MediaController],
  providers: [MediaService, WorkspaceAccessService]
})
export class MediaModule {}
