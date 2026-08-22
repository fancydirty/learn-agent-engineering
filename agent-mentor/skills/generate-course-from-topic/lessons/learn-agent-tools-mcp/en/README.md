---
domain: Agent Engineering
tags: [MCP, tool use, protocol, permissions, intermediate]
lang: en
---
# Agent Tools and MCP: Reaching Real Systems

This course is for developers who want an agent to act on a system it cannot reach today — an internal API, a database, a ticket queue — and who keep pasting query results into chat instead. It teaches where the line falls between a Skill and a tool, what the host/client/server split makes possible, what the current Model Context Protocol specification's core actually guarantees now that it is stateless, why a tool's description decides whether the model calls it correctly, how work that outlives a single request is handled, and where the permission boundary sits when a tool description is content you did not write. It is written against the 2026-07-28 protocol revision and stamps that date on every claim about protocol behaviour; it teaches the model and the judgment, not one client's menus, and it is not an SDK tutorial.

**By the end you'll be able to (course objectives):**
- Decide whether a capability you want belongs in a Skill, in an MCP server, or in neither.
- Name which component holds the conversation, which one holds the connection, and which one holds the credentials — and predict what a server can and cannot see.
- State what the stateless core guarantees, and say where cross-request state has to live instead.
- Write a tool description and input schema a model can act on without guessing, and read a failed call to find which of the two error channels it came back on.
- Choose between a blocking call and a task handle for work that takes minutes, and say what each one costs when the connection drops.
- Draw the permission boundary for one real tool call, and name the point where content you did not write reaches the model.

**Prerequisites:** You can read JSON, run commands in a terminal, and have used a coding agent on a real task. You can read Python well enough to follow a short annotated function. No knowledge of MCP, JSON-RPC, or OAuth is assumed.

**Practice environment:** Your own agent client, terminal, and a system you already have access to. This course has no embedded sandbox, runs nothing for you, and never asks you to upload credentials or private data.

## Lessons
| # | Topic | You'll learn |
|----|------|---------|
| 01 | [Two ways to give an agent a capability](./01-tools-and-skills.md) | The line between a portable workflow and an external capability, and which problem each one solves |
| 02 | [Host, client, and server](./02-host-client-server.md) | Who talks to whom, what each role owns, and what a server is structurally unable to see |
| 03 | [What the stateless core guarantees](./03-the-stateless-core.md) | What the 2026-07-28 revision removed, what every request must now carry, and where state went |
| 04 | [The description is the interface](./04-descriptions-are-the-interface.md) | Why a tool definition is prompt engineering, and how to read a wrong call back to its cause |
| 05 | [Work that outlives a request](./05-work-that-outlives-a-request.md) | When blocking stops working, what a task handle buys, and why both sides must opt in |
| 06 | [The permission boundary](./06-the-permission-boundary.md) | Where consent actually lives, and what changes when tool text is written by someone else |

> Sources listed in [sources.md](./sources.md).
