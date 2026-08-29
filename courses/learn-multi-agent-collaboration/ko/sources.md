# 참고 자료

## S1 — How we built our multi-agent research system (Anthropic Engineering)

URL: https://www.anthropic.com/engineering/multi-agent-research-system

- authority: authoritative-guide

Anthropic 엔지니어링 팀이 직접 쓴 기술 블로그 글로, 프로덕션 수준의 멀티 에이전트 시스템인 Claude Research의 아키텍처를 자세히 다룹니다. orchestrator-subagent 분업, 프롬프트 설계 원칙, 실패 모드, 평가 방법을 포함합니다. 이 코스의 '멀티 에이전트 시스템이란 무엇인가', '서브에이전트 프롬프트에 담아야 할 것', 노력 스케일링 규칙, 인용/결과 통합, 토큰 비용, 어떤 작업이 병렬화에 적합한지에 관한 주장은 모두 이 글에서 나옵니다.

핵심 인용:

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

## S2 — Building effective agents (Anthropic Engineering)

URL: https://www.anthropic.com/engineering/building-effective-agents

- authority: authoritative-guide

Anthropic이 직접 쓴 가이드로, 언제 워크플로를 쓰고 언제 에이전트를 쓸지, 그리고 각각을 어떻게 정의하는지를 다룹니다. prompt chaining, orchestrator-workers, evaluator-optimizer(producer-reviewer)의 공식 정의와 함께, 단순하게 시작하고 확실히 그럴 가치가 있을 때만 복잡도를 더하라는 핵심 조언을 담습니다. 이 코스의 협업 패턴 분류와 '언제 멀티 에이전트를 쓰지 말아야 하는가'에 관한 주장은 이 글에서 나옵니다.

핵심 인용:

> "Workflows are systems where LLMs and tools are orchestrated through predefined code paths."

> "a central LLM dynamically breaks down tasks, delegates them to worker LLMs, and synthesizes their results."

> "Prompt chaining decomposes a task into a sequence of steps, where each LLM call processes the output of the previous one."

> "one LLM call generates a response while another provides evaluation and feedback in a loop."

> "Reviewing a piece of code for vulnerabilities, where several different prompts review and flag the code if they find a problem."

> "you should consider adding complexity only when it demonstrably improves outcomes."

## S3 — Create custom subagents (Claude Code Docs)

URL: https://code.claude.com/docs/en/sub-agents

- authority: official-docs

Claude Code 공식 문서로, 서브에이전트의 컨텍스트 격리 메커니즘, 필수 frontmatter 필드, 위임이 어떻게 트리거되는지, 결과가 어떻게 돌아오는지를 설명합니다. 이 코스의 '서브에이전트가 왜 당신의 대화 이력을 볼 수 없는가', '위임은 description 필드로 트리거된다', '결론만 돌아온다'에 관한 주장은 모두 이 문서에서 나옵니다.

핵심 인용:

> "Each subagent starts with a fresh, isolated context window. It doesn't see your conversation history, the skills you've already invoked, or the files Claude has already read. Claude composes a delegation message that summarizes the task, and the subagent works from there."

> "When subagents complete, their results return to your main conversation. Running many subagents that each return detailed results can consume significant context."

> "The following fields can be used in the YAML frontmatter. Only name and description are required."

> "Claude automatically delegates tasks based on the task description in your request, the description field in subagent configurations, and current context."

> "Each subagent completes its task and returns results to Claude, which then passes relevant context to the next subagent."

> "A fork is a subagent that inherits the entire conversation so far instead of starting fresh... The fork's own tool calls still stay out of your conversation and only its final result comes back, so your main context window stays clean."

## S4 — Agents (OpenAI Agents SDK)

URL: https://openai.github.io/openai-agents-python/agents/

- authority: official-docs

OpenAI Agents SDK 문서의 멀티 에이전트 오케스트레이션 패턴 섹션으로, Manager(agents-as-tools) 패턴과 Handoffs 패턴을 정의합니다. 이 코스의 '협업 패턴' 섹션은 이 문서를 활용해 orchestrator-worker 외의 또 다른 흔한 분업 방식을 대비시킵니다.

핵심 인용:

> "Manager (agents as tools): A central manager/orchestrator invokes specialized sub‑agents as tools and retains control of the conversation."

> "Handoffs: Peer agents hand off control to a specialized agent that takes over the conversation. This is decentralized."

## S5 — Handoffs (OpenAI Agents SDK)

