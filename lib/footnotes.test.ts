import { describe, expect, it } from "vitest";
import { parseSources, resolveFootnotes } from "./footnotes";

const sources = [
  "# Sources",
  "",
  "## S1 — Official docs",
  "URL: https://example.com/s1",
  "",
  "## W1 — Wrong prefix",
  "URL: https://example.com/w1",
].join("\n");

describe("parseSources", () => {
  it("indexes ## Sn headings and ignores other prefixes", () => {
    const parsed = parseSources(sources);
    expect(Object.keys(parsed)).toEqual(["S1"]);
    expect(parsed.S1).toEqual({ title: "Official docs", url: "https://example.com/s1" });
  });
});

describe("resolveFootnotes", () => {
  it("turns [^S1] into a markdown footnote definition the reader can render", () => {
    const out = resolveFootnotes("Claim.[^S1]", sources);
    expect(out).toContain("[^S1]: Official docs — https://example.com/s1");
  });

  it("leaves [^W1] untouched so authors must use Sn", () => {
    const out = resolveFootnotes("Claim.[^W1]", sources);
    expect(out).toBe("Claim.[^W1]");
    expect(out).not.toContain("[^W1]:");
  });

  it("separates adjacent [^S5][^S10] so GFM can render both", () => {
    const out = resolveFootnotes("Claim.[^S1][^S1]", sources);
    expect(out).toContain("Claim.[^S1] [^S1]");
  });
});
