import { createHash } from "node:crypto";
import {
  estimateCost,
  type AiPrices,
  type AiRouteAttempt,
  type PaperAiInput,
} from "@pri/ai";
import type { AiAttemptInput, SafePaperFacts } from "@pri/db";

export type ProviderPrices = Record<string, AiPrices>;

export function toPaperAiInput(paper: SafePaperFacts): PaperAiInput {
  return {
    title: paper.title,
    abstract: paper.abstract,
    journal: paper.journal,
    publishedAt: paper.publishedAt?.toISOString() ?? null,
  };
}

export function createInputHash(input: PaperAiInput): string {
  return createHash("sha256").update(JSON.stringify(input)).digest("hex");
}

export function createIdempotencyKey(input: {
  paperId: string;
  runType: "CLASSIFY" | "INTERPRET";
  model: string;
  promptVersion: string;
}): string {
  return [
    input.paperId,
    input.runType,
    input.model,
    input.promptVersion,
  ].join(":");
}

export function toAttemptInputs(
  attempts: readonly AiRouteAttempt[],
  prices: ProviderPrices,
  completedAt: Date,
): AiAttemptInput[] {
  return attempts.map((attempt) => {
    const providerPrices = prices[attempt.provider];
    if (!providerPrices) {
      throw new Error(`Missing cost configuration for provider ${attempt.provider}`);
    }
    const cost = attempt.usage
      ? estimateCost({ usage: attempt.usage, prices: providerPrices }).usd
      : 0;
    return {
      provider: attempt.provider,
      model: attempt.model,
      status: attempt.status === "complete" ? "COMPLETE" : "FAILED",
      inputTokens: attempt.usage?.inputTokens ?? null,
      outputTokens: attempt.usage?.outputTokens ?? null,
      totalTokens: attempt.usage?.totalTokens ?? null,
      durationMs: attempt.durationMs,
      errorCode: attempt.errorCode ?? null,
      estimatedCostUsd: cost,
      completedAt,
    };
  });
}
