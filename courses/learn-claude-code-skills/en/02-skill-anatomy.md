# Lesson 2: Anatomy of a Skill: The SKILL.md File

> Learning goals:
> - Understand the two-part structure of SKILL.md
> - Know the required fields in the YAML frontmatter
> - Learn to write a description that actually works
> - See how to organize the instructions section
>
> Prerequisites: [<< Lesson 1](./01-what-are-skills.md) | Next: [Lesson 3 >>](./03-first-skill.md)

## What a Skill file looks like

Open any Skill and you'll find the same shape:[^S1]

```markdown
---
name: task-organizer
description: Sorts a messy to-do list into groups by priority and due date
---

# Task Organizer

Pull structured information out of a disorganized task list.

## Input format

Accept any of these:
- A plain text list
- A Markdown checklist
- A chat log with timestamps

## Steps

1. Extract the core content of each task
2. Identify the due date, if there is one
3. Judge priority (urgent / important / normal)
4. Sort by due date, soonest first

## Output format

### 🔴 Urgent (due today or tomorrow)
- [task] - due time

### 🟡 Important (due this week)
- [task] - due time

### ⚪ Normal (no clear deadline, or further out)
- [task]
```

**There are two parts to this file:**

1. **YAML frontmatter** (everything between the `---` markers): metadata that tells Claude the basics about this Skill
2. **Markdown instructions** (everything after): the actual directions that tell Claude what to do

## YAML frontmatter: how Claude finds your Skill

The frontmatter is the block at the very top wrapped in `---`. It tells Claude the two things that matter most:[^S3][^S4]

### name: the Skill's unique identifier

```yaml
name: task-organizer
```

- **Rules**: lowercase letters, digits, and hyphens. No spaces.
- **What it does**: the name becomes the command, like `/task-organizer`
- **Advice**: make it descriptive, short, and obvious at a glance

**Good names:**
- `meeting-notes`
- `code-review`
- `changelog-generator`

