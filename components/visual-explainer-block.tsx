"use client";

import { useEffect, useRef, useState } from "react";
import type { Lang } from "@/lib/i18n";
import { siteCopy } from "@/lib/site-copy";
import { buildVisualSrcdoc, type VisualBlock } from "@/lib/visual-explainer";
import { InteractiveCardShell } from "./interactive-card-shell";

const PREVIEW_MIN = 200;
const PREVIEW_MAX = 720;
const PREVIEW_DEFAULT = 300;

export function VisualExplainerBlock({
  block,
  html,
  lang,
}: {
  block: VisualBlock;
  html: string;
  lang: Lang;
}) {
  const t = siteCopy[lang].blocks.visual;
  const instanceId = `am-visual-${block.id}`;
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const [previewHeight, setPreviewHeight] = useState(PREVIEW_DEFAULT);

  const srcdoc = buildVisualSrcdoc(html, {
    instanceId,
    interactive: block.interactive,
  });
  const sandbox = block.interactive ? "allow-scripts" : "allow-same-origin";

  useEffect(() => {
    const el = iframeRef.current;
    if (!el) return;

    const applyHeight = (h: number) => {
      setPreviewHeight(Math.min(PREVIEW_MAX, Math.max(PREVIEW_MIN, Math.ceil(h))));
    };

    const measure = () => {
      try {
        const h = el.contentDocument?.documentElement?.scrollHeight;
        if (typeof h === "number" && h > 0) applyHeight(h);
      } catch {
        /* unique-origin sandbox: parent cannot read; interactive path uses postMessage */
      }
    };

    el.addEventListener("load", measure);
    measure();

    if (!block.interactive) {
      return () => el.removeEventListener("load", measure);
    }

    const handleMessage = (e: MessageEvent) => {
      if (e.data?.__amLive !== true) return;
      if (e.data.id !== instanceId) return;
      if (el.contentWindow && e.source !== el.contentWindow) return;
      if (e.data.type === "height" && typeof e.data.h === "number") applyHeight(e.data.h);
    };
    window.addEventListener("message", handleMessage);
    return () => {
      el.removeEventListener("load", measure);
      window.removeEventListener("message", handleMessage);
    };
  }, [block.interactive, instanceId, srcdoc]);

  return (
    <InteractiveCardShell eyebrow={t.eyebrow} title={block.title} anchorId={instanceId}>
      <div className="visual-explainer">
        <div className="visual-explainer-frame" style={{ height: previewHeight }}>
          <iframe
            ref={iframeRef}
            title={block.title}
            sandbox={sandbox}
            srcDoc={srcdoc}
            className="visual-explainer-iframe"
          />
        </div>
        {block.caption ? <p className="visual-explainer-caption">{block.caption}</p> : null}
      </div>
    </InteractiveCardShell>
  );
}
