# Lesson 4: Three layers, cheapest first

> Lesson objectives:
> - Assign each of your checks to a layer by what it can catch and what it costs to run.
> - Explain why ordering by cost and stopping at the first failure is what keeps a gate in use.
> - Choose a threshold per layer that produces a verdict rather than a report.
> - Identify which layer a given past failure would have been caught by, if any.
>
> Prerequisites: A done-condition list from Lesson 3, with items sorted into script, driver, and judge | Previous [<< 03](./03-moving-the-finish-line-outside.md) | Next [05 >>](./05-failure-output-an-agent-can-use.md)

## The gate you stop running is worth nothing

Here is the failure mode this lesson exists to prevent, and it is not technical. You build a thorough verification pass. It takes six minutes. For two days you run it on everything. Then you have a small change you are confident about, and you skip it. Then you skip it again. Within a week the gate runs only when you already suspect a problem — which is exactly the situation where you would have checked anyway.

A gate that runs on the good days is the only kind that catches the bad ones. That constraint drives the entire design here: layers exist so that most runs terminate in seconds, and the expensive check is reached only when the cheap ones have already agreed there is something worth looking at.

## Explanation

### The layers are a cost ladder, not a quality ladder

The three layers are ordered by what a check costs to run, and it turns out that cost correlates inversely with how much a check can see. That relationship is the whole design.

| Layer | What runs | What it can catch | What it cannot | Typical cost |
|---|---|---|---|---|
| 1. Static | Type checker, linter, build, formatter | Malformed code, broken references, shape mismatches | Anything about behaviour | Seconds |
| 2. Behavioural | Test suite, condition scripts, health checks | Wrong results, regressions, failed assertions | Anything crossing a seam it mocks | Seconds to minutes |
| 3. System | Driving the real path; a judge with criteria | Integration failures, end-to-end breakage, work that does not fit | What nobody thought to drive | Minutes |

Call them the **static layer**, the **behavioural layer**, and the **system layer**; within the system layer, a check that applies written criteria rather than driving the product is the **judge layer**.

Nothing in layer 1 has an opinion about whether your feature works. A function that always returns `null` type-checks perfectly, builds cleanly, and satisfies every linter. That is not a weakness — it is what makes layer 1 fast enough to run on every change, and a broken build is worth knowing about in three seconds rather than after four minutes of tests.

**This ladder is a synthesis.** The three-layer arrangement is the course's organising frame, assembled from evidence that arrives separately: layer 2's ceiling is the measured grader-versus-maintainer gap from Lesson 2,[^S2] and layer 3 is the shape of the fix Anthropic's team found for exactly that gap — prompting the agent "to use browser automation tools and do all testing as a human user would," which "dramatically improved performance, as the agent was able to identify and fix bugs that weren't obvious from the code alone."[^S1] No source prescribes three layers. Treat the number as a useful default rather than a law; what the evidence supports is that a check at the layer the user touches catches things no code-level check does.

### Why stopping at the first failure matters more than it looks

Run the layers in order and stop at the first one that fails. Two reasons, and the second is the one people miss.

The obvious reason is time. If the build is broken, the four-minute test run tells you nothing you did not already know.

The less obvious reason is that failures at different layers mean different things, and a layer-1 failure makes the layers above it uninterpretable. If the type checker fails, your tests are running against code that does not compile — whatever they report is noise. Presenting a reader with fourteen failures across three layers hides the single fact that matters: the build is broken and everything downstream is a consequence.

There is also a discipline this enforces, borrowed from how Anthropic's harness handled progress: work on one thing at a time, and leave the environment clean. Their coding agent was asked "to work on only one feature at a time," and this "incremental approach turned out to be critical to addressing the agent's tendency to do too much at once."[^S1] A gate that fails at layer 1 and stops is telling the agent the same thing: fix this, then we continue.

### A layer produces a verdict, not a report

This is the difference between a gate and a dashboard. A dashboard shows you numbers and leaves the decision to you; a gate decides. Each layer needs a threshold that turns its output into pass or fail, with no interpretation left over.

For layers 1 and 2 this is usually the exit code, and there is one trap: a suite that runs zero tests exits 0. So does a suite where the agent deleted the failing test. Lesson 2's exercise found most projects cannot tell 47 tests from 46 — which is why the done-condition file from Lesson 3 records `total`. Compare the count, not just the exit code — call this the **test count check**.

For layer 3, the threshold needs stating explicitly because a judge produces prose by default. Anthropic's Labs harness handled this by scoring against criteria with a floor: "Each criterion had a hard threshold, and if any one fell below it, the sprint failed and the generator got detailed feedback on what went wrong."[^S5]

