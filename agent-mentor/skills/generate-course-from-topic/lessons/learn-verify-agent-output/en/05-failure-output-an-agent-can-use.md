# Lesson 5: Failure output an agent can act on

> Lesson objectives:
> - Rewrite a check's failure output so an agent can repair the fault without a human translating it.
> - Name the four elements a repair-ready failure message carries.
> - Explain why a stream of similar failures indicates a defect in the gate rather than in the agent.
> - Decide which failures should be handed back automatically and which should stop and wait for you.
>
> Prerequisites: A three-layer gate from Lesson 4 that emits a verdict | Previous [<< 04](./04-three-layers-cheapest-first.md) | Next [06 >>](./06-wiring-the-gate-into-your-project.md)

## Red, and now you are the translator

Your gate works. It caught something. The output says:

```text
LAYER 3  FAIL   rl-3: second IP received 429 while first was limited
```

Now watch what happens next. You read the line, work out that the counter is probably keyed globally instead of per-address, find the file, and tell the agent what to fix. The gate found the fault; you did the diagnosis. Repeat that on every failure and you have built something that needs you present exactly as often as before — you have moved your attention from checking the work to interpreting failures about the work.

This lesson closes that loop. The check has more information at the moment it fails than anyone will have afterwards, and most of it is thrown away. Keeping it is what turns a verdict into a repair instruction.

## Explanation

### Write failures for the reader who will act on them

The principle comes from vendor guidance on tool design, where the same problem appears in a different place. Anthropic's engineering post on writing tools for agents: "if a tool call raises an error (for example, during input validation), you can prompt-engineer your error responses to clearly communicate specific and actionable improvements, rather than opaque error codes or tracebacks."[^S8]

That guidance is about tool responses inside a harness, not about check output. The course is applying it to a different surface, and the reason it carries across is that the situation is identical in the way that matters: a program is emitting text that a language model will read and act on, and the text was designed for a human reading a terminal. An exit code and a stack trace are optimised for someone who already knows the codebase.

Note what the guidance does *not* say. It does not say make errors verbose. Dumping a full trace is the opposite move — it is the same information density with more tokens.

### The four elements

A repair-ready failure carries four things. Miss one and the reader has to reconstruct it.

| Element | The question it answers | Missing it costs |
|---|---|---|
| Which condition | What was being checked? | The agent guesses at the requirement |
| Expected vs actual | What should have happened, and what did? | The agent cannot tell how far off it is |
| Where to look | Which file, endpoint, or component produced it? | A search that may land anywhere |
| What would satisfy it | What must be true for this to pass? | A fix aimed at the symptom |

The fourth is the one that is almost always absent, and it is the one that most changes behaviour. A message saying "expected 200, got 429" invites the agent to make the 429 stop, and the cheapest way to make a 429 stop is to raise the limit — which passes the check and destroys the feature. A message saying "the limiter must key on the client address so one client's limit does not affect another" names the property, and a fix aimed at a property is harder to satisfy accidentally.

This is the same hazard Lesson 2 measured from the other direction. When passing the check is the objective, whatever satisfies the check is a solution — and a message that describes only the symptom tells the agent precisely which symptom to eliminate.[^S4]

### Before and after

Take one condition failing and write it three ways.

**Opaque — the default from most tooling:**

```text
AssertionError: expected 200 to equal 429
    at Object.<anonymous> (verify/drive.mjs:41:18)
    at process.processTicksAndRejections (node:internal/process/task_queues.js:95:5)
```

Three lines, one fact, and the fact is inverted from what matters. The agent knows a number mismatched somewhere in a driver script. It does not know which condition, which feature, or what correct behaviour is.

**Verbose — the overcorrection:**

```text
FAILURE in rate limit verification suite. Full request log follows.
[14:02:11] GET /api/items from 10.0.0.1 -> 200 (1/100)
[14:02:11] GET /api/items from 10.0.0.1 -> 200 (2/100)
... 98 lines ...
[14:02:13] GET /api/items from 10.0.0.2 -> 429
Assertion failed.
```

Everything is here and the conclusion is buried under a hundred lines of successful requests. The reader must derive the finding, and Lesson 4's context on cost applies: those lines are not free to read.

