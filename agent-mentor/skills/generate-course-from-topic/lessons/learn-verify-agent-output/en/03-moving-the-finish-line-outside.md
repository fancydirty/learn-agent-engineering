# Lesson 3: Moving the finish line outside the agent

> Lesson objectives:
> - Convert a task description into a done-condition something other than the agent evaluates.
> - Explain why separating the worker from the judge changes the result, and what it does not fix.
> - Choose a location and format for the done-condition that resists being edited to pass.
> - Identify which parts of a definition of done are machine-checkable and which need a judge.
>
> Prerequisites: Lesson 2's finding that a check the agent controls is weak evidence | Previous [<< 02](./02-what-green-tests-miss.md) | Next [04 >>](./04-three-layers-cheapest-first.md)

## Nobody wrote down what finished meant

Go back to the first pattern from Lesson 1: a fresh session opened a project, saw substantial work already there, and concluded the job was done.[^S1] Ask what would have prevented it, and the answer is embarrassingly ordinary. There was no list. The run had no way to distinguish "a lot has been built" from "everything has been built", because nothing in the environment said what everything was.

That is a fixable condition, and fixing it is the first real construction in this course. This lesson moves the finish line out of the agent's judgment and into an artifact — then makes that artifact hard to edit, because Lesson 2 showed what happens to a checker the agent can rewrite.

## Explanation

### Two different things are being externalised

Be precise about what moves outside, because these are separable and people conflate them.

The **done-condition** is the statement of what finished means: the list of things that must be true. The **evaluation** is the act of deciding whether they are true right now. You can externalise one without the other, and each fixes a different failure.

| What you externalise | Failure it addresses | What remains broken |
|---|---|---|
| The done-condition only | The run inventing its own finish line mid-task | The run still grades itself against the list, generously |
| The evaluation only | The run's self-assessment | With no written condition, the judge invents criteria too |
| Both | Survey-and-conclude, and lenient self-grading | Whatever neither the list nor the judge covers |

Lesson 1's survey-and-conclude pattern is a missing done-condition. Lesson 1's praise problem is a missing external evaluation. You need both, and the done-condition comes first because a judge with no criteria is just a second opinion.

### The done-condition as a file the agent reads and does not own

Anthropic's harness team solved the missing-list problem concretely. They "prompted the initializer agent to write a comprehensive file of feature requirements expanding on the user's initial prompt" — for a chat-app clone, "over 200 features, such as 'a user can open a new chat, type in a query, press enter, and see an AI response.'" Every feature started marked as failing "so that later coding agents would have a clear outline of what full functionality looked like."[^S1]

Three design choices in that sentence are worth extracting, because each answers a question you will face.

**Start everything false.** A list of unmet conditions makes the remaining work visible without anyone tracking it. A fresh session reads the file and sees the gap; there is nothing to survey and misjudge.

**Write the condition at the layer the user touches.** "A user can open a new chat, type in a query, press enter, and see an AI response" is checkable by doing it. Compare "chat functionality implemented," which is checkable only by opinion. This is Lesson 2's third blind spot closed at the level of wording — a condition phrased as a user action forces a check at the layer where integration failures live.

**Constrain how the file may change.** Their agents "edit this file only by changing the status of a `passes` field," under instructions like "It is unacceptable to remove or edit tests because this could lead to missing or buggy functionality."[^S1] The list is readable, and the requirements themselves are not up for revision by the run being graded.

They also made a format choice for a reason worth knowing: "we landed on using JSON for this, as the model is less likely to inappropriately change or overwrite JSON files compared to Markdown files."[^S1] That is one team's observation from one experiment rather than a measured law, and the underlying instinct generalises — a structured file with a rigid shape invites narrow edits, while prose invites rewriting.

### Structure that resists a self-serving edit

Two structural details do real work. First, a per-item identifier that never changes, so an item cannot be quietly reworded into something easier. Second, a count you can compare against — Lesson 2's exercise found that most projects cannot tell 47 tests from 46. A done-condition file that records how many conditions exist makes deletion visible.

Here is the minimum viable shape:

```json
{
  "task": "password-reset",
  "total": 4,
  "conditions": [
    { "id": "pr-1", "must": "A user who requests a reset receives an email containing a working link", "passes": false },
    { "id": "pr-2", "must": "Following the link loads the reset form with the token accepted", "passes": false },
    { "id": "pr-3", "must": "A token that has already been used is rejected on second use", "passes": false },
    { "id": "pr-4", "must": "An expired token shows the expiry message, not a server error", "passes": false }
  ]
}
```

