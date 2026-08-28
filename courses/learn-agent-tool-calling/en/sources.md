# Sources

Every key fact and definition in this course comes from the following materials.

## S1 — Function calling — OpenAI API Guides

URL: https://developers.openai.com/api/docs/guides/function-calling

- authority: official-docs

Explains that OpenAI tool calling (function calling) is fundamentally a multi-step conversation between your application and the model — the model only triggers the call, and the actual function execution has to be done by the calling application.

Key quote:
> "Tool calling is a multi-step conversation between your application and a model via the OpenAI API. When the model calls a function, you must execute it and return the result."

## S2 — Tool use with Claude — Overview

URL: https://platform.claude.com/docs/en/agents-and-tools/tool-use/overview

- authority: official-docs

Overviews Claude's tool-use mechanism, distinguishing "client tools" run by the host application from "server tools" run by Anthropic's servers, and gives the basic response structure once a tool call is triggered.

Key quote:
> "It then returns a structured call that your application executes (client tools) or that Anthropic executes (server tools). ... Claude responds with stop_reason: "tool_use" and one or more tool_use blocks. Your code executes the operation and sends back a tool_result."

## S3 — Define tools — Claude API

URL: https://platform.claude.com/docs/en/agents-and-tools/tool-use/define-tools

- authority: official-docs

Gives, verbatim, the fields a tool definition must include (name, description, input_schema) and what each means — the authoritative reference for the structure of a tool's "contract."

Key quote:
> "A user-defined tool definition includes: name — The name of the tool. ... description — A detailed plaintext description of what the tool does, when it should be used, and how it behaves. input_schema — A JSON Schema object defining the expected parameters for the tool."

## S4 — How tool use works — Claude API

URL: https://platform.claude.com/docs/en/agents-and-tools/tool-use/how-tool-use-works

- authority: official-docs

States plainly that the model itself never executes anything — it only emits a structured request, and the actual execution is done by the host application or Anthropic's servers — and gives the canonical multi-turn loop driven by stop_reason. The best authoritative basis for this course's central claim.

Key quote:
> "The model never executes anything on its own. It emits a structured request, your code (or Anthropic's servers) runs the operation, and the result flows back into the conversation. ... 2. Claude responds with stop_reason: "tool_use" and one or more tool_use blocks. 3. Execute each tool. Format the outputs as tool_result blocks. 4. Send a new request... 5. Repeat from step 2 while stop_reason is "tool_use"."

## S5 — Handle tool calls — Claude API

URL: https://platform.claude.com/docs/en/agents-and-tools/tool-use/handle-tool-calls

- authority: official-docs

Gives the exact field spec for the tool_use and tool_result content blocks (id/name/input and tool_use_id/content/is_error), used to teach the byte-level shape of the request and response.

Key quote:
> "id: A unique identifier for this particular tool use block. ... name: The name of the tool being used. input: An object containing the input being passed to the tool, conforming to the tool's input_schema. ... tool_use_id: The id of the tool use request this is a result for. ... is_error (optional): Set to true if the tool execution resulted in an error."

## S6 — Tools reference — Claude Code Docs

URL: https://code.claude.com/docs/en/tools-reference

- authority: official-docs

Lists the built-in tools Claude Code exposes as a host application and the exact names used in permission rules, subagent tool lists, and hook matchers — helping learners understand the tool-catalog concept inside a real host loop.

Key quote:
> "Claude Code has access to a set of built-in tools that help it understand and modify your codebase. The tool names are the exact strings you use in permission rules, subagent tool lists, and hook matchers."

## S7 — Tool Use — LM Studio Docs (OpenAI-compatible API)

URL: https://lmstudio.ai/docs/developer/openai-compat/tools

- authority: authoritative-guide

As implementation docs for an OpenAI-compatible API, confirms verbatim the exact location of the tool_calls array in the response and the finish_reason value of "tool_calls", filling a gap the official guides leave in describing the response structure.

Key quote:
> "If the model decides that the user message would be best fulfilled with a tool call, an array of tool call request objects will be provided in the response field, choices[0].message.tool_calls. The finish_reason field of the top-level response object will also be populated with "tool_calls"."

## S8 — Writing effective tools for AI agents—using AI agents | Anthropic Engineering

URL: https://www.anthropic.com/engineering/writing-tools-for-agents

- authority: authoritative-guide

