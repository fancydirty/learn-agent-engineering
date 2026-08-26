# 参考来源

本课程的关键论断都以下列来源为依据。正文用 `[^Sn]` 引用，具体引文摘录在每条下方。所有引文均于 2026-08-26 经程序化锚点提取并二次核验（94 条全部通过），保留原文的弯引号、破折号、乘号（4×）与混排引号（"gate” 处原文如此），不作任何改写。

写作纪律（对全部课节生效，逐条来自本次打底的覆盖缺口报告）：
- **「图」「节点」「边」「DAG」「状态机」在全部六个一手来源里零出现（grep 确认）**。「从循环到图」是**本课自己的工程隐喻**，用来组织一手材料里真实存在的词汇（agentic systems、workflows、patterns、orchestrator-workers、lead agent、subagents、coordinator、fan out）。第 5 课引入这套画法时必须明示是本课自创；最贴近的一手锚点是「工作流脚本自己持有循环、分支与中间结果」那句[^S5]。任何课节不得把图术语写成官方概念。
- 「确定性光谱」这个说法也是本课自创：一手材料只给了两端的定义（预定义代码路径 vs 模型自主决定）与「谁持有计划」这个轴[^S5]，从未叫它 spectrum。
- 路由只有「模式名」级背书（分类后分发[^S1]、按领域分发/难度升级[^S6]），没有「图里选一条边」「router 节点」的一手支持。
- 「节点间传递的状态对象」没有一手支持；最近的一句是「中间结果留在脚本变量里」[^S5]。类型化 state、合并策略等都是无引用的工程实践。
- **没有任何一手基准比较过确定性工作流与单循环 Agent**。90.2% 是多 Agent vs 单 Agent、在 Anthropic 内部研究评测上、Opus 4 主代理 + Sonnet 4 子代理的数字——不得用它论证「图比循环强」。
- 逐节点重试/超时/退避/熔断/幂等：一手只有一个从句（「重试逻辑与定期检查点这类确定性护栏」[^S2]）。更细的设计以工程实践口径写、零引用。
- 没有任何一手的手写编排代码示例。第 6 课的完整脚本是本课自己的构造，明说。
- 「一个循环什么时候不够」没有一手原话；可用的替代锚点是「任务需要的代理多到一场对话协调不动时」与「任务大过一个上下文、或同一步要跑很多条目时」[^S5]。
- 不得把 LangGraph 或任何第三方图框架的说法归给 Anthropic；S1 页面自带横幅声明其工具生态描述已过时（横幅原文见 S1 首条引文），只引它的模式与原则。
- 「生产者-评审者」是本系列第 6 门课的叫法，不是一手词汇；一手叫 evaluator-optimizer[^S1]与「对抗式互审」[^S5]——写到时要显式搭桥。
- 并行分支间的错误传播/补偿：一手只有一句、且是把它列为未解难题（「异步会在结果协调、状态一致性、跨子代理错误传播上添难」[^S2]），不得写成已有官方解法。
- 编排者自身的 token 开销没有独立数字；只有相对聊天的 4×/15× 乘数[^S2]。

## S1 — Building Effective AI Agents — Anthropic Engineering

URL: https://www.anthropic.com/engineering/building-effective-agents

- authority: authoritative-guide

Anthropic 关于 Agent 模式的原典（2024-12），本课的骨架来源：workflow 与 agent 的架构区分、增强型 LLM 作为基本构件、五大工作流模式（链式、路由、并行化、编排者-工人、评审-优化）各自的定义与适用时机、组合与自定的指引、以及贯穿全文的「先简后繁」。页面自带编辑横幅声明工具生态描述已过时——只引模式与原则，不当作现行工具指导。

