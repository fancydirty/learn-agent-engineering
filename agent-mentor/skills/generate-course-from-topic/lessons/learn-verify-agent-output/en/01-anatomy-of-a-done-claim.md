# Lesson 1: Where a "done" claim comes from

> Lesson objectives:
> - Describe what an agent is actually reporting when it says a task is complete.
> - Explain why asking the same run to double-check does not produce a second opinion.
> - Name two first-party observed patterns that produce an early completion claim.
> - State what a completion claim is legitimate evidence of, and what it is not.
>
> Prerequisites: You have run an agent on a multi-step task in a real project | Previous [<< Course contents](./README.md) | Next [02 >>](./02-what-green-tests-miss.md)

## The summary reads the same either way

You have the message in front of you. It lists what was implemented, it notes a decision or two, it closes by saying the task is complete. It is well organised and it is confident.

The problem is not that it is wrong. Most of the time it is roughly right. The problem is that it reads exactly the same when it is wrong, so it carries no information you can act on. A finished task and a two-thirds finished task produce the same shape of message, and you cannot tell them apart by looking harder at the message.

This course builds the thing that can tell them apart: a gate made of checks that run whether or not you are paying attention, that the agent does not get to grade, and that you can re-run on your own project tomorrow. This first lesson is about the claim itself — what produces it, and why the obvious repair does not work.

## Explanation

### What the loop is actually doing when it stops

An agent working on your task is running an **agent loop**: it calls a tool, reads what comes back, decides what to do next, and repeats. Anthropic's patterns essay describes the shape plainly — agents "are typically just LLMs using tools based on environmental feedback in a loop," and during execution "it's crucial for the agents to gain 'ground truth' from the environment at each step (such as tool call results or code execution) to assess its progress."[^S10]

The loop needs a reason to stop. Two things can end it: the model judges the task complete, or something outside the model says stop. The same essay notes that stopping conditions are commonly imposed from outside — "it's also common to include stopping conditions (such as a maximum number of iterations) to maintain control."[^S10]

When you get a "done" message with no gate in place, the first kind of stop happened. The **completion claim** is the model's own judgment that the loop should end, written up in prose. That is worth stating precisely, because it settles what the claim can and cannot tell you.

### A claim is evidence about a belief, not about a repository

The message reports what the run believes happened. If the run believed an edit landed, believed a command succeeded, or believed the remaining work was cosmetic, the summary faithfully reports those beliefs. It is not deception. It is an accurate report of a possibly inaccurate picture.

So the claim is real evidence — about the run's internal state. It is not evidence about the state of your repository, because nothing in the process of writing a summary consults your repository. Those are two different questions, and only one of them is the one you care about before you ship.

### The obvious repair returns praise

The instinctive next move is to ask: "Are you sure? Double-check it." This is the move that feels like diligence and is not.

Anthropic's Labs team names the effect from their own harness work: "When asked to evaluate work they've produced, agents tend to respond by confidently praising the work—even when, to a human observer, the quality is obviously mediocre."[^S5] They also mark its boundary honestly. The effect is "particularly pronounced for subjective tasks like design, where there is no binary check equivalent to a verifiable software test" — but it does not vanish where checks exist: "even on tasks that do have verifiable outcomes, agents still sometimes exhibit poor judgment that impedes their performance while completing the task."[^S5]

There is a longer-standing result underneath this. A peer-reviewed ICLR 2024 study defined **intrinsic self-correction** as a model revising "its initial responses based solely on its inherent capabilities, without the crutch of external feedback," and found that models "struggle to self-correct their responses without external feedback, and at times, their performance even degrades after self-correction."[^S6] Their diagnosis of earlier, more optimistic results is the useful part: those gains came "from using oracle labels to guide the self-correction process, and the improvements vanish when oracle labels are not available."[^S6]

That study is from 2023 and the models it tested are long superseded, so read it as a durable design principle rather than a current benchmark: a review pass with no outside signal runs on the same judgment that produced the answer. Later work has trained self-correction behaviour into models, so do not carry the numbers forward. Carry the shape — the word doing the work in that finding is *external*.

### Two observed patterns that end a run early

"Declares victory too early" is not one behaviour. Anthropic's engineers, running frontier models in a loop across many context windows to build a full web app, logged two distinct patterns, and they call for different repairs.[^S1]

The first is **survey-and-conclude**. In their words: "After some features had already been built, a later agent instance would look around, see that progress had been made, and declare the job done."[^S1] Nothing malfunctioned. A session started fresh, saw a codebase with real work in it, and read that as a finished project. The run had no list of what "all of it" meant, so a substantial fraction of it looked like the whole.

