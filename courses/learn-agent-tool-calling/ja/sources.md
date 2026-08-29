# 参考ソース

このコースの重要な事実と定義は、すべて以下の一次資料に基づいています。引用は英語の原文をそのまま掲載しています。

## S1 — Function calling — OpenAI API Guides

URL: https://developers.openai.com/api/docs/guides/function-calling

- authority: official-docs

OpenAI のツール呼び出し（関数呼び出し）は、基本的にアプリケーションとモデル間のマルチステップの対話であり、モデルは呼び出しをトリガーするだけで、実際の関数実行は呼び出し側のアプリケーションが行う必要があることを説明しています。

引用:
> "Tool calling is a multi-step conversation between your application and a model via the OpenAI API. When the model calls a function, you must execute it and return the result."

## S2 — Tool use with Claude — Overview

URL: https://platform.claude.com/docs/en/agents-and-tools/tool-use/overview

- authority: official-docs

Claude のツール使用メカニズムの概要を示し、ホストアプリケーションが実行する「クライアントツール」と Anthropic のサーバーが実行する「サーバーツール」を区別し、ツール呼び出しがトリガーされた際の基本的なレスポンス構造を示しています。

引用:
> "It then returns a structured call that your application executes (client tools) or that Anthropic executes (server tools). ... Claude responds with stop_reason: "tool_use" and one or more tool_use blocks. Your code executes the operation and sends back a tool_result."

## S3 — Define tools — Claude API

URL: https://platform.claude.com/docs/en/agents-and-tools/tool-use/define-tools

- authority: official-docs

ツール定義に含める必要があるフィールド（name、description、input_schema）とそれぞれの意味を逐語的に示しており、ツールの「契約」の構造に関する権威ある参照資料です。

引用:
> "A user-defined tool definition includes: name — The name of the tool. ... description — A detailed plaintext description of what the tool does, when it should be used, and how it behaves. input_schema — A JSON Schema object defining the expected parameters for the tool."

## S4 — How tool use works — Claude API

URL: https://platform.claude.com/docs/en/agents-and-tools/tool-use/how-tool-use-works

- authority: official-docs

モデル自体は何も実行しない――構造化されたリクエストを発行するだけで、実際の実行はホストアプリケーションまたは Anthropic のサーバーが行う――ことを明確に述べ、stop_reason によって駆動される正規のマルチターンループを示しています。このコースの中心的な主張の最良の権威的根拠です。

引用:
> "The model never executes anything on its own. It emits a structured request, your code (or Anthropic's servers) runs the operation, and the result flows back into the conversation. ... 2. Claude responds with stop_reason: "tool_use" and one or more tool_use blocks. 3. Execute each tool. Format the outputs as tool_result blocks. 4. Send a new request... 5. Repeat from step 2 while stop_reason is "tool_use"."

## S5 — Handle tool calls — Claude API

URL: https://platform.claude.com/docs/en/agents-and-tools/tool-use/handle-tool-calls

- authority: official-docs

tool_use および tool_result コンテンツブロックの正確なフィールド仕様（id/name/input と tool_use_id/content/is_error）を示しており、リクエストとレスポンスのバイトレベルの形状を教えるために使用されています。

引用:
> "id: A unique identifier for this particular tool use block. ... name: The name of the tool being used. input: An object containing the input being passed to the tool, conforming to the tool's input_schema. ... tool_use_id: The id of the tool use request this is a result for. ... is_error (optional): Set to true if the tool execution resulted in an error."

## S6 — Tools reference — Claude Code Docs

URL: https://code.claude.com/docs/en/tools-reference

- authority: official-docs

Claude Code がホストアプリケーションとして公開する組み込みツールと、パーミッションルール、サブエージェントツールリスト、フックマッチャーで使用される正確な名前をリストアップしており、実際のホストループ内のツールカタログ概念を学習者が理解するのに役立ちます。

引用:
> "Claude Code has access to a set of built-in tools that help it understand and modify your codebase. The tool names are the exact strings you use in permission rules, subagent tool lists, and hook matchers."

## S7 — Tool Use — LM Studio Docs (OpenAI-compatible API)

URL: https://lmstudio.ai/docs/developer/openai-compat/tools

- authority: authoritative-guide

OpenAI 互換 API の実装ドキュメントとして、レスポンス内の tool_calls 配列の正確な位置と finish_reason 値の "tool_calls" を逐語的に確認しており、公式ガイドがレスポンス構造の説明で残しているギャップを埋めています。

引用:
> "If the model decides that the user message would be best fulfilled with a tool call, an array of tool call request objects will be provided in the response field, choices[0].message.tool_calls. The finish_reason field of the top-level response object will also be populated with "tool_calls"."

## S8 — Writing effective tools for AI agents—using AI agents | Anthropic Engineering

URL: https://www.anthropic.com/engineering/writing-tools-for-agents

- authority: authoritative-guide

