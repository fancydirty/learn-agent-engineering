# 참고 자료

이 코스의 핵심 주장은 모두 아래 출처가 뒷받침합니다. 본문에서는 `[^Sn]` 형태로 인용하며, 구체적인 발췌문은 각 항목 아래에 실었습니다. 모든 인용문은 앵커 기반 슬라이싱으로 최종 렌더링 페이지에서 한 글자씩 프로그램으로 추출했고 2026-08-26에 이중으로 검증했습니다(인용문 94개, 전부 통과). 원문의 컬리 따옴표, em 대시, 곱셈 기호(4×), 마크다운 백틱을 그대로 보존하며 어떤 말바꿈도 하지 않았습니다.

집필 규율(모든 레슨에 적용하며, 각 조항은 이번 이터레이션의 커버리지 갭 리포트에서 나왔습니다):
- '검증은 무엇이 깨졌는지 알려주고, 관측 가능성은 왜 그런지 알려준다'라는 이 코스의 뼈대는 **이 코스가 스스로 세운 표현**이며, 어떤 1차 출처도 이를 그대로 말하지 않습니다. 뒷받침할 수 있는 근거는 "tracing let us diagnose why agents failed"와 "probe why agents do or don't call certain tools." 두 인용문뿐입니다. 공식 표현인 것처럼 제시해서는 안 됩니다.
- 비결정적 실패를 재현하는 구체적 기법(고정 시드, temperature 0, 도구 반환값 기록·재생)은 1차 출처의 뒷받침이 없습니다. 이 코스의 엔지니어링 실무 목소리로만 쓸 수 있고, 인용을 달아서는 안 됩니다. 1차 자료에서 가장 가까운 것은 "simulations using the exact prompts and tools, then watched step-by-step"와 "resume from where the agent was when the errors occurred."입니다.
- 직접 만든 하네스의 로그 포맷 설계(필드 이름, JSON Lines, 로테이션, 마스킹)에는 1차 지침이 없습니다. 실무 목소리로 쓰되, 필드 어휘는 인용문에 실제로 등장하는 용어를 빌려 쓸 수 있습니다: session id, prompt id, tool name, tool_input, tool_response, duration_ms, token counts, error.
- '증상→트레이스→가설→위치 특정→수정'으로 이어지는 엔드투엔드 디버깅 서사를 처음부터 끝까지 짚어 주는 1차 페이지는 없습니다. 레슨6의 실습 드릴은 이 코스가 스스로 짠 구성이며, 공식 워크플로인 것처럼 제시해서는 안 됩니다.
- 알림 임계값, 에러 버짓, SLO: 공식 문서는 알림 범주만 이름 짓고 수치는 주지 않습니다. 지어내서는 안 됩니다.
- 트레이스 샘플링 비율, 보관 기간: 1차 지침이 없으니 늘려 쓰지 마십시오.
- 관측 가능성 제품 비교: 인용할 수 있는 벤더 목록은 Agent SDK 페이지가 지나가듯 언급한 것뿐입니다(Honeycomb, Datadog, Grafana, Langfuse, 자체 호스팅 컬렉터). 어떤 제품에도 기능 평가를 내려서는 안 됩니다.
- 부정형 결론을 정확히 가르칠 것: Claude Code는 훅 서브프로세스에서 OTEL_* 익스포트 변수를 제거합니다. '훅으로 하네스의 OTel 파이프라인에 편승한다'는 1차 문서가 부정하는 이야기이며, 훅이 텔레메트리를 내보내려면 자기 익스포터를 직접 들고 와야 합니다.
- S2 페이지에는 도구 생태계 서술이 낡았다는 편집자 주가 붙어 있습니다. 원칙(단계마다의 ground truth, 샌드박스 테스트, 투명성, 추상화 계층이 디버깅을 방해한다는 점)만 인용하고, 현재의 도구 지침으로 인용해서는 안 됩니다.

## S1 — How we built our multi-agent research system — Anthropic Engineering

URL: https://www.anthropic.com/engineering/multi-agent-research-system

- authority: authoritative-guide

