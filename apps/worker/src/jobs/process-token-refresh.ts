import { env } from "../config/env";
import { requestJson } from "../platforms/http";
import { prisma } from "../services/prisma";
import { tokenRefreshQueue } from "../services/queue";
import { createTokenRefreshService } from "./token-refresh-service";

export { createTokenRefreshService, REFRESH_LOOKAHEAD_MS } from "./token-refresh-service";

const tokenRefreshService = createTokenRefreshService({
  env,
  prisma,
  queue: tokenRefreshQueue,
  requestJson
});

export const enqueueDueTokenRefreshJobs = tokenRefreshService.enqueueDueTokenRefreshJobs;
export const processTokenRefresh = tokenRefreshService.processTokenRefresh;
