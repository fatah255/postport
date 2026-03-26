import { Module } from "@nestjs/common";
import { PublishController } from "./publish.controller";
import { PublishService } from "./publish.service";
import { QueueModule } from "../queue/queue.module";
import { WorkspaceAccessService } from "../../common/services/workspace-access.service";

@Module({
  imports: [QueueModule],
  controllers: [PublishController],
  providers: [PublishService, WorkspaceAccessService],
  exports: [PublishService]
})
export class PublishModule {}
