import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import { parseFrontmatter } from "./frontmatter";
import { estimateMinutes } from "./reading-time";
import type { Lang } from "./i18n";

export interface LessonMeta { num: number; slug: string; title: string; file: string; }
export interface Course { slug: string; title: string; intro: string; dir: string; lessons: LessonMeta[]; domain: string; tags: string[]; minutes: number; lang: Lang; hasLogo: boolean; }
// dir is the on-disk course directory absolute path used during static generation.
export interface CourseCardData { slug: string; title: string; intro: string; domain: string; tags: string[]; lessonCount: number; minutes: number; hasLogo: boolean; }

export function stripInlineMarkdown(s: string): string {
  // Inline code is lifted into placeholders FIRST so its literal content — e.g. a
  // regex class like `[^a-z]` — can't be mistaken for a footnote marker `[^Sn]`
  // by the footnote-removal pass below. Without this guard, the backtick strip ran
  // before the footnote strip and `[^a-z]` in a code span vanished whole.
  const code: string[] = [];
  return s
    .replace(/`([^`]+)`/g, (_m, inner) => {
      code.push(inner);
      return `\u0000${code.length - 1}\u0000`;
    })
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/(\*\*|__)(.*?)\1/g, "$2")
    .replace(/(\*|_)(.*?)\1/g, "$2")
    .replace(/\[\^[^\]]+\]/g, "")
    .replace(/^#+\s*/, "")
    .replace(/\u0000(\d+)\u0000/g, (_m, i) => code[Number(i)])
    .trim();
}

// Keep the fallback stable for courses created before domain frontmatter was required.
// Both data paths share one fallback — don't duplicate.
export const DOMAIN_FALLBACK = "其他";

// h1/first-paragraph derivation is pure logic; public courses (worker bundle, no disk) must use the same copy:
// Course-card intros must stay plain text even when README copy uses inline Markdown.
export function courseH1(md: string): string | null {
  const m = md.match(/^#\s+(.+?)\s*$/m);
  return m ? m[1].trim() : null;
}
export function courseIntro(md: string): string {
  const body = md.replace(/^#.*$/m, "").trim();
  const p = body.split(/\n\s*\n/).find((s) => s.trim() && !s.trim().startsWith("|") && !s.trim().startsWith("#"));
  return stripInlineMarkdown((p || "").replace(/\n/g, " "));
}

export function parseCourse(coursesRoot: string, dirName: string): Course {
  const dir = join(coursesRoot, dirName);
  const slug = dirName.replace(/^learn-/, "");
  const readmePath = join(dir, "README.md");
  const readmeRaw = existsSync(readmePath) ? readFileSync(readmePath, "utf8") : "";
  const { data: fm, body: readme } = parseFrontmatter(readmeRaw);
  const lessonTexts: string[] = [];
  // .live.md is buyer BYOK sediment appendix per lesson (spec 2026-07-19 §二 L2), not a lesson file:
  // without excluding it, 01-x.live.md collides with 01-x.md at the same lesson number.
  const lessons: LessonMeta[] = readdirSync(dir)
    .filter((f) => /^\d+-.*\.md$/.test(f) && !f.endsWith(".live.md"))
    .map((f) => {
      const md = readFileSync(join(dir, f), "utf8");
      lessonTexts.push(md);
      return { num: parseInt(f, 10), slug: f.replace(/\.md$/, ""), title: (courseH1(md) || f).replace(/^#\s*/, ""), file: f };
    })
    .sort((a, b) => a.num - b.num);
  return {
    slug,
    title: courseH1(readme) || slug,
    intro: courseIntro(readme),
    dir,
    lessons,
    domain: fm.domain || DOMAIN_FALLBACK,
    tags: fm.tags || [],
    minutes: estimateMinutes(lessonTexts),
    lang: fm.lang === "en" ? "en" : "zh",
    hasLogo: existsSync(join(dir, "logo.svg")),
  };
}

export function scanCourses(coursesRoot: string): Course[] {
  if (!existsSync(coursesRoot)) return [];
  return readdirSync(coursesRoot)
    .filter((d) => d.startsWith("learn-") && existsSync(join(coursesRoot, d)))
    .map((d) => parseCourse(coursesRoot, d))
    .filter((c) => c.lessons.length > 0)
    .sort((a, b) => a.slug.localeCompare(b.slug));
}

export function toCardData(c: Course): CourseCardData {
  return { slug: c.slug, title: c.title, intro: c.intro, domain: c.domain, tags: c.tags, lessonCount: c.lessons.length, minutes: c.minutes, hasLogo: c.hasLogo };
}
