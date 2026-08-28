---
domain: Software development
tags: [multi-agent collaboration, orchestration, prompt design, subagents, Claude API]
lang: en
outcome: Split work across several agents without chaos: division of labor, delegation prompts, producer-reviewer.
tier: 2
order: 6
---

# Multi-Agent Collaboration

This course is about when to split a task across several agents, and how to split it. You'll learn the orchestrator-worker architecture, how to write delegation prompts a subagent can understand on its own, the situations each common collaboration pattern (pipeline, review, voting) fits, and the failure mode specific to multi-agent systems — a subagent that claims it's "done" can't be taken at its word; you have to check it yourself. It's for developers who've finished the first five courses in this series, can write basic prompts, and understand the tool-calling protocol but haven't studied multi-agent collaboration systematically. This course does not cover the source code of multi-agent frameworks, consensus algorithms from distributed systems, or how to build a general-purpose orchestration platform from scratch; lesson 6 uses the Claude API to write a runnable two-agent (producer-reviewer) pipeline as the hands-on exercise, but the goal is to understand the collaboration patterns themselves, not to ship a production-ready framework.

## Course outline

1. [Why Multiple Agents: The Limits of a Single Context](./01-why-multiple-agents.md)
2. [Orchestrator and Subagents: Fan-Out and Aggregate](./02-orchestrator-and-subagents.md)
3. [Writing Prompts for Delegation](./03-writing-prompts-for-delegation.md)
4. [Collaboration Patterns: Pipeline, Review, Voting](./04-collaboration-patterns.md)
5. [Failure and Coordination](./05-failure-and-coordination.md)
6. [Hands-On: Building a Two-Agent Review Pipeline](./06-build-a-review-pipeline.md)

## Learning goals

- Judge whether a task is worth splitting across multiple agents, and recognize the case where coordination overhead outweighs the benefit
- Explain the value of context isolation in the orchestrator-subagent architecture, and why a subagent should return only its conclusion
- Write self-contained delegation prompts for a subagent, with a clear scope and output-format requirement
- Distinguish the pipeline, producer-reviewer, and multi-perspective voting patterns and judge where each fits
- Recognize the typical failures in multi-agent collaboration — an unverifiable "done," duplicated work, conflicting results — and know how to respond
- Write a runnable producer-reviewer two-agent pipeline with the Claude API

## Prerequisites

- You've finished the first five courses in this series, can write basic prompts, understand the tool-calling protocol, know about agent memory and state, and can read basic JavaScript
- You have a Node.js environment and can run scripts in a terminal
- You have a working Claude API key (needed for the lesson 6 hands-on exercise)

## Estimated time

About 4-5 hours, including the hands-on exercise in each lesson.
