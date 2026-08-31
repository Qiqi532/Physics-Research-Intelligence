import { randomUUID } from "node:crypto";
import {
  createConnectionProvider,
  runConnectionHealth,
  runConnectionSample,
  type ConnectionProviderInput,
} from "@pri/ai";
import {
  createModelSettingsCipher,
  createModelSettingsRepository,
  createPrismaClient,
  ModelSettingsRepositoryError,
  ModelSettingsSecretError,
  type ModelSettingsCipher,
  type ModelSettingsRepository,
  type StoredModelConnection,
  type StoredModelConnectionWrite,
  type StoredModelRouting,
} from "@pri/db";
import { parseConfig, toLogSafeData } from "@pri/domain/config";
import {
  MAX_MODEL_CONNECTIONS,
  parseModelConnectionId,
  parseModelConnectionCreate,
  parseModelConnectionUpdate,
  parseModelRoutingUpdate,
  type ModelConnectionPublic,
  type ModelRoutingUpdateInput,
} from "@pri/domain/model-settings";
import type { ApiResult } from "./papers";
import { createModelTestGate, type ModelTestGate } from "./model-test-gate";

const userId = "default";
const healthMaxOutputTokens = 1_000;
const sampleInterpretMaxOutputTokens = 4_000;
const configuredTestGate = createModelTestGate();

export type ModelSettingsLogEvent = {
  event: "model_settings_request";
  operation: string;
  status: "failed";
  errorCode: string;
  profileId?: string;
  provider?: string;
  model?: string;
};

type ModelSettingsApiInput = {
  repository: ModelSettingsRepository;
  cipher: ModelSettingsCipher;
  createProvider: typeof createConnectionProvider;
  testGate: ModelTestGate;
  createId?: () => string;
  logError?: (event: ModelSettingsLogEvent) => void;
};

