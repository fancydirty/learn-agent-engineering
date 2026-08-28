# Sources

## S1 — Context windows

URL: https://platform.claude.com/docs/en/build-with-claude/context-windows

- authority: official-docs

Anthropic's official docs explain what the "context window" — the model's working memory — is made of: the system prompt, every message (including tool results, images, and documents), tool definitions, and the model's own output for the turn (including extended thinking) all count. It also defines "context rot" (accuracy and recall degrade as token count grows) and notes that each response reports its consumption in the usage field. This is the main basis for lesson 1 ("The context window is all the memory an agent has") and background support for lesson 2 ("conversation history only grows").

Key quote:
> "As token count grows, accuracy and recall degrade, a phenomenon known as *context rot*. This makes curating what's in context just as important as how much space is available."
> "Everything in the request counts toward the context window: the system prompt, every message in messages (including tool results, images, and documents), and your tool definitions. The output Claude generates for the turn, including its extended thinking, counts too."
> "As the conversation advances through turns, each user message and assistant response accumulates within the context window, and previous turns are preserved completely."
> "The context window (up to 1M tokens, depending on the model) holds the conversation history plus the new output Claude generates."
> "Every response reports what the request consumed in its `usage` field."

## S2 — Context engineering: memory, compaction, and tool clearing

URL: https://platform.claude.com/cookbook/tool-use-context-engineering-context-engineering-tools

- authority: official-docs

Anthropic's official cookbook precisely defines the three mechanisms for handling context bloat: compaction (distills the whole window into a high-fidelity summary, at the cost of one summarizer inference), tool-result clearing (drops only stale, re-fetchable tool results while keeping the call record), and the memory tool primitive (moves information out of the window so it survives across sessions). It explains they can be used independently or together, and that clearing and compaction only act on the current context and don't help a new session. Main basis for lesson 2 ("managing conversation history") and background for lessons 3, 4, and 6.

Key quote:
> "Compaction distills the contents of a context window into a high-fidelity summary, letting the agent continue with minimal performance degradation when the conversation gets long."
> "Tool-result clearing addresses the bloat from tool use itself. As an agent pulls in tools and calls them, the results pile up, and deciding how much of that tool output to keep becomes an increasingly important part of managing context. Clearing drops old, re-fetchable results while keeping the record that the call happened."
> "A rough mental model for prioritizing: compaction compresses the whole window when it grows too large, clearing drops stale re-fetchable data inside the window, and memory moves information out of the window so it survives across sessions."
> "Compaction | compact_20260112 | compact-2026-01-12 | Token threshold (server-side, min 50K) | trigger (default 150K), instructions, pause_after_compaction"
> "Tool clearing | clear_tool_uses_20250919 | context-management-2025-06-27 | Token threshold (server-side) | trigger (default 100K), keep (default 3 tool uses), clear_at_least, exclude_tools, clear_tool_inputs"
> "The summary preserves key decisions and facts but may drop specific numbers or exact phrasing. It costs inference (the summarizer model runs), but handles all context growth, not just tool results."
> "Clearing and compaction both operate on the current context; neither helps when a new session starts and the window is empty. Memory solves that problem."
> "Compaction is a _whole-transcript_ operation: user messages, assistant messages, tool calls, tool results, even prior compaction blocks are all flattened into the summary."
> "This cookbook works through how to think about designing with them: when each one applies, how to configure them, what changes when you use them independently vs. together, and sample use-cases where different combinations make sense."

## S3 — How Claude remembers your project

URL: https://code.claude.com/docs/en/memory

- authority: official-docs

Anthropic's official docs describe two complementary memory mechanisms: CLAUDE.md is written by humans and loaded in full at the start of every session (recommended target under 200 lines; the real hard limit is 4 MiB, beyond which the file is skipped entirely); Auto memory is written by Claude as a MEMORY.md index plus on-demand topic files, of which only the first 200 lines or 25KB of the index load per session while topic files are read on demand. It also notes block-level HTML comments are stripped before injection, and that the project-root CLAUDE.md is re-read and re-injected after /compact. Main basis for lesson 3 ("external memory: files and retrieval"), reused in lessons 5 and 6.

Key quote:
> "CLAUDE.md files are loaded into the context window at the start of every session, consuming tokens alongside your conversation... **Size**: target under 200 lines per CLAUDE.md file. Longer files consume more context and reduce adherence."
> "Claude Code loads a CLAUDE.md file of up to 4 MiB in full and skips a larger file. Shorter files produce better adherence."
> "Block-level HTML comments (`<!-- maintainer notes -->`) in CLAUDE.md files are stripped before the content is injected into Claude's context."
> "The first 200 lines of MEMORY.md, or the first 25KB, whichever comes first, are loaded at the start of every conversation. Content beyond that threshold is not loaded at session start."
> "Claude Code doesn't load topic files such as `user_role.md` or `feedback_testing.md` at startup. Claude reads them on demand using its standard file tools when it needs the information."
> "Project-root CLAUDE.md survives compaction: after /compact, Claude re-reads it from disk and re-injects it into the session."
> "Who writes it | You | Claude" / "Loaded into | Every session | Every session (first 200 lines or 25KB)"

## S4 — Track todos

URL: https://code.claude.com/docs/en/agent-sdk/todo-tracking

- authority: official-docs

