import { ForbiddenException, Injectable } from "@nestjs/common";
import { PrismaService } from "../../modules/prisma/prisma.service";

@Injectable()
export class WorkspaceAccessService {
  constructor(private readonly prisma: PrismaService) {}

  async resolveWorkspaceIdForUser(userId: string, preferredWorkspaceId?: string): Promise<string> {
    if (preferredWorkspaceId) {
      const membership = await this.prisma.membership.findFirst({
        where: {
          userId,
          workspaceId: preferredWorkspaceId
        },
        select: {
          workspaceId: true
        }
      });
      if (!membership) {
        throw new ForbiddenException("You do not have access to the requested workspace.");
      }
      return membership.workspaceId;
    }

    const firstMembership = await this.prisma.membership.findFirst({
      where: { userId },
      orderBy: {
        createdAt: "asc"
      },
      select: {
        workspaceId: true
      }
    });

    if (!firstMembership) {
      throw new ForbiddenException("No workspace membership was found for this user.");
    }

    return firstMembership.workspaceId;
  }
}
