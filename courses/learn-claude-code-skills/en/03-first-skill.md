# Lesson 3: Hands-On: Writing Your First Skill

> Learning goals:
> - Create the directory structure for a Skill
> - Write a complete SKILL.md from scratch
> - Understand the principle of progressive disclosure
> - Invoke your Skill for the first time
>
> Prerequisites: [<< Lesson 2](./02-skill-anatomy.md) | Next: [Lesson 4 >>](./04-testing-debugging.md)

## What We're Building

In this lesson we build a real, usable Skill from nothing: a **task organizer**.

**What it does:**
- Input: a pile of messy to-dos (loose text, text pulled out of a screenshot, meeting notes)
- Output: a clean list grouped by priority and due date

**Why this one:**
- It's simple — no complicated logic to get in the way
- It's useful — you can start using it today
- It exercises every core part of a Skill's structure

## Step 1: Create the Directory and File

Open a terminal and run:

```bash
# Create the personal skills directory (if you don't have one yet)
mkdir -p ~/.claude/skills

# Create the Skill directory
mkdir ~/.claude/skills/task-organizer

# Create the SKILL.md file
touch ~/.claude/skills/task-organizer/SKILL.md
```

**Your directory structure now looks like this:**

```
~/.claude/skills/
└── task-organizer/
    └── SKILL.md
```

Open `SKILL.md` in your text editor of choice (VS Code, Cursor, whatever you use).

## Step 2: Write the Frontmatter

Start with the metadata at the top of the file: [^S1]

```markdown
---
name: task-organizer
description: Organizes to-do items and groups them by priority and due date. Use for messy task lists, meeting action items, or project backlogs
---
```

**Checklist:**
- ✓ `name` is lowercase and hyphenated
- ✓ `description` covers what it does (organizes to-dos), what it takes in (a messy list), and when to reach for it (meeting action items, project backlogs)

## Step 3: Write the Title and Intro

After the frontmatter, add a heading:

```markdown
# Task Organizer

Pull tasks out of unstructured text and organize them into a structured list by priority and due date.
```

**Why bother with a title and intro:**
- The title is for humans — come back to this file in three months and you'll remember what it's for in one glance
- The intro is for Claude — it fills in detail the `description` didn't have room for

## Step 4: Define the Input Format

Tell Claude what kind of input to accept: [^S5]

````markdown
## Input Format

Accept a task list in any of these forms:

- A plain text list (one task per line)
- A Markdown checklist (`- [ ] task text`)
- Messages with time markers ("need X done by tomorrow")
- Action items buried in meeting notes

**Example input:**

```
Finish the quarterly report
- [ ] Review PR #234
Need to fix that login bug tomorrow
Prep the demo before Friday
Update the docs
```
````

**What this section accomplishes:**
- It enumerates every input shape the Skill might see
- It gives one concrete example, so Claude knows what real input actually looks like

## Step 5: Write the Processing Steps

This is the heart of the instructions, and it needs to be specific: [^S5]

```markdown
## Processing Steps

Work through these in order:

1. **Extract the tasks**
   - Each line or list item is one task
   - Strip checkbox markers (`- [ ]` or `- [x]`)
   - Keep the core description of the task

2. **Identify time information**
   - Look for date words: today, tomorrow, this week, day names (Monday, Friday), explicit dates (2024-01-15)
   - Look for deadline phrasing: "by X", "due X", "before X"
   - If there's no explicit time, mark it "no deadline"

3. **Assign a priority**
   - Contains "urgent", "ASAP", "right away", "immediately" → Urgent
   - Contains "important", "priority", "critical" → Important
   - Due today or tomorrow → Urgent
   - Due within this week → Important
   - Everything else → Normal

4. **Sort**
   - Within a priority level, sort by due date, soonest first
   - Tasks with no deadline go last within their level
```

**Why this much detail:**

