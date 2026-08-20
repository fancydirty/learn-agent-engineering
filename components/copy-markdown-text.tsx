"use client";

// Copy page — labeled variant (2026-07-30 user-approved direction: right-side button should carry text too).
// Same source as CopyMarkdown (icon-only, used elsewhere); here renders icon + text for the lesson-actions segment group.
import { useState } from "react";
import { CopyGlyph } from "@/components/motion/copy-glyph";
import type { Lang } from "@/lib/i18n";

export function CopyMarkdownText({ text, lang }: { text: string; lang: Lang }) {
  const [label, setLabel] = useState<"idle" | "done" | "fail">("idle");
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setLabel("done");
    } catch {
      setLabel("fail");
    }
    window.setTimeout(() => setLabel("idle"), 1600);
  };
  const idle = lang === "zh" ? "复制给 Agent" : "Copy to Agent";
  const done = lang === "zh" ? "已复制" : "Copied";
  const fail = lang === "zh" ? "复制失败" : "Copy failed";
  return (
    <button
      type="button"
      onClick={copy}
      aria-label={idle}
      title={label === "done" ? done : label === "fail" ? fail : idle}
      className="lesson-actions-btn"
    >
      <CopyGlyph done={label === "done"} size={13} />
      <span>{label === "done" ? done : label === "fail" ? fail : idle}</span>
    </button>
  );
}
