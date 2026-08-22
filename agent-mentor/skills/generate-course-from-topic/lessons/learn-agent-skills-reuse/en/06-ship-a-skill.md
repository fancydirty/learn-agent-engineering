# Lesson 6: From Workflow to Shippable Skill

> Goals for this lesson:
> - Assemble a complete Skill folder with `SKILL.md`, a reference file, and a template or script-boundary note.
> - Use a spec validation tool or a manual equivalent check to confirm the entry file is valid.
> - Run 3 representative tests in your own agent, record the failures, and revise.
>
> Prerequisites: you have completed the trigger test matrix and the safety audit | Previous [<< 05](./05-testing-and-safety.md) | Next [Course contents >>](./README.md)

## The deliverable is a reviewable set of files

By now you have a `SKILL.md`, resource layering, execution boundaries, trigger tests, and a safety audit. The final step is putting them into one folder that others can inspect, the agent can read, and you can re-test yourself.

The finish line of this lesson is concrete: a complete Skill folder with at least the entry file, one `references/` file, one template or script-boundary note, and 3 recorded representative tests. This finish line does not require you to write executable code.

## Explanation

### Look at the shape of a complete folder first

The open specification defines a Skill as a directory containing at least a `SKILL.md`, and names `scripts/`, `references/`, and `assets/` as the conventional optional content. OpenAI's current guide uses the same directory shape.[^S2][^S4]

This course uses a beginner-friendly minimal delivery shape:

```text
release-notes/
  SKILL.md
  references/
    release-style.md
  assets/
    release-notes-template.md
  tests/
    trigger-tests.md
  safety-audit.md
```

`SKILL.md` is the entry; `references/release-style.md` holds style and boundary details; `assets/release-notes-template.md` holds the fixed output skeleton; `tests/trigger-tests.md` holds the three representative tests; `safety-audit.md` records which risks you checked.

One boundary is easy to blur here: `tests/` and `safety-audit.md` are QA records this course created for itself, not auto-discovered directories named by the specification. Each QA record stays in the folder so the next maintainer can see the test-and-revise process.

### Validation has two layers: the spec check and the manual equivalent check

If you have installed the reference library following the `skills-ref` repository instructions, and the command is available in the current virtual environment, you can use it to check the `SKILL.md` frontmatter and naming constraints. That repository is explicitly marked as demo-only, so this course always keeps the manual equivalent check as a fallback.[^S2][^S6]

```text
1. The folder name exactly equals the name in the frontmatter.
2. SKILL.md starts with --- on the very first line.
3. The frontmatter parses as YAML.
4. name uses only lowercase letters, digits, and hyphens; no leading or trailing hyphen; no consecutive hyphens.
5. description is non-empty and states what the Skill does and when to use it.
6. The body can point to `references/` or `assets/` relative paths that really exist.
```

A spec check cannot prove a Skill works well; it can only prove the entry file has no low-level structural error. Whether it works depends on the three representative tests.

### Run the three tests in your own agent

ChatGPT and Codex support explicit invocation and implicit invocation; implicit invocation is decided by whether the task matches the `description`. Anthropic's current guide also uses a discovery process that reads metadata first and the full text second.[^S4][^S7] Before testing, install the Skill following the target client's current documentation, confirm visibility through the skill list or an explicit invocation, then test implicit triggering in a fresh session per case. When the client shows no invocation log, similar output only proves a similar result — it cannot by itself prove a trigger happened.

Record four items per test:

```text
Prompt: the user's original request
Expected: should trigger / should not trigger
Observed: what the agent actually did
Revision: whether to change the description, the body, a resource, or the test itself
```

If the Skill is confirmed visible but the agent did not trigger, do not immediately stretch the `description` into a long list. First look at what is missing: a trigger word, an input word, an output word, or whether the negative disambiguation was written too wide. After the change, rerun the same test in a fresh session.

### The failure log is part of the deliverable

A shippable Skill should not hide failures. Anthropic recommends watching how a fresh session uses the Skill on representative tasks, then revising from the actual results.[^S1][^S7] So `tests/trigger-tests.md` should keep the failure log and the revision log.

Recommended format:

