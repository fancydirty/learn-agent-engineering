"use client";

import { useState } from "react";
import { CopyMarkdownText } from "@/components/copy-markdown-text";
import type { Lang } from "@/lib/i18n";

export function LessonActions({
  clip,
  url,
  title,
  lang,
}: {
  clip: string;
  url: string;
  title: string;
  lang: Lang;
}) {
  const [shared, setShared] = useState(false);
  const share = async () => {
    try {
      if (navigator.share) await navigator.share({ title, url });
      else await navigator.clipboard.writeText(url);
      setShared(true);
      window.setTimeout(() => setShared(false), 1600);
    } catch {
      setShared(false);
    }
  };
  return (
    <div className="lesson-actions" role="group" aria-label={lang === "zh" ? "本课动作" : "Lesson actions"}>
      <CopyMarkdownText text={clip} lang={lang} />
      <span className="lesson-actions-divider" aria-hidden />
      <button type="button" className="lesson-actions-btn" onClick={share}>
        {shared ? (lang === "zh" ? "已分享" : "Shared") : (lang === "zh" ? "分享" : "Share")}
      </button>
    </div>
  );
}
