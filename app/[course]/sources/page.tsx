import { notFound } from "next/navigation";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { scanCourses } from "@/lib/courses";
import { coursesDir } from "@/lib/paths";
import { parseFrontmatter } from "@/lib/frontmatter";
import { CourseNav } from "@/components/course-nav";
import { CourseMarkdown } from "@/components/course-markdown";
import { Breadcrumbs } from "@/components/breadcrumbs";
import { CoursePageShell } from "@/components/course-page-shell";
import { siteCopy } from "@/lib/site-copy";

export function generateStaticParams() {
  return scanCourses(coursesDir()).map((c) => ({ course: c.slug }));
}

export default async function SourcesPage({
  params,
}: {
  params: Promise<{ course: string }>;
}) {
  const { course } = await params;
  const c = scanCourses(coursesDir()).find((x) => x.slug === course);
  if (!c) notFound();
  const lang = c.lang;
  const copy = siteCopy[lang].reader.sources;
  const sourcesPath = join(c.dir, "sources.md");
  if (!existsSync(sourcesPath)) notFound();
  const md = parseFrontmatter(readFileSync(sourcesPath, "utf8")).body;
  return (
    <CoursePageShell>
      <CourseNav course={c} current={null} lang={lang} />
      <main className="course-page-main min-w-0 flex-1">
        <Breadcrumbs items={[{ label: copy.breadcrumbLibrary, href: "/courses" }, { label: c.title, href: `/${c.slug}` }, { label: copy.breadcrumbSelf }]} lang={lang} />
        <CourseMarkdown md={md} courseSlug={c.slug} lang={lang} />
      </main>
    </CoursePageShell>
  );
}
