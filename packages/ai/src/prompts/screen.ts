import { PHYSICS_TAGS } from "@pri/domain/physics-tags";
import type { PaperAiInput } from "../provider";

export const SCREEN_PROMPT_VERSION = "screen-v1";

export type ScreenPaperItem = {
  paperId: string;
  title: string;
  journal?: string | null;
  abstractSnippet?: string | null;
};

export type ScreenPrompt = {
  system: string;
  user: string;
  promptVersion: string;
};

const MAX_ABSTRACT_CHARS = 200;

function truncateAbstract(abstract?: string | null): string | null {
  if (!abstract) return null;
  const trimmed = abstract.trim();
  if (trimmed.length <= MAX_ABSTRACT_CHARS) return trimmed;
  return trimmed.slice(0, MAX_ABSTRACT_CHARS) + "…";
}

/**
 * Build a batch screening prompt. The model receives a compact list of
 * papers (title + journal + first 200 chars of abstract) and must return
 * a score, primary physics direction, short reason, and a selection flag
 * for each paper. This is intentionally much lighter than full classification.
 *
 * @param papers - Papers to screen.
 * @param userInterests - Optional map of tagSlug -> weight (0 to 1+).
 *   When provided, the model is instructed to slightly boost scores for
 *   papers in directions the user follows, while preserving overall quality.
 */
export function buildScreenPrompt(
  papers: ScreenPaperItem[],
  userInterests?: Record<string, number>,
): ScreenPrompt {
  const taxonomy = PHYSICS_TAGS.map(({ slug }) => slug).join(", ");
  const items = papers.map((paper, index) => ({
    index,
    paperId: paper.paperId,
    title: paper.title,
    journal: paper.journal ?? null,
    abstractSnippet: truncateAbstract(paper.abstractSnippet),
  }));

  const interestLines: string[] = [];
  if (userInterests && Object.keys(userInterests).length > 0) {
    const top = Object.entries(userInterests)
      .filter(([, weight]) => weight > 0)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(([slug, weight]) => `${slug}(${weight.toFixed(2)})`)
      .join(", ");
    if (top) {
      interestLines.push(
        `The user follows these physics directions (weight): ${top}.`,
        "Slightly boost the score (by up to 0.08) for papers whose directionSlug matches a user interest,",
        "but never select a low-quality paper just because it matches an interest.",
        "Maintain diversity across directions; do not let a single interest dominate the selected set.",
      );
    }
  }

  return {
    promptVersion: SCREEN_PROMPT_VERSION,
    system: [
      "You are a physics research screening assistant.",
      "Return one strict JSON object and no prose.",
      `For each paper, assign: score (0 to 1, research quality and novelty for a physics daily digest),`,
      `directionSlug (one of: ${taxonomy}),`,
      "reason (one concise sentence in Chinese, under 40 characters),",
      "and selected (true if the paper is worth including in a 10-15 paper daily set).",
      "Prefer papers from high-impact journals with clear physical novelty.",
      "Ensure diversity across directions when possible.",
      ...interestLines,
      "Do not invent methods, data, or conclusions not implied by the title and abstract snippet.",
      "If information is insufficient, give a lower score and state the limitation in the reason.",
    ].join(" "),
    user: JSON.stringify({ papers: items }),
  };
}

/** Helper to convert a PaperAiInput into a screen item. */
export function toScreenItem(
  paperId: string,
  input: PaperAiInput,
): ScreenPaperItem {
  return {
    paperId,
    title: input.title,
    journal: input.journal,
    abstractSnippet: input.abstract,
  };
}
