import type { CallHandler, ExecutionContext, NestInterceptor } from "@nestjs/common";
import { Injectable } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import type { Observable } from "rxjs";
import type { FastifyReply, FastifyRequest } from "fastify";

@Injectable()
export class RequestContextInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const http = context.switchToHttp();
    const request = http.getRequest<FastifyRequest & { correlationId?: string }>();
    const reply = http.getResponse<FastifyReply>();

    const incomingId = request.headers["x-request-id"];
    const correlationId = typeof incomingId === "string" ? incomingId : randomUUID();
    request.correlationId = correlationId;
    reply.header("x-request-id", correlationId);

    return next.handle();
  }
}
