import type { CanActivate, ExecutionContext} from "@nestjs/common";
import { Injectable, UnauthorizedException } from "@nestjs/common";
import type { FastifyRequest } from "fastify";
import { PrismaService } from "../../prisma/prisma.service";
import { sha256 } from "@postport/utils";
import { env } from "../../../config/env";
import type { AuthenticatedUser } from "../../../common/types/authenticated-user";

@Injectable()
export class SessionAuthGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<FastifyRequest & { authUser?: AuthenticatedUser }>();
    const cookieToken = request.cookies?.[env.SESSION_COOKIE_NAME];
    const bearerToken = this.getBearerToken(request.headers.authorization);
    const token = cookieToken ?? bearerToken;

    if (!token) {
      throw new UnauthorizedException("Missing session token");
    }

    const session = await this.prisma.session.findFirst({
      where: {
        tokenHash: sha256(token),
        revokedAt: null,
        expiresAt: {
          gt: new Date()
        }
      },
      include: {
        user: true
      }
    });

    if (!session) {
      throw new UnauthorizedException("Invalid or expired session");
    }

    request.authUser = {
      id: session.user.id,
      email: session.user.email,
      fullName: session.user.fullName
    };

    return true;
  }

  private getBearerToken(value: string | undefined): string | null {
    if (!value) {
      return null;
    }
    if (!value.startsWith("Bearer ")) {
      return null;
    }
    return value.slice("Bearer ".length).trim();
  }
}
