# Open-courses visual ELI5 Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans. TDD. Checkboxes.

**Goal:** Public lessons can show an editorial HTML picture inline; skills-reuse lessons 01 and 03 use that so a human sees the mechanism before the term.

**Architecture:** Port `visual-explainer` parse/load/srcdoc from the skill reader. Wire `CourseMarkdown` like other `agentmentor-*` fences. Guard cheap HTML. Rewrite two lessons × six locales.

**Tech Stack:** Next.js 16, vitest, existing Streamdown custom renderers.

---

### Task 1: Parse/load/srcdoc (TDD)

**Files:** `lib/visual-explainer.ts`, `lib/visual-explainer.test.ts`, `lib/visual-explainer-load.ts`, `lib/visual-explainer-load.test.ts`

Port skill tests; implement until green.

### Task 2: Render + copy + CSS

**Files:** `components/visual-explainer-block.tsx`, `components/course-markdown.tsx`, `app/[locale]/[course]/[lesson]/page.tsx`, `lib/site-copy.ts`, `app/globals.css`

### Task 3: Guard visual fences

**Files:** `scripts/course-guard.mjs`, `scripts/course-family-guard.mjs`, `tests/visual-guard.test.ts`

### Task 4: Course content

zh+en authored here; ja/ko/es/pt-BR same SVG, translated labels. Lessons 01 and 03 only.
