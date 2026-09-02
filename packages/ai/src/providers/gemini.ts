import { z } from "zod";
import { AiProviderError } from "../errors";
import {
  requestJson,
  validateProviderOptions,
  type ProviderHttpOptions,
} from "../http";
import type { AiProvider, AiProviderResult, ScreenInput } from "../provider";
import { buildClassificationPrompt, type AiPrompt } from "../prompts/classify";
import { buildInterpretationPrompt } from "../prompts/interpret";
import { buildScreenPrompt } from "../prompts/screen";
import {
  classificationOutputSchema,
  interpretationOutputSchema,
  parseClassificationOutput,
  parseInterpretationOutput,
  parseScreenBatchOutput,
  screenBatchOutputSchema,
} from "../schemas";

const responseSchema = z.object({
  candidates: z.array(z.object({
    content: z.object({
      parts: z.array(z.object({ text: z.string() }).passthrough()).min(1),
    }).passthrough(),
  }).passthrough()).min(1),
  usageMetadata: z.object({
    promptTokenCount: z.number().int().nonnegative(),
    candidatesTokenCount: z.number().int().nonnegative(),
    totalTokenCount: z.number().int().nonnegative(),
  }).passthrough().optional(),
}).passthrough();

export function createGeminiProvider(rawOptions: ProviderHttpOptions): AiProvider {
  const name = "gemini";
  const options = validateProviderOptions(name, rawOptions);

  return {
    name,
    model: options.model,
    classify(input) {
      return generate(
        options,
        buildClassificationPrompt(input),
        z.toJSONSchema(classificationOutputSchema),
        parseClassificationOutput,
      );
    },
    interpret(input) {
      return generate(
        options,
        buildInterpretationPrompt(input),
        z.toJSONSchema(interpretationOutputSchema),
        parseInterpretationOutput,
      );
    },
    screenBatch(inputs: ScreenInput[], userInterests?: Record<string, number>) {
      const items = inputs.map((input) => ({
        paperId: input.paperId,
        title: input.title,
        journal: input.journal ?? null,
        abstractSnippet: input.abstract,
      }));
      return generate(
        options,
        buildScreenPrompt(items, userInterests),
        z.toJSONSchema(screenBatchOutputSchema),
        parseScreenBatchOutput,
      );
    },
    async healthCheck() {
      const response = await requestJson({
        provider: name,
        url: `${options.baseUrl}/models/${encodeURIComponent(options.model)}`,
        method: "GET",
        headers: geminiHeaders(options.apiKey),
        timeoutMs: options.timeoutMs,
        fetchImpl: options.fetchImpl,
        now: options.now,
      });
      return { ok: true, durationMs: response.durationMs };
    },
  };
}

async function generate<T>(
  options: ReturnType<typeof validateProviderOptions>,
  prompt: AiPrompt,
  jsonSchema: unknown,
  parseOutput: (rawText: string) => T,
): Promise<AiProviderResult<T>> {
  const response = await requestJson({
    provider: "gemini",
    url: `${options.baseUrl}/models/${encodeURIComponent(options.model)}:generateContent`,
    method: "POST",
    headers: geminiHeaders(options.apiKey),
    body: {
      systemInstruction: { parts: [{ text: prompt.system }] },
      contents: [{ role: "user", parts: [{ text: prompt.user }] }],
      generationConfig: {
        responseMimeType: "application/json",
        responseJsonSchema: jsonSchema,
        maxOutputTokens: options.maxOutputTokens,
      },
    },
    timeoutMs: options.timeoutMs,
    fetchImpl: options.fetchImpl,
    now: options.now,
  });
  const envelope = responseSchema.safeParse(response.data);
  if (!envelope.success) {
    throw new AiProviderError("schema_invalid", {
      provider: "gemini",
      durationMs: response.durationMs,
    });
  }
  const rawText = envelope.data.candidates[0]!.content.parts
    .map(({ text }) => text)
    .join("");
  return {
    provider: "gemini",
    model: options.model,
    output: parseOutput(rawText),
    ...(envelope.data.usageMetadata
      ? {
          usage: {
            inputTokens: envelope.data.usageMetadata.promptTokenCount,
            outputTokens: envelope.data.usageMetadata.candidatesTokenCount,
            totalTokens: envelope.data.usageMetadata.totalTokenCount,
          },
        }
      : {}),
    durationMs: response.durationMs,
  };
}

function geminiHeaders(apiKey: string): Record<string, string> {
  return {
    "x-goog-api-key": apiKey,
    "Content-Type": "application/json",
  };
}
