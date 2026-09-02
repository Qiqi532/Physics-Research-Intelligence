import { describe, expect, it } from "vitest";
import {
  findJournalEntry,
  isHighQualityJournal,
  journalDirections,
  journalQualityTier,
  JOURNAL_WHITELIST,
  JOURNAL_WHITELIST_COUNT,
} from "../../packages/domain/src/journal-whitelist";
import { PHYSICS_TAG_SLUGS } from "../../packages/domain/src/physics-tags";

describe("journal whitelist", () => {
  it("contains a meaningful number of curated journals", () => {
    expect(JOURNAL_WHITELIST_COUNT).toBeGreaterThan(40);
  });

  it("matches canonical names case-insensitively", () => {
    expect(isHighQualityJournal("nature")).toBe(true);
    expect(isHighQualityJournal("NATURE")).toBe(true);
    expect(isHighQualityJournal("Physical Review Letters")).toBe(true);
    expect(isHighQualityJournal("physical review letters")).toBe(true);
  });

  it("matches common abbreviations", () => {
    expect(isHighQualityJournal("PRL")).toBe(true);
    expect(isHighQualityJournal("PRX")).toBe(true);
    expect(isHighQualityJournal("JHEP")).toBe(true);
    expect(isHighQualityJournal("ApJ")).toBe(true);
    expect(isHighQualityJournal("APL")).toBe(true);
  });

  it("matches journal names embedded in longer strings", () => {
    expect(isHighQualityJournal("Physical Review Letters, 137, 086301")).toBe(true);
    expect(isHighQualityJournal("Nature Physics (2026)")).toBe(true);
    expect(isHighQualityJournal("arXiv:2608.12345 [cond-mat]")).toBe(false);
  });

  it("returns null for unknown or low-quality journals", () => {
    expect(isHighQualityJournal(null)).toBe(false);
    expect(isHighQualityJournal(undefined)).toBe(false);
    expect(isHighQualityJournal("")).toBe(false);
    expect(isHighQualityJournal("Journal of Random Results")).toBe(false);
    expect(isHighQualityJournal("arXiv preprint")).toBe(false);
  });

  it("assigns tier1 to top-tier journals", () => {
    expect(journalQualityTier("Nature")).toBe("tier1");
    expect(journalQualityTier("Science")).toBe("tier1");
    expect(journalQualityTier("Physical Review Letters")).toBe("tier1");
    expect(journalQualityTier("Nature Photonics")).toBe("tier1");
    expect(journalQualityTier("Reviews of Modern Physics")).toBe("tier1");
    expect(journalQualityTier("Optica")).toBe("tier1");
  });

  it("assigns tier2 to strong specialised journals", () => {
    expect(journalQualityTier("Physical Review B")).toBe("tier2");
    expect(journalQualityTier("Optics Express")).toBe("tier2");
    expect(journalQualityTier("Physics of Fluids")).toBe("tier2");
    expect(journalQualityTier("Applied Physics Letters")).toBe("tier2");
  });

  it("returns directions for optics journals", () => {
    expect(journalDirections("Nature Photonics")).toContain("amo-optics");
    expect(journalDirections("Optica")).toContain("amo-optics");
    expect(journalDirections("Light: Science & Applications")).toContain("amo-optics");
  });

  it("returns directions for condensed matter journals", () => {
    expect(journalDirections("Nature Materials")).toContain("condensed-matter-materials");
    expect(journalDirections("Physical Review B")).toContain("condensed-matter-materials");
  });

  it("returns directions for high energy journals", () => {
    expect(journalDirections("JHEP")).toContain("high-energy-particle");
    expect(journalDirections("Physical Review D")).toContain("high-energy-particle");
  });

  it("uses only canonical PhysicsTag slugs", () => {
    const canonical = new Set<string>(PHYSICS_TAG_SLUGS);

    for (const entry of JOURNAL_WHITELIST) {
      expect(entry.directions.every((slug) => canonical.has(slug))).toBe(true);
    }
  });

  it("returns full entry with aliases and directions", () => {
    const entry = findJournalEntry("PRL");
    expect(entry).not.toBeNull();
    expect(entry!.name).toBe("Physical Review Letters");
    expect(entry!.tier).toBe("tier1");
    expect(entry!.aliases).toContain("PRL");
    expect(entry!.directions).toContain("cross-disciplinary");
  });
});
