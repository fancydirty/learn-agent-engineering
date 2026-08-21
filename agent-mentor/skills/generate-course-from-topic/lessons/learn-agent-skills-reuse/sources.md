# Sources

<!-- registry: A8 -->

## S1 — Anthropic: Equipping agents for the real world with Agent Skills
URL: https://www.anthropic.com/engineering/equipping-agents-for-the-real-world-with-agent-skills
- authority: official-docs
- supports: 支撑 Skill 是包含 SKILL.md、指令、脚本和资源的目录，以及渐进披露、评测和安全审计原则。
- key-fact: “A skill is a directory containing a SKILL.md file that contains organized folders of instructions, scripts, and resources.”

## S2 — Agent Skills: Specification
URL: https://agentskills.io/specification
- authority: official-docs
- supports: 支撑 frontmatter 字段、命名限制、description 触发信息和可选目录的格式约束。
- key-fact: “The SKILL.md file must contain YAML frontmatter followed by Markdown content.”

## S3 — Anthropic: Agent Skills overview
URL: https://platform.claude.com/docs/en/agents-and-tools/agent-skills/overview
- authority: official-docs
- supports: 支撑 Skill 在 Claude 产品中的加载方式、渐进披露和安全边界。
- key-fact: “Skills use progressive disclosure to manage context efficiently.”

## S4 — OpenAI: Build skills
URL: https://learn.chatgpt.com/docs/build-skills
- authority: official-docs
- supports: 支撑 Agent Skills 作为 ChatGPT、Codex 和开放标准中的可复用工作流格式，以及隐式/显式触发和仓库发现范围。
- key-fact: “Use agent skills to extend ChatGPT and Codex with task-specific capabilities.”

## S5 — Anthropic: Building effective agents
URL: https://www.anthropic.com/engineering/building-effective-agents
- authority: official-docs
- supports: 支撑先从最简单的可组合方案开始，并区分工作流与需要自主决策的 Agent。
- key-fact: “We recommend finding the simplest solution possible, and only increasing complexity when needed.”

## S6 — Agent Skills: skills-ref reference library
URL: https://github.com/agentskills/agentskills/tree/main/skills-ref
- authority: official-docs
- supports: 支撑 `skills-ref validate path/to/skill` 的真实安装前提和命令格式；该仓库同时声明该库只用于演示，不应被当作生产保证。
- key-fact: “skills-ref validate path/to/skill”

## S7 — Anthropic: Agent Skills best practices
URL: https://platform.claude.com/docs/en/agents-and-tools/agent-skills/best-practices
- authority: official-docs
- supports: 交叉支撑 frontmatter 字段限制、渐进披露、代表性测试、文件分层和脚本边界。
- key-fact: “At startup, only the metadata (name and description) from all Skills is pre-loaded.”
