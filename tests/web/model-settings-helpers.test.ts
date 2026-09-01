import { describe, expect, it } from "vitest";
import {
  applyProviderPreset,
  connectionDraft,
  connectionPayload,
} from "../../apps/web/src/components/model-connection-form";
import {
  routingPayload,
  routingValidationError,
} from "../../apps/web/src/components/model-routing-form";
import { modelSettingsErrorMessage } from "../../apps/web/src/components/model-test-result";

const testOnlyValue = ["test", "only", "value"].join("-");

describe("model settings client helpers", () => {
  it("omits a blank edit key and includes a newly supplied key", () => {
    const blank = connectionDraft(connection());
    const rotated = { ...blank, apiKey: testOnlyValue };

    expect(connectionPayload(blank, "edit")).not.toHaveProperty("apiKey");
    expect(connectionPayload(rotated, "edit")).toMatchObject({ apiKey: testOnlyValue });
  });

  it("copies non-sensitive fields and applies provider presets", () => {
    const copied = connectionDraft(connection(), true);
    const glm = applyProviderPreset(copied, "glm");

    expect(copied.name).toBe("Kimi 日常 副本");
    expect(copied.apiKey).toBe("");
    expect(glm).toMatchObject({
      provider: "glm",
      model: "glm-5.2",
      baseUrl: "https://open.bigmodel.cn/api/paas/v4",
    });
    expect(connectionDraft(connection())).toEqual(connectionDraft(connection()));
  });

  it("builds four explicit routing fields and rejects same-provider fallback", () => {
    const draft = {
      classifyPrimaryId: "kimi-a",
      classifyFallbackId: "glm-a",
      interpretPrimaryId: "kimi-b",
      interpretFallbackId: "",
    };
    expect(routingPayload(draft)).toEqual({
      classifyPrimaryId: "kimi-a",
      classifyFallbackId: "glm-a",
      interpretPrimaryId: "kimi-b",
      interpretFallbackId: null,
    });
    expect(routingValidationError({
      ...draft,
      classifyFallbackId: "kimi-b",
    }, [
      connection({ id: "kimi-a", provider: "kimi" }),
      connection({ id: "kimi-b", provider: "kimi" }),
    ])).toContain("不同供应商");
  });

  it("maps only stable safe error codes to user-facing text", () => {
    expect(modelSettingsErrorMessage("authentication")).toContain("API Key");
    expect(modelSettingsErrorMessage("settings_test_cooldown")).toContain("稍后");
    expect(modelSettingsErrorMessage("secret_key_unavailable")).toContain("密钥存储");
    expect(modelSettingsErrorMessage("secret_decryption_failed")).toContain("重新填写");
    expect(modelSettingsErrorMessage("unknown_internal_detail")).toBe("操作失败，请稍后重试。");
  });
});

function connection(overrides: Record<string, unknown> = {}) {
  return {
    id: "11111111-1111-4111-8111-111111111111",
    name: "Kimi 日常",
    provider: "kimi" as const,
    model: "kimi-k3",
    baseUrl: "https://api.moonshot.cn/v1",
    requestTimeoutMs: 30_000,
    hasApiKey: true as const,
    createdAt: "2026-08-31T00:00:00.000Z",
    updatedAt: "2026-08-31T00:00:00.000Z",
    ...overrides,
  };
}
