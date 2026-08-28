# Lesson 5: Rewind and Fork: The Second Value of Checkpoints

> Learning goals:
> - Explain the two proactive uses of checkpoints beyond disaster recovery — rewinding to an earlier scene to try again, and forking a second timeline to explore — and see that both rest on the same sequence of checkpoints that resume does
> - Turn checkpointing from "keep only the latest" into a per-turn retained sequence, implement `rewindTo(turn)`, and explain that rewind rolls back the decision scene, not the external side effects that already happened
> - Implement `forkFrom(turn, branchName)` to copy an independent timeline off the same scene, and draw the dividing lines between what checkpoints, Git, and the effects ledger each own
>
> Prerequisites: You've finished Lessons 1-4 and know the field layout of `checkpoint.json` (`version`, `task`, `turns`, `tokensUsed`, `messages`, `pendingToolUse`) plus atomic writes, how resume reconciles a dangling call, and Lesson 4's effects ledger and idempotency keys | Prev: [Lesson 4 <<](./04-side-effects-idempotency.md) | Next: [Lesson 6 >>](./06-build-checkpointing.md)

## Checkpoints Aren't Just a Fuse

The first few lessons treated checkpoints as insurance against disaster — the process crashes, and you pick the loop back up from the most recent checkpoint. Nothing wrong with using them that way, but if the only time you reach for them is after a crash, they sit idle most of the time. No crash, so the state you saved was wasted?

It wasn't. A string of accumulated checkpoints is really a timeline of the task — what it was thinking each turn, what it was about to do, which effects it had already committed, all left as a trace. Beyond disaster recovery, that timeline supports two more proactive uses: rewinding to an earlier turn to start over, and forking off a turn to run a second route alongside the first. A community roadmap organized around harness engineering sums up the persistence component by tying exactly these three together: checkpoint state every node so you can resume, rewind, fork[^S5]. That's a framing claim from the roadmap — it doesn't prescribe an implementation — but it points at one thing: resume is only a third of what checkpoints are for, and the other two are the subject of this lesson.

- **Rewind**: the task didn't crash, but it went off course. Roll the decision scene back to a turn before it went wrong, and start over.
- **Fork**: you're not sure which route is better, so you copy two independent timelines off the same scene, run each, and pick the result.

Neither of these is "cleanup after a disaster" — both can come up while the task is running along perfectly fine.

## Rewind: Roll Back the Decision Scene, Not the Outside World

Picture a task that runs 20-some turns of tool calls. On turn 15 the model makes a bad decision — it picks the wrong file to edit, or makes a wrong assumption about a vague requirement. For the next 10 turns, it keeps building on top of that mistake. Course 8 in this series, "Context Engineering: Spending Finite Attention Where It Counts," showed that as context piles up longer and messier, the model's ability to recall information from it accurately drops off — and this stretch of history carries a wrong decision on top of that. Rather than let the model keep struggling inside a long, off-course context, roll the scene back to turn 14, the point before the bad decision, and start over from there.

To do that, a checkpoint can no longer be "just the latest one." The `saveCheckpoint` from earlier lessons overwrote the same `checkpoint.json` every time, so on recovery you could only get the last state written — enough for disaster recovery, but no good for rewind, because turn 14's scene was long since overwritten by turn 15. To support rewind, checkpoints have to be retained as a per-turn sequence, with the turn number and the save point in the filename: `checkpoints/turn-014-A.json`, `checkpoints/turn-014-B.json`, and so on. Within each turn, save point A lands when the model has proposed its plan but the tool hasn't run yet; save point B lands when the turn's tool result is written back into `messages` and the turn is genuinely done. By default, "go back to turn N" means the scene after that turn finished — that is, the last save point written in that turn:

