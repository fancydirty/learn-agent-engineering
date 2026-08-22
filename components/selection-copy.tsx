"use client";

import { useEffect } from "react";
import type { Lang } from "@/lib/i18n";
import { siteCopyFor } from "@/lib/locales";
import { buildSelectionAgentPrompt, type DrillContext } from "@/lib/drilldown";

export function SelectionCopy({ ctx, lang }: { ctx: DrillContext; lang: Lang }) {
  useEffect(() => {
    if (!window.matchMedia("(min-width: 768px)").matches) return;
    const root = document.querySelector(".reading-prose");
    if (!root) return;

    const copyDeck = siteCopyFor(lang);
    const idle = copyDeck.blocks.common.copyToAgent;
    const chip = document.createElement("button");
    chip.type = "button";
    chip.className = "selection-ask-chip";
    chip.textContent = idle;
    let current = "";
    let timer = 0;
    let raf = 0;

    const hide = () => {
      chip.classList.remove("is-on");
      current = "";
    };
    const place = () => {
      const selection = window.getSelection();
      const text = selection?.toString().trim() ?? "";
      if (!selection || selection.isCollapsed || text.length < 2 || !root.contains(selection.anchorNode)) {
        hide();
        return;
      }
      const rect = selection.getRangeAt(0).getBoundingClientRect();
      current = text;
      chip.style.top = `${Math.min(rect.bottom + 8, window.innerHeight - 44)}px`;
      chip.style.left = `${Math.max(8, Math.min(rect.left, window.innerWidth - chip.offsetWidth - 8))}px`;
      chip.classList.add("is-on");
    };
    const onSelection = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(place, 160);
    };
    const onScroll = () => {
      if (!current) return;
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(place);
    };
    const preserveSelection = (event: Event) => event.preventDefault();
    const copy = async () => {
      if (!current) return;
      try {
        await navigator.clipboard.writeText(buildSelectionAgentPrompt(current, ctx, lang));
        chip.textContent = copyDeck.reader.copy.copied;
      } catch {
        chip.textContent = copyDeck.reader.copy.failed;
      }
      window.setTimeout(() => {
        chip.textContent = idle;
        hide();
      }, 1200);
    };

    document.addEventListener("selectionchange", onSelection);
    window.addEventListener("scroll", onScroll, { passive: true });
    chip.addEventListener("mousedown", preserveSelection);
    chip.addEventListener("click", copy);
    document.body.appendChild(chip);
    return () => {
      document.removeEventListener("selectionchange", onSelection);
      window.removeEventListener("scroll", onScroll);
      window.clearTimeout(timer);
      cancelAnimationFrame(raf);
      chip.remove();
    };
  }, [ctx, lang]);

  return null;
}
