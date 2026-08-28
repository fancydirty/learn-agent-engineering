# 参考ソース

このコースの重要な事実と定義は、すべて以下の一次資料に基づいています。引用は英語の原文をそのまま掲載しています。

## S1 — Claude Code 公式ドキュメント: Extend Claude Code with skills

URL: https://code.claude.com/docs/en/skills

- authority: official-docs

このコースの中核概念の出典。Skill の仕組み、SKILL.md ファイルの二部構成（YAML frontmatter + Markdown 本文）、Skill がどうトリガーされ呼び出されるか、そして Skill と custom commands の関係を説明しています。

引用:
> "Every skill needs a SKILL.md file with two parts: YAML frontmatter between --- markers that tells Claude when to use the skill, and markdown content with the instructions Claude follows when the skill runs."

## S2 — Anthropic プラットフォームドキュメント: Agent Skills overview

URL: https://platform.claude.com/docs/en/agents-and-tools/agent-skills/overview

- authority: official-docs

Skill の三段階の読み込みの仕組み（発見のための frontmatter、実行のための instructions、必要に応じて読まれる supporting files）、各サーフェスでの Skill の使い方、そして progressive disclosure の設計原則を詳述しています。

引用:
> "Claude operates in a virtual machine with filesystem access, allowing Skills to exist as directories containing instructions, executable code, and reference materials, organized like an onboarding guide you'd create for a new team member."

## S3 — Anthropic エンジニアリングブログ: Equipping agents for the real world with Agent Skills

URL: https://www.anthropic.com/engineering/equipping-agents-for-the-real-world-with-agent-skills

- authority: official-docs

Skill の設計思想をエンジニアリングの観点から説明しています。専門知識を組み合わせ可能なリソースにパッケージ化すること、新しいメンバーの受け入れガイドを作るように Skill を組み立てること、そして Skill を通じて汎用エージェントを専用エージェントに変えること。

引用:
> "Building a skill for an agent is like putting together an onboarding guide for a new hire. Instead of building fragmented, custom-designed agents for each use case, anyone can now specialize their agents with composable capabilities."

## S4 — Anthropic ヘルプセンター: How to create custom skills

URL: https://support.claude.com/en/articles/12512198-how-to-create-custom-skills

- authority: official-docs

Skill に必要な最小構成（SKILL.md を含むディレクトリ）、必須の YAML frontmatter フィールド（name と description）、そして数行の指示から複数ファイルと実行可能コードを含む複雑なパッケージまでの幅を説明しています。

引用:
> "Every skill consists of a directory containing at minimum a skill.md file, which is the core of the skill. This file must start with a YAML frontmatter to hold name and description fields, which are required metadata."

## S5 — Claude Skills 徹底解説（第一原理の視点）

URL: https://leehanchung.github.io/blogs/2025/10/26/claude-skills-deep-dive/

- authority: authoritative-guide

SKILL.md の構造を第一原理から分析しています。frontmatter が HOW（権限・モデル・メタデータ）をどう設定するか、本文が実行内容 WHAT をどう定義するか、そして progressive disclosure が Skill にどう適用されるか。

引用:
> "The frontmatter configures HOW the skill runs (permissions, model, metadata), while the markdown content tells Claude WHAT to do."

## S6 — Building skills for Claude, ハンズオン: YAML frontmatter とテスト

URL: https://sjramblings.io/building-skills-for-claude-part-2/

- authority: authoritative-guide

frontmatter の description フィールドを書くための公式（What it does + When to use it + Key capabilities）、良い例と悪い例の対比、そしてテストループのベストプラクティスを示しています。

引用:
> "The description is the single most important field in your frontmatter. A bad description means your skill either never triggers or triggers on everything. The formula: What it does + When to use it + Key capabilities."

## S7 — The complete guide to building skills for Claude（PDF）

URL: https://resources.anthropic.com/hubfs/The-Complete-Guide-to-Building-Skill-for-Claude.pdf

- authority: official-docs

Anthropic 公式の完全ガイド。Claude.ai・Claude Code・API をまたいだ一貫した Skill の使い方、自動化に値するワークフローの見極め方、そして Skill と MCP サーバーの連携を扱っています。

引用:
> "Skills work identically across Claude.ai, Claude Code, and API. Create a skill once and it works across all surfaces without modification."

## S8 — Claude Code skills: .NET ワークフローと再利用可能なプロンプト

URL: https://codewithmukesh.com/blog/skills-claude-code/

- authority: authoritative-guide

Skills・Rules（CLAUDE.md）・Hooks の違い、project-level skills のバージョン管理の実践、subagent への委譲パターン、そして 5 つの本番レベルの Skill パターンの実装を解説しています。

引用:
> "Skills vs Rules vs Hooks: Skills for what to do (workflows), Rules for how things are (conventions), Hooks for what happens automatically (triggers)."

## S9 — Teach Claude Code your workflow: カスタム Skills 実践ガイド

URL: https://medium.com/@n913239/teach-claude-code-your-workflow-a-hands-on-guide-to-custom-skills-8bc35d4a11ed

- authority: blog

実践者の視点から、personal skills と project skills の違い、bundled skills が役立つ場面、そして後処理スクリプトで Skill の出力品質を高める例（Word の表の罫線を扱う pandoc + python-docx）を共有しています。

引用:
> "Personal Skills are for your own habits — things like code cleanup or file conversion that you use across every project. Project Skills are for project-specific workflows."

## S10 — 自己文書化された Runbook としての Claude skills

URL: https://zackproser.com/blog/claude-skills-internal-training

- authority: blog

チーム協働の観点から Skill の独自の価値を述べています。SKILL.md は人間が読めるドキュメントであると同時に AI が実行できる仕様でもあり、従来の runbook とそれを実装するコードとの間に生じるドリフトをなくします。

引用:
> "The SKILL.md file that Claude reads to understand the workflow? You can read it too. It's plain English instructions alongside the actual implementation code. The documentation is the executable specification - they can't drift apart because they're the same thing."
