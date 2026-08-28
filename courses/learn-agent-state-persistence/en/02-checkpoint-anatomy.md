# Lesson 2: Checkpoints: Writing the Execution Scene to Disk

> Learning goals:
> - Name the six fields that belong in checkpoint.json, and for each one say what resume runs into when it's missing
> - Tell apart the two save points inside a single loop turn (after the model names a tool, after the tool result is recorded) and explain what writing only one of them sets you up for
> - Write a `saveCheckpoint` that can't corrupt the checkpoint file itself — write a temp file, then rename atomically, instead of overwriting in place
>
> Prerequisites: You've read Lesson 1 and can tell memory from execution state; you're comfortable with the `messages` array and the `stop_reason`-driven loop skeleton from "Agent Harness Fundamentals: Loops and Control" | Prev: [Lesson 1 <<](./01-memory-vs-state.md) | Next: [Lesson 3 >>](./03-resume-from-checkpoint.md)

## The execution scene lives in memory by default

Lesson 1 pulled memory and execution state apart: memory is what you feed the model, execution state is the running scene the harness itself is holding — the `messages` array, the turn counter, the tool call whose result hasn't been recorded yet. By default that scene exists only in the process's memory. When the process dies it goes with it, and even with every other file on disk intact, the task can only start over from zero.

Writing that scene to disk — turning it into something a restarted process can read back — is what a **checkpoint** is. What actually holds up long-task reliability in practice usually isn't asking the model to absorb every failure on its own; it's pairing "the adaptability of AI agents built on Claude with deterministic safeguards like retry logic and regular checkpoints"[^S1]. This lesson covers the checkpoint half: what belongs in one, where in the loop to write it, and how to perform the write itself — because a checkpoint written wrong can leave you worse off than no checkpoint at all.

## What to save: the six fields in checkpoint.json

A checkpoint isn't "dump everything in memory to a file." It's "record what resuming the loop needs — no more, no less." Every later lesson in this course runs off the same protocol:

```javascript
const checkpoint = {
  version: 1,
  task: "Sort last quarter's support tickets by issue type and roll them into one table",
  turns: 3,
  tokensUsed: 14208,
  messages: [/* the full conversation history */],
  pendingToolUse: null, // or { id, name, input }
};
```

- **version**: the protocol version number. This format will change eventually (compression for `messages`, a new shape for `pendingToolUse`), and `version` lets the resume path ask "do I recognize this checkpoint?" before anything else — on a version it doesn't know, it should refuse to load and fail loudly rather than grit its teeth and parse ahead.
- **task**: the original user task, in words. After a restart the harness code doesn't remember what it was doing; all it can read is this file on disk. Without `task`, the harness can't even say which task the checkpoint belongs to, never mind report resume progress back to the user.
- **turns**: how many turns have already run. It's what decides whether to trip the stopping conditions from "Agent Harness Fundamentals: Loops and Control" (a maximum-turn cap, say), and it's the number resume keeps counting from instead of restarting at zero.
- **tokensUsed**: cumulative token spend. The compaction threshold from "Context Engineering: Spending Finite Attention Where It Counts" fires off this number. Leave it out of the checkpoint and resume either pretends the count starts at zero — putting every compaction decision out of step — or has to re-estimate usage for every message in `messages`, and in most setups the historical usage figures simply aren't available anymore.
- **messages**: the whole conversation scene, every user / assistant / tool_result message the model has seen. It's the largest thing in the checkpoint and the one thing you can't skip: the model has no memory of its own, and everything it knows about what happened earlier is this array you hand it on the next request. Drop it and what you resume isn't "carry on" — it's a brand-new task starting from zero while dragging along every side effect the old run already produced.
- **pendingToolUse**: either `null`, or a record shaped like `{ id, name, input }` — a tool the model has named whose result isn't recorded yet. What you do with this field is Lesson 3's business, where resume reconciles against it; here you only need to know it's the checkpoint's designated slot for marking a half-finished state. To keep its shape simple, every example in this lesson assumes one `tool_use` block per turn; when a turn issues several concurrent tool calls, make it an array — the reasoning is the same.

## When to save: two save points per turn

Feed those fields into the loop and the timing turns out not to be as simple as "write once at the end of every turn." There are two save points:

