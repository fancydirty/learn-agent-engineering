// course-reader/lib/live-storage.ts
// Persist learner attempts for live blocks in localStorage. All try/catch: private mode,
// quota full, file:// restrictions degrade silently.
import type { LiveFiles } from "./live-sandbox";
import type { LiveStats } from "./live-stats";

const STORE_VERSION = 1;
const MAX_BYTES = 20 * 1024;

export function loadSavedLive(storage: Storage, key: string): LiveFiles | null {
  try {
    const raw = storage.getItem(key);
    if (!raw) return null;
    const data = JSON.parse(raw) as { v?: number; files?: LiveFiles };
    if (data.v !== STORE_VERSION || !data.files) return null;
    const f = data.files;
    if (typeof f.html !== "string" || typeof f.css !== "string" || typeof f.js !== "string") return null;
    return { html: f.html, css: f.css, js: f.js };
  } catch {
    return null;
  }
}

export function loadSavedStats(storage: Storage, key: string): LiveStats | null {
  try {
    const raw = storage.getItem(key);
    if (!raw) return null;
    const data = JSON.parse(raw) as { v?: number; stats?: LiveStats };
    if (data.v !== STORE_VERSION || !data.stats) return null;
    const st = data.stats;
    if (typeof st.resets !== "number" || typeof st.solutionViews !== "number" || typeof st.edits !== "number") return null;
    return {
      resets: st.resets, solutionViews: st.solutionViews, edits: st.edits,
      firstEditTs: typeof st.firstEditTs === "number" ? st.firstEditTs : null,
      lastEditTs: typeof st.lastEditTs === "number" ? st.lastEditTs : null,
      achievedTs: typeof st.achievedTs === "number" ? st.achievedTs : null,
    };
  } catch {
    return null;
  }
}

export function saveLive(storage: Storage, key: string, files: LiveFiles, stats?: LiveStats): void {
  try {
    const raw = JSON.stringify({ v: STORE_VERSION, files, ts: Date.now(), ...(stats ? { stats } : {}) });
    if (raw.length > MAX_BYTES) return;
    storage.setItem(key, raw);
  } catch {
    /* silent degrade */
  }
}

export function clearLive(storage: Storage, key: string): void {
  try {
    storage.removeItem(key);
  } catch {
    /* silent degrade */
  }
}
