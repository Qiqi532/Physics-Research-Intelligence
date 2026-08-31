import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

describe("stage 5 operations documentation", () => {
  it("keeps deployment, recovery and troubleshooting procedures discoverable", async () => {
    const guide = await readFile("docs/operations.md", "utf8");

    for (const section of [
      "## First start",
      "## Daily automation",
      "## Health checks",
      "## Backup",
      "## Restore and verify",
      "## Troubleshooting",
      "standalone/apps/web/.next/static",
      "queue_backlog",
      "budget_exceeded",
    ]) {
      expect(guide).toContain(section);
    }
  });

  it("contains thirty blank cross-direction review rows and all required dimensions", async () => {
    const rubric = await readFile("docs/evaluation-rubric.md", "utf8");
    const rows = rubric.match(/^\| \d{2} \|/gmu) ?? [];

    expect(rows).toHaveLength(30);
    for (const dimension of [
      "Classification correctness",
      "Chinese overview faithfulness",
      "Innovation-point evidence",
      "Limitations and uncertainty",
      "Recommendation-reason truthfulness and usefulness",
      "Cross-field discovery value",
    ]) {
      expect(rubric).toContain(dimension);
    }
    expect(rubric).not.toMatch(/\| \d{2} \|[^\n]+\|\s*[1-5]\s*\|/u);
  });

  it("never checks in a non-empty provider key example", async () => {
    const example = await readFile(".env.example", "utf8");
    const providerKeyLines = example
      .split(/\r?\n/u)
      .filter((line) => /^AI_PROVIDER_[A-Z]+_API_KEY=/u.test(line));

    expect(providerKeyLines.length).toBeGreaterThanOrEqual(8);
    expect(providerKeyLines.every((line) => line.endsWith("="))).toBe(true);
  });

  it("disables framework telemetry in the deployment environment", async () => {
    const example = await readFile(".env.example", "utf8");
    const guide = await readFile("docs/operations.md", "utf8");

    expect(example).toContain("NEXT_TELEMETRY_DISABLED=1");
    expect(guide).toContain("NEXT_TELEMETRY_DISABLED=1");
  });

  it("documents model console secrets, recovery and worker hot switching", async () => {
    const example = await readFile(".env.example", "utf8");
    const guide = await readFile("docs/operations.md", "utf8");

    expect(example).toContain("AI_SETTINGS_MASTER_KEY_FILE=");
    for (const boundary of [
      "http://127.0.0.1:3000/settings/models",
      "LAN mode is read-only",
      "Back up the database and master key separately",
      "restore both before starting Web or worker",
      "re-enter every API Key",
      "next batch",
      "never contain a real API Key",
    ]) {
      expect(guide).toContain(boundary);
    }
  });
});
