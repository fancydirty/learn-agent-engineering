import Link from "next/link";
import type { CourseCardData } from "@/lib/courses";
import { localePath } from "@/lib/i18n";
import { siteCopyFor, type Locale } from "@/lib/locales";

// Per-tier accent. The mark inherits it via currentColor, so a course reads as
// belonging to its rung before the title is read.
const TIER_ACCENT: Record<number, string> = {
  1: "var(--tier-1)",
  2: "var(--tier-2)",
  3: "var(--tier-3)",
};

export function CourseTile({
  course,
  lang,
  href,
  lead = false,
}: {
  course: CourseCardData;
  lang: Locale;
  href?: string;
  lead?: boolean;
}) {
  const copy = siteCopyFor(lang).reader.card;
  const accent = TIER_ACCENT[course.tier] ?? TIER_ACCENT[2];

  return (
    <Link
      href={href ?? localePath(lang, `/${course.slug}`)}
      data-lead={lead || undefined}
      className="course-tile group"
      style={{ ["--cat" as string]: accent }}
    >
      <span className="course-tile-arrow" aria-hidden="true">↗</span>

      {/* Hand-drawn per-course mark, inlined so it follows currentColor and the
          active theme. course-guard bans scripts, handlers, and external refs
          inside logo.svg, so this content is ours and inert. */}
      <span className="course-tile-mark" style={{ color: accent }} aria-hidden="true">
        {course.logoSvg ? (
          <span dangerouslySetInnerHTML={{ __html: course.logoSvg }} />
        ) : (
          <span className="course-tile-mark-fallback" />
        )}
      </span>

      <h3 className="course-tile-title">{course.title}</h3>

      {course.outcome ? <p className="course-tile-outcome">{course.outcome}</p> : null}

      <div className="course-tile-meta">
        <span>{copy.lessons(course.lessonCount)}</span>
        <span aria-hidden="true">·</span>
        <span>{copy.minutes(course.minutes)}</span>
      </div>
    </Link>
  );
}
