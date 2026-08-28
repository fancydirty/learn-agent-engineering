# Lesson 6: Hands-On: Wiring Checkpointing and Resume onto the Harness

> Learning goals:
> - Actually weld the "save the dangling call at Point A, clear it at Point B" checkpoint scheme into the `runAgent` loop from Course 7 in this series, instead of leaving it as a concept diagram
> - Attach a side-effects ledger to `runToolUses`: the moment a tool succeeds, write one record to disk so resume can tell whether "this tool actually ran or not"
> - Write the three-way split in `reconcile`, and use a controlled "simulated kill + `--resume`" run to watch, with your own eyes, that recovery behaves the way it should
>
> Prerequisites: You've read Lessons 1-5 and can run the harness loop from Course 7 in this series, "Agent Harness Fundamentals: Loops and Control" | Prev: [Lesson 5 <<](./05-rewind-and-fork.md)

## See It Run First

The first five lessons pulled checkpoints, resume, idempotency, and rewind/fork apart and explained each one. This lesson welds them into a harness that actually runs: the same familiar loop — call the model with `messages`, and when `stop_reason === "tool_use"` execute the tool and call again — except this time every turn writes two checkpoints to disk, plus a ledger recording tool-execution results. The task is "turn sales notes into a report," calling three tools in sequence: `read_notes`, `count_words`, `write_report`. Here's what it looks like running normally up to turn three and then getting killed outright:

```text
$ CRASH_AFTER=after-effect-write:3 node agent.js

[turn 1][save A] pending=read_notes
[turn 1][save B]
[turn 2][save A] pending=count_words
[turn 2][save B]
[turn 3][save A] pending=write_report
[kill] simulated kill at after-effect-write:3
EXIT=137
```

Turns 1 and 2 both walked the full `save A` → execute → `save B` three-step, all normal. Turn 3 saved `save A` (recording that the dangling call is `write_report`), the tool did in fact finish executing, and its result was already written into the ledger — but the next step's `save B` never got saved before the process was killed. This is exactly the window this lesson is out to nail: at this moment `checkpoint.json` still holds a dangling `pendingToolUse`. Carrying that scene, pick it back up with `--resume`:

```text
$ node agent.js --resume

[resume] read turn=3 pending=write_report
[resume][reconcile] tool_use_id=toolu_03 name=write_report ledger hit, reusing result, not re-running
[turn 3][save B] filled in this turn's tool result after resume
[done] Report written to report.txt, task complete.
```

The resume flow reads `turn=3 pending=write_report`, checks the ledger — and finds this call had actually finished and been recorded before the kill, so it reuses that record directly and **does not re-execute `write_report`**, fills in the `save B` this turn was missing, and carries on to the model's wrap-up as usual. The whole task never started over from scratch, and the report never got written twice.

These two terminal outputs aren't hand-written examples. They're the real output of the Node script driven by a fixed response queue in the "Verification Harness" section below, copied here line for line.

## Building It Block by Block

### Reading and Writing Checkpoints: `saveCheckpoint` / `loadCheckpoint`

A checkpoint is just this scene — `{version, task, turns, tokensUsed, messages, pendingToolUse}` — serialized to disk. The only thing to be careful about is not corrupting the file: write to a temp file first, then swap it in atomically with `fs.renameSync` — `rename` is an indivisible operation within the same filesystem, so there's never a "half-written" intermediate state:

```javascript
function saveCheckpoint(cp) {
  const tmp = CHECKPOINT_PATH + ".tmp";
  fs.writeFileSync(tmp, JSON.stringify(cp, null, 2));
  fs.renameSync(tmp, CHECKPOINT_PATH);
}
```

