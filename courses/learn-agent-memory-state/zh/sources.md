# 参考来源

## S1 — Context windows

URL: https://platform.claude.com/docs/en/build-with-claude/context-windows

- authority: official-docs

Anthropic 官方文档，解释「上下文窗口」这个「模型的工作记忆」由什么构成——系统提示词、每一条消息（包括工具结果、图片、文档）、工具定义，以及模型本轮的输出（含扩展思考）全部计入。同时定义了「上下文腐化」（context rot）——token 数越堆越多，准确率和召回率会下降，并说明每次响应的 usage 字段会报告本次请求的消耗。这是第 1 课「上下文窗口就是 Agent 的全部记忆」的主依据，也为第 2 课「对话历史只增不减」提供背景支撑。

关键引用：
> "As token count grows, accuracy and recall degrade, a phenomenon known as *context rot*. This makes curating what's in context just as important as how much space is available."
> "Everything in the request counts toward the context window: the system prompt, every message in messages (including tool results, images, and documents), and your tool definitions. The output Claude generates for the turn, including its extended thinking, counts too."
> "As the conversation advances through turns, each user message and assistant response accumulates within the context window, and previous turns are preserved completely."
> "The context window (up to 1M tokens, depending on the model) holds the conversation history plus the new output Claude generates."
> "Every response reports what the request consumed in its `usage` field."

## S2 — Context engineering: memory, compaction, and tool clearing

URL: https://platform.claude.com/cookbook/tool-use-context-engineering-context-engineering-tools

- authority: official-docs

Anthropic 官方 Cookbook，精确定义应对上下文膨胀的三种机制：compaction（摘要压缩，把整个窗口压成一份高保真摘要，消耗一次摘要模型的推理）、tool-result clearing（工具结果清理，只丢弃陈旧且可重新获取的工具结果，保留调用记录）、memory 工具原语（把信息移出窗口，让它跨会话留存），并说明三者可独立或组合使用、清理与压缩都只作用于当前上下文而帮不了新会话。这是第 2 课「对话历史管理」的主依据，同时为第 3、4、6 课提供跨会话记忆动机与机制组合的背景。

关键引用：
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

Anthropic 官方文档，说明 CLAUDE.md 和 Auto memory 这两套互补的记忆机制：CLAUDE.md 由人来写、每次会话开始时整份载入上下文，官方建议的体量目标是 200 行以内（真正的硬上限是 4 MiB，超过会被整个跳过）；Auto memory 由 Claude 自己写，存成 MEMORY.md 索引加按需加载的主题文件，每次会话只载入索引的前 200 行或 25KB，主题文件不在启动时加载、而是在需要时才被按需读取。文档还说明块级 HTML 注释会在注入上下文前被剥离，以及项目根目录的 CLAUDE.md 在 `/compact` 之后会被重新读取并注回会话。这是第 3 课「外部记忆：文件与检索」的主依据，也被第 5、6 课复用。

关键引用：
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

Anthropic 官方文档，定义待办事项在 Agent 执行过程中的完整生命周期：创建（Created）、激活（Activated）、完成（Completed）、删除（Removed），并说明这套状态是通过结构化的工具调用（TaskCreate / TaskUpdate）暴露出来的，能在消息流里被观察到。这是第 4 课「结构化状态」的主依据。

关键引用：
> "Claude moves each todo through a predictable lifecycle:\n\n1. **Created**: Claude adds the todo as pending when it identifies a task\n2. **Activated**: Claude sets the todo to in_progress when it starts the work\n3. **Completed**: Claude marks it completed when the task finishes successfully\n4. **Removed**: Claude deletes a todo it no longer needs by setting status: \"deleted\" in a TaskUpdate call"
> "In a session that has the task-tracking tools, Claude keeps a written todo list, updating each item's status as it works. You see each change in the message stream as a structured tool call."

## S5 — Memory Is a Feature. It Is Also an Attack Surface

URL: https://genai.owasp.org/2026/05/13/memory-is-a-feature-it-is-also-an-attack-surface/

- authority: authoritative-guide

