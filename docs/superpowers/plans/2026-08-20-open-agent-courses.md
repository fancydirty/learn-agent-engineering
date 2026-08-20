# Agent Mentor Open Courses Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build an independent, searchable Agent-course library on Cloudflare Workers with static lessons and copy-to-Agent interactions.

**Architecture:** Next.js App Router reads validated course files from `content/courses` at build time and statically generates all editorial routes. Small client components handle clipboard and Mermaid only; no product backend or learner state exists.

**Tech Stack:** Next.js, React, TypeScript, Vitest, Testing Library, React Markdown, Mermaid, `@opennextjs/cloudflare`, Wrangler.

**Spec:** `docs/superpowers/specs/2026-08-20-open-agent-courses-design.md`

## Global Constraints

- Public origin is exactly `https://learn.agentmentor.dev`.
- All indexed courses are Agent-primary, current, source-backed, and complete without purchase.
- No payment, account, AI response, review, podcast, progress, or buyer-publishing logic.
- Course content is CC BY 4.0; site code is MIT.
- All routes are statically generatable and unknown slugs return 404.
- Every product CTA carries course-level UTM attribution.

---

### Task 1: Project contract and course admission

**Files:**
- Create: `package.json`, `tsconfig.json`, `next.config.ts`, `vitest.config.ts`, `vitest.setup.ts`
- Create: `lib/course-schema.ts`, `lib/courses.ts`, `lib/urls.ts`
- Create: `lib/course-schema.test.ts`, `lib/urls.test.ts`
- Create: `content/courses/agent-skill-engineering-2026/course.json`

**Interfaces:**
- Produces `CourseManifest`, `Course`, `listCourses()`, `getCourse(slug)`, `courseUrl()`, `lessonUrl()`, and `productUrl()`.

- [ ] Write tests that reject a non-Agent course, fewer than two evidence signals, stale or malformed review dates, missing lessons, and path traversal.
- [ ] Run the focused tests and verify they fail because the loader and URL helpers do not exist.
- [ ] Implement the minimal validated loader and attributed URL helpers.
- [ ] Run the focused tests and verify they pass.

### Task 2: First source-backed Agent course

**Files:**
- Create: `content/courses/agent-skill-engineering-2026/README.md`
- Create: `content/courses/agent-skill-engineering-2026/lessons/01-skill-is-a-contract.md`
- Create: `content/courses/agent-skill-engineering-2026/lessons/02-progressive-disclosure.md`
- Create: `content/courses/agent-skill-engineering-2026/lessons/03-evals-and-failure-boundaries.md`
- Create: `content/courses/agent-skill-engineering-2026/lessons/04-package-and-ship.md`
- Create: `content/courses/agent-skill-engineering-2026/glossary.json`
- Create: `content/courses/agent-skill-engineering-2026/sources.md`
- Create: `lib/content-integrity.test.ts`

**Interfaces:**
- The manifest declares all four lesson files in order; `getCourse()` returns their raw Markdown and glossary data.

- [ ] Write an integrity test requiring every lesson, glossary term, source URL, and review date to be present and internally consistent.
- [ ] Run it and verify failure against the manifest-only fixture.
- [ ] Add original, source-linked course content with a tested skill template and failure-analysis exercise.
- [ ] Run the integrity test and verify it passes.

### Task 3: Static editorial routes

**Files:**
- Create: `app/layout.tsx`, `app/page.tsx`, `app/not-found.tsx`, `app/globals.css`
- Create: `app/courses/[course]/page.tsx`
- Create: `app/courses/[course]/[lesson]/page.tsx`
- Create: `app/courses/[course]/glossary/page.tsx`
- Create: `app/courses/[course]/sources/page.tsx`
- Create: `components/site-header.tsx`, `components/course-nav.tsx`, `components/breadcrumbs.tsx`, `components/course-card.tsx`
- Create: `components/pages.test.tsx`

**Interfaces:**
- All dynamic routes export `generateStaticParams` and course/lesson metadata; pages consume only `lib/courses.ts`.

- [ ] Write render tests for the home, course, lesson, glossary, sources, navigation, and missing-content behavior.
- [ ] Run them and verify failure because the pages and components are absent.
- [ ] Implement server-rendered routes and navigation with no account or app chrome.
- [ ] Run the render tests and verify they pass.

### Task 4: Markdown and copy-to-Agent interaction

**Files:**
- Create: `lib/agent-prompt.ts`, `lib/agent-prompt.test.ts`
- Create: `components/markdown.tsx`, `components/code-block.tsx`, `components/mermaid-diagram.tsx`
- Create: `components/copy-to-agent.tsx`, `components/selection-to-agent.tsx`
- Create: `components/copy-interactions.test.tsx`

**Interfaces:**
- Produces `buildLessonPrompt()` and `buildSelectionPrompt()` pure functions; client components receive already-built prompt context.

- [ ] Write failing tests for prompt provenance, selected text, source URL, clipboard success, and clipboard failure feedback.
- [ ] Verify failures are due to missing prompt and client components.
- [ ] Implement the pure prompt builders and clipboard-only UI, then add Markdown/GFM/math/Mermaid rendering.
- [ ] Run focused and full tests and verify they pass without console warnings.

### Task 5: SEO and forbidden-feature boundary

**Files:**
- Create: `app/robots.ts`, `app/sitemap.ts`, `app/manifest.ts`
- Create: `components/course-json-ld.tsx`
- Create: `lib/seo.test.ts`, `tests/boundary.test.ts`
- Create: `docs/seo/SEO-STATE.md`

**Interfaces:**
- Sitemap exposes every published course artifact; boundary test scans `app`, `components`, `lib`, and dependencies.

- [ ] Write failing tests for canonical URLs, sitemap coverage, robots policy, JSON-LD, UTM links, and forbidden feature vocabulary/dependencies.
- [ ] Verify the new tests fail before implementation.
- [ ] Implement metadata, sitemap, robots, structured data, and the acquisition-state document.
- [ ] Run all tests and verify no forbidden route or dependency exists.

### Task 6: Cloudflare build and runtime proof

**Files:**
- Create: `open-next.config.ts`, `wrangler.jsonc`
- Create: `.github/workflows/ci.yml`, `.github/workflows/deploy.yml`
- Create: `.gitignore`, `README.md`, `LICENSE`, `content/LICENSE`
- Modify: `package.json`

**Interfaces:**
- `npm run preview` builds through OpenNext and starts Wrangler; `npm run deploy` uses the same adapter and custom domain configuration.

- [ ] Add OpenNext, Wrangler, CI, deployment configuration, and licenses.
- [ ] Run unit tests, type checking, linting, Next production build, and OpenNext build.
- [ ] Start the OpenNext preview in `workerd` and request the home, course, lesson, glossary, sources, robots, sitemap, and an unknown URL.
- [ ] Verify canonical metadata, copy controls, `200` responses, and a real `404` in the preview.
- [ ] Scan source and generated routes for forbidden feature vocabulary.
- [ ] Commit the complete repository on `main`; do not deploy or create the public GitHub repository until the local gate is green.

