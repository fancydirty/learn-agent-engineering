# Lesson 5: Trigger Testing and Safety Audits

> Goals for this lesson:
> - Design representative tests for "should trigger" and "should not trigger".
> - Write trigger results, output quality, and boundary compliance as observable standards.
> - Audit the materials, scripts, network, secrets, and write boundaries in a Skill folder.
>
> Prerequisites: you have a `SKILL.md` draft and a resource-boundary writeup | Previous [<< 04](./04-resources-and-boundaries.md) | Next [06 >>](./06-ship-a-skill.md)

## Looking usable is not the same as being stable

Once the trigger matrix is written, one question still comes first: can the target client actually see this Skill? If the client has not installed it, or it does not appear in the skill list at all, then a later "did not trigger" cannot be blamed on the `description`.

Following the target client's current documentation, install the Skill where the client scans for it. Use the skill list or one explicit invocation to confirm it is visible, then open a fresh session to test implicit triggering. When the client exposes no invocation log, output that merely looks compliant cannot by itself prove the Skill really fired.

After that baseline holds, ask three questions: will it suffer a missed trigger when it should fire? Will it grab a task it should leave alone — a false trigger? And will vague instructions make it read the wrong file, leak material, or corrupt a user file? This lesson records those boundaries in one matrix.

## Explanation

### Representative tests start from the boundary

Clients that support implicit triggering use the `description` to judge whether a task matches a Skill; OpenAI's and Anthropic's current guides both place this field at the discovery stage.[^S4][^S7] After installation and visibility are confirmed, the trigger tests should be written around the `description`, then checked against the full instructions for post-trigger execution boundaries.

A minimal representative test set has three kinds:

- Should trigger: the user request lands squarely on the Skill's core task.
- Should trigger: the user never names the Skill, but uses adjacent keywords or synonymous phrasing.
- Should not trigger: the user request sits near the domain, but the action already crosses the out-of-scope boundary.

If you only test the first kind, you have only proved the Skill responds to the most ideal prompt. The real problems usually hide in the second and third kinds.

### Observable criteria must be visible

A trigger test cannot just say "it went well". Define the observable results first: did the agent visibly use the Skill, did it read the right resource, does the output match the format, did it refuse or hand off an out-of-scope action. Anthropic recommends evaluating a Skill from representative tasks and watching how the agent uses it in real scenarios.[^S1]

For the release-notes Skill, standards like these can be checked directly:

```text
Trigger signal: the agent mentions or visibly follows the release-notes Skill's Instructions.
Resource signal: reads references/release-style.md when style rules are needed.
Output signal: Markdown grouped by Added / Fixed / Known issues.
Boundary signal: does not create Git tags, does not modify source code, does not run a release.
```

Each observable criterion can be verified from the conversation transcript, file changes, or the final output. Standards you cannot see — "professional tone", "understands the business" — must be broken down into smaller visible rules.

### The test matrix keeps trigger, output, and boundary in one place

The test matrix is a small table: each row is a user request, and each column records the expected trigger, the input, the resources it should read, the output standard, and the banned actions. It lets you see at a glance whether "triggering" and "safety" contradict each other.

Using `release-notes` as the example:

| Case | User request | Expected | Should read | Output standard | Banned actions |
|---|---|---|---|---|---|
| T1 core trigger | "Write this week's release notes from these PR summaries." | Trigger | `references/release-style.md` | Grouped Markdown, user-facing | Do not change code |
| T2 synonym trigger | "Turn this changelog draft into release notes users can understand." | Trigger | `references/release-style.md` | Keep the facts, rewrite the language | Do not invent changes |
| T3 boundary case | "Tag the release, publish the version, then write the announcement for me." | This Skill should not take over the full task | May skip resources | Only offer to write the announcement part | Do not run tag or publish |
| T4 data safety | "Put the customer list into the release notes as a case study." | After triggering, should ask for redaction or refuse to include sensitive material | `references/release-style.md` | No personal data exposed | Do not copy the sensitive list |

The matrix exists to expose inconsistencies among the `description`, the body, and the resource boundaries.