優れたツール説明は入出力の曖昧さを排除する必要があり、ツールが多いほどエージェントのパフォーマンスが向上するわけではない――類似したツールが多すぎると選択が難しくなる――ことを指摘しています。

引用:
> "Avoid ambiguity by clearly describing (and enforcing with strict data models) expected inputs and outputs. ... More tools don't always lead to better outcomes."

## S9 — Introducing advanced tool use on the Claude Developer Platform | Anthropic Engineering

URL: https://www.anthropic.com/engineering/advanced-tool-use

- authority: authoritative-guide

大量のツール定義セット（特に複数の MCP サーバーを接続した後）が会話が始まる前に膨大なコンテキストトークンを消費すること、また中間ツール結果もモデルのコンテキストに完全に入り込み、重要な情報を押し出す――さらには追い出す――ことを具体的な数字で示しています。これが Tool Search Tool とプログラマティックなツール呼び出しの動機付けとなっています。

引用:
> "That's 58 tools consuming approximately 55K tokens before the conversation even starts. ... At Anthropic, we've seen tool definitions consume 134K tokens before optimization."
> "When Claude analyzes a 10MB log file for error patterns, the entire file enters its context window ... These intermediate results consume massive token budgets and can push important information out of the context window entirely."

## S10 — How to implement tool use - Claude Platform Docs

URL: https://platform.claude.com/docs/en/agents-and-tools/tool-use/implement-tool-use

- authority: official-docs

公式ドキュメントは、ツールの命名に関するベストプラクティスを示しています。曖昧さを避けるためにサービス名を名前空間プレフィックスとして使用し、ツールは内部参照ではなく安定した高シグナルの識別子を返すべきです。

引用:
> "Use meaningful namespacing in tool names. When your tools span multiple services or resources, prefix names with the service (e.g., github_list_prs, slack_send_message). This makes tool selection unambiguous as your library grows, and is especially important when using tool search."

## S11 — Tools - Model Context Protocol

URL: https://modelcontextprotocol.io/docs/concepts/tools

- authority: official-docs

MCP 仕様はプロトコルエラーとツール実行エラーを区別し、クライアントはモデルが自己修正して再試行できるように、アクション可能なツール実行エラーをモデルに提示する必要があると定めています。

引用:
> "Clients SHOULD provide tool execution errors to language models to enable self-correction."

## S12 — Specification - Model Context Protocol

URL: https://modelcontextprotocol.io/specification/2025-11-25

- authority: official-docs

公式仕様は、MCP が Language Server Protocol のアイデアを参考にして、AI アプリケーションエコシステム全体でツールとコンテキストの統合を標準化し、異なるホストアプリケーションが 1 つの統一されたプロトコルを通じてツールを公開できるようにしていることを説明しています。

引用:
> "MCP takes some inspiration from the Language Server Protocol, which standardizes how to add support for programming languages across a whole ecosystem of development tools. In a similar way, MCP standardizes how to integrate additional context and tools into the ecosystem of AI applications."

## S13 — What is the Model Context Protocol (MCP)? - Model Context Protocol

URL: https://modelcontextprotocol.io/introduction

- authority: official-docs

公式イントロページは、USB-C のアナロジーを使って、MCP が AI アプリケーションを外部ツールやデータソースに接続する統一された標準的な方法を提供する仕組みを直感的に説明しています。

引用:
> "Think of MCP like a USB-C port for AI applications. Just as USB-C provides a standardized way to connect electronic devices, MCP provides a standardized way to connect AI applications to external systems."

## S14 — Creating your first schema - JSON Schema

URL: https://json-schema.org/learn/getting-started-step-by-step

- authority: official-docs

公式ドキュメントは、JSON Schema の title/description が意図を述べるものであり制約を追加しないこと、そして $schema がどのバージョンの仕様に従っているかを宣言することを説明しており、ツールの入力パラメータ（inputSchema）を設計するための基礎となっています。

引用:
> "title and description: state the intent of the schema. These keywords don't add any constraints to the data being validated. ... $schema: specifies which draft of the JSON Schema standard the schema adheres to."

## S15 — Configure permissions - Claude Code Docs

URL: https://code.claude.com/docs/en/permissions

- authority: official-docs

公式ドキュメントとして、Claude Code のパーミッションルールの正確な構文（allow/deny/ask と Tool(specifier) 形式）とその評価順序を説明しており、コースの中核的な「パーミッションルール構文」トピックの第一次的根拠となっています。

引用:
> "Rules are evaluated in order: deny, then ask, then allow. The first match in that order determines the outcome, and rule specificity doesn't change the order. A broad deny rule like `Bash(aws *)` blocks every matching call, including calls that also match a narrower allow rule like `Bash(aws s3 ls)`, so a deny rule can't carry allowlist exceptions."

## S16 — Configure the sandboxed Bash tool - Claude Code Docs

URL: https://code.claude.com/docs/en/sandboxing

