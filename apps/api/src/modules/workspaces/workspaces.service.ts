import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { MembershipRole } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import type { CreateWorkspaceDto } from "./dto/create-workspace.dto";

@Injectable()
export class WorkspacesService {
  constructor(private readonly prisma: PrismaService) {}

  async listForUser(userId: string) {
    const memberships = await this.prisma.membership.findMany({
      where: { userId },
      include: {
        workspace: true
      },
      orderBy: {
        createdAt: "asc"
      }
    });

    return memberships.map((membership) => ({
      id: membership.workspace.id,
      name: membership.workspace.name,
      slug: membership.workspace.slug,
      role: membership.role
    }));
  }

  async createForUser(userId: string, input: CreateWorkspaceDto) {
    const slugCandidate = input.slug
      ? this.normalizeSlug(input.slug)
      : `${this.normalizeSlug(input.name)}-${randomUUID().slice(0, 6)}`;

    const existing = await this.prisma.workspace.findUnique({
      where: {
        slug: slugCandidate
      }
    });
    if (existing) {
      throw new BadRequestException("Workspace slug already exists");
    }

    const workspace = await this.prisma.workspace.create({
      data: {
        name: input.name,
        slug: slugCandidate,
        ownerId: userId,
        memberships: {
          create: {
            userId,
            role: MembershipRole.OWNER
          }
        }
      }
    });

    await this.prisma.auditLog.create({
      data: {
        workspaceId: workspace.id,
        userId,
        action: "WORKSPACE_CREATED",
        entityType: "Workspace",
        entityId: workspace.id
      }
    });

    return workspace;
  }

  async getByIdForUser(workspaceId: string, userId: string) {
    const membership = await this.prisma.membership.findFirst({
      where: {
        workspaceId,
        userId
      },
      include: {
        workspace: true
      }
    });
    if (!membership) {
      throw new NotFoundException("Workspace not found");
    }
    return {
      id: membership.workspace.id,
      name: membership.workspace.name,
      slug: membership.workspace.slug,
      role: membership.role,
      createdAt: membership.workspace.createdAt,
      updatedAt: membership.workspace.updatedAt
    };
  }

  private normalizeSlug(input: string): string {
    return input
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");
  }
}
