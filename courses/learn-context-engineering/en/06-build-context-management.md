# Lesson 6: Hands-On: Wiring Context Management onto the Harness

> Learning goals:
> - Wire token usage tracking onto a stop_reason-driven harness loop: accumulate with `response.usage`, decide whether context is approaching the window limit
> - Turn Lesson 4's `compact()` into a threshold-triggered mechanism: set the trigger ratio, think through how `messages` and the usage counter should reset after triggering
> - Wire structured notes into this compaction flow so `NOTES.md` gets read back whenever a new window restarts, and run a task that exceeds single-window capacity
>
> Prerequisites: You've finished Lesson 4 on compaction and notes, Lesson 5 on subagent isolation, and you have the harness loop from course 7 of this series, "Agent Harness Fundamentals: Loops and Control," within reach | Prev: [Lesson 5 <<](./05-subagent-context-isolation.md)

## First, See It Running

The first five lessons were all principles: why context is a finite resource, how compaction works, how notes work, how subagents isolate. This lesson welds the first two — compaction and notes — into the harness loop you wrote in course 7 of this series. First see what it looks like running, then we'll unpack the code.

Below is a real execution log (using a stub client to simulate multi-turn model responses so a long task fits in a few lines of logs; the stub client implementation appears at the end of this lesson). The task is that familiar scenario from Lesson 4: fixing a concurrency race bug in an order service. To trigger compaction within a few turns, the demo deliberately sets a tiny context window:

```text
[call 1] stop_reason=tool_use tokensUsed=400
[call 2] stop_reason=tool_use tokensUsed=1050
[call 3] stop_reason=tool_use tokensUsed=1850
[call 4] >>> compaction triggered (1st time), tokensUsed reset to 0
[call 5] stop_reason=tool_use tokensUsed=280
[call 6] stop_reason=end_turn tokensUsed=490

Final reply: Added version field to orders table and wired optimistic locking; race bug fixed.
Total model calls: 6 (including 1 compaction call)
Compaction triggers: 1

Final NOTES.md content:
## Decisions Made
- Fix approach: database optimistic locking (add version field to orders table)
## Unresolved
- (none -- updateStatus race resolved with optimistic lock merge)
```

Read through line by line: the first three calls push `tokensUsed` from 400 to 1050 to 1850; after the third round's tool results are appended to history, the accumulated value crosses the set threshold, so the harness doesn't wait for the window to actually blow up — it proactively fires a compaction call (call 4; `stop_reason` no longer matters because this response never enters the main loop, its output is used directly to restart `messages`); `tokensUsed` resets to zero; the next two rounds count fresh in the new window until the model wraps up. The entire process has only one user-visible artifact — that final reply; compaction and notes happen offstage. The rest of this lesson is building the code behind that log, line by line.

## I. Wire Token Usage Tracking onto the Loop

Step one is straightforward: know how many tokens you've used so far, because that's the prerequisite for deciding whether to compact. You already used this field when you wrote the budget valve (valve 2) in course 7 of this series — `response.usage` carries `input_tokens` and `output_tokens` for this call, and each time you get a response you add them to an accumulator:

```javascript
function trackUsage(tokensUsed, response) {
  return tokensUsed + response.usage.input_tokens + response.usage.output_tokens;
}
```

Course 7's `TOKEN_BUDGET` valve used this accumulated value for one thing: stop when you hit the ceiling. This lesson does something else: compact proactively at a much earlier ratio and keep working, rather than stopping. Both use the same accumulator; what happens after the trigger is completely different — one brakes, the other takes a breath.

How big is the window itself? That's a constant you define in your own engineering judgment:

```javascript
const CONTEXT_WINDOW = 2000; // small demo window to trigger within a few turns; real projects set this to your model's actual limit
const COMPACT_RATIO = 0.7;   // threshold: compact when usage exceeds 70% of window

function shouldCompact(tokensUsed) {
  return tokensUsed >= CONTEXT_WINDOW * COMPACT_RATIO;
}
```

There's no standard answer for what `COMPACT_RATIO` should be — it's an engineering judgment, not a spec clause. Set it too high and by the time you realize "time to compact," the window might be so tight you can't even send the next request; set it too low and compaction will interrupt the task earlier and more often than it should, wasting model calls. As a rule of thumb, leaving about 30% headroom (i.e., a threshold of 0.7) usually works; the specific number should be tuned based on your actual model's window size and the volume of single-turn tool outputs.

