import { describe, expect, it } from "vitest";
import {
  MAX_MODEL_CONNECTIONS,
  MAX_MODEL_SETTINGS_REQUEST_BYTES,
  parseModelConnectionCreate,
  parseModelConnectionUpdate,
  parseModelRoutingUpdate,
} from "../../packages/domain/src/model-settings";

const testOnlyValue = ["test", "only", "value"].join("-");

describe("model settings domain boundary", () => {
  it("parses a strict named connection", () => {
    expect(parseModelConnectionCreate(validConnection())).toEqual({
      name: "Kimi 日常",
      provider: "kimi",
      model: "kimi-k3",
      apiKey: testOnlyValue,
      baseUrl: "https://api.moonshot.cn/v1",
      requestTimeoutMs: 45_000,
      inputCostPerMillionUsd: 1,
      outputCostPerMillionUsd: 3,
    });
    expect(MAX_MODEL_SETTINGS_REQUEST_BYTES).toBe(16 * 1024);
    expect(MAX_MODEL_CONNECTIONS).toBe(50);
  });

  it.each([
    { extra: true },
    { name: "" },
    { name: "x".repeat(65) },
    { model: "x".repeat(129) },
    { apiKey: "" },
    { apiKey: "x".repeat(8_193) },
    { provider: "unknown" },
    { baseUrl: "http://remote.example.test/v1" },
    { baseUrl: "ftp://127.0.0.1/v1" },
    { requestTimeoutMs: 999 },
    { requestTimeoutMs: 120_001 },
    { inputCostPerMillionUsd: -1 },
    { outputCostPerMillionUsd: 10_001 },
  ])("rejects an unsafe create payload %#", (override) => {
    expect(() => parseModelConnectionCreate(validConnection(override))).toThrow();
  });

  it.each([
    "http://127.0.0.1:11434/v1",
    "http://localhost:11434/v1",
    "http://[::1]:11434/v1",
  ])("allows a loopback HTTP compatible endpoint %s", (baseUrl) => {
    expect(parseModelConnectionCreate(validConnection({ baseUrl })).baseUrl).toBe(baseUrl);
  });

  it("omits a blank update key so the stored key is retained", () => {
    expect(parseModelConnectionUpdate({ name: "Kimi 新名", apiKey: "" })).toEqual({
      name: "Kimi 新名",
    });
    expect(() => parseModelConnectionUpdate({})).toThrow();
    expect(() => parseModelConnectionUpdate({ name: "valid", extra: true })).toThrow();
  });

  it("parses strict nullable task routing ids", () => {
    const primary = "11111111-1111-4111-8111-111111111111";
    expect(parseModelRoutingUpdate({
      classifyPrimaryId: primary,
      classifyFallbackId: null,
      interpretPrimaryId: primary,
      interpretFallbackId: null,
    })).toEqual({
      classifyPrimaryId: primary,
      classifyFallbackId: null,
      interpretPrimaryId: primary,
      interpretFallbackId: null,
    });
    expect(() => parseModelRoutingUpdate({
      classifyPrimaryId: "not-a-uuid",
      classifyFallbackId: null,
      interpretPrimaryId: primary,
      interpretFallbackId: null,
    })).toThrow();
  });
});

function validConnection(overrides: Record<string, unknown> = {}) {
  return {
    name: "Kimi 日常",
    provider: "kimi",
    model: "kimi-k3",
    apiKey: testOnlyValue,
    baseUrl: "https://api.moonshot.cn/v1",
    requestTimeoutMs: 45_000,
    inputCostPerMillionUsd: 1,
    outputCostPerMillionUsd: 3,
    ...overrides,
  };
}
