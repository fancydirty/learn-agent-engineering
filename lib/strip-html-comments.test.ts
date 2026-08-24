import { describe, expect, it } from "vitest";
import { stripHtmlComments } from "@/lib/strip-html-comments";

describe("stripHtmlComments (registry audit only)", () => {
  it("strips single registry comments so they are absent from cleaned output", () => {
    const md = `# Sources\n\n<!-- registry: A8 -->\n\n- [Doc](https://example.com)\n`;
    const cleaned = stripHtmlComments(md);
    expect(cleaned).not.toContain("<!-- registry: A8 -->");
    expect(cleaned).not.toContain("registry:");
    expect(cleaned).toContain("# Sources");
    expect(cleaned).toContain("- [Doc](https://example.com)");
  });

  it("strips multi-id and ranged registry comments", () => {
    const samples = [
      "<!-- registry: A8, A9 -->",
      "<!-- registry: A2, A4-A6, A8 -->",
      "<!--  registry: A8  -->",
    ];
    for (const comment of samples) {
      const cleaned = stripHtmlComments(`Intro\n${comment}\nOutro`);
      expect(cleaned).not.toContain(comment);
      expect(cleaned).not.toMatch(/registry:/);
      expect(cleaned).toContain("Intro");
      expect(cleaned).toContain("Outro");
    }
  });

  it("strips multi-line registry comments", () => {
    const md = `Before\n<!-- registry:\n  A8, A9\n-->\nAfter`;
    const cleaned = stripHtmlComments(md);
    expect(cleaned).not.toMatch(/registry:/);
    expect(cleaned).not.toContain("-->");
    expect(cleaned).toContain("Before");
    expect(cleaned).toContain("After");
  });

  it("preserves structural exercise anchors used by lib/exercises.ts", () => {
    const md = [
      "Lesson body",
      "<!-- exercises -->",
      "### Level 1",
      "<!-- rubric -->",
      "- check",
      "<!-- hint -->",
      "a hint",
      "<!-- answer -->",
      "the answer",
      "<!-- /exercises -->",
    ].join("\n");
    const cleaned = stripHtmlComments(md);
    expect(cleaned).toBe(md);
  });
});