```javascript
while (response.stop_reason === "tool_use") {
  state.messages.push({ role: "assistant", content: response.content });

  const block = response.content.find((b) => b.type === "tool_use");

  // Save point A: the model has named a tool, it hasn't run yet
  state.pendingToolUse = { id: block.id, name: block.name, input: block.input };
  saveCheckpoint(state);

  const result = await executeTool(block.name, block.input);

  state.messages.push({
    role: "user",
    content: [{ type: "tool_result", tool_use_id: block.id, content: result }],
  });
  state.turns += 1;
  state.pendingToolUse = null;

  // Save point B: this turn's tool result is fully recorded in messages
  saveCheckpoint(state);

  response = await callModel({ tools, messages: state.messages });
  state.tokensUsed += response.usage?.output_tokens ?? 0;
}
```

**Point A** sits after the model response arrives and before the tool runs: record the response's `tool_use` block into `pendingToolUse`, then write. **Point B** sits after the tool result has been appended to `messages`: set `pendingToolUse` back to `null`, then write again.

Is B alone good enough? The exposure is the window between A and B — the model has named a tool and the tool is running, or has finished but its result hasn't made it into `messages` and hasn't been written to disk. If the process dies in that window, the last checkpoint on disk is still the one B wrote on the previous turn, and it knows nothing about this turn's call: it isn't that some detail got lost, it's that this tool call left no trace on disk whatsoever. Lesson 3 reconciles on resume — did that tool really finish, does it need re-running — and what it reconciles against is precisely the `pendingToolUse` that A wrote. This lesson just digs the hole; the exercises in lesson 6 put a B-only checkpoint in front of you and have you diagnose what goes wrong on resume.

## How to save: you can't overwrite in place

The obvious approach is to `JSON.stringify` the `state` object and `fs.writeFileSync` it straight over the old `checkpoint.json`. That's fine when the process exits normally — but "exits normally" is exactly the case checkpoints aren't for. Checkpoints exist for the process getting killed at any moment, for power loss, for the container being evicted. Writing a file isn't an atomic operation. If the process is interrupted mid-write, the `checkpoint.json` left on disk may be half-written: not the old version, not the new one, just truncated JSON. The next resume throws on `JSON.parse`, and that file was the task's only copy of the scene — there's no older version to fall back on.

The move is "write a temp file, then rename atomically." Write the complete contents into `checkpoint.json.tmp`; if you crash halfway through that step, the only casualty is the temp file, and the real `checkpoint.json` is still the intact older version from before the crash, which resume reads fine. Once the `.tmp` file is complete, `fs.renameSync` it onto the real filename. On the same filesystem, `rename` is a one-step atomic replace: the OS either points the directory entry at the new file in full or leaves it pointing at the old one. There is no half-renamed state in between.

```javascript
import fs from "node:fs";
import path from "node:path";

function saveCheckpoint(state, dir = "./checkpoints") {
  fs.mkdirSync(dir, { recursive: true });

  const finalPath = path.join(dir, "checkpoint.json");
  const tmpPath = `${finalPath}.tmp`;

  fs.writeFileSync(tmpPath, JSON.stringify(state, null, 2));
  fs.renameSync(tmpPath, finalPath); // on one filesystem, rename is an atomic replace
}
```

