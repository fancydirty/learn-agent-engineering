# Sources

Every key claim in this course is grounded in the sources below, cited in the main text as `[^Sn]`, with specific quoted passages extracted under each entry. All 94 quotes were programmatically anchor-extracted and re-verified on 2026-08-26 (all passed), preserving the original curly quotes, em-dashes, multiplication signs (4×), and mixed quotation marks ("gate" appears exactly as in source), with no rewording.

Writing discipline (applies to all lessons, each item drawn from the coverage-gap report established for this course):
- **"Graph," "node," "edge," "DAG," and "state machine" appear zero times across all six primary sources (grep-confirmed)**. "From loops to graphs" is **this course's own engineering metaphor**, used to organize vocabulary that actually exists in the primary materials (agentic systems, workflows, patterns, orchestrator-workers, lead agent, subagents, coordinator, fan out). Lesson 5, which introduces this visual system, must explicitly state it is this course's creation; the closest primary anchor is the statement that "the workflow script itself holds the loop, branching, and intermediate results"[^S5]. No lesson may present graph terminology as an official concept.
- The "determinism spectrum" phrasing is also this course's creation: primary sources only provide definitions of the two endpoints (predefined code paths vs. model-driven decisions) and the axis of "who holds the plan"[^S5], never calling it a spectrum.
- Routing has backing only at the "pattern name" level (classify-then-dispatch[^S1], domain-based dispatch / difficulty escalation[^S6]), with no primary support for "choosing an edge in a graph" or a "router node."
- "State objects passed between nodes" has no primary support; the closest statement is "intermediate results stay in script variables"[^S5]. Typed state, merge strategies, etc. are all engineering practices without citation.
- **No primary source compares deterministic workflows against single-loop agents**. The 90.2% figure is multi-agent vs. single-agent, on Anthropic's internal research eval, with Opus 4 lead + Sonnet 4 subagents—it must not be used to argue "graphs beat loops."
- Per-node retry/timeout/backoff/circuit-breaking/idempotency: primary sources offer only one subordinate clause ("deterministic safeguards like retry logic and regular checkpoints"[^S2]). More detailed designs should be written as engineering practice, with zero citations.
- No primary source provides hand-written orchestration code examples. Lesson 6's complete script is this course's own construction and must be labeled as such.
- "When is one loop not enough" has no verbatim primary source; usable substitute anchors are "when a task needs more agents than one conversation can coordinate" and "when the task is larger than one agent can hold in context, or when the same step needs to run across many items"[^S5].
- Do not attribute LangGraph or any third-party graph framework's terminology to Anthropic; the S1 page carries a banner declaring its tooling-ecosystem descriptions outdated (banner text in S1's first quote), so only cite its patterns and principles.
- "Producer-reviewer" is the naming convention from Course 6 in this series, not primary vocabulary; primary sources say evaluator-optimizer[^S1] and "adversarially review"[^S5]—bridge explicitly when writing to it.
- Error propagation/compensation between parallel branches: primary sources offer only one sentence, and it lists this as an unsolved challenge ("asynchronicity adds challenges in result coordination, state consistency, and error propagation across the subagents"[^S2]), so it must not be written as having an official solution.
- The orchestrator's own token cost has no standalone figure; only the 4×/15× multipliers relative to chat[^S2].

## S1 — Building Effective AI Agents — Anthropic Engineering

URL: https://www.anthropic.com/engineering/building-effective-agents

- authority: authoritative-guide

Anthropic's canonical text on agent patterns (December 2024), the skeletal source for this course: the architectural distinction between workflows and agents, augmented LLMs as the foundational building block, definitions and appropriate use cases for the five major workflow patterns (prompt chaining, routing, parallelization, orchestrator-workers, evaluator-optimizer), guidance on composition and customization, and the "start simple, increase complexity only when needed" thread that runs throughout. The page carries an editorial banner stating that its tooling-ecosystem descriptions are outdated—cite only patterns and principles, not as current tooling guidance.

