# 参考ソース

このコースの重要な事実と定義は、すべて以下の一次資料に基づいています。引用は英語の原文をそのまま掲載しています。

## S1 — Context windows

URL: https://platform.claude.com/docs/en/build-with-claude/context-windows

- authority: official-docs

Anthropic の公式ドキュメントは、「コンテキストウィンドウ」――モデルの作業記憶――が何で構成されているかを説明しています。システムプロンプト、すべてのメッセージ（ツール結果、画像、ドキュメントを含む）、ツール定義、そしてモデル自身のそのターンの出力（拡張思考を含む）がすべてカウントされます。また「コンテキストロット」（トークン数が増えるにつれて精度とリコールが低下する）を定義し、各レスポンスが usage フィールドでその消費量を報告することを述べています。これはレッスン1（「コンテキストウィンドウはエージェントが持つすべての記憶」）の主要な根拠であり、レッスン2（「会話履歴は増え続けるだけ」）の背景支援となっています。

引用:
> "As token count grows, accuracy and recall degrade, a phenomenon known as *context rot*. This makes curating what's in context just as important as how much space is available."
> "Everything in the request counts toward the context window: the system prompt, every message in messages (including tool results, images, and documents), and your tool definitions. The output Claude generates for the turn, including its extended thinking, counts too."
> "As the conversation advances through turns, each user message and assistant response accumulates within the context window, and previous turns are preserved completely."
> "The context window (up to 1M tokens, depending on the model) holds the conversation history plus the new output Claude generates."
> "Every response reports what the request consumed in its `usage` field."

## S2 — Context engineering: memory, compaction, and tool clearing

URL: https://platform.claude.com/cookbook/tool-use-context-engineering-context-engineering-tools

- authority: official-docs

Anthropic の公式クックブックは、コンテキスト肥大化を処理する 3 つのメカニズムを正確に定義しています。compaction（ウィンドウ全体を高忠実度の要約に凝縮する。要約モデルの推論コストがかかる）、tool-result clearing（呼び出し記録を保持したまま古い再取得可能なツール結果のみを削除する）、そして memory ツールプリミティブ（情報をウィンドウから移動してセッションをまたいで生き残らせる）です。これらは独立して使用することも組み合わせて使用することもでき、clearing と compaction は現在のコンテキストにのみ作用し新しいセッションには役立たないことを説明しています。レッスン2（「会話履歴の管理」）の主要根拠であり、レッスン 3、4、6 の背景となっています。

引用:
> "Compaction distills the contents of a context window into a high-fidelity summary, letting the agent continue with minimal performance degradation when the conversation gets long."
> "Tool-result clearing addresses the bloat from tool use itself. As an agent pulls in tools and calls them, the results pile up, and deciding how much of that tool output to keep becomes an increasingly important part of managing context. Clearing drops old, re-fetchable results while keeping the record that the call happened."
> "A rough mental model for prioritizing: compaction compresses the whole window when it grows too large, clearing drops stale re-fetchable data inside the window, and memory moves information out of the window so it survives across sessions."
> "Compaction | compact_20260112 | compact-2026-01-12 | Token threshold (server-side, min 50K) | trigger (default 150K), instructions, pause_after_compaction"
> "Tool clearing | clear_tool_uses_20250919 | context-management-2025-06-27 | Token threshold (server-side) | trigger (default 100K), keep (default 3 tool uses), clear_at_least, exclude_tools, clear_tool_inputs"
> "The summary preserves key decisions and facts but may drop specific numbers or exact phrasing. It costs inference (the summarizer model runs), but handles all context growth, not just tool results."
> "Clearing and compaction both operate on the current context; neither helps when a new session starts and the window is empty. Memory solves that problem."
> "Compaction is a _whole-transcript_ operation: user messages, assistant messages, tool calls, tool results, even prior compaction blocks are all flattened into the summary."
> "This cookbook works through how to think about designing with them: when each one applies, how to configure them, what changes when you use them independently vs. together, and sample use-cases where different combinations make sense."

## S3 — How Claude remembers your project

URL: https://code.claude.com/docs/en/memory

- authority: official-docs

