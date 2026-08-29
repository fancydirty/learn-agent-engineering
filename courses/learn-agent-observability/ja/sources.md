# 参考ソース

このコースの重要な主張は、すべて以下のソースに基づいています。本文では `[^Sn]` の形で引用し、該当する抜粋を各エントリの下に掲載しています。引用はすべて、アンカーによるスライスを使って最終的にレンダリングされたページから一語一句そのまま機械的に抽出し、2026-08-26 に二重検証しています（94 件、すべて合格）。原文のカーリークォート、ダッシュ、乗算記号（4×）、markdown のバッククォートをそのまま保持し、一切の言い換えを加えていません。

執筆規律（全レッスンに適用。各条件は今回のイテレーションのカバレッジギャップレポートに由来します）:
- 「検証は壊れたかどうかを教え、可観測性はなぜかを教える」というコースの枠組みは**本コース独自の定式化**であり、これを逐語で述べている一次ソースはありません。裏づけられるのは "tracing let us diagnose why agents failed" と "probe why agents do or don't call certain tools" の 2 つの引用だけです。公式の表現として提示してはいけません。
- 非決定的な失敗を再現する具体的な技法（固定シード、temperature 0、ツール戻り値の記録と再生）には一次ソースの裏づけがありません。本コースのエンジニアリング実践の語りとしてのみ書け、引用を付けてはいけません。一次資料で最も近いのは "simulations using the exact prompts and tools, then watched step-by-step" と "resume from where the agent was when the errors occurred" です。
- カスタムハーネスのログ形式の設計（フィールドの命名、JSON Lines、ローテーション、秘匿化）には一次ガイダンスがありません。実践の語りで書いてください。フィールドの語彙は、引用に実際に現れる用語を借りられます: session id、prompt id、tool name、tool_input、tool_response、duration_ms、トークン数、error。
- 「症状→トレース→仮説→特定→修正」という一連のデバッグの物語を通しで示している一次ページはありません。レッスン6 のハンズオンのドリルは本コース独自の構成です。公式のワークフローとして提示してはいけません。
- アラートのしきい値、エラーバジェット、SLO: ドキュメントはアラートのカテゴリを挙げるだけで数値はありません。捏造してはいけません。
- トレースのサンプリングレート、保持期間: 一次ガイダンスがないため、詳述してはいけません。
- 可観測性プロダクトの比較: 引用できるベンダーの一覧は、Agent SDK のページが付随的に挙げているもの（Honeycomb、Datadog、Grafana、Langfuse、セルフホストのコレクター）だけです。いずれのプロダクトについても能力の評価を下してはいけません。
- 否定的な結論は正しく教えること: Claude Code はフックのサブプロセスから OTEL_* のエクスポート変数を取り除きます。「フック経由でハーネスの OTel パイプラインに相乗りする」は一次ドキュメントによって否定されています。フックがテレメトリをエクスポートするには、自前のエクスポーターを持ち込む必要があります。
- S2 のページには、ツールエコシステムの記述が古い旨の編集注記が付いています。原則（各ステップでのグラウンドトゥルース、サンドボックスでのテスト、透明性、抽象レイヤーがデバッグを妨げること）のみを引用し、現行のツールガイダンスとして扱ってはいけません。

## S1 — How we built our multi-agent research system — Anthropic Engineering

URL: https://www.anthropic.com/engineering/multi-agent-research-system

- authority: authoritative-guide

マルチエージェントのリサーチシステムに関する Anthropic のエンジニアリング振り返りです（2025年6月）。本コースの中核的な根拠です。エージェントは実行ごとに非決定的であること、その結果デバッグが難しくなること、ユーザーから見える 1 つの症状の裏に、外からは区別できない複数の内部原因が隠れうること、本番全体のトレーシングによって障害の体系的な診断が可能になったこと、会話の中身を見ずに意思決定のパターンとインタラクションの構造を監視すること、トークン使用量だけで分散の 80% が説明できること、そして「エージェントのように考える」――同一のプロンプトとツールでステップごとに観察することです。

引用:
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

