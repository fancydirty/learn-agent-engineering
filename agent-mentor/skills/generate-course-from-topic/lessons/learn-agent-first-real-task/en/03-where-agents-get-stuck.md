# Lesson 3: Where Runs Come Apart

> Lesson objectives:
> - Explain why a task's length, not its difficulty, is the strongest predictor of failure.
> - Recognize three failure patterns that vendors have documented on real long runs.
> - Resize your own task so that a failure is survivable and visible.
>
> Prerequisites: a bounded task from Lesson 2 | Previous [<< 02](./02-bounding-the-task.md) | Next [04 >>](./04-reading-actions.md)

## The task that was going fine

Your run is twelve minutes in. The first few steps were visibly correct. Then the reports start getting shorter. Then it announces it is finished, and the work is about two-thirds done — but described as though it were all done.

Nothing dramatic happened. There was no error message, no crash, no point where it obviously went wrong. This is the most common way a first real task ends, and the useful thing about it is that it is *predictable*. The patterns behind it have been documented by the people who build these systems, and they are patterns about length rather than about difficulty.

That distinction is the whole lesson. A hard task is not the risky one. A long one is.

## Explanation

### Length is the variable that matters

Here is a finding that reorganizes how you should pick a first task. METR, an independent evaluation organization, measured agents against tasks calibrated by how long the work takes a human. Their result: "current models have almost 100% success rate on tasks taking humans less than 4 minutes, but succeed <10% of the time on tasks taking more than around 4 hours."[^S6]

The interpretation matters more than the numbers. METR's own reading is that "AI agents often seem to struggle with stringing together longer sequences of actions more than they lack skills or knowledge needed to solve single steps."[^S6] Every individual step in a four-hour task may be well within reach. The chain is what fails.

Two cautions, because this is exactly the kind of fact that goes stale. Those figures describe models measured through late 2025; METR maintains a live version of this measurement and notes that its longest data points are shaky — "Measurements above 16 hrs are unreliable with our current task suite."[^S7] What you should carry away is not a number but a shape: as tasks get longer, success falls off sharply, and it falls off faster than the added length alone would suggest.

METR's framing gives you one genuinely useful planning tool. A **time horizon** is the length of task an agent completes at a given success rate — the 50% time horizon being "the duration at which an agent is predicted to succeed half the time."[^S7] You do not need to know any agent's current number to use the idea. You only need to ask: *how long would this take me by hand?* An hour of your work is a materially riskier delegation than ten minutes of it, and that is true regardless of which tool you use or what year it is.

The mechanism underneath was in Lesson 1: errors compound. A failure at step 3 does not stay a failure at step 3, because "One step failing can cause agents to explore entirely different trajectories."[^S8] Longer tasks have more steps at which that can start, and more steps afterwards to build on it.

### Three failure patterns, as documented

Anthropic ran agents on long software builds and published what went wrong. Three patterns, and each is recognizable in ordinary non-programming work.

**One: trying to do it all at once.** They found "the agent tended to try to do too much at once—essentially to attempt to one-shot the app."[^S2] A **one-shot attempt** is the agent trying to complete the whole task in a single sweep rather than working in checkpointed pieces. It is bad not because ambition is bad, but because a single sweep has no intermediate state — if it fails at 80%, there is often nothing to resume from.

**Two: mistaking progress for completion.** In their words: "a later agent instance would look around, see that progress had been made, and declare the job done."[^S2] Read that carefully, because it is stranger than it first looks. The agent is not lying. It genuinely surveys the situation, observes real work, and concludes correctly that work has occurred — then concludes incorrectly that this means the task is finished. Evidence of *some* progress got read as evidence of *complete* progress.

**Three: declaring done without verifying.** Anthropic names "Claude's tendency to mark a feature as complete without proper testing."[^S2] Their API documentation states the underlying behaviour plainly: "Claude sometimes assumes outcomes of its actions without explicitly checking their results."[^S5] The agent performed an action, did not confirm the action had the intended effect, and moved on as though it had.

A **premature completion claim** is a report of success from a run that did not verify it. It is the single most important pattern in this course, because it is invisible from the outside: a report saying "done" looks identical whether or not anything was checked.

### The run gets worse as it goes

There is a further mechanism worth knowing, because it explains why the back half of a long run is less reliable than the front half.

Everything an agent has read and done so far accumulates in its working memory — its **context**. Anthropic's engineering writing on long-running applications reports that "models tend to lose coherence on lengthy tasks as the context window fills."[^S3] So the agent working on step 40 is, in a real sense, not operating as well as the one that worked on step 4.

And there is a stranger effect on top: "Some models also exhibit 'context anxiety,' in which they begin wrapping up work prematurely as they approach what they believe is their context limit."[^S3] The agent starts hurrying as it senses it is running out of room — which means the *end* of a long run, exactly where completion claims get made, is the least reliable stretch of it.

