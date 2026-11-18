-- CreateEnum
CREATE TYPE "DailyRunStatus" AS ENUM ('RUNNING', 'SUCCEEDED', 'PARTIAL', 'FAILED');

-- AlterTable
ALTER TABLE "PaperScreening" ADD COLUMN     "evidenceQuote" TEXT,
ADD COLUMN     "evidenceSource" TEXT,
ALTER COLUMN "id" DROP DEFAULT;

-- AlterTable
ALTER TABLE "SourceSyncState" ADD COLUMN     "completedUntil" TIMESTAMPTZ(6);

-- CreateTable
CREATE TABLE "DailyRun" (
    "id" UUID NOT NULL,
    "executionKey" TEXT NOT NULL,
    "dateKey" TEXT NOT NULL,
    "profileHash" TEXT NOT NULL,
    "profileLabel" TEXT NOT NULL,
    "status" "DailyRunStatus" NOT NULL DEFAULT 'RUNNING',
    "stage" TEXT NOT NULL DEFAULT 'ingest',
    "checkpoint" JSONB NOT NULL DEFAULT '{}',
    "errorCode" TEXT,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,
    "completedAt" TIMESTAMPTZ(6),

    CONSTRAINT "DailyRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DailyReport" (
    "id" UUID NOT NULL,
    "runId" UUID NOT NULL,
    "dateKey" TEXT NOT NULL,
    "profileHash" TEXT NOT NULL,
    "snapshot" JSONB NOT NULL,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DailyReport_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DailyReportItem" (
    "reportId" UUID NOT NULL,
    "position" INTEGER NOT NULL,
    "paperId" UUID,

    CONSTRAINT "DailyReportItem_pkey" PRIMARY KEY ("reportId","position")
);

-- CreateIndex
CREATE UNIQUE INDEX "DailyRun_executionKey_key" ON "DailyRun"("executionKey");

-- CreateIndex
CREATE INDEX "DailyRun_dateKey_createdAt_idx" ON "DailyRun"("dateKey", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "DailyReport_runId_key" ON "DailyReport"("runId");

-- CreateIndex
CREATE INDEX "DailyReport_dateKey_createdAt_idx" ON "DailyReport"("dateKey", "createdAt");

-- CreateIndex
CREATE INDEX "DailyReportItem_paperId_idx" ON "DailyReportItem"("paperId");

-- CreateIndex
CREATE UNIQUE INDEX "DailyReportItem_reportId_paperId_key" ON "DailyReportItem"("reportId", "paperId");

-- AddForeignKey
ALTER TABLE "DailyReport" ADD CONSTRAINT "DailyReport_runId_fkey" FOREIGN KEY ("runId") REFERENCES "DailyRun"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DailyReportItem" ADD CONSTRAINT "DailyReportItem_reportId_fkey" FOREIGN KEY ("reportId") REFERENCES "DailyReport"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DailyReportItem" ADD CONSTRAINT "DailyReportItem_paperId_fkey" FOREIGN KEY ("paperId") REFERENCES "Paper"("id") ON DELETE SET NULL ON UPDATE CASCADE;