**Repair-ready:**

```text
LAYER 3 FAIL — condition rl-3 (2 of 5 conditions failing)

  Condition: A second IP is unaffected while the first is limited
  Expected:  request from 10.0.0.2 -> 200
  Actual:    request from 10.0.0.2 -> 429, Retry-After: 47
  Observed:  10.0.0.1 was at 100/100 when 10.0.0.2 made its first request
  Where:     the counter read in src/middleware/rateLimit.ts
  Satisfied when: each client address has its own count, so exhausting one
                  client's budget leaves another client's budget untouched.
                  Do not raise the limit; the limit value is correct.
```

Six lines, and every one of the four elements is present. The "Observed" line is the diagnostic gift: the check knew the first client's counter state at the moment of failure, and that single fact distinguishes a global counter from a dozen other explanations. That information existed inside the check and would have been discarded.

The last clause matters as much as the rest. `Do not raise the limit; the limit value is correct` closes the cheapest wrong repair explicitly. You will not anticipate every wrong repair — but the one that makes the check green with the least work is usually easy to predict, and worth naming.

```agentmentor-check
{
  "id": "verify-agent-output-failure-message-what-to-name",
  "label": "Judge which failure line risks the wrong repair",
  "prompt": "Your layer 2 check fails: a test asserting that a used reset token is rejected on second use got a 200 instead of a 400. Which failure message is most likely to produce a fix that satisfies the check without fixing the fault?",
  "whyHere": "The reflex when writing failure output is to state the mismatch precisely — expected 400, got 200 — which feels rigorous and is exactly the framing that names a symptom rather than a property. This checks whether the reader can spot which phrasing leaves the cheapest wrong repair open.",
  "copyPurpose": "Have the agent check whether my failure messages name the property that must hold or only the symptom that must disappear, since a symptom-shaped message invites the cheapest fix that makes it go away.",
  "mode": "single",
  "choices": [
    {
      "id": "mismatch",
      "text": "\"Expected status 400, received 200 at POST /api/reset-password (second call with same token)\"",
      "correct": true,
      "feedback": "This is precise and it describes only the symptom, so the shortest path to green is to return 400 on a second call — which a request counter satisfies without ever marking the token used. The check passes, tokens remain reusable through any other path, and nothing in the message said otherwise."
    },
    {
      "id": "property",
      "text": "\"A token must be single-use: after a successful reset, the same token must never authorise a second reset. Currently the second call succeeds.\"",
      "correct": false,
      "feedback": "This one names the property that must hold, which is the shape you want. A fix has to make the token unusable rather than make one response code change, and a counter-based shortcut does not satisfy the sentence as written. The 'currently' clause still supplies the observation."
    },
    {
      "id": "trace",
      "text": "\"AssertionError: expected 200 to equal 400 at tests/reset.test.ts:88\"",
      "correct": false,
      "feedback": "Worse as a message — it names no condition, no location in the source, and nothing about correct behaviour. But it is not the answer to this question: it is too uninformative to steer toward any particular repair, wrong ones included. It produces a search, not a shortcut."
    },
    {
      "id": "verbose",
      "text": "The full request and response log for both calls, with headers and body, and the assertion line at the end",
      "correct": false,
      "feedback": "This buries the finding and costs context to read, but the raw exchange does show the second call succeeding with an unconsumed token, so a careful reader can reach the real fault. Its problem is density, not misdirection."
    }
  ]
}
```

### The gate is also under test

A check that fails repeatedly for a shape of reason is telling you about itself.

The same vendor guidance makes this diagnostic explicit for tools: "lots of tool errors for invalid parameters might suggest tools could use clearer descriptions or better examples."[^S8] The reading generalises cleanly. If your gate keeps failing because the agent cannot tell what a condition means, the condition is written badly. If it keeps failing on setup — a service not running, a fixture absent — the gate is testing your environment rather than the work.

Lesson 2's measured rejection profile is the version of this at project scale. The maintainer rejections were increasingly dominated by code quality rather than broken functionality as models improved.[^S2] A gate built when core functionality was the common failure will keep checking function and stay green while the failures move elsewhere. Reread your own failure log every so often and ask what shape it has now.

