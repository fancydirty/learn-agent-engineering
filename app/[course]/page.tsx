import type { Metadata } from "next";
import Link from "next/link";
import { notFound, permanentRedirect } from "next/navigation";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { Breadcrumbs } from "@/components/breadcrumbs";
import { CourseMarkdown } from "@/components/course-markdown";
import { CourseNav } from "@/components/course-nav";
import { CoursePageShell } from "@/components/course-page-shell";
import { FootnotePreview } from "@/components/footnote-preview";
import { GlossaryEnhancer } from "@/components/glossary-enhancer";
import { HeadingAnchors } from "@/components/heading-anchors";
import { OnThisPage } from "@/components/on-this-page";
import { scanCourses } from "@/lib/courses";
import { resolveFootnotes } from "@/lib/footnotes";
import { parseFrontmatter } from "@/lib/frontmatter";
import { loadGlossaryTerms } from "@/lib/glossary-load";
import { coursesDir } from "@/lib/paths";
import { tocFromMarkdown } from "@/lib/toc";

export function generateStaticParams() {
  return scanCourses(coursesDir()).map((course) => ({ course: course.slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ course: string }> }): Promise<Metadata> {
  const { course } = await params;
  const found = scanCourses(coursesDir()).find((item) => item.slug === course.replace(/^learn-/, ""));
  if (!found) return {};
  return { title: found.title, description: found.intro };
}

export default async function CoursePage({ params }: { params: Promise<{ course: string }> }) {
  const { course } = await params;
  const courses = scanCourses(coursesDir());
  const found = courses.find((item) => item.slug === course);
  if (!found) {
    const canonical = course.replace(/^learn-/, "");
    if (canonical !== course && courses.some((item) => item.slug === canonical)) permanentRedirect(`/${canonical}`);
    notFound();
  }

  const readmePath = join(found.dir, "README.md");
  const sourcesPath = join(found.dir, "sources.md");
  const raw = existsSync(readmePath) ? readFileSync(readmePath, "utf8") : `# ${found.title}`;
  const sources = existsSync(sourcesPath) ? readFileSync(sourcesPath, "utf8") : "";
  const markdown = resolveFootnotes(parseFrontmatter(raw).body, sources);
  const terms = loadGlossaryTerms(found.dir);
  const firstLesson = found.lessons[0];

  return (
    <CoursePageShell>
      <CourseNav course={found} current={null} lang={found.lang} />
      <main className="course-page-main min-w-0 flex-1">
        <Breadcrumbs items={[{ label: found.lang === "zh" ? "课程" : "Courses", href: "/courses" }, { label: found.title }]} lang={found.lang} />
        <div className="mb-7 flex flex-wrap gap-3">
          {firstLesson ? (
            <Link href={`/${found.slug}/${firstLesson.slug}`} className="inline-flex rounded-lg px-4 py-2 text-sm font-medium" style={{ background: "var(--accent)", color: "var(--on-accent)" }}>
              {found.lang === "zh" ? "开始学习" : "Start course"}
            </Link>
          ) : null}
          {terms.length ? <Link href={`/${found.slug}/glossary`} className="inline-flex rounded-lg border px-4 py-2 text-sm" style={{ borderColor: "var(--border)", color: "var(--ink-strong)" }}>{found.lang === "zh" ? "术语表" : "Glossary"}</Link> : null}
          {sources ? <Link href={`/${found.slug}/sources`} className="inline-flex rounded-lg border px-4 py-2 text-sm" style={{ borderColor: "var(--border)", color: "var(--ink-strong)" }}>{found.lang === "zh" ? "来源" : "Sources"}</Link> : null}
        </div>
        <CourseMarkdown md={markdown} courseSlug={found.slug} lang={found.lang} />
        <aside className="reading-prose mt-10 rounded-xl border p-5" style={{ borderColor: "var(--border)", background: "var(--card)" }}>
          <strong>{found.lang === "zh" ? "想学自己的主题？" : "Want a course for your own goal?"}</strong>
          <p>{found.lang === "zh" ? "Agent Mentor 会在你的本机生成带来源、练习和互动的课程。" : "Agent Mentor generates sourced, interactive courses on your machine."}</p>
          <a href={`https://agentmentor.dev/?utm_source=learn&utm_medium=course_cta&utm_campaign=${encodeURIComponent(found.slug)}`} style={{ color: "var(--accent)" }}>
            {found.lang === "zh" ? "了解 Agent Mentor ↗" : "Explore Agent Mentor ↗"}
          </a>
        </aside>
        <GlossaryEnhancer terms={terms} lang={found.lang} />
        <FootnotePreview />
        <HeadingAnchors lang={found.lang} />
      </main>
      <OnThisPage items={tocFromMarkdown(markdown)} lang={found.lang} />
    </CoursePageShell>
  );
}
