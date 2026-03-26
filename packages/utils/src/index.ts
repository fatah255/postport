import { createCipheriv, createDecipheriv, createHash, randomBytes, randomUUID } from "node:crypto";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12;

export const createId = (): string => {
  return randomUUID();
};

export const sha256 = (value: string): string => {
  return createHash("sha256").update(value).digest("hex");
};

export interface EncryptedValue {
  iv: string;
  tag: string;
  value: string;
}

export const encryptText = (plainText: string, key: string): EncryptedValue => {
  const normalizedKey = createHash("sha256").update(key).digest();
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, normalizedKey, iv);
  const encrypted = Buffer.concat([cipher.update(plainText, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();

  return {
    iv: iv.toString("base64"),
    tag: tag.toString("base64"),
    value: encrypted.toString("base64")
  };
};

export const decryptText = (payload: EncryptedValue, key: string): string => {
  const normalizedKey = createHash("sha256").update(key).digest();
  const decipher = createDecipheriv(ALGORITHM, normalizedKey, Buffer.from(payload.iv, "base64"));
  decipher.setAuthTag(Buffer.from(payload.tag, "base64"));
  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(payload.value, "base64")),
    decipher.final()
  ]);
  return decrypted.toString("utf8");
};

export const redactSecrets = <T extends Record<string, unknown>>(
  input: T,
  keys: string[] = ["access_token", "refresh_token", "token", "secret", "password"]
): T => {
  const output = structuredClone(input);
  for (const [key, value] of Object.entries(output)) {
    if (keys.includes(key.toLowerCase())) {
      // @ts-expect-error generic record assignment
      output[key] = value ? "***redacted***" : value;
    }
  }
  return output;
};