The second is **checked, but not the thing that mattered**. Their observation: "Absent explicit prompting, Claude tended to make code changes, and even do testing with unit tests or `curl` commands against a development server, but would fail recognize that the feature didn't work end-to-end."[^S1] This run did verify. It ran tests, they passed, and the feature still did not work for a user. Lesson 2 is about that gap specifically.

These are one team's internal experiments on one app-building task, reported as engineering observation rather than a controlled measurement — so treat them as documented failure modes to look for in your own runs, not as rates. What makes them worth the whole course is that both were fixed by changing the environment rather than the model.

A third pattern shows up in the same body of work and is worth naming because it feels like the others from outside: some models "exhibit 'context anxiety,' in which they begin wrapping up work prematurely as they approach what they believe is their context limit."[^S5] The run is not mistaken about progress; it is hurrying. From your side, it produces the same message.

| Pattern | What the run believed | What it needed |
|---|---|---|
| Survey-and-conclude | Visible progress meant complete progress | A list of what complete means, written before the work |
| Checked the wrong layer | Green tests meant a working feature | A check at the layer the user actually touches |
| Hurrying near a limit | Time to wrap up | State on disk so stopping is cheap and resuming is possible |

### Why this is not a calibration story

You will see this failure explained as model overconfidence — that neural networks report higher confidence than their accuracy justifies, so agents overstate completion. The analogy is tempting and the inference does not hold. Calibration results about a classifier's probability estimates are about a different object than a multi-step agent's judgment that a software task is finished: one is a number attached to a single prediction, the other is a conclusion drawn from an incomplete picture of a repository after dozens of tool calls. Borrowing authority from the first to explain the second gives you a confident-sounding account and no leverage.

The observed patterns above give you leverage precisely because they are specific. Survey-and-conclude is fixed by an external feature list. Checking the wrong layer is fixed by adding a layer. Neither repair follows from "the model is overconfident," and that is the difference between a story and a mechanism.

```agentmentor-check
{
  "id": "verify-agent-output-done-claim-what-a-recheck-buys",
  "label": "Judge what a re-check adds",
  "prompt": "A run finishes and reports the migration is complete. You reply: \"Are you sure? Go back and verify each step.\" It re-reads its own summary and the files it edited, then confirms: yes, complete. What has that second pass established?",
  "whyHere": "Asking for a double-check is the near-universal first repair, and it feels like verification because effort was expended. The distinction that matters is whether the second pass consulted anything the first pass did not — and here the reader has to notice that re-reading edited files is not the same as evaluating whether the task is done.",
  "copyPurpose": "Have the agent check whether I am treating a self-review pass as independent evidence when nothing outside the run supplied a signal.",
  "mode": "single",
  "choices": [
    {
      "id": "confirmed",
      "text": "The claim is now confirmed — it was checked twice, by a pass that looked at the actual files",
      "correct": false,
      "feedback": "Two passes from the same source are not two sources. The second pass reused the same judgment about what 'complete' means, and that judgment is the thing in question. Note also what it read: the files it edited, which can only tell it what it changed, never what it failed to change."
    },
    {
      "id": "external-signal",
      "text": "Very little — nothing outside the run produced a signal, so the same judgment was applied twice",
      "correct": true,
      "feedback": "This is the distinction the ICLR result draws: the gains attributed to self-correction came from oracle labels, and vanished when those labels were removed. A pass that consults no outside signal is a re-run of the original judgment, and the observed tendency is to come back praising the work rather than finding fault in it."
    },
    {
      "id": "partial",
      "text": "It rules out careless errors like an edit that never saved, even if it cannot rule out misunderstanding the task",
      "correct": false,
      "feedback": "Closer, and it names a real distinction — but re-reading its own summary and its own edits is exactly the check that cannot catch an unsaved edit, because the run's picture of what it saved is what is being consulted. A file read from disk by something other than the run would catch that; this did not happen here."
    },
    {
      "id": "worse",
      "text": "Nothing, and it made things worse — self-correction reliably degrades the answer",
      "correct": false,
      "feedback": "Overstated in a way worth correcting: the ICLR study found performance sometimes degrades after self-correction, not that it reliably does, and that was measured on 2023-generation models. The safe claim is that the pass adds no independent evidence, not that it actively destroys a good answer."
    }
  ]
}
```

### You are in the majority, and that is the problem

Sonar's 2026 State of Code survey asked 1,149 professional developers, fielded through October 2025, how much they agree that "I trust that AI code is functionally correct." Their headline: "96% of developers don't fully trust that AI-generated code is functionally correct."[^S7]

