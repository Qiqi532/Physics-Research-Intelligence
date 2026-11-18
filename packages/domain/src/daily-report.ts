import { z } from "zod";

const provenance = z.object({
  provider: z.string(), model: z.string(), promptVersion: z.string(), inputHash: z.string(),
}).strict();

export const dailyReportItemSchema = z.object({
  paperId: z.string().uuid(), doi: z.string().nullable(), title: z.string(),
  journal: z.string().nullable(), publishedAt: z.string().datetime().nullable(),
  createdAt: z.string().datetime(), originalUrl: z.string().nullable(),
  accessStatus: z.enum(["UNKNOWN", "OPEN", "RESTRICTED"]), sourceName: z.string().nullable(),
  score: z.number().min(0).max(1), topicId: z.string(), topicLabel: z.string(),
  topicKind: z.enum(["core", "adjacent"]), reasons: z.array(z.string()),
  evidence: z.object({ source: z.enum(["title", "abstract"]), quote: z.string().min(1),
    verification: z.literal("exact_substring") }).strict(),
  screening: provenance,
  interpretation: provenance.extend({ content: z.record(z.string(), z.unknown()) }).nullable(),
}).strict();

export const sourceCoverageSchema = z.object({
  name: z.string(), status: z.enum(["complete", "limited", "failed"]),
  records: z.number().int().nonnegative(), errorCode: z.string().optional(),
}).strict();

export const dailyReportSchema = z.object({
  schemaVersion: z.literal(1), dateKey: z.string().regex(/^\d{4}-\d{2}-\d{2}$/u),
  profileHash: z.string(), profileLabel: z.string(),
  sourceCoverage: z.array(sourceCoverageSchema),
  items: z.array(dailyReportItemSchema),
  validation: z.object({ mode: z.literal("single_model"), semanticSupport: z.literal("unverified"),
    unavailableInterpretations: z.number().int().nonnegative().optional(),
    unscreenedCandidates: z.number().int().nonnegative().optional(),
    titleOnly: z.number().int().nonnegative().optional() }).strict(),
}).strict().superRefine((report, context) => {
  if (new Set(report.items.map((item) => item.paperId)).size !== report.items.length) {
    context.addIssue({ code: "custom", message: "Duplicate report identities" });
  }
});

export type DailyReportSnapshot = z.infer<typeof dailyReportSchema>;
export type DailyReportItem = z.infer<typeof dailyReportItemSchema>;
export type SourceCoverage = z.infer<typeof sourceCoverageSchema>;

export type DailyReportState = {
  id: string | null; dateKey: string | null; profileLabel: string | null;
  status: "missing" | "current" | "stale";
  runStatus: "RUNNING" | "SUCCEEDED" | "PARTIAL" | "FAILED" | null;
  stage: string | null; errorCode: string | null;
  sourceCoverage: SourceCoverage[];
  validation?: DailyReportSnapshot["validation"];
};

export function expectedReportDate(now: Date, time = "12:15", timezone = "Asia/Shanghai"): string {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: timezone, year: "numeric", month: "2-digit",
    day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(now);
  const field = (name: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === name)!.value;
  const date = `${field("year")}-${field("month")}-${field("day")}`;
  return `${field("hour")}:${field("minute")}` >= time ? date
    : new Date(new Date(`${date}T00:00:00Z`).getTime() - 86400_000).toISOString().slice(0, 10);
}
