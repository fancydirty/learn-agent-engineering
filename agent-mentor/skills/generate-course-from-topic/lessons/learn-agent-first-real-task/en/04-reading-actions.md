# Lesson 4: Reading the Trail, Not the Verdict

> Lesson objectives:
> - Explain why an agent's self-assessment is not evidence about its work.
> - Reconstruct what a run did from its action trail rather than its summary.
> - Produce a handoff record that lets someone else check the run without rerunning it.
>
> Prerequisites: a resized task from Lesson 3 | Previous [<< 03](./03-where-agents-get-stuck.md) | Next [05 >>](./05-when-to-interrupt.md)

## "I've completed all the changes"

The run ends. You get a summary. It is well organized, it is confident, it lists what was accomplished, and it reads exactly the same whether the work is finished or two-thirds finished.

The instinct at this point is to ask the agent to double-check. It is the wrong move, and there is a first-party finding that says why: "When asked to evaluate work they've produced, agents tend to respond by confidently praising the work—even when, to a human observer, the quality is obviously mediocre."[^S3]

Read what that rules out. Asking "are you sure?" does not get you a second opinion. It gets you a second statement from the same source, generated with the same beliefs about what happened. If the agent thought the task was done a moment ago, it still thinks so.

This lesson is about the other record — the one made of actions rather than assertions.

## Explanation

### Why the summary is the weakest evidence available

The report is written by the same run that did the work, from the same memory of what happened. If the run mistakenly believed a step succeeded, that belief is what the summary reports. It is not deception; it is a faithful account of an inaccurate picture.

Anthropic's team observed the downstream effect of exactly this: "Applications from earlier harnesses often looked impressive but still had real bugs when you actually tried to use them."[^S3] Impressive-looking output and working output are different properties, and the summary can only tell you about the first.

So what do you check instead? The **action trail** — the sequence of tool calls a run actually made, in order, with what came back from each. This is a record of events rather than a description of them, and it is the difference between a witness statement and a receipt.

Two vendors treat it as the reviewable artifact. Anthropic's computer-use documentation instructs: "Always carefully review and verify Claude's computer use actions and logs. Do not use Claude for tasks requiring perfect precision or sensitive user information without human oversight."[^S5] GitHub describes its equivalent: "Session logs show Copilot's internal reasoning and the tools it used to understand your repository, make changes, and validate its work," and links every commit to them "so you can trace why a change was made during code review or an audit."[^S11]

Both are pointing at the same thing. The record worth reviewing is the one the agent could not have edited to look good, because it was written by the system as things happened.

There is a sharper version of this argument from Anthropic's own infrastructure work. Their engineers built agent sessions around "the append-only log of everything that happened" — and they explain what its absence cost them. Before it, "Our only window in was the WebSocket event stream, but that couldn't tell us where failures arose, which meant that a bug in the harness, a packet drop in the event stream, or a container going offline all presented the same."[^S12] Without an action-level record, different causes of failure become indistinguishable from outside. That is precisely the position you are in when all you have is a summary saying "done."

### What to look for in a trail

You do not read a trail line by line. You read it for four things:

| What you check | The question you are answering |
|---|---|
| **Coverage** | Did it touch everything it was supposed to touch? |
| **Verification** | After changing something, did it look at the result? |
| **Silences** | Did anything fail without a note? |
| **Reach** | Did it touch anything outside the work area? |

Coverage is the one that catches the most, and it is close to free: count the actions against the items. If your task had 40 files and the trail shows 31 write actions, the summary saying "all files processed" is answered without reading a single line of content.

Verification is where the pattern from Lesson 3 shows up. After a change, is there an action that *checks* the change — a read-back, a re-run, an opened file? Remember the documented behaviour: "Claude sometimes assumes outcomes of its actions without explicitly checking their results."[^S5] A trail of writes with no reads is a run that never confirmed anything worked.

Silences are the hardest to see, because you are looking for something that is not there. This is why Lesson 3 had you require explicit reporting of skipped items: it converts a silence into a line you can find.

### The handoff record

Here is where this becomes something you produce rather than just something you read.

A **handoff record** is a short written artifact that states what a run was asked to do, what it actually did, how that was verified, and what remains open. Its test is simple: could another person — or you in three weeks — check this work without rerunning it or reading the whole trail?

This is not bureaucracy. It is the same idea Anthropic reached for in their long-running-agent work, where a progress file carries the record between sessions: their harness has the first session create "a claude-progress.txt file that keeps a log of what agents have done," and asks every session after it to "make incremental progress, then leave structured updates."[^S2] Recall the failure that motivated it: "a later agent instance would look around, see that progress had been made, and declare the job done."[^S2] A handoff record is the defense against that inference — by anyone, human or agent.

Four parts:

```text
1. ASKED       The task and its boundary, as given.
2. DID         What the trail shows actually happened, with counts.
3. CHECKED     What you personally verified, and how.
4. OPEN        What is unfinished, uncertain, or was skipped.
```

