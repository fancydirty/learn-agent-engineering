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
import { findCourseFamily, findCourseVariant, scanCourseFamilies } from "@/lib/courses";
import { resolveFootnotes } from "@/lib/footnotes";
import { parseFrontmatter } from "@/lib/frontmatter";
import { loadGlossaryTerms } from "@/lib/glossary-load";
import { localePath, samePageLocaleLinks } from "@/lib/i18n";
import { isLocale, siteCopyFor } from "@/lib/locales";
import { coursesDir } from "@/lib/paths";
import { tocFromMarkdown } from "@/lib/toc";

export function generateStaticParams() {
  return scanCourseFamilies(coursesDir()).flatMap((family) =>
    family.variants.map((variant) => ({ locale: variant.locale, course: family.slug })),
  );
}

export async function generateMetadata({ params }: { params: Promise<{ locale: string; course: string }> }): Promise<Metadata> {
  const { locale, course } = await params;
  if (!isLocale(locale)) return {};
  const family = findCourseFamily(scanCourseFamilies(coursesDir()), course.replace(/^learn-/, ""));
  const variant = family && findCourseVariant(family, locale);
  if (!variant) return {};
  return { title: variant.title, description: variant.intro };
}

export default async function CoursePage({ params }: { params: Promise<{ locale: string; course: string }> }) {
  const { locale, course } = await params;
  if (!isLocale(locale)) notFound();
  const families = scanCourseFamilies(coursesDir());
  const family = findCourseFamily(families, course);
  if (!family) {
    const canonical = course.replace(/^learn-/, "");
    if (canonical !== course && findCourseFamily(families, canonical)) permanentRedirect(localePath(locale, `/${canonical}`));
    notFound();
  }
  const variant = findCourseVariant(family, locale);
  if (!variant) notFound();
  const copy = siteCopyFor(locale);
  const lang = variant.locale;

  const readmePath = join(variant.dir, "README.md");
  const sourcesPath = join(variant.dir, "sources.md");
  const raw = existsSync(readmePath) ? readFileSync(readmePath, "utf8") : `# ${variant.title}`;
  const sources = existsSync(sourcesPath) ? readFileSync(sourcesPath, "utf8") : "";
  const markdown = resolveFootnotes(parseFrontmatter(raw).body, sources);
  const terms = loadGlossaryTerms(variant.dir);
  const firstLesson = variant.lessons[0];

  return (
    <CoursePageShell locale={lang} languageLinks={samePageLocaleLinks(family, { kind: "course" })}>
      <CourseNav course={variant} current={null} />
      <main className="course-page-main min-w-0 flex-1">
        <Breadcrumbs items={[{ label: copy.reader.breadcrumbCourses, href: localePath(lang, "/courses") }, { label: variant.title }]} lang={lang} />
        <div className="mb-7 flex flex-wrap gap-3">
          {firstLesson ? (
            <Link href={localePath(lang, `/${variant.slug}/${firstLesson.slug}`)} className="inline-flex rounded-lg px-4 py-2 text-sm font-medium" style={{ background: "var(--accent)", color: "var(--on-accent)" }}>
              {copy.reader.course.start}
            </Link>
          ) : null}
          {terms.length ? <Link href={localePath(lang, `/${variant.slug}/glossary`)} className="inline-flex rounded-lg border px-4 py-2 text-sm" style={{ borderColor: "var(--border)", color: "var(--ink-strong)" }}>{copy.reader.course.glossary}</Link> : null}
          {sources ? <Link href={localePath(lang, `/${variant.slug}/sources`)} className="inline-flex rounded-lg border px-4 py-2 text-sm" style={{ borderColor: "var(--border)", color: "var(--ink-strong)" }}>{copy.reader.course.sources}</Link> : null}
        </div>
        <CourseMarkdown md={markdown} courseSlug={variant.slug} lang={lang} />
        <aside className="reading-prose mt-10 rounded-xl border p-5" style={{ borderColor: "var(--border)", background: "var(--card)" }}>
          <strong>{copy.reader.course.ctaTitle}</strong>
          <p>{copy.reader.course.ctaBody}</p>
          <a href={`https://agentmentor.dev/?utm_source=learn&utm_medium=course_cta&utm_campaign=${encodeURIComponent(variant.slug)}`} style={{ color: "var(--accent)" }}>
            {copy.reader.course.ctaButton}
          </a>
        </aside>
        <GlossaryEnhancer terms={terms} lang={lang} />
        <FootnotePreview />
        <HeadingAnchors lang={lang} />
      </main>
      <OnThisPage items={tocFromMarkdown(markdown)} lang={lang} />
    </CoursePageShell>
  );
}
