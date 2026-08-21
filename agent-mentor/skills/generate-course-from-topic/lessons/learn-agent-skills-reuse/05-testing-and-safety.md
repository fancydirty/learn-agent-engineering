# 第 5 讲：触发测试与安全审计

> 本讲目标：
> - 设计“应该触发”和“不应该触发”的代表性测试。
> - 把触发结果、输出质量和边界遵守写成可观察标准。
> - 审计 Skill 文件夹中的资料、脚本、网络、密钥和写入边界。
>
> 前置条件：已经有一份 `SKILL.md` 草稿和资源边界说明 | 上一讲 [<< 04](./04-resources-and-boundaries.md) | 下一讲 [06 >>](./06-ship-a-skill.md)

## 看起来会用，不等于会稳

触发矩阵写好之后，仍有一个前置问题：目标客户端到底看得到这份 Skill 吗？如果客户端没有安装它，或者技能列表里根本没有它，后面的“没触发”就不能归因于 `description`。

先按目标客户端当前文档把 Skill 安装到它会扫描的位置。用技能列表或一次显式调用确认它可见，再开一个新会话测试隐式触发。客户端不暴露调用记录时，输出看起来符合说明，不能单独证明 Skill 真的被触发。

确认基线成立后，再问三个问题：它会不会在该用时没用？会不会在不该用时抢任务？会不会因为说明太模糊而读错文件、泄露资料或写坏用户文件？本讲用一张矩阵记录这些边界。

## 解释

### 代表性测试从边界开始

支持隐式触发的客户端会用 `description` 判断任务是否匹配 Skill；OpenAI 和 Anthropic 的当前指南都把这个字段放在发现阶段。[^S4][^S7] 完成安装和可见性确认后，测试才应围绕 `description` 写，再对照完整说明检查触发后的执行边界。

一个最小测试集包含三类：

- 应该触发：用户请求正好落在 Skill 的核心任务上。
- 应该触发：用户没有说出 Skill 名称，但用了相邻关键词或同义表达。
- 不应该触发：用户请求靠近这个领域，但动作已经越过“不处理”边界。

如果只测试第一类，你只能证明 Skill 会响应最理想的提示。真正的问题往往藏在第二类和第三类。

### 可观察标准要看得到

触发测试不能只写“效果好”。你要先定义可观察结果：Agent 是否明确使用了 Skill、是否读取了正确资源、输出是否符合格式、是否拒绝或移交越界动作。Anthropic 建议从代表性任务开始评估 Skill，并观察 Agent 在真实场景中如何使用它。[^S1]

对发布说明 Skill，下面这种标准可以直接检查：

```text
触发信号：Agent 提到或明显遵守 release-notes Skill 的 Instructions。
资源信号：需要风格规则时读取 references/release-style.md。
输出信号：Markdown 按 Added / Fixed / Known issues 分组。
边界信号：不创建 Git tag，不修改源代码，不执行发布。
```

这些标准都能从对话 transcript、文件改动或最终输出中看到。看不到的标准，例如“语气专业”“理解业务”，要拆成更小的可见规则。

### 测试矩阵把触发、输出和边界放在一处

测试矩阵是一个小表格：每行是一条用户请求，每列记录预期触发、输入、应读资源、输出标准和禁止动作。它让你一次看见“触发”和“安全”是否互相矛盾。

以 `release-notes` 为例：

| 用例 | 用户请求 | 预期 | 应读资源 | 输出标准 | 禁止动作 |
|---|---|---|---|---|---|
| T1 核心触发 | “根据这些 PR 摘要写本周发布说明。” | 触发 | `references/release-style.md` | Markdown 分组，面向用户 | 不改代码 |
| T2 同义触发 | “把这段 changelog 草稿改成用户能看懂的 release notes。” | 触发 | `references/release-style.md` | 保留事实，改写语言 | 不编造变更 |
| T3 边界拦截 | “帮我打 tag、发布版本，再写公告。” | 不由此 Skill 接管完整任务 | 可不读资源 | 只说明可写公告部分 | 不执行 tag 或发布 |
| T4 数据安全 | “把客户名单也放进发布说明做案例。” | 触发后应要求脱敏或拒绝纳入敏感资料 | `references/release-style.md` | 不暴露个人资料 | 不复制敏感名单 |

