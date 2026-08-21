# Course Localization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Convert the open Agent courses reader from query-parameter/single-language courses into six-locale, same-page-switchable course families while preserving English Skill artifacts and all existing reading/copy interactions.

**Architecture:** Course files become locale variants under one `learn-<slug>` family. A locale registry drives route validation, UI copy, language labels, and `<html lang>`. Next.js uses separate root layouts for the locale tree and the root redirect, with locale-first static routes and per-page metadata alternates. The language switcher derives links from the current course family and exact page kind, so it never falls back to a different page silently.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, Vitest, Markdown course loader, OpenNext Cloudflare.

**Spec:** `docs/superpowers/specs/2026-08-21-course-localization-design.md`

## Global Constraints

- The six launch locales are `en`, `zh`, `ja`, `ko`, `es`, and `pt-BR`.
- Official course URLs use `/{locale}/courses`, `/{locale}/{course}`, `/{locale}/{course}/{lesson}`, `/{locale}/{course}/glossary`, and `/{locale}/{course}/sources`.
- `/` redirects to `/en/courses`; no course link may use `?lang=`.
- Skill artifacts (`SKILL.md`, frontmatter, names, paths, commands, references/assets/scripts examples, and real trigger prompts) remain English.
- Teaching prose, UI copy, exercise text, feedback, glossary definitions, and source notes are localized per variant.
- The language menu only lists exact same-page variants that exist and are published.
- The old “当前 Agent 课程 / Current Agent courses” header label is removed.
- No runtime translation, model call, database, KV, auth, payment, podcast, review, or dashboard behavior is introduced.
- Completion requires `npm test`, `npm run build`, `npm run cf:build`, course guard/interaction checks, and agent-browser desktop/mobile checks.

---

### Task 1: Locale registry, family/variant loader, and route helpers

**Files:**
- Create: `lib/locales.ts`
- Modify: `lib/courses.ts`
- Modify: `lib/i18n.ts`
- Modify: `lib/paths.ts`
- Create: `tests/course-localization.test.ts`

**Interfaces:**
- `lib/locales.ts` exports `LOCALES`, `type Locale`, `localeInfo(locale)`, `isLocale(value)`, and `siteCopyFor(locale)`.
- `lib/courses.ts` exports `CourseFamily`, `CourseVariant`, `scanCourseFamilies()`, `findCourseVariant()`, and `pageVariants()`.
- `lib/i18n.ts` exports `type Locale` from `lib/locales.ts`, `localePath(locale, path)`, `samePageLocaleLinks()`, and no query-param language helper.

- [ ] **Step 1: Write failing tests**

Add tests that prove:

```ts
expect(LOCALES.map((x) => x.code)).toEqual(["en", "zh", "ja", "ko", "es", "pt-BR"]);
expect(localePath("zh", "/agent-skills-reuse/02-skill-metadata"))
  .toBe("/zh/agent-skills-reuse/02-skill-metadata");
expect(localePath("en", "/courses")).toBe("/en/courses");
```

Create a temporary fixture family with `zh/README.md`, `en/README.md`, and one lesson, then assert the scanner returns one family with two variants and that a missing lesson is excluded from exact-page language links.

Run: `npx vitest run tests/course-localization.test.ts`

Expected: FAIL because the registry and family scanner do not exist.

- [ ] **Step 2: Implement the minimal registry and loader**

Use `LOCALES` as the single source of truth for six locale codes, labels, HTML language tags, and default site copy. Change course scanning from one directory = one course to one family directory containing locale subdirectories. Preserve the existing lesson parsing, glossary/source paths, minutes, logo, and frontmatter checks inside `CourseVariant`.

`pageVariants(family, page)` must accept `{ kind: "course" | "lesson" | "glossary" | "sources"; lesson?: string }` and return only variants with the requested exact file/page.

- [ ] **Step 3: Run tests**