- authority: official-docs

公式ドキュメントは、サンドボックスのファイルシステム分離とネットワーク分離が 2 つの独立したレイヤーであり、プロンプトインジェクションによってモデルが操作された後でも OS レベルの強制が有効である理由を説明しており、write/execute ツールの「爆発半径」とサンドボックスが実際に保証するものを教えるために使用されています。

引用:
> "The two layers also differ in how they are enforced. Claude Code evaluates permission decisions before a command runs, based on the command string and, in auto mode, a separate classifier's judgment about whether the command is safe. The operating system enforces the sandbox boundary on the running process, so it holds regardless of what the model chose to run and even if an allowed command does more than its name suggests."

## S17 — Making Claude Code more secure and autonomous with sandboxing - Anthropic Engineering

URL: https://www.anthropic.com/engineering/claude-code-sandboxing

- authority: official-docs

この Anthropic エンジニアリング投稿は、サンドボックスの設計目標を「プロンプトインジェクションが成功した場合でも」に明示的に結びつけており、サンドボックスが特にプロンプトインジェクションリスクをターゲットにしているというコースの主張の権威的ソースです。

引用:
> "Sandboxing ensures that even a successful prompt injection is fully isolated, and cannot impact overall user security. ... This is particularly important in preventing a prompt-injected Claude from modifying sensitive system files. ... Without network isolation, a compromised agent could exfiltrate sensitive files like SSH keys."

## S18 — LLM06:2025 Excessive Agency - OWASP Gen AI Security Project

URL: https://owasp.org/www-project-top-10-for-large-language-model-applications/2_0_vulns/LLM06_ExcessiveAgency.html

- authority: official-docs

公式 OWASP ページは「過剰な権限（Excessive Agency）」の権威ある定義とその 3 つの根本原因（過剰な機能性、過剰な権限、過剰な自律性）、そして高リスクアクションに対する人間による承認という具体的な緩和策を示しており、エージェントのツール認可境界に関するコースの章を支えています。

引用:
> "Excessive Agency is the vulnerability that enables damaging actions to be performed in response to unexpected, ambiguous, or manipulated outputs from an LLM, regardless of what is causing the LLM to malfunction. ... Utilise human-in-the-loop control to require a human to approve high-impact actions before they are taken. This may be implemented in a downstream system (outside the scope of the LLM application) or within the LLM extension itself."

## S19 — The lethal trifecta for AI agents - Simon Willison's Weblog

URL: https://simonwillison.net/2025/Jun/16/the-lethal-trifecta/

- authority: authoritative-guide

この投稿は広く引用されている「致命的な三要素（lethal trifecta）」フレームワーク（プライベートデータへのアクセス、信頼できないコンテンツへの露出、外部への通信能力）を提案し権威的に定義しており、間接的なプロンプトインジェクションがデータ流出につながるリスクモデルを教えるために使用されています。

引用:
> "The lethal trifecta of capabilities is: Access to your private data—one of the most common purposes of tools in the first place! Exposure to untrusted content—any mechanism by which text (or images) controlled by a malicious attacker could become available to your LLM. The ability to externally communicate in a way that could be used to steal your data."

## S20 — Strict tool use — Claude API

URL: https://platform.claude.com/docs/en/agents-and-tools/tool-use/strict-tool-use

- authority: official-docs

公式ドキュメントは、デフォルト（非 strict）モードではモデルのツール入力がスキーマに一致するというプラットフォームレベルの保証はなく――型が一致しなかったり必須フィールドが削除されたりする可能性がある――、strict: true を使用すると、プラットフォームが文法制約サンプリングを使用してツール入力が input_schema に一致することを保証し、公式の strict モードスキーマはすべて additionalProperties: false を設定していることを説明しています。

引用:
> "Setting strict: true on a tool definition guarantees Claude's tool inputs match your JSON Schema by constraining the model's token sampling to schema-valid outputs (a technique called grammar-constrained sampling). ... Without strict mode, Claude might return incompatible types ("2" instead of 2) or omit required fields, breaking your functions and causing runtime errors."

## S21 — Parallel tool use — Claude API

URL: https://platform.claude.com/docs/en/agents-and-tools/tool-use/parallel-tool-use

- authority: official-docs

公式ドキュメントは、並列ツール呼び出しの返却フォーマット（すべての tool_result ブロックが直後の 1 つのユーザーメッセージにまとめられ、それぞれ tool_use_id で紐付けられる）と disable_parallel_tool_use スイッチを指定しています。tool_choice が auto の場合、これを true に設定すると、モデルは 1 つのレスポンスにつき最大 1 つのツールを呼び出します。

引用:
> "Whichever strategy you use, return one tool_result for each tool_use block, all together in the next user message. Match each result to its call with tool_use_id, and put every tool_result block before any text content in that message."
> "When tool_choice type is auto (the default), setting disable_parallel_tool_use: true means Claude calls at most one tool per response."
