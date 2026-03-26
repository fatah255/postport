const test = require("node:test");
const assert = require("node:assert/strict");
const { recoverPublishJobs } = require("../dist/jobs/recover-publish-jobs.js");

test("recoverPublishJobs requeues due queued jobs and stale waiting-remote jobs", async () => {
  const dispatchCalls = [];
  const retryCalls = [];
  const now = new Date("2026-03-25T12:00:00.000Z");
  let findManyCall = 0;

  const result = await recoverPublishJobs(
    {
      prisma: {
        publishJob: {
          findMany: async () => {
            findManyCall += 1;
            if (findManyCall === 1) {
              return [{ id: "queued-job-1", priority: 15 }];
            }
            return [{ id: "waiting-job-1", priority: 100 }];
          }
        }
      },
      queues: {
        dispatch: {
          add: async (name, data, options) => {
            dispatchCalls.push({ name, data, options });
          }
        },
        retry: {
          add: async (name, data, options) => {
            retryCalls.push({ name, data, options });
          }
        }
      }
    },
    now
  );

  assert.equal(result.queuedDispatchJobs, 1);
  assert.equal(result.queuedRemotePolls, 1);
  assert.deepEqual(dispatchCalls[0], {
    name: "publish.dispatch",
    data: { publishJobId: "queued-job-1" },
    options: {
      jobId: "publish_dispatch_queued-job-1",
      attempts: 5,
      backoff: { type: "exponential", delay: 30000 },
      priority: 15,
      removeOnComplete: 200,
      removeOnFail: false
    }
  });
  assert.deepEqual(retryCalls[0], {
    name: "publish.remote-status",
    data: { publishJobId: "waiting-job-1" },
    options: {
      jobId: "publish_remote_waiting-job-1",
      attempts: 5,
      backoff: { type: "exponential", delay: 30000 },
      removeOnComplete: 200,
      removeOnFail: false
    }
  });
});

test("recoverPublishJobs is a no-op when there is nothing to recover", async () => {
  const result = await recoverPublishJobs(
    {
      prisma: {
        publishJob: {
          findMany: async () => []
        }
      },
      queues: {
        dispatch: {
          add: async () => {
            throw new Error("dispatch queue should not be called");
          }
        },
        retry: {
          add: async () => {
            throw new Error("retry queue should not be called");
          }
        }
      }
    },
    new Date("2026-03-25T12:00:00.000Z")
  );

  assert.deepEqual(result, {
    queuedDispatchJobs: 0,
    queuedRemotePolls: 0
  });
});