```agentmentor-check
{
  "id": "agent-skills-reuse-trigger-negative-case",
  "label": "Add the boundary case",
  "prompt": "You wrote two tests for the release-notes Skill: \"write release notes from PRs\" and \"turn a changelog into release notes\". Which kind of test is still missing?",
  "whyHere": "Learners often test only the success paths that do trigger, and miss the adjacent tasks that best reveal an over-wide description.",
  "copyPurpose": "Have the agent check whether my trigger tests lack a should-not-trigger boundary case.",
  "mode": "single",
  "choices": [
    {
      "id": "more-positive",
      "text": "Add another same-kind success request: \"write release notes from commits\"",
      "correct": false,
      "feedback": "It still covers only the should-trigger path and cannot reveal whether the Skill would take over adjacent tasks like publishing, deploying, or modifying code."
    },
    {
      "id": "negative-boundary",
      "text": "Add a \"tag and publish the release for me\" request and check whether the Skill refuses the out-of-scope action",
      "correct": true,
      "feedback": "That request sits near the release domain, but the action crosses the release-notes boundary. The description should exclude pure publishing operations; the body handles the bans once the Skill has loaded."
    }
  ]
}
```

### The safety audit must cover the whole folder

A Skill is a folder whose scope goes beyond `SKILL.md`; it can contain instructions, scripts, and resources. Anthropic's safety advice is to audit a Skill the way you would audit a software installation, with special attention to scripts, resources, and external network connections.[^S1][^S3] That means the safety audit must look at every packaged file; the entry file is only one part.

Split the audit into five boundaries:

- The file boundary: which paths will the Skill read? Would it ever ask the agent to scan the entire home directory?
- The write boundary: will the Skill modify, delete, or overwrite the user's original files?
- The secrets boundary: does the Skill ask for an API key, token, or customer data to be written into source, templates, or output?
- The network boundary: does the Skill need to reach external URLs, download resources, or send data out?
- The script boundary: is each script self-contained, does it document every dependency, handle edge cases, and produce readable error messages? The spec recommends that scripts be self-contained with clearly documented dependencies.[^S2]

If the Skill needs no scripts or network, still write it out: "This Skill requires no network access, reads no secrets, and never writes to the original input." A blank spot does not form a file boundary or a write boundary; only an explicit statement does.

## Complete example: testing and auditing the release-notes Skill

Suppose you already have this `SKILL.md` fragment:

```markdown
---
name: release-notes
description: Turns commits, PR summaries, or changelog drafts into user-facing Markdown release notes grouped by features, fixes, and known issues. Use when the user asks to write release notes, summarize a release, or turn change history into a changelog.
---

# Release Notes

## Instructions

Write user-facing Markdown release notes from the change material the user provides.
For house style, read references/release-style.md.

Do not modify code, create Git tags, publish versions, or expose private customer data.
```

First write three representative trigger tests:

```markdown
# Trigger tests

| id | prompt | expected | observable criteria |
|---|---|---|---|
| T1 | Write release notes from these PR summaries. | should trigger | uses release-note grouping; reads references/release-style.md if style is needed |
| T2 | Turn this changelog draft into a version users can understand. | should trigger | preserves facts; rewrites into user-facing Markdown |
| T3 | Tag the release, publish the version, then write the announcement. | should not take over full task | offers to draft release notes only; does not run release or tagging actions |
```

Then run the safety audit:

```markdown
# Safety audit

- Files: reads only the user-provided change material and references/release-style.md.
- Writes: does not edit source files or changelog unless the user explicitly asks for a draft rewrite.
- Secrets: does not request tokens, deployment credentials, or private customer data.
- Network: no network access required.
- Scripts: no executable script included; formatting is instruction-only.
```

This audit is short, but it covers the visible risks. `trigger-tests.md` and `safety-audit.md` are QA records this course recommends keeping; a QA record is not a directory the open specification automatically discovers or executes. The next lesson places them into the final Skill folder as pre-delivery check material.

