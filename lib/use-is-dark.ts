"use client";
import { useEffect, useState } from "react";
import { normalizeTheme } from "@/lib/theme";

// Read whether <html data-theme> is dark; updates live on theme changes.
// Theme toggle only mutates data-theme + localStorage (no event), so watch with MutationObserver.
export function useIsDark(): boolean {
  const [isDark, setIsDark] = useState(false); // SSR/first paint defaults light to avoid hydration mismatch
  useEffect(() => {
    const root = document.documentElement;
    const read = () => setIsDark(normalizeTheme(root.dataset.theme) === "dark");
    read();
    const observer = new MutationObserver(read);
    observer.observe(root, { attributes: true, attributeFilter: ["data-theme"] });
    return () => observer.disconnect();
  }, []);
  return isDark;
}
