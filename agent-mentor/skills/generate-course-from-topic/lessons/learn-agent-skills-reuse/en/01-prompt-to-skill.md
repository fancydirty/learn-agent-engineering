# Lesson 1: Prompt Reuse and Skill Boundaries

> Goals for this lesson:
> - Spot a reusable workflow inside a real recurring task.
> - Tell apart the jobs of a one-off prompt, a recurring task, and a Skill.
> - Write a four-line Skill brief: trigger, input, output, out of scope.
>
> Prerequisites: you can use one coding agent and edit Markdown | Previous [<< Course contents](./README.md) | Next [02 >>](./02-skill-metadata.md)

## The task you re-explain every single time

You have probably hit this situation already: every time you ask the agent to write a weekly report, review a PR, organize meeting notes, or draft release notes, you re-explain the tone, the input files, the output format, and which directories to leave alone. Writing that prompt once is normal. If you are still pasting the same long paragraph the fifth time, the problem is no longer "the prompt is not good enough" — it is a recurring workflow that has never been pinned down.

This lesson does not ask you to write a full Skill right away. We first compress one recurring task into a four-line boundary record, so the later `SKILL.md` has a clear skeleton.

## Explanation

### Start from one concrete task

Look at a one-off prompt:

```text
Turn yesterday's customer interview into a Chinese summary. Keep the customer's own words, and end with 3 product improvement suggestions. Do not change the original transcript.
```

That sentence is fine for a single task. The problem shows up the second and third time: you again have to explain "how to keep the customer's own words", "how specific the suggestions should be", and "which files must not be touched". A one-off prompt is a task note written for the current conversation; it can be short or long, but by default it does not become a capability the agent discovers on its own later.

When the same kind of task keeps appearing, with similar inputs, similar outputs, and similar boundaries each time, it is a recurring task. A recurring task is not necessarily an annoying chore; its key trait is that you can say clearly when it should run, what it takes, what it delivers, and which adjacent things it should not do on the side.

### Name the recurring task as a reusable workflow

A reusable workflow is a set of steps, constraints, and output standards that can be invoked again. Anthropic describes a Skill as a directory containing a `SKILL.md`, instructions, scripts, and resources; OpenAI/Codex also uses Agent Skills as task-specific capability extensions for ChatGPT and Codex.[^S1][^S4]

A Skill lets the agent discover, read, and execute a set of workflow materials on the right task. Compared with a one-off prompt it adds a discoverable entry, a stable boundary, and on-demand resources — but it does not sign up to own an entire business system.

To judge whether a recurring task is worth turning into a Skill, ask four questions first:

- Trigger: when the user says something or hands over certain material, should the agent think of it?
- Input: which files, fields, or context must the agent receive?
- Output: what format should the agent deliver at the end?
- Out of scope: which adjacent tasks are easy to do by accident but do not belong to this Skill?

These four lines are the Skill brief used throughout this course. It is not yet a formal spec field; it is the boundary sketch you draw before writing `SKILL.md`.

### Narrow the Skill's responsibility boundary

A responsibility boundary states what the Skill handles and what it does not. Too narrow, and the agent can only handle one sample; too wide, and the agent drags adjacent tasks in. Anthropic recommends starting from the simplest composable solution, and OpenAI's current guide also asks each Skill to focus on one job.[^S4][^S5]

For example, "help me with content" is too wide; "turn one customer interview transcript into Chinese notes with quoted evidence" fits a Skill well. It has a clear trigger, input, and output, and it can also say what is out of scope: no sales follow-up, no editing the transcript, no product decisions on the user's behalf.

Terms used in this lesson:

- one-off prompt: a task note that serves only the current conversation.
- recurring task: a task that appears many times with similar input and output shapes.
- reusable workflow: a set of steps, constraints, and output standards that can be invoked again.
- responsibility boundary: the scope that states what a workflow handles and what it does not.

```agentmentor-check
{
  "id": "agent-skills-reuse-skill-boundary",
  "label": "Narrow the interview-notes boundary",
  "prompt": "Every week you ask the agent to turn meeting transcripts in the same format into notes, and sometimes you also ask it to schedule follow-up sales actions. Which Skill boundary is more stable?",
  "whyHere": "This step checks whether the learner is mixing one reusable workflow with adjacent business actions.",
  "copyPurpose": "Have the agent check whether I drew one Skill's responsibility boundary too wide.",
  "mode": "single",
  "choices": [
    {
      "id": "wide",
      "text": "Build a customer-success-skill that owns notes, follow-ups, scheduling, and every customer-operations action",
      "correct": false,
      "feedback": "That boundary covers several kinds of output and decisions, so the trigger conditions blur and adjacent tasks get done by mistake."
    },
    {
      "id": "focused",
      "text": "Build an interview-notes-skill that only turns transcripts into notes with quoted evidence",
      "correct": true,
      "feedback": "That boundary rests on stable input and stable output; the follow-up sales actions can be handled by another workflow."
    }
  ]
}
```

