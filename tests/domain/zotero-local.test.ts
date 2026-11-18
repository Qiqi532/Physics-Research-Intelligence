import { describe, expect, it, vi } from "vitest";
import { createZoteroLocal, zoteroOnline } from "../../packages/domain/src/zotero-local";

describe("Zotero collection protocol", () => {
  it("accepts entity and library versions and reads every results page", async () => {
    const collection = { key: "ZOTERO01", version: 5, library: { type: "group", id: 42 }, data: { name: "Fixture" } };
    const items = Array.from({ length: 101 }, (_, i) => ({
      key: "P" + i.toString(36).toUpperCase().padStart(7, "0"),
      data: { itemType: "journalArticle", title: "Reference item " + i },
    }));
    const fetcher = vi.fn<typeof fetch>(async (input, init) => {
      expect(init?.method).toBe("GET");
      expect(init?.redirect).toBe("error");
      const url = new URL(String(input));
      expect(url.origin + url.pathname.split("/collections")[0]).toBe("http://127.0.0.1:23119/api/groups/42");
      if (!url.pathname.endsWith("/items")) {
        return Response.json(collection, { headers: { "Last-Modified-Version": "5" } });
      }
      const start = Number(url.searchParams.get("start") ?? "0");
      const limit = Number(url.searchParams.get("limit"));
      return Response.json(items.slice(start, start + limit), {
        headers: { "Last-Modified-Version": "60", "Total-Results": "101" },
      });
    });
    const api = createZoteroLocal({ groupId: 42, fetcher });
    const snapshot = await api.snapshot(collection.key);
    expect(snapshot.collection).toMatchObject({ libraryKey: "group:42", collectionKey: collection.key });
    expect(snapshot.attachments).toEqual([]);
    await expect(snapshot.confirm()).resolves.toBeUndefined();
    expect(fetcher.mock.calls.some(([input]) => new URL(String(input)).searchParams.get("start") === "100")).toBe(true);
  });

  it("declines nonlocal attachment locations and reports unavailable clients", async () => {
    const fetcher = vi.fn<typeof fetch>(async () => new Response("file://remote.example/share/archive.pdf"));
    await expect(createZoteroLocal({ fetcher }).filePath("ATTACH01")).resolves.toBeNull();
    await expect(zoteroOnline(async () => { throw new Error("closed"); })).resolves.toBe(false);
  });
});
