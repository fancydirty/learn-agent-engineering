# Interaction Selection Guide

Agent Mentor's interaction layer is not about "turning the course into a mini-game." Its sweet spot is: Markdown stays reviewable, the reader only does local deterministic feedback, and personalized follow-up questions go back to the agent by copying the current state.

When writing a lesson, ask first: after reading this section, where is the learner most likely to get a **judgable action** wrong? If there is no clear answer, do not add an interaction block.

## Selection Matrix

| Learning action | What to use | Best fit | Not a fit | What a good block looks like |
| --- | --- | --- | --- | --- |
| Identify a concept boundary | `agentmentor-check` | Binary/multiple-choice misconceptions, e.g. "Is this a Server Component or a Client Component issue?" | Rote fact recall, or a judgment that can be stated in one sentence in the body | Every wrong option maps to a real misreading; feedback explains the mechanism |
| Order sequence/dependencies | `agentmentor-order` | Request chains, debugging order, prerequisite dependencies, causal steps | Open-ended strategy with no single correct order | `feedbackWrong` points to the first dependency that is out of place |
| Predict an outcome first | `agentmentor-predict` | Output, state, CSS match, HTTP response | Requires a real running environment, or has multiple equally valid results | The standard answer is short, and the cause of error traces to one state change |
| Step-by-step trace | `agentmentor-trace` | Loop variables, prop flow, state machines, return values | A table over 8 rows, or every cell is just copied code | At least one cell is left for the learner to fill; feedback points to which flow to look at |
| Small code completion | `agentmentor-code` | A small snippet judgable by includes/regex, e.g. CSS containing block, React state read | Requires installing dependencies, running tests, calling an API, or a cross-file engineering task | The check message explains the mechanism behind the rule |
| Fix a typical mistake | `agentmentor-fix` | Right after covering a common bug, let the learner fix broken code themselves until it passes the key rule | Multiple bugs, or correctness only knowable by running the full project | `bug` states the symptom; checks do not leak the full answer |
| Read a short patch | `agentmentor-diff` | A 10-40 line diff in a Git/config/API/React boundary migration is enough to expose the mechanism | A long PR, a cross-file refactor, or a change that cannot be explained with a single choice | `focus` points to which kind of addition/deletion to look at, without saying "the answer is B" |
| Click a structure diagram | `agentmentor-hotspot` | Architecture diagrams, data flow, knowledge-base paths, or troubleshooting flows where you point at a responsibility boundary/failure point/next-step node | Decorative diagrams, diagrams where multiple nodes are equally valid, or real systems diagrams with too many nodes | 3-8 nodes, one correct hotspot, feedback explains why neighboring nodes are not responsible |
| Edit frontend code and see the effect | `agentmentor-live` | HTML/CSS/JS cases where real rendering/interaction beats text explanation, e.g. flex centering, selector priority, nesting structure; self-assessed plus view-answer, non-deterministic local feedback | Purely static display (no code change needed), a goal too open-ended to judge, or backend/algorithm/CLI topics with no frontend-visible effect | `goal` states a specific achievable target; `files` are self-contained with no external links; `solution` fills in only the key section; `copyPurpose` lets the agent see the current attempt; prefer `checks` for goals with a deterministic assertion (computed style/text/count) so the learner gets automatic verification, and keep self-assessment for goals that cannot be asserted; for "feel a few values of one property," prefer `choices` click-selection over having the learner blindly edit code |
| Return to the live mentor | `agentmentor-action` | Worth a follow-up question after finishing a lesson, reverse teaching, vulnerability hunting, or stress-test simulation | A short judgment call within the body; must not replace worked/faded examples or exercises | `label`/`description` read like a lesson-specific training move; the full prompt only unfolds after copying |
| No interaction block | none | The explanation is already clear, the exercise region already covers it, or the lesson is mainly long-form reading/reference judgment | Forcing a block in just to look advanced | State in `acceptanceReview.interactionCheck` why no block was used |

## Implementation Rule: Look For A Mature Library First

When adding or upgrading a reader interaction, check for a mature library first and only hand-roll if none fits. The priority is not "fewest dependencies" — it is course experience, maintainability, and stable real-browser behavior. Evaluate any candidate library on at least four things: license, maintenance activity, React/Next compatibility, and whether it preserves the Markdown-reviewable boundary.

Libraries currently adopted:

- `@xyflow/react`: renders the nodes/edges/labels for `agentmentor-hotspot`, avoiding a hand-rolled SVG diagram editor.
- `shiki`: syntax highlighting for plain code blocks, using a fine-grained bundle and a JS regex engine, with no real code execution.
- `@dnd-kit/core` / `@dnd-kit/sortable`: upgrades `agentmentor-order` to drag-and-drop sorting while keeping up/down button fallback.
- `katex` / `remark-math` / `rehype-katex`: renders Markdown math, supporting math/statistics/algorithms/ML courses while keeping course content reviewable Markdown.

Libraries not yet entering the core reader: heavier real-execution/IDE capabilities such as Sandpack, Pyodide, or Monaco. These may enter a separate Lab Mode later, but should not quietly slip into the stable Markdown course package.

## Authoring Rules

- A lesson normally has 0-1 body interaction blocks, at most 2; use fewer in exercise-heavy lessons or lessons that already have an `agentmentor-action`.
- Place an interaction block right after the explanation chunk it checks; do not place it inside the exercise region (`<!-- exercises -->`).
- `label`/`prompt`/`whyHere`/feedback/message must all point to a specific misconception in this lesson; do not write generic phrases like "try this," "quick quiz," "try again," or "wrong."
- `copyPurpose` is not button copy — it is the goal of the interaction once copied to the agent; write it as "have the agent check whether I'm confusing X for Y," not "quiz me."
- If the interaction needs LLM judgment, real code execution, reading multiple files, or seeing user context, put it in the exercise copy entry point or `agentmentor-action` — do not force it into a local reader block.
- `agentmentor.json.acceptanceReview.interactionCheck` must state, block by block, which interactions were used and which misconception each one serves; if no interaction was used, state why a static exercise was the better fit.

## Post-Course Interaction Report

After `course-guard.mjs` passes, run one more non-blocking report:

```bash
node scripts/course-interaction-report.mjs <course-dir>
```

It never fails the course; it only helps the author check interaction distribution: whether any lesson is over-dense, whether `agentmentor-action` has turned into a wall of buttons, whether labels repeat or look templated, and whether `acceptanceReview.interactionCheck` fails to explain some category of interaction. When the report has warnings, first judge whether they actually affect course pacing; if they do, revise the course, and if not, note why it's acceptable in the acceptance review.

## Smells

- The same label — "try this," "quiz me," "got it?" — appears in every lesson across a course.
- Feedback only states right/wrong without pointing to the mechanism.
- A diff's `focus` or feedback directly leaks "the correct option / the answer is B."
- A hotspot diagram is purely decorative, or the question itself allows multiple correct nodes.
- A hotspot diagram has too many nodes, so the learner is hunting through UI instead of judging the mechanism.
- A code/fix block implies the reader will execute code or run the project's tests.
- Every cell in a trace table is marked `given: true`, leaving the learner nothing to fill in.
- An action card exposes the full prompt to the user, or crams all eight interaction modes into a wall of buttons.