```agentmentor-check
{
  "id": "sp-zh-02-direct-overwrite-risk",
  "label": "Judging what goes wrong when you overwrite the checkpoint file in place",
  "prompt": "You're about to write saveCheckpoint like this: JSON.stringify the state object, then fs.writeFileSync it straight over the same checkpoint.json. What's the problem with that?",
  "whyHere": "This lands right after the write-a-.tmp-then-rename recipe, to check whether you actually understand why overwriting in place is unsafe rather than just memorizing the conclusion that you should use tmp plus rename.",
  "mode": "single",
  "choices": [
    {
      "id": "a",
      "text": "No problem — checkpoint.json is only ever supposed to hold the latest snapshot, so overwriting it in place is just swapping the old contents for the new, with no extra file and no extra step needed",
      "correct": false,
      "feedback": "Whether the file should keep only the latest snapshot and how you get the new contents into it are two separate questions. A checkpoint really does only need one current copy — but the overwrite itself isn't atomic. A crash can interrupt the write, and at that instant what sits on disk is neither a complete old version nor a complete new one; it's a partially written file."
    },
    {
      "id": "b",
      "text": "There is a problem: if the process gets killed mid-write, checkpoint.json can be left half-written — truncated content that JSON.parse can't read — and it's the task's only copy of the scene, with nowhere else to recover from",
      "correct": true,
      "feedback": "Right. Writing a file isn't a single atomic step, the process can be killed at any moment, and an interrupted write turns the only copy of the scene into half a JSON document. Write the temp file first, and only once it's complete rename it onto the real filename — then the checkpoint.json on disk is, at every instant, either the complete old version or the complete new one, never something in between."
    },
    {
      "id": "c",
      "text": "There is a problem, but the problem is disk usage: writing over the same file again and again makes checkpoint.json grow with every save, so a long task ends up eating far more space than it should",
      "correct": false,
      "feedback": "Overwriting doesn't grow the file — each write replaces the old contents, so the size tracks roughly how much is in the current state, not how many times you've saved. The real risk isn't disk space; it's that the write itself can be cut short by a crash, leaving a file that is neither complete nor parseable."
    }
  ]
}
```

## Product reference: what a checkpoint looks like in Claude Code

The protocol this lesson teaches is for unattended long tasks, at a granularity of two save points per loop turn. For contrast, look at where a real product — Claude Code — puts the word "checkpoint": "checkpointing automatically captures the state of your code before each user prompt."[^S2] "Every user prompt creates a new checkpoint"[^S2], and "Claude Code saves checkpoints with the conversation, so you can still run /rewind after you resume a session"[^S2].

The scenario it serves isn't this one. Claude Code's checkpoints are built for a human-in-the-loop session — the user may stop things at any moment, try an approach, decide to go back to before some message and take another run at it — so the natural unit is "the user said something." What you're building here is for unattended long tasks: nobody is standing by to call a halt, the unit is "the loop went around once," and within a single turn it splits again into save points A and B, because a crash can land between "the model named a tool" and "the result got recorded." The two aren't solving the same problem. Putting them side by side is mostly to make one thing clear: how fine to cut a checkpoint, and how often to write one, depends on what the checkpoint is serving. There isn't only one answer.

## Checkpoints aren't free

Checkpoints cost something. Under this lesson's protocol, one loop turn writes to disk twice. For a short task that finishes in three or five turns, that's pure overhead — the process runs to completion and those checkpoint files never get read. Whether to put this machinery into your own harness is worth measuring against the rule that "you should consider adding complexity only when it demonstrably improves outcomes."[^S3] The longer the task and the higher the cost of a crash, the better that trade gets; for something that finishes in a few seconds, you probably won't need it.

## 💻 Exercises

<!-- exercises -->

### Level 1: Fill in an incomplete checkpoint

Someone wrote `saveCheckpoint` like this:

```javascript
function saveCheckpoint(state) {
  fs.writeFileSync("checkpoint.json", JSON.stringify({ messages: state.messages }));
}
```

Against the protocol this lesson set out, which fields is this checkpoint still missing? For each missing field, say specifically: if you tried to resume from this incomplete checkpoint, where exactly would it fall over?

<!-- rubric -->
- Lists all five missing fields: `version`, `task`, `turns`, `tokensUsed`, `pendingToolUse`
- On `version`: explains that the resume path has no way to judge the file's protocol version, and no way to decide whether to refuse loading once the format changes
- On `task`: explains that the harness doesn't know which original task this scene belongs to, and can't report to the user which task is being resumed
- On `turns`: explains that the turn count restarts at zero after resume, no longer matching the turns actually run, which can make a maximum-turn stopping condition either fire early or never fire at all
- On `tokensUsed`: explains that the compaction threshold has no accurate running total to work from, so resume either misjudges that it hasn't hit the threshold yet, or has to re-estimate usage (and re-estimating usually can't get at the historical usage figures)
- On `pendingToolUse`: explains that if the crash landed in the window where the model had named a tool but execution hadn't finished, resume has no idea a tool call is left dangling, and can't do the reconciliation Lesson 3 covers

