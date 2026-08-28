# Lesson 3: Resuming from a Checkpoint: Restarting the Loop

> Learning goals:
> - Say why a "dangling call" is bound to show up in a crash-recovery scenario, and how it's a different thing from an ordinary tool-execution failure
> - Write the full resume path from `loadCheckpoint()` back into the loop, version check and state rebuild included
> - Reconcile a dangling call by the nature of the tool — read-only tools re-run directly, high-impact tools fall back first — instead of blindly re-running or blindly deleting
>
> Prerequisites: You've finished Lesson 2 and understand the fields in `checkpoint.json` and the two save points | Prev: [Lesson 2 <<](./02-checkpoint-anatomy.md) | Next: [Lesson 4 >>](./04-side-effects-idempotency.md)

## Resume, Don't Restart

An agent crashes halfway through, and the first instinct is usually to run it again. But for a long task that's already gone a dozen turns deep and called tools several times over, restarting is a bad trade: "restarts are expensive and frustrating for users"[^S1]. Lesson 2 wrote the execution scene out to `checkpoint.json` — `version`, `task`, `turns`, `tokensUsed`, `messages`, `pendingToolUse` — saving once after the model responds (save point A) and once after the tool result is recorded (save point B). What this lesson does is turn that saved scene back into a loop that can move forward: build a system that can "resume from where the agent was when the errors occurred"[^S1] instead of starting over from the top every time.

## The Spine of Resume: One Half Is Easy

Start with the easy half. The spine of resume is four steps: read the file, `JSON.parse` it, check `version`, and spread the fields back into runtime state. Once those four are done, `runAgent` doesn't need to reconstruct an initial `messages` array — the checkpoint already holds a complete one, so it skips initialization and drops straight into the loop.

```javascript
import { readFileSync, writeFileSync, renameSync, existsSync } from "node:fs";

const CHECKPOINT_PATH = "./checkpoint.json";
const CHECKPOINT_VERSION = 1;
const MAX_TURNS = 40;

function saveCheckpoint(state) {
  const tmpPath = `${CHECKPOINT_PATH}.tmp`;
  writeFileSync(tmpPath, JSON.stringify(state, null, 2));
  renameSync(tmpPath, CHECKPOINT_PATH); // .tmp + rename: a botched write can't corrupt the last usable checkpoint
}

function loadCheckpoint() {
  if (!existsSync(CHECKPOINT_PATH)) return null;
  const raw = JSON.parse(readFileSync(CHECKPOINT_PATH, "utf8"));
  if (raw.version !== CHECKPOINT_VERSION) {
    throw new Error(`Checkpoint version mismatch: file is v${raw.version}, code is v${CHECKPOINT_VERSION}`);
  }
  return raw; // { version, task, turns, tokensUsed, messages, pendingToolUse }
}
```

With those two functions in place, the top of `runAgent` becomes a simple branch:

```javascript
async function runAgent(task) {
  const cp = loadCheckpoint();

  let state;
  if (cp) {
    // Resume: state comes off the checkpoint; handle pendingToolUse in a moment
    state = cp.pendingToolUse ? await reconcile(cp) : cp;
  } else {
    // Fresh start: hand-write the first user message, zero out the rest
    state = {
      version: CHECKPOINT_VERSION,
      task,
      turns: 0,
      tokensUsed: 0,
      messages: [{ role: "user", content: task }],
      pendingToolUse: null,
    };
  }

  while (state.turns < MAX_TURNS) {
    state.turns++;
    const response = await client.messages.create({ messages: state.messages });
    state.tokensUsed = response.usage.input_tokens + response.usage.output_tokens;
    state.messages.push({ role: "assistant", content: response.content });

    const toolUseBlock = response.content.find((b) => b.type === "tool_use");
    state.pendingToolUse = toolUseBlock
      ? { id: toolUseBlock.id, name: toolUseBlock.name, input: toolUseBlock.input }
      : null;
    saveCheckpoint(state); // Save point A: after the model response

    if (response.stop_reason !== "tool_use") break;

    const output = await executeTool(toolUseBlock.name, toolUseBlock.input);
    state.messages.push({
      role: "user",
      content: [{ type: "tool_result", tool_use_id: toolUseBlock.id, content: output }],
    });
    state.pendingToolUse = null;
    saveCheckpoint(state); // Save point B: after the tool result is recorded
  }

  return state;
}
```

After resume, the first thing the loop does is exactly what it always does: take `state.messages` and fire off the next `client.messages.create()`. The `messages` the model sees are identical to what it saw before the crash — it has no idea a process restart happened in between. This is why Lesson 2 insisted `messages` go into the checkpoint untouched: as long as that array is restored faithfully, resume is invisible to the model.

## The Hard Half: Reconciling a Dangling Call

