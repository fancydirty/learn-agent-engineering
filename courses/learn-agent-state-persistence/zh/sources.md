<!-- registry: A8, A9 -->
# 参考来源

本课程的关键论断都以下列来源为依据。正文用 `[^Sn]` 引用，具体引文摘录在每条下方。

## S1 — How we built our multi-agent research system — Anthropic Engineering

URL: https://www.anthropic.com/engineering/multi-agent-research-system

- authority: authoritative-guide

Anthropic 多 Agent 研究系统的工程复盘，是本课程的核心依据：Agent 是有状态的、错误会复利；不能从头重启、要能从出错处恢复；可靠性靠「重试逻辑 + 定期检查点」这类确定性护栏与模型适应力的配合；部署更新时运行中的 Agent 可能处在流程任意一步。

关键引用：
> "Agents can run for long periods of time, maintaining state across many tool calls."
> "Agents are stateful and errors compound."
> "Without effective mitigations, minor system failures can be catastrophic for agents."
> "When errors occur, we can't just restart from the beginning: restarts are expensive and frustrating for users."
> "Instead, we built systems that can resume from where the agent was when the errors occurred."
> "This means we need to durably execute code and handle errors along the way."
> "the adaptability of AI agents built on Claude with deterministic safeguards like retry logic and regular checkpoints"
> "letting the agent know when a tool is failing and letting it adapt works surprisingly well"
> "we use rainbow deployments to avoid disrupting running agents, by gradually shifting traffic from old to new versions"
> "whenever we deploy updates, agents might be anywhere in their process."
> "agents summarize completed work phases and store essential information in external memory before proceeding to new tasks"

## S2 — Checkpointing — Claude Code Docs

URL: https://code.claude.com/docs/en/checkpointing

- authority: official-docs

Claude Code 检查点机制的官方文档，提供「检查点/回退/分叉」在真实产品里的完整形态：每条用户消息自动建检查点、随会话保存、可分别恢复对话或代码、bash 改动不被追踪、不能替代版本控制。本课把它当作产品级对照，而非要教的工具。

关键引用：
> "checkpointing automatically captures the state of your code before each user prompt."
> "Every user prompt creates a new checkpoint"
> "Claude Code saves checkpoints with the conversation, so you can still run /rewind after you resume a session"
> "Restore code and conversation: revert both code and conversation to that point"
> "Restore conversation: rewind to that message while keeping current code"
> "Restore code: revert file changes while keeping the conversation"
> "Exploring alternatives: try different implementation approaches without losing your starting point"
> "Recovering from mistakes: quickly undo changes that introduced bugs or broke functionality"
> "Checkpointing does not track files modified by bash commands."
> "Only direct file edits made through Claude's file editing tools are tracked."
> "Checkpoints are designed for quick, session-level recovery."
> "continue using version control, such as Git, for commits, branches, and long-term history."
> "To branch off and try a different approach while preserving the original session intact, use /branch or claude --continue --fork-session"

## S3 — Building Effective AI Agents — Anthropic Engineering

URL: https://www.anthropic.com/engineering/building-effective-agents

- authority: authoritative-guide

Anthropic 关于 Agent 模式的权威文章。本课用它支撑：Agent 可在检查点暂停等人反馈、自主性带来更高成本与误差累积、模型可能连跑很多轮而信任有限、以及「只在复杂度确实改善结果时才考虑增加」的分寸原则。

关键引用：
> "Agents can then pause for human feedback at checkpoints or when encountering blockers."
> "The autonomous nature of agents means higher costs, and the potential for compounding errors."
> "The LLM will potentially operate for many turns, and you must have some level of trust in its decision-making."
> "it's also common to include stopping conditions (such as a maximum number of iterations) to maintain control."
> "you should consider adding complexity only when it demonstrably improves outcomes."

## S4 — Handle tool calls — Claude API

URL: https://platform.claude.com/docs/en/agents-and-tools/tool-use/handle-tool-calls

- authority: official-docs

给出 tool_use 与 tool_result 内容块的字段规范与配对规则：每个 tool_use 都必须有对应的 tool_result 集中回传。本课「断点恢复」一课依赖这条规则处理「崩溃发生在工具执行与结果落账之间」的悬空调用。

关键引用：
> "id: A unique identifier for this particular tool use block. ... name: The name of the tool being used. input: An object containing the input being passed to the tool, conforming to the tool's input_schema. ... tool_use_id: The id of the tool use request this is a result for. ... is_error (optional): Set to true if the tool execution resulted in an error."
> "Whichever strategy you use, return one tool_result for each tool_use block, all together in the next user message. Match each result to its call with tool_use_id, and put every tool_result block before any text content in that message."

## S5 — The 2026 Agent Engineering Roadmap — GitHub (codejunkie99/agent-roadmap-2026)

URL: https://github.com/codejunkie99/agent-roadmap-2026

- authority: blog

以「harness 工程」为主线的社区开源路线图（AI 辅助撰写）。本课只取其框架性论点：持久化是 harness 组件之一，其职责是「每一步落检查点，以便恢复、回退、分叉」。注意：其中的百分比阈值、token 数、基准分数、薪资等具体数字一律不作为事实引用。

关键引用：
> "the harness is the union of:"
> "persistence. Checkpoint state every node so you can resume, rewind, fork."
> "Same model, different harness, completely different result."
