import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { ThrottlerModule } from "@nestjs/throttler";
import { LoggerModule } from "nestjs-pino";
import { PrismaModule } from "./modules/prisma/prisma.module";
import { AuthModule } from "./modules/auth/auth.module";
import { WorkspacesModule } from "./modules/workspaces/workspaces.module";
import { HealthModule } from "./modules/health/health.module";
import { MediaModule } from "./modules/media/media.module";
import { QueueModule } from "./modules/queue/queue.module";
import { StorageModule } from "./modules/storage/storage.module";
import { DraftsModule } from "./modules/drafts/drafts.module";
import { PublishModule } from "./modules/publish/publish.module";
import { ConnectionsModule } from "./modules/connections/connections.module";
import { SettingsModule } from "./modules/settings/settings.module";
import { env } from "./config/env";

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true
    }),
    LoggerModule.forRoot({
      pinoHttp: {
        level: env.LOG_LEVEL,
        redact: {
          paths: [
            "req.headers.authorization",
            "req.headers.cookie",
            "res.headers['set-cookie']",
            "*.access_token",
            "*.refresh_token",
            "*.token",
            "*.secret"
          ],
          remove: true
        }
      }
    }),
    ThrottlerModule.forRoot([
      {
        ttl: env.RATE_LIMIT_TTL * 1000,
        limit: env.RATE_LIMIT_LIMIT
      }
    ]),
    PrismaModule,
    QueueModule,
    StorageModule,
    AuthModule,
    WorkspacesModule,
    MediaModule,
    DraftsModule,
    PublishModule,
    ConnectionsModule,
    SettingsModule,
    HealthModule
  ]
})
export class AppModule {}
