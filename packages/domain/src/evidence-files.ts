import { createHash } from "node:crypto";
import { open, realpath } from "node:fs/promises";
import { isAbsolute, relative, resolve, sep } from "node:path";

export const maximumEvidenceBytes = 96 * 1024 * 1024;

export function insideRoot(root: string, path: string): boolean {
  const part = relative(root, path);
  return !!part && part !== ".." && !part.startsWith(".." + sep) && !isAbsolute(part);
}

/** Only an index location within the originally selected canonical root can supply PDF bytes. */
export async function readEvidenceFile(root: string, relativePath: string) {
  const path = resolve(root, relativePath);
  if (!insideRoot(root, path) || relative(root, await realpath(root)) ||
      relative(path, await realpath(path))) throw new Error("unavailable");
  const file = await open(path, "r");
  try {
    const before = await file.stat();
    if (!before.isFile()) throw new Error("unavailable");
    if (before.size > maximumEvidenceBytes) throw new Error("too_large");
    const data = Buffer.alloc(before.size);
    let offset = 0;
    while (offset < data.length) {
      const { bytesRead } = await file.read(data, offset, data.length - offset, offset);
      if (!bytesRead) throw new Error("changed");
      offset += bytesRead;
    }
    const after = await file.stat();
    if (after.size !== before.size || after.mtimeMs !== before.mtimeMs ||
        relative(path, await realpath(path))) throw new Error("changed");
    if (!data.subarray(0, 1024).includes(Buffer.from("%PDF-"))) throw new Error("invalid_pdf");
    return { data, id: createHash("sha256").update(data).digest("hex") };
  } finally {
    await file.close();
  }
}
