import { describe, expect, it, vi } from "vitest";
import { loadResearchProfile } from "../../packages/domain/src/research-profile-node";
import { buildScreenPrompt } from "../../packages/ai/src/prompts/screen";
import { publicResearchContext } from "../../packages/domain/src/research-profile";
import { createBatchInputHash } from "../../apps/worker/src/jobs/ai-job";
import { screenPapers } from "../../apps/worker/src/jobs/screen-papers";
import { validateInterpretationEvidence } from "../../apps/worker/src/jobs/interpret-paper";
import type { InterpretationOutput } from "../../packages/ai/src/schemas";

const research = loadResearchProfile();
describe("research screening boundaries", () => {
  it("hashes changed public text, context and model/provider identity rather than IDs alone", () => {
    const paper = { paperId: "p1", title: "T", abstract: "A" };
    expect(createBatchInputHash([paper])).not.toBe(createBatchInputHash([{ ...paper, abstract: "B" }]));
    expect(createBatchInputHash([paper], { profile: "a" })).not.toBe(createBatchInputHash([paper], { profile: "b" }));
    expect(createBatchInputHash([paper, { ...paper, paperId: "p2" }]))
      .toBe(createBatchInputHash([{ ...paper, paperId: "p2" }, paper]));
  });
  it("keeps bounded abstracts, discloses truncation/missing text, and whitelists cloud fields", () => {
    const context = publicResearchContext(research.profile, research.hash);
    const prompt = buildScreenPrompt([{ paperId: "p1", title: "T", abstractSnippet: "a".repeat(5000),
      privateNote: "PRIVATE_MARKER", path: "D:\\private.pdf" } as never, { paperId: "p2", title: "Missing" }], undefined, context);
    const payload = JSON.parse(prompt.user);
    expect(payload.papers[0].abstractSnippet).toHaveLength(4000);
    expect(payload.papers[0].abstractTruncated).toBe(true);
    expect(payload.papers[1].abstractMissing).toBe(true);
    expect(prompt.user).not.toContain("PRIVATE_MARKER");
    expect(prompt.user).not.toContain("private.pdf");
    expect(prompt.system).toContain("evidenceQuote");
  });
  it("admits relevant preprints without DOI, rejects unrelated papers, and verifies quotes", async () => {
    const output = { paperId: "p1", selected: true, score: 0.9, directionSlug: "amo-optics", reason: "感知相关",
      evidenceSource: "title", evidenceQuote: "Retinomorphic sensor" };
    const provider = { name: "mock", model: "m1", screenBatch: vi.fn(async () => ({ provider: "mock", model: "m1", output: { papers: [output] }, durationMs: 1 })) };
    const repository = { listPapersForScreening: vi.fn(), findSuccessfulRun: vi.fn(async () => null),
      claimRun: vi.fn(async () => ({ status: "claimed", run: { id: "run" } })), appendAttempts: vi.fn(),
      completeRun: vi.fn(), failRun: vi.fn(), saveScreeningResults: vi.fn(), replaceClassifications: vi.fn() };
    const input = { from: new Date("2026-11-01T00:00:00Z"), until: new Date("2026-11-13T00:00:00Z"), limit: 40, batchSize: 5,
      research, runScope: "scope", papers: [{ id: "p1", title: "Retinomorphic sensor", abstract: null, journal: "arXiv", publishedAt: null, accessStatus: "OPEN" },
        { id: "p2", title: "Supernova study", abstract: null, journal: "Nature", publishedAt: null, accessStatus: "OPEN" }], repository, primary: provider };
    expect((await screenPapers(input as never)).screened).toBe(1);
    expect(repository.saveScreeningResults).toHaveBeenCalledWith(expect.objectContaining({ results: [expect.objectContaining({ evidenceQuote: "Retinomorphic sensor" })] }));
    output.evidenceQuote = "not present";
    expect((await screenPapers(input as never)).failures).toHaveLength(1);
    expect(repository.failRun).toHaveBeenCalledWith(expect.objectContaining({ errorCode: "screen_evidence_invalid" }));
    output.selected = false;
    expect((await screenPapers(input as never)).failures).toHaveLength(0);
    expect(repository.saveScreeningResults).toHaveBeenLastCalledWith(expect.objectContaining({
      results: [expect.objectContaining({ selected: false, evidenceSource: "title", evidenceQuote: "Retinomorphic sensor" })],
    }));
  });
  it("rejects made-up quotes or claims of full-text access in abstract-only interpretation", () => {
    const claim = { text: "x", evidenceLevel: "uncertain", evidenceReferences: [{ source: "abstract", locator: "abstract", quote: "public" }] };
    const output = { basis: "abstract_only", overviewZh: claim, researchQuestion: claim, innovations: [claim], methodsAndEvidence: [claim], limitations: [claim] } as InterpretationOutput;
    expect(() => validateInterpretationEvidence(output, { title: "T", abstract: "public abstract" })).not.toThrow();
    expect(() => validateInterpretationEvidence(output, { title: "T", abstract: "different" })).toThrow();
    expect(() => validateInterpretationEvidence({ ...output, basis: "abstract_and_open_content" } as InterpretationOutput, { title: "T", abstract: "public" })).toThrow();
  });
});
