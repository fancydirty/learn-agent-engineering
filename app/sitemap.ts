import { statSync } from "node:fs";
import { join } from "node:path";
import type { MetadataRoute } from "next";
import { scanCourseFamilies } from "@/lib/courses";
import { localePath } from "@/lib/i18n";
import { LOCALES } from "@/lib/locales";
import { coursesDir } from "@/lib/paths";

const SITE_URL = "https://learn.agentmentor.dev";

// Real content mtimes, not the build timestamp: stamping every URL "changed" on
// each deploy teaches Google to distrust lastmod and deprioritizes recrawls.
function mtime(path: string): Date | undefined {
  try {
    return statSync(path).mtime;
  } catch {
    return undefined;
  }
}

export default function sitemap(): MetadataRoute.Sitemap {
  const entries: MetadataRoute.Sitemap = [];
  const courseEntries: MetadataRoute.Sitemap = [];
  let newest: Date | undefined;

  for (const family of scanCourseFamilies(coursesDir())) {
    for (const variant of family.variants) {
      const base = `${SITE_URL}${localePath(variant.locale, `/${family.slug}`)}`;
      const readmeAt = mtime(join(variant.dir, "README.md"));
      if (readmeAt && (!newest || readmeAt > newest)) newest = readmeAt;
      courseEntries.push({ url: base, lastModified: readmeAt, changeFrequency: "monthly", priority: 0.8 });
      for (const lesson of variant.lessons) {
        courseEntries.push({
          url: `${base}/${lesson.slug}`,
          lastModified: mtime(join(variant.dir, lesson.file)),
          changeFrequency: "monthly",
          priority: 0.7,
        });
      }
      if (variant.hasGlossary) {
        courseEntries.push({
          url: `${base}/glossary`,
          lastModified: mtime(join(variant.dir, "glossary.json")),
          changeFrequency: "monthly",
          priority: 0.5,
        });
      }
      if (variant.hasSources) {
        courseEntries.push({
          url: `${base}/sources`,
          lastModified: mtime(join(variant.dir, "sources.md")),
          changeFrequency: "monthly",
          priority: 0.5,
        });
      }
    }
  }

  // The library pages change whenever any course content does.
  for (const info of LOCALES) {
    entries.push({
      url: `${SITE_URL}${localePath(info.code, "/courses")}`,
      lastModified: newest,
      changeFrequency: "weekly",
      priority: 1,
    });
  }
  entries.push(...courseEntries);
  return entries;
}
