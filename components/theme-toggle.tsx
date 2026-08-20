"use client";
import { useEffect, useState } from "react";
import { nextTheme, normalizeTheme, type Theme } from "@/lib/theme";
import type { Lang } from "@/lib/i18n";

// Always paint a button. Reading the real theme happens after mount so SSR HTML
// matches the first client render (both default to the light-mode moon icon).
export function ThemeToggle({ lang = "zh" }: { lang?: Lang }) {
  const [theme, setTheme] = useState<Theme>("light");

  useEffect(() => {
    setTheme(normalizeTheme(document.documentElement.dataset.theme) ?? "light");
  }, []);

  const goingDark = theme === "light";
  const toggle = () => {
    const next = nextTheme(theme);
    document.documentElement.setAttribute("data-theme", next);
    try { localStorage.setItem("theme", next); } catch {}
    setTheme(next);
  };

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={
        lang === "zh"
          ? goingDark ? "切换到深色模式" : "切换到浅色模式"
          : goingDark ? "Switch to dark mode" : "Switch to light mode"
      }
      data-theme-toggle=""
      className="flex h-9 w-9 shrink-0 cursor-pointer items-center justify-center rounded-full border transition-colors motion-reduce:transition-none hover:bg-[var(--card-hover)]"
      style={{ background: "var(--card)", borderColor: "var(--border)", color: "var(--ink-strong)", boxShadow: "var(--shadow-card)" }}
    >
      {goingDark ? (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" />
        </svg>
      ) : (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <circle cx="12" cy="12" r="4" />
          <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
        </svg>
      )}
    </button>
  );
}
