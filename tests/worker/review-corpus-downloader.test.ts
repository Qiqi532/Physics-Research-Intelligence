import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  ReviewCorpusDownloadError,
  downloadCorpusEntry,
} from "../../apps/worker/src/review-corpus/downloader";
import type { ReviewCorpusEntry } from "../../apps/worker/src/review-corpus/manifest";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((path) => rm(path, {
    recursive: true,
    force: true,
  })));
});

describe("review corpus downloader", () => {
  it("downloads and checksum-verifies an official PDF", async () => {
    const directory = await temporaryDirectory();
    const bytes = pdfBytes("verified paper");
    const entry = corpusEntry(bytes);
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(pdfResponse(bytes));

    const result = await downloadCorpusEntry(entry, {
      corpusDirectory: directory,
      fetchImpl,
      sleep: async () => undefined,
    });

    expect(result).toEqual({ arxivId: entry.arxivId, status: "downloaded" });
    expect(await readFile(join(directory, entry.pdfFile))).toEqual(bytes);
    expect(fetchImpl).toHaveBeenCalledWith(entry.pdfUrl, expect.objectContaining({
      redirect: "manual",
      headers: expect.objectContaining({ "User-Agent": expect.stringContaining("PhysicsResearchIntelligence") }),
    }));
  });

  it("reuses an existing file only when length and checksum match", async () => {
    const directory = await temporaryDirectory();
    const bytes = pdfBytes("already present");
    const entry = corpusEntry(bytes);
    await writeFile(join(directory, entry.pdfFile), bytes);
    const fetchImpl = vi.fn<typeof fetch>();

    await expect(downloadCorpusEntry(entry, { corpusDirectory: directory, fetchImpl }))
      .resolves.toEqual({ arxivId: entry.arxivId, status: "verified" });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("refuses to overwrite an existing mismatched file", async () => {
    const directory = await temporaryDirectory();
    const existing = pdfBytes("wrong local file");
    const entry = corpusEntry(pdfBytes("expected file"));
    await writeFile(join(directory, entry.pdfFile), existing);

    await expect(downloadCorpusEntry(entry, {
      corpusDirectory: directory,
      fetchImpl: vi.fn<typeof fetch>(),
    })).rejects.toMatchObject({ code: "existing_file_mismatch" });
    expect(await readFile(join(directory, entry.pdfFile))).toEqual(existing);
  });

  it.each([
    ["wrong_content_type", new Response(pdfBytes("content"), {
      headers: { "Content-Type": "text/html" },
    })],
    ["invalid_pdf", new Response("<html>not a PDF</html>", {
      headers: { "Content-Type": "application/pdf" },
    })],
  ])("rejects %s without leaving an output", async (code, response) => {
    const directory = await temporaryDirectory();
    const entry = corpusEntry(pdfBytes("expected"));

    await expect(downloadCorpusEntry(entry, {
      corpusDirectory: directory,
      fetchImpl: vi.fn<typeof fetch>().mockResolvedValue(response),
      sleep: async () => undefined,
    })).rejects.toMatchObject({ code });
    await expect(readFile(join(directory, entry.pdfFile))).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("rejects declared and streamed responses above the size limit", async () => {
    const directory = await temporaryDirectory();
    const bytes = pdfBytes("expected");
    const entry = corpusEntry(bytes);
    const declared = pdfResponse(bytes, { "Content-Length": String(entry.bytes + 1) });

    await expect(downloadCorpusEntry(entry, {
      corpusDirectory: directory,
      fetchImpl: vi.fn<typeof fetch>().mockResolvedValue(declared),
    })).rejects.toMatchObject({ code: "unexpected_size" });

    const streamed = pdfResponse(Buffer.concat([bytes, Buffer.from("extra")]));
    await expect(downloadCorpusEntry(entry, {
      corpusDirectory: directory,
      fetchImpl: vi.fn<typeof fetch>().mockResolvedValue(streamed),
    })).rejects.toMatchObject({ code: "unexpected_size" });
  });

  it("does not follow a redirect to an unapproved host", async () => {
    const directory = await temporaryDirectory();
    const entry = corpusEntry(pdfBytes("redirected"));
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(new Response(null, {
      status: 302,
      headers: { Location: "https://example.test/stolen.pdf" },
    }));

    await expect(downloadCorpusEntry(entry, {
      corpusDirectory: directory,
      fetchImpl,
    })).rejects.toMatchObject({ code: "request_failed" });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("bounds timeout and retryable upstream failures", async () => {
    const directory = await temporaryDirectory();
    const entry = corpusEntry(pdfBytes("eventual"));
    const sleep = vi.fn(async () => undefined);
    const timeoutFetch = vi.fn<typeof fetch>().mockImplementation(async (_input, init) =>
      new Promise((_resolve, reject) => init?.signal?.addEventListener("abort", () =>
        reject(new DOMException("aborted", "AbortError")), { once: true })),
    );

    await expect(downloadCorpusEntry(entry, {
      corpusDirectory: directory,
      fetchImpl: timeoutFetch,
      sleep,
      timeoutMs: 1,
      maxAttempts: 2,
    })).rejects.toMatchObject({ code: "timeout" });
    expect(timeoutFetch).toHaveBeenCalledTimes(2);

    const upstreamFetch = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(new Response("busy", { status: 429 }))
      .mockResolvedValueOnce(new Response("down", { status: 503 }));
    await expect(downloadCorpusEntry(entry, {
      corpusDirectory: directory,
      fetchImpl: upstreamFetch,
      sleep,
      maxAttempts: 2,
    })).rejects.toMatchObject({ code: "upstream_5xx" });
    expect(upstreamFetch).toHaveBeenCalledTimes(2);
  });

  it("rejects path traversal before reading or downloading", async () => {
    const directory = await temporaryDirectory();
    const entry = { ...corpusEntry(pdfBytes("safe")), pdfFile: "../outside.pdf" };

    await expect(downloadCorpusEntry(entry, {
      corpusDirectory: directory,
      fetchImpl: vi.fn<typeof fetch>(),
    })).rejects.toBeInstanceOf(ReviewCorpusDownloadError);
  });
});

async function temporaryDirectory(): Promise<string> {
  const path = await mkdtemp(join(tmpdir(), "pri-review-corpus-"));
  temporaryDirectories.push(path);
  return path;
}

function pdfBytes(content: string): Buffer {
  return Buffer.from(`%PDF-1.7\n${content}\n%%EOF`, "utf8");
}

function pdfResponse(bytes: Buffer, extraHeaders: Record<string, string> = {}): Response {
  return new Response(bytes, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Length": String(bytes.length),
      ...extraHeaders,
    },
  });
}

function corpusEntry(bytes: Buffer): ReviewCorpusEntry {
  return {
    reviewTargetTag: "amo-optics",
    arxivId: "2401.00001",
    title: "An open paper",
    authors: ["A. Researcher"],
    abstract: "A public abstract.",
    submittedAt: "2024-01-01T00:00:00.000Z",
    doi: null,
    primaryCategory: "physics.atom-ph",
    abstractUrl: "https://arxiv.org/abs/2401.00001",
    pdfUrl: "https://arxiv.org/pdf/2401.00001",
    licenseUrl: null,
    retrievedAt: "2026-08-31T00:00:00.000Z",
    pdfFile: "2401.00001.pdf",
    sha256: createHash("sha256").update(bytes).digest("hex"),
    bytes: bytes.length,
  };
}