## Complete example: an interview-notes Skill brief

Suppose you organize customer interviews every week. The raw task is:

```text
Read the interview transcripts in transcripts/ and produce a Chinese summary that keeps the customer's own words and ends with product suggestions.
```

Rewrite it as a four-line Skill brief:

```text
Trigger: the user asks to organize customer interviews, user research transcripts, or sales call notes.
Input: one or more transcript texts, ideally with speakers and time order.
Output: Chinese Markdown notes with a theme summary, quoted customer evidence, a question list, and 3 product suggestions.
Out of scope: do not modify the original transcript, do not send email for the user, do not decide roadmap priority.
```

These four lines turn repeated explanation into a checkable boundary, but they do not map one-to-one onto formal fields. When you write the `description`, include the capability, the positive trigger conditions, and any negative disambiguation that is truly necessary; input details, full output requirements, and execution bans stay in the body. For example, "do not use this for sending email" — if its purpose is to keep email tasks away — should be compressed into the `description`; "do not modify the original transcript" is a body rule that still applies after the Skill has loaded.

## Half-finished example: a release-notes Skill brief

Complete the half-finished brief below. Note that "out of scope" should block one adjacent task that is very easy to do by accident.

```text
Trigger: the user asks to generate release notes from Git commits, PRs, or a changelog draft.
Input: ________________________________.
Output: ________________________________.
Out of scope: ________________________________.
```

Reference answer:

```text
Input: a commit list, PR summaries, or an existing changelog draft, plus the target reader type.
Output: user-facing Markdown release notes grouped by added, fixed, and known issues.
Out of scope: do not modify code, do not create Git tags, do not decide whether to release on the owner's behalf.
```

Your wording can differ, but it must let the agent judge "when to use this" and "when to stop".

<!-- exercises -->
## Exercises

### Level 1 (Warm-up)

In one of your own real working directories, find a task you have re-explained to the agent at least three times recently, and write its four-line Skill brief. Do not create a formal Skill yet; finish this in a scratch Markdown file or your notes.

How: open that directory, look back at recent task notes or chat history, copy the prompt paragraph you repeat most often, then compress it into the four lines: trigger, input, output, out of scope.
<!-- rubric -->
- All four lines exist, and each line describes only one kind of information.
- The trigger lets the agent judge when it should think of this workflow.
- The out of scope line blocks at least one real adjacent task.
<!-- answer -->
A passing answer reads like a boundary record, not a full manual. For example: "Trigger: the user asks to generate notes from a meeting transcript; Input: one transcript; Output: Chinese Markdown notes; Out of scope: no sending email, no scheduling meetings." A common mistake is writing "be careful" or "high quality" into the boundary — those words cannot help the agent judge the task's scope.
<!-- hint -->
Start from the prompt paragraph you copy-paste most often.
<!-- hint -->
If you cannot think of an out of scope line, recall what the agent once did on its own that you did not ask for.

### Level 2 (Advanced)

Take the same recurring task and write three briefs for it — a too-narrow version, a too-wide version, and a just-right version — then explain why you chose the just-right one.

How: write three sets of four-line briefs around the same real task. The too-narrow version covers only one sample, the too-wide version swallows neighboring processes, and the just-right version keeps stable input and stable output.
<!-- rubric -->
- All three versions are about the same task, not three different tasks.
- You write one sentence each for the risk of the too-narrow and the too-wide version.
- The just-right version's output format and out of scope boundary are both checkable.
<!-- answer -->
Example: for "release notes", a too-narrow version might only handle today's 5 commits in one specific repository; a too-wide version might include editing code, tagging, and notifying users; the just-right version only generates user-facing release notes from the given change material. The reason to choose the just-right version: it can be reused, but it does not replace the release decision.
<!-- hint -->
The too-narrow version usually contains a specific date, a specific file name, or a one-time project name.
<!-- hint -->
The too-wide version usually contains words like "all", "fully owns", or "end to end".
<!-- /exercises -->

## Takeaway: a brief you can rewrite right away

This four-line brief already marks where the task starts, what it needs, what it delivers, and where it stops. Next you will translate it into a formal `SKILL.md`: the discovery stage keeps only the information needed to choose the Skill, and the execution details move into the body.
