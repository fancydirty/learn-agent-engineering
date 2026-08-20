import type { LiveFiles } from "./live-sandbox";

export type FileKey = keyof LiveFiles; // "html" | "css" | "js"
const KEY_ORDER: FileKey[] = ["html", "css", "js"];

// Segments that actually change after a solution overlay (unchanged solution values don't count)
export function solutionChangedKeys(files: LiveFiles, solution: Partial<LiveFiles>): FileKey[] {
  return KEY_ORDER.filter((k) => typeof solution[k] === "string" && solution[k] !== files[k]);
}

// 1-based changed lines in after vs before: LCS alignment; returns after lines not in the common subsequence (adds/edits); deletions unmarked
export function changedLineNumbers(before: string, after: string): number[] {
  const a = before.split("\n");
  const b = after.split("\n");
  const n = a.length;
  const m = b.length;
  const dp: number[][] = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }
  const inLcs = new Array<boolean>(m).fill(false);
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) { inLcs[j] = true; i++; j++; }
    else if (dp[i + 1][j] >= dp[i][j + 1]) i++;
    else j++;
  }
  const out: number[] = [];
  for (let k = 0; k < m; k++) if (!inLcs[k]) out.push(k + 1);
  return out;
}

// Append with cap (FIFO drops oldest) so setInterval logging can't blow the console
export function appendCapped<T>(list: T[], item: T, cap = 200): T[] {
  const next = [...list, item];
  return next.length > cap ? next.slice(next.length - cap) : next;
}