Note `pr-3` and `pr-4`. Those are the conditions a run would not have invented for itself — the ones Lesson 2 called *absence*, behaviours nobody writes a test for because they seem obvious. Writing them before the work starts is the only reliable moment to catch them; afterwards, you evaluate against whatever the run built.

The agent may flip `passes`. It may not edit `must`, remove an entry, or change `total`. That is not enforced by the JSON — it is enforced by the check reading this file, which is what Lesson 6 wires up.

### Agreeing the finish line before the work, not after

There is a failure this format does not prevent: a condition so vague that flipping it to `true` is a judgment call. "The reset flow works well" is unfalsifiable, and an agent grading itself against it will find it satisfied.

Anthropic's later harness work added a step for this. Before each chunk of work, "the generator and evaluator negotiated a sprint contract: agreeing on what 'done' looked like for that chunk of work before any code was written."[^S5] The reason given is that the spec was intentionally high-level, and something had to bridge from a user story to a checkable condition.

You can run this yourself without a multi-agent harness. Before the work starts, ask the agent to turn your request into a list of conditions and to say for each one what observation would settle it. Then edit that list. This is a genuinely good use of the agent — it is a drafting task, not a grading task, and the self-praise problem does not apply. What matters is that you fix the list before implementation begins, at the moment when neither of you has anything invested in it passing.

### Separation of worker and judge

The done-condition tells you what to check. Something still has to check it, and Lesson 1 established that the run itself is the wrong candidate.

The move is **separation of worker and judge**, and Anthropic's Labs team states the lever directly: "Separating the agent doing the work from the agent judging it proves to be a strong lever to address this issue."[^S5] They immediately qualify it, and the qualification is the honest part: "The separation doesn't immediately eliminate that leniency on its own; the evaluator is still an LLM that is inclined to be generous towards LLM-generated outputs. But tuning a standalone evaluator to be skeptical turns out to be far more tractable."[^S5]

So separation is not a truth machine. It converts an intractable problem into a tractable one: you cannot easily make a run skeptical about work it just did and believes in, and you *can* write a fresh prompt whose only job is to look for what is missing. The evaluator has no investment in the work and no memory of deciding it was fine.

This is a named pattern. Anthropic's patterns essay calls it **evaluator-optimizer**: "one LLM call generates a response while another provides evaluation and feedback in a loop," effective "when we have clear evaluation criteria, and when iterative refinement provides measurable value."[^S10] Note the condition — clear criteria. That is the done-condition file, which is why it comes first.

```agentmentor-check
{
  "id": "verify-agent-output-finish-line-what-separation-buys",
  "label": "Judge what separation actually fixes",
  "prompt": "You keep the same done-condition list but change who evaluates it: instead of the run that wrote the code, a fresh session with no history of the task reads the list and checks each item. Which statement about this change is supported by the evidence in this lesson?",
  "whyHere": "Separation is easy to oversell — it looks like independent verification, and readers reach for it as the fix. The evidence explicitly says the leniency survives separation; what changes is how tractable it becomes to counteract. Getting this wrong leads to a gate whose top layer is an LLM that praises the work in a different session.",
  "copyPurpose": "Have the agent check whether I am treating a second LLM as an independent verifier when the source says it is still inclined to be generous toward LLM-generated output.",
  "mode": "single",
  "choices": [
    {
      "id": "objective",
      "text": "The evaluation is now objective, because the evaluator has no stake in the work",
      "correct": false,
      "feedback": "Lack of a stake is not objectivity. The source is explicit that separation 'doesn't immediately eliminate that leniency on its own' — the evaluator is still a language model, and still inclined to be generous toward output produced by a language model. What it removes is the evaluator's memory of having concluded the work was fine."
    },
    {
      "id": "tractable",
      "text": "The leniency persists, but it becomes far more tractable to tune the evaluator to be skeptical",
      "correct": true,
      "feedback": "That is the claim as stated. The value of separation is that skepticism becomes a property you can write into a standalone prompt with one job, rather than something you must talk a run into holding about work it just finished and believes in. Expect the evaluator to still need tuning — and expect it to be tunable."
    },
    {
      "id": "unnecessary",
      "text": "It removes the need for machine checks, since a fresh agent can verify anything a script could",
      "correct": false,
      "feedback": "This inverts the ordering the next lesson builds. A fresh agent is the most expensive and least deterministic judge available; a type checker answers its narrow question in seconds and gives the same answer every time. Reserve the LLM evaluator for conditions no script can express, and let cheap deterministic checks run first."
    },
    {
      "id": "nothing",
      "text": "Nothing changes — it is the same model, so it produces the same assessment",
      "correct": false,
      "feedback": "Too strong in the other direction. The same model in a session with no history of the task is not in the same state: it has no prior conclusion to stay consistent with and nothing invested in the result. The source calls the separation a strong lever, just not a complete fix."
    }
  ]
}
```