```javascript
import fs from "node:fs/promises";
import path from "node:path";

function turnFileName(turn, point) {
  return `turn-${String(turn).padStart(3, "0")}-${point}.json`;
}

// Grab the last save point written in a turn: A and B sort lexicographically, B after A,
// which lines up exactly with the order "before tool execution" -> "after tool result recorded"
async function pickLatestPoint(turn, dir) {
  const files = await fs.readdir(dir);
  const prefix = `turn-${String(turn).padStart(3, "0")}-`;
  const points = files
    .filter((f) => f.startsWith(prefix))
    .map((f) => f.slice(prefix.length, prefix.length + 1))
    .sort();
  if (points.length === 0) throw new Error(`No checkpoint for turn ${turn}`);
  return points[points.length - 1];
}

async function rewindTo(turn, { point, dir = "checkpoints" } = {}) {
  const wanted = point ?? (await pickLatestPoint(turn, dir));
  const raw = await fs.readFile(path.join(dir, turnFileName(turn, wanted)), "utf8");
  return JSON.parse(raw); // { version, task, turns, tokensUsed, messages, pendingToolUse }
}
```

With the scene that `rewindTo(14)` returns, what follows is the same flow as resume: use this `messages` to rebuild the history, and continue the loop from this `turns` count. The only difference is that this time the model faces a clean scene from before the decision was made, not the context that turn 15 polluted.

But one thing is worth saying out loud: rewind rolls back the **decision scene**, not the **outside world**. If the bad decision on turn 16 already called a high-impact tool — actually sent an email, say — rewinding to turn 14 does not pull that email back. A checkpoint stores `messages`, `turns`, `pendingToolUse`, and whatever other state fields you defined into the snapshot; it was never meant to, and cannot, undo an external action that already landed. Lesson 4's effects ledger (`effects.json`) keeps following its append-only rule: after you rewind and re-run from turn 15, even if the model picks a completely different action this time, the ledger only gains a new record — it doesn't erase the old one. Whatever happened in the ten discarded turns still leaves its trace on the ledger, which is exactly Lesson 4's idempotency view carried into the rewind scenario.

## Fork: Run Two Timelines Off One Scene

Rewind solves "this route was wrong, back up and redo it." But sometimes the question isn't "was it wrong," it's "I'm not sure which is better" — two refactoring plans both make sense, and you want to run each and compare before choosing. In that case, don't pick one destructively; copy two independent timelines off the same checkpoint and run each:

```javascript
async function forkFrom(turn, branchName, { point, baseDir = "checkpoints" } = {}) {
  const startPoint = point ?? (await pickLatestPoint(turn, baseDir));
  const state = await rewindTo(turn, { point: startPoint, dir: baseDir });

  const branchDir = `${baseDir}-${branchName}`;
  await fs.mkdir(branchDir, { recursive: true });
  await fs.writeFile(
    path.join(branchDir, turnFileName(turn, startPoint)),
    JSON.stringify(state, null, 2)
  );

  // Independent effects ledger: this timeline runs on its own, each records its own
  // effects, and it doesn't carry over the main line's records
  await fs.writeFile(path.join(branchDir, "effects.json"), "[]\n");
  return branchDir;
}
```

After `forkFrom(14, "plan-b")`, `checkpoints-plan-b/` has its own checkpoint sequence and a blank effects ledger. From turn 14 onward, where this timeline goes, how many turns it runs, how many checkpoints it lands — none of it interferes with the main line.

The fact that the two forked timelines are independent is a warning for high-impact tools: if both timelines would call the same genuinely external action — both need to send the same email, say — letting each run to completion without approval means each timeline sends it once, which becomes a doubled side effect. Wiring an approval gate onto tools like that, or switching to a dry-run mode during the fork, is worth doing before you fork. It's the same reasoning as the ledger not rolling back on rewind: a checkpoint can be copied into two, but an external effect that already landed can't be copied into "one per parallel world."

## Product Comparison: Claude Code Shipped This as a Feature

