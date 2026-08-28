# Sources

Every key claim in this course is grounded in the sources below. The main text cites them as `[^Sn]`, with specific quotations excerpted under each entry. All quotations were programmatically extracted word-for-word from the final rendered pages using anchored slicing and double-verified on 2026-08-26 (94 quotations, all passed), preserving original curly quotes, em-dashes, multiplication signs (4×), and markdown backticks without any rewording.

Writing discipline (applies to all lessons, each condition derived from this iteration's coverage-gap report):
- The course framework "validation tells you whether it broke, observability tells you why" is **this course's own formulation**—no primary source states this verbatim. It can only be supported by two quotations: "tracing let us diagnose why agents failed" and "probe why agents do or don't call certain tools." Do not present it as official phrasing.
- Specific techniques for reproducing non-deterministic failures (fixed seed, temperature 0, tool-return recording/replay) have no primary-source backing—they can only be written in this course's engineering-practice voice, with no citation attached. The closest match in primary materials is "simulations using the exact prompts and tools, then watched step-by-step" and "resume from where the agent was when the errors occurred."
- Log format design for custom harnesses (field naming, JSON Lines, rotation, redaction) has no primary guidance—write in practice voice; field vocabulary can borrow terms that actually appear in quotations: session id, prompt id, tool name, tool_input, tool_response, duration_ms, token counts, error.
- The end-to-end "symptom→trace→hypothesis→locate→fix" complete debugging narrative has no primary page walking through it—the hands-on drill in Lesson 6 is this course's own arrangement; do not present it as an official workflow.
- Alert thresholds, error budgets, SLO: documentation only names alert categories, no numbers—do not invent any.
- Trace sampling rate, retention window: no primary guidance, do not elaborate.
- Observability product comparison: the only citable vendor list is the one the Agent SDK page mentions in passing (Honeycomb, Datadog, Grafana, Langfuse, self-hosted collector); do not make capability evaluations of any product.
- Teach negative conclusions correctly: Claude Code strips OTEL_* export variables from hook subprocesses—"piggyback on the harness's OTel pipeline via hooks" is negated by primary documentation; hooks must bring their own exporter to export telemetry.
- The S2 page carries an editorial note stating its tool-ecosystem description is outdated—only cite its principles (ground truth at each step, sandbox testing, transparency, abstraction layers hinder debugging), not as current tool guidance.

## S1 — How we built our multi-agent research system — Anthropic Engineering

URL: https://www.anthropic.com/engineering/multi-agent-research-system

- authority: authoritative-guide

Anthropic's engineering retrospective on the multi-agent research system (June 2025), the core basis for this course: agents are non-deterministic between runs; debugging becomes harder as a result; a single user-visible symptom can conceal several indistinguishable internal causes; production-wide tracing enabled systematic failure diagnosis; monitoring decision patterns and interaction structures without watching conversation contents; token usage explains 80% of variance; "think like your agents"—watch step-by-step with identical prompts and tools.

Key quote:
> "Debugging benefits from new approaches. Agents make dynamic decisions and are non-deterministic between runs, even with identical prompts. This makes debugging harder."
> "For instance, users would report agents “not finding obvious information,” but we couldn't see why. Were the agents using bad search queries? Choosing poor sources? Hitting tool failures?"
> "Adding full production tracing let us diagnose why agents failed and fix issues systematically."
> "Beyond standard observability, we monitor agent decision patterns and interaction structures—all without monitoring the contents of individual conversations, to maintain user privacy."
> "This high-level observability helped us diagnose root causes, discover unexpected behaviors, and fix common failures."
> "In traditional software, a bug might break a feature, degrade performance, or cause outages. In agentic systems, minor changes cascade into large behavioral changes, which makes it remarkably difficult to write code for complex agents that must maintain state in a long-running process."
> "Agents are stateful and errors compound. Agents can run for long periods of time, maintaining state across many tool calls. This means we need to durably execute code and handle errors along the way."
> "Traditional evaluations often assume that the AI follows the same steps each time: given input X, the system should follow path Y to produce output Z. But multi-agent systems don't work this way. Even with identical starting points, agents might take completely different valid paths to reach their goal."
> "Think like your agents. To iterate on prompts, you must understand their effects. To help us do this, we built simulations using our Console with the exact prompts and tools from our system, then watched agents work step-by-step. This immediately revealed failure modes: agents continuing when they already had sufficient results, using overly verbose search queries, or selecting incorrect tools."
> "Multi-agent systems have emergent behaviors, which arise without specific programming. For instance, small changes to the lead agent can unpredictably change how subagents behave. Success requires understanding interaction patterns, not just individual agent behavior."
> "Getting this right relies on careful prompting and tool design, solid heuristics, observability, and tight feedback loops."
> "Finally, we focused on a fast iteration loop with observability and test cases."
> "Human evaluation catches what automation misses. People testing agents find edge cases that evals miss. These include hallucinated answers on unusual queries, system failures, or subtle source selection biases."
> "In our case, human testers noticed that our early agents consistently chose SEO-optimized content farms over authoritative but less highly-ranked sources like academic PDFs or personal blogs."
> "In our data, agents typically use about 4× more tokens than chat interactions, and multi-agent systems use about 15× more tokens than chats."
> "We found that token usage by itself explains 80% of the variance, with the number of tool calls and the model choice as the two other explanatory factors."
> "The compound nature of errors in agentic systems means that minor issues for traditional software can derail agents entirely. One step failing can cause agents to explore entirely different trajectories, leading to unpredictable outcomes."
> "When errors occur, we can't just restart from the beginning: restarts are expensive and frustrating for users. Instead, we built systems that can resume from where the agent was when the errors occurred."
> "Early agents made errors like spawning 50 subagents for simple queries, scouring the web endlessly for nonexistent sources, and distracting each other with excessive updates."
> "We even created a tool-testing agent—when given a flawed MCP tool, it attempts to use the tool and then rewrites the tool description to avoid failures. By testing the tool dozens of times, this agent found key nuances and bugs."

## S2 — Building Effective AI Agents — Anthropic Engineering

URL: https://www.anthropic.com/engineering/building-effective-agents

- authority: authoritative-guide

Anthropic's authoritative article on agent patterns (December 2024; page carries editorial note: the tool-ecosystem description is outdated, only principles are cited). This course draws: abstraction layers obscure prompts and responses, making debugging harder; work directly from the API to see below the surface; ground truth from the environment at each step; transparency principle of explicitly showing planning steps; sandbox testing and guardrails; measure and iterate. Note: the first quotation contains two invisible zero-width spaces between "prompts" and "and" on the original page (CMS artifact); visible text is authoritative.

Key quote:
> "These frameworks make it easy to get started by simplifying standard low-level tasks like calling LLMs, defining and parsing tools, and chaining calls together. However, they often create extra layers of abstraction that can obscure the underlying prompts ​​and responses, making them harder to debug."
> "We suggest that developers start by using LLM APIs directly: many patterns can be implemented in a few lines of code. If you do use a framework, ensure you understand the underlying code. Incorrect assumptions about what's under the hood are a common source of customer error."
> "During execution, it's crucial for the agents to gain “ground truth” from the environment at each step (such as tool call results or code execution) to assess its progress."
> "Agents can then pause for human feedback at checkpoints or when encountering blockers. The task often terminates upon completion, but it’s also common to include stopping conditions (such as a maximum number of iterations) to maintain control."
> "The autonomous nature of agents means higher costs, and the potential for compounding errors. We recommend extensive testing in sandboxed environments, along with the appropriate guardrails."
> "Prioritize transparency by explicitly showing the agent’s planning steps."
> "The key to success, as with any LLM features, is measuring performance and iterating on implementations."
> "Test how the model uses your tools: Run many example inputs in our workbench to see what mistakes the model makes, and iterate."
> "While building our agent for SWE-bench, we actually spent more time optimizing our tools than the overall prompt. For example, we found that the model would make mistakes with tools using relative filepaths after the agent had moved out of the root directory."
> "Frameworks can help you get started quickly, but don't hesitate to reduce abstraction layers and build with basic components as you move to production."

## S3 — Writing effective tools for agents — with agents — Anthropic Engineering

URL: https://www.anthropic.com/engineering/writing-tools-for-agents

- authority: authoritative-guide

Anthropic's tool engineering article (September 2025). This course draws: definitional contrast between deterministic vs non-deterministic, and tools as the contract between two worlds (the boundary most worth instrumenting); metric set (single-call and whole-task runtime, call count, token consumption, tool errors); diagnostic reading of metrics; self-report is unreliable, what's omitted matters more than what's stated; raw transcripts (including tool calls and responses) rank above CoT; hand transcripts directly to the model for analysis; real case study: reading parameters revealed Claude needlessly adding 2025 to search terms.

Key quote:
> "In computing, deterministic systems produce the same output every time given identical inputs, while non-deterministic systems—like agents—can generate varied responses even with the same starting conditions."
> "Tools are a new kind of software which reflects a contract between deterministic systems and non-deterministic agents."
> "As well as top-level accuracy, we recommend collecting other metrics like the total runtime of individual tool calls and tasks, the total number of tool calls, the total token consumption, and tool errors."
> "Tracking tool calls can help reveal common workflows that agents pursue and offer some opportunities for tools to consolidate."
> "However, keep in mind that what agents omit in their feedback and responses can often be more important than what they include. LLMs don’t always say what they mean."
> "Observe where your agents get stumped or confused. Read through your evaluation agents’ reasoning and feedback (or CoT) to identify rough edges. Review the raw transcripts (including tool calls and tool responses) to catch any behavior not explicitly described in the agent’s CoT."
> "Analyze your tool calling metrics. Lots of redundant tool calls might suggest some rightsizing of pagination or token limit parameters is warranted; lots of tool errors for invalid parameters might suggest tools could use clearer descriptions or better examples."
> "When we launched Claude’s web search tool, we identified that Claude was needlessly appending 2025 to the tool’s query parameter, biasing search results and degrading performance (we steered Claude in the right direction by improving the tool description)."
> "Simply concatenate the transcripts from your evaluation agents and paste them into Claude Code. Claude is an expert at analyzing transcripts and refactoring lots of tools all at once—for example, to ensure tool implementations and descriptions remain self-consistent when new changes are made."
> "This will help you probe why agents do or don’t call certain tools and highlight specific areas of improvement in tool descriptions and specs."
> "Agents might call the wrong tools, call the right tools with the wrong parameters, call too few tools, or process tool responses incorrectly."
> "To build effective tools for agents, we need to re-orient our software development practices from predictable, deterministic patterns to non-deterministic ones."
> "Similarly, if a tool call raises an error (for example, during input validation), you can prompt-engineer your error responses to clearly communicate specific and actionable improvements, rather than opaque error codes or tracebacks."

## S4 — Monitoring — Claude Code Official Documentation

URL: https://code.claude.com/docs/en/monitoring-usage

- authority: official-docs

Claude Code's official monitoring documentation (reference page for OpenTelemetry metrics, events, and traces). This course draws: OTel export covers usage, cost, and tool activity; span hierarchy (interaction root span, API/tool/hook child spans, permission wait and execution separated); prompt.id threads scattered events back to a single prompt; error events are the terminal signal after retries are abandoned; query pattern for "recovered or stalled"; costs are approximate; structured events constitute an audit trail; instrumentation itself must be verified first (session.count / --debug); TRACEPARENT propagates into subprocesses; on-disk JSONL session transcripts and the caveat "internal format, changes between versions."

Key quote:
> "Track Claude Code usage, costs, and tool activity across your organization by exporting telemetry data through OpenTelemetry (OTel)."
> "Distributed tracing exports spans that link each user prompt to the API requests and tool executions it triggers, so you can view a full request as a single trace in your tracing backend."
> "Each user prompt starts a `claude_code.interaction` root span. API calls, tool calls, and hook executions are recorded as its children. Tool spans have two child spans of their own: one for the time spent waiting on a permission decision and one for the execution itself."
> "When a user submits a prompt, Claude Code may make multiple API calls and run several tools. The `prompt.id` attribute lets you tie all of those events back to the single prompt that triggered them."
> "To trace all activity triggered by a single prompt, filter your events by a specific `prompt.id` value."
> "track API request durations and tool execution times to identify performance bottlenecks."
> "Claude Code retries failed API requests internally and emits a single `claude_code.api_error` event only after it gives up, so the event itself is the terminal signal for that request. Intermediate retry attempts are not logged as separate events."
> "To distinguish a session that recovered from one that stalled, group events by `session.id` and check whether a later `api_request` event exists after the error."
> "Cost metrics are approximations. For official billing data, refer to your API provider (Claude Console, Amazon Bedrock, or Google Cloud's Agent Platform)."
> "OpenTelemetry events are the audit data source for Claude Code activity. Every event carries identity attributes that tie tool calls, MCP activity, and permission decisions back to the user who triggered them."
> "Claude Code emits the raw event stream only. Anomaly detection, baselining, correlation across sessions, and alerting are the responsibility of your SIEM or observability backend."
> "User prompt content is not collected by default. Only prompt length is recorded. To include prompt content, set `OTEL_LOG_USER_PROMPTS=1`"
> "To verify a setup that exports metrics, check your backend for the `claude_code.session.count` metric, which Claude Code emits when a session starts."
> "If nothing arrives, run `claude --debug` and check the debug log for OTel export errors."
> "When tracing is active, Bash and PowerShell subprocesses automatically inherit a `TRACEPARENT` environment variable containing the W3C trace context of the active tool execution span."
> "analyze tool result events to identify: * Most frequently used tools * Tool success rates * Average tool execution times * Error patterns by tool type"
> "The `claude_code.cost.usage` metric helps with: * Tracking usage trends across teams or individuals * Identifying high-usage sessions for optimization * Attributing spend to specific skills, plugins, or subagent types via the `skill.name`, `plugin.name`, and `agent.name` attributes"
> "Claude Code counts each streaming response toward the cost and token metrics exactly once, including when a gateway or proxy behind `ANTHROPIC_BASE_URL` streams usage progressively across multiple frames."
> "UUID of the message as persisted in the session transcript, the `~/.claude/projects/*/*.jsonl` files."
> "The transcript entry format is [internal to Claude Code](/docs/en/sessions#where-transcripts-are-stored) and changes between versions, so a pipeline that joins on these fields can break on any release; treat the joins as version-specific rather than a stable contract"

## S5 — Hooks reference — Claude Code Official Documentation

URL: https://code.claude.com/docs/en/hooks

- authority: official-docs

Claude Code's official hooks reference page. This course only draws the observability-relevant portions: hooks are named interception points in the lifecycle; three cadences (per-session/per-turn/per-tool-call inside the loop); PreToolUse and PostToolUse timing and payload (complete call records including tool_input and tool_response); wildcard matcher records everything with one hook; execution details written to debug log at verbose level; prompt_id shares the same source as telemetry and can correlate; and one negative conclusion—OTEL_* export variables are stripped from hook subprocesses.

Key quote:
> "Hooks are user-defined shell commands, HTTP endpoints, or LLM prompts that execute automatically at specific points in Claude Code's lifecycle."
> "Claude Code runs hooks at specific points during a session. When an event fires and a matcher matches, Claude Code passes JSON context about the event to your hook handler."
> "Events fall into three cadences: * once per session: `SessionStart` and `SessionEnd` * once per turn: `UserPromptSubmit`, `Stop`, and `StopFailure` * on every tool call inside the agentic loop: `PreToolUse` and `PostToolUse`"
> "Command hooks receive JSON data via stdin and communicate results through exit codes, stdout, and stderr. HTTP hooks receive the same JSON as the POST request body and communicate results through the HTTP response body."
> "Path to conversation JSON. The transcript file is written asynchronously and may lag the in-memory conversation, so it may not yet include the current turn's most recent messages when a hook fires."
> "Runs after Claude creates tool parameters and before processing the tool call."
> "`PostToolUse` hooks fire after a tool has already executed successfully. The input includes both `tool_input`, the arguments sent to the tool, and `tool_response`, the result it returned."
> "To run a hook after any tool completes successfully, omit the `matcher` or set it to `\"*\"`. Your hook can then discover what changed itself, for example by running `git status --porcelain`, which also lists untracked files that `git diff` misses."
> "Optional. Tool execution time in milliseconds. Excludes time spent in permission prompts and PreToolUse hooks"
> "Hook execution details, including which hooks matched, their exit codes, and full stdout and stderr, are written to the debug log file. Start Claude Code with `claude --debug-file <path>` to write the log to a known location, or run `claude --debug` and read the log at `~/.claude/debug/<session-id>.txt`."
> "For more granular hook matching details, set `CLAUDE_CODE_DEBUG_LOG_LEVEL=verbose` to see additional log lines such as hook matcher counts and query matching."
> "Command hooks execute shell commands with your full user permissions. They can modify, delete, or access any files your user account can access. Review and test all hook commands before adding them to your configuration."
> "Runs when Claude Code starts a new session or resumes an existing session."
> "One set of variables is not inherited: Claude Code [removes `OTEL_*` exporter variables from every subprocess it spawns](/docs/en/monitoring-usage#administrator-configuration), including hooks."
> "UUID identifying the user prompt currently being processed. Matches the [`prompt.id` attribute on OpenTelemetry events](/docs/en/monitoring-usage#event-correlation-attributes), so you can correlate hook output with telemetry for a single prompt."

## S6 — Observability with OpenTelemetry — Claude Agent SDK Official Documentation

URL: https://code.claude.com/docs/en/agent-sdk/observability

- authority: official-docs

Claude Agent SDK's dedicated observability page—the best single-page reference for this course's tracing lesson. Draws: four questions production observability must answer (which tools were called/how long each model request took/how many tokens were spent/where failures occurred); three independent signals (metrics/log events/traces) with separate on/off switches; once enabled, each loop step becomes an inspectable span; subagent spans nest into the parent trace, the entire delegation chain reads as a tree; W3C trace context bidirectional propagation (application→CLI, CLI→Bash subprocess); export failures default to silent; batch export means short-lived processes can lose telemetry; default export interval; structured events plus identity attributes become an audit trail; content not collected by default.

Key quote:
> "When you run agents in production, you need visibility into what they did: * which tools they called * how long each model request took * how many tokens were spent * where failures occurred"
> "The Agent SDK can export this data as OpenTelemetry traces, metrics, and log events to any backend that accepts the OpenTelemetry Protocol (OTLP), such as Honeycomb, Datadog, Grafana, Langfuse, or a self-hosted collector."
> "The CLI has OpenTelemetry instrumentation built in: it records spans around each model request and tool execution, emits metrics for token and cost counters, and emits structured log events for prompts and tool results."
> "The CLI exports three independent OpenTelemetry signals. Each has its own enable switch and its own exporter, so you can turn on only the ones you need."
> "Traces give you the most detailed view of an agent run. With `CLAUDE_CODE_ENHANCED_TELEMETRY_BETA=1` set, each step of the agent loop becomes a span you can inspect in your tracing backend:"
> "The `llm_request`, `tool`, and `hook` spans are children of the enclosing `claude_code.interaction` span. When the agent spawns a subagent through the Agent tool, the subagent's `llm_request` and `tool` spans nest under the parent agent's `claude_code.tool` span, so the full delegation chain appears as one trace."
> "The SDK automatically propagates W3C trace context into the CLI subprocess. When you call `query()` while an OpenTelemetry span is active in your application, the SDK injects `TRACEPARENT` and `TRACESTATE` into the child process environment, and the CLI reads them so its `claude_code.interaction` span becomes a child of your span. The agent run then appears inside your application's trace instead of as a disconnected root."
> "The CLI fails silently on export errors by default: if the endpoint is unreachable or rejects the data, the agent still runs normally and the CLI drops the telemetry without surfacing an error in your application."
> "The CLI batches telemetry and exports on an interval. On a clean process exit it attempts to flush pending data, but the flush is bounded by a short timeout, so spans can still be dropped if the collector is slow to respond. If your process is killed before the CLI shuts down, anything still in the batch buffer is lost."
> "By default, metrics export every 60 seconds and traces and logs export every 5 seconds."
> "Telemetry is structural by default. Durations, model names, and tool names are recorded on every span; token counts are recorded when the underlying API request returns usage data, so spans for failed or aborted requests may omit them. The content your agent reads and writes is not recorded by default."
> "By default, the CLI reports `service.name` as `claude-code`. If you run several agents, or run the SDK alongside other services that export to the same collector, override the service name and add resource attributes so you can filter by agent in your backend."
> "When trace-context propagation is enabled, the CLI also forwards `TRACEPARENT` to every Bash and PowerShell command it runs. If a command launched through the Bash tool emits its own OpenTelemetry spans, those spans nest under the `claude_code.tool.execution` span that wraps the command."
> "With end-user identity attached, the `tool_decision`, `tool_result`, `mcp_server_connection`, and `permission_mode_changed` events, which export as log records named with a `claude_code.` prefix, become a per-user audit trail you can forward to a Security Information and Event Management (SIEM) platform."
> "Leave these unset unless your observability pipeline is approved to store the data your agent handles."
> "Do not set `console` as an exporter value when running through the SDK."
