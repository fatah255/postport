import type { Platform } from "@prisma/client";
import type { PlatformPublisherAdapter, PlatformTargetRef } from "@postport/platform-sdk";
import { FacebookPublisher } from "./facebook-publisher";
import { InstagramPublisher } from "./instagram-publisher";
import { sleep, REMOTE_STATUS_POLL_ATTEMPTS, REMOTE_STATUS_POLL_DELAY_MS } from "./shared";
import { TikTokPublisher } from "./tiktok-publisher";

export const publishAdapters: Record<Platform, PlatformPublisherAdapter> = {
  INSTAGRAM: new InstagramPublisher(),
  FACEBOOK: new FacebookPublisher(),
  TIKTOK: new TikTokPublisher()
};

export const pollUntilRemoteSettles = async (
  adapter: PlatformPublisherAdapter,
  remotePublishId: string,
  target: PlatformTargetRef
) => {
  for (let attempt = 0; attempt < REMOTE_STATUS_POLL_ATTEMPTS; attempt += 1) {
    const result = await adapter.pollStatus(remotePublishId, target);
    if (result.status !== "WAITING_REMOTE") {
      return result;
    }

    await sleep(REMOTE_STATUS_POLL_DELAY_MS);
  }

  return adapter.pollStatus(remotePublishId, target);
};
