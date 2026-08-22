"use client";
import { useEffect, useMemo, useRef } from "react";
import { Streamdown, type CustomRenderer, type PluginConfig } from "streamdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import rehypeSlug from "rehype-slug";
import rehypeRaw from "rehype-raw";
import type { Lang } from "@/lib/i18n";
import { createBeautifulMermaidPlugin } from "@/lib/beautiful-mermaid-plugin";
import { rehypeRewriteMdLinks } from "@/lib/rehype-rewrite-md-links";
import { rehypeFixFootnoteLinks } from "@/lib/rehype-fix-footnote-links";
import { rehypeDetailsWhitelist } from "@/lib/rehype-details-whitelist";
import { streamdownControls } from "@/lib/streamdown-controls";
import { supportedLanguages } from "@/lib/shiki-langs";
import { CodeBlock } from "@/components/code-block";
import { parseMentorActionBlock, type MentorActionContext } from "@/lib/mentor-actions";
import { MentorActionCard } from "@/components/mentor-action-card";
import { parseInteractiveBlock, validateInteractiveBlock } from "@/lib/interactive-blocks";
import { CheckBlock } from "@/components/check-block";
import { OrderBlock } from "@/components/order-block";
import { parseCodeExerciseBlock, validateCodeExerciseBlock, type CodeExerciseKind } from "@/lib/code-exercises";
import { CodeExerciseBlock } from "@/components/code-exercise-block";
import {
  parseLearningInteractionBlock,
  validateLearningInteractionBlock,
  type LearningInteractionLanguage,
} from "@/lib/learning-interactions";
import { PredictOutputBlock } from "@/components/predict-output-block";
import { TraceTableBlock } from "@/components/trace-table-block";
import { DiffPatchBlock } from "@/components/diff-patch-block";
import { HotspotDiagramBlock } from "@/components/hotspot-diagram-block";
import { parseLiveBlock, validateLiveBlock } from "@/lib/live-sandbox";
import { LiveSandboxBlock } from "@/components/live-sandbox-block";

const beautifulMermaidPlugin = createBeautifulMermaidPlugin();

function renderInteractive(
  language: "agentmentor-check" | "agentmentor-order",
  code: string,
  lang: Lang,
  mentorActionContext?: MentorActionContext,
) {
  const result = parseInteractiveBlock(language, code);
  if (!result.ok) return <div className="interactive-card is-error">{result.error}</div>;
  const errors = validateInteractiveBlock(result.block);
  if (errors.length) return <div className="interactive-card is-error">{errors.join("；")}</div>;
  return result.block.type === "check"
    ? <CheckBlock block={result.block} mentorActionContext={mentorActionContext} lang={lang} />
    : <OrderBlock block={result.block} mentorActionContext={mentorActionContext} lang={lang} />;
}

function renderCodeExercise(
  code: string,
  lang: Lang,
  mentorActionContext?: MentorActionContext,
  kind: CodeExerciseKind = "code",
) {
  const result = parseCodeExerciseBlock(code, kind);
  if (!result.ok) return <div className="interactive-card is-error">{result.error}</div>;
  const errors = validateCodeExerciseBlock(result.block);
  if (errors.length) return <div className="interactive-card is-error">{errors.join("；")}</div>;
  return <CodeExerciseBlock block={result.block} mentorActionContext={mentorActionContext} lang={lang} />;
}

function renderLearningInteraction(
  language: LearningInteractionLanguage,
  code: string,
  lang: Lang,
  mentorActionContext?: MentorActionContext,
) {
  const result = parseLearningInteractionBlock(language, code);
  if (!result.ok) return <div className="interactive-card is-error">{result.error}</div>;
  const errors = validateLearningInteractionBlock(result.block);
  if (errors.length) return <div className="interactive-card is-error">{errors.join("；")}</div>;
  if (result.block.type === "predict") {
    return <PredictOutputBlock block={result.block} mentorActionContext={mentorActionContext} lang={lang} />;
  }
  if (result.block.type === "trace") {
    return <TraceTableBlock block={result.block} mentorActionContext={mentorActionContext} lang={lang} />;
  }
  if (result.block.type === "diff") {
    return <DiffPatchBlock block={result.block} mentorActionContext={mentorActionContext} lang={lang} />;
  }
  return <HotspotDiagramBlock block={result.block} mentorActionContext={mentorActionContext} lang={lang} />;
}