The rewind and fork above are something Claude Code already ships as a product-grade feature — this is only for comparison, not the tool being taught. Its checkpointing mechanism automatically captures the state of your code before each user prompt[^S2]: every user prompt creates a new checkpoint[^S2], and Claude Code saves checkpoints with the conversation, so you can still run `/rewind` after you resume a session[^S2].

Its `/rewind` menu splits "what to restore" into three options: "Restore conversation: rewind to that message while keeping current code", "Restore code: revert file changes while keeping the conversation", or "Restore code and conversation: revert both code and conversation to that point"[^S2] — which happens to be the productized version of this lesson's line, "rewind rolls back the decision scene." You can choose to roll back the decision scene alone (the conversation), or roll code back along with it. The official docs also list a few common use cases for checkpointing, like "Exploring alternatives: try different implementation approaches without losing your starting point" and "Recovering from mistakes: quickly undo changes that introduced bugs or broke functionality"[^S2]. Worth noting: those use-case docs are listed generically under checkpointing (`/rewind`), not sorted separately into "rewind" and "fork." But held up against this lesson's two uses — "went wrong, back up and redo" and "not sure, fork and try" — the direction lines up.

On the fork side, Claude Code offers `/branch` or `claude --continue --fork-session`: "To branch off and try a different approach while preserving the original session intact, use /branch or claude --continue --fork-session"[^S2].

## Boundaries and Division of Labor: What Checkpoints, Git, and the Effects Ledger Each Own

Claude Code's docs also draw a boundary of their own: its checkpointing "does not track files modified by bash commands"[^S2], and "Only direct file edits made through Claude's file editing tools are tracked"[^S2]. By the same token, the checkpoints in your own harness cover only the state fields you explicitly defined into the snapshot — `messages`, `turns`, `tokensUsed`, `pendingToolUse`. Changes a tool made in the outside world — writing to a database, calling another service, sending an email — are none of a checkpoint's business. That's the effects ledger's job.

The official docs state the mechanism's role plainly: checkpoints are designed for quick, session-level recovery, and for long-term history and collaboration you should "continue using version control, such as Git, for commits, branches, and long-term history."[^S2] The three own separate stretches, and it's clearer side by side:

| Mechanism | What it owns | Time scale |
| --- | --- | --- |
| Checkpoint | The running scene — `messages`, turn counts, the tool call not yet executed | Minutes, session-level |
| Git | The code's own history — commits, branches, collaboration | Permanent, collaborative |
| Effects ledger | External side effects that already happened — emails sent, records written | Append-only, kept permanently |

```agentmentor-check
{
  "id": "sp-zh-05-checkpoint-vs-git",
  "label": "Judge whether checkpoints can replace version control",
  "prompt": "Someone on the team proposes: now that checkpoints can rewind by turn, they work a lot like Git's commit history, so from here on let's manage code changes with checkpoints and drop Git entirely. Does the proposal hold up?",
  "whyHere": "You just finished the division of labor between checkpoints, Git, and the effects ledger. \"Checkpoints can rewind now, so isn't Git redundant?\" is the over-extension most likely to surface right here, and this boundary has to be nailed down on the spot — otherwise readers merge minute-scale session recovery and permanent code history into one thing.",
  "mode": "single",
  "choices": [
    {
      "id": "a",
      "text": "It holds up. Checkpoints already store each step's scene by turn — version, turns, messages are all there — so they do the same job as Git commit records, and you can both rewind and read history with checkpoints.",
      "correct": false,
      "feedback": "The fields a checkpoint stores exist to rebuild the running scene of one session, which is not the same as what a Git commit records — the code files themselves, fully version-controlled. Checkpoints were designed for quick, session-level recovery, while long-term history and collaboration still rest on version control like Git[^S2]. They don't own the same thing, so there's no question of one replacing the other."
    },
    {
      "id": "b",
      "text": "It doesn't hold up. Checkpoints are minute-scale, session-level recovery of the running scene; Git is the code's own permanent, collaborative history. They own two entirely different things and can't stand in for each other.",
      "correct": true,
      "feedback": "Right. The docs state the boundary plainly: checkpoints are designed for quick, session-level recovery, and long-term history and collaboration still call for version control like Git[^S2]. Checkpoints don't even track files modified by bash commands — only edits made through Claude's own file editing tools[^S2] — so their record of what actually changed in the code is far narrower than Git's to begin with. Checkpoints, Git, and the effects ledger each own a stretch; none replaces another."
    },
    {
      "id": "c",
      "text": "Partly holds up. Checkpoints can rewind already, so as long as you log every rewind, it's essentially a simplified branch management — just a different way of operating — and gradually replacing Git isn't out of the question.",
      "correct": false,
      "feedback": "Checkpoint rewind and Git branch management aren't two spellings of the same thing. Checkpoints don't even track files modified by bash commands, only edits made through Claude's own file editing tools[^S2], so their coverage of code changes is far narrower than Git's, and they have none of Git's commit, merge, and collaboration machinery. Their role is quick, session-level recovery, not a replacement for version control[^S2]."
    }
  ]
}
```

