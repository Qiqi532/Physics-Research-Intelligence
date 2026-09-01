-- AlterTable
ALTER TABLE "UserPaperState" ADD COLUMN     "favoritedAt" TIMESTAMPTZ(6),
ADD COLUMN     "isFavorite" BOOLEAN NOT NULL DEFAULT false;
