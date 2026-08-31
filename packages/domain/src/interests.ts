import { z } from "zod";

export const DEFAULT_INTEREST_WEIGHT = 1;
export const MAX_INTEREST_ITEMS = 64;
export const MAX_INTEREST_REQUEST_BYTES = 16_384;

const interestUpdateSchema = z
  .object({
    interests: z
      .array(
        z
          .object({
            tagSlug: z.string().trim().min(1).max(100),
            weight: z.number().finite().min(0).max(2),
          })
          .strict(),
      )
      .max(MAX_INTEREST_ITEMS),
  })
  .strict();

export type InterestUpdate = z.infer<typeof interestUpdateSchema>;

export function parseInterestUpdate(value: unknown): InterestUpdate {
  const result = interestUpdateSchema.safeParse(value);
  if (!result.success) {
    throw new Error("Invalid interest settings");
  }
  const slugs = new Set<string>();
  for (const interest of result.data.interests) {
    if (slugs.has(interest.tagSlug)) {
      throw new Error("Duplicate interest tag");
    }
    slugs.add(interest.tagSlug);
  }
  return result.data;
}
