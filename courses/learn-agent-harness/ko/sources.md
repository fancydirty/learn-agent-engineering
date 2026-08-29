# 참고 자료

이 코스의 핵심 주장은 아래 자료에 근거합니다. 레슨은 `[^Sn]`으로 이를 인용하며, 정확한 발췌는 각 항목 아래에 있습니다.

## S1 — Building Effective AI Agents — Anthropic Engineering

URL: https://www.anthropic.com/engineering/building-effective-agents

- authority: authoritative-guide

에이전트란 무엇인가, 에이전트가 워크플로와 어떻게 다른가, 그리고 어떻게 통제를 유지하는가에 대한 Anthropic 엔지니어링의 권위 있는 글입니다. 에이전트를 '루프 안의 툴'로 정의하고, 정지 조건, 체크포인트, 그리고 자율성이 가져오는 비용과 누적 오류를 다룹니다. 이 코스의 루프와 통제라는 주제의 핵심 근거입니다.

핵심 인용:
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

stop_reason이 이끄는 정석적인 멀티 턴 루프를 제시합니다. 모델은 구조화된 요청만 발행하고, 호스트가 툴을 실행하며, 결과가 되돌아오고, stop_reason이 여전히 tool_use인 동안 루프가 반복됩니다. '핵심 루프' 레슨의 직접 근거입니다.

핵심 인용:
> "The model never executes anything on its own. It emits a structured request, your code (or Anthropic's servers) runs the operation, and the result flows back into the conversation. ... 2. Claude responds with stop_reason: "tool_use" and one or more tool_use blocks. 3. Execute each tool. Format the outputs as tool_result blocks. 4. Send a new request... 5. Repeat from step 2 while stop_reason is "tool_use"."

## S3 — Effective context engineering for AI agents — Anthropic Engineering

URL: https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents

- authority: authoritative-guide

루프 안의 에이전트는 컨텍스트를 계속 쌓아 가지만 모델의 '어텐션 예산'은 유한하며 컨텍스트가 커질수록 회수 능력이 떨어진다는 점을 설명합니다. 그래서 루프를 제약하고 컨텍스트를 관리해야 한다는 것입니다. '루프에 경계가 필요한 이유'의 근거입니다.

핵심 인용:
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

과도한 자율성(excessive agency) 위험을 정의하고 그 완화책을 분명히 지목합니다. 영향이 큰 동작에는 사람이 개입해 승인하도록 하라는 것입니다. '개입과 조종' 레슨에서 되돌릴 수 없는 작업 앞에 사람 체크포인트를 두는 근거입니다.

핵심 인용:
> "Excessive Agency is the vulnerability that enables damaging actions to be performed in response to unexpected, ambiguous, or manipulated outputs from an LLM, regardless of what is causing the LLM to malfunction. ... Utilise human-in-the-loop control to require a human to approve high-impact actions before they are taken. This may be implemented in a downstream system (outside the scope of the LLM application) or within the LLM extension itself."

## S5 — The 2026 Agent Engineering Roadmap — GitHub (codejunkie99/agent-roadmap-2026)

URL: https://github.com/codejunkie99/agent-roadmap-2026

- authority: blog

하네스 엔지니어링을 중심으로 구성된 오픈소스 로드맵으로, '같은 모델, 다른 하네스, 완전히 다른 결과'라는 핵심 명제를 밝히고 하네스를 루프 통제, 툴 디스패치, 컨텍스트 관리 등의 구성 요소로 분해합니다. 하네스가 신뢰성을 결정한다는 프레이밍 주장을 뒷받침하는 데 사용됩니다. 참고: 이 자료는 AI의 도움으로 작성된 커뮤니티 로드맵이며, 벤치마크 점수나 연봉 수치 등 구체적인 숫자는 사실로 인용하지 않고 프레이밍 주장만 사용합니다.

핵심 인용:
> "Same model, different harness, completely different result."
> "An agent makes its own control-flow decisions inside a loop."
> "the harness is the union of:"
> "loop control. The while-loop driving model→tools→model."
> "tool dispatch. Registry, schema validation, parallel calls, error recovery, retries."

## S6 — Handle tool calls — Claude API

URL: https://platform.claude.com/docs/en/agents-and-tools/tool-use/handle-tool-calls

- authority: official-docs

tool_use와 tool_result 콘텐츠 블록의 정확한 필드 명세와 함께, 병렬 호출은 모든 tool_result 블록을 함께 반환해야 한다는 규칙을 제시합니다. 레슨 6에서 손으로 짜는 루프의 요청과 응답을 정확히 구성하는 데 사용됩니다.

핵심 인용:
> "id: A unique identifier for this particular tool use block. ... name: The name of the tool being used. input: An object containing the input being passed to the tool, conforming to the tool's input_schema. ... tool_use_id: The id of the tool use request this is a result for. ... is_error (optional): Set to true if the tool execution resulted in an error."
> "Whichever strategy you use, return one tool_result for each tool_use block, all together in the next user message. Match each result to its call with tool_use_id, and put every tool_result block before any text content in that message."
