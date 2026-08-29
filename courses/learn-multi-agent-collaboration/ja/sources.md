# 参考ソース

## S1 — How we built our multi-agent research system (Anthropic Engineering)

URL: https://www.anthropic.com/engineering/multi-agent-research-system

- authority: authoritative-guide

Anthropic のエンジニアリングチームによる第一次の技術ブログ投稿で、本番グレードのマルチエージェントシステムである Claude Research のアーキテクチャを詳述しています。orchestrator-subagent の分業、プロンプト設計原則、失敗モード、評価方法をカバーしています。このコースの「マルチエージェントシステムとは何か」、「サブエージェントプロンプトに含めるべきもの」、労力スケーリングルール、引用/結果統合、トークンコスト、どのタスクが並列化に適しているかに関する主張はすべてこの記事から来ています。

引用:

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

Anthropic の第一次ガイドで、ワークフローとエージェントをいつ使用するか、各オーケストレーションパターンをどのように定義するかを説明しています――prompt chaining、orchestrator-workers、evaluator-optimizer（producer-reviewer）の公式定義、そしてシンプルから始めて実証的に価値がある場合にのみ複雑さを追加するという中核的アドバイスをカバーしています。このコースのコラボレーションパターンの分類と「いつマルチエージェントを使わないか」に関する主張はこの記事から来ています。

引用:

> "Workflows are systems where LLMs and tools are orchestrated through predefined code paths."

> "a central LLM dynamically breaks down tasks, delegates them to worker LLMs, and synthesizes their results."

> "Prompt chaining decomposes a task into a sequence of steps, where each LLM call processes the output of the previous one."

> "one LLM call generates a response while another provides evaluation and feedback in a loop."

> "Reviewing a piece of code for vulnerabilities, where several different prompts review and flag the code if they find a problem."

> "you should consider adding complexity only when it demonstrably improves outcomes."

## S3 — Create custom subagents (Claude Code Docs)

URL: https://code.claude.com/docs/en/sub-agents

- authority: official-docs

Claude Code の公式ドキュメントで、サブエージェントのコンテキスト分離メカニズム、必須の frontmatter フィールド、デリゲーションのトリガー方法、結果の返却方法を説明しています。このコースの「サブエージェントがあなたの会話履歴を見られない理由」、「デリゲーションは description フィールドによってトリガーされる」、「結論のみが返される」という主張はすべてこのドキュメントから来ています。

引用:

> "Each subagent starts with a fresh, isolated context window. It doesn't see your conversation history, the skills you've already invoked, or the files Claude has already read. Claude composes a delegation message that summarizes the task, and the subagent works from there."

> "When subagents complete, their results return to your main conversation. Running many subagents that each return detailed results can consume significant context."

> "The following fields can be used in the YAML frontmatter. Only name and description are required."

> "Claude automatically delegates tasks based on the task description in your request, the description field in subagent configurations, and current context."

> "Each subagent completes its task and returns results to Claude, which then passes relevant context to the next subagent."

> "A fork is a subagent that inherits the entire conversation so far instead of starting fresh... The fork's own tool calls still stay out of your conversation and only its final result comes back, so your main context window stays clean."

## S4 — Agents (OpenAI Agents SDK)

URL: https://openai.github.io/openai-agents-python/agents/

- authority: official-docs

OpenAI Agents SDK ドキュメントのマルチエージェントオーケストレーションパターンに関するセクションで、Manager（agents-as-tools）と Handoffs パターンを定義しています。このコースの「コラボレーションパターン」セクションは、orchestrator-worker を超えた別の一般的な分業を対比するためにこれを使用しています。

引用:

> "Manager (agents as tools): A central manager/orchestrator invokes specialized sub‑agents as tools and retains control of the conversation."

> "Handoffs: Peer agents hand off control to a specialized agent that takes over the conversation. This is decentralized."

## S5 — Handoffs (OpenAI Agents SDK)

URL: https://openai.github.io/openai-agents-python/handoffs/

