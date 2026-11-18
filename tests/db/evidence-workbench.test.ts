import { describe, expect, it } from "vitest";
import { createEvidenceRepository, createPrismaClient } from "../../packages/db/src/index";
import { comparisonContentSchema, comparisonSourceSchema } from "../../packages/domain/src/evidence-comparison";

const database = process.env.TEST_DATABASE_URL;
const idA = "a4".repeat(32), idB = "b5".repeat(32);
const root = "pri-workbench-db-fixture";
const quote = "The response time was 25 ms at 532 nm.";
const deviceFields = { responseTime: { value: "25", unit: "ms" }, wavelength: { value: "532", unit: "nm" } };

describe.skipIf(!database)("local evidence workbench repository", () => {
  it("pins comparison rows to source versions and keeps question retrieval inside its scope", async () => {
    const db = createPrismaClient(database!);
    const repo = createEvidenceRepository(db, database!);
    const record = (id: string, title: string, text: string) => repo.record({
      root, relativePath: title + ".pdf", name: title + ".pdf", role: "主文",
    }, id, "fixture", { title, pages: [{ number: 1, text, status: "text" }] });
    try {
      await record(idA, "Fixture A", quote);
      await record(idB, "Fixture B", "The response time was 12 ms at 650 nm.");
      const input = comparisonSourceSchema.parse({ documentId: idA, page: 1, quote, fields: deviceFields });
      expect(await repo.comparison.add({ ...input, page: 5 })).toEqual({ status: "page_missing" });
      expect(await repo.comparison.add({ ...input, quote: quote + " Different." })).toEqual({ status: "quote_mismatch" });
      const saved = await repo.comparison.add(input);
      expect(saved.status).toBe("saved");
      if (saved.status !== "saved") throw new Error("fixture not saved");
      expect((await repo.comparison.list(1)).rows).toContainEqual(expect.objectContaining({ id: saved.id, quote, sourceTitle: "Fixture A" }));
      expect((await repo.comparison.selected([saved.id]))[0]?.fields).toMatchObject(deviceFields);

      expect((await repo.answer("532 nm 下的响应时间是多少？", "single", idA)).references)
        .toEqual([expect.objectContaining({ id: idA, page: 1, quote })]);
      expect(await repo.answer("532 nm 下的响应时间是多少？", "single", idB)).toEqual({ status: "insufficient", references: [] });
      expect((await repo.answer("各篇论文的响应时间是多少？", "cross")).references.map((row) => row.id))
        .toEqual(expect.arrayContaining([idA, idB]));

      await record(idA, "Fixture A", "New text extraction for the same file version.");
      const review = comparisonContentSchema.parse({ quote, figure: "Fig. 3", fields: { ...deviceFields, conditions: "checked" } });
      expect(await repo.comparison.update(saved.id, review)).toMatchObject({ status: "saved" });
      expect((await repo.comparison.selected([saved.id]))[0]).toMatchObject({ quote, figure: "Fig. 3", fields: { conditions: "checked" } });
      expect(await repo.comparison.remove(saved.id)).toBe(true);
      expect(await repo.page(idA, 1)).toMatchObject({ text: "New text extraction for the same file version." });
    } finally {
      await db.evidenceComparisonRow.deleteMany({ where: { documentId: { in: [idA, idB] } } });
      await db.localEvidenceLocation.deleteMany({ where: { root } });
      await db.localEvidenceDocument.deleteMany({ where: { id: { in: [idA, idB] } } });
      await db.$disconnect();
    }
  });
});
