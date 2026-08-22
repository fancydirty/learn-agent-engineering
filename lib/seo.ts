import type { Metadata } from "next";
import type { CourseFamily, PageSpec } from "./courses";
import { coursesLocaleLinks, localePath, pageBarePath, samePageLocaleLinks } from "./i18n";
import type { Locale } from "./locales";

export const SITE_URL = "https://learn.agentmentor.dev";

export function absoluteUrl(path: string): string {
  return `${SITE_URL}${path}`;
}

type Alternates = NonNullable<Metadata["alternates"]>;

// Canonical self-link + hreflang set for one page inside a course family.
// Only locales whose variant really has this exact page appear; x-default points
// at the English page and is omitted entirely when no English variant exists.
export function localizedAlternates(family: CourseFamily, page: PageSpec, locale: Locale): Alternates {
  const languages: Record<string, string> = {};
  for (const link of samePageLocaleLinks(family, page)) {
    languages[link.locale] = absoluteUrl(link.href);
  }
  const english = languages.en;
  if (english) languages["x-default"] = english;
  return {
    canonical: absoluteUrl(localePath(locale, pageBarePath(family.slug, page))),
    languages,
  };
}

// The library exists in every launch locale, so its hreflang set is the registry.
export function libraryAlternates(locale: Locale): Alternates {
  const languages: Record<string, string> = {};
  for (const link of coursesLocaleLinks()) {
    languages[link.locale] = absoluteUrl(link.href);
  }
  languages["x-default"] = absoluteUrl(localePath("en", "/courses"));
  return {
    canonical: absoluteUrl(localePath(locale, "/courses")),
    languages,
  };
}
