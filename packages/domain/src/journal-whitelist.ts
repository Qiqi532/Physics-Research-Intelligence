/**
 * High-quality physics journal whitelist.
 *
 * Used as the first deterministic filter in the daily pipeline: only papers
 * from recognised, high-impact physics journals proceed to LLM screening.
 * Matching is case-insensitive, punctuation-insensitive, and supports both
 * full names and common abbreviations.
 */

import type { PhysicsTagSlug } from "./physics-tags";

export type JournalTier = "tier1" | "tier2";

export type JournalEntry = {
  /** Canonical display name. */
  name: string;
  /** Common abbreviations or alternative spellings. */
  aliases: string[];
  /** Quality tier. */
  tier: JournalTier;
  /** Primary physics direction(s) covered. */
  directions: PhysicsTagSlug[];
};

/**
 * Curated list of high-quality physics journals.
 * Tier 1: top-tier general / field-leading journals (roughly IF >= 10 or
 *         undisputed field leaders).
 * Tier 2: strong specialised journals (roughly IF >= 4 or well-regarded
 *         field-specific outlets).
 */
export const HIGH_QUALITY_PHYSICS_JOURNALS: JournalEntry[] = [
  // ---- General / multidisciplinary ----
  { name: "Nature", aliases: [], tier: "tier1", directions: ["cross-disciplinary"] },
  { name: "Science", aliases: [], tier: "tier1", directions: ["cross-disciplinary"] },
  { name: "Nature Communications", aliases: ["Nat Commun"], tier: "tier1", directions: ["cross-disciplinary"] },
  { name: "Science Advances", aliases: ["Sci Adv"], tier: "tier1", directions: ["cross-disciplinary"] },
  { name: "PNAS", aliases: ["Proceedings of the National Academy of Sciences", "Proc Natl Acad Sci USA"], tier: "tier1", directions: ["cross-disciplinary"] },
  { name: "Advanced Science", aliases: ["Adv Sci"], tier: "tier2", directions: ["cross-disciplinary"] },

  // ---- General physics ----
  { name: "Nature Physics", aliases: ["Nat Phys"], tier: "tier1", directions: ["cross-disciplinary"] },
  { name: "Physical Review Letters", aliases: ["PRL", "Phys Rev Lett"], tier: "tier1", directions: ["cross-disciplinary"] },
  { name: "Physical Review X", aliases: ["PRX", "Phys Rev X"], tier: "tier1", directions: ["cross-disciplinary"] },
  { name: "PRX Quantum", aliases: [], tier: "tier1", directions: ["amo-optics"] },
  { name: "PRX Energy", aliases: [], tier: "tier2", directions: ["condensed-matter-materials"] },
  { name: "Physical Review Research", aliases: ["PRResearch", "Phys Rev Res"], tier: "tier2", directions: ["cross-disciplinary"] },
  { name: "Reports on Progress in Physics", aliases: ["Rep Prog Phys", "RPP"], tier: "tier1", directions: ["cross-disciplinary"] },
  { name: "Advances in Physics", aliases: ["Adv Phys"], tier: "tier2", directions: ["cross-disciplinary"] },
  { name: "Advances in Physics-X", aliases: ["Adv Phys X"], tier: "tier2", directions: ["cross-disciplinary"] },
  { name: "New Journal of Physics", aliases: ["NJP", "New J Phys"], tier: "tier2", directions: ["cross-disciplinary"] },
  { name: "European Physical Journal B", aliases: ["EPJ B"], tier: "tier2", directions: ["cross-disciplinary"] },

  // ---- Reviews of Modern Physics / Physics Reports ----
  { name: "Reviews of Modern Physics", aliases: ["RMP", "Rev Mod Phys"], tier: "tier1", directions: ["cross-disciplinary"] },
  { name: "Physics Reports", aliases: ["Phys Rep"], tier: "tier1", directions: ["cross-disciplinary"] },
  { name: "Nature Reviews Physics", aliases: ["Nat Rev Phys"], tier: "tier1", directions: ["cross-disciplinary"] },

  // ---- Optics / photonics ----
  { name: "Nature Photonics", aliases: ["Nat Photon"], tier: "tier1", directions: ["amo-optics"] },
  { name: "Optica", aliases: [], tier: "tier1", directions: ["amo-optics"] },
  { name: "Light: Science & Applications", aliases: ["Light Sci Appl", "Light Science and Applications"], tier: "tier1", directions: ["amo-optics"] },
  { name: "Laser & Photonics Reviews", aliases: ["Laser Photonics Rev", "LPR"], tier: "tier1", directions: ["amo-optics"] },
  { name: "Advances in Optics and Photonics", aliases: ["Adv Opt Photonics"], tier: "tier1", directions: ["amo-optics"] },
  { name: "eLight", aliases: [], tier: "tier1", directions: ["amo-optics"] },
  { name: "Photonics Research", aliases: [], tier: "tier2", directions: ["amo-optics"] },
  { name: "APL Photonics", aliases: [], tier: "tier2", directions: ["amo-optics"] },
  { name: "Optics Express", aliases: ["Opt Express"], tier: "tier2", directions: ["amo-optics"] },
  { name: "Optics Letters", aliases: ["Opt Lett"], tier: "tier2", directions: ["amo-optics"] },
  { name: "Journal of Lightwave Technology", aliases: ["J Lightwave Technol", "JLT"], tier: "tier2", directions: ["amo-optics"] },

  // ---- Condensed matter / materials ----
  { name: "Nature Materials", aliases: ["Nat Mater"], tier: "tier1", directions: ["condensed-matter-materials"] },
  { name: "Nature Nanotechnology", aliases: ["Nat Nanotechnol"], tier: "tier1", directions: ["condensed-matter-materials"] },
  { name: "Advanced Materials", aliases: ["Adv Mater"], tier: "tier1", directions: ["condensed-matter-materials"] },
  { name: "ACS Nano", aliases: [], tier: "tier1", directions: ["condensed-matter-materials"] },
  { name: "Nano Letters", aliases: ["Nano Lett"], tier: "tier1", directions: ["condensed-matter-materials"] },
  { name: "Nature Electronics", aliases: ["Nat Electron"], tier: "tier1", directions: ["condensed-matter-materials"] },
  { name: "Annual Review of Condensed Matter Physics", aliases: ["Annu Rev Condens Matter Phys"], tier: "tier1", directions: ["condensed-matter-materials"] },
  { name: "Physical Review B", aliases: ["PRB", "Phys Rev B"], tier: "tier2", directions: ["condensed-matter-materials"] },
  { name: "Journal of Physics: Condensed Matter", aliases: ["J Phys Condens Matter", "JPCM"], tier: "tier2", directions: ["condensed-matter-materials"] },
  { name: "2D Materials", aliases: [], tier: "tier2", directions: ["condensed-matter-materials"] },

  // ---- High energy / particle / nuclear ----
  { name: "Journal of High Energy Physics", aliases: ["JHEP"], tier: "tier1", directions: ["high-energy-particle"] },
  { name: "Progress in Particle and Nuclear Physics", aliases: ["Prog Part Nucl Phys"], tier: "tier1", directions: ["high-energy-particle"] },
  { name: "Physical Review D", aliases: ["PRD", "Phys Rev D"], tier: "tier2", directions: ["high-energy-particle"] },
  { name: "Physical Review C", aliases: ["PRC", "Phys Rev C"], tier: "tier2", directions: ["nuclear"] },
  { name: "Nuclear Physics A", aliases: ["Nucl Phys A"], tier: "tier2", directions: ["nuclear"] },
  { name: "Nuclear Physics B", aliases: ["Nucl Phys B"], tier: "tier2", directions: ["high-energy-particle"] },
  { name: "Journal of Cosmology and Astroparticle Physics", aliases: ["JCAP"], tier: "tier2", directions: ["high-energy-particle"] },

  // ---- Astrophysics ----
  { name: "Nature Astronomy", aliases: ["Nat Astron"], tier: "tier1", directions: ["astrophysics"] },
  { name: "Astrophysical Journal Letters", aliases: ["ApJL", "Astrophys J Lett"], tier: "tier1", directions: ["astrophysics"] },
  { name: "Astrophysical Journal", aliases: ["ApJ", "Astrophys J"], tier: "tier2", directions: ["astrophysics"] },
  { name: "Monthly Notices of the Royal Astronomical Society", aliases: ["MNRAS", "Mon Not R Astron Soc"], tier: "tier2", directions: ["astrophysics"] },
  { name: "Astronomy & Astrophysics", aliases: ["A&A", "Astron Astrophys"], tier: "tier2", directions: ["astrophysics"] },
  { name: "Living Reviews in Solar Physics", aliases: [], tier: "tier2", directions: ["astrophysics"] },

  // ---- Fluids / plasma ----
  { name: "Annual Review of Fluid Mechanics", aliases: ["Annu Rev Fluid Mech"], tier: "tier1", directions: ["statistical-computational"] },
  { name: "Nuclear Fusion", aliases: ["Nucl Fusion"], tier: "tier1", directions: ["plasma"] },
  { name: "Plasma Physics and Controlled Fusion", aliases: ["PPCF", "Plasma Phys Control Fusion"], tier: "tier2", directions: ["plasma"] },
  { name: "Physics of Fluids", aliases: ["Phys Fluids"], tier: "tier2", directions: ["statistical-computational"] },
  { name: "Journal of Fluid Mechanics", aliases: ["JFM", "J Fluid Mech"], tier: "tier2", directions: ["statistical-computational"] },

  // ---- Applied physics / energy ----
  { name: "Nature Energy", aliases: ["Nat Energy"], tier: "tier1", directions: ["condensed-matter-materials"] },
  { name: "Nature Catalysis", aliases: ["Nat Catal"], tier: "tier1", directions: ["condensed-matter-materials"] },
  { name: "Applied Physics Reviews", aliases: ["Appl Phys Rev", "APR"], tier: "tier1", directions: ["condensed-matter-materials"] },
  { name: "Journal of Applied Physics", aliases: ["J Appl Phys", "JAP"], tier: "tier2", directions: ["condensed-matter-materials"] },
  { name: "Applied Physics Letters", aliases: ["APL", "Appl Phys Lett"], tier: "tier2", directions: ["condensed-matter-materials"] },

  // ---- Statistical / computational / biophysics ----
  { name: "Physical Review E", aliases: ["PRE", "Phys Rev E"], tier: "tier2", directions: ["statistical-computational"] },
  { name: "Physical Review Letters", aliases: [], tier: "tier1", directions: ["statistical-computational"] }, // already listed, dedup handled below
  { name: "Biophysical Journal", aliases: ["Biophys J"], tier: "tier2", directions: ["biophysics"] },
];

