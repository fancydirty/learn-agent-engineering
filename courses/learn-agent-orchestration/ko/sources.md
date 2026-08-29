# 참고 자료

이 코스의 핵심 주장은 모두 아래 출처가 뒷받침하며, 본문에서는 `[^Sn]` 형태로 인용하고 구체적인 발췌문은 각 항목 아래에 실었습니다. 인용문 94개는 모두 앵커 기반으로 프로그램이 추출했고 2026-08-26에 다시 검증했습니다(전부 통과). 원문의 컬리 따옴표, em 대시, 곱셈 기호(4×), 그리고 뒤섞인 따옴표("gate"는 원문 그대로입니다)를 그대로 보존하며 어떤 말바꿈도 하지 않았습니다.

집필 규율(모든 레슨에 적용하며, 각 항목은 이 코스를 위해 작성한 커버리지 갭 리포트에서 나왔습니다):
- **'그래프', '노드', '엣지', 'DAG', '상태 기계'는 여섯 개 1차 출처 어디에도 단 한 번도 나오지 않습니다(grep으로 확인)**. '루프에서 그래프로'는 **이 코스가 스스로 세운 엔지니어링 은유**이며, 1차 자료에 실제로 존재하는 어휘(agentic systems, workflows, patterns, orchestrator-workers, lead agent, subagents, coordinator, fan out)를 정리하는 데 씁니다. 이 시각 체계를 처음 들이는 레슨5는 그것이 이 코스가 만든 것임을 명시해야 합니다. 1차 자료에서 가장 가까운 닻은 "the workflow script itself holds the loop, branching, and intermediate results"라는 진술입니다[^S5]. 어떤 레슨도 그래프 용어를 공식 개념인 것처럼 제시해서는 안 됩니다.
- '결정성 스펙트럼'이라는 표현도 이 코스가 만든 것입니다. 1차 출처는 양 끝점의 정의(미리 정해진 코드 경로 대 모델이 이끄는 결정)와 '누가 계획을 쥐고 있는가'라는 축만 줄 뿐[^S5], 그것을 스펙트럼이라고 부르지 않습니다.
- 라우팅은 '패턴 이름' 수준에서만 뒷받침됩니다(분류 후 디스패치[^S1], 도메인 기반 디스패치 / 난이도 에스컬레이션[^S6]). '그래프에서 엣지를 고른다'거나 '라우터 노드'에는 1차 근거가 없습니다.
- '노드 사이로 오가는 상태 객체'에는 1차 근거가 없습니다. 가장 가까운 진술은 "intermediate results stay in script variables"입니다[^S5]. 타입이 붙은 상태나 병합 전략 따위는 모두 인용 없는 엔지니어링 실무입니다.
- **결정론적 워크플로와 단일 루프 에이전트를 견주는 1차 출처는 없습니다**. 90.2%라는 수치는 Anthropic의 내부 리서치 평가에서 Opus 4 리드 + Sonnet 4 서브에이전트 구성으로 멀티 에이전트와 단일 에이전트를 비교한 값입니다. '그래프가 루프를 이긴다'를 주장하는 데 써서는 안 됩니다.
- 노드별 재시도·타임아웃·백오프·서킷 브레이킹·멱등성: 1차 출처가 주는 것은 종속절 하나뿐입니다("deterministic safeguards like retry logic and regular checkpoints"[^S2]). 그보다 자세한 설계는 인용 없이 엔지니어링 실무로 써야 합니다.
- 손으로 쓴 오케스트레이션 코드 예시를 주는 1차 출처는 없습니다. 레슨6의 완성 스크립트는 이 코스가 스스로 짠 것이며, 그렇게 밝혀 두어야 합니다.
- '루프 하나로는 언제 모자란가'를 그대로 말하는 1차 출처는 없습니다. 대신 쓸 수 있는 닻은 "when a task needs more agents than one conversation can coordinate"와 "when the task is larger than one agent can hold in context, or when the same step needs to run across many items"입니다[^S5].
- LangGraph를 비롯한 서드파티 그래프 프레임워크의 용어를 Anthropic에 귀속시켜서는 안 됩니다. S1 페이지에는 도구 생태계 서술이 낡았다는 배너가 붙어 있으므로(배너 문구는 S1의 첫 인용문에 있습니다) 패턴과 원칙만 인용하십시오.
- '생산자-리뷰어'는 이 시리즈 코스6의 명명 방식이지 1차 어휘가 아닙니다. 1차 출처는 evaluator-optimizer[^S1]와 "adversarially review"[^S5]라고 말합니다. 그 표현을 쓸 때는 다리를 명시적으로 놓으십시오.
- 병렬 분기 사이의 에러 전파와 보상: 1차 출처가 주는 것은 문장 하나뿐이며, 그마저도 아직 풀리지 않은 과제로 적어 둡니다("asynchronicity adds challenges in result coordination, state consistency, and error propagation across the subagents"[^S2]). 공식 해법이 있는 것처럼 써서는 안 됩니다.
- 오케스트레이터 자체의 토큰 비용에는 따로 떨어진 수치가 없습니다. 채팅 대비 4×/15× 배수만 있습니다[^S2].

## S1 — Building Effective AI Agents — Anthropic Engineering

URL: https://www.anthropic.com/engineering/building-effective-agents

- authority: authoritative-guide