멀티 에이전트 리서치 시스템에 대한 Anthropic의 엔지니어링 회고로(2025-06), 이 코스의 핵심 근거입니다. 에이전트는 실행마다 비결정적이라는 점, 그래서 디버깅이 더 어려워진다는 점, 사용자에게 보이는 증상 하나가 밖에서는 구별되지 않는 여러 내부 원인을 감출 수 있다는 점, 프로덕션 전반의 트레이싱이 실패를 체계적으로 진단하게 해 주었다는 점, 대화 내용을 들여다보지 않고도 의사 결정 패턴과 상호작용 구조를 모니터링한다는 점, 토큰 사용량만으로 분산의 80%가 설명된다는 점, 그리고 '에이전트처럼 생각하라' — 동일한 프롬프트와 도구로 단계별로 지켜보라는 점을 다룹니다.

핵심 인용:
> "Debugging benefits from new approaches. Agents make dynamic decisions and are non-deterministic between runs, even with identical prompts. This makes debugging harder."
> "For instance, users would report agents “not finding obvious information,” but we couldn't see why. Were the agents using bad search queries? Choosing poor sources? Hitting tool failures?"
> "Adding full production tracing let us diagnose why agents failed and fix issues systematically."
> "Beyond standard observability, we monitor agent decision patterns and interaction structures—all without monitoring the contents of individual conversations, to maintain user privacy."
> "This high-level observability helped us diagnose root causes, discover unexpected behaviors, and fix common failures."
> "In traditional software, a bug might break a feature, degrade performance, or cause outages. In agentic systems, minor changes cascade into large behavioral changes, which makes it remarkably difficult to write code for complex agents that must maintain state in a long-running process."
> "Agents are stateful and errors compound. Agents can run for long periods of time, maintaining state across many tool calls. This means we need to durably execute code and handle errors along the way."
> "Traditional evaluations often assume that the AI follows the same steps each time: given input X, the system should follow path Y to produce output Z. But multi-agent systems don't work this way. Even with identical starting points, agents might take completely different valid paths to reach their goal."
> "Think like your agents. To iterate on prompts, you must understand their effects. To help us do this, we built simulations using our Console with the exact prompts and tools from our system, then watched agents work step-by-step. This immediately revealed failure modes: agents continuing when they already had sufficient results, using overly verbose search queries, or selecting incorrect tools."
> "Multi-agent systems have emergent behaviors, which arise without specific programming. For instance, small changes to the lead agent can unpredictably change how subagents behave. Success requires understanding interaction patterns, not just individual agent behavior."
> "Getting this right relies on careful prompting and tool design, solid heuristics, observability, and tight feedback loops."
> "Finally, we focused on a fast iteration loop with observability and test cases."
> "Human evaluation catches what automation misses. People testing agents find edge cases that evals miss. These include hallucinated answers on unusual queries, system failures, or subtle source selection biases."
> "In our case, human testers noticed that our early agents consistently chose SEO-optimized content farms over authoritative but less highly-ranked sources like academic PDFs or personal blogs."
> "In our data, agents typically use about 4× more tokens than chat interactions, and multi-agent systems use about 15× more tokens than chats."
> "We found that token usage by itself explains 80% of the variance, with the number of tool calls and the model choice as the two other explanatory factors."
> "The compound nature of errors in agentic systems means that minor issues for traditional software can derail agents entirely. One step failing can cause agents to explore entirely different trajectories, leading to unpredictable outcomes."
> "When errors occur, we can't just restart from the beginning: restarts are expensive and frustrating for users. Instead, we built systems that can resume from where the agent was when the errors occurred."
> "Early agents made errors like spawning 50 subagents for simple queries, scouring the web endlessly for nonexistent sources, and distracting each other with excessive updates."
> "We even created a tool-testing agent—when given a flawed MCP tool, it attempts to use the tool and then rewrites the tool description to avoid failures. By testing the tool dozens of times, this agent found key nuances and bugs."

## S2 — Building Effective AI Agents — Anthropic Engineering

URL: https://www.anthropic.com/engineering/building-effective-agents

- authority: authoritative-guide

에이전트 패턴을 다룬 Anthropic의 권위 있는 아티클입니다(2024-12. 페이지에는 도구 생태계 서술이 낡았으며 원칙만 인용한다는 편집자 주가 붙어 있습니다). 이 코스가 가져오는 것은 추상화 계층이 프롬프트와 응답을 가려 디버깅을 어렵게 만든다는 점, 표면 아래를 보려면 API를 직접 다뤄야 한다는 점, 단계마다 환경에서 오는 ground truth, 계획 단계를 명시적으로 드러내라는 투명성 원칙, 샌드박스 테스트와 가드레일, 그리고 측정하고 반복하라는 것입니다. 참고: 첫 인용문에는 원문 페이지에서 "prompts"와 "and" 사이에 보이지 않는 제로 폭 공백 두 개가 들어 있습니다(CMS 아티팩트). 눈에 보이는 텍스트가 기준입니다.

