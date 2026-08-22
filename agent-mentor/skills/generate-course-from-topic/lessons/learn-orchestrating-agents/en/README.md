---
domain: Agent Engineering
tags: [orchestration, decomposition, subagents, parallelism, advanced]
lang: en
---
# Orchestrating Agents: Decomposition, Delegation, and Synthesis

This course is for people fluent with a single agent whose tasks have started outgrowing what one session can carry, and who are considering splitting the work across several. It teaches the case against doing that first — because the published evidence for multi-agent gains is narrower than the enthusiasm suggests — then teaches the lead/worker shape, why a worker returns a summary rather than its transcript, what actually bounds parallel work, and how to write a synthesis a reader can check against the artifacts instead of trusting. It ends with one real decomposition run start to finish. It covers decomposition, delegation, and failure modes; it does not teach any orchestration framework's API, and it assumes the context-isolation material from the context-engineering course rather than repeating it.

**By the end you'll be able to (course objectives):**
- Apply a decision test that tells you whether a task should stay in one session, and state the cost you would be paying if you split it.
- Write a delegation brief carrying the four things a worker needs, and predict which gap in it produces which failure.
- Explain why a worker returns a condensed summary, what that compression drops, and where to route results that must not be compressed.
- Choose between serial and parallel dispatch from the dependency structure and the shared resources involved, and name the failure each choice invites.
- Write a synthesis in which every claim is traceable to a worker's report or to an artifact, and mark the ones you verified yourself.
- Run one real decomposition end to end and produce a synthesis someone else can check without re-reading the transcripts.

**Prerequisites:** You run an agent on real multi-step work and have hit tasks it cannot finish in one session. You can create files, run commands, and read an agent's output critically. Helpful but not required: the context-engineering course, whose lesson on subagents as a context boundary is where this one picks up.

**Practice environment:** Your own agent tool, your own repository or working directory, and a text file for briefs and notes. This course has no embedded sandbox, runs nothing for you, and never asks you to upload anything.

## Lessons

| # | Topic | You'll learn |
|---|---|---|
| 01 | [The case for one agent](./01-the-cost-of-a-second-agent.md) | What splitting a task actually costs, and the evidence for and against the gain. |
| 02 | [A lead and its workers](./02-one-lead-many-workers.md) | The delegation brief a worker needs, and the failures produced by each missing part. |
| 03 | [What comes back from a worker](./03-what-comes-back-from-a-worker.md) | Why the return channel is a summary, what it drops, and where to route what must survive. |
| 04 | [Serial, parallel, and what bounds them](./04-the-limits-of-parallel-work.md) | Reading dependency structure and shared resources before choosing a dispatch shape. |
| 05 | [A synthesis that can be checked](./05-synthesis-that-can-be-checked.md) | Writing a report whose claims trace back to evidence rather than to worker confidence. |
| 06 | [One decomposition, start to finish](./06-one-decomposition-start-to-finish.md) | Running a real split on your own work and producing a checkable synthesis. |

> Sources and version boundaries are documented in [sources.md](./sources.md).
