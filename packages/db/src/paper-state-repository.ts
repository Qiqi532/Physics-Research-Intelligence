import type { PaperStatePatch } from "@pri/domain/ranking-review";
import { Prisma } from "./generated/prisma/client";
import type { DatabaseClient } from "./client";

export async function patchPaperState(client: DatabaseClient, paperId: string, userId: string, patch: PaperStatePatch) {
  const key = { userId, paperId };
  const where = { userId_paperId: key };
  const favorite = patch.isFavorite;
  const current = favorite === true ? await client.userPaperState.findUnique({ where,
    select: { isFavorite: true, favoritedAt: true } }) : null;
  const at = favorite ? (current?.isFavorite ? current.favoritedAt : new Date()) : null;
  const data = { status: patch.status, feedback: patch.feedback, note: patch.note,
    ...(favorite === undefined ? {} : { isFavorite: favorite, favoritedAt: at }) };
  try {
    const state = await client.userPaperState.upsert({
      where,
      update: data,
      create: { ...key, ...data, isFavorite: favorite ?? false, favoritedAt: at },
      select: { status: true, feedback: true, note: true, isFavorite: true, favoritedAt: true, updatedAt: true },
    });
    return { status: "updated" as const, state };
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2003") return { status: "not_found" as const };
    throw error;
  }
}
