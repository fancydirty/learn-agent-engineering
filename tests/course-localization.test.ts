import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import {
  findCourseFamily,
  findCourseVariant,
  pageVariants,
  scanCourseFamilies,
} from "@/lib/courses";
import { localePath, samePageLocaleLinks, coursesLocaleLinks } from "@/lib/i18n";
import { isLocale, localeInfo, LOCALES, siteCopyFor, DEFAULT_LOCALE } from "@/lib/locales";

describe("locale registry", () => {
  it("lists exactly the six launch locales in order", () => {
    expect(LOCALES.map((x) => x.code)).toEqual(["en", "zh", "ja", "ko", "es", "pt-BR"]);
  });

  it("pins the default locale used by the root redirect", () => {
    expect(DEFAULT_LOCALE).toBe("en");
  });

  it("carries local names and html language tags from the design spec", () => {
    expect(localeInfo("en")).toMatchObject({ label: "English", htmlLang: "en" });
    expect(localeInfo("zh")).toMatchObject({ label: "简体中文", htmlLang: "zh-CN" });
    expect(localeInfo("ja")).toMatchObject({ label: "日本語", htmlLang: "ja-JP" });
    expect(localeInfo("ko")).toMatchObject({ label: "한국어", htmlLang: "ko-KR" });
    expect(localeInfo("es")).toMatchObject({ label: "Español", htmlLang: "es-ES" });
    expect(localeInfo("pt-BR")).toMatchObject({ label: "Português (Brasil)", htmlLang: "pt-BR" });
  });

  it("validates locale codes", () => {
    expect(isLocale("pt-BR")).toBe(true);
    expect(isLocale("en")).toBe(true);
    expect(isLocale("fr")).toBe(false);
    expect(isLocale("")).toBe(false);
    expect(isLocale(undefined)).toBe(false);
    expect(isLocale(["zh"])).toBe(false);
  });

  it("returns complete site copy for every launch locale", () => {
    for (const { code } of LOCALES) {
      const copy = siteCopyFor(code);
      expect(copy.reader.copy.code.length).toBeGreaterThan(0);
      expect(copy.blocks.exercise.heading.length).toBeGreaterThan(0);
      expect(copy.reader.glossary.subtitle(2, "Course").length).toBeGreaterThan(0);
    }
    expect(siteCopyFor("zh").reader.copy.code).toBe("复制代码");
    expect(siteCopyFor("en").reader.copy.code).toBe("Copy code");
  });
});

describe("localePath", () => {
  it("prefixes bare paths with the locale", () => {
    expect(localePath("zh", "/agent-skills-reuse/02-skill-metadata")).toBe("/zh/agent-skills-reuse/02-skill-metadata");
    expect(localePath("en", "/courses")).toBe("/en/courses");
    expect(localePath("pt-BR", "/agent-skills-reuse")).toBe("/pt-BR/agent-skills-reuse");
  });

  it("never produces a query-param language link", () => {
    expect(localePath("zh", "/courses")).not.toContain("?lang=");
  });
});

// --- course family scanning over a temporary fixture ---

const fixtureRoot = mkdtempSync(join(tmpdir(), "course-families-"));

function writeFixture(rel: string, content: string) {
  const path = join(fixtureRoot, rel);
  mkdirSync(join(path, ".."), { recursive: true });
  writeFileSync(path, content);
}

const ZH_README = `---
domain: Agent Engineering
tags: [Agent Skills]
lang: zh
---
# 演示课程

一段中文简介。
`;

const EN_README = `---
domain: Agent Engineering
tags: [Agent Skills]
lang: en
---
# Demo Course

An English intro.
`;

function lesson(title: string) {
  return `# ${title}\n\n正文内容。\n`;
}

writeFixture("learn-demo/logo.svg", "<svg xmlns=\"http://www.w3.org/2000/svg\"></svg>\n");
writeFixture("learn-demo/zh/README.md", ZH_README);
writeFixture("learn-demo/zh/01-alpha.md", lesson("第一课"));
writeFixture("learn-demo/zh/02-beta.md", lesson("第二课"));
writeFixture("learn-demo/zh/glossary.json", JSON.stringify([{ term: "技能", def: "可复用工作流。", source: "S1" }]));
writeFixture("learn-demo/zh/sources.md", "# 来源\n\n[^S1]: https://example.com/spec\n");
writeFixture("learn-demo/zh/agentmentor.json", JSON.stringify({ schemaVersion: 2 }));
writeFixture("learn-demo/en/README.md", EN_README);
writeFixture("learn-demo/en/01-alpha.md", lesson("Lesson One"));
writeFixture("learn-demo/en/sources.md", "# Sources\n\n[^S1]: https://example.com/spec\n");
writeFixture("learn-demo/en/agentmentor.json", JSON.stringify({ schemaVersion: 2 }));
// ja has a README but no lessons: unpublished, must be excluded.
writeFixture("learn-demo/ja/README.md", "# デモ\n\nはじめに。\n");
// fr is not a launch locale: must be ignored even with a full course inside.
writeFixture("learn-demo/fr/README.md", "# Démo\n\nIntro.\n");
writeFixture("learn-demo/fr/01-alpha.md", lesson("Leçon Une"));
// a family without any published variant must not surface at all.
writeFixture("learn-empty/zh/README.md", "# 空课程\n\n没有课节。\n");

