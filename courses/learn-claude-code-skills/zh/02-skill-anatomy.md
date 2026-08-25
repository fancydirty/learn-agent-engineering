# 第 2 课：Skill 的解剖：SKILL.md 文件结构

> 学习目标：
> - 理解 SKILL.md 的双部分结构
> - 掌握 YAML frontmatter 的必需字段
> - 学会编写有效的 description
> - 了解 instructions 部分的组织方式
>
> 前置要求：[<< 第 1 课](./01-what-are-skills.md) | 下一课 [第 3 课 >>](./03-first-skill.md)

## 一个 Skill 文件长什么样

打开任何一个 Skill，你会看到这样的结构：[^S1]

```markdown
---
name: task-organizer
description: 整理待办事项，按优先级和截止日期分组
---

# 任务整理器

从混乱的任务列表中提取结构化信息。

## 输入格式

接受以下任何格式：
- 纯文本列表
- Markdown checklist
- 带时间标记的消息记录

## 处理步骤

1. 提取每个任务的核心内容
2. 识别截止日期（如果有）
3. 判断优先级（紧急/重要/普通）
4. 按截止日期排序，最近的在前

## 输出格式

### 🔴 紧急（今天或明天到期）
- [任务内容] - 截止时间

### 🟡 重要（本周到期）
- [任务内容] - 截止时间

### ⚪ 普通（无明确截止日期或较远）
- [任务内容]
```

**这个文件有两个部分：**

1. **YAML frontmatter**（`---` 之间的部分）：元数据，告诉 Claude 这个 Skill 的基本信息
2. **Markdown instructions**（`---` 之后的部分）：具体指令，告诉 Claude 怎么做

## YAML frontmatter：让 Claude 认识你的 Skill

frontmatter 是文件最开头用 `---` 包裹的部分。它告诉 Claude 两件最重要的事：[^S3][^S4]

### name：Skill 的唯一标识

```yaml
name: task-organizer
```

- **规则**：小写字母、数字、连字符，不能有空格
- **作用**：这个名字会变成命令，比如 `/task-organizer`
- **建议**：用描述性命名，短、一看就懂

**好的 name：**
- `meeting-notes`
- `code-review`
- `changelog-generator`

**不好的 name：**
- `my-skill-1`（太泛化）
- `super_amazing_task_helper`（太长、有下划线）
- `任务整理`（不能用中文）

### description：最重要的字段

```yaml
description: 整理待办事项，按优先级和截止日期分组
```

**这一句话决定了三件事：**[^S6]

1. **Claude 什么时候自动加载这个 Skill**
2. **用户在 Skills 列表里看到什么**
3. **Claude 理解这个 Skill 是干什么的**

**编写公式：做什么 + 什么时候用 + 关键能力**[^S6]

**好的 description：**
```yaml
description: 整理待办事项，按优先级和截止日期分组。用于处理混乱的任务列表或会议行动项
```

**不好的 description：**
```yaml
description: 帮助处理任务  # 太泛化，Claude 不知道什么时候用
description: 这是一个非常强大的任务管理工具，能够智能分析优先级  # 太营销化，关键信息在后面
```

### 可选字段（本课不讲，第 6 课涉及）

- `model`: 指定使用哪个模型
- `allowed-tools`: 限制这个 Skill 能用哪些工具
- `version`: 版本号

**第一次写 Skill，只需要 name 和 description 就够了。**[^S4]

## Markdown instructions：告诉 Claude 怎么做

frontmatter 之后的所有内容，就是给 Claude 看的指令。[^S1]

**好的 instructions 有三个特点：**

### 1. 分段清晰

用标题把不同部分隔开：

```markdown
## 输入格式
（说明接受什么样的输入）

## 处理步骤
（一步步说清楚怎么做）

## 输出格式
（说明结果应该长什么样）

## 注意事项
（特殊情况怎么处理）
```

### 2. 步骤具体

**不好：**
```markdown
1. 分析任务
2. 判断优先级
3. 输出结果
```

**好：**
```markdown
1. 读取任务列表，每行一个任务
2. 从任务文本中提取日期关键词（今天、明天、周五、2024-01-15 等）
3. 如果任务包含「紧急」「ASAP」「尽快」，标记为高优先级
4. 按截止日期排序，最近的排在最前面
5. 输出为三个分组：紧急、重要、普通
```

### 3. 有示例

如果输出格式有要求，给一个示例：

```markdown
## 输出格式

### 🔴 紧急
- 完成季度报告 - 明天 17:00
- 修复生产环境 bug - 今天

### 🟡 重要
- 审查 PR #234 - 本周五

### ⚪ 普通
- 更新文档
- 优化性能
```

Claude 看到示例，就知道具体该怎么排版——这就是示例驱动，比大段文字描述更管用。

