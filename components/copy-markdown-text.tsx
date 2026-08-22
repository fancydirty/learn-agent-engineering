"use client";

// Copy page — labeled variant (2026-07-30 user-approved direction: right-side button should carry text too).
// Same source as CopyMarkdown (icon-only, used elsewhere); here renders icon + text for the lesson-actions segment group.
import { useState } from "react";
import { CopyGlyph } from "@/components/motion/copy-glyph";
import type { Lang } from "@/lib/i18n";
import { siteCopyFor } from "@/lib/locales";

export function CopyMarkdownText({ text, lang }: { text: string; lang: Lang }) {
  const [label, setLabel] = useState<"idle" | "done" | "fail">("idle");
  const copyText = siteCopyFor(lang);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setLabel("done");
    } catch {
      setLabel("fail");
    }
    window.setTimeout(() => setLabel("idle"), 1600);
  };
  const idle = copyText.blocks.common.copyToAgent;
  const done = copyText.reader.copy.copied;
  const fail = copyText.reader.copy.failed;
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
