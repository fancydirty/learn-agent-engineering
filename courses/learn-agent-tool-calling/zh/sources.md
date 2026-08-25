# 参考资料来源

本课程的所有关键事实和定义均来自以下权威资料。

## S1 — Function calling — OpenAI API Guides

URL: https://developers.openai.com/api/docs/guides/function-calling

- authority: official-docs

说明 OpenAI 的工具调用（函数调用）本质上是应用程序与模型之间的多步骤对话，模型只是触发调用，真正的函数执行必须由调用方应用程序完成。

关键引用:
> "Tool calling is a multi-step conversation between your application and a model via the OpenAI API. When the model calls a function, you must execute it and return the result."

## S2 — Tool use with Claude — Overview

URL: https://platform.claude.com/docs/en/agents-and-tools/tool-use/overview

- authority: official-docs

概述 Claude 工具使用机制，区分由宿主应用执行的"客户端工具"与由 Anthropic 服务器执行的"服务器工具"，并给出触发工具调用后的基本响应结构。

关键引用:
> "It then returns a structured call that your application executes (client tools) or that Anthropic executes (server tools). ... Claude responds with stop_reason: "tool_use" and one or more tool_use blocks. Your code executes the operation and sends back a tool_result."

## S3 — Define tools — Claude API

URL: https://platform.claude.com/docs/en/agents-and-tools/tool-use/define-tools

- authority: official-docs

逐字给出一个工具定义必须包含的字段（name、description、input_schema）及其含义，是理解工具"契约"结构的权威参考。

关键引用:
> "A user-defined tool definition includes: name — The name of the tool. ... description — A detailed plaintext description of what the tool does, when it should be used, and how it behaves. input_schema — A JSON Schema object defining the expected parameters for the tool."

## S4 — How tool use works — Claude API

URL: https://platform.claude.com/docs/en/agents-and-tools/tool-use/how-tool-use-works

- authority: official-docs

明确指出模型本身从不执行任何操作、只发出结构化请求，真正的执行由宿主应用或 Anthropic 服务器完成，并给出以 stop_reason 驱动的规范多轮循环步骤，是本课程核心论点的最佳权威依据。

关键引用:
> "The model never executes anything on its own. It emits a structured request, your code (or Anthropic's servers) runs the operation, and the result flows back into the conversation. ... 2. Claude responds with stop_reason: "tool_use" and one or more tool_use blocks. 3. Execute each tool. Format the outputs as tool_result blocks. 4. Send a new request... 5. Repeat from step 2 while stop_reason is "tool_use"."

## S5 — Handle tool calls — Claude API

URL: https://platform.claude.com/docs/en/agents-and-tools/tool-use/handle-tool-calls

- authority: official-docs

给出 tool_use 与 tool_result 内容块的确切字段规范（id/name/input 与 tool_use_id/content/is_error），用于精确讲解请求/响应的字节级形状。

关键引用:
> "id: A unique identifier for this particular tool use block. ... name: The name of the tool being used. input: An object containing the input being passed to the tool, conforming to the tool's input_schema. ... tool_use_id: The id of the tool use request this is a result for. ... is_error (optional): Set to true if the tool execution resulted in an error."

## S6 — Tools reference — Claude Code Docs

URL: https://code.claude.com/docs/en/tools-reference

- authority: official-docs

列出 Claude Code 作为宿主应用所暴露的内置工具集合及其在权限规则、子代理工具列表和钩子匹配器中使用的确切名称，帮助学员理解真实宿主循环中的工具目录概念。

关键引用:
> "Claude Code has access to a set of built-in tools that help it understand and modify your codebase. The tool names are the exact strings you use in permission rules, subagent tool lists, and hook matchers."

## S7 — Tool Use — LM Studio Docs (OpenAI-compatible API)

URL: https://lmstudio.ai/docs/developer/openai-compat/tools

- authority: authoritative-guide

以 OpenAI 兼容 API 的实现文档形式，逐字确认响应中 tool_calls 数组的确切位置与 finish_reason 取值为 "tool_calls"，补足官方指南在响应结构描述上的空白。

关键引用:
> "If the model decides that the user message would be best fulfilled with a tool call, an array of tool call request objects will be provided in the response field, choices[0].message.tool_calls. The finish_reason field of the top-level response object will also be populated with "tool_calls"."

## S8 — Writing effective tools for AI agents—using AI agents | Anthropic Engineering

URL: https://www.anthropic.com/engineering/writing-tools-for-agents

