# Lesson 4: Side Effects and Idempotency: Which Tools Are Safe to Re-Run on Resume

> Learning goals:
> - Explain why replaying on resume hands you **at-least-once** execution semantics by default, never exactly-once
> - Judge whether a tool operation is idempotent, and spot the side effects that cause real damage the moment they run twice
> - Design and implement an **effects ledger** keyed by `tool_use_id`, so a dangling call on resume checks the ledger before deciding whether to actually execute
>
> Prerequisites: You've read Lessons 2 and 3 and understand the reconciliation rules for a dangling `pendingToolUse` in `checkpoint.json` (Lesson 3); you know the `HIGH_IMPACT` tool set and the pre-execution approval gate from Course 7 in this series, "Agent Harness Fundamentals: Loops and Control" | Prev: [Lesson 3 <<](./03-resume-from-checkpoint.md) | Next: [Lesson 5 >>](./05-rewind-and-fork.md)

## Resume Gives You At-Least-Once: Lesson 3 Left High-Impact Tools Unresolved

Lesson 3 taught you to read `pendingToolUse` out of `checkpoint.json` and use it to pull a dangling call — one where the crash landed between tool execution and the ledger write — back into the loop. The reconciliation rule at the time was: read-only tools just re-run, and for high-impact tools you can't figure out, append an `is_error` `tool_result` so the loop stops being stuck and the question goes back to a human. That's an honest fallback, and it's also an unsolved problem. "Can't figure it out" means the task can't continue on its own, so every crash on a high-impact tool needs somebody watching.

The root of it is this: resume, by its nature, gives you **at-least-once** execution semantics. The process can die after a tool genuinely succeeded but before the result gets written back into `messages` or committed to a checkpoint — and at that point, "did this tool run or not" is a question `checkpoint.json` alone cannot answer. For a read-only tool like `read_file`, not knowing costs you nothing; read it one extra time and the result is the same. For `send_email`, `create_ticket`, or a funds transfer, not knowing is an incident: re-running means the recipient may get two identical emails, and a duplicate ticket may appear in the system out of nowhere.

This is not a new problem. Earlier in this course we established that agents are stateful and errors compound[^S1] — and executing a side effect twice when it was supposed to happen once is one concrete shape that compounding takes. The error doesn't stop at "we ran it one extra time"; it rolls downstream on top of that extra side effect. This lesson closes the gap Lesson 3 left open: introduce **idempotency** as a concept, then bolt an **effects ledger** onto the resume loop so "can't figure it out" becomes "can figure it out."

## What Idempotent Means: One Run or Ten, Same Effect

**Idempotent** means an operation that produces the same final effect whether you run it once or many times. Note that this is about the *effect* — the final state the operation leaves behind in the outside world (files, databases, inboxes) — not about the literal value each call returns.

To judge whether a tool is idempotent, one question is enough: "If this operation quietly ran one extra time, would the outside world end up with something extra, or in a different state?" Run these small examples past that question and the difference shows up immediately.

```javascript
// Idempotent: reading a file has no side effect — call it any number of times,
// what's on disk is the same
async function readFileContent(path) {
  return fs.readFile(path, "utf8");
}

// Not idempotent: every call genuinely adds one more row to the array
function appendRow(sheet, row) {
  sheet.rows.push(row);
}

// Idempotent: no matter how many calls, line 42 converges on the same value
function setLine(doc, lineNo, text) {
  doc.lines[lineNo] = text;
}

// Not idempotent: every call genuinely adds one more message to the recipient's inbox
async function sendEmail(to, subject, body) {
  return mailer.send({ to, subject, body });
}
```

`readFileContent` is idempotent by nature because it has no side effect at all — there's nothing "left behind" to speak of. `setLine` is idempotent too, and it really does mutate state, but the way it mutates is by **overwriting**: call it once and line 42 is X, call it ten times and line 42 is still X. The end state doesn't vary with call count. `appendRow` and `sendEmail` are not idempotent, for the same reason in both cases: their effect is **cumulative** — every call genuinely adds one more thing to the outside world, so the call count shows up directly in the final state.