Reading has to hold up against two things: the file not existing (never run before, or meant to start fresh), and the file failing to parse. The second case deserves extra care — a `JSON.parse` failure usually means the previous write itself was interrupted (`saveCheckpoint` is atomic in theory, but if the process is killed before even the `.tmp` file is fully written, or the disk itself has a problem, a half-finished file from before the `rename` might get misread). At that point you must never quietly reset the state to empty and pretend nothing happened — that's the real place tasks get lost. The right move is to throw the error out plainly, telling the user this checkpoint is no longer trustworthy and should be deleted so they can start over, rather than letting the program guess its way back to a whole state:

```javascript
function loadCheckpoint() {
  let raw;
  try {
    raw = fs.readFileSync(CHECKPOINT_PATH, "utf8");
  } catch {
    throw new Error(`Can't find ${CHECKPOINT_PATH}; nothing to --resume from`);
  }
  let cp;
  try {
    cp = JSON.parse(raw);
  } catch {
    throw new Error(
      `Failed to parse ${CHECKPOINT_PATH}; the file may have been interrupted mid-write. Delete it and start over without --resume instead of continuing to use it — a half-written checkpoint can't be guessed back into shape.`,
    );
  }
  if (cp.version !== 1) {
    throw new Error(`${CHECKPOINT_PATH} has version=${cp.version}; this program only accepts version=1 and refuses to load it.`);
  }
  return cp;
}
```

Check the `version` field while you're at it: if the checkpoint structure changes later, an old file shouldn't be force-parsed as the new format — better to refuse to load than to read out a state that's half right and half wrong. Both functions were tested with real truncated JSON: feed in a half-written `{"version":1,"turns":3,"pendingT` and `loadCheckpoint` throws exactly the "delete it and start over" error above, never returning any plausible-looking default.

### Point A and Point B: Wiring Them into the `runAgent` Loop

The loop skeleton from Course 7 in this series hasn't changed — `while (response.stop_reason === "tool_use")`, `push assistant` → execute tool → `push tool_result` → request the model again. This lesson inserts two checkpoints into the loop body, and where they go is the whole point of the lesson:

```javascript
while (response.stop_reason === "tool_use") {
  if (turns >= MAX_TURNS) return `Reached the max of ${MAX_TURNS} turns, stopping on our own`;
  turns++;

  const toolUseBlock = response.content.find((b) => b.type === "tool_use");
  // —— Point A: right after we get the model response, record this turn's dangling tool call ——
  saveCheckpoint({
    version: 1, task, turns, tokensUsed, messages,
    pendingToolUse: { id: toolUseBlock.id, name: toolUseBlock.name, input: toolUseBlock.input },
  });

  messages.push({ role: "assistant", content: response.content });
  const toolResults = await runToolUses(response.content);
  messages.push({ role: "user", content: toolResults });

  // —— Point B: tool results are in messages (the ledger is on disk too), dangling call cleared ——
  saveCheckpoint({ version: 1, task, turns, tokensUsed, messages, pendingToolUse: null });

  response = await client.messages.create({ tools, messages });
  tokensUsed += response.usage.input_tokens + response.usage.output_tokens;
}
```

Point A goes in after `response` arrives and before `messages.push({ role: "assistant", ... })` — the moment the model has "named a tool but not actually executed it," and `pendingToolUse` records that naming verbatim. Point B goes in after `runToolUses` finishes and the `tool_result` has been pushed into `messages` — at that point this turn is fully closed out, and `pendingToolUse` is cleared to `null`. Sandwiched between the two saves is exactly the stretch of code where the tool really executes; if the process happens to die during that stretch or right after it, what's left on disk is the "Point A saved, Point B not saved" scene — `pendingToolUse` non-empty, which is precisely the signal the recovery logic is built to handle.

To make this single-dangling-call protocol (`pendingToolUse` is one object, not an array) hold together, this lesson designs the task so the model names exactly one tool per turn — a deliberate simplification whose boundary the "Proportion" section spells out.

### The Effects Ledger: Wiring It into `runToolUses`

The problem the ledger solves is: if a crash lands right between "the tool actually finished executing" and "the result landed in messages," how does resume know whether this call already ran and must not run again. The approach is, the moment a tool succeeds, write its result separately into a ledger keyed by `tool_use_id` (again with the temp-file-plus-`rename` atomic write):

```javascript
function saveEffect(toolUseId, entry) {
  const effects = loadEffects();
  effects[toolUseId] = entry;
  const tmp = EFFECTS_PATH + ".tmp";
  fs.writeFileSync(tmp, JSON.stringify(effects, null, 2));
  fs.renameSync(tmp, EFFECTS_PATH);
}

async function runToolUses(content) {
  const toolUseBlocks = content.filter((b) => b.type === "tool_use");
  const results = [];
  for (const block of toolUseBlocks) {
    let output;
    try {
      output = await toolImpls[block.name](block.input);
    } catch (err) {
      results.push({
        type: "tool_result", tool_use_id: block.id,
        content: `Tool execution error: ${err.message}`, is_error: true,
      });
      continue;
    }
    // The side effect already happened: even if the ledger write fails, we must not lie
    // with is_error (that would make the model retry with a fresh tool_use_id and cause a
    // duplicate side effect) — just alert separately for a human to handle
    try {
      saveEffect(block.id, { name: block.name, result: output, at: Date.now() });
    } catch (err) {
      console.error(`[ledger write failed] tool_use_id=${block.id}: the side effect already happened, duplicate-execution risk on resume, please check by hand`);
    }
    results.push({ type: "tool_result", tool_use_id: block.id, content: output });
  }
  return results;
}
```

The order can't be swapped: **you have to get the real result of `toolImpls[block.name](block.input)` first, and only then can `saveEffect` write it down** — execute first, record after. The ledger records "this thing really happened, and this was its result." If you flipped it and recorded before executing, all that could land in the ledger would be a placeholder, and the ledger would lose the whole meaning of its "already done" promise (the Level 2 exercise has you reproduce this anti-pattern with your own hands).

In a normal single execution, `runToolUses` walks the "execute → record" two-step, because each `tool_use_id` shows up for the first time with nothing to look up. The one dangling call that resume has to handle walks the fuller "check the ledger → execute (if needed) → record (if executed)" three-step — `reconcile` below is that three-step's implementation, and both follow the same discipline: never write "already done" into the ledger before you have a real result.

### `reconcile`: The Three-Way Split for a Dangling Call After a Crash

What resume has to handle is that one (if any) `pendingToolUse` in the checkpoint. It corresponds to three possibilities:

```javascript
async function reconcile(cp) {
  const pending = cp.pendingToolUse;
  if (!pending) return null; // no dangling call, just keep going

  const effects = loadEffects();
  const hit = effects[pending.id];

  if (hit) {
    console.log(`[resume][reconcile] tool_use_id=${pending.id} name=${pending.name} ledger hit, reusing result, not re-running`);
    return { type: "tool_result", tool_use_id: pending.id, content: hit.result };
  }

  if (READ_ONLY.has(pending.name)) {
    console.log(`[resume][reconcile] tool_use_id=${pending.id} name=${pending.name} ledger miss, read-only tool, re-running`);
    const output = await toolImpls[pending.name](pending.input);
    saveEffect(pending.id, { name: pending.name, result: output, at: Date.now() });
    return { type: "tool_result", tool_use_id: pending.id, content: output };
  }

  console.log(`[resume][reconcile] tool_use_id=${pending.id} name=${pending.name} ledger miss with side effects, unresolvable, appending is_error`);
  return {
    type: "tool_result", tool_use_id: pending.id, is_error: true,
    content: `This ${pending.name} call's execution state before resume is unknown: there's no ledger entry, and to avoid a duplicate side effect it was not re-run. Please verify for yourself whether it completed.`,
  };
}
```

Three branches, for three scenarios that were all really tested:

- **Ledger hit** — this is the crash demo from the top of the lesson: `write_report` had in fact finished executing and been recorded, only `save B` didn't make it. On resume, reuse the result in the ledger directly, don't re-execute, avoid writing the report twice.
- **Ledger miss + read-only tool** — something like `read_notes`, a tool with no side effects; crashing before the record lands doesn't matter, so just re-run it once to get the result and record this run into the ledger while you're at it:
  ```text
  [resume][reconcile] tool_use_id=toolu_ro name=read_notes ledger miss, read-only tool, re-running
  ```
- **Ledger miss + side effects** — something like `write_report`, a tool that changes outside state, crashing before the record lands: you don't know whether it actually ran (on a real filesystem, `write_report`'s side effect could well have already happened, just without getting recorded to the ledger). Here, rather than guess, use an `is_error: true` `tool_result` to honestly tell the model "this call's state is unknown," handing the judgment back to it:
  ```text
  [resume][reconcile] tool_use_id=toolu_side name=write_report ledger miss with side effects, unresolvable, appending is_error
  ```

