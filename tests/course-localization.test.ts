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
import { guardCourseFamily } from "../scripts/course-family-guard.mjs";
import { hasPlaceholderText } from "../scripts/course-guard.mjs";
import { stripLessonNumberPrefix } from "@/lib/lesson-title";

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

describe("lesson number prefixes across locales", () => {
  it("strips every launch locale's counter from H1 titles", () => {
    expect(stripLessonNumberPrefix("第 2 讲：SKILL.md 元数据结构")).toBe("SKILL.md 元数据结构");
    expect(stripLessonNumberPrefix("Lesson 2: SKILL.md Metadata")).toBe("SKILL.md Metadata");
    expect(stripLessonNumberPrefix("第2回：SKILL.md のメタデータ")).toBe("SKILL.md のメタデータ");
    expect(stripLessonNumberPrefix("제2강: SKILL.md 메타데이터")).toBe("SKILL.md 메타데이터");
    expect(stripLessonNumberPrefix("Lección 2: Metadatos de SKILL.md")).toBe("Metadatos de SKILL.md");
    expect(stripLessonNumberPrefix("Lição 2: Metadados do SKILL.md")).toBe("Metadados do SKILL.md");
  });
});

// --- course family guard ---

const guardRoot = mkdtempSync(join(tmpdir(), "course-family-guard-"));

function writeGuardFixture(rel: string, content: string) {
  const path = join(guardRoot, rel);
  mkdirSync(join(path, ".."), { recursive: true });
  writeFileSync(path, content);
}

const SKILL_ARTIFACT = `---
name: interview-notes
description: Turns customer interview transcripts into Chinese Markdown notes with quotes and themes. Use when summarizing interviews, research calls, or transcript notes.
---

# Interview Notes
`;

function guardReadme(lang: string, title: string) {
  return `---\ndomain: Agent Engineering\ntags: [Agent Skills]\nlang: ${lang}\n---\n# ${title}\n\nIntro.\n\n| # | 主题 |\n|---|---|\n| 01 | [一](./01-alpha.md) |\n| 02 | [二](./02-beta.md) |\n`;
}

function guardLesson(title: string, artifact: string, blockId: string) {
  return `# ${title}\n\n## 背景\n\n正文解释。\n\n## 示例\n\n\`\`\`yaml\n${artifact}\`\`\`\n\n## 练习前\n\n\`\`\`agentmentor-check\n{"id": "${blockId}", "label": "检查理解", "prompt": "哪个描述更具体？", "whyHere": "检查点。", "mode": "single", "choices": [{"id": "a", "text": "泛化描述：Helps with customer content.", "correct": false, "feedback": "缺少触发条件。"}, {"id": "b", "text": "明确能力：Turns customer interview transcripts into notes.", "correct": true, "feedback": "能力触发俱全。"}]}\n\`\`\`\n\n## 练习\n\n练习内容。\n\n## 小结\n\n收尾。\n`;
}

function buildFamily(name: string, options: { lessonRename?: string; translateArtifact?: boolean; langMismatch?: boolean; unknownLocale?: boolean; missingFile?: string; idMismatch?: boolean }) {
  const base = `learn-${name}`;
  writeGuardFixture(`${base}/logo.svg`, "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 48 48\"><path d=\"M4 4h40v40H4z\" fill=\"none\" stroke=\"currentColor\"/></svg>\n");
  for (const locale of ["zh", "en"]) {
    const lang = options.langMismatch && locale === "en" ? "zh" : locale;
    writeGuardFixture(`${base}/${locale}/README.md`, guardReadme(lang, `Demo ${locale}`));
    const zhArtifact = options.translateArtifact && locale === "zh"
      ? SKILL_ARTIFACT.replace("Turns customer interview transcripts into Chinese Markdown notes with quotes and themes. Use when summarizing interviews, research calls, or transcript notes.", "把客户访谈 transcript 整理成中文纪要。")
      : SKILL_ARTIFACT;
    const secondId = options.idMismatch && locale === "en" ? "different-id" : "shared-check-2";
    writeGuardFixture(`${base}/${locale}/01-alpha.md`, guardLesson(`Alpha ${locale}`, zhArtifact, "shared-check-1"));
    writeGuardFixture(`${base}/${locale}/${options.lessonRename && locale === "en" ? options.lessonRename : "02-beta.md"}`, guardLesson(`Beta ${locale}`, SKILL_ARTIFACT, secondId));
    if (options.missingFile !== "glossary.json" || locale !== "en") {
      writeGuardFixture(`${base}/${locale}/glossary.json`, JSON.stringify([{ term: "术语", def: "定义", source: "https://example.com" }]));
    }
    writeGuardFixture(`${base}/${locale}/sources.md`, "# 来源\n\n## S1 — Spec\n\n- URL: https://example.com\n");
    writeGuardFixture(`${base}/${locale}/agentmentor.json`, JSON.stringify({ schemaVersion: 2 }));
  }
  if (options.unknownLocale) {
    writeGuardFixture(`${base}/fr/README.md`, guardReadme("fr", "Démo"));
    writeGuardFixture(`${base}/fr/01-alpha.md`, guardLesson("Alpha fr", SKILL_ARTIFACT, "shared-check-1"));
  }
  return join(guardRoot, base);
}

