---
domain: Agent Engineering
tags: [context engineering, long tasks, compaction, memory, advanced]
lang: en
---
# Context Engineering: Working Past One Window

This course is for people who already run agents on real work and hit a wall on long tasks: the agent starts forgetting decisions it made an hour ago, repeats work it already did, and drifts off the thing you asked for. It teaches why filling a context window makes an agent worse rather than better, how to read a compaction boundary and predict what it will drop, how to keep the load-bearing state in files instead of in conversation history, and how to write a context budget for one of your own long tasks and finish it. It covers judgment about what enters the window; it does not cover building a harness, and it treats subagents only as a way to keep noise out of your window — orchestration and parallel fan-out belong to a different course.

**By the end you'll be able to (course objectives):**
- Explain why a longer context degrades an agent's recall, and name which of the four long-context failure modes you are looking at.
- Sort any piece of context into the four levers — write, select, compress, isolate — and pick the cheapest one that solves your problem.
- Predict what a compaction boundary will drop from your session, and place the things that must survive where compaction cannot reach them.
- Write a progress note an agent with no memory of the session could resume from.
- Decide whether a noisy workstream belongs in your window or behind a subagent boundary, and say what the boundary costs you.
- Write a context budget for one real long task, run it, and compare the budget against the session's actual usage.

**Prerequisites:** You have run an agent on multi-step tasks and read its output. You can create and edit files, and run commands your agent tool provides. No model internals, no harness building, and no programming beyond reading a file are assumed.

**Practice environment:** Your own agent tool, your own repository or working directory, and a text file for notes. This course has no embedded sandbox, runs nothing for you, and never asks you to upload anything.

## Lessons

| # | Topic | You'll learn |
|---|---|---|
| 01 | [Why a fuller window works worse](./01-context-rot-and-the-attention-budget.md) | The measured shape of long-context degradation, and the four ways it shows up in your run. |
| 02 | [Four levers on the window](./02-write-select-compress-isolate.md) | Sort every context problem into write, select, compress, or isolate, and reach for the cheapest fix. |
| 03 | [Reading a compaction boundary](./03-what-compaction-keeps.md) | What a summary keeps, what it drops, and why the drop is systematic rather than random. |
| 04 | [Notes the window cannot lose](./04-notes-outside-the-window.md) | Write progress notes that a session starting from nothing can actually resume from. |
| 05 | [Putting noise behind a boundary](./05-subagents-as-a-context-boundary.md) | Use a subagent to keep a loud workstream out of your window, and price what the boundary costs. |
| 06 | [A context budget for one task](./06-a-context-budget-for-one-task.md) | Allocate a real task's window in advance, run it, and check the budget against what was actually spent. |

> Sources and version boundaries are documented in [sources.md](./sources.md).
