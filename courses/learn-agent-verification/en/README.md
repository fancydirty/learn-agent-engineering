---
domain: Software development
tags: [agent evals, verifiers, LLM judge, eval sets, quality assurance]
lang: en
outcome: Build an eval track for your agent's output that separates "looks done" from "is done."
tier: 2
order: 10
---

# Verification and Quality Assurance: Don't Let 'Looks Right' Slip Through

This course is about **accepting an agent's output**. The last few courses got your agent running, and running long: the harness loop from course 7, context management from course 8, checkpoints and recovery from course 9. But "finished the run" and "got it right" are two different things — agents are non-deterministic, the same task takes two different paths on two runs, and traditional testing's assumption ("given input X, take path Y, produce output Z") simply collapses. This course teaches you to do solid acceptance under that premise: first separate "looks done" from "is done," then decide what to verify (end state first, process as backstop), what to verify with (deterministic verifiers that output pass/fail come first; LLM judges only for free-form text), and how many cases to verify against (start from 20 real tasks — don't wait to hoard hundreds), and finally build an eval track for your own agent: one task per loop, a report at the end, so a prompt change shows up as a score change. It's for readers who've finished the first nine courses in this series. This course doesn't teach general software-testing methodology (how to write unit tests isn't covered), doesn't teach any specific eval framework or platform API, and doesn't cover model-training-side benchmark construction; wiring evals into CI is mentioned as engineering common sense but not developed.

## Course outline

1. ['Looks Done' Isn't 'Is Done'](01-looks-done-vs-is-done.md)
2. [What to Verify: End State First, Process as Backstop](02-what-to-verify.md)
3. [Deterministic Verifiers: Only Checks That Output Pass/Fail Count](03-deterministic-checks.md)
4. [LLM as Judge: Rubrics, Formats, and What Not to Let It Judge](04-llm-as-judge.md)
5. [Eval Sets: Start with 20 Real Tasks](05-eval-sets.md)
6. [Hands-On: Build an Eval Track for Your Agent](06-build-eval-harness.md)

## Learning goals

By the end of this course you'll be able to:
- Explain how agent non-determinism breaks traditional testing's path assumption, and why "looks done" becomes the only signal when there's no runnable check
- Define measurable success criteria for an agent task, and decide between verifying the end state and placing state checkpoints at key nodes — instead of auditing the trajectory step by step
- Pick verifiers in fastest-most-reliable-most-scalable order: deterministic checks first (exact match, script comparison, test suites), and recognize traps like an over-strict verifier failing correct output
- Design an LLM judge for free-form output: a multi-dimension rubric, a constrained output format, reason-then-score — and explain why the model that did the work shouldn't grade it, and why a judge told to find problems always finds something
- Build an eval set starting from about 20 real tasks: match the real distribution, add edge cases, favor count over per-item polish, hold out a set against overfitting — and explain why a handful of early cases is enough when the effect size is large
- Build a repeatable eval track for your own agent: one harness loop per task, layered scoring with deterministic verifiers plus an LLM judge, duration and call metrics recorded beyond pass rate — and use it to measure the real impact of one prompt change

## Prerequisites

- You've finished the first nine courses in this series, or have the equivalent
- You can hand-write a `stop_reason`-driven harness loop and understand `tool_use`/`tool_result` pairing (course 7)
- You know how checkpoints and the effects ledger hit disk (course 9; this course's eval track reuses the harness loop skeleton)
- You can read and write basic JavaScript / Node.js code (lesson 6 has you write along)

## Estimated time

About 3-4 hours, including the hands-on exercise in each lesson.