エージェントのパターンを扱う Anthropic の権威ある記事です（2024年12月。ページには編集注記があり、ツールエコシステムの記述は古いため原則のみを引用します）。本コースが引くのは、抽象レイヤーがプロンプトとレスポンスを覆い隠しデバッグを難しくすること、表層の下を見るために API を直接使うこと、各ステップで環境からグラウンドトゥルースを得ること、プランニングのステップを明示的に見せるという透明性の原則、サンドボックスでのテストとガードレール、そして計測して反復することです。注意: 最初の引用には、原文ページ上で "prompts" と "and" の間に不可視のゼロ幅スペースが 2 つ含まれています（CMS の産物）。正典は見た目のテキストです。

引用:
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

ツールエンジニアリングに関する Anthropic の記事です（2025年9月）。本コースが引くのは、決定的と非決定的の定義上の対比と、2 つの世界をつなぐ契約としてのツール（最も計測する価値のある境界）、メトリクスの一式（単一の呼び出しとタスク全体の実行時間、呼び出し回数、トークン消費、ツールエラー）、メトリクスの診断的な読み方、自己申告は当てにならず語られなかったことのほうが重要なこと、生のトランスクリプト（ツール呼び出しとレスポンスを含む）は CoT より上位にあること、トランスクリプトをそのままモデルに渡して分析させること、そして実例――パラメータを読んだことで、Claude が検索語に不要な 2025 を付け足していたと判明したことです。

引用:
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

Claude Code の公式モニタリングドキュメントです（OpenTelemetry のメトリクス、イベント、トレースのリファレンスページ）。本コースが引くのは、OTel のエクスポートが利用状況・コスト・ツールの活動をカバーすること、スパンの階層（interaction のルートスパン、API / ツール / フックの子スパン、許可の待ち時間と実行の分離）、prompt.id が散らばったイベントを 1 つのプロンプトに紐づけ直すこと、エラーイベントはリトライを諦めた後の終端シグナルであること、「復帰したのか止まったのか」を見分けるクエリのパターン、コストはあくまで概算であること、構造化イベントが監査証跡になること、計測そのものをまず検証する必要があること（session.count / --debug）、TRACEPARENT がサブプロセスに伝播すること、そしてディスク上の JSONL セッショントランスクリプトと「内部フォーマットでありバージョン間で変わる」という但し書きです。

引用:
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

Claude Code の公式フックリファレンスのページです。本コースは可観測性に関わる部分だけを引きます。フックはライフサイクル上の名前のついた介入点であること、3 つのケーデンス（セッションごと / ターンごと / ループ内のツール呼び出しごと）、PreToolUse と PostToolUse のタイミングとペイロード（tool_input と tool_response を含む完全な呼び出し記録）、ワイルドカードのマッチャーで 1 つのフックからすべてを記録できること、実行の詳細は verbose レベルでデバッグログに書き出されること、prompt_id はテレメトリと出所が同じで相関が取れること、そして 1 つの否定的な結論――OTEL_* のエクスポート変数はフックのサブプロセスから取り除かれることです。

引用:
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

Claude Agent SDK の可観測性専用ページです。本コースのトレーシングのレッスンにとって、単一ページのリファレンスとして最良のものです。ここから引くのは、本番の可観測性が答えるべき 4 つの問い（どのツールが呼ばれたか / 各モデルリクエストにどれだけかかったか / トークンをどれだけ使ったか / どこで失敗したか）、独立した 3 つのシグナル（メトリクス / ログイベント / トレース）とそれぞれ別のオン・オフスイッチ、有効化するとループの各ステップが検査可能なスパンになること、サブエージェントのスパンが親のトレースに入れ子になり委譲の連鎖全体がツリーとして読めること、W3C トレースコンテキストの双方向の伝播（アプリケーション→CLI、CLI→Bash サブプロセス）、エクスポートの失敗は既定では沈黙すること、バッチエクスポートのため短命なプロセスではテレメトリが失われうること、既定のエクスポート間隔、構造化イベントと ID 属性が監査証跡になること、そして中身は既定では収集されないことです。

引用:
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
