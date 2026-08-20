"use client";
import { useEffect } from "react";

// Footnote superscript hover card: reads note text from bottom [data-footnotes] li, pops a local card, avoids jumping to page footer. Mirrors GlossaryEnhancer.
export function FootnotePreview() {
  useEffect(() => {
    const root = document.querySelector(".reading-prose");
    if (!root) return;

    const defs = new Map<string, string>();
    root.querySelectorAll("[data-footnotes] ol li").forEach((li) => {
      const id = li.id;
      if (!id) return;
      const clone = li.cloneNode(true) as HTMLElement;
      clone.querySelectorAll("a[data-footnote-backref], a.data-footnote-backref").forEach((a) => a.remove());
      defs.set(id, (clone.textContent || "").trim());
    });
    if (!defs.size) return;

    let tip = document.getElementById("footnote-tip") as HTMLDivElement | null;
    if (!tip) {
      tip = document.createElement("div");
      tip.id = "footnote-tip";
      tip.style.cssText =
        "position:fixed;z-index:50;max-width:300px;padding:10px 12px;font-size:13px;line-height:1.5;background:var(--card);color:var(--foreground);border:0.5px solid var(--border);border-radius:var(--radius-md);box-shadow:var(--shadow-card);pointer-events:none;opacity:0;transition:opacity .12s;";
      document.body.appendChild(tip);
    }
    const show = (ref: HTMLElement) => {
      const href = ref.getAttribute("href") || "";
      const id = href.startsWith("#") ? href.slice(1) : "";
      const def = defs.get(id);
      if (!def) return;
      tip!.textContent = def;
      const r = ref.getBoundingClientRect();
      tip!.style.opacity = "1";
      tip!.style.top = `${r.bottom + 6}px`;
      tip!.style.left = `${Math.max(8, Math.min(r.left, window.innerWidth - 316))}px`;
    };
    const hide = () => { if (tip) tip.style.opacity = "0"; };

    const refs = Array.from(root.querySelectorAll<HTMLElement>("a[data-footnote-ref]"));
    refs.forEach((ref) => {
      ref.addEventListener("mouseenter", () => show(ref));
      ref.addEventListener("focus", () => show(ref));
      ref.addEventListener("mouseleave", hide);
      ref.addEventListener("blur", hide);
    });
    return () => hide();
  }, []);
  return null;
}
