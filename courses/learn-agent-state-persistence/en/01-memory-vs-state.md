# Lesson 1: Beyond Memory, There's State

> Learning goals:
> - In one sentence, tell "memory" (the context you feed the model) apart from "execution state" (the running scene the harness is holding), and give an example of each
> - Name at least three concrete grounds for why "a crash is especially deadly to a long task," and say which part of the run each one points at
> - Given a list of things a running harness is juggling, decide whether each is memory, execution state, or a disk output — and whether it survives the process being killed
>
> Prerequisites: You've finished the earlier courses in this series and understand the `stop_reason`-driven harness loop from "Agent Harness Fundamentals: Loops and Control" and context management from "Context Engineering: Spending Finite Attention Where It Counts" | Next: [Lesson 2 >>](./02-checkpoint-anatomy.md)

## Turn 23, and the process gets killed

Picture the harness you wrote in "Agent Harness Fundamentals: Loops and Control" running a long task that takes 40 turns: read a batch of files, analyze them one at a time, and append conclusions to a report as it goes. On turn 23, the process gets killed — maybe a deployment update, maybe the server lost power, maybe you fat-fingered Ctrl+C.

You check the disk: the report files from the first 22 turns are all there; `NOTES.md` (that task-progress summary you set up in "Context Engineering: Spending Finite Attention Where It Counts") still records "which file I've analyzed up to, and what the conclusion was." Looks like not much was lost — just restart the process and pick up where it left off.

But once you restart you find the `messages` array in `runAgent` is empty — it has to rebuild from `[{ role: "user", content: userInput }]`. The `turns` counter is back to zero. `tokensUsed` is back to zero too. And if the crash landed on turn 23 right between "the model named a tool" and "the tool result got pushed back into `messages`," that tool call — whether it had just started running or had already finished — now leaves no trace either.

The task doesn't resume from turn 23; it starts over from turn 1. The files on disk are all there, but the harness's own record of "how far did I get" left nothing behind.

## What memory is, what state is

Before this course can teach what it's here to teach, it has to draw a line against a concept that's easy to blur.

**Memory** is the context you feed the model — Course 5, "Agent Memory and State," covers how to persist it across sessions, and Course 8, "Context Engineering: Spending Finite Attention Where It Counts," covers exactly what you feed the model to look at each turn. It answers the question "what has the model seen?" `NOTES.md` is one vehicle for memory: it's already written to disk, and the next turn or the next session can read it back and drop it into the prompt.

**Execution state** is the running scene the harness process itself is holding — the `messages` array, counters like `turns` and `tokensUsed`, the tool call that hasn't been recorded yet. It answers the question "does the harness remember how far it got?"

The key difference between the two isn't "what the content is" but "where it lives right now." Memory may already be on disk (`NOTES.md` sits in the filesystem, and whether the process lives or dies doesn't change that it's still there); execution state, by default, lives only in the process's memory — the thing the line `let messages = [...]` creates, until someone deliberately writes it to disk, gets reclaimed along with the memory the moment the process exits. Nothing in the last section — `messages`, `turns`, `tokensUsed`, the dangling tool call — is written to disk on its own.

```javascript
// At the instant turn 23 is running, these things live only in the node process's memory
let state = {
  messages,        // the full conversation history — the only source for restoring context
  turns,           // which turn we're on
  tokensUsed,      // cumulative usage
  pendingToolUse,  // a tool the model named, whose result hasn't been pushed back into messages yet
};
```

This `state` is exactly what this course will teach you to turn into something that can be written to disk and restored.

## Why this is make-or-break for long tasks

First, do the accounting: "Agents can run for long periods of time, maintaining state across many tool calls."[^S1] That's precisely why the `messages` array on turn 23 keeps growing. But it also means "Agents are stateful and errors compound."[^S1]: the more state piles up, the moment something in the chain goes wrong the cost isn't linear, it stacks.

Add one more: "Without effective mitigations, minor system failures can be catastrophic for agents."[^S1] Putting "minor" and "catastrophic" side by side describes exactly the turn-23 situation — the process getting killed is an ordinary operations event on its own, but it wipes 22 turns of execution state in one stroke, and that's what magnifies the cost.

After an error, "When errors occur, we can't just restart from the beginning: restarts are expensive and frustrating for users."[^S1] So what you want to build is a system where, "Instead, we built systems that can resume from where the agent was when the errors occurred."[^S1] — which is why "beyond memory, there's state" isn't an academic distinction but the foundation for whether a long task can survive an interruption.

