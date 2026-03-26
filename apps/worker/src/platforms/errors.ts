import type { NormalizedError, NormalizedErrorKind } from "@postport/platform-sdk";

export class PlatformPublishError extends Error {
  constructor(
    message: string,
    public readonly kind: NormalizedErrorKind,
    public readonly code: string,
    public readonly retryable: boolean,
    public readonly status?: number,
    public readonly raw?: Record<string, unknown>
  ) {
    super(message);
    this.name = "PlatformPublishError";
  }

  toNormalizedError(): NormalizedError {
    return {
      kind: this.kind,
      code: this.code,
      message: this.message,
      retryable: this.retryable,
      raw: this.raw
    };
  }
}

export const ensureRecord = (value: unknown): Record<string, unknown> => {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
};
