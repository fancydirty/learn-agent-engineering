import { describe, expect, it } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadVisualHtmlBySrc } from "./visual-explainer-load";

describe("loadVisualHtmlBySrc", () => {
  it("returns an empty map when visuals/ is missing", () => {
    const dir = mkdtempSync(join(tmpdir(), "visual-load-"));
    expect(loadVisualHtmlBySrc(dir)).toEqual({});
    expect(loadVisualHtmlBySrc("")).toEqual({});
    rmSync(dir, { recursive: true, force: true });
  });

  it("loads only safe visuals/*.html files keyed by fence src", () => {
    const dir = mkdtempSync(join(tmpdir(), "visual-load-"));
    mkdirSync(join(dir, "visuals"));
    writeFileSync(join(dir, "visuals", "when-to-load.html"), "<svg></svg>");
    writeFileSync(join(dir, "visuals", "skip.txt"), "no");
    mkdirSync(join(dir, "visuals", "nested"));
    writeFileSync(join(dir, "visuals", "nested", "no.html"), "no");
    expect(loadVisualHtmlBySrc(dir)).toEqual({
      "visuals/when-to-load.html": "<svg></svg>",
    });
    rmSync(dir, { recursive: true, force: true });
  });
});