Anthropic's official docs define the full lifecycle of a todo during agent execution — Created, Activated, Completed, Removed — and explain that this state is exposed through structured tool calls (TaskCreate / TaskUpdate) observable in the message stream. Main basis for lesson 4 ("structured state").

Key quote:
> "Claude moves each todo through a predictable lifecycle:\n\n1. **Created**: Claude adds the todo as pending when it identifies a task\n2. **Activated**: Claude sets the todo to in_progress when it starts the work\n3. **Completed**: Claude marks it completed when the task finishes successfully\n4. **Removed**: Claude deletes a todo it no longer needs by setting status: \"deleted\" in a TaskUpdate call"
> "In a session that has the task-tracking tools, Claude keeps a written todo list, updating each item's status as it works. You see each change in the message stream as a structured tool call."

## S5 — Memory Is a Feature. It Is Also an Attack Surface

URL: https://genai.owasp.org/2026/05/13/memory-is-a-feature-it-is-also-an-attack-surface/

- authority: authoritative-guide

Published on the OWASP Gen AI Security Project's official blog by a co-lead of the ASI06 (memory and context poisoning) entry, this article uses the MemoryTrap vulnerability disclosed by the Cisco research team as its example: a seemingly harmless routine — clone a repo, approve a dependency install — let a malicious payload reach persistent memory, the global hooks configuration, and even a high-trust instruction layer via the system prompt, so a one-time action could change the model's future behavior across sessions and projects. It also notes that after Cisco's disclosure, Anthropic removed user memories from the system prompt in Claude Code v2.1.50. Main basis for lesson 5 ("the boundaries and safety of memory"), reused in lesson 6 for the security design of a persistent memory layer.

Key quote:
> "Agentic systems do not just respond in the moment. They retain context, reuse memory, and rely on persistent state to guide future reasoning and actions. That is what makes them useful. It is also what makes them vulnerable."
> "In the vulnerability we called MemoryTrap, we found that a routine developer workflow could turn into persistent prompt injection. The path was surprisingly ordinary: clone a repository, let the agent help, approve a dependency installation, and move on."
> "Instead, it reached persistent memory, the global hooks configuration, and even influenced a highly trusted instruction layer through the system prompt. In other words, a one-time action could shape the model's future behavior across sessions, projects, and even reboots."
> "To Anthropic's credit, after we at Cisco disclosed the issue, Claude Code v2.1.50 removed user memories from the system prompt, reducing the specific high-trust override path we identified. That was the right fix for the path we found."
> "Once malicious content reaches trusted surfaces like memory, hooks, or configuration, the attacker is no longer just influencing one response. They are influencing future reasoning."
> "That is why MemoryTrap maps so clearly to ASI06: Memory & Context Poisoning."

## S6 — Using the Messages API

URL: https://platform.claude.com/docs/en/build-with-claude/working-with-messages

- authority: official-docs

The official docs state plainly that the Messages API is stateless: every request must carry the full conversation history, and the API keeps no state between requests. Direct basis for lesson 1's core claim ("API calls are stateless") and support for lesson 4's premise that a progress record vanishes with the window when the session ends.

Key quote:
> "The Messages API is stateless, which means that you always send the full conversational history to the API."

## S7 — Handle tool calls

URL: https://platform.claude.com/docs/en/agents-and-tools/tool-use/handle-tool-calls

- authority: official-docs

The official docs give the pairing rule for tool calls: a tool_result block must immediately follow its corresponding tool_use block, and a broken pair makes the request error out. Direct basis for lesson 2 ("truncation must not sever a tool_use/tool_result pair") and lesson 6's splitKeepingToolPairs design motivation.

Key quote:
> "Tool result blocks must immediately follow their corresponding tool use blocks in the message history. You cannot include any messages between the assistant's tool use message and the user's tool result message."
> "If you receive an error like \"tool_use ids were found without tool_result blocks immediately after\", check that your tool results are formatted correctly."

## S8 — Compaction

URL: https://platform.claude.com/docs/en/build-with-claude/compaction

- authority: official-docs

The official docs give the parameter details of server-side summary compaction: a minimum trigger threshold of 50,000 tokens (server-enforced), the possibility of multiple compactions in a long conversation, the last compaction block reflecting the final state of the prompt, and compaction possibly happening more than once within a single request. Direct basis for lesson 2's compaction details.

Key quote:
> "`input_tokens` is the only supported trigger type. `value` must be at least 50,000 tokens."
> "A long-running conversation might result in multiple compactions. The last compaction block reflects the final state of the prompt, replacing content prior to it with the generated summary."
> "Compaction might occur multiple times within a single request depending on your trigger threshold and the amount of output generated."

## S9 — How tool use works

URL: https://platform.claude.com/docs/en/agents-and-tools/tool-use/how-tool-use-works

- authority: official-docs

The official docs give the stop_reason-driven tool-execution loop spec: the model never executes anything itself, only emits a structured request; the host runs it and sends the result back; while stop_reason is still tool_use, the loop continues. Direct basis for lesson 6's "starting point: the execution loop from the tool-calling course" passage.

Key quote:
> "The model never executes anything on its own. It emits a structured request, your code (or Anthropic's servers) runs the operation, and the result flows back into the conversation. ... 2. Claude responds with stop_reason: "tool_use" and one or more tool_use blocks. 3. Execute each tool. Format the outputs as tool_result blocks. 4. Send a new request... 5. Repeat from step 2 while stop_reason is "tool_use"."