Key quote:
> "Note: Much of the tooling landscape described in this post has changed since December 2024. For our current approach, see how we built Claude Managed Agents and the Managed Agents documentation."
> "Over the past year, we've worked with dozens of teams building large language model (LLM) agents across industries. Consistently, the most successful implementations weren't using complex frameworks or specialized libraries. Instead, they were building with simple, composable patterns."
> "At Anthropic, we categorize all these variations as agentic systems, but draw an important architectural distinction between workflows and agents:"
> "Workflows are systems where LLMs and tools are orchestrated through predefined code paths."
> "Agents, on the other hand, are systems where LLMs dynamically direct their own processes and tool usage, maintaining control over how they accomplish tasks."
> "When building applications with LLMs, we recommend finding the simplest solution possible, and only increasing complexity when needed. This might mean not building agentic systems at all. Agentic systems often trade latency and cost for better task performance, and you should consider when this tradeoff makes sense."
> "When more complexity is warranted, workflows offer predictability and consistency for well-defined tasks, whereas agents are the better option when flexibility and model-driven decision-making are needed at scale. For many applications, however, optimizing single LLM calls with retrieval and in-context examples is usually enough."
> "These frameworks make it easy to get started by simplifying standard low-level tasks like calling LLMs, defining and parsing tools, and chaining calls together. However, they often create extra layers of abstraction that can obscure the underlying prompts and responses, making them harder to debug. They can also make it tempting to add complexity when a simpler setup would suffice."
> "We suggest that developers start by using LLM APIs directly: many patterns can be implemented in a few lines of code. If you do use a framework, ensure you understand the underlying code. Incorrect assumptions about what's under the hood are a common source of customer error."
> "In this section, we'll explore the common patterns for agentic systems we've seen in production. We'll start with our foundational building block—the augmented LLM—and progressively increase complexity, from simple compositional workflows to autonomous agents."
> "The basic building block of agentic systems is an LLM enhanced with augmentations such as retrieval, tools, and memory. Our current models can actively use these capabilities—generating their own search queries, selecting appropriate tools, and determining what information to retain."
> "Prompt chaining decomposes a task into a sequence of steps, where each LLM call processes the output of the previous one. You can add programmatic checks (see \"gate" in the diagram below) on any intermediate steps to ensure that the process is still on track."
> "When to use this workflow: This workflow is ideal for situations where the task can be easily and cleanly decomposed into fixed subtasks. The main goal is to trade off latency for higher accuracy, by making each LLM call an easier task."
> "Routing classifies an input and directs it to a specialized followup task. This workflow allows for separation of concerns, and building more specialized prompts. Without this workflow, optimizing for one kind of input can hurt performance on other inputs."
> "When to use this workflow: Routing works well for complex tasks where there are distinct categories that are better handled separately, and where classification can be handled accurately, either by an LLM or a more traditional classification model/algorithm."
> "LLMs can sometimes work simultaneously on a task and have their outputs aggregated programmatically. This workflow, parallelization, manifests in two key variations:"
> "Sectioning: Breaking a task into independent subtasks run in parallel."
> "Voting: Running the same task multiple times to get diverse outputs."
> "When to use this workflow: Parallelization is effective when the divided subtasks can be parallelized for speed, or when multiple perspectives or attempts are needed for higher confidence results. For complex tasks with multiple considerations, LLMs generally perform better when each consideration is handled by a separate LLM call, allowing focused attention on each specific aspect."
> "In the orchestrator-workers workflow, a central LLM dynamically breaks down tasks, delegates them to worker LLMs, and synthesizes their results."
> "When to use this workflow: This workflow is well-suited for complex tasks where you can't predict the subtasks needed (in coding, for example, the number of files that need to be changed and the nature of the change in each file likely depend on the task). Whereas it's topographically similar, the key difference from parallelization is its flexibility—subtasks aren't pre-defined, but determined by the orchestrator based on the specific input."
> "In the evaluator-optimizer workflow, one LLM call generates a response while another provides evaluation and feedback in a loop."
> "When to use this workflow: This workflow is particularly effective when we have clear evaluation criteria, and when iterative refinement provides measurable value. The two signs of good fit are, first, that LLM responses can be demonstrably improved when a human articulates their feedback; and second, that the LLM can provide such feedback. This is analogous to the iterative writing process a human writer might go through when producing a polished document."
> "Agents can handle sophisticated tasks, but their implementation is often straightforward. They are typically just LLMs using tools based on environmental feedback in a loop."
> "The task often terminates upon completion, but it's also common to include stopping conditions (such as a maximum number of iterations) to maintain control."
> "When to use agents: Agents can be used for open-ended problems where it's difficult or impossible to predict the required number of steps, and where you can't hardcode a fixed path. The LLM will potentially operate for many turns, and you must have some level of trust in its decision-making. Agents' autonomy makes them ideal for scaling tasks in trusted environments."
> "The autonomous nature of agents means higher costs, and the potential for compounding errors. We recommend extensive testing in sandboxed environments, along with the appropriate guardrails."
> "These building blocks aren't prescriptive. They're common patterns that developers can shape and combine to fit different use cases. The key to success, as with any LLM features, is measuring performance and iterating on implementations. To repeat: you should consider adding complexity only when it demonstrably improves outcomes."
> "Success in the LLM space isn't about building the most sophisticated system. It's about building the right system for your needs. Start with simple prompts, optimize them with comprehensive evaluation, and add multi-step agentic systems only when simpler solutions fall short."
> "Frameworks can help you get started quickly, but don't hesitate to reduce abstraction layers and build with basic components as you move to production."

