# Open-courses visual explainers (治标)

**Date:** 2026-08-25  
**Repo:** `agent-mentor-open-courses`  
**Depends on:** skill editorial bar (`agent-mentor-skill` `skill/visual-editorial-bar`)

## Goal

The public reader embeds `agentmentor-visual` so a human sees the mechanism as a picture, then reads the sourced sentences. Not a mini-game. Not a second explainer product.

## Scope

- **Reader:** parse fence, load `visuals/*.html` from the locale course dir, render inline iframe in the existing interactive-card chrome.
- **Guard:** same cheap-HTML bar as the skill (SVG, static no script/button, paper/ink hex, no engagement chrome, no Material blue).
- **Content:** `learn-agent-skills-reuse` only, all six locales. Two pictures:
  1. Lesson 01 — three homes for the same eight-line workflow (paste / always-on / skill).
  2. Lesson 03 — load ladder (startup / match / on-demand). Replaces the mermaid.
- Other open courses: no visuals this pass.
- No `/explainers` routes. No Motion demos.

## Picture-then-mechanism (content rule)

- Fence sits at the start of the explanation chunk it illustrates.
- After the picture: a few cited sentences. Do not restate the picture as a second diagram.
- HTML is embed-first: kicker + SVG + one note. Fence `title`/`caption` are reader chrome.
- Body language matches the locale. `SKILL.md` / filenames stay English.

## Reader details

- `srcdoc` + `sandbox=""` for static (`allow-same-origin` so the parent can measure height). `allow-scripts` only if `interactive: true`.
- Iframe well uses `--background`, not white. No extra radius on the frame (card already has the masthead).
- `CourseMarkdown` receives `visualHtmlBySrc` from the lesson page (server `readFileSync`).
