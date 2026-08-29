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
  parseClassificationOutput,
  parseInterpretationOutput,
} from "../schemas";

const responseSchema = z.object({
  choices: z.array(z.object({
    message: z.object({ content: z.string() }).passthrough(),
  }).passthrough()).min(1),
  usage: z.object({
    prompt_tokens: z.number().int().nonnegative(),
    completion_tokens: z.number().int().nonnegative(),
    total_tokens: z.number().int().nonnegative(),
  }).passthrough(),
}).passthrough();

export function createOpenAiCompatibleProvider(
  name: "deepseek" | "qwen",
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
        parseClassificationOutput,
      );
    },
    interpret(input) {
      return generate(
        name,
        options,
        buildInterpretationPrompt(input),
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
  provider: "deepseek" | "qwen",
  options: ReturnType<typeof validateProviderOptions>,
  prompt: AiPrompt,
  parseOutput: (rawText: string) => T,
): Promise<AiProviderResult<T>> {
  const response = await requestJson({
    provider,
    url: `${options.baseUrl}/chat/completions`,
    method: "POST",
    headers: authorizationHeaders(options.apiKey),
    body: {
      model: options.model,
      messages: [
        { role: "system", content: prompt.system },
        { role: "user", content: prompt.user },
      ],
      response_format: { type: "json_object" },
      max_tokens: options.maxOutputTokens,
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
  const usage = envelope.data.usage;
  return {
    provider,
    model: options.model,
    output: parseOutput(envelope.data.choices[0]!.message.content),
    usage: {
      inputTokens: usage.prompt_tokens,
      outputTokens: usage.completion_tokens,
      totalTokens: usage.total_tokens,
    },
    durationMs: response.durationMs,
  };
}

function authorizationHeaders(apiKey: string): Record<string, string> {
  return {
    Authorization: `Bearer ${apiKey}`,
    "Content-Type": "application/json",
  };
}
