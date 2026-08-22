# Lesson 6: One decomposition, start to finish

> Lesson objectives:
> - Run a real task through the whole sequence: test, decompose, brief, dispatch, verify, synthesise.
> - Produce a synthesis another person can audit without access to you or the transcripts.
> - Record what the run cost against what one session would have cost, and judge whether to repeat it.
> - Decide, from your own evidence, which parts of this apparatus were load-bearing for your work.
>
> Prerequisites: Lessons 1 through 5 | Previous [<< 05](./05-synthesis-that-can-be-checked.md) | Next [Course contents >>](./README.md)

## Everything works separately

You can run the four-question test. You can write a four-part brief and a return format with an uncertainty slot. You can pick a dispatch shape from dependency structure, and mark a synthesis so its inferences cannot pass as facts.

None of that is the same as having done it. The parts fail differently in combination: the brief that reads fine alone turns out to have needed the artifact you skipped, the wave size that seemed cautious still produces more output than you can review, and the synthesis you were going to mark carefully gets written at the end of a long session when you want to be finished.

This lesson runs the whole thing once, on your work, and the deliverable is not the answer. It is a synthesis somebody else could check.

## Explanation

### The six steps, in order

The sequence, with the failure each step exists to prevent:

```text
1  TEST        Four questions. Verdict: split, keep, or keep-until.
               Prevents: paying 10x tokens for a task that did not
               need splitting.

2  DECOMPOSE   Draw the dependency structure. Create the shared
               artifact if one is missing.
               Prevents: workers inventing a convention each.

3  BRIEF       Objective, format, sources, boundaries — per worker.
               Format includes references and an uncertainty slot.
               Prevents: duplicated work, missing fields, silence
               where "undetermined" belongs.

4  DISPATCH    Shape and wave size from structure and shared
               resources. Small first wave.
               Prevents: losing a whole wave, and running ten
               workers on an untested brief.

5  VERIFY      Check completion claims against artifacts, before
               any synthesis is written.
               Prevents: a confident report about work that did
               not happen.

6  SYNTHESISE  Mark every claim: verified, reported, contested,
               inferred. Keep the undetermined entries.
               Prevents: a second layer of invention on top of
               the first.
```

Step 5 is the one that gets dropped under time pressure, and it is the only step whose absence is invisible in the output. A missing brief section shows up in the reports. A skipped verification shows up nowhere at all.

### Choosing a task you can finish

Pick something that satisfies four conditions, and resist the pull toward something more impressive.

*It passes the four-question test* — genuinely, not by rounding Q1 up.

*It is read-heavy.* The documented starting point is exactly this: "use parallel agents for read-heavy tasks such as exploration, tests, triage, and summarization. Be more careful with parallel write-heavy workflows."[^S9] Your first end-to-end run should not also be your first experiment in parallel edits.

*It has three or four pieces.* Enough for the coordination problems to appear, few enough to review properly. The published operating point of "3-5 subagents in parallel" is a reasonable place to sit.[^S1]

*Somebody would actually read the result.* The synthesis has to be for someone — a colleague, your future self next month, a decision you owe an answer to. A synthesis nobody reads never gets tested for auditability, which is the only thing this lesson is measuring.

Good shapes: how do our N services handle X; what does the test suite actually cover across N modules; which of our N dependencies are still maintained; where does data flow into feature Y from N entry points.

Bad shapes for a first run: anything where workers write to the same files; anything sequential; anything where the answer only matters if it is complete, since a first run will have undetermined entries and that has to be acceptable.

### The three things to record while running

Not a report — three lines in a scratch file, written while the run happens rather than reconstructed afterwards.

**What each worker consumed.** Roughly. Files read, tool calls, tokens if your tool shows them. This is Lesson 3's compression ratio, and it is the only signal you get about how much unseen judgment stands behind a page of findings.

**When you were tempted to fix the brief.** The moment during a run when you want to correct a brief is data about the brief, and it evaporates by the end. Write down what you would have changed and keep going.

**What the wave cost in wall clock, including your review time.** Both numbers. The run time is what people quote; the review time is what actually decides whether this was worth doing.[^S12]

### Judging your own result honestly

Two failure modes at the end, opposite and equally common.

The first is calling the run a success because a document exists. A document always exists. The question is whether the marks in it are real — whether the verified claims were actually checked, whether the contested rows reflect genuine disagreement rather than a category you filled in for form's sake.

The second is calling it a failure because a worker returned undetermined entries or a report came back thin. Those are the system working. An undetermined entry is a gap that announced itself, which is the best possible outcome for a gap. A thin report usually means the brief was thin, and finding that out on one worker is cheap.

