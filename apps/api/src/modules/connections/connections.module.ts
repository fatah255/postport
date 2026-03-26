import { Module } from "@nestjs/common";
import { ConnectionsController } from "./connections.controller";
import { ConnectionsService } from "./connections.service";
import { WorkspaceAccessService } from "../../common/services/workspace-access.service";

@Module({
  controllers: [ConnectionsController],
  providers: [ConnectionsService, WorkspaceAccessService]
})
export class ConnectionsModule {}