矩阵的作用是暴露 `description`、正文和资源边界之间的不一致。

```agentmentor-check
{
  "id": "agent-skills-reuse-trigger-negative-case",
  "label": "补上边界用例",
  "prompt": "你为 release-notes Skill 写了两条测试：“根据 PR 写发布说明”和“把 changelog 改成发布说明”。还缺哪类测试？",
  "whyHere": "学习者常只测会触发的成功路径，漏掉最能暴露 description 过宽的相邻任务。",
  "copyPurpose": "让 Agent 检查我的触发测试是否缺少不该触发的边界用例。",
  "mode": "single",
  "choices": [
    {
      "id": "more-positive",
      "text": "再写一条“根据 commit 写发布说明”，增加一个同类成功请求",
      "correct": false,
      "feedback": "它仍然只覆盖应该触发的路径，不能发现 Skill 是否会接管发布、部署或修改代码这类相邻任务。"
    },
    {
      "id": "negative-boundary",
      "text": "加入“帮我打 tag 并发布版本”的请求，检查 Skill 是否拒绝越界动作",
      "correct": true,
      "feedback": "这条靠近 release 领域，但动作越过写发布说明的边界。description 应排除纯发布操作；正文则负责 Skill 已加载后的禁止动作。"
    }
  ]
}
```

### 安全审计要覆盖整个文件夹

Skill 是一个文件夹，范围超过 `SKILL.md`；它可以包含说明、脚本和资源。Anthropic 的安全建议是把 Skill 当作软件安装来审计，尤其检查脚本、资源和外部网络连接。[^S1][^S3] 这意味着安全审计必须看所有打包文件，入口文件只是一部分。

把审计分成五个边界：

- 文件边界：Skill 会读哪些路径？会不会要求 Agent 扫描整个主目录？
- 写入边界：Skill 会不会修改、删除或覆盖用户原始文件？
- 密钥边界：Skill 是否要求把 API key、token 或客户资料写进源码、模板或输出？
- 网络边界：Skill 是否要求访问外部 URL、下载资源或发送数据？
- 脚本边界：脚本是否自包含、说明依赖、处理边缘情况，并且错误信息可读？规范建议脚本自包含并清楚记录依赖。[^S2]

如果 Skill 不需要脚本或网络，也要写清楚“本 Skill 不需要网络访问；不读取密钥；不写入原始输入”。空白不会形成边界，明确写下才会。

## 完整示例：给发布说明 Skill 做测试与审计

假设你已经有这个 `SKILL.md` 片段：

```markdown
---
name: release-notes
description: Turns commits, PR summaries, or changelog drafts into user-facing Markdown release notes grouped by features, fixes, and known issues. Use when the user asks to write release notes, summarize a release, or turn change history into a changelog.
---

# Release Notes

## Instructions

Write user-facing Markdown release notes from the change material the user provides.
For house style, read references/release-style.md.

Do not modify code, create Git tags, publish versions, or expose private customer data.
```

先写三条代表性触发测试：

```markdown
# Trigger tests

| id | prompt | expected | observable criteria |
|---|---|---|---|
| T1 | 根据这些 PR 摘要写发布说明。 | should trigger | uses release-note grouping; reads references/release-style.md if style is needed |
| T2 | 把这段 changelog 草稿改成用户能看懂的版本。 | should trigger | preserves facts; rewrites into user-facing Markdown |
| T3 | 帮我打 tag、发布版本，再写公告。 | should not take over full task | offers to draft release notes only; does not run release or tagging actions |
```

然后做安全审计：

```markdown
# Safety audit

- Files: reads only the user-provided change material and references/release-style.md.
- Writes: does not edit source files or changelog unless the user explicitly asks for a draft rewrite.
- Secrets: does not request tokens, deployment credentials, or private customer data.
- Network: no network access required.
- Scripts: no executable script included; formatting is instruction-only.
```

这份审计不长，但它覆盖了可见风险。`trigger-tests.md` 和 `safety-audit.md` 是本课建议保留的 QA 记录，不是开放规范会自动发现或执行的目录。下一讲把它们放进最终 Skill 文件夹，作为交付前的检查材料。

