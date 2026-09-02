import { createHash } from "node:crypto";
import type { AiRouteAttempt, PaperAiInput, ScreenInput } from "@pri/ai";
import type { AiAttemptInput, SafePaperFacts } from "@pri/db";

export function toPaperAiInput(paper: SafePaperFacts): PaperAiInput {
  return {
    title: paper.title,
    abstract: paper.abstract,
    journal: paper.journal,
    publishedAt: paper.publishedAt?.toISOString() ?? null,
  };
}

export function toScreenInput(paper: SafePaperFacts): ScreenInput {
  return {
    paperId: paper.id,
    title: paper.title,
    abstract: paper.abstract,
    journal: paper.journal,
    publishedAt: paper.publishedAt?.toISOString() ?? null,
  };
}

export function createInputHash(input: PaperAiInput): string {
  return createHash("sha256").update(JSON.stringify(input)).digest("hex");
}

export function createBatchInputHash(inputs: readonly ScreenInput[]): string {
  return createHash("sha256")
    .update(JSON.stringify(inputs.map((input) => input.paperId).sort()))
    .digest("hex");
}

export function createIdempotencyKey(input: {
  paperId: string;
  runType: "CLASSIFY" | "INTERPRET" | "SCREEN";
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

export function createBatchIdempotencyKey(input: {
  batchKey: string;
  model: string;
  promptVersion: string;
}): string {
  return [
    "screen-batch",
    input.batchKey,
    input.model,
    input.promptVersion,
  ].join(":");
}

export function toAttemptInputs(
  attempts: readonly AiRouteAttempt[],
  completedAt: Date,
): AiAttemptInput[] {
  return attempts.map((attempt) => ({
    provider: attempt.provider,
    model: attempt.model,
    status: attempt.status === "complete" ? "COMPLETE" : "FAILED",
    inputTokens: attempt.usage?.inputTokens ?? null,
    outputTokens: attempt.usage?.outputTokens ?? null,
    totalTokens: attempt.usage?.totalTokens ?? null,
    durationMs: attempt.durationMs,
    errorCode: attempt.errorCode ?? null,
    completedAt,
  }));
}