Anthropic の公式ドキュメントは、2 つの補完的なメモリメカニズムを説明しています。CLAUDE.md は人間が書き、すべてのセッションの開始時に完全にロードされます（推奨ターゲットは 200 行未満。実際のハード制限は 4 MiB で、それを超えるとファイルは完全にスキップされます）。Auto memory は Claude が MEMORY.md インデックスとオンデマンドトピックファイルとして書き、インデックスの最初の 200 行または 25KB のみが各セッションにロードされ、トピックファイルはオンデマンドで読み込まれます。また、ブロックレベルの HTML コメントは注入前に削除されること、プロジェクトルートの CLAUDE.md は /compact 後に再読み込みされ再注入されることも述べています。レッスン3（「外部メモリ: ファイルと取得」）の主要根拠であり、レッスン 5 と 6 で再利用されています。

引用:
> "CLAUDE.md files are loaded into the context window at the start of every session, consuming tokens alongside your conversation... **Size**: target under 200 lines per CLAUDE.md file. Longer files consume more context and reduce adherence."
> "Claude Code loads a CLAUDE.md file of up to 4 MiB in full and skips a larger file. Shorter files produce better adherence."
> "Block-level HTML comments (`<!-- maintainer notes -->`) in CLAUDE.md files are stripped before the content is injected into Claude's context."
> "The first 200 lines of MEMORY.md, or the first 25KB, whichever comes first, are loaded at the start of every conversation. Content beyond that threshold is not loaded at session start."
> "Claude Code doesn't load topic files such as `user_role.md` or `feedback_testing.md` at startup. Claude reads them on demand using its standard file tools when it needs the information."
> "Project-root CLAUDE.md survives compaction: after /compact, Claude re-reads it from disk and re-injects it into the session."
> "Who writes it | You | Claude" / "Loaded into | Every session | Every session (first 200 lines or 25KB)"

## S4 — Track todos

URL: https://code.claude.com/docs/en/agent-sdk/todo-tracking

- authority: official-docs

Anthropic の公式ドキュメントは、エージェント実行中の todo の完全なライフサイクル――Created、Activated、Completed、Removed――を定義し、この状態がメッセージストリームで観測可能な構造化ツール呼び出し（TaskCreate / TaskUpdate）を通じて公開されることを説明しています。レッスン4（「構造化された状態」）の主要根拠です。

引用:
> "Claude moves each todo through a predictable lifecycle:\n\n1. **Created**: Claude adds the todo as pending when it identifies a task\n2. **Activated**: Claude sets the todo to in_progress when it starts the work\n3. **Completed**: Claude marks it completed when the task finishes successfully\n4. **Removed**: Claude deletes a todo it no longer needs by setting status: \"deleted\" in a TaskUpdate call"
> "In a session that has the task-tracking tools, Claude keeps a written todo list, updating each item's status as it works. You see each change in the message stream as a structured tool call."

## S5 — Memory Is a Feature. It Is Also an Attack Surface

URL: https://genai.owasp.org/2026/05/13/memory-is-a-feature-it-is-also-an-attack-surface/

- authority: authoritative-guide

OWASP Gen AI Security Project の公式ブログに ASI06（memory and context poisoning）エントリの共同リードによって公開されたこの記事は、Cisco 研究チームが開示した MemoryTrap 脆弱性を例として使用しています。無害に見えるルーチン――リポジトリのクローン、依存関係インストールの承認――が、悪意のあるペイロードが永続的メモリ、グローバルフック設定、そしてシステムプロンプトを通じた高信頼指示レイヤーに到達することを許し、一度限りのアクションがセッションやプロジェクトをまたいでモデルの将来の動作を変える可能性があることを示しています。また、Cisco の開示後、Anthropic が Claude Code v2.1.50 でシステムプロンプトからユーザーメモリを削除したことも述べています。レッスン5（「メモリの境界と安全性」）の主要根拠であり、永続的メモリレイヤーのセキュリティ設計についてレッスン6 で再利用されています。