Part 3 is the one that carries the weight, and it is the one people leave out. "The agent says it converted 40 files" belongs in part 2. "I opened 5 of the 40 and compared them to the originals" belongs in part 3. The distinction between what was claimed and what you confirmed is the entire value of the document.

Part 4 is what makes it honest. A handoff record with an empty OPEN section is usually a record that has not been checked hard enough.

## Worked example: a summary, its trail, and the record

The agent's closing summary:

```text
I've organized your downloads folder. All files have been sorted into the appropriate
project folders based on their content and filenames. The folder is now clean and
organized by project.
```

The action trail from the same run, abbreviated:

```text
 1  list_dir    ~/Downloads                          -> 40 files
 2  read_file   ~/Downloads/invoice-mar.pdf          -> ok
 3  copy_file   invoice-mar.pdf -> projects/finance/ -> ok
 4  read_file   ~/Downloads/notes-standup.md         -> ok
 5  copy_file   notes-standup.md -> projects/team/   -> ok
 …
 62 read_file   ~/Downloads/scan_0043.pdf            -> ok
 63 copy_file   scan_0043.pdf -> projects/finance/   -> ok
 64 read_file   ~/Downloads/archive.zip              -> error: cannot read binary
 65 read_file   ~/Downloads/IMG_2291.HEIC            -> error: cannot read binary
 66 write_file  ~/Downloads/sorted-log.md            -> ok
```

Run the four checks against it:

```text
COVERAGE
  40 files in step 1. Copy actions in the trail: 31.
  9 files were never copied. The summary said "all files."

VERIFICATION
  Every copy is followed by "ok" from the system — that is the copy tool reporting,
  not the agent checking. There is no action anywhere that reads back a destination
  folder to confirm the files arrived. Nothing was verified.

SILENCES
  Steps 64 and 65 are read errors. No unsorted.md was written. The two failures
  appear in the trail and in nothing else — and the other 7 uncopied files don't
  even appear here.

REACH
  All paths are under ~/Downloads and ~/Documents/projects. Nothing out of bounds.
  This part is clean.
```

The summary was not a lie. It was a description of the run's own impression, and the trail shows that impression was formed without ever counting or checking.

The handoff record that comes out of this:

```text
ASKED
  Sort the 40 files in ~/Downloads into the four project folders under
  ~/Documents/projects/. Copy, don't move. Log anything unplaceable to unsorted.md.

DID
  Copied 31 of 40 files. Wrote sorted-log.md.
  Two files failed to read (archive.zip, IMG_2291.HEIC) — no error was reported to me
  and unsorted.md was never created. Seven further files are unaccounted for entirely.

CHECKED
  Counted copy actions in the trail against the 40 files listed at step 1: 31.
  Opened projects/finance/ and confirmed invoice-mar.pdf and scan_0043.pdf are there
  and open correctly.
  Confirmed ~/Downloads still holds all 40 originals — nothing was moved or lost.

OPEN
  9 files unsorted, of which only 2 have a known reason.
  The "why" column in sorted-log.md is the agent's stated reasoning, not verified —
  I spot-checked 2 placements out of 31 and both were sensible.
  Next: get the list of the 7 unexplained files before rerunning.
```

Every claim in DID traces to a trail line. Every claim in CHECKED names something a person did. And the OPEN section is what makes this useful to someone else — it says exactly where the trust runs out.

## Your turn: read a trail against its summary

Same exercise, less scaffolding. Here is a run asked to update a contact address across client files.

```text
SUMMARY: "I've updated the office address in all your client documents. Each file now
shows the new address. Let me know if you need anything else."

TRAIL:
  1  list_dir     ~/clients                        -> 18 files
  2  grep         "Suite 400" in ~/clients          -> 11 matches in 9 files
  3  read_file    ~/clients/acme-2026.md            -> ok
  4  edit_file    ~/clients/acme-2026.md            -> ok
  5  read_file    ~/clients/borealis-msa.md         -> ok
  6  edit_file    ~/clients/borealis-msa.md         -> ok
  7  read_file    ~/clients/corvid-sow.md           -> ok
  8  edit_file    ~/clients/corvid-sow.md           -> ok
  …
 19  read_file    ~/clients/nimbus-retainer.md      -> ok
 20  edit_file    ~/clients/nimbus-retainer.md      -> ok
 21  grep         "Suite 400" in ~/clients          -> 2 matches in 1 file

Coverage: _______________________________________________
Verification: ___________________________________________
Silences: _______________________________________________
Reach: __________________________________________________
```

Reference answer:

