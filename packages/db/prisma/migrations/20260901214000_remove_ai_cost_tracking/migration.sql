-- Preserve historical terminal runs before removing the obsolete budget status.
UPDATE "AiRun"
SET "status" = 'FAILED',
    "errorCode" = COALESCE("errorCode", 'legacy_budget_skip')
WHERE "status" = 'SKIPPED_BUDGET';

ALTER TABLE "AiRun" ALTER COLUMN "status" DROP DEFAULT;
CREATE TYPE "AiRunStatus_new" AS ENUM ('PENDING', 'RUNNING', 'COMPLETE', 'FAILED');
ALTER TABLE "AiRun"
  ALTER COLUMN "status" TYPE "AiRunStatus_new"
  USING ("status"::text::"AiRunStatus_new");
DROP TYPE "AiRunStatus";
ALTER TYPE "AiRunStatus_new" RENAME TO "AiRunStatus";
ALTER TABLE "AiRun" ALTER COLUMN "status" SET DEFAULT 'PENDING';

DROP INDEX IF EXISTS "AiRun_status_reservedAt_idx";
ALTER TABLE "AiRun"
  DROP COLUMN "estimatedCostUsd",
  DROP COLUMN "reservedCostUsd",
  DROP COLUMN "reservedAt";

ALTER TABLE "AiRunAttempt" DROP COLUMN "estimatedCostUsd";

ALTER TABLE "AiConnectionProfile"
  DROP COLUMN "inputCostPerMillionUsd",
  DROP COLUMN "outputCostPerMillionUsd";