The longer the task, the heavier this bill: "The LLM will potentially operate for many turns, and you must have some level of trust in its decision-making."[^S3], and "The autonomous nature of agents means higher costs, and the potential for compounding errors."[^S3]. The more turns it runs, the thicker the execution state it accumulates, and the more a single interruption can erase.

## Crashes aren't rare

That "process got killed" on turn 23 sounds like a low-probability accident, but for a long task that runs dozens of turns, getting interrupted partway through isn't unusual at all. Even the most routine deployment update can collide with a running agent — which is why teams deliberately "use rainbow deployments to avoid disrupting running agents, by gradually shifting traffic from old to new versions"[^S1], the reason being that "whenever we deploy updates, agents might be anywhere in their process."[^S1].

In other words, even the people running operations assume "the agent can be interrupted at any moment" as something that will happen, and design mechanisms specifically to dodge it. Your harness has no reason to assume it'll be luckier.

## The cure, in preview: this course's roadmap

The execution state lost on turn 23 has a five-step fix, which is also the order of the next five lessons:

1. **Checkpoints** (Lesson 2) — periodically serialize execution state like `messages`, `turns`, `tokensUsed`, and the dangling tool call to a checkpoint file on disk.
2. **Resuming from a checkpoint** (Lesson 3) — after the process restarts, read that state back out of the checkpoint file, rebuild `messages`, and let the loop pick up where it broke instead of starting over from turn 1.
3. **Side effects and idempotency** (Lesson 4) — the hardest part of resuming isn't "the state is gone," it's "some tool calls may actually have run already": which tools are safe to re-run, and which must be guarded against running twice.
4. **Rewind and fork** (Lesson 5) — checkpoints aren't only for disaster recovery; they also let you rewind to an earlier scene and retry, or fork off another attempt from some node.
5. **Hands-on** (Lesson 6) — take the machinery from the earlier lessons, fit it into the harness from "Agent Harness Fundamentals: Loops and Control," and run a long task through "killed partway, restart, run through to completion" yourself.

A community open-source roadmap built around "harness engineering" boils this down to one line: "Checkpoint state every node so you can resume, rewind, fork."[^S5] — that's just a framing note from a community doc about what the persistence component is responsible for, not a spec this course copies verbatim, but the order it points to lines up with the five steps above.

## Proportion: not every task needs this

Not every agent has to carry the checkpoint machinery. On adding complexity, "you should consider adding complexity only when it demonstrably improves outcomes."[^S3] — a task that wraps up in a few tool-call turns has only a handful of entries in `messages`, and if the process dies you just re-run it; the cost is asking once more, not worth designing a whole save-and-restore mechanism for.

What actually needs the machinery in this course is a scenario like turn 23 at the top: a task that runs dozens of turns, may take minutes to hours, and accumulates a large pile of un-persisted execution state along the way. To decide whether to bring in checkpoints, ask yourself one question first: if it got killed right now, can you live with the cost of re-running it? If you can't, that's when the next few lessons come in.

```agentmentor-check
{
  "id": "sp-zh-01-restart-illusion",
  "label": "Judging whether you can just restart and re-run after the process crashes",
  "prompt": "Your harness is running a 40-turn long task, and on turn 23 the process gets killed (say it collided with a deployment update). You check the disk: the report files from the first 22 turns are all there, and `NOTES.md` records the progress completed so far. You conclude: this crash did no real damage, just restart the process and run the task from the top. Does that conclusion hold up?",
  "whyHere": "This lands right after teaching the physical-location difference between memory and execution state — memory may already be on disk, execution state lives only in process memory by default. \"The output files are all on disk, so nothing was lost\" is the intuition trap it's easiest to fall into here, and it has to be corrected on the spot.",
  "mode": "single",
  "choices": [
    {
      "id": "a",
      "text": "It holds up — the report files and NOTES.md are both on disk, so nothing was lost; just restart and re-run from the top",
      "correct": false,
      "feedback": "Files on disk don't mean the execution state is still there. The `messages` array, `turns`, and `tokensUsed` are variables in process memory, and until someone deliberately serializes them to disk they get reclaimed along with the memory the moment the process dies — they and the already-persisted report files and `NOTES.md` physically live in two different places, and one being gone doesn't mean the other is still around."
    },
    {
      "id": "b",
      "text": "It doesn't hold up, but the only thing really lost is the tokensUsed counter; the messages array and the dangling tool call can actually be reconstructed from the report files already generated",
      "correct": false,
      "feedback": "The report files are the output of the task run up to some step, not a record of the run itself — they don't preserve what the model said each turn, the full arguments and result of each tool call, or whether the crash caught a tool call mid-flight. You can't reverse-engineer those details from the output, so the messages array and the dangling call can't be recovered from it; that takes a purpose-built snapshot."
    },
    {
      "id": "c",
      "text": "It doesn't hold up — the running scene the harness holds (the messages array, the turn and usage counters, the tool call not yet recorded) lives only in process memory by default and is gone the moment the process dies; restarting is expensive, and re-running from the top can also replay side effects that already happened",
      "correct": true,
      "feedback": "Right. You can't restart from the beginning after an error, because restarts are expensive and frustrating, which is exactly why you build systems that resume from where the error occurred. Worse, \"run it all again\" isn't just wasted time — if a tool in the first 22 turns actually executed (sent an email, changed a record), running from turn 1 again means those actions happen a second time. How to handle that kind of side effect is Lesson 4's business."
    }
  ]
}
```

