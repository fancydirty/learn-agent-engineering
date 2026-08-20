import type { Metadata } from "next";
import { notFound } from "next/navigation";
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
import { scanCourses } from "@/lib/courses";
import { splitLesson, parseExercises } from "@/lib/exercises";
import { resolveFootnotes } from "@/lib/footnotes";
import { lessonClipboardText } from "@/lib/lesson-clip";
import { lessonKicker } from "@/lib/lesson-kicker";
import { stripLessonNumberPrefix } from "@/lib/lesson-title";
import { loadGlossaryTerms } from "@/lib/glossary-load";
import { coursesDir } from "@/lib/paths";
import { tocFromMarkdown } from "@/lib/toc";

const SITE_URL = "https://learn.agentmentor.dev";

export function generateStaticParams() {
  return scanCourses(coursesDir()).flatMap((course) =>
    course.lessons.map((lesson) => ({ course: course.slug, lesson: lesson.slug })),
  );
}

export async function generateMetadata({ params }: { params: Promise<{ course: string; lesson: string }> }): Promise<Metadata> {
  const { course, lesson } = await params;
  const found = scanCourses(coursesDir()).find((item) => item.slug === course);
  const current = found?.lessons.find((item) => item.slug === lesson);
  if (!found || !current) return {};
  return { title: `${stripLessonNumberPrefix(current.title)} · ${found.title}`, description: found.intro };
}

export default async function LessonPage({ params }: { params: Promise<{ course: string; lesson: string }> }) {
  const { course, lesson } = await params;
  const found = scanCourses(coursesDir()).find((item) => item.slug === course);
  if (!found) notFound();
  const index = found.lessons.findIndex((item) => item.slug === lesson);
  if (index < 0) notFound();

  const current = found.lessons[index];
  const raw = readFileSync(join(found.dir, current.file), "utf8");
  const sourcesPath = join(found.dir, "sources.md");
  const sources = existsSync(sourcesPath) ? readFileSync(sourcesPath, "utf8") : "";
  const { before, exercisesMd } = splitLesson(raw);
  const lessonMarkdown = resolveFootnotes(before, sources);
  const exercises = exercisesMd ? parseExercises(exercisesMd) : [];
  const terms = loadGlossaryTerms(found.dir);
  const lessonUrl = `${SITE_URL}/${found.slug}/${current.slug}`;
  const context = {
    courseUrl: lessonUrl,
    courseTitle: found.title,
    lessonFile: current.file,
    lessonTitle: current.title,
  };

  return (
    <CoursePageShell>
      <CourseNav course={found} current={current.slug} lang={found.lang} />
      <main className="course-page-main min-w-0 flex-1">
        <div className="flex flex-wrap items-start justify-between gap-3 sm:gap-4">
          <Breadcrumbs
            items={[
              { label: found.lang === "zh" ? "课程" : "Courses", href: "/courses" },
              { label: found.title, href: `/${found.slug}` },
              { label: stripLessonNumberPrefix(current.title) },
            ]}
            lang={found.lang}
          />
          <LessonActions clip={lessonClipboardText(found.title, current.title, lessonUrl, raw)} url={lessonUrl} title={current.title} lang={found.lang} />
        </div>
        <div className="lesson-kicker">{lessonKicker(found.title, index, found.lessons.length, found.lang)}</div>
        <CourseMarkdown md={lessonMarkdown} courseSlug={found.slug} mentorActionContext={context} lang={found.lang} />
        {exercises.length ? (
          <ExerciseSection exercises={exercises} mentorActionContext={context} lang={found.lang} />
        ) : exercisesMd ? (
          <CourseMarkdown md={resolveFootnotes(exercisesMd, sources)} courseSlug={found.slug} mentorActionContext={context} lang={found.lang} />
        ) : null}
        <LessonNavFooter courseSlug={found.slug} prev={found.lessons[index - 1]} next={found.lessons[index + 1]} lang={found.lang} />
        <GlossaryEnhancer terms={terms} lang={found.lang} drill={{ ctx: context, lang: found.lang }} />
        <SelectionCopy ctx={context} lang={found.lang} />
        <FootnotePreview />
        <HeadingAnchors lang={found.lang} />
      </main>
      <OnThisPage items={tocFromMarkdown(lessonMarkdown)} lang={found.lang} />
    </CoursePageShell>
  );
}
