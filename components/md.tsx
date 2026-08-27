"use client";
import { useEffect, useMemo, useState } from "react";
import { Streamdown, type CustomRenderer } from "streamdown";
import remarkGfm from "remark-gfm";
import type { createBeautifulMermaidPlugin } from "@/lib/beautiful-mermaid-plugin";
import { streamdownControls } from "@/lib/streamdown-controls";
import { supportedLanguages } from "@/lib/shiki-langs";
import { CodeBlock } from "@/components/code-block";
import type { Lang } from "@/lib/i18n";

// Same weight rule as course-markdown.tsx: KaTeX/remark-math dropped (zero lessons
// use math), and beautiful-mermaid (elkjs layouter ≈1.5MB) loads only when the
// markdown actually carries a mermaid fence. Cache shared per session.
type MermaidPlugin = ReturnType<typeof createBeautifulMermaidPlugin>;
let mermaidPluginCache: MermaidPlugin | null = null;

export function Md({ children, className, lang }: { children: string; className?: string; lang: Lang }) {
  const needsMermaid = useMemo(() => children.includes("```mermaid"), [children]);
  const [mermaidPlugin, setMermaidPlugin] = useState<MermaidPlugin | null>(mermaidPluginCache);
  useEffect(() => {
    if (!needsMermaid || mermaidPlugin) return;
    let alive = true;
    import("@/lib/beautiful-mermaid-plugin").then((m) => {
      mermaidPluginCache = m.createBeautifulMermaidPlugin();
      if (alive) setMermaidPlugin(mermaidPluginCache);
    });
    return () => { alive = false; };
  }, [needsMermaid, mermaidPlugin]);
  const renderers = useMemo<CustomRenderer[]>(() => [
    {
      language: Array.from(supportedLanguages),
      component: ({ code, language }) => <CodeBlock code={code} language={language} lang={lang} />,
    },
  ], [lang]);
  return (
    <div className={className ?? "reading-prose"}>
      <Streamdown
        remarkPlugins={[remarkGfm]}
        plugins={mermaidPlugin ? { mermaid: mermaidPlugin, renderers } : { renderers }}
        controls={streamdownControls}
        linkSafety={{ enabled: false }}
      >
        {children}
      </Streamdown>
    </div>
  );
}