引用:
> "Agentic systems do not just respond in the moment. They retain context, reuse memory, and rely on persistent state to guide future reasoning and actions. That is what makes them useful. It is also what makes them vulnerable."
> "In the vulnerability we called MemoryTrap, we found that a routine developer workflow could turn into persistent prompt injection. The path was surprisingly ordinary: clone a repository, let the agent help, approve a dependency installation, and move on."
> "Instead, it reached persistent memory, the global hooks configuration, and even influenced a highly trusted instruction layer through the system prompt. In other words, a one-time action could shape the model's future behavior across sessions, projects, and even reboots."
> "To Anthropic's credit, after we at Cisco disclosed the issue, Claude Code v2.1.50 removed user memories from the system prompt, reducing the specific high-trust override path we identified. That was the right fix for the path we found."
> "Once malicious content reaches trusted surfaces like memory, hooks, or configuration, the attacker is no longer just influencing one response. They are influencing future reasoning."
> "That is why MemoryTrap maps so clearly to ASI06: Memory & Context Poisoning."

## S6 — Using the Messages API

URL: https://platform.claude.com/docs/en/build-with-claude/working-with-messages

- authority: official-docs

公式ドキュメントは、Messages API がステートレスであることを明確に述べています。すべてのリクエストは完全な会話履歴を運ぶ必要があり、API はリクエスト間で状態を保持しません。レッスン1 の中核的主張（「API 呼び出しはステートレス」）の直接的根拠であり、レッスン4 のセッションが終了するとウィンドウとともに進捗記録が消えるという前提の支援となっています。

引用:
> "The Messages API is stateless, which means that you always send the full conversational history to the API."

## S7 — Handle tool calls

URL: https://platform.claude.com/docs/en/agents-and-tools/tool-use/handle-tool-calls

- authority: official-docs

公式ドキュメントは、ツール呼び出しのペアリングルールを示しています。tool_result ブロックは対応する tool_use ブロックの直後に続く必要があり、ペアが壊れるとリクエストがエラーになります。レッスン2（「切り捨ては tool_use/tool_result ペアを切断してはならない」）の直接的根拠であり、レッスン6 の splitKeepingToolPairs 設計動機となっています。

引用:
> "Tool result blocks must immediately follow their corresponding tool use blocks in the message history. You cannot include any messages between the assistant's tool use message and the user's tool result message."
> "If you receive an error like \"tool_use ids were found without tool_result blocks immediately after\", check that your tool results are formatted correctly."

## S8 — Compaction

URL: https://platform.claude.com/docs/en/build-with-claude/compaction

- authority: official-docs

公式ドキュメントは、サーバーサイド要約 compaction のパラメータ詳細を示しています。最小トリガー閾値は 50,000 トークン（サーバー強制）、長い会話では複数回の compaction が発生する可能性、最後の compaction ブロックがプロンプトの最終状態を反映すること、そして 1 つのリクエスト内で compaction が複数回発生する可能性があることです。レッスン2 の compaction 詳細の直接的根拠です。

引用:
> "`input_tokens` is the only supported trigger type. `value` must be at least 50,000 tokens."
> "A long-running conversation might result in multiple compactions. The last compaction block reflects the final state of the prompt, replacing content prior to it with the generated summary."
> "Compaction might occur multiple times within a single request depending on your trigger threshold and the amount of output generated."

## S9 — How tool use works

URL: https://platform.claude.com/docs/en/agents-and-tools/tool-use/how-tool-use-works

- authority: official-docs

公式ドキュメントは、stop_reason 駆動のツール実行ループ仕様を示しています。モデル自身は何も実行せず、構造化されたリクエストを発行するだけです。ホストがそれを実行し、結果を送り返します。stop_reason がまだ tool_use である限り、ループは続きます。レッスン6 の「開始点: ツール呼び出しコースからの実行ループ」の一節の直接的根拠です。

引用:
> "The model never executes anything on its own. It emits a structured request, your code (or Anthropic's servers) runs the operation, and the result flows back into the conversation. ... 2. Claude responds with stop_reason: "tool_use" and one or more tool_use blocks. 3. Execute each tool. Format the outputs as tool_result blocks. 4. Send a new request... 5. Repeat from step 2 while stop_reason is "tool_use"."
