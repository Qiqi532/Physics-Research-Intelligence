import { createHash } from "node:crypto";
import {
  createConnectionProvider,
  INTERPRET_PROMPT_VERSION,
  routeInterpretation,
  type AiErrorCode,
  type AiProvider,
  type AiRouteAttempt,
  type PaperAiInput,
} from "@pri/ai";
import {
  createAiRepository,
  createModelSettingsCipher,
  createModelSettingsRepository,
  createPrismaClient,
  type AiAttemptInput,
  type AiRepository,
  type SafePaperFacts,
  type StoredModelConnection,
} from "@pri/db";
import { parseConfig } from "@pri/domain/config";
import { normalizeDoi } from "@pri/domain/paper";

export type SingleInterpretationResult =
  | { status: "complete"; runId: string }
  | { status: "duplicate"; runId: string }
  | { status: "in_progress"; runId: string }
  | { status: "failed"; runId?: string; errorCode: AiErrorCode }
  | { status: "not_found" }
  | { status: "unavailable" };

// ---- 辅助函数（从 worker ai-job.ts 复制） ----

function toPaperAiInput(paper: SafePaperFacts): PaperAiInput {
  return {
    title: paper.title,
    abstract: paper.abstract,
    journal: paper.journal,
    publishedAt: paper.publishedAt?.toISOString() ?? null,
  };
}

function createInputHash(input: PaperAiInput): string {
  return createHash("sha256").update(JSON.stringify(input)).digest("hex");
}

function createIdempotencyKey(input: {
  paperId: string;
  runType: "CLASSIFY" | "INTERPRET" | "SCREEN";
  model: string;
  promptVersion: string;
}): string {
  return [input.paperId, input.runType, input.model, input.promptVersion].join(":");
}