Explains that a good tool description must remove ambiguity about inputs and outputs, and points out that more tools do not mean better agent performance — too many similar tools make selection harder.

Key quote:
> "Avoid ambiguity by clearly describing (and enforcing with strict data models) expected inputs and outputs. ... More tools don't always lead to better outcomes."

## S9 — Introducing advanced tool use on the Claude Developer Platform | Anthropic Engineering

URL: https://www.anthropic.com/engineering/advanced-tool-use

- authority: authoritative-guide

Uses concrete numbers to show how a large set of tool definitions (especially after connecting several MCP servers) consumes enormous context tokens before the conversation even begins, and explains that intermediate tool results also enter the model's context in full, crowding out — even evicting — important information. This motivates the Tool Search Tool and programmatic tool calling.

Key quote:
> "That's 58 tools consuming approximately 55K tokens before the conversation even starts. ... At Anthropic, we've seen tool definitions consume 134K tokens before optimization."
> "When Claude analyzes a 10MB log file for error patterns, the entire file enters its context window ... These intermediate results consume massive token budgets and can push important information out of the context window entirely."

## S10 — How to implement tool use - Claude Platform Docs

URL: https://platform.claude.com/docs/en/agents-and-tools/tool-use/implement-tool-use

- authority: official-docs

Official docs give the best practice for naming tools: use the service name as a namespacing prefix to avoid ambiguity, and have tools return stable, high-signal identifiers rather than internal references.

Key quote:
> "Use meaningful namespacing in tool names. When your tools span multiple services or resources, prefix names with the service (e.g., github_list_prs, slack_send_message). This makes tool selection unambiguous as your library grows, and is especially important when using tool search."

## S11 — Tools - Model Context Protocol

URL: https://modelcontextprotocol.io/docs/concepts/tools

- authority: official-docs

The MCP spec distinguishes protocol errors from tool-execution errors, and requires clients to surface actionable tool-execution errors to the model so it can self-correct and retry.

Key quote:
> "Clients SHOULD provide tool execution errors to language models to enable self-correction."

## S12 — Specification - Model Context Protocol

URL: https://modelcontextprotocol.io/specification/2025-11-25

- authority: official-docs

The official spec explains that MCP draws on the ideas of the Language Server Protocol to standardize the integration of tools and context across the whole AI-application ecosystem, letting different host applications expose tools through one uniform protocol.

Key quote:
> "MCP takes some inspiration from the Language Server Protocol, which standardizes how to add support for programming languages across a whole ecosystem of development tools. In a similar way, MCP standardizes how to integrate additional context and tools into the ecosystem of AI applications."

## S13 — What is the Model Context Protocol (MCP)? - Model Context Protocol

URL: https://modelcontextprotocol.io/introduction

- authority: official-docs

The official intro page uses a USB-C analogy to explain intuitively how MCP provides a uniform, standardized way to connect AI applications to external tools and data sources.

Key quote:
> "Think of MCP like a USB-C port for AI applications. Just as USB-C provides a standardized way to connect electronic devices, MCP provides a standardized way to connect AI applications to external systems."

## S14 — Creating your first schema - JSON Schema

URL: https://json-schema.org/learn/getting-started-step-by-step

- authority: official-docs

Official docs explain that title/description in JSON Schema state intent and add no constraints, and that $schema declares which version of the spec is followed — the basis for designing a tool's input parameters (inputSchema).

Key quote:
> "title and description: state the intent of the schema. These keywords don't add any constraints to the data being validated. ... $schema: specifies which draft of the JSON Schema standard the schema adheres to."

## S15 — Configure permissions - Claude Code Docs

URL: https://code.claude.com/docs/en/permissions

- authority: official-docs

As official docs, explains the exact syntax of Claude Code permission rules (allow/deny/ask and the Tool(specifier) form) and their evaluation order — the first-hand basis for the course's core "permission-rule syntax" topic.

Key quote:
> "Rules are evaluated in order: deny, then ask, then allow. The first match in that order determines the outcome, and rule specificity doesn't change the order. A broad deny rule like `Bash(aws *)` blocks every matching call, including calls that also match a narrower allow rule like `Bash(aws s3 ls)`, so a deny rule can't carry allowlist exceptions."

## S16 — Configure the sandboxed Bash tool - Claude Code Docs

URL: https://code.claude.com/docs/en/sandboxing

