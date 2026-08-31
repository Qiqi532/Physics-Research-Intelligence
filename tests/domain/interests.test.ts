import { describe, expect, it } from "vitest";
import {
  DEFAULT_INTEREST_WEIGHT,
  parseInterestUpdate,
} from "../../packages/domain/src/interests";

describe("interest update validation", () => {
  it("accepts explicit finite weights including cancellation", () => {
    expect(parseInterestUpdate({
      interests: [
        { tagSlug: "amo-optics", weight: 2 },
        { tagSlug: "astrophysics", weight: 0 },
      ],
    })).toEqual({
      interests: [
        { tagSlug: "amo-optics", weight: 2 },
        { tagSlug: "astrophysics", weight: 0 },
      ],
    });
    expect(DEFAULT_INTEREST_WEIGHT).toBe(1);
  });

  it.each([
    null,
    {},
    { interests: "all" },
    { interests: [{ tagSlug: "amo-optics", weight: -0.1 }] },
    { interests: [{ tagSlug: "amo-optics", weight: 2.1 }] },
    { interests: [{ tagSlug: "amo-optics", weight: Number.NaN }] },
    { interests: [{ tagSlug: "amo-optics", weight: Number.POSITIVE_INFINITY }] },
    { interests: [{ tagSlug: "amo-optics", weight: 1, extra: true }] },
    { interests: [], extra: true },
  ])("rejects malformed or non-strict payloads", (payload) => {
    expect(() => parseInterestUpdate(payload)).toThrow("Invalid interest settings");
  });

  it("rejects duplicate tags and excessive item counts", () => {
    expect(() => parseInterestUpdate({
      interests: [
        { tagSlug: "amo-optics", weight: 1 },
        { tagSlug: "amo-optics", weight: 2 },
      ],
    })).toThrow("Duplicate interest tag");
    expect(() => parseInterestUpdate({
      interests: Array.from({ length: 65 }, (_, index) => ({
        tagSlug: `tag-${index}`,
        weight: 1,
      })),
    })).toThrow("Invalid interest settings");
  });
});
