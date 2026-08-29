# 参考ソース

このコースの重要な事実と定義は、すべて以下の一次資料に基づいています。引用は英語の原文をそのまま掲載しています。

## S1 — Claude Code 公式ドキュメント: Workflows

URL: https://code.claude.com/docs/en/workflows

- authority: official-docs

Claude Code の公式ワークフローページ。スクリプトから複数のサブエージェントを駆動する動的ワークフローの形について説明しています。大規模コードベースの監査、広範な移行、クロスチェック型の調査に適した構造です。

引用:
> "Reach for a workflow when a task needs more agents than one conversation can coordinate, or when you want the orchestration codified as a script you can read and rerun."

## S2 — Alex Op: Claude Code Workflows and Deterministic Orchestration

URL: https://alexop.dev/posts/claude-code-workflows-deterministic-orchestration/

- authority: authoritative-guide

決定論的オーケストレーションパターンの詳細な解説。スクリプトがループと分岐を所有し、各 `agent()` 呼び出しが新しいサブエージェントに作業を委譲し、作業自体だけがモデル駆動である仕組みを説明しています。

引用:
> "A normal agent decides the control flow as it goes. A workflow inverts that. You write the control flow as plain code, and each individual step is delegated to a fresh subagent."

## S3 — ClaudeWorld: What Is a Workflow? Multi-Agent Orchestration Explained

URL: https://claude-world.com/articles/what-is-a-workflow-multi-agent-orchestration/

- authority: authoritative-guide

Claude Code が単一エージェントからサブエージェントのファンアウト、そしてスクリプト駆動ワークフローへと進化した経緯をたどり、4 つのステージとオーケストレーションの中核概念を示しています。

引用:
> "Orchestration is exactly what it sounds like: one score, many musicians. A script deciding it — for loop, if statement — is orchestration."

## S4 — MindStudio: Five Claude Code Agentic Workflow Patterns

URL: https://www.mindstudio.ai/blog/claude-code-agentic-workflow-patterns

- authority: authoritative-guide

5 つのワークフローパターン（sequential, operator, split-and-merge, agent teams, headless）を解説し、それぞれがどのタスク複雑度に適しているかを示しています。

引用:
> "Understanding the five core Claude workflow patterns — sequential, operator, split-and-merge, agent teams, and headless — determines how much you can actually get done."

## S5 — Mae Capozzi: Building a Multi-Agent Orchestrator

URL: https://maecapozzi.com/blog/building-a-multi-agent-orchestrator

- authority: blog

専門化されたコーディングエージェント用の 6 フェーズオーケストレーターを構築した現場報告。分散トレーシング、フェーズベースのオーケストレーション、プロセス分離を使用しています。

引用:
> "Phase-based orchestration: Break work into discrete phases (planning, implementation, testing, review) rather than letting agents free-roam."

## S6 — AWS Marketplace: Agent Orchestration

URL: https://aws.amazon.com/marketplace/build-learn/ai-agent-learning-series/agent-orchestration

- authority: official-docs

AWS による、Step Functions、Bedrock Agents、MWAA を使ったマルチエージェントオーケストレーションの公式ガイド。コントロールプレーン、状態管理、人間による承認ステップをカバーしています。

引用:
> "An orchestrated workflow needs configurable retry policies with exponential backoff and jitter so that transient errors don't permanently fail long-running workflows."

## S7 — Vasanthan: Handling Failures in Agent-Based Workflows

URL: https://medium.com/@vasanthancomrads/handling-failures-in-agent-based-workflows-c0fd9489b2ee

- authority: blog

エージェントワークフローにおける実践的な障害処理の解説。リトライ、フォールバック、検証、サーキットブレーカーなど、本番環境で機能する必要があるシステムを対象としています。

引用:
> "User Input → Agent → Tool Call → Retry → Circuit Breaker → Validation → Fallback (if needed) → Confidence Check → Human-in-loop (optional) → Final Output"

## S8 — Augment Code: How Async AI Agent Workflows Survive Failure

URL: https://www.augmentcode.com/guides/async-ai-agent-workflows

- authority: authoritative-guide