The honest measure is the one the harness-design work uses: the extra machinery "is worth the cost when the task sits beyond what the current model does reliably solo."[^S6] So the question at the end is not "did I get an answer" but "could one session have produced this, at this quality, in less total time including my review." Sometimes the answer is yes, and that is a real result about your task rather than a failure of your execution.

The same source adds the maintenance note worth carrying past this course: "every component in a harness encodes an assumption about what the model can't do on its own, and those assumptions are worth stress testing, both because they may be incorrect, and because they can quickly go stale as models improve."[^S6] Everything in this course is such a component. Re-run the four-question test on a task you split six months ago, and the answer may have changed.

## Worked example: a full run, with the parts that went wrong

A real-shaped run, including the errors, because a clean example teaches nothing about step 5.

**Step 1 — test.** Task: find out what the test suite actually covers across four modules, before a refactor. Q1: independent, each module's coverage stands alone. Q2: read-only. Q3: specifiable — "what does the suite verify in module X" needs no session context. Q4: yes; the refactor is blocked on it. Four yeses. Split.

**Step 2 — decompose.** Four pieces, one per module. No shared convention needed except the meaning of "covers," which the format will pin down rather than leave to each worker. No artifact required.

**Step 3 — brief.** One brief, four instantiations:

```text
OBJECTIVE
For module <M>, determine what its tests actually verify: which public
functions have tests that assert on their return value or side effect,
and which have tests that only check they do not throw.

SOURCES
Read tests/<M>/ and src/<M>/. Do not read other modules. Do not run
the test suite.

OUTPUT FORMAT
  function:        exported function name
  test_refs:       path:line of each test touching it
  assertion_kind:  value | side_effect | smoke_only | none
  notes:           one clause, only if assertion_kind is surprising
Aggregate:
  counts by assertion_kind, and total exported functions
Uncertainty:
  undetermined: any function you could not trace to a test or rule
  out, with what you would need

BOUNDARIES
Report only. Do not edit tests or source. Do not judge whether
coverage is adequate — that decision comes after all four reports.
```

**Step 4 — dispatch.** Read-only, four independent pieces. Wave of two first, then two — small enough that a brief defect costs half the run.

Wave 1 came back and the brief was wrong. Both workers reported `assertion_kind: none` for large numbers of functions, and reading the notes showed why: parameterised tests in a shared helper were not being traced. The brief said "tests touching it," and the workers read that literally as direct references.

This is what the small first wave bought. The fix was one line added to sources: "test helpers under tests/helpers/ are in scope; a function tested through a helper counts as tested, and test_refs should point at the helper call site." Wave 2 ran with the corrected brief.

Note the honest consequence: waves 1 and 2 now used different briefs, which is recorded in the synthesis rather than hidden. Wave 1's two modules were re-run afterwards for consistency, which cost two extra workers and is the actual price of the brief defect.

**Step 5 — verify.** Before writing anything:

```text
Claimed: 4 reports produced.        Checked: all 4 present.
Claimed: file:line refs throughout. Checked: opened 3 refs at random,
                                    one per module for the first three.
                                    Two correct. One off by ~40 lines —
                                    pointed at a neighbouring test in
                                    the same file.
Claimed: no files modified.         Checked: git status clean. ✓
```

The stale line reference is the useful finding. It does not invalidate the report — the test exists, in that file — but it does tell you the references are approximate, which changes how the synthesis should present them and how much a reader should trust an unopened one.

**Step 6 — synthesise.**

```text
COVERAGE SURVEY — 4 modules, 2026-08-23
Method: 4 workers, one per module, read-only, identical format.
        Modules A and B were re-run after a brief correction (test
        helpers were initially out of scope). See "method notes".

VERIFIED (opened by me)
  - auth.verifyToken is smoke_only: tests/auth/token.test.ts:44
    asserts no throw and nothing else. Confirmed.
  - No files were modified by any worker (git status clean).

REPORTED (worker claims, references approximate — see method notes)
  - Module A: 31 exported functions. 18 value, 4 side_effect,
    7 smoke_only, 2 none.
  - Module B: 22 exported. 15 value, 2 side_effect, 5 smoke_only.
  - Module C: 40 exported. 12 value, 9 side_effect, 14 smoke_only,
    5 none.
  - Module D: 17 exported. 14 value, 3 side_effect.

CONTESTED
  - None. The four reports do not overlap, so there is nothing for
    them to disagree about. This is a property of the decomposition,
    not evidence that the reports agree.

UNDETERMINED (carried from the reports)
  - Module C: 6 functions reached only through a dynamic dispatch
    table the worker could not resolve statically. Named in its
    report. These are not in the counts above.
  - Module A: 1 function whose tests are skipped via a config flag
    the worker could not read.

INFERRED (mine, not from any report)
  - Module C looks like the weakest coverage of the four. This is an
    inference from the smoke_only proportion (14/40) and it is not a
    finding: C is also the largest module and its 6 undetermined
    functions could fall either way.

NOT ANSWERED
  - Whether any of this coverage is adequate. No worker was asked and
    none could answer from one module.

METHOD NOTES
  - Wave 1 (A, B) ran on a brief that excluded test helpers, which
    undercounted coverage. Corrected and re-run. Wave 2 (C, D) used
    the corrected brief throughout.
  - Spot-checked 3 of ~110 file references. Two exact, one off by
    ~40 lines within the correct file. Treat references as
    approximate locators, not exact citations.
  - Cost: 6 worker runs (4 planned + 2 re-runs), ~25 min wall clock,
    ~40 min of my review. One session had previously attempted
    modules A and C and produced counts with no references, which is
    what prompted this run.
```

