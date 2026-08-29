import { SourceConnectorError } from "./http";
import type { SourcePageRequest } from "./types";

const htmlEntityMap: Record<string, string> = {
  "&amp;": "&",
  "&lt;": "<",
  "&gt;": ">",
  "&quot;": '"',
  "&#39;": "'",
  "&nbsp;": " ",
};

export function assertPageRequest(request: SourcePageRequest, maximumPageSize: number): number {
  if (Number.isNaN(request.from.getTime()) || Number.isNaN(request.until.getTime())) {
    throw new SourceConnectorError("request_failed", "Source date window is invalid");
  }
  if (request.from > request.until) {
    throw new SourceConnectorError("request_failed", "Source date window is reversed");
  }

  const pageSize = request.pageSize ?? maximumPageSize;
  if (!Number.isInteger(pageSize) || pageSize < 1 || pageSize > maximumPageSize) {
    throw new SourceConnectorError(
      "request_failed",
      `Source page size must be between 1 and ${maximumPageSize}`,
    );
  }
  return pageSize;
}

export function dateOnly(value: Date): string {
  return value.toISOString().slice(0, 10);
}

export function cleanText(value: string | null | undefined): string | null {
  if (!value) {
    return null;
  }

  const cleaned = value
    .replace(/<[^>]*>/gu, " ")
    .replace(/&(amp|lt|gt|quot|#39|nbsp);/gu, (entity) => htmlEntityMap[entity] ?? entity)
    .replace(/\s+/gu, " ")
    .trim();
  return cleaned.length > 0 ? cleaned : null;
}

export function creativeCommonsUrl(license: string | null | undefined): string | null {
  if (!license) {
    return null;
  }

  const normalized = license.toLowerCase().replace(/_/gu, "-");
  const versions: Record<string, string> = {
    "cc-by": "by/4.0",
    "cc-by-sa": "by-sa/4.0",
    "cc-by-nc": "by-nc/4.0",
    "cc-by-nc-sa": "by-nc-sa/4.0",
    "cc-by-nd": "by-nd/4.0",
    "cc-by-nc-nd": "by-nc-nd/4.0",
    cc0: "zero/1.0",
  };
  const path = versions[normalized];
  return path ? `https://creativecommons.org/licenses/${path}/` : null;
}

export function finalPathSegment(value: string): string {
  const segments = new URL(value).pathname.split("/").filter(Boolean);
  return segments.at(-1) ?? value;
}
