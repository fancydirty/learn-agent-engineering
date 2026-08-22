import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { CourseTile } from "@/components/course-tile";
import { SiteHeader } from "@/components/site-header";
import { scanCourseFamilies, toCardData } from "@/lib/courses";
import { groupCoursesByDomain } from "@/lib/domains";
import { coursesLocaleLinks } from "@/lib/i18n";
import { isLocale, LOCALES, siteCopyFor } from "@/lib/locales";
import { coursesDir } from "@/lib/paths";
import { libraryAlternates } from "@/lib/seo";

export function generateStaticParams() {
  return LOCALES.map((info) => ({ locale: info.code }));
}

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  if (!isLocale(locale)) return {};
  const copy = siteCopyFor(locale).reader.library;
  return { title: copy.title, description: copy.intro, alternates: libraryAlternates(locale) };
}

export default async function CoursesPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const copy = siteCopyFor(locale);
  const families = scanCourseFamilies(coursesDir());
  const variants = families.flatMap((family) => family.variants.filter((variant) => variant.locale === locale));
  const groups = groupCoursesByDomain(variants);

  return (
    <>
      <SiteHeader locale={locale} languageLinks={coursesLocaleLinks()} />
      <main className="mx-auto w-full max-w-5xl px-6 py-14 sm:py-20">
      <section className="mb-14 max-w-3xl">
        <p className="mb-4 text-xs font-medium tracking-[0.18em]" style={{ color: "var(--accent)", fontFamily: "var(--font-kicker), monospace" }}>
          AGENT MENTOR · OPEN COURSES
        </p>
        <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl" style={{ color: "var(--ink-strong)" }}>
          {copy.reader.library.title}
        </h1>
        <p className="mt-5 max-w-2xl text-base leading-8" style={{ color: "var(--muted-foreground)" }}>
          {copy.reader.library.intro}
        </p>
      </section>

      {variants.length === 0 ? (
        <section className="rounded-xl border p-6" style={{ borderColor: "var(--border)", background: "var(--card)" }}>
          <h2 className="font-semibold" style={{ color: "var(--ink-strong)" }}>{copy.reader.library.emptyTitle}</h2>
          <p className="mt-2 text-sm" style={{ color: "var(--muted-foreground)" }}>{copy.reader.library.emptyBody}</p>
        </section>
      ) : (
        <div className="space-y-12">
          {groups.map((group) => (
            <section key={group.domain}>
              <div className="mb-4 flex items-baseline gap-3">
                <h2 className="text-sm font-semibold" style={{ color: "var(--ink-strong)" }}>{group.domain}</h2>
                <span className="text-xs" style={{ color: "var(--ink-subtle)" }}>{copy.reader.library.courseCount(group.courses.length)}</span>
                <span className="h-px flex-1" style={{ background: "var(--border)" }} />
              </div>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {group.courses.map((variant) => (
                  <CourseTile key={variant.slug} course={toCardData(variant)} lang={variant.locale} />
                ))}
              </div>
            </section>
          ))}
        </div>
      )}

      <aside className="mt-16 flex flex-col gap-4 rounded-xl border p-6 sm:flex-row sm:items-center sm:justify-between" style={{ borderColor: "var(--border)", background: "var(--card)" }}>
        <div>
          <h2 className="font-semibold" style={{ color: "var(--ink-strong)" }}>{copy.reader.library.ctaTitle}</h2>
          <p className="mt-1 text-sm" style={{ color: "var(--muted-foreground)" }}>{copy.reader.library.ctaBody}</p>
        </div>
        <a
          href="https://agentmentor.dev/?utm_source=learn&utm_medium=library_cta&utm_campaign=open_courses"
          className="inline-flex shrink-0 items-center justify-center rounded-lg px-4 py-2 text-sm font-medium"
          style={{ background: "var(--accent)", color: "var(--on-accent)" }}
        >
          {copy.reader.library.ctaButton}
        </a>
      </aside>
      </main>
    </>
  );
}