<!-- answer -->
This checkpoint kept only `messages` and is missing the other five fields:

1. **`version`**: without it, the resume path can't confirm whether it recognizes the file's format. Once the protocol changes (a field getting a new shape, say), the resume code has nothing to judge "is this a checkpoint version I can handle?" against. It can only grit its teeth and parse, and when that fails it can't say what didn't line up.
2. **`task`**: without it, all the restarted harness reads is a pile of `messages`, with no way to state what those messages were strung together to accomplish. It can't report progress to the user on resume, and in a multi-task setup it can't confirm which task it just picked up.
3. **`turns`**: without it, resume can only start counting from zero. If you set a stopping condition like "stop after N turns," the post-resume count no longer matches the turns that actually happened, so the condition either fires early or stops meaning anything.
4. **`tokensUsed`**: without it, the compaction threshold has no running total to consult. Resume either pretends the count starts at zero — putting the whole "should this turn compact?" decision out of step — or tries to re-estimate usage across the historical messages in `messages`, and in most setups those historical `usage` numbers can't be recovered.
5. **`pendingToolUse`**: without it, if the last crash landed in the window where the model had already named a tool but execution hadn't finished or the result hadn't been recorded, this checkpoint holds no record of it. Resume can't tell whether a tool call was really left hanging, and can't do the "does this call need re-running?" reconciliation Lesson 3 covers. It can only act as though nothing happened.

<!-- hint -->
Go back to the "what to save" section and walk the six fields in the checkpoint object one at a time, checking which ones don't appear in this stripped-down version.

<!-- hint -->
Don't stop at "X is missing" — push one step further: if the harness code really did rebuild `state` from this file and re-enter the loop, what's the first thing it would hit?

<!-- rubric -->

### Level 2: Two latent failures, fixed

A colleague wrote the `runAgent` below to run a task that calls tools twice in a row. It looks fine day to day, but the moment the process gets killed mid-run, the scene you recover either won't open or won't line up. Find the two spots that give way under a crash, say what each one leads to, and fix them — the fixed code has to actually run.

```javascript
import fs from "node:fs";

function saveCheckpoint(state) {
  fs.writeFileSync("checkpoint.json", JSON.stringify(state, null, 2));
}

async function runAgent(task, tools, callModel, executeTool) {
  const state = {
    version: 1,
    task,
    turns: 0,
    tokensUsed: 0,
    messages: [{ role: "user", content: task }],
    pendingToolUse: null,
  };

  let response = await callModel({ tools, messages: state.messages });

  while (response.stop_reason === "tool_use") {
    state.messages.push({ role: "assistant", content: response.content });

    const block = response.content.find((b) => b.type === "tool_use");
    const result = await executeTool(block.name, block.input);

    state.messages.push({
      role: "user",
      content: [{ type: "tool_result", tool_use_id: block.id, content: result }],
    });
    state.turns += 1;

    saveCheckpoint(state);
    response = await callModel({ tools, messages: state.messages });
  }

  return state;
}
```

