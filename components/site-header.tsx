"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { StickyHeader } from "./sticky-header";
import { ThemeToggle } from "./theme-toggle";
import type { Lang } from "@/lib/i18n";

export function SiteHeader({ courseLanguages }: { courseLanguages: Record<string, Lang> }) {
  const pathname = usePathname();
  const courseSlug = pathname.split("/").filter(Boolean)[0] ?? "";
  const lang = courseLanguages[courseSlug] ?? "zh";

  return (
    <StickyHeader>
      <header
        className="relative flex max-w-full min-w-0 items-center gap-3 px-4 py-3 md:gap-5 md:px-6"
        style={{
          height: "var(--sticky-header-height)",
          boxSizing: "border-box",
          background: "var(--nav-glass)",
          borderBottom: "1px solid var(--border)",
          backdropFilter: "blur(var(--nav-blur))",
          WebkitBackdropFilter: "blur(var(--nav-blur))",
        }}
      >
        <Link href="/courses" className="font-semibold tracking-tight" style={{ color: "var(--ink-strong)" }}>
          Agent Mentor Learn
        </Link>
        <span
          className="hidden text-xs sm:inline"
          style={{ color: "var(--ink-subtle)", fontFamily: "var(--font-kicker), monospace" }}
        >
          {lang === "zh" ? "当前 Agent 课程" : "Current Agent courses"}
        </span>
        <div className="flex-1" />
        <a
          href="https://agentmentor.dev/?utm_source=learn&utm_medium=header&utm_campaign=open_courses"
          className="text-sm hover:underline"
          style={{ color: "var(--accent)" }}
        >
          {lang === "zh" ? "Agent Mentor 官网 ↗" : "Agent Mentor ↗"}
        </a>
        <ThemeToggle lang={lang} />
      </header>
    </StickyHeader>
  );
}
