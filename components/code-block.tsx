"use client";
import { Fragment, useState } from "react";
import { useShiki, plainTokens } from "@/lib/use-shiki";
import { CopyGlyph } from "@/components/motion/copy-glyph";
import type { Lang } from "@/lib/i18n";
import { siteCopy } from "@/lib/site-copy";

// Self-rendered code block (bypasses Streamdown's broken highlight path): sync colored tokens, header = language label + ghost copy button,
// well = near-black pre; tokens inline color (light) + --shiki-dark (dark), CSS switches by theme.
export function CodeBlock({ code, language, lang }: { code: string; language: string; lang: Lang }) {
  const t = siteCopy[lang].reader.copy;
  const shiki = useShiki();
  const { tokens, displayLang } = shiki ? shiki.tokenizeCode(code, language) : plainTokens(code, language);
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {}
  };
  return (
    <div className="code-block">
      <div className="code-block-head">
        <span className="code-block-lang">{displayLang}</span>
        <button
          type="button"
          className="code-block-copy"
          onClick={copy}
          title={copied ? t.copied : t.code}
          aria-label={t.code}
        >
          <CopyGlyph done={copied} size={14} />
        </button>
      </div>
      <div className="code-block-well">
        <pre>
          <code>
            {tokens.map((line, i) => (
              <Fragment key={i}>
                {line.map((t, j) => (
                  <span key={j} style={t.htmlStyle as React.CSSProperties | undefined}>{t.content}</span>
                ))}
                {i < tokens.length - 1 ? "\n" : ""}
              </Fragment>
            ))}
          </code>
        </pre>
      </div>
    </div>
  );
}
