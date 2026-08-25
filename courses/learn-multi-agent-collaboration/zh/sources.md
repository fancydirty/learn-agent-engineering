# 参考来源

## S1 — How we built our multi-agent research system（Anthropic Engineering）

URL: https://www.anthropic.com/engineering/multi-agent-research-system

- authority: authoritative-guide

Anthropic 工程团队发布的一手技术博客，详述了 Claude Research 这个生产级多 Agent 系统的架构、编排者-子代理分工、提示词设计原则、失败模式以及评估方法。本课关于「多 Agent 系统的定义」「子代理提示词该包含什么」「效果扩展规则」「引用/结果整合」「token 成本」「哪些任务适合并行」等论断均来自此文。

关键引用:

> "A multi-agent system consists of multiple agents (LLMs autonomously using tools in a loop) working together."

> "Each subagent needs an objective, an output format, guidance on the tools and sources to use, and clear task boundaries. Without detailed task descriptions, agents duplicate work, leave gaps, or fail to find necessary information."

> "spawning 50 subagents for simple queries, scouring the web endlessly for nonexistent sources, and distracting each other with excessive updates"

> "Simple fact-finding requires just 1 agent with 3-10 tool calls, direct comparisons might need 2-4 subagents with 10-15 calls each, and complex research might use more than 10 subagents with clearly divided responsibilities."

> "a CitationAgent, which processes the documents and research report to identify specific locations for citations. This ensures all claims are properly attributed to their sources."

> "We used an LLM judge that evaluated each output against criteria in a rubric: factual accuracy (do claims match sources?), citation accuracy (do the cited sources match the claims?), completeness (are all requested aspects covered?), source quality (did it use primary sources over lower-quality secondary sources?), and tool efficiency (did it use the right tools a reasonable number of times?)."

> "We started by allowing the lead agent to give simple, short instructions like 'research the semiconductor shortage,' but found these instructions often were vague enough that subagents misinterpreted the task or performed the exact same searches as other agents."

> "In our data, agents typically use about 4× more tokens than chat interactions, and multi-agent systems use about 15× more tokens than chats. For economic viability, multi-agent systems require tasks where the value of the task is high enough to pay for the increased performance."

> "Subagent output to a filesystem to minimize the 'game of telephone.' Direct subagent outputs can bypass the main coordinator for certain types of results, improving both fidelity and performance."

> "most coding tasks involve fewer truly parallelizable tasks than research, and LLM agents are not yet great at coordinating and delegating to other agents in real time. We've found that multi-agent systems excel at valuable tasks that involve heavy parallelization, information that exceeds single context windows, and interfacing with numerous complex tools."

> "the lead agent spins up 3-5 subagents in parallel rather than serially"

> "These changes cut research time by up to 90% for complex queries"

> "Subagents facilitate compression by operating in parallel with their own context windows ... Each subagent also provides a separation of concerns—distinct tools, prompts, and exploration trajectories—which reduces path dependency"

## S2 — Building effective agents（Anthropic Engineering）

URL: https://www.anthropic.com/engineering/building-effective-agents

- authority: authoritative-guide

Anthropic 关于「何时用工作流、何时用 Agent、以及各类编排模式该如何定义」的一手指南，涵盖 prompt chaining、orchestrator-workers、evaluator-optimizer（生产者-评审者）等模式的官方定义，以及「先做简单方案，只在能证明有效时才加复杂度」的核心建议。本课关于协作模式分类与「什么时候不该用多 Agent」的论断均来自此文。

关键引用:

> "Workflows are systems where LLMs and tools are orchestrated through predefined code paths."

> "a central LLM dynamically breaks down tasks, delegates them to worker LLMs, and synthesizes their results."

> "Prompt chaining decomposes a task into a sequence of steps, where each LLM call processes the output of the previous one."

> "one LLM call generates a response while another provides evaluation and feedback in a loop."

> "Reviewing a piece of code for vulnerabilities, where several different prompts review and flag the code if they find a problem."

> "you should consider adding complexity only when it demonstrably improves outcomes."

## S3 — Create custom subagents（Claude Code Docs）

URL: https://code.claude.com/docs/en/sub-agents

- authority: official-docs

Claude Code 官方文档，说明子代理的上下文隔离机制、frontmatter 必填字段、委派触发方式与结果回传方式。本课关于「子代理为什么看不到你的对话历史」「委派靠 description 字段触发」「结果只回传结论」等论断均来自此文。

关键引用:

> "Each subagent starts with a fresh, isolated context window. It doesn't see your conversation history, the skills you've already invoked, or the files Claude has already read. Claude composes a delegation message that summarizes the task, and the subagent works from there."

