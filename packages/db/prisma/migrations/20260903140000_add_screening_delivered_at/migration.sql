-- Add delivery dedupe timestamp to PaperScreening.
-- A paper whose screening was delivered inside DAILY_DELIVERY_RECENCY_DAYS
-- is suppressed from re-selection so the daily digest does not repeat papers.
ALTER TABLE "PaperScreening" ADD COLUMN "deliveredAt" TIMESTAMP(6) WITH TIME ZONE;

CREATE INDEX "PaperScreening_deliveredAt_idx" ON "PaperScreening" ("deliveredAt");