<!-- exercises -->
## 💻 Exercises

### Level 1: Classify six running "things"

Below are six "things" involved in a running harness. Sort each one into "memory," "execution state," or "disk output," and say: if the process is killed at this instant, is it still there?

1. The task-progress summary already written into `NOTES.md` (the one you set up in "Context Engineering: Spending Finite Attention Where It Counts")
2. The in-memory `messages` array
3. The report file `report.md` already written to disk
4. The `turns` counter (which turn we're on)
5. A stretch of analysis about the project's structure in the response text the model just produced this turn — not yet written into `NOTES.md`
6. A `tool_use` block that the model has named, whose tool hasn't finished running and whose result hasn't been pushed back into `messages`

<!-- rubric -->
- All six get a classification, and the broad strokes are right: `messages`, `turns`, and the dangling `tool_use` go to "execution state"; the already-persisted `NOTES.md` summary goes to "memory" (with a note that it's on disk), and `report.md` goes to "disk output" — both are on disk, but one is context to feed back to the model and the other is a task-output artifact, so they belong to different categories; item 5 goes to "memory" but with a special note that it's not yet persisted
- Can articulate that "memory" isn't the same as "already persisted" — item 5 proves memory itself can still be sitting in process memory and get lost with the process, the same predicament as execution state
- The "still there / gone" call after a crash is accurate: items 1 and 3 are still there; items 2, 4, and 6 are gone; item 5 is gone too (because even though it's memory content, it wasn't persisted in time)

<!-- answer -->
1. **Memory, already persisted** — `NOTES.md` is a vehicle for context fed to the model, and this summary is already written into the file; a process crash doesn't touch it, and it can be read back after restart.
2. **Execution state** — the `messages` array is the conversation history the harness itself holds, living only in process memory; it's wiped on a crash and has to be rebuilt from scratch.
3. **Disk output** — `report.md` is the artifact the task run produced, already persisted, and there unchanged after a crash.
4. **Execution state** — `turns` is a counter variable in memory, back to zero after a crash; on resume you need to know which turn to keep counting from.
5. **Memory, but not persisted** — this "understanding of the project's structure" is essentially the same kind of thing as what's in `NOTES.md` (both are context to feed the model), but at this instant it exists only in the model's response text for this turn. If the harness hasn't gotten it into `NOTES.md` yet and the process crashes, that understanding goes with it. This shows the "memory" vs. "execution state" classification isn't exactly the same as "on disk" vs. "in memory" — memory too can be not-yet-persisted.
6. **Execution state** — this dangling `tool_use` block is the classic "crash between tool execution and the result being recorded" case, existing only in the in-memory `messages` or some pending queue; after a crash it leaves no record at all, and Lesson 3 handles this kind of break specifically.

<!-- hint -->
Don't use "on disk" vs. "in memory" as the only test — item 5 is a counterexample: it's memory by content, but at this instant it isn't persisted yet.

<!-- hint -->
Items 2, 4, and 6 share something: they're all things the harness loop uses while running to record "how far did I get," and without a purpose-built persistence mechanism they die with the process.

### Level 2: Write a crash-loss inventory for the harness from "Agent Harness Fundamentals"

Back to the opening scenario: the `runAgent` from "Agent Harness Fundamentals: Loops and Control" (driven by a `stop_reason` loop over the variables `messages`, `turns`, `tokensUsed`) is running a 40-turn task, and on turn 23 the process gets killed — and the crash lands exactly between "the model named a tool" and "the tool result got pushed back into `messages`." Without writing code, do two things in words:

1. **Crash-loss inventory**: what exactly did this crash lose? What wasn't affected and is still there?
2. **What the checkpoint should hold**: if this harness had a checkpoint mechanism, which fields do you think the checkpoint file needs to hold, at minimum, to keep this loss as small as possible? List the field names and say why each one has to be saved.

<!-- rubric -->
- The loss inventory explicitly calls out the `messages` array, `turns`, `tokensUsed`, and the `tool_use` call stuck between tool execution and result-recording — all of these in-memory things are lost; and recognizes that the output files already generated on disk and `NOTES.md` are unaffected and still there
- The field proposal covers at least `messages`, `turns`, and `tokensUsed` — the three ready-made variables you can recognize directly from the `runAgent` code — and gives a one-line "why save it" for each (e.g., `messages` is the only source for restoring conversation context, `turns` is for judging how far off the turn cap is, `tokensUsed` feeds the budget and compaction threshold from "Context Engineering: Spending Finite Attention Where It Counts")
- Recognizes that "a tool call executing, not yet recorded" needs its own field (even if you name it yourself; it doesn't have to match the name later lessons use), and explains that this is because the crash may land exactly between the tool finishing and the result being written back into `messages`, so without a separate record there's no way to judge whether the call counts

<!-- answer -->
**Crash-loss inventory**:
- Lost: the in-memory `messages` array (the first 22 turns plus the part of turn 23 already assembled into it), the `turns` counter (which should have been 22 or 23), the `tokensUsed` cumulative usage, and the tool call stuck between "the model already named it" and "the result not yet pushed back into `messages`" — whether it finished without being recorded or never finished at all is completely undecidable after restart.
- Not lost: the report files already written on disk from earlier turns, and the progress summary already persisted in `NOTES.md`; a process crash doesn't touch these, and they're there unchanged.

**Fields the checkpoint should hold**:
- `messages` — the only source for restoring conversation context; without it, everything the model saw and said before turn 23 can't be rebuilt.
- `turns` — after resume you have to know how many turns you've already run to correctly judge how far off the turn cap is, so you don't hit the cap the instant you resume or, the other way, hand yourself extra turns.
- `tokensUsed` — after resume you have to keep counting usage to line up with the budget and compaction threshold set in "Context Engineering: Spending Finite Attention Where It Counts," otherwise you've resumed an agent that doesn't know how much it has spent.
- A field dedicated to recording "a tool call executing, not yet recorded" — because the crash may land exactly between the tool finishing and the result being written back into `messages`. Without separately recording this call's identity and arguments, on resume you know neither whether to re-run it nor what kind of result to backfill into `messages`.

<!-- hint -->
Flip back to the body of `runAgent` in "Agent Harness Fundamentals: Loops and Control" and see which variables it pushes things into as the loop turns — those variables are basically the backbone of both the loss inventory and the checkpoint fields.

<!-- hint -->
The exact moment of the crash matters: a crash between "the model response arrived" and "the tool actually started running" versus one between "the tool finished" and "the result got pushed back into messages" leads to different answers on whether the tool call counts and how to handle it — settle that first, then decide what information this field should record.

<!-- /exercises -->

## Recap

- Agents can run for long periods, maintaining state across many tool calls, and precisely because of that they're stateful and errors compound[^S1] — the more state piles up, the more a single failure can erase.
- Without effective mitigations, a minor system failure can be catastrophic for an agent[^S1]; after an error you can't restart from the beginning, because restarts are expensive and frustrating for users, so you build systems that resume from where the error occurred[^S1].
- Crashes aren't rare — even a routine deployment update calls for rainbow deployments specifically to avoid disrupting running agents, because at deploy time an agent might be anywhere in its process[^S1].
- Autonomous operation inherently carries higher costs and the risk of compounding errors[^S3]; the longer the task, the heavier this bill, and the more it needs a mechanism that survives interruption.
- Not every task has to carry this machinery — add complexity only when it demonstrably improves outcomes[^S3], and for a task that wraps up in a few turns the cost of just re-running it is usually acceptable.
- Memory (the context fed to the model) and execution state (the running scene the harness holds) are two different things: memory may already be persisted, execution state lives only in process memory by default — and the next few lessons are about turning that execution state, too, into something that can be written to disk and restored.

[>> Lesson 2: Checkpoints: Writing the Execution Scene to Disk](./02-checkpoint-anatomy.md)
