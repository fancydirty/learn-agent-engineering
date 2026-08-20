"use client";
import { useEffect } from "react";
import type { Lang } from "@/lib/i18n";
import { siteCopy } from "@/lib/site-copy";

// Hover anchor on h2/h3 with id: click copies section link. Mirrors GlossaryEnhancer (useEffect post-process + returns null).
export function HeadingAnchors({ lang }: { lang: Lang }) {
  const linkLabel = siteCopy[lang].reader.copy.link;
  useEffect(() => {
    const root = document.querySelector(".reading-prose");
    if (!root) return;
    const heads = Array.from(root.querySelectorAll<HTMLElement>("h2[id], h3[id]"));
    const created: HTMLButtonElement[] = [];
    heads.forEach((h) => {
      if (h.querySelector(".heading-anchor")) return;
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "heading-anchor";
      btn.textContent = "#";
      btn.setAttribute("aria-label", linkLabel);
      let timer = 0;
      btn.addEventListener("click", (e) => {
        e.preventDefault();
        const url = `${location.origin}${location.pathname}#${h.id}`;
        navigator.clipboard.writeText(url).then(() => {
          btn.textContent = "✓";
          btn.classList.add("is-copied");
          window.clearTimeout(timer);
          timer = window.setTimeout(() => { btn.textContent = "#"; btn.classList.remove("is-copied"); }, 1400);
        }).catch(() => {});
      });
      h.appendChild(btn);
      created.push(btn);
    });
    return () => { created.forEach((b) => b.remove()); };
  }, [linkLabel]);
  return null;
}
