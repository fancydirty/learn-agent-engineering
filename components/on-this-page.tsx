"use client";
import { useEffect, useState } from "react";
import type { TocItem } from "@/lib/toc";
import type { Lang } from "@/lib/i18n";
import { siteCopyFor } from "@/lib/locales";

// Scroll-spy: pick the last heading whose top has crossed a top band.
// IntersectionObserver with a narrow rootMargin fails when lesson blocks
// Large interactive blocks can leave gaps between headings — nothing intersects.
export function OnThisPage({ items, lang }: { items: TocItem[]; lang: Lang }) {
  const [active, setActive] = useState<string>("");

  useEffect(() => {
    if (items.length < 2) return;
    const els = items
      .map((item) => document.getElementById(item.id))
      .filter((el): el is HTMLElement => Boolean(el));
    if (!els.length) return;

    const sync = () => {
      const marker = 96; // below sticky header
      let current = els[0]?.id ?? "";
      for (const el of els) {
        if (el.getBoundingClientRect().top <= marker) current = el.id;
        else break;
      }
      setActive((prev) => (prev === current ? prev : current));
    };

    sync();
    window.addEventListener("scroll", sync, { passive: true });
    window.addEventListener("resize", sync);
    return () => {
      window.removeEventListener("scroll", sync);
      window.removeEventListener("resize", sync);
    };
  }, [items]);

  if (!items.length) return null;
  const label = siteCopyFor(lang).reader.onThisPage;
  return (
    <aside className="sticky top-24 hidden h-fit w-44 shrink-0 lg:block xl:w-48" data-on-this-page="" aria-label={label}>
      <div style={{ fontSize: 11, letterSpacing: ".05em", textTransform: "uppercase", color: "var(--ink-subtle)", marginBottom: 8 }}>
        {label}
      </div>
      <ul style={{ listStyle: "none", margin: 0, padding: 0, fontSize: 13, lineHeight: 1.5 }}>
        {items.map((it) => (
          <li key={it.id} style={{ paddingLeft: it.depth === 3 ? 12 : 0 }}>
            <a
              href={`#${it.id}`}
              data-active={active === it.id ? "true" : undefined}
              style={{
                display: "block",
                padding: "3px 0 3px 10px",
                borderLeft: `2px solid ${active === it.id ? "var(--accent)" : "var(--border)"}`,
                color: active === it.id ? "var(--accent)" : "var(--ink-subtle)",
                textDecoration: "none",
                transition: "border-color .18s cubic-bezier(.2,.7,.2,1), color .18s cubic-bezier(.2,.7,.2,1)",
              }}
            >
              {it.text}
            </a>
          </li>
        ))}
      </ul>
    </aside>
  );
}