URL: https://openai.github.io/openai-agents-python/handoffs/

- authority: official-docs

OpenAI Agents SDK 문서의 Handoffs 메커니즘 상세 설명으로, 핸드오프 이후 새 에이전트가 대화를 이어받는 방식과 핸드오프가 하나의 실행(run) 안에 머문다는 경계를 다룹니다. 이 코스는 이를 활용해 handoff 방식과 orchestrator-worker 방식 사이의 컨텍스트 전달의 핵심 차이를 설명합니다.

핵심 인용:

> "Handoffs stay within a single run."

> "When a handoff occurs, it's as though the new agent takes over the conversation, and gets to see the entire previous conversation history."

## S6 — Best practices for Claude Code (Claude Code Docs)

URL: https://code.claude.com/docs/en/best-practices

- authority: official-docs

Claude Code 공식 모범 사례 문서로, 'trust-then-verify gap' 섹션에서 모델의 출력이 그럴듯해 보이지만 반드시 옳지는 않은 실패 모드를 직접 짚고, 그에 대한 대응을 제시합니다. 직접 검증하라, 그리고 검증할 수 없다면 신뢰하지 말라는 것입니다. 이 코스의 '완료했다고 주장하는 서브에이전트는 믿을 수 없다' 섹션의 핵심 주장은 이 문서에서 나옵니다.

핵심 인용:

> "The trust-then-verify gap. Claude produces a plausible-looking implementation that doesn't handle edge cases. Fix: Always provide verification (tests, scripts, screenshots). If you can't verify it, don't ship it."

> "Claude stops when the work looks done. Without a check it can run, \"looks done\" is the only signal available, and you become the verification loop: every mistake waits for you to notice it."

> "Have Claude show evidence rather than asserting success: the test output, the command it ran and what it returned, or a screenshot of the result."

## S7 — Effective context engineering for AI agents (Anthropic Engineering)

URL: https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents

- authority: authoritative-guide

Anthropic이 직접 쓴 컨텍스트 엔지니어링 가이드로, 'context rot'와 'attention budget'을 직접 설명합니다. 컨텍스트 윈도우의 토큰이 많아질수록 모델이 그 안에서 정보를 정확히 회수하는 능력이 떨어지고, 새 토큰 하나하나가 한정된 어텐션 예산을 소모한다는 것입니다. 또한 이 저하가 절벽이 아니라 그라디언트라는 점도 분명히 합니다. 이 코스의 '컨텍스트 오염'과 '어텐션 희석' 섹션의 주장은 이 글에 근거합니다.

핵심 인용:

> "as the number of tokens in the context window increases, the model's ability to accurately recall information from that context decreases"

> "LLMs have an 'attention budget' that they draw on when parsing large volumes of context. ... Every new token introduced depletes this budget by some amount"

> "these factors create a performance gradient rather than a hard cliff"

## S8 — Using the Messages API (Claude API)

URL: https://platform.claude.com/docs/en/build-with-claude/working-with-messages

- authority: official-docs

공식 문서는 Messages API가 스테이트리스라는 점을 분명히 밝힙니다. 모든 요청은 전체 대화 이력을 실어 보내야 하며, API는 요청 사이에 어떤 상태도 보관하지 않습니다. 이는 레슨 6의 '모든 호출은 작업과 직전 라운드의 정보를 프롬프트에 그대로 써 넣어야 한다'의 구현 전제입니다.

핵심 인용:

> "The Messages API is stateless, which means that you always send the full conversational history to the API."

## S9 — Structured outputs (Claude API)

URL: https://platform.claude.com/docs/en/build-with-claude/structured-outputs

- authority: official-docs

공식 문서는 structured outputs 없이는 신중하게 프롬프트를 짜더라도 모델이 여전히 잘못된 JSON(문법 오류, 누락된 필드, 일관되지 않은 타입)을 만들어 낼 수 있다고 설명합니다. structured outputs는 제약 샘플링으로 응답이 스키마를 엄격히 따르도록 보장합니다. 이는 레슨 6의 '리뷰어에게 JSON만 반환하도록 요청해도 방어적 파싱이 여전히 필요하다' 섹션의 전제입니다.

핵심 인용:

> "Structured outputs constrain Claude's responses to follow a specific schema, ensuring valid, parseable output for downstream processing."

> "Without structured outputs, Claude can generate malformed JSON responses or invalid tool inputs that break your applications. Even with careful prompting, you may encounter: Parsing errors from invalid JSON syntax"