## Retention Cost: Pick Your Tradeoff

Retaining a per-turn checkpoint sequence isn't free — two save points per turn, and the longer the task runs, the more files pile up on disk. Anthropic's principle of "you should consider adding complexity only when it demonstrably improves outcomes"[^S3] applies just as much here. If the task runs only a few turns and rarely needs a rewind, keeping the whole sequence may cost more than it's worth — like the earlier lessons, keeping just the latest one is enough. On the flip side, if the task runs dozens of turns and routinely needs rewinding or forking to try a few approaches, the sequence you keep earns its place: when something goes wrong you don't have to start from scratch, and the cost of trial and error drops. This is ultimately a judgment call scaled to task size, not a question of which approach is inherently right.

<!-- exercises -->
## 💻 Exercises

### Level 1: Four Scenarios, Pick the Right Tool

For each of the four scenarios below, which should you use — rewind, resume, fork, or Git? Answer each and give your reasoning.

1. A task ran 20-some turns, and you notice the model picked the wrong refactoring plan on turn 12. The following turns all built on top of that wrong plan, but the process itself is still running fine, no crash.
2. The same task reached turn 18, the host machine got rebooted, the process was killed entirely, and nothing finished.
3. You're not sure whether to split a module into two services or three, and you want the agent to run each plan once so you can compare results.
4. You want to know what this code looked like three days ago, and who changed it when.

<!-- rubric -->
- Scenario 1 picks rewind, with reasoning that points at "didn't crash, but the decision went wrong and later turns all built on that mistake," not resume or fork
- Scenario 2 picks resume, with reasoning that points at "the whole process was interrupted, not a decision mistake," using checkpoint resume not rewind
- Scenario 3 picks fork, with reasoning that points at "both plans need to actually run to get results for comparison," not betting on one first
- Scenario 4 picks Git, with reasoning that points at "asking about the code's own version-controlled history, time scale is days not minutes," which isn't in checkpoint's session-level range

<!-- answer -->
1. **Rewind**. The process didn't crash; the problem is turn 12's decision itself, and the dozen following turns all built on top of that mistake. Rather than pushing ahead in a stretch of history that's already off course, roll the scene back to turn 11 (before the bad decision) and start over, swapping in a decision scene that hasn't gone wrong yet.
2. **Resume**. This isn't a decision problem; the process itself was killed entirely, unrelated to what turn 12 was thinking. What's needed is picking the loop back up from the most recent checkpoint, continuing the original execution scene, with no decision swapped out.
3. **Fork**. This isn't "one was wrong, back up" — both plans make sense, and you need to actually run each to know which is better. Copy two independent timelines off the current checkpoint, each with its own effects ledger, and run each separately. More direct than betting on one, finding it lacking, then rewinding to retry.
4. **Git**. The question here is about the code itself — "what it looked like three days ago, who changed it" — which is what version control systems manage: permanent history, spanning days rather than minutes. Checkpoints are retained per turn for quick session recovery and usually aren't kept that long, let alone recording "who changed it" collaboration data.

