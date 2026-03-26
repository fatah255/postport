import { z } from "zod";

const baseEnvSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  LOG_LEVEL: z.string().default("info")
});

const apiEnvSchema = baseEnvSchema.extend({
  API_PORT: z.coerce.number().default(3001),
  API_BASE_URL: z.string().url(),
  CORS_ORIGIN: z.string().min(1),
  DATABASE_URL: z.string().min(1),
  REDIS_URL: z.string().min(1),
  JWT_ACCESS_SECRET: z.string().min(32),
  JWT_REFRESH_SECRET: z.string().min(32),
  SESSION_COOKIE_NAME: z.string().default("postport_session"),
  TOKEN_ENCRYPTION_KEY: z.string().min(16),
  RATE_LIMIT_TTL: z.coerce.number().default(60),
  RATE_LIMIT_LIMIT: z.coerce.number().default(120),
  SIGNED_UPLOAD_EXPIRY_SECONDS: z.coerce.number().default(900),
  SIGNED_MEDIA_URL_EXPIRY_SECONDS: z.coerce.number().default(3600),
  S3_ENDPOINT: z.string().min(1),
  S3_REGION: z.string().default("auto"),
  S3_ACCESS_KEY: z.string().min(1),
  S3_SECRET_KEY: z.string().min(1),
  S3_BUCKET: z.string().min(1),
  S3_FORCE_PATH_STYLE: z.coerce.boolean().default(true),
  ALLOW_MOCK_CONNECTIONS: z.coerce.boolean().optional(),
  META_APP_ID: z.string().optional(),
  META_APP_SECRET: z.string().optional(),
  META_LOGIN_CONFIG_ID: z.string().optional(),
  META_REDIRECT_URI: z.string().url().optional(),
  META_API_VERSION: z.string().default("v23.0"),
  TIKTOK_CLIENT_KEY: z.string().optional(),
  TIKTOK_CLIENT_SECRET: z.string().optional(),
  TIKTOK_REDIRECT_URI: z.string().url().optional()
});

const webEnvSchema = baseEnvSchema.extend({
  NEXT_PUBLIC_API_URL: z.string().url(),
  NEXT_PUBLIC_DEFAULT_LOCALE: z.enum(["en", "fr", "ar"]).default("en")
});

const workerEnvSchema = baseEnvSchema.extend({
  REDIS_URL: z.string().min(1),
  DATABASE_URL: z.string().min(1),
  API_BASE_URL: z.string().url(),
  TOKEN_ENCRYPTION_KEY: z.string().min(16),
  S3_ENDPOINT: z.string().min(1),
  S3_REGION: z.string().default("auto"),
  S3_ACCESS_KEY: z.string().min(1),
  S3_SECRET_KEY: z.string().min(1),
  S3_BUCKET: z.string().min(1),
  S3_FORCE_PATH_STYLE: z.coerce.boolean().default(true),
  SIGNED_MEDIA_URL_EXPIRY_SECONDS: z.coerce.number().default(3600),
  MEDIA_PROCESSING_TEMP_DIR: z.string().default(".tmp/media-processing"),
  META_API_VERSION: z.string().default("v23.0"),
  META_APP_ID: z.string().optional(),
  META_APP_SECRET: z.string().optional(),
  TIKTOK_CLIENT_KEY: z.string().optional(),
  TIKTOK_CLIENT_SECRET: z.string().optional()
});

export type BaseEnv = z.infer<typeof baseEnvSchema>;
export type WebEnv = z.infer<typeof webEnvSchema>;
export type WorkerEnv = z.infer<typeof workerEnvSchema>;
export type ApiEnv = Omit<z.infer<typeof apiEnvSchema>, "ALLOW_MOCK_CONNECTIONS"> & {
  ALLOW_MOCK_CONNECTIONS: boolean;
};

export const parseApiEnv = (raw: Record<string, string | undefined>): ApiEnv => {
  const parsed = apiEnvSchema.parse(raw);

  return {
    ...parsed,
    ALLOW_MOCK_CONNECTIONS:
      parsed.ALLOW_MOCK_CONNECTIONS ?? parsed.NODE_ENV !== "production"
  };
};

export const parseWebEnv = (raw: Record<string, string | undefined>): WebEnv => {
  return webEnvSchema.parse(raw);
};

export const parseWorkerEnv = (raw: Record<string, string | undefined>): WorkerEnv => {
  return workerEnvSchema.parse(raw);
};
