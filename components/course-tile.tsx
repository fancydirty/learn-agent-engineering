import Link from "next/link";
import type { CourseCardData } from "@/lib/courses";
import { domainColor } from "@/lib/domains";
import { localePath } from "@/lib/i18n";
import { siteCopyFor, type Locale } from "@/lib/locales";

export function CourseTile({ course, lang, href, lead = false }: { course: CourseCardData; lang: Locale; href?: string; lead?: boolean }) {
  const copy = siteCopyFor(lang).reader.card;
  const cat = domainColor(course.domain);

  return (
    <Link
      href={href ?? localePath(lang, `/${course.slug}`)}
      data-lead={lead || undefined}
      className="group relative flex min-h-[128px] flex-col rounded-xl border bg-[var(--card)] p-5 shadow-sm transition-colors hover:bg-[var(--card-hover)]"
      style={{ borderColor: "var(--border)", boxShadow: "var(--shadow-card)", ["--cat" as string]: cat }}
    >
      <span
        className="absolute right-4 top-3.5 text-xs text-[var(--ink-subtle)] transition-colors group-hover:text-[var(--ink)]"
        aria-hidden="true"
      >
        ↗
      </span>
      {/* Course emblem above a compact public-course summary. */}
      <span
        className="flex h-7 w-7 items-center justify-center rounded-md"
        style={{ background: "color-mix(in srgb, var(--cat) 15%, transparent)" }}
      >
        <span className="block h-1.5 w-1.5 rounded-full" style={{ background: "var(--cat)" }} />
      </span>
      <h2 className="mt-3.5 max-w-[24ch] text-[15.5px] font-semibold leading-snug text-[var(--ink-strong)]">
        {course.title}
      </h2>

      <div
        className="mt-auto flex items-baseline justify-between gap-2 pt-5 text-[11px] text-[var(--ink-subtle)]"
        style={{ fontFamily: "var(--font-kicker), monospace" }}
      >
        <span className="truncate">{course.slug}</span>
        <span className="flex-none">{copy.lessons(course.lessonCount)} · {copy.minutes(course.minutes)}</span>
      </div>
    </Link>
  );
}