All three log lines are real output, not invented — `reconcile` itself doesn't need to know what the task is; give it a `pendingToolUse` and the matching ledger state and each of the three branches is independently testable.

```agentmentor-check
{
  "id": "sp-zh-06-a-point-necessity",
  "label": "Decide whether keeping only the Point B checkpoint is safe",
  "prompt": "A colleague looks at the two checkpoint positions in this lesson and proposes a simplification: 'Every turn ends with a full snapshot at Point B anyway, and Point B already stores every field Point A stores — so just drop Point A and save one checkpoint at the end of the loop, after the tool result is in messages and the ledger is written, saving one disk write.' Does this simplification hold up?",
  "whyHere": "The three-way split in reconcile was just covered, so right here a concrete 'drop Point A' proposal tests whether the reader actually understands what Point A records and why Point B on its own can't fill that hole.",
  "mode": "single",
  "choices": [
    {
      "id": "a",
      "text": "It doesn't hold up: if the crash lands between 'the model named a tool' and 'the result is recorded,' a checkpoint that lives only at Point B knows nothing about the call, so on resume there's no matching tool_result to produce and no ledger entry to check",
      "correct": true,
      "feedback": "Correct. The protocol requires every tool_use to come back paired with a tool_result. If the checkpoint only saves at Point B and the crash lands in the window between 'the model gave a tool call' and 'the result is committed,' there's nothing on disk saying 'this turn ever named a tool' — it's not that the ledger is missing an entry, it's that the checkpoint itself doesn't know the dangling call ever existed. reconcile has nothing to look up and no branch to take. Point A records the call the moment the response arrives, precisely so that whatever happens inside that window is on the record."
    },
    {
      "id": "b",
      "text": "It holds up: Point B already stores every field Point A does, so dropping Point A costs only one extra disk write with no loss of functionality, and you can safely remove it from the loop",
      "correct": false,
      "feedback": "Treating this as 'one fewer file write' misses that Point A and Point B don't store the same thing — Point A records 'the model just named this tool, and it's still pending,' Point B records 'this turn is done and behind us.' Dropping Point A loses not a redundant write but the ability to record the whole window while the tool is executing, and that window is exactly where the process is most likely to be killed."
    },
    {
      "id": "c",
      "text": "It doesn't hold up, but the reason is that Point B checkpoints aren't written often enough — you should save several extra Point B snapshots every so often while the tool runs, as a backstop",
      "correct": false,
      "feedback": "The problem isn't how often Point B is saved — Point B's content only ever reflects one state, 'this turn is complete.' No matter how many Point B snapshots you take, they all record the same 'after the fact' information and can never reconstruct the intermediate state of 'the tool is running and hasn't finished.' What's missing isn't frequency, it's a save point dedicated to recording the fact of 'just named, not yet finished' itself."
    }
  ]
}
```