export function createModelSettingsApi(input: ModelSettingsApiInput) {
  const createId = input.createId ?? randomUUID;
  const logError = input.logError ?? (() => undefined);

  return {
    async list(): Promise<ApiResult> {
      try {
        return {
          status: 200,
          body: { connections: (await input.repository.list(userId)).map(toPublicConnection) },
        };
      } catch (error) {
        return failure(error, { operation: "list" }, logError);
      }
    },

    async create(body: unknown): Promise<ApiResult> {
      let parsed;
      try {
        parsed = parseModelConnectionCreate(body);
      } catch {
        return errorResult(400, "settings_invalid");
      }
      try {
        if (await input.repository.count(userId) >= MAX_MODEL_CONNECTIONS) {
          return errorResult(409, "settings_connection_limit");
        }
        const id = createId();
        const encrypted = await input.cipher.encrypt({
          profileId: id,
          provider: parsed.provider,
          plaintext: parsed.apiKey,
        });
        const connection = await input.repository.create(
          userId,
          toStoredWrite(parsed, encrypted),
          id,
        );
        return { status: 201, body: { connection: toPublicConnection(connection) } };
      } catch (error) {
        return failure(error, { operation: "create", provider: parsed.provider }, logError);
      }
    },

    async update(id: string, body: unknown): Promise<ApiResult> {
      if (!validProfileId(id)) return errorResult(400, "settings_invalid");
      let parsed;
      try {
        parsed = parseModelConnectionUpdate(body);
      } catch {
        return errorResult(400, "settings_invalid");
      }
      try {
        const existing = await input.repository.find(userId, id);
        if (!existing) return errorResult(404, "profile_not_found");
        const provider = parsed.provider ?? existing.provider;
        if (provider !== existing.provider && !parsed.apiKey) {
          return errorResult(400, "settings_api_key_required");
        }
        const secret = parsed.apiKey
          ? await input.cipher.encrypt({ profileId: id, provider, plaintext: parsed.apiKey })
          : storedSecret(existing);
        const updated = await input.repository.update(userId, id, {
          name: parsed.name ?? existing.name,
          provider,
          model: parsed.model ?? existing.model,
          baseUrl: parsed.baseUrl ?? existing.baseUrl,
          requestTimeoutMs: parsed.requestTimeoutMs ?? existing.requestTimeoutMs,
          inputCostPerMillionUsd: parsed.inputCostPerMillionUsd
            ?? existing.inputCostPerMillionUsd,
          outputCostPerMillionUsd: parsed.outputCostPerMillionUsd
            ?? existing.outputCostPerMillionUsd,
          ...toStoredSecret(secret),
        });
        return { status: 200, body: { connection: toPublicConnection(updated) } };
      } catch (error) {
        return failure(error, { operation: "update", profileId: id }, logError);
      }
    },

    async remove(id: string): Promise<ApiResult> {
      if (!validProfileId(id)) return errorResult(400, "settings_invalid");
      try {
        await input.repository.remove(userId, id);
        return { status: 204, body: null };
      } catch (error) {
        return failure(error, { operation: "remove", profileId: id }, logError);
      }
    },

    async getRouting(): Promise<ApiResult> {
      try {
        const routing = await input.repository.getRouting(userId);
        return { status: 200, body: { routing: routing ? toPublicRouting(routing) : null } };
      } catch (error) {
        return failure(error, { operation: "get_routing" }, logError);
      }
    },

    async updateRouting(body: unknown): Promise<ApiResult> {
      let parsed;
      try {
        parsed = parseModelRoutingUpdate(body);
      } catch {
        return errorResult(400, "settings_invalid");
      }
      try {
        const profiles = await findRoutingProfiles(input.repository, parsed);
        if (!profiles.ok) return errorResult(404, "profile_not_found");
        if (!validTaskRoute(parsed.classifyPrimaryId, parsed.classifyFallbackId, profiles.values)
          || !validTaskRoute(
            parsed.interpretPrimaryId,
            parsed.interpretFallbackId,
            profiles.values,
          )) {
          return errorResult(400, "settings_fallback_must_differ");
        }
        const routing = await input.repository.replaceRouting(userId, parsed);
        return { status: 200, body: { routing: toPublicRouting(routing) } };
      } catch (error) {
        return failure(error, { operation: "update_routing" }, logError);
      }
    },

    health(id: string): Promise<ApiResult> {
      return runTest("health", id, healthMaxOutputTokens);
    },

    sample(id: string): Promise<ApiResult> {
      return runTest("sample", id, healthMaxOutputTokens);
    },
  };

  async function runTest(
    kind: "health" | "sample",
    id: string,
    maxOutputTokens: number,
  ): Promise<ApiResult> {
    if (!validProfileId(id)) return errorResult(400, "settings_invalid");
    try {
      const connection = await input.repository.find(userId, id);
      if (!connection) return errorResult(404, "profile_not_found");
      const gated = await input.testGate.execute(id, kind, async () => {
        const apiKey = await input.cipher.decrypt({
          profileId: connection.id,
          provider: connection.provider,
          ...storedSecret(connection),
        });
        if (kind === "health") {
          return runConnectionHealth(input.createProvider(providerInput(
            connection,
            apiKey,
            maxOutputTokens,
          )));
        }
        return runConnectionSample({
          classificationProvider: input.createProvider(providerInput(
            connection,
            apiKey,
            healthMaxOutputTokens,
          )),
          interpretationProvider: input.createProvider(providerInput(
            connection,
            apiKey,
            sampleInterpretMaxOutputTokens,
          )),
          prices: {
            inputCostPerMillionUsd: connection.inputCostPerMillionUsd,
            outputCostPerMillionUsd: connection.outputCostPerMillionUsd,
          },
        });
      });
      if (!gated.accepted) {
        return gated.reason === "busy"
          ? errorResult(409, "settings_test_in_progress")
          : {
              status: 429,
              body: {
                errorCode: "settings_test_cooldown",
                retryAfterMs: gated.retryAfterMs,
              },
            };
      }
      return { status: 200, body: { result: gated.value } };
    } catch (error) {
      return failure(error, { operation: kind, profileId: id }, logError);
    }
  }
}

export async function withConfiguredModelSettingsApi(
  operation: (api: ReturnType<typeof createModelSettingsApi>) => Promise<ApiResult>,
): Promise<ApiResult> {
  let client: ReturnType<typeof createPrismaClient> | undefined;
  try {
    const config = parseConfig(process.env);
    client = createPrismaClient(config.DATABASE_URL);
    return await operation(createModelSettingsApi({
      repository: createModelSettingsRepository(client),
      cipher: createModelSettingsCipher({ keyFilePath: config.AI_SETTINGS_MASTER_KEY_FILE }),
      createProvider: createConnectionProvider,
      testGate: configuredTestGate,
      logError: (event) => console.error(event.event, toLogSafeData(event)),
    }));
  } catch (error) {
    console.error("model_settings_initialization", toLogSafeData(error));
    return errorResult(503, "settings_unavailable");
  } finally {
    await client?.$disconnect();
  }
}