## S2 — How we built our multi-agent research system — Anthropic Engineering

URL: https://www.anthropic.com/engineering/multi-agent-research-system

- authority: authoritative-guide

Anthropic's engineering retrospective on their multi-agent research system (June 2025)—first-hand lessons from a real production orchestrator-worker system: why fan-out (separation of concerns, parallel context windows, token capacity), the precise contexts for 90.2% and the 4×/15× figures, when multi-agent is not appropriate, the growth of coordination complexity, the four elements of delegation prompts, effort-scaling rules by query complexity, speedup numbers from two-level parallelism, bottlenecks of synchronous execution and the cost of asynchrony, passing references rather than payloads.

Key quote:
> "A multi-agent system consists of multiple agents (LLMs autonomously using tools in a loop) working together. Our Research feature involves an agent that plans a research process based on user queries, and then uses tools to create parallel agents that search for information simultaneously. Systems with multiple agents introduce new challenges in agent coordination, evaluation, and reliability."
> "Research work involves open-ended problems where it's very difficult to predict the required steps in advance. You can't hardcode a fixed path for exploring complex topics, as the process is inherently dynamic and path-dependent."
> "The essence of search is compression: distilling insights from a vast corpus. Subagents facilitate compression by operating in parallel with their own context windows, exploring different aspects of the question simultaneously before condensing the most important tokens for the lead research agent. Each subagent also provides separation of concerns—distinct tools, prompts, and exploration trajectories—which reduces path dependency and enables thorough, independent investigations."
> "Our internal evaluations show that multi-agent research systems excel especially for breadth-first queries that involve pursuing multiple independent directions simultaneously. We found that a multi-agent system with Claude Opus 4 as the lead agent and Claude Sonnet 4 subagents outperformed single-agent Claude Opus 4 by 90.2% on our internal research eval."
> "Multi-agent systems work mainly because they help spend enough tokens to solve the problem. In our analysis, three factors explained 95% of the performance variance in the BrowseComp evaluation (which tests the ability of browsing agents to locate hard-to-find information). We found that token usage by itself explains 80% of the variance, with the number of tool calls and the model choice as the two other explanatory factors."
> "This finding validates our architecture that distributes work across agents with separate context windows to add more capacity for parallel reasoning."
> "There is a downside: in practice, these architectures burn through tokens fast. In our data, agents typically use about 4× more tokens than chat interactions, and multi-agent systems use about 15× more tokens than chats. For economic viability, multi-agent systems require tasks where the value of the task is high enough to pay for the increased performance."
> "Further, some domains that require all agents to share the same context or involve many dependencies between agents are not a good fit for multi-agent systems today. For instance, most coding tasks involve fewer truly parallelizable tasks than research, and LLM agents are not yet great at coordinating and delegating to other agents in real time."
> "We've found that multi-agent systems excel at valuable tasks that involve heavy parallelization, information that exceeds single context windows, and interfacing with numerous complex tools."
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
> "Synchronous execution creates bottlenecks. Currently, our lead agents execute subagents synchronously, waiting for each set of subagents to complete before proceeding. This simplifies coordination, but creates bottlenecks in the information flow between agents. For instance, the lead agent can't steer subagents, subagents can't coordinate, and the entire system can be blocked while waiting for a single subagent to finish searching."
> "Asynchronous execution would enable additional parallelism: agents working concurrently and creating new subagents when needed. But this asynchronicity adds challenges in result coordination, state consistency, and error propagation across the subagents."
> "When building AI agents, the last mile often becomes most of the journey. Codebases that work on developer machines require significant engineering to become reliable production systems. The compound nature of errors in agentic systems means that minor issues for traditional software can derail agents entirely."
> "Rather than requiring subagents to communicate everything through the lead agent, implement artifact systems where specialized agents can create outputs that persist independently. Subagents call tools to store their work in external systems, then pass lightweight references back to the coordinator."