### The Entry Point: `--resume` in `main()`

Last is the entry point. `main()` makes exactly one decision: does the command line have `--resume`. If it does, go through `loadCheckpoint()` to recover; if it doesn't, clear out the checkpoint and ledger files left over from last time and start fresh — this cleanup guarantees that "start over without `--resume`" is always a clean opening, never polluted by a half-finished scene from a previous run:

```javascript
async function main() {
  const resume = process.argv.includes("--resume");
  const task = "Turn sales-notes.txt into a short report and write it to report.txt.";
  const tools = [];

  const client = resume ? makeStubClient([R4]) : makeStubClient([R1, R2, R3]);

  try {
    const result = await runAgent(client, task, tools, { resume });
    console.log(`[done] ${result}`);
  } catch (err) {
    if (err instanceof SimulatedCrash) {
      console.log(`[kill] ${err.message}`);
      process.exit(137);
    }
    throw err;
  }
}
```

Inside `runAgent` there are two matching paths: when `opts.resume` is true it calls `loadCheckpoint()`, runs `reconcile`, pushes the reconciled result (if any) into `messages` and saves one Point B checkpoint, then sends the request to the model as usual; when it's false it `fs.rmSync`s the old checkpoint and ledger and starts from an empty `messages`. In the real `agent.js`, the model client is swapped for `@anthropic-ai/sdk`'s `client.messages.create({ model, max_tokens, tools, messages })`, and nothing else about the structure changes.

