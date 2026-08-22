---
domain: Agent Engineering
tags: [Agent Skills, workflow, beginner, Claude Code, Codex]
lang: zh
---
# Agent Skills：工作流复用入门

这门课教会已经在使用 Claude Code、Codex 或同类 Agent 的创作者与独立开发者，把一次性提示词整理成一个可被 Agent 发现、按需加载、能够复测的 Skill。课程围绕公开的 Agent Skills 文件规范展开；不讲模型训练、MCP 服务端实现、插件分发平台或具体业务领域的完整方法论。

**完成课程后，你能够：**
- 区分一次性提示词、Skill 与外部工具的职责边界。
- 写出符合规范且容易被触发的 `SKILL.md` 元数据。
- 用 `references/`、`assets/` 和 `scripts/` 分层放置资料与确定性操作。
- 为 Skill 设计触发、边界和输出质量测试，并记录失败。
- 在自己的工作流上完成一个可安装、可复测的 Skill 文件夹。

**前置条件：** 会使用一种 coding agent，能创建目录和编辑 Markdown 文件；不要求会写 Python、JavaScript 或调用 API。

**练习环境：** 使用自己的 IDE、终端和 Agent。课程不提供嵌入式执行环境，也不要求上传私人文件。

## 课程

| # | 主题 | 你将学会 |
|---|---|---|
| 01 | [一次性提示词与可复用 Skill](./01-prompt-to-skill.md) | 判断什么工作值得封装，以及 Skill 的边界。 |
| 02 | [SKILL.md 元数据与触发描述](./02-skill-metadata.md) | 写出规范的名称、描述和最小指令入口。 |
| 03 | [渐进披露与资源分层](./03-progressive-disclosure.md) | 把长资料拆成 Agent 按需读取的层级。 |
| 04 | [资源、脚本与执行边界](./04-resources-and-boundaries.md) | 决定什么交给模型、什么交给确定性脚本。 |
| 05 | [触发测试与安全审计](./05-testing-and-safety.md) | 用代表性任务测试误触发、漏触发和越界风险。 |
| 06 | [从工作流到可交付 Skill](./06-ship-a-skill.md) | 在真实工作流中完成一次构建、审计和交接。 |

> 来源与版本边界见 [sources.md](./sources.md)。
