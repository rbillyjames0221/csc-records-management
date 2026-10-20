import "server-only";
import { mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { createReadStream } from "node:fs";
import { dirname, join, resolve, sep } from "node:path";
import { Readable } from "node:stream";

export type StoredObject = { stream: ReadableStream<Uint8Array>; size: number | null; contentType: string | null };

export interface StorageDriver {
  name: "local" | "blob";
  put(key: string, body: Buffer, contentType: string): Promise<{ key: string; size: number }>;
  get(key: string): Promise<StoredObject | null>;
  getBuffer(key: string): Promise<Buffer | null>;
  delete(key: string): Promise<void>;
}

function safeKey(key: string) {
  if (!/^[A-Za-z0-9/_.\-]+$/.test(key) || key.includes("..")) throw new Error("Invalid storage key");
  return key.replace(/^\/+/, "");
}

class LocalDriver implements StorageDriver {
  name = "local" as const;
  private root = resolve(/* turbopackIgnore: true */ process.cwd(), process.env.STORAGE_LOCAL_DIR || "storage");
  private path(key: string) {
    const p = resolve(/* turbopackIgnore: true */ join(this.root, safeKey(key)));
    if (!p.startsWith(this.root + sep)) throw new Error("Invalid storage key");
    return p;
  }
  async put(key: string, body: Buffer) {
    const p = this.path(key);
    await mkdir(dirname(p), { recursive: true });
    await writeFile(p, body);
    return { key, size: body.byteLength };
  }
  async get(key: string) {
    const p = this.path(key);
    try {
      const s = await stat(p);
      const stream = Readable.toWeb(createReadStream(p)) as ReadableStream<Uint8Array>;
      return { stream, size: s.size, contentType: null };
    } catch {
      return null;
    }
  }
  async getBuffer(key: string) {
    try { return await readFile(this.path(key)); } catch { return null; }
  }
  async delete(key: string) {
    await rm(this.path(key), { force: true });
  }
}

class BlobDriver implements StorageDriver {
  name = "blob" as const;
  async put(key: string, body: Buffer, contentType: string) {
    const { put } = await import("@vercel/blob");
    const res = await put(safeKey(key), body, { access: "private", contentType, addRandomSuffix: false, allowOverwrite: true });
    return { key: res.pathname, size: body.byteLength };
  }
  async get(key: string) {
    const { get } = await import("@vercel/blob");
    const res = await get(safeKey(key), { access: "private" });
    if (!res || res.statusCode !== 200 || !res.stream) return null;
    return { stream: res.stream, size: res.blob.size ?? null, contentType: res.blob.contentType ?? null };
  }
  async getBuffer(key: string) {
    const o = await this.get(key);
    if (!o) return null;
    return Buffer.from(await new Response(o.stream).arrayBuffer());
  }
  async delete(key: string) {
    const { del } = await import("@vercel/blob");
    await del(safeKey(key));
  }
}

let driver: StorageDriver | null = null;
export function storage(): StorageDriver {
  if (driver) return driver;
  const name = process.env.STORAGE_DRIVER || (process.env.BLOB_READ_WRITE_TOKEN || process.env.BLOB_STORE_ID ? "blob" : "local");
  driver = name === "blob" ? new BlobDriver() : new LocalDriver();
  return driver;
}

export function storageFor(name: string): StorageDriver {
  return name === "blob" ? new BlobDriver() : new LocalDriver();
}

export function storageKeyFor(recordId: string, sha256: string, filename: string) {
  const ext = (filename.split(".").pop() || "bin").toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 5) || "bin";
  return `records/${recordId}/${sha256.slice(0, 16)}.${ext}`;
}