<!-- hint -->
Ask yourself first: did the process get killed entirely? If yes, it's resume; if no but it went off course, that's where rewind comes in.

<!-- hint -->
"Not sure which to pick" and "already picked the wrong one" aren't the same. The first calls for fork to compare; the second calls for rewind to redo. And if "the code's own history" shows up, think Git, not checkpoints.

### Level 2: Turn saveCheckpoint into a Per-Turn Sequence

The code below is the old version from earlier lessons: it overwrites the same `checkpoint.json` every time, so it can support resume but not rewind. Rewrite it the way this lesson requires: filenames follow the `turn-NNN-A.json` / `turn-NNN-B.json` per-turn retention rule; provide a `loadLatest()` for resume that defaults to the last save point written in the newest turn; and provide a `rewindTo(turn)` that grabs a specific turn's scene. After you finish, write verification: save 5 turns in a row, call `rewindTo(3)`, and confirm the returned scene's `turns` is 3 and the effects ledger `effects.json` length hasn't rolled back.

```javascript
// Old version: overwrites the same file every time, can only grab "latest," not "turn N"
import fs from "node:fs/promises";

async function saveCheckpoint(state) {
  const tmp = "checkpoint.json.tmp";
  await fs.writeFile(tmp, JSON.stringify(state, null, 2));
  await fs.rename(tmp, "checkpoint.json");
}

async function loadCheckpoint() {
  const raw = await fs.readFile("checkpoint.json", "utf8");
  return JSON.parse(raw);
}
```

<!-- rubric -->
- `saveCheckpoint` is rewritten to name files `turn-NNN-A.json` / `turn-NNN-B.json` on disk and keeps the atomic write (write `.tmp` first, then rename)
- Provides logic to find "the last save point written in a turn," and `loadLatest()` correctly grabs the newest save point in the highest turn that ran
- `rewindTo(turn)` grabs the specified turn's scene and doesn't touch `effects.json`
- The verification script runs through: after saving 5 turns `rewindTo(3).turns === 3`, and `effects.json` length is still 5 (the rewind action didn't change it)

<!-- answer -->
```javascript
import fs from "node:fs/promises";
import path from "node:path";

function turnFileName(turn, point) {
  return `turn-${String(turn).padStart(3, "0")}-${point}.json`;
}

async function saveCheckpoint(state, turn, point, dir = "checkpoints") {
  const file = path.join(dir, turnFileName(turn, point));
  const tmp = `${file}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(state, null, 2));
  await fs.rename(tmp, file); // Atomic write: tmp first, then rename as a whole
}

async function pickLatestPoint(turn, dir) {
  const files = await fs.readdir(dir);
  const prefix = `turn-${String(turn).padStart(3, "0")}-`;
  const points = files
    .filter((f) => f.startsWith(prefix))
    .map((f) => f.slice(prefix.length, prefix.length + 1))
    .sort();
  if (points.length === 0) throw new Error(`No checkpoint for turn ${turn}`);
  return points[points.length - 1];
}

async function rewindTo(turn, { point, dir = "checkpoints" } = {}) {
  const wanted = point ?? (await pickLatestPoint(turn, dir));
  const raw = await fs.readFile(path.join(dir, turnFileName(turn, wanted)), "utf8");
  return JSON.parse(raw);
}

async function loadLatest(dir = "checkpoints") {
  const files = await fs.readdir(dir);
  const maxTurn = Math.max(
    ...files.filter((f) => f.startsWith("turn-")).map((f) => Number(f.slice(5, 8)))
  );
  return rewindTo(maxTurn, { dir });
}

export { saveCheckpoint, rewindTo, loadLatest };
```

Verification script (`effects.json` uses the same atomic write to append, representing the ledger that resume and rewind never touch):

```javascript
import fs from "node:fs/promises";
import assert from "node:assert/strict";
import { saveCheckpoint, rewindTo, loadLatest } from "./checkpoint.mjs";

