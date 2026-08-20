// Pure logic (no DOM/IO); shared by client and first-paint script.
export type Theme = "light" | "dark";

export function normalizeTheme(v: unknown): Theme | null {
  return v === "light" || v === "dark" ? v : null;
}

export function nextTheme(cur: Theme): Theme {
  return cur === "dark" ? "light" : "dark";
}
