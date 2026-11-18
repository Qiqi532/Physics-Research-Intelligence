import type { NextConfig } from "next";
import { copyFileSync, cpSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";

const nextConfig: NextConfig = {
  output: "standalone",
  transpilePackages: ["@pri/ai", "@pri/db", "@pri/domain", "@pri/recommendation"],
};

export default function configure(phase: string): NextConfig {
  if (phase === "phase-development-server" || phase === "phase-production-build") {
    const requireWeb = createRequire(join(__dirname, "package.json"));
    const source = dirname(requireWeb.resolve("pdfjs-dist/package.json"));
    const dest = join(__dirname, "public", "pri-pdfjs");
    const marker = join(dest, "version.txt");
    const version = JSON.parse(readFileSync(join(source, "package.json"), "utf8")).version as string;
    if (!existsSync(marker) || readFileSync(marker, "utf8") !== version) {
      mkdirSync(dest, { recursive: true });
      for (const name of ["pdf.min.mjs", "pdf.worker.min.mjs"]) copyFileSync(join(source, "build", name), join(dest, name));
      for (const name of ["cmaps", "standard_fonts", "wasm", "iccs"]) cpSync(join(source, name), join(dest, name), { recursive: true });
      copyFileSync(join(source, "LICENSE"), join(dest, "LICENSE"));
      writeFileSync(marker, version);
    }
  }
  return nextConfig;
}