Read the "method notes" section again. It contains a brief defect, a re-run, a spot-check hit rate, and an admission that references are approximate. Every one of those makes the document less impressive and more useful, and together they are what let a colleague decide how much of this to believe without asking you a single question.

That is the deliverable. Not the counts — the counts plus everything a reader needs to weigh them.

## Your turn: the plan, before you run it

Write your run plan. Complete this before dispatching anything.

```text
TASK: ______________________________________________

1 TEST     Q1 ___ Q2 ___ Q3 ___ Q4 ___   Verdict: ________

2 STRUCTURE
    Pieces: ______________________________________
    Dependencies between them: ____________________
    Shared artifact needed first?  Y / N  → what: ______

3 BRIEF    Objective:  __________________________________
           Format fields: ________________________________
           Uncertainty slot: _____________________________
           Sources:    __________________________________
           Boundaries: __________________________________

4 DISPATCH Wave 1 size: ___  Why that number: ____________
           Shared resources at risk: _____________________
           If the wave fails partway, what is on disk: ____

5 VERIFY   What I will check, and with what command:
           ______________________________________________

6 SYNTHESIS
           Who reads it: _________________________________
           What they need to be able to check: ___________
```

Reference answer for the two lines people leave blank:

```text
"If the wave fails partway, what is on disk"

  For a read-only fan-out the honest answer is "nothing, and that is
  why this is a safe first run." If you cannot say that, your task is
  not read-only and you should know that before dispatching, not
  after. For a writing fan-out, the answer needs to be specific
  enough to act on: which files each worker touches, and whether a
  half-finished worker leaves them valid.

"What they need to be able to check"

  This is the line that determines the format field back in step 3,
  and writing it last is why so many formats lack a reference field.
  If your reader needs to spot-check a claim, every claim needs a
  locator, and locators have to be requested before the run, not
  wished for afterwards. Work backwards from this line to your
  format, then go back and fix step 3.
```

The dependency between step 6 and step 3 is the structural lesson of this whole course. **What the reader must be able to check determines what the worker must return.** Every format field exists to serve a verification somebody will perform later, and a field nobody will check is a field you did not need to ask for.

```agentmentor-action
mode: teach_back
label: Make me defend my synthesis marks against a reader who will not take my word
description: Tests whether the verified, reported, contested, and inferred marks in my finished synthesis reflect what I actually did, or what I meant to do.
purpose: I want to find the claims in my own synthesis that are marked stronger than the evidence behind them, before I hand it to someone who will act on it.
rules:
  - Ask me to paste my finished synthesis with its marks in place.
  - Go through the VERIFIED claims one at a time and ask what command I ran or what file I opened for each. Anything I cannot answer concretely is REPORTED, not verified.
  - Then find every sentence containing a universal quantifier and ask which report supports it for every case it covers.
  - Then ask which claims came from no report at all, and check them against my INFERRED section.
  - Do not rewrite the synthesis for me. Ask until I find the mismatches myself.
  - One claim at a time.
```

<!-- exercises -->
## 💻 Exercises (point these at your own real environment)

### Level 1 (warm-up)

Run the six steps on a real read-only task with three or four pieces, and produce a marked synthesis. Give it to one other person — or to a fresh agent session with no memory of the run — and ask them to identify one claim they would want to check and how they would check it.

How: use the plan template above and complete it before dispatching. Keep the three running records: consumption per worker, any moment you wanted to fix the brief, and both time figures. The reader test at the end is the actual measurement — a synthesis that is auditable in principle but not in practice fails here.

