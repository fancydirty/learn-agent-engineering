import Link from "next/link";
import type { CourseVariant } from "@/lib/courses";
import { localePath } from "@/lib/i18n";
import { siteCopyFor, type Locale } from "@/lib/locales";

// Ledger rows: the library is a syllabus with a strict reading order, not a shop
// floor of equal cards. Row = order number · mark · title + one-line outcome ·
// length; the whole row is the link. Number and mark take the rung accent via
// --rung from the enclosing .course-rung.
export function CourseLedger({
  courses,
  lang,
  startSlug,
}: {
  courses: CourseVariant[];
  lang: Locale;
  startSlug?: string;
}) {
  const copy = siteCopyFor(lang).reader;
  return (
    <div className="course-ledger">
      {courses.map((course) => (
        <Link key={course.slug} href={localePath(lang, `/${course.slug}`)} className="course-ledger-row">
          <span className="course-ledger-no">{String(course.order).padStart(2, "0")}</span>
          {/* Same inline-logo rationale as the old tile: guard bans scripts and
              external refs inside logo.svg, so this content is ours and inert. */}
          <span className="course-ledger-mark" aria-hidden="true">
            {course.logoSvg ? (
              <span dangerouslySetInnerHTML={{ __html: course.logoSvg }} />
            ) : (
              <span className="course-ledger-mark-fallback" />
            )}
          </span>
          <span className="course-ledger-main">
            <span className="course-ledger-title">
              {course.title}
              {course.slug === startSlug ? <span className="course-ledger-chip">{copy.library.startHere}</span> : null}
            </span>
            <span className="course-ledger-outcome">{course.outcome}</span>
          </span>
          <span className="course-ledger-meta">
            {copy.card.lessons(course.lessons.length)} · {copy.card.minutes(course.minutes)}
          </span>
        </Link>
      ))}
    </div>
  );
}