本番システムで使われる復旧シーケンス。一時的エラーに対する指数バックオフとジッター、プロバイダ切り替え、補償アクション、そして AWS Step Functions のエラー処理設定を解説しています。

引用:
> "Retry with exponential backoff and jitter for transient errors (5xx, network timeouts). AWS Step Functions provides error handling with configurable backoff and jitter for retries."

## S9 — Agents Arcade: Error Handling in Agentic Systems

URL: https://agentsarcade.com/blog/error-handling-agentic-systems-retries-rollbacks-graceful-failure

- authority: blog

リトライに関する重要な境界線を引いています。ステートレスなモデル呼び出しの再実行は安価ですが、データベースへの書き込みやメール送信を行うツール呼び出しの再実行は全く別の話です。

引用:
> "Retrying a stateless model call is usually fine. Retrying a tool invocation that writes to a database, sends an email, or triggers a downstream workflow is often a bug disguised as resilience."

## S10 — Temporal: 11 Production Failure Patterns in AI Agent Orchestration

URL: https://www.xgrid.co/resources/temporal-ai-agent-orchestration-failure-patterns/

- authority: authoritative-guide

Temporal 上で AI エージェントをデプロイする際に見られる 11 の障害パターン。LLM オーケストレーション、リトライ、キャンセル、負荷、ヒューマン・イン・ザ・ループのステップに対する分析と修正策を示しています。

引用:
> "LLM activity retry policies should be defined per error class, not as a single catch-all policy on the activity registration."

## S11 — MindStudio: Workflow State vs. Session State

URL: https://www.mindstudio.ai/blog/workflow-state-vs-session-state-ai-agents

- authority: authoritative-guide

2 種類の状態を区別しています。セッション状態は現在の会話の一時的なコンテキストであり、ワークフロー状態はそれを超えて存続するタスク履歴です。後者をモデル化するには状態機械が最も明確な方法であると論じています。

引用:
> "Claude Code uses a file called CLAUDE.md in projects as a form of persistent workflow context — a place to store project-specific instructions, conventions, and state that survives across sessions."

## S12 — MachineLearningMastery: 5 Architectural Patterns for Persistent Memory and State in AI Agents

URL: https://machinelearningmastery.com/5-architectural-patterns-for-persistent-memory-and-state-in-ai-agents/

- authority: authoritative-guide

状態とメモリの区別を示しています。状態は現在のタスクのスナップショットであり、メモリは過去のタスクから学んだことです。チェックポイントがワークフロー状態を保存し、実行を再開可能にする仕組みを解説しています。

引用:
> "State is a snapshot. It's everything the agent currently knows about a task right now: what step it's on, what the last tool call returned, what variables it's tracking."

## S13 — Appamass: State Management Patterns for Reliable AI Agent Workflows

URL: https://appamass.com/en/blog/state-management-patterns-for-reliable-ai-agent-workflows-5yemlru6ui6cacast3l5

- authority: blog

モデルのネイティブなコンテキストウィンドウの外で状態を保持する方法。現在の状況をプレーンなオブジェクトとして表現することで、構造化され、クエリ可能な状態を維持し、復旧のために永続化します。

引用:
> "Using Plain Old Java Objects (POJOs) or similar structures to represent the 'current situation' allows for a structured, queryable state."

## S14 — Ranjan Kumar: Building Agents That Remember

URL: https://ranjankumar.in/building-agents-that-remember-state-management-in-multi-agent-ai-systems

- authority: blog

タスクメモリツリーを導入しています。各ノードがアクション、入力、出力、ステータスを持つ 1 つのステップを表す階層構造で、非線形の推論をサポートし、ワークフローを管理します。

引用:
> "Store this state externally (Redis, Postgres, etc.) and load it at the start of each agent turn. If the agent crashes, you can resume exactly where it left off."

## S15 — Chrono Innovation: Architecture for Scalable Agentic AI Workflows

URL: https://www.chronoinnovation.com/resources/agentic-ai-workflows-architecture/

- authority: authoritative-guide

コンテキスト組み立てをそれ自体が設計上の決定事項として扱うことを主張しています。名前付きフィールドを持つ構造化された状態オブジェクトを、次のステップが必要とするときに取得する方式であり、単に積み上がるコンテキストではありません。

