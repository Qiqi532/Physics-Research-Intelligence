import { describe, expect, it, vi } from "vitest";
import { createMockAiProvider } from "../../packages/ai/src/mock-provider";
import {
  ModelSettingsRepositoryError,
  type ModelSettingsRepository,
  type StoredModelConnection,
  type StoredModelConnectionWrite,
} from "../../packages/db/src/model-settings-repository";
import {
  ModelSettingsSecretError,
  type ModelSettingsCipher,
} from "../../packages/db/src/model-settings-crypto";
import {
  createModelSettingsApi,
} from "../../apps/web/src/server/model-settings";
import { createModelTestGate } from "../../apps/web/src/server/model-test-gate";

const profileId = "11111111-1111-4111-8111-111111111111";
const otherProfileId = "22222222-2222-4222-8222-222222222222";
const testOnlyValue = ["test", "only", "value"].join("-");

describe("model settings API service", () => {
  it("encrypts a strict create request and returns only a public projection", async () => {
    const dependencies = fakes();
    dependencies.repository.create = vi.fn(async (userId, input, id) => stored({
      ...input,
      id: id ?? profileId,
      userId,
    }));
    const api = createModelSettingsApi(dependencies);

    const result = await api.create(validCreate());

    expect(result.status).toBe(201);
    expect(result.body).toEqual({ connection: expect.objectContaining({
      id: profileId,
      name: "Kimi 日常",
      hasApiKey: true,
    }) });
    expect(JSON.stringify(result.body)).not.toContain(testOnlyValue);
    expect(JSON.stringify(result.body)).not.toContain("apiKeyCiphertext");
    expect(dependencies.cipher.encrypt).toHaveBeenCalledWith({
      profileId,
      provider: "kimi",
      plaintext: testOnlyValue,
    });
    expect(dependencies.repository.create).toHaveBeenCalledWith(
      "default",
      expect.objectContaining({ apiKeyCiphertext: expect.any(Uint8Array) }),
      profileId,
    );
    await expect(api.create({ ...validCreate(), extra: true })).resolves.toMatchObject({
      status: 400,
      body: { errorCode: "settings_invalid" },
    });
  });

  it("enforces the connection limit before encryption", async () => {
    const dependencies = fakes();
    dependencies.repository.count = vi.fn().mockResolvedValue(50);
    const api = createModelSettingsApi(dependencies);

    await expect(api.create(validCreate())).resolves.toMatchObject({
      status: 409,
      body: { errorCode: "settings_connection_limit" },
    });
    expect(dependencies.cipher.encrypt).not.toHaveBeenCalled();
  });

  it("retains a key on blank edit, rotates a supplied key, and requires one after provider change", async () => {
    const dependencies = fakes();
    dependencies.repository.find = vi.fn().mockResolvedValue(stored());
    dependencies.repository.update = vi.fn(async (userId, id, input) => stored({
      ...input,
      id,
      userId,
    }));
    const api = createModelSettingsApi(dependencies);

    await expect(api.update(profileId, { name: "Kimi 新名", apiKey: "" }))
      .resolves.toMatchObject({ status: 200 });
    expect(dependencies.cipher.encrypt).not.toHaveBeenCalled();
    await expect(api.update(profileId, { apiKey: "rotated-test-value" }))
      .resolves.toMatchObject({ status: 200 });
    expect(dependencies.cipher.encrypt).toHaveBeenCalledTimes(1);
    await expect(api.update(profileId, { provider: "glm" })).resolves.toMatchObject({
      status: 400,
      body: { errorCode: "settings_api_key_required" },
    });
  });

  it("requires different providers for a task primary and fallback", async () => {
    const dependencies = fakes();
    dependencies.repository.find = vi.fn(async (_userId, id) => stored({
      id,
      name: id === profileId ? "Kimi A" : "Kimi B",
      provider: "kimi",
    }));
    const api = createModelSettingsApi(dependencies);

    await expect(api.updateRouting({
      classifyPrimaryId: profileId,
      classifyFallbackId: otherProfileId,
      interpretPrimaryId: profileId,
      interpretFallbackId: null,
    })).resolves.toMatchObject({
      status: 400,
      body: { errorCode: "settings_fallback_must_differ" },
    });
    expect(dependencies.repository.replaceRouting).not.toHaveBeenCalled();
  });

  it("rejects malformed profile ids before calling the repository", async () => {
    const dependencies = fakes();
    const api = createModelSettingsApi(dependencies);

    await expect(api.update("not-a-uuid", { name: "Valid name" })).resolves.toMatchObject({
      status: 400,
      body: { errorCode: "settings_invalid" },
    });
    await expect(api.remove("not-a-uuid")).resolves.toMatchObject({ status: 400 });
    await expect(api.health("not-a-uuid")).resolves.toMatchObject({ status: 400 });
    await expect(api.sample("not-a-uuid")).resolves.toMatchObject({ status: 400 });
    expect(dependencies.repository.find).not.toHaveBeenCalled();
    expect(dependencies.repository.remove).not.toHaveBeenCalled();
  });

  it("projects routing without exposing its internal user id", async () => {
    const dependencies = fakes();
    dependencies.repository.getRouting = vi.fn().mockResolvedValue({
      userId: "default",
      classifyPrimaryId: profileId,
      classifyFallbackId: null,
      interpretPrimaryId: otherProfileId,
      interpretFallbackId: null,
      updatedAt: new Date("2026-08-31T01:00:00.000Z"),
    });
    const api = createModelSettingsApi(dependencies);

    const result = await api.getRouting();

    expect(result).toEqual({
      status: 200,
      body: { routing: {
        classifyPrimaryId: profileId,
        classifyFallbackId: null,
        interpretPrimaryId: otherProfileId,
        interpretFallbackId: null,
        updatedAt: "2026-08-31T01:00:00.000Z",
      } },
    });
    expect(result.body).not.toHaveProperty("routing.userId");
  });

  it("maps repository errors and logs only stable safe events", async () => {
    const dependencies = fakes();
    dependencies.repository.remove = vi.fn().mockRejectedValue(
      new ModelSettingsRepositoryError("profile_in_use"),
    );
    const api = createModelSettingsApi(dependencies);

    await expect(api.remove(profileId)).resolves.toEqual({
      status: 409,
      body: { errorCode: "profile_in_use" },
    });
    expect(dependencies.logError).toHaveBeenCalledWith(expect.objectContaining({
      event: "model_settings_request",
      status: "failed",
      errorCode: "profile_in_use",
      profileId,
    }));
    expect(JSON.stringify(dependencies.logError.mock.calls)).not.toContain(testOnlyValue);
  });

  it("keeps storage and database failure details out of responses", async () => {
    const secretDependencies = fakes();
    secretDependencies.repository.find = vi.fn().mockResolvedValue(stored());
    secretDependencies.cipher.decrypt = vi.fn().mockRejectedValue(
      new ModelSettingsSecretError("secret_decryption_failed"),
    );
    const databaseDependencies = fakes();
    databaseDependencies.repository.list = vi.fn().mockRejectedValue(
      new Error(`database rejected ${testOnlyValue}`),
    );

    const health = await createModelSettingsApi(secretDependencies).health(profileId);
    const list = await createModelSettingsApi(databaseDependencies).list();

    expect(health).toEqual({
      status: 503,
      body: { errorCode: "secret_decryption_failed" },
    });
    expect(list).toEqual({
      status: 503,
      body: { errorCode: "settings_unavailable" },
    });
    expect(JSON.stringify([health, list])).not.toContain(testOnlyValue);
  });

  it("runs health through decrypted provider configuration", async () => {
    const dependencies = fakes();
    dependencies.repository.find = vi.fn().mockResolvedValue(stored());
    const api = createModelSettingsApi(dependencies);

    await expect(api.health(profileId)).resolves.toEqual({
      status: 200,
      body: {
        result: {
          status: "complete",
          provider: "kimi",
          model: "kimi-k3",
          durationMs: 4,
        },
      },
    });
    expect(dependencies.createProvider).toHaveBeenCalledWith(expect.objectContaining({
      apiKey: testOnlyValue,
      provider: "kimi",
      maxOutputTokens: 1_000,
    }));
  });
});

