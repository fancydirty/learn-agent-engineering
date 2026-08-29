# 参考ソース

このコースの重要な主張は、以下のソースに基づいています。レッスンでは `[^Sn]` で引用し、該当する抜粋を各エントリの下に掲載しています。引用は英語の原文をそのまま掲載しています。

## S1 — Building Effective AI Agents — Anthropic Engineering

URL: https://www.anthropic.com/engineering/building-effective-agents

- authority: authoritative-guide

エージェントとは何か、エージェントとワークフローはどう違うか、どうすれば制御を保てるかを扱う Anthropic Engineering の権威ある記事です。「ループの中でツールを使う」というエージェントの定義、停止条件、チェックポイント、そして自律性がもたらすコストと誤りの累積を示しています。本コースのループと制御というテーマの中核的な根拠です。

引用:
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

stop_reason に駆動されるマルチターンループの標準仕様を示しています。モデル自身は何も実行せず、構造化されたリクエストを発行するだけです。ホストがツールを実行し、結果が会話に戻り、stop_reason がまだ tool_use である限りループが繰り返されます。「コアループ」のレッスンの直接的な根拠です。

引用:
> "The model never executes anything on its own. It emits a structured request, your code (or Anthropic's servers) runs the operation, and the result flows back into the conversation. ... 2. Claude responds with stop_reason: "tool_use" and one or more tool_use blocks. 3. Execute each tool. Format the outputs as tool_result blocks. 4. Send a new request... 5. Repeat from step 2 while stop_reason is "tool_use"."

## S3 — Effective context engineering for AI agents — Anthropic Engineering

URL: https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents

- authority: authoritative-guide

ループの中で動くエージェントはコンテキストを蓄積し続ける一方で、モデルの「アテンション予算」は有限であり、コンテキストが増えるほどリコールが低下することを説明しています。だからこそループには制約が必要で、コンテキストを統治しなければなりません。「なぜループに境界が必要なのか」の根拠です。

引用:
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

過剰なエージェンシー（excessive agency）のリスクを定義し、緩和策を明示しています。影響の大きいアクションには human-in-the-loop の承認を要求する、というものです。「介入と軌道修正」のレッスンで、不可逆な操作の手前に人間のチェックポイントを置く根拠となります。

引用:
> "Excessive Agency is the vulnerability that enables damaging actions to be performed in response to unexpected, ambiguous, or manipulated outputs from an LLM, regardless of what is causing the LLM to malfunction. ... Utilise human-in-the-loop control to require a human to approve high-impact actions before they are taken. This may be implemented in a downstream system (outside the scope of the LLM application) or within the LLM extension itself."

## S5 — The 2026 Agent Engineering Roadmap — GitHub (codejunkie99/agent-roadmap-2026)

URL: https://github.com/codejunkie99/agent-roadmap-2026

- authority: blog

ハーネスエンジニアリングを軸に構成されたオープンソースのロードマップです。同じモデルでもハーネスが違えば結果はまったく変わる、という中心命題を掲げ、ハーネスをループ制御、ツールディスパッチ、コンテキスト管理などの構成要素に分解しています。ハーネスが信頼性を決めるという枠組みの主張を支えるために使用します。注意: このソースは AI 支援で書かれたコミュニティのロードマップです。ベンチマークスコアや給与額などの具体的な数値は事実として引用せず、枠組みの主張のみを利用しています。

引用:
> "Same model, different harness, completely different result."
> "An agent makes its own control-flow decisions inside a loop."
> "the harness is the union of:"
> "loop control. The while-loop driving model→tools→model."
> "tool dispatch. Registry, schema validation, parallel calls, error recovery, retries."

## S6 — Handle tool calls — Claude API

URL: https://platform.claude.com/docs/en/agents-and-tools/tool-use/handle-tool-calls

- authority: official-docs

tool_use および tool_result コンテンツブロックの正確なフィールド仕様と、並列呼び出しではすべての tool_result ブロックをまとめて返すというルールを示しています。レッスン6 で、手書きループのリクエストとレスポンスを正確に組み立てるために使用します。

引用:
> "id: A unique identifier for this particular tool use block. ... name: The name of the tool being used. input: An object containing the input being passed to the tool, conforming to the tool's input_schema. ... tool_use_id: The id of the tool use request this is a result for. ... is_error (optional): Set to true if the tool execution resulted in an error."
> "Whichever strategy you use, return one tool_result for each tool_use block, all together in the next user message. Match each result to its call with tool_use_id, and put every tool_result block before any text content in that message."