<!-- rubric -->
- All six steps completed, with the plan written before dispatch rather than reconstructed after.
- Every completion claim verified against an artifact before the synthesis was written, with the commands recorded.
- The synthesis marks every claim as verified, reported, contested, or inferred, and preserves any undetermined entries from the reports.
- A method-notes section stating what went wrong, what was re-run, and what was spot-checked.
- Your reader named a claim to check and could state how, without asking you for anything.
<!-- answer -->
The reader test is where most first runs come apart, and the usual cause is a reported claim with no locator. Your reader picks something, asks how they would check it, and the answer is "you'd have to ask the worker" — which is no longer possible. That gap traces directly back to a missing format field, which traces back to not having written the step 6 line before step 3.

Expect the inferred section to be short and uncomfortable. Most people find one or two claims they had written as findings and cannot attribute to any report. That discovery is the exercise working.

A common mistake is skipping verification because the reports look consistent. Consistency across reports is not evidence about whether the work happened — six workers can all report success and one of them can be describing a file that does not exist. The existence check costs one command and is the only thing that catches it.
<!-- hint -->
Write the "what my reader needs to check" line before you write the output format, even though it comes last in the sequence. Everything in the format exists to serve it.
<!-- hint -->
If your reader is a fresh agent session, give it only the synthesis — no transcripts, no reports, no context from you. That is exactly the position a colleague is in.

### Level 2 (advanced)

Run the same task both ways: once decomposed across workers, once in a single session with no delegation. Compare the outputs on quality, total time including review, and checkability. Then decide which you would use again for this class of task, and which parts of the apparatus were actually load-bearing.

How: run the single-session version second, so the decomposed run cannot benefit from what you learn. Give the single session the same objective and the same output format — the comparison is about decomposition, not about whether you specified the format.

<!-- rubric -->
- Both runs completed on the same task with the same objective and output format.
- Total time recorded for each, run time and review time stated separately.
- Output compared on coverage, on specificity, and on whether claims carry locators.
- A judgment on whether the single session's output was worse, and in what specific way — not "less thorough" but which piece it got wrong or skipped.
- A named list of which components — the artifact, the format fields, the small first wave, the verification step — actually changed the outcome, and which you would drop.
<!-- answer -->
The most valuable outcome is discovering that the single session was adequate. That is a real finding about your task class and it saves you an order of magnitude in tokens on every future instance. The harness-design work reports exactly this pattern after a model upgrade: components that were load-bearing became unnecessary overhead, and the practical implication was stated as the extra agent being worth its cost only when the task sits beyond what the model does reliably solo.

Where the single session usually loses is in uniform depth. It covers the first piece thoroughly and the last one thinly, because attention degrades across a long task in a way that four fresh workers do not share. Look for that pattern specifically: compare the fourth module's treatment in each run rather than the first.

A common mistake is counting the decomposed run as the winner because it produced more text. More text is not more finding. Compare on specific claims a reader could check, and count only those.

On the component question, the verification step is the one most people find they cannot drop and the small first wave is the one most people find they cannot skip. The shared artifact is genuinely optional for read-only work and essential for anything that writes. That distribution is worth knowing before your first writing fan-out.
<!-- hint -->
Give the single session the same output format. Otherwise you are measuring the value of specifying a format, which Lesson 2 already established, rather than the value of decomposition.
<!-- hint -->
Compare the last piece in each run, not the first. Degradation across a long task shows up at the end, which is exactly where a fan-out has no disadvantage.
<!-- /exercises -->

## Closing the ladder

You have run one real decomposition end to end and produced something another person can audit. The parts you used are now yours to keep or discard on evidence: a test that talks you out of splitting more often than into it, a brief with four parts and an uncertainty slot, a return format built backwards from what a reader will check, a dispatch shape derived from dependency structure and shared resources, a verification step that touches artifacts rather than reports, and a synthesis whose marks let a stranger weigh every claim.

Two things are worth carrying out of the course intact. The first is that the entire apparatus is provisional: every component encodes an assumption about what one agent cannot do, and those assumptions expire as models improve. Re-run the four-question test on a task you split six months ago and be willing to be surprised.

The second is the pair of incidents from this course's own construction. Five independent workers died together because they shared a gateway nobody had listed. Two workers reported completed work that did not exist on disk, and were caught only because something re-ran the checks instead of reading the reports. Both are single observations from one build rather than laws. Both point the same way: the things that break an orchestration are the ones that were not in the plan because they were not in the task.

That is where the ladder ends. You started this series with one agent and one task, and you can now put several of them on one problem — while knowing, precisely, when not to.
