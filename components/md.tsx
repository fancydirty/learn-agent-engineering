"use client";
import { useMemo } from "react";
import { Streamdown, type CustomRenderer } from "streamdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import { createBeautifulMermaidPlugin } from "@/lib/beautiful-mermaid-plugin";
import { streamdownControls } from "@/lib/streamdown-controls";
import { supportedLanguages } from "@/lib/shiki-langs";
import { CodeBlock } from "@/components/code-block";
import type { Lang } from "@/lib/i18n";

const beautifulMermaidPlugin = createBeautifulMermaidPlugin();

export function Md({ children, className, lang }: { children: string; className?: string; lang: Lang }) {
  const renderers = useMemo<CustomRenderer[]>(() => [
    {
      language: Array.from(supportedLanguages),
      component: ({ code, language }) => <CodeBlock code={code} language={language} lang={lang} />,
    },
  ], [lang]);
  return (
    <div className={className ?? "reading-prose"}>
      <Streamdown
        remarkPlugins={[remarkGfm, remarkMath]}
        rehypePlugins={[rehypeKatex]}
        plugins={{ mermaid: beautifulMermaidPlugin, renderers }}
        controls={streamdownControls}
        linkSafety={{ enabled: false }}
      >
        {children}
      </Streamdown>
    </div>
  );
}
