import "reflect-metadata";
import { ValidationPipe } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { FastifyAdapter, type NestFastifyApplication } from "@nestjs/platform-fastify";
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";
import cookie from "@fastify/cookie";
import cors from "@fastify/cors";
import { AppModule } from "./app.module";
import { env } from "./config/env";
import { RequestContextInterceptor } from "./common/interceptors/request-context.interceptor";

async function bootstrap() {
  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    new FastifyAdapter({
      logger: false,
      bodyLimit: 10 * 1024 * 1024
    })
  );

  await app.register(cookie);
  await app.register(cors, {
    origin: env.CORS_ORIGIN,
    credentials: true
  });
  app.getHttpAdapter().getInstance().addHook("onSend", (request, reply, payload, done) => {
    reply.header("x-content-type-options", "nosniff");
    reply.header("x-frame-options", "DENY");
    reply.header("referrer-policy", "no-referrer");
    reply.header("cross-origin-resource-policy", "same-site");
    reply.header("cross-origin-opener-policy", "same-origin");
    if (env.NODE_ENV === "production") {
      reply.header("strict-transport-security", "max-age=63072000; includeSubDomains; preload");
    }
    done(null, payload);
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true
    })
  );
  app.useGlobalInterceptors(new RequestContextInterceptor());

  const swagger = new DocumentBuilder()
    .setTitle("PostPort API")
    .setDescription("Phase 1 REST API for auth and workspaces")
    .setVersion("0.1.0")
    .addCookieAuth(env.SESSION_COOKIE_NAME)
    .addBearerAuth()
    .build();
  const document = SwaggerModule.createDocument(app, swagger);
  SwaggerModule.setup("docs", app, document);

  await app.listen(env.API_PORT, "0.0.0.0");
}

void bootstrap();
