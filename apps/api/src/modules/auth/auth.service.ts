import { BadRequestException, Injectable, UnauthorizedException } from "@nestjs/common";
import argon2 from "argon2";
import { randomBytes, randomUUID } from "node:crypto";
import { LocaleCode } from "@prisma/client";
import type { FastifyReply, FastifyRequest } from "fastify";
import { PrismaService } from "../prisma/prisma.service";
import type { RegisterDto } from "./dto/register.dto";
import type { LoginDto } from "./dto/login.dto";
import { sha256 } from "@postport/utils";
import { env } from "../../config/env";

@Injectable()
export class AuthService {
  constructor(private readonly prisma: PrismaService) {}

  async register(input: RegisterDto, request: FastifyRequest, reply: FastifyReply) {
    const existing = await this.prisma.user.findUnique({
      where: { email: input.email.toLowerCase() }
    });

    if (existing) {
      throw new BadRequestException("Email already in use");
    }

    const passwordHash = await argon2.hash(input.password);
    const user = await this.prisma.user.create({
      data: {
        email: input.email.toLowerCase(),
        fullName: input.fullName,
        passwordHash,
        locale: input.locale ?? LocaleCode.EN
      }
    });

    const slugBase = input.fullName.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-");
    const slug = `${slugBase || "workspace"}-${randomUUID().slice(0, 6)}`;

    const workspace = await this.prisma.workspace.create({
      data: {
        name: `${input.fullName}'s Workspace`,
        slug,
        ownerId: user.id,
        memberships: {
          create: {
            userId: user.id,
            role: "OWNER"
          }
        }
      }
    });

    await this.prisma.auditLog.create({
      data: {
        workspaceId: workspace.id,
        userId: user.id,
        action: "USER_REGISTERED",
        entityType: "User",
        entityId: user.id
      }
    });

    await this.createSession(user.id, request, reply);
    return {
      user: {
        id: user.id,
        email: user.email,
        fullName: user.fullName,
        locale: user.locale
      },
      workspace: {
        id: workspace.id,
        name: workspace.name,
        slug: workspace.slug
      }
    };
  }

  async login(input: LoginDto, request: FastifyRequest, reply: FastifyReply) {
    const user = await this.prisma.user.findUnique({
      where: {
        email: input.email.toLowerCase()
      }
    });

    if (!user) {
      throw new UnauthorizedException("Invalid credentials");
    }

    const valid = await argon2.verify(user.passwordHash, input.password);
    if (!valid) {
      throw new UnauthorizedException("Invalid credentials");
    }

    await this.createSession(user.id, request, reply);

    return {
      user: {
        id: user.id,
        email: user.email,
        fullName: user.fullName,
        locale: user.locale
      }
    };
  }

  async me(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: {
        memberships: {
          include: {
            workspace: true
          }
        }
      }
    });

    if (!user) {
      throw new UnauthorizedException("User not found");
    }

    return {
      id: user.id,
      email: user.email,
      fullName: user.fullName,
      locale: user.locale,
      memberships: user.memberships.map((membership) => ({
        role: membership.role,
        workspace: {
          id: membership.workspace.id,
          name: membership.workspace.name,
          slug: membership.workspace.slug
        }
      }))
    };
  }

  async logout(token: string | undefined) {
    if (!token) {
      return { success: true };
    }
    await this.prisma.session.updateMany({
      where: {
        tokenHash: sha256(token),
        revokedAt: null
      },
      data: {
        revokedAt: new Date()
      }
    });
    return { success: true };
  }

  private async createSession(userId: string, request: FastifyRequest, reply: FastifyReply): Promise<string> {
    const sessionToken = randomBytes(48).toString("hex");
    const expiresAt = new Date(Date.now() + 1000 * 60 * 60 * 24 * 30);

    await this.prisma.session.create({
      data: {
        userId,
        tokenHash: sha256(sessionToken),
        expiresAt,
        ipAddress: request.ip,
        userAgent: request.headers["user-agent"] ?? null
      }
    });

    reply.setCookie(env.SESSION_COOKIE_NAME, sessionToken, {
      httpOnly: true,
      secure: env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      expires: expiresAt
    });

    return sessionToken;
  }
}
