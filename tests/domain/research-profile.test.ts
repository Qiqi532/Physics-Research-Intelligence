import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { matchResearch, parseResearchProfile, publicResearchContext, researchQueryTerms } from "../../packages/domain/src/research-profile";
import { profileFingerprint } from "../../packages/domain/src/research-profile-node";

const raw = JSON.parse(readFileSync("data/research-profile.json", "utf8"));
const profile = parseResearchProfile(raw);

describe("public research profile", () => {
  it("contains five traceable public seeds", () => {
    expect(profile.seeds.length).toBeGreaterThanOrEqual(5);
    expect(new Set(profile.seeds.map((seed) => seed.doi)).size).toBe(profile.seeds.length);
  });
  it("separates core, adjacent and unrelated papers", () => {
    expect(matchResearch(profile, { title: "Retinomorphic sensor for in-sensor computing" }).kind).toBe("core");
    expect(matchResearch(profile, { title: "CFET for monolithic 3D integration" }).kind).toBe("adjacent");
    expect(matchResearch(profile, { title: "Retinal disease in patients" }).score).toBe(0);
    expect(matchResearch(profile, { title: "A stellar supernova observation" }).score).toBe(0);
  });
  it("matches normalized technical phrases without treating a keyword substring as a match", () => {
    expect(matchResearch(profile, { title: "In sensor computing with phototransistors" }).score).toBeGreaterThan(0);
    expect(matchResearch(profile, { title: "NonCFETword" }).score).toBe(0);
  });
  it("rejects notes and local file fields without echoing their values", () => {
    expect(() => parseResearchProfile({ ...raw, privateNote: "private-marker" })).toThrow("research_profile_invalid");
    expect(() => parseResearchProfile({ ...raw, seeds: [{ ...raw.seeds[0], path: "private-marker" }] }))
      .toThrow("research_profile_invalid");
    expect(() => parseResearchProfile({ ...raw, topics: [{ ...raw.topics[0], keywords: ["C:\\private"] }] }))
      .toThrow("research_profile_invalid");
  });
  it("invalidates the version when topics or seed facts change", () => {
    expect(profileFingerprint(profile)).not.toBe(profileFingerprint(parseResearchProfile({
      ...raw, label: "另一份公开画像",
    })));
  });
  it("only exposes explicitly public model context", () => {
    const context = publicResearchContext(profile, profileFingerprint(profile));
    expect(JSON.stringify(context)).not.toContain("sourceUrl");
    expect(JSON.stringify(context)).not.toContain("verifiedAt");
    expect(researchQueryTerms(profile)).toContain("retinomorphic");
  });
});