发表在 OWASP Gen AI Security Project 官方博客上的文章，由 ASI06（记忆与上下文投毒）条目共同负责人撰写，以 Cisco 研究团队披露的 MemoryTrap 漏洞为例：一次看起来无害的「克隆仓库、批准依赖安装」的常规操作，让恶意载荷写进了持久记忆、全局 hooks 配置，甚至通过系统提示词影响了一层高信任的指令层——一次性的操作就能跨会话、跨项目地改变模型未来的行为。文章还说明 Anthropic 在 Cisco 披露后，于 Claude Code v2.1.50 中把用户记忆从系统提示词里移除。这是第 5 课「记忆的边界与安全」的主依据，也被第 6 课复用于讨论持久记忆层的安全设计。

关键引用：
> "Agentic systems do not just respond in the moment. They retain context, reuse memory, and rely on persistent state to guide future reasoning and actions. That is what makes them useful. It is also what makes them vulnerable."
> "In the vulnerability we called MemoryTrap, we found that a routine developer workflow could turn into persistent prompt injection. The path was surprisingly ordinary: clone a repository, let the agent help, approve a dependency installation, and move on."
> "Instead, it reached persistent memory, the global hooks configuration, and even influenced a highly trusted instruction layer through the system prompt. In other words, a one-time action could shape the model's future behavior across sessions, projects, and even reboots."
> "To Anthropic's credit, after we at Cisco disclosed the issue, Claude Code v2.1.50 removed user memories from the system prompt, reducing the specific high-trust override path we identified. That was the right fix for the path we found."
> "Once malicious content reaches trusted surfaces like memory, hooks, or configuration, the attacker is no longer just influencing one response. They are influencing future reasoning."
> "That is why MemoryTrap maps so clearly to ASI06: Memory & Context Poisoning."

## S6 — Using the Messages API

URL: https://platform.claude.com/docs/en/build-with-claude/working-with-messages

- authority: official-docs

官方文档明确 Messages API 是无状态的：每次请求都必须自带完整对话历史，API 不在请求之间保留任何状态。这是第 1 课「API 调用是无状态的」这一核心命题的直接依据，也支撑第 4 课「会话结束后进度记录随窗口一起消失」的前提。

关键引用：
> "The Messages API is stateless, which means that you always send the full conversational history to the API."

## S7 — Handle tool calls

URL: https://platform.claude.com/docs/en/agents-and-tools/tool-use/handle-tool-calls

- authority: official-docs

官方文档规定工具调用的配对规则：tool_result 块必须紧跟在对应的 tool_use 块之后，配对断裂会导致请求报错。这是第 2 课「截断不能切断 tool_use/tool_result 配对」与第 6 课 splitKeepingToolPairs 设计动机的直接依据。

关键引用：
> "Tool result blocks must immediately follow their corresponding tool use blocks in the message history. You cannot include any messages between the assistant's tool use message and the user's tool result message."
> "If you receive an error like \"tool_use ids were found without tool_result blocks immediately after\", check that your tool results are formatted correctly."

## S8 — Compaction

URL: https://platform.claude.com/docs/en/build-with-claude/compaction

- authority: official-docs

官方文档给出服务器端摘要压缩的参数细节：触发阈值最低 50,000 token（服务器端强制），长对话可能发生多次压缩，最后一个压缩块反映提示词的最终状态，单次请求内压缩也可能发生多次。这是第 2 课压缩机制细节的直接依据。

关键引用：
> "`input_tokens` is the only supported trigger type. `value` must be at least 50,000 tokens."
> "A long-running conversation might result in multiple compactions. The last compaction block reflects the final state of the prompt, replacing content prior to it with the generated summary."
> "Compaction might occur multiple times within a single request depending on your trigger threshold and the amount of output generated."

## S9 — How tool use works

URL: https://platform.claude.com/docs/en/agents-and-tools/tool-use/how-tool-use-works

- authority: official-docs

官方文档给出以 stop_reason 驱动的工具执行循环规范：模型从不亲自执行任何操作，只发出结构化请求，宿主执行后把结果送回，stop_reason 仍是 tool_use 就继续循环。这是第 6 课「起点：第 4 门课那个执行循环」一段的直接依据。

关键引用：
> "The model never executes anything on its own. It emits a structured request, your code (or Anthropic's servers) runs the operation, and the result flows back into the conversation. ... 2. Claude responds with stop_reason: "tool_use" and one or more tool_use blocks. 3. Execute each tool. Format the outputs as tool_result blocks. 4. Send a new request... 5. Repeat from step 2 while stop_reason is "tool_use"."