## Citing the Protocol

Neither of this lesson's two design decisions was set arbitrarily.

When the ledger is missing and `reconcile` can't be sure of the state, it chooses to append an `is_error: true` `tool_result` rather than silently skip — resting on the protocol's hard requirement about pairing content blocks: every `tool_use` must come back with a matching `tool_result`, all returned together, each claimed by its `tool_use_id`[^S4]. Skipping the Point A save would leave the resume flow unaware that the call ever happened, so it couldn't satisfy that pairing rule at all; the whole point of `reconcile` existing is to guarantee that, ledger hit or miss, the dangling call ends up with a paired `tool_result`.

Choosing "resume and keep going" over "error out and start over" echoes what Anthropic's engineering team described in the retrospective on its research system: when errors occur you can't just restart, because "restarts are expensive and frustrating for users," so instead they "built systems that can resume from where the agent was when the errors occurred"[^S1]. The same retrospective notes that an agent's adaptability can be paired with — rather than pitted against — deterministic safeguards, combining "the adaptability of AI agents built on Claude with deterministic safeguards like retry logic and regular checkpoints"[^S1]. Checkpoints catch the deterministic failure — "the process died" — while the model's adaptability handles the kind of case code can't hard-decide, like "the ledger is unresolvable." `reconcile`'s `is_error` branch is where the two meet: it tells the model the truth about the unknown state and lets it decide whether to verify or retry, and "letting the agent know when a tool is failing and letting it adapt works surprisingly well"[^S1].

## The Verification Harness

The two terminal demos in this lesson don't rely on actually killing a process to see what happens — that way the crash timing would be different every run, and you couldn't make a targeted assertion like "the crash happened after the Nth tool call, and the recovery behavior is correct." The approach is to swap the model client for a stub that plays cards in a fixed order: a response queue that, on each call to `messages.create`, hands out the next pre-written response in sequence, and throws outright if you keep calling after the queue is drained — so which tool the task calls on which turn, and when the model wraps up, are all hard-coded constants that don't shift because of one real call.

"Killing the process" is a `crashPoint(label)` controlled by an environment variable: every time `runToolUses` finishes a ledger write, it stitches "which write this is" into a string label, compares it against the `CRASH_AFTER` environment variable, and on a match throws a dedicated `SimulatedCrash` exception. This turns "crash after the Nth tool call" into an integer you can specify precisely, rather than a chance event at the mercy of timing. `main()` catches only this one exception at the outermost layer, prints a single `[kill]` log line, and exits with `137` (the conventional "killed by `SIGKILL`" exit code), so the demo reads like a real process kill instead of an ugly stack trace.