afterAll(() => {
  rmSync(fixtureRoot, { recursive: true, force: true });
});

describe("scanCourseFamilies", () => {
  const families = scanCourseFamilies(fixtureRoot);

  it("returns one family per learn- directory with at least one published variant", () => {
    expect(families.map((f) => f.slug)).toEqual(["demo"]);
    const demo = families[0];
    expect(demo.hasLogo).toBe(true);
    expect(demo.variants.map((v) => v.locale)).toEqual(["en", "zh"]);
  });

  it("parses variants with lessons, frontmatter, and page availability", () => {
    const zh = findCourseVariant(families[0], "zh");
    expect(zh).toBeDefined();
    expect(zh!.lessons.map((l) => l.slug)).toEqual(["01-alpha", "02-beta"]);
    expect(zh!.title).toBe("演示课程");
    expect(zh!.domain).toBe("Agent Engineering");
    expect(zh!.hasGlossary).toBe(true);
    expect(zh!.hasSources).toBe(true);

    const en = findCourseVariant(families[0], "en");
    expect(en!.lessons.map((l) => l.slug)).toEqual(["01-alpha"]);
    expect(en!.hasGlossary).toBe(false);
    expect(en!.hasSources).toBe(true);
  });

  it("finds families and variants without crossing family boundaries", () => {
    expect(findCourseFamily(families, "demo")!.slug).toBe("demo");
    expect(findCourseFamily(families, "empty")).toBeUndefined();
    expect(findCourseVariant(families[0], "ja")).toBeUndefined();
  });
});

describe("pageVariants", () => {
  const family = scanCourseFamilies(fixtureRoot)[0];

  it("keeps only variants that have the exact requested page", () => {
    expect(pageVariants(family, { kind: "course" }).map((v) => v.locale)).toEqual(["en", "zh"]);
    expect(pageVariants(family, { kind: "lesson", lesson: "01-alpha" }).map((v) => v.locale)).toEqual(["en", "zh"]);
    expect(pageVariants(family, { kind: "lesson", lesson: "02-beta" }).map((v) => v.locale)).toEqual(["zh"]);
    expect(pageVariants(family, { kind: "glossary" }).map((v) => v.locale)).toEqual(["zh"]);
    expect(pageVariants(family, { kind: "sources" }).map((v) => v.locale)).toEqual(["en", "zh"]);
  });
});

describe("coursesLocaleLinks", () => {
  it("links the library page across all six launch locales", () => {
    expect(coursesLocaleLinks().map((l) => l.href)).toEqual([
      "/en/courses",
      "/zh/courses",
      "/ja/courses",
      "/ko/courses",
      "/es/courses",
      "/pt-BR/courses",
    ]);
    expect(coursesLocaleLinks().map((l) => l.label)).toEqual([
      "English",
      "简体中文",
      "日本語",
      "한국어",
      "Español",
      "Português (Brasil)",
    ]);
  });
});

describe("samePageLocaleLinks", () => {
  const family = scanCourseFamilies(fixtureRoot)[0];

  it("links the same course page across published locales", () => {
    expect(samePageLocaleLinks(family, { kind: "course" })).toEqual([
      { locale: "en", label: "English", href: "/en/demo" },
      { locale: "zh", label: "简体中文", href: "/zh/demo" },
    ]);
  });

  it("preserves the lesson slug and silently omits locales missing that lesson", () => {
    expect(samePageLocaleLinks(family, { kind: "lesson", lesson: "02-beta" })).toEqual([
      { locale: "zh", label: "简体中文", href: "/zh/demo/02-beta" },
    ]);
    expect(samePageLocaleLinks(family, { kind: "lesson", lesson: "01-alpha" }).map((l) => l.href)).toEqual([
      "/en/demo/01-alpha",
      "/zh/demo/01-alpha",
    ]);
  });

  it("links glossary and sources pages only where they exist", () => {
    expect(samePageLocaleLinks(family, { kind: "glossary" }).map((l) => l.href)).toEqual(["/zh/demo/glossary"]);
    expect(samePageLocaleLinks(family, { kind: "sources" }).map((l) => l.href)).toEqual([
      "/en/demo/sources",
      "/zh/demo/sources",
    ]);
  });
});
