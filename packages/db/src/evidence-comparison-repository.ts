import {
  comparisonContentSchema, comparisonPageSize, type ComparisonContent, type ComparisonRow, type ComparisonSource,
} from "@pri/domain/evidence-comparison";
import type { DatabaseClient } from "./client";
import type { EvidenceComparisonRow } from "./generated/prisma/client";

export type ComparisonPage = {
  text: string;
  document: {
    title: string | null;
    locations: { name: string }[];
    zoteroLocations: { title: string }[];
  };
};

export function evidenceSourceTitle(document: ComparisonPage["document"]) {
  return document.zoteroLocations[0]?.title ?? document.title ?? document.locations[0]?.name ?? "历史文件版本";
}

function asRow({ id, documentId, page, sourceTitle, quote, figure, fields, updatedAt }: EvidenceComparisonRow): ComparisonRow {
  return { id, documentId, page, sourceTitle, updatedAt, ...comparisonContentSchema.parse({ quote, figure, fields }) };
}

export function createEvidenceComparisonRepository(
  db: DatabaseClient,
  readPage: (id: string, page: number) => PromiseLike<ComparisonPage | null>,
) {
  return {
    async list(page: number) {
      const rows = await db.evidenceComparisonRow.findMany({
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        skip: (page - 1) * comparisonPageSize,
        take: comparisonPageSize + 1,
      });
      return { rows: rows.slice(0, comparisonPageSize).map(asRow), hasNext: rows.length > comparisonPageSize };
    },
    async selected(ids: string[]) {
      const rows = await db.evidenceComparisonRow.findMany({ where: { id: { in: ids } } });
      const byId = new Map(rows.map((row) => [row.id, row]));
      return ids.flatMap((id) => {
        const row = byId.get(id);
        return row ? [asRow(row)] : [];
      });
    },
    async add(source: ComparisonSource) {
      const evidence = await readPage(source.documentId, source.page);
      if (!evidence) return { status: "page_missing" } as const;
      if (source.quote && !evidence.text.includes(source.quote)) return { status: "quote_mismatch" } as const;
      const { id } = await db.evidenceComparisonRow.create({
        data: { ...source, sourceTitle: evidenceSourceTitle(evidence.document) }, select: { id: true },
      });
      return { status: "saved", id } as const;
    },
    async update(id: string, content: ComparisonContent) {
      const row = await db.evidenceComparisonRow.findUnique({
        where: { id }, select: { documentId: true, page: true, quote: true },
      });
      if (!row) return { status: "row_missing" } as const;
      if (content.quote && content.quote !== row.quote) {
        const evidence = await readPage(row.documentId, row.page);
        if (!evidence) return { status: "page_missing" } as const;
        if (!evidence.text.includes(content.quote)) return { status: "quote_mismatch" } as const;
      }
      const result = await db.evidenceComparisonRow.updateMany({ where: { id }, data: content });
      return result.count ? { status: "saved", id } as const : { status: "row_missing" } as const;
    },
    async remove(id: string) {
      const result = await db.evidenceComparisonRow.deleteMany({ where: { id } });
      return result.count > 0;
    },
  };
}
