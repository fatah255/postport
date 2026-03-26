import { redactSecrets } from "@postport/utils";
import { PlatformPublishError, ensureRecord } from "./errors";

interface JsonRequestOptions extends RequestInit {
  fallbackErrorKind?: "transient" | "auth" | "permissions" | "validation" | "platform_limit" | "unsupported";
  fallbackErrorCode?: string;
}

export const requestJson = async <T>(url: string, options?: JsonRequestOptions): Promise<T> => {
  let response: Response;
  try {
    response = await fetch(url, options);
  } catch (error) {
    throw new PlatformPublishError(
      error instanceof Error ? error.message : "Remote request failed.",
      options?.fallbackErrorKind ?? "transient",
      options?.fallbackErrorCode ?? "network_error",
      true
    );
  }

  const bodyText = await response.text();
  const parsed = parseJson(bodyText);

  if (!response.ok) {
    const normalized = normalizeRemoteError(response.status, parsed, options);
    throw normalized;
  }

  return parsed as T;
};

export const requestBuffer = async (url: string, options?: JsonRequestOptions): Promise<Buffer> => {
  let response: Response;
  try {
    response = await fetch(url, options);
  } catch (error) {
    throw new PlatformPublishError(
      error instanceof Error ? error.message : "Remote request failed.",
      options?.fallbackErrorKind ?? "transient",
      options?.fallbackErrorCode ?? "network_error",
      true
    );
  }

  if (!response.ok) {
    const bodyText = await response.text();
    const parsed = parseJson(bodyText);
    throw normalizeRemoteError(response.status, parsed, options);
  }

  return Buffer.from(await response.arrayBuffer());
};

const parseJson = (bodyText: string): unknown => {
  if (!bodyText) {
    return {};
  }

  try {
    return JSON.parse(bodyText) as unknown;
  } catch {
    return {
      raw: bodyText
    };
  }
};

const normalizeRemoteError = (status: number, payload: unknown, options?: JsonRequestOptions) => {
  const body = redactSecrets(ensureRecord(payload));
  const message = extractMessage(body) ?? `Remote API request failed with status ${status}.`;
  const code = extractCode(body) ?? options?.fallbackErrorCode ?? `http_${status}`;

  if (status === 401) {
    return new PlatformPublishError(message, "auth", code, false, status, body);
  }

  if (status === 403) {
    return new PlatformPublishError(message, "permissions", code, false, status, body);
  }

  if (status === 409) {
    return new PlatformPublishError(message, "validation", code, false, status, body);
  }

  if (status === 429) {
    return new PlatformPublishError(message, "platform_limit", code, true, status, body);
  }

  if (status >= 400 && status < 500) {
    return new PlatformPublishError(
      message,
      options?.fallbackErrorKind ?? "validation",
      code,
      false,
      status,
      body
    );
  }

  return new PlatformPublishError(
    message,
    options?.fallbackErrorKind ?? "transient",
    code,
    true,
    status,
    body
  );
};

const extractMessage = (body: Record<string, unknown>): string | null => {
  const errorValue = body.error;
  if (errorValue && typeof errorValue === "object" && !Array.isArray(errorValue)) {
    const nested = errorValue as Record<string, unknown>;
    if (typeof nested.message === "string") {
      return nested.message;
    }
  }

  if (typeof body.message === "string") {
    return body.message;
  }

  const data = body.data;
  if (data && typeof data === "object" && !Array.isArray(data)) {
    const nested = data as Record<string, unknown>;
    if (typeof nested.description === "string") {
      return nested.description;
    }
  }

  return null;
};

const extractCode = (body: Record<string, unknown>): string | null => {
  const errorValue = body.error;
  if (errorValue && typeof errorValue === "object" && !Array.isArray(errorValue)) {
    const nested = errorValue as Record<string, unknown>;
    if (typeof nested.code === "string") {
      return nested.code;
    }
    if (typeof nested.error_subcode === "number") {
      return `subcode_${nested.error_subcode}`;
    }
    if (typeof nested.type === "string") {
      return nested.type;
    }
  }

  if (typeof body.code === "string") {
    return body.code;
  }

  return null;
};