afterAll(() => {
  rmSync(guardRoot, { recursive: true, force: true });
});

describe("course family guard", () => {
  it("passes a consistent two-locale family", () => {
    const dir = buildFamily("consistent", {});
    const result = guardCourseFamily(dir);
    expect(result.violations).toEqual([]);
    expect(result.ok).toBe(true);
    expect(result.warnings.join("\n")).toContain("首发六语尚缺");
  });

  it("fails when a variant misses required files", () => {
    const result = guardCourseFamily(buildFamily("missing-file", { missingFile: "glossary.json" }));
    expect(result.ok).toBe(false);
    expect(result.violations.some((v) => v.includes("en") && v.includes("glossary.json"))).toBe(true);
  });

  it("fails when lesson slug sets differ across variants", () => {
    const result = guardCourseFamily(buildFamily("slug-mismatch", { lessonRename: "02-other.md" }));
    expect(result.ok).toBe(false);
    expect(result.violations.some((v) => v.includes("课节文件集合"))).toBe(true);
  });

  it("fails when a SKILL.md frontmatter block is translated", () => {
    const result = guardCourseFamily(buildFamily("translated-artifact", { translateArtifact: true }));
    expect(result.ok).toBe(false);
    expect(result.violations.some((v) => v.includes("zh/01-alpha.md") && v.includes("不得翻译"))).toBe(true);
  });

  it("fails when README lang disagrees with the locale directory", () => {
    const result = guardCourseFamily(buildFamily("lang-mismatch", { langMismatch: true }));
    expect(result.ok).toBe(false);
    expect(result.violations.some((v) => v.includes("en") && v.includes("frontmatter lang"))).toBe(true);
  });

  it("fails on locale directories outside the registry", () => {
    const result = guardCourseFamily(buildFamily("unknown-locale", { unknownLocale: true }));
    expect(result.ok).toBe(false);
    expect(result.violations.some((v) => v.includes("fr"))).toBe(true);
  });

  it("fails when interaction block ids diverge across variants", () => {
    const result = guardCourseFamily(buildFamily("id-mismatch", { idMismatch: true }));
    expect(result.ok).toBe(false);
    expect(result.violations.some((v) => v.includes("互动块 id"))).toBe(true);
  });
});

// --- placeholder detection ---

describe("placeholder detection", () => {
  it("flags real placeholders", () => {
    expect(hasPlaceholderText("still <fill this in>")).toBe(true);
    expect(hasPlaceholderText("TODO: write this")).toBe(true);
    expect(hasPlaceholderText("TBD")).toBe(true);
    expect(hasPlaceholderText("待补")).toBe(true);
  });

  it("does not flag Romance-language words containing todo", () => {
    expect(hasPlaceholderText("Empilhar todos os sinônimos")).toBe(false);
    expect(hasPlaceholderText("una metodologia completa")).toBe(false);
    expect(hasPlaceholderText("leen todos los recursos")).toBe(false);
  });
});

describe("ladder metadata", () => {
  const families = scanCourseFamilies(join(process.cwd(), "courses"));

  it("gives every published variant a tier, an order, and an outcome line", () => {
    const bad: string[] = [];
    for (const family of families) {
      for (const variant of family.variants) {
        if (![1, 2, 3].includes(variant.tier)) bad.push(`${family.slug}/${variant.locale}: tier=${variant.tier}`);
        if (!Number.isInteger(variant.order)) bad.push(`${family.slug}/${variant.locale}: order`);
        if (!variant.outcome.trim()) bad.push(`${family.slug}/${variant.locale}: outcome empty`);
      }
    }
    expect(bad).toEqual([]);
  });

  it("inlines a logo for every family so the card can render its mark", () => {
    const missing = families
      .flatMap((f) => f.variants.map((v) => ({ f, v })))
      .filter(({ v }) => !v.logoSvg || !v.logoSvg.includes("<svg"))
      .map(({ f, v }) => `${f.slug}/${v.locale}`);
    expect(missing).toEqual([]);
  });

  it("keeps tier copy for all six locales", () => {
    for (const { code } of LOCALES) {
      const tiers = siteCopyFor(code).reader.tiers;
      for (const t of [1, 2, 3] as const) {
        expect(tiers[t].label.length).toBeGreaterThan(0);
        expect(tiers[t].blurb.length).toBeGreaterThan(0);
      }
    }
  });
});
