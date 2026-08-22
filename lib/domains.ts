import type { Locale } from "./locales";

export const DOMAIN_ORDER = ["软件", "量化", "生活技艺", "音乐"];

const COLORS: Record<string, string> = {
  软件: "var(--accent)",
  量化: "#3f6b8a",
  生活技艺: "#5a8a5e",
  音乐: "#8a5e7a",
};

export function domainColor(domain: string): string {
  return COLORS[domain] || "var(--ink-subtle)";
}

// Every domain is an ordinary subject noun, so all six locales get a real translation.
// "Software" is genuinely the Spanish/Portuguese word for the field, not an untranslated fallback.
const DOMAIN_LABELS: Record<string, Record<Locale, string>> = {
  软件: { zh: "软件", en: "Software", ja: "ソフトウェア", ko: "소프트웨어", es: "Software", "pt-BR": "Software" },
  数字素养: { zh: "数字素养", en: "Digital Literacy", ja: "デジタルリテラシー", ko: "디지털 리터러시", es: "Alfabetización digital", "pt-BR": "Letramento digital" },
  产品: { zh: "产品", en: "Product", ja: "プロダクト", ko: "프로덕트", es: "Producto", "pt-BR": "Produto" },
  量化: { zh: "量化", en: "Quant", ja: "クオンツ", ko: "퀀트", es: "Cuantitativo", "pt-BR": "Quantitativo" },
  生活技艺: { zh: "生活技艺", en: "Life Skills", ja: "生活の技", ko: "생활 기술", es: "Habilidades de vida", "pt-BR": "Habilidades de vida" },
  音乐: { zh: "音乐", en: "Music", ja: "音楽", ko: "음악", es: "Música", "pt-BR": "Música" },
  其他: { zh: "其他", en: "Other", ja: "その他", ko: "기타", es: "Otros", "pt-BR": "Outros" },
};

// Canonical domain keys stay as stored in course data; map to labels only at display time.
export function domainLabel(domain: string, lang: Locale): string {
  const entry = DOMAIN_LABELS[domain];
  return entry ? entry[lang] : domain;
}

export interface DomainGroup<T extends { domain: string; slug: string }> { domain: string; courses: T[]; }

export function groupCoursesByDomain<T extends { domain: string; slug: string }>(courses: T[]): DomainGroup<T>[] {
  const byDomain = new Map<string, T[]>();
  for (const c of courses) {
    if (!byDomain.has(c.domain)) byDomain.set(c.domain, []);
    byDomain.get(c.domain)!.push(c);
  }
  const known = DOMAIN_ORDER.filter((d) => byDomain.has(d));
  const unknown = [...byDomain.keys()]
    .filter((d) => !DOMAIN_ORDER.includes(d) && d !== "其他")
    .sort((a, b) => a.localeCompare(b));
  const tail = byDomain.has("其他") ? ["其他"] : [];
  const order = [...known, ...unknown, ...tail];
  return order.map((domain) => ({
    domain,
    courses: byDomain.get(domain)!.slice().sort((a, b) => a.slug.localeCompare(b.slug)),
  }));
}

export function domainsByCount(groups: { domain: string; courses: unknown[] }[]): { domain: string; count: number }[] {
  const orderIndex = (d: string) => {
    const i = DOMAIN_ORDER.indexOf(d);
    return i === -1 ? DOMAIN_ORDER.length : i;
  };
  // Tie-break via code-point compare (not localeCompare): localeCompare follows runtime ICU,
  // and Node (SSR) vs browser (CSR) can sort CJK differently → domain buttons shift → hydration mismatch.
  const cmp = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);
  return groups
    .map((g) => ({ domain: g.domain, count: g.courses.length }))
    .sort((a, b) => b.count - a.count || orderIndex(a.domain) - orderIndex(b.domain) || cmp(a.domain, b.domain));
}