function toAttemptInputs(
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

function storedSecret(connection: StoredModelConnection) {
  return {
    ciphertext: connection.apiKeyCiphertext,
    nonce: connection.apiKeyNonce,
    authTag: connection.apiKeyAuthTag,
    encryptionVersion: connection.encryptionVersion as 1,
  };
}

async function createProviderFromConnection(
  connection: StoredModelConnection,
  cipher: ReturnType<typeof createModelSettingsCipher>,
  maxOutputTokens: number,
): Promise<AiProvider> {
  const apiKey = await cipher.decrypt({
    profileId: connection.id,
    provider: connection.provider,
    ...storedSecret(connection),
  });
  return createConnectionProvider({
    provider: connection.provider,
    model: connection.model,
    apiKey,
    baseUrl: connection.baseUrl,
    requestTimeoutMs: connection.requestTimeoutMs,
    maxOutputTokens,
  });
}

// ---- 单篇解读核心逻辑 ----

export async function runInterpretation(input: {
  paperId: string;
  repository: AiRepository;
  primary: AiProvider;
  fallback?: AiProvider;
  now?: () => Date;
}): Promise<
  | { status: "complete"; runId: string }
  | { status: "duplicate"; runId: string }
  | { status: "in_progress"; runId: string }
  | { status: "failed"; runId?: string; errorCode: AiErrorCode }
> {
  const paper = await input.repository.findPaperForAi(input.paperId);
  if (!paper) {
    return { status: "failed", errorCode: "business_validation" };
  }
  const paperInput = toPaperAiInput(paper);
  const idempotencyKey = createIdempotencyKey({
    paperId: paper.id,
    runType: "INTERPRET",
    model: input.primary.model,
    promptVersion: INTERPRET_PROMPT_VERSION,
  });
  const successful = await input.repository.findSuccessfulRun(idempotencyKey);
  if (successful) {
    return { status: "duplicate", runId: successful.id };
  }

  const now = input.now ?? (() => new Date());
  const claim = await input.repository.claimRun({
    paperId: paper.id,
    runType: "INTERPRET",
    idempotencyKey,
    provider: input.primary.name,
    model: input.primary.model,
    promptVersion: INTERPRET_PROMPT_VERSION,
    inputHash: createInputHash(paperInput),
  });
  if (claim.status === "complete") {
    return { status: "duplicate", runId: claim.run.id };
  }
  if (claim.status === "in_progress") {
    return { status: "in_progress", runId: claim.run.id };
  }
  const outcome = await routeInterpretation({
    primary: input.primary,
    fallback: input.fallback,
    input: paperInput,
  });
  const completedAt = now();
  await input.repository.appendAttempts(
    claim.run.id,
    toAttemptInputs(outcome.attempts, completedAt),
  );
  if (!outcome.ok) {
    await input.repository.failRun({
      runId: claim.run.id,
      errorCode: outcome.errorCode,
      completedAt,
    });
    return {
      status: "failed",
      runId: claim.run.id,
      errorCode: outcome.errorCode,
    };
  }

  try {
    await input.repository.saveInterpretation({
      paperId: paper.id,
      provider: outcome.result.provider,
      model: outcome.result.model,
      promptVersion: INTERPRET_PROMPT_VERSION,
      content: JSON.parse(JSON.stringify(outcome.result.output)) as Record<string, unknown>,
    });
    await input.repository.completeRun({
      runId: claim.run.id,
      provider: outcome.result.provider,
      model: outcome.result.model,
      completedAt,
    });
  } catch {
    await input.repository.failRun({
      runId: claim.run.id,
      errorCode: "business_validation",
      completedAt,
    });
    return {
      status: "failed",
      runId: claim.run.id,
      errorCode: "business_validation",
    };
  }
  return { status: "complete", runId: claim.run.id };
}

// ---- 对外接口 ----

export async function interpretSinglePaper(
  rawDoi: string,
  options: { logError?: (error: unknown) => void } = {},
): Promise<SingleInterpretationResult> {
  const logError = options.logError ?? (() => undefined);
  let doi: string;
  try {
    doi = normalizeDoi(decodeURIComponent(rawDoi));
  } catch {
    return { status: "failed", errorCode: "business_validation" };
  }

  let client: ReturnType<typeof createPrismaClient> | undefined;
  try {
    const config = parseConfig(process.env);
    client = createPrismaClient(config.DATABASE_URL);
    const aiRepository = createAiRepository(client);
    const settingsRepository = createModelSettingsRepository(client);
    const cipher = createModelSettingsCipher({
      keyFilePath: config.AI_SETTINGS_MASTER_KEY_FILE,
    });

    // 通过 DOI 查找论文
    const paper = await client.paper.findUnique({
      where: { doi },
      select: { id: true },
    });
    if (!paper) {
      return { status: "not_found" };
    }

    // 加载路由配置
    const routing = await settingsRepository.getRouting("default");
    if (!routing?.interpretPrimaryId) {
      return { status: "failed", errorCode: "business_validation" };
    }

    // 加载主连接并创建提供者
    const primaryConnection = await settingsRepository.find(
      "default",
      routing.interpretPrimaryId,
    );
    if (!primaryConnection) {
      return { status: "failed", errorCode: "business_validation" };
    }
    const primary = await createProviderFromConnection(
      primaryConnection,
      cipher,
      config.AI?.interpret.maxOutputTokens ?? 4000,
    );

    // 加载 fallback 连接（如果有）
    let fallback: AiProvider | undefined;
    if (
      routing.interpretFallbackId &&
      routing.interpretFallbackId !== routing.interpretPrimaryId
    ) {
      const fallbackConnection = await settingsRepository.find(
        "default",
        routing.interpretFallbackId,
      );
      if (fallbackConnection) {
        fallback = await createProviderFromConnection(
          fallbackConnection,
          cipher,
          config.AI?.interpret.maxOutputTokens ?? 4000,
        );
      }
    }

    // 调用单篇解读
    return await runInterpretation({
      paperId: paper.id,
      repository: aiRepository,
      primary,
      fallback,
    });
  } catch (error) {
    logError(error);
    return { status: "unavailable" };
  } finally {
    await client?.$disconnect();
  }
}
