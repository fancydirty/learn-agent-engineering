# 第 2 讲：SKILL.md 元数据结构

> 本讲目标：
> - 写出开放规范要求的最小 `SKILL.md` 结构。
> - 区分元数据块和正文的职责。
> - 让 `description` 同时说明 Skill 做什么和何时触发。
>
> 前置条件：完成一份四行 Skill brief | 上一讲 [<< 01](./01-prompt-to-skill.md) | 下一讲 [03 >>](./03-progressive-disclosure.md)

## Agent 先看到的不是你的完整说明

你已经有了四行 brief，但如果把它随手丢进一个 Markdown 文件，Agent 不一定知道这是一个 Skill，也不一定知道什么时候该加载它。支持 Agent Skills 的客户端会先看到 `name` 和 `description`，匹配任务后才读取完整 `SKILL.md`。[^S1][^S4]

第二步是写一个能被静态检查识别、也能被 Agent 正确触发的最小 `SKILL.md`。长说明等入口成立后再补。

## 解释

### 最小结构只有两层

开放规范要求 `SKILL.md` 包含 YAML frontmatter，后面跟 Markdown 正文。frontmatter 至少要有 `name` 和 `description`；正文写 Agent 激活 Skill 后应该遵守的操作说明。[^S2][^S7]

一个最小文件长这样：

```markdown
---
name: interview-notes
description: Turns customer interview transcripts into Chinese Markdown notes with quotes, themes, and product suggestions. Use when the user asks to summarize interviews, research calls, or transcript notes.
---

# Interview Notes

## Instructions

Read the transcript the user provides. Produce Chinese Markdown notes with:

- a short summary
- quoted evidence from the customer
- recurring themes
- 3 product suggestions

Do not edit the original transcript, send follow-up messages, or decide roadmap priority.
```

frontmatter 是文件开头的 YAML 元数据块，由上下两行 `---` 包住。正文是 frontmatter 后面的 Markdown 指令。二者的区别很重要：元数据帮助 Agent 发现 Skill；正文帮助 Agent 执行 Skill。

### `name` 是稳定标识

`name` 是 Skill 的机器可读名称。开放规范要求它 1 到 64 个字符，只能使用小写字母、数字和连字符，不能以连字符开头或结尾，不能包含连续连字符，并且要匹配父目录名。Anthropic 的当前最佳实践也给出了相同的长度和字符限制。[^S2][^S7]

这意味着下面这些名字有不同问题：

```yaml
name: InterviewNotes      # 有大写
name: interview_notes     # 有下划线
name: -interview-notes    # 以连字符开头
name: interview--notes    # 连续连字符
```

合格名称应该像目录名：

```yaml
name: interview-notes
```

命名不要追求有趣，先追求稳定、短、可读。它不是标题，也不是广告语。

### `description` 同时负责能力和触发

`description` 是 Agent 判断是否加载 Skill 的短说明。规范要求它非空、最多 1024 字符，并建议同时描述 Skill 做什么、何时使用，还要包含能帮助 Agent 识别任务的关键词。OpenAI 和 Anthropic 的当前指南都把隐式匹配放在这个字段上。[^S2][^S4][^S7]

较弱的写法：

```yaml
description: Helps write notes.
```

这句话没有说明输入、输出和触发场景。更具体的写法：

```yaml
description: Turns customer interview transcripts into Chinese Markdown notes with quotes, themes, and product suggestions. Use when the user asks to summarize interviews, research calls, or transcript notes.
```

这句话前半段说明能力，后半段说明何时触发。四行 brief 不能机械搬进两个位置：能力、正向触发和必要的负向消歧进入 `description`；输入细节、完整输出要求与执行禁令进入正文。如果某条“不处理”决定这个 Skill 根本不该被选中，就把它压缩成负向消歧写进 `description`，正文再保留具体禁令。

本讲术语表：

- `SKILL.md`：Skill 目录中的必需入口文件，包含元数据和指令。
- frontmatter：Markdown 文件顶部的 YAML 元数据块。
- `name`：符合命名限制并匹配父目录的稳定标识。
- `description`：说明 Skill 做什么、何时触发的短文本。

```agentmentor-check
{
  "id": "agent-skills-reuse-description-trigger",
  "label": "检查触发描述",
  "prompt": "下面哪个 description 更适合让 Agent 判断何时加载一个访谈纪要 Skill？",
  "whyHere": "这一步检查学习者是否把 description 写成泛泛能力介绍，而不是同时写清能力和触发。",
  "copyPurpose": "让 Agent 检查我的 description 是否同时包含做什么和何时触发。",
  "mode": "single",
  "choices": [
    {
      "id": "vague",
      "text": "泛化描述：Helps with customer content.",
      "correct": false,
      "feedback": "它没有说明稳定输入、输出或触发关键词，Agent 很难判断何时加载。"
    },
    {
      "id": "specific",
      "text": "明确能力与触发条件：Turns customer interview transcripts into Chinese Markdown notes with quotes and themes. Use when summarizing interviews, research calls, or transcript notes.",
      "correct": true,
      "feedback": "它同时写出能力、输出形态和触发场景，适合元数据层快速判断。"
    }
  ]
}
```

