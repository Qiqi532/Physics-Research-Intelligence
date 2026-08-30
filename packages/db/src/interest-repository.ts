import { DEFAULT_INTEREST_WEIGHT } from "@pri/domain/interests";
import type { DatabaseClient } from "./client";

export type InterestTag = {
  slug: string;
  labelEn: string;
  labelZh: string;
  group: string;
  isCrossDisciplinary: boolean;
  weight: number;
  defaultWeight: number;
};

export type StoredInterestInput = {
  tagSlug: string;
  weight: number;
};

export interface InterestRepository {
  list(userId: string): Promise<InterestTag[]>;
  replace(userId: string, interests: StoredInterestInput[]): Promise<void>;
}

export function createInterestRepository(client: DatabaseClient): InterestRepository {
  return {
    async list(userId) {
      const tags = await client.physicsTag.findMany({
        orderBy: [{ group: "asc" }, { isCrossDisciplinary: "asc" }, { slug: "asc" }],
        select: {
          slug: true,
          labelEn: true,
          labelZh: true,
          group: true,
          isCrossDisciplinary: true,
          userInterests: {
            where: { userId },
            take: 1,
            select: { weight: true },
          },
        },
      });
      return tags.map(({ userInterests, ...tag }) => ({
        ...tag,
        weight: userInterests[0]?.weight ?? 0,
        defaultWeight: DEFAULT_INTEREST_WEIGHT,
      }));
    },

    async replace(userId, interests) {
      const selected = interests.filter(({ weight }) => weight > 0);
      await client.$transaction(async (transaction) => {
        await transaction.userInterest.deleteMany({ where: { userId } });
        if (selected.length > 0) {
          await transaction.userInterest.createMany({
            data: selected.map(({ tagSlug, weight }) => ({ userId, tagSlug, weight })),
          });
        }
      });
    },
  };
}
