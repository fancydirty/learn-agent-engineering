import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  checkCodeFenceBalance,
  findFenceProblems,
} from "../scripts/course-guard.mjs";

describe("findFenceProblems", () => {
  it("accepts a balanced unlabeled fence", () => {
    const md = ["intro", "```", "code", "```", "out"].join("\n");
    expect(findFenceProblems(md)).toEqual({ unclosed: [], nested: [] });
  });

  it("flags a fence still open at EOF — footnote defs would be swallowed", () => {
    const md = ["```", "still open", "", "[^S1]: source"].join("\n");
    const problems = findFenceProblems(md);
    expect(problems.unclosed.map((item) => item.line)).toEqual([1]);
    expect(problems.nested).toEqual([]);
  });

  it("does not treat ```python as closing an unlabeled ``` fence", () => {
    const md = [
      "```",
      "prompt:",
      "```python",
      "def f():",
      "    return 1",
      "```",
      "answer",
      "```",
    ].join("\n");
    const problems = findFenceProblems(md);
    expect(problems.nested.map((item) => item.line)).toEqual([3]);
    expect(problems.unclosed.map((item) => item.line)).toEqual([8]);
  });

  it("allows a 3-backtick sample inside a 4-backtick outer fence", () => {
    const md = [
      "````",
      "```python",
      "print(1)",
      "```",
      "````",
    ].join("\n");
    expect(findFenceProblems(md)).toEqual({ unclosed: [], nested: [] });
  });
});

describe("checkCodeFenceBalance", () => {
  const dirs: string[] = [];
  afterEach(() => {
    for (const dir of dirs) rmSync(dir, { recursive: true, force: true });
    dirs.length = 0;
  });

  function writeCourse(lesson: string): string {
    const dir = mkdtempSync(join(tmpdir(), "fence-guard-"));
    dirs.push(dir);
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "01-sample.md"), lesson);
    return dir;
  }

  it("checks the reader body after the exercise region is stripped", () => {
    const dir = writeCourse([
      "# Title",
      "```",
      "body still open",
      "",
      "<!-- exercises -->",
      "### Level 1",
      "```",
      "exercise code",
      "```",
      "<!-- /exercises -->",
    ].join("\n"));
    const violations = checkCodeFenceBalance(dir);
    expect(violations.some((item) => item.includes("正文") && item.includes("未闭合"))).toBe(true);
  });

  it("flags nested same-length fences in the exercise region", () => {
    const dir = writeCourse([
      "# Title",
      "ok",
      "<!-- exercises -->",
      "```",
      "```python",
      "x = 1",
      "```",
      "```",
      "<!-- /exercises -->",
    ].join("\n"));
    const violations = checkCodeFenceBalance(dir);
    expect(violations.some((item) => item.includes("练习区") && item.includes("内层围栏"))).toBe(true);
  });
});
