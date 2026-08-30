import { describe, expect, it, vi } from "vitest";
import { AiProviderError } from "../../packages/ai/src/errors";
import { createDeepSeekProvider } from "../../packages/ai/src/providers/deepseek";
import { createGeminiProvider } from "../../packages/ai/src/providers/gemini";
import { createGlmProvider } from "../../packages/ai/src/providers/glm";
import { createHunyuanProvider } from "../../packages/ai/src/providers/hunyuan";
import { createKimiProvider } from "../../packages/ai/src/providers/kimi";
import { createOpenAiProvider } from "../../packages/ai/src/providers/openai";
import { createQwenProvider } from "../../packages/ai/src/providers/qwen";
import type { PaperAiInput } from "../../packages/ai/src/provider";

const paper: PaperAiInput = {
  title: "A fictional optical measurement",
  abstract: "We demonstrate a fictional result.",
  journal: "Fictional Physics",
  publishedAt: "2026-08-29T00:00:00.000Z",
};

const classification = {
  tags: [{
    slug: "amo-optics",
    relevance: 0.9,
    reason: "Optical measurement.",
    crossDisciplinary: false,
  }],
  overallRelevance: 0.9,
  reason: "Optical physics.",
  crossDisciplinaryTags: [],
};

function openAiResponse(output: unknown = classification) {
  return Response.json({
    output: [{
      type: "message",
      content: [{ type: "output_text", text: JSON.stringify(output) }],
    }],
    usage: { input_tokens: 100, output_tokens: 40, total_tokens: 140 },
  });
}

function chatResponse(output: unknown = classification) {
  return Response.json({
    choices: [{ message: { content: JSON.stringify(output) } }],
    usage: { prompt_tokens: 80, completion_tokens: 30, total_tokens: 110 },
  });
}