```markdown
| id | expected | observed | revision |
|---|---|---|---|
| T1 | should trigger | triggered and used template | no change |
| T2 | should trigger | did not trigger on "customer-facing changelog" | add "customer-facing changelog" to description |
| T3 | should not trigger | offered to create Git tag | add "Do not create Git tags" to Instructions |
```

This record moves a Skill from "written once" to "maintainable". The next time you — or another agent — take over, it will be clear why a certain sentence is there.

## Complete example: the release-notes Skill folder

Below is a complete but very small `release-notes` Skill. It needs no scripts and uses only a reference file and a template.

```text
release-notes/
  SKILL.md
  references/
    release-style.md
  assets/
    release-notes-template.md
  tests/
    trigger-tests.md
  safety-audit.md
```

`SKILL.md`:

```markdown
---
name: release-notes
description: Turns commits, PR summaries, customer-facing changelog drafts, or change lists into user-facing Markdown release notes. Use when the user asks to write release notes, summarize a release, or turn change history into a changelog. Do not use for tagging, deployment, or publishing operations.
---

# Release Notes

## Instructions

Use this skill when the user asks for user-facing release notes from commits, PR summaries, changelog drafts, or change lists.

Read references/release-style.md before writing if the user asks for house style, audience tone, or wording rules.

Use assets/release-notes-template.md for the output structure unless the user provides a different structure.

Return Markdown grouped by Added, Fixed, Changed, and Known issues. Preserve the facts in the input. Mark missing facts as open questions instead of inventing them.

Do not modify source code, create Git tags, deploy, publish, send announcements, or expose private customer data.
```

`references/release-style.md`:

```markdown
# Release style

- Write for product users, not internal engineers.
- Keep each bullet under 25 words when possible.
- Start each bullet with the user-visible change.
- Avoid commit hashes unless the user asks for an engineering changelog.
- If a change affects privacy, reliability, or data loss, keep the warning explicit.
```

`assets/release-notes-template.md`:

```markdown
# Release notes

## Added

- 

## Changed

- 

## Fixed

- 

## Known issues

- 

## Open questions

- 
```

`tests/trigger-tests.md`:

```markdown
| id | prompt | expected | observed | revision |
|---|---|---|---|---|
| T1 | Write release notes from these PR summaries. | should trigger | pending | pending |
| T2 | Turn a customer-facing changelog draft into clearer release notes. | should trigger | pending | pending |
| T3 | Tag the release, publish the version, then write the announcement. | should not take over full task | pending | pending |
```

`safety-audit.md`:

```markdown
# Safety audit

- Files: reads only user-provided change material, references/release-style.md, and assets/release-notes-template.md.
- Writes: produces draft Markdown in the conversation unless the user explicitly asks for a file path.
- Secrets: does not request deployment credentials, API keys, private customer lists, or unreleased financial data.
- Network: no network access required.
- Scripts: no executable script included; formatting is instruction-only.
```

Before delivery, validate the structure. If you have the spec validation tool installed, run its checks; if not, work through the six manual checks above one by one. Then place the Skill where the target agent can read it, confirm visibility through the skill list or an explicit invocation, and run T1, T2, and T3 each in a fresh session so one test does not contaminate the next. If the client provides no invocation log, record "output matches the rules" as result evidence — do not write it up as trigger evidence.

## Your turn: the half-finished competitor-research Skill

Complete the two blanks below: the `description` must state when to trigger, and `references/research-boundaries.md` must block one safety boundary.

```text
competitor-research/
  SKILL.md
  references/
    research-boundaries.md
  assets/
    competitor-brief-template.md
  tests/
    trigger-tests.md
  safety-audit.md
```

The half-finished `SKILL.md`:

```markdown
---
name: competitor-research
description: ________________________________________
---

# Competitor Research

## Instructions

Use this skill to turn user-provided competitor notes, public website excerpts, or product comparison notes into a structured competitor brief.

Read references/research-boundaries.md before writing the brief.

Use assets/competitor-brief-template.md for the output structure.
```

The half-finished `references/research-boundaries.md`:

```markdown
# Research boundaries

- Use only sources or excerpts the user provides in the task.
- ________________________________________
- Mark unsupported claims as "unverified" instead of presenting them as fact.
```

Reference answer:

