const test = require("node:test");
const assert = require("node:assert/strict");
const { Platform, AccountStatus } = require("@prisma/client");
const { encryptText } = require("@postport/utils");
const { createTokenRefreshService } = require("../dist/jobs/token-refresh-service.js");

const TOKEN_ENCRYPTION_KEY = "0123456789abcdef0123456789abcdef";

const createDefaultDependencies = () => {
  const state = {
    queueCalls: [],
    connectedAccountUpdates: [],
    tokenSecretUpdates: [],
    tokenSecretCreates: [],
    oauthUpserts: [],
    profileUpdates: [],
    requestCalls: []
  };

  const deps = {
    env: {
      META_APP_ID: "meta-app-id",
      META_APP_SECRET: "meta-app-secret",
      META_API_VERSION: "v21.0",
      TIKTOK_CLIENT_KEY: "tiktok-client-key",
      TIKTOK_CLIENT_SECRET: "tiktok-client-secret",
      TOKEN_ENCRYPTION_KEY
    },
    queue: {
      add: async (name, data, options) => {
        state.queueCalls.push({ name, data, options });
      }
    },
    prisma: {
      connectedAccount: {
        findMany: async () => [],
        findUnique: async () => null,
        update: async (args) => {
          state.connectedAccountUpdates.push(args);
          return args;
        }
      },
      oAuthCredential: {
        upsert: async (args) => {
          state.oauthUpserts.push(args);
          return { id: "credential-page-1" };
        }
      },
      tokenSecret: {
        findFirst: async () => null,
        update: async (args) => {
          state.tokenSecretUpdates.push(args);
          return args;
        },
        create: async (args) => {
          state.tokenSecretCreates.push(args);
          return args;
        }
      },
      connectedPageOrProfile: {
        updateMany: async (args) => {
          state.profileUpdates.push(args);
          return args;
        }
      }
    },
    requestJson: async (url, init) => {
      state.requestCalls.push({ url, init });
      throw new Error(`Unexpected request: ${url}`);
    }
  };

  return { deps, state };
};

const encryptPayload = (payload) => {
  const encrypted = encryptText(JSON.stringify(payload), TOKEN_ENCRYPTION_KEY);
  return {
    encryptedPayload: encrypted.value,
    iv: encrypted.iv,
    tag: encrypted.tag
  };
};

test("enqueueDueTokenRefreshJobs schedules one refresh job per expiring account", async () => {
  const { deps, state } = createDefaultDependencies();
  deps.prisma.connectedAccount.findMany = async () => [{ id: "account-1" }, { id: "account-2" }];

  const service = createTokenRefreshService(deps);
  const result = await service.enqueueDueTokenRefreshJobs();

  assert.deepEqual(result, { queued: 2 });
  assert.deepEqual(state.queueCalls, [
    {
      name: "connections.token-refresh",
      data: { connectedAccountId: "account-1" },
      options: {
        jobId: "token_refresh_account-1",
        removeOnComplete: 200,
        removeOnFail: false
      }
    },
    {
      name: "connections.token-refresh",
      data: { connectedAccountId: "account-2" },
      options: {
        jobId: "token_refresh_account-2",
        removeOnComplete: 200,
        removeOnFail: false
      }
    }
  ]);
});

test("processTokenRefresh refreshes Meta account tokens and stores page credentials", async () => {
  const { deps, state } = createDefaultDependencies();
  const storedSecret = encryptPayload({
    accessToken: "old-meta-access-token",
    tokenType: "bearer"
  });

  deps.prisma.connectedAccount.findUnique = async () => ({
    id: "account-1",
    platform: Platform.INSTAGRAM,
    remoteAccountId: "user-remote-1",
    oauthCredentials: [
      {
        id: "credential-user-1",
        externalUserId: "user-remote-1",
        tokenSecrets: [
          {
            id: "secret-user-1",
            ...storedSecret
          }
        ]
      }
    ]
  });

  let secretLookupCount = 0;
  deps.prisma.tokenSecret.findFirst = async () => {
    secretLookupCount += 1;
    if (secretLookupCount === 1) {
      return { id: "secret-user-1" };
    }
    return null;
  };

  deps.requestJson = async (url) => {
    state.requestCalls.push({ url });
    if (url.includes("/oauth/access_token")) {
      return {
        access_token: "new-meta-user-token",
        token_type: "bearer",
        expires_in: 3600
      };
    }

    return {
      data: [
        {
          id: "page-1",
          access_token: "new-page-token",
          tasks: ["CREATE_CONTENT"]
        }
      ]
    };
  };

  const service = createTokenRefreshService(deps);
  const result = await service.processTokenRefresh({ connectedAccountId: "account-1" });

  assert.deepEqual(result, {
    connectedAccountId: "account-1",
    platform: Platform.INSTAGRAM,
    refreshed: true
  });
  assert.equal(state.requestCalls.length, 2);
  assert.equal(state.oauthUpserts.length, 1);
  assert.equal(state.tokenSecretUpdates.length, 1);
  assert.equal(state.tokenSecretCreates.length, 1);
  assert.equal(state.connectedAccountUpdates.length, 1);
  assert.equal(state.connectedAccountUpdates[0].data.status, AccountStatus.ACTIVE);
  assert.equal(state.connectedAccountUpdates[0].data.lastError, null);
});

test("processTokenRefresh marks an account expired when refresh fails", async () => {
  const { deps, state } = createDefaultDependencies();
  deps.env.META_APP_ID = undefined;
  const storedSecret = encryptPayload({
    accessToken: "old-meta-access-token",
    tokenType: "bearer"
  });

  deps.prisma.connectedAccount.findUnique = async () => ({
    id: "account-1",
    platform: Platform.FACEBOOK,
    remoteAccountId: "user-remote-1",
    oauthCredentials: [
      {
        id: "credential-user-1",
        externalUserId: "user-remote-1",
        tokenSecrets: [
          {
            id: "secret-user-1",
            ...storedSecret
          }
        ]
      }
    ]
  });

  const service = createTokenRefreshService(deps);

  await assert.rejects(service.processTokenRefresh({ connectedAccountId: "account-1" }));
  assert.equal(state.connectedAccountUpdates.length, 1);
  assert.equal(state.connectedAccountUpdates[0].data.status, AccountStatus.EXPIRED);
  assert.match(state.connectedAccountUpdates[0].data.lastError, /not configured/i);
});
