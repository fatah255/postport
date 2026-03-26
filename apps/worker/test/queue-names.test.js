const test = require("node:test");
const assert = require("node:assert/strict");
const { QUEUES } = require("../dist/queues/queue-names.js");

test("worker queue contract includes every required queue", () => {
  assert.deepEqual(
    Object.values(QUEUES).sort(),
    [
      "housekeeping",
      "media_ingest",
      "media_transcode",
      "publish_dispatch",
      "publish_retry",
      "thumbnail_generation",
      "token_refresh"
    ]
  );
});
