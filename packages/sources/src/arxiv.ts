import { paperSourceInputSchema, type PaperSourceInput } from "@pri/domain/paper";
import { XMLParser } from "fast-xml-parser";
import { SourceConnectorError, createRetriableFetch } from "./http";
import { assertPageRequest, cleanText } from "./metadata";
import type { Sleep, SourceConnector, SourceFetch } from "./types";

const arxivCategories = [
  "astro-ph*",
  "cond-mat*",
  "gr-qc",
  "hep-ex",
  "hep-lat",
  "hep-ph",
  "hep-th",
  "math-ph",
  "nlin*",
  "nucl-ex",
  "nucl-th",
  "physics*",
  "quant-ph",
] as const;

type ArxivOptions = {
  fetchImpl?: SourceFetch;
  userAgent?: string;
  now?: () => Date;
  nowMs?: () => number;
  sleep?: Sleep;
  minimumIntervalMs?: number;
};

type AtomEntry = Record<string, unknown>;

export function createArxivConnector(options: ArxivOptions = {}): SourceConnector {
  const sleep = options.sleep ?? defaultSleep;
  const request = createRetriableFetch({ fetchImpl: options.fetchImpl, sleep });
  const now = options.now ?? (() => new Date());
  const nowMs = options.nowMs ?? Date.now;
  const minimumIntervalMs = options.minimumIntervalMs ?? 3_000;
  let lastRequestAt: number | null = null;

  return {
    name: "arxiv",
    async fetchPage(pageRequest) {
      const pageSize = assertPageRequest(pageRequest, 2_000);
      const start = parseCursor(pageRequest.cursor);
      await throttle();

      const url = new URL("https://export.arxiv.org/api/query");
      url.searchParams.set("search_query", buildSearchQuery(pageRequest.from, pageRequest.until));
      url.searchParams.set("start", String(start));
      url.searchParams.set("max_results", String(pageSize));
      url.searchParams.set("sortBy", "submittedDate");
      url.searchParams.set("sortOrder", "ascending");

      const response = await request(url, {
        headers: { "User-Agent": options.userAgent ?? "PhysicsResearchIntelligence/0.1" },
        signal: pageRequest.signal,
      });
      const feed = parseAtom(await response.text());
      const entries = normalizeArray(feed.entry).filter(isRecord);
      const records = entries.flatMap((entry) => {
        const record = mapEntry(entry, now());
        return record ? [record] : [];
      });
      const totalResults = parseNonNegativeInteger(feed["opensearch:totalResults"]);
      const nextOffset = start + entries.length;

      return {
        records,
        nextCursor: entries.length > 0 && nextOffset < totalResults ? String(nextOffset) : null,
      };
    },
  };

  async function throttle(): Promise<void> {
    const current = nowMs();
    if (lastRequestAt !== null) {
      const remaining = minimumIntervalMs - (current - lastRequestAt);
      if (remaining > 0) {
        await sleep(remaining);
      }
    }
    lastRequestAt = nowMs();
  }
}

function parseCursor(cursor: string | null | undefined): number {
  if (cursor === null || cursor === undefined) {
    return 0;
  }
  if (!/^\d+$/u.test(cursor)) {
    throw new SourceConnectorError("invalid_cursor", "arXiv cursor must be an offset");
  }
  return Number(cursor);
}

function buildSearchQuery(from: Date, until: Date): string {
  const categories = arxivCategories.map((category) => `cat:${category}`).join(" OR ");
  return `(${categories}) AND submittedDate:[${arxivDate(from)} TO ${arxivDate(until)}]`;
}

function arxivDate(value: Date): string {
  return value.toISOString().replace(/[-:]/gu, "").slice(0, 12);
}

function parseAtom(xml: string): AtomEntry {
  try {
    const parsed = new XMLParser({
      ignoreAttributes: false,
      attributeNamePrefix: "",
      trimValues: true,
      parseTagValue: false,
    }).parse(xml) as unknown;
    if (!isRecord(parsed) || !isRecord(parsed.feed)) {
      throw new Error("Atom feed element is missing");
    }
    return parsed.feed;
  } catch (error) {
    throw new SourceConnectorError("malformed_response", "arXiv returned malformed Atom XML", {
      cause: error,
    });
  }
}

function mapEntry(entry: AtomEntry, retrievedAt: Date): PaperSourceInput | null {
  const id = stringValue(entry.id);
  const title = cleanText(stringValue(entry.title));
  if (!id || !title || !isHttpUrl(id)) {
    return null;
  }

  const links = normalizeArray(entry.link).filter(isRecord);
  const licenseUrl = links.find((link) => link.rel === "license")?.href;
  const alternateUrl = links.find((link) => link.rel === "alternate")?.href;
  const authors = normalizeArray(entry.author).filter(isRecord);
  const sourceRecordId = new URL(id).pathname
    .split("/")
    .filter(Boolean)
    .at(-1)
    ?.replace(/v\d+$/u, "");

  if (!sourceRecordId) {
    return null;
  }

  return paperSourceInputSchema.parse({
    doi: cleanText(stringValue(entry["arxiv:doi"])) ?? undefined,
    sourceName: "arxiv",
    sourceRecordId,
    sourceUrl: id,
    licenseUrl: isHttpUrl(licenseUrl) ? licenseUrl : null,
    retrievedAt,
    title,
    abstract: cleanText(stringValue(entry.summary)),
    journal: cleanText(stringValue(entry["arxiv:journal_ref"])) ?? "arXiv",
    firstAuthor: cleanText(stringValue(authors[0]?.name)),
    publishedAt: parseDate(stringValue(entry.published)),
    originalUrl: isHttpUrl(alternateUrl) ? alternateUrl : id,
    accessStatus: "OPEN",
  });
}

function normalizeArray(value: unknown): unknown[] {
  if (value === undefined || value === null) {
    return [];
  }
  return Array.isArray(value) ? value : [value];
}

function parseNonNegativeInteger(value: unknown): number {
  const result = Number(stringValue(value));
  if (!Number.isInteger(result) || result < 0) {
    throw new SourceConnectorError(
      "malformed_response",
      "arXiv totalResults is missing or invalid",
    );
  }
  return result;
}

function parseDate(value: string | null): Date | null {
  if (!value) {
    return null;
  }
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function stringValue(value: unknown): string | null {
  return typeof value === "string" || typeof value === "number" ? String(value) : null;
}

function isHttpUrl(value: unknown): value is string {
  if (typeof value !== "string") {
    return false;
  }
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function defaultSleep(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}
