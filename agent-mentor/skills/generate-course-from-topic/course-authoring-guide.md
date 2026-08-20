# Course Authoring Guide (execution rules for the course-generation skill)

> Stage-by-stage rules for the executing agent. Goal: no matter how oddball the topic, produce a course with stable structure, clear sourcing, and self-study readiness. Completion criteria are the six dimensions in `docs/course-quality-rubric.md`.

## Contents

Follows the seven-stage pipeline order; read each section only when you reach that stage — no need to read it all at once.

- Stage 1 Framing — objectives + prerequisites + learnerModel
- Stage 2 Sourcing — sources.md, ≥2 sources, cited, authority-tagged
- **Naming and voice (cross-cutting) — read before Stage 3, applies to every learner-facing word**
- Stage 3 Outline — syllabus, prerequisites form a DAG, load evenly distributed
- **Outline confirmation gate (between Stage 3 and Stage 4) — the outline is shown to the user and confirmed before any lesson prose is written**
- Stage 4 Lesson writing — every lesson follows the skeleton + pedagogy (hook / explanation / term ramp / diagrams / interactions / worked-faded)
- Stage 5 Quality check — guard passes + six-dimension rubric self-review
- Stage 6 Exercises — four-part structure + point at a real environment + Apply-level share
- Stage 7 Delivery — directory shape + frontmatter + deliverables checklist

## Stage 1 Framing — definition of done: objectives + prerequisites
- The topic may arrive rough. First compress it into one sentence: "a teachable scope that can be completed in ~N lessons."
- Output: course-level terminal objectives (3–6 items, verbs landing on "can use / can do / can judge") + a prerequisites list (write "none" if there are none).
- Default audience: "zero prior background in this domain, wants to self-study to hands-on competence" — unless the user gave a more specific starting point. But "zero background in the domain" does not mean "anything can be assumed": for technical courses especially, distinguish clearly whether the user already knows cross-cutting tools like the terminal, files, Git, code, browser devtools, or package managers.
- **`briefCompleteness` is mandatory**: write it per `docs/learner-model-contract.md`. `status:user-provided` applies only when the original request already gave a starting point/goal/constraints; `status:clarified` applies when the course is produced after asking questions or after external context clarifies things; `status:insufficient` means information is inadequate — stop and ask questions instead of shipping a course. A request that looks like nothing more than a topic name must NOT be tagged `user-provided`.
- **`learnerModel` is mandatory**: produce it per `docs/learner-model-contract.md`, and write it into `agentmentor.json` at the end. Fields include `targetReader`, `knownConcepts`, `unknownConcepts`, `assumedEnvironment`, `firstIndependentAction`, `noviceRamp`. When the user says "I don't understand X," X MUST go into `unknownConcepts`; the course's first step must not sneak X in as an assumed prerequisite.
- **Ask first when information is insufficient**: if all you have is a topic name and you don't know whether the learner has key prerequisites, stop and ask 1-3 questions. When information is sufficient, the executing agent should expand the learner model itself — don't offload template-filling pressure onto the user.

## Stage 2 Sourcing — definition of done: sources.md, key claims backed by ≥2 sources, cited, freshness-checked, authority-tagged
- Use whatever search/browsing tools the host agent has available to gather material: official-docs > authoritative-guide > high-quality blog.
- This skill has no built-in search provider or API key. If the host has no internet search capability, ask the user to supply reliable reference links before continuing; never pretend to have searched, and never fabricate sources.
- If high-value material lives in a YouTube video, and Stage 0 has already successfully installed/detected `yt-dlp`, you can use `node scripts/video-source-intake.mjs <url>` to extract metadata + a caption transcript; the full rules are in `docs/video-source-intake.md`. It is an optional local sourcing tool, not a hard dependency of the reader — normal course generation continues if the install fails. By default, capture only captions and metadata; do not download the full video/audio. When a video source enters the course, you must record the URL, channel/uploader, publish date, caption type (manual/auto), language, and timestamps; treat auto-generated captions with caution — technical facts must still be cross-checked against official docs or authoritative text sources.
- Every key fact/API/version/definition that makes it into the course must be corroborated by at least 2 independent sources; for technical material, prefer sources from the last 2 years.
- Produce `sources.md`: **copy the skeleton of `templates/sources-template.md` exactly**. Each source is one `## Sn — Title` block = title + `URL:` + **`- authority: <value>`** + one sentence on "what point in the course this backs" + a key-fact excerpt. ★It is **not** a Markdown footnote: NEVER write a `[^Sn]: definition` line — the body text cites with `[^Sn]`, and the reader generates the footnote from the `## Sn` block; writing `[^Sn]:` makes guard flag every citation as dangling.
  - **`authority:` value domain (mandatory to tag)**: `official-docs` (vendor/standards body/API docs) / `authoritative-guide` (well-known author/publisher/course) / `video-transcript` (an auditable transcript of an official/expert/course/conference video, must include channel, date, caption type, language, timestamps) / `encyclopedia` (Wikipedia etc. — editable but traceable) / `blog` (personal/small site, usable with good judgment) / `ai-generated` (marketing copy or AI-generated encyclopedia content with unsupported claims like "research shows / new 2026 practice" — **red flag**).
  - **Hard rule**: every key fact (one that carries a `[^Sn]` citation in the course body) must have at least one non-`ai-generated` source backing it; version/API/definition facts must not rely on a video transcript alone — they must be cross-checked against official docs, an authoritative tutorial/book, an encyclopedia, or a textbook-grade source. Prefer to drop a key fact rather than include it without an authoritative source.
