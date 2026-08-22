import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = process.cwd();

function filesBelow(directory: string): string[] {
  const root = join(ROOT, directory);
  if (!existsSync(root)) return [];
  return readdirSync(root, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => relative(ROOT, join(entry.parentPath, entry.name)))
    .sort();
}

function productionFiles(): string[] {
  return [...filesBelow("app"), ...filesBelow("components"), ...filesBelow("lib")];
}

describe("open course site boundary", () => {
  it("ships no server API or product-account routes", () => {
    expect(existsSync(join(ROOT, "app/api"))).toBe(false);

    const forbiddenRoutes = [
      "app/balance",
      "app/buy",
      "app/console",
      "app/dsh",
      "app/install",
      "app/internal",
      "app/privacy",
      "app/refund",
      "app/report",
      "app/review",
      "app/s",
      "app/terms",
      "app/topup",
      "app/workflow",
    ];
    expect(forbiddenRoutes.filter((route) => existsSync(join(ROOT, route)))).toEqual([]);
  });

  it("contains no Ask, review, podcast, publishing, payment, or learner-state modules", () => {
    const forbiddenPath = /(?:^|[-/])(?:ask|review|podcast|publish(?:ed|ing)?|paddle|entitlement|progress|learner-memory|lesson-notes|live-appendix|eve-quiz|blog|purchase|showcase)(?:[-./]|$)/i;

    expect(productionFiles().filter((file) => forbiddenPath.test(file))).toEqual([]);
  });

  it("contains no removed product surfaces in production source", () => {
    const forbidden = [
      /podcast/i,
      /ask[- ]?ai/i,
      /ask-dock/i,
      /live-drawer/i,
      /review-(?:page|session|settlement)/i,
      /paddle/i,
      /topup/i,
      /alipay/i,
      /publish-copy/i,
    ];

    const violations = productionFiles().flatMap((file) => {
      const source = readFileSync(join(ROOT, file), "utf8");
      return forbidden
        .filter((pattern) => pattern.test(source))
        .map((pattern) => `${file}: ${pattern}`);
    });

    expect(violations).toEqual([]);
  });

  it("has no hosted-product runtime dependencies", () => {
    const packageJson = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8")) as {
      dependencies?: Record<string, string>;
    };
    const dependencies = Object.keys(packageJson.dependencies ?? {});

    expect(dependencies).not.toContain("@vercel/analytics");
    expect(dependencies).not.toContain("eve");
    expect(dependencies).not.toContain("qrcode");
  });

  it("derives the page locale from the URL, never from query params", () => {
    const queryLocaleFiles = productionFiles()
      .filter((file) => /\.(?:ts|tsx)$/.test(file))
      .filter((file) => readFileSync(join(ROOT, file), "utf8").includes("useSearchParams"));

    expect(queryLocaleFiles).toEqual([]);
  });

  it("keeps no query-param language helper or ?lang= links in production source", () => {
    const withQueryLang = productionFiles().filter((file) => {
      const source = readFileSync(join(ROOT, file), "utf8");
      return source.includes("withLang") || source.includes("?lang=");
    });

    expect(withQueryLang).toEqual([]);
  });

  it("serves prerendered course routes from read-only Worker static assets", () => {
    const openNextConfig = readFileSync(join(ROOT, "open-next.config.ts"), "utf8");

    expect(openNextConfig).toContain("static-assets-incremental-cache");
    expect(openNextConfig).toContain("incrementalCache: staticAssetsIncrementalCache");
    expect(openNextConfig).toContain("enableCacheInterception: true");
  });

  it("serves courses from locale-first routes only", () => {
    const required = [
      "app/[locale]/layout.tsx",
      "app/[locale]/courses/page.tsx",
      "app/[locale]/[course]/page.tsx",
      "app/[locale]/[course]/[lesson]/page.tsx",
      "app/[locale]/[course]/glossary/page.tsx",
      "app/[locale]/[course]/sources/page.tsx",
      "components/course-markdown.tsx",
      "components/copy-markdown-text.tsx",
      "components/selection-copy.tsx",
      "lib/courses.ts",
    ];
    expect(required.filter((file) => !existsSync(join(ROOT, file)))).toEqual([]);

    // No duplicate un-prefixed canonical course routes may survive.
    const retired = [
      "app/courses/page.tsx",
      "app/[course]/page.tsx",
      "app/[course]/[lesson]/page.tsx",
      "app/[course]/glossary/page.tsx",
      "app/[course]/sources/page.tsx",
    ];
    expect(retired.filter((file) => existsSync(join(ROOT, file)))).toEqual([]);
  });

  it("redirects the root to the default locale course library", () => {
    const rootPage = readFileSync(join(ROOT, "app/(root)/page.tsx"), "utf8");

    // The literal target is pinned via DEFAULT_LOCALE (asserted === "en" in
    // course-localization.test.ts); here we guard the redirect wiring itself.
    expect(rootPage).toContain("DEFAULT_LOCALE");
    expect(rootPage).toContain("/courses");
    expect(rootPage).toContain("redirect(");
    expect(rootPage).not.toContain("?lang=");
  });

  it("sets <html lang> from the locale segment and cleans the header", () => {
    const localeLayout = readFileSync(join(ROOT, "app/[locale]/layout.tsx"), "utf8");
    const header = readFileSync(join(ROOT, "components/site-header.tsx"), "utf8");
    const outline = readFileSync(join(ROOT, "components/on-this-page.tsx"), "utf8");
    const lessonPage = readFileSync(join(ROOT, "app/[locale]/[course]/[lesson]/page.tsx"), "utf8");

    // Separate root layouts: the old fixed-locale root layout is gone.
    expect(existsSync(join(ROOT, "app/layout.tsx"))).toBe(false);
    expect(localeLayout).toContain("htmlLang");
    expect(localeLayout).toContain("isLocale");
    expect(lessonPage).toContain("params");

    // The obsolete header course label is removed for good.
    expect(header).not.toContain("当前 Agent 课程");
    expect(header).not.toContain("Current Agent courses");

    // Desktop page outline stays.
    expect(outline).toContain("lg:block");
  });
});
