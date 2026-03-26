import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import type { UpdateProfileDto } from "./dto-update-profile";

@Injectable()
export class SettingsService {
  constructor(private readonly prisma: PrismaService) {}

  async getProfile(userId: string) {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        fullName: true,
        locale: true,
        createdAt: true
      }
    });
    return user;
  }

  async updateProfile(userId: string, input: UpdateProfileDto) {
    const user = await this.prisma.user.update({
      where: { id: userId },
      data: {
        fullName: input.fullName,
        locale: input.locale
      },
      select: {
        id: true,
        email: true,
        fullName: true,
        locale: true
      }
    });
    return user;
  }

  async getTeam(userId: string) {
    const memberships = await this.prisma.membership.findMany({
      where: { userId },
      include: {
        workspace: true,
        user: {
          select: {
            id: true,
            email: true,
            fullName: true
          }
        }
      }
    });
    return {
      memberships: memberships.map((item) => ({
        workspace: {
          id: item.workspace.id,
          name: item.workspace.name
        },
        role: item.role,
        user: item.user
      }))
    };
  }
}
