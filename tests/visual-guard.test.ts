import { describe, expect, it } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { checkInteractiveBlocks, checkVisualHtmlQuality } from "../scripts/course-guard.mjs";

const EDITORIAL = `<!DOCTYPE html><html><head><style>body{background:#faf8f4;color:#1a1714}</style></head>
<body><svg viewBox="0 0 8 8" role="img" aria-label="x"><rect width="8" height="8" fill="#9a3b1b"/></svg></body></html>`;

function lessonWithVisual(dir: string, html: string) {
  mkdirSync(join(dir, "visuals"), { recursive: true });
  writeFileSync(join(dir, "visuals", "when-to-load.html"), html);
  writeFileSync(join(dir, "01-a.md"), [
    "# 1",
    "## 钩子",
    "x",
    "## 讲解",
    "```agentmentor-visual",
    JSON.stringify({
      id: "when-to-load",
      src: "visuals/when-to-load.html",
      title: "何时加载什么",
      interactive: false,
    }, null, 2),
    "```",
    "## 跟我做",
    "## 换你补",
    "## 练习",
    "## 小结",
    "下一节 [02 >>](./02-b.md)",
  ].join("\n"));
}

describe("course-guard visual HTML", () => {
  it("accepts an editorial static picture", () => {
    expect(checkVisualHtmlQuality(EDITORIAL, { interactive: false })).toEqual([]);
    const d = mkdtempSync(join(tmpdir(), "visual-guard-"));
    lessonWithVisual(d, EDITORIAL);
    expect(checkInteractiveBlocks(d)).toEqual([]);
    rmSync(d, { recursive: true, force: true });
  });

  it("fails grey-box HTML that never uses paper or ink", () => {
    const html = "<!DOCTYPE html><html><body style='background:#eee;color:#222'><svg viewBox='0 0 8 8'></svg></body></html>";
    const vs = checkVisualHtmlQuality(html, { interactive: false });
    expect(vs.some((x: string) => /纸色/.test(x))).toBe(true);
    expect(vs.some((x: string) => /墨色/.test(x))).toBe(true);
  });
});