### Which conditions need a judge at all

Not every condition needs an LLM. Sort your list by what can settle it, because this sort determines the layer each condition lands in next lesson.

| Condition shape | Settled by | Example |
|---|---|---|
| A file, symbol, or shape exists | A script, deterministically | "The migration file exists and has been applied" |
| A command returns a specific result | A script, deterministically | "The suite passes and reports 47 tests" |
| A sequence of user actions produces an outcome | A driver — browser automation, an HTTP script | "Requesting a reset delivers an email with a working link" |
| The result is appropriate, idiomatic, or complete | A judge with criteria | "The change follows the conventions of the surrounding module" |

The bottom row is where an LLM evaluator earns its cost, and Lesson 2 showed it is not a small row: a large share of what maintainers rejected was code quality and unrelated breakage rather than broken functionality.[^S2] No script has an opinion about whether a change belongs in your codebase.

The top three rows should never reach an LLM. They are cheaper, faster, and identical every time — properties an LLM does not have.

## Worked example: from a request to a checkable list

Start with a request of the kind you actually send.

```text
"Add rate limiting to the public API so we stop getting hammered by scrapers."
```

**Step 1 — name what is unstated.** Every request has blanks that get filled silently. Here: limited by what key (IP, API key, both)? What limit? What happens on exceed — 429, or slow down? Are there exempt paths? Does the limit survive a restart? Each blank is a place the run will decide for you.

**Step 2 — write each decision as an observable condition.** Not "implement rate limiting correctly," but a sequence with a result:

```json
{
  "task": "api-rate-limit",
  "total": 5,
  "conditions": [
    { "id": "rl-1", "must": "The 101st request from one IP inside 60s returns 429", "passes": false },
    { "id": "rl-2", "must": "The 429 response carries a Retry-After header with seconds remaining", "passes": false },
    { "id": "rl-3", "must": "A second IP is unaffected while the first is limited", "passes": false },
    { "id": "rl-4", "must": "/health is never limited, at any request rate", "passes": false },
    { "id": "rl-5", "must": "Counters survive a process restart without resetting to zero", "passes": false }
  ]
}
```

**Step 3 — check each condition can fail.** This is the test of a good condition: describe the world where it is false. `rl-3` is false if the limiter keys on a global counter — a real and common bug that every single-client test passes. `rl-5` is false with an in-memory counter, which is the default implementation and works perfectly in every test that does not restart the process. Conditions you cannot describe failing are conditions that will be marked `true` by default.

**Step 4 — sort by who settles it.** `rl-1` through `rl-4` are HTTP requests with an assertable result: a script, deterministic. `rl-5` requires restarting the process mid-check — still scriptable, more expensive, and it belongs in a slower layer. None of these needs a judge, which is the right outcome; a task whose conditions are all mechanical should not be paying for an LLM evaluator.

**Step 5 — note what the list still misses.** It says nothing about whether the implementation belongs in your codebase — whether it duplicates a limiter already in your gateway, or adds a dependency you would not have chosen. That is the maintainer-review category from Lesson 2, and it is exactly the row that needs a judge. Add it as a condition in words, and accept that a script will never settle it.

## Your turn: write the list for one of your own tasks

Take a task you are about to hand to an agent — a real one, from your own backlog. Produce its done-condition file.

Work through the same five steps:

1. Three unstated decisions in your request: ________, ________, ________
2. Turn each into a condition with an observable outcome. Aim for four to six.
3. For each condition, describe the world where it is false. Delete any you cannot.
4. Mark each condition `script`, `driver`, or `judge`.
5. One thing the list still does not cover: ________

<details>
<summary>Answer</summary>

The step that most often goes wrong is 3, and it goes wrong quietly. A condition like "errors are handled gracefully" survives step 2 because it sounds concrete, then collapses at step 3 — you cannot describe the observation that makes it false, so it will be marked `true` on the strength of a try/catch existing. The repair is to name the specific error: "a request with a malformed token returns 400 with a message naming the field, not a 500."

On step 4, a healthy list for an ordinary feature task is mostly `script`, one or two `driver`, and zero or one `judge`. If everything you wrote is `judge`, the conditions are still too abstract — go back to step 2 and ask what you would *do* to check each one. If everything is `script`, look for the end-to-end path; Lesson 2's evidence says that is where the failures survive a green suite.

