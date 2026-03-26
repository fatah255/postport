import test from "node:test";
import assert from "node:assert/strict";
import { decryptText, encryptText, redactSecrets, sha256 } from "../dist/index.js";

test("encryptText and decryptText round-trip values", () => {
  const encrypted = encryptText("postport-secret", "workspace-key");
  const decrypted = decryptText(
    {
      iv: encrypted.iv,
      tag: encrypted.tag,
      value: encrypted.value
    },
    "workspace-key"
  );

  assert.equal(decrypted, "postport-secret");
});

test("redactSecrets masks sensitive keys without mutating unrelated fields", () => {
  const result = redactSecrets({
    access_token: "abc123",
    caption: "Launch day"
  });

  assert.equal(result.access_token, "***redacted***");
  assert.equal(result.caption, "Launch day");
  assert.equal(sha256("postport").length, 64);
});
