import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { copyStandaloneAssets } from "../../apps/web/scripts/copy-standalone-assets.mjs";

const temporaryRoots: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryRoots.splice(0).map((path) => rm(path, { recursive: true, force: true })),
  );
});

describe("standalone asset preparation", () => {
  it("copies Next static assets into the standalone application root", async () => {
    const root = await mkdtemp(join(tmpdir(), "pri-standalone-assets-"));
    temporaryRoots.push(root);
    const source = join(root, ".next", "static", "chunks");
    await mkdir(source, { recursive: true });
    await writeFile(join(source, "app.css"), "body { color: navy; }", "utf8");

    await copyStandaloneAssets(root);

    await expect(
      readFile(
        join(
          root,
          ".next",
          "standalone",
          "apps",
          "web",
          ".next",
          "static",
          "chunks",
          "app.css",
        ),
        "utf8",
      ),
    ).resolves.toBe("body { color: navy; }");
  });
});