function renderLiveSandbox(code: string, lang: Lang) {
  const result = parseLiveBlock(code);
  if (!result.ok) return <div className="interactive-card is-error">{result.error}</div>;
  const errors = validateLiveBlock(result.block);
  if (errors.length) return <div className="interactive-card is-error">{errors.join("；")}</div>;
  return <LiveSandboxBlock block={result.block} lang={lang} />;
}

// Streamdown footnotes; linkSafety off (invalid p>div). rehypeDetailsWhitelist + rehypeRaw for <details>.
export function CourseMarkdown({
  md,
  courseSlug,
  mentorActionContext,
  lang,
}: {
  md: string;
  courseSlug?: string;
  mentorActionContext?: MentorActionContext;
  lang: Lang;
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  const plugins = useMemo<PluginConfig>(() => {
    const renderers: CustomRenderer[] = [
      {
        language: Array.from(supportedLanguages),
        component: ({ code, language }) => <CodeBlock code={code} language={language} lang={lang} />,
      },
      {
        language: "agentmentor-check",
        component: ({ code }) => renderInteractive("agentmentor-check", code, lang, mentorActionContext),
      },
      {
        language: "agentmentor-order",
        component: ({ code }) => renderInteractive("agentmentor-order", code, lang, mentorActionContext),
      },
      {
        language: "agentmentor-code",
        component: ({ code }) => renderCodeExercise(code, lang, mentorActionContext),
      },
      {
        language: "agentmentor-fix",
        component: ({ code }) => renderCodeExercise(code, lang, mentorActionContext, "fix"),
      },
      {
        language: "agentmentor-predict",
        component: ({ code }) => renderLearningInteraction("agentmentor-predict", code, lang, mentorActionContext),
      },
      {
        language: "agentmentor-trace",
        component: ({ code }) => renderLearningInteraction("agentmentor-trace", code, lang, mentorActionContext),
      },
      {
        language: "agentmentor-diff",
        component: ({ code }) => renderLearningInteraction("agentmentor-diff", code, lang, mentorActionContext),
      },
      {
        language: "agentmentor-hotspot",
        component: ({ code }) => renderLearningInteraction("agentmentor-hotspot", code, lang, mentorActionContext),
      },
      {
        language: "agentmentor-live",
        component: ({ code }) => renderLiveSandbox(code, lang),
      },
    ];
    if (mentorActionContext) {
      renderers.push({
        language: "agentmentor-action",
        component: ({ code }) => (
          <MentorActionCard action={parseMentorActionBlock(code, mentorActionContext, lang)} lang={lang} />
        ),
      });
    }
    return { mermaid: beautifulMermaidPlugin, renderers };
  }, [mentorActionContext, lang]);

  // client fallback: strip footnote target=_blank after render for in-page anchors
  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    root.querySelectorAll('a[data-footnote-ref], a[href^="#user-content-fnref-"]').forEach((a) => {
      a.removeAttribute("target");
      a.removeAttribute("rel");
    });
  }, [md, courseSlug]);

  return (
    <div className="reading-prose" ref={rootRef}>
      <Streamdown
        // static markdown — disable parseIncompleteMarkdown to avoid escaped fence JSON
        parseIncompleteMarkdown={false}
        remarkPlugins={[remarkGfm, remarkMath]}
        rehypePlugins={[rehypeDetailsWhitelist, rehypeRaw, rehypeKatex, rehypeSlug, [rehypeRewriteMdLinks, { courseSlug, locale: lang }], rehypeFixFootnoteLinks]}
        plugins={plugins}
        controls={streamdownControls}
        linkSafety={{ enabled: false }}
      >
        {md}
      </Streamdown>
    </div>
  );
}
