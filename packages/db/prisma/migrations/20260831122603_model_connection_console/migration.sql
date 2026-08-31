-- CreateTable
CREATE TABLE "AiConnectionProfile" (
    "id" UUID NOT NULL,
    "userId" TEXT NOT NULL DEFAULT 'default',
    "name" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "baseUrl" TEXT NOT NULL,
    "apiKeyCiphertext" BYTEA NOT NULL,
    "apiKeyNonce" BYTEA NOT NULL,
    "apiKeyAuthTag" BYTEA NOT NULL,
    "encryptionVersion" INTEGER NOT NULL DEFAULT 1,
    "requestTimeoutMs" INTEGER NOT NULL,
    "inputCostPerMillionUsd" DECIMAL(12,6) NOT NULL,
    "outputCostPerMillionUsd" DECIMAL(12,6) NOT NULL,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "AiConnectionProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AiRuntimeRouting" (
    "userId" TEXT NOT NULL DEFAULT 'default',
    "classifyPrimaryId" UUID,
    "classifyFallbackId" UUID,
    "interpretPrimaryId" UUID,
    "interpretFallbackId" UUID,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "AiRuntimeRouting_pkey" PRIMARY KEY ("userId")
);

-- CreateIndex
CREATE INDEX "AiConnectionProfile_userId_provider_idx" ON "AiConnectionProfile"("userId", "provider");

-- CreateIndex
CREATE UNIQUE INDEX "AiConnectionProfile_userId_name_key" ON "AiConnectionProfile"("userId", "name");

-- AddForeignKey
ALTER TABLE "AiRuntimeRouting" ADD CONSTRAINT "AiRuntimeRouting_classifyPrimaryId_fkey" FOREIGN KEY ("classifyPrimaryId") REFERENCES "AiConnectionProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiRuntimeRouting" ADD CONSTRAINT "AiRuntimeRouting_classifyFallbackId_fkey" FOREIGN KEY ("classifyFallbackId") REFERENCES "AiConnectionProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiRuntimeRouting" ADD CONSTRAINT "AiRuntimeRouting_interpretPrimaryId_fkey" FOREIGN KEY ("interpretPrimaryId") REFERENCES "AiConnectionProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiRuntimeRouting" ADD CONSTRAINT "AiRuntimeRouting_interpretFallbackId_fkey" FOREIGN KEY ("interpretFallbackId") REFERENCES "AiConnectionProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
