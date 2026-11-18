CREATE TABLE "ZoteroCollectionSnapshot" (
  "id" UUID PRIMARY KEY,
  "sourceScope" TEXT NOT NULL,
  "libraryKey" TEXT NOT NULL,
  "collectionKey" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "syncedAt" TIMESTAMPTZ(6) NOT NULL,
  "lastError" TEXT
);

CREATE UNIQUE INDEX "ZoteroCollectionSnapshot_libraryKey_collectionKey_key" ON "ZoteroCollectionSnapshot"("libraryKey", "collectionKey");
CREATE INDEX "ZoteroCollectionSnapshot_sourceScope_collectionKey_idx" ON "ZoteroCollectionSnapshot"("sourceScope", "collectionKey");

CREATE TABLE "ZoteroAttachmentLocation" (
  "collectionId" UUID NOT NULL REFERENCES "ZoteroCollectionSnapshot"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "attachmentKey" TEXT NOT NULL,
  "itemKey" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "creators" TEXT,
  "date" TEXT,
  "doi" TEXT,
  "role" TEXT NOT NULL,
  "status" TEXT NOT NULL,
  "root" TEXT,
  "relativePath" TEXT,
  "documentId" VARCHAR(64) REFERENCES "LocalEvidenceDocument"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  PRIMARY KEY ("collectionId", "attachmentKey")
);

CREATE INDEX "ZoteroAttachmentLocation_documentId_idx" ON "ZoteroAttachmentLocation"("documentId");