There is a specific version worth naming: a check that fails intermittently on identical input. Lesson 4 covered why that is worse than no check — you learn to re-run rather than investigate. Once a red result is something you dismiss, every message in this lesson is wasted.

### Not every failure should go back automatically

The loop this lesson builds is: check fails, agent receives a repair-ready message, agent fixes, gate re-runs. That loop is right for most failures and wrong for some, and the distinction is worth deciding in advance rather than in the moment.

Hand back automatically when the fault is inside the work and the fix is bounded: a wrong value, a missed case, a broken assertion, a shape mismatch. These are the failures where the repair-ready message does its job.

Stop and wait for a human when the failure means the *task* was wrong rather than the implementation. If a condition turns out to be impossible, if satisfying it requires a decision you never made — a schema change, a new dependency, a behaviour change to something else — then handing it back invites the agent to make that decision for you. That is the same hazard as an impossible task with editable tests: when the objective is to make the check green and the honest path is blocked, the remaining paths are shortcuts.[^S4]

There is one more reason to bound the loop. Repair attempts do not always converge, and a gate wired to re-invoke on every failure can cycle. Claude Code's own hook system, which Lesson 6 uses, ships a bound for exactly this: "Claude Code overrides the hook and ends the turn after 8 consecutive blocks."[^S9] Whatever you build, decide what happens on the third identical failure — because your first instinct will be to let it keep trying.

## Worked example: rewriting one real failure

Here is a check output from a layer 2 script, then its rewrite.

**Before:**

```text
FAIL verify/conditions.test.ts > pr-3
  Error: Expected reset to fail
  ❯ verify/conditions.test.ts:52:9
  1 failed, 4 passed
```

Work through the four elements. **Which condition**: `pr-3` is an id with no text — the reader must find the file to learn what it means. **Expected vs actual**: "Expected reset to fail" gives the expectation and never says what happened instead. **Where to look**: a line in the test file, which is where the failure was *detected*, not where it was *caused*. **What would satisfy it**: absent entirely.

**After:**

```text
LAYER 2 FAIL — condition pr-3 (1 of 5 conditions failing, 4 passing)

  Condition: A token that has already been used is rejected on second use
  Expected:  second POST /api/reset-password with the same token -> 400
  Actual:    second POST returned 200 and set a new password
  Observed:  reset_tokens row for this token still has used_at = NULL
             after the first successful reset
  Where:     the reset handler in src/api/resetPassword.ts — nothing writes
             used_at, and nothing reads it before accepting a token
  Satisfied when: a token is marked consumed at the moment it authorises a
                  reset, and a token already marked consumed is refused.
                  Rejecting by elapsed time or request count does not
                  satisfy this — the same token must fail on second use
                  even one second later.
```

The `Observed` line is again where the value is. The check queried the database row after the first reset, and that one fact converts "something is wrong with token handling" into "the consumption step does not exist." That query was already happening inside the check's setup; the only change is not discarding the result.

Note the last two lines. They pre-empt the two cheapest wrong repairs — a time window and a counter — both of which turn the assertion green while leaving tokens reusable. You know these because you wrote the condition, and the moment to write them down is now, while you are looking at the fault.

## Your turn: rewrite your own worst failure message

Run your gate on a change you know is broken — or break something deliberately — and capture the raw output. Then rewrite it.

Score the original against the four elements:

- Names which condition: yes / no
- Gives expected **and** actual: yes / no
- Points at the cause, not just the detection site: yes / no
- States what would satisfy it: yes / no

Then produce the rewrite, and answer:

- What did the check know at failure time that the message discarded? ________
- What is the cheapest wrong repair, and does your rewrite close it? ________

<details>
<summary>Answer</summary>

Almost every message from standard tooling scores yes on element two and no on the others. That is not a defect in your test framework — a framework cannot know your conditions or what would satisfy them. Those are yours to add, which means the rewrite lives in your check script, not in your framework's config.

The discarded-information question is the productive one. Checks routinely know the state they set up, the response they received in full, and the state afterward, and report a single boolean derived from all of it. Whatever you had to look up by hand after reading the failure is exactly what the check already had.

