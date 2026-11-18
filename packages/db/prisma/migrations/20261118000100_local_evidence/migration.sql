CREATE TABLE "LocalEvidenceDocument" (
  "id" VARCHAR(64) PRIMARY KEY,
  "parserVersion" TEXT NOT NULL,
  "title" TEXT,
  "pageCount" INTEGER NOT NULL CHECK ("pageCount" > 0),
  "paperId" UUID REFERENCES "Paper"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE TABLE "LocalEvidenceLocation" (
  "id" UUID PRIMARY KEY,
  "root" TEXT NOT NULL,
  "relativePath" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "role" TEXT NOT NULL,
  "status" TEXT NOT NULL,
  "documentId" VARCHAR(64) REFERENCES "LocalEvidenceDocument"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "LocalEvidenceLocation_root_relativePath_key" ON "LocalEvidenceLocation"("root","relativePath");
CREATE INDEX "LocalEvidenceLocation_documentId_idx" ON "LocalEvidenceLocation"("documentId");
CREATE TABLE "LocalEvidencePage" (
  "documentId" VARCHAR(64) NOT NULL REFERENCES "LocalEvidenceDocument"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "number" INTEGER NOT NULL CHECK ("number" > 0),
  "text" TEXT NOT NULL,
  "normalized" TEXT NOT NULL,
  "status" TEXT NOT NULL,
  PRIMARY KEY ("documentId","number")
);
CREATE INDEX "LocalEvidencePage_search_idx" ON "LocalEvidencePage"
  USING GIN (to_tsvector('simple'::regconfig, "normalized"));
