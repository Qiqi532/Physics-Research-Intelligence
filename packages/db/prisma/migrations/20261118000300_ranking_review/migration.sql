CREATE TABLE "DailyRankingSample" (
  "runId" UUID PRIMARY KEY REFERENCES "DailyRun"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "dateKey" TEXT NOT NULL,
  "profileHash" TEXT NOT NULL,
  "capturedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "snapshot" JSONB NOT NULL
);

CREATE INDEX "DailyRankingSample_profileHash_dateKey_capturedAt_idx"
  ON "DailyRankingSample"("profileHash", "dateKey", "capturedAt");
