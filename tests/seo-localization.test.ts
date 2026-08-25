import { mkdtempSync, mkdirSync, rmSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { scanCourseFamilies } from "@/lib/courses";
import sitemap from "@/app/sitemap";
import { absoluteUrl, libraryAlternates, localizedAlternates, SITE_URL } from "@/lib/seo";

// Two-locale fixture: zh has lessons 01+02 and a glossary; en has lesson 01 only.
const fixtureRoot = mkdtempSync(join(tmpdir(), "seo-locales-"));

function writeFixture(rel: string, content: string) {
  const path = join(fixtureRoot, rel);
  mkdirSync(join(path, ".."), { recursive: true });
  writeFileSync(path, content);
}

writeFixture("learn-demo/zh/README.md", "---\ndomain: Agent Engineering\ntags: [Agent Skills]\nlang: zh\n---\n# 演示课程\n\n简介。\n");
writeFixture("learn-demo/zh/01-alpha.md", "# 第一课\n\n内容。\n");
writeFixture("learn-demo/zh/02-beta.md", "# 第二课\n\n内容。\n");
writeFixture("learn-demo/zh/glossary.json", JSON.stringify([{ term: "技能", def: "定义。" }]));
writeFixture("learn-demo/zh/sources.md", "# 来源\n");
writeFixture("learn-demo/en/README.md", "---\ndomain: Agent Engineering\ntags: [Agent Skills]\nlang: en\n---\n# Demo Course\n\nIntro.\n");
writeFixture("learn-demo/en/01-alpha.md", "# Lesson One\n\nBody.\n");
writeFixture("learn-demo/en/sources.md", "# Sources\n");

afterAll(() => {
  rmSync(fixtureRoot, { recursive: true, force: true });
});

const family = scanCourseFamilies(fixtureRoot)[0];

describe("localizedAlternates", () => {
  it("builds canonical plus exact-page alternates with x-default to English", () => {
    const alternates = localizedAlternates(family, { kind: "course" }, "zh");
    expect(alternates).toEqual({
      canonical: `${SITE_URL}/zh/demo`,
      languages: {
        en: `${SITE_URL}/en/demo`,
        zh: `${SITE_URL}/zh/demo`,
        "x-default": `${SITE_URL}/en/demo`,
      },
    });
  });

  it("omits locales missing the exact lesson and drops x-default without English", () => {
    const alternates = localizedAlternates(family, { kind: "lesson", lesson: "02-beta" }, "zh");
    expect(alternates).toEqual({
      canonical: `${SITE_URL}/zh/demo/02-beta`,
      languages: { zh: `${SITE_URL}/zh/demo/02-beta` },
    });
  });

  it("keeps both locales on a shared lesson and points x-default at English", () => {
    const alternates = localizedAlternates(family, { kind: "lesson", lesson: "01-alpha" }, "en");
    expect(alternates?.canonical).toBe(`${SITE_URL}/en/demo/01-alpha`);
    expect(alternates?.languages).toMatchObject({
      en: `${SITE_URL}/en/demo/01-alpha`,
      zh: `${SITE_URL}/zh/demo/01-alpha`,
      "x-default": `${SITE_URL}/en/demo/01-alpha`,
    });
  });

  it("lists glossary alternates only where a glossary exists", () => {
    const alternates = localizedAlternates(family, { kind: "glossary" }, "zh");
    expect(alternates?.languages).toEqual({ zh: `${SITE_URL}/zh/demo/glossary` });
  });
});

describe("libraryAlternates", () => {
  it("covers all six launch locales with an English x-default", () => {
    const alternates = libraryAlternates("ja");
    expect(alternates?.canonical).toBe(`${SITE_URL}/ja/courses`);
    expect(alternates?.languages).toEqual({
      en: `${SITE_URL}/en/courses`,
      zh: `${SITE_URL}/zh/courses`,
      ja: `${SITE_URL}/ja/courses`,
      ko: `${SITE_URL}/ko/courses`,
      es: `${SITE_URL}/es/courses`,
      "pt-BR": `${SITE_URL}/pt-BR/courses`,
      "x-default": `${SITE_URL}/en/courses`,
    });
  });
});

describe("sitemap", () => {
  it("emits only locale-prefixed URLs and never query-param language links", () => {
    const urls = sitemap().map((entry) => entry.url);
    expect(urls.length).toBeGreaterThan(0);
    for (const url of urls) {
      expect(url).toMatch(new RegExp(`^${SITE_URL.replace(".", "\\.")}/(en|zh|ja|ko|es|pt-BR)/`));
      expect(url).not.toContain("?lang=");
    }
    // The real course family is present in its published locales.
    expect(urls).toContain(`${SITE_URL}/zh/claude-code-skills`);
  });
});

describe("robots", () => {
  it("is served as a static public file pointing at the sitemap", () => {
    // app/robots.ts would collide with public/robots.txt (Next.js E212), so the
    // static file stays the single source.
    expect(existsSync(join(process.cwd(), "app/robots.ts"))).toBe(false);
    const source = readFileSync(join(process.cwd(), "public/robots.txt"), "utf8");
    expect(source).toContain("Sitemap:");
    expect(source).toContain(SITE_URL);
  });
});

describe("absoluteUrl", () => {
  it("pins the production origin and joins locale paths", () => {
    expect(SITE_URL).toBe("https://learn.agentmentor.dev");
    expect(absoluteUrl("/zh/demo")).toBe("https://learn.agentmentor.dev/zh/demo");
  });
});
