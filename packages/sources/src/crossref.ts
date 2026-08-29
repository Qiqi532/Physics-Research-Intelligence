import { paperSourceInputSchema, type PaperSourceInput } from "@pri/domain/paper";
import { z } from "zod";
import { SourceConnectorError, createRetriableFetch } from "./http";
import { assertPageRequest, cleanText, dateOnly } from "./metadata";
import type { SourceConnector, SourceFetch } from "./types";

const crossrefItemSchema = z.object({
  DOI: z.string().optional(),
  title: z.array(z.string()).optional(),
  abstract: z.string().optional(),
  author: z.array(z.object({ given: z.string().optional(), family: z.string().optional() })).optional(),
  "container-title": z.array(z.string()).optional(),
  published: z.object({ "date-parts": z.array(z.array(z.number())) }).optional(),
  "published-online": z.object({ "date-parts": z.array(z.array(z.number())) }).optional(),
  "published-print": z.object({ "date-parts": z.array(z.array(z.number())) }).optional(),
  URL: z.string().url().optional(),
  license: z.array(z.object({ URL: z.string().url() })).optional(),
});

const crossrefResponseSchema = z.object({
  message: z.object({
    items: z.array(crossrefItemSchema),
    "next-cursor": z.string().nullable().optional(),
  }),
});

type CrossrefOptions = {
  issn: string;
  fetchImpl?: SourceFetch;
  contactEmail?: string;
  userAgent?: string;
  now?: () => Date;
};

export function createCrossrefConnector(options: CrossrefOptions): SourceConnector {
  const request = createRetriableFetch({ fetchImpl: options.fetchImpl });
  const now = options.now ?? (() => new Date());
  const issn = normalizeIssn(options.issn);

  return {
    name: "crossref",
    async fetchPage(pageRequest) {
      const pageSize = assertPageRequest(pageRequest, 1_000);
      const url = new URL("https://api.crossref.org/works");
      url.searchParams.set(
        "filter",
        `from-created-date:${dateOnly(pageRequest.from)},until-created-date:${dateOnly(pageRequest.until)},issn:${issn}`,
      );
      url.searchParams.set("cursor", pageRequest.cursor ?? "*");
      url.searchParams.set("rows", String(pageSize));
      if (options.contactEmail?.trim()) {
        url.searchParams.set("mailto", options.contactEmail.trim());
      }

      const response = await request(url, {
        headers: { "User-Agent": options.userAgent ?? "PhysicsResearchIntelligence/0.1" },
        signal: pageRequest.signal,
      });
      const payload = await parseResponse(response);
      const records = payload.message.items.flatMap((item) => {
        const record = mapCrossrefItem(item, now());
        return record ? [record] : [];
      });

      return {
        records,
        nextCursor: records.length > 0 ? (payload.message["next-cursor"] ?? null) : null,
      };
    },
  };
}

function normalizeIssn(value: string): string {
  const normalized = value.trim().toUpperCase();
  if (!/^\d{4}-?\d{3}[\dX]$/u.test(normalized)) {
    throw new SourceConnectorError("request_failed", "Crossref ISSN is invalid");
  }
  return normalized;
}

async function parseResponse(response: Response): Promise<z.infer<typeof crossrefResponseSchema>> {
  try {
    return crossrefResponseSchema.parse(await response.json());
  } catch (error) {
    throw new SourceConnectorError("malformed_response", "Crossref returned malformed JSON", {
      cause: error,
    });
  }
}

function mapCrossrefItem(
  item: z.infer<typeof crossrefItemSchema>,
  retrievedAt: Date,
): PaperSourceInput | null {
  const doi = item.DOI?.trim();
  const title = cleanText(item.title?.[0]);
  if (!doi || !title) {
    return null;
  }

  const licenseUrl = item.license?.[0]?.URL ?? null;
  const originalUrl = item.URL ?? `https://doi.org/${doi}`;
  return paperSourceInputSchema.parse({
    doi,
    sourceName: "crossref",
    sourceRecordId: doi.toLowerCase(),
    sourceUrl: `https://api.crossref.org/works/${encodeURIComponent(doi)}`,
    licenseUrl,
    retrievedAt,
    title,
    abstract: cleanText(item.abstract),
    journal: cleanText(item["container-title"]?.[0]),
    firstAuthor: authorName(item.author?.[0]),
    publishedAt: crossrefDate(
      item.published ?? item["published-online"] ?? item["published-print"],
    ),
    originalUrl,
    accessStatus: licenseUrl ? "OPEN" : "UNKNOWN",
  });
}

function authorName(author: { given?: string; family?: string } | undefined): string | null {
  const value = [author?.given, author?.family].filter(Boolean).join(" ").trim();
  return value || null;
}

function crossrefDate(value: { "date-parts": number[][] } | undefined): Date | null {
  const [year, month = 1, day = 1] = value?.["date-parts"]?.[0] ?? [];
  return year ? new Date(Date.UTC(year, month - 1, day)) : null;
}
