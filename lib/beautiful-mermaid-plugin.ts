import { renderMermaidSVG, type RenderOptions } from "beautiful-mermaid";
import type { DiagramPlugin } from "streamdown";

const DEFAULT_RENDER_OPTIONS: RenderOptions = {
  bg: "var(--background)",
  fg: "var(--foreground)",
  line: "var(--border-strong)",
  accent: "var(--accent)",
  muted: "var(--muted-foreground)",
  surface: "var(--card)",
  border: "var(--border-strong)",
  font: "Inter",
  padding: 28,
  nodeSpacing: 32,
  layerSpacing: 44,
  componentSpacing: 28,
  transparent: true,
};

export function createBeautifulMermaidPlugin(options: RenderOptions = DEFAULT_RENDER_OPTIONS): DiagramPlugin {
  return {
    name: "mermaid",
    type: "diagram",
    language: "mermaid",
    getMermaid: () => ({
      initialize: () => {},
      render: async (id: string, source: string) => ({
        svg: normalizeFonts(tagSvg(renderMermaidSVG(source, options), id)),
      }),
    }),
  };
}

function tagSvg(svg: string, id: string) {
  return svg.replace("<svg", `<svg data-agentmentor-mermaid-id="${escapeAttribute(id)}"`);
}

function normalizeFonts(svg: string) {
  return svg
    .replace(/^\s*@import url\('https:\/\/fonts\.googleapis\.com\/css2\?family=[^']+'\);\n?/gm, "")
    .replace(
      /text \{ font-family: '[^']+', system-ui, sans-serif; \}/,
      "text { font-family: var(--font-reading), var(--font-sans), system-ui, sans-serif; }",
    )
    .replace(
      /\.mono \{ font-family: 'JetBrains Mono', 'SF Mono', 'Fira Code', ui-monospace, monospace; \}/,
      ".mono { font-family: var(--font-mono), 'SF Mono', 'Fira Code', ui-monospace, monospace; }",
    );
}

function escapeAttribute(value: string) {
  return value.replace(/[&<>"']/g, (char) => {
    switch (char) {
      case "&":
        return "&amp;";
      case "<":
        return "&lt;";
      case ">":
        return "&gt;";
      case '"':
        return "&quot;";
      default:
        return "&#39;";
    }
  });
}
