import Link from "next/link";
import type { Locale } from "@/lib/locales";
import { siteCopyFor } from "@/lib/locales";

export interface Crumb { label: string; href?: string }

// Hrefs arrive already locale-prefixed from the page; the component only renders.
export function Breadcrumbs({ items, lang }: { items: Crumb[]; lang: Locale }) {
  return (
    <nav aria-label={siteCopyFor(lang).a11y.breadcrumb} style={{ fontSize: 12, marginBottom: 14 }}>
      <ol style={{ listStyle: "none", display: "flex", flexWrap: "wrap", margin: 0, padding: 0 }}>
        {items.map((it, i) => (
          <li key={i} style={{ display: "flex", alignItems: "center", minWidth: 0 }}>
            {i > 0 && <span aria-hidden="true" style={{ margin: "0 7px", color: "var(--border-strong)" }}>›</span>}
            {it.href ? (
              <Link href={it.href} style={{ color: "var(--ink-subtle)", textDecoration: "none", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 240 }}>{it.label}</Link>
            ) : (
              <span aria-current="page" style={{ color: "var(--muted-foreground)", fontWeight: 600 }}>{it.label}</span>
            )}
          </li>
        ))}
      </ol>
    </nav>
  );
}
