import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import GithubSlugger from "github-slugger";
import { findCourseFamily, findCourseVariant, scanCourseFamilies } from "@/lib/courses";
import { coursesDir } from "@/lib/paths";
import { parseSources } from "@/lib/footnotes";
import { glossarySourceRef } from "@/lib/glossary-source";
import { loadGlossaryTerms } from "@/lib/glossary-load";
import { localePath, samePageLocaleLinks } from "@/lib/i18n";
import { isLocale, siteCopyFor } from "@/lib/locales";
import { localizedAlternates } from "@/lib/seo";
import { CourseNav } from "@/components/course-nav";
import { Breadcrumbs } from "@/components/breadcrumbs";
import { GlossaryTargetHighlight } from "@/components/glossary-target-highlight";
import { CoursePageShell } from "@/components/course-page-shell";

export function generateStaticParams() {
  return scanCourseFamilies(coursesDir()).flatMap((family) =>
    family.variants.filter((variant) => variant.hasGlossary).map((variant) => ({ locale: variant.locale, course: family.slug })),
  );
}

export async function generateMetadata({ params }: { params: Promise<{ locale: string; course: string }> }): Promise<Metadata> {
  const { locale, course } = await params;
  if (!isLocale(locale)) return {};
  const family = findCourseFamily(scanCourseFamilies(coursesDir()), course);
  const variant = family && findCourseVariant(family, locale);
  if (!family || !variant || !variant.hasGlossary) return {};
  const copy = siteCopyFor(locale).reader;
  return {
    title: `${copy.glossary.title} · ${variant.title}`,
    description: copy.glossary.subtitle(loadGlossaryTerms(variant.dir).length, variant.title),
    alternates: localizedAlternates(family, { kind: "glossary" }, locale),
  };
}

export default async function GlossaryPage({
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
  const entries = loadGlossaryTerms(variant.dir);
  if (entries.length === 0) notFound();

  const slugger = new GithubSlugger();
  const sourcesMd = existsSync(join(variant.dir, "sources.md")) ? readFileSync(join(variant.dir, "sources.md"), "utf8") : "";
  const sources = parseSources(sourcesMd);
  return (
    <CoursePageShell locale={lang} languageLinks={samePageLocaleLinks(family, { kind: "glossary" })}>
      <CourseNav course={variant} current={null} />
      <main className="course-page-main min-w-0 flex-1">
        <Breadcrumbs items={[{ label: copy.breadcrumbCourses, href: localePath(lang, "/courses") }, { label: variant.title, href: localePath(lang, `/${variant.slug}`) }, { label: copy.glossary.breadcrumbSelf }]} lang={lang} />
        <h1 className="mb-1 text-3xl font-semibold" style={{ color: "var(--ink-strong)" }}>{copy.glossary.title}</h1>
        <p className="mb-8" style={{ color: "var(--muted-foreground)" }}>
          {copy.glossary.subtitle(entries.length, variant.title)}
        </p>
        <GlossaryTargetHighlight />
        <div className="glossary-table">
          <table>
            <thead>
              <tr><th>{copy.glossary.thTerm}</th><th>{copy.glossary.thDef}</th><th>{copy.glossary.thSource}</th></tr>
            </thead>
            <tbody>
              {entries.map((e) => {
                const id = slugger.slug(e.term);
                const sh = glossarySourceRef(e.source ?? "", sources, variant.slug, (t) => new GithubSlugger().slug(t));
                return (
                  <tr key={id} id={id} className="glossary-row">
                    <td className="glossary-term-cell">
                      {e.term}
                    </td>
                    <td className="glossary-def-cell">{e.def}</td>
                    <td className="glossary-src-cell">
                      {sh.href
                        ? <a href={sh.href} {...(sh.external ? { rel: "noreferrer", target: "_blank" } : {})}>{sh.label}</a>
                        : <span>{sh.label}</span>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </main>
    </CoursePageShell>
  );
}