The real trouble is the checkpoint where `state.pendingToolUse` isn't `null`. Recall where the two save points sit: point A comes after the model response, and at that moment `pendingToolUse` holds this response's `{id, name, input}`; point B comes after the tool result is recorded, and `pendingToolUse` is cleared back to `null`. If the process dies right between A and B — the tool hasn't run yet, or it finished but the result never made it into `messages` — what the checkpoint keeps is a `pendingToolUse` that isn't `null`.

Now the tail of `messages` is an `assistant` message carrying a `tool_use` block, with no matching `tool_result`. This isn't a state you can limp along in: the protocol requires you to "return one tool_result for each tool_use block, all together in the next user message"[^S4]. Without that one result, resume can't make the next call at all — what the model sees is a half-finished exchange where it kicked off a tool call and will never get an answer. This dangling call has to be dealt with before re-entering the loop.

## Three Ways to Handle It, Only One Holds Up

Faced with this dangling `assistant` message, there are three obvious moves, but only one actually holds up.

**Move one: delete the `assistant` message from `messages` and pretend it never happened.** It looks cleanest — the resumed conversation has no gap in it anymore. But the cost comes in two layers. First, the model forgets a decision it already made, so it may walk the same exploration all over again and burn an extra turn for nothing. Second, and more dangerous: if that tool call had in fact already run, and the process just died before recording the result, deleting the message doesn't undo the side effect that already happened — it only makes the model, and every later log entry, stop knowing it happened at all. Deletion hides the fact, not the risk.

**Move two: just re-run the tool and fill the result into a `tool_result`.** For a read-only tool (`read_file`, `grep`, and the like) this is exactly right — reading twice is no different from reading once, the side effect is zero. For a high-impact tool (sending mail, writing to a database) it's dangerous: the tool has very likely run once already, and re-running it unconditionally means running it a second time. This is precisely the idempotency problem Lesson 4 takes up in full; for now this lesson sets one rule you can act on: **read-only tools re-run directly; high-impact tools must first confirm whether they already ran before deciding whether to re-run.**

**Move three: append an `is_error: true` `tool_result` that says "execution status unknown, please reassess," and hand the decision back to the model.** This is the conservative fallback for when you can't tell whether it ran — the `is_error` field is there precisely to "Set to true if the tool execution resulted in an error"[^S4]. And it turns out "letting the agent know when a tool is failing and letting it adapt works surprisingly well"[^S1]: the model re-reads the context and decides whether to confirm the result some other way, instead of getting burned by a silent, possibly-repeated action.

Line the three up and move one is out; move two and move three cover the "you can tell" and "you can't tell" cases respectively, and only together do they make the full reconciliation rule.

```agentmentor-check
{
  "id": "sp-zh-03-dangling-tool-use",
  "label": "How to handle a dangling call",
  "prompt": "On resume you find pendingToolUse isn't null in the checkpoint — the last assistant message has a tool_use in it with no matching tool_result. Someone argues the cleanest move is to delete that assistant message from messages and pretend it never happened, so the resumed conversation has no gap. Is that right?",
  "whyHere": "This lands right after the three moves are laid out — deletion being the tempting one — to check whether you see why erasing the dangling assistant message isn't a safe option.",
  "mode": "single",
  "choices": [
    {
      "id": "a",
      "text": "No. Deleting both makes the model forget a decision it already made and can hide a side effect that really happened; the right move is to reconcile by the tool's nature and supply the matching tool_result, not to erase the tool_use",
      "correct": true,
      "feedback": "Right. Deletion costs on two layers: the model may re-explore something it already did, and — more dangerous — if the tool had in fact already run, deleting just makes that fact vanish from the conversation and from every later judgment. The protocol requires a matching tool_result for every tool_use, and reconciling rather than deleting is how you get back to a state you can continue from."
    },
    {
      "id": "b",
      "text": "Yes — once messages no longer holds a tool_use without a matching result, the resumed conversation is both clean and safe to continue from",
      "correct": false,
      "feedback": "'No gap' is only surface-clean. If that tool call had in fact already run (the email already went out, say), deleting the message doesn't undo what happened — it just makes the model and the logs stop knowing it happened. The risk is masked, not removed."
    },
    {
      "id": "c",
      "text": "Yes — read-only and high-impact tools both end up querying the model again in the end, so dropping the stale tool_use won't have any real effect",
      "correct": false,
      "feedback": "The two kinds of tools aren't handled the same way: a read-only tool should re-run directly to get the real result, and a high-impact tool whose already-ran status you can't determine should fall back to is_error. Both paths supply the dangling tool_use with a matching tool_result — neither deletes it, and neither just asks the model again across the board."
    }
  ]
}
```

## reconcile(cp): Turning Reconciliation into Code