// De-duplicate by canonical name (case-insensitive), keeping first occurrence.
const seenNames = new Set<string>();
export const JOURNAL_WHITELIST: JournalEntry[] = HIGH_QUALITY_PHYSICS_JOURNALS.filter(
  (entry) => {
    const key = entry.name.toLowerCase();
    if (seenNames.has(key)) return false;
    seenNames.add(key);
    return true;
  },
);

function normalizeForMatch(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFKC")
    .replace(/[\p{P}\p{S}]+/gu, " ")
    .replace(/\s+/gu, " ")
    .trim();
}

/**
 * Returns the whitelist entry matching the given journal name, or null.
 * Matching is case-insensitive, punctuation-insensitive, and checks both
 * the canonical name and aliases. Longer (more specific) candidates are
 * tried first so that "Nature Photonics" wins over "Nature". Short
 * abbreviations (<=4 chars) require word-boundary matches to avoid
 * false positives like "PRL" matching "preprint".
 */
export function findJournalEntry(journal: string | null | undefined): JournalEntry | null {
  if (!journal) return null;
  const normalized = normalizeForMatch(journal);
  if (!normalized) return null;

  // Build a flat list of (entry, candidate) pairs sorted by candidate
  // length descending so more specific names match first.
  const pairs: Array<{ entry: JournalEntry; candidate: string }> = [];
  for (const entry of JOURNAL_WHITELIST) {
    for (const raw of [entry.name, ...entry.aliases]) {
      const candidate = normalizeForMatch(raw);
      if (candidate) pairs.push({ entry, candidate });
    }
  }
  pairs.sort((a, b) => b.candidate.length - a.candidate.length);

  for (const { entry, candidate } of pairs) {
    if (matchesCandidate(normalized, candidate)) {
      return entry;
    }
  }
  return null;
}

function matchesCandidate(normalized: string, candidate: string): boolean {
  if (normalized === candidate) return true;
  // For short abbreviations, require word boundaries to avoid "prl"
  // matching inside "preprint".
  if (candidate.length <= 4) {
    const boundaryPattern = new RegExp(
      `(^|\\s)${escapeRegExp(candidate)}(\\s|$)`,
      "u",
    );
    return boundaryPattern.test(normalized);
  }
  return normalized.includes(candidate);
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
}

/** Returns true when the journal is in the high-quality whitelist. */
export function isHighQualityJournal(journal: string | null | undefined): boolean {
  return findJournalEntry(journal) !== null;
}

/** Returns the quality tier of the journal, or null when not listed. */
export function journalQualityTier(journal: string | null | undefined): JournalTier | null {
  return findJournalEntry(journal)?.tier ?? null;
}

/** Returns the primary direction(s) associated with the journal, or []. */
export function journalDirections(journal: string | null | undefined): string[] {
  return findJournalEntry(journal)?.directions ?? [];
}

/** Total number of whitelisted journals (for diagnostics). */
export const JOURNAL_WHITELIST_COUNT = JOURNAL_WHITELIST.length;
