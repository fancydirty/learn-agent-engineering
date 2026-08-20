# Course Quality Self-Review Rubric

> The agent uses this checklist to self-review a course before delivery. The mechanical gate (`node scripts/course-guard.mjs <course-dir>`) checks: structure, references, glossary, `agentmentor.json`, `briefCompleteness`, `learnerModel`, `acceptanceReview`, source URL status, source authority, mermaid diagrams, valid interaction blocks, mentor actions, common stale/absolute claims, and required novice bridging. This file checks the finer-grained pedagogical and content judgment calls.

A good course is not information crammed to the brim. It is: clear goals, clean prerequisite ordering, self-contained lessons, hands-on practice, well-sourced key facts, and prose that does not ramble.

## Six Dimensions

1. **Structural integrity (structure)**: The course-level index includes a title, objectives, prerequisites, and a lesson table; every lesson includes a title, lesson-level objectives, Prev/Next, explanation, worked example, faded example, exercises, and a summary; lesson ordering is sound.
2. **Grounded (grounded)**: Key claims involving facts, APIs, versions, or definitions are not fabricated or obviously stale; a `sources.md` exists, and key points in the body are traceable via `[^Sn]`; key facts must not rest solely on AI-generated or marketing sources; URLs must not 404 or land on a stale-domain redirect.
3. **Pedagogy (pedagogy)**: Every lesson's objectives are specific and testable; the explanation ramps concrete -> abstract; course difficulty matches `learnerModel` rather than defaulting to a semi-expert; a worked example -> faded example -> independent practice ladder is present; exercises give a clear share to "can use / can do / can judge" tasks.
4. **Effective exercises (exercises)**: Exercises are not busywork; every item includes guidance on approach, a measurable completion standard, a solution or key points, and progressive hints; exercises point learners at their own real environment (IDE/terminal/pen and paper) and never assume an embedded sandbox. The completion standard is a local checklist, not a system submission; when interaction is needed, rely on the reader's "copy exercise to agent" entry point or a lesson-specific `agentmentor-action`.
5. **Cognitive load (load)**: Each lesson stays focused, with roughly 7 or fewer new concepts; absolute-beginner lessons should compress to roughly 3-4 genuinely new concepts; explanations are cut into self-contained chunks rather than one long block; for process, dependency, state, or architecture content, use a simple table or a `mermaid` diagram to reduce one-shot reading load. Introduce terms with an everyday handle and a visible example before the formal name. Optional interaction blocks should serve a specific misconception, process ordering, or small code judgment; they must be reviewable from Markdown, renderable locally by the reader, and must not replace worked/faded examples, exercises, or the agent handoff.
6. **Readable (readable)**: Language is clear, not roundabout, not padded, and not vague; diagrams serve comprehension rather than decoration.

Before delivery, condense the six-dimension self-assessment into `agentmentor.json.qualitySelfReview`: explain the reasoning behind diagram usage, list at least 3 concrete weak points, and note what to check in the next pass. This is written for the agent that picks up the course next — do not write a vague "overall good."

The optional `agentmentor-action` is the loop from a lesson back to an agent conversation, not body content. A good action card reads like a lesson-specific training move, not a fixed button name; the user sees a short label/description, and only after copying it does the agent receive the full course path, current lesson, and interaction rules.

## Ship-Level Acceptance Criteria

Passing `course-guard.mjs` only means "mechanically deliverable," not "ready to be promoted to a showcase course." Before delivery, the course-generating agent must also run a ship-level acceptance pass and record the conclusion in `agentmentor.json.acceptanceReview`:

1. **Six-dimension scoring**: Score each of structure / grounded / pedagogy / exercises / load / readable from 1-5, and give a specific reason for any dimension scoring below 4.
2. **Learner fit**: Confirm `briefCompleteness` states clearly whether the brief was user-provided or clarified through follow-up questions; confirm `learnerModel` states the target reader, known/unknown concepts, environment, and first independent action; the first action must not depend on `unknownConcepts`; record in `acceptanceReview.learnerFitCheck` which hidden prerequisites were removed.
3. **End-state task**: Confirm the course ends with the learner able to complete a real action — for example, reading a real file, running a small script, editing a real page, or drawing a real workflow — not just "knowing the terminology."
4. **Interaction value**: Check each interaction block against `docs/interaction-selection-guide.md` to confirm it exposes a specific misconception or decision point; if a block exists only to look interactive, remove it or convert it to an exercise.
5. **Agent loop**: At least one `agentmentor-action` or exercise copy entry point must bring the user back into an agent conversation, with a prompt goal that is specific and will not expand into generic re-teaching.
6. **Source recheck**: Before promoting a technical course into `examples/`, re-open the official sources or run the current starter/tooling again — do not just reuse an old cache.
7. **Interaction selection report**: After `course-guard.mjs` passes, run `node scripts/course-interaction-report.mjs <course-dir>`. This is a non-blocking QA step that surfaces interaction over-density, templated labels, too many actions, or an `acceptanceReview.interactionCheck` that fails to explain a specific misconception. A warning does not automatically mean failure, but either revise the course or explain in the acceptance record why it is acceptable.
8. **Delivery decision**: Must be exactly one of three values:
   - `ship`: the course is ready to deliver to a user as-is.
   - `revise-before-example`: usable for dogfooding or further user iteration, but should not be committed to `examples/`.
   - `archive`: wrong scope, thin quality, unstable sources, or a clearly failed pedagogical path — archive it instead of continuing to polish it.

Minimum bar for promotion to a committed `examples/` course: `course-guard` fully passes; no dimension scores below 4; the end-state task proves the learner did one real thing; no temporary slug such as `showcase`/`test`/`dogfood`; `weakestPoints` and `acceptanceReview.blockers` have been addressed or explicitly marked non-blocking.

## Hard Rules

- The course-level index or a lesson template is missing required parts, or lessons are inconsistently shaped.
- `agentmentor.json` is missing, or course-local state is mistakenly written back as host long-term memory.
- Key content is fabricated, wrong, obviously stale, or entirely unsourced.
- A technical fact that changes across versions is written as a hardcoded conclusion, or absolute language ("always/definitely/by default always") is used for costs, SEO, or framework default behavior.
- The beginner path skips required bridging — for example, a Next.js course's early lessons use JSX, components, or JavaScript code without explanation when the learner does not yet know React/JS.
- `agentmentor.json.briefCompleteness` is missing, has thin evidence, or marks a request that is essentially just a topic name (e.g., "I want to learn X") as `user-provided` and proceeds to generate the course anyway.
- `agentmentor.json.learnerModel` is missing, is vague, or the first independent action depends on a tool/concept listed in `unknownConcepts`.
- The course stays at the "knowledge" level throughout, without a worked -> faded -> independent-practice ramp.
- Exercises are decorative: no completion standard, no solution, no hints, or they assume a sandbox.
- A single lesson is overstuffed: far more than roughly 7 new concepts, or a long explanation that is not chunked.
- Walls of text, padding, or vagueness to the point of being unreadable.
- Structure that should be a diagram is instead written as a wall of text, or conversely, a decorative diagram is inserted for looks without explaining the key structure.
- An `agentmentor-check` / `agentmentor-order` / `agentmentor-predict` / `agentmentor-trace` / `agentmentor-code` / `agentmentor-fix` / `agentmentor-diff` / `agentmentor-hotspot` interaction block has broken JSON, sits inside the exercise region (`<!-- exercises -->`), has a label/prompt that reads like a fixed template, gives feedback that only says "wrong" / "the answer is B," or exists just to look interactive with no connection to a real decision point in the body; `agentmentor-predict` must have a locally verifiable standard result; `agentmentor-trace` must have complete columns/rows/cells and at least one fillable cell; `agentmentor-code` / `agentmentor-fix` must only run local deterministic checks and must not pretend to execute project code; `agentmentor-diff`'s focus must not leak the answer, and must not embed a long PR; `agentmentor-hotspot` is only for single-point judgment on a structure diagram with 3-8 nodes — do not force a click-to-answer format onto a decorative diagram or an open-ended question with multiple valid answers.
- `agentmentor-action` uses fixed template copy, sits inside the exercise region (`<!-- exercises -->`) where the reader cannot see it, or exposes the full prompt in the body, breaking the reading experience.
- `agentmentor.json` does not honestly fill in `qualitySelfReview`, or the weak points are all empty phrases like "could be further optimized."
- `agentmentor.json.acceptanceReview` marks a course with blocking issues as `ship`, or fails to distinguish a dogfood pass from an `examples/` promotion.

If any hard rule is triggered, go back to the outline or drafting stage, fix it, and redeliver.
