// course-reader/lib/live-share.ts
// URL hash sharing: JSON → gzip (CompressionStream) → base64url. Zero deps; native streams in browser and Node 18+.
import type { LiveFiles } from "./live-sandbox";

const PREFIX = "am-live=";
const MAX_FRAGMENT = 4096;

async function pipe(data: Uint8Array, stream: CompressionStream | DecompressionStream): Promise<Uint8Array> {
  const out = new Response(new Blob([data as BlobPart]).stream().pipeThrough(stream as ReadableWritablePair<Uint8Array, Uint8Array>));
  return new Uint8Array(await out.arrayBuffer());
}

function toBase64Url(bytes: Uint8Array): string {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(s: string): Uint8Array | null {
  try {
    const b64 = s.replace(/-/g, "+").replace(/_/g, "/");
    const bin = atob(b64 + "=".repeat((4 - (b64.length % 4)) % 4));
    return Uint8Array.from(bin, (c) => c.charCodeAt(0));
  } catch {
    return null;
  }
}

// Returns hash fragment value (no #): `am-live=<id>.<data>`. null when unsupported or too long.
export async function encodeShare(id: string, files: LiveFiles): Promise<string | null> {
  try {
    if (typeof CompressionStream === "undefined") return null;
    const raw = new TextEncoder().encode(JSON.stringify(files));
    const gz = await pipe(raw, new CompressionStream("gzip"));
    const frag = `${PREFIX}${id}.${toBase64Url(gz)}`;
    return frag.length > MAX_FRAGMENT ? null : frag;
  } catch {
    return null;
  }
}

// Accepts hash with or without #; any failure returns null.
export async function decodeShare(hash: string): Promise<{ id: string; files: LiveFiles } | null> {
  try {
    if (typeof DecompressionStream === "undefined") return null;
    const s = hash.startsWith("#") ? hash.slice(1) : hash;
    if (!s.startsWith(PREFIX)) return null;
    const body = s.slice(PREFIX.length);
    const dot = body.indexOf(".");
    if (dot <= 0) return null;
    const id = body.slice(0, dot);
    const bytes = fromBase64Url(body.slice(dot + 1));
    if (!bytes) return null;
    const raw = await pipe(bytes, new DecompressionStream("gzip"));
    const parsed = JSON.parse(new TextDecoder().decode(raw)) as LiveFiles;
    if (typeof parsed.html !== "string" || typeof parsed.css !== "string" || typeof parsed.js !== "string") return null;
    return { id, files: { html: parsed.html, css: parsed.css, js: parsed.js } };
  } catch {
    return null;
  }
}