```yaml
description: Turns user-provided competitor notes, public website excerpts, or product comparison notes into a structured competitor brief. Use when the user asks to summarize competitors, compare positioning, or prepare competitor research from supplied material. Do not use for scraping, private-data collection, or claims without sources.
```

```markdown
- Do not collect private employee, customer, or account data; ask the user to provide public, sourceable material instead.
```

The point of this faded example: even when the Skill does research, never write "research" as unlimited permission. Both the input sources and the unverified claims need boundaries.

```agentmentor-action
mode: reasoning_audit
label: Audit my final Skill folder
description: Have the agent check, against this lesson's finish line, whether the SKILL.md, reference files, template or script boundary, three tests, and safety audit agree with each other.
purpose: I have finished a Skill folder; please check whether it meets this course's finish line and point out contradictions among the description, resource paths, trigger tests, and safety boundaries.
rules:
  - Check only one risk area at a time: structure, trigger, output, safety, or test records.
  - Quote the specific file fragments I provide; do not re-lecture Agent Skills concepts in general terms.
  - Give one directly editable revision suggestion for each problem.
```

<!-- exercises -->
## Exercises

### Level 1 (Warm-up)

Assemble the final Skill folder in your practice directory. It must contain `SKILL.md`, one `references/` file, one template file or script-boundary note, `tests/trigger-tests.md`, and `safety-audit.md`.

How: draw the file tree first, then create the empty files one by one, and finally migrate the brief, resource notes, test matrix, and safety audit from the previous lessons into their places. Do not include private raw data.
<!-- rubric -->
- The file tree contains at least 5 deliverables: entry, reference, template or script boundary, tests, safety audit.
- The relative paths referenced in `SKILL.md` really exist in the folder.
- The Skill does not depend on this course page or hidden context; the folder still makes sense when copied out on its own.
<!-- answer -->
A passing deliverable looks like: `my-skill/SKILL.md`, `my-skill/references/format.md`, `my-skill/assets/output-template.md`, `my-skill/tests/trigger-tests.md`, `my-skill/safety-audit.md`. If you choose not to write a template, write a clear script-boundary note instead, for example a `scripts/README.md` stating "no scripts included; any future script must document its dependencies, inputs, outputs, and failure messages".
<!-- hint -->
Let `SKILL.md` reference only one reference file and one template at first, to reduce path errors.
<!-- hint -->
If you cannot hand the folder to another agent to read, some instruction is still hiding in your conversation.

### Level 2 (Advanced)

Run one validation and three representative tests on the final Skill. If you have installed and activated `skills-ref` following the official repository instructions, you can run `skills-ref validate ./your-skill`; otherwise run this lesson's six manual equivalent checks. Then run 3 tests in your own agent and write the observed and revision values back into `tests/trigger-tests.md`.

How: run the validation or the manual checks from the Skill's parent directory. After confirming the target client has installed and listed the Skill, send the three tests to the agent, each in a fresh session. Watch whether it triggers, what it reads, what it outputs, and whether it crosses the boundary; record the results as they are.
<!-- rubric -->
- The validation result or all 6 manual checks are recorded.
- All 3 tests have `expected`, `observed`, and `revision`.
- At least 1 test record states "no change needed" or "changed this specific line"; not everything may stay blank.
- If a test fails, the revision location is pinned to the `description`, the body, a reference file, the template, or the test case.
<!-- answer -->
A passing record looks like: `T2 expected should trigger; observed did not trigger on "customer-facing changelog"; revision added "customer-facing changelog" to description.` Another could be: `T3 expected should not take over full task; observed offered to tag release; revision added "Do not create Git tags or publish versions" to Instructions.` A record must explain why that sentence changed; writing only "adjusted description" is not enough.
<!-- hint -->
If the agent did not visibly trigger the Skill, first check whether the description contains the task words from the user's phrasing.
<!-- hint -->
If the agent crosses the boundary after triggering, fix the body's banned actions first; if it should never have triggered at all, fix the scope words in the description.
<!-- /exercises -->

## Where the course ends, maintenance begins

You have now completed this course's terminal task: turning a recurring workflow into a complete Skill folder, and testing trigger, output, and boundary with three representative requests. During later maintenance, do not delete the failure log; treat it as the Skill's change history. Every time you add a resource, template, or script, update the test matrix and the safety audit at the same time.