**Bad names:**
- `my-skill-1` (says nothing)
- `super_amazing_task_helper` (too long, and underscores aren't allowed)
- `taskOrganizer` (camelCase — it has to be lowercase with hyphens)

### description: the field that matters most

```yaml
description: Sorts a messy to-do list into groups by priority and due date
```

**This one sentence decides three things:**[^S6]

1. **When Claude loads this Skill on its own**
2. **What users see in the Skills list**
3. **What Claude understands this Skill to be for**

That's why it deserves more care than anything else in the file:[^S6]

> "The description is the single most important field in your frontmatter. A bad description means your skill either never triggers or triggers on everything. The formula: What it does + When to use it + Key capabilities."

**A good description:**
```yaml
description: Sorts a messy to-do list into groups by priority and due date. Use it on unstructured task lists or meeting action items
```

**Bad descriptions:**
```yaml
description: Helps with tasks  # Too vague — Claude has no idea when to reach for it
description: A powerful task manager with intelligent priority analysis  # Marketing copy; the useful details come last, if at all
```

### Optional fields (covered in Lesson 6, not here)

- `model`: pick which model to use
- `allowed-tools`: restrict which tools this Skill can touch
- `version`: a version number

**For your first Skill, `name` and `description` are all you need.**[^S4]

## Markdown instructions: telling Claude how to do it

Everything after the frontmatter is written for Claude to read and follow.[^S1]

**Good instructions share three traits:**

### 1. Clear sections

Use headings to separate the parts:

```markdown
## Input format
(what kinds of input to accept)

## Steps
(spell out the procedure, one step at a time)

## Output format
(what the result should look like)

## Edge cases
(how to handle the awkward situations)
```

### 2. Concrete steps

**Weak:**
```markdown
1. Analyze the tasks
2. Determine priority
3. Output the result
```

**Strong:**
```markdown
1. Read the task list, one task per line
2. Extract date keywords from the task text (today, tomorrow, Friday, 2024-01-15, and so on)
3. If a task contains "urgent", "ASAP", or "by EOD", mark it high priority
4. Sort by due date, soonest first
5. Output three groups: Urgent, Important, Normal
```

### 3. Examples

If the output format matters, show one:

```markdown
## Output format

### 🔴 Urgent
- Finish the quarterly report - tomorrow 17:00
- Fix the production bug - today

### 🟡 Important
- Review PR #234 - this Friday

### ⚪ Normal
- Update the docs
- Improve performance
```

Once Claude has an example, it knows exactly how to lay things out. Showing beats describing — a sample output does more work than three paragraphs about formatting.

```agentmentor-check
{
  "id": "skills-zh-02-description-quality",
  "label": "Spot the working description",
  "prompt": "You've written a Skill that turns Git commit history into a changelog customers can read. Which description is better?",
  "whyHere": "You just learned the description formula (what it does + when to use it + key capabilities). Vague descriptions look fine to a human reader, so the test is whether you can tell them apart before you ship one.",
  "mode": "single",
  "choices": [
    {
      "id": "a",
      "text": "description: A powerful and intelligent changelog tool that makes your project releases look professional and easy for anyone to read",
      "correct": false,
      "feedback": "This one reads like a product page, not an instruction. \"Powerful\" and \"beautiful\" mean nothing to Claude, and none of the facts that would trigger it are present — no Git commits, no customer-facing output, no filtering. It'll either sit unused or fire on any request that mentions a project."
    },
    {
      "id": "b",
      "text": "description: Turns Git commit history into a customer-facing changelog, filtering out internal commits and rewriting jargon in plain language",
      "correct": true,
      "feedback": "Right. It names what it does (produces a changelog), what it takes in (Git commits), and the key capabilities (filtering, rewriting jargon). Words like \"changelog\" and \"customer-facing\" give Claude something concrete to match a request against."
    }
  ]
}
```

## How the two parts work together

**The frontmatter is the discovery mechanism; the instructions are the execution guide.**[^S2][^S5]

1. You type `/task-organizer`, or just say "help me sort out these tasks"
2. Claude reads the `name` and `description` in the frontmatter and decides whether to load this Skill
3. If it loads, Claude reads the full instructions
4. Claude works through the steps as written
5. The output matches the format the instructions specified

**This is why the description has to be good**: it's the only evidence Claude has when deciding whether to use this Skill at all.[^S6]

Write "helps with tasks" and Claude has no idea which situations call for it. Write "sorts a messy to-do list into groups by priority and due date" and the words "sort", "to-do", and "tasks" in a request are enough to bring it in.

## A real example: taking apart a code review Skill

Here's a Skill that gets real use:

```markdown
---
name: code-review
description: Reviews code changes for team convention violations, likely bugs, and performance problems
---

# Code Review Assistant

## Review checklist

Work through each item below:

### 1. Conventions
- Do variable names follow team convention (camelCase, meaningful names)?
- Are there functions longer than 50 lines (consider splitting)?
- Is there duplicated code (DRY)?

### 2. Likely bugs
- Are there unhandled errors (try-catch, error return values)?
- Any possible null dereferences?
- Any SQL injection risk (if a database is involved)?

### 3. Performance
- Any N+1 queries?
- Any unnecessary nested loops?
- Any repeated computation that could be cached?

## Output format

For every issue, give:
- **Location**: file name + line number
- **Problem**: what specifically is wrong
- **Suggestion**: how to fix it

If nothing is wrong, output "✓ Code review passed"
```

**Breaking it down:**

- **The description in the frontmatter**: says what it does (reviews code) and what it checks for (conventions, bugs, performance)
- **The instructions split into three checklists**: conventions, bugs, performance, each with specific items to look at
- **The output format is explicit**: every issue must carry a location, a problem, and a suggestion

A Skill written like this gets it right on the first try.

<!-- exercises -->
## 💻 Exercises

### Level 1: Fix a broken frontmatter

What's wrong with this frontmatter, and how would you fix it?

```markdown
---
name: My Amazing Tool
description: A tool
---
```

<!-- rubric -->
- Identified the problem with `name` (no spaces, must be lowercase, use hyphens)
- Identified the problem with `description` (too vague, doesn't say what it does)
- Proposed a concrete improvement

<!-- answer -->
**Problems:**

1. `name` has spaces and capital letters. It should be `my-amazing-tool` — though the name itself is still bad, because it says nothing about what the Skill does
2. `description` is just "A tool". It doesn't say what the Skill does or when to reach for it

**A better version:**

```markdown
---
name: api-doc-generator
description: Generates API documentation from code comments, supporting JSDoc and Python docstring formats
---
```

<!-- hint -->
Go back to the naming rules: lowercase letters, digits, hyphens

<!-- hint -->
Go back to the description formula: what it does + when to use it + key capabilities

### Level 2: Write a frontmatter for your own case

Take the task you found in the Lesson 1 exercise and write a frontmatter for it.

<!-- rubric -->
- `name` follows the naming rules (lowercase, hyphens, descriptive)
- `description` covers what it does, when to use it, and the key capabilities
- `description` fits in one sentence, under about 200 characters

<!-- answer -->
An example, based on the customer feedback task from Lesson 1:

```markdown
---
name: feedback-classifier
description: Sorts customer feedback from Slack into bug reports, feature requests, and usage questions, tagging each with a priority. Use it for the daily feedback roundup
---
```

**Why this works:**
- `name` is descriptive — you know what it is on sight
- `description` covers what it does (sorts and classifies feedback), what goes in (Slack customer feedback), what comes out (categories plus priority), and when to use it (the daily roundup)

<!-- hint -->
If you're unsure whether a description is good, ask yourself: which words in a request should make Claude think of this Skill? Put those words in the description.

<!-- /exercises -->

## Recap

- **SKILL.md has two parts**: YAML frontmatter (metadata) and Markdown instructions (directions)
- **Required frontmatter fields**: `name` (lowercase, hyphens, unique) and `description` (what drives automatic triggering)
- **The description formula**: what it does + when to use it + key capabilities
- **Three traits of good instructions**: clear sections, concrete steps, worked examples
- **How the parts fit**: the frontmatter lets Claude find the Skill; the instructions let Claude run it

Next lesson, we start from nothing and write a complete Skill end to end.

[>> Lesson 3: Hands-On: Writing Your First Skill](./03-first-skill.md)
