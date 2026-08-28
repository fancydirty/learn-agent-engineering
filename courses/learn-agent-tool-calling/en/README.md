---
domain: Software development
tags: [agent tool calling, prompt injection, permission design, tool interface design, Claude API]
lang: en
outcome: Read the tool-calling protocol and design tool interfaces the model picks right, fills right, and can't overreach with.
tier: 1
order: 4
---

# Agent Tool Calling: Getting Agents to Actually Do Things

This course walks through the full mechanism of agent tool calling (tool use / function calling): exactly which fields travel between a tool-call request and its response, the risk boundaries of the five common tool types (read, write, execute, search, call an external API), how to write a tool interface the model both picks correctly and fills correctly, and how to put permission tiers and prompt-injection defenses into practice. It's for developers who can already write basic prompts and have used a tool like Claude Code, but haven't yet studied the underlying tool-calling protocol systematically. It does not teach any specific agent framework (LangChain, AutoGPT) and does not cover model training or fine-tuning — it focuses on the chain itself: how the model requests an action and how the host safely executes it.

## Course outline

1. [From "Just Talking" to "Taking Action": Why Agents Need Tools](01-why-agents-need-tools.md)
2. [The Full Round-Trip of a Tool Call](02-one-tool-call-round-trip.md)
3. [Five Common Tool Types: Read, Write, Execute, Search, Call](03-tool-types.md)
4. [Designing Tool Interfaces: Name, Description, Parameters, Return Value](04-designing-tool-interfaces.md)
5. [Permissions and Safety: The Boundaries of What an Agent Can Do](05-permissions-and-safety.md)
6. [Hands-On: Wiring Three Tools onto an Agent](06-build-a-tool-using-agent.md)

## Learning goals

By the end of this course you'll be able to:
- Articulate the "the model only proposes, the host executes" line in tool calling, and use it to judge whether a task actually needs tools at all
- Read and hand-write a full tool_use / tool_result round-trip, including the batched return of several parallel calls
- Classify the five tool types (read, write, execute, search, call an external API) by blast radius and spot the trap each one is most prone to
- Write the tool description, JSON Schema, and return value that let the model pick the right tool, fill the parameters right, and self-correct after a failure
- Grade tool operations with allow / ask / deny, and recognize the risks of over-authorization and the lethal-trifecta combination
- Build, from scratch, a tool-calling agent with an execution loop, a registry, and a safety valve

## Prerequisites

- You can write basic prompts and understand the basic shape of a conversation with an LLM
- You've used Claude Code or a similar AI coding tool and know it can read/write files and run commands
- You can read basic JavaScript / Node.js code (lesson 6 has you follow along in code)
- No machine-learning or model-training background required

## Estimated time

About 3-4 hours, including the hands-on exercise in each lesson.
