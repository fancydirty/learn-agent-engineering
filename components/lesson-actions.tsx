"use client";

import { useState } from "react";
import { CopyMarkdownText } from "@/components/copy-markdown-text";
import type { Lang } from "@/lib/i18n";
import { siteCopyFor } from "@/lib/locales";

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
  const copy = siteCopyFor(lang).reader.actions;
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
    <div className="lesson-actions" role="group" aria-label={copy.group}>
      <CopyMarkdownText text={clip} lang={lang} />
      <span className="lesson-actions-divider" aria-hidden />
      <button type="button" className="lesson-actions-btn" onClick={share}>
        {shared ? copy.shared : copy.share}
      </button>
    </div>
  );
}
