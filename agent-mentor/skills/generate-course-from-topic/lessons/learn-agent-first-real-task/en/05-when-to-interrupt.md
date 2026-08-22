# Lesson 5: Calling Time on a Run

> Lesson objectives:
> - Explain why more approval prompts can produce less oversight.
> - Name the observable signals that distinguish a working run from a stuck one.
> - Choose between letting a run continue, redirecting it, and stopping it, using evidence rather than mood.
>
> Prerequisites: a completed run and its handoff record from Lesson 4 | Previous [<< 04](./04-reading-actions.md) | Next [Course contents >>](./README.md)

## The prompt you stopped reading

Start with a number that should be uncomfortable. Anthropic reports: "Claude Code users approve 93% of permission prompts."[^S4]

There are two ways to read that. One is that the prompts are well-tuned and mostly ask about things that genuinely should be approved. The other is the one Anthropic names directly: "Over time that leads to approval fatigue, where people stop paying close attention to what they're approving."[^S4]

If you approve 93% of what you are shown, the 7% is doing all the work — and by the time you are deep in a run, you are no longer reading carefully enough to reliably catch which prompts belong in it. This is not a discipline failure. It is what happens to any human asked to make the same decision several dozen times in a row.

That is the real problem this lesson addresses. Not "should you supervise" — obviously yes — but *where to spend* a supply of attention that is smaller than the number of moments asking for it.

## Explanation

### Attention is the scarce resource

You have a review budget: a fixed supply of careful looking per run. Spending it evenly is the worst allocation, because it means spending most of it on steps that were never going to matter, and arriving at the one that does with nothing left.

Two consequences follow, and the second is counterintuitive:

- **Gate few things, deliberately.** A boundary with three well-chosen gates gets three careful decisions. A boundary with forty gates gets forty reflexes.
- **Watch for signals, not for steps.** You are not auditing every action live — Lesson 4 established that the trail is there to audit afterwards. During the run, you are watching for a small number of patterns that mean the run has stopped making progress.

Note the division of labour across the whole course. The boundary handles reach, before the run. The trail handles verification, after it. The only job left for live attention is noticing that something has gone wrong *while it is still cheap to stop*.

### Signals that a run has stopped progressing

There is no vendor checklist of "interrupt now" signals — that is a synthesis, and you should treat it as one. But the underlying behaviours are documented, and they share a recognizable shape: the run is still active but no longer converging.

Anthropic's engineering team, describing failures in their own agent system, lists behaviours including "spawning 50 subagents for simple queries, scouring the web endlessly for nonexistent sources"[^S8] — and, in a separate observation, "agents continuing when they already had sufficient results."[^S8] Both are runs that are busy without getting closer to done.

Four signals, in rough order of how confident you should be:

**Repetition.** The same action against the same target, two or three times, with the same result. This is the clearest signal there is. An agent that reads the same file for the third time is not gathering information; it is circling. Anthropic's own description of "scouring the web endlessly for nonexistent sources"[^S8] is this pattern — search after search for something that is not there.

**Widening.** The run starts touching things adjacent to your task rather than in it. This is the live version of the scope escalation from Lesson 2 — remember the shape: "The action instead looks like reasonable problem-solving, only applied past the boundary of what the user authorized or intended."[^S4] Widening is that boundary being approached from the inside, and it is your last chance to catch it before something irreversible happens.

**Silence with activity.** A silence with activity is a run where actions are happening, but nothing is being produced or written. If your task was resized in Lesson 3 to write output as it goes, this signal is easy to read: the log file has stopped growing while the run has not.

**Confidence outrunning evidence.** Confidence outrunning evidence is narration that reports progress the actions do not show. "I've fixed the issue" with no action since the last failed check. This is the live version of the premature completion claim, and you can catch it in flight.

One anti-signal, because it causes people to interrupt good runs: **an agent hitting errors is not a failing run.** Errors are environmental feedback — the mechanism from Lesson 1 by which the agent learns what is actually true. A run that hits an error, adapts, and tries something genuinely different is working exactly as intended. What matters is whether the response to the error is *different* from the last attempt. Same error plus same response is repetition. Same error plus new approach is progress.

