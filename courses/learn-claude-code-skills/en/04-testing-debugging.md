# Lesson 4: Testing and Debugging: Making Sure Your Skill Behaves

> Learning goals:
> - Learn the basic ways to test a Skill
> - Diagnose the failures you'll actually hit
> - Understand the iteration loop
> - Know how to check whether a Skill is genuinely worth keeping
>
> Prerequisites: [<< Lesson 3](./03-first-skill.md) | Next: [Lesson 5 >>](./05-code-review-skill.md)

## Your first Skill won't be right

You wrote your first Skill, ran it, and noticed things like:

- Some tasks weren't recognized at all
- Priorities came out wrong
- The output format was a mess
- Or Claude never loaded the Skill in the first place

**That's normal.**

Skills are like code: getting it to run once is the starting line, not the finish. Every Skill that's actually useful got there through several rounds of revision.[^S8]

This lesson gives you a repeatable way to find and fix those problems.

## Testing method 1: Invoke it directly

**The simplest test is a direct invocation: call it once with `/skill-name` and watch what comes out.**[^S1]

### Prepare your test cases

Before you invoke anything, write down three to five inputs.

**Normal cases:**
```
Finish the quarterly report
Review PR #234, before Friday
Fix the login bug tomorrow
```

**Edge cases:**
```
(empty input)
```

**Garbage cases:**
```
This is a paragraph of completely unrelated prose with no tasks in it
asldfkjasldfj!@#$%
```

### Run the tests

In Claude Code, feed them in one at a time:

```
/task-organizer

Finish the quarterly report
Review PR #234, before Friday
Fix the login bug tomorrow
```

**Watch three things:**