Claude isn't a person and won't "get what you mean." Write "assign a priority" and it has no idea what standard to apply. Write "contains 'urgent' → Urgent" and there's nothing left to guess. [^S2]

## Step 6: Define the Output Format

Tell Claude what the result should look like:

```markdown
## Output Format

Use this structure, with emoji as the priority marker:

### 🔴 Urgent (today or tomorrow)
- [task] - deadline

### 🟡 Important (this week)
- [task] - deadline

### ⚪ Normal
- [task] - deadline (if any)

**Example output:**

### 🔴 Urgent
- Fix the login bug - tomorrow
- Finish the quarterly report - today

### 🟡 Important
- Review PR #234 - Friday
- Prep the demo - Friday

### ⚪ Normal
- Update the docs - no deadline
```

**What the example buys you:**

Once Claude has seen an example, the layout, symbols, and formatting are settled. No guessing about where the emoji goes or whether the time comes before or after the task.

## Step 7: Handle Edge Cases

Spell out how to deal with the odd cases:

```markdown
## Notes

- If the input is empty or no tasks can be identified, output "No valid tasks found"
- If none of the tasks carry time information, put them all under Normal
- If a task description runs long (over 100 characters), keep the first 80 and append "..."
- Skip tasks already marked done (`[x]`)
```

## The Complete File

Your `SKILL.md` should now look like this:

```markdown
---
name: task-organizer
description: Organizes to-do items and groups them by priority and due date. Use for messy task lists, meeting action items, or project backlogs
---

# Task Organizer

Pull tasks out of unstructured text and organize them into a structured list by priority and due date.

## Input Format

Accept a task list in any of these forms:

- A plain text list (one task per line)
- A Markdown checklist (`- [ ] task text`)
- Messages with time markers ("need X done by tomorrow")
- Action items buried in meeting notes

## Processing Steps

Work through these in order:

1. **Extract the tasks**
   - Each line or list item is one task
   - Strip checkbox markers
   - Keep the core description of the task

2. **Identify time information**
   - Look for date words: today, tomorrow, this week, day names, explicit dates
   - Look for deadline phrasing: "by X", "due X"
   - If there's no explicit time, mark it "no deadline"

3. **Assign a priority**
   - Contains "urgent", "ASAP", "right away", or due today/tomorrow → Urgent
   - Contains "important", "priority", or due within this week → Important
   - Everything else → Normal

4. **Sort**
   - Within a priority level, sort by due date, soonest first

## Output Format

### 🔴 Urgent (today or tomorrow)
- [task] - deadline

### 🟡 Important (this week)
- [task] - deadline

### ⚪ Normal
- [task] - deadline (if any)

## Notes

- If the input is empty, output "No valid tasks found"
- If none of the tasks carry time information, put them all under Normal
- If a task description runs long (over 100 characters), keep the first 80 and append "..."
- Skip tasks already marked done (`[x]`)
```

Save the file.

## Step 8: Your First Invocation

Open Claude Code and type:

```
/task-organizer

Finish the quarterly report
Review PR #234, by Friday
Fix the login bug tomorrow
Update the docs
Urgent: payment issue reported by a customer
```

Claude should give you:

```
### 🔴 Urgent
- Fix the login bug - tomorrow
- Payment issue reported by a customer - no deadline

### 🟡 Important
- Review PR #234 - Friday

### ⚪ Normal
- Finish the quarterly report - no deadline
- Update the docs - no deadline
```

**If the output isn't right, don't panic.** The next lesson is entirely about debugging.

## Progressive Disclosure: Why You Don't Write Every Detail Up Front

You may have noticed this Skill has nothing to say about tasks that depend on other tasks, or tasks assigned to different people. [^S2][^S5]

**That's on purpose.**

**Progressive disclosure: give Claude only what it needs right now, instead of dumping everything on it at once.** [^S2]

The first version does the core job and nothing more — extract, classify, sort. Use it for a few days, and if you find you genuinely need task assignment, add it then.