```agentmentor-check
{
  "id": "agent-first-real-task-interrupt-signal",
  "label": "Separate a stuck run from a working one",
  "prompt": "Your run is converting 30 documents. You see: it tries to convert file 12, gets a format error, tries a different conversion method on file 12, gets a different error, then moves to file 13 and notes file 12 in the skipped list. Three minutes later it is on file 19 with four entries in the skipped list. What does this justify?",
  "whyHere": "The signals that justify interrupting are about failure to converge, not about errors occurring, and readers new to watching runs tend to read any error as a reason to stop.",
  "copyPurpose": "Have the agent check whether I am treating visible errors as interrupt signals when the run is actually recovering from them correctly.",
  "mode": "single",
  "choices": [
    {
      "id": "stop-errors",
      "text": "Stop the run — four failures out of nineteen files means the approach is not working",
      "correct": false,
      "feedback": "The failure rate tells you about the documents, not about the run's health; each failure was recorded and moved past, which is the behaviour you asked for rather than a malfunction."
    },
    {
      "id": "let-run",
      "text": "Let it continue — it retried differently, gave up in a bounded way, logged the skip, and kept advancing through the queue",
      "correct": true,
      "feedback": "Every marker of a healthy run is present: the second attempt differed from the first, the failure went into the record instead of vanishing, and the file index keeps rising, so the run is still converging on the finish line."
    },
    {
      "id": "ask-status",
      "text": "Interrupt to ask it for a status report on what it has done so far",
      "correct": false,
      "feedback": "A status report would return the agent's own account of its progress, which Lesson 4 established is the weakest evidence available — and the skipped list already carries the same information as fact."
    }
  ]
}
```

### Continue, redirect, or take it back

Three responses, and the middle one is the one people forget exists.

**Continue** is right when the run is converging: index advancing, output growing, failures landing in the record. Most anomalies resolve themselves, and stopping a healthy run costs you the whole delegation.

**Redirect** means correcting the run without ending it — supplying the missing fact, narrowing the target, telling it to stop pursuing a dead end. GitHub documents this as a first-class action: "If Copilot is heading in the wrong direction, or you realize your original prompt needs adjusting, you can redirect it without stopping the session."[^S11] Redirect is right when the run is capable but pointed wrong, which is the most common way a bounded task goes off track. Its advantage is that the work already done survives.

**Take it back** means ending the run and doing the rest yourself. Three situations call for it: the run is repeating and redirection has already failed once; it is approaching something irreversible you did not anticipate; or you have realized the task was mis-specified and no correction to the agent fixes a wrong destination.

That last one deserves emphasis, because it does not feel like a decision about the agent at all. If you have discovered mid-run that you asked for the wrong thing, no redirect helps — you need to stop, rewrite the boundary, and start over with the correction in it.

There is a general principle underneath the whole choice. Anthropic's computer-use documentation advises "Asking a human to confirm decisions that might result in meaningful real-world consequences"[^S5] — the load-bearing word being *meaningful*. Not every decision. The consequential ones. That is the same attention-budget logic as the start of this lesson, applied to the moment rather than the setup.

## Worked example: three minutes of a run, and the call

The task: extract totals from 25 invoices into a spreadsheet. What you see, live:

```text
[00:41]  read  invoice-03.pdf          -> ok
[00:43]  write totals.csv              -> row added
[00:44]  read  invoice-04.pdf          -> ok
[00:46]  write totals.csv              -> row added
[00:47]  read  invoice-05.pdf          -> error: password protected
[00:49]  read  invoice-05.pdf          -> error: password protected
[00:52]  read  invoice-05.pdf          -> error: password protected
[00:55]  "Let me try to find the password for this file."
[00:57]  list_dir ~/Documents          -> 214 entries
[01:02]  read  ~/Documents/passwords.txt -> error: no such file
[01:04]  list_dir ~/Documents/personal -> 38 entries
```

