import { paperSourceInputSchema, type PaperSourceInput } from "@pri/domain/paper";
import { z } from "zod";
import { SourceConnectorError, createRetriableFetch } from "./http";
import {
  assertPageRequest,
  cleanText,
  creativeCommonsUrl,
  dateOnly,
  finalPathSegment,
} from "./metadata";
import type { SourceConnector, SourceFetch } from "./types";

const openAlexWorkSchema = z.object({
  id: z.string().url(),
  doi: z.string().url().nullable().optional(),
  title: z.string().nullable().optional(),
  publication_date: z.string().nullable().optional(),
  abstract_inverted_index: z.record(z.string(), z.array(z.number())).nullable().optional(),
  authorships: z.array(z.object({
    author: z.object({ display_name: z.string().nullable().optional() }),
  })).optional(),
  primary_location: z.object({
    landing_page_url: z.string().url().nullable().optional(),
    license: z.string().nullable().optional(),
    source: z.object({ display_name: z.string().nullable().optional() }).nullable().optional(),
  }).nullable().optional(),
  open_access: z.object({ is_oa: z.boolean().optional() }).nullable().optional(),
});

const openAlexResponseSchema = z.object({
  meta: z.object({ next_cursor: z.string().nullable().optional() }),
  results: z.array(openAlexWorkSchema),
});

type OpenAlexOptions = {
  fetchImpl?: SourceFetch;
  apiKey?: string;
  userAgent?: string;
  now?: () => Date;
};

export function createOpenAlexConnector(options: OpenAlexOptions = {}): SourceConnector {
  const request = createRetriableFetch({ fetchImpl: options.fetchImpl });
  const now = options.now ?? (() => new Date());

  return {
    name: "openalex",
    async fetchPage(pageRequest) {
      const pageSize = assertPageRequest(pageRequest, 100);
      const url = new URL("https://api.openalex.org/works");
      url.searchParams.set(
        "filter",
        `topics.field.id:31,from_publication_date:${dateOnly(pageRequest.from)},to_publication_date:${dateOnly(pageRequest.until)}`,
      );
      url.searchParams.set("cursor", pageRequest.cursor ?? "*");
      url.searchParams.set("per_page", String(pageSize));

      const headers = new Headers({
        "User-Agent": options.userAgent ?? "PhysicsResearchIntelligence/0.1",
      });
      if (options.apiKey?.trim()) {
        headers.set("Authorization", `Bearer ${options.apiKey.trim()}`);
      }

      const response = await request(url, { headers, signal: pageRequest.signal });
      const payload = await parseResponse(response);
      const records = payload.results.flatMap((work) => {
        const record = mapOpenAlexWork(work, now());
        return record ? [record] : [];
      });

      return { records, nextCursor: payload.meta.next_cursor ?? null };
    },
  };
}

async function parseResponse(response: Response): Promise<z.infer<typeof openAlexResponseSchema>> {
  try {
    return openAlexResponseSchema.parse(await response.json());
  } catch (error) {
    throw new SourceConnectorError("malformed_response", "OpenAlex returned malformed JSON", {
      cause: error,
    });
  }
}

function mapOpenAlexWork(
  work: z.infer<typeof openAlexWorkSchema>,
  retrievedAt: Date,
): PaperSourceInput | null {
  const title = cleanText(work.title);
  if (!title) {
    return null;
  }

  const licenseUrl = creativeCommonsUrl(work.primary_location?.license);
  return paperSourceInputSchema.parse({
    doi: work.doi ?? undefined,
    sourceName: "openalex",
    sourceRecordId: finalPathSegment(work.id),
    sourceUrl: work.id,
    licenseUrl,
    retrievedAt,
    title,
    abstract: rebuildAbstract(work.abstract_inverted_index),
    journal: cleanText(work.primary_location?.source?.display_name),
    firstAuthor: cleanText(work.authorships?.[0]?.author.display_name),
    publishedAt: parseDate(work.publication_date),
    originalUrl: work.primary_location?.landing_page_url ?? work.doi ?? work.id,
    accessStatus: work.open_access?.is_oa ? "OPEN" : "UNKNOWN",
  });
}

function rebuildAbstract(index: Record<string, number[]> | null | undefined): string | null {
  if (!index) {
    return null;
  }

  const words = Object.entries(index).flatMap(([word, positions]) =>
    positions.map((position) => ({ position, word })),
  );
  words.sort((left, right) => left.position - right.position);
  return words.map(({ word }) => word).join(" ") || null;
}

function parseDate(value: string | null | undefined): Date | null {
  if (!value) {
    return null;
  }
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isNaN(date.getTime()) ? null : date;
}
