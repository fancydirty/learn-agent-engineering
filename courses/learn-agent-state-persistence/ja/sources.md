# 参考ソース

このコースの重要な主張は、以下のソースに基づいています。レッスンでは `[^Sn]` で引用し、該当する抜粋を各エントリの下に掲載しています。引用は英語の原文をそのまま掲載しています。

## S1 — How we built our multi-agent research system — Anthropic Engineering

URL: https://www.anthropic.com/engineering/multi-agent-research-system

- authority: authoritative-guide

マルチエージェントリサーチシステムに関する Anthropic のエンジニアリング振り返りであり、本コースの中核的な根拠です。エージェントはステートフルで誤りは累積すること、ゼロからやり直すことはできずエラーが起きた地点から再開しなければならないこと、信頼性はモデルの適応力とリトライロジックや定期的なチェックポイントのような決定的なセーフガードを組み合わせて得られること、そしてデプロイ時には稼働中のエージェントが処理のどの地点にいるか分からないことを示しています。

引用:
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

Claude Code のチェックポイント機能の公式ドキュメントで、チェックポイント／巻き戻し／フォークのプロダクトグレードの全体像を示しています。すべてのユーザープロンプトの前に自動でチェックポイントを取ること、会話と一緒に保存されること、会話とコードを別々に復元できること、bash で加えた変更は追跡されないこと、そしてバージョン管理の代わりにはならないことです。本コースでは、教える対象のツールとしてではなく、プロダクトグレードの参照点として使用します。

引用:
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

エージェントのパターンを扱う Anthropic の権威ある記事です。本コースでは、チェックポイントやブロッカーに遭遇したときに人間のフィードバックを待って一時停止すること、自律性がもたらすコスト増と誤りの累積、多数のターンにまたがる信頼の限界、そして「成果が明確に改善する場合にのみ複雑さを足す」という釣り合いの原則のために使用します。

引用:
> "Agents can then pause for human feedback at checkpoints or when encountering blockers."
> "The autonomous nature of agents means higher costs, and the potential for compounding errors."
> "The LLM will potentially operate for many turns, and you must have some level of trust in its decision-making."
> "it's also common to include stopping conditions (such as a maximum number of iterations) to maintain control."
> "you should consider adding complexity only when it demonstrably improves outcomes."

## S4 — Handle tool calls — Claude API

URL: https://platform.claude.com/docs/en/agents-and-tools/tool-use/handle-tool-calls

- authority: official-docs

tool_use および tool_result コンテンツブロックのフィールド仕様とペアリングルールを示しています。すべての tool_use には対応する tool_result が必要で、まとめて返さなければなりません。再開のレッスンでは、ツールの実行と台帳への書き込みの間でクラッシュが起きたときに残る宙ぶらりんの呼び出しを処理するために、このルールに依存します。

引用:
> "id: A unique identifier for this particular tool use block. ... name: The name of the tool being used. input: An object containing the input being passed to the tool, conforming to the tool's input_schema. ... tool_use_id: The id of the tool use request this is a result for. ... is_error (optional): Set to true if the tool execution resulted in an error."
> "Whichever strategy you use, return one tool_result for each tool_use block, all together in the next user message. Match each result to its call with tool_use_id, and put every tool_result block before any text content in that message."

## S5 — The 2026 Agent Engineering Roadmap — GitHub (codejunkie99/agent-roadmap-2026)

URL: https://github.com/codejunkie99/agent-roadmap-2026

- authority: blog

ハーネスエンジニアリングを軸に構成されたコミュニティのオープンソースロードマップです（AI 支援で執筆）。本コースが取るのは枠組みの主張のみで、永続化はハーネスの一構成要素であり、その役割は「再開、巻き戻し、フォークができるよう各ノードで状態をチェックポイントする」ことだという点です。注意: パーセンテージの閾値、トークン数、ベンチマークスコア、給与額などの具体値は事実として引用しません。

引用:
> "the harness is the union of:"
> "persistence. Checkpoint state every node so you can resume, rewind, fork."
> "Same model, different harness, completely different result."