async function appendEffect(entry, file = "effects.json") {
  let ledger = [];
  try {
    ledger = JSON.parse(await fs.readFile(file, "utf8"));
  } catch {}
  ledger.push(entry);
  await fs.writeFile(file, JSON.stringify(ledger, null, 2));
}

await fs.mkdir("checkpoints", { recursive: true });

for (let turn = 1; turn <= 5; turn++) {
  const stateA = {
    version: 1,
    task: "demo",
    turns: turn,
    tokensUsed: turn * 100,
    messages: [{ role: "user", content: `turn ${turn} A` }],
    pendingToolUse: { name: "send_email" },
  };
  await saveCheckpoint(stateA, turn, "A");

  const stateB = {
    ...stateA,
    messages: [...stateA.messages, { role: "user", content: `turn ${turn} B` }],
    pendingToolUse: null,
  };
  await saveCheckpoint(stateB, turn, "B");

  await appendEffect({ turn, action: "send_email" });
}

const rewound = await rewindTo(3);
assert.equal(rewound.turns, 3);
console.log("rewindTo(3).turns =", rewound.turns); // rewindTo(3).turns = 3

const effects = JSON.parse(await fs.readFile("effects.json", "utf8"));
assert.equal(effects.length, 5);
console.log("effects.json length =", effects.length); // effects.json length = 5

console.log("PASSED");
```

Running `node verify.mjs` locally prints:

```
rewindTo(3).turns = 3
effects.json length = 5
PASSED
```

The first line proves `rewindTo(3)` really did roll the scene back to turn 3, not resume to the newest turn 5. The second line proves the rewind action only rebuilt the decision scene — the effects ledger was never touched, and the 5 records of what genuinely happened in those turns are all still there.

<!-- hint -->
How do you judge "the last save point written in a turn"? A and B sort lexicographically, lining up exactly with the time order "before tool execution" → "after tool result recorded," so just grab the last one after sorting. No need for extra timestamps.

<!-- hint -->
The effects ledger is a separate file (`effects.json`), fully independent of the checkpoint sequence. As long as `rewindTo` has no line of code touching it, this verification will naturally pass. No need to "protect" it specially.

<!-- /exercises -->

## Recap

- Checkpoints aren't just disaster-recovery insurance: a retained string of checkpoints is the task's timeline, and beyond resume they support rewind and fork — a community roadmap frames these three together as what the persistence component owns[^S5]
- Rewind rolls back the **decision scene**, not the **outside world**: external actions that really happened don't get undone by rewind, and the effects ledger stays append-only — Lesson 4's idempotency view carried into the rewind scenario
- Supporting rewind requires checkpoints to be retained as a per-turn sequence (like `turn-014-A/B.json`) rather than overwriting to keep only the latest; `rewindTo(turn)` defaults to the last save point written in that turn
- Fork copies independent timelines off the same scene, each with its own checkpoint sequence and effects ledger. If both timelines would hit the same high-impact tool, remember to wire an approval gate or switch to dry-run mode — otherwise it's doubled side effects
- Claude Code already ships rewind and fork as product features: checkpoints auto-created per prompt, `/rewind` can restore conversation or code separately, `/branch` and `--fork-session` for forking[^S2]. But it draws its own boundary — only tracks edits from Claude's own file editing tools, not bash command changes[^S2], and is positioned as quick session-level recovery with Git still owning long-term history and collaboration[^S2]
- Three different jobs: checkpoints own minute-scale running scene, Git owns permanent collaborative code history, the effects ledger owns external side effects that already happened. Retaining a full per-turn checkpoint sequence has disk cost; whether it's worth it depends on task scale, not which approach is inherently right[^S3]

[>> Lesson 6: Hands-On: Wiring Checkpointing and Resume onto the Harness](./06-build-checkpointing.md)