关键引用：
> "Note: Much of the tooling landscape described in this post has changed since December 2024. For our current approach, see how we built Claude Managed Agents and the Managed Agents documentation."
> "Over the past year, we've worked with dozens of teams building large language model (LLM) agents across industries. Consistently, the most successful implementations weren't using complex frameworks or specialized libraries. Instead, they were building with simple, composable patterns."
> "At Anthropic, we categorize all these variations as agentic systems, but draw an important architectural distinction between workflows and agents:"
> "Workflows are systems where LLMs and tools are orchestrated through predefined code paths."
> "Agents, on the other hand, are systems where LLMs dynamically direct their own processes and tool usage, maintaining control over how they accomplish tasks."
> "When building applications with LLMs, we recommend finding the simplest solution possible, and only increasing complexity when needed. This might mean not building agentic systems at all. Agentic systems often trade latency and cost for better task performance, and you should consider when this tradeoff makes sense."
> "When more complexity is warranted, workflows offer predictability and consistency for well-defined tasks, whereas agents are the better option when flexibility and model-driven decision-making are needed at scale. For many applications, however, optimizing single LLM calls with retrieval and in-context examples is usually enough."
> "These frameworks make it easy to get started by simplifying standard low-level tasks like calling LLMs, defining and parsing tools, and chaining calls together. However, they often create extra layers of abstraction that can obscure the underlying prompts and responses, making them harder to debug. They can also make it tempting to add complexity when a simpler setup would suffice."
> "We suggest that developers start by using LLM APIs directly: many patterns can be implemented in a few lines of code. If you do use a framework, ensure you understand the underlying code. Incorrect assumptions about what's under the hood are a common source of customer error."
> "In this section, we’ll explore the common patterns for agentic systems we’ve seen in production. We'll start with our foundational building block—the augmented LLM—and progressively increase complexity, from simple compositional workflows to autonomous agents."
> "The basic building block of agentic systems is an LLM enhanced with augmentations such as retrieval, tools, and memory. Our current models can actively use these capabilities—generating their own search queries, selecting appropriate tools, and determining what information to retain."
> "Prompt chaining decomposes a task into a sequence of steps, where each LLM call processes the output of the previous one. You can add programmatic checks (see \"gate” in the diagram below) on any intermediate steps to ensure that the process is still on track."
> "When to use this workflow: This workflow is ideal for situations where the task can be easily and cleanly decomposed into fixed subtasks. The main goal is to trade off latency for higher accuracy, by making each LLM call an easier task."
> "Routing classifies an input and directs it to a specialized followup task. This workflow allows for separation of concerns, and building more specialized prompts. Without this workflow, optimizing for one kind of input can hurt performance on other inputs."
> "When to use this workflow: Routing works well for complex tasks where there are distinct categories that are better handled separately, and where classification can be handled accurately, either by an LLM or a more traditional classification model/algorithm."
> "LLMs can sometimes work simultaneously on a task and have their outputs aggregated programmatically. This workflow, parallelization, manifests in two key variations:"
> "Sectioning: Breaking a task into independent subtasks run in parallel."
> "Voting: Running the same task multiple times to get diverse outputs."
> "When to use this workflow: Parallelization is effective when the divided subtasks can be parallelized for speed, or when multiple perspectives or attempts are needed for higher confidence results. For complex tasks with multiple considerations, LLMs generally perform better when each consideration is handled by a separate LLM call, allowing focused attention on each specific aspect."
> "In the orchestrator-workers workflow, a central LLM dynamically breaks down tasks, delegates them to worker LLMs, and synthesizes their results."
> "When to use this workflow: This workflow is well-suited for complex tasks where you can’t predict the subtasks needed (in coding, for example, the number of files that need to be changed and the nature of the change in each file likely depend on the task). Whereas it’s topographically similar, the key difference from parallelization is its flexibility—subtasks aren't pre-defined, but determined by the orchestrator based on the specific input."
> "In the evaluator-optimizer workflow, one LLM call generates a response while another provides evaluation and feedback in a loop."
> "When to use this workflow: This workflow is particularly effective when we have clear evaluation criteria, and when iterative refinement provides measurable value. The two signs of good fit are, first, that LLM responses can be demonstrably improved when a human articulates their feedback; and second, that the LLM can provide such feedback. This is analogous to the iterative writing process a human writer might go through when producing a polished document."
> "Agents can handle sophisticated tasks, but their implementation is often straightforward. They are typically just LLMs using tools based on environmental feedback in a loop."
> "The task often terminates upon completion, but it’s also common to include stopping conditions (such as a maximum number of iterations) to maintain control."
> "When to use agents: Agents can be used for open-ended problems where it’s difficult or impossible to predict the required number of steps, and where you can’t hardcode a fixed path. The LLM will potentially operate for many turns, and you must have some level of trust in its decision-making. Agents' autonomy makes them ideal for scaling tasks in trusted environments."
> "The autonomous nature of agents means higher costs, and the potential for compounding errors. We recommend extensive testing in sandboxed environments, along with the appropriate guardrails."
> "These building blocks aren't prescriptive. They're common patterns that developers can shape and combine to fit different use cases. The key to success, as with any LLM features, is measuring performance and iterating on implementations. To repeat: you should consider adding complexity only when it demonstrably improves outcomes."
> "Success in the LLM space isn't about building the most sophisticated system. It's about building the right system for your needs. Start with simple prompts, optimize them with comprehensive evaluation, and add multi-step agentic systems only when simpler solutions fall short."
> "Frameworks can help you get started quickly, but don't hesitate to reduce abstraction layers and build with basic components as you move to production."