That is the honest picture of a long run: it degrades gradually, then rushes at the end, then reports success. Every one of those three is documented behaviour rather than speculation.

```agentmentor-hotspot
{
  "id": "agent-first-real-task-failure-point",
  "label": "Find where the run stopped being trustworthy",
  "prompt": "A run was asked to convert 60 documents and log the results. Reading the trail afterwards: it converted 38 files fine, hit one file it could not read, wrote no note about it, kept converting, and reported 'all documents converted.' Click the point where this run stopped producing a result you could trust.",
  "whyHere": "Readers instinctively blame the final false report, but the run became untrustworthy earlier — at the unrecorded failure — and locating that point is what makes the rest of the trail readable.",
  "copyPurpose": "Have the agent check whether I am identifying the moment a run's record became unreliable, rather than just the moment its claim became false.",
  "layout": "flow",
  "nodes": [
    { "id": "start", "label": "Run starts, reads the 60 files", "x": 10, "y": 20 },
    { "id": "ok", "label": "38 converted correctly", "x": 40, "y": 20 },
    { "id": "silent", "label": "File 39 unreadable, no note written", "x": 70, "y": 20 },
    { "id": "continue", "label": "Carries on with files 40-60", "x": 40, "y": 75 },
    { "id": "claim", "label": "Reports: all documents converted", "x": 75, "y": 75 }
  ],
  "edges": [
    { "from": "start", "to": "ok", "label": "works" },
    { "from": "ok", "to": "silent", "label": "hits a problem" },
    { "from": "silent", "to": "continue", "label": "moves on" },
    { "from": "continue", "to": "claim", "label": "finishes" }
  ],
  "hotspots": [
    { "nodeId": "ok", "correct": false, "feedback": "These 38 conversions are genuinely fine and stay fine; work being correct is not what breaks, so nothing here needs revisiting." },
    { "nodeId": "silent", "correct": true, "feedback": "The failure itself was survivable — one bad file out of 60. What broke the run was the failure leaving no trace, because from here on the record no longer matches what happened." },
    { "nodeId": "continue", "correct": false, "feedback": "Continuing after a single bad file is reasonable behaviour and often what you want; the problem was already baked in when that file went unrecorded." },
    { "nodeId": "claim", "correct": false, "feedback": "This is where you notice the problem, not where it started — the report is an accurate summary of a record that had already gone wrong one step earlier." }
  ]
}
```

### Resizing so failure is survivable

You cannot prevent these patterns. You can arrange for them to be cheap. Three moves, in order of value:

**Cut the length.** This is the highest-leverage change available to you, because length is the variable most strongly linked to failure. A task of 20 items instead of 200 is not a lesser version of your delegation — it is the version you can actually check.

**Force intermediate output.** Ask for progress to be recorded as it happens, not summarized at the end. This works directly against the one-shot pattern: a run that writes down each item as it finishes leaves something usable behind even if it dies at 60%, and gives you a record made *during* the work rather than reconstructed after it.

**Make failure loud.** Require explicit reporting of anything skipped, ambiguous, or unreadable. This is what the run in the diagram above was missing. An agent with nowhere to put a problem has only two options — guess, or move on quietly — and both look like success from outside.

None of these makes the agent better. All three make its failures visible and recoverable, which is what you actually need from a first task.

## Worked example: resizing a task that is too long

The bounded task, carried over from Lesson 2 in its original form:

```text
Go through all 400 files in ~/Downloads, sort each into one of the four project
folders, and list anything you can't place in unsorted.md.
```

The boundary is good. The size is not. Applying the three moves:

```text
LENGTH
  Was:  all 400 files in one run.
  Now:  the 40 files modified in the last month, as a first batch.
  Why:  40 items is a run I can actually check by hand. If the agent's idea of
        "the right project folder" doesn't match mine, I find out after 40 files,
        not 400 — and I still have 360 files to apply the correction to.

INTERMEDIATE OUTPUT
  Was:  report at the end.
  Now:  append one line to sorted-log.md as each file is placed:
          filename -> destination folder -> why
  Why:  if the run dies at file 25, I have 25 usable lines. And "why" is written
        at the moment of the decision, not reconstructed at the end.

LOUD FAILURE
  Was:  list anything you can't place in unsorted.md.
  Now:  same, plus: if you are less than confident about a placement, log it to
        unsorted.md with your best guess rather than placing it.
  Why:  the original let a low-confidence guess look identical to a confident one.
        Now uncertainty has its own visible channel.
```

The third change is the subtle one. The original boundary already handled files the agent *could not* place. It did nothing about files it could place badly — and those are the ones that quietly end up in the wrong folder with no record that a judgment call ever happened.

## Your turn: resize a task where cutting length is not obvious

Some tasks resist being cut, because their value seems to depend on completeness. Work this one.