## 完整示例：最小可检查 SKILL.md

假设上一讲的 brief 是：

```text
触发：用户要求整理客户访谈、用户研究 transcript 或 sales call notes。
输入：一份或多份 transcript 文本，最好包含说话人和时间顺序。
输出：中文 Markdown 纪要，包含主题摘要、客户原话证据、问题清单和 3 条产品建议。
不处理：不修改原始 transcript，不替用户发送邮件，不决定路线图优先级。
```

先创建目录名和 `name`：

```text
interview-notes/
  SKILL.md
```

然后写最小 `SKILL.md`：

```markdown
---
name: interview-notes
description: Turns customer interview transcripts into Chinese Markdown notes with quoted evidence, themes, open questions, and product suggestions. Use when summarizing interviews, research calls, sales call notes, or transcript files.
---

# Interview Notes

## Instructions

Use this skill when the user provides or points to customer interview transcripts, research call notes, or sales call notes.

Input can be one or more transcript files or pasted transcript text. Preserve customer meaning and mark direct quotes clearly.

Return Chinese Markdown with:

- summary
- quoted evidence
- recurring themes
- open questions
- 3 product suggestions

Do not modify the original transcript, send follow-up messages, or decide roadmap priority.
```

它能通过最基本的静态检查，是因为：frontmatter 存在，`name` 合法并匹配目录，`description` 非空且包含能力和触发，正文给出了执行规则。

## 半完成示例：发布说明 SKILL.md

根据下面 brief 补完 `name` 和 `description`：

```text
目录名：release-notes
触发：用户要求根据 Git commit、PR 或 changelog 草稿生成发布说明。
输出：面向用户的 Markdown 发布说明，按新增、修复、已知问题分组。
```

半成品：

```markdown
---
name: __________________
description: __________________
---

# Release Notes

## Instructions

Write user-facing Markdown release notes from the change material the user provides.
```

参考答案：

```yaml
name: release-notes
description: Turns commits, PR summaries, or changelog drafts into user-facing Markdown release notes grouped by features, fixes, and known issues. Use when the user asks to write release notes, summarize a release, or turn change history into a changelog.
```

注意，`description` 不需要塞进所有操作细节。它要先帮 Agent 判断“这个任务该不该加载我”。

<!-- exercises -->
## 练习

### Level 1（热身）

在你自己的真实工作目录旁边创建一个练习目录，例如 `skill-drafts/<your-skill-name>/`，为上一讲的 brief 写一份最小 `SKILL.md`。不要放私人数据，只写结构和说明。

做法：先把目录名改成小写 kebab-case，再让 `name` 完全等于目录名。把 brief 中的能力、正向触发和必要的负向消歧压成一条 `description`；把输入细节、完整输出要求和执行禁令写进正文。
<!-- rubric -->
- 文件名是 `SKILL.md`，并以 frontmatter 开头。
- `name` 只含小写字母、数字和连字符，且匹配父目录名。
- `description` 同时说明做什么、何时触发，以及确有必要的负向消歧。
- 正文至少写明输入细节、完整输出要求和执行禁令。
<!-- answer -->
合格答案应从合法的多行 frontmatter 开始：

```markdown
---
name: release-notes
description: Turns ... Use when ...
---
```

后面再写 Markdown Instructions。常见错误是目录叫 `ReleaseNotes`，但 `name` 写 `release-notes`；开放规范要求二者匹配。
<!-- hint -->
先只检查前三行 frontmatter，不要急着美化正文。
<!-- hint -->
如果 description 写不出来，把上一讲的“触发”和“输出”两行直接合并成一句英文或中文短说明。

### Level 2（进阶）

为同一个 Skill 写三条代表性用户请求，并检查你的 `description` 会不会误触发或漏触发。至少一条请求应该是不该触发的相邻任务。

做法：在练习目录新建一个 `trigger-cases.md` 草稿，列出“应该触发 1”“应该触发 2”“不该触发 1”。逐条对照 `description` 中的关键词和边界。
<!-- rubric -->
- 三条请求都是真实可能出现的用户话术。
- 至少两条应触发请求能在 description 中找到对应关键词或语义。
- 不该触发请求能由 `description` 的范围词排除；正文另有对应的禁止动作。
<!-- answer -->
以 `release-notes` 为例：“根据这些 PR 写发布说明”应触发；“把 changelog 改成用户能看懂的版本”应触发；“帮我打 Git tag 并发布到生产”不该触发。若 `description` 只写 “Helps with releases”，第三条很容易被误判；应把范围收成 “write release notes”，并明确写入 “Do not use for tagging, deployment, or publishing operations”。正文再写“不创建 tag、不执行发布”，用于 Skill 已经加载或用户提出混合任务时约束执行。
<!-- hint -->
把请求写成用户真的会说的话，不要写成规范字段。
<!-- hint -->
相邻任务通常含有“发送、发布、部署、修改源文件、决定优先级”等动作。
<!-- /exercises -->

## 带走：元数据的两种职责

最小 `SKILL.md` 现在有两种职责：frontmatter 负责发现和选择，正文负责实际执行。入口能工作后，新的问题是资料会不断变长；下一步要让 Agent 只在任务需要时读取标签、示例和模板。
