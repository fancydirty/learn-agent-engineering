import type { Metadata } from "next";
import { notFound, permanentRedirect } from "next/navigation";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { Breadcrumbs } from "@/components/breadcrumbs";
import { CourseMarkdown } from "@/components/course-markdown";
import { CourseNav } from "@/components/course-nav";
import { CoursePageShell } from "@/components/course-page-shell";
import { ExerciseSection } from "@/components/exercise-section";
import { FootnotePreview } from "@/components/footnote-preview";
import { GlossaryEnhancer } from "@/components/glossary-enhancer";
import { HeadingAnchors } from "@/components/heading-anchors";
import { LessonActions } from "@/components/lesson-actions";
import { LessonNavFooter } from "@/components/lesson-nav-footer";
import { OnThisPage } from "@/components/on-this-page";
import { SelectionCopy } from "@/components/selection-copy";
import { findCourseFamily, findCourseVariant, scanCourseFamilies } from "@/lib/courses";
import { splitLesson, parseExercises } from "@/lib/exercises";
import { resolveFootnotes } from "@/lib/footnotes";
import { localePath, samePageLocaleLinks } from "@/lib/i18n";
import { lessonClipboardText } from "@/lib/lesson-clip";
import { lessonKicker } from "@/lib/lesson-kicker";
import { stripLessonNumberPrefix } from "@/lib/lesson-title";
import { loadGlossaryTerms } from "@/lib/glossary-load";
import { isLocale, siteCopyFor } from "@/lib/locales";
import { coursesDir } from "@/lib/paths";
import { tocFromMarkdown } from "@/lib/toc";

const SITE_URL = "https://learn.agentmentor.dev";

export function generateStaticParams() {
  return scanCourseFamilies(coursesDir()).flatMap((family) =>
    family.variants.flatMap((variant) =>
      variant.lessons.map((lesson) => ({ locale: variant.locale, course: family.slug, lesson: lesson.slug })),
    ),
  );
}

export async function generateMetadata({ params }: { params: Promise<{ locale: string; course: string; lesson: string }> }): Promise<Metadata> {
  const { locale, course, lesson } = await params;
  if (!isLocale(locale)) return {};
  const family = findCourseFamily(scanCourseFamilies(coursesDir()), course);
  const variant = family && findCourseVariant(family, locale);
  const current = variant?.lessons.find((item) => item.slug === lesson);
  if (!variant || !current) return {};
  return { title: `${stripLessonNumberPrefix(current.title)} · ${variant.title}`, description: variant.intro };
}

export default async function LessonPage({ params }: { params: Promise<{ locale: string; course: string; lesson: string }> }) {
  const { locale, course, lesson } = await params;
  if (!isLocale(locale)) notFound();
  const families = scanCourseFamilies(coursesDir());
  const family = findCourseFamily(families, course);
  if (!family) {
    const canonical = course.replace(/^learn-/, "");
    if (canonical !== course && findCourseFamily(families, canonical)) {
      permanentRedirect(localePath(locale, `/${canonical}/${lesson}`));
    }
    notFound();
  }
  const variant = findCourseVariant(family, locale);
  if (!variant) notFound();
  const index = variant.lessons.findIndex((item) => item.slug === lesson);
  if (index < 0) notFound();
  const copy = siteCopyFor(locale);
  const lang = variant.locale;

  const current = variant.lessons[index];
  const raw = readFileSync(join(variant.dir, current.file), "utf8");
  const sourcesPath = join(variant.dir, "sources.md");
  const sources = existsSync(sourcesPath) ? readFileSync(sourcesPath, "utf8") : "";
  const { before, exercisesMd } = splitLesson(raw);
  const lessonMarkdown = resolveFootnotes(before, sources);
  const exercises = exercisesMd ? parseExercises(exercisesMd) : [];
  const terms = loadGlossaryTerms(variant.dir);
  const lessonUrl = `${SITE_URL}${localePath(lang, `/${variant.slug}/${current.slug}`)}`;
  const context = {
    courseUrl: lessonUrl,
    courseTitle: variant.title,
    lessonFile: current.file,
    lessonTitle: current.title,
  };

  return (
    <CoursePageShell locale={lang} languageLinks={samePageLocaleLinks(family, { kind: "lesson", lesson: current.slug })}>
      <CourseNav course={variant} current={current.slug} />
      <main className="course-page-main min-w-0 flex-1">
        <div className="flex flex-wrap items-start justify-between gap-3 sm:gap-4">
          <Breadcrumbs
            items={[
              { label: copy.reader.breadcrumbCourses, href: localePath(lang, "/courses") },
              { label: variant.title, href: localePath(lang, `/${variant.slug}`) },
              { label: stripLessonNumberPrefix(current.title) },
            ]}
            lang={lang}
          />
          <LessonActions clip={lessonClipboardText(variant.title, current.title, lessonUrl, raw)} url={lessonUrl} title={current.title} lang={lang} />
        </div>
        <div className="lesson-kicker">{lessonKicker(variant.title, index, variant.lessons.length, lang)}</div>
        <CourseMarkdown md={lessonMarkdown} courseSlug={variant.slug} mentorActionContext={context} lang={lang} />
        {exercises.length ? (
          <ExerciseSection exercises={exercises} mentorActionContext={context} lang={lang} />
        ) : exercisesMd ? (
          <CourseMarkdown md={resolveFootnotes(exercisesMd, sources)} courseSlug={variant.slug} mentorActionContext={context} lang={lang} />
        ) : null}
        <LessonNavFooter courseSlug={variant.slug} prev={variant.lessons[index - 1]} next={variant.lessons[index + 1]} lang={lang} />
        <GlossaryEnhancer terms={terms} lang={lang} drill={{ ctx: context, lang }} />
        <SelectionCopy ctx={context} lang={lang} />
        <FootnotePreview />
        <HeadingAnchors lang={lang} />
      </main>
      <OnThisPage items={tocFromMarkdown(lessonMarkdown)} lang={lang} />
    </CoursePageShell>
  );
}
