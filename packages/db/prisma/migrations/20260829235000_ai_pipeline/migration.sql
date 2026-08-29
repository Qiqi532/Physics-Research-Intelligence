-- CreateEnum
CREATE TYPE "AiAttemptStatus" AS ENUM ('COMPLETE', 'FAILED');

-- AlterTable
ALTER TABLE "AiRun"
ADD COLUMN "totalTokens" INTEGER,
ADD COLUMN "reservedCostUsd" DECIMAL(12,6),
ADD COLUMN "reservedAt" TIMESTAMPTZ(6),
ADD COLUMN "completedAt" TIMESTAMPTZ(6);

-- CreateTable
CREATE TABLE "AiRunAttempt" (
    "id" UUID NOT NULL,
    "aiRunId" UUID NOT NULL,
    "ordinal" INTEGER NOT NULL,
    "provider" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "inputTokens" INTEGER,
    "outputTokens" INTEGER,
    "totalTokens" INTEGER,
    "durationMs" INTEGER NOT NULL,
    "status" "AiAttemptStatus" NOT NULL,
    "errorCode" TEXT,
    "estimatedCostUsd" DECIMAL(12,6),
    "completedAt" TIMESTAMPTZ(6) NOT NULL,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AiRunAttempt_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PaperInterpretation_paperId_model_promptVersion_key"
ON "PaperInterpretation"("paperId", "model", "promptVersion");

-- CreateIndex
CREATE UNIQUE INDEX "AiRunAttempt_aiRunId_ordinal_key"
ON "AiRunAttempt"("aiRunId", "ordinal");

-- CreateIndex
CREATE INDEX "AiRunAttempt_completedAt_idx" ON "AiRunAttempt"("completedAt");

-- CreateIndex
CREATE INDEX "AiRunAttempt_provider_model_completedAt_idx"
ON "AiRunAttempt"("provider", "model", "completedAt");

-- CreateIndex
CREATE INDEX "AiRun_status_reservedAt_idx" ON "AiRun"("status", "reservedAt");

-- AddForeignKey
ALTER TABLE "AiRunAttempt"
ADD CONSTRAINT "AiRunAttempt_aiRunId_fkey"
FOREIGN KEY ("aiRunId") REFERENCES "AiRun"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