## S2 — How we built our multi-agent research system — Anthropic Engineering

URL: https://www.anthropic.com/engineering/multi-agent-research-system

- authority: authoritative-guide

Anthropic 多 Agent 研究系统的工程复盘（2025-06）——一个真实上线的编排者-工人系统的第一手教训：为什么扇出（关注点分离、并行上下文窗口、token 容量）、90.2% 与 4×/15× 的准确语境、什么时候不适合多 Agent、协调复杂度的增长、派工提示词的四要素、按复杂度配额的规则、两级并行的提速数字、同步执行的瓶颈与异步的代价、引用传物而非传载荷。

关键引用：
> "A multi-agent system consists of multiple agents (LLMs autonomously using tools in a loop) working together. Our Research feature involves an agent that plans a research process based on user queries, and then uses tools to create parallel agents that search for information simultaneously. Systems with multiple agents introduce new challenges in agent coordination, evaluation, and reliability."
> "Research work involves open-ended problems where it’s very difficult to predict the required steps in advance. You can’t hardcode a fixed path for exploring complex topics, as the process is inherently dynamic and path-dependent."
> "The essence of search is compression: distilling insights from a vast corpus. Subagents facilitate compression by operating in parallel with their own context windows, exploring different aspects of the question simultaneously before condensing the most important tokens for the lead research agent. Each subagent also provides separation of concerns—distinct tools, prompts, and exploration trajectories—which reduces path dependency and enables thorough, independent investigations."
> "Our internal evaluations show that multi-agent research systems excel especially for breadth-first queries that involve pursuing multiple independent directions simultaneously. We found that a multi-agent system with Claude Opus 4 as the lead agent and Claude Sonnet 4 subagents outperformed single-agent Claude Opus 4 by 90.2% on our internal research eval."
> "Multi-agent systems work mainly because they help spend enough tokens to solve the problem. In our analysis, three factors explained 95% of the performance variance in the BrowseComp evaluation (which tests the ability of browsing agents to locate hard-to-find information). We found that token usage by itself explains 80% of the variance, with the number of tool calls and the model choice as the two other explanatory factors."
> "This finding validates our architecture that distributes work across agents with separate context windows to add more capacity for parallel reasoning."
> "There is a downside: in practice, these architectures burn through tokens fast. In our data, agents typically use about 4× more tokens than chat interactions, and multi-agent systems use about 15× more tokens than chats. For economic viability, multi-agent systems require tasks where the value of the task is high enough to pay for the increased performance."
> "Further, some domains that require all agents to share the same context or involve many dependencies between agents are not a good fit for multi-agent systems today. For instance, most coding tasks involve fewer truly parallelizable tasks than research, and LLM agents are not yet great at coordinating and delegating to other agents in real time."
> "We’ve found that multi-agent systems excel at valuable tasks that involve heavy parallelization, information that exceeds single context windows, and interfacing with numerous complex tools."
> "Our Research system uses a multi-agent architecture with an orchestrator-worker pattern, where a lead agent coordinates the process while delegating to specialized subagents that operate in parallel."
> "When a user submits a query, the lead agent analyzes it, develops a strategy, and spawns subagents to explore different aspects simultaneously."
> "Multi-agent systems have key differences from single-agent systems, including a rapid growth in coordination complexity. Early agents made errors like spawning 50 subagents for simple queries, scouring the web endlessly for nonexistent sources, and distracting each other with excessive updates."
> "Teach the orchestrator how to delegate. In our system, the lead agent decomposes queries into subtasks and describes them to subagents. Each subagent needs an objective, an output format, guidance on the tools and sources to use, and clear task boundaries. Without detailed task descriptions, agents duplicate work, leave gaps, or fail to find necessary information."
> "For instance, one subagent explored the 2021 automotive chip crisis while 2 others duplicated work investigating current 2025 supply chains, without an effective division of labor."
> "Scale effort to query complexity. Agents struggle to judge appropriate effort for different tasks, so we embedded scaling rules in the prompts. Simple fact-finding requires just 1 agent with 3-10 tool calls, direct comparisons might need 2-4 subagents with 10-15 calls each, and complex research might use more than 10 subagents with clearly divided responsibilities."
> "Parallel tool calling transforms speed and performance. Complex research tasks naturally involve exploring many sources. Our early agents executed sequential searches, which was painfully slow. For speed, we introduced two kinds of parallelization: (1) the lead agent spins up 3-5 subagents in parallel rather than serially; (2) the subagents use 3+ tools in parallel. These changes cut research time by up to 90% for complex queries, allowing Research to do more work in minutes instead of hours while covering more information than other systems."
> "Multi-agent systems have emergent behaviors, which arise without specific programming. For instance, small changes to the lead agent can unpredictably change how subagents behave. Success requires understanding interaction patterns, not just individual agent behavior."
> "In traditional software, a bug might break a feature, degrade performance, or cause outages. In agentic systems, minor changes cascade into large behavioral changes, which makes it remarkably difficult to write code for complex agents that must maintain state in a long-running process."
> "We combine the adaptability of AI agents built on Claude with deterministic safeguards like retry logic and regular checkpoints."
> "Instead, we use rainbow deployments to avoid disrupting running agents, by gradually shifting traffic from old to new versions while keeping both running simultaneously."
> "Synchronous execution creates bottlenecks. Currently, our lead agents execute subagents synchronously, waiting for each set of subagents to complete before proceeding. This simplifies coordination, but creates bottlenecks in the information flow between agents. For instance, the lead agent can’t steer subagents, subagents can’t coordinate, and the entire system can be blocked while waiting for a single subagent to finish searching."
> "Asynchronous execution would enable additional parallelism: agents working concurrently and creating new subagents when needed. But this asynchronicity adds challenges in result coordination, state consistency, and error propagation across the subagents."
> "When building AI agents, the last mile often becomes most of the journey. Codebases that work on developer machines require significant engineering to become reliable production systems. The compound nature of errors in agentic systems means that minor issues for traditional software can derail agents entirely."
> "Rather than requiring subagents to communicate everything through the lead agent, implement artifact systems where specialized agents can create outputs that persist independently. Subagents call tools to store their work in external systems, then pass lightweight references back to the coordinator."