## II. Threshold-Triggered Compaction: Wire Lesson 4's `compact()` Into the Loop

With the mechanism set, the next step is wiring it into the loop body. Recall Lesson 4's conclusion: compaction doesn't cram a summary back into the old conversation and keep squeezing — it **restarts** a new window with the summary, abandoning the old `messages` entirely[^S1]. Wired into the loop, that means replacing `messages` wholesale at the right moment:

```javascript
while (response.stop_reason === "tool_use") {
  messages = await appendToolResults(messages, response, toolImpls); // reuse the helper from Lesson 5

  if (shouldCompact(tokensUsed)) {
    messages = await compact(client, messages); // restart: replace wholesale
    tokensUsed = 0;                              // new window, count from zero
  }

  response = await client.messages.create({ model: MODEL, max_tokens: 1024, tools, messages });
  tokensUsed = trackUsage(tokensUsed, response);
}
```

Three positions determine whether this code is correct:

- **Where the check sits**: immediately after this round's tool results are appended to `messages`, before the next `client.messages.create`. Too early (checking before appending) misses the tool outputs just produced; too late (appending after checking) sends already-over-threshold content for an extra request.
- **After compaction, `messages` is replaced wholesale, not appended to**: the return value of `compact()` is assigned directly to `messages`, and the old array with its dozens of tool round-trips is discarded — that's the boundary between "restart" and "keep piling onto the old conversation."
- **`tokensUsed` must reset to zero**: the new window starts from a summary, so usage should count from this summary onward, not keep carrying the old window's accumulated value. Missing this step is a common trap; this lesson's exercises will diagnose it specifically.

`compact()` itself reuses the Lesson 4 implementation; `COMPACT_INSTRUCTION` and the triage principles (preserve architectural decisions, unresolved bugs, and key implementation details; discard redundant tool outputs) stay the same[^S1]. The next section adds one new capability to it: on restart, read not just the summary but also `NOTES.md`.

## III. Structured Notes as Fallback: NOTES.md Gets Read Back During Compaction

Compaction is passive and after-the-fact — it summarizes "what's left in the window at the moment of trigger." Lesson 4 already explained that notes are active, write-as-you-go insurance: the agent writes decisions and problems to `NOTES.md` outside the window the moment they happen[^S1]. The way to wire the two together is straightforward: **when a new window restarts, in addition to reading the summary, also read `NOTES.md` back in** — so even if this round's summary triage made a mistake, the notes still have an independent backup.

First, give the agent a tool for writing notes:

```javascript
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const NOTES_PATH = path.join(process.cwd(), "NOTES.md");

async function readNotes() {
  try {
    return await readFile(NOTES_PATH, "utf8");
  } catch {
    return "(NOTES.md is still empty)";
  }
}

async function writeNotes(content) {
  await writeFile(NOTES_PATH, content, "utf8");
}

const NOTES_TOOL = {
  name: "update_notes",
  description: "Overwrite NOTES.md with the complete content you want to save, for recording architectural decisions, unresolved issues, next-step plans",
  input_schema: {
    type: "object",
    properties: { content: { type: "string" } },
    required: ["content"],
  },
};

const toolImpls = {
  update_notes: async ({ content }) => {
    await writeNotes(content);
    return "NOTES.md updated";
  },
  // ...your other tools
};
```

`update_notes`'s `input` is the **complete** note content to save, and the implementation writes it wholesale — this is the simplest semantics: the agent maintains one complete note corpus and every update means "this is the current state," with no incremental merging to handle. Wire a requirement into the system prompt: "Whenever you make an important decision, discover a new problem, or complete a phase, call `update_notes` to update notes before continuing," just as in Lesson 4.

Then comes this lesson's new step: after `compact()` generates the summary, it also reads `NOTES.md` into the restart message:

```javascript
async function compact(client, messages) {
  const resp = await client.messages.create({
    model: MODEL,
    max_tokens: 2000,
    messages: [{
      role: "user",
      content: COMPACT_INSTRUCTION + "\n\n" + formatHistory(messages),
    }],
  });
  const summary = resp.content.find((b) => b.type === "text").text;
  const notes = await readNotes(); // new: bring the out-of-window notes along
  return [{
    role: "user",
    content:
      "Below is a handoff summary of prior work; continue from here:\n\n" + summary +
      "\n\nBelow is the current NOTES.md content:\n" + notes,
  }];
}
```

