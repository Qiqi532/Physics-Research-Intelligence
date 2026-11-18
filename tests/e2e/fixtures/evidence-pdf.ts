export function evidencePdf(pages: readonly string[][]): Buffer {
  const kids = pages.map((_, i) => `${i * 2 + 4} 0 R`).join(" ");
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    `<< /Type /Pages /Kids [${kids}] /Count ${pages.length} >>`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  ];
  for (const [i, lines] of pages.entries()) {
    const text = lines.map((line, n) => `1 0 0 1 72 ${710 - n * 19} Tm (${line.replace(/[\\()]/g, "\\$&")}) Tj`).join("\n");
    const stream = `BT /F1 15 Tf\n${text}\nET\n`;
    objects.push(
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 3 0 R >> >> /Contents ${i * 2 + 5} 0 R >>`,
      `<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}endstream`,
    );
  }
  let source = "%PDF-1.4\n";
  const offsets = [0];
  for (const [i, value] of objects.entries()) {
    offsets.push(Buffer.byteLength(source));
    source += `${i + 1} 0 obj\n${value}\nendobj\n`;
  }
  const start = Buffer.byteLength(source);
  source += `xref\n0 ${offsets.length}\n0000000000 65535 f \n`;
  for (const offset of offsets.slice(1)) source += `${String(offset).padStart(10, "0")} 00000 n \n`;
  return Buffer.from(source + `trailer\n<< /Size ${offsets.length} /Root 1 0 R >>\nstartxref\n${start}\n%%EOF\n`);
}
