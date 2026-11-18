import { getDocument, GlobalWorkerOptions } from "/pri-pdfjs/pdf.min.mjs";

GlobalWorkerOptions.workerSrc = "/pri-pdfjs/pdf.worker.min.mjs";
const status = document.getElementById("status");
const canvas = document.getElementById("page");
const target = /^#([0-9a-f]{64})\/([1-9]\d{0,4})$/.exec(location.hash);
try {
  if (!target) throw new Error();
  const [, id, number] = target;
  const response = await fetch(`/api/evidence/file/${id}`, { cache: "no-store", referrerPolicy: "no-referrer" });
  if (!response.ok) throw new Error();
  const pdf = await getDocument({ data: new Uint8Array(await response.arrayBuffer()), verbosity: 0,
    disableWorkerRendering: true, cMapUrl: "/pri-pdfjs/cmaps/", cMapPacked: true, standardFontDataUrl: "/pri-pdfjs/standard_fonts/",
    wasmUrl: "/pri-pdfjs/wasm/", iccUrl: "/pri-pdfjs/iccs/" }).promise;
  const page = await pdf.getPage(Number(number));
  const original = page.getViewport({ scale: 1 });
  const viewport = page.getViewport({ scale: Math.min(2200, Math.max(720, innerWidth * devicePixelRatio)) / original.width });
  canvas.width = Math.ceil(viewport.width);
  canvas.height = Math.ceil(viewport.height);
  await page.render({ canvas, viewport }).promise;
  canvas.setAttribute("aria-label", `PDF 物理第 ${number} 页`);
  canvas.dataset.renderedPage = number;
  canvas.hidden = false;
  status.hidden = true;
  await pdf.destroy();
} catch {
  status.textContent = "无法打开此版本的原件。请检查源文件是否在线或已被替换，再刷新目录索引。";
}