Read that number carefully, because it is softer than it sounds. It is the residual of an agreement scale: 4% completely agreed, so 96% is everyone else — including the 25% who somewhat agree and the 23% who neither agree nor disagree.[^S7] It is not 96% of developers distrusting AI code. It is 96% not endorsing it without reservation, which is a much more ordinary thing to find.

The number worth carrying is the other one: "only 48% of developers always check their AI-assisted code before committing."[^S7] Distrust is near-universal; checking is a coin flip. Note also who published this — Sonar sells code verification tooling, so this is vendor research on a question whose answer favours the vendor. Treat it as a read on attitudes, which it measured directly, and not as evidence about how agents behave.

The gap between those two numbers is the thing this course closes. Not by making you more suspicious — you already are — but by making the check cheap enough and automatic enough that it happens on the runs where you are tired.

## Worked example: reading one claim three ways

Here is a completion message. Read it as evidence and see how little is left.

```text
"I've finished the password reset flow. I added the reset_token column via a
migration, implemented POST /api/reset-password, added the email template, and
wrote unit tests for the token generation and expiry logic. All tests pass.
The feature is complete and ready for review."
```

**Pass one — what is claimed.** Four artifacts (migration, endpoint, template, tests) and one result (tests pass). All specific, all checkable.

**Pass two — what is evidenced.** "All tests pass" is the only line reporting something outside the model's own account: a command ran and produced output. Everything else describes work the run believes it did. That belief may well be right. It is not the same kind of statement, and the summary presents both in the same voice.

**Pass three — what the claim would look like under each failure pattern.** This is the pass that matters, because the message does not change:

- *Survey-and-conclude*: the migration file exists but was never applied to the dev database. The run saw four artifacts, counted them as the feature, and never asked what else "password reset" contains — a confirmation email actually arriving, a used token being rejected the second time.
- *Checked the wrong layer*: the tests cover token generation and expiry, and they pass. Nobody ever requested a reset and clicked the link. This is the pattern from the harness work exactly: tests run, tests green, feature broken end-to-end.[^S1]
- *Hurrying*: the template is a placeholder with the copy still to write, and the run wrapped up rather than continuing.

Three different repository states, one message. The message did its job faithfully in all three cases, which is why no amount of re-reading it separates them.

## Your turn: separate claim from evidence

