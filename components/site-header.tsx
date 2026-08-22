import Link from "next/link";
import { StickyHeader } from "./sticky-header";
import { ThemeToggle } from "./theme-toggle";
import { localePath } from "@/lib/i18n";
import { siteCopyFor, type Locale } from "@/lib/locales";

export function SiteHeader({ locale }: { locale: Locale }) {
  const copy = siteCopyFor(locale);

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
        <Link href={localePath(locale, "/courses")} className="font-semibold tracking-tight" style={{ color: "var(--ink-strong)" }}>
          Agent Mentor Learn
        </Link>
        <div className="flex-1" />
        <a
          href="https://agentmentor.dev/?utm_source=learn&utm_medium=header&utm_campaign=open_courses"
          className="text-sm hover:underline"
          style={{ color: "var(--accent)" }}
        >
          {copy.header.siteLink}
        </a>
        <ThemeToggle lang={locale} />
      </header>
    </StickyHeader>
  );
}
