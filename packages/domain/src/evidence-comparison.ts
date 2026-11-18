import { z } from "zod";

export const comparisonMeasurements = {
  gate: "栅压",
  drain: "漏压",
  wavelength: "波长",
  illumination: "入射光功率 / 功率密度",
  responsivity: "响应度",
  responseTime: "响应时间",
} as const;

export const measurementKeys = Object.keys(comparisonMeasurements) as (keyof typeof comparisonMeasurements)[];
export const comparisonPageSize = 50;
export const comparisonQuoteLimit = 2400;

const text = (limit: number) => z.string().trim().max(limit).refine((value) => !value.includes("\0"));
const measurement = z.strictObject({
  value: text(80).refine((value) => /\d/.test(value.normalize("NFKC"))),
  unit: text(40).refine(Boolean),
}).nullable().default(null);

const comparisonFields = z.strictObject({
  material: text(180).default(""),
  structure: text(240).default(""),
  conditions: text(600).default(""),
  gate: measurement,
  drain: measurement,
  wavelength: measurement,
  illumination: measurement,
  illuminationKind: z.enum(["power", "density"]).nullable().default(null),
  responsivity: measurement,
  responseTime: measurement,
}).refine((fields) => Boolean(fields.illumination) === Boolean(fields.illuminationKind));

const contentShape = {
  quote: text(comparisonQuoteLimit).default(""),
  figure: text(120).default(""),
  fields: comparisonFields,
};
const hasEvidence = ({ quote, figure }: { quote: string; figure: string }) => Boolean(quote || figure);
export const comparisonContentSchema = z.strictObject(contentShape).refine(hasEvidence);
export const comparisonSourceSchema = z.strictObject({
  documentId: z.string().regex(/^[a-f0-9]{64}$/),
  page: z.number().int().min(1).max(99_999),
  ...contentShape,
}).refine(hasEvidence);
export const comparisonIdSchema = z.uuid();

export type ComparisonFields = z.infer<typeof comparisonFields>;
export type ComparisonContent = z.infer<typeof comparisonContentSchema>;
export type ComparisonSource = z.infer<typeof comparisonSourceSchema>;
export type ComparisonRow = ComparisonSource & { id: string; sourceTitle: string; updatedAt: Date };

export const illuminationLabels = { power: "光功率", density: "功率密度" } as const;

const markdownCell = (value: string) => value.replace(/\s*\r?\n\s*/g, " ")
  .replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;")
  .replace(/[\\|`*_[\]~]/g, "\\$&");

function csvCell(value: string) {
  const formula = /^[\s\uFEFF]*[=+@-]|^[\t\r\n]/u.test(value);
  const signedNumber = /^[+-]?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?$/.test(value);
  return '"' + (formula && !signedNumber ? "'" : "") + value.replaceAll('"', '""') + '"';
}

export function serializeComparison(rows: ComparisonRow[], format: "csv" | "md", origin: string): string {
  const labels = ["论文", "物理页", "材料", "器件结构", "工况", "入射量类型"];
  const header = labels.concat(measurementKeys.flatMap((key) => [
    comparisonMeasurements[key], ...(format === "csv" ? [comparisonMeasurements[key] + "单位"] : []),
  ]), ["图表号", "原文摘录", "原文证据页"]);
  const table = rows.map(({ sourceTitle, page, documentId, quote, figure, fields }) => {
    const path = new URL("/evidence/" + documentId + "/" + page, origin).href;
    const kind = fields.illuminationKind ? illuminationLabels[fields.illuminationKind] : "";
    const cells = [sourceTitle, String(page), fields.material, fields.structure, fields.conditions, kind]
      .concat(measurementKeys.flatMap((key) => {
        const { value = "", unit = "" } = fields[key] ?? {};
        return format === "csv" ? [value, unit] : [value ? value + " " + unit : ""];
      }), [figure, quote]);
    return format === "csv"
      ? [...cells, path].map(csvCell).join(",")
      : "| " + [...cells.map(markdownCell), "[第 " + page + " 页](" + path + ")"].join(" | ") + " |";
  });
  if (format === "csv") return "\uFEFF" + [header.map(csvCell).join(","), ...table].join("\r\n") + "\r\n";
  return ["# 器件证据对照表", "", "| " + header.map(markdownCell).join(" | ") + " |",
    "| " + header.map(() => "---").join(" | ") + " |", ...table, ""].join("\n");
}