When the new window wakes up, it has two pieces of material: the model's own summary, and the notes the agent wrote by hand. The former may lose detail due to summary triage; the latter is lossless — that's Lesson 4's "the more diligent the notes, the lighter the consequences of compaction losing something" in code form.

```agentmentor-check
{
  "id": "ctx-zh-06-notes-every-turn",
  "label": "Evaluate a proposal to cram NOTES.md into every turn's system prompt",
  "prompt": "After seeing the code where compact() \"reads NOTES.md once at restart,\" a colleague proposes going further: just put NOTES.md's full text into the system prompt so it goes out with every request, that way the model can always see the latest notes without waiting for compaction to trigger. What do you think of this proposal?",
  "whyHere": "The previous code block just demonstrated \"read notes once at the moment of compaction restart\"; if the reader doesn't realize that's deliberate, it's easy to think \"wouldn't bringing notes along every turn be safer\" — here we need to test whether the reader understands that externalizing notes means not occupying the window, not making content always visible.",
  "mode": "single",
  "choices": [
    {
      "id": "a",
      "text": "More thorough and safer: notes aren't that big anyway, bringing them along every turn ensures no information loss, no downside",
      "correct": false,
      "feedback": "\"Not that big\" is relative: notes will grow longer as the task progresses, and the system prompt is content sent fresh every single turn. Cramming it into every turn's system prompt means the notes' full volume repeatedly consumes attention budget throughout the task — and externalizing notes precisely means moving that state outside the window, fetching only when needed."
    },
    {
      "id": "b",
      "text": "Not recommended: every new token depletes some of the attention budget, and externalizing notes means they don't occupy the window; reading once at the genuine restart moment is more economical than carrying them every turn",
      "correct": true,
      "feedback": "Got the crux. Notes are written outside the window precisely so they don't occupy every turn's attention budget; every new token depletes some of that budget. Compaction restart is the moment when the window genuinely \"switched to a new batch of memory,\" at which point reading notes once is a reasonable cost; cramming the same content repeatedly into every turn is like moving \"external\" back to \"internal\" — as notes grow longer, the cost snowballs."
    },
    {
      "id": "c",
      "text": "Doesn't matter: notes and summary will be re-summarized by the next compaction anyway, so how many times you read them doesn't affect the final result",
      "correct": false,
      "feedback": "The cost here isn't \"is the final result right,\" but \"how much attention budget do you spend to reach that result.\" Carrying full-text notes every turn is a real per-turn token and budget cost, separate from whether some future compaction will summarize them — before compaction happens, redundant note copies have already been steadily dragging down attention density."
    }
  ]
}
```

## IV. Put It Together: A Task That Exceeds Single-Window Capacity

Three components — usage tracking, threshold-triggered compaction, reading and writing `NOTES.md` — wired into the same `runAgent` produce the complete code behind the opening log:

```javascript
import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic();
const MODEL = "claude-sonnet-5";

async function runAgent(userInput, tools, toolImpls, opts = {}) {
  let messages = [{ role: "user", content: userInput }];
  let tokensUsed = 0;

  let response = await client.messages.create({
    model: MODEL, max_tokens: 1024, tools, messages,
  });
  tokensUsed = trackUsage(tokensUsed, response);

  while (response.stop_reason === "tool_use") {
    messages = await appendToolResults(messages, response, toolImpls);

    if (shouldCompact(tokensUsed)) {
      messages = await compact(client, messages);
      tokensUsed = 0;
      opts.onCompact?.();
    }

    response = await client.messages.create({
      model: MODEL, max_tokens: 1024, tools, messages,
    });
    tokensUsed = trackUsage(tokensUsed, response);
  }

  return response.content.find((b) => b.type === "text")?.text ?? "";
}
```

This is the complete source of the opening log: three tool calls push `tokensUsed` from 400 to 1050 to 1850, crossing the `2000 * 0.7 = 1400` threshold line; `compact()` is called, `messages` is replaced wholesale, counter resets to zero; then two more rounds in the new window, and the model wraps up. Only one compaction happened during the entire run, but if the task continued and hit the threshold again, the same logic would trigger a second, third time — `shouldCompact` doesn't care which window this is, it only looks at the current window's usage. That's what "running a task that exceeds single-window capacity" means: the task's total length is not bounded by any one window's capacity, only bounded by "one continuous uninterrupted inference."