- authority: official-docs

Official docs explain that a sandbox's filesystem isolation and network isolation are two independent layers, and why OS-level enforcement still holds even after the model is manipulated by prompt injection — used to teach the "blast radius" of write/execute tools and what the sandbox actually guarantees.

Key quote:
> "The two layers also differ in how they are enforced. Claude Code evaluates permission decisions before a command runs, based on the command string and, in auto mode, a separate classifier's judgment about whether the command is safe. The operating system enforces the sandbox boundary on the running process, so it holds regardless of what the model chose to run and even if an allowed command does more than its name suggests."

## S17 — Making Claude Code more secure and autonomous with sandboxing - Anthropic Engineering

URL: https://www.anthropic.com/engineering/claude-code-sandboxing

- authority: official-docs

This Anthropic engineering post explicitly ties the sandbox's design goal to "even a successful prompt injection" — the authoritative source for the course's claim that sandboxing specifically targets prompt-injection risk.

Key quote:
> "Sandboxing ensures that even a successful prompt injection is fully isolated, and cannot impact overall user security. ... This is particularly important in preventing a prompt-injected Claude from modifying sensitive system files. ... Without network isolation, a compromised agent could exfiltrate sensitive files like SSH keys."

## S18 — LLM06:2025 Excessive Agency - OWASP Gen AI Security Project

URL: https://owasp.org/www-project-top-10-for-large-language-model-applications/2_0_vulns/LLM06_ExcessiveAgency.html

- authority: official-docs

The official OWASP page gives the authoritative definition of "Excessive Agency" and its three root causes (excessive functionality, excessive permissions, excessive autonomy), plus the specific mitigation of human approval for high-risk actions — backing the course chapter on an agent's tool-authorization boundaries.

Key quote:
> "Excessive Agency is the vulnerability that enables damaging actions to be performed in response to unexpected, ambiguous, or manipulated outputs from an LLM, regardless of what is causing the LLM to malfunction. ... Utilise human-in-the-loop control to require a human to approve high-impact actions before they are taken. This may be implemented in a downstream system (outside the scope of the LLM application) or within the LLM extension itself."

## S19 — The lethal trifecta for AI agents - Simon Willison's Weblog

URL: https://simonwillison.net/2025/Jun/16/the-lethal-trifecta/

- authority: authoritative-guide

This post proposes and authoritatively defines the widely cited "lethal trifecta" framework (access to private data, exposure to untrusted content, and the ability to communicate externally) — used to teach the risk model of indirect prompt injection leading to data exfiltration.

Key quote:
> "The lethal trifecta of capabilities is: Access to your private data—one of the most common purposes of tools in the first place! Exposure to untrusted content—any mechanism by which text (or images) controlled by a malicious attacker could become available to your LLM. The ability to externally communicate in a way that could be used to steal your data."

## S20 — Strict tool use — Claude API

URL: https://platform.claude.com/docs/en/agents-and-tools/tool-use/strict-tool-use

- authority: official-docs

Official docs explain that in default (non-strict) mode the model's tool inputs carry no platform-level guarantee of matching the schema — types may mismatch or required fields may be dropped; with strict: true, the platform uses grammar-constrained sampling to guarantee inputs match input_schema, and the official strict-mode schemas all set additionalProperties: false.

Key quote:
> "Setting strict: true on a tool definition guarantees Claude's tool inputs match your JSON Schema by constraining the model's token sampling to schema-valid outputs (a technique called grammar-constrained sampling). ... Without strict mode, Claude might return incompatible types ("2" instead of 2) or omit required fields, breaking your functions and causing runtime errors."

## S21 — Parallel tool use — Claude API

URL: https://platform.claude.com/docs/en/agents-and-tools/tool-use/parallel-tool-use

- authority: official-docs

Official docs specify the return format for parallel tool calls (all tool_result blocks go together in the single user message that immediately follows, each claimed by its tool_use_id) and the disable_parallel_tool_use switch: when tool_choice is auto, setting it true makes the model call at most one tool per response.

Key quote:
> "Whichever strategy you use, return one tool_result for each tool_use block, all together in the next user message. Match each result to its call with tool_use_id, and put every tool_result block before any text content in that message."
> "When tool_choice type is auto (the default), setting disable_parallel_tool_use: true means Claude calls at most one tool per response."
