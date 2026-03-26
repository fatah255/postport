import type { ExecutionContext } from "@nestjs/common";
import { createParamDecorator } from "@nestjs/common";
import type { FastifyRequest } from "fastify";
import type { AuthenticatedUser } from "../types/authenticated-user";

export const CurrentUser = createParamDecorator(
  (_: unknown, context: ExecutionContext): AuthenticatedUser => {
    const request = context.switchToHttp().getRequest<FastifyRequest & { authUser?: AuthenticatedUser }>();
    if (!request.authUser) {
      throw new Error("Current user is not available on request context.");
    }
    return request.authUser;
  }
);