```agentmentor-check
{
  "id": "skills-zh-02-description-quality",
  "label": "判断 description 是否有效",
  "prompt": "你写了一个 Skill，用来把 Git commit 历史转成客户能看的更新日志。下面哪个 description 更好？",
  "whyHere": "刚学完 description 的编写公式（做什么 + 什么时候用 + 关键能力），需要判断能否识别好的写法",
  "mode": "single",
  "choices": [
    {
      "id": "a",
      "text": "description: 一个强大的更新日志生成工具",
      "correct": false,
      "feedback": "这个 description 太泛化了。Claude 不知道「强大」是什么意思，也不知道什么时候该用这个 Skill。关键信息（从 commit 生成、面向客户）都没写。"
    },
    {
      "id": "b",
      "text": "description: 将 Git commit 历史转成面向客户的更新日志，过滤内部 commit，用通俗语言改写技术术语",
      "correct": true,
      "feedback": "正确。这个 description 说清楚了：做什么（转成更新日志）、输入是什么（Git commit）、关键能力（过滤、改写术语）。Claude 看到「更新日志」「客户」就知道什么时候加载它。"
    }
  ]
}
```

## 两部分如何配合

**frontmatter 是发现机制，instructions 是执行指南。**[^S2][^S5]

1. 你输入 `/task-organizer`，或者说"帮我整理这些任务"
2. Claude 看 frontmatter 的 name 或 description，决定是否加载这个 Skill
3. 如果加载，Claude 读完整个 instructions
4. Claude 按照 instructions 的步骤执行
5. 输出符合 instructions 里要求的格式

**这就是为什么 description 要写好**：它是 Claude 决定「要不要用这个 Skill」的唯一依据。[^S6]

如果 description 写成"帮助处理任务"，Claude 不知道什么场景该用它；如果写成"整理待办事项，按优先级和截止日期分组"，Claude 一看到"整理任务""待办"这类词，就知道该加载它。

## 真实案例：拆解一个代码审查 Skill

看一个实际使用的 Skill：

```markdown
---
name: code-review
description: 审查代码变更，检查是否遵循团队规范、潜在 bug 和性能问题
---

# 代码审查助手

## 审查清单

逐项检查以下内容：

### 1. 代码规范
- 变量命名是否符合团队约定（驼峰命名、有意义的名字）
- 是否有超过 50 行的函数（建议拆分）
- 是否有重复代码（DRY 原则）

### 2. 潜在问题
- 是否有未处理的错误（try-catch、错误返回值）
- 是否有可能的空指针访问
- 是否有 SQL 注入风险（如果涉及数据库）

### 3. 性能考虑
- 是否有 N+1 查询
- 是否有不必要的循环嵌套
- 是否有可以缓存的重复计算

## 输出格式

对每个问题，给出：
- **位置**：文件名 + 行号
- **问题**：具体是什么问题
- **建议**：怎么改进

如果没有问题，输出"✓ 代码审查通过"
```

**分析：**

- **frontmatter 的 description**：说清楚了做什么（审查代码）、检查什么（规范、bug、性能）
- **instructions 分三个清单**：规范、问题、性能，每个清单列出具体检查项
- **输出格式明确**：告诉 Claude 每个问题要包含位置、问题、建议

这样的 Skill，Claude 一次就能做对。

<!-- exercises -->
## 💻 练习

### Level 1：修复一个有问题的 frontmatter

下面这个 frontmatter 有什么问题？怎么改？

```markdown
---
name: My Amazing Tool
description: 工具
---
```

<!-- rubric -->
- 指出了 name 的问题（不能有空格、应该小写、应该用连字符）
- 指出了 description 的问题（太泛化、没说做什么）
- 给出了改进建议

<!-- answer -->
**问题：**

1. `name` 有空格和大写字母，应该是 `my-amazing-tool`（但这个名字本身也不好，太泛化）
2. `description` 只写了"工具"，没说做什么、什么时候用

**改进示例：**

```markdown
---
name: api-doc-generator
description: 从代码注释生成 API 文档，支持 JSDoc 和 Python docstring 格式
---
```

<!-- hint -->
回顾 name 的规则：小写字母、数字、连字符

<!-- hint -->
回顾 description 的公式：做什么 + 什么时候用 + 关键能力

### Level 2：为你的场景写 frontmatter

用第 1 课练习中找到的任务，写一个 frontmatter。

<!-- rubric -->
- name 符合命名规则（小写、连字符、描述性）
- description 包含了做什么、什么时候用、关键能力
- description 一句话能说清楚，不超过 100 字

<!-- answer -->
示例（基于第 1 课的客户反馈整理任务）：

```markdown
---
name: feedback-classifier
description: 整理 Slack 客户反馈，分类为 bug 报告、功能请求、使用疑问，并标注优先级。用于每日反馈汇总
---
```

**说明：**
- `name` 描述性强，一看就懂
- `description` 说了做什么（整理反馈、分类）、输入是什么（Slack 客户反馈）、输出是什么（分类+优先级）、什么时候用（每日汇总）

<!-- hint -->
如果不确定 description 写得好不好，问自己：Claude 看到什么词会想起这个 Skill？把那些词写进去

<!-- /exercises -->

## 小结

- **SKILL.md 有两部分**：YAML frontmatter（元数据）+ Markdown instructions（指令）
- **frontmatter 必需字段**：`name`（小写、连字符、唯一标识）和 `description`（决定自动触发）
- **description 编写公式**：做什么 + 什么时候用 + 关键能力
- **instructions 三个特点**：分段清晰、步骤具体、有示例
- **两部分配合**：frontmatter 让 Claude 发现 Skill，instructions 让 Claude 执行

下一课，我们从零开始，完整地写一个 Skill。

[>> 第 3 课：动手实践：编写你的第一个 Skill](./03-first-skill.md)
