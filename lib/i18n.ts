import { pageVariants, type CourseFamily, type PageSpec } from "./courses";
import { localeInfo, type Locale } from "./locales";

export type { Locale } from "./locales";

/**
 * @deprecated Use `Locale` from lib/locales.ts. The alias keeps long-tail
 * component props (`lang: Lang`) compiling while pages migrate to URL locales.
 */
export type Lang = Locale;

// Every official course URL is locale-first: /{locale}/courses, /{locale}/{course}, …
// No query-param language state anywhere.
export function localePath(locale: Locale, path: string): string {
  const bare = path.startsWith("/") ? path : `/${path}`;
  return `/${locale}${bare === "/" ? "" : bare}`;
}

// Bare (locale-less) path for a page inside a course family.
export function pageBarePath(courseSlug: string, page: PageSpec): string {
  switch (page.kind) {
    case "course":
      return `/${courseSlug}`;
    case "lesson":
      return `/${courseSlug}/${page.lesson}`;
    case "glossary":
      return `/${courseSlug}/glossary`;
    case "sources":
      return `/${courseSlug}/sources`;
  }
}

export interface LocaleLink {
  locale: Locale;
  label: string;
  href: string;
}

// Language-switcher links for the exact current page. Only locales whose variant
// really has this page (same lesson slug, glossary, …) appear — never a silent
// fallback to a different page.
export function samePageLocaleLinks(family: CourseFamily, page: PageSpec): LocaleLink[] {
  return pageVariants(family, page).map((variant) => ({
    locale: variant.locale,
    label: localeInfo(variant.locale).label,
    href: localePath(variant.locale, pageBarePath(family.slug, page)),
  }));
}

/**
 * @deprecated Legacy `?lang=zh` helper kept so pre-migration components still
 * compile. Removed in the locale-route task once its last callers are gone.
 */
export function withLang(path: string, lang: Locale): string {
  if (lang === "en") return stripLang(path);
  const [base, hash] = path.split("#");
  const sep = base.includes("?") ? "&" : "?";
  return `${base}${sep}lang=${lang}${hash ? `#${hash}` : ""}`;
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
