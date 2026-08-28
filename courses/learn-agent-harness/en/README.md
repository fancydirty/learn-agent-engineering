---
domain: Software development
tags: [agent harness, loop control, stop conditions, human-in-the-loop, agent reliability]
lang: en
outcome: Hand-write a stop_reason-driven agent loop and fit it with four stop valves.
tier: 2
order: 7
---

# Agent Harness Fundamentals: Loops and Control

This course is about the agent's **harness** — the layer of control code outside the model that actually makes an agent run: it drives the "model → execute tools → feed results back → ask again" loop, decides when that loop stops, catches it when it runs away, and lets a human interrupt and redirect it mid-flight. The course centers on a single agent's execution loop and ends with you hand-writing a minimal harness with stop conditions, a budget cap, idle-spin detection, and a human approval valve. It's for readers who've finished the first six courses in this series — you need to understand one tool-call round-trip (`stop_reason: "tool_use"` / `tool_result`), agent memory and the context window, and the basics of multi-agent division of labor. This course is not an API tutorial for any particular framework (no Claude Agent SDK or LangChain specifics), doesn't cover multi-agent orchestration (that's another course in this series), and doesn't cover evaluation and regression (saved for the verification course); the focus is one layer — how the loop itself gets kept under control.

## Course outline

1. [What a Harness Is: The Control Code Around the Model](01-what-is-a-harness.md)
2. [The Core Loop: From One Round-Trip to Continuous Operation](02-the-core-loop.md)
3. [Stop Conditions: When an Agent Should Quit](03-stop-conditions.md)
4. [Runaway and Fallback: Dead Loops, Idle Spinning, Budget Burnout](04-loop-failure-modes.md)
5. [Intervention and Steering: Interrupt, Redirect, Human-in-the-Loop](05-intervention-and-steering.md)
6. [Hands-On: Hand-Writing an Agent Harness with Controls](06-build-a-harness.md)

## Learning goals

By the end of this course you'll be able to:
- Draw the line between the harness and the model, and explain why the same model with a different harness can produce wildly different results
- Hand-write the core loop that drives an agent, and explain how `stop_reason` decides whether the loop continues or stops
- Design an explicit set of stop conditions for an agent instead of relying on the model saying "I'm done"
- Recognize the runaway modes — dead loops, idle spinning, budget burnout, compounding errors — and fit the loop with a fallback for each
- Judge where in the loop a human checkpoint belongs, keeping irreversible operations out of automatic execution
- Build, from zero, a minimal harness with stop conditions, a max-turn cap, a budget cap, idle-spin detection, and an approval valve

## Prerequisites

- You've finished the first six courses in this series, or have the equivalent
- You understand one full tool-call round-trip: the model returns `stop_reason: "tool_use"`, the host executes the tool, and the `tool_result` gets spliced back into the conversation
- You know the context window is a finite resource and history keeps accumulating (course 5 in this series, "Agent Memory and State")
- You can read basic JavaScript / Node.js code (lesson 6 has you write along)
- No machine-learning or model-training background required

## Estimated time

About 3-4 hours, including the hands-on exercise in each lesson.