에이전트 패턴에 관한 Anthropic의 정전 격 문서로(2024-12), 이 코스의 뼈대가 되는 출처입니다. 워크플로와 에이전트의 아키텍처적 구분, 기본 빌딩 블록으로서의 증강된 LLM, 다섯 가지 주요 워크플로 패턴(프롬프트 체이닝, 라우팅, 병렬화, 오케스트레이터-워커, 평가자-최적화자)의 정의와 적절한 쓰임새, 조합과 변형에 관한 지침, 그리고 '단순하게 시작하고 필요할 때만 복잡도를 올려라'라는 전체를 관통하는 줄기를 다룹니다. 페이지에는 도구 생태계 서술이 낡았다는 편집자 배너가 붙어 있으므로, 패턴과 원칙만 인용하고 현재의 도구 지침으로 삼아서는 안 됩니다.

핵심 인용:
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

멀티 에이전트 리서치 시스템에 대한 Anthropic의 엔지니어링 회고로(2025-06), 실제 프로덕션 오케스트레이터-워커 시스템에서 얻은 1차 교훈입니다. 팬아웃을 왜 하는가(관심사 분리, 병렬 컨텍스트 윈도, 토큰 용량), 90.2%와 4×/15× 수치가 정확히 어떤 맥락의 값인가, 멀티 에이전트가 맞지 않는 경우, 조율 복잡도의 증가, 위임 프롬프트의 네 가지 요소, 쿼리 복잡도에 따른 노력 스케일링 규칙, 두 층위 병렬화가 낸 속도 향상 수치, 동기 실행의 병목과 비동기의 대가, 페이로드 대신 참조를 건네는 방식을 다룹니다.

핵심 인용:
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

도구 엔지니어링 아티클입니다(2025-09). 이 코스가 여기서 가져오는 것은 두 가지뿐입니다. 결정론적 시스템과 비결정적 시스템의 정의상 대비(코스 전체의 어휘 토대입니다), 그리고 '코드가 이끄는 에이전틱 while 루프 하나에 과제 하나'입니다. 레슨6의 도식이 조합하려는 단위가 바로 그것입니다.

핵심 인용:
> "In computing, deterministic systems produce the same output every time given identical inputs, while non-deterministic systems—like agents—can generate varied responses even with the same starting conditions."
> "When we traditionally write software, we're establishing a contract between deterministic systems."
> "Tools are a new kind of software which reflects a contract between deterministic systems and non-deterministic agents."
> "We recommend running your evaluation programmatically with direct LLM API calls. Use simple agentic loops (while-loops wrapping alternating LLM API and tool calls): one loop for each evaluation task. Each evaluation agent should be given a single task prompt and your tools."
> "To build effective tools for agents, we need to re-orient our software development practices from predictable, deterministic patterns to non-deterministic ones."

## S4 — Create custom subagents — Claude Code official documentation

URL: https://code.claude.com/docs/en/sub-agents

- authority: official-docs

Claude Code의 서브에이전트 문서로, 제품 수준의 조합 원시 요소를 담고 있습니다. 격리된 컨텍스트 윈도와 권한, 언제 위임할 것인가(컨텍스트가 넘쳐나는 것을 막기), 팬아웃과 종합, 순차 체인, 포그라운드/백그라운드 의미론, 중첩 깊이 상한(세 층)과 동시 실행 상한(기본 20)입니다. 실제 제품에서는 조합 깊이도 동시성도 모두 한계가 있습니다.

핵심 인용:
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

Claude Code의 동적 워크플로 문서로, '코드 안에 사는 오케스트레이션'을 제품 수준에서 구현한 것이자 이 코스에 가장 가까운 페이지입니다. 누가 계획을 쥐고 있는가라는 축, 워크플로 스크립트가 루프와 분기와 중간 결과를 직접 쥐고 모델의 컨텍스트에는 최종 답만 남는다는 점, 중간 결과가 스크립트 변수에 머문다는 점, 팬아웃 후 수집과 검사-수정-재검사를 더 나아가지 못할 때까지 반복하는 방식, 동시 실행 16과 실행 한 번당 에이전트 1,000개 상한, 결과를 점진적으로 추적하기에 복구가 가능해진다는 점, 잘게 나눈 팬아웃이 긴 에이전트 하나보다 더 많은 진척을 지켜 준다는 점을 다룹니다.

핵심 인용:
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

현재 Claude 플랫폼의 멀티 에이전트 오케스트레이션 페이지로, S1의 배너가 가리키는 '현재의 접근'입니다. 값어치는 두 갈래입니다. API 수준의 조합 계약을 준다는 점(샌드박스와 파일 시스템은 공유하고, 에이전트마다 격리된 세션 스레드에서 돌며, 스레드는 지속되고 이어 쓸 수 있으며, 동시 실행 상한은 25), 그리고 Parallelization / Specialization / Escalation을 독립적으로 이름 짓는다는 점입니다. 2024년의 패턴 분류가 현재의 1차 어휘 안에 그대로 살아 있음을 보여 줍니다.

핵심 인용:
> "Multiagent orchestration lets one agent coordinate with others to complete complex work. Agents can act in parallel with their own isolated context, which helps improve output quality and can also improve time to completion."
> "All agents share the same sandbox, filesystem, and vault credentials, but each agent runs in its own session thread, a context-isolated event stream with its own conversation history."
> "Threads are persistent: the coordinator can send a follow-up to an agent it called earlier, and that agent retains everything from its previous turns."
> "Multiagent coordination is best suited for complex tasks that either require work across a variety of surfaces, or where multiple well-scoped tasks contribute to an overall goal."
> "Parallelization: Fan out independent subtasks simultaneously (searching multiple sources, analyzing separate files) and have the coordinator synthesize the results."
> "Specialization: Route to agents with domain-focused system prompts and tools, such as a security agent or a documentation agent, rather than loading a single agent with every capability."
> "Escalation: Consult a more capable agent or model for a subset of complex subtasks."
> "A maximum of 25 concurrent threads is supported. The coordinator can call multiple copies of a single agent in the roster, creating multiple threads associated with one agent."
