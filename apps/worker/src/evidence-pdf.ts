import { createRequire } from "node:module";
import { dirname } from "node:path";
import type { EvidenceDocument, EvidencePage } from "@pri/domain/evidence";

export const evidenceParserVersion = "pdfjs-6.5.438-layout-2";
type Run = { str: string; transform: number[]; width: number; height: number; hasEOL: boolean };
type Line = { x: number; end: number; y: number; text: string };

export function pageEvidence(items: Run[], width: number, number: number): EvidencePage {
  const lines: Line[] = [];
  let line: Line | undefined;
  const flush = () => {
    if (line?.text.trim()) lines.push({ ...line, text: line.text.trim() });
    line = undefined;
  };
  for (const item of items) {
    const x = item.transform[4], y = item.transform[5], height = Math.max(4, Math.abs(item.height));
    if (line && (Math.abs(y - line.y) > height * 0.55 || x - line.end > Math.max(16, width * 0.035) || x < line.x - 3)) flush();
    if (!line) line = { x, end: x, y, text: "" };
    if (line.text && x - line.end > height * 0.18 && !line.text.endsWith(" ")) line.text += " ";
    line.text += item.str.replace(/\0/g, "");
    line.end = Math.max(line.end, x + item.width);
    if (item.hasEOL) flush();
  }
  flush();
  const mid = width / 2;
  const left = (l: Line) => l.x < width * 0.28 && l.end <= mid + width * 0.015;
  const right = (l: Line) => l.x >= mid - width * 0.015;
  const columns = lines.filter(left).length >= 5 && lines.filter(right).length >= 5;
  let text: string;
  if (columns) {
    // Full-width titles and captions separate horizontal bands of two-column text.
    const ordered = [...lines].sort((a, b) => b.y - a.y || a.x - b.x);
    const blocks: string[] = [], first: string[] = [], second: string[] = [];
    const endBand = () => {
      if (first.length) blocks.push(first.splice(0).join("\n"));
      if (second.length) blocks.push(second.splice(0).join("\n"));
    };
    for (const row of ordered) {
      if (right(row)) second.push(row.text);
      else if (row.end <= mid + width * 0.015) first.push(row.text);
      else { endBand(); blocks.push(row.text); }
    }
    endBand();
    text = blocks.join("\n\n");
  } else text = lines.map((row) => row.text).join("\n");
  if ((text.match(/[\p{L}\p{N}]/gu)?.length ?? 0) < 5) return { number, text: "", status: "empty" };
  if ((text.match(/\uFFFD/g)?.length ?? 0) > text.length * 0.03) return { number, text: "", status: "failed" };
  return { number, text, status: columns ? "columns" : "text" };
}

export async function parseEvidencePdf(bytes: Uint8Array): Promise<EvidenceDocument> {
  const { getDocument } = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const packageRoot = dirname(createRequire(import.meta.url).resolve("pdfjs-dist/package.json")).replaceAll("\\", "/");
  const task = getDocument({ data: Uint8Array.from(bytes), verbosity: 0, useSystemFonts: false,
    disableFontFace: true, useWorkerFetch: false, cMapPacked: true,
    cMapUrl: `${packageRoot}/cmaps/`, standardFontDataUrl: `${packageRoot}/standard_fonts/`,
    wasmUrl: `${packageRoot}/wasm/`, iccUrl: `${packageRoot}/iccs/` });
  try {
    const doc = await task.promise;
    if (!doc.numPages) throw new Error("invalid_pdf");
    if (doc.numPages > 3000) throw new Error("too_many_pages");
    const metadata = await doc.getMetadata().catch(() => null);
    const rawTitle = (metadata?.info as { Title?: unknown } | undefined)?.Title;
    const title = typeof rawTitle === "string" ? rawTitle.replace(/[\x00-\x1f]/g, " ").trim().slice(0, 300) || null : null;
    const pages: EvidencePage[] = [];
    for (let n = 1; n <= doc.numPages; n++) {
      try {
        const page = await doc.getPage(n);
        try {
          const content = await page.getTextContent();
          pages.push(pageEvidence(content.items.filter((item) => "str" in item), page.view[2] - page.view[0], n));
        } finally { page.cleanup(); }
      } catch { pages.push({ number: n, text: "", status: "failed" }); }
    }
    return { title, pages };
  } catch (error) {
    if (error instanceof Error && error.name === "PasswordException") throw new Error("locked");
    if (error instanceof Error && error.message === "too_many_pages") throw error;
    throw new Error("invalid_pdf");
  } finally { await task.destroy(); }
}