Step 5 has a reliable answer for most tasks: nothing on the list says the change fits the codebase. Write that down explicitly rather than leaving it implied, because it is the category the measured maintainer rejections were dominated by, and a gate that silently omits it will pass work that a reviewer would send back.
</details>

<!-- exercises -->
## 💻 Exercises (point these at your own real environment)

### Level 1 (warm-up)
Take the most recent task you gave an agent that turned out to need rework. Write the done-condition file you *would* have written before starting, using the JSON shape from this lesson, with four to six conditions. Include at least one condition covering the thing that actually needed rework. Save it in your repository as `verify/done-<task>.json`.

<!-- rubric -->
- A valid JSON file exists in your repository, with `task`, `total`, and a `conditions` array.
- Every condition names an observation, not a state of mind — you can say what you would do to check it.
- One condition covers what actually needed rework, phrased so it would have been false before the rework.
- Each condition is tagged `script`, `driver`, or `judge`, and the counts are written down.
- `total` matches the number of conditions.

<!-- answer -->
The rework condition is the one to check hardest. Written honestly, it usually turns out to be a behaviour nobody had stated anywhere — not in the request, not in a test, not in a ticket. That is the point of the exercise: the failure was not caused by an agent ignoring a requirement, but by a requirement that existed only in your head, where nothing could check it.

Watch for a condition phrased as work rather than outcome: "handles concurrent requests properly" describes an intention; "two simultaneous requests for the same record produce one row, not two" describes an observation. The first is unfalsifiable and will be marked passing.

On the `judge` count: zero is a perfectly good answer for a small task. Do not manufacture one to fill the category.

<!-- hint -->
For the unstated decisions, re-read your original request and mark every noun that could mean two things. "Rate limit", "clean up", "handle errors", "the users" — each is a decision the run made for you.

<!-- hint -->
The falsifiability test is fastest as a sentence starting "This would be false if…". If you cannot finish that sentence in ten seconds, rewrite the condition.

<!-- hint -->
Keep `must` strings short enough to read at a glance. A condition spanning three lines is usually two conditions.

### Level 2 (advanced)
Have an agent draft a done-condition file for a task you have not started yet, then audit its draft against your own. Ask for conditions plus, for each one, the observation that would settle it. Compare the two lists: what did it include that you missed, what did you include that it missed, and which of its conditions fail the falsifiability test?

<!-- rubric -->
- Both lists exist: yours written first, the agent's drafted afterwards without seeing yours.
- A written comparison naming at least one condition unique to each list.
- Every condition in the agent's draft marked as falsifiable or not, with the vague ones rewritten.
- A merged final list saved in your repository, with `total` matching its length.
- One sentence on whether drafting-then-auditing beat writing it alone, for this task.

<!-- answer -->
The agent's draft is usually stronger on breadth and weaker on falsifiability. It will surface conditions you skipped — error paths, permission cases, the empty state — because it is enumerating rather than remembering what bit you last time. It will also produce a share of conditions like "the feature is performant and reliable", which pass step 3 of the worked example only in appearance.

Your list is usually stronger on the things specific to your system: the module that always breaks, the config that differs in staging, the convention a newcomer would violate. Neither list is redundant, which is why the merge is the deliverable.

A common mistake worth avoiding: asking the agent to draft the conditions *after* it has done the work. At that point it is describing what it built, and you have written a list that its output passes by construction. The order is not incidental — the conditions must exist before there is anything invested in them passing, which is the same reason the sprint contract in this lesson is negotiated before any code is written.[^S5]

<!-- hint -->
Write yours first and do not look at the draft until you are done. Reading the draft first anchors you to its framing and you will lose your system-specific conditions.

<!-- hint -->
Ask explicitly for the settling observation per condition — "what would you do to check this?" Conditions with no good answer to that question are the ones to rewrite.

<!-- hint -->
When merging, prefer the more specific phrasing of any duplicate pair. Two lists rarely word the same condition equally well.
<!-- /exercises -->

## Summary + the next constraint

What you can now do:

- Separate the done-condition from the evaluation, and say which failure each one addresses.
- Write conditions at the layer a user touches, phrased so you can describe the world where they are false.
- Choose a structure — stable ids, a recorded total, a narrow allowed edit — that makes tampering visible.
- Say what worker/judge separation buys and what it leaves in place.
- Sort conditions into script, driver, and judge, and keep the cheap ones away from the expensive judge.

You now have a list and you know who settles each item. What you do not have is an order. Running everything on every change is slow enough that you will stop doing it, and slowness is how gates die. Lesson 4 arranges the checks so the cheapest one fails first.
