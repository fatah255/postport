import { Module } from "@nestjs/common";
import { DraftsController } from "./drafts.controller";
import { DraftsService } from "./drafts.service";
import { PublishModule } from "../publish/publish.module";
import { WorkspaceAccessService } from "../../common/services/workspace-access.service";

@Module({
  imports: [PublishModule],
  controllers: [DraftsController],
  providers: [DraftsService, WorkspaceAccessService]
})
export class DraftsModule {}
