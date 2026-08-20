import type { Metadata } from "next";
import { CourseTile } from "@/components/course-tile";
import { scanCourses, toCardData } from "@/lib/courses";
import { groupCoursesByDomain } from "@/lib/domains";
import { coursesDir } from "@/lib/paths";

export const metadata: Metadata = {
  title: "Agent 热点课程",
  description: "只讲 Agent 的开源课程：跟进新模型、新工具、新工作流，并把课程上下文直接交给你的 Agent。",
};

export default function CoursesPage() {
  const courses = scanCourses(coursesDir());
  const groups = groupCoursesByDomain(courses);

  return (
    <main className="mx-auto w-full max-w-5xl px-6 py-14 sm:py-20">
      <section className="mb-14 max-w-3xl">
        <p className="mb-4 text-xs font-medium tracking-[0.18em]" style={{ color: "var(--accent)", fontFamily: "var(--font-kicker), monospace" }}>
          AGENT MENTOR · OPEN COURSES
        </p>
        <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl" style={{ color: "var(--ink-strong)" }}>
          把正在发生的 Agent 变化，讲成能立刻上手的课。
        </h1>
        <p className="mt-5 max-w-2xl text-base leading-8" style={{ color: "var(--muted-foreground)" }}>
          这里只收录与 Agent 直接相关、仍在快速变化的选题。课程免费阅读，练习、代码和选中文本都能一键复制给 Claude Code、Codex 或其他 Agent 继续做。
        </p>
      </section>

      {courses.length === 0 ? (
        <section className="rounded-xl border p-6" style={{ borderColor: "var(--border)", background: "var(--card)" }}>
          <h2 className="font-semibold" style={{ color: "var(--ink-strong)" }}>首门课程正在生成</h2>
          <p className="mt-2 text-sm" style={{ color: "var(--muted-foreground)" }}>课程必须通过来源、互动与 Agent 相关性检查后才会出现在这里。</p>
        </section>
      ) : (
        <div className="space-y-12">
          {groups.map((group) => (
            <section key={group.domain}>
              <div className="mb-4 flex items-baseline gap-3">
                <h2 className="text-sm font-semibold" style={{ color: "var(--ink-strong)" }}>{group.domain}</h2>
                <span className="text-xs" style={{ color: "var(--ink-subtle)" }}>{group.courses.length} 门课</span>
                <span className="h-px flex-1" style={{ background: "var(--border)" }} />
              </div>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {group.courses.map((course) => (
                  <CourseTile key={course.slug} course={toCardData(course)} lang={course.lang} />
                ))}
              </div>
            </section>
          ))}
        </div>
      )}

      <aside className="mt-16 flex flex-col gap-4 rounded-xl border p-6 sm:flex-row sm:items-center sm:justify-between" style={{ borderColor: "var(--border)", background: "var(--card)" }}>
        <div>
          <h2 className="font-semibold" style={{ color: "var(--ink-strong)" }}>想让 Agent 为你的目标定制一门课？</h2>
          <p className="mt-1 text-sm" style={{ color: "var(--muted-foreground)" }}>Agent Mentor 把课程、练习与来源保存到本地，交给你自己的 Agent 使用。</p>
        </div>
        <a
          href="https://agentmentor.dev/?utm_source=learn&utm_medium=library_cta&utm_campaign=open_courses"
          className="inline-flex shrink-0 items-center justify-center rounded-lg px-4 py-2 text-sm font-medium"
          style={{ background: "var(--accent)", color: "var(--on-accent)" }}
        >
          了解 Agent Mentor ↗
        </a>
      </aside>
    </main>
  );
}