<!-- rubric -->
- Identifies the first failure: `saveCheckpoint` overwrites the same file with a bare `fs.writeFileSync`, so an interrupted write leaves half a JSON document that can't be parsed, with no older version to fall back on
- Identifies the second failure: the whole loop writes only after the tool result is recorded (point B), with no save between the model naming a tool and the tool finishing (point A), so a crash in that window leaves the tool call with no trace on disk
- Fix one: rewrite `saveCheckpoint` to write a `.tmp` file first, then `fs.renameSync` it into place atomically
- Fix two: after reading out `block` and before calling `executeTool`, add the `pendingToolUse` assignment plus a `saveCheckpoint` (point A), and set `pendingToolUse` back to `null` at point B
- The fixed code is structurally complete and runnable (even if only against the example's fake `callModel` / `executeTool`)

<!-- answer -->
Two failures:

1. **Overwriting in place isn't safe.** `saveCheckpoint` writes straight over the old `checkpoint.json` with `fs.writeFileSync`. The process can be killed at any moment, and if the write gets interrupted, what's left on disk is neither a complete old version nor a complete new one — it's truncated content that `JSON.parse` can't read. And that file is the only copy of the scene; there's nowhere else to recover from.
2. **It saves at B only, never at A.** The loop calls `saveCheckpoint` once, after the tool result has been appended to `messages`. If the crash lands between "the model named a tool" and "the result got recorded" — while the tool is running, or after it finished but before the result made it into `messages` — the last checkpoint on disk is still last turn's old state, with no knowledge of this tool call at all.

The fix — atomic write plus a save at A:

```javascript
import fs from "node:fs";
import path from "node:path";

function saveCheckpoint(state, dir = "./checkpoints") {
  fs.mkdirSync(dir, { recursive: true });
  const finalPath = path.join(dir, "checkpoint.json");
  const tmpPath = `${finalPath}.tmp`;
  fs.writeFileSync(tmpPath, JSON.stringify(state, null, 2));
  fs.renameSync(tmpPath, finalPath); // on one filesystem, rename is an atomic replace
}

async function runAgent(task, tools, callModel, executeTool, dir) {
  const state = {
    version: 1,
    task,
    turns: 0,
    tokensUsed: 0,
    messages: [{ role: "user", content: task }],
    pendingToolUse: null,
  };

  let response = await callModel({ tools, messages: state.messages });

  while (response.stop_reason === "tool_use") {
    state.messages.push({ role: "assistant", content: response.content });

    const block = response.content.find((b) => b.type === "tool_use");

    // Save point A: the model has named a tool, it hasn't run yet
    state.pendingToolUse = { id: block.id, name: block.name, input: block.input };
    saveCheckpoint(state, dir);

    const result = await executeTool(block.name, block.input);

    state.messages.push({
      role: "user",
      content: [{ type: "tool_result", tool_use_id: block.id, content: result }],
    });
    state.turns += 1;
    state.pendingToolUse = null;

    // Save point B: this turn's tool result is fully recorded in messages
    saveCheckpoint(state, dir);

    response = await callModel({ tools, messages: state.messages });
  }

  return state;
}
```

A pair of fakes that never touch a real model is enough to verify it: a `fakeCallModel` that asks for a tool call twice in a row and only returns `end_turn` on the third call, paired with a `fakeExecuteTool` that returns a fixed string. Run it and you'll see `checkpoint.json` on disk written 4 times (2 turns × save points A and B), ending with `pendingToolUse` at `null` and `turns` at `2` — exactly matching the final in-memory state.

<!-- hint -->
Start with `saveCheckpoint` alone. Compare it against the version in this lesson's "how to save" section and see which step is missing.

<!-- hint -->
Then count how many times `saveCheckpoint(state)` appears in the loop body, and on which lines. Ask yourself: between the model naming a tool (reading out `block`) and the tool actually finishing (`await executeTool` returning), does anything get written to disk?

<!-- /exercises -->

## Recap

- The execution scene lives in memory by default and dies with the process. What checkpoints are for is sparing a long task from re-running from scratch after every crash, so it can pick up where it broke instead[^S1]
- checkpoint.json holds six fields: `version`, `task`, `turns`, `tokensUsed`, `messages`, `pendingToolUse`. `messages` is the biggest piece, and without it the model has nothing to go on about what happened earlier; `pendingToolUse` is the dangling-call marker Lesson 3 reconciles against
- One loop turn has two save points: A after the model names a tool and before the tool runs, B after the tool result is fully recorded in `messages`. Saving at B only leaves a blind spot across the window where the model has named a tool that hasn't finished
- Overwriting the checkpoint file in place isn't safe. The process can be killed at any moment, and a crash mid-write turns the only copy of the scene into half a JSON document. Write a `.tmp` file first and rename it into place with `fs.renameSync` — that's what guarantees whatever is on disk at any instant is one complete version
- Claude Code's checkpoints work at a different granularity — captured automatically before each user prompt[^S2], serving a human-in-the-loop session. What this lesson builds is for unattended long tasks. The cut points differ, but both answer the same question: when something goes wrong, where do you go back to?
- Checkpoints aren't free. Two disk writes per turn is pure overhead on a short task, and whether it's worth adding comes down to whether it demonstrably improves the outcome, not to assuming more is better[^S3]

[>> Lesson 3: Resuming from a Checkpoint: Restarting the Loop](./03-resume-from-checkpoint.md)
