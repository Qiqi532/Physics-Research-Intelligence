-- Add SCREEN to AiRunType enum
ALTER TYPE "AiRunType" ADD VALUE IF NOT EXISTS 'SCREEN';

-- Create PaperScreening table for batch screening results
CREATE TABLE "PaperScreening" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "paperId" UUID NOT NULL,
    "score" DOUBLE PRECISION NOT NULL,
    "directionSlug" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "selected" BOOLEAN NOT NULL DEFAULT false,
    "batchId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "promptVersion" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PaperScreening_pkey" PRIMARY KEY ("id")
);

-- Unique constraint: one screening result per paper per model per prompt version
CREATE UNIQUE INDEX "PaperScreening_paperId_model_promptVersion_key" ON "PaperScreening"("paperId", "model", "promptVersion");

-- Indexes for querying
CREATE INDEX "PaperScreening_batchId_idx" ON "PaperScreening"("batchId");
CREATE INDEX "PaperScreening_selected_score_idx" ON "PaperScreening"("selected", "score");

-- Foreign keys
ALTER TABLE "PaperScreening" ADD CONSTRAINT "PaperScreening_paperId_fkey" FOREIGN KEY ("paperId") REFERENCES "Paper"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PaperScreening" ADD CONSTRAINT "PaperScreening_directionSlug_fkey" FOREIGN KEY ("directionSlug") REFERENCES "PhysicsTag"("slug") ON DELETE RESTRICT ON UPDATE CASCADE;
