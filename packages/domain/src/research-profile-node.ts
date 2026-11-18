import { createHash } from "node:crypto";
import { existsSync, readFileSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { parseResearchProfile, type ResearchProfile } from "./research-profile";

export function profileFingerprint(profile: ResearchProfile): string {
  return createHash("sha256").update(JSON.stringify(profile)).digest("hex");
}

export function researchProfilePath(environment: NodeJS.ProcessEnv = process.env): string {
  let directory = resolve(environment.PRI_PROJECT_ROOT || process.cwd());
  if (environment.RESEARCH_PROFILE_FILE?.trim()) {
    return resolve(directory, environment.RESEARCH_PROFILE_FILE.trim());
  }
  for (let depth = 0; depth < 12; depth++) {
    if (existsSync(join(directory, "pnpm-workspace.yaml"))) return join(directory, "data/research-profile.json");
    const parent = dirname(directory);
    if (parent === directory) break;
    directory = parent;
  }
  throw new Error("research_profile_not_found");
}

export function loadResearchProfile(environment: NodeJS.ProcessEnv = process.env) {
  try {
    const path = researchProfilePath(environment);
    if (statSync(path).size > 65536) throw new Error("profile_too_large");
    const profile = parseResearchProfile(JSON.parse(readFileSync(path, "utf8")));
    return { profile, hash: profileFingerprint(profile) };
  } catch {
    throw new Error("research_profile_invalid_or_unavailable");
  }
}
