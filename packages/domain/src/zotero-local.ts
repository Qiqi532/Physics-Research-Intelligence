import { isAbsolute } from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";

const origin = "http://127.0.0.1:23119";
const headers = { "Zotero-API-Version": "3" };
const keySchema = z.string().regex(/^[A-Z0-9]{8}$/u);
const librarySchema = z.object({ type: z.enum(["user", "group"]), id: z.number().int().nonnegative() });
const collectionSchema = z.object({
  key: keySchema, version: z.number().int().nonnegative(), library: librarySchema,
  data: z.object({ name: z.string().min(1), parentCollection: z.union([keySchema, z.literal(false)]).optional() }),
});
const itemSchema = z.object({
  key: keySchema,
  meta: z.object({ creatorSummary: z.string().optional() }).optional(),
  data: z.object({
    itemType: z.string(), title: z.string().optional(), filename: z.string().optional(),
    contentType: z.string().optional(), linkMode: z.string().optional(), parentItem: keySchema.optional(),
    DOI: z.string().optional(), date: z.string().optional(),
  }),
});

export type ZoteroAttachment = {
  attachmentKey: string; itemKey: string; title: string; name: string; creators: string | null; date: string | null; doi: string | null;
};
export type ZoteroCollection = {
  sourceScope: string; libraryKey: string; collectionKey: string; title: string;
};

export class ZoteroLocalError extends Error {
  constructor(readonly code: "offline" | "collection_missing" | "invalid_response" | "collection_changed" | "collection_too_large") {
    super(code);
  }
}

export async function zoteroOnline(fetcher: typeof fetch = fetch): Promise<boolean> {
  try {
    const response = await fetcher(origin + "/api/", { headers, redirect: "error", signal: AbortSignal.timeout(700), cache: "no-store" });
    await response.body?.cancel();
    return response.ok;
  } catch { return false; }
}

export function createZoteroLocal({ groupId, fetcher = fetch }: { groupId?: number; fetcher?: typeof fetch } = {}) {
  if (groupId !== undefined && (!Number.isSafeInteger(groupId) || groupId < 1)) throw new Error("invalid_group_id");
  const sourceScope = groupId === undefined ? "users/0" : `groups/${groupId}`;

  async function get(path: string) {
    try {
      return await fetcher(`${origin}/api/${sourceScope}/${path}`, {
        method: "GET", headers, redirect: "error", signal: AbortSignal.timeout(8_000), cache: "no-store",
      });
    } catch { throw new ZoteroLocalError("offline"); }
  }

  async function checkedJson<T>(response: Response, schema: z.ZodType<T>) {
    if (response.status === 404) throw new ZoteroLocalError("collection_missing");
    if (!response.ok) throw new ZoteroLocalError("offline");
    try { return schema.parse(await response.json()); }
    catch { throw new ZoteroLocalError("invalid_response"); }
  }

  async function entries<T>(path: string, schema: z.ZodType<T>) {
    const results: T[] = [];
    let version: string | null | undefined;
    while (true) {
      const response = await get(`${path}?start=${results.length}&limit=100`);
      const rows = await checkedJson(response, z.array(schema).max(100));
      const actual = response.headers.get("last-modified-version");
      if (version === undefined) version = actual;
      if (actual !== version) throw new ZoteroLocalError("collection_changed");
      results.push(...rows);
      const total = Number(response.headers.get("total-results") ?? results.length);
      if (!Number.isSafeInteger(total) || total < results.length) throw new ZoteroLocalError("invalid_response");
      if (total > 10_000) throw new ZoteroLocalError("collection_too_large");
      if (results.length === total) return { rows: results, version };
      if (!rows.length) throw new ZoteroLocalError("collection_changed");
    }
  }

  async function inspect(rawKey: string) {
    const key = keySchema.parse(rawKey);
    const response = await get("collections/" + key);
    const data = await checkedJson(response, collectionSchema);
    if (data.key !== key || (groupId === undefined ? data.library.type !== "user" :
      data.library.type !== "group" || groupId !== data.library.id)) throw new ZoteroLocalError("invalid_response");
    const collection: ZoteroCollection = { sourceScope, libraryKey: `${data.library.type}:${data.library.id}`, collectionKey: key, title: data.data.name };
    return { collection, collectionVersion: data.version };
  }

  return {
    sourceScope,
    async collections() {
      const { rows } = await entries("collections", collectionSchema);
      return rows.map((row) => ({ key: row.key, title: row.data.name, parent: row.data.parentCollection || null }));
    },
    async snapshot(key: string) {
      const before = await inspect(key);
      const itemsPath = `collections/${before.collection.collectionKey}/items`;
      const { rows, version } = await entries(itemsPath, itemSchema);
      const byKey = new Map(rows.map((row) => [row.key, row]));
      if (byKey.size !== rows.length) throw new ZoteroLocalError("collection_changed");
      const attachments = rows.flatMap((row): ZoteroAttachment[] => {
        const data = row.data;
        if (data.itemType !== "attachment" || data.linkMode === "linked_url" ||
          (data.contentType !== "application/pdf" && !/\.pdf$/iu.test(data.filename ?? ""))) return [];
        const parent = data.parentItem ? byKey.get(data.parentItem) : row;
        const title = parent?.data.title || data.title || data.filename || "PDF";
        return [{ attachmentKey: row.key, itemKey: data.parentItem ?? row.key, name: data.filename || data.title || title,
          title, creators: parent?.meta?.creatorSummary ?? null, date: parent?.data.date ?? null, doi: parent?.data.DOI ?? null }];
      });
      return { collection: before.collection, attachments, async confirm() {
        const after = await inspect(key);
        // Individual resources carry an item version, while list responses carry a library version.
        const list = await get(itemsPath + "?limit=1");
        if (!list.ok) throw new ZoteroLocalError(list.status === 404 ? "collection_missing" : "offline");
        await list.body?.cancel();
        if (list.headers.get("last-modified-version") !== version || after.collectionVersion !== before.collectionVersion ||
          after.collection.libraryKey !== before.collection.libraryKey) throw new ZoteroLocalError("collection_changed");
      } };
    },
    async filePath(key: string) {
      const response = await get(`items/${keySchema.parse(key)}/file/view/url`);
      if (response.status === 404 || response.status === 400) return null;
      if (!response.ok) throw new ZoteroLocalError("offline");
      try {
        const url = new URL((await response.text()).trim());
        if (url.protocol !== "file:" || url.host || url.search || url.hash) return null;
        const path = fileURLToPath(url);
        return isAbsolute(path) && !/^(?:\\\\|\/\/)/u.test(path) && /\.pdf$/iu.test(path) ? path : null;
      } catch { return null; }
    },
  };
}