- Sourcing happens **once, then is cached**; the lesson-writing stage reuses the same `sources.md` without going back online.
- **Authoritative term definitions (for the glossary)**: for every key term that makes it into the course, capture at least 1 authoritative-source definition (Wikipedia/official docs/textbook preferred), consistent with how the course explains it; record the URL in `sources.md` (an existing `[^Sn]` may be reused). Drop terms with no findable authoritative source.

## Naming and voice (cross-cutting) — the course is a competent artifact, not an ad for itself

Applies to the course title, every lesson title, and all body prose, in every language. The register is a professional instructional voice (reference points: Google developer documentation style guide, The Rust Programming Language book, MIT course catalogs, Diátaxis) — never marketing, never self-help. Without these rules, models reliably drift into promo voice ("Stop Fighting Your Layouts", "Master X in 7 Days") — that drift is a defect, same severity as a broken citation.

### Titles (course + lessons)
- **A title names the subject or the task — a noun phrase ("Error handling", "Two axes, two properties") or verb+object task ("Create a subscription"). Anything else is promo voice.** Bad: "Real Work, Verified Results" / "One Line at a Time".
- **An imperative title may only name an action performed on the material, never a correction of the learner's behavior or attitude.** Good: "Center a box with flexbox". Bad: "Stop Fighting Your Layouts" / "Embrace the Terminal".
- **Keep the learner out of titles**: no second person, no diagnosis of their past, no emphasis adverbs (Actually, Finally, Really). Bad: "HTML You'll Actually Use".
- **No transformation or outcome promises**: Master, Complete, Ultimate, Zero to Hero, "in N days", 10x. Good: "Fundamentals of asynchronous programming".
- **No invented countable nouns, no consulting jargon** (Catches, Briefings). Use ordinary names for things.
- **Course title shape stays "Topic: subtitle"**; the subtitle names scope or treatment (a practical introduction, fundamentals, from X to Y over concrete milestones) — it is not a slogan slot.
- **Within one course, all lesson titles share one grammatical form** (all noun phrases, or all imperative tasks, or all gerund+object) — pick one and hold it.
- **Formatting floor**: sentence case, no exclamation marks, ≤ ~60 characters, key noun front-loaded.
- **Personality budget: at most one stylized title per course**, and it must name a documented property of the subject (like Rust's "Fearless concurrency"), never the learner's journey or feelings.

### Prose
- **Delete difficulty minimizers and filler**: simply, just, easy, quickly, obviously, actually, "that's it". State the step instead.
- **No exclamation marks in explanation**; at most one per lesson, only at a genuine milestone the reader reached.
- **Every evaluative adjective must be paid for with a demonstration or a specific fact** — otherwise delete it (powerful, seamless, magical, game-changing).
- **Aim sentences at the learner's growing capability, never at the course's own excellence.** Good: "By the end of this lesson you can center any element without trial and error." Bad: "This comprehensive course gives you everything you need."
- **Open every lesson with the concrete problem the learner already has**, stated plainly — never with an abstract definition or enthusiasm about the topic (this sharpens the existing Hook rule).
- **Second person doing the work; conversational but not chummy**: no "let's dive in", no pop-culture wordplay in explanations; humor only as a brief aside after the concept lands, never in headings.
- **Metaphor discipline**: at most one small local analogy, and state the real mechanism in the same breath; never build a lesson on an extended analogy.
- **Name difficulty honestly** ("min-width: auto is the one genuinely confusing rule here") — never reassure it away ("don't worry, you'll never hit the edge cases").
- **Progress markers are a plain inventory of what the reader can now do** — never congratulation ("layout wizard!").

### Chinese (zh) addendum — professional zh instructional register, not translated ad copy
- **zh titles: 「主题：名词性副题」**, subtitle from the standard positioning vocabulary (入门/基础/进阶/实战/指南/原理/图解/详解). No imperative titles, no outcome verbs (学会/搞定/玩转/拿捏).
- **Ban the growth-hack vocabulary**: 一文读懂 / X分钟学会 / 保姆级 / 干货 / 秒懂 / 速通 / 小白必看 / 秘籍 / 揭秘.
- **No internet slang or chumminess** (家人们/宝子/绝绝子/yyds), no emoji in titles or headings, no rhetorical questions, no 讨好式/安抚式 phrasing (别怕/别担心/手把手带你飞), no personification.
- **No self-grading superlatives or unanchored intensifiers** (最强/最系统/最硬核/大量/非常) — use a number or delete.
- **en→zh titles are re-castings, not translations**: extract the informational core (topic + scope), recast per the zh template, and discard the en title's swagger. Good: en "CSS Flexbox: Stop Fighting Your Layouts" → 《CSS Flexbox：弹性布局详解》. Bad: 《CSS Flexbox：别再与布局缠斗》.
- Full-width punctuation and CJK/latin spacing rules stay as specified in Stage 4.

## Stage 3 Outline — definition of done: syllabus, prerequisites form a DAG, per-lesson load evenly distributed (no overloaded lesson)
- First list all concepts → order prerequisite dependencies (which must precede which; explicitly write out which prerequisite concepts each concept depends on) → split into lessons.
- **Alignment with the learner model**: treat `learnerModel.unknownConcepts` as a do-not-sneak-in list. Before any unknown concept first appears, there must be a bridging block, example, or earlier lesson covering it; if it's a tool required by the first independent action, that signals insufficient intake questioning or too steep a ramp — go back to Stage 1.
- **First-action validation**: `learnerModel.firstIndependentAction` must be achievable using only `knownConcepts` plus what was taught live in the first lesson. For a true-beginner course, don't require learners to clone a repo, read a diff, run tests, or edit config right out of the gate unless those are already in `knownConcepts`.
- **Dependency alignment check**: after splitting into lessons, verify item by item — every concept's prerequisites must appear in its own lesson or an earlier one; if a concept taught later gets used by an earlier lesson (an order inversion), go back and reorder or re-split lessons until the prerequisite relationships form a clean DAG.
- **Even load distribution (a hard rule for splitting lessons — especially important for sprawling/vague topics):**
  - After listing all concepts, **count the new concepts in each lesson one by one**.
  - For true-beginner courses, aim to compress each lesson to **~3-4 genuinely new concepts**; this isn't a rigid word count — it's to keep cross-cutting tools from being dumped on the user together with topic concepts.
  - Any lesson with **> ~5–6 new concepts must be split into two**; don't cram "whatever's left" into a catch-all final lesson.
  - **Prefer more, smaller lessons (up to 8–9) over letting any lesson overload** — many small lessons beat few crowded ones.
  - Keep lesson lengths roughly **balanced**: avoid a lesson that's twice as long as the others (that's a sign of an overload that wasn't split — go split it).
- N is determined by the topic (don't force it to 30); typically 3–9 lessons; the more sprawling the topic / the more concepts, the more you should lean toward splitting into more lessons.
- concrete→abstract: put concrete, actionable material in earlier lessons; push abstractions/principles later.
- **Also plan the glossary here, not at delivery time**: while counting new concepts per lesson, note the checkpoints each lesson will yield — the density target is 10-14 glossary entries per lesson (see Stage 7 "Glossary density"), and a lesson you can't name 10 checkpoints in is usually a lesson that needs more substance, not a glossary that needs padding. Carry the projected count into the confirmation gate below.
- **Do not start writing lessons straight out of Stage 3** — the outline confirmation gate comes first.

## Outline confirmation gate — definition of done: the user has seen the outline and said "write it" (or the run is non-interactive and the course records that no human confirmed)

Course generation is **two phases with a human gate between them**: phase 1 ends when the outline exists (Stages 1-3 — framing, sourcing, outline); phase 2 is writing the lessons (Stage 4 onward). **Do not cross from phase 1 into phase 2 on your own judgment.** An outline is cheap to change and a written course is not: reordering two lessons costs one sentence before Stage 4 and costs a rewrite of six lesson files after it. This gate exists to spend that sentence.

**In an interactive host** (Codex, Claude Code, opencode interactive mode — you can ask a question and receive an answer): lay the outline out and stop.

- Show, for the whole course: the ordered lesson list; for each lesson, one sentence on what it teaches; for each lesson, the count of genuinely new concepts; and the projected glossary entry count for the course (see the density target below — roughly 10-14 entries per lesson).
- Then ask one question that invites a change, not a yes: "Write it as laid out, or adjust?" Do not ask "does this look good?" — that reliably gets a reflexive yes.
- **Ask the three things a learner can actually judge**, because these are the defects a written course can't cheaply absorb:
  1. **Order** — does anything here depend on something taught later? (You already checked the DAG mechanically; the user knows their own head.)
  2. **Coverage** — is anything missing that they expected this course to teach, and is anything here they don't need?
  3. **Depth** — is this the depth they wanted, or is it shallower/deeper than intended?
- Accept any of: edit a lesson, drop one, add one, resplit, or redo the outline entirely. Then re-run the Stage 3 checks (DAG, load balance, `unknownConcepts` not smuggled in) on the revised outline and show it again. Only start Stage 4 after the user says to write it.

**In a non-interactive run** (`opencode run`, a batch job, a subagent with no channel back to the user): **auto-confirm and continue** — never hang waiting on an answer nobody can give. But the course must carry the fact:

- Write the unconfirmed state into `agentmentor.json` — say plainly in `qualitySelfReview.weakestPoints` that the outline was auto-confirmed in a non-interactive run and no human reviewed the lesson order, coverage, or depth, and put "have the user review the outline and revise this course if it is off" into `nextSteps`.
- Do not silently omit this. An auto-confirmed outline is a real risk to the course's fit, and the next agent or the user has to be able to see it.

This gate is separate from the Stage 1 "ask when information is insufficient" rule. Stage 1 asks whether you know enough to plan; this gate asks whether the plan is the one the user wanted.

**Language at the gate**: these instructions are English, but the outline you show and the question you ask are learner-facing — write them in the course's language (the same language you decided in Stage 1 and will record as README frontmatter `lang`). Never show a Chinese-language learner an English outline.

## Stage 4 Lesson writing — definition of done: every lesson follows the skeleton + pedagogy is solid (the template only gives the shape — this section covers "how to write it well")
- Fill in strictly per the six-section **shape** in `templates/lesson-template.md`, in the same order; but for "how to write it well," see below:
- **Hook**: one or two paragraphs naming the learner's real confusion/pain point + where this lesson sits in the whole course ("you are here" map feeling). ★**The heading must vary per lesson** — write the tension/conflict/counter-intuitive angle unique to this lesson (e.g., "You already know X — so why does Y still fail?"), **formulaic phrasing like "why this lesson matters" is strictly forbidden** (an identical-feeling heading in every lesson is boilerplate and kills interest).
- **Explanation**: cut concepts into **50–150-word self-contained chunks**, concrete→abstract; each chunk may pair with a code block/small table/textual diagram/`mermaid` diagram; key facts carry a `[^Sn]` citation from `sources.md` — the body text only ever writes the citation `[^Sn]` (bracket, caret, id, **with no trailing colon**); the reader links `[^Sn]` to the matching `## Sn` block in `sources.md` (format in `templates/sources-template.md`). **★Neither the body text nor sources.md should ever contain a `[^Sn]: definition` Markdown footnote-definition line** — sources.md is a list of `## Sn — Title` blocks, not footnote definitions; writing `[^Sn]:` makes guard flag every citation as dangling. Keep new concepts per lesson ≤ ~7.
- **Term ramp**: when introducing a term for the first time, the order is "everyday handle → a visible example on screen/in code/in the workflow → formal term → glossary." Don't drop words like `diff`, `worktree`, `Client Component`, `middleware` first and leave beginners to guess.
- **Command/tool ramp**: whenever a learner is asked to run a command or use a tool, spell out three things: where to run it, what success looks like, and what output to copy to the agent on failure. Otherwise the exercise turns into a hidden environment exam.
- **Chinese punctuation convention**: Chinese-language courses must uniformly use full-width punctuation (。、,;:!?), with a half-width space between Chinese text and any inline Western text/term (e.g., between Chinese words and an embedded English term like "Git" or "HTTP"). The reader's typographic baseline is full-width punctuation; mixing in half-width punctuation causes visual inconsistency.
- **Escape `$` in prose (`\$`) — it triggers math mode**: the reader runs remark-math/rehype-katex, so an unescaped **pair** of `$` in lesson prose is parsed as inline math — currency like "costs $5 and $10" collapses into run-together italic KaTeX, the `$` signs vanish, and it can overflow the container. In prose, write dollar amounts, shell `$VAR`, and regex end-anchors as `\$`. The escape is **prose-only**: inside fenced code blocks, `inline code`, and interaction-block JSON (`agentmentor-*`), leave `$` **raw** — those aren't math-processed, and escaping them prints a literal backslash. guard emits a non-blocking ⚠ when a prose line carries ≥2 unescaped `$`, but it cannot catch every case (single `$` that pairs across lines, intended math) — only the Stage 5 render pass sees the real page.
- **Diagram rules (prefer `mermaid`)**: when the subject being taught is a process, a dependency relationship, a state change, a request/response chain, a system architecture, a learning path, or a decision tree, prefer a fenced `mermaid` block to draw out the structure, because the reader renders it into a themed SVG via beautiful-mermaid. A diagram must explain a structure that's hard to grasp from text alone in one pass — it's not decoration; a lesson typically has 0-1 diagrams, complex chapters at most 2. Every diagram must have at least one sentence before or after it saying "what this diagram wants you to see" — don't drop it bare under a heading; don't force a diagram into a linear paragraph, and don't draw a structure that the body text or sources can't support.
- **Interaction blocks, used with restraint (optional)**: nine block types: `agentmentor-check` / `order` / `predict` / `trace` / `code` / `fix` / `diff` / `hotspot` / `live`. **Consult `docs/interaction-selection-guide.md` for block selection, and `templates/lesson-template.md` for each block's field spec — don't duplicate field specs here.** This section gives only the judgment principle: first decide whether this passage genuinely needs a locally deterministic interaction — if there's no concrete misconception to catch, don't add one; an interaction serves exactly one understanding point, typically 0-1 per lesson, 2 at most, placed right after the explanation chunk it checks — not inside the exercise region (`<!-- exercises -->`); every error-feedback message must explain the mechanism, never just say "wrong." `copyPurpose` is optional for check/order; predict/trace/code/fix/diff/hotspot/live must include `copyPurpose`, so the learner can copy their current input, front-end attempt, and local feedback to the agent for follow-up.
  - **When to use `agentmentor-live` (a live front-end sandbox)**: only in HTML/CSS/JS front-end courses, when "seeing the real rendered/interactive effect" beats prose explanation — e.g., CSS layout (flex/grid centering), selector priority, visible HTML nesting structure, or lightweight JS behavior. Field spec is in `templates/live-sandbox-example.md`. Must be self-contained with no external links; at most 1 per lesson (rendering is heavy). For goals where a deterministic assertion can be written (e.g., a given element's computed style/text/count), prefer pairing it with `checks` — the learner gets an automatic pass (🎯) once their edit passes; for goals where no deterministic assertion can be written, keep it as view-answer + self-assessment.
  - **Bad smells**: (1) purely static display (no interaction, no code change needed to see the effect — that should be a plain code block paired with a mermaid diagram); (2) a goal too open-ended for self-assessment (e.g., "make a nice-looking page"); (3) non-front-end topics (back-end/data structures/algorithms/CLI courses with no visible rendering — don't use a live block there).
  - **Live contract version (`v`)**:
    - The block JSON has an optional `v` field (a positive integer), defaulting to 1. The current toolchain supports: v1.
    - **Versioning policy**: adding an optional field = backward-compatible, no version bump needed; changing an existing field's semantics, adding a required field, or removing a field = a breaking change — you must bump `v` and update the reader parser plus `scripts/course-guard.mjs` in sync.
    - Authors don't need to set `v` proactively; only annotate it per the template when actually using new-template capability. Guard blocks any version the current toolchain doesn't support; an old reader encountering a newer-version block shows "This interaction block requires an updated reader" instead of rendering incorrectly.
### Live block generation loop (mandatory for the generating agent)

1. Draft the block JSON from the pedagogical intent (contract in templates/live-sandbox-example.md), first as a standalone file.
2. Put the block in a draft lesson and run `node scripts/course-guard.mjs <course-dir>` until its schema and size checks pass.
3. Run `npm run dev`, open the generated lesson, and self-check:
   - the initial preview shows a meaningful picture (not blank, not overflowing its container);
   - the goal described is actually achievable in this picture;
   - if there are `choices`, the differences between values are visible to the eye; if there's a `solution`, run once more with `--solution` to produce the reference image.
4. Once the self-check passes, put the JSON into the course markdown's ```agentmentor-live fence, and finally run course-guard over the whole course to close it out.
- **Mentor action card (`agentmentor-action`, optional)**: when a lesson naturally calls for post-lesson follow-up questioning, gap detection, reverse teaching, or a hands-on simulation, you may place one fenced `agentmentor-action` block. It is not a prompt shown directly to the user — the reader renders it as a low-noise "copy to Agent" button; the copied prompt carries the public lesson URL, lesson identity, purpose, and interaction rules.
  - **Copy must be lesson-specific**: `label` and `description` must be written on the spot from this lesson's actual content, e.g. "Swap roles across two requests to test whether I really understand HTTP" — not generic, template-feeling buttons like "Quiz me on whether I really get it" / "Hidden gap detector" / "Enter hands-on simulation."
  - **Syntax is not JSON**: the fenced content of `agentmentor-action` is a plain field block, shaped like `mode: ...`, `label: ...`, `rules:` followed by a `- ...` list. Do not write `{ "mode": ... }`; the reader and guard parse it line by field. Strict JSON is used only for `agentmentor-check` / `order` / `predict` / `trace` / `code` / `fix`.
  - **Fields**: `mode`, `label`, `description`, `purpose` are required; `rules` is optional. Do not depend on local course files: public learners copy the action from a URL and the prompt must remain understandable from its inline purpose and rules.
  - **Placement**: there are only two legal positions — before the exercise region (`<!-- exercises -->`), or after the Summary section ends. **Do not place it between the exercise region and the Summary section.** The reader extracts the exercise region into a separate exercise card; an action block inside that region will not render as normal Markdown.
  - **Use it sparingly**: a lesson typically has 0-1 action cards; don't cram all nine interaction modes into every lesson. It should appear only when the user has finished something concrete and it's worth returning to the agent conversation.
- **Security boundary (mandatory check for technical courses)**: whenever the course touches API keys, tokens, `.env`, dependency installation, network calls, file deletion/overwrite, committing code, or privilege escalation, include a short security note/boundary paragraph spelling out concrete risks such as "never write secrets into source code or commit them to the repo," "prefer environment variables," "never run sudo or destructive commands without care." Don't bury the security note as the last sentence of an ordinary paragraph.
- **Worked example**: fully demonstrate one representative example, **explaining "why this step" at every step** (not just giving the result).
- **Faded example**: give a half-finished piece with blanks, **placing the blanks precisely on key judgment points (not mechanical word-filling)**, for the learner to complete; **include the answer**.
- The three must appear as a ladder: follow-along → fill-in → independent practice.
- **Beginner-first toy surface**: if the real workflow requires multiple unfamiliar tools, first carry the mechanism on a familiar object or toy surface, then migrate to the real environment. For example, explain a diff as a receipt before showing a Git diff; edit a piece of static text before discussing component boundaries.

## Stage 5 Quality check — definition of done: guard passes + rubric self-review passes
- Run `node scripts/course-guard.mjs <course-dir>` (a mechanical red-line check, no LLM call, zero credentials): dangling citations / source URL 404s or redirects / missing template sections / overlength / frontmatter / glossary / agentmentor.json / source authority / mermaid diagrams / interaction blocks / mentor action / common stale-or-absolute claims / Next.js zero-background bridging. If check/order specifies `copyPurpose`, guard checks it isn't empty or a placeholder; if omitted, it stays backward-compatible. Guard also blocks templated labels/prompts, feedback/messages that only say right/wrong, diff `focus` fields that leak the answer, overlong diffs, out-of-bounds hotspot coordinates, or edges referencing unknown nodes. On FAIL, go back to Stage 3/4 and fix per the violation.
- By default, guard checks the URLs in `sources.md` over the network. Without network access, add `--skip-url-check` to run local structural checks only; before publishing, add `--strict-url-check` to also treat 401/403/429/timeouts as hard failures.
- After guard passes, run `node scripts/course-interaction-report.mjs <course-dir>`. This is non-blocking QA specifically checking whether interaction selection is well-judged: per-lesson distribution, whether `agentmentor-action` is too dense, whether labels are repetitive/templated, and whether `acceptanceReview.interactionCheck` explains each interaction type. When the report has warnings, either go back to Stage 4 and revise, or explain in `acceptanceReview` or the acceptance record why it's still acceptable.
- **Run a render pass — a green guard is necessary, not sufficient.** guard is mechanical and does not render, so a class of disfiguring defects sails through it: the standing example is the `$`/remark-math trap (unescaped paired `$` in prose becomes garbled inline math), which passed guard clean and was caught only on the rendered page in the 2026-07-19 pipeline dogfood — the single worst defect in that course. Open the course in the reader (or the exported HTML) and actually look at each lesson: currency and other `$`, tables, `mermaid`, and every interaction block, in both languages for a twinned course. Do not declare the course done on a green guard alone.
- Self-review against the six dimensions in `docs/course-quality-rubric.md` (structure/grounded/pedagogy/exercises/load/readable); if any dimension falls short, go back to Stage 3/4 and revise.
- Do one **publish-grade acceptance pass**: guard passing only means it's mechanically deliverable, not that it's ready to be promoted to a showcase course. Score all six dimensions 1-5; confirm `briefCompleteness.evidence` can be traced back to the user's own words or the intake record supporting the learner model; confirm the course's endpoint lets the learner complete a real action; judge, block by block, whether each interaction serves a concrete misconception; confirm at least one exercise copy-entry or `agentmentor-action` can bring the user back into an agent conversation; confirm `learnerModel.firstIndependentAction` doesn't depend on `unknownConcepts`; before promoting a technical course into `examples/`, re-open official sources or run the current starter/tooling.
- Finally, write `agentmentor.json.qualitySelfReview` and `agentmentor.json.acceptanceReview`: `qualitySelfReview` explains `diagramUse` (where mermaid diagrams were used / why not), lists at least 3 concrete `weakestPoints`, and lists `followUpChecks`; `acceptanceReview` must write `learnerFitCheck`, answering "who this is for, which hidden prerequisites were removed, and why the first step is achievable"; `acceptanceReview.decision` can only be `ship` / `revise-before-example` / `archive`, with `blockers` and `promotionNotes` spelled out clearly. This is not pretty copy for the user to read — it's a quality write-back so the next agent to pick this up can immediately see the weak points and publish status.

## Stage 6 Exercises — definition of done: every question has the four-part structure + points at a real environment + Apply-level share is sufficient
- **Bloom's taxonomy**: across the whole course's exercises, the share of "can use / can do / can judge" (Apply level and above) should be **≥ ~60%** — don't make it all rote recall.
- **Every question has a four-part structure**: (1) approach guidance (2) **quantifiable completion criteria (specific enough for the learner to self-judge right/wrong — not empty phrases like "done well")** (3) the answer or key points (4) progressive hints (light → heavy).
- **Writing convention**: in the body text, prefer writing "Completion criteria:" rather than "Self-review rubric:". The reader renders this as a local checklist and provides a "copy exercise to agent" button; don't imply that checking a box submits anything to the system or writes back to long-term memory.
- **At least one question must include a "common mistake breakdown"** (a typical wrong approach + why it's wrong + how to fix it).
- Exercises are always framed as "in your own IDE/terminal/on paper" — never assume an embedded runtime environment; split into Level 1/2 (Level 3 optional).

## Stage 7 Delivery — definition of done: correct directory shape
- `lessons/learn-<slug>/`: `README.md` (follows readme-template) + `NN-*.md` (two-digit numbering) + `sources.md` + `glossary.json` + `agentmentor.json`.
- **Confirm the path (do this before writing files)**: use `pwd` to confirm you're at the skill repo root, and resolve the target into an absolute path. **Copy-pasteable path template**:
  ```bash
  courseDir="<skill repo root>/agent-mentor/skills/generate-course-from-topic/lessons/learn-<slug>"
  ```
  **Before writing any file, first print the resolved `courseDir` absolute path and confirm it sits inside the skill's install directory**. This workspace may have both an outer `agent-mentor/` and an inner `agent-mentor-skill/agent-mentor/` at the same time — don't let a relative path write the course into the outer sibling directory by mistake. Run `mkdir -p "$courseDir"` then immediately `test -d "$courseDir"`; right after writing the first file, run `ls -la "$courseDir"` to confirm `README.md` or the lesson files are in **the same** directory you'll pass to `course-guard.mjs`. If guard reports missing core files, first check whether they were accidentally written to a same-named sibling path before deciding to move or rewrite them.
- **Minimal complete skeleton first**: weak models, subagents, or non-interactive runs most easily get stuck at "directory created but course not written." Once the lesson count is decided, write out a minimal-but-valid version of `README.md`, all `NN-*.md` files, `sources.md`, `glossary.json`, and `agentmentor.json` all at once, even if the content is still rough. **Skeleton file checklist**:
  - `README.md` (the course TOC, with frontmatter)
  - `01-*.md`, `02-*.md`, ... all planned lesson files (two-digit, zero-padded numbering)
  - `sources.md`
  - `glossary.json`
  - `agentmentor.json`
  - `logo.svg` (course emblem — see the emblem contract below)

  **Verification command (run immediately once the skeleton is complete)**:
  ```bash
  find "$courseDir" -maxdepth 1 -type f | sort
  ```
  Confirm the core files are visible. Only proceed to deep sourcing, polishing, and guard fixes once the files are all in place. **An empty directory is not progress.**
- **logo.svg (mandatory for new courses; guard validates when present)**: a one-glance
  emblem for the course, drawn by the generating agent. Contract: `viewBox="0 0 48 48"`,
  `fill="none"`, `stroke="currentColor"`, uniform `stroke-width="2.5"`, 1-3 shape elements
  (2-3 strokes of line art), motif = one concrete object from this course's terminal task,
  no letterforms, no scripts/handlers/external refs, ≤2000 bytes. Start from
  `templates/logo-template.svg`. The reader tints it with the course's domain color —
  never hardcode a fill.
- **frontmatter (mandatory, guard validates it)**: the top of README carries `domain` (a single top-level topic) + `tags` (an array).
  - **`domain` — reuse first, invent only when nothing fits**: first scan the existing `domain` values across `lessons/learn-*/README.md`, and reuse one if it fits (e.g. Software / Quant / Life Skills); only invent a new, **coarse-grained**, concise top-level topic (e.g. Engineering / Design) when truly nothing suitable exists — don't carve out a narrow niche topic for a single course.
  - **`tags` — 3-5 real characteristics**: the topic itself + difficulty (beginner/intro/advanced) + sub-domain/tool; reuse existing tags where possible to keep the vocabulary converged; be restrained, use existing terms, don't pile on unrelated words.
  - Note: `DOMAIN_ORDER` in `lib/domains.ts` controls the library's top-level topic ordering; a new `domain` is auto-appended at the end.

### README frontmatter and intro define the public course boundary

The intro is not decorative card copy. It is the public scope statement used by the library, page metadata, and learners deciding whether the course matches their goal. A vague intro weakens the course boundary and search intent.

- **What the reader treats as the intro**: the course title comes from the `#` heading; the intro is the **first ordinary paragraph after it** (`courseIntro` in `lib/courses.ts` skips headings and tables). Do not bury the real description below a table or bold label.
- **Write the intro so it constrains**: name the Agent subject at its actual scope, the audience's starting point, and what the course deliberately does not cover.
- **Don't put marketing voice in the intro**: superlatives and promises contain no usable scope information.
- **`lang`** (`en` or `zh`) declares the course language and drives reader copy. Set it to the language actually used by the course.
- Within lessons, the Prev/Next relative links must connect correctly.
- **glossary.json (mandatory, traceable)**: produced by the host's own model (not an external API), as `[{term,def,source,pitfall,distractor_rationale}]` — five required fields per entry, plus the optional depth layer below.
  - **Term selection**: domain terms that actually appear in the course and that beginners tend to get stuck on (in their original wording). **Target density: 10-14 entries per lesson** — see "Glossary density" below; guard warns under 10.
  - **Definition**: one sentence, based on the authoritative sources gathered in Stage 2, consistent with how the course explains it.
  - **`source`**: required — either an authoritative source URL, or a footnote number `[^Sn]` pointing into this course's `sources.md`.
  - **`pitfall`** and **`distractor_rationale`**: required on every entry, and guard fails a missing, empty, or non-string value. Write them per "Glossary as a misconception index" below. They preserve the exact wrong belief and why it is plausible, so lesson checks and future revisions do not invent cartoonishly wrong alternatives.
  - **Prefer omission to fabrication**: if a term has no findable authoritative source, drop it — never fabricate a source just to pad the count. The same applies to `pitfall`: if you cannot name a real mistake learners make on this term, that term probably isn't a checkpoint — drop it rather than write filler into a required field.
  - Guard enforces: missing file / empty array / any entry missing term|def|source|pitfall|distractor_rationale / `source` that is neither a URL nor matches a footnote → FAIL.

### Glossary as a misconception index (`pitfall` / `distractor_rationale`, required per entry)

A glossary entry is not only a hover card. It is also the course's durable record of the misconception attached to a term. The two required fields make static checks, explanations, and later course revisions discriminate between a learner who understands the boundary and one who holds a plausible wrong belief.

**Write each field by asking yourself one question about the term:**

- **`pitfall`** — *"Where do learners most often go wrong on this checkpoint, and what misconception do they hold?"* Name the wrong belief in the learner's own terms, then the condition that exposes it. Not "this is confusing" — the specific false thing they believe.
- **`distractor_rationale`** — *"What is this most easily confused with, and why does the confusion happen?"* Name who makes the mistake and what reasoning leads them there. This is the story behind the wrong answer, not the wrong answer itself.

**Why both are required, not optional.** A real `pitfall` yields a wrong option or counterexample a learner might actually choose. Without one, authors improvise alternatives that are too short, off-topic, or absurd. `distractor_rationale` is the check on plausibility: it names the mistaken line of thinking behind the alternative. An option nobody would reach for a stated reason is filler, and the quality gates reject it.

**Good entry (complete):**

```json
{
  "term": "index alignment",
  "def": "Series/DataFrame operations match values by index label, not by position.",
  "source": "[^S3]",
  "related": ["iloc", "loc"],
  "pitfall": "Believing iloc[2] and loc[2] always return the same row — they only agree when the index happens to be the integers 0..n.",
  "distractor_rationale": "Someone who learned positional indexing first reaches for iloc by reflex, because in tutorial examples with a default index it happens to give the right answer every time."
}
```

Read what makes it work: the `pitfall` states a false belief (`iloc[2] == loc[2]`) plus the condition that hides it (a default integer index), so the generator can build an option that is exactly that belief. The `distractor_rationale` names the population (positional-indexing background) and the reason the habit survives (it accidentally works on simple data), so the wrong option has a rationale behind it.

**Language**: both fields are written in the course's own language, like `term` and `def` — the generator writes questions in that language and quotes these fields as its material. (The examples here are English because this guide is; a zh course writes them in Chinese.)

**Good entry (a non-technical checkpoint — the fields work the same way):**

```json
{
  "term": "sunk cost",
  "def": "A cost already paid that cannot be recovered, and therefore should not affect the next decision.",
  "source": "https://example.org/econ/sunk-cost",
  "pitfall": "Treating money already spent as a reason to continue — 'I've already put in three months, so quitting now wastes it' — when the only question that matters is the value of continuing from here.",
  "distractor_rationale": "Learners conflate sunk cost with opportunity cost because both are about money and choices; opportunity cost does belong in the decision, so the wrong answer feels responsible rather than careless."
}
```

**Bad entry (a `pitfall` that does nothing):**

```json
{
  "term": "index alignment",
  "def": "Series/DataFrame operations match values by index label, not by position.",
  "source": "[^S3]",
  "pitfall": "Beginners often find this concept confusing and need to practice it.",
  "distractor_rationale": "It is easy to get wrong."
}
```

This passes guard's non-empty check and is still useless. Neither field names a **specific wrong belief** — "confusing" is a report on the learner's feelings, not a claim they hold, so there is nothing to turn into an option. Fed this, the generator falls back to improvising, and produces the give-away question the required fields exist to prevent. The test to apply before shipping an entry: **can you write a plausible wrong answer straight out of the `pitfall` text?** If not, rewrite it until you can.

### Glossary density — target 10-14 entries per lesson

Count entries against **lesson files** (the numbered `NN-*.md` lessons). Guard computes entries ÷ lessons and **warns below 10** (a non-blocking ⚠; it does not fail the course). 10-14 is the target band.

**Why density matters:** every entry is one term-and-misconception checkpoint available to hover definitions, exercises, and static interactions. A thin glossary leaves important boundaries implicit; a padded glossary invents vocabulary the course never teaches. Density is a target for coverage, not a quota.

**This does not conflict with the "≤ ~7 new concepts per lesson" rule in Stage 4.** They constrain different things:

- The concept ceiling constrains **cognitive load in the lesson prose** — how many genuinely new ideas a reader must hold at once while reading.
- Density constrains **the size of the explicit learning surface** — how many distinct terms and boundaries are actually named.

One concept legitimately yields several entries: its sub-cases, its boundary conditions, the named distinctions inside it, the term for its failure mode. A lesson teaching 5 new concepts can carry 12 entries without being overloaded, because the extra entries are finer cuts of concepts already taught, not additional concepts. **The hard limit on this: every entry's `term` must appear verbatim in the lesson body** (guard warns on a key with no body match — see the `term` key rule below). If you have to invent vocabulary the course never uses in order to hit the density band, you are padding — write the missing material into the lesson, or accept the lower density and say so in `qualitySelfReview`.


### Glossary depth layer (`deeper` / `related`, optional per entry)

Two optional fields on a glossary entry power the reader's second layer: the hover card shows `def`, and "one level deeper" expands `deeper`; `related` renders as chips that swap the card to a neighboring term.

- **`deeper` is one second-layer explanation, 2-4 sentences.** It answers the question a learner has after reading `def`: the mechanism behind the one-sentence definition, the boundary where the concept stops applying, or the distinction beginners blur. Depth stops here by design — `def` is layer one, `deeper` is layer two, there is no layer three; closing the rabbit hole is a teaching decision, not a technical limit.
- **`deeper` follows the same sourcing discipline as body prose**: every claim in it comes from the Stage 2 material, and the text carries at least one attribution — an authoritative URL or a `[^Sn]` citation that resolves in this course's `sources.md`. Guard fails a non-empty `deeper` with no source, and fails a dangling `[^Sn]`. Prefer omission: a term whose second layer can't be backed simply has no `deeper`.
- **Before shipping a `deeper`, ask two questions of it.** Is this sentence only a rewording of `def`? Then it is not a second layer — cut it or replace it with the mechanism, boundary, or distinction the source actually supports. Does it bridge sourced facts with outside common knowledge? Then either back the bridge with a source or drop the bridging clause; a constant every learner holds (water boils at 100 °C) may stay, a fact they might not is a claim that needs backing.
- **`deeper` prose is under "Naming and voice" jurisdiction** like every learner-facing word: professional instructional register, no marketing voice, no difficulty minimizers, no enthusiasm about the term itself. It is a denser continuation of `def`, not a pitch for why the concept matters.
- **`def`/`deeper` render `$` raw — the opposite of the Stage 4 prose rule.** The hover card writes these through `textContent`/JSX text nodes, not markdown, so remark-math never touches them: a `$` here is literal and must stay **unescaped**. Writing `\$` (the body-prose habit) prints a literal backslash on the card. Same for the `$` inside interaction-block JSON — raw. Only lesson prose gets escaped; mind the boundary.
- **`related` lists 2-4 terms from this course's glossary only.** Each item must exactly match the `term` of another entry in the same `glossary.json` — guard fails a dead anchor. Pick the terms a learner should hold next to this one: a prerequisite, a contrast, or the next step along the course's own path. Never point outside the course, never list a term the glossary doesn't define.
- **Fix every `term` key against the body — matching is case- and contiguity-sensitive.** The reader attaches a hover card only where a key appears **verbatim** in the lesson body: the match is case-sensitive and can't span markdown emphasis, so `Fixed expenses` won't satisfy a `fixed expenses` key and `**needs** versus **wants**` won't satisfy a `needs versus wants` key. Before finalizing a key, `grep` the lesson bodies for it; prefer a single-word or contiguous key, or a bilingual `中文（english）` key so either half can hit. guard's non-blocking body-presence ⚠ flags a key no candidate of which appears in the body (2026-07-19 pipeline dogfood §六-2).
- **Never write `glossary.live.json` or any `.live.*` file.** The public course repository has no mutable learner layer; all shipped glossary content belongs in sourced `glossary.json`.
- **agentmentor.json (mandatory, the course-local manifest)**: produced per `templates/agentmentor-template.json`.
  - **It is not a long-term-memory write-back**: it lives only in this course's own directory, for a later agent/user to understand the course's state; do not write it into Codex memory, and don't assume the host agent has an equivalent memory API.
  - **Fields**: `schemaVersion:2`, `originalRequest`, `learnerBrief`, `briefCompleteness.status`, `briefCompleteness.evidence`, `learnerModel.targetReader`, `learnerModel.knownConcepts`, `learnerModel.unknownConcepts`, `learnerModel.assumedEnvironment`, `learnerModel.firstIndependentAction`, `learnerModel.noviceRamp`, `scope`, `status.stage`, `status.guardCommand`, `status.guardStatus`, `qualitySelfReview.diagramUse`, `qualitySelfReview.weakestPoints`, `qualitySelfReview.followUpChecks`, `acceptanceReview.rubricScores`, `acceptanceReview.terminalTask`, `acceptanceReview.interactionCheck`, `acceptanceReview.learnerFitCheck`, `acceptanceReview.decision`, `acceptanceReview.blockers`, `acceptanceReview.promotionNotes`, `nextSteps`, `memoryBoundary`.
  - **Be honest about status**: `agentmentor.json` is the final delivery declaration. You may write `status.guardStatus` as `pass`/`ok`/`passed` first, but you must immediately run `node scripts/course-guard.mjs <course-dir>` to verify it's true; if guard fails, go back and fix the course and the manifest per the violation until the declaration is actually true. Don't leave `<placeholder>`, TODO, or TBD behind.
  - **Be honest in the quality self-review**: write concrete risks in `weakestPoints`, such as "Lesson 4's API version depends on official docs and needs re-verification later" or "exercises are mostly paper reasoning, missing one real-project exercise"; don't write empty phrases like "could be further optimized." Don't overuse `ship` for `acceptanceReview.decision`; a course with blocking issues that's still dogfood-able should get `revise-before-example`; a course with the wrong scope or too thin to be worth further polishing should get `archive`.
  - Guard enforces: missing file / invalid JSON / empty field / placeholder / `guardStatus` not passing / v2 missing `briefCompleteness` / tagging a request that looks like only a topic name as `user-provided` / missing `learnerModel` / missing `learnerFitCheck` / missing quality self-review / no declared course-local memory boundary → FAIL.
