<!-- registry: A8, A9 -->
# 参考来源

本课程的关键论断都以下列来源为依据。正文用 `[^Sn]` 引用，具体引文摘录在每条下方。

## S1 — Building Effective AI Agents — Anthropic Engineering

URL: https://www.anthropic.com/engineering/building-effective-agents

- authority: authoritative-guide

Anthropic 工程团队关于「什么是 Agent、Agent 与工作流的区别、如何保持控制」的权威文章，给出了 Agent 作为「在循环里用工具」的定义、停止条件、检查点、以及自主性带来的成本与误差累积，是本课程循环与控制主题的核心依据。

关键引用：
> "They are typically just LLMs using tools based on environmental feedback in a loop."
> "Workflows are systems where LLMs and tools are orchestrated through predefined code paths."
> "Agents, on the other hand, are systems where LLMs dynamically direct their own processes and tool usage"
> "it's also common to include stopping conditions (such as a maximum number of iterations) to maintain control."
> "Agents can then pause for human feedback at checkpoints or when encountering blockers."
> "The autonomous nature of agents means higher costs, and the potential for compounding errors."
> "The LLM will potentially operate for many turns, and you must have some level of trust in its decision-making."
> "you should consider adding complexity only when it demonstrably improves outcomes."

## S2 — How tool use works — Claude API

URL: https://platform.claude.com/docs/en/agents-and-tools/tool-use/how-tool-use-works

- authority: official-docs

给出以 stop_reason 驱动的规范多轮循环步骤：模型只发出结构化请求、宿主执行工具、结果回流、只要 stop_reason 仍是 tool_use 就重复。是「核心循环」这一课的直接依据。

关键引用：
> "The model never executes anything on its own. It emits a structured request, your code (or Anthropic's servers) runs the operation, and the result flows back into the conversation. ... 2. Claude responds with stop_reason: "tool_use" and one or more tool_use blocks. 3. Execute each tool. Format the outputs as tool_result blocks. 4. Send a new request... 5. Repeat from step 2 while stop_reason is "tool_use"."

## S3 — Effective context engineering for AI agents — Anthropic Engineering

URL: https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents

- authority: authoritative-guide

说明 Agent 在循环里会不断累积上下文，而模型的「注意力预算」有限、上下文越长召回越差，因此循环必须被约束、上下文必须被治理。是「为什么要给循环设边界」的依据。

关键引用：
> "An agent running in a loop generates more and more data that could be relevant for the next turn of inference"
> "LLMs autonomously using tools in a loop"
> "LLMs have an "attention budget" that they draw on when parsing large volumes of context"
> "Every new token introduced depletes this budget by some amount"
> "as the number of tokens in the context window increases, the model's ability to accurately recall information from that context decreases"
> "some models exhibit more gentle degradation than others, this characteristic emerges across all models"
> "These factors create a performance gradient rather than a hard cliff"
> "agents that operate over multiple turns of inference and longer time horizons"
> "context, therefore, must be treated as a finite resource with diminishing marginal returns"

## S4 — LLM06:2025 Excessive Agency — OWASP Gen AI Security Project

URL: https://genai.owasp.org/llmrisk/llm062025-excessive-agency/

- authority: authoritative-guide

定义「过度授权」风险，并明确给出缓解手段：对高影响操作引入人在环审批。是「干预与操控」一课中把人工检查点放在不可逆操作之前的依据。

关键引用：
> "Excessive Agency is the vulnerability that enables damaging actions to be performed in response to unexpected, ambiguous, or manipulated outputs from an LLM, regardless of what is causing the LLM to malfunction. ... Utilise human-in-the-loop control to require a human to approve high-impact actions before they are taken. This may be implemented in a downstream system (outside the scope of the LLM application) or within the LLM extension itself."

## S5 — The 2026 Agent Engineering Roadmap — GitHub (codejunkie99/agent-roadmap-2026)

URL: https://github.com/codejunkie99/agent-roadmap-2026

- authority: blog

一份以「harness 工程」为主线的开源路线图，明确提出「同样的模型，换个 harness，结果完全不同」的核心论点，并把 harness 拆成循环控制、工具分发、上下文管理等组件。用于支撑「harness 决定可靠性」这一框架性论点。注意：本来源为 AI 辅助撰写的社区路线图，其中的基准分数、薪资等具体数字不作为事实引用，只取其框架性论点。

关键引用：
> "Same model, different harness, completely different result."
> "An agent makes its own control-flow decisions inside a loop."
> "the harness is the union of:"
> "loop control. The while-loop driving model→tools→model."
> "tool dispatch. Registry, schema validation, parallel calls, error recovery, retries."

## S6 — Handle tool calls — Claude API

URL: https://platform.claude.com/docs/en/agents-and-tools/tool-use/handle-tool-calls

- authority: official-docs

给出 tool_use 与 tool_result 内容块的确切字段规范，以及并行调用时所有 tool_result 必须集中回传的规则。用于第 6 课手写循环时精确构造请求/响应。

关键引用：
> "id: A unique identifier for this particular tool use block. ... name: The name of the tool being used. input: An object containing the input being passed to the tool, conforming to the tool's input_schema. ... tool_use_id: The id of the tool use request this is a result for. ... is_error (optional): Set to true if the tool execution resulted in an error."
> "Whichever strategy you use, return one tool_result for each tool_use block, all together in the next user message. Match each result to its call with tool_use_id, and put every tool_result block before any text content in that message."
