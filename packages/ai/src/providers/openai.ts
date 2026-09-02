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
  output: z.array(z.object({
    type: z.string(),
    content: z.array(z.object({
      type: z.string(),
      text: z.string().optional(),
      refusal: z.string().optional(),
    }).passthrough()),
  }).passthrough()).min(1),
  usage: z.object({
    input_tokens: z.number().int().nonnegative(),
    output_tokens: z.number().int().nonnegative(),
    total_tokens: z.number().int().nonnegative(),
  }).passthrough().optional(),
}).passthrough();

export function createOpenAiProvider(rawOptions: ProviderHttpOptions): AiProvider {
  const name = "openai";
  const options = validateProviderOptions(name, rawOptions);

  return {
    name,
    model: options.model,
    classify(input) {
      return generate(
        options,
        "physics_classification",
        buildClassificationPrompt(input),
        z.toJSONSchema(classificationOutputSchema),
        parseClassificationOutput,
      );
    },
    interpret(input) {
      return generate(
        options,
        "paper_interpretation",
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
        "paper_screening_batch",
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
  options: ReturnType<typeof validateProviderOptions>,
  schemaName: string,
  prompt: AiPrompt,
  jsonSchema: unknown,
  parseOutput: (rawText: string) => T,
): Promise<AiProviderResult<T>> {
  const response = await requestJson({
    provider: "openai",
    url: `${options.baseUrl}/responses`,
    method: "POST",
    headers: authorizationHeaders(options.apiKey),
    body: {
      model: options.model,
      input: [
        { role: "system", content: prompt.system },
        { role: "user", content: prompt.user },
      ],
      text: {
        format: {
          type: "json_schema",
          name: schemaName,
          strict: true,
          schema: jsonSchema,
        },
      },
      max_output_tokens: options.maxOutputTokens,
    },
    timeoutMs: options.timeoutMs,
    fetchImpl: options.fetchImpl,
    now: options.now,
  });
  const envelope = responseSchema.safeParse(response.data);
  if (!envelope.success) {
    throw new AiProviderError("schema_invalid", {
      provider: "openai",
      durationMs: response.durationMs,
    });
  }
  const content = envelope.data.output.flatMap((item) => item.content);
  if (content.some((item) => item.type === "refusal")) {
    throw new AiProviderError("business_validation", {
      provider: "openai",
      durationMs: response.durationMs,
    });
  }
  const rawText = content.find((item) => item.type === "output_text")?.text;
  if (!rawText) {
    throw new AiProviderError("schema_invalid", {
      provider: "openai",
      durationMs: response.durationMs,
    });
  }
  return {
    provider: "openai",
    model: options.model,
    output: parseOutput(rawText),
    ...(envelope.data.usage
      ? {
          usage: {
            inputTokens: envelope.data.usage.input_tokens,
            outputTokens: envelope.data.usage.output_tokens,
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