핵심 인용:
> "These frameworks make it easy to get started by simplifying standard low-level tasks like calling LLMs, defining and parsing tools, and chaining calls together. However, they often create extra layers of abstraction that can obscure the underlying prompts ​​and responses, making them harder to debug."
> "We suggest that developers start by using LLM APIs directly: many patterns can be implemented in a few lines of code. If you do use a framework, ensure you understand the underlying code. Incorrect assumptions about what's under the hood are a common source of customer error."
> "During execution, it's crucial for the agents to gain “ground truth” from the environment at each step (such as tool call results or code execution) to assess its progress."
> "Agents can then pause for human feedback at checkpoints or when encountering blockers. The task often terminates upon completion, but it’s also common to include stopping conditions (such as a maximum number of iterations) to maintain control."
> "The autonomous nature of agents means higher costs, and the potential for compounding errors. We recommend extensive testing in sandboxed environments, along with the appropriate guardrails."
> "Prioritize transparency by explicitly showing the agent’s planning steps."
> "The key to success, as with any LLM features, is measuring performance and iterating on implementations."
> "Test how the model uses your tools: Run many example inputs in our workbench to see what mistakes the model makes, and iterate."
> "While building our agent for SWE-bench, we actually spent more time optimizing our tools than the overall prompt. For example, we found that the model would make mistakes with tools using relative filepaths after the agent had moved out of the root directory."
> "Frameworks can help you get started quickly, but don't hesitate to reduce abstraction layers and build with basic components as you move to production."

## S3 — Writing effective tools for agents — with agents — Anthropic Engineering

URL: https://www.anthropic.com/engineering/writing-tools-for-agents

- authority: authoritative-guide

Anthropic의 도구 엔지니어링 아티클입니다(2025-09). 이 코스가 가져오는 것은 결정론적 시스템과 비결정적 시스템의 정의상 대비, 그리고 도구가 두 세계 사이의 계약이라는 점(계측할 값어치가 가장 큰 경계입니다), 메트릭 세트(호출 하나와 과제 전체의 실행 시간, 호출 수, 토큰 소비량, 도구 에러), 메트릭을 진단적으로 읽는 법, 자기 보고는 미덥지 않으며 말하지 않은 것이 말한 것보다 더 중요하다는 점, 원본 트랜스크립트(도구 호출과 응답을 포함합니다)가 CoT보다 위에 있다는 점, 트랜스크립트를 모델에 그대로 넘겨 분석시키는 방법, 그리고 실제 사례 하나입니다. 파라미터를 읽어 보니 Claude가 검색어에 2025를 쓸데없이 덧붙이고 있었다는 사례입니다.

핵심 인용:
> "In computing, deterministic systems produce the same output every time given identical inputs, while non-deterministic systems—like agents—can generate varied responses even with the same starting conditions."
> "Tools are a new kind of software which reflects a contract between deterministic systems and non-deterministic agents."
> "As well as top-level accuracy, we recommend collecting other metrics like the total runtime of individual tool calls and tasks, the total number of tool calls, the total token consumption, and tool errors."
> "Tracking tool calls can help reveal common workflows that agents pursue and offer some opportunities for tools to consolidate."
> "However, keep in mind that what agents omit in their feedback and responses can often be more important than what they include. LLMs don’t always say what they mean."
> "Observe where your agents get stumped or confused. Read through your evaluation agents’ reasoning and feedback (or CoT) to identify rough edges. Review the raw transcripts (including tool calls and tool responses) to catch any behavior not explicitly described in the agent’s CoT."
> "Analyze your tool calling metrics. Lots of redundant tool calls might suggest some rightsizing of pagination or token limit parameters is warranted; lots of tool errors for invalid parameters might suggest tools could use clearer descriptions or better examples."
> "When we launched Claude’s web search tool, we identified that Claude was needlessly appending 2025 to the tool’s query parameter, biasing search results and degrading performance (we steered Claude in the right direction by improving the tool description)."
> "Simply concatenate the transcripts from your evaluation agents and paste them into Claude Code. Claude is an expert at analyzing transcripts and refactoring lots of tools all at once—for example, to ensure tool implementations and descriptions remain self-consistent when new changes are made."
> "This will help you probe why agents do or don’t call certain tools and highlight specific areas of improvement in tool descriptions and specs."
> "Agents might call the wrong tools, call the right tools with the wrong parameters, call too few tools, or process tool responses incorrectly."
> "To build effective tools for agents, we need to re-orient our software development practices from predictable, deterministic patterns to non-deterministic ones."
> "Similarly, if a tool call raises an error (for example, during input validation), you can prompt-engineer your error responses to clearly communicate specific and actionable improvements, rather than opaque error codes or tracebacks."