1. **Did Claude load the Skill at all?** (If not, the problem is in the description.)
2. **Is the output format correct?** (If it's messy, the problem is in your output-format section.)
3. **Is the content what you expected?** (If the categories are wrong, the problem is in your processing steps.)

### Write down what happened

A small table is enough:

| Input | Expected | Actual | Problem |
|-------|----------|--------|---------|
| "Finish the quarterly report\nFix the bug tomorrow" | 2 tasks; the bug is urgent | Only 1 task found | Newlines aren't being treated as separators |

## Testing method 2: Watch the loading behavior

Sometimes the problem isn't in the instructions at all — it's in the frontmatter.

### Problem: Claude doesn't load the Skill on its own

**What you see:** you say "help me organize these tasks" and Claude ignores your task-organizer Skill.

**Likely causes:**

1. **The description is too generic**
   ```yaml
   description: Handles tasks  # Too vague — Claude has no idea when this applies
   ```

   **Fix:** put the trigger words in.
   ```yaml
   description: Organizes to-do items and groups them by priority and due date. Use for messy task lists or meeting action items
   ```

2. **The description doesn't contain the words you actually say**

   If you say "help me sort out these to-dos" but "to-do" appears nowhere in the description, Claude may never think of the Skill.[^S6]

   **Fix:** write the words a user would plausibly say into the description.

### Problem: Claude loads the wrong Skill

**What you see:** you wanted task-organizer, but Claude picked up something else.

**Likely cause:** the other Skill's description matches your input more closely.

**Fix:** force the call with `/task-organizer`, or sharpen your description so it's more specific than the competitor's.

## Diagnosing common failures

### Problem 1: The output format is wrong

**What you see:** the Skill runs, but the formatting is off.

**Example:**

```
Urgent: Fix the login bug - tomorrow
Important: Review PR #234 - Friday
```

You wanted grouped sections with emoji and headings; Claude gave you a flat text list.

**Cause:** the output-format section isn't specific enough, or it has no example.

**Fix:** put a complete example in the "Output format" section of your SKILL.md:

```markdown
## Output format

Output must follow this format exactly, including the emoji, headings, and indentation:

### 🔴 Urgent (today or tomorrow)
- Fix the login bug - tomorrow

### 🟡 Important (this week)
- Review PR #234 - Friday

### ⚪ Normal
- Finish the quarterly report - no stated deadline
```

**Say "must follow this format exactly," then show the whole thing.**

### Problem 2: Recognition is inaccurate

**What you see:** some tasks get missed, or they land in the wrong category.

**Example:**

Input:
```
Need to fix that bug tomorrow
Get the demo ready before Friday
```

Output:
```
### ⚪ Normal
- Need to fix that bug tomorrow - no stated deadline
- Get the demo ready before Friday - no stated deadline
```

Both have a clear deadline, and both were marked as having none.

**Cause:** the time-recognition rules in your processing steps don't cover enough cases.

**Fix:** fill them in.

```markdown
2. **Identify time information**
   - Look for date keywords:
     * today, tonight
     * tomorrow
     * the day after tomorrow
     * this week, Monday through Sunday
     * next week, next <weekday>
     * explicit dates (2024-01-15, January 15, 1/15)
   - Look for deadline phrasing:
     * before X, by X
     * due X, deadline X
     * needs to be done by X
```

**The point:** spell out every phrasing you can think of.

### Problem 3: Edge cases fall through

**What you see:** normal input is fine, but unusual input makes the Skill behave strangely.

**Example:**

Input: an empty string

Output: Claude stalls, or produces a pile of meaningless text.

**Cause:** your "Notes" section never said what to do with empty input.

**Fix:**

```markdown
## Notes

- **On empty input or no valid tasks**, output "No valid tasks found — please provide a list of to-do items"
- **When no task has any time information**, put everything under "Normal" and add the note "No explicit deadlines detected"
- **When a task description runs past 100 characters**, truncate to the first 80 plus "..."
- **When the input contains completed items (`[x]`)**, skip them
```

## The iteration loop

**Good Skills aren't written once. They come out of a test-fix-test loop:**[^S8]

```
1. Write the first version (core behavior only)
2. Run it against 3-5 test cases
3. Write down what went wrong
4. Edit SKILL.md
5. Test again
6. Repeat 3-5 until every test case passes
7. Use it for real for a week
8. Find new problems
9. Go back to step 4
```

**Don't expect version one to be right.** Make it run, then make it correct, then make it good.

```agentmentor-check
{
  "id": "skills-zh-04-diagnosis",
  "label": "Diagnosing a loading failure",
  "prompt": "You built a Skill called changelog-gen that turns Git commits into a changelog. Its description reads \"Generates a changelog.\" In Claude Code you say \"help me generate a changelog,\" but Claude never loads the Skill. What's the most likely cause?",
  "whyHere": "You've just seen how the description drives automatic loading. This checks whether you can tell a discovery failure (Claude never thought of the Skill) apart from an installation failure (the Skill isn't there at all) — the two look identical from the outside but have completely different fixes.",
  "mode": "single",
  "choices": [
    {
      "id": "a",
      "text": "The Skill file is saved in the wrong directory, so Claude can't see it",
      "correct": false,
      "feedback": "If the file were in the wrong place, `/changelog-gen` wouldn't work either. The symptom here is that Claude didn't load it *automatically*, which means the Skill exists and was readable — the description just didn't bring it to mind."
    },
    {
      "id": "b",
      "text": "The description is too generic and has no trigger keywords",
      "correct": true,
      "feedback": "Right. \"Generates a changelog\" never says what the input is (Git commits) or when to reach for it. The phrase \"changelog\" does appear, but \"generates\" carries no signal. Rewrite it as \"Turns Git commit history into a customer-facing changelog\" — now the input (commits) and the scenario (customer-facing, history) are both in there, and Claude can match on them."
    }
  ]
}
```

## Is the Skill actually useful?

Once it runs correctly, there's a bigger question left: **is this Skill actually saving you time?**[^S8]

### A/B it

The comparison is simple: run the same task several times with and without the Skill, and time both.

**Without the Skill:**

Time it. You explain the process by hand, Claude executes — how long does that take on average?

**With the Skill:**

Time it. You invoke the Skill, Claude executes — how long on average?

**If the Skill version isn't faster, or the quality is worse, the Skill still needs work.**

### Use it for a week

The real test is real use.[^S10]

**Track these numbers:**

- How many times you invoked it
- How many times the result was usable as-is, with no manual edits
- How many times you had to re-run it or fix the output by hand
- How much time it saved

**If you invoked it fewer than three times in a week, the task probably isn't repetitive enough to justify a Skill.**

## Debugging cheat sheet

When a Skill won't work, start with a loading-failure check — walk the table below and rule out the file path, the frontmatter format, and the trigger keywords in that order.

| Problem | How to diagnose | Where to fix |
|---------|-----------------|--------------|
| Claude doesn't auto-load the Skill | Check whether the description contains the words you actually said | Add trigger words, spell out the use case |
| Output format is messy | Check whether you gave a complete output example | Add the example, add "must follow this format exactly" |
| Recognition is inaccurate | Check whether the processing steps enumerate every case | Add rules, add more decision criteria |
| Edge cases misbehave | Check whether "Notes" covers that case | Add explicit handling for the special case |
| The Skill exists but won't invoke | Check the file path, check the frontmatter format | Confirm the `---` markers are in the right place and the YAML indentation is valid |

<!-- exercises -->
## 💻 Exercises

### Level 1: Debug your own Skill

Take the Skill you built in Lesson 3 and run it through a full test pass:

1. Prepare 3 test cases (one normal, one edge, one garbage)
2. Record the expected and actual output for each
3. Find at least one concrete problem
4. Edit SKILL.md
5. Re-test and confirm the problem is gone

<!-- rubric -->
- Test cases cover normal, edge, and garbage input
- Expected and actual output are both written down
- At least one specific problem identified (not "it feels a bit off")
- A specific part of SKILL.md was changed
- Re-tested and the fix confirmed

<!-- answer -->
A sample debugging pass:

**Test case 1 (normal):**
- Input: `"Finish the report\nFix the bug tomorrow"`
- Expected: 2 tasks, the bug is urgent
- Actual: only 1 task found
- **Problem:** the newline `\n` isn't being treated as a task separator

**Fix:** extend the "Extract tasks" step:
```markdown
1. **Extract tasks**
   - Split on newlines (\n) or list markers
   - Each line, or each item starting with `- `, is one task
```

**Re-test:** passes ✓

**Test case 2 (edge):**
- Input: empty string
- Expected: output "No valid tasks found"
- Actual: output "### ⚪ Normal (no tasks)"
- **Problem:** the Notes section never specified the output for empty input

**Fix:** extend "Notes":
```markdown
- **On empty input**, output "No valid tasks found — please provide a list of to-do items" and nothing else. Do not print category headings.
```

**Re-test:** passes ✓

<!-- hint -->
"Edge cases" include: empty input, exactly one task, every task at the same priority, very long input, special characters.

<!-- hint -->
If you can't find a problem, your first version was solid. Try something more extreme — 100 tasks at once, or task descriptions containing emoji.

### Level 2: Compare against no Skill

Do the same task twice: once with your Skill, once by just describing what you want to Claude directly. Then compare:

1. Which was faster
2. Which produced better results
3. Which was more consistent (same output shape across repeated runs)

<!-- rubric -->
- The same task completed both ways
- Timings recorded
- Quality and consistency assessed
- A clear statement of where the Skill wins — or an honest admission that it doesn't

<!-- answer -->
A sample comparison:

**Task:** organize a message containing 8 to-do items

**Without the Skill:**
- Time: 45 seconds (15 seconds explaining what I wanted + 30 seconds for Claude)
- Quality: categories mostly right, formatting inconsistent
- Consistency: ran it 3 times, got a slightly different layout each time

**With the Skill:**
- Time: 15 seconds (5 seconds to invoke + 10 seconds for Claude)
- Quality: categories accurate, formatting exactly as the Skill defines it
- Consistency: ran it 3 times, output format identical every time

**Conclusion:** the Skill version is 3x faster and far more consistent. Worth keeping and improving.

<!-- hint -->
If the Skill version isn't faster or the quality is worse, don't force it. Go back and question whether this task suits a Skill at all.

<!-- /exercises -->

## Recap

- **Your first Skill won't be right** — it takes a test-fix-test loop to get there
- **Testing methods:** invoke it directly, watch the loading behavior, prepare test cases up front
- **Common failures:** description too generic, output format under-specified, recognition rules incomplete, edge cases unhandled
- **Debugging flow:** record expected vs. actual, diagnose, edit SKILL.md, re-test
- **Proving it's worth it:** compare time, quality, and consistency with and against no Skill, then use it for a week and count the invocations

In the next lesson we'll walk through a complete code review Skill and see how to handle a more involved workflow.

[>> Lesson 5: Case Study: Building a Code Review Skill](./05-code-review-skill.md)
