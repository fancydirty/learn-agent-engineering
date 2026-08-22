# 第 4 讲：资源、脚本与执行边界

> 本讲目标：
> - 区分 `references/`、`assets/` 和 `scripts/` 的用途。
> - 判断一条资料应该写进指令、参考资料、模板还是脚本。
> - 为真实 Skill 文件夹做一次资源分层，不要求会编程。
>
> 前置条件：理解元数据层、指令层、资源层和按需加载 | 上一讲 [<< 03](./03-progressive-disclosure.md) | 下一讲 [05 >>](./05-testing-and-safety.md)

## 资源层也需要边界

第 3 讲把长资料从 `SKILL.md` 里拆了出去。但拆出去之后，还会出现新的混乱：标签解释、示例文件、空白模板、检查命令都放在一起，Agent 不知道哪些是知识，哪些是要复制的形状，哪些是可以稳定执行的动作。

同一份 Markdown 可能是规则、参考资料或输出模板，取决于 Agent 应该怎样使用它。这里要判断每项内容的落点：继续留在指令里、供 Agent 阅读、供它复制填充，或留给确定性脚本。这个判断不要求编写或运行脚本。

## 解释

### `references/`：给 Agent 读取的背景资料

`references/` 适合放长说明、术语表、标签定义、评审规则和示例分析。它的特点是“读后判断”。Agent 读取它，是为了更好地理解任务标准，而不是逐字复制。

在访谈纪要 Skill 中，`references/tag-guide.md` 可以解释 `pain-point`、`workaround`、`buying-signal` 三个标签，并给出每个标签的判断例子。它不应该承载最终输出骨架，因为参考资料的主要用途是解释。

### `assets/`：给 Agent 复用的形状

`assets/` 适合放稳定的输出形状和静态素材，例如空白纪要、配置模板、图片或数据表。文本模板不需要另建 `templates/` 目录；直接放进 `assets/`，文件名写清用途即可。开放规范与 OpenAI 当前指南都采用这个目录约定。[^S2][^S4]

如果你的访谈纪要每次都要有“摘要、原话证据、主题、开放问题”四段，就把这份骨架放进 `assets/note-template.md`。Agent 需要固定形状时再读取它，然后按用户材料填空。

### `scripts/`：给确定性操作留位置

`scripts/` 适合放可重复、规则明确、结果可检查的操作。比如检查 Markdown 是否包含必需标题、把 CSV 转成统一字段名、统计一个目录里是否缺少模板。官方资料把脚本列为 Skill 可以组织的一部分，也提醒安装前审计依赖、资源和外部网络访问。[^S1][^S3]

本课不要求你写代码。判断脚本是否值得存在，只看三点：规则是否固定，手做是否容易错，运行结果是否能被检查。如果答案都明确，未来可以考虑脚本；如果仍需要大量语义判断，就留在指令或参考资料里。

### 确定性边界：什么不该交给脚本

确定性边界是“机器按规则做”与“Agent 按语义判断”的分界线。脚本擅长检查标题是否存在、文件名是否匹配、字段是否为空；Agent 擅长判断一段客户原话是否真的支持某个结论。

访谈纪要里，“检查输出是否包含 `## 原话证据`”可以是脚本；“判断这句原话是不是强购买信号”更适合参考资料加 Agent 判断。把语义判断硬塞给脚本，通常会得到看似稳定但其实僵硬的规则。

本讲术语表：

- `references/`：放长背景、规则解释和判断标准的参考资料目录。
- `assets/`：放可复用模板、图片和数据文件的静态资源目录。
- `scripts/`：放规则明确、可重复、可检查操作的脚本目录。
- 确定性边界：区分固定规则执行与语义判断的边界。

## 完整示例：给访谈纪要 Skill 分配四类内容

假设你正在整理这个虚构 Skill：

```text
interview-notes/
  SKILL.md
```

你手里有六条内容：

```text
1. 用户给 transcript 时，输出中文 Markdown 纪要。
2. 不修改原始 transcript，不虚构客户原话。
3. pain-point、workaround、buying-signal 的标签解释。
4. 一份固定纪要骨架。
5. 三段虚构 transcript 和对应好纪要示例。
6. 检查输出是否包含“摘要、原话证据、开放问题”三个标题。
```

先分配必读规则。第 1、2 条每次执行都要遵守，应该留在 `SKILL.md` 正文：

```markdown
## Instructions

When the user provides interview transcripts, produce Chinese Markdown notes.
Preserve quoted evidence and do not modify the original transcript.
Do not invent quotes that are not present in the source material.
```

再分配需要解释的判断标准。第 3 条属于参考资料：

```text
references/tag-guide.md
```

它的作用是帮助 Agent 判断标签，而不是给最终纪要提供固定排版。

然后分配可复用形状。第 4 条属于模板：

```text
assets/note-template.md
```

Agent 在用户要求固定结构时读取它，并把真实内容填进去。

第 5 条可以放进 `references/examples.md`，因为它主要用于理解什么算“好纪要”。如果示例包含私人信息，就不能放进公开 Skill；这里必须使用公开或虚构材料。

第 6 条才接近脚本边界。它规则固定、手工检查容易漏、结果能明确返回“缺哪个标题”。未来可以放在：

```text
scripts/check-note-headings.js
```

但如果你不会编程，先把它写成 `references/quality-check.md` 里的检查清单也可以。重要的是不要凭空写危险脚本，不要让脚本修改用户文件；先让边界清楚。

最终结构：

```text
interview-notes/
  SKILL.md
  references/
    tag-guide.md
    examples.md
    quality-check.md
  assets/
    note-template.md
  scripts/
    check-note-headings.js
```