## S4 — Monitoring — Claude Code Official Documentation

URL: https://code.claude.com/docs/en/monitoring-usage

- authority: official-docs

Claude Code의 공식 모니터링 문서입니다(OpenTelemetry 메트릭·이벤트·트레이스 레퍼런스 페이지). 이 코스가 가져오는 것은 OTel 익스포트가 사용량·비용·도구 활동을 아우른다는 점, 스팬 계층(interaction 루트 스팬, API·도구·훅 자식 스팬, 권한 대기와 실행의 분리), prompt.id가 흩어진 이벤트를 프롬프트 하나로 다시 꿰어 준다는 점, 에러 이벤트는 재시도를 포기한 뒤에 나오는 최종 신호라는 점, '복구되었는가, 멈춰 섰는가'를 가르는 쿼리 패턴, 비용은 근사치라는 점, 구조화된 이벤트가 감사 추적을 이룬다는 점, 계측 자체를 먼저 검증해야 한다는 점(session.count / --debug), TRACEPARENT가 서브프로세스로 전파된다는 점, 그리고 디스크에 남는 JSONL 세션 트랜스크립트와 '내부 포맷이며 버전마다 바뀐다'는 단서입니다.

핵심 인용:
> "Track Claude Code usage, costs, and tool activity across your organization by exporting telemetry data through OpenTelemetry (OTel)."
> "Distributed tracing exports spans that link each user prompt to the API requests and tool executions it triggers, so you can view a full request as a single trace in your tracing backend."
> "Each user prompt starts a `claude_code.interaction` root span. API calls, tool calls, and hook executions are recorded as its children. Tool spans have two child spans of their own: one for the time spent waiting on a permission decision and one for the execution itself."
> "When a user submits a prompt, Claude Code may make multiple API calls and run several tools. The `prompt.id` attribute lets you tie all of those events back to the single prompt that triggered them."
> "To trace all activity triggered by a single prompt, filter your events by a specific `prompt.id` value."
> "track API request durations and tool execution times to identify performance bottlenecks."
> "Claude Code retries failed API requests internally and emits a single `claude_code.api_error` event only after it gives up, so the event itself is the terminal signal for that request. Intermediate retry attempts are not logged as separate events."
> "To distinguish a session that recovered from one that stalled, group events by `session.id` and check whether a later `api_request` event exists after the error."
> "Cost metrics are approximations. For official billing data, refer to your API provider (Claude Console, Amazon Bedrock, or Google Cloud's Agent Platform)."
> "OpenTelemetry events are the audit data source for Claude Code activity. Every event carries identity attributes that tie tool calls, MCP activity, and permission decisions back to the user who triggered them."
> "Claude Code emits the raw event stream only. Anomaly detection, baselining, correlation across sessions, and alerting are the responsibility of your SIEM or observability backend."
> "User prompt content is not collected by default. Only prompt length is recorded. To include prompt content, set `OTEL_LOG_USER_PROMPTS=1`"
> "To verify a setup that exports metrics, check your backend for the `claude_code.session.count` metric, which Claude Code emits when a session starts."
> "If nothing arrives, run `claude --debug` and check the debug log for OTel export errors."
> "When tracing is active, Bash and PowerShell subprocesses automatically inherit a `TRACEPARENT` environment variable containing the W3C trace context of the active tool execution span."
> "analyze tool result events to identify: * Most frequently used tools * Tool success rates * Average tool execution times * Error patterns by tool type"
> "The `claude_code.cost.usage` metric helps with: * Tracking usage trends across teams or individuals * Identifying high-usage sessions for optimization * Attributing spend to specific skills, plugins, or subagent types via the `skill.name`, `plugin.name`, and `agent.name` attributes"
> "Claude Code counts each streaming response toward the cost and token metrics exactly once, including when a gateway or proxy behind `ANTHROPIC_BASE_URL` streams usage progressively across multiple frames."
> "UUID of the message as persisted in the session transcript, the `~/.claude/projects/*/*.jsonl` files."
> "The transcript entry format is [internal to Claude Code](/docs/en/sessions#where-transcripts-are-stored) and changes between versions, so a pipeline that joins on these fields can break on any release; treat the joins as version-specific rather than a stable contract"