function toPublicConnection(connection: StoredModelConnection): ModelConnectionPublic {
  return {
    id: connection.id,
    name: connection.name,
    provider: connection.provider,
    model: connection.model,
    baseUrl: connection.baseUrl,
    requestTimeoutMs: connection.requestTimeoutMs,
    inputCostPerMillionUsd: connection.inputCostPerMillionUsd,
    outputCostPerMillionUsd: connection.outputCostPerMillionUsd,
    hasApiKey: true,
    createdAt: connection.createdAt.toISOString(),
    updatedAt: connection.updatedAt.toISOString(),
  };
}

function toPublicRouting(routing: StoredModelRouting) {
  return {
    classifyPrimaryId: routing.classifyPrimaryId,
    classifyFallbackId: routing.classifyFallbackId,
    interpretPrimaryId: routing.interpretPrimaryId,
    interpretFallbackId: routing.interpretFallbackId,
    updatedAt: routing.updatedAt.toISOString(),
  };
}

function validProfileId(id: string): boolean {
  try {
    parseModelConnectionId(id);
    return true;
  } catch {
    return false;
  }
}

type EncryptedSecret = Awaited<ReturnType<ModelSettingsCipher["encrypt"]>>;

function toStoredWrite(
  parsed: ReturnType<typeof parseModelConnectionCreate>,
  secret: EncryptedSecret,
): StoredModelConnectionWrite {
  return {
    name: parsed.name,
    provider: parsed.provider,
    model: parsed.model,
    baseUrl: parsed.baseUrl,
    requestTimeoutMs: parsed.requestTimeoutMs,
    inputCostPerMillionUsd: parsed.inputCostPerMillionUsd,
    outputCostPerMillionUsd: parsed.outputCostPerMillionUsd,
    ...toStoredSecret(secret),
  };
}

function toStoredSecret(secret: EncryptedSecret) {
  return {
    apiKeyCiphertext: Buffer.from(secret.ciphertext),
    apiKeyNonce: Buffer.from(secret.nonce),
    apiKeyAuthTag: Buffer.from(secret.authTag),
    encryptionVersion: secret.encryptionVersion,
  };
}

function storedSecret(connection: StoredModelConnection): EncryptedSecret {
  return {
    ciphertext: connection.apiKeyCiphertext,
    nonce: connection.apiKeyNonce,
    authTag: connection.apiKeyAuthTag,
    encryptionVersion: connection.encryptionVersion as 1,
  };
}

function providerInput(
  connection: StoredModelConnection,
  apiKey: string,
  maxOutputTokens: number,
): ConnectionProviderInput {
  return {
    provider: connection.provider,
    model: connection.model,
    apiKey,
    baseUrl: connection.baseUrl,
    requestTimeoutMs: connection.requestTimeoutMs,
    maxOutputTokens,
  };
}

async function findRoutingProfiles(
  repository: ModelSettingsRepository,
  routing: ModelRoutingUpdateInput,
): Promise<
  | { ok: true; values: Map<string, StoredModelConnection> }
  | { ok: false }
> {
  const ids = [...new Set(Object.values(routing).filter((id): id is string => id !== null))];
  const rows = await Promise.all(ids.map((id) => repository.find(userId, id)));
  if (rows.some((row) => row === null)) return { ok: false };
  return {
    ok: true,
    values: new Map(rows.map((row) => [row!.id, row!])),
  };
}

function validTaskRoute(
  primaryId: string | null,
  fallbackId: string | null,
  profiles: Map<string, StoredModelConnection>,
): boolean {
  if (!fallbackId) return true;
  if (!primaryId) return false;
  return profiles.get(primaryId)?.provider !== profiles.get(fallbackId)?.provider;
}

function failure(
  error: unknown,
  context: Omit<ModelSettingsLogEvent, "event" | "status" | "errorCode">,
  logError: (event: ModelSettingsLogEvent) => void,
): ApiResult {
  const mapped = mapError(error);
  logError({
    event: "model_settings_request",
    status: "failed",
    errorCode: mapped.errorCode,
    ...context,
  });
  return errorResult(mapped.status, mapped.errorCode);
}

function mapError(error: unknown): { status: number; errorCode: string } {
  if (error instanceof ModelSettingsRepositoryError) {
    if (error.code === "profile_not_found") return { status: 404, errorCode: error.code };
    return { status: 409, errorCode: error.code };
  }
  if (error instanceof ModelSettingsSecretError) {
    return { status: 503, errorCode: error.code };
  }
  return { status: 503, errorCode: "settings_unavailable" };
}

function errorResult(status: number, errorCode: string): ApiResult {
  return { status, body: { errorCode } };
}
