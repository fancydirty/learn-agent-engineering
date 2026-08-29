# 참고 자료

이 코스의 핵심 주장은 아래 출처에 근거합니다. 레슨에서는 `[^Sn]` 형태로 인용하며, 정확한 발췌문은 각 항목 아래에 실었습니다.

## S1 — How we built our multi-agent research system — Anthropic Engineering

URL: https://www.anthropic.com/engineering/multi-agent-research-system

- authority: authoritative-guide

Anthropic이 멀티 에이전트 리서치 시스템을 만들며 남긴 엔지니어링 회고이자 이 코스의 핵심 근거입니다. 에이전트는 상태를 가지며 에러가 누적된다는 점, 처음부터 다시 시작할 수는 없고 에러가 난 지점에서 재개해야 한다는 점, 신뢰성은 모델의 적응력과 재시도 로직·정기 체크포인트 같은 결정론적 안전장치를 짝지을 때 나온다는 점, 그리고 배포 시점에 실행 중인 에이전트는 자기 진행 과정 어디에 있을지 알 수 없다는 점을 다룹니다.

핵심 인용:
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

Claude Code 체크포인팅 공식 문서로, checkpoint/rewind/fork의 제품 수준 형태를 온전히 보여 줍니다. 사용자 프롬프트마다 자동으로 체크포인트를 남기고, 대화와 함께 저장하며, 대화와 코드를 따로 복원할 수 있고, bash로 만든 변경은 추적하지 않으며, 버전 관리를 대체하지 않습니다. 이 코스는 이를 가르칠 도구가 아니라 제품 수준의 참조점으로 씁니다.

핵심 인용:
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

에이전트 패턴을 다룬 Anthropic의 권위 있는 아티클입니다. 이 코스는 여기서 에이전트가 체크포인트에서 멈춰 사람의 피드백을 기다린다는 점, 자율성이 부르는 더 큰 비용과 누적되는 에러, 여러 턴에 걸친 제한된 신뢰, 그리고 비례 원칙 — 결과가 눈에 띄게 나아질 때만 복잡도를 더한다 — 을 가져옵니다.

핵심 인용:
> "Agents can then pause for human feedback at checkpoints or when encountering blockers."
> "The autonomous nature of agents means higher costs, and the potential for compounding errors."
> "The LLM will potentially operate for many turns, and you must have some level of trust in its decision-making."
> "it's also common to include stopping conditions (such as a maximum number of iterations) to maintain control."
> "you should consider adding complexity only when it demonstrably improves outcomes."

## S4 — Handle tool calls — Claude API

URL: https://platform.claude.com/docs/en/agents-and-tools/tool-use/handle-tool-calls

- authority: official-docs

tool_use와 tool_result 콘텐츠 블록의 필드 명세와 짝 규칙을 제시합니다. 모든 tool_use에는 대응하는 tool_result가 있어야 하며, 한꺼번에 함께 돌려보내야 합니다. 재개 레슨은 도구 실행과 원장 기록 사이에서 크래시가 났을 때 남는 허공에 뜬 호출을 처리하기 위해 이 규칙에 기댑니다.

핵심 인용:
> "id: A unique identifier for this particular tool use block. ... name: The name of the tool being used. input: An object containing the input being passed to the tool, conforming to the tool's input_schema. ... tool_use_id: The id of the tool use request this is a result for. ... is_error (optional): Set to true if the tool execution resulted in an error."
> "Whichever strategy you use, return one tool_result for each tool_use block, all together in the next user message. Match each result to its call with tool_use_id, and put every tool_result block before any text content in that message."

## S5 — The 2026 Agent Engineering Roadmap — GitHub (codejunkie99/agent-roadmap-2026)

URL: https://github.com/codejunkie99/agent-roadmap-2026

- authority: blog

하네스 엔지니어링을 축으로 정리한 커뮤니티 오픈 소스 로드맵입니다(AI 보조 집필). 이 코스는 프레이밍 차원의 주장만 가져옵니다. 지속성이 하네스의 한 구성 요소라는 점, 그리고 그 역할이 '노드마다 상태를 체크포인트로 남겨 재개·되감기·분기를 할 수 있게 하는 것'이라는 점입니다. 주의: 여기 실린 퍼센트 임계값, 토큰 수치, 벤치마크 점수, 연봉 수치를 비롯한 구체적 수치는 사실로 인용하지 않습니다.

핵심 인용:
> "the harness is the union of:"
> "persistence. Checkpoint state every node so you can resume, rewind, fork."
> "Same model, different harness, completely different result."