## S3 — Writing effective tools for agents — with agents — Anthropic Engineering

URL: https://www.anthropic.com/engineering/writing-tools-for-agents

- authority: authoritative-guide

工具工程文章（2025-09），本课只取两件事：确定性与非确定性系统的定义式对照（整门课的词汇地基），以及「一条任务一个 agentic while 循环、由代码驱动」——第 6 课那张图要组合的正是这个单元。

关键引用：
> "In computing, deterministic systems produce the same output every time given identical inputs, while non-deterministic systems—like agents—can generate varied responses even with the same starting conditions."
> "When we traditionally write software, we’re establishing a contract between deterministic systems."
> "Tools are a new kind of software which reflects a contract between deterministic systems and non-deterministic agents."
> "We recommend running your evaluation programmatically with direct LLM API calls. Use simple agentic loops (while-loops wrapping alternating LLM API and tool calls): one loop for each evaluation task. Each evaluation agent should be given a single task prompt and your tools."
> "To build effective tools for agents, we need to re-orient our software development practices from predictable, deterministic patterns to non-deterministic ones."

## S4 — Create custom subagents — Claude Code 官方文档

URL: https://code.claude.com/docs/en/sub-agents

- authority: official-docs

Claude Code 子代理文档——产品级的组合原语：独立上下文窗口与权限、何时委派（防上下文被淹）、扇出与合成、串行链、前台/后台语义、嵌套深度上限（三层）与并发上限（默认 20）——组合深度与并发在真实产品里都是有界的。

关键引用：
> "Subagents are specialized AI assistants that handle specific types of tasks. Use one when a side task would flood your main conversation with search results, logs, or file contents you won't reference again: the subagent does that work in its own context and returns only the summary."
> "Each subagent runs in its own context window with a custom system prompt, specific tool access, and independent permissions. When Claude encounters a task that matches a subagent's description, it delegates to that subagent, which works independently and returns results."
> "Preserve context by keeping exploration and implementation out of your main conversation"
> "For independent investigations, spawn multiple subagents to work simultaneously:"
> "Each subagent explores its area independently, then Claude synthesizes the findings. This works best when the research paths don't depend on each other."
> "When subagents complete, their results return to your main conversation. Running many subagents that each return detailed results can consume significant context."
> "For multi-step workflows, ask Claude to use subagents in sequence. Each subagent completes its task and returns results to Claude, which then passes relevant context to the next subagent."
> "Foreground subagents block the main conversation until complete. Permission prompts are passed through to you as they come up."
> "Background subagents run concurrently while you continue working."
> "A background subagent's results reach Claude as a completion notification in a later turn."
> "By default, a subagent can spawn subagents of its own, up to three layers below the main conversation. At the depth limit, Claude Code withholds the Agent tool from every subagent except a fork, so a subagent at the limit does its delegated work itself and returns one summary."
> "Nested subagents suit a delegated task that itself splits into parallel subtasks, such as a reviewer subagent that dispatches a verifier per finding, so the intermediate output never reaches your main conversation. Only the top-level subagent's summary returns to you."
> "Two limits control subagent use, each with its own variable: this one stops Claude from spawning more subagents while too many are running, and the depth limit caps how deeply subagents nest. There's no limit on the total number of subagents Claude can spawn over a session."
> "By default, when 20 subagents are running in a session, spawning another with the Agent tool fails with Concurrent subagent limit reached, and the error tells Claude not to retry."

