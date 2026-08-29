# 참고 자료

이 코스의 핵심 주장은 아래 출처에 근거합니다. 레슨에서는 `[^Sn]` 형태로 인용하며, 정확한 발췌문은 각 항목 아래에 실었습니다.

## S1 — Effective context engineering for AI agents — Anthropic Engineering

URL: https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents

- authority: authoritative-guide

컨텍스트 엔지니어링을 다룬 Anthropic 엔지니어링의 권위 있는 장문 아티클이자 이 코스의 핵심 근거입니다. 컨텍스트 엔지니어링과 프롬프트 엔지니어링의 관계, 주의 예산과 컨텍스트 로트, 시스템 프롬프트의 '고도', 컨텍스트로서의 도구와 예시, 적시 검색과 점진적 발견, 컴팩션, 구조화된 노트 작성, 서브에이전트 아키텍처까지 — 이 코스의 거의 모든 주제가 이 글에서 나옵니다.

핵심 인용:
> "we view context engineering as the natural progression of prompt engineering"
> "Prompt engineering refers to methods for writing and organizing LLM instructions for optimal outcomes"
> "the set of strategies for curating and maintaining the optimal set of tokens (information) during LLM inference"
> "An agent running in a loop generates more and more data that could be relevant for the next turn of inference"
> "LLMs have an "attention budget" that they draw on when parsing large volumes of context"
> "Every new token introduced depletes this budget by some amount"
> "as the number of tokens in the context window increases, the model's ability to accurately recall information from that context decreases"
> "some models exhibit more gentle degradation than others, this characteristic emerges across all models"
> "These factors create a performance gradient rather than a hard cliff"
> "context, therefore, must be treated as a finite resource with diminishing marginal returns"
> "agents that operate over multiple turns of inference and longer time horizons"
> "engineers hardcoding complex, brittle logic in their prompts to elicit exact agentic behavior"
> "vague, high-level guidance that fails to give the LLM concrete signals for desired outputs"
> "specific enough to guide behavior effectively, yet flexible enough to provide the model with strong heuristics"
> "tools should be self-contained, robust to error, and extremely clear with respect to their intended use"
> "building tools that are well understood by LLMs and have minimal overlap in functionality"
> "returning information that is token efficient and by encouraging efficient agent behaviors"
> "stuff a laundry list of edge cases into a prompt"
> "curate a set of diverse, canonical examples that effectively portray the expected behavior of the agent"
> "maintain lightweight identifiers (file paths, stored queries, web links, etc.)"
> "the metadata of these references provides a mechanism to efficiently refine behavior"
> "allows agents to incrementally discover relevant context through exploration"
> "retrieving some data up front for speed, and pursuing further autonomous exploration at its discretion"
> "CLAUDE.md files are naively dropped into context up front, while primitives like glob and grep"
> "taking a conversation nearing the context window limit, summarizing its contents, and reinitiating a new context window"
> "passing the message history to the model to summarize and compress the most critical details"
> "preserves architectural decisions, unresolved bugs, and implementation details while discarding redundant tool outputs"
> "the agent regularly writes notes persisted to memory outside of the context window"
> "Like Claude Code creating a to-do list, or your custom agent maintaining a NOTES.md file"
> "Claude playing Pokémon demonstrates how memory transforms agent capabilities in non-coding domains"
> "specialized sub-agents can handle focused tasks with clean context windows"
> "returns only a condensed, distilled summary of its work (often 1,000-2,000 tokens)"
> "the detailed search context remains isolated within sub-agents"
> "compaction, structured note-taking, and multi-agent architectures"
> "maintain coherence, context, and goal-directed behavior over sequences of actions"

## S2 — Building Effective AI Agents — Anthropic Engineering

URL: https://www.anthropic.com/engineering/building-effective-agents

- authority: authoritative-guide

에이전트 패턴을 다룬 Anthropic의 권위 있는 아티클입니다. 이 코스는 여기서 에이전트의 루프 정의, 자율성이 부르는 비용과 누적되는 오류, 그리고 비례 원칙 — 결과가 눈에 띄게 나아질 때만 복잡도를 더한다 — 을 가져옵니다.

핵심 인용:
> "They are typically just LLMs using tools based on environmental feedback in a loop."
> "The autonomous nature of agents means higher costs, and the potential for compounding errors."
> "The LLM will potentially operate for many turns, and you must have some level of trust in its decision-making."
> "you should consider adding complexity only when it demonstrably improves outcomes."

## S3 — How we built our multi-agent research system — Anthropic Engineering

URL: https://www.anthropic.com/engineering/multi-agent-research-system

