import { PHYSICS_TAG_SLUGS } from "@pri/domain/physics-tags";
import { z } from "zod";
import { AiProviderError } from "./errors";

export type PhysicsTagSlug = (typeof PHYSICS_TAG_SLUGS)[number];

export const physicsTagSlugSchema = z.enum(PHYSICS_TAG_SLUGS);

export const evidenceLevelSchema = z.enum(["direct", "inferred", "uncertain"]);

export const evidenceReferenceSchema = z
  .object({
    source: z.enum(["metadata", "abstract", "open_content"]),
    locator: z.string().trim().min(1),
    quote: z.string().trim().min(1).optional(),
  })
  .strict();

export const evidenceClaimSchema = z
  .object({
    text: z.string().trim().min(1),
    evidenceLevel: evidenceLevelSchema,
    evidenceReferences: z.array(evidenceReferenceSchema).min(1),
  })
  .strict();

const classificationTagSchema = z
  .object({
    slug: physicsTagSlugSchema,
    relevance: z.number().min(0).max(1),
    reason: z.string().trim().min(1),
    crossDisciplinary: z.boolean(),
  })
  .strict();

export const classificationOutputSchema = z
  .object({
    tags: z.array(classificationTagSchema).min(1),
    overallRelevance: z.number().min(0).max(1),
    reason: z.string().trim().min(1),
    crossDisciplinaryTags: z.array(physicsTagSlugSchema),
  })
  .strict();

const interpretationFields = {
  overviewZh: evidenceClaimSchema,
  researchQuestion: evidenceClaimSchema,
  innovations: z.array(evidenceClaimSchema).min(1),
  methodsAndEvidence: z.array(evidenceClaimSchema).min(1),
  limitations: z.array(evidenceClaimSchema).min(1),
  readingAdvice: z.array(z.string().trim().min(1)).min(1),
};

export const interpretationOutputSchema = z.discriminatedUnion("basis", [
  z
    .object({
      basis: z.literal("abstract_only"),
      sourceDisclosure: z.literal("基于摘要解读"),
      ...interpretationFields,
    })
    .strict(),
  z
    .object({
      basis: z.literal("abstract_and_open_content"),
      sourceDisclosure: z.literal("基于摘要和开放内容解读"),
      ...interpretationFields,
    })
    .strict(),
]);

// ---- Batch screening output ----

export const screenPaperOutputSchema = z
  .object({
    paperId: z.string().trim().min(1),
    score: z.number().min(0).max(1),
    directionSlug: physicsTagSlugSchema,
    reason: z.string().trim().min(1),
    selected: z.boolean(),
  })
  .strict();

export const screenBatchOutputSchema = z
  .object({
    papers: z.array(screenPaperOutputSchema).min(1),
  })
  .strict();

export type ClassificationOutput = z.infer<typeof classificationOutputSchema>;
export type InterpretationOutput = z.infer<typeof interpretationOutputSchema>;
export type EvidenceClaim = z.infer<typeof evidenceClaimSchema>;
export type ScreenPaperOutput = z.infer<typeof screenPaperOutputSchema>;
export type ScreenBatchOutput = z.infer<typeof screenBatchOutputSchema>;

export function parseClassificationOutput(rawText: string): ClassificationOutput {
  return parseOutput(rawText, classificationOutputSchema);
}

export function parseInterpretationOutput(rawText: string): InterpretationOutput {
  return parseOutput(rawText, interpretationOutputSchema);
}

export function parseScreenBatchOutput(rawText: string): ScreenBatchOutput {
  return parseOutput(rawText, screenBatchOutputSchema);
}

function parseOutput<T>(rawText: string, schema: z.ZodType<T>): T {
  let value: unknown;
  try {
    value = JSON.parse(rawText);
  } catch (error) {
    throw new AiProviderError("invalid_json", { cause: error });
  }

  const result = schema.safeParse(value);
  if (!result.success) {
    throw new AiProviderError("schema_invalid", { cause: result.error });
  }
  return result.data;
}