Hold on to that dividing line: overwriting writes are usually idempotent, appending writes usually aren't; reads and "check first, then decide whether to act" operations are usually idempotent, while plain unconditional inserts usually aren't. The effects ledger in the next section exists specifically to catch the operations that aren't idempotent and can't be redesigned away.

## The Effects Ledger: Writing Down Which Side Effects Already Happened

Lesson 2 taught you to store the loop's running scene — `messages`, the counters, the tool call not yet written to the ledger — in a checkpoint, so a crash can be picked up in place. But a checkpoint answers "which step of the loop did we reach," not "did that step's side effect actually happen." During normal operation the two move almost in lockstep, but the moment a crash lands in the gap between them, they disagree — which is exactly why Lesson 3 had to leave high-impact reconciliation unresolved.

Closing that gap takes an **effects ledger**: write down which side effects have already happened, on disk, separate from the checkpoint. The structure is simple — a map keyed by `tool_use_id`:

```javascript
// The shape of effects.json
{
  "toolu_01abc": {
    "name": "create_ticket",
    "result": { "id": "T-1", "title": "Customer outage report" },
    "at": "2026-08-26T09:12:03.000Z"
  }
}
```

The timing of the ledger write matters a great deal: write it the instant the tool function actually succeeds and returns a result, and write it a beat *earlier* than the "point B" checkpoint from Lesson 2 (the routine write that happens after the tool result lands in `messages`). The reason is direct. If the crash falls inside the narrow window between "the tool succeeded" and "the point-B checkpoint finished writing," the point-B checkpoint never got the chance to record that this happened, and on resume the only thing that can tell you the truth is the ledger that finished writing earlier. The ledger write itself also has to use the `.tmp` + `rename` atomic write from Lessons 2 and 3, for the same reason — a half-written ledger file is more dangerous than no ledger at all, because it makes you believe in a side effect that never actually completed.

