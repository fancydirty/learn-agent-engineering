import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { parseExercises, splitLesson } from "./exercises";

const PER_LEVEL_CLOSE = [
  "## 💻 练习",
  "",
  "<!-- exercises -->",
  "",
  "### Level 1（热身）",
  "prompt one",
  "<!-- rubric -->",
  "- check one",
  "<!-- answer -->",
  "answer one",
  "<!-- hint -->",
  "hint one",
  "<!-- /exercises -->",
  "",
  "### Level 2（搭建）",
  "prompt two",
  "<!-- rubric -->",
  "- check two",
  "<!-- answer -->",
  "answer two",
  "<!-- hint -->",
  "hint two",
  "<!-- /exercises -->",
  "",
  "### Level 3（排错）",
  "prompt three",
  "<!-- rubric -->",
  "- check three",
  "<!-- /exercises -->",
  "",
  "## 小结",
  "closing",
].join("\n");

describe("splitLesson", () => {
  it("keeps every Level when authors close each one with /exercises", () => {
    const { before, exercisesMd } = splitLesson(PER_LEVEL_CLOSE);
    expect(exercisesMd).toContain("### Level 1");
    expect(exercisesMd).toContain("### Level 2");
    expect(exercisesMd).toContain("### Level 3");
    expect(before).toContain("## 💻 练习");
    expect(before).toContain("## 小结");
    expect(before).not.toContain("<!-- rubric -->");
    expect(before).not.toContain("prompt two");
  });

  it("still splits a single close the same way", () => {
    const md = [
      "body",
      "<!-- exercises -->",
      "### Level 1",
      "prompt",
      "<!-- /exercises -->",
      "## Next",
    ].join("\n");
    const { before, exercisesMd } = splitLesson(md);
    expect(exercisesMd).toContain("### Level 1");
    expect(before).toBe("body\n\n## Next");
  });
});

describe("parseExercises", () => {
  it("returns three cards from per-level close markup", () => {
    const { exercisesMd } = splitLesson(PER_LEVEL_CLOSE);
    const exercises = parseExercises(exercisesMd!);
    expect(exercises).toHaveLength(3);
    expect(exercises.map((ex) => ex.level)).toEqual([
      "Level 1（热身）",
      "Level 2（搭建）",
      "Level 3（排错）",
    ]);
    expect(exercises[1].prompt).toContain("prompt two");
    expect(exercises[1].prompt).not.toMatch(/<!--/);
    expect(exercises[1].checks).toEqual(["check two"]);
    expect(exercises[1].hints).toEqual(["hint two"]);
    for (const ex of exercises) {
      expect([ex.prompt, ex.answer ?? "", ...ex.hints, ...ex.checks].join("\n")).not.toMatch(/<!--/);
    }
  });

  it("parses the shipped zh paste-tax lesson into three exercises", () => {
    const raw = readFileSync(
      join(process.cwd(), "courses/learn-agent-skills-reuse/zh/01-the-paste-tax.md"),
      "utf8",
    );
    const { before, exercisesMd } = splitLesson(raw);
    const exercises = parseExercises(exercisesMd!);
    expect(exercises).toHaveLength(3);
    expect(before).not.toContain("<!-- rubric -->");
    expect(before).not.toContain("<!-- /exercises -->");
    expect(exercises[1].hints.join("\n")).not.toMatch(/<!--/);
    expect(exercises[1].hints.some((h) => h.includes("感觉"))).toBe(true);
  });
});
