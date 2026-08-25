"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import type { Lang } from "@/lib/i18n";
import { siteCopy } from "@/lib/site-copy";
import { buildVisualSrcdoc, type VisualBlock } from "@/lib/visual-explainer";
import { InteractiveCardShell } from "./interactive-card-shell";

const PREVIEW_MIN = 200;
const PREVIEW_MAX = 720;
const PREVIEW_DEFAULT = 300;

function MaximizeIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <path d="M15 3h6v6" />
      <path d="M9 21H3v-6" />
      <path d="M21 3l-7 7" />
      <path d="M3 21l7-7" />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <path d="M18 6 6 18" />
      <path d="m6 6 12 12" />
    </svg>
  );
}

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
  const [fullscreen, setFullscreen] = useState(false);
  const [portalReady, setPortalReady] = useState(false);

  const srcdoc = buildVisualSrcdoc(html, {
    instanceId,
    interactive: block.interactive,
  });
  const sandbox = block.interactive ? "allow-scripts" : "allow-same-origin";

  useEffect(() => {
    setPortalReady(true);
  }, []);

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

  useEffect(() => {
    if (!fullscreen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setFullscreen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [fullscreen]);

  const picture = (opts: { measure: boolean; fill: boolean }) => (
    <div className="visual-explainer">
      <div className="visual-explainer-frame" style={opts.fill ? undefined : { height: previewHeight }}>
        <iframe
          ref={opts.measure ? iframeRef : undefined}
          title={block.title}
          sandbox={sandbox}
          srcDoc={srcdoc}
          className="visual-explainer-iframe"
        />
      </div>
      {block.caption ? <p className="visual-explainer-caption">{block.caption}</p> : null}
    </div>
  );

  const overlay: ReactNode = fullscreen && portalReady
    ? createPortal(
        <div
          className="visual-explainer-overlay"
          role="dialog"
          aria-modal="true"
          aria-label={t.viewFullscreen}
          onClick={() => setFullscreen(false)}
        >
          <button
            type="button"
            className="visual-explainer-overlay-close"
            title={t.exitFullscreen}
            aria-label={t.exitFullscreen}
            onClick={() => setFullscreen(false)}
          >
            <CloseIcon />
          </button>
          <div className="visual-explainer-overlay-stage" onClick={(e) => e.stopPropagation()}>
            {picture({ measure: false, fill: true })}
          </div>
        </div>,
        document.body,
      )
    : null;

  return (
    <>
      <InteractiveCardShell
        eyebrow={t.eyebrow}
        title={block.title}
        anchorId={instanceId}
        actions={
          <button
            type="button"
            className="interactive-card-fs"
            title={t.viewFullscreen}
            aria-label={t.viewFullscreen}
            onClick={() => setFullscreen(true)}
          >
            <MaximizeIcon />
          </button>
        }
      >
        {picture({ measure: true, fill: false })}
      </InteractiveCardShell>
      {overlay}
    </>
  );
}