describe("real AI provider adapters with mock HTTP", () => {
  it("calls OpenAI Responses with strict JSON schema and maps usage", async () => {
    const apiKey = "fixture-openai-key";
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(openAiResponse());
    const provider = createOpenAiProvider({
      apiKey,
      baseUrl: "https://openai.example.test/v1",
      model: "fixture-openai-model",
      fetchImpl,
    });

    const result = await provider.classify(paper);
    const [url, init] = fetchImpl.mock.calls[0]!;
    const body = JSON.parse(String(init?.body));

    expect(url).toBe("https://openai.example.test/v1/responses");
    expect(init?.headers).toEqual(expect.objectContaining({
      Authorization: `Bearer ${apiKey}`,
    }));
    expect(body.text.format).toEqual(expect.objectContaining({
      type: "json_schema",
      strict: true,
    }));
    expect(JSON.stringify(body)).not.toContain(apiKey);
    expect(result.usage).toEqual({ inputTokens: 100, outputTokens: 40, totalTokens: 140 });
    expect(result.output.overallRelevance).toBe(0.9);
  });

  it.each([
    ["deepseek", createDeepSeekProvider, "https://deepseek.example.test"],
    ["qwen", createQwenProvider, "https://qwen.example.test/compatible-mode/v1"],
    ["glm", createGlmProvider, "https://open.bigmodel.cn/api/paas/v4"],
    ["kimi", createKimiProvider, "https://api.moonshot.cn/v1"],
    ["hunyuan", createHunyuanProvider, "https://tokenhub.tencentmaas.com/v1"],
  ] as const)("uses an independent %s compatible adapter", async (
    name,
    createProvider,
    baseUrl,
  ) => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(chatResponse());
    const provider = createProvider({
      apiKey: `fixture-${name}-key`,
      baseUrl,
      model: `fixture-${name}-model`,
      fetchImpl,
    });

    const result = await provider.classify(paper);
    const [url, init] = fetchImpl.mock.calls[0]!;
    const body = JSON.parse(String(init?.body));

    expect(url).toBe(`${baseUrl}/chat/completions`);
    expect(body.response_format).toEqual({ type: "json_object" });
    expect(body.messages[0].content).toContain("JSON");
    expect(result.provider).toBe(name);
    expect(result.usage.totalTokens).toBe(110);
  });

  it("calls Gemini generateContent with a response schema and header key", async () => {
    const apiKey = "fixture-gemini-key";
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(Response.json({
      candidates: [{
        content: { parts: [{ text: JSON.stringify(classification) }] },
      }],
      usageMetadata: {
        promptTokenCount: 70,
        candidatesTokenCount: 20,
        totalTokenCount: 90,
      },
    }));
    const provider = createGeminiProvider({
      apiKey,
      baseUrl: "https://gemini.example.test/v1beta",
      model: "fixture-gemini-model",
      fetchImpl,
    });

    const result = await provider.classify(paper);
    const [url, init] = fetchImpl.mock.calls[0]!;
    const body = JSON.parse(String(init?.body));

    expect(url).toBe(
      "https://gemini.example.test/v1beta/models/fixture-gemini-model:generateContent",
    );
    expect(init?.headers).toEqual(expect.objectContaining({ "x-goog-api-key": apiKey }));
    expect(body.generationConfig.responseMimeType).toBe("application/json");
    expect(body.generationConfig.responseJsonSchema).toEqual(
      expect.objectContaining({ type: "object" }),
    );
    expect(JSON.stringify(body)).not.toContain(apiKey);
    expect(result.usage).toEqual({ inputTokens: 70, outputTokens: 20, totalTokens: 90 });
  });

  it.each([
    [429, "rate_limited"],
    [500, "upstream_5xx"],
    [503, "upstream_5xx"],
    [401, "authentication"],
    [403, "authentication"],
    [400, "permanent_4xx"],
    [422, "permanent_4xx"],
  ] as const)("maps HTTP %s to %s without leaking response bodies", async (status, code) => {
    const secretBody = "provider internal fixture body";
    const provider = createDeepSeekProvider({
      apiKey: "fixture-key",
      baseUrl: "https://deepseek.example.test",
      model: "fixture-model",
      fetchImpl: vi.fn<typeof fetch>().mockResolvedValue(
        new Response(secretBody, { status }),
      ),
    });

    try {
      await provider.classify(paper);
      throw new Error("Expected provider failure");
    } catch (error) {
      expect(error).toEqual(expect.objectContaining<Partial<AiProviderError>>({ code }));
      expect(JSON.stringify(error)).not.toContain(secretBody);
      expect(JSON.stringify(error)).not.toContain("fixture-key");
    }
  });

  it("maps network and timeout failures without retrying inside the adapter", async () => {
    const networkFetch = vi.fn<typeof fetch>().mockRejectedValue(new Error("offline"));
    const timeoutFetch = vi.fn<typeof fetch>().mockRejectedValue(
      new DOMException("aborted", "AbortError"),
    );
    const networkProvider = createQwenProvider({
      apiKey: "fixture-key",
      baseUrl: "https://qwen.example.test",
      model: "fixture-model",
      fetchImpl: networkFetch,
    });
    const timeoutProvider = createQwenProvider({
      apiKey: "fixture-key",
      baseUrl: "https://qwen.example.test",
      model: "fixture-model",
      fetchImpl: timeoutFetch,
    });

    await expect(networkProvider.classify(paper)).rejects.toMatchObject({
      code: "network_error",
    });
    await expect(timeoutProvider.classify(paper)).rejects.toMatchObject({
      code: "timeout",
    });
    expect(networkFetch).toHaveBeenCalledTimes(1);
    expect(timeoutFetch).toHaveBeenCalledTimes(1);
  });

  it("distinguishes invalid provider JSON from invalid business schema", async () => {
    const invalidJson = createDeepSeekProvider({
      apiKey: "fixture-key",
      baseUrl: "https://deepseek.example.test",
      model: "fixture-model",
      fetchImpl: vi.fn<typeof fetch>().mockResolvedValue(
        new Response("not-json", { headers: { "Content-Type": "application/json" } }),
      ),
    });
    const invalidSchema = createDeepSeekProvider({
      apiKey: "fixture-key",
      baseUrl: "https://deepseek.example.test",
      model: "fixture-model",
      fetchImpl: vi.fn<typeof fetch>().mockResolvedValue(chatResponse({ unexpected: true })),
    });

    await expect(invalidJson.classify(paper)).rejects.toMatchObject({
      code: "invalid_json",
    });
    await expect(invalidSchema.classify(paper)).rejects.toMatchObject({
      code: "schema_invalid",
    });
  });

  it("performs a read-only model health check", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(Response.json({ id: "model" }));
    const provider = createOpenAiProvider({
      apiKey: "fixture-key",
      baseUrl: "https://openai.example.test/v1",
      model: "fixture-model",
      fetchImpl,
    });

    await expect(provider.healthCheck()).resolves.toEqual({
      ok: true,
      durationMs: expect.any(Number),
    });
    expect(fetchImpl.mock.calls[0]?.[0]).toBe(
      "https://openai.example.test/v1/models/fixture-model",
    );
    expect(fetchImpl.mock.calls[0]?.[1]?.method).toBe("GET");
  });
});
