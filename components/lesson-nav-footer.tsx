import Link from "next/link";
import { withLang, type Lang } from "@/lib/i18n";
import { siteCopy } from "@/lib/site-copy";

// Footer "continue reading" card pair: previous left, next right; placeholder when one side is missing. Not sticky.
const stripPrefix = (t: string) => t.replace(/^第\s*\d+\s*节\s*[:：]\s*/, "");

function NavCard({ href, kicker, title, align }: { href: string; kicker: string; title: string; align: "left" | "right" }) {
  return (
    <Link
      href={href}
      className="group flex min-w-0 flex-1 flex-col gap-1 rounded-[10px] border p-3.5 transition-[transform,border-color,background-color] duration-200 ease-[cubic-bezier(.2,.7,.2,1)] hover:-translate-y-[1px] hover:border-[var(--border-strong)] hover:bg-[var(--card-hover)] motion-reduce:transition-none motion-reduce:hover:translate-y-0"
      style={{ background: "var(--card)", borderColor: "var(--border)", textAlign: align }}
    >
      <span style={{ fontFamily: "var(--font-kicker), monospace", fontSize: 10.5, letterSpacing: ".1em", textTransform: "uppercase", color: "var(--ink-subtle)" }}>{kicker}</span>
      <span className="truncate" style={{ fontFamily: "var(--font-display)", fontSize: 15, fontWeight: 600, color: "var(--ink-strong)" }}>{title}</span>
    </Link>
  );
}

export function LessonNavFooter({ courseSlug, prev, next, lang }: { courseSlug: string; prev?: { slug: string; title: string }; next?: { slug: string; title: string }; lang: Lang }) {
  const copy = siteCopy[lang].reader.lessonNav;
  return (
    <nav className="mt-16 flex gap-4 border-t pt-6" style={{ borderColor: "var(--border)" }}>
      {prev ? <NavCard href={withLang(`/${courseSlug}/${prev.slug}`, lang)} kicker={copy.prev} title={stripPrefix(prev.title)} align="left" /> : <span className="flex-1" />}
      {next ? <NavCard href={withLang(`/${courseSlug}/${next.slug}`, lang)} kicker={copy.next} title={stripPrefix(next.title)} align="right" /> : <span className="flex-1" />}
    </nav>
  );
}