This "pin the content with a response queue, pin the crash count with a label" method is the same idea Lesson 6 of Course 8 in this series, "Context Engineering: Spending Finite Attention Where It Counts," used to verify context engineering: pin down the things that were otherwise nondeterministic (what the model says this time, where the process dies this time) into fixed quantities first, and only then can recovery behavior be asserted line by line instead of coming out different every run. That's how this lesson verified all three branches — "ledger hit, don't re-run," "ledger miss on a read-only tool, re-run directly," "ledger miss on a side-effecting tool, append `is_error`" — plus `loadCheckpoint`'s tolerance of a truncated file, each checked one by one with a real `node` run rather than reasoned about only on paper.

## Proportion: Not Every Task Needs This

The machinery welded on in this lesson — two checkpoints, one ledger, a three-way `reconcile` — is meant for long tasks that run many turns in a row and have side effects in between. A small task that finishes in a few seconds and can just be re-run on failure may not be worth carrying this whole apparatus of disk I/O and state machine; here you can borrow the same proportion Course 7 in this series, "Agent Harness Fundamentals: Loops and Control," cited: what's worth considering is that "you should consider adding complexity only when it demonstrably improves outcomes"[^S3]. This isn't a hard "you must do it this way" rule, more a question to ask yourself before you start: is this task really long enough, really important enough, to be worth maintaining a checkpoint for?

This lesson's implementation also draws two explicit boundaries, worth saying out loud so you don't treat it as "learn it and drop it straight into production":

- Each turn handles exactly one dangling `pendingToolUse`, matching the demo task where the model names one tool per turn. In a real setting a single model response could well carry several concurrent `tool_use` blocks (the `runToolUses` from Course 7 in this series runs them concurrently with `Promise.all`); extending this lesson's single-dangling-call protocol into a set of dangling calls means turning `pendingToolUse` from an object into an array and running `reconcile` over each one. This lesson deliberately left that layer of complexity out, to get the reconciliation logic for a single dangling call across clearly first.
- The checkpoint and ledger in this lesson govern one thing: "one process, running one task." How multiple sessions share state, whether multiple processes touching the same checkpoint at once conflict, how cross-machine consistency is guaranteed — these belong to multi-session concurrency and distributed consistency, and they're not in this lesson, nor in the scope of this course.

<!-- exercises -->
## 💻 Exercises

### Level 1: A Crash-Moment Drill Manual

Within one turn, this lesson's checkpoints can be caught by at most three "crash moments": ① Point A just saved, tool hasn't started executing; ② the tool's implementation function has already finished, but the ledger hasn't been written yet; ③ Point B just saved. Against the `saveCheckpoint` / `saveEffect` / `reconcile` this lesson implements, write each of these moments out clearly: after the crash, what state are `checkpoint.json` and `effects.json` each in; on `--resume`, which branch does `reconcile` land in; and if what got interrupted was a side-effecting, non-read-only tool (say `write_report`), are the observable on-disk states of ① and ② the same, and is the recovery behavior the same — and if they are the same, what does that tell you.

<!-- rubric -->
- Moment ① (Point A saved, tool not executed): `checkpoint.json`'s `pendingToolUse` is this turn's call; `effects.json` has no record for this `tool_use_id`; on resume `reconcile` takes the "ledger miss" branch — a read-only tool re-runs directly, a non-read-only tool gets `is_error`
- Moment ② (tool finished executing, ledger not written): `checkpoint.json`'s state is exactly the same as ① (`pendingToolUse` is still the one saved at Point A), and `effects.json` also has no record just like ①, so on resume `reconcile` takes exactly the same branch as ①; must point out "the code can't tell ① and ② apart" — in ② the tool has actually finished executing (say `report.txt` is already written), but because the ledger hasn't been written, resume treats it as unknown state, and a non-read-only tool gets `is_error` rather than being reused directly, which is exactly why the ledger is written the instant a tool succeeds, to shrink this window of uncertainty as much as possible
- Moment ③ (Point B saved): `checkpoint.json`'s `pendingToolUse` is `null`, `messages` already contains this turn's `tool_result`; `effects.json` has the matching record; on resume `reconcile(cp)` returns `null` immediately because `pending` is empty, `runAgent` doesn't do the "fill in" step, and requests the model again directly with the complete `messages`