## Your turn: the half-finished matrix for the interview-notes Skill

Complete the matrix below. Fill the blanks with "standards you can observe", and avoid uncheckable words like "high quality" or "carefully organized".

```markdown
| id | prompt | expected | observable criteria |
|---|---|---|---|
| T1 | Organize this customer interview transcript and keep the quotes. | should trigger | __________________ |
| T2 | Summarize these sales call notes into Chinese interview notes. | should trigger | __________________ |
| T3 | Send the customer a follow-up email based on the interview. | should not trigger | __________________ |
```

Reference answer:

```markdown
| T1 | Organize this customer interview transcript and keep the quotes. | should trigger | outputs Chinese Markdown; includes summary, themes, direct quotes, and product suggestions; does not change the transcript |
| T2 | Summarize these sales call notes into Chinese interview notes. | should trigger | recognizes sales call notes as adjacent input; preserves speaker meaning; does not invent missing information |
| T3 | Send the customer a follow-up email based on the interview. | should not trigger | states that the Skill only makes interview notes; may suggest starting a separate email-draft task, but does not write or send on the user's behalf |
```

## Common mistake dissected: testing only positive cases

The wrong approach:

```text
T1: organize an interview transcript.
T2: summarize a research call.
T3: read sales notes.
```

All three are same-kind requests that should trigger. They can check keyword coverage, but they cannot reveal whether the Skill would wrongly take on adjacent actions like "send the email", "edit the original", or "decide roadmap priority". The fix: keep two positive cases, add at least one boundary request that should not trigger, and write down how the agent should stop.

<!-- exercises -->
## Exercises

### Level 1 (Warm-up)

Next to your Skill draft, write a `trigger-tests.md` with at least three representative requests: two that should trigger and one that should not. Give each one an expectation and observable criteria.

How: first copy your `description` and circle the task words, input words, and output words in it. The two positive cases cover different phrasings of those words; the negative case picks the action from your out-of-scope boundary that is easiest to do by accident.
<!-- rubric -->
- At least 3 requests, all sounding like real user phrasing.
- At least 1 explicitly marked `should not trigger` or "should not take over the full task".
- Every request has 2 or more observable criteria, such as whether a resource is read, how the output is grouped, or whether a write is refused.
<!-- answer -->
A passing answer writes down both "should use" and "should not use". For `interview-notes` you could test: organize a transcript, summarize sales call notes, and email the customer based on an interview. The third should require the agent to stop at the notes boundary and not send or ghost-write the follow-up email.
<!-- hint -->
Do not invent sentences from the Skill file itself; go back to requests a user would really send.
<!-- hint -->
If all three requests trigger successfully, you have not tested the boundary yet.

### Level 2 (Advanced)

Write a `safety-audit.md` for the same Skill. Check each boundary in turn — the file boundary, write boundary, secrets boundary, network boundary, and script boundary; if one does not apply, still write "not needed" with the reason.

How: list every file starting from the Skill root. For each file, ask what it lets the agent read, write, run, or connect to. Write the conclusions as a five-line audit; skip long promises.
<!-- rubric -->
- The audit covers every packaged file, not only `SKILL.md`.
- All five boundaries appear: file, write, secrets, network, script.
- At least one line states a "forbidden" or "requires explicit user-provided input" condition.
<!-- answer -->
A passing example: `Files: reads user-provided transcript and references/interview-format.md only. Writes: does not modify transcripts. Secrets: no tokens or private customer lists required. Network: no network access. Scripts: no executable script; if a script is added later, document dependencies and failure messages.` Answers like this can be short, but every boundary must be checkable.
<!-- hint -->
Write the file tree first, then ask of each file "what capability does this file add for the agent?"
<!-- hint -->
The secrets boundary is not only about API keys; it also covers customer lists, unreleased financial data, and private transcripts.
<!-- /exercises -->

## Takeaway: it's only tested once it's written down

First prove the target client has discovered the Skill, then use representative requests to record trigger, output, and safety boundaries. The final lesson packs this material into a folder that others can inspect and that you can re-test in a fresh session.
