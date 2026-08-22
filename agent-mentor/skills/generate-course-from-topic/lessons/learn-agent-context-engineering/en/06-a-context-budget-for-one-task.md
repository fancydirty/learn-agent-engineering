# Lesson 6: A Context Budget for One Task

> Lesson objectives:
> - Allocate a real task's context window across named categories before the first turn.
> - Assign each category a lever and a threshold that triggers it.
> - Run the task to completion against the budget, using notes and compaction together.
> - Compare the budget against the session's actual usage and revise it from the difference.
>
> Prerequisites: All four levers, the compaction survival rule, and one note you have tested on a fresh session | Previous [<< 05](./05-subagents-as-a-context-boundary.md) | Next: this is the final lesson

## Everything so far fires too late

Each technique in this course is a repair. You notice the window filling, so you clear tool results. You see a boundary coming, so you relocate a constraint. The audit is about to flood your context, so you delegate it.

All of that works, and all of it is reactive. It requires you to be watching, to notice in time, and to make the right call under the pressure of a session already going wrong. On a long task — the kind where this matters most — you will miss at least one.

A budget moves the decisions before the run. You decide what each category of context is allowed to cost, and what happens when it exceeds that, while you still have full attention and no sunk work to protect. Then the session either holds to the plan or shows you where the plan was wrong, and both outcomes are useful.

This lesson is a procedure with a deliverable. By the end you will have run one real long task against a budget you wrote, and revised the budget from what actually happened.

## Explanation

### What a budget is, and what it is not

A context budget is a written allocation of your window across named categories, with a lever and a trigger attached to each.

It is not a token cap, and treating it as one produces a plan you cannot follow. You have no way to enforce that file reads stay under twenty thousand tokens. What you can do is decide *in advance* what happens when they exceed it — which is the actual decision, and the one that is hard to make well mid-session.

The categories are stable across tasks, because they follow from what actually occupies a window:[^S10]

| Category | What it holds | Your control over it |
|---|---|---|
| Standing instructions | Project files, memory, output style | High — you wrote them, and they load every session |
| Tool and skill surface | Schemas and descriptions for what is installed | High, and usually never exercised |
| Task working set | The files being read and edited | Medium — depends on task scope |
| Tool output | Test logs, command output, search results | High, via clearing |
| Conversation | Your turns, the agent's reasoning, decisions | Medium, via notes and compaction |
| Delegated work | What comes back from subagents | High, via the delegation message |

The two categories that most often blow a budget are the two people never look at: standing instructions that grew over months, and a tool surface installed for a different project.

### Each category gets a lever and a trigger

The budget's content is one line per category, in a fixed shape:

```text
<category>: <rough allocation>, <lever> when <trigger>
```

The trigger is the load-bearing part. "Clear tool results when the window gets full" is not a plan, because "full" is a judgment you will make badly at hour three. "Clear tool results after any command whose output exceeds a screen" is a plan, because it is a decision you have already made.

A worked line: `Tool output: keep only the most recent; clear after each test run once I have read the failure names.` That is executable without judgment, and it can be written before the task starts.

For triggers you cannot express as a rule, use a checkpoint instead — a point in the work where you stop and look. "Before starting each new feature, write the note and consider compacting" is a checkpoint. It works because the boundary between units of work is exactly where a compaction pass costs least, which is why the documented advice is to compact deliberately "before starting a long new task."[^S10]

### Reserve for the note, and place the boundaries yourself

Two allocations that people leave out and then wish they had.

First, the note has a cost. It is read into the window at session start and draws on the same budget as everything else.[^S1] A note that grows unbounded becomes the problem it was written to prevent. Budget it — a size you will hold it to, and the pruning rule from Lesson 4: replaced, not appended.

Second, decide where compaction boundaries fall rather than letting the threshold decide. An automatic pass fires when input tokens reach the trigger,[^S14] which is a moment chosen by arithmetic and unrelated to whether you are mid-thought. A deliberate pass at a unit boundary, with a focus, "keeps what you choose instead of what the automatic pass guesses is important."[^S10]

The sequence that makes a boundary survivable, drawing on Lessons 3 and 4:

```text
1. Finish the current unit of work — do not compact mid-implementation.
   (Anthropic's observed failure was exactly this: running out of context
   mid-implementation, leaving the next session a half-built feature to
   guess at.)[^S9]
2. Write the note. NEXT, DONE, DECIDED, DO NOT.
3. Check the note is on disk. Disk survives; message history does not.[^S10]
4. Compact with a focus naming the next unit, not the last one.
5. First action after the boundary: read the note.
```

Step 5 is the one that gets skipped, and skipping it wastes the other four. A note that exists and is not read is identical to no note.

