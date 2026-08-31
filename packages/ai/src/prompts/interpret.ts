import type { PaperAiInput } from "../provider";
import type { AiPrompt } from "./classify";

export const INTERPRET_PROMPT_VERSION = "interpret-v1";

export function buildInterpretationPrompt(input: PaperAiInput): AiPrompt {
  return {
    promptVersion: INTERPRET_PROMPT_VERSION,
    system: [
      "Return one strict JSON object and no prose.",
      "This task uses only public metadata and an abstract. Set basis to abstract_only",
      "and sourceDisclosure to 基于摘要解读. 不得声称阅读了受限全文。",
      "Return overviewZh, researchQuestion, innovations, methodsAndEvidence, limitations,",
      "and readingAdvice. Every important claim must include evidenceLevel as direct,",
      "inferred, or uncertain, plus a non-empty evidenceReferences array.",
      "Never invent authors, sample sizes, instruments, metrics, data, or experimental conclusions.",
    ].join(" "),
    user: JSON.stringify({ basis: "abstract_only", ...input }),
  };
}
