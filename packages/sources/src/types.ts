import type { PaperSourceInput } from "@pri/domain/paper";

export const sourceNames = ["crossref", "openalex", "arxiv"] as const;
export type SourceName = (typeof sourceNames)[number];

export type SourceErrorCode =
  | "rate_limited"
  | "upstream_5xx"
  | "timeout"
  | "malformed_response"
  | "invalid_cursor"
  | "request_failed";

export type SourcePageRequest = {
  from: Date;
  until: Date;
  cursor?: string | null;
  pageSize?: number;
  signal?: AbortSignal;
};

export type SourcePage = {
  records: PaperSourceInput[];
  nextCursor: string | null;
};

export interface SourceConnector {
  readonly name: SourceName;
  fetchPage(request: SourcePageRequest): Promise<SourcePage>;
}

export type SourceFetch = (
  input: string | URL | Request,
  init?: RequestInit,
) => Promise<Response>;

export type Sleep = (milliseconds: number) => Promise<void>;
