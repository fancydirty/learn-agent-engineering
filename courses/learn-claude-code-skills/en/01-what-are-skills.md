# Lesson 1: What Skills Are: Why You Need Custom Workflows

> Learning goals:
> - Understand the core problem Skills solve
> - Recognize which work scenarios are worth automating with a Skill
> - Understand the basic mechanics of how Skills work
>
> Prerequisites: You've used the basic features of Claude Code | Next: [Lesson 2 >>](./02-skill-anatomy.md)

## You Explain the Same Process Every Single Time

You're using Claude Code to clean up meeting notes. You type: "Take this meeting transcript and turn it into structured points — split it into decisions, action items, and open questions, and tag every action item with an owner and a due date."

Claude does it. The output is good.

The next day, another meeting. You type the same thing again.

Day three, day four. After every meeting you're re-issuing the same instructions. Claude gets it right every time, but every time you have to explain it from scratch.[^S1]

**That's the problem Skills solve**: take a workflow you keep explaining and package it as a reusable instruction. Write it once, call it whenever you need it.[^S2]

## What a Skill Is

**A Skill is a directory containing a SKILL.md file that tells Claude how to do one specific task.**[^S4]

Think of it as a written procedure you hand to Claude. You write the steps down clearly, and Claude works from them. No more starting the explanation over.[^S3]

For example, the core of a meeting-notes Skill might look like this:

```markdown
---
name: meeting-notes
description: Turn a meeting recording or transcript into decisions, action items, and open questions
---

# Meeting Notes Cleanup

## Steps

1. Read the meeting content (transcript or recording file)
2. Pull out every decision that was actually made, one per line
3. Pull out every action item, formatted as: [action] - owner - due date
4. List everything that came up but wasn't decided, as open questions
5. Order the output by date, with the nearest due dates first
```

Once that's saved, you type `/meeting-notes` plus the meeting content, and Claude already knows what to do.[^S1]

## Which Scenarios Fit Skills

**Scenarios that suit a Skill share three traits:**

1. **Repetition**: you do the same thing weekly, daily, sometimes hourly
2. **Fixed steps**: the process can be written as clear steps rather than changing every time
3. **Verifiable**: you can tell whether Claude got it right

**Typical fits:**

- Code review (checking work against your team's conventions)
- Document format conversion (Markdown to Word, preserving specific formatting)
- Log analysis (extracting the signal out of error logs)
- Test case generation (turning a feature description into test scenarios)
- Commit message normalization (rewriting terse commits into your team's agreed format)

**Scenarios that don't suit a Skill:**

- One-off tasks (like "help me design the layout for this page")
- Tasks that need a lot of human judgment on every pass
- Fully open-ended creative work

```agentmentor-check
{
  "id": "skills-zh-01-scenario-judge",
  "label": "Judge whether the commit-to-changelog scenario fits a Skill",
  "prompt": "Every day you turn your team's Git commit messages into a changelog customers can read. The steps are fixed: filter out internal commits, rewrite the jargon in plain language, group by feature. Does this scenario fit a Skill?",
  "whyHere": "You just learned the three traits that make a scenario suit a Skill (repetition, fixed steps, verifiable). The common mistake at this point is confusing varying *content* with a varying *process* and ruling out a scenario that actually fits, so it's worth testing the criteria on a concrete case before moving on.",
  "mode": "single",
  "choices": [
    {
      "id": "a",
      "text": "No — the commit content is different every single day",
      "correct": false,
      "feedback": "Differing content isn't a problem. A Skill captures a repeating **process**, not repeating content. As long as filter → rewrite → group stays the same, the scenario fits."
    },
    {
      "id": "b",
      "text": "Yes — the process is fixed, it repeats daily, and you can check it",
      "correct": true,
      "feedback": "Right. All three traits hold: it repeats daily, the steps are fixed (filter → rewrite → group), and you can judge whether the rewritten changelog is good enough. This is exactly what Skills are for."
    }
  ]
}
```

## How Skills Work

When you create a Skill, you're really doing two things:[^S5]

1. **Writing YAML frontmatter** (the part at the top of the file wrapped in `---`), which tells Claude what this Skill is called and when to use it
2. **Writing Markdown instructions** (the body after the frontmatter), which tells Claude exactly how to carry the task out

**Two ways to use it:**

- **Manual invocation**: you type `/meeting-notes`, Claude loads that Skill's instructions and runs them
- **Automatic triggering**: you say "clean up these meeting notes for me," Claude reads the descriptions, decides the meeting-notes Skill is relevant, and loads it on its own[^S6]

Automatic triggering only works if the description is written well. We cover that in detail in Lesson 2.

## Where Skills Live

**Two locations:**[^S1]

- **Personal skills**: `~/.claude/skills/` — yours alone, available in every project
- **Project skills**: `.claude/skills/` — kept in the project directory, so teammates get them when they clone the repo

For your first Skill, start with personal skills. Once you've written a few and confirmed they're actually useful, move the ones you reach for most into the project directory so the team can share them.

<!-- exercises -->
## 💻 Exercises

### Level 1: Identify Your First Skill Candidate

Look back over your last week of work and find one task you've explained to Claude at least three times.

Write down:
1. What is the task?
2. Are its steps fixed?
3. Can you tell whether Claude got it right?

<!-- rubric -->
- The task description is clear enough that someone else could understand what you do
- You state explicitly whether the steps are fixed
- You explain how you'd verify the result

<!-- answer -->
Sample answer:

**Task**: Sort customer feedback from a Slack channel into bug reports, feature requests, and usage questions

**Steps fixed?**: Yes. It's always read the messages, decide the category, file it, add a priority tag

**Verifiable?**: Yes. I can see whether the categories are right and whether the priority tags are reasonable

**Fits a Skill?**: Yes. High repetition, fixed steps, verifiable

<!-- hint -->
If nothing comes to mind, try these angles: something you do daily or weekly, something where your instructions to Claude run longer than three sentences, something you'd want the rest of your team to do the same way

<!-- hint -->
It doesn't have to be a programming task. Document cleanup, data scrubbing, format conversion, content review — all fair game

<!-- /exercises -->

## Recap

- **Skills package a repeating workflow as a reusable instruction**, so you don't re-explain it every time
- **Scenarios that fit a Skill**: repetition, fixed steps, verifiable results
- **A Skill is a directory plus a SKILL.md file** containing YAML frontmatter and Markdown instructions
- **Two ways to use one**: manual invocation (`/skill-name`) or automatic triggering (Claude decides from the description)
- **Two locations**: personal skills (`~/.claude/skills/`) and project skills (`.claude/skills/`)

In the next lesson we take a real SKILL.md file apart and look at what each piece of it does.

[Lesson 2 >>](./02-skill-anatomy.md)
