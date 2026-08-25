# 参考资料来源

本课程的所有关键事实和定义均来自以下权威资料。

## S1 — Claude Code 官方文档：Skills 扩展指南

URL: https://code.claude.com/docs/en/skills

- authority: official-docs

本课程的核心概念来源：解释了 Skills 的工作原理、SKILL.md 文件的双部分结构（YAML frontmatter + Markdown 内容）、如何触发和调用 Skills、以及 Skills 与 custom commands 的关系。

关键引用：
> "Every skill needs a SKILL.md file with two parts: YAML frontmatter between --- markers that tells Claude when to use the skill, and markdown content with the instructions Claude follows when the skill runs."

## S2 — Anthropic Platform 文档：Agent Skills 概述

URL: https://platform.claude.com/docs/en/agents-and-tools/agent-skills/overview

- authority: official-docs

详细说明了 Skills 的三层加载机制（frontmatter 用于发现、instructions 用于执行、supporting files 按需加载）、Skills 在不同平台的使用方式、以及渐进式披露（progressive disclosure）的设计原则。

关键引用：
> "Claude operates in a virtual machine with filesystem access, allowing Skills to exist as directories containing instructions, executable code, and reference materials, organized like an onboarding guide you'd create for a new team member."

## S3 — Anthropic 工程博客：Agent Skills 实战指南

URL: https://www.anthropic.com/engineering/equipping-agents-for-the-real-world-with-agent-skills

- authority: official-docs

从工程角度解释了 Skills 的设计理念：将专业知识打包成可组合的资源、像为新员工准备入职指南一样构建 Skills、以及如何通过 Skills 将通用 agent 转化为专用 agent。

关键引用：
> "Building a skill for an agent is like putting together an onboarding guide for a new hire. Instead of building fragmented, custom-designed agents for each use case, anyone can now specialize their agents with composable capabilities."

## S4 — Anthropic 帮助中心：创建自定义 Skills

URL: https://support.claude.com/en/articles/12512198-how-to-create-custom-skills

- authority: official-docs

说明了 Skill 的最小结构要求（一个包含 SKILL.md 的目录）、必需的 YAML frontmatter 字段（name 和 description）、以及 Skills 可以从简单的几行指令到包含多文件和可执行代码的复杂包。

关键引用：
> "Every skill consists of a directory containing at minimum a skill.md file, which is the core of the skill. This file must start with a YAML frontmatter to hold name and description fields, which are required metadata."

## S5 — Claude Skills 深度解析（First Principles 视角）

URL: https://leehanchung.github.io/blogs/2025/10/26/claude-skills-deep-dive/

- authority: authoritative-guide

从第一原理角度分析 SKILL.md 的结构、frontmatter 如何配置 HOW（权限、模型、元数据）、内容如何定义 WHAT（执行内容）、以及渐进式披露原则在 Skills 中的应用。

关键引用：
> "The frontmatter configures HOW the skill runs (permissions, model, metadata), while the markdown content tells Claude WHAT to do."

## S6 — 构建 Claude Skill 实战教程：YAML Frontmatter 与测试

URL: https://sjramblings.io/building-skills-for-claude-part-2/

- authority: authoritative-guide

提供了 frontmatter description 字段的编写公式（What it does + When to use it + Key capabilities）、好坏描述的对比示例、以及测试循环的最佳实践。

关键引用：
> "The description is the single most important field in your frontmatter. A bad description means your skill either never triggers or triggers on everything. The formula: What it does + When to use it + Key capabilities."

## S7 — Claude Skills 创建完整指南（PDF）

URL: https://resources.anthropic.com/hubfs/The-Complete-Guide-to-Building-Skill-for-Claude.pdf

- authority: official-docs

Anthropic 官方发布的完整指南，覆盖 Skills 在 Claude.ai、Claude Code 和 API 的一致性使用、工作流识别方法、以及 Skills 与 MCP 服务器的配合关系。

关键引用：
> "Skills work identically across Claude.ai, Claude Code, and API. Create a skill once and it works across all surfaces without modification."

## S8 — Claude Code Skills：.NET 工作流与可复用提示

URL: https://codewithmukesh.com/blog/skills-claude-code/

- authority: authoritative-guide

详细讲解了 Skills、Rules（CLAUDE.md）和 Hooks 的区别、project-level skills 的版本控制实践、subagent 委托模式、以及 5 个生产级 Skills 模式的实现。

关键引用：
> "Skills vs Rules vs Hooks: Skills for what to do (workflows), Rules for how things are (conventions), Hooks for what happens automatically (triggers)."

## S9 — 教 Claude Code 你的工作流：自定义 Skills 实操指南

URL: https://medium.com/@n913239/teach-claude-code-your-workflow-a-hands-on-guide-to-custom-skills-8bc35d4a11ed

- authority: blog

从实际使用者角度分享了 personal skills 与 project skills 的区别、bundled skills 的使用场景、以及通过 post-processing scripts 增强 Skills 输出质量的实例（如 pandoc + python-docx 处理 Word 表格边框）。

关键引用：
> "Personal Skills are for your own habits — things like code cleanup or file conversion that you use across every project. Project Skills are for project-specific workflows."

## S10 — Claude Skills 作为自文档化的 Runbook

URL: https://zackproser.com/blog/claude-skills-internal-training

- authority: blog

从团队协作角度阐述了 Skills 的独特价值：SKILL.md 既是人类可读的文档，也是 AI 可执行的规范，避免了传统 runbook 与代码实现之间的漂移问题。

关键引用：
> "The SKILL.md file that Claude reads to understand the workflow? You can read it too. It's plain English instructions alongside the actual implementation code. The documentation is the executable specification - they can't drift apart because they're the same thing."
