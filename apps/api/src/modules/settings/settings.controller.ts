import { Body, Controller, Get, Patch, UseGuards } from "@nestjs/common";
import { SessionAuthGuard } from "../auth/guards/session-auth.guard";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import type { AuthenticatedUser } from "../../common/types/authenticated-user";
import { SettingsService } from "./settings.service";
import { UpdateProfileDto } from "./dto-update-profile";

@Controller("settings")
@UseGuards(SessionAuthGuard)
export class SettingsController {
  constructor(private readonly settingsService: SettingsService) {}

  @Get("profile")
  getProfile(@CurrentUser() user: AuthenticatedUser) {
    return this.settingsService.getProfile(user.id);
  }

  @Patch("profile")
  updateProfile(@CurrentUser() user: AuthenticatedUser, @Body() body: UpdateProfileDto) {
    return this.settingsService.updateProfile(user.id, body);
  }

  @Get("team")
  getTeam(@CurrentUser() user: AuthenticatedUser) {
    return this.settingsService.getTeam(user.id);
  }

  @Get("billing-placeholder")
  billingPlaceholder() {
    return {
      plan: "Starter",
      status: "not_implemented_in_v1"
    };
  }
}
