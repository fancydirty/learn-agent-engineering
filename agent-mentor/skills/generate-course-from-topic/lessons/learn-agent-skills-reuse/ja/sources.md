# Sources

<!-- registry: A8 -->

## S1 — Anthropic: Equipping agents for the real world with Agent Skills
URL: https://www.anthropic.com/engineering/equipping-agents-for-the-real-world-with-agent-skills
- authority: official-docs
- supports: Skill が SKILL.md、インストラクション、スクリプト、リソースを含むディレクトリであること、およびプログレッシブ・ディスクロージャー、評価、セキュリティ監査の原則を裏付けます。
- key-fact: “A skill is a directory containing a SKILL.md file that contains organized folders of instructions, scripts, and resources.”

## S2 — Agent Skills: Specification
URL: https://agentskills.io/specification
- authority: official-docs
- supports: frontmatter のフィールド、命名の制限、description に書くトリガー情報、オプションのディレクトリについての形式上の制約を裏付けます。
- key-fact: “The SKILL.md file must contain YAML frontmatter followed by Markdown content.”

## S3 — Anthropic: Agent Skills overview
URL: https://platform.claude.com/docs/en/agents-and-tools/agent-skills/overview
- authority: official-docs
- supports: Claude 製品で Skill が読み込まれる仕組み、プログレッシブ・ディスクロージャー、セキュリティ境界を裏付けます。
- key-fact: “Skills use progressive disclosure to manage context efficiently.”

## S4 — OpenAI: Build skills
URL: https://learn.chatgpt.com/docs/build-skills
- authority: official-docs
- supports: Agent Skills が ChatGPT、Codex、および公開標準における再利用可能なワークフロー形式であること、ならびに暗黙的・明示的なトリガーとリポジトリの発見範囲を裏付けます。
- key-fact: “Use agent skills to extend ChatGPT and Codex with task-specific capabilities.”

## S5 — Anthropic: Building effective agents
URL: https://www.anthropic.com/engineering/building-effective-agents
- authority: official-docs
- supports: 最もシンプルで組み合わせ可能な方法から始めること、およびワークフローと自律的な判断を要する Agent を区別する観点を裏付けます。
- key-fact: “We recommend finding the simplest solution possible, and only increasing complexity when needed.”

## S6 — Agent Skills: skills-ref reference library
URL: https://github.com/agentskills/agentskills/tree/main/skills-ref
- authority: official-docs
- supports: `skills-ref validate path/to/skill` の実際のインストール前提とコマンド形式を裏付けます。同じリポジトリは、このライブラリがデモ用途に限られ、本番環境での保証として扱ってはならないと明記しています。
- key-fact: “skills-ref validate path/to/skill”

## S7 — Anthropic: Agent Skills best practices
URL: https://platform.claude.com/docs/en/agents-and-tools/agent-skills/best-practices
- authority: official-docs
- supports: frontmatter フィールドの制限、プログレッシブ・ディスクロージャー、代表的なテスト、ファイルのレイヤー化、スクリプトの境界を横断的に裏付けます。
- key-fact: “At startup, only the metadata (name and description) from all Skills is pre-loaded.”
