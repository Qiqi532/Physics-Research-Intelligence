import { describe, expect, it } from "vitest";
import { MAX_MODEL_SETTINGS_REQUEST_BYTES } from "../../packages/domain/src/model-settings";
import {
  readBoundedJson,
  validateModelSettingsMutation,
} from "../../apps/web/src/server/model-settings-request";

describe("model settings mutation request guard", () => {
  it("accepts same-origin JSON mutations in local mode", () => {
    expect(validateModelSettingsMutation(request(), { lanMode: false })).toEqual({ ok: true });
  });

  it("rejects every mutation in explicit LAN mode", () => {
    expect(validateModelSettingsMutation(request(), { lanMode: true })).toEqual({
      ok: false,
      status: 403,
      errorCode: "settings_local_only",
    });
  });

  it.each([
    [undefined, "settings_origin_required"],
    ["http://localhost:3000", "settings_origin_rejected"],
    ["https://attacker.example.test", "settings_origin_rejected"],
  ])("rejects unsafe origin %s", (origin, errorCode) => {
    expect(validateModelSettingsMutation(request({ origin }), { lanMode: false })).toEqual({
      ok: false,
      status: 403,
      errorCode,
    });
  });

  it.each([undefined, "text/plain", "application/x-www-form-urlencoded"])(
    "rejects content type %s",
    (contentType) => {
      expect(validateModelSettingsMutation(request({ contentType }), { lanMode: false }))
        .toEqual({
          ok: false,
          status: 415,
          errorCode: "settings_json_required",
        });
    },
  );

  it("rejects an oversized declared body before reading it", () => {
    expect(validateModelSettingsMutation(request({
      contentLength: String(MAX_MODEL_SETTINGS_REQUEST_BYTES + 1),
    }), { lanMode: false })).toEqual({
      ok: false,
      status: 413,
      errorCode: "settings_request_too_large",
    });
  });
});

describe("bounded JSON reader", () => {
  it("reads valid JSON at the exact limit", async () => {
    const paddingLength = MAX_MODEL_SETTINGS_REQUEST_BYTES - JSON.stringify({ value: "" }).length;
    const body = JSON.stringify({ value: "x".repeat(paddingLength) });

    await expect(readBoundedJson(request({ body }), MAX_MODEL_SETTINGS_REQUEST_BYTES))
      .resolves.toEqual({
        status: "ok",
        value: { value: "x".repeat(paddingLength) },
        bytes: MAX_MODEL_SETTINGS_REQUEST_BYTES,
      });
  });

  it("cancels a streamed body after it crosses the limit", async () => {
    const body = JSON.stringify({ value: "x".repeat(MAX_MODEL_SETTINGS_REQUEST_BYTES) });

    await expect(readBoundedJson(request({ body }), MAX_MODEL_SETTINGS_REQUEST_BYTES))
      .resolves.toEqual({ status: "too_large" });
  });

  it("returns invalid for a missing or malformed body", async () => {
    await expect(readBoundedJson(request({ body: null }))).resolves.toEqual({
      status: "invalid",
      bytes: 0,
    });
    await expect(readBoundedJson(request({ body: "{" }))).resolves.toEqual({
      status: "invalid",
      bytes: 1,
    });
  });
});

function request(options: {
  body?: string | null;
  contentLength?: string;
  contentType?: string;
  origin?: string;
} = {}): Request {
  const headers = new Headers();
  const contentType = "contentType" in options ? options.contentType : "application/json";
  const origin = "origin" in options ? options.origin : "http://127.0.0.1:3000";
  if (contentType) headers.set("content-type", contentType);
  if (origin) headers.set("origin", origin);
  if (options.contentLength) headers.set("content-length", options.contentLength);
  const body = "body" in options ? options.body : "{}";
  return new Request("http://127.0.0.1:3000/api/model-connections", {
    method: "POST",
    headers,
    body,
  });
}