这里的 `scripts/` 是未来位置，不是本讲要求你立刻实现的代码。你要能解释为什么它属于确定性检查，而不是语义判断。

```agentmentor-check
{
  "id": "agent-skills-reuse-deterministic-boundary",
  "label": "挑出标题检查脚本",
  "prompt": "在访谈纪要 Skill 中，哪一项最适合未来放进 `scripts/` 做确定性检查？",
  "whyHere": "脚本边界是本讲最容易误解的地方：不是所有看起来重复的任务都适合交给脚本。",
  "copyPurpose": "让 Agent 检查我是否把语义判断误当成确定性脚本任务。",
  "mode": "single",
  "choices": [
    {
      "id": "semantic",
      "text": "判断某句客户原话是不是强购买信号",
      "correct": false,
      "feedback": "这需要理解语境和证据强度，更适合参考资料加 Agent 判断。"
    },
    {
      "id": "deterministic",
      "text": "检查输出里是否包含“摘要、原话证据、开放问题”三个标题",
      "correct": true,
      "feedback": "标题存在与否是固定规则，结果也容易检查，适合未来脚本化。"
    }
  ]
}
```

## 半完成示例：把内容放到正确位置

下面是一个发布说明 Skill 的资源清单。请把每条放进 `SKILL.md`、`references/`、`assets/` 或 `scripts/`。

```text
A. 输入 PR 摘要后，输出面向用户的 Markdown 发布说明。
B. 不创建 Git tag，不执行部署。
C. “breaking change”“known issue”“migration note” 的判断解释。
D. 发布说明固定结构：新增、修复、已知问题。
E. 检查 Markdown 是否包含二级标题“新增”和“修复”。
```

补完：

```text
`SKILL.md`：________________________________
`references/`：____________________________
`assets/`：_________________________________
`scripts/`：_______________________________
```

参考答案：

```text
`SKILL.md`：A、B。它们是每次任务都要遵守的核心指令和边界。
`references/`：C。它解释判断标准，需要 Agent 读后理解。
`assets/`：D。它是可复用输出骨架，适合复制后填充。
`scripts/`：E。它是固定标题检查，结果可明确判断。
```

如果你把 C 放进脚本，就会把语义判断变成僵硬关键词匹配；如果把 D 长篇写进 `SKILL.md`，入口会变重。

<!-- exercises -->
## 练习

### Level 1（热身）

选一个你已经写过的 Skill 草稿，列出 8 条内容，并把它们分到四类：`SKILL.md`、`references/`、`assets/`、`scripts/`。不需要真的写脚本，只要说明哪些内容未来可能脚本化。

做法：打开你的 Skill 草稿或 brief，把每一句规则、示例、模板、检查项拆成单独条目。给每条后面标注“每次必读”“读后判断”“复制后填充”或“固定检查”。
<!-- rubric -->
- 至少列出 8 条内容。
- 四类中至少三类有内容；如果某类为空，要写一句理由。
- 每条内容都有一句分配理由。
- 至少指出一条不适合脚本化的语义判断。
<!-- answer -->
合格答案会把“输入输出和不处理边界”放进 `SKILL.md`，把“术语解释和好坏示例”放进 `references/`，把“固定报告骨架”放进 `assets/`，把“标题是否存在、字段是否为空”这类固定检查列为未来 `scripts/` 候选。常见错误是把“判断内容是否有洞察”列为脚本；它太依赖语义，应回到参考标准和 Agent 判断。
<!-- hint -->
先不要想目录名，只给每条内容贴四个标签之一。
<!-- hint -->
如果一句话里有“判断是否真正支持结论”，它通常不是确定性脚本。

### Level 2（进阶）

在你的真实练习 Skill 文件夹中做一次资源分层。允许只创建空文件或草稿文件，但必须形成一个可读目录：`SKILL.md` 加上至少两个资源文件。不要放私人数据，也不要写会修改或删除文件的脚本。

做法：在 IDE 或终端中打开练习 Skill 文件夹。把 `SKILL.md` 正文缩到核心指令和资源指向；新建至少一个 `references/` 文件和一个 `assets/` 文件。如果你认为某项未来适合脚本，只创建 `scripts/README.md` 说明检查目标，不写可执行代码。
<!-- rubric -->
- 目录至少包含 `SKILL.md`、一个 `references/` 文件、一个 `assets/` 文件。
- `SKILL.md` 正文包含资源指向，但没有塞入长参考资料。
- 资源文件名和内容标题能说明用途。
- 没有真实隐私材料，没有危险脚本，没有自动修改用户文件的命令。
<!-- answer -->
一个合格目录可能是：`SKILL.md`、`references/tag-guide.md`、`assets/note-template.md`、`scripts/README.md`。`SKILL.md` 写“需要标签定义时读取 `references/tag-guide.md`；需要固定输出结构时读取 `assets/note-template.md`。”`scripts/README.md` 只记录“未来可检查必需标题是否存在”。这样已经完成资源分层，即使还没有任何可执行脚本。
<!-- hint -->
真实文件夹里可以先写很短的占位内容，例如一个标题和两条说明。
<!-- hint -->
如果你想写脚本，先改写成一句检查目标；这讲只要求边界清楚。
<!-- /exercises -->

## 带走：各有落点的分层图

资源分层完成后，入口规则、参考资料、输出形状和固定检查各有落点。下一讲把这张分层图放回真实任务，检查 Skill 是否在该用时出现、在不该接管时停下，以及附带文件有没有带来风险。
