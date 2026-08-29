-- CreateEnum
CREATE TYPE "AccessStatus" AS ENUM ('UNKNOWN', 'OPEN', 'RESTRICTED');

-- CreateEnum
CREATE TYPE "InterpretationStatus" AS ENUM ('PENDING', 'COMPLETE', 'FAILED');

-- CreateEnum
CREATE TYPE "ReadingStatus" AS ENUM ('UNREAD', 'SAVED', 'READING', 'COMPLETE', 'SKIPPED');

-- CreateEnum
CREATE TYPE "UserFeedback" AS ENUM ('NONE', 'LIKE', 'DISLIKE');

-- CreateEnum
CREATE TYPE "AiRunType" AS ENUM ('CLASSIFY', 'INTERPRET');

-- CreateEnum
CREATE TYPE "AiRunStatus" AS ENUM ('PENDING', 'RUNNING', 'COMPLETE', 'FAILED', 'SKIPPED_BUDGET');

-- CreateTable
CREATE TABLE "Paper" (
    "id" UUID NOT NULL,
    "doi" TEXT,
    "title" TEXT NOT NULL,
    "normalizedTitle" TEXT NOT NULL,
    "abstract" TEXT,
    "journal" TEXT,
    "firstAuthor" TEXT,
    "publishedAt" TIMESTAMPTZ(6),
    "originalUrl" TEXT,
    "accessStatus" "AccessStatus" NOT NULL DEFAULT 'UNKNOWN',
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "Paper_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PaperSource" (
    "id" UUID NOT NULL,
    "paperId" UUID NOT NULL,
    "sourceName" TEXT NOT NULL,
    "sourceRecordId" TEXT NOT NULL,
    "sourceUrl" TEXT NOT NULL,
    "retrievedAt" TIMESTAMPTZ(6) NOT NULL,
    "licenseUrl" TEXT,
    "title" TEXT NOT NULL,
    "abstract" TEXT,
    "journal" TEXT,
    "firstAuthor" TEXT,
    "publishedAt" TIMESTAMPTZ(6),
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PaperSource_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PhysicsTag" (
    "slug" TEXT NOT NULL,
    "labelEn" TEXT NOT NULL,
    "labelZh" TEXT NOT NULL,
    "group" TEXT NOT NULL,
    "isCrossDisciplinary" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "PhysicsTag_pkey" PRIMARY KEY ("slug")
);

-- CreateTable
CREATE TABLE "PaperClassification" (
    "id" UUID NOT NULL,
    "paperId" UUID NOT NULL,
    "tagSlug" TEXT NOT NULL,
    "relevance" DOUBLE PRECISION NOT NULL,
    "reason" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "promptVersion" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PaperClassification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PaperInterpretation" (
    "id" UUID NOT NULL,
    "paperId" UUID NOT NULL,
    "content" JSONB NOT NULL,
    "status" "InterpretationStatus" NOT NULL DEFAULT 'PENDING',
    "provider" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "promptVersion" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "PaperInterpretation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserInterest" (
    "userId" TEXT NOT NULL DEFAULT 'default',
    "tagSlug" TEXT NOT NULL,
    "weight" DOUBLE PRECISION NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "UserInterest_pkey" PRIMARY KEY ("userId","tagSlug")
);

-- CreateTable
CREATE TABLE "UserPaperState" (
    "userId" TEXT NOT NULL DEFAULT 'default',
    "paperId" UUID NOT NULL,
    "status" "ReadingStatus" NOT NULL DEFAULT 'UNREAD',
    "feedback" "UserFeedback" NOT NULL DEFAULT 'NONE',
    "note" TEXT,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "UserPaperState_pkey" PRIMARY KEY ("userId","paperId")
);

-- CreateTable
CREATE TABLE "AiRun" (
    "id" UUID NOT NULL,
    "paperId" UUID,
    "runType" "AiRunType" NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "promptVersion" TEXT NOT NULL,
    "inputHash" TEXT NOT NULL,
    "inputTokens" INTEGER,
    "outputTokens" INTEGER,
    "durationMs" INTEGER,
    "status" "AiRunStatus" NOT NULL DEFAULT 'PENDING',
    "errorCode" TEXT,
    "estimatedCostUsd" DECIMAL(12,6),
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "AiRun_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Paper_doi_key" ON "Paper"("doi");

-- CreateIndex
CREATE INDEX "Paper_normalizedTitle_idx" ON "Paper"("normalizedTitle");

-- CreateIndex
CREATE INDEX "Paper_publishedAt_idx" ON "Paper"("publishedAt");

-- CreateIndex
CREATE INDEX "Paper_createdAt_id_idx" ON "Paper"("createdAt", "id");

-- CreateIndex
CREATE INDEX "PaperSource_paperId_idx" ON "PaperSource"("paperId");

-- CreateIndex
CREATE UNIQUE INDEX "PaperSource_sourceName_sourceRecordId_key" ON "PaperSource"("sourceName", "sourceRecordId");

-- CreateIndex
CREATE INDEX "PaperClassification_tagSlug_relevance_idx" ON "PaperClassification"("tagSlug", "relevance");

-- CreateIndex
CREATE UNIQUE INDEX "PaperClassification_paperId_tagSlug_model_promptVersion_key" ON "PaperClassification"("paperId", "tagSlug", "model", "promptVersion");

-- CreateIndex
CREATE INDEX "PaperInterpretation_paperId_createdAt_idx" ON "PaperInterpretation"("paperId", "createdAt");

-- CreateIndex
CREATE INDEX "UserPaperState_paperId_idx" ON "UserPaperState"("paperId");

-- CreateIndex
CREATE UNIQUE INDEX "AiRun_idempotencyKey_key" ON "AiRun"("idempotencyKey");

-- CreateIndex
CREATE INDEX "AiRun_paperId_createdAt_idx" ON "AiRun"("paperId", "createdAt");

-- CreateIndex
CREATE INDEX "AiRun_status_createdAt_idx" ON "AiRun"("status", "createdAt");

-- AddForeignKey
ALTER TABLE "PaperSource" ADD CONSTRAINT "PaperSource_paperId_fkey" FOREIGN KEY ("paperId") REFERENCES "Paper"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaperClassification" ADD CONSTRAINT "PaperClassification_paperId_fkey" FOREIGN KEY ("paperId") REFERENCES "Paper"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaperClassification" ADD CONSTRAINT "PaperClassification_tagSlug_fkey" FOREIGN KEY ("tagSlug") REFERENCES "PhysicsTag"("slug") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaperInterpretation" ADD CONSTRAINT "PaperInterpretation_paperId_fkey" FOREIGN KEY ("paperId") REFERENCES "Paper"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserInterest" ADD CONSTRAINT "UserInterest_tagSlug_fkey" FOREIGN KEY ("tagSlug") REFERENCES "PhysicsTag"("slug") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserPaperState" ADD CONSTRAINT "UserPaperState_paperId_fkey" FOREIGN KEY ("paperId") REFERENCES "Paper"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiRun" ADD CONSTRAINT "AiRun_paperId_fkey" FOREIGN KEY ("paperId") REFERENCES "Paper"("id") ON DELETE SET NULL ON UPDATE CASCADE;
