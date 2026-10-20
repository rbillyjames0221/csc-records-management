import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

export const sha256Hex = (data: string | Buffer | Uint8Array) => createHash("sha256").update(data).digest("hex");
export const randomToken = (bytes = 24) => randomBytes(bytes).toString("base64url");

export function safeEqual(a: string, b: string) {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  return ba.length === bb.length && timingSafeEqual(ba, bb);
}