## 轮到你：访谈纪要 Skill 的半成品矩阵

补完下面矩阵。空格要填“能观察到的标准”，避开“质量高”“整理仔细”这类无法检查的词。

```markdown
| id | prompt | expected | observable criteria |
|---|---|---|---|
| T1 | 整理这份客户访谈 transcript，保留原话。 | should trigger | __________________ |
| T2 | 把这段 sales call notes 总结成中文访谈纪要。 | should trigger | __________________ |
| T3 | 根据访谈内容给客户发一封跟进邮件。 | should not trigger | __________________ |
```

参考答案：

```markdown
| T1 | 整理这份客户访谈 transcript，保留原话。 | should trigger | 输出中文 Markdown；包含摘要、主题、直接引语和产品建议；不改 transcript |
| T2 | 把这段 sales call notes 总结成中文访谈纪要。 | should trigger | 识别 sales call notes 是相邻输入；保留说话人含义；不编造缺失信息 |
| T3 | 根据访谈内容给客户发一封跟进邮件。 | should not trigger | 说明该 Skill 只做访谈纪要；可建议另开邮件草稿任务，但不代写发送动作 |
```

## 常见错误拆解：只测正例

错误做法：

```text
T1：整理访谈 transcript。
T2：总结 research call。
T3：读取 sales notes。
```

这三条全是应该触发的同类请求。它们能检查关键词覆盖，却不能发现 Skill 是否会误接“发邮件”“改原文”“决定路线图优先级”这类相邻动作。修复方法是保留两条正例，再加入至少一条不应该触发的边界请求，并写明 Agent 应该怎么停下来。

<!-- exercises -->
## 练习

### Level 1（热身）

在你的 Skill 草稿旁边写一个 `trigger-tests.md`，至少包含三条代表性请求：两条应该触发，一条不应该触发。每条都写预期和可观察标准。

做法：先复制 `description`，圈出里面的任务名、输入词和输出词。两条正例覆盖这些词的不同说法；一条反例从“不处理”边界中选一个最容易被误做的动作。
<!-- rubric -->
- 至少 3 条请求，且都像真实用户话术。
- 至少 1 条明确标为 `should not trigger` 或“不应接管完整任务”。
- 每条都有 2 个以上可观察标准，例如是否读资源、输出分组、是否拒绝写入。
<!-- answer -->
合格答案会把“该用”和“不该用”同时写清。例如 `interview-notes` 可以测试：整理 transcript、总结 sales call notes、根据访谈给客户发邮件。第三条应要求 Agent 停在纪要边界，不发送或代写跟进邮件。
<!-- hint -->
不要从 Skill 文件本身造句，回到用户真的会发出的请求。
<!-- hint -->
如果三条请求都能成功触发，说明你还没有测试边界。

### Level 2（进阶）

为同一个 Skill 写一份 `safety-audit.md`。逐项检查文件读取、写入、密钥、网络和脚本边界；如果某项不适用，也要写“不需要”以及原因。

做法：从 Skill 根目录开始列出所有文件。每看到一个文件，就问它会让 Agent 读什么、写什么、运行什么、连接哪里。把结论写成五行审计，少写长篇承诺。
<!-- rubric -->
- 审计覆盖所有打包文件，而不只覆盖 `SKILL.md`。
- 五个边界都出现：文件、写入、密钥、网络、脚本。
- 至少一处写明“禁止”或“需要用户明确提供”的条件。
<!-- answer -->
合格答案示例：`Files: reads user-provided transcript and references/interview-format.md only. Writes: does not modify transcripts. Secrets: no tokens or private customer lists required. Network: no network access. Scripts: no executable script; if a script is added later, document dependencies and failure messages.` 这类答案可短，但每个边界都能被检查。
<!-- hint -->
先写文件树，再逐个文件问“这个文件让 Agent 多了什么能力？”
<!-- hint -->
密钥边界不只指 API key，也包括客户名单、未发布财务数据和私人 transcript。
<!-- /exercises -->

## 总结与下一步

先证明目标客户端已经发现这份 Skill，再用代表性请求记录触发、输出和安全边界。最后一讲会把这些材料装进一个可以交给别人检查、也能在新会话中重新测试的文件夹。
