import type { MetadataRoute } from "next";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { scanCourses } from "@/lib/courses";
import { coursesDir } from "@/lib/paths";

const SITE_URL = "https://learn.agentmentor.dev";

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();
  const entries: MetadataRoute.Sitemap = [
    { url: `${SITE_URL}/courses`, lastModified: now, changeFrequency: "weekly", priority: 1 },
  ];

  for (const course of scanCourses(coursesDir())) {
    const base = `${SITE_URL}/${course.slug}`;
    entries.push({ url: base, lastModified: now, changeFrequency: "monthly", priority: 0.8 });
    for (const lesson of course.lessons) {
      entries.push({ url: `${base}/${lesson.slug}`, lastModified: now, changeFrequency: "monthly", priority: 0.7 });
    }
    if (existsSync(join(course.dir, "glossary.json"))) {
      entries.push({ url: `${base}/glossary`, lastModified: now, changeFrequency: "monthly", priority: 0.5 });
    }
    if (existsSync(join(course.dir, "sources.md"))) {
      entries.push({ url: `${base}/sources`, lastModified: now, changeFrequency: "monthly", priority: 0.5 });
    }
  }
  return entries;
}
