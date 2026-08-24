# Course Matrix Progress — Task 16 Full Site Acceptance

- **Date:** 2026-08-24
- **Branch:** `codex/rebuild-agent-skills-course`
- **HEAD (pre-commit):** `309e84edca4fc2aada967a11e230395e904e4a70`
- **Path correction:** courses live under `courses/learn-<slug>/<locale>`, NOT under `agent-mentor/skills/...`

## 1) 48 course-guards — PASS

All 48 variants GUARD ok (--skip-url-check):

| Course | en | zh | ja | ko | es | pt-BR |
|--------|----|----|----|----|----|-------|
| agent-first-real-task | ok | ok | ok | ok | ok | ok |
| brief-an-agent | ok | ok | ok | ok | ok | ok |
| agent-skills-reuse | ok | ok | ok | ok | ok | ok |
| agent-context-engineering | ok | ok | ok | ok | ok | ok |
| verify-agent-output | ok | ok | ok | ok | ok | ok |
| agent-readable-repo | ok | ok | ok | ok | ok | ok |
| agent-tools-mcp | ok | ok | ok | ok | ok | ok |
| orchestrating-agents | ok | ok | ok | ok | ok | ok |

## 2) 8 family-guards — PASS

All eight families FAMILY GUARD ok:

- agent-first-real-task
- brief-an-agent
- agent-skills-reuse
- agent-context-engineering
- verify-agent-output
- agent-readable-repo
- agent-tools-mcp
- orchestrating-agents

## 3) Site builds — PASS

- unit tests: PASS 4 files, 53 tests
- production build: PASS 433 static pages
- cloudflare build: PASS OpenNext complete, 433 pages

Build page count: **433**

## 4) Boundary scan — PASS (clean)

Scanned app, components, lib for forbidden product strings; excluded reviewed paths.

Result: clean

## Leftover non-blocking issues

- cloudflare build logged non-fatal Failed to copy for hast-util packages; build still completed.
- esbuild warning about equals-negative-zero in generated SSR chunk; does not fail the build.

## Notes

- Browser sampling may be done separately while the dev server runs.
- Existing dev server was not killed or restarted.
- Paths used: `courses/learn-<slug>/<locale>` (corrected from outdated plan paths).
