---
domain: Agent Engineering
tags: [Agent, harness, coding agent, evaluation, beginner]
lang: zh
---
# Agent Harness Engineering：可靠执行实战

这门课面向已经会在本地仓库中使用 Claude Code、Codex 或同类 coding agent，却经常遇到“说做完了但证据不足”的开发者。课程只覆盖仓库级 Agent harness：如何提供可读上下文、保存跨会话状态、约束任务范围并建立验证闭环；不讲模型训练、Agent SDK 开发或多 Agent 编排平台。

**完成课程后，你能够：**
- 根据失败证据区分模型能力问题与 harness 问题。
- 把仓库改造成 Agent 能逐层读取的记录系统。
- 用初始化、任务状态和交接工件保持跨会话连续性。
- 把“完成”改写为可运行、可复查的验收条件。
- 在真实仓库中组装并验证一个最小可用 harness。

**前置条件：** 会打开本地仓库、编辑文本文件，并允许 coding agent 运行普通项目命令；不要求开发过 Agent 框架。

**练习环境：** 使用你自己的 IDE、终端和仓库。本课程不提供嵌入式运行环境，也不要求上传代码。

## 课程

| # | 主题 | 你将学会 |
|---|---|---|
| 01 | [Agent 失败诊断](./01-agent-failure-diagnosis.md) | 用可观察证据定位任务环境缺口，而不是先换模型。 |
| 02 | [Agent 可读仓库](./02-agent-readable-repository.md) | 建立记录系统、渐进披露和可执行边界。 |
| 03 | [跨会话连续性](./03-cross-session-continuity.md) | 让新会话从稳定工件恢复工作状态。 |
| 04 | [可检查的完成标准](./04-machine-checkable-done.md) | 设计任务、grader、outcome 与验证证据。 |
| 05 | [最小 Harness 闭环](./05-minimal-harness-loop.md) | 在真实仓库组装启动、执行、验证与交接闭环。 |

> 资料与版本边界见 [sources.md](./sources.md)。
