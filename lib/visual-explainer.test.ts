import { describe, expect, it } from "vitest";
import {
  MAX_VISUAL_BYTES,
  buildVisualSrcdoc,
  isSafeVisualSrc,
  parseVisualBlock,
  validateVisualBlock,
  visualHtmlFromFiles,
} from "./visual-explainer";

const goodFence = JSON.stringify({
  id: "when-to-load",
  src: "visuals/when-to-load.html",
  title: "何时加载什么",
  caption: "启动时只有骨架；对上任务才打开 SKILL.md。",
  interactive: true,
});

describe("isSafeVisualSrc", () => {
  it("accepts a visuals/ file at the folder root", () => {
    expect(isSafeVisualSrc("visuals/when-to-load.html")).toBe(true);
  });

  it("rejects traversal, other folders, and absolute paths", () => {
    expect(isSafeVisualSrc("visuals/../secrets.html")).toBe(false);
    expect(isSafeVisualSrc("assets/done.html")).toBe(false);
    expect(isSafeVisualSrc("/visuals/done.html")).toBe(false);
    expect(isSafeVisualSrc("visuals/nested/done.html")).toBe(false);
    expect(isSafeVisualSrc("visuals/done.txt")).toBe(false);
  });
});

describe("parseVisualBlock", () => {
  it("parses required fields and optional caption/interactive", () => {
    const r = parseVisualBlock(goodFence);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.block.id).toBe("when-to-load");
    expect(r.block.src).toBe("visuals/when-to-load.html");
    expect(r.block.title).toBe("何时加载什么");
    expect(r.block.caption).toBe("启动时只有骨架；对上任务才打开 SKILL.md。");
    expect(r.block.interactive).toBe(true);
  });

  it("defaults interactive to false and caption to empty", () => {
    const r = parseVisualBlock(JSON.stringify({
      id: "static-picture",
      src: "visuals/static.html",
      title: "A static picture",
    }));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.block.interactive).toBe(false);
    expect(r.block.caption).toBe("");
  });

  it("rejects non-JSON and non-objects", () => {
    expect(parseVisualBlock("{bad").ok).toBe(false);
    expect(parseVisualBlock("[]").ok).toBe(false);
  });
});

describe("validateVisualBlock", () => {
  const parse = (o: object) => {
    const r = parseVisualBlock(JSON.stringify(o));
    if (!r.ok) throw new Error(r.error);
    return r.block;
  };

  it("accepts a self-contained file under the size cap", () => {
    const errors = validateVisualBlock(parse(JSON.parse(goodFence)), {
      html: "<!DOCTYPE html><html><body><svg viewBox='0 0 10 10'></svg></body></html>",
    });
    expect(errors).toEqual([]);
  });

  it("requires id, src, and title", () => {
    const errors = validateVisualBlock(parse({ src: "visuals/a.html", title: "T" }), { html: "<p>x</p>" });
    expect(errors.some((e) => /missing id/.test(e))).toBe(true);
  });

  it("rejects an unsafe src even if a file is supplied", () => {
    const errors = validateVisualBlock(parse({ id: "a", src: "assets/a.html", title: "T" }), { html: "<p>x</p>" });
    expect(errors.some((e) => /visuals\//.test(e))).toBe(true);
  });

  it("reports a missing HTML file", () => {
    const errors = validateVisualBlock(parse(JSON.parse(goodFence)), { html: undefined });
    expect(errors.some((e) => /missing file|not found/i.test(e))).toBe(true);
  });

  it("bans external URLs and oversize files", () => {
    const urlErrors = validateVisualBlock(parse(JSON.parse(goodFence)), {
      html: "<img src='https://cdn.example/x.png'>",
    });
    expect(urlErrors.some((e) => /external URL/i.test(e))).toBe(true);

    const huge = "x".repeat(MAX_VISUAL_BYTES + 1);
    const sizeErrors = validateVisualBlock(parse(JSON.parse(goodFence)), { html: huge });
    expect(sizeErrors.some((e) => /exceeds/.test(e))).toBe(true);
  });

  it("allows same-page hash anchors", () => {
    const errors = validateVisualBlock(parse(JSON.parse(goodFence)), {
      html: "<a href='#mechanism'>see the check</a>",
    });
    expect(errors).toEqual([]);
  });
});

describe("buildVisualSrcdoc", () => {
  it("injects the live height postMessage reporter when interactive", () => {
    const doc = buildVisualSrcdoc("<p>hi</p>", { instanceId: "am-visual-a", interactive: true });
    expect(doc).toContain("<!DOCTYPE html>");
    expect(doc).toContain("<p>hi</p>");
    expect(doc).toContain('var ID="am-visual-a"');
    expect(doc).toContain("__amLive");
    expect(doc).toContain("type:'height'");
    expect(doc).toContain("ResizeObserver");
  });

  it("does not inject a script reporter when static", () => {
    const doc = buildVisualSrcdoc("<p>hi</p>", { instanceId: "am-visual-b", interactive: false });
    expect(doc).toContain("<p>hi</p>");
    expect(doc).not.toContain("postMessage");
    expect(doc).not.toContain("__amLive");
  });

  it("keeps a full HTML document and only appends the reporter", () => {
    const src = "<!DOCTYPE html><html><head><title>X</title></head><body><p>Pic</p></body></html>";
    const doc = buildVisualSrcdoc(src, { instanceId: "am-visual-c", interactive: true });
    expect(doc).toContain("<title>X</title>");
    expect(doc).toContain("<p>Pic</p>");
    expect(doc).toContain("__amLive");
  });
});

describe("visualHtmlFromFiles", () => {
  it("keeps only safe visuals/*.html keys", () => {
    const map = visualHtmlFromFiles({
      "visuals/when-to-load.html": "<p>ok</p>",
      "visuals/../x.html": "<p>no</p>",
      "01-a.md": "# lesson",
    });
    expect(map).toEqual({ "visuals/when-to-load.html": "<p>ok</p>" });
  });
});