### Two things a budget must account for

The first is the prompt cache. Clearing content "invalidates cached prompt prefixes," and the guidance is to "clear enough tokens to make the cache invalidation worthwhile."[^S15] So a budget that clears aggressively and often is paying a prompt cache cost repeatedly for small gains. Batch the clearing at checkpoints rather than trickling it, and remember that the same logic applies to spent context you are tempted to clear the moment it appears.

The second is that a subagent's return is your cost. Tens of thousands of tokens spent to return one to two thousand[^S1] is the good case, and it is good because the delegation message asked for a short report. A delegation without a report format returns whatever the subagent thinks is useful, which can be large. Budget the *return*, and specify it in the message.

### Checking a budget against reality

A budget you cannot check is a wish. The check is straightforward if your tool exposes usage.

Claude Code's `/usage` shows a session's token totals by model, in the shape "1.2k input, 5.3k output, 940.0k cache read, 50.0k cache write," and it "resets when `/clear` starts a new session."[^S16] It also attributes "recent usage attributed to skills, subagents, plugins, and individual MCP servers, each shown as a percentage of the total."[^S16] The live per-category breakdown is `/context`.[^S10] Together those answer both questions a budget check asks: what did the session cost in total, and which categories consumed it.

Those specific commands are one tool's surface as of 2026-08-23 and will change. The general requirement does not: to check a budget you need a per-category readout and a session total, and if your tool exposes neither, your check is the qualitative one — did the run degrade, and where.

The comparison to make is not "did I stay under." It is **which category was furthest from its allocation, and in which direction.** A category that came in far under budget was over-allocated, and that allocation was taken from somewhere. A category that blew through is the one to attach a tighter trigger to next time.

## Worked example: a budget, a run, and the revision

A real task shape: migrating a test suite from one framework to another across about forty files. Multi-hour, multi-window, exactly the kind that degrades.

The budget, written before the first turn:

```text
CONTEXT BUDGET — test framework migration
Window: 200k. Target: no more than 2 compaction boundaries.

Standing instructions   ~5%   Trimmed CLAUDE.md to the migration rules
                              plus build commands before starting.
                              Removed the deployment section — not
                              relevant to this task, loads every session.

Tool surface            ~2%   Disabled the database and browser MCP
                              servers for this task. Neither is needed
                              to move test files.

Task working set       ~35%   Files come in batches of 5. Batch is
                              cleared before the next batch is read.
                              TRIGGER: one batch in the window at a time.

Tool output            ~15%   Test runs are the main source. TRIGGER:
                              after reading failure names from a run,
                              clear that output. Batch the clearing at
                              batch boundaries, not after every command.

Conversation           ~25%   TRIGGER: write the note and compact at
                              every batch boundary, focused on the next
                              batch.

Delegated work         ~10%   One delegation planned: survey which of
                              the 40 files use the deprecated setup
                              hook, before starting. Report format: file
                              path plus line number, nothing else.

Note budget            ~8%    Four sections, under 40 lines. Replaced
                              at every batch, never appended.

CHECK: /context at each batch boundary. /usage at the end.
```

Three decisions in that budget are the ones a reactive approach would never make.

Trimming the standing instructions before starting is the highest-leverage line and the one that feels least like context engineering. That file loads at every session start and after every compaction pass,[^S10] so a deployment section irrelevant to this task is paid for on every window of a multi-window job.

Disabling two MCP servers is the same reasoning applied to a surface most people never revisit. They were installed for a different task and have been loading ever since.

The delegation is planned rather than reactive — chosen before the run, when the coupling test was easy to apply, rather than mid-session when the audit's output was already arriving.

What actually happened:

```text
AFTER THE RUN
Compaction boundaries: 3 (budgeted 2)
Batches completed: 8 of 8

Task working set    Held. The one-batch rule worked without effort
                    because it was mechanical rather than a judgment.

Tool output         BLEW THROUGH. Two test runs produced enormous
                    output — a config error made every test fail with a
                    full stack trace. The trigger said "after reading
                    failure names," and there were no failure names to
                    read, so the trigger never fired and the output sat
                    in the window until the next batch boundary.

Conversation        Held, and the boundaries were survivable because
                    the note was written first each time.

Delegated work      Under budget. The survey came back at ~600 tokens
                    against a ~2,000 allowance, because the report
                    format was two fields.

Standing instr.     Held, and paid off four times over — trimmed once,
                    saved at every session start and every boundary.
```

The third compaction boundary traces directly to the tool-output overrun, and the overrun traces to a trigger with a hole in it. "After reading the failure names" assumed failures would have names. A config error produces a different failure shape, and the rule had nothing to say about it.

