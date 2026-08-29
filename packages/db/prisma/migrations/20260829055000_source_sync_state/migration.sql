-- CreateTable
CREATE TABLE "SourceSyncState" (
    "sourceName" TEXT NOT NULL,
    "windowFrom" TIMESTAMPTZ(6),
    "windowUntil" TIMESTAMPTZ(6),
    "cursor" TEXT,
    "lastSuccessAt" TIMESTAMPTZ(6),
    "lastFailureAt" TIMESTAMPTZ(6),
    "lastErrorCode" TEXT,
    "lastErrorMessage" TEXT,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "SourceSyncState_pkey" PRIMARY KEY ("sourceName")
);
