---
name: generate-course-from-topic
description: Generate a sourced, interactive Markdown course about a current Agent topic for Agent Mentor Learn. This is the open-course adaptation of the original Agent Mentor skill.
---

# Generate Course From Topic

This repository reuses Agent Mentor's original course-authoring system: the same lesson shape, learner model, source contract, interaction blocks, guard, templates, and six-dimension quality rubric. Content and rendering stay decoupled; this skill writes Markdown and JSON under `lessons/`, while the Next.js reader renders them.

## Hard boundary for this repository

- Generate courses only when the subject is directly about AI agents, coding agents, agent skills, agent harnesses, tool use, context engineering, evaluation, safety, or an immediately adjacent Agent workflow.
- The subject must be current enough to justify a new public course. Record `topicCurrency.checkedAt`, the dated evidence used to judge currency, and what may become stale in `agentmentor.json`.
- Reject generic programming, design, productivity, finance, or AI topics that do not teach an Agent capability or decision.
- Do not add account, payment, hosted inference, in-page AI answers, review sessions, audio, or publishing workflows. The course is static, public, and source-backed.
- Every lesson must remain useful when read as plain Markdown. Browser interactions are local and deterministic; personalized follow-up goes back to the learner's own Agent through copy buttons.

## Output path

Resolve the repository root first. Write the course to:

`<repo>/agent-mentor/skills/generate-course-from-topic/lessons/learn-<slug>/`

The public route strips `learn-`: `learn-agent-harness-engineering` becomes `/agent-harness-engineering`.

Create a minimal complete skeleton before deep polishing: `README.md`, all planned `NN-*.md` files, `sources.md`, `glossary.json`, `agentmentor.json`, and `logo.svg`. Verify the absolute path before running the guard.

## Seven-stage workflow

Follow the original pipeline in order. Read the detailed guide only when its stage is reached.

### 1. Framing

Read `docs/learner-model-contract.md`. Convert the request into terminal objectives, prerequisites, `briefCompleteness`, and a learner model. The course language follows the user's language. A topic name alone is insufficient unless the surrounding product brief already makes the audience and objective clear.

For this public site, default to a technically curious Agent user who can operate a coding assistant but has not yet mastered the named technique. The terminal objective must end in an observable Agent artifact or decision, not “understand the topic.”

### 2. Current source gathering

For every Agent topic, read `agent-learning-sources.md` first, then browse current primary sources. Prefer official documentation, standards, first-party engineering posts, repositories, and papers. Use independent authoritative sources to corroborate key claims.

At the top of `sources.md`, record the registry ids actually used:

`<!-- registry: A2, A4 -->`

Each source follows `templates/sources-template.md`: one `## Sn — Title` block with `URL:`, `authority`, the backed claim, and a short evidence note. Course prose cites `[^Sn]`. Never write Markdown footnote definitions such as `[^S1]: ...` inside `sources.md`.

For fast-moving facts, capture the source publication/update date and state the version boundary in the lesson. If a claim is not supported, drop it.

### 3. Outline

Build a prerequisite DAG and keep each beginner lesson near 3–4 new concepts, never above roughly 7. Show the lesson list, one-sentence purpose, concept counts, and projected glossary count before prose writing. In a non-interactive run, auto-confirm and record that fact in `agentmentor.json.qualitySelfReview.weakestPoints`.

### 4. Writing

Read `course-authoring-guide.md` Stage 4 and use `templates/lesson-template.md`. Open with the learner's concrete failure or decision, teach concrete-to-abstract, include worked and faded examples, and end in an action the learner can perform with an Agent.

Use Mermaid only when relationships, state, sequence, or architecture become clearer. Read `docs/interaction-selection-guide.md` before adding an interaction. Supported blocks are `agentmentor-check`, `agentmentor-order`, `agentmentor-predict`, `agentmentor-trace`, `agentmentor-code`, `agentmentor-fix`, `agentmentor-diff`, `agentmentor-hotspot`, `agentmentor-live`, and `agentmentor-action`.

Interactions are optional and purposeful: normally 0–1 per lesson, never more than 2; `agentmentor-live` is at most 1 and only for a visible front-end effect. They must be local and deterministic. `agentmentor-action` is a simple field block, not JSON. Other blocks use strict JSON. Never place an interaction inside the exercise region.

### 5. Quality check

Read `docs/course-quality-rubric.md`, then run:

```bash
node scripts/course-guard.mjs <absolute-course-dir>
node scripts/course-interaction-report.mjs <absolute-course-dir>
```

Fix every guard failure. Review report warnings; either improve the course or record why the distribution is appropriate. Complete `qualitySelfReview` and `acceptanceReview` honestly. The final decision must be `ship` before the course appears in the public library.

### 6. Exercises

Read `course-authoring-guide.md` Stage 6. Every exercise includes approach guidance, measurable completion criteria, a solution, and progressive hints. Exercises must point to a real Agent conversation, repository, terminal, or paper artifact. The copy-to-Agent button must receive enough inline context for another Agent to coach or grade without access to this repository.

### 7. Delivery

Read `course-authoring-guide.md` Stage 7. A complete course contains:

- `README.md` with `domain`, `tags`, and `lang` frontmatter, a real scope statement, objectives, prerequisites, and lesson table.
- Zero-padded lesson files such as `01-why-harnesses-fail.md`.
- `sources.md` with reachable, tagged sources.
- `glossary.json` with sourced terms plus real pitfalls and distractor rationales.
- `agentmentor.json` with the original request, learner model, scope, currency record, guard status, self-review, acceptance review, next steps, and course-local memory boundary.
- `logo.svg` following `templates/logo-template.svg`.

After guard success, run the site tests and production build from the repository root. The course is delivered only when its public route is generated and all citations, exercises, copy-to-Agent actions, glossary entries, and sources render correctly.

## Authoring references

- `course-authoring-guide.md`: full pedagogy and stage definitions.
- `docs/course-quality-rubric.md`: ship-level acceptance rubric.
- `docs/interaction-selection-guide.md`: interaction choice and field rules.
- `docs/learner-model-contract.md`: novice-ramp and learner-fit contract.
- `templates/`: exact file shapes.
- `agent-learning-sources.md`: vetted Agent-source registry; always consult it for Agent topics.
