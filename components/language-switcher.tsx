"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import type { LocaleLink } from "@/lib/i18n";
import { localeInfo, type Locale } from "@/lib/locales";

// Same-page language switcher. The server supplies links only for locales whose
// variant really has this exact page, so the menu never silently lands readers
// on a different page. The current locale renders as a selected non-link row.
export function LanguageSwitcher({
  links,
  current,
  ariaLabel,
}: {
  links: LocaleLink[];
  current: Locale;
  ariaLabel: string;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const pendingFocus = useRef(false);
  const info = localeInfo(current);

  // Guarantee the current locale shows as the selected row even if the caller
  // forgot to include it in links.
  const rows = links.some((link) => link.locale === current)
    ? links
    : [{ locale: current, label: info.label, href: "" }, ...links];

  const menuLinks = (): HTMLElement[] =>
    Array.from(rootRef.current?.querySelectorAll<HTMLElement>('a[role="menuitem"]') ?? []);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, [open]);

  useEffect(() => {
    if (open && pendingFocus.current) {
      pendingFocus.current = false;
      menuLinks()[0]?.focus();
    }
  }, [open]);

  const move = (delta: number) => {
    const items = menuLinks();
    if (!items.length) return;
    const index = items.findIndex((el) => el === document.activeElement);
    const next = index === -1 ? (delta > 0 ? 0 : items.length - 1) : (index + delta + items.length) % items.length;
    items[next].focus();
  };

  const onKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === "Escape") {
      setOpen(false);
      buttonRef.current?.focus();
      return;
    }
    if (!open && event.key === "ArrowDown") {
      event.preventDefault();
      pendingFocus.current = true;
      setOpen(true);
      return;
    }
    if (open && (event.key === "ArrowDown" || event.key === "ArrowUp")) {
      event.preventDefault();
      move(event.key === "ArrowDown" ? 1 : -1);
    }
  };

  return (
    <div ref={rootRef} className="relative" onKeyDown={onKeyDown}>
      <button
        ref={buttonRef}
        type="button"
        aria-label={`${ariaLabel}: ${info.label}`}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
        className="flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-sm transition-colors hover:bg-[var(--card-hover)]"
        style={{ borderColor: "var(--border)", color: "var(--ink-strong)", background: "var(--card)" }}
      >
        <span>{info.label}</span>
        <svg
          width="12"
          height="12"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
          style={{ transform: open ? "rotate(180deg)" : undefined, transition: "transform .15s ease" }}
        >
          <path d="m6 9 6 6 6-6" />
        </svg>
      </button>
      {open ? (
        <div
          role="menu"
          aria-label={ariaLabel}
          className="absolute right-0 top-full z-50 mt-2 min-w-[10rem] overflow-hidden rounded-lg border py-1"
          style={{ borderColor: "var(--border)", background: "var(--card)", boxShadow: "var(--shadow-card)" }}
        >
          {rows.map((row) =>
            row.locale === current ? (
              <span
                key={row.locale}
                role="menuitem"
                aria-current="page"
                className="flex items-center justify-between gap-3 px-3 py-1.5 text-sm"
                style={{ color: "var(--accent)", fontWeight: 600 }}
              >
                {row.label}
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M20 6 9 17l-5-5" />
                </svg>
              </span>
            ) : (
              <Link
                key={row.locale}
                role="menuitem"
                href={row.href}
                onClick={() => setOpen(false)}
                className="block px-3 py-1.5 text-sm transition-colors hover:bg-[var(--card-hover)]"
                style={{ color: "var(--ink-strong)", textDecoration: "none" }}
              >
                {row.label}
              </Link>
            ),
          )}
        </div>
      ) : null}
    </div>
  );
}
