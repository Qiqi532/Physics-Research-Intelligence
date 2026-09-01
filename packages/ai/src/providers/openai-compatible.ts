import { z } from "zod";
import { AiProviderError } from "../errors";
import {
  requestJson,
  validateProviderOptions,
  type ProviderHttpOptions,
} from "../http";
import type {
  AiProvider,
  AiProviderResult,
  PaperAiInput,
} from "../provider";
import { buildClassificationPrompt, type AiPrompt } from "../prompts/classify";
import { buildInterpretationPrompt } from "../prompts/interpret";
import {
  classificationOutputSchema,
  interpretationOutputSchema,
  parseClassificationOutput,
  parseInterpretationOutput,
} from "../schemas";

export type OpenAiCompatibleProviderName =
  | "deepseek"
  | "qwen"
  | "glm"
  | "kimi"
  | "hunyuan"
  | "compatible";

const responseSchema = z.object({
  choices: z.array(z.object({
    message: z.object({ content: z.string() }).passthrough(),
  }).passthrough()).min(1),
  usage: z.object({
    prompt_tokens: z.number().int().nonnegative(),
    completion_tokens: z.number().int().nonnegative(),
    total_tokens: z.number().int().nonnegative(),
  }).passthrough().optional(),
}).passthrough();

export function createOpenAiCompatibleProvider(
  name: OpenAiCompatibleProviderName,
  rawOptions: ProviderHttpOptions,
): AiProvider {
  const options = validateProviderOptions(name, rawOptions);

  return {
    name,
    model: options.model,
    classify(input) {
      return generate(
        name,
        options,
        buildClassificationPrompt(input),
        "classification_output",
        z.toJSONSchema(classificationOutputSchema),
        parseClassificationOutput,
      );
    },
    interpret(input) {
      return generate(
        name,
        options,
        buildInterpretationPrompt(input),
        "interpretation_output",
        z.toJSONSchema(interpretationOutputSchema),
        parseInterpretationOutput,
      );
    },
    async healthCheck() {
      const response = await requestJson({
        provider: name,
        url: `${options.baseUrl}/models/${encodeURIComponent(options.model)}`,
        method: "GET",
        headers: authorizationHeaders(options.apiKey),
        timeoutMs: options.timeoutMs,
        fetchImpl: options.fetchImpl,
        now: options.now,
      });
      return { ok: true, durationMs: response.durationMs };
    },
  };
}

async function generate<T>(
  provider: OpenAiCompatibleProviderName,
  options: ReturnType<typeof validateProviderOptions>,
  prompt: AiPrompt,
  schemaName: string,
  jsonSchema: unknown,
  parseOutput: (rawText: string) => T,
): Promise<AiProviderResult<T>> {
  const kimiStructuredOutput = provider === "kimi" && options.model === "kimi-k2.6";
  const systemContent = kimiStructuredOutput
    ? `${prompt.system} Follow this JSON Schema exactly: ${JSON.stringify(jsonSchema)}`
    : prompt.system;
  const response = await requestJson({
    provider,
    url: `${options.baseUrl}/chat/completions`,
    method: "POST",
    headers: authorizationHeaders(options.apiKey),
    body: {
      model: options.model,
      messages: [
        { role: "system", content: systemContent },
        { role: "user", content: prompt.user },
      ],
      response_format: kimiStructuredOutput
        ? {
            type: "json_schema",
            json_schema: {
              name: schemaName,
              strict: true,
              schema: jsonSchema,
            },
          }
        : { type: "json_object" },
      ...(kimiStructuredOutput
        ? {
            thinking: { type: "disabled" },
            max_completion_tokens: options.maxOutputTokens,
          }
        : { max_tokens: options.maxOutputTokens }),
    },
    timeoutMs: options.timeoutMs,
    fetchImpl: options.fetchImpl,
    now: options.now,
  });
  const envelope = responseSchema.safeParse(response.data);
  if (!envelope.success) {
    throw new AiProviderError("schema_invalid", {
      provider,
      durationMs: response.durationMs,
    });
  }
  return {
    provider,
    model: options.model,
    output: parseOutput(envelope.data.choices[0]!.message.content),
    ...(envelope.data.usage
      ? {
          usage: {
            inputTokens: envelope.data.usage.prompt_tokens,
            outputTokens: envelope.data.usage.completion_tokens,
            totalTokens: envelope.data.usage.total_tokens,
          },
        }
      : {}),
    durationMs: response.durationMs,
  };
}

function authorizationHeaders(apiKey: string): Record<string, string> {
  return {
    Authorization: `Bearer ${apiKey}`,
    "Content-Type": "application/json",
  };
}