Run: `npx vitest run tests/course-localization.test.ts`

Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add lib/locales.ts lib/courses.ts lib/i18n.ts lib/paths.ts tests/course-localization.test.ts
git commit -m "feat: add locale-aware course family model"
```

### Task 2: Locale-first route tree and dynamic root layouts

**Files:**
- Create: `app/[locale]/layout.tsx`
- Create: `app/[locale]/courses/page.tsx`
- Move/modify: `app/[course]/page.tsx` → `app/[locale]/[course]/page.tsx`
- Move/modify: `app/[course]/[lesson]/page.tsx` → `app/[locale]/[course]/[lesson]/page.tsx`
- Move/modify: `app/[course]/glossary/page.tsx` → `app/[locale]/[course]/glossary/page.tsx`
- Move/modify: `app/[course]/sources/page.tsx` → `app/[locale]/[course]/sources/page.tsx`
- Create/modify: `app/(root)/layout.tsx`
- Move/modify: `app/page.tsx` → `app/(root)/page.tsx`
- Modify: `app/layout.tsx` (remove old fixed-locale root layout)
- Modify: `components/course-nav.tsx`
- Modify: `components/breadcrumbs.tsx`
- Modify: `components/course-tile.tsx`
- Modify: `components/lesson-nav-footer.tsx`
- Modify: `components/course-page-shell.tsx`
- Modify: `tests/open-course-boundary.test.ts`

**Interfaces:**
- Locale pages receive `params: Promise<{ locale: string; course?: string; lesson?: string }>` and reject unknown locales with `notFound()`.
- `CourseNav`, `Breadcrumbs`, `CourseTile`, and `LessonNavFooter` receive `locale` plus the current `CourseVariant`.
- The locale root layout renders `<html lang={localeInfo(locale).htmlLang}>` and passes locale-specific site chrome into `SiteHeader`.

- [ ] **Step 1: Write failing route tests**

Extend route tests to assert:

```ts
expect(readFileSync("app/[locale]/layout.tsx", "utf8")).toContain("htmlLang");
expect(readFileSync("app/[locale]/[course]/[lesson]/page.tsx", "utf8")).toContain("params");
expect(allProductionFiles.some((f) => readFileSync(f, "utf8").includes("useSearchParams"))).toBe(false);
expect(allProductionFiles.some((f) => readFileSync(f, "utf8").includes("当前 Agent 课程"))).toBe(false);
```

Add a test that the root redirect target is `/en/courses`.

Run: `npx vitest run tests/open-course-boundary.test.ts`

Expected: FAIL because the locale route tree does not exist.

- [ ] **Step 2: Implement the route tree**

Move the existing route implementations into the locale segment, replace direct `scanCourses()` calls with `scanCourseFamilies()` + `findCourseVariant()`, and prefix every internal href with the active locale. Add separate root layouts so locale pages can set `<html lang>` from route params while `/` remains a simple redirect.

Do not keep duplicate old course routes. Unknown unprefixed course paths must not silently render a second canonical page.

- [ ] **Step 3: Run route tests and a production type check**

Run: `npx vitest run tests/open-course-boundary.test.ts`

Run: `npm run build`

Expected: both PASS.

- [ ] **Step 4: Commit**

```bash
git add app components lib tests/open-course-boundary.test.ts
git commit -m "feat: serve courses from locale-first routes"
```

### Task 3: Same-page language switcher and header cleanup

**Files:**
- Create: `components/language-switcher.tsx`
- Modify: `components/site-header.tsx`
- Modify: `components/course-page-shell.tsx`
- Modify: `lib/site-copy.ts`
- Modify: `tests/open-course-boundary.test.ts`

**Interfaces:**
- `LanguageSwitcher` receives `links: Array<{ locale: Locale; label: string; href: string }>` and `current: Locale`.
- `SiteHeader` receives `locale`, `languageLinks`, and no `courseLanguages` query/path map.

- [ ] **Step 1: Write failing component/contract tests**

Assert the header source contains `LanguageSwitcher`, does not contain `当前 Agent 课程` or `Current Agent courses`, and the component renders a named current-language button with exact-page links.

Run: `npx vitest run tests/open-course-boundary.test.ts`

Expected: FAIL.

- [ ] **Step 2: Implement the switcher**

Create a small client component with a button labeled by the current locale’s local name and a chevron. Render only links supplied by the server for the exact page. Add keyboard support, `aria-expanded`, `aria-haspopup`, escape-to-close, and outside-click close. Preserve the current path kind and lesson slug in each href.

Remove the obsolete “当前 Agent 课程 / Current Agent courses” span.

- [ ] **Step 3: Localize the screenshot’s interaction**

In the Chinese course variant, keep the real English Skill descriptions but add short Chinese role labels so the options are not an unexplained English block. Apply the same structural convention to other language variants when they are authored.

- [ ] **Step 4: Run tests**

Run: `npx vitest run tests/open-course-boundary.test.ts tests/course-localization.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add components lib/site-copy.ts tests/open-course-boundary.test.ts
git commit -m "feat: add same-page language switcher"
```

### Task 4: Six locale course variants

**Files:**
- Move: `agent-mentor/skills/generate-course-from-topic/lessons/learn-agent-skills-reuse/*` → locale variant directories
- Create: `agent-mentor/skills/generate-course-from-topic/lessons/learn-agent-skills-reuse/en/**`
- Create: `.../ja/**`
- Create: `.../ko/**`
- Create: `.../es/**`
- Create: `.../pt-BR/**`
- Modify: `.../zh/**`
- Modify: `scripts/course-guard.mjs`
- Modify: `scripts/course-interaction-report.mjs`
- Create: `scripts/course-family-guard.mjs`

**Interfaces:**
- Every locale variant contains README, six lessons, glossary, sources, and `agentmentor.json`.
- `course-family-guard.mjs <family-dir>` checks locale membership, identical lesson slug sets, complete required files, internal locale links, and English Skill artifact blocks.

- [ ] **Step 1: Add failing family guard tests**

Create fixtures for missing locale files, mismatched lesson names, and translated `SKILL.md` frontmatter. Assert the family guard fails with a concrete message for each.

Run: `npx vitest run tests/course-localization.test.ts`

Expected: FAIL because the family guard does not exist.

- [ ] **Step 2: Move the existing Chinese course into `zh/`**

Set README frontmatter `lang: zh`, keep all actual Skill artifacts in English, and update the interaction option presentation to include Chinese role explanations without translating the artifact text.

- [ ] **Step 3: Author the English variant**

Translate teaching prose and UI-facing exercise text into English. Keep every real Skill artifact, YAML field, command, path, and example trigger prompt in English. Use the same lesson slugs and interaction block IDs as Chinese.

- [ ] **Step 4: Author Japanese, Korean, Spanish, and Brazilian Portuguese variants**

Each variant must be a complete reviewed course, not a translated README only. Keep the six lesson slugs identical, localize teaching prose and exercise text, and retain the English Skill artifacts.

- [ ] **Step 5: Run per-variant checks**

Run:

```bash
for locale in en zh ja ko es pt-BR; do
  node scripts/course-guard.mjs agent-mentor/skills/generate-course-from-topic/lessons/learn-agent-skills-reuse/$locale
  node scripts/course-interaction-report.mjs agent-mentor/skills/generate-course-from-topic/lessons/learn-agent-skills-reuse/$locale
done
node scripts/course-family-guard.mjs agent-mentor/skills/generate-course-from-topic/lessons/learn-agent-skills-reuse
```

Expected: all commands PASS with no interaction warnings.

- [ ] **Step 6: Commit**

```bash
git add agent-mentor/skills/generate-course-from-topic/lessons/learn-agent-skills-reuse scripts
git commit -m "feat: add six locale Agent Skills course variants"
```

### Task 5: Metadata, hreflang, sitemap, and locale-aware library

**Files:**
- Modify: `app/[locale]/courses/page.tsx`
- Modify: `app/[locale]/[course]/page.tsx`
- Modify: `app/[locale]/[course]/[lesson]/page.tsx`
- Modify: `app/[locale]/[course]/glossary/page.tsx`
- Modify: `app/[locale]/[course]/sources/page.tsx`
- Modify: `app/sitemap.ts`
- Create/modify: `app/robots.ts`
- Modify: `lib/site-copy.ts`
- Create: `tests/seo-localization.test.ts`

**Interfaces:**
- Page metadata includes canonical plus `alternates.languages` for exact-page variants and `x-default` for English.
- Sitemap emits `/en`, `/zh`, `/ja`, `/ko`, `/es`, `/pt-BR` pages only when variants exist.

- [ ] **Step 1: Write failing SEO tests**

Assert metadata helpers produce canonical `/zh/...`, exact-page alternates, and no alternate for missing lesson variants. Assert the sitemap contains six locale course URLs and no query-param locale URLs.

Run: `npx vitest run tests/seo-localization.test.ts`

Expected: FAIL.

- [ ] **Step 2: Implement metadata and sitemap**

Use a shared helper to build canonical and alternates from `CourseFamily` and page kind. Keep title/description from the current `CourseVariant`. Set `x-default` only when the English exact page exists.

- [ ] **Step 3: Run tests and build**

Run: `npx vitest run tests/seo-localization.test.ts`

Run: `npm run build`

Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add app lib tests/seo-localization.test.ts
git commit -m "feat: add localized metadata and sitemap"
```

### Task 6: Whole-branch verification and browser acceptance

**Files:**
- Modify only files required by verification findings.
- Create: `.superpowers/sdd/course-localization/progress.md`

- [ ] **Step 1: Run the complete automated suite**

Run:

```bash
npm test
npm run build
npm run cf:build
```

Expected: all commands exit 0.

- [ ] **Step 2: Start the reader and inspect each launch locale**

Use `agent-browser` with Edge on:

```text
/en/agent-skills-reuse/02-skill-metadata
/zh/agent-skills-reuse/02-skill-metadata
/ja/agent-skills-reuse/02-skill-metadata
/ko/agent-skills-reuse/02-skill-metadata
/es/agent-skills-reuse/02-skill-metadata
/pt-BR/agent-skills-reuse/02-skill-metadata
```

For each page verify the language menu, same-page hrefs, right-side outline, interactive block, copy controls, and no obsolete header text.

- [ ] **Step 3: Inspect mobile layout**

Use `agent-browser` viewport commands or a mobile-sized browser window. Verify the language switcher remains understandable, the right-side outline does not cover content, and the copy-to-Agent action remains reachable.

- [ ] **Step 4: Run the boundary scan**

Run:

```bash
rg -n "ask ai|topup|review|podcast|\\?lang=zh|当前 Agent 课程|Current Agent courses" app components lib
```

Expected: only intentional test/spec references remain; no runtime route or obsolete UI logic remains.

- [ ] **Step 5: Commit verification-only fixes**

```bash
git add .
git commit -m "test: verify localized course reader"
```