- authority: authoritative-guide

说明好的工具描述必须消除输入输出的歧义,并指出工具数量越多并不代表智能体表现越好,过多相似工具会造成选择困难。

关键引用:
> "Avoid ambiguity by clearly describing (and enforcing with strict data models) expected inputs and outputs. ... More tools don't always lead to better outcomes."

## S9 — Introducing advanced tool use on the Claude Developer Platform | Anthropic Engineering

URL: https://www.anthropic.com/engineering/advanced-tool-use

- authority: authoritative-guide

用具体数字说明大量工具定义(尤其接入多个 MCP 服务器后)会在对话开始前消耗巨大的上下文 token,并说明工具返回的中间结果同样会全量进入模型上下文、挤占甚至顶掉重要信息,由此引出 Tool Search Tool 与程序化工具调用两项对策。

关键引用:
> "That's 58 tools consuming approximately 55K tokens before the conversation even starts. ... At Anthropic, we've seen tool definitions consume 134K tokens before optimization."
> "When Claude analyzes a 10MB log file for error patterns, the entire file enters its context window ... These intermediate results consume massive token budgets and can push important information out of the context window entirely."

## S10 — How to implement tool use - Claude Platform Docs

URL: https://platform.claude.com/docs/en/agents-and-tools/tool-use/implement-tool-use

- authority: official-docs

官方文档给出工具命名的最佳实践:用服务名做命名空间前缀避免歧义,并要求工具返回稳定、高信号的标识符而非内部引用。

关键引用:
> "Use meaningful namespacing in tool names. When your tools span multiple services or resources, prefix names with the service (e.g., github_list_prs, slack_send_message). This makes tool selection unambiguous as your library grows, and is especially important when using tool search."

## S11 — Tools - Model Context Protocol

URL: https://modelcontextprotocol.io/docs/concepts/tools

- authority: official-docs

MCP 官方规范区分协议错误与工具执行错误,并规定客户端应把可操作的工具执行错误反馈给模型,以便模型自我纠正重试。

关键引用:
> "Clients SHOULD provide tool execution errors to language models to enable self-correction."

## S12 — Specification - Model Context Protocol

URL: https://modelcontextprotocol.io/specification/2025-11-25

- authority: official-docs

官方规范说明 MCP 借鉴了 LSP 的思路,为整个 AI 应用生态系统标准化了工具与上下文的集成方式,让不同宿主应用都能以统一协议暴露工具。

关键引用:
> "MCP takes some inspiration from the Language Server Protocol, which standardizes how to add support for programming languages across a whole ecosystem of development tools. In a similar way, MCP standardizes how to integrate additional context and tools into the ecosystem of AI applications."

## S13 — What is the Model Context Protocol (MCP)? - Model Context Protocol

URL: https://modelcontextprotocol.io/introduction

- authority: official-docs

官方入门页用 USB-C 接口类比,直观解释 MCP 如何为 AI 应用与外部工具/数据源提供统一的标准化连接方式。

关键引用:
> "Think of MCP like a USB-C port for AI applications. Just as USB-C provides a standardized way to connect electronic devices, MCP provides a standardized way to connect AI applications to external systems."

## S14 — Creating your first schema - JSON Schema

URL: https://json-schema.org/learn/getting-started-step-by-step

- authority: official-docs

官方文档解释 JSON Schema 中 title/description 用于表达意图而不构成约束,$schema 用于声明所遵循的规范版本,为工具输入参数(inputSchema)的设计提供依据。

关键引用:
> "title and description: state the intent of the schema. These keywords don't add any constraints to the data being validated. ... $schema: specifies which draft of the JSON Schema standard the schema adheres to."

## S15 — Configure permissions - Claude Code Docs

URL: https://code.claude.com/docs/en/permissions

- authority: official-docs

作为官方文档，讲解 Claude Code 权限规则的确切语法（allow/deny/ask 及 Tool(specifier) 写法）与求值顺序，是课程讲解"权限规则语法"这一核心知识点的第一手依据。

关键引用:
> "Rules are evaluated in order: deny, then ask, then allow. The first match in that order determines the outcome, and rule specificity doesn't change the order. A broad deny rule like `Bash(aws *)` blocks every matching call, including calls that also match a narrower allow rule like `Bash(aws s3 ls)`, so a deny rule can't carry allowlist exceptions."

## S16 — Configure the sandboxed Bash tool - Claude Code Docs