```text
Task: "Read the 12 research papers in ~/reading and write me one summary that
       pulls out the themes common to all of them."

LENGTH: how would you cut this, given that a synthesis of 3 papers is not
        a smaller version of a synthesis of 12? ______________________

INTERMEDIATE OUTPUT: what should exist on disk before the final summary? ____

LOUD FAILURE: what should the agent report that it would otherwise hide? ____
```

Reference answer:

```text
LENGTH
  Split by phase, not by paper count. Run one: produce a one-page structured note
  per paper (12 short independent tasks, each checkable against its source). Run two:
  synthesize the 12 notes. The synthesis is now a short task over material I have
  already verified, instead of a long task over material I haven't read.

INTERMEDIATE OUTPUT
  The 12 per-paper notes, as 12 files. These are the artifact that makes the summary
  auditable: for any claim in the final synthesis, I can trace it back to the note it
  came from and then to the paper.

LOUD FAILURE
  Any paper it could not fully read (scanned pages, missing sections), and — the one
  that matters — any theme it is asserting as common to all 12 when it was actually
  present in only some. It should name which papers support each theme.
```

Notice the move: the task was not shortened, it was *split at a natural seam*. Twelve independent readings, then one synthesis over verified material. That is usually the answer when a task cannot simply be trimmed — find the point where the work changes character and cut there.

And the last line is the real safeguard. "Themes common to all of them" is an invitation to overstate: a theme in 8 of 12 papers reads exactly like a theme in 12 of 12 once it is written into a summary. Requiring the supporting list per theme makes the overstatement visible.

<!-- exercises -->
## 💻 Exercises (point these at your own real environment)

### Level 1 (warm-up)

Take your bounded task from Lesson 2 and resize it with the three moves. Then estimate how long the resized version would take you by hand — that estimate is your risk gauge.

How: write the before and after for each of the three moves, with a one-line reason. Then time-estimate the by-hand version honestly. If it is over an hour, cut it again.

<!-- rubric -->
- The length change makes the task a smaller number of items or a shorter phase, not just vaguer wording.
- The intermediate output names a specific file that would exist partway through the run.
- The loud-failure requirement names a specific thing the agent should report that it would otherwise handle silently.
- You state a by-hand time estimate, and if it exceeds an hour you cut further and say so.
<!-- answer -->
A passing resize is concrete on all three. For example: "Length: was 'tag all 300 photos from the trip', now 'tag the 30 photos from day one'; by hand that's about 15 minutes, so I can check the whole thing. Intermediate: append to tags.csv as each photo is tagged, rather than writing the file at the end. Loud failure: report any photo where it can't identify the location, instead of leaving the field blank — a blank field looks the same as 'no location exists'." The weak version changes only the wording: "do fewer photos, keep me posted, tell me about problems." None of those is a thing you could check afterwards.
<!-- hint -->
For length, pick a number small enough that you would be willing to verify every single item by hand. That is the point of a first run.
<!-- hint -->
For loud failure, ask: what would the agent do if it were uncertain? If the honest answer is "guess, and I'd never know," that is the case that needs its own report line.

### Level 2 (advanced)

Take a real task of yours that genuinely cannot be shortened by cutting items — one where the value is in the whole — and find its natural seam. Write it as two runs with a checkable artifact in between.

How: identify where the work changes character (gathering to deciding, reading to writing, drafting to committing). Split there. Then state what you would inspect between the two runs, and what you would look for.

<!-- rubric -->
- The split falls where the kind of work changes, not at an arbitrary midpoint.
- The intermediate artifact is something you could inspect in a few minutes and judge.
- You name a specific check you would run on the artifact before starting the second run.
- You say what you would do if the intermediate artifact came back wrong.
<!-- answer -->
Example: "Task: reconcile three months of expenses against my bank statement. Can't do one month at a time — the point is the full-period total. Seam: extraction versus reconciliation. Run one extracts every transaction from the statements into a table, one row each, no matching. I check it by summing the column and comparing to the statement totals — if the sum is right, the extraction is complete, and that takes me two minutes. Run two does the matching against my expense records, working only from the verified table. If the sum is off, I don't start run two at all; I find out whether it's a parsing problem or a missing page, because reconciling a table with holes in it produces confident nonsense." The seam is real: extraction is mechanical and verifiable by arithmetic, reconciliation is judgment. Checking between them costs two minutes and prevents the second run from building on bad input.
<!-- hint -->
Good seams are usually where the output stops being a fact and starts being an opinion.
<!-- hint -->
The best intermediate artifacts have a cheap total check — a count, a sum, a row number — that tells you whether the first phase is complete without reading every row.
<!-- /exercises -->

## A task shaped for its first run

Your task is now sized so that if it fails, it fails small, leaves a trail, and says so. That is the most you can do before the run.

There is one thing left that no amount of preparation handles. Every pattern in this lesson ends the same way — with a report claiming a completion that may not have happened, and the report is the only thing you are shown by default. Lesson 4 is about the other record: the sequence of actions the run actually took, where the claim can be checked against the evidence.
