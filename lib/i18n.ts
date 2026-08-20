export type Lang = "zh" | "en";

export type SearchParamsLike =
  | Record<string, string | string[] | undefined>
  | Promise<Record<string, string | string[] | undefined>>
  | undefined;

// en is canonical default: only explicit "zh" is Chinese; everything else (missing/unknown) → en.
export function normalizeLang(value: unknown): Lang {
  const raw = Array.isArray(value) ? value[0] : value;
  return raw === "zh" ? "zh" : "en";
}

export async function langFromSearchParams(searchParams: SearchParamsLike): Promise<Lang> {
  const resolved = await searchParams;
  return normalizeLang(resolved?.lang);
}

// en = bare URL (strip param); zh = ?lang=zh.
export function withLang(path: string, lang: Lang): string {
  if (lang === "en") return stripLang(path);
  const [base, hash] = path.split("#");
  const sep = base.includes("?") ? "&" : "?";
  return `${base}${sep}lang=zh${hash ? `#${hash}` : ""}`;
}

function stripLang(path: string): string {
  const [base, hash] = path.split("#");
  const [pathname, query] = base.split("?");
  if (!query) return hash ? `${pathname}#${hash}` : pathname;
  const params = new URLSearchParams(query);
  params.delete("lang");
  const next = params.toString();
  return `${pathname}${next ? `?${next}` : ""}${hash ? `#${hash}` : ""}`;
}