## S5 — Orchestrate subagents at scale with dynamic workflows — Claude Code 官方文档

URL: https://code.claude.com/docs/en/workflows

- authority: official-docs

Claude Code 动态工作流文档——「编排住进代码里」的产品级实现，本课最贴身的一页：谁持有计划这个轴；工作流脚本自己持有循环、分支与中间结果、模型上下文只装最终答案；中间结果留在脚本变量里；扇出-收集、查-修-再查到不再有进展；并发 16、单次运行 1000 代理的上界；逐步结果追踪带来可恢复性、细粒度扇出比一条长代理保住更多进度。

关键引用：
> "A dynamic workflow is a JavaScript script that orchestrates subagents at scale. Claude writes the script for the task you describe, and a runtime executes it in the background while your session stays responsive."
> "Reach for a workflow when a task needs more agents than one conversation can coordinate, or when you want the orchestration codified as a script you can read and rerun."
> "Subagents, skills, agent teams, and workflows can all run a multi-step task. The difference is who holds the plan:"
> "A workflow moves the plan into code. With subagents, skills, and agent teams, Claude is the orchestrator: it decides turn by turn what to spawn or assign next, and every result lands in a context window. A workflow script holds the loop, the branching, and the intermediate results itself, so Claude's context holds only the final answer."
> "Moving the plan into code also lets a workflow apply a repeatable quality pattern, not just run more agents: it can have independent agents adversarially review each other's findings before they're reported, or draft a plan from several angles and weigh them against each other, so you get a more trustworthy result than a single pass."
> "The workflow runtime executes the script in an isolated environment, separate from your conversation. Intermediate results stay in script variables instead of landing in Claude's context."
> "A workflow fits best when the task is larger than one agent can hold in context, or when the same step needs to run across many items."
> "Fan out one agent per file, then collect and verify the findings."
> "Run a checker, fix what failed, and repeat until it passes or stops making progress."
> "Up to 16 concurrent agents, fewer when Claude Code has fewer CPUs available, including inside a CPU-limited container"
> "1,000 agents total per run"
> "The runtime tracks each agent's result as the run progresses, which is what makes a run resumable within the same session."
> "A workflow that fans work out across many small agents therefore preserves more progress than one long agent."

## S6 — Multiagent orchestration — Claude API 文档（Managed Agents）

URL: https://platform.claude.com/docs/en/managed-agents/multiagent-orchestration

- authority: official-docs

现行 Claude 平台的多代理编排页——S1 横幅指向的「现行做法」。价值有二：给出 API 级的组合契约（共享沙箱与文件系统、每个代理独立会话线程、线程持久可续聊、并发上限 25），并且独立点名了 Parallelization / Specialization / Escalation——证明 2024 年那套模式分类在现行第一方词汇里仍然活着。

关键引用：
> "Multiagent orchestration lets one agent coordinate with others to complete complex work. Agents can act in parallel with their own isolated context, which helps improve output quality and can also improve time to completion."
> "All agents share the same sandbox, filesystem, and vault credentials, but each agent runs in its own session thread, a context-isolated event stream with its own conversation history."
> "Threads are persistent: the coordinator can send a follow-up to an agent it called earlier, and that agent retains everything from its previous turns."
> "Multiagent coordination is best suited for complex tasks that either require work across a variety of surfaces, or where multiple well-scoped tasks contribute to an overall goal."
> "Parallelization: Fan out independent subtasks simultaneously (searching multiple sources, analyzing separate files) and have the coordinator synthesize the results."
> "Specialization: Route to agents with domain-focused system prompts and tools, such as a security agent or a documentation agent, rather than loading a single agent with every capability."
> "Escalation: Consult a more capable agent or model for a subset of complex subtasks."
> "A maximum of 25 concurrent threads is supported. The coordinator can call multiple copies of a single agent in the roster, creating multiple threads associated with one agent."