describe("model test gate", () => {
  it("prevents concurrent tests and applies per-kind cooldown", async () => {
    let now = 1_000;
    const gate = createModelTestGate({ now: () => now });
    let release!: (value: string) => void;
    const pending = new Promise<string>((resolve) => { release = resolve; });
    const first = gate.execute(profileId, "health", () => pending);

    await expect(gate.execute(profileId, "sample", async () => "blocked"))
      .resolves.toEqual({ accepted: false, reason: "busy" });
    release("done");
    await expect(first).resolves.toEqual({ accepted: true, value: "done" });
    await expect(gate.execute(profileId, "health", async () => "too-soon"))
      .resolves.toEqual({ accepted: false, reason: "cooldown", retryAfterMs: 5_000 });
    now += 5_000;
    await expect(gate.execute(profileId, "health", async () => "ready"))
      .resolves.toEqual({ accepted: true, value: "ready" });
    await expect(gate.execute(profileId, "sample", async () => "sample"))
      .resolves.toEqual({ accepted: true, value: "sample" });
    await expect(gate.execute(profileId, "sample", async () => "too-soon"))
      .resolves.toEqual({ accepted: false, reason: "cooldown", retryAfterMs: 60_000 });
  });
});

function fakes() {
  const repository = {
    count: vi.fn().mockResolvedValue(0),
    list: vi.fn().mockResolvedValue([]),
    find: vi.fn().mockResolvedValue(null),
    create: vi.fn(),
    update: vi.fn(),
    remove: vi.fn().mockResolvedValue(undefined),
    getRouting: vi.fn().mockResolvedValue(null),
    replaceRouting: vi.fn(),
  } satisfies ModelSettingsRepository;
  const cipher = {
    encrypt: vi.fn().mockResolvedValue({
      ciphertext: Buffer.from("ciphertext"),
      nonce: Buffer.alloc(12, 1),
      authTag: Buffer.alloc(16, 2),
      encryptionVersion: 1 as const,
    }),
    decrypt: vi.fn().mockResolvedValue(testOnlyValue),
  } satisfies ModelSettingsCipher;
  const provider = createMockAiProvider({
    name: "kimi",
    model: "kimi-k3",
    health: { ok: true, durationMs: 4 },
  });
  return {
    repository,
    cipher,
    createProvider: vi.fn().mockReturnValue(provider),
    testGate: createModelTestGate(),
    createId: () => profileId,
    logError: vi.fn(),
  };
}

function validCreate() {
  return {
    name: "Kimi 日常",
    provider: "kimi" as const,
    model: "kimi-k3",
    apiKey: testOnlyValue,
    baseUrl: "https://api.moonshot.cn/v1",
    requestTimeoutMs: 30_000,
  };
}

function stored(overrides: Partial<StoredModelConnection> = {}): StoredModelConnection {
  const write: StoredModelConnectionWrite = {
    name: "Kimi 日常",
    provider: "kimi",
    model: "kimi-k3",
    baseUrl: "https://api.moonshot.cn/v1",
    apiKeyCiphertext: Buffer.from("ciphertext"),
    apiKeyNonce: Buffer.alloc(12, 1),
    apiKeyAuthTag: Buffer.alloc(16, 2),
    encryptionVersion: 1,
    requestTimeoutMs: 30_000,
  };
  return {
    id: profileId,
    userId: "default",
    ...write,
    createdAt: new Date("2026-08-31T00:00:00.000Z"),
    updatedAt: new Date("2026-08-31T00:00:00.000Z"),
    ...overrides,
  };
}