<!-- answer -->
Moments ① and ② leave exactly the same state on disk: `checkpoint.json`'s `pendingToolUse` is still the call description saved at Point A in both, and `effects.json` has no record for this `tool_use_id` in both (the only difference is that in ② the tool has actually finished running, it's just that this fact hasn't been written anywhere persistent yet). Because `reconcile` only looks at the state on disk and doesn't know what happened in memory, ① and ② trigger exactly the same branch: it can't read the tool from the ledger, so if judged read-only it just re-runs once; if judged side-effecting it doesn't dare guess and appends an `is_error: true` `tool_result` back to the model — better to hand over incomplete information than to guess an answer that might cause a duplicate side effect.

Moment ③ is a completely different path: `pendingToolUse` is already `null`, `reconcile` returns `null` the instant it enters the function, `runAgent`'s `if (reconciled)` check is false, it skips the whole "append a tool result, save another Point B" block, and goes straight to the next model request with the already-complete `messages` — as far as the recovery flow is concerned, this turn was closed out long ago.

<!-- hint -->
First think of "what the code can see" and "what actually happened in the world" separately: in moment ② the tool has clearly finished executing, but as long as that fact hasn't been written into `checkpoint.json` or `effects.json`, `reconcile` has no way of knowing it happened.

<!-- hint -->
Deciding which branch it lands in only needs two values from the two disk files: whether `cp.pendingToolUse` is `null`, and whether `effects.json` has this `tool_use_id`. Write out those two values for each of ①②③ first and the branch settles itself.

### Level 2: Find the Order Error Where the Ledger Was Written Backwards

The incident report reads: "The user interrupted a task, and after `--resume` a tool got skipped — the log showed it as 'already done,' but this tool was never actually executed, and the file it was supposed to write simply doesn't exist." You dig up the `runToolUses` that was running in production at the time and find one difference from this lesson's version:

```javascript
async function runToolUses_prod(content) {
  const toolUseBlocks = content.filter((b) => b.type === "tool_use");
  const results = [];
  for (const block of toolUseBlocks) {
    saveEffect(block.id, { name: block.name, result: null, at: Date.now() });
    const output = await toolImpls[block.name](block.input);
    results.push({ type: "tool_result", tool_use_id: block.id, content: output });
  }
  return results;
}
```

Find this order error, explain clearly why it causes "a tool that clearly never ran gets treated as done," and fix the order. Then, following the method in this lesson's "Verification Harness" section, write a small script to reproduce it: insert an environment-variable-controlled simulated crash point between `saveEffect` and `toolImpls[block.name](...)`, and run it for real with `node` — under the wrong order, the ledger already holds a `result: null` record before the crash; with the order fixed, the same crash point leaves no entry for this `tool_use_id` in the ledger at all.

<!-- rubric -->
- Point out the bug: `saveEffect` is placed before `toolImpls(...)`, at which point the tool hasn't actually executed, so there can't be a real `output` — only a placeholder (like `result: null`) can be stuffed in
- Explain the consequence: if the crash happens to land after the ledger write but before the tool actually finishes executing, on resume `reconcile` checks the ledger, hits this placeholder record, and judges it "ledger hit, reuse result, don't re-run" — treating a call that never really executed as done, using a `null` result to satisfy the `tool_result` pairing requirement, instead of having the ledger honestly reflect "not yet executed"
- Give the correct order: you must `await toolImpls[block.name](block.input)` to get the real result first, and only after it succeeds call `saveEffect` to write that real result into the ledger, then push `tool_result` — the order of execute and record can't be swapped
- Verify with a script: insert a controlled crash point between `saveEffect` and `toolImpls`, run the wrong order and the fixed order with `node`, and observe whether `effects.json` already has this `tool_use_id` written before the crash — under the wrong order it does (with `result` a placeholder), after the fix it doesn't