Two things in that sentence are load-bearing. *Any one* falling below the threshold fails the sprint — no averaging, because an average lets a strong score on style compensate for a broken feature. And the failure produced detailed feedback rather than a verdict alone, which is the next lesson's subject.

```agentmentor-order
{
  "id": "verify-agent-output-layer-order-by-cost",
  "label": "Order five checks into the ladder",
  "prompt": "You have five checks available for a web feature. Order them as the gate should run them — the one that should run first at the top — following the cheapest-first rule and stopping at the first failure.",
  "whyHere": "The ladder is easy to state and easy to get wrong in practice, because the intuitive order is by thoroughness rather than by cost. Putting the browser check first feels rigorous and produces a gate too slow to survive the week. Ordering these five forces the reader to apply cost rather than perceived rigour.",
  "copyPurpose": "Have the agent check whether I am ordering my verification steps by how thorough they feel instead of by what they cost to run and what a failure at each one makes uninterpretable.",
  "items": [
    { "id": "typecheck", "text": "Type checker across the changed package (about 4 seconds)" },
    { "id": "unit", "text": "Unit suite, plus a check that the test count matches the recorded total (about 40 seconds)" },
    { "id": "conditions", "text": "Script hitting the endpoints named in the done-condition file and asserting each result (about 90 seconds)" },
    { "id": "browser", "text": "Browser automation driving the full user path against a running app (about 4 minutes)" },
    { "id": "judge", "text": "A fresh agent session reviewing the diff against your codebase conventions (about 3 minutes, and it costs tokens)" }
  ],
  "correctOrder": ["typecheck", "unit", "conditions", "browser", "judge"],
  "feedback": "That is cost order, and it also happens to be interpretability order: each failure makes the layers above it meaningless, so there is no value in having run them. Note where the judge lands — last, not because its opinion matters least, but because it is the only check that costs money per run and the only one that can give a different answer on identical input. Reach it once the deterministic checks have agreed there is nothing cheaper wrong.",
  "feedbackWrong": "Compare the runtimes rather than the thoroughness. The rule is that a check runs only when everything cheaper has passed, because a failure below makes everything above it uninterpretable — a browser run against code that does not type-check reports nothing you can act on. The two closest calls are the middle pair, where the condition script costs more than the unit suite and covers seams the unit suite mocks, and the last pair, where the judge goes after the browser run because it is non-deterministic and priced per run."
}
```

### What each layer costs you when it is wrong

Every layer has a failure mode as a *check*, distinct from the failures it detects.

**Layer 1 gives false confidence when it is the only layer.** Green types on a function that returns nothing is the standing example.

**Layer 2 fails in the four ways Lesson 2 catalogued** — mocked seams, environment differences, the end-to-end path, and absence — plus the one Lesson 2 measured: it can be edited. This is where the done-condition file earns its keep, because a count that drops is visible even when the exit code stays 0.

**Layer 3 fails by being flaky, slow, or lenient.** A browser check that fails one run in five trains you to re-run rather than investigate, which is worse than no check: it manufactures a habit of dismissing red. And a judge without criteria drifts. Anthropic's Labs work used few-shot calibration on theirs — "using few-shot examples with detailed score breakdowns," which "ensured the evaluator's judgment aligned with my preferences, and reduced score drift across iterations."[^S5] A judge that is merely asked to "review this carefully" will produce a different standard each time.

The flakiness point deserves emphasis because it is how good gates die quietly. One unreliable check at layer 3 and the whole gate's verdict becomes advisory.

### Where a human still belongs

The gate is built so it does not need you watching. That is not the same as it needing nobody.

Anthropic's patterns essay draws the line where the evidence puts it: "whereas automated testing helps verify functionality, human review remains crucial for ensuring solutions align with broader system requirements."[^S10] Lesson 2 measured the size of that residue — the maintainer rejections were dominated by code quality and unrelated breakage rather than broken functionality.[^S2]

An LLM judge at layer 3 covers part of that category and does not close it. Your layers reduce what reaches you and change what you spend attention on: instead of asking "did this work at all," which the gate now answers, you are asking "does this belong here," which it does not.

There is also a real limit on layer 3 worth quoting, because harness authors hit it and said so: "Some issues remain, like limitations to Claude's vision and to browser automation tools making it difficult to identify every kind of bug."[^S1] A driver-based check sees what it drives. Anything outside the path it walks is unobserved, and the gate will report green.