```javascript
import { promises as fs } from "node:fs";

async function loadEffects(path) {
  try {
    return JSON.parse(await fs.readFile(path, "utf8"));
  } catch {
    return {}; // Missing or corrupt file: treat as an empty ledger, don't block resume
  }
}

async function saveEffects(path, effects) {
  const tmp = `${path}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(effects, null, 2));
  await fs.rename(tmp, path); // Atomic swap, no half-written file left behind
}
```

With a ledger in hand, the reconciliation rule on resume upgrades from Lesson 3's "can't figure it out" to "can figure it out." Take the `pendingToolUse` from `checkpoint.json` and look its `id` up in the ledger. **Hit**: the side effect really did happen, so pull the stored `result` out of the ledger, use it to fill in a `tool_result`, and never execute again. **Miss**: this call either never started or died partway through without succeeding, so executing is safe. The rule holds for every tool; it's just that for idempotent tools the lookup doesn't matter either way. What actually depends on it are the operations that cause damage when they repeat.

There's one insight here worth stating on its own: **`tool_use_id` is already an idempotency key.** Every time the model names a tool, it carries "A unique identifier for this particular tool use block"[^S4] — that's the verbatim definition of the `id` field from the official spec. If that same naming gets seen a second time because of a replay on resume, the `id` doesn't change. That's precisely what lets the ledger recognize "this call" and "that earlier call" as one and the same event, without you having to invent a deduplication scheme of your own.

```agentmentor-check
{
  "id": "sp-zh-04-blind-retry",
  "label": "A dangling send_email call — can the model correct itself after a re-run?",
  "prompt": "On resume, your harness finds a dangling send_email call in checkpoint.json — the crash landed right after the email went out and before the result was written to the ledger. A colleague says: \"Just re-run it blindly. The model will see the result come back and correct itself.\" Does that hold up?",
  "whyHere": "You just learned the ledger's reconciliation rule. This checks whether you actually understand that \"re-running\" and \"the model correcting itself\" are two different things — which is the reason the ledger exists at all, rather than being an optional extra step you could skip.",
  "mode": "single",
  "choices": [
    {
      "id": "a",
      "text": "It holds up: once the model sees the \"email sent\" result come back and notices it doesn't line up with what it remembers doing, it will flag the duplicate and deal with it",
      "correct": false,
      "feedback": "All the model can see is what came back in this one tool_result. It has no independent channel for sensing whether this email was already sent once before, and no way to reach into the recipient's inbox and pull the second copy back. Side effects happen in the outside world, and the model's output can't change what has already happened there — the most it can do is apologize in its next sentence. Two emails still went out."
    },
    {
      "id": "b",
      "text": "It doesn't hold up, but the right fix is for the harness to skip every dangling tool call on resume and hand each one to a human to sort out",
      "correct": false,
      "feedback": "That's backwards. Skipping everything treats all tools as dangerous, when most dangling calls are either read-only (zero risk in re-running) or genuinely never succeeded (re-running is the only correct move). It degrades resume into \"every crash needs a human,\" throwing away the whole point of continuing automatically — solving with blanket avoidance a problem that evidence was supposed to settle."
    },
    {
      "id": "c",
      "text": "It doesn't hold up: the model only sees the result returned by this call and can't perceive the duplicate that already landed in the outside world; the harness has to check the effects ledger by tool_use_id before executing",
      "correct": true,
      "feedback": "Right. The model's world is the tool_results it sees, and it has no other eyes with which to look at how many messages are sitting in the recipient's inbox right now. The one thing that can see that — and the only thing that can stop the duplicate — is the harness: before actually calling the tool, look this call's tool_use_id up in the effects ledger. On a hit, reuse the stored result and never re-run; only on a miss is executing safe. That gate doesn't rely on the model's judgment; it rests on the definite evidence the ledger left on disk."
    }
  ]
}
```

## Two Gates in Layers: Approval Asks "Should We?", the Ledger Asks "Did We Already?"

Course 7 in this series, "Agent Harness Fundamentals: Loops and Control," fitted `runToolUses` with an approval gate: before a high-impact tool actually runs, print what's about to happen, wait for a human to confirm, and only then let it through[^S3]. That gate stops the question "should this be done." The effects ledger in this lesson stops a different question: "has this already been done." The two gates ask different things, but they sit in the same place — both wedged into the moment after the model has named a tool and before the tool has actually run. Neither will let the tool function execute until it has been checked.

Stack the two and `runToolUses` looks like this:

```javascript
const HIGH_IMPACT = new Set(["send_email", "create_ticket", "delete_file"]);