## S5 — Hooks reference — Claude Code Official Documentation

URL: https://code.claude.com/docs/en/hooks

- authority: official-docs

Claude Code의 공식 훅 레퍼런스 페이지입니다. 이 코스는 관측 가능성과 맞닿은 부분만 가져옵니다. 훅이 생명주기 안에 이름 붙은 가로채기 지점이라는 점, 세 가지 주기(세션마다·턴마다·루프 안의 도구 호출마다), PreToolUse와 PostToolUse의 시점과 페이로드(tool_input과 tool_response를 포함한 완전한 호출 기록), 와일드카드 매처로 훅 하나가 전부를 기록한다는 점, 실행 세부는 verbose 레벨에서 디버그 로그에 남는다는 점, prompt_id가 텔레메트리와 출처를 공유하므로 서로 이을 수 있다는 점, 그리고 부정형 결론 하나입니다. 훅 서브프로세스에서는 OTEL_* 익스포트 변수가 제거된다는 것입니다.

핵심 인용:
> "Hooks are user-defined shell commands, HTTP endpoints, or LLM prompts that execute automatically at specific points in Claude Code's lifecycle."
> "Claude Code runs hooks at specific points during a session. When an event fires and a matcher matches, Claude Code passes JSON context about the event to your hook handler."
> "Events fall into three cadences: * once per session: `SessionStart` and `SessionEnd` * once per turn: `UserPromptSubmit`, `Stop`, and `StopFailure` * on every tool call inside the agentic loop: `PreToolUse` and `PostToolUse`"
> "Command hooks receive JSON data via stdin and communicate results through exit codes, stdout, and stderr. HTTP hooks receive the same JSON as the POST request body and communicate results through the HTTP response body."
> "Path to conversation JSON. The transcript file is written asynchronously and may lag the in-memory conversation, so it may not yet include the current turn's most recent messages when a hook fires."
> "Runs after Claude creates tool parameters and before processing the tool call."
> "`PostToolUse` hooks fire after a tool has already executed successfully. The input includes both `tool_input`, the arguments sent to the tool, and `tool_response`, the result it returned."
> "To run a hook after any tool completes successfully, omit the `matcher` or set it to `\"*\"`. Your hook can then discover what changed itself, for example by running `git status --porcelain`, which also lists untracked files that `git diff` misses."
> "Optional. Tool execution time in milliseconds. Excludes time spent in permission prompts and PreToolUse hooks"
> "Hook execution details, including which hooks matched, their exit codes, and full stdout and stderr, are written to the debug log file. Start Claude Code with `claude --debug-file <path>` to write the log to a known location, or run `claude --debug` and read the log at `~/.claude/debug/<session-id>.txt`."
> "For more granular hook matching details, set `CLAUDE_CODE_DEBUG_LOG_LEVEL=verbose` to see additional log lines such as hook matcher counts and query matching."
> "Command hooks execute shell commands with your full user permissions. They can modify, delete, or access any files your user account can access. Review and test all hook commands before adding them to your configuration."
> "Runs when Claude Code starts a new session or resumes an existing session."
> "One set of variables is not inherited: Claude Code [removes `OTEL_*` exporter variables from every subprocess it spawns](/docs/en/monitoring-usage#administrator-configuration), including hooks."
> "UUID identifying the user prompt currently being processed. Matches the [`prompt.id` attribute on OpenTelemetry events](/docs/en/monitoring-usage#event-correlation-attributes), so you can correlate hook output with telemetry for a single prompt."

## S6 — Observability with OpenTelemetry — Claude Agent SDK Official Documentation

URL: https://code.claude.com/docs/en/agent-sdk/observability

- authority: official-docs