Reading it against the four signals:

```text
REPETITION
  Three identical reads of invoice-05.pdf, same error each time. Nothing changed
  between attempts. This alone is enough to be watching closely.

WIDENING
  This is the serious one. At 00:57 the run leaves the invoice folder entirely and
  starts listing ~/Documents, then ~/Documents/personal. Nothing in the task involves
  those folders. It is now searching my personal files for a password.

SILENCE WITH ACTIVITY
  Last row written at 00:46. Six actions since, no output. The run has been busy
  and unproductive for 18 seconds and counting.

CONFIDENCE OUTRUNNING EVIDENCE
  Not present — the narration at 00:55 is honest about what it is doing.
```

Three of four signals, and one of them is a live boundary breach. The call:

```text
DECISION: take it back, immediately — not redirect.

Why not continue: it has produced nothing for six actions and is accelerating away
  from the task rather than back toward it.

Why not redirect: I could tell it "skip protected files and move on," and that would
  probably work. But it is currently reading directories of my personal documents,
  and the next action is unknown. The cost of being wrong about redirect is that it
  opens a file I did not want it to see. Stopping costs me 20 seconds.

After stopping: the real fix is in the boundary, not the instruction. The work area
  should have been ~/invoices only — then step 00:57 would have been impossible
  rather than merely undesirable. Add: "if a file cannot be read, log it and continue;
  never search for credentials."
```

Notice where the lesson lands. The interrupt was the right call, but the *finding* is that a boundary was too loose. Live interruption is the fallback for what the boundary failed to prevent, and every time you use it, it is telling you something about the setup.

## Your turn: a run with only ambiguous signals

Harder, because nothing here is a clear breach. Read the four signals and make a call.

```text
Task: draft replies to 15 support emails, into a drafts file. Nothing to be sent.

[04:10]  read  email-08.txt            -> ok
[04:12]  write drafts.md               -> draft 8 added
[04:13]  read  email-09.txt            -> ok
[04:15]  read  ~/support/policy.md     -> ok
[04:16]  read  ~/support/policy.md     -> ok
[04:19]  read  ~/support/refunds.md    -> ok
[04:23]  "This one involves a refund request that the policy doesn't clearly cover.
          Let me look at how similar cases were handled."
[04:24]  read  ~/support/archive/2026-q1.md  -> ok
[04:31]  read  ~/support/archive/2025-q4.md  -> ok
[04:38]  read  ~/support/archive/2025-q3.md  -> ok

Repetition: ______________________________________________
Widening: ________________________________________________
Silence with activity: ___________________________________
Confidence outrunning evidence: __________________________

Decision: ________________________________________________
```

Reference answer:

```text
REPETITION
  policy.md twice in a row, but only twice, and it moved on. Weak signal — could be
  a re-read for a specific section. Not enough on its own.

WIDENING
  Everything is inside ~/support, so the work area holds. But the archive folders
  were not part of the task's intent, and it is now three quarters deep and going
  backwards in time. This is scope drift within bounds — not a breach, but the run
  is doing research I did not ask for.

SILENCE WITH ACTIVITY
  The strongest signal here. Last draft written at 04:12. Six reads since, 26 seconds,
  no output. It is stuck on email-09 and has stopped producing.

CONFIDENCE OUTRUNNING EVIDENCE
  Absent — the narration at 04:23 accurately describes the difficulty and its plan.

DECISION: redirect, not stop.
  The run is honest, in bounds, and stuck on one genuinely ambiguous case out of 15.
  That is exactly what redirect is for, and the seven drafts already written survive.

  Redirect: "Don't research the refund case. Draft what you can, mark email-09 as
  needing my decision with a one-line note on why, and continue to email-10."

  Note what this does: it converts an item the agent cannot resolve into a visible
  open question, which is the Lesson 3 move — give the failure somewhere to go —
  applied live instead of in the boundary.
```

The judgment worth extracting: an agent going quiet on one hard item is normal and fixable. What makes it worth acting on is not that it got stuck, but that being stuck on item 9 was silently costing you items 10 through 15.