async function runToolUses(content, toolImpls, opts = {}) {
  const toolUseBlocks = content.filter((b) => b.type === "tool_use");
  const effects = await loadEffects(opts.effectsPath);
  const results = [];

  for (const block of toolUseBlocks) {
    // Idempotency gate: has this call already actually happened?
    const recorded = effects[block.id];
    if (recorded) {
      results.push({ type: "tool_result", tool_use_id: block.id, content: recorded.result });
      continue; // Ledger hit: reuse the stored result, never re-run
    }

    // Approval gate: high-impact operations get confirmed before execution (Course 7)
    if (HIGH_IMPACT.has(block.name)) {
      const ok = await opts.approve?.(block.name, block.input);
      if (!ok) {
        results.push({
          type: "tool_result", tool_use_id: block.id,
          content: "The user declined this high-impact operation; it was not executed.", is_error: true,
        });
        continue; // Skip execution, but still return a tool_result so the call isn't left dangling
      }
    }

    let output;
    try {
      output = await toolImpls[block.name](block.input);
    } catch (err) {
      // The tool itself failed: no side effect happened, so report is_error honestly
      results.push({
        type: "tool_result", tool_use_id: block.id,
        content: `Tool execution failed: ${err.message}`, is_error: true,
      });
      continue;
    }

    // If we got here, the side effect really did happen. Even if the ledger write below fails,
    // we must never misreport it as an execution failure — once we return is_error, the model
    // assumes this never ran, retries with a fresh tool_use_id, and the ledger can no longer
    // recognize it as the same call. That's how a duplicate side effect slips through.
    effects[block.id] = { name: block.name, result: output, at: new Date().toISOString() };
    try {
      await saveEffects(opts.effectsPath, effects); // Write immediately on success, don't batch
    } catch (err) {
      // A failed write is an ops problem, not a tool problem: return the real result to the
      // model and raise a separate alert
      console.error(
        `[ledger write failed] tool_use_id=${block.id} name=${block.name}: ` +
        `the side effect happened but wasn't recorded; resume risks re-running it. Needs manual review. Cause: ${err.message}`,
      );
    }
    results.push({ type: "tool_result", tool_use_id: block.id, content: output });
  }
  return results;
}
```

The order isn't negotiable: the idempotency gate has to come first. The reason is plain — if this call is already in the ledger, asking "should we do it" afterward is meaningless, because it's already done, and asking again only confuses the person answering: the system clearly finished this, so why is it asking me to confirm it? For a dangling call on resume, the first question is always "did this happen," and only once that's settled does "should this happen" get its turn.

## Idempotency at the Tool Design Layer: Fix the Cause, Don't Just Catch the Fallout

The effects ledger is a harness-side backstop — whether or not the tool itself was designed to be idempotent, the ledger can block a duplicate execution using `tool_use_id`. But a backstop is still a backstop, and the better investment is fixing the cause: where you can change the tool, design it to be idempotent by nature, so the ledger never has to step in.

The most common version of that change is turning "create" into "ensure exists":

```javascript
// Fixing the cause: idempotent by nature — check first, return what exists, don't create again
async function ensureTicket(input) {
  const existing = await findTicketByTitle(input.title);
  if (existing) return existing;
  return createTicketRecord(input);
}
```

Call `ensureTicket` once or ten times and the system ends up with exactly one ticket matching that title — the end state doesn't vary with call count, which is the definition of idempotent. The same thinking applies to writing files: a whole-file `write_file` is idempotent by nature, and repeated calls leave the same content behind; an appending `append_file` isn't, and the file grows a section per call. When you can pick overwrite, don't pick append.

Fixing the cause and catching the fallout aren't a choice between two options — they're a division of labor. Tools you can design to be idempotent should be solved at the tool layer, sparing every call a detour through the ledger. And for operations that genuinely can't be "deduplicated and merged" as a matter of business logic — two transfers that really did happen at different times, say, which ought to be recognized as two distinct events and can't be collapsed into one by clever design — the ledger is the only backstop there is.

## Callback: One More Guardrail, and Knowing When It's Worth It

This course started from the point that reliability comes from pairing the model's adaptability with deterministic safeguards like retry logic and regular checkpoints[^S1]. The effects ledger is one of those guardrails. It doesn't ask the model to judge "have I already done this" — that was always beyond what the model can perceive. It has the harness make that judgment on the model's behalf, using definite evidence written on disk.

Keep a sense of proportion too. If every tool your agent holds is read-only, the ledger in this lesson probably won't earn its place — an effects ledger is itself a layer of complexity, and what makes it worth adding is that it genuinely blocks a real risk of duplicate side effects; add complexity only when it demonstrably improves outcomes[^S3]. The test is the same one as in the last lesson: look at your tool set for non-idempotent, high-impact operations first. If they're there, the gate is worth installing. If they aren't, don't rush to write it.

<!-- exercises -->
## 💻 Exercises

### Level 1: Rate Six Tools for Idempotency and Re-Run Risk

For each of the six tools below, decide: (1) is it idempotent; (2) if a dangling call to it gets re-run on resume, is the risk high, medium, or low — and why.

- `read_file(path)` — read a file's contents
- `send_email(to, subject, body)` — send an email
- `ensure_ticket(title, body)` — look up by title, return the existing ticket if there is one, create a new one only if there isn't
- `append_log(line)` — append a line to the end of a log file
- `set_config(key, value)` — set a config key to a given value (overwriting)
- `delete_file(path)` — delete a file

<!-- rubric -->
- All six idempotency judgments correct (idempotent: read_file, ensure_ticket, set_config, delete_file; not idempotent: send_email, append_log)
- Risk levels are reasonable and come with a reason, not just a bare label (high/medium/low has to be backed by a "why")
- Names at least one case where idempotency depends on how carefully the tool is implemented (ensure_ticket's lookup logic, or how delete_file handles "file not found")

<!-- answer -->
`read_file` is idempotent, has no side effect by nature, and re-running carries zero risk (low). `send_email` is not idempotent — every call genuinely puts one more message in the recipient's inbox — so re-running a dangling call on resume causes a duplicate send. Risk is high, and it's only safe to replay after checking the ledger. `ensure_ticket` is idempotent by design: when a ticket with the same title already exists it skips creation, so the system's end state doesn't vary with call count. But that idempotency rests on the "look up by title" logic being sound — if the title carries something that differs each time, like a timestamp, the lookup stops matching and the idempotency is idempotent in name only. Call the risk low-to-medium, and back it with the ledger anyway. `append_log` is not idempotent — every call genuinely adds a line — so a re-run on resume leaves duplicate entries in the log. Risk is medium: not a business incident the way a duplicate email is, but it pollutes the log and may throw off downstream logic that counts lines or matches content. `set_config` is idempotent, an overwriting write; setting the same key to the same value produces the same end state however many times you call it, so risk is low and re-running is fine. `delete_file` is idempotent — deleting a file that's already gone leaves the same final state as the file simply not existing — so risk is low. But watch the implementation detail: if `delete_file` throws on a missing file and the caller treats that as an execution failure, a re-run gets misread as a fresh failure. "File not found" should be treated as success in the idempotent sense.

<!-- hint -->
Set risk aside for a moment and sort the six into two groups: effects that overwrite, and effects that accumulate. That dividing line is in the body of the lesson, and once the grouping is right, the idempotency calls mostly settle themselves.

<!-- hint -->
Risk level isn't a straight copy of "idempotent means low, non-idempotent means high" — think about whether the consequence of `append_log` or `send_email` is more serious, then think about what premise `ensure_ticket`'s idempotency rests on and what happens when that premise fails.

### Level 2: Add an Effects Ledger to a runToolUses That Has None

Last week your harness was working a "customer reports an outage, open a ticket" task. It ran `create_ticket`, got a successful result — and the container happened to be restarted and killed right then, before the result made it back into a `tool_result`. After the process came back, the harness read `pendingToolUse` from `checkpoint.json` and found exactly that `create_ticket` call. With the ledger-free `runToolUses` below, its only option was to re-run — so one customer outage report turned into a duplicate ticket in the system out of nowhere.

```javascript
// The scene of the accident: this runToolUses has no effects ledger
async function runToolUses(content, toolImpls) {
  const toolUseBlocks = content.filter((b) => b.type === "tool_use");
  const results = [];
  for (const block of toolUseBlocks) {
    const output = await toolImpls[block.name](block.input);
    results.push({ type: "tool_result", tool_use_id: block.id, content: output });
  }
  return results;
}
```

Your job: (1) write the `loadEffects`/`saveEffects` read-write functions for `effects.json`, using an atomic write (`.tmp` first, then `rename`); (2) rewrite `runToolUses` to add the "check the ledger before executing, execute only on a miss, record the ledger the moment execution succeeds" logic; (3) write a Node script that proves it: call your rewritten `runToolUses` twice with the same `tool_use_id` (simulating a replay on resume) and show that the second call doesn't run the real `create_ticket` implementation again.

<!-- rubric -->
- `loadEffects`/`saveEffects` use the `.tmp` + `rename` atomic write rather than writing the target file directly; `loadEffects` handles a missing file (returns an empty object) so resume itself doesn't crash
- The rewritten `runToolUses` looks the ledger up by `block.id` before executing, and on a hit reuses the stored `result` without calling `toolImpls`; it writes the ledger only after execution genuinely succeeds, and writes this call's real result, not a placeholder
- The verification script uses a fake `create_ticket` that counts calls, proving "the second call with the same tool_use_id doesn't increment the counter" — actual evidence that the ledger check prevented execution, not just that nothing threw

<!-- answer -->
```javascript
import { promises as fs } from "node:fs";

