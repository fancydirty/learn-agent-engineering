# 参考来源

本课程的关键论断都以下列来源为依据。正文用 `[^Sn]` 引用，具体引文摘录在每条下方。所有引文均于 2026-08-26 用程序化锚点切片从最终页面逐字提取并二次核验（94 条全部通过），保留原文的弯引号、破折号、乘号（4×）与 markdown 反引号，不作任何改写。

写作纪律（对全部课节生效，逐条来自本次打底的覆盖缺口报告）：
- 「验证告诉你挂没挂，可观测性告诉你为什么」这个课程框架是**本课自己的提法**，一手来源没有原话——只能用「tracing 让我们能系统性诊断失败原因」与「探究它为什么调或不调某个工具」这两条引文来支撑，不得写成官方原话。
- 复现非确定性失败的具体技法（固定种子、temperature 0、录制/回放工具返回）没有任何一手来源——只能以本课工程实践口径写，不挂引用。一手材料里最接近的是「用一模一样的提示词和工具做模拟、逐步观看」与「从失败处恢复而不是从头重启」。
- 自建 harness 的日志格式设计（字段命名、JSON Lines、轮转、脱敏）没有一手指导——以实践口径写，字段词汇表可借用引文里真实出现的：session id、prompt id、工具名、tool_input、tool_response、duration_ms、token 计数、error。
- 端到端「症状→trace→假设→定位→修复」的完整调试叙事没有任何一手页面走过——第 6 课的实战演练是本课自己编排的，别写成官方流程。
- 告警阈值、错误预算、SLO：文档只点名了告警类别，没有任何数字——不得发明。
- trace 采样率、保留窗口：无一手指导，不展开。
- 可观测性产品对比：唯一可引的厂商名单是 Agent SDK 页顺带列出的（Honeycomb、Datadog、Grafana、Langfuse、自托管 collector），不得对任何产品做能力评价。
- 负面结论要教对：Claude Code 会从 hook 子进程剥除 OTEL_* 导出变量——「用 hook 顺手蹭 harness 的 OTel 管道」被一手文档否定，hook 要导出遥测得自带 exporter。
- S2 页面自带编辑注说明其工具生态描述已过时——只引它的原则（每步 ground truth、沙箱测试、透明度、抽象层妨碍调试），不当作现行工具指导。

## S1 — How we built our multi-agent research system — Anthropic Engineering

URL: https://www.anthropic.com/engineering/multi-agent-research-system

- authority: authoritative-guide

Anthropic 多 Agent 研究系统的工程复盘（2025-06），本课核心依据：Agent 在两次运行间非确定性、调试因此变难；一个用户可见症状底下压着好几个不可区分的内部原因；上线全链路 tracing 之后才能系统性诊断失败；只监控决策模式与交互结构、不看对话内容；token 用量解释 80% 的方差；「像你的 Agent 一样思考」——用一模一样的提示词和工具逐步观看。

关键引用：
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

Anthropic 关于 Agent 模式的权威文章（2024-12，页面自带编辑注：其中工具生态描述已过时，只引原则）。本课取：抽象层会遮住提示词与响应、让调试变难；从 API 直接做、看清水面之下；每一步从环境拿 ground truth；显式展示规划步骤的透明度原则；沙箱测试与护栏；测量并迭代。注意：第一条引文在原页面 "prompts" 与 "and" 之间含两个不可见的零宽空格（CMS 产物），可见文字为准。

关键引用：
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

Anthropic 工具工程文章（2025-09）。本课取：非确定性的定义式对照与工具作为两个世界的契约（最值得插桩的边界）；指标集（单次与整任务运行时长、调用次数、token 消耗、工具报错）；指标的诊断式读法；自述不可信、省略的比写出的更要紧；原始记录（含工具调用与响应）排在 CoT 之上；把记录直接交给模型分析；真实案例：靠读参数发现 Claude 往搜索词里乱加 2025。

关键引用：
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

## S4 — Monitoring — Claude Code 官方文档

URL: https://code.claude.com/docs/en/monitoring-usage

- authority: official-docs

Claude Code 官方监控文档（OpenTelemetry 指标、事件与 trace 的参考页）。本课取：OTel 导出覆盖用量、成本与工具活动；span 层级（interaction 根 span、API/工具/hook 子 span、权限等待与执行分开）；prompt.id 把散落事件串回同一次提示；报错事件是重试放弃后的终点信号；「恢复了还是卡死了」的查询法；成本是近似值；结构化事件构成审计轨迹；探测器自身要先验证（session.count / --debug）；TRACEPARENT 传进子进程；磁盘上的 JSONL 会话转录及其「内部格式、版本间会变」的告诫。

关键引用：
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

## S5 — Hooks reference — Claude Code 官方文档

URL: https://code.claude.com/docs/en/hooks

- authority: official-docs

Claude Code 官方 hooks 参考页。本课只取与观测相关的部分：hooks 是生命周期的具名拦截点；三种节奏（每会话/每轮/循环内每次工具调用）；PreToolUse 与 PostToolUse 的时机与载荷（含 tool_input 与 tool_response 的完整调用记录）；通配 matcher 一钩全记；执行细节写入 debug 日志与 verbose 级别；prompt_id 与遥测同源可关联；以及一条负面结论——OTEL_* 导出变量会被从 hook 子进程剥除。

关键引用：
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

## S6 — Observability with OpenTelemetry — Claude Agent SDK 官方文档

URL: https://code.claude.com/docs/en/agent-sdk/observability

- authority: official-docs

Claude Agent SDK 的可观测性专页——本课 tracing 一课的最佳单页。取：生产环境观测要回答的四个问题（调了哪些工具/每次模型请求多久/花了多少 token/失败发生在哪）；三个独立信号（指标/日志事件/trace）可分别开关；开启后循环的每一步都是可检视的 span；子代理的 span 嵌进父 trace、整条委托链读成一棵树；W3C trace context 双向传播（应用→CLI、CLI→Bash 子进程）；导出失败默认静默、批量导出下短命进程会丢遥测、默认导出间隔；结构化事件加身份属性即成审计轨迹；内容默认不采集。

关键引用：
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