引用:
> "Treat context assembly as a first-class operation in your workflow design. One pattern that works well: structured state objects with explicit fields rather than free-form context accumulation."

## S16 — ApX Machine Learning: Task Decomposition Strategies for LLM Agents

URL: https://apxml.com/courses/agentic-llm-memory-architectures/chapter-4-complex-planning-tool-integration/task-decomposition-strategies

- authority: authoritative-guide

分解の基本アプローチ。ゼロショットプロンプト、few-shot の例、または chain-of-thought を通じてモデル自身に分解を行わせ、高レベルの目標をステップの列に変換します。

引用:
> "The most direct approach uses the LLM itself to perform the decomposition. This typically involves prompting the LLM with the high-level goal and asking it to generate a sequence of steps or sub-tasks."

## S17 — ACONIC paper: Systematic LLM Task Decomposition

URL: https://arxiv.org/html/2510.07772v1

- authority: research

ACONIC を提示しています。タスクを制約問題としてモデル化し、形式的な複雑性尺度を使って分割方法を導きます。組合せ問題やデータベースクエリタスクで 10〜40 パーセントポイントの価値があります。

引用:
> "A principled measure of task complexity would enable systematic decomposition strategies and the ability to study tasks of comparable difficulty, and provide guidance on when tools are needed."

## S18 — OneUpTime: How to Create a Task Decomposition

URL: https://oneuptime.com/blog/post/2026-01-30-task-decomposition/view

- authority: blog

3 つの分解戦略。単純な逐次分解、独立した部分に対する並列実行、そして現実のあらゆるものに対するハイブリッドアプローチ。アトミックなサブタスクから構築し、依存関係を明示的に述べます。

引用:
> "Start with simple sequential decomposition, add parallelism where tasks are independent, and use hybrid approaches for real-world complexity."

## S19 — AI21: What Is Task Decomposition?

URL: https://www.ai21.com/glossary/foundational-llm/task-decomposition/

- authority: official-docs

階層的計画とプロンプトチェーニングが、タスクを順序付けられたレイヤーや並列モジュールに分解する方法。エージェントが幻覚や無駄な推論を減らし、サブタスクを効率的に計画・実行・振り返ることを可能にします。

引用:
> "Hierarchical planning and prompt chaining decompose tasks into ordered layers or parallel modules, enabling LLM agents to plan, execute, and reflect on subtasks efficiently."

## S20 — ClaudFlow: 7 Patterns for Claude Code Workflow Automation

URL: https://claudflow.com/guides/claude-code-workflow-automation.html

- authority: authoritative-guide

日常業務のための 7 つのパターン。コードレビュー、リファクタリング、テスト生成、ドキュメント作成、バグ診断、移行、セキュリティ監査など、手動プロセスを再現可能なものに変えます。

引用:
> "Claude code workflow automation transforms development tasks from inconsistent manual processes into reliable, repeatable pipelines."

## S21 — Kinde: Multi-Agent Workflows for Complex Refactoring

URL: https://www.kinde.com/learn/ai-for-software-engineering/ai-agents/multi-agent-workflows-for-complex-refactoring-orchestrating-ai-teams/

- authority: authoritative-guide

大規模リファクタリングにわたって複数のエージェントを調整する方法。アーキテクチャ分析用、コード移行用、テスト検証用など、それぞれのエージェントを配置し、Autogen と CrewAI での実例を示しています。

引用:
> "Learn to coordinate multiple AI agents for large-scale refactoring projects—one for architecture analysis, another for code migration, and a third for test validation."

## S22 — RefAgent paper: A Multi-Agent LLM Framework for Automated Software Refactoring

URL: https://arxiv.org/html/2511.03153v1

- authority: research

RefAgent は人間のリファクタリングが辿る順序を反映し、作業をエージェント間で分割します。計画、変換、検証、そして推論と協調を通じた反復的な修正というワークフローです。

引用:
> "RefAgent orchestrates an end-to-end workflow that includes planning, transformation, validation, and iterative correction through reasoning and collaboration."