Take the completion message below and sort every assertion into one of two columns: **reported belief** (the run's account of what it did) or **external signal** (something outside the run produced output). Then name the one check that would most cheaply distinguish the good case from the bad one.

```text
"Refactored the auth module as requested. Moved token validation out of
middleware.ts into a new lib/tokens.ts, updated all six call sites, and kept
the public interface unchanged so nothing downstream breaks. I ran the type
checker and it's clean. Existing tests still pass."
```

Fill in the blanks:

- Reported beliefs: ________, ________, ________
- External signals: ________, ________
- The claim most likely to be wrong and least covered by the signals: ________
- Cheapest check that would settle it: ________

<details>
<summary>Answer</summary>

- **Reported beliefs**: that validation moved to `lib/tokens.ts`; that all six call sites were updated; that the public interface is unchanged. The count "six" is the interesting one — it is the run's count, and nothing verified it.
- **External signals**: the type checker ran clean; the existing tests pass.
- **Most likely wrong, least covered**: "all six call sites." A type checker catches a call site whose *signature* no longer matches, so it partly covers this — but it says nothing about whether six is the right number. If there were seven and the seventh calls through a dynamic import, a string-keyed lookup, or a test fixture the type checker does not traverse, both signals stay green.
- **Cheapest check**: grep the old symbol name across the repository and count the hits yourself. One command, no agent involvement, and it answers the exact question the summary cannot. If the old import path still appears anywhere outside `lib/tokens.ts`, the claim is wrong.

The general move: find the assertion carrying a number or a quantifier ("all", "every", "six") and ask which signal counted it. Usually none did.
</details>

```agentmentor-action
mode: reasoning_audit
label: Have the agent argue that its own last "done" was premature
description: Probes whether I can tell a run's reported beliefs apart from signals produced outside the run, using a real completion message rather than a constructed one.
purpose: I want to practise reading a completion claim as evidence — separating what the run believes from what something external actually produced — before I start building checks in the next lessons.
rules:
  - Ask me to paste one real completion message from a recent run of my own.
  - Ask me to sort its assertions into reported beliefs and external signals myself, before you comment.
  - Then argue the strongest case you can that the task was NOT complete, using only what the message leaves unevidenced.
  - Do not tell me the work was probably fine; the exercise is to find what the message cannot rule out.
  - One question at a time.
```

<!-- exercises -->
## 💻 Exercises (point these at your own real environment)

### Level 1 (warm-up)
Open your agent's history and find the three most recent runs that ended with a completion claim. For each, copy the final message into a scratch file and mark every sentence as either a reported belief or an external signal, using the two-column split from the faded example. Then, for the run you are least sure about, go into your repository and check one reported belief by hand — read the file, run the command, open the page.

<!-- rubric -->
- Three completion messages captured, each with every sentence marked as belief or signal.
- At least one run where external signals are fewer than a third of the assertions.
- One belief checked by hand against the repository, with the result written down: confirmed, or not.
- You can state in one sentence what the check told you that the message did not.

<!-- answer -->
Most completion messages come out heavily weighted toward reported beliefs, typically with one or two signal lines ("tests pass", "the build succeeded"). The specific thing to notice is that the signals almost always cover the layer the agent worked at, not the layer you care about — a passing type check on a refactor, a passing unit test on a feature. When you check a belief by hand, the common outcomes are: confirmed exactly, confirmed but narrower than stated ("updated the call sites" turns out to mean the ones in `src/`, not the ones in `scripts/`), or a real miss. The second outcome is the most instructive, because it is the one that never announces itself.

<!-- hint -->
Signals have a verb attached to a command or an observation: "ran", "passed", "returned 200", "the page rendered". Beliefs have verbs about authorship: "added", "updated", "implemented", "kept", "ensured".

<!-- hint -->
If a sentence contains a count or a universal ("all", "every", "each", "both", a number), treat it as a belief and ask which signal counted it. That question alone finds most of the gaps.

<!-- hint -->
For the hand check, pick the cheapest possible verification — one grep, one file open, one page load. If checking a belief takes more than a minute, you picked the wrong belief for this exercise.

### Level 2 (advanced)
Find a run in your own history where the completion claim turned out to be wrong — something you discovered later, in review, in staging, or from a user. Reconstruct which of the three patterns produced it: survey-and-conclude, checked the wrong layer, or hurrying near a limit. Then write down the single check that would have caught it, and how long that check would have taken to run.

<!-- rubric -->
- One real past failure identified, with what was actually broken stated concretely.
- A pattern assigned, with the evidence for that assignment — not just a label.
- The check that would have caught it, specific enough to run: a command, a page to open, a file to inspect.
- An honest estimate of the check's cost in seconds, and whether it could run without you watching.

<!-- answer -->
The assignment matters more than getting the label "right", because each pattern implies a different fix. If the run never attempted the thing that was broken, it is survey-and-conclude, and the fix is an external list of what the task contains. If the run tested something adjacent and passed — unit tests green, feature broken — it is the wrong-layer pattern, and the fix is a check at the layer the user touches. If the work was visibly rushed at the end, half-written or placeholder, it is hurrying, and the fix is durable state on disk so a fresh session can resume rather than wrap up.

A common mistake in this exercise: choosing "the agent lied" or "the model was not smart enough" as the diagnosis. Neither is actionable — you cannot build a check against them. Both usually resolve, on inspection, into one of the three patterns, and the tell is what the run *did*: no attempt at all, an attempt at the wrong layer, or a rushed attempt. If your check would take more than a minute to run, note that too; Lesson 4 orders checks by exactly that cost.

<!-- hint -->
Look at what the run actually did rather than what it said. A run that never touched the broken area is survey-and-conclude; a run that touched it and tested something adjacent is the wrong-layer pattern.

<!-- hint -->
If the failure was found by a person clicking through the product rather than by a tool, that is a strong signal the missing check belongs at the top layer — the one this course builds in Lesson 4.

<!-- hint -->
Time the check if you are unsure. A check that takes eight seconds belongs in the gate unconditionally; one that takes four minutes needs a reason to be there, and Lesson 4 is about earning that reason.
<!-- /exercises -->

## Summary + what's next

What you can now do:

- Say what a completion claim reports — the run's belief that the loop should stop — and what it therefore cannot report.
- Explain why "are you sure?" returns praise rather than evidence, and why the word *external* is what carries the ICLR finding.
- Name three observed patterns that end a run early, each with its own repair.
- Read a completion message by splitting reported beliefs from external signals.

The remaining question is the one that pattern two raised and did not settle. The second observed pattern was a run that *did* verify — ran tests, saw green, and still shipped a broken feature. If tests are not sufficient, it is worth knowing exactly what they leave out, because that gap is the shape of the layers you will add. Lesson 2 measures it.
