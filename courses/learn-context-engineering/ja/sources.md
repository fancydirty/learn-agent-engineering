# 参考ソース

このコースの重要な主張は、以下のソースに基づいています。レッスンでは `[^Sn]` で引用し、該当する抜粋を各エントリの下に掲載しています。引用は英語の原文をそのまま掲載しています。

## S1 — Effective context engineering for AI agents — Anthropic Engineering

URL: https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents

- authority: authoritative-guide

コンテキストエンジニアリングを扱う Anthropic Engineering の権威ある長編記事であり、本コースの中核的な根拠です。コンテキストエンジニアリングとプロンプトエンジニアリングの関係、アテンション予算とコンテキストロット、システムプロンプトの「高度（altitude）」、コンテキストとしてのツールと実例、ジャストインタイム取得と漸進的な開示、コンパクション、構造化されたノート取り、そしてサブエージェントアーキテクチャまでを扱っており、本コースのほぼすべてのトピックがここから来ています。

引用:
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

エージェントのパターンを扱う Anthropic の権威ある記事です。本コースでは、エージェントのループによる定義、自律性がもたらすコストと誤りの累積、そして「成果が明確に改善する場合にのみ複雑さを足す」という釣り合いの原則のために使用します。

引用:
> "They are typically just LLMs using tools based on environmental feedback in a loop."
> "The autonomous nature of agents means higher costs, and the potential for compounding errors."
> "The LLM will potentially operate for many turns, and you must have some level of trust in its decision-making."
> "you should consider adding complexity only when it demonstrably improves outcomes."

## S3 — How we built our multi-agent research system — Anthropic Engineering

URL: https://www.anthropic.com/engineering/multi-agent-research-system

- authority: authoritative-guide

マルチエージェントリサーチシステムに関する Anthropic のエンジニアリング振り返りで、サブエージェントのコンテキスト分離とトークンの経済性について一次データを提供しています。並列に走るサブエージェントはそれぞれ独立したコンテキストウィンドウを持つこと、サブエージェントが「インテリジェントなフィルター」として発見をリードエージェント向けに圧縮すること、そしてエージェントとマルチエージェントシステムのトークン倍率が示されています。

引用:
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

Claude Code の公式ベストプラクティスページです（anthropic.com/engineering/claude-code-best-practices は現在ここへ 308 リダイレクトします）。実際のプロダクトにおけるコンテキスト管理の姿を示しています。CLAUDE.md をめぐる規律、/clear と自動コンパクション、メインコンテキストを汚さないサブエージェント調査、そして「コンテキストは管理すべき最も重要なリソースである」という中心ルールです。

引用:
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

ハーネスエンジニアリングを軸に構成されたコミュニティのオープンソースロードマップです（AI 支援で執筆）。本コースが取るのは枠組みの主張のみで、ハーネスの一構成要素としてのコンテキスト管理と、コンテキストエンジニアリングの一行定義です。注意: パーセンテージの閾値、トークン数、ベンチマークスコア、給与額などの具体値は事実として引用しません。「2026 年、プロンプトエンジニアリングは単独のスキルとしては死んだ」はこのロードマップの意見表明であり、引用する場合は必ずそのように帰属させる必要があります。本文では S1 のより慎重な「自然な発展」という枠組みを優先します。

引用:
> "Same model, different harness, completely different result."
> "the harness is the union of:"
> "context engineering: deciding what tokens are in front of the model at every step of the loop"
> "Prompt engineering is dead as a standalone skill in 2026."
