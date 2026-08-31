import { z } from "zod";
import { aiProviderNames, type AiProviderName } from "./config";

export const MAX_MODEL_SETTINGS_REQUEST_BYTES = 16 * 1024;
export const MAX_MODEL_CONNECTIONS = 50;
export type ModelConnectionProvider = AiProviderName;

const connectionFields = {
  name: z.string().trim().min(1).max(64),
  provider: z.enum(aiProviderNames),
  model: z.string().trim().min(1).max(128),
  baseUrl: z.string().trim().min(1).max(2_048).url().refine(isAllowedModelUrl, {
    message: "Model connection URL must use HTTPS or loopback HTTP",
  }),
  requestTimeoutMs: z.number().int().min(1_000).max(120_000),
  inputCostPerMillionUsd: z.number().finite().min(0).max(10_000),
  outputCostPerMillionUsd: z.number().finite().min(0).max(10_000),
};
const apiKeySchema = z.string().trim().min(1).max(8 * 1024);

const modelConnectionCreateSchema = z.object({
  ...connectionFields,
  apiKey: apiKeySchema,
}).strict();

const modelConnectionUpdateSchema = z.object({
  name: connectionFields.name.optional(),
  provider: connectionFields.provider.optional(),
  model: connectionFields.model.optional(),
  apiKey: z.string().max(8 * 1024).optional(),
  baseUrl: connectionFields.baseUrl.optional(),
  requestTimeoutMs: connectionFields.requestTimeoutMs.optional(),
  inputCostPerMillionUsd: connectionFields.inputCostPerMillionUsd.optional(),
  outputCostPerMillionUsd: connectionFields.outputCostPerMillionUsd.optional(),
}).strict()
  .refine((value) => Object.keys(value).length > 0, { message: "Update cannot be empty" })
  .transform(({ apiKey, ...value }) => {
    const normalizedApiKey = apiKey?.trim();
    return normalizedApiKey ? { ...value, apiKey: apiKeySchema.parse(normalizedApiKey) } : value;
  });

const nullableUuid = z.uuid().nullable();
const modelRoutingUpdateSchema = z.object({
  classifyPrimaryId: nullableUuid,
  classifyFallbackId: nullableUuid,
  interpretPrimaryId: nullableUuid,
  interpretFallbackId: nullableUuid,
}).strict();

export type ModelConnectionCreateInput = z.infer<typeof modelConnectionCreateSchema>;
export type ModelConnectionUpdateInput = z.infer<typeof modelConnectionUpdateSchema>;
export type ModelRoutingUpdateInput = z.infer<typeof modelRoutingUpdateSchema>;

export type ModelConnectionPublic = {
  id: string;
  name: string;
  provider: ModelConnectionProvider;
  model: string;
  baseUrl: string;
  requestTimeoutMs: number;
  inputCostPerMillionUsd: number;
  outputCostPerMillionUsd: number;
  hasApiKey: true;
  createdAt: string;
  updatedAt: string;
};

export function parseModelConnectionCreate(value: unknown): ModelConnectionCreateInput {
  return modelConnectionCreateSchema.parse(value);
}

export function parseModelConnectionUpdate(value: unknown): ModelConnectionUpdateInput {
  return modelConnectionUpdateSchema.parse(value);
}

export function parseModelRoutingUpdate(value: unknown): ModelRoutingUpdateInput {
  return modelRoutingUpdateSchema.parse(value);
}

function isAllowedModelUrl(value: string): boolean {
  const url = new URL(value);
  if (url.protocol === "https:") return true;
  return url.protocol === "http:" && ["127.0.0.1", "localhost", "[::1]", "::1"]
    .includes(url.hostname);
}