Claude Agent SDK의 관측 가능성 전용 페이지로, 이 코스의 트레이싱 레슨에 가장 좋은 단일 레퍼런스입니다. 프로덕션 관측 가능성이 답해야 할 네 가지 질문(어떤 도구를 호출했는가 / 모델 요청마다 얼마나 걸렸는가 / 토큰을 얼마나 썼는가 / 어디서 실패했는가), 각각 켜고 끄는 스위치가 따로인 세 가지 독립 신호(메트릭·로그 이벤트·트레이스), 켜고 나면 루프의 각 단계가 들여다볼 수 있는 스팬이 된다는 점, 서브에이전트 스팬이 부모 트레이스 안에 중첩되어 위임 사슬 전체가 트리로 읽힌다는 점, W3C 트레이스 컨텍스트의 양방향 전파(애플리케이션→CLI, CLI→Bash 서브프로세스), 익스포트 실패가 기본적으로 조용하다는 점, 배치 익스포트 탓에 수명이 짧은 프로세스는 텔레메트리를 잃을 수 있다는 점, 기본 익스포트 주기, 구조화된 이벤트에 신원 속성이 더해지면 감사 추적이 된다는 점, 그리고 콘텐츠는 기본적으로 수집하지 않는다는 점을 가져옵니다.

핵심 인용:
> "When you run agents in production, you need visibility into what they did: * which tools they called * how long each model request took * how many tokens were spent * where failures occurred"
> "The Agent SDK can export this data as OpenTelemetry traces, metrics, and log events to any backend that accepts the OpenTelemetry Protocol (OTLP), such as Honeycomb, Datadog, Grafana, Langfuse, or a self-hosted collector."
> "The CLI has OpenTelemetry instrumentation built in: it records spans around each model request and tool execution, emits metrics for token and cost counters, and emits structured log events for prompts and tool results."
> "The CLI exports three independent OpenTelemetry signals. Each has its own enable switch and its own exporter, so you can turn on only the ones you need."
> "Traces give you the most detailed view of an agent run. With `CLAUDE_CODE_ENHANCED_TELEMETRY_BETA=1` set, each step of the agent loop becomes a span you can inspect in your tracing backend:"
> "The `llm_request`, `tool`, and `hook` spans are children of the enclosing `claude_code.interaction` span. When the agent spawns a subagent through the Agent tool, the subagent's `llm_request` and `tool` spans nest under the parent agent's `claude_code.tool` span, so the full delegation chain appears as one trace."
> "The SDK automatically propagates W3C trace context into the CLI subprocess. When you call `query()` while an OpenTelemetry span is active in your application, the SDK injects `TRACEPARENT` and `TRACESTATE` into the child process environment, and the CLI reads them so its `claude_code.interaction` span becomes a child of your span. The agent run then appears inside your application's trace instead of as a disconnected root."
> "The CLI fails silently on export errors by default: if the endpoint is unreachable or rejects the data, the agent still runs normally and the CLI drops the telemetry without surfacing an error in your application."
> "The CLI batches telemetry and exports on an interval. On a clean process exit it attempts to flush pending data, but the flush is bounded by a short timeout, so spans can still be dropped if the collector is slow to respond. If your process is killed before the CLI shuts down, anything still in the batch buffer is lost."
> "By default, metrics export every 60 seconds and traces and logs export every 5 seconds."
> "Telemetry is structural by default. Durations, model names, and tool names are recorded on every span; token counts are recorded when the underlying API request returns usage data, so spans for failed or aborted requests may omit them. The content your agent reads and writes is not recorded by default."
> "By default, the CLI reports `service.name` as `claude-code`. If you run several agents, or run the SDK alongside other services that export to the same collector, override the service name and add resource attributes so you can filter by agent in your backend."
> "When trace-context propagation is enabled, the CLI also forwards `TRACEPARENT` to every Bash and PowerShell command it runs. If a command launched through the Bash tool emits its own OpenTelemetry spans, those spans nest under the `claude_code.tool.execution` span that wraps the command."
> "With end-user identity attached, the `tool_decision`, `tool_result`, `mcp_server_connection`, and `permission_mode_changed` events, which export as log records named with a `claude_code.` prefix, become a per-user audit trail you can forward to a Security Information and Event Management (SIEM) platform."
> "Leave these unset unless your observability pipeline is approved to store the data your agent handles."
> "Do not set `console` as an exporter value when running through the SDK."
