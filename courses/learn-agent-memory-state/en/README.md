---
domain: Software development
tags: [agent memory, context window, summary compaction, persistent memory, prompt injection]
lang: en
outcome: Tell memory from state, and give an agent memory that survives across sessions without being poisoned.
tier: 2
order: 5
---

# Agent Memory and State

An agent looks like it "remembers" what you discussed ten minutes ago, but that memory doesn't actually live in the model's head — it's just been stuffed, verbatim, into the context window of every request. This course takes that illusion apart: why the context window equals all of an agent's memory, why conversation history only ever grows, when you should write memory to a file, how an agent remembers where a task stands, and what security risks memory itself introduces. It's for developers who've finished the first four courses in this series and want an agent to remember information across sessions. It focuses on the chain from context window to file-level persistent memory — it does not cover building a vector database or a RAG retrieval system, nor memory training at the model level. By the end, you'll wire a readable, writable, compressible persistent memory layer onto an agent yourself.

## Course outline

1. [The Context Window Is All the Memory an Agent Has](01-context-window-is-memory.md)
2. [Managing Conversation History: Append, Truncate, Summarize](02-managing-conversation-history.md)
3. [External Memory: Files and Retrieval](03-external-memory-files.md)
4. [Structured State: How an Agent Remembers Where a Task Stands](04-structured-task-state.md)
5. [The Boundaries and Safety of Memory](05-memory-boundaries-and-safety.md)
6. [Hands-On: Adding a Persistent Memory Layer to an Agent](06-build-a-memory-layer.md)

## Learning goals

By the end of this course you'll be able to:

- Explain why "the agent has memory" is an illusion, and say exactly what the context window actually holds
- Name three strategies for a conversation history that has grown too large, and judge what each one drops and keeps
- Design a file-based external memory scheme, knowing what to write into it and when to fetch it back
- Use structured state (task lists, checkpoints) to let an agent resume from an interruption instead of starting over
- Recognize the attack paths of memory poisoning and name at least two targeted defenses
- Wire read/write tools and compaction logic onto an agent yourself, building a runnable persistent memory layer

## Prerequisites

- You've completed the first four courses in this series and can write structured prompts
- You understand the tool-calling round-trip protocol (tool_use / tool_result)
- You can read basic JavaScript (variables, functions, async/await, array methods)
- You have a local environment that can run Node.js scripts

## Estimated time

About 3-4 hours, including the hands-on exercise in each lesson.
