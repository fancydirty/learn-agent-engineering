---
domain: Software development
tags: [context engineering, attention budget, context compaction, just-in-time retrieval, subagent isolation]
lang: en
outcome: Decide what goes into — and out of — the context every turn, so long tasks don't blow the window.
tier: 2
order: 8
---

# Context Engineering: Spending Finite Attention Where It Counts

This course teaches **context engineering** — the craft of deciding, on every turn of an agent's loop, which tokens the model gets to see. From course 7 you already know the history grows every time the loop turns and the model's attention budget is finite; this course tackles that head-on: what "altitude" a system prompt should be written at, whether tools and examples count as context, which information to preload and which to let the agent retrieve on its own, how to compact history and take notes on long tasks, why subagents are a context-management technique — and finally, hands-on, you'll wire a context-management layer onto the harness you built in course 7. It's for readers who've finished the first seven courses in this series. This course doesn't re-teach prompt-writing technique (course 3 in this series), doesn't cover cross-session file persistence and state recovery (course 5's topic — this course focuses on "within this one long task, what should each turn feed the model"), doesn't re-teach multi-agent collaboration patterns (course 6 — subagents come up here only through the context lens), and doesn't cover building RAG or vector databases.

## Course outline

1. [From Prompt Engineering to Context Engineering](01-from-prompt-to-context.md)
2. [Anatomy of Context: System Prompt, Tools, and Examples](02-anatomy-of-context.md)
3. [Just-in-Time Retrieval: Letting the Agent Fetch Its Own Context](03-just-in-time-context.md)
4. [Compaction and Notes: Context Management for Long Tasks](04-compaction-and-notes.md)
5. [Subagents and Context Isolation](05-subagent-context-isolation.md)
6. [Hands-On: Wiring Context Management onto the Harness](06-build-context-management.md)

## Learning goals

By the end of this course you'll be able to:
- Explain how context engineering relates to prompt engineering, and use the attention budget and context rot to explain why context is a finite resource with diminishing marginal returns
- Judge the "altitude" of a system prompt — hardcoded brittle logic at one extreme, vague signal-free guidance at the other — and rewrite it to the spot that's specific enough to guide behavior yet leaves strong heuristics
- Draw the preload vs just-in-time-retrieval boundary for a task, using lightweight identifiers (file paths, queries, links) so the agent discovers context progressively, on demand
- Design a compaction strategy for a long task: judge what must survive (decisions, unresolved problems, key implementation details) and what can go (redundant tool outputs), and use structured notes to park key state outside the context window
- Explain subagents in context-economics terms: a clean window, a compressed summary of only a thousand-odd tokens returned, and when that's worth spending several times the tokens
- Fit a stop_reason-driven harness loop with token-usage tracking, threshold-triggered compaction, and a NOTES.md structured notebook, and run a task too big for a single window to completion

## Prerequisites

- You've finished the first seven courses in this series, or have the equivalent
- You can hand-write a `stop_reason`-driven agent loop and understand that the `messages` history grows every turn and `tool_result` blocks return together (course 7)
- You know the context window is a finite resource and conversation history only grows (course 5)
- You know a subagent starts from an independent context and returns only its conclusion (course 6)
- You can read and write basic JavaScript / Node.js code (the final lesson has you write along)

## Estimated time

About 3-4 hours, including the hands-on exercise in each lesson.