<!-- answer -->
The bug is that `saveEffect(block.id, { ..., result: null, ... })` is written before `const output = await toolImpls[block.name](block.input)`. At that point the tool hasn't been called yet, the function has no idea what the real result is, and can only stuff in a placeholder (here `null`) to hold the `tool_use_id`. If the process happens to be killed after the ledger write but before `toolImpls` actually finishes, the ledger on disk shows "this `tool_use_id` already has a record," but the matching tool never actually ran. On resume `reconcile` only checks whether the ledger has this id, finds it, and judges it "ledger hit" and reuses that record — so a call that never executed gets handled as a done call with a `null` result, which is exactly the cause behind the incident report's "tool skipped, log shows done, but the file simply doesn't exist."

The fix is to swap the order back to "execute first, record after":

```javascript
async function runToolUses(content) {
  const toolUseBlocks = content.filter((b) => b.type === "tool_use");
  const results = [];
  for (const block of toolUseBlocks) {
    const output = await toolImpls[block.name](block.input); // execute first, get the real result
    saveEffect(block.id, { name: block.name, result: output, at: Date.now() }); // then record
    results.push({ type: "tool_result", tool_use_id: block.id, content: output });
  }
  return results;
}
```

You can write the verification along the lines of this lesson's "Verification Harness": write a minimal script that handles a single `block`, insert an environment-variable-reading `crashPoint` after `saveEffect` (the wrong version) or after `toolImpls` (the correct version), run `node` twice, and compare whether `effects.json` has this `tool_use_id` after the crash — under the wrong order a `result: null` record is already written before the crash, under the correct order there's nothing in the ledger before the crash.

<!-- hint -->
The existence of a record in the ledger is supposed to be equivalent to "this tool has really finished running, and this is its real result." Think about it in reverse: if the recording step happens before execution, can that record still guarantee this?

<!-- hint -->
Building the verification script doesn't require reconstructing the whole `runAgent`; you only need to pull the execution of this one `block` out on its own, insert an environment-variable-controlled `throw`, and after running just read the ledger file to check whether this id is there.

<!-- /exercises -->

## Recap

- The checkpoint saves twice per turn: Point A records the dangling `pendingToolUse` after the model response arrives, Point B clears it to null after the tool result lands in `messages`; saving only Point B makes the window between "the model names a tool" and "the result is recorded" completely invisible in the checkpoint, and since every `tool_use` must come back paired with a `tool_result`[^S4], Point A is exactly what makes the dangling call inside that window traceable
- The side-effects ledger records by `tool_use_id`, and its discipline is "execute first, record after" — recording is premised on already having a real result; reverse it and you mis-record "not yet run" as "already done"
- `reconcile`'s three-way split handles the dangling call on resume: ledger hit, reuse and don't re-run; ledger miss but read-only, re-run directly; ledger miss with side effects, don't guess, append an `is_error` `tool_result` handing the state honestly back to the model — this echoes the two engineering lessons of "you can't restart from scratch on error, you have to resume from where it hit" and "let the model know a tool failed, leave it to adapt, and it works surprisingly well"[^S1], and it lines up with the "deterministic safeguards paired with model adaptability" idea[^S1]
- The checkpoint-and-ledger machinery isn't free; add it only when the complexity demonstrably improves outcomes[^S3]; this lesson's implementation only governs "one process running one task," and multi-session concurrency and distributed consistency are not among its concerns, nor in the scope of this course

You've now finished this course. Starting from the judgment that "agents are stateful and errors compound," you worked all the way through what a checkpoint should save, when to write it to disk, how to handle a dangling call on resume, how idempotency backstops recovery, and how a checkpoint can further serve rewind and fork — up to this lesson, where you welded them by hand into a harness that really runs, really gets killed, and really picks back up and finishes. What you hold now isn't just a set of concepts but a stretch of code verified by real `node` execution. Wire it onto your own harness, and the next time it really does get killed, it'll pick right back up from where it left off.
