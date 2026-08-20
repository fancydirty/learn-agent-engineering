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
    const productionFiles = [...filesBelow("app"), ...filesBelow("components"), ...filesBelow("lib")];
    const forbiddenPath = /(?:^|[-/])(?:ask|review|podcast|publish(?:ed|ing)?|paddle|entitlement|progress|learner-memory|lesson-notes|live-appendix|eve-quiz|blog|purchase|showcase)(?:[-./]|$)/i;

    expect(productionFiles.filter((file) => forbiddenPath.test(file))).toEqual([]);
  });

  it("contains no removed product surfaces in production source", () => {
    const productionFiles = [...filesBelow("app"), ...filesBelow("components"), ...filesBelow("lib")];
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

    const violations = productionFiles.flatMap((file) => {
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

  it("derives reader language from course frontmatter instead of URL search params", () => {
    const productionFiles = [...filesBelow("app"), ...filesBelow("components"), ...filesBelow("lib")]
      .filter((file) => /\.(?:ts|tsx)$/.test(file));
    const queryLocaleFiles = productionFiles.filter((file) =>
      readFileSync(join(ROOT, file), "utf8").includes("useSearchParams"),
    );

    expect(queryLocaleFiles).toEqual([]);
  });

  it("serves prerendered course routes from read-only Worker static assets", () => {
    const openNextConfig = readFileSync(join(ROOT, "open-next.config.ts"), "utf8");

    expect(openNextConfig).toContain("static-assets-incremental-cache");
    expect(openNextConfig).toContain("incrementalCache: staticAssetsIncrementalCache");
    expect(openNextConfig).toContain("enableCacheInterception: true");
  });

  it("keeps the original course, lesson, glossary, and sources surfaces", () => {
    const required = [
      "app/courses/page.tsx",
      "app/[course]/page.tsx",
      "app/[course]/[lesson]/page.tsx",
      "app/[course]/glossary/page.tsx",
      "app/[course]/sources/page.tsx",
      "components/course-markdown.tsx",
      "components/copy-markdown-text.tsx",
      "components/selection-copy.tsx",
      "lib/courses.ts",
    ];

    expect(required.filter((file) => !existsSync(join(ROOT, file)))).toEqual([]);
  });

  it("matches course language in the site chrome and keeps the desktop page outline", () => {
    const layout = readFileSync(join(ROOT, "app/layout.tsx"), "utf8");
    const header = readFileSync(join(ROOT, "components/site-header.tsx"), "utf8");
    const outline = readFileSync(join(ROOT, "components/on-this-page.tsx"), "utf8");
    const lessonPage = readFileSync(join(ROOT, "app/[course]/[lesson]/page.tsx"), "utf8");

    expect(layout).toContain("courseLanguages");
    expect(header).toContain("usePathname");
    expect(header).toContain("当前 Agent 课程");
    expect(outline).toContain('lang === "zh" ? "本页目录" : "On this page"');
    expect(outline).toContain("lg:block");
    expect(lessonPage).toContain("<OnThisPage items={tocFromMarkdown(lessonMarkdown)} lang={found.lang} />");
  });
});