Turn that rule into a function: decide from the tool name whether it's read-only, and if so re-run it; if it isn't, go check the "effects ledger" to confirm whether this call already ran — there's no effects ledger yet in this lesson, so a comment stands in for it, and Lesson 4 gives the real implementation. When you can't tell, fall through to the `is_error` fallback.

```javascript
const READ_ONLY_TOOLS = new Set(["read_file", "grep", "list_dir", "web_search"]);

async function reconcile(cp) {
  const { pendingToolUse, messages } = cp;
  const { id, name, input } = pendingToolUse;

  let toolResult;
  if (READ_ONLY_TOOLS.has(name)) {
    // Read-only tool: zero side effects, re-run directly for the real result
    const output = await executeTool(name, input);
    toolResult = { type: "tool_result", tool_use_id: id, content: output };
  } else {
    // High-impact tool: check the effects ledger first to see if it already ran (Lesson 4 introduces the ledger; placeholder here)
    // const record = await ledger.checkExecuted(id);
    // if (record) toolResult = { type: "tool_result", tool_use_id: id, content: record.result };
    // else toolResult = { type: "tool_result", tool_use_id: id, content: await executeTool(name, input) };
    //
    // No ledger wired up this lesson; when you can't tell, use the conservative fallback:
    toolResult = {
      type: "tool_result",
      tool_use_id: id,
      content: "Execution status unknown: the process crashed before this call finished, so there's no way to confirm whether it took effect. Please reassess the current situation.",
      is_error: true,
    };
  }

  messages.push({ role: "user", content: [toolResult] });
  cp.pendingToolUse = null;
  return cp;
}
```

Once `reconcile()` is done, the tail of `cp.messages` has the matching `tool_result` filled in and `cp.pendingToolUse` is back to `null`. This `cp` is now indistinguishable from a checkpoint that landed normally at save point B, and it can go straight to the `while` loop to carry on.

## After Resume: Counting turns and tokensUsed

Two counters are easy for the resume path to throw off, and they're worth spelling out on their own.

`turns` doesn't reset on resume. It counts the task's total turns from the start until now, not "how many turns this process instance ran" — the `turns` in the checkpoint should keep incrementing from where it left off, which is the only way the `MAX_TURNS` cap set in Lesson 2 keeps doing its job. Zero `turns` out on resume and a task that keeps crashing and recovering can dodge the turn ceiling and run forever.

`tokensUsed` works the same way — carried forward from the checkpoint, not recomputed. When "Context Engineering: Spending Finite Attention Where It Counts" covers context compaction, `tokensUsed` means "the current window's usage," and what the checkpoint stored is precisely that window's usage at the instant of the crash. The two carry the same meaning, so on resume you take it and keep going, with no extra conversion needed.

<!-- exercises -->
## 💻 Exercises

### Level 1: Three Checkpoints, Three Resume Actions

Below are three checkpoints read at resume time (the contents of `messages` are elided for readability). For each one, write what `runAgent` should do on resume, and why.

```javascript
// Checkpoint A
const cpA = {
  version: 1,
  task: "Help me pull this week's meeting notes together",
  turns: 6,
  tokensUsed: 18420,
  messages: [/* … last one is a plain-text assistant reply … */],
  pendingToolUse: null,
};

// Checkpoint B
const cpB = {
  version: 1,
  task: "Help me pull this week's meeting notes together",
  turns: 7,
  tokensUsed: 19310,
  messages: [/* … last one is an assistant message containing a tool_use … */],
  pendingToolUse: { id: "toolu_01A", name: "read_file", input: { path: "./notes/meeting-08-25.md" } },
};

// Checkpoint C
const cpC = {
  version: 1,
  task: "Email the team to let them know the conclusions",
  turns: 9,
  tokensUsed: 24003,
  messages: [/* … last one is an assistant message containing a tool_use … */],
  pendingToolUse: { id: "toolu_01B", name: "send_email", input: { to: "team@example.com", subject: "This week's conclusions" } },
};
```

<!-- rubric -->
- cpA: `pendingToolUse` is `null`, meaning the crash landed after save point B and before the next `create()`; on resume just take `messages` and fire the next call — no reconciliation needed
- cpB: `pendingToolUse` points at `read_file`, a read-only tool with zero side effects; on resume re-run it directly to get the result, fill in a `tool_result`, and continue
- cpC: `pendingToolUse` points at `send_email`, a high-impact tool that can't be re-run unconditionally; there's no effects ledger yet this lesson, so fall back to `is_error` and tell the model the truth ("execution status unknown") rather than re-sending an email

<!-- hint -->
1. First check whether `pendingToolUse` is `null` — if it is, there's no reconciliation involved at all, and the question is really about the other two. 2. Then look at the tool name: is it in `READ_ONLY_TOOLS`? 3. Only a high-impact tool whose "already ran?" status you can't determine calls for the fallback rather than a re-run.