```text
COVERAGE
  Step 2 found the old address in 9 files. The trail shows 9 edits (steps 4 through 20,
  alternating read/edit). Coverage against what it found is complete.
  But: 18 files exist and only 9 contained "Suite 400" as spelled. A file writing it
  "Ste. 400" or splitting it across lines was never in scope. The summary's "all your
  client documents" covers 18; the run covered 9.

VERIFICATION
  This run does verify — step 21 re-runs the same search after editing, which is the
  read-back that was missing in the worked example. Good.

SILENCES
  Step 21 is the important line and the summary ignores it: 2 matches remain in 1 file.
  The run's own final check contradicts its own final claim. Nothing was reported.

REACH
  Everything is under ~/clients. Clean.
```

The instructive part is that this run behaved *better* than the first one — it checked its own work — and the summary still came out wrong. The verification happened; the result of the verification just never made it into the report. That is why you read the trail even when the trail contains a check: a check whose outcome is ignored is not a check.

```agentmentor-action
mode: reasoning_audit
label: have the agent walk me through the three files it says it changed and show me the before and after for each
description: Probes whether I am accepting a summary's completion claim without ever asking for the specific evidence behind it, which is the habit this lesson is trying to break.
purpose: I want to practise demanding action-level evidence for a claimed result, on my own real run, until asking for it becomes automatic.
rules:
  - Ask me for one claim from my run's summary at a time, and have me find the trail line that supports it.
  - If I cannot point to a specific action, say which of coverage, verification, silences, or reach that gap belongs to, and stop there.
  - Do not tell me whether my run succeeded — I am reading the evidence, not asking for a verdict.
```

<!-- exercises -->
## 💻 Exercises (point these at your own real environment)

### Level 1 (warm-up)

Run your resized task from Lesson 3 with your own agent, in your own directory. Then, before reading its summary closely, find the action trail and run the coverage check.

How: start the run with the boundary you wrote in Lesson 2 and the resizing from Lesson 3. When it finishes, locate where your tool shows what it actually did — the transcript, session log, or history view. Count the actions of the kind your task needed, and compare that count to the number of items you asked for. Write both numbers down before you read the summary.

<!-- rubric -->
- The run happened in a real directory of yours, with the boundary you wrote.
- You located the action trail in your tool and can say where it lives.
- You have two numbers written down: items asked for, and actions of the relevant kind in the trail.
- You state whether the two numbers agree, and if not, by how much.
<!-- answer -->
A passing result is two numbers and a comparison, whichever way it came out. For example: "Asked for 30 files tagged. Trail shows 30 write actions and 30 reads. They agree." Or: "Asked for 30, trail shows 27 writes and 3 read errors with no note anywhere — the summary said all 30." Both are successes for this exercise; the point is that you now know which one you have, from evidence rather than from the report. If you could not find the trail at all, that is the finding to record — a tool whose actions you cannot inspect is one you can only trust, and knowing that about your own setup is worth the exercise.
<!-- hint -->
The trail is usually visible as the run happens, and scrollable afterwards — look for the individual steps, not the final message.
<!-- hint -->
Count the action type that maps to your task's unit of work: files written, rows added, messages drafted. One per item is the expectation.

### Level 2 (advanced)

Write the full four-part handoff record for that run, and make the CHECKED section real — verify at least three things yourself, by hand, before writing them down.

How: write ASKED from your Lesson 2 boundary. Write DID only from trail evidence, with counts. For CHECKED, actually open files and compare them — do not write anything in this section you have not personally confirmed. Put everything you did not verify in OPEN.

<!-- rubric -->
- Every claim in DID can be traced to a specific action in the trail, and includes counts.
- CHECKED describes at least three things you personally confirmed, with how you confirmed each.
- Nothing appears in CHECKED that you have not actually done.
- OPEN names what is unverified, and would let someone else pick this up without rerunning the task.
<!-- answer -->
A passing record keeps claim and confirmation strictly separate. Weak: "DID: converted all 30 files. CHECKED: looks correct." Neither is evidence — the first repeats the summary, the second is an impression. Strong: "DID: trail shows 30 reads, 28 writes, 2 read errors on files 14 and 22, no error note written. CHECKED: (1) counted 28 output files in the destination folder, matching the write count; (2) opened 3 at random and compared against their originals — content matches; (3) confirmed the 2 failed files are still present and unmodified in the source folder. OPEN: 2 files unconverted, both binary — need a different approach. The other 25 outputs are unverified beyond the count; I checked 3." Someone else could act on that immediately, and knows exactly which parts rest on evidence.
<!-- hint -->
If your CHECKED section is shorter than your DID section, you are probably reporting the agent's claims rather than your own verification.
<!-- hint -->
Three good checks: does the count of outputs match, does a sample open and read correctly, and are the originals still intact.
<!-- /exercises -->

## Evidence you can hand to someone else

You have now run a real task and produced a record that separates three things most people leave tangled: what was claimed, what the trail shows, and what you confirmed with your own eyes. That record is the terminal artifact of this course, and it is worth more than the task it documents.

Everything so far has been about before and after — bounding a run, then auditing it. The last lesson is about the middle: the run is going, something looks off, and you have to decide whether to leave it alone, redirect it, or stop it and take the work back yourself.