> "When subagents complete, their results return to your main conversation. Running many subagents that each return detailed results can consume significant context."

> "The following fields can be used in the YAML frontmatter. Only name and description are required."

> "Claude automatically delegates tasks based on the task description in your request, the description field in subagent configurations, and current context."

> "Each subagent completes its task and returns results to Claude, which then passes relevant context to the next subagent."

> "A fork is a subagent that inherits the entire conversation so far instead of starting fresh... The fork's own tool calls still stay out of your conversation and only its final result comes back, so your main context window stays clean."

## S4 — Agents（OpenAI Agents SDK）

URL: https://openai.github.io/openai-agents-python/agents/

- authority: official-docs

OpenAI Agents SDK 官方文档中关于多 Agent 编排模式的说明，定义了 Manager（agents-as-tools）与 Handoffs 两种常见模式。本课「协作模式」一节用它来对照 orchestrator-worker 之外的另一种常见分工方式。

关键引用:

> "Manager (agents as tools): A central manager/orchestrator invokes specialized sub‑agents as tools and retains control of the conversation."

> "Handoffs: Peer agents hand off control to a specialized agent that takes over the conversation. This is decentralized."

## S5 — Handoffs（OpenAI Agents SDK）

URL: https://openai.github.io/openai-agents-python/handoffs/

- authority: official-docs

OpenAI Agents SDK 官方文档中关于 Handoffs 机制的详细说明，解释了交接后新 Agent 如何接管对话、以及交接停留在单次运行内的边界。本课用它说明「Handoffs 型协作」与「orchestrator-worker 型协作」在上下文传递上的关键差异。

关键引用:

> "Handoffs stay within a single run."

> "When a handoff occurs, it's as though the new agent takes over the conversation, and gets to see the entire previous conversation history."

## S6 — Best practices for Claude Code（Claude Code Docs）

URL: https://code.claude.com/docs/en/best-practices

- authority: official-docs

Claude Code 官方最佳实践文档，其中「trust-then-verify gap」一节直接指出「模型产出看起来合理但未必正确」这一失败模式，并给出「必须自己验证，验证不了就不能直接采信」的应对方法。本课「子代理声称完成不可信」一节的核心论断来自此文。

关键引用:

> "The trust-then-verify gap. Claude produces a plausible-looking implementation that doesn't handle edge cases. Fix: Always provide verification (tests, scripts, screenshots). If you can't verify it, don't ship it."

> "Claude stops when the work looks done. Without a check it can run, \"looks done\" is the only signal available, and you become the verification loop: every mistake waits for you to notice it."

> "Have Claude show evidence rather than asserting success: the test output, the command it ran and what it returned, or a screenshot of the result."

## S7 — Effective context engineering for AI agents（Anthropic Engineering）

URL: https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents

- authority: authoritative-guide

Anthropic 关于上下文工程的一手指南，给出了「上下文退化（context rot）」与「注意力预算（attention budget）」的直接论述：上下文里的 token 越多，模型从中准确回忆信息的能力越低；每个新 token 都会消耗有限的注意力预算。同时明确这种退化是渐变而非断崖。本课「上下文污染」「注意力稀释」两节的论断以此为据。

关键引用:

> "as the number of tokens in the context window increases, the model's ability to accurately recall information from that context decreases"

> "LLMs have an 'attention budget' that they draw on when parsing large volumes of context. ... Every new token introduced depletes this budget by some amount"

> "these factors create a performance gradient rather than a hard cliff"

## S8 — Using the Messages API（Claude API）

URL: https://platform.claude.com/docs/en/build-with-claude/working-with-messages

- authority: official-docs

官方文档明确 Messages API 是无状态的：每次请求都必须自带完整对话历史，API 不在请求之间保留任何状态。本课第 6 课「每次调用都要把任务和上一轮信息原样写进 prompt」的实现前提以此为据。

关键引用:

> "The Messages API is stateless, which means that you always send the full conversational history to the API."

## S9 — Structured outputs（Claude API）

URL: https://platform.claude.com/docs/en/build-with-claude/structured-outputs

- authority: official-docs

官方文档说明：不使用结构化输出时，即使提示词写得很小心，模型仍可能产出格式不合法的 JSON（语法错误、缺字段、类型不一致）；结构化输出通过约束采样保证响应严格符合 schema。本课第 6 课「评审者被要求只回 JSON 仍需自行解析防御」一节的前提以此为据。

关键引用:

> "Structured outputs constrain Claude's responses to follow a specific schema, ensuring valid, parseable output for downstream processing."

> "Without structured outputs, Claude can generate malformed JSON responses or invalid tool inputs that break your applications. Even with careful prompting, you may encounter: Parsing errors from invalid JSON syntax"