<!-- answer -->
cpA needs no reconciliation: `pendingToolUse` is `null`, which means the crash landed after save point B, `messages` is complete, and on resume you use it to fire the next `client.messages.create()` directly. cpB needs a re-run: `read_file` is a read-only tool, repeating it produces no side effect, and on resume calling `reconcile()` falls naturally into the `READ_ONLY_TOOLS` branch, gets the real file contents, and fills them into a `tool_result`. cpC can't be re-run: `send_email` is a high-impact tool that has very likely already run once, and re-running it unconditionally would leave the team with a duplicate email; there's no effects ledger yet this lesson to confirm whether it ran, so `reconcile()` should fall into the `is_error` fallback branch and hand the model an honest "execution status unknown, please reassess" rather than sending again.

### Level 2: Find the Root Cause of the Duplicate Email

An ops incident report: "The process was killed and restarted by the OOM killer after the `send_email` tool call but before the result was recorded. On restart the harness auto `--resume`'d, and a few minutes later a user reported receiving two identical emails."

The `reconcile()` running in production at the time looked like this:

```javascript
// The version live in production when the incident happened
async function reconcile(cp) {
  const { pendingToolUse, messages } = cp;
  const { id, name, input } = pendingToolUse;

  const output = await executeTool(name, input);
  messages.push({
    role: "user",
    content: [{ type: "tool_result", tool_use_id: id, content: output }],
  });
  cp.pendingToolUse = null;
  return cp;
}
```

Pin down the root cause, then rewrite this `reconcile()` into a version that routes by the nature of the tool (hint: the rule this lesson set is "read-only re-runs directly; a high-impact tool with no ledger falls back to `is_error`"). Once rewritten, run it under `node` and verify that a high-impact tool like `send_email` no longer triggers `executeTool()`.

<!-- rubric -->
- Root cause: `reconcile()` calls `executeTool()` to re-run every `pendingToolUse` without distinguishing read-only from high-impact tools; `send_email` had very likely already run once before the crash, so an unconditional re-run runs it a second time and sends the email twice
- Fix: bring in a `READ_ONLY_TOOLS` set to route by tool name — only read-only tools are allowed to call `executeTool()` and re-run; a high-impact tool (like `send_email`) is no longer re-run unconditionally but gets an `is_error: true` `tool_result` that hands the "execution status unknown" judgment back to the model
- In the rewritten code, a call like `read_file` and a call like `send_email` must take two different paths, but both paths must end by supplying `messages` with a matching `tool_result` — otherwise resume can't continue the conversation normally

<!-- answer -->
The root cause is that `reconcile()` treats every `pendingToolUse` as "safe to re-run," without distinguishing tools by their side effects. `send_email` had most likely already sent the email before the crash; the process just didn't get to record the result into `messages`. Calling `executeTool("send_email", …)` once more on resume genuinely sends the same email a second time. The fixed version has to route by tool name:

```javascript
const READ_ONLY_TOOLS = new Set(["read_file", "grep", "list_dir", "web_search"]);

async function reconcile(cp) {
  const { pendingToolUse, messages } = cp;
  const { id, name, input } = pendingToolUse;

  let toolResult;
  if (READ_ONLY_TOOLS.has(name)) {
    const output = await executeTool(name, input);
    toolResult = { type: "tool_result", tool_use_id: id, content: output };
  } else {
    toolResult = {
      type: "tool_result",
      tool_use_id: id,
      content: "Execution status unknown: the process crashed before this call finished, so there's no way to confirm whether it took effect. Please reassess the current situation.",
      is_error: true,
    };
  }

  messages.push({ role: "user", content: [toolResult] });
  cp.pendingToolUse = null;
  return cp;
}
```

After the fix, a tool like `send_email` that isn't in `READ_ONLY_TOOLS` never triggers `executeTool()` again — `reconcile()` only supplies it an `is_error` `tool_result`; only a read-only tool like `read_file` actually re-runs. Run it under `node`, calling `reconcile()` once with a read-only tool name and once with `send_email`, and check the `executeTool` call log: it should show up in the read-only run and not in the `send_email` run.
<!-- /exercises -->

## Recap

The spine of resume isn't hard: read the checkpoint, check the version, spread the fields back into runtime state, skip initialization and drop straight into the loop — the model can't even feel that a crash happened in between. What actually needs designing is reconciling the dangling call: deletion loses a decision and masks a side effect that already happened; a read-only tool can be re-run without worry; and for a high-impact tool whose already-ran status you can't determine, an `is_error` fallback is a safer choice than a blind re-run. But that rule still leaves one problem unsolved: how do you actually check whether a high-impact tool has already run? This lesson only fell back to "can't tell"; genuinely being able to tell takes an effects ledger — and that's exactly what the next lesson solves.

[>> Lesson 4: Side Effects and Idempotency: Which Tools Are Safe to Re-Run on Resume](./04-side-effects-idempotency.md)