The revision is one line: `TRIGGER: clear test output after reading it, or immediately if the run failed before executing tests.` Small, specific, and derived from the run rather than from imagination — which is the whole point of checking a budget rather than merely writing one.

Note what did not need revising: every mechanical trigger held. The one that failed was the one requiring a judgment about what had been read. **Triggers that depend on an assessment fail in exactly the conditions that make the assessment hard.** That is the reusable finding, and it is this course's synthesis rather than a claim any source makes.

## Your turn: complete a budget

Half a budget for a documentation-writing task across a large codebase. Fill the four blanks — two allocations and two triggers — then answer the question below them.

```text
CONTEXT BUDGET — API documentation for the payments module
Window: 200k. Task: document 25 public functions across 6 files.

Standing instructions   ~4%   CLAUDE.md trimmed to writing conventions.

Tool surface            ~2%   Nothing disabled — only file tools needed.

Task working set        ____   The 6 source files, read once each.
                        TRIGGER: ______________________________________

Tool output             ~5%   Minimal; no test runs in this task.
                        TRIGGER: clear any search output after use.

Conversation            ~30%  The bulk of this task is drafting prose.
                        TRIGGER: ______________________________________

Delegated work          ____   Planned: survey which functions already
                        have docstrings, so drafting skips those.

Question: this task has an unusual property compared with the migration
example — what is it, and which allocation does it change?
```

Reference answer:

```text
Task working set        ~25%  Six files is a small, bounded working set,
                        and unlike the migration they must stay readable
                        while writing about them.
                        TRIGGER: keep all 6 for the whole task; they are
                        the subject, not scratch. Clear nothing here.
                        (If they will not fit, the task is too large and
                        should be split by file, not managed by clearing.)

Conversation            TRIGGER: compact after every 2 files documented,
                        focused on the writing conventions established
                        so far plus the next file. The conventions are
                        the thing that must cross — they accumulate as
                        the work goes, and they exist nowhere but the
                        conversation until you write them down.

Delegated work          ~5%   One survey, report format: function name
                        plus has-docstring yes/no. Nothing else.

The unusual property: the working set is the deliverable's subject rather
than scratch material. In the migration, files passed through — read,
changed, cleared. Here the source is what the prose is about, so clearing
it defeats the task. That changes the working-set allocation from a
throughput budget to a fixed one, and it changes the failure mode: if the
six files do not fit alongside the drafting conversation, the answer is
splitting the task rather than more aggressive clearing.

There is a second-order consequence worth naming. Because the working set
is fixed and the conversation is where the value accumulates, this task's
main risk is a compaction pass losing the writing conventions you have
established — voice, level of detail, how examples are formatted. Those
are decisions in message history, which is the category boundaries
consume. This is a task where the note should include a CONVENTIONS
section, in addition to the four from Lesson 4, because the standard
four sections have no home for it.
```

That last point is the one to carry: the four briefing sections are a default, not a schema. A task whose accumulating value is a set of conventions needs somewhere to put them, and inventing that section is the correct response rather than a deviation.

```agentmentor-action
mode: pressure_scenario
label: Stress-test my budget's triggers against a session that goes wrong
description: Simulates the failures that make a trigger not fire — an unexpected output shape, a boundary hit mid-implementation, a delegation returning far more than budgeted — to find which of my triggers depend on a judgment I would not be able to make at the time.
purpose: I want the holes in my budget found before I run a multi-hour task on it, specifically the triggers that assume the failure will look the way I imagined it.
rules:
  - Take the budget I paste and introduce one realistic complication at a time, then ask which trigger fires and what I would actually do.
  - Do not fix my budget for me. Name which trigger failed and what assumption it rested on, and let me write the revision.
  - Prefer complications that make a trigger silently not fire over ones that make it obviously fail.
  - Stop after four complications and ask me which revision I would make first.
```

<!-- exercises -->
## 💻 Exercises (point these at your own real environment)

### Level 1 (warm-up)

Write a context budget for a real task you are about to start. Use the six categories, give each an allocation and a lever, and attach a trigger or a checkpoint to every category you can control. Before writing it, run your tool's context breakdown on a fresh session so your standing-instruction and tool-surface numbers are real rather than guessed.

How: pick a task you genuinely expect to exceed one window. Write the budget in a file next to your notes. For each trigger, apply one test — could someone else execute it without asking me what I meant?