- authority: official-docs

OpenAI Agents SDK ドキュメントの Handoffs メカニズムの詳細な説明で、handoff 後に新しいエージェントが会話を引き継ぐ方法と、handoff が単一の run 内に留まる境界をカバーしています。このコースは、handoff スタイルと orchestrator-worker スタイルのコラボレーションにおけるコンテキスト受け渡しの主要な違いを説明するためにこれを使用しています。

引用:

> "Handoffs stay within a single run."

> "When a handoff occurs, it's as though the new agent takes over the conversation, and gets to see the entire previous conversation history."

## S6 — Best practices for Claude Code (Claude Code Docs)

URL: https://code.claude.com/docs/en/best-practices

- authority: official-docs

Claude Code の公式ベストプラクティスドキュメントで、その「trust-then-verify gap」セクションは、モデルの出力がもっともらしく見えても必ずしも正しくないという失敗モードを直接名付け、その対応を示しています: 自分で検証し、検証できない場合は信頼しない。このコースの「サブエージェントが完了したと主張しても信頼できない」セクションの中核的主張はこのドキュメントから来ています。

引用:

> "The trust-then-verify gap. Claude produces a plausible-looking implementation that doesn't handle edge cases. Fix: Always provide verification (tests, scripts, screenshots). If you can't verify it, don't ship it."

> "Claude stops when the work looks done. Without a check it can run, \"looks done\" is the only signal available, and you become the verification loop: every mistake waits for you to notice it."

> "Have Claude show evidence rather than asserting success: the test output, the command it ran and what it returned, or a screenshot of the result."

## S7 — Effective context engineering for AI agents (Anthropic Engineering)

URL: https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents

- authority: authoritative-guide

Anthropic のコンテキストエンジニアリングに関する第一次ガイドで、「コンテキストロット」と「注意予算」の直接的な説明を示しています。コンテキストウィンドウ内のトークン数が増えるほど、モデルがそのコンテキストから情報を正確に思い出す能力は低下します。そしてすべての新しいトークンが有限の注意予算を消費します。また、この劣化は崖ではなく勾配であることも明確にしています。このコースの「コンテキスト汚染」と「注意希釈」セクションの主張はこの記事に基づいています。

引用:

> "as the number of tokens in the context window increases, the model's ability to accurately recall information from that context decreases"

> "LLMs have an 'attention budget' that they draw on when parsing large volumes of context. ... Every new token introduced depletes this budget by some amount"

> "these factors create a performance gradient rather than a hard cliff"

## S8 — Using the Messages API (Claude API)

URL: https://platform.claude.com/docs/en/build-with-claude/working-with-messages

- authority: official-docs

公式ドキュメントは、Messages API がステートレスであることを明確に述べています。すべてのリクエストは完全な会話履歴を運ぶ必要があり、API はリクエスト間で状態を保持しません。これはレッスン6 の「すべての呼び出しはタスクと前回の情報をプロンプトに逐語的に書き込む必要がある」の実装前提です。

引用:

> "The Messages API is stateless, which means that you always send the full conversational history to the API."

## S9 — Structured outputs (Claude API)

URL: https://platform.claude.com/docs/en/build-with-claude/structured-outputs

- authority: official-docs

公式ドキュメントは、構造化出力なしでは、慎重にプロンプトしても、モデルは依然として不正な JSON（構文エラー、フィールド欠落、型不一致）を生成する可能性があることを説明しています。構造化出力は制約付きサンプリングを使用して、レスポンスがスキーマに厳密に一致することを保証します。これはレッスン6 の「レビュアーは JSON のみを返すよう求められているが、それでも防御的パースが必要」セクションの前提です。

引用:

> "Structured outputs constrain Claude's responses to follow a specific schema, ensuring valid, parseable output for downstream processing."

> "Without structured outputs, Claude can generate malformed JSON responses or invalid tool inputs that break your applications. Even with careful prompting, you may encounter: Parsing errors from invalid JSON syntax"
