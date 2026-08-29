import type { PaperRepository, SourceSyncRepository } from "@pri/db";
import {
  SourceConnectorError,
  type SourceConnector,
  type SourceErrorCode,
  type SourceName,
} from "@pri/sources";

type PaperWriter = Pick<PaperRepository, "upsertFromSource">;
type StateWriter = Pick<
  SourceSyncRepository,
  "find" | "markProgress" | "markSuccess" | "markFailure"
>;

export type IngestionSummary = {
  source: SourceName;
  pages: number;
  records: number;
  candidateDuplicates: number;
};

type IngestSourceInput = {
  connector: SourceConnector;
  paperRepository: PaperWriter;
  stateRepository: StateWriter;
  from: Date;
  until: Date;
  cursor?: string | null;
  pageSize?: number;
  maxPages?: number;
  now?: () => Date;
};

export async function ingestSource(input: IngestSourceInput): Promise<IngestionSummary> {
  const now = input.now ?? (() => new Date());
  const maximumPages = input.maxPages ?? 1_000;
  let pages = 0;
  let records = 0;
  let candidateDuplicates = 0;

  try {
    const priorState = await input.stateRepository.find(input.connector.name);
    let cursor = input.cursor ?? resumableCursor(priorState, input.from, input.until);
    const seenCursors = new Set(cursor ? [cursor] : []);

    while (pages < maximumPages) {
      const page = await input.connector.fetchPage({
        from: input.from,
        until: input.until,
        cursor,
        pageSize: input.pageSize,
      });

      for (const record of page.records) {
        const result = await input.paperRepository.upsertFromSource(record);
        records += 1;
        candidateDuplicates += result.candidateDuplicates.length;
      }
      pages += 1;

      if (page.nextCursor && seenCursors.has(page.nextCursor)) {
        throw new SourceConnectorError("invalid_cursor", "Source returned a repeated cursor");
      }

      await input.stateRepository.markProgress({
        sourceName: input.connector.name,
        windowFrom: input.from,
        windowUntil: input.until,
        cursor: page.nextCursor,
      });

      if (!page.nextCursor) {
        await input.stateRepository.markSuccess(input.connector.name, now());
        return { source: input.connector.name, pages, records, candidateDuplicates };
      }

      seenCursors.add(page.nextCursor);
      cursor = page.nextCursor;
    }

    throw new SourceConnectorError(
      "invalid_cursor",
      `Source exceeded the ${maximumPages} page safety limit`,
    );
  } catch (error) {
    const errorCode = connectorErrorCode(error);
    await input.stateRepository.markFailure({
      sourceName: input.connector.name,
      failedAt: now(),
      errorCode,
      errorMessage: `${input.connector.name} ingestion failed (${errorCode})`,
    });
    throw error;
  }
}

export async function ingestSources(
  input: Omit<IngestSourceInput, "connector"> & { connectors: SourceConnector[] },
): Promise<Array<
  | { source: SourceName; ok: true; summary: IngestionSummary }
  | { source: SourceName; ok: false; errorCode: SourceErrorCode }
>> {
  const settled = await Promise.allSettled(
    input.connectors.map((connector) => ingestSource({ ...input, connector })),
  );

  return settled.map((result, index) => {
    const source = input.connectors[index]!.name;
    return result.status === "fulfilled"
      ? { source, ok: true as const, summary: result.value }
      : { source, ok: false as const, errorCode: connectorErrorCode(result.reason) };
  });
}

function resumableCursor(
  state: Awaited<ReturnType<StateWriter["find"]>>,
  from: Date,
  until: Date,
): string | null {
  return state?.windowFrom?.getTime() === from.getTime() &&
    state.windowUntil?.getTime() === until.getTime()
    ? state.cursor
    : null;
}

function connectorErrorCode(error: unknown): SourceErrorCode {
  return error instanceof SourceConnectorError ? error.code : "request_failed";
}