- authority: authoritative-guide

Anthropic이 멀티 에이전트 리서치 시스템을 만들며 남긴 엔지니어링 회고로, 서브에이전트의 컨텍스트 격리와 토큰 경제성에 관한 1차 데이터를 제공합니다. 병렬로 도는 서브에이전트는 각자 독립된 컨텍스트 윈도를 가지고, 서브에이전트는 리드 에이전트를 위해 발견을 압축하는 '지능형 필터' 역할을 하며, 에이전트와 멀티 에이전트 시스템의 토큰 배수도 여기서 나옵니다.

핵심 인용:
> "Subagents facilitate compression by operating in parallel with their own context windows"
> "distributes work across agents with separate context windows to add more capacity for parallel reasoning"
> "agents typically use about 4× more tokens than chat interactions"
> "multi-agent systems use about 15× more tokens than chats"
> "Multi-agent systems work mainly because they help spend enough tokens to solve the problem."
> "token usage by itself explains 80% of the variance, with the number of tool calls and the model choice"
> "condensing the most important tokens for the lead research agent"
> "The essence of search is compression: distilling insights from a vast corpus."
> "the subagents act as intelligent filters"
> "agents summarize completed work phases and store essential information in external memory"
> "agents can spawn fresh subagents with clean contexts while maintaining continuity through careful handoffs"

## S4 — Best practices for Claude Code — Claude Code Docs

URL: https://code.claude.com/docs/en/best-practices

- authority: official-docs

Claude Code 공식 베스트 프랙티스 페이지입니다(anthropic.com/engineering/claude-code-best-practices는 현재 이곳으로 308 리다이렉트됩니다). 실제 제품에서 컨텍스트 관리가 어떤 모습인지 보여 줍니다. CLAUDE.md를 다루는 규율, /clear와 자동 컴팩션, 메인 컨텍스트를 격리하는 서브에이전트 조사, 그리고 컨텍스트가 가장 중요한 자원이라는 대표 규칙입니다.

핵심 인용:
> "Claude's context window fills up fast, and performance degrades as it fills."
> "The context window is the most important resource to manage."
> "This matters since LLM performance degrades as context fills."
> "CLAUDE.md is a special file that Claude reads at the start of every conversation."
> "CLAUDE.md is loaded every session, so only include things that apply broadly."
> "Claude loads them on demand without bloating every conversation."
> "Keep it concise. For each line, ask: "Would removing this cause Claude to make mistakes?" If not, cut it."
> "Bloated CLAUDE.md files cause Claude to ignore your actual instructions!"
> "If your CLAUDE.md is too long, Claude ignores half of it because important rules get lost in the noise."
> "reset context between unrelated tasks. Long sessions with irrelevant context can reduce performance."
> "Run /clear between unrelated tasks to reset the context window entirely"
> "During long sessions, Claude's context window can fill with irrelevant conversation, file contents, and commands."
> "Claude Code automatically compacts conversation history when you approach context limits, which preserves important code and decisions while freeing space."
> "Since context is your fundamental constraint, subagents are one of the most powerful tools available."
> "Subagents run in separate context windows and report back summaries"
> "Scope investigations narrowly or use subagents so the exploration doesn't consume your main context."
> "A clean session with a better prompt almost always outperforms a long session with accumulated corrections."

## S5 — The 2026 Agent Engineering Roadmap — GitHub (codejunkie99/agent-roadmap-2026)

URL: https://github.com/codejunkie99/agent-roadmap-2026

- authority: blog

하네스 엔지니어링을 축으로 정리한 커뮤니티 오픈 소스 로드맵입니다(AI 보조 집필). 이 코스는 프레이밍 차원의 주장만 가져옵니다. 컨텍스트 관리가 하네스의 한 구성 요소라는 점, 그리고 컨텍스트 엔지니어링에 대한 한 줄 정의입니다. 주의: 여기 실린 퍼센트 임계값, 토큰 수치, 벤치마크 점수, 연봉 수치를 비롯한 구체적 수치는 사실로 인용하지 않습니다. 'Prompt engineering is dead as a standalone skill in 2026'은 이 로드맵의 주관적 단언이므로 인용할 때는 반드시 그렇게 밝혀야 하며, 코스 본문은 S1의 더 신중한 '자연스러운 발전' 프레이밍을 택합니다.

핵심 인용:
> "Same model, different harness, completely different result."
> "the harness is the union of:"
> "context engineering: deciding what tokens are in front of the model at every step of the loop"
> "Prompt engineering is dead as a standalone skill in 2026."