## Worked example: three layers on the rate-limit task

Take the done-condition file from Lesson 3 and build the ladder around it. Watch what each layer settles.

**Layer 1 — static (about 5 seconds).**

```bash
npm run typecheck && npm run lint
```

Settles: the limiter compiles, the middleware is wired with the right signature, no unused imports left from the attempt before. Settles nothing about limiting. Failing here stops the run — everything above is noise until it compiles.

**Layer 2 — behavioural (about 45 seconds).**

```bash
npm test -- --reporter=json > /tmp/test.json
node verify/check-count.mjs /tmp/test.json verify/done-api-rate-limit.json
```

The second command is the part most gates lack. It reads the reported test count and compares it with the recorded `total`; a suite that ran 46 tests when 47 were expected fails here even though `npm test` exited 0.

Settles conditions `rl-1` and `rl-2` if unit tests cover the counter and the header. Does not settle `rl-3`, because a single-client test cannot distinguish a per-IP counter from a global one — both pass. That gap is not an oversight in the tests; it is structural, and it is why there is a layer 3.

**Layer 3 — system (about 90 seconds).**

```bash
node verify/drive-conditions.mjs verify/done-api-rate-limit.json
```

Against a running instance, this issues 101 requests from one simulated address and asserts a 429 with `Retry-After` (`rl-1`, `rl-2` — now for real, through the actual middleware stack); issues one request from a second address and asserts 200 (`rl-3`); hammers `/health` and asserts it is never limited (`rl-4`); restarts the process and re-checks the counter (`rl-5`).

`rl-3` and `rl-5` can only be settled here. A global-counter bug passes every unit test ever written for it, and an in-memory counter is correct in every test that does not restart the process. These are Lesson 2's seams, and layer 3 is where they surface.

**The verdict.** The script flips `passes` in the done-condition file for each satisfied item, then reports:

```text
LAYER 1  pass   (5s)
LAYER 2  pass   (47/47 tests, count matches)
LAYER 3  FAIL   rl-3: second IP received 429 while first was limited
                4 of 5 conditions passing — not done
```

One line names the failed condition by its stable id. No averaging, no partial credit, no "mostly complete." Four of five conditions passing is not done, and the gate says so without a human deciding.

## Your turn: assign your own checks to layers

Take the done-condition file you wrote in Lesson 3 and build the ladder for it. Fill in this table for your own project:

| Layer | Command you would run | Conditions it settles | Cost (measure it) | Threshold |
|---|---|---|---|---|
| 1 | ________ | ________ | ____ s | ________ |
| 2 | ________ | ________ | ____ s | ________ |
| 3 | ________ | ________ | ____ s | ________ |

Then answer:

- Which condition is settled by **no** layer? ________
- Total cost if everything passes: ________
- Is that short enough that you would run it on a change you feel confident about? ________

<details>
<summary>Answer</summary>

The revealing cell is "conditions settled by no layer." Almost every first attempt has one, usually of the `rl-5` kind: a condition that needs state changed underneath the system — a restart, a clock moved forward, a second actor. These are real conditions and they are expensive to check, so the honest options are to build the check anyway, to move it to a slower cadence than every run, or to mark it explicitly as unchecked. What you should not do is quietly drop it, which is how it ends up marked passing by default.

On total cost: under about 90 seconds and you will keep running it. Past three or four minutes, you will not, and the design response is not discipline — it is moving the expensive layer to a different trigger, which Lesson 6 wires up.

If layer 1 is empty because your project has no type checker or linter, the cheap layer is still available to you: a build, a syntax check, or a script asserting the files named in your conditions exist. The point of the layer is a check measured in seconds that makes everything above it interpretable — not any particular tool.

If layer 3 is empty, that is the gap this course exists to fill, and Lesson 6 builds it. It is also the layer where the measured evidence says failures survive.
</details>

```agentmentor-action
mode: pressure_scenario
label: Argue my layer 3 check would have missed the last real bug
description: Tests whether my layer 3 check actually drives the path where my failures live, or only the path that was easy to automate.
purpose: I want to find out whether the top layer of my gate covers the route a user takes, before I rely on it — since a driver-based check only observes what it drives, and anything off that path stays unchecked.
rules:
  - Ask me to describe my layer 3 check in one or two sentences: what it drives, and in what order.
  - Then ask me for the last real bug that reached staging or production in this project.
  - Argue as specifically as you can that my check would have missed it, using only what my check does not touch.
  - If it would genuinely have caught it, say so plainly and move to the next-most-likely bug instead of manufacturing a miss.
  - One question at a time; do not propose fixes until I ask.
```