## S3 — Writing effective tools for agents — with agents — Anthropic Engineering

URL: https://www.anthropic.com/engineering/writing-tools-for-agents

- authority: authoritative-guide

The tool engineering article (September 2025), from which this course draws only two things: the definitional contrast between deterministic and non-deterministic systems (the vocabulary foundation for the entire course), and "one task per agentic while-loop, driven by code"—exactly the unit Lesson 6's diagram is meant to compose.

Key quote:
> "In computing, deterministic systems produce the same output every time given identical inputs, while non-deterministic systems—like agents—can generate varied responses even with the same starting conditions."
> "When we traditionally write software, we're establishing a contract between deterministic systems."
> "Tools are a new kind of software which reflects a contract between deterministic systems and non-deterministic agents."
> "We recommend running your evaluation programmatically with direct LLM API calls. Use simple agentic loops (while-loops wrapping alternating LLM API and tool calls): one loop for each evaluation task. Each evaluation agent should be given a single task prompt and your tools."
> "To build effective tools for agents, we need to re-orient our software development practices from predictable, deterministic patterns to non-deterministic ones."

## S4 — Create custom subagents — Claude Code official documentation

URL: https://code.claude.com/docs/en/sub-agents

- authority: official-docs

Claude Code's subagent documentation—product-level composition primitives: isolated context windows and permissions, when to delegate (preventing context from being flooded), fan-out and synthesis, sequential chains, foreground/background semantics, nesting depth ceiling (three layers) and concurrency ceiling (default 20)—both composition depth and concurrency are bounded in real products.

Key quote:
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

## S5 — Orchestrate subagents at scale with dynamic workflows — Claude Code official documentation

URL: https://code.claude.com/docs/en/workflows

- authority: official-docs

Claude Code's dynamic workflow documentation—the product-level implementation of "orchestration living in code," the page closest to this course: the axis of who holds the plan; the workflow script itself holds the loop, branching, and intermediate results, while the model's context holds only the final answer; intermediate results stay in script variables; fan-out-collect, check-fix-recheck until no further progress; concurrency of 16, ceiling of 1,000 agents per run; incremental result tracking brings recoverability, fine-grained fan-out preserves more progress than one long agent.

Key quote:
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

## S6 — Multiagent orchestration — Claude API documentation (Managed Agents)

URL: https://platform.claude.com/docs/en/managed-agents/multiagent-orchestration

- authority: official-docs

The current Claude platform's multi-agent orchestration page—the "current approach" pointed to by the S1 banner. Its value is twofold: it provides the API-level composition contract (shared sandbox and filesystem, each agent in an isolated session thread, threads persistent and resumable, concurrency ceiling of 25), and it independently names Parallelization / Specialization / Escalation—proving that the 2024 pattern taxonomy remains alive in current first-party vocabulary.

Key quote:
> "Multiagent orchestration lets one agent coordinate with others to complete complex work. Agents can act in parallel with their own isolated context, which helps improve output quality and can also improve time to completion."
> "All agents share the same sandbox, filesystem, and vault credentials, but each agent runs in its own session thread, a context-isolated event stream with its own conversation history."
> "Threads are persistent: the coordinator can send a follow-up to an agent it called earlier, and that agent retains everything from its previous turns."
> "Multiagent coordination is best suited for complex tasks that either require work across a variety of surfaces, or where multiple well-scoped tasks contribute to an overall goal."
> "Parallelization: Fan out independent subtasks simultaneously (searching multiple sources, analyzing separate files) and have the coordinator synthesize the results."
> "Specialization: Route to agents with domain-focused system prompts and tools, such as a security agent or a documentation agent, rather than loading a single agent with every capability."
> "Escalation: Consult a more capable agent or model for a subset of complex subtasks."
> "A maximum of 25 concurrent threads is supported. The coordinator can call multiple copies of a single agent in the roster, creating multiple threads associated with one agent."
