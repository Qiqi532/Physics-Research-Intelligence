import type { AiProviderName, AiServerConfig } from "@pri/domain/config";
import type {
  ModelSettingsCipher,
  ModelSettingsRepository,
  StoredModelConnection,
} from "@pri/db";

export type RuntimeAiConfigErrorCode =
  | "worker_ai_configuration_missing"
  | "worker_ai_configuration_unavailable"
  | "worker_ai_routing_invalid"
  | "worker_ai_secret_unavailable";

export class RuntimeAiConfigError extends Error {
  constructor(readonly code: RuntimeAiConfigErrorCode) {
    super(code);
    this.name = "RuntimeAiConfigError";
  }
}

export type ResolvedAiConnection = {
  profileId?: string;
  name: string;
  provider: AiProviderName;
  model: string;
  apiKey: string;
  baseUrl: string;
  requestTimeoutMs: number;
  inputCostPerMillionUsd: number;
  outputCostPerMillionUsd: number;
};

export type RuntimeAiTaskRoute = {
  primary: ResolvedAiConnection;
  fallback?: ResolvedAiConnection;
  maxOutputTokens: number;
};

export type RuntimeAiSnapshot = {
  source: "persisted" | "environment";
  classify: RuntimeAiTaskRoute;
  interpret: RuntimeAiTaskRoute;
};

export interface RuntimeAiConfigResolver {
  resolve(): Promise<RuntimeAiSnapshot>;
}

export function createRuntimeAiConfigResolver(input: {
  repository: Pick<ModelSettingsRepository, "find" | "getRouting">;
  cipher: ModelSettingsCipher;
  environmentConfig?: AiServerConfig;
  classifyMaxOutputTokens?: number;
  interpretMaxOutputTokens?: number;
}): RuntimeAiConfigResolver {
  const classifyMaxOutputTokens = input.classifyMaxOutputTokens ?? 1_000;
  const interpretMaxOutputTokens = input.interpretMaxOutputTokens ?? 4_000;

  return {
    async resolve() {
      let routing;
      try {
        routing = await input.repository.getRouting("default");
      } catch {
        throw new RuntimeAiConfigError("worker_ai_configuration_unavailable");
      }
      if (!routing) {
        if (!input.environmentConfig) {
          throw new RuntimeAiConfigError("worker_ai_configuration_missing");
        }
        return environmentSnapshot(input.environmentConfig);
      }
      if (!routing.classifyPrimaryId || !routing.interpretPrimaryId) {
        throw new RuntimeAiConfigError("worker_ai_routing_invalid");
      }
      const ids = [...new Set([
        routing.classifyPrimaryId,
        routing.classifyFallbackId,
        routing.interpretPrimaryId,
        routing.interpretFallbackId,
      ].filter((id): id is string => id !== null))];
      let profiles: Array<StoredModelConnection | null>;
      try {
        profiles = await Promise.all(ids.map((id) => input.repository.find("default", id)));
      } catch {
        throw new RuntimeAiConfigError("worker_ai_configuration_unavailable");
      }
      const availableProfiles = profiles.filter(
        (profile): profile is StoredModelConnection => profile !== null,
      );
      if (availableProfiles.length !== ids.length) {
        throw new RuntimeAiConfigError("worker_ai_routing_invalid");
      }
      const storedById = new Map(availableProfiles.map((profile) => [profile.id, profile]));
      const resolvedById = new Map<string, ResolvedAiConnection>();
      try {
        await Promise.all([...storedById.values()].map(async (profile) => {
          resolvedById.set(profile.id, await resolveStoredConnection(profile, input.cipher));
        }));
      } catch {
        throw new RuntimeAiConfigError("worker_ai_secret_unavailable");
      }
      const classify = persistedTask(
        routing.classifyPrimaryId,
        routing.classifyFallbackId,
        resolvedById,
        classifyMaxOutputTokens,
      );
      const interpret = persistedTask(
        routing.interpretPrimaryId,
        routing.interpretFallbackId,
        resolvedById,
        interpretMaxOutputTokens,
      );
      return { source: "persisted", classify, interpret };
    },
  };
}

function environmentSnapshot(config: AiServerConfig): RuntimeAiSnapshot {
  return {
    source: "environment",
    classify: environmentTask(config, "classify"),
    interpret: environmentTask(config, "interpret"),
  };
}

function environmentTask(
  config: AiServerConfig,
  taskName: "classify" | "interpret",
): RuntimeAiTaskRoute {
  const task = config[taskName];
  return {
    primary: environmentConnection(config, task.primary),
    ...(task.fallback
      ? { fallback: environmentConnection(config, task.fallback) }
      : {}),
    maxOutputTokens: task.maxOutputTokens,
  };
}

function environmentConnection(
  config: AiServerConfig,
  selection: { provider: AiProviderName; model: string },
): ResolvedAiConnection {
  const provider = config.providers[selection.provider];
  if (!provider) {
    throw new RuntimeAiConfigError("worker_ai_configuration_missing");
  }
  return {
    name: `${selection.provider} environment`,
    provider: selection.provider,
    model: selection.model,
    apiKey: provider.apiKey,
    baseUrl: provider.baseUrl,
    requestTimeoutMs: config.requestTimeoutMs,
    inputCostPerMillionUsd: provider.inputCostPerMillionUsd,
    outputCostPerMillionUsd: provider.outputCostPerMillionUsd,
  };
}

async function resolveStoredConnection(
  profile: StoredModelConnection,
  cipher: ModelSettingsCipher,
): Promise<ResolvedAiConnection> {
  const apiKey = await cipher.decrypt({
    profileId: profile.id,
    provider: profile.provider,
    ciphertext: profile.apiKeyCiphertext,
    nonce: profile.apiKeyNonce,
    authTag: profile.apiKeyAuthTag,
    encryptionVersion: profile.encryptionVersion as 1,
  });
  return {
    profileId: profile.id,
    name: profile.name,
    provider: profile.provider,
    model: profile.model,
    apiKey,
    baseUrl: profile.baseUrl,
    requestTimeoutMs: profile.requestTimeoutMs,
    inputCostPerMillionUsd: profile.inputCostPerMillionUsd,
    outputCostPerMillionUsd: profile.outputCostPerMillionUsd,
  };
}

function persistedTask(
  primaryId: string,
  fallbackId: string | null,
  profiles: Map<string, ResolvedAiConnection>,
  maxOutputTokens: number,
): RuntimeAiTaskRoute {
  const primary = profiles.get(primaryId);
  const fallback = fallbackId ? profiles.get(fallbackId) : undefined;
  if (!primary || (fallbackId && !fallback) || fallback?.provider === primary.provider) {
    throw new RuntimeAiConfigError("worker_ai_routing_invalid");
  }
  return {
    primary,
    ...(fallback ? { fallback } : {}),
    maxOutputTokens,
  };
}
