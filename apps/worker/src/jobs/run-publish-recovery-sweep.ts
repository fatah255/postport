import { recoverPublishJobs, type PublishRecoveryDependencies } from "./recover-publish-jobs";
import { prisma } from "../services/prisma";
import { publishDispatchQueue, publishRetryQueue } from "../services/queue";

const defaultDependencies: PublishRecoveryDependencies = {
  prisma: prisma as unknown as PublishRecoveryDependencies["prisma"],
  queues: {
    dispatch: publishDispatchQueue as unknown as PublishRecoveryDependencies["queues"]["dispatch"],
    retry: publishRetryQueue as unknown as PublishRecoveryDependencies["queues"]["retry"]
  }
};

export const runPublishRecoverySweep = (now = new Date()) => {
  return recoverPublishJobs(defaultDependencies, now);
};
