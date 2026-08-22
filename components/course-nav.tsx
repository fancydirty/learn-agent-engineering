import Link from "next/link";
import type { CourseVariant } from "@/lib/courses";
import { localePath } from "@/lib/i18n";
import { siteCopyFor } from "@/lib/locales";
import { stripLessonNumberPrefix } from "@/lib/lesson-title";

export function CourseNav({ course, current }: { course: CourseVariant; current: string | null }) {
  const copy = siteCopyFor(course.locale);
  return (
    <aside className="course-page-nav sticky hidden w-52 shrink-0 self-start py-12 lg:block xl:w-60">
      <Link href={localePath(course.locale, `/${course.slug}`)} style={{ display: "block", fontWeight: 600, color: "var(--ink-strong)", fontSize: 14, lineHeight: 1.35, marginBottom: 14 }}>
        {course.title}
      </Link>
      <div style={{ fontSize: 11, letterSpacing: ".05em", textTransform: "uppercase", color: "var(--ink-subtle)", margin: "0 0 6px 10px" }}>
        {copy.reader.courseNav.toc}
      </div>
      <ol style={{ listStyle: "none", margin: 0, padding: 0, fontSize: 13 }}>
        {course.lessons.map((l) => {
          const activeStyle = { background: "var(--accent-soft)", color: "var(--accent)", borderLeft: "2px solid var(--accent)", borderRadius: "0 var(--radius-sm) var(--radius-sm) 0" };
          const idleStyle = { color: "var(--muted-foreground)", borderLeft: "2px solid transparent" };
          return (
            <li key={l.slug}>
              <Link
                href={localePath(course.locale, `/${course.slug}/${l.slug}`)}
                style={{ display: "flex", gap: 8, alignItems: "baseline", padding: "6px 10px", textDecoration: "none", ...(l.slug === current ? activeStyle : idleStyle) }}
              >
                <span>{l.num}. {stripLessonNumberPrefix(l.title)}</span>
              </Link>
            </li>
          );
        })}
      </ol>
    </aside>
  );
}
