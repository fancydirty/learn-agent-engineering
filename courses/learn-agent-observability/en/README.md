---
domain: Software development
tags: [observability, debugging, tracing, structured logging, metrics]
lang: en
outcome: Fit your agent with logs, metrics, and a trace tree, so a failure traces back to the exact message.
tier: 3
order: 11
---

# Observability and Debugging: Seeing Every Step Your Agent Takes

This course is about **seeing what your agent actually did**. The previous course (number 10 in this series) settled "did it pass" — end-state scoring, verifiers, eval sets. But an eval only hands you a pass/fail. When a user reports "it can't find information that's obviously right there," you still can't say why: was the search query badly phrased? Were the sources badly chosen? Did the tool simply error out? From the outside, those causes look identical. Worse, agents are non-deterministic between runs — the same prompt takes two different paths on two runs, so the traditional debugging instinct of "reproduce it, then set a breakpoint" stops working. This course teaches you to turn "can't say" into "can look it up": first establish that the raw transcript (the full round-trips of tool calls and responses) is the first-hand evidence and the agent's self-report doesn't count; then fit the harness with structured logs and metrics (duration, call counts, tokens, errors — this time not for scoring but for watching production); then string the scattered records into a trace tree with correlation IDs, so every model request and tool execution triggered by one prompt reads as a whole; then learn to place probes at the loop's gates with hooks and walk a debugging workflow built for non-determinism; and finally wire a full observability layer onto your course-7 harness and trace one "can't say" symptom to the exact step that went wrong. It's for readers who've finished the first ten courses in this series. This course doesn't teach any specific observability platform (Datadog, Grafana, and the like are named only where citations name them), doesn't cover alert thresholds or SLO design (the first-party material gives no numbers), and doesn't repeat course 10's eval methods — there the metrics score, here the same metrics diagnose.

## Course outline

1. [Why You Can't Say What Went Wrong](01-why-you-cant-see-why.md)
2. [First-Hand Evidence: The Raw Transcript, Not Its Self-Report](02-transcripts-as-evidence.md)
3. [Structured Logs and Metrics: Turning Every Step into Data](03-logs-and-metrics.md)
4. [Tracing: Threading One Run into a Tree](04-tracing.md)
5. [Probes at the Gates: Hooks and a Debugging Workflow](05-hooks-and-debugging.md)
6. [Hands-On: Wiring an Observability Layer onto the Harness](06-build-observability.md)

## Learning goals

By the end of this course you'll be able to:
- Explain how non-determinism breaks "reproduce, then debug": the same prompt takes two different but equally legal paths, and one symptom sits on top of several causes that look identical from outside
- Use raw transcripts as first-hand evidence: read the full round-trips of tool calls and responses, catch behavior the agent's chain of thought and self-report never mention, and explain why the self-report can't be trusted
- Design structured logs and metrics for your own harness: one record per model request and per tool call, covering duration, call counts, tokens, and errors — and map metric patterns to concrete fixes using the official diagnostic readings
- String scattered records into a trace tree with correlation IDs: everything one prompt triggered reads as a whole, subagents nest into the parent trace — and know how the telemetry pipeline itself lies to you (silent failures, batch loss)
- Place probes at the loop's lifecycle gates: separate per-session, per-turn, and per-tool-call observation points, capture complete call records with PostToolUse, and localize problems along the workflow of filter by prompt id → find the first divergence → replay step by step with identical inputs
- Wire the course-7 harness with a complete observability layer (JSONL structured logs + trace-tree printing + metrics rollup), and walk one full debugging drill: symptom → filter → localize → fix → re-run comparison (real runs resume from the failure point)

## Prerequisites

- You've finished the first ten courses in this series, or have the equivalent
- You can hand-write a `stop_reason`-driven harness loop and understand `tool_use`/`tool_result` pairing (course 7)
- You know the eval track and the metrics beyond pass rate (course 10; this course moves the same metrics from scoring to diagnosis)
- You can read and write basic JavaScript / Node.js code (lesson 6 has you write along)

## Estimated time

About 3-4 hours, including the hands-on exercise in each lesson.
