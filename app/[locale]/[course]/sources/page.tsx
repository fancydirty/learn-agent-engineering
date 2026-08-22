import { notFound } from "next/navigation";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { findCourseFamily, findCourseVariant, scanCourseFamilies } from "@/lib/courses";
import { coursesDir } from "@/lib/paths";
import { parseFrontmatter } from "@/lib/frontmatter";
import { localePath } from "@/lib/i18n";
import { isLocale, siteCopyFor } from "@/lib/locales";
import { CourseNav } from "@/components/course-nav";
import { CourseMarkdown } from "@/components/course-markdown";
import { Breadcrumbs } from "@/components/breadcrumbs";
import { CoursePageShell } from "@/components/course-page-shell";

export function generateStaticParams() {
  return scanCourseFamilies(coursesDir()).flatMap((family) =>
    family.variants.filter((variant) => variant.hasSources).map((variant) => ({ locale: variant.locale, course: family.slug })),
  );
}

export default async function SourcesPage({
  params,
}: {
  params: Promise<{ locale: string; course: string }>;
}) {
  const { locale, course } = await params;
  if (!isLocale(locale)) notFound();
  const family = findCourseFamily(scanCourseFamilies(coursesDir()), course);
  const variant = family && findCourseVariant(family, locale);
  if (!variant) notFound();
  const lang = variant.locale;
  const copy = siteCopyFor(lang).reader;
  const sourcesPath = join(variant.dir, "sources.md");
  if (!existsSync(sourcesPath)) notFound();
  const md = parseFrontmatter(readFileSync(sourcesPath, "utf8")).body;
  return (
    <CoursePageShell>
      <CourseNav course={variant} current={null} />
      <main className="course-page-main min-w-0 flex-1">
        <Breadcrumbs items={[{ label: copy.breadcrumbCourses, href: localePath(lang, "/courses") }, { label: variant.title, href: localePath(lang, `/${variant.slug}`) }, { label: copy.sources.breadcrumbSelf }]} lang={lang} />
        <CourseMarkdown md={md} courseSlug={variant.slug} lang={lang} />
      </main>
    </CoursePageShell>
  );
}
