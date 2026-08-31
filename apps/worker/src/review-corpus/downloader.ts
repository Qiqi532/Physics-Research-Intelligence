import { createHash, randomUUID } from "node:crypto";
import { link, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { basename, join } from "node:path";
import { createRetriableFetch } from "@pri/sources";
import type { Sleep, SourceFetch } from "@pri/sources";
import { maximumReviewPdfBytes, type ReviewCorpusEntry } from "./manifest";

const userAgent = "PhysicsResearchIntelligence/0.1 (personal research corpus)";
const pdfSignature = Buffer.from("%PDF-", "ascii");

type DownloadStatus = "downloaded" | "verified";

type DownloadOptions = {
  corpusDirectory: string;
  fetchImpl?: SourceFetch;
  sleep?: Sleep;
  timeoutMs?: number;
  maxAttempts?: number;
};

export class ReviewCorpusDownloadError extends Error {
  readonly code:
    | "unsafe_pdf_path"
    | "unapproved_pdf_url"
    | "existing_file_mismatch"
    | "wrong_content_type"
    | "unexpected_size"
    | "invalid_pdf"
    | "checksum_mismatch";

  constructor(code: ReviewCorpusDownloadError["code"], message: string) {
    super(message);
    this.name = "ReviewCorpusDownloadError";
    this.code = code;
  }
}

export async function downloadCorpusEntry(
  entry: ReviewCorpusEntry,
  options: DownloadOptions,
): Promise<{ arxivId: string; status: DownloadStatus }> {
  assertSafePdfFile(entry.pdfFile);
  assertApprovedPdfUrl(entry.pdfUrl);
  await mkdir(options.corpusDirectory, { recursive: true });

  const targetPath = join(options.corpusDirectory, entry.pdfFile);
  const existing = await readExistingFile(targetPath);
  if (existing) {
    assertExpectedFile(existing, entry, "existing_file_mismatch");
    return { arxivId: entry.arxivId, status: "verified" };
  }

  const request = createRetriableFetch({
    fetchImpl: options.fetchImpl,
    sleep: options.sleep,
    timeoutMs: options.timeoutMs ?? 30_000,
    maxAttempts: options.maxAttempts ?? 3,
  });
  const response = await request(entry.pdfUrl, {
    redirect: "manual",
    headers: { "User-Agent": userAgent, Accept: "application/pdf" },
  });
  assertResponseHeaders(response, entry);
  const bytes = await readBoundedBody(response, Math.min(entry.bytes, maximumReviewPdfBytes));
  assertExpectedFile(bytes, entry, "checksum_mismatch");

  const partialPath = `${targetPath}.partial-${process.pid}-${randomUUID()}`;
  try {
    await writeFile(partialPath, bytes, { flag: "wx" });
    try {
      await link(partialPath, targetPath);
    } catch (error) {
      if (!isNodeError(error, "EEXIST")) {
        throw error;
      }
      const racedFile = await readFile(targetPath);
      assertExpectedFile(racedFile, entry, "existing_file_mismatch");
      return { arxivId: entry.arxivId, status: "verified" };
    }
  } finally {
    await rm(partialPath, { force: true });
  }

  return { arxivId: entry.arxivId, status: "downloaded" };
}

function assertSafePdfFile(pdfFile: string): void {
  if (basename(pdfFile) !== pdfFile || !/^[A-Za-z0-9._-]+\.pdf$/u.test(pdfFile)) {
    throw new ReviewCorpusDownloadError("unsafe_pdf_path", "PDF filename is unsafe");
  }
}

function assertApprovedPdfUrl(value: string): void {
  const url = new URL(value);
  const approvedHost = url.protocol === "https:" &&
    ["arxiv.org", "export.arxiv.org"].includes(url.hostname);
  if (!approvedHost || !url.pathname.startsWith("/pdf/")) {
    throw new ReviewCorpusDownloadError("unapproved_pdf_url", "PDF URL is not approved");
  }
}

async function readExistingFile(path: string): Promise<Buffer | null> {
  try {
    return await readFile(path);
  } catch (error) {
    if (isNodeError(error, "ENOENT")) {
      return null;
    }
    throw error;
  }
}

function assertResponseHeaders(response: Response, entry: ReviewCorpusEntry): void {
  const contentType = response.headers.get("Content-Type")?.split(";", 1)[0]?.trim();
  if (contentType !== "application/pdf") {
    throw new ReviewCorpusDownloadError(
      "wrong_content_type",
      "Official source did not return PDF content",
    );
  }

  const declaredLength = response.headers.get("Content-Length");
  if (declaredLength !== null) {
    const bytes = Number(declaredLength);
    if (!Number.isSafeInteger(bytes) || bytes !== entry.bytes || bytes > maximumReviewPdfBytes) {
      throw new ReviewCorpusDownloadError("unexpected_size", "PDF byte length is unexpected");
    }
  }
}

async function readBoundedBody(response: Response, maximumBytes: number): Promise<Buffer> {
  if (!response.body) {
    throw new ReviewCorpusDownloadError("invalid_pdf", "PDF response body is empty");
  }

  const chunks: Uint8Array[] = [];
  let totalBytes = 0;
  const reader = response.body.getReader();
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      totalBytes += value.byteLength;
      if (totalBytes > maximumBytes) {
        throw new ReviewCorpusDownloadError("unexpected_size", "PDF response exceeded its limit");
      }
      chunks.push(value);
    }
  } finally {
    await reader.cancel().catch(() => undefined);
  }
  return Buffer.concat(chunks, totalBytes);
}

function assertExpectedFile(
  bytes: Uint8Array,
  entry: ReviewCorpusEntry,
  mismatchCode: "existing_file_mismatch" | "checksum_mismatch",
): void {
  const buffer = Buffer.from(bytes);
  if (!buffer.subarray(0, pdfSignature.length).equals(pdfSignature)) {
    throw new ReviewCorpusDownloadError(
      mismatchCode === "existing_file_mismatch" ? mismatchCode : "invalid_pdf",
      "Downloaded content has no PDF signature",
    );
  }
  if (buffer.byteLength !== entry.bytes) {
    throw new ReviewCorpusDownloadError(
      mismatchCode === "existing_file_mismatch" ? mismatchCode : "unexpected_size",
      "PDF byte length is unexpected",
    );
  }
  const checksum = createHash("sha256").update(buffer).digest("hex");
  if (checksum !== entry.sha256) {
    throw new ReviewCorpusDownloadError(mismatchCode, "PDF checksum does not match manifest");
  }
}

function isNodeError(error: unknown, code: string): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error && error.code === code;
}