async function loadEffects(path) {
  try {
    return JSON.parse(await fs.readFile(path, "utf8"));
  } catch {
    return {};
  }
}

async function saveEffects(path, effects) {
  const tmp = `${path}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(effects, null, 2));
  await fs.rename(tmp, path);
}

async function runToolUses(content, toolImpls, opts) {
  const toolUseBlocks = content.filter((b) => b.type === "tool_use");
  const effects = await loadEffects(opts.effectsPath);
  const results = [];
  for (const block of toolUseBlocks) {
    const recorded = effects[block.id];
    if (recorded) {
      results.push({ type: "tool_result", tool_use_id: block.id, content: recorded.result });
      continue;
    }
    const output = await toolImpls[block.name](block.input);
    effects[block.id] = { name: block.name, result: output, at: new Date().toISOString() };
    await saveEffects(opts.effectsPath, effects);
    results.push({ type: "tool_result", tool_use_id: block.id, content: output });
  }
  return results;
}

// Verify: on a replay with the same tool_use_id, the second pass doesn't open a ticket
let calls = 0;
async function createTicket(input) {
  calls += 1;
  return { id: "T-1", title: input.title };
}

const block = {
  type: "tool_use",
  id: "toolu_01abc",
  name: "create_ticket",
  input: { title: "Customer outage report" },
};
const effectsPath = "./effects.json";

await runToolUses([block], { create_ticket: createTicket }, { effectsPath });
console.assert(calls === 1, "the first call should actually execute");

// Simulate resume: the same tool_use_id shows up in pendingToolUse again
await runToolUses([block], { create_ticket: createTicket }, { effectsPath });
console.assert(calls === 1, "the second call hits the ledger and should not execute");

console.log("calls =", calls); // prints calls = 1, proving the replay didn't open a second ticket
```

This code has been run under Node to verify it: on the first call to `runToolUses` the ledger is empty, `create_ticket` really executes once, `calls` becomes 1, and the ledger file records the result of that call. The second call simulates a replay on resume with the same `tool_use_id`; `runToolUses` finds that id in the ledger, drops the stored `result` straight into a `tool_result`, and `toolImpls.create_ticket` is never called again — `calls` is still 1. That's exactly what the effects ledger is meant to prove: a replay on resume doesn't make an already-completed side effect happen a second time.

<!-- hint -->
Whether the ledger gets written depends on whether the tool actually succeeded, not on whether the `for` loop reached this point — `saveEffects` has to sit **after** the `toolImpls[...]` call and **after** you have the result.

<!-- hint -->
The point of the verification isn't "the second call didn't throw," it's "the second call didn't run the real `create_ticket` implementation again." A fake implementation that counts calls, compared before and after, is the only believable evidence.

<!-- /exercises -->

## Recap

- Resume hands you at-least-once execution semantics: the process can die after a tool genuinely succeeded but before the result is written to the ledger, and the checkpoint alone can't tell you whether that dangling call ran. That's the root of why Lesson 3 had to leave high-impact reconciliation unresolved.
- The definition of idempotent: an operation that produces the same final effect whether it runs once or many times. Overwriting writes (`set_config`, `write_file`) are usually idempotent; appending writes (`append_log`, `send_email`) usually aren't.
- The effects ledger records which side effects have already happened, on disk, keyed by `tool_use_id` — the unique identifier the model carries when it names a tool[^S4], which doesn't change when the same naming is replayed on resume, making it an idempotency key by nature. Write it with the `.tmp` + `rename` atomic write, the moment the tool succeeds.
- The reconciliation rule on resume upgrades to: if `pendingToolUse.id` hits in the ledger, reuse the stored result and never re-run; if it misses, execute safely.
- The approval gate asks "should this be done," the effects ledger asks "has this already been done." They complement each other, both sit in front of actual execution, and the idempotency gate goes first.
- Fixing the cause beats catching the fallout: design tools to be idempotent by nature ("ensure exists" over "create," overwrite over append) and you won't need the ledger for everything. Reliability comes from the model's adaptability paired with deterministic safeguards[^S1] — but a safeguard is complexity too, and it should be added only when it demonstrably improves outcomes[^S3].

[>> Lesson 5: Rewind and Fork: The Second Value of Checkpoints](./05-rewind-and-fork.md)