On the cheapest wrong repair: name it concretely. Not "the agent might cheat" but "it could widen the assertion to accept 200 or 400." Once written that way, the closing sentence writes itself.
</details>

<!-- exercises -->
## 💻 Exercises (point these at your own real environment)

### Level 1 (warm-up)
Take the three most recent failures from your own gate or test suite and score each against the four elements. Then rewrite the worst one in your check script so it emits all four, and re-run it to confirm the new output appears.

<!-- rubric -->
- Three real failure outputs captured verbatim, each scored on all four elements.
- One rewritten in the script itself, not just drafted in a notes file.
- The check re-run and the new output pasted next to the old one.
- The rewrite names the condition in words, not only by id.
- A "satisfied when" line that states a property, and does not merely restate the expected value.

<!-- answer -->
The most common shortfall in the rewrite is a "satisfied when" line that restates the expectation: "satisfied when the endpoint returns 400." That is the symptom again in different words. The test is whether your sentence rules out the shortcut — if a fix that returns 400 for the wrong reason would satisfy your sentence as written, rewrite it to name the property instead.

The second common shortfall is pointing at the assertion line as "where to look." Your test file is where the failure surfaced. The location worth naming is the code that produced the wrong behaviour, and you usually know it when writing the condition.

Watch for the case where you cannot name the location because the condition spans components — that is genuinely useful information, and the honest message says so: "either the sender or the template; they disagree about the variable name."

<!-- hint -->
Start with the failure you found most annoying to diagnose. The annoyance is a measure of how much the message left for you to do.

<!-- hint -->
For the "observed" line, look at what your check does before it asserts. Setup queries, seeded records, prior responses — each is state the check holds and drops.

<!-- hint -->
Write the "satisfied when" line before you finish the check, while the condition is fresh. Reconstructing it a week later is much harder.

### Level 2 (advanced)
Test whether your rewritten message actually works. Take a real failure, and in a fresh agent session with no history of the task, paste only the failure message — no other context. See whether the agent locates and repairs the fault. Then repeat with the original opaque message and compare what each session asked you for.

<!-- rubric -->
- Both sessions run fresh, with only the failure message pasted and no additional explanation.
- What each session did first recorded: which files it opened, what it asked you.
- Whether each reached the actual fault, and how many turns it took.
- One specific improvement to the message identified from watching where the good session still had to guess.
- The improvement applied to the check script.

<!-- answer -->
The comparison is usually stark on the first move. The opaque message produces a search — the session opens the test file, then adjacent files, and often asks you what the feature is meant to do. The repair-ready message produces a targeted read of the file you named.

The most valuable output of this exercise is not the confirmation. It is the place where the good session still hesitated, because that names the element your message left implicit. Frequently it is scope: the message says what must be true, and the session cannot tell whether it may change adjacent code to achieve it. If that happens, a boundary line is worth adding — say which files are in play.

A common mistake: giving the fresh session extra context when it struggles, then judging the message by the outcome. The point is to see what the message carries on its own, and rescuing it destroys the measurement. Let the session fail and note what it asked for; those questions are your revision list.

<!-- hint -->
Use a genuinely fresh session. A session that already discussed this task carries the context you are trying to test.

<!-- hint -->
Record the first three actions of each session. Later actions are contaminated by what it learned, and the first moves show what the message conveyed.

<!-- hint -->
If both sessions succeed easily, the fault was too obvious to discriminate. Pick a failure whose cause is not in the file where it was detected.
<!-- /exercises -->

## Summary + the last piece

What you can now do:

- Write a failure carrying all four elements: which condition, expected versus actual, where the cause lives, and what would satisfy it.
- Recognise why a symptom-shaped message invites the cheapest wrong repair, and close that path explicitly.
- Keep the state a check already holds instead of reducing it to a boolean.
- Read a pattern in your failure log as evidence about the gate rather than the agent.
- Decide which failures loop back automatically and which stop for you, and bound the retries.

You now have every part: conditions outside the agent, three layers ordered by cost, and failures that come back as repair instructions. What you do not have is any of it running without you deciding to run it. A gate you invoke by hand is a gate you invoke when you already suspect something. Lesson 6 installs it in a real repository, on a trigger you do not control, and uses it to overturn one "done" claim.
