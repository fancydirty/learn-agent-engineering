import { siteCopy, type SiteCopy } from "./site-copy";

// Single source of truth for launch locales: URL segment, menu label (local name),
// and <html lang> tag. Adding a language means appending here plus shipping a full
// course variant — never listing a locale whose content does not exist.
export const LOCALES = [
  { code: "en", label: "English", htmlLang: "en" },
  { code: "zh", label: "简体中文", htmlLang: "zh-CN" },
  { code: "ja", label: "日本語", htmlLang: "ja-JP" },
  { code: "ko", label: "한국어", htmlLang: "ko-KR" },
  { code: "es", label: "Español", htmlLang: "es-ES" },
  { code: "pt-BR", label: "Português (Brasil)", htmlLang: "pt-BR" },
] as const;

export type Locale = (typeof LOCALES)[number]["code"];

export interface LocaleInfo {
  code: Locale;
  label: string;
  htmlLang: string;
}

// Default target of the root redirect: English for outward reach, never an
// IP/browser guess — once a URL carries a locale, the URL wins.
export const DEFAULT_LOCALE: Locale = "en";

export function isLocale(value: unknown): value is Locale {
  return typeof value === "string" && (LOCALES as readonly LocaleInfo[]).some((info) => info.code === value);
}

export function localeInfo(locale: Locale): LocaleInfo {
  const found = (LOCALES as readonly LocaleInfo[]).find((info) => info.code === locale);
  if (!found) throw new Error(`Unknown locale: ${locale}`);
  return found;
}

export function siteCopyFor(locale: Locale): SiteCopy {
  return siteCopy[locale];
}

/**
 * Copy decks that predate the six-locale launch exist only in zh/en — Agent-prompt
 * scaffolding (prompt-copy, mentor-actions, interactive blocks) and domain labels.
 * Map any launch locale onto those decks: zh stays zh, everything else falls back
 * to en. On-page UI copy MUST NOT use this fallback; it belongs in site-copy.ts,
 * which is fully translated per locale.
 */
export type BilingualLang = "zh" | "en";

export function bilingualLang(locale: Locale): BilingualLang {
  return locale === "zh" ? "zh" : "en";
}
