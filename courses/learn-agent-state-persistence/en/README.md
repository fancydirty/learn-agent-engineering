---
domain: Software development
tags: [state persistence, checkpoints, resume from interruption, idempotency, rewind and fork]
lang: en
outcome: Make long tasks survive interruption: checkpoints, an effects ledger, resume from the break.
tier: 2
order: 9
---

# State Management and Persistence: Making Long Tasks Survive Interruption

This course is about an agent's **execution state** — not what the model "remembers" (that's memory, the territory of courses 5 and 8 in this series), but the running scene the harness itself is holding: the `messages` array, the turn and usage counters, the tool calls not yet written to the ledger. When the process dies, every file on disk survives, but that scene is gone — and the task starts over from zero. This course teaches you to turn the scene into something you can write to disk and restore: checkpoint every step, pull the loop back up from the break after a crash, tell on resume which tools are safe to re-run and which aren't (idempotency), then put checkpoints to their second use — rewinding to an earlier scene and forking an alternate attempt — and finally, hands-on, wire full checkpointing and resume onto the harness you wrote in course 7. It's for readers who've finished the first eight courses in this series. This course doesn't re-teach memory or context management (course 5 covers what the model remembers across sessions; course 8 covers what each turn shows the model; this course covers what the harness itself records), doesn't teach external workflow-engine APIs like Temporal, and doesn't cover multi-process concurrency or distributed consistency; Claude Code's checkpointing appears only as a product reference — what you build here is one for your own harness.

## Course outline

1. [Beyond Memory, There's State](01-memory-vs-state.md)
2. [Checkpoints: Writing the Execution Scene to Disk](02-checkpoint-anatomy.md)
3. [Resuming from a Checkpoint: Restarting the Loop](03-resume-from-checkpoint.md)
4. [Side Effects and Idempotency: Which Tools Are Safe to Re-Run on Resume](04-side-effects-idempotency.md)
5. [Rewind and Fork: The Second Value of Checkpoints](05-rewind-and-fork.md)
6. [Hands-On: Wiring Checkpointing and Resume onto the Harness](06-build-checkpointing.md)

## Learning goals

By the end of this course you'll be able to:
- Separate an agent's memory (the context fed to the model) from its execution state (the running scene the harness holds), and explain why "agents are stateful and errors compound" makes a crash uniquely deadly for long tasks
- Design checkpoints for a harness loop: which fields must enter the snapshot, when to write it, and how to write it without corrupting the checkpoint file itself
- Implement resume: rebuild `messages` and the counters from a checkpoint, re-enter the loop, and correctly handle the dangling call left when the crash landed between tool execution and the ledger write
- Backstop recovery with idempotency: judge which tools are harmless to re-run and which must be protected from double execution, and fit high-impact tools with idempotency keys
- Use checkpoints beyond disaster recovery: rewind to an earlier scene to retry, fork an alternate attempt, and state the division of labor between checkpoints and version control
- Wire the course-7 harness with the full mechanism — per-turn persistence, --resume recovery, dangling-call reconciliation, idempotent re-run protection — and demonstrate a long task interrupted mid-run and carried to completion

## Prerequisites

- You've finished the first eight courses in this series, or have the equivalent
- You can hand-write a `stop_reason`-driven harness loop and understand that `tool_use`/`tool_result` must pair one-to-one (course 7)
- You know context-window management and compaction (course 8; this course's checkpoints cooperate with its `tokensUsed` counter)
- You can read and write basic JavaScript / Node.js code (lesson 6 has you write along)

## Estimated time

About 3-4 hours, including the hands-on exercise in each lesson.