<!-- exercises -->
## 💻 Exercises (point these at your own real environment)

### Level 1 (warm-up)
Measure the real cost of your gate. Run each of your three layers separately, time them with your shell's timer, and write the numbers down. Then compute the total for a passing run and the total for a run that fails at layer 1.

<!-- rubric -->
- Three measured timings, from actually running the commands rather than estimating.
- Passing-run total and layer-1-failure total, both computed.
- A statement of whether the passing total is under your own tolerance, with that tolerance named as a number first.
- If any layer is missing, it is written down as missing with its cost estimated.

<!-- answer -->
Name your tolerance before you see the numbers, otherwise you will rationalise whatever total you get. Most people find their honest tolerance for a check they run on every change is somewhere between 30 and 120 seconds.

The interesting comparison is the two totals. A well-ordered gate fails at layer 1 in a few seconds, so a broken build costs you almost nothing to discover. If your layer-1 failure total is close to your passing total, the layers are running in the wrong order or running unconditionally — check whether your script uses `&&` between layers rather than running all three and collecting results.

A common surprise: layer 2 is slower than expected because the suite runs everything rather than the affected area. That is worth fixing before adding layers on top, since layer 2 is the one that runs on nearly every invocation.

<!-- hint -->
Use `time` before each command, or record start and end timestamps if your shell makes that awkward. Estimates are consistently wrong in the optimistic direction.

<!-- hint -->
Run each twice and take the second number. The first run pays for cold caches and dependency loading, which you will not pay on every subsequent run.

<!-- hint -->
If you do not have a layer 3 yet, time the manual version: actually click through the path with a stopwatch. That number is what automating it would save per run.

### Level 2 (advanced)
Take the last three real bugs that escaped to staging or production in your project. For each, determine which layer would have caught it, and be strict — a layer catches it only if the check you actually have would have gone red, not if a check you could imagine writing would have. Then use the pattern in the results to decide which layer to strengthen first.

<!-- rubric -->
- Three real escaped bugs listed, with what was broken stated concretely.
- Each assigned to the layer that would have caught it, or to "no layer", with a one-sentence justification.
- The justification names the specific check, not the category — "the endpoint test asserting the response shape", not "layer 2".
- A decision on which layer to strengthen, following from the pattern rather than from preference.
- For at least one bug, a note on why the layer that should have caught it did not.

<!-- answer -->
The common result is that most escaped bugs land in layer 3 or in "no layer", which is the same finding the measured evidence points at: what survives a green suite is the integration path and the fit of the work, not the unit logic.[^S2] If your three bugs land mostly in layer 1, something unusual is happening and it is worth knowing what — typically a project without a type checker, where a whole class of cheap failure is escaping.

The most valuable cell in this exercise is a bug whose layer *exists* and did not catch it. That is not a missing layer; it is a layer that does not cover the path where your failures live, and adding more checks alongside it will not help. The repair is to extend the existing check to walk the route that broke, which is usually a smaller change than building a new layer.

A common mistake: crediting a layer for a bug it would have caught only if someone had written a test for that specific case. The exercise asks what your gate does today. Wishful crediting produces a gate you trust more than it deserves, which is the precise failure this course is about.

<!-- hint -->
Pull the bugs from a real record — issue tracker, incident notes, or the commits whose messages start with "fix". Reconstructing from memory selects for the dramatic ones.

<!-- hint -->
For each bug, ask what the failing observation would have been, then ask which of your commands makes that observation. If none does, it is "no layer" regardless of how obvious the bug looks in hindsight.

<!-- hint -->
If all three land in "no layer", start with layer 3 — it is the one that covers the seams, and Lesson 6 builds it into your repository.
<!-- /exercises -->

## Summary + the missing half

What you can now do:

- Place a check in a layer by its cost and by what it can observe, and say why those two track each other.
- Explain why stopping at the first failing layer is about interpretability, not only speed.
- Set a threshold per layer that yields pass or fail, including a test count that catches a deleted test.
- Name each layer's own failure mode, and why a flaky layer 3 is worse than a missing one.
- Say what the gate leaves for a human, and why that residue does not shrink to zero.

The gate now produces a verdict. But look again at what it emitted: `rl-3: second IP received 429 while first was limited`. That line is aimed at you. Hand it back to an agent and it has to guess at which code, which counter, and what the correct behaviour was. A gate that only tells a human what is wrong needs a human on every failure — and that is the loop Lesson 5 closes.
