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

// Site-wide defaults applied in app/[locale]/layout.tsx. Pages keep ownership
// of title, description, and alternates — no blanket canonical here, since the
// per-page functions above already emit the correct self-links.
export const defaultMetadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: { default: "Agent Mentor Learn", template: "%s | Agent Mentor Learn" },
  description:
    "Open courses that track the Agent ecosystem. Read lessons, do exercises, and copy context straight to your Agent.",
  keywords: [
    "AI agents",
    "agent engineering",
    "Claude Code",
    "tool calling",
    "multi-agent systems",
    "LLM workflows",
    "prompt engineering",
    "context engineering",
  ],
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-image-preview": "large",
      "max-snippet": -1,
    },
  },
  openGraph: {
    type: "website",
    siteName: "Agent Mentor Learn",
    images: [{ url: "/og-image.png", width: 1200, height: 630, alt: "Agent Mentor Learn" }],
  },
  twitter: {
    card: "summary_large_image",
    images: ["/og-image.png"],
  },
  verification: {
    google: process.env.NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION || undefined,
    other: {
      "msvalidate.01": "5A09691A7293BD69A21ED34C7B937485",
    },
  },
};