<!-- rubric -->
- All six categories have an allocation, and the first two are measured from a real session rather than estimated.
- Every controllable category has a trigger or a named checkpoint.
- Every trigger is executable without a judgment call, or is explicitly a checkpoint where you stop and look.
- You trimmed at least one thing from standing instructions or the tool surface before starting.
- You budgeted the note's own size and named its pruning rule.
<!-- answer -->
A completed budget usually surfaces two things during the writing. The first is a standing-instruction file carrying material irrelevant to this task — the trim is often the single largest saving available and it costs one edit. The second is a tool or MCP surface installed months ago and never revisited, which loads on every session regardless of relevance. On triggers, the executability test is strict on purpose: "clear when the output is large" fails it, because "large" is your judgment at a moment when your judgment is what degrades; "clear after each test run once I have the failure names" passes. A common mistake is budgeting only the categories that felt like a problem last time, which leaves the two invisible categories unexamined — and those are usually where the easy savings are. If your task turns out to fit comfortably in one window, say so: the budget was still worth writing, and the finding is that this task did not need the machinery.
<!-- hint -->
Write the triggers before the allocations. The allocation is a guess you will revise; the trigger is the decision that actually changes the run.
<!-- hint -->
For standing instructions, read the file as if you were the agent starting this specific task. Every section that does not apply is a cost you pay at every session start and after every boundary.

### Level 2 (advanced) — the course's terminal task

Run the task to completion against your budget, crossing at least one compaction boundary and using notes to carry state across it. Then check the budget against the session's actual usage and revise it.

How: run the task for real. At each checkpoint, record what your tool's context breakdown shows per category. At each boundary, follow the five-step sequence: finish the unit, write the note, confirm it is on disk, compact with a focus, read the note first on the far side. When the task is done, pull the session totals and compare category by category. Then write the revised budget with each change traced to something that happened.

<!-- rubric -->
- The task was completed, not abandoned partway.
- You crossed at least one compaction boundary and the work continued correctly across it — you can name one specific thing the note carried that the summary did not.
- You have per-category readings from at least two checkpoints, not only from the end.
- You identify the category furthest from its allocation, in either direction, and explain why.
- At least one trigger is revised, and the revision is traced to a specific event in the run rather than to a general improvement.
- You can state what the budget cost you to maintain against what it saved, honestly, including the case where it saved little.
<!-- answer -->
A completed run usually produces one over-budget category and one over-allocated one, and both are informative. The over-allocated category is the more interesting finding: it means you took capacity from somewhere else on a guess, and the correction frees real room. Trigger revisions cluster in one place — triggers that assumed a shape of output that did not occur. A common example: "clear the search results after use" never fires on a search that returns nothing useful, because "after use" implies a use that did not happen, and the empty result sits there anyway. The boundary check is the part that proves the course landed: name one specific thing the note carried that the summary did not, and if you cannot, either the note was redundant with the summary — worth knowing — or the boundary was not hard enough to test it. A common mistake in the accounting is counting only the tokens saved and ignoring the time spent writing the budget and maintaining notes; on a task that fits in one window the budget is net negative, and saying so is a more useful result than a fabricated saving. The honest form of this exercise ends with a statement about which tasks are worth budgeting, not with a claim that budgeting always pays.
<!-- hint -->
Take the checkpoint readings even when the run is going well. A budget that was never tested by trouble tells you your allocations were generous, which is itself a revision.
<!-- hint -->
When you compare, look first at the two categories you did not think about while running — standing instructions and the tool surface. They are the ones with no trigger, so they hold whatever they held at the start.
<!-- /exercises -->

## What you can now do that you could not

You started with a long task that came apart: an agent forgetting decisions, repeating work, drifting off the thing you asked for. You now have an account of why that happens that does not rely on the agent being tired or the window overflowing — recall degrades continuously as input grows, on current models, with retrieval held perfect.

More usefully, you have moves. You can sort any occupant of a window into four levers and reach for the cheapest one that fits. You can predict what a compaction boundary will take, because the rule is one sentence about how each thing was loaded. You can write a note a stranger can resume from, with decisions that carry their reasons. You can put a loud workstream behind a boundary and say what the boundary costs. And you have run one real task against a budget you wrote and revised from what happened.

Two things this course deliberately did not cover, worth naming so you know where the edges are. Building a harness — the loop, the tool layer, the session machinery — is a different discipline, and the levers here are about operating a harness rather than constructing one. Coordinating multiple agents working in parallel is also a different discipline: subagents appeared here only as a wall, never as workers, and every question about splitting a task among several agents and recombining their results is a question this course did not answer.

The thing worth keeping is the budget, and specifically the habit of revising it. A budget written once is a guess; a budget revised after three real tasks encodes what actually goes wrong in your work, which is not what goes wrong in anyone else's. The triggers that survive that process are worth more than any list of techniques, including this one.
