import type { MetadataRoute } from "next";
import { scanCourseFamilies } from "@/lib/courses";
import { localePath } from "@/lib/i18n";
import { LOCALES } from "@/lib/locales";
import { coursesDir } from "@/lib/paths";

const SITE_URL = "https://learn.agentmentor.dev";

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();
  const entries: MetadataRoute.Sitemap = LOCALES.map((info) => ({
    url: `${SITE_URL}${localePath(info.code, "/courses")}`,
    lastModified: now,
    changeFrequency: "weekly",
    priority: 1,
  }));

  for (const family of scanCourseFamilies(coursesDir())) {
    for (const variant of family.variants) {
      const base = `${SITE_URL}${localePath(variant.locale, `/${family.slug}`)}`;
      entries.push({ url: base, lastModified: now, changeFrequency: "monthly", priority: 0.8 });
      for (const lesson of variant.lessons) {
        entries.push({ url: `${base}/${lesson.slug}`, lastModified: now, changeFrequency: "monthly", priority: 0.7 });
      }
      if (variant.hasGlossary) {
        entries.push({ url: `${base}/glossary`, lastModified: now, changeFrequency: "monthly", priority: 0.5 });
      }
      if (variant.hasSources) {
        entries.push({ url: `${base}/sources`, lastModified: now, changeFrequency: "monthly", priority: 0.5 });
      }
    }
  }
  return entries;
}