<!-- exercises -->
## 💻 Exercises (point these at your own real environment)

### Level 1 (warm-up)

Before your next run, write your interrupt plan on one line each for the four signals: what specifically would you see in *this* task that would count, and what you would do about it. Then run the task with the plan next to you.

How: use your resized task or the next real one. For each signal, name the concrete observable — not "if it repeats" but "if it reads the same file three times." Decide in advance which response each one gets, so you are not deciding under pressure.

<!-- rubric -->
- Each of the four signals has a concrete observable specific to your task.
- Each has a response assigned in advance: continue, redirect, or take it back.
- At least one signal is assigned "continue" — you have identified something that looks alarming but is not.
- After the run, you note which signals actually appeared and whether your plan matched what you did.
<!-- answer -->
A passing plan is specific enough to check against. For example: "Repetition: same file read 3x -> redirect with 'skip it and log it'. Widening: any path outside ~/invoices -> stop immediately, it's a boundary hole. Silence: no new row in totals.csv for a full minute while actions continue -> redirect and ask what it's blocked on. Confidence: says a batch is done while the row count says otherwise -> let it finish, then check the trail — this one is an after-the-fact problem, not a live one." The last entry matters: assigning "continue" to something is what proves the plan discriminates rather than just listing alarms. Also worth recording: if no signal fired at all, say so — a clean run is data about your task sizing, not a wasted exercise.
<!-- hint -->
For each signal, ask what it would look like in the specific units of your task — files, rows, drafts, messages.
<!-- hint -->
The widening signal is the one worth deciding in advance, because it is the one where hesitating costs the most.

### Level 2 (advanced)

Take an interrupt you actually made — in any run, including one that turned out unnecessary — and trace it back to the boundary. Write what you would change in the setup so that interrupt would not have been needed.

How: describe what you saw, what you did, and what happened. Then work backwards: which part of the boundary — definition of done, work area, approval gates, stopping condition — would have prevented that moment? Write the corrected line.

<!-- rubric -->
- You describe the observed signal concretely, and what you did about it.
- You name which of the four boundary parts was responsible.
- You write the corrected line, specific enough to paste into your next run.
- You state honestly whether the interrupt was necessary, including if it was not.
<!-- answer -->
Example: "Saw it reading files in my home folder when the task was about one project directory. Stopped it. Turned out it was looking for a config file it genuinely needed, so the interrupt cost me a restart — but I would do it again, since I could not tell that at the time. Responsible part: the work area, which I wrote as 'my project files' rather than a path. Corrected line: 'Work area: read and write within ~/projects/website only. If you need a file outside it, stop and tell me which one and why, rather than searching for it.'" The value is in the last clause — it converts the behaviour that triggered the interrupt into an explicit stop-and-ask, so the next run surfaces the same need without the alarming search. An answer that concludes "the interrupt was unnecessary and no boundary change would help" is acceptable only if you can say what you would look at next time to tell the difference sooner.
<!-- hint -->
Most interrupts trace back to the work area or to a missing instruction about what to do when blocked.
<!-- hint -->
If you have never interrupted a run, use the closest thing: a moment you were uneasy and did nothing. What would have told you which it was?
<!-- /exercises -->

## Where your judgment goes next

You have run a real task end to end: scoped it against the delegation test, bounded it, resized it so failure stays cheap, audited the trail against the claim, and produced a handoff record that separates what was said from what you checked. That is the full loop, and it does not depend on which tool you used or what the products look like next year.

The habit worth keeping is the one from the last two examples. Every live interrupt is information about a boundary that was not tight enough, and every gap in a handoff record is information about a definition of done that was not checkable enough. Your second run should be better because of what your first run's record told you — not because you have gotten better at guessing what an agent will do.

Two directions from here. If your runs complete but produce the wrong thing, the problem is upstream in how the task was specified. If they produce roughly the right thing but you cannot tell whether to trust it, the problem is in verification, and the handoff record you now write is the foundation for building real checks on top.
