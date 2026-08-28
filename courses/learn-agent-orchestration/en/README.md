---
domain: Software development
tags: [orchestration, workflow patterns, parallelization, orchestrator-workers, multi-agent systems]
lang: en
outcome: Upgrade your single-loop harness into an orchestration script with routing, fan-out, and a review loop.
tier: 3
order: 12
---

# From Loops to Graphs: Orchestration Engineering for Agent Systems

This is the series finale, and it's about **the layer of engineering above one loop**. The harness you hand-wrote in course 7 is a loop — in the official phrasing, agents "are typically just LLMs using tools based on environmental feedback in a loop." But past a certain task size, one loop stops being enough: the thing to process outgrows one context window, the same step has to repeat across dozens of items, or the job needs more agents than one conversation can coordinate. This course teaches you to take control flow back from the model into code: first draw the architectural line between a workflow (LLMs and tools orchestrated through predefined code paths) and an agent (the model directing its own process), with "who holds the plan" as the axis; then write the production-proven workflow patterns into code one by one — chaining and routing, parallelization (sectioning and voting), orchestrator-workers, the evaluator-optimizer loop; face a real production system's ledger honestly: the 90.2% improvement (their internal research eval, an Opus 4 lead with Sonnet 4 subagents, strongest on breadth-first queries) and the 15× token cost are two sides of one coin, and the synchronous-execution bottleneck, the explosion of coordination complexity, and the four elements of a dispatch prompt are all potholes they hit; and finally compose the patterns — this course calls the composition a "graph," which is our own drawing, not official vocabulary — and hands-on upgrade your course-7 single-loop harness into a deterministic orchestration script: routing, fan-out, merge, review loop. The loop is still the same loop; the plan just moved into code. It's for readers who've finished the first eleven courses in this series. This course doesn't teach any third-party orchestration framework (LangGraph and the like go unmentioned), doesn't re-teach multi-agent division of labor and communication (course 6), and doesn't re-teach workflow concepts and diagrams (course 2) — what this course owns is **how control flow becomes a piece of code you can read, run, and re-run**.

## Course outline

1. [When One Loop Isn't Enough](01-when-one-loop-isnt-enough.md)
2. [Chain It, Route It: Chaining and Routing](02-chaining-and-routing.md)
3. [Parallelization: Sectioning and Voting](03-parallelization.md)
4. [Orchestrator-Workers: Making Decomposition Itself Dynamic](04-orchestrator-workers.md)
5. [The Review Loop, and Composing Patterns into a Graph](05-evaluator-and-graphs.md)
6. [Hands-On: Upgrading Your Harness into a Small Graph](06-build-a-graph.md)

## Learning goals

By the end of this course you'll be able to:
- State the architectural distinction between workflow and agent (predefined code paths vs the model directing its own process), place a system on the determinism spectrum by asking who holds the plan, and recognize both the real triggers for "one loop isn't enough" and the cases that don't deserve orchestration
- Write chaining and routing as code: each stage a full harness loop, programmatic gates between stages, classification dispatching to specialized prompts — and know what that buys and what it costs
- Implement both variants of parallelization (sectioning and voting), aggregate results in code, explain fan-out's gains (speed, independent perspectives, parallel context capacity) and costs (results land back on the orchestrator; real products all cap concurrency), and control merge cost by passing references, not payloads
- Implement orchestrator-workers and state its key difference from parallelization (subtasks aren't predefined — the orchestrator decides them from the input); equip dispatch prompts with the four elements (objective, output format, tool guidance, task boundaries), budget by task complexity, and face the synchronous bottleneck and the three costs of going async
- Implement the evaluator-optimizer loop (check, fix, check again — until it passes or stops improving) with the two signals that tell you whether it's worth building; compose the five patterns into what this course calls a "graph" — knowing it's this course's own engineering metaphor, anchored on the first-party line that the workflow script itself holds the loops, branches, and intermediate results
- Hands-on, upgrade your course-7 single-loop harness into a deterministic orchestration script — route → fan out three workers → merge → review loop → report — with state in script variables and a step-by-step audit trail, and check it line by line against the promises lessons 3, 4, 5 and courses 7, 9, 10, 11 made

## Prerequisites

- You've finished the first eleven courses in this series, or have the equivalent
- You can hand-write a `stop_reason`-driven harness loop (course 7; every node of this course's "graph" is one)
- You know multi-agent division-of-labor principles and dispatch prompts (course 6), eval-based verification (course 10), and observability (course 11)
- You can read and write basic JavaScript / Node.js code (lesson 6 has you write along)

## Estimated time

About 3-4 hours, including the hands-on exercise in each lesson.