To run a full verification, hook up a stub client that simulates multi-turn model responses (swap it for `new Anthropic()` in real calls; the `runAgent` code doesn't change a character):

```javascript
let callIndex = 0;
const queue = [ /* ...responses in call order, where the 4th is compaction's own reply... */ ];

const stubClient = {
  messages: {
    create: async () => queue[callIndex++],
  },
};
```

The value of verifying with such a stub client is that it nails down "will the model call tools this turn, how many tokens did it use" as known quantities, so whether compaction triggers at which turn, whether `tokensUsed` resets to zero, whether `NOTES.md` gets written then read back — everything can be checked with assertions instead of squinting at real call outputs and guessing.

## Sense of Proportion: Not Every Task Needs This Machinery

After wiring all this up, it's easy to develop a false impression: from now on, writing agents should default to including usage tracking, threshold compaction, and structured notes as a package. Return to the sense of proportion established in Lesson 2: consider adding complexity only when it can demonstrably improve outcomes[^S2]. For tasks that finish within a dozen turns, compaction and notes are both superfluous components — start from the bare loop plus basic control valves from course 7 of this series, and only add this layer when you actually hit the window limit or see "new window doesn't know what old window did" amnesia symptoms.

At this point, everything this course taught from Lesson 1 to Lesson 6 — attention budget, altitude of system prompts, just-in-time retrieval, compaction and notes, subagent isolation — converges on the same takeaway: what the model should see each turn is always an engineering judgment you keep revisiting, not a one-time configuration you set and forget.

<!-- exercises -->
## 💻 Exercises

### Level 1: Track When Compaction Triggers

A harness is configured with `CONTEXT_WINDOW = 6000` and `COMPACT_RATIO = 0.75`. After the task runs, four consecutive turns' per-turn usage (`input_tokens + output_tokens` sum) is: 1200, 1500, 900, 1100. Answer:

1. After which turn will compaction be triggered? What is the accumulated `tokensUsed` at the moment of trigger?
2. After compaction triggers and completes, what should `tokensUsed` be?
3. If the next model call immediately after compaction returns `usage = { input_tokens: 300, output_tokens: 100 }`, what does `tokensUsed` become?

<!-- rubric -->
- Correctly calculate threshold as `6000 * 0.75 = 4500`, and correctly accumulate four-turn usage: 1200, 2700, 3600, 4700, pointing out that after turn 4 the accumulated value 4700 first reaches/exceeds the threshold, so compaction triggers at that point
- Clearly state that after compaction completes `tokensUsed` should reset to 0, because the new window's usage should count from this summary onward, not carry over the old window's accumulated value
- Correctly calculate the first call after reset as `tokensUsed = 0 + 300 + 100 = 400`

<!-- answer -->
1. Accumulate turn by turn: after turn 1: 1200, after turn 2: 2700, after turn 3: 3600, after turn 4: 4700. Threshold is `6000 * 0.75 = 4500`, and 4700 is the first accumulated value among the four that reaches/exceeds the threshold, so compaction triggers **after turn 4**, with accumulated `tokensUsed` at **4700**.
2. Compaction replaces `messages` wholesale with the restart message `compact()` returns; the new window starts fresh from this summary (plus `NOTES.md`), so `tokensUsed` should reset to **0** — it shouldn't keep carrying the old window's 4700, otherwise the next turn's check will always mistakenly think "the window is already very full."
3. The first call after reset returns `usage = { input_tokens: 300, output_tokens: 100 }`, so `tokensUsed = 0 + 300 + 100 = 400`.

<!-- hint -->
Accumulate the four turns' usage honestly into a prefix-sum sequence, then compare each one against the threshold `6000 * 0.75` to find the first position that crosses the line.

<!-- hint -->
Compaction "restart" means not just swapping the message array; the usage counter should also get a new starting point — think about what it's actually counting: "historical total usage" or "current window's usage."

### Level 2: Diagnose a "Compaction Storm"

Someone wired threshold-triggered compaction into the loop, but forgot one line:

```javascript
while (response.stop_reason === "tool_use") {
  messages = await appendToolResults(messages, response, toolImpls);

  if (shouldCompact(tokensUsed)) {
    messages = await compact(client, messages);
    // missing tokensUsed = 0
  }

  response = await client.messages.create({ model: MODEL, max_tokens: 1024, tools, messages });
  tokensUsed = trackUsage(tokensUsed, response);
}
```

After wiring it in, the task ran until some turn when compaction first triggered; but from then on, every turn triggers compaction again, even though the new window only went through one or two turns and accumulated very little content. Explain why this happens and provide the fix.

<!-- rubric -->
- Point out the root cause: `tokensUsed` is an ever-increasing accumulator; at the first compaction trigger it already reached or exceeded the threshold; without resetting, every subsequent `trackUsage` just keeps adding on top, so `shouldCompact(tokensUsed)` is true from the first trigger onward
- Explain the consequence: every turn triggers another `compact()` (wasting a model call), while the new window's actual usage is nowhere near the threshold; compaction becomes more frequent than it should be, wasting calls and potentially slowing the task
- Fix: add one line `tokensUsed = 0` after `compact()` succeeds, so the counter's semantics stay as "current window's usage" rather than "historical total usage"

<!-- answer -->
The root cause is that `shouldCompact` checks `tokensUsed`, an ever-increasing accumulator. At the moment the first compaction triggers, `tokensUsed` already reached or exceeded the threshold; `compact()` swaps `messages` for a clean new window, but the code forgot to bring `tokensUsed` back to a starting point matching the new window. So the next `trackUsage(tokensUsed, response)` only adds more to this already-over-threshold number — no matter how many tokens the new window's turn actually added, `shouldCompact(tokensUsed)` is permanently true from the first trigger onward. The result is: even when the new window only went through one or two turns with very little content, the next loop-head check still hits, so it calls `compact()` again, and again. Every redundant compaction is an extra model call; the task should be progressing, but instead it's looping in place, "summarize, restart, summarize again."

The fix is just adding back the reset line:

```javascript
if (shouldCompact(tokensUsed)) {
  messages = await compact(client, messages);
  tokensUsed = 0; // new window, count from zero
}
```

Once added, `tokensUsed`'s semantics become "how much has the current window used," and compaction only triggers again when the new window itself also accumulates threshold usage, not dragged along by the old window's historical number.

<!-- hint -->
`shouldCompact` just compares `tokensUsed` against a fixed threshold. At the moment compaction triggers, is `tokensUsed` larger or smaller relative to the threshold? If it never gets reduced afterward, what will every subsequent comparison result be?

<!-- hint -->
Refer to Level 1: after compaction completes, what should `tokensUsed` represent? Is it "total usage from task start to now" or "current window's usage"? This bug is exactly mixing those two semantics.

<!-- /exercises -->

## Recap

- Wiring usage tracking onto the harness just needs an accumulator: each time you get a response, add `response.usage.input_tokens + response.usage.output_tokens`; it shares the same data with course 7's `TOKEN_BUDGET` valve, but the action after trigger differs — the budget valve stops when topped out; this lesson's threshold compacts and keeps working.
- Threshold-triggered compaction wires Lesson 4's `compact()` into the loop body: check sits at "this round's tool results fully appended, before next request goes out"; after trigger `messages` is replaced wholesale with the compaction result — it's a restart, not an append[^S1]; `tokensUsed` must reset in sync, otherwise you fall into a storm of repeated compactions.
- Notes and compaction wire together in this lesson: `update_notes` tool writes as you go — that's persisting notes outside the context window[^S1] — and `compact()` reads `NOTES.md` back into the restart message in addition to generating the summary; summary may lose content due to triage, notes are read back as a lossless copy. "Read once only at critical moments like window restart, don't cram into every turn's system prompt" is this lesson's engineering tradeoff based on the attention budget principle (every new token depletes that budget[^S1]).
- One real end-to-end verification shows: three tool calls push usage from 400 to 1850, cross the threshold to trigger one compaction, counter resets, then two more rounds to wrap up — the task's total length is no longer bounded by single-window capacity, only bounded by "one continuous uninterrupted inference."
- Don't treat this machinery as default configuration: only add it when extra complexity can demonstrably improve outcomes[^S2]; for tasks that finish in a few turns, the bare loop plus basic control valves from course 7 of this series is enough.
