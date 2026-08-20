import { notFound } from "next/navigation";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import GithubSlugger from "github-slugger";
import { scanCourses } from "@/lib/courses";
import { coursesDir } from "@/lib/paths";
import { parseSources } from "@/lib/footnotes";
import { glossarySourceRef } from "@/lib/glossary-source";
import { loadGlossaryTerms } from "@/lib/glossary-load";
import { CourseNav } from "@/components/course-nav";
import { Breadcrumbs } from "@/components/breadcrumbs";
import { GlossaryTargetHighlight } from "@/components/glossary-target-highlight";
import { CoursePageShell } from "@/components/course-page-shell";
import { siteCopy } from "@/lib/site-copy";

export function generateStaticParams() {
  return scanCourses(coursesDir()).map((c) => ({ course: c.slug }));
}

export default async function GlossaryPage({
  params,
}: {
  params: Promise<{ course: string }>;
}) {
  const { course } = await params;
  const c = scanCourses(coursesDir()).find((x) => x.slug === course);
  if (!c) notFound();
  const lang = c.lang;
  const copy = siteCopy[lang].reader.glossary;
  const entries = loadGlossaryTerms(c.dir);
  if (entries.length === 0) notFound();

  const slugger = new GithubSlugger();
  const sourcesMd = existsSync(join(c.dir, "sources.md")) ? readFileSync(join(c.dir, "sources.md"), "utf8") : "";
  const sources = parseSources(sourcesMd);
  return (
    <CoursePageShell>
      <CourseNav course={c} current={null} lang={lang} />
      <main className="course-page-main min-w-0 flex-1">
        <Breadcrumbs items={[{ label: copy.breadcrumbLibrary, href: "/courses" }, { label: c.title, href: `/${c.slug}` }, { label: copy.breadcrumbSelf }]} lang={lang} />
        <h1 className="mb-1 text-3xl font-semibold" style={{ color: "var(--ink-strong)" }}>{copy.title}</h1>
        <p className="mb-8" style={{ color: "var(--muted-foreground)" }}>
          {copy.subtitle(entries.length, c.title)}
        </p>
        <GlossaryTargetHighlight />
        <div className="glossary-table">
          <table>
            <thead>
              <tr><th>{copy.thTerm}</th><th>{copy.thDef}</th><th>{copy.thSource}</th></tr>
            </thead>
            <tbody>
              {entries.map((e) => {
                const id = slugger.slug(e.term);
                const sh = glossarySourceRef(e.source ?? "", sources, c.slug, (t) => new GithubSlugger().slug(t));
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
