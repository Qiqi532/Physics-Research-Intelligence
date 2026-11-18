CREATE TABLE "EvidenceComparisonRow" (
  "id" UUID PRIMARY KEY,
  "documentId" VARCHAR(64) NOT NULL REFERENCES "LocalEvidenceDocument"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "page" INTEGER NOT NULL CHECK ("page" > 0),
  "sourceTitle" TEXT NOT NULL,
  "quote" TEXT NOT NULL,
  "figure" TEXT NOT NULL,
  "fields" JSONB NOT NULL,
  "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(6) NOT NULL,
  CHECK (length("quote") > 0 OR length("figure") > 0)
);
CREATE INDEX "EvidenceComparisonRow_documentId_idx" ON "EvidenceComparisonRow"("documentId");
CREATE INDEX "EvidenceComparisonRow_createdAt_id_idx" ON "EvidenceComparisonRow"("createdAt", "id");
