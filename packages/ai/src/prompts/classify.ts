import { PHYSICS_TAGS } from "@pri/domain/physics-tags";
import type { PaperAiInput } from "../provider";

export const CLASSIFY_PROMPT_VERSION = "classify-v1";

export type AiPrompt = {
  system: string;
  user: string;
  promptVersion: string;
};

export function buildClassificationPrompt(input: PaperAiInput): AiPrompt {
  const taxonomy = PHYSICS_TAGS.map(({ slug, labelZh }) => `${slug}: ${labelZh}`).join("; ");

  return {
    promptVersion: CLASSIFY_PROMPT_VERSION,
    system: [
      "Return one strict JSON object and no prose.",
      `Use only these physics tag slugs: ${taxonomy}.`,
      "Return tags with relevance from 0 to 1, a short reason, crossDisciplinary,",
      "overallRelevance, reason, and crossDisciplinaryTags.",
      "Do not invent authors, methods, instruments, metrics, data, or conclusions.",
      "If the public facts are insufficient, state that limitation in the reason.",
    ].join(" "),
    user: JSON.stringify(input),
  };
}