URL: https://code.claude.com/docs/en/sandboxing

- authority: official-docs

官方文档说明沙箱的文件系统隔离与网络隔离是两个独立层，并解释操作系统级强制执行为何能在模型被提示注入操纵后仍然生效，用于讲解"写/执行类工具的爆炸半径"与沙箱的技术保障。

关键引用:
> "The two layers also differ in how they are enforced. Claude Code evaluates permission decisions before a command runs, based on the command string and, in auto mode, a separate classifier's judgment about whether the command is safe. The operating system enforces the sandbox boundary on the running process, so it holds regardless of what the model chose to run and even if an allowed command does more than its name suggests."

## S17 — Making Claude Code more secure and autonomous with sandboxing - Anthropic Engineering

URL: https://www.anthropic.com/engineering/claude-code-sandboxing

- authority: official-docs

Anthropic 工程博客明确将沙箱设计目标与"即便发生成功的提示注入"联系起来，是课程中论证"sandboxing 专门针对 prompt injection 风险"这一教学主张的权威来源。

关键引用:
> "Sandboxing ensures that even a successful prompt injection is fully isolated, and cannot impact overall user security. ... This is particularly important in preventing a prompt-injected Claude from modifying sensitive system files. ... Without network isolation, a compromised agent could exfiltrate sensitive files like SSH keys."

## S18 — LLM06:2025 Excessive Agency - OWASP Gen AI Security Project

URL: https://owasp.org/www-project-top-10-for-large-language-model-applications/2_0_vulns/LLM06_ExcessiveAgency.html

- authority: official-docs

OWASP 官方页面给出"过度代理（Excessive Agency）"的权威定义及其三大根因（功能过多、权限过大、自主性过高），并给出"人工审批高风险操作"的具体缓解措施，支撑课程中关于代理工具授权边界的核心章节。

关键引用:
> "Excessive Agency is the vulnerability that enables damaging actions to be performed in response to unexpected, ambiguous, or manipulated outputs from an LLM, regardless of what is causing the LLM to malfunction. ... Utilise human-in-the-loop control to require a human to approve high-impact actions before they are taken. This may be implemented in a downstream system (outside the scope of the LLM application) or within the LLM extension itself."

## S19 — The lethal trifecta for AI agents - Simon Willison's Weblog

URL: https://simonwillison.net/2025/Jun/16/the-lethal-trifecta/

- authority: authoritative-guide

该文提出并权威定义了业界广泛引用的"致命三要素"框架（私有数据访问、暴露于不可信内容、对外通信能力），用于课程讲解间接提示注入导致数据泄露的风险模型。

关键引用:
> "The lethal trifecta of capabilities is: Access to your private data—one of the most common purposes of tools in the first place! Exposure to untrusted content—any mechanism by which text (or images) controlled by a malicious attacker could become available to your LLM. The ability to externally communicate in a way that could be used to steal your data."

## S20 — Strict tool use — Claude API

URL: https://platform.claude.com/docs/en/agents-and-tools/tool-use/strict-tool-use

- authority: official-docs

官方文档说明默认（非 strict）模式下模型的工具输入并没有平台级的符合 schema 保证，可能出现类型不符或漏掉必填字段；设置 strict: true 后平台用语法约束采样保证输入严格匹配 input_schema，官方示例中的 strict 模式 schema 均同时设置 additionalProperties: false。

关键引用:
> "Setting strict: true on a tool definition guarantees Claude's tool inputs match your JSON Schema by constraining the model's token sampling to schema-valid outputs (a technique called grammar-constrained sampling). ... Without strict mode, Claude might return incompatible types ("2" instead of 2) or omit required fields, breaking your functions and causing runtime errors."

## S21 — Parallel tool use — Claude API

URL: https://platform.claude.com/docs/en/agents-and-tools/tool-use/parallel-tool-use

- authority: official-docs

官方文档规定并行工具调用的回传格式（所有 tool_result 必须集中放进紧随其后的同一条 user 消息、逐一用 tool_use_id 认领），并说明 disable_parallel_tool_use 开关：tool_choice 为 auto 时设为 true，模型每次响应最多只调用一个工具。

关键引用:
> "Whichever strategy you use, return one tool_result for each tool_use block, all together in the next user message. Match each result to its call with tool_use_id, and put every tool_result block before any text content in that message."
> "When tool_choice type is auto (the default), setting disable_parallel_tool_use: true means Claude calls at most one tool per response."
