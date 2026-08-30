import { cp, mkdir, stat } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

export async function copyStandaloneAssets(webRoot) {
  const staticSource = join(webRoot, ".next", "static");
  const standaloneApp = join(webRoot, ".next", "standalone", "apps", "web");
  const staticDestination = join(standaloneApp, ".next", "static");

  await assertDirectory(staticSource);
  await mkdir(dirname(staticDestination), { recursive: true });
  await cp(staticSource, staticDestination, { recursive: true, force: true });

  const publicSource = join(webRoot, "public");
  if (await directoryExists(publicSource)) {
    await cp(publicSource, join(standaloneApp, "public"), {
      recursive: true,
      force: true,
    });
  }
}

async function assertDirectory(path) {
  const info = await stat(path);
  if (!info.isDirectory()) {
    throw new Error(`Expected a directory at ${path}`);
  }
}

async function directoryExists(path) {
  try {
    return (await stat(path)).isDirectory();
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") {
      return false;
    }
    throw error;
  }
}

const invokedPath = process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : null;
if (invokedPath === import.meta.url) {
  const webRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
  await copyStandaloneAssets(webRoot);
}
