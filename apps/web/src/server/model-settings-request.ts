import { MAX_MODEL_SETTINGS_REQUEST_BYTES } from "@pri/domain/model-settings";

export type ModelSettingsRequestErrorCode =
  | "settings_json_required"
  | "settings_local_only"
  | "settings_origin_rejected"
  | "settings_origin_required"
  | "settings_request_too_large";

export type ModelSettingsMutationGuard =
  | { ok: true }
  | {
      ok: false;
      status: 403 | 413 | 415;
      errorCode: ModelSettingsRequestErrorCode;
    };

export type BoundedJsonResult =
  | { status: "ok"; value: unknown; bytes: number }
  | { status: "invalid"; bytes: number }
  | { status: "too_large" };

export function validateModelSettingsMutation(
  request: Request,
  options: { lanMode: boolean; requireJson?: boolean },
): ModelSettingsMutationGuard {
  if (options.lanMode) {
    return rejected(403, "settings_local_only");
  }
  const origin = request.headers.get("origin");
  if (!origin) {
    return rejected(403, "settings_origin_required");
  }
  try {
    const requestUrl = new URL(request.url);
    const host = request.headers.get("host");
    const expectedOrigin = host
      ? new URL(`${requestUrl.protocol}//${host}`).origin
      : requestUrl.origin;
    if (new URL(origin).origin !== expectedOrigin) {
      return rejected(403, "settings_origin_rejected");
    }
  } catch {
    return rejected(403, "settings_origin_rejected");
  }
  if (options.requireJson !== false) {
    const contentType = request.headers.get("content-type")?.split(";", 1)[0]?.trim()
      .toLowerCase();
    if (contentType !== "application/json") {
      return rejected(415, "settings_json_required");
    }
    const contentLength = Number(request.headers.get("content-length"));
    if (Number.isFinite(contentLength) && contentLength > MAX_MODEL_SETTINGS_REQUEST_BYTES) {
      return rejected(413, "settings_request_too_large");
    }
  }
  return { ok: true };
}

export async function readBoundedJson(
  request: Request,
  maxBytes = MAX_MODEL_SETTINGS_REQUEST_BYTES,
): Promise<BoundedJsonResult> {
  if (!request.body) {
    return { status: "invalid", bytes: 0 };
  }
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let bytes = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    bytes += value.byteLength;
    if (bytes > maxBytes) {
      await reader.cancel().catch(() => undefined);
      return { status: "too_large" };
    }
    chunks.push(value);
  }
  const merged = new Uint8Array(bytes);
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.byteLength;
  }
  try {
    return {
      status: "ok",
      value: JSON.parse(new TextDecoder().decode(merged)),
      bytes,
    };
  } catch {
    return { status: "invalid", bytes };
  }
}

function rejected(
  status: 403 | 413 | 415,
  errorCode: ModelSettingsRequestErrorCode,
): ModelSettingsMutationGuard {
  return { ok: false, status, errorCode };
}