**What you get out of it:**
- A short Skill file: less context consumed, faster loading
- Simple logic: fewer ways to go wrong
- Quick confirmation that the core behavior actually works

Get version one running, then iterate. That's how every good Skill gets built. [^S2]

<!-- exercises -->
## 💻 Exercises

### Level 1: Create Your Own First Skill

Take the task you settled on in the Lesson 1 and Lesson 2 exercises and build a complete SKILL.md for it.

**Requirements:**
1. Create the directory structure
2. Write complete frontmatter (name + description)
3. Write instructions covering at minimum: input format, processing steps, output format
4. Save the file
5. Invoke it once in Claude Code

<!-- rubric -->
- The directory structure is correct (`~/.claude/skills/your-skill-name/SKILL.md`)
- The frontmatter's name and description follow the conventions
- The instructions cover all three parts: input, steps, output
- The steps are specific enough (not vague hand-waving like "analyze the data")
- You invoked it successfully at least once, regardless of whether the result was right

<!-- answer -->
Example (built around a customer-feedback triage task):

```markdown
---
name: feedback-classifier
description: Sorts Slack customer feedback into bug reports, feature requests, and usage questions, and tags each with a priority. Use for the daily feedback roundup
---

# Feedback Classifier

Pull customer feedback out of Slack messages and organize it by type and priority.

## Input Format

Accepts:
- Exported Slack messages (plain text)
- Text extracted from screenshots of customer feedback
- Messages copied and pasted by hand

## Processing Steps

1. **Extract the feedback**
   - Identify the core problem or request in each message
   - Drop the surrounding chatter (greetings, thanks, and so on)

2. **Determine the type**
   - Describes an error, a crash, or something not working → Bug report
   - Asks for a new capability or a better experience → Feature request
   - Asks how to do something or why it works that way → Usage question

3. **Tag a priority**
   - Affects production, blocks people from working → P0 (highest)
   - Affects some users, workaround exists → P1
   - Polish, nice to have → P2

4. **Pull out the key details**
   - Which part of the product is involved
   - Who the user is (if mentioned)
   - Whether it's time-sensitive

## Output Format

### Bug Reports
- [description] - priority - area

### Feature Requests
- [request] - priority - area

### Usage Questions
- [question] - area

## Notes

- If one message raises several separate issues, split it into several entries
- If the priority isn't clear, tag it P1
- Keep the original timestamp when there is one
```

<!-- hint -->
Not sure your steps are specific enough? Ask yourself: if a colleague who has never done this task followed this file line by line, would they get it right?

<!-- hint -->
The first version doesn't have to be perfect. Write the core flow, get it running, iterate on the details later

### Level 2: Test the Edge Cases

Feed your Skill an input that isn't well-behaved, such as:
- Empty input
- Input with a garbled format
- Input containing special characters

See what comes out and write it down. We'll use that result for debugging practice in the next lesson.

<!-- rubric -->
- You tested at least one edge case
- You recorded both the input and the actual output
- You can say whether the output matched what you expected

<!-- answer -->
Example test:

**Input:** empty string

**Expected:** should output "No valid tasks found"

**Actual output:** (record what Claude actually produced)

**Matched expectations:** (yes / no — if no, say where it diverged)

<!-- hint -->
Edge cases to consider: empty input, malformed input, very long input, special characters, extreme values

<!-- /exercises -->

## Recap

- **The 7 steps to building a Skill**: directory → frontmatter → title → input → steps → output → edge cases
- **Steps must be specific**: not "analyze the tasks" but "look for date words: today, tomorrow…"
- **Examples matter**: show Claude what the input and output actually look like
- **Progressive disclosure**: version one does the core job only — don't write every detail up front
- **How to invoke**: `/skill-name` followed by your input

Next lesson we cover testing and debugging Skills — moving from "it runs" to "it runs correctly."

[>> Lesson 4: Testing and Debugging](./04-testing-debugging.md)
