import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { CourseTile } from "@/components/course-tile";
import { SiteHeader } from "@/components/site-header";
import { scanCourseFamilies, toCardData, TIERS, type CourseVariant } from "@/lib/courses";
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

  // Group by ladder tier, ordered on-ramp → engineering. Within a rung, order by
  // reading order: each course declares `order` in its frontmatter, so the author
  // decides the path rather than an accident of length or slug.
  const rungs = TIERS.map((tier) => ({
    tier,
    courses: variants
      .filter((variant: CourseVariant) => variant.tier === tier)
      .sort((a, b) => a.order - b.order || a.slug.localeCompare(b.slug)),
  })).filter((rung) => rung.courses.length > 0);

  return (
    <>
      <SiteHeader locale={locale} languageLinks={coursesLocaleLinks()} />
      <main className="course-library">
        <section className="course-library-intro">
          <p className="course-library-kicker">AGENT MENTOR · OPEN COURSES</p>
          <h1 className="course-library-title">{copy.reader.library.title}</h1>
          <p className="course-library-lede">{copy.reader.library.intro}</p>
        </section>

        {rungs.length === 0 ? (
          <section className="course-library-empty">
            <h2>{copy.reader.library.emptyTitle}</h2>
            <p>{copy.reader.library.emptyBody}</p>
          </section>
        ) : (
          <div className="course-ladder">
            {rungs.map((rung) => {
              const tierCopy = copy.reader.tiers[rung.tier];
              return (
                <section key={rung.tier} className="course-rung" data-tier={rung.tier}>
                  <div className="course-rung-head">
                    <span className="course-rung-dot" aria-hidden="true" />
                    <h2 className="course-rung-label">{tierCopy.label}</h2>
                    <p className="course-rung-blurb">{tierCopy.blurb}</p>
                  </div>
                  <div className="course-rung-grid" data-count={rung.courses.length}>
                    {rung.courses.map((variant) => (
                      <CourseTile key={variant.slug} course={toCardData(variant)} lang={variant.locale} />
                    ))}
                  </div>
                </section>
              );
            })}
          </div>
        )}

        <aside className="course-library-cta">
          <div>
            <h2>{copy.reader.library.ctaTitle}</h2>
            <p>{copy.reader.library.ctaBody}</p>
          </div>
          <a href="https://agentmentor.dev/?utm_source=learn&utm_medium=library_cta&utm_campaign=open_courses">
            {copy.reader.library.ctaButton}
          </a>
        </aside>
      </main>
    </>
  );
}
