# 第 6 讲：从工作流到可交付 Skill

> 本讲目标：
> - 组装一个包含 `SKILL.md`、参考文件、模板或脚本边界说明的完整 Skill 文件夹。
> - 使用规范验证工具或手工等价检查确认入口文件有效。
> - 在自己的 Agent 中执行 3 条代表性测试，记录失败并修订。
>
> 前置条件：完成触发测试矩阵和安全审计 | 上一讲 [<< 05](./05-testing-and-safety.md) | 下一页 [课程目录 >>](./README.md)

## 交付物是一套可复查文件

到这里，你已经有了 `SKILL.md`、资源分层、执行边界、触发测试和安全审计。最后一步要把它们放进一个别人能检查、Agent 能读取、你自己能复测的文件夹。

本讲的终点很具体：一个完整 Skill 文件夹，至少有入口文件、一个 `references/` 文件、一个模板或脚本边界说明，以及 3 条代表性测试记录。这个终点不要求你写可执行代码。

## 解释

### 完整文件夹先看形状

开放规范把 Skill 定义为一个至少包含 `SKILL.md` 的目录，并约定用 `scripts/`、`references/` 和 `assets/` 组织常见的可选内容。OpenAI 当前指南采用相同的目录形状。[^S2][^S4]

本课使用一个适合初学者的最小交付形状：

```text
release-notes/
  SKILL.md
  references/
    release-style.md
  assets/
    release-notes-template.md
  tests/
    trigger-tests.md
  safety-audit.md
```

`SKILL.md` 是入口；`references/release-style.md` 放风格和边界细节；`assets/release-notes-template.md` 放固定输出骨架；`tests/trigger-tests.md` 放三条代表性测试；`safety-audit.md` 记录你检查过哪些风险。

这里有一条容易混淆的边界：`tests/` 和 `safety-audit.md` 是本课自建的 QA 记录，不属于规范约定的自动发现目录。把它们留在文件夹里，是为了让下一位维护者看得见测试和修订过程。

### 验证分两层：规范检查和手工等价检查

如果你已经按 `skills-ref` 仓库说明安装了参考库，并且当前虚拟环境中能找到命令，可以用它检查 `SKILL.md` frontmatter 和命名约束。该库明确标注为演示用途，所以本课始终保留手工等价检查。[^S2][^S6]

```text
1. 文件夹名完全等于 frontmatter 里的 name。
2. SKILL.md 从第一行开始就是 ---。
3. frontmatter 能被当作 YAML 读懂。
4. name 只含小写字母、数字和连字符；不以连字符开头或结尾；没有连续连字符。
5. description 非空，说明做什么和何时使用。
6. 正文能指向真实存在的 `references/` 或 `assets/` 相对路径。
```

验证不能证明 Skill 好用，只能证明入口文件没有低级结构错误。真正好不好用，要靠三条代表性测试。

### 三条测试要在自己的 Agent 中执行

ChatGPT 和 Codex 支持显式调用与隐式调用；隐式调用由任务是否匹配 `description` 决定。Anthropic 的当前指南也采用先看元数据、再读全文的发现过程。[^S4][^S7] 测试前先按目标客户端当前文档安装 Skill，用技能列表或显式调用确认它可见，再为每条用例开新会话测试隐式触发。客户端不显示调用记录时，输出相似只能说明结果相似，不能单独证明发生了触发。

每条测试记录四项：

```text
Prompt: 用户请求原文
Expected: should trigger / should not trigger
Observed: Agent 实际做了什么
Revision: 要改 description、正文、资源，还是测试本身
```

如果已确认 Skill 可见但 Agent 没触发，不要直接把 `description` 改成长列表。先看缺的是触发词、输入词、输出词，还是负向消歧写得太宽。改完后在新会话重跑同一条测试。

### 失败记录是交付物的一部分

一个可交付 Skill 不该隐藏失败。Anthropic 建议在代表性任务上观察另一个新会话如何使用 Skill，再根据实际结果修订。[^S1][^S7] 因此 `tests/trigger-tests.md` 里应该保留失败记录和修订记录。

推荐格式：

```markdown
| id | expected | observed | revision |
|---|---|---|---|
| T1 | should trigger | triggered and used template | no change |
| T2 | should trigger | did not trigger on "customer-facing changelog" | add "customer-facing changelog" to description |
| T3 | should not trigger | offered to create Git tag | add "Do not create Git tags" to Instructions |
```

这份记录会把 Skill 从“一次写完”推进到“可维护”。下一次你或别的 Agent 接手时，会知道为什么某句话写在那里。

## 完整示例：发布说明 Skill 文件夹

下面是一个完整但很小的 `release-notes` Skill。它不需要脚本，只使用参考文件和模板。

```text
release-notes/
  SKILL.md
  references/
    release-style.md
  assets/
    release-notes-template.md
  tests/
    trigger-tests.md
  safety-audit.md
```

`SKILL.md`：

```markdown
---
name: release-notes
description: Turns commits, PR summaries, customer-facing changelog drafts, or change lists into user-facing Markdown release notes. Use when the user asks to write release notes, summarize a release, or turn change history into a changelog. Do not use for tagging, deployment, or publishing operations.
---

# Release Notes

## Instructions

Use this skill when the user asks for user-facing release notes from commits, PR summaries, changelog drafts, or change lists.

Read references/release-style.md before writing if the user asks for house style, audience tone, or wording rules.

Use assets/release-notes-template.md for the output structure unless the user provides a different structure.

Return Markdown grouped by Added, Fixed, Changed, and Known issues. Preserve the facts in the input. Mark missing facts as open questions instead of inventing them.

Do not modify source code, create Git tags, deploy, publish, send announcements, or expose private customer data.
```

`references/release-style.md`：

```markdown
# Release style

- Write for product users, not internal engineers.
- Keep each bullet under 25 words when possible.
- Start each bullet with the user-visible change.
- Avoid commit hashes unless the user asks for an engineering changelog.
- If a change affects privacy, reliability, or data loss, keep the warning explicit.
```

`assets/release-notes-template.md`：

```markdown
# Release notes

## Added

- 

## Changed

- 

## Fixed

- 

## Known issues

- 

## Open questions

- 
```

`tests/trigger-tests.md`：

```markdown
| id | prompt | expected | observed | revision |
|---|---|---|---|---|
| T1 | 根据这些 PR 摘要写发布说明。 | should trigger | pending | pending |
| T2 | 把 customer-facing changelog 草稿改成更清楚的 release notes。 | should trigger | pending | pending |
| T3 | 帮我打 tag、发布版本，再写公告。 | should not take over full task | pending | pending |
```

`safety-audit.md`：

```markdown
# Safety audit

- Files: reads only user-provided change material, references/release-style.md, and assets/release-notes-template.md.
- Writes: produces draft Markdown in the conversation unless the user explicitly asks for a file path.
- Secrets: does not request deployment credentials, API keys, private customer lists, or unreleased financial data.
- Network: no network access required.
- Scripts: no executable script included; formatting is instruction-only.
```

交付时先验证结构。如果你装了规范验证工具，就按它的说明检查；如果没有，就按前面的六条手工检查逐项核对。接着把 Skill 放到目标 Agent 能读取的位置，用技能列表或显式调用确认它可见，再用 T1、T2、T3 三条请求分别开新会话测试，避免上一条测试污染下一条判断。若客户端不提供调用记录，把“输出符合规则”记为结果证据，不把它写成触发证据。

## 轮到你：竞品研究 Skill 的半成品

补完下面两个位置：`description` 要说明何时触发，`references/research-boundaries.md` 要挡住一个安全边界。

```text
competitor-research/
  SKILL.md
  references/
    research-boundaries.md
  assets/
    competitor-brief-template.md
  tests/
    trigger-tests.md
  safety-audit.md
```

半成品 `SKILL.md`：

```markdown
---
name: competitor-research
description: ________________________________________
---

# Competitor Research

## Instructions

Use this skill to turn user-provided competitor notes, public website excerpts, or product comparison notes into a structured competitor brief.

Read references/research-boundaries.md before writing the brief.

Use assets/competitor-brief-template.md for the output structure.
```

半成品 `references/research-boundaries.md`：

```markdown
# Research boundaries

- Use only sources or excerpts the user provides in the task.
- ________________________________________
- Mark unsupported claims as "unverified" instead of presenting them as fact.
```

参考答案：

```yaml
description: Turns user-provided competitor notes, public website excerpts, or product comparison notes into a structured competitor brief. Use when the user asks to summarize competitors, compare positioning, or prepare competitor research from supplied material. Do not use for scraping, private-data collection, or claims without sources.
```

```markdown
- Do not collect private employee, customer, or account data; ask the user to provide public, sourceable material instead.
```

这个 faded example 的重点是：即使做的是研究 Skill，也不要把“研究”写成无限权限。输入来源和未验证声明都要有边界。

```agentmentor-action
mode: reasoning_audit
label: 审计我的最终 Skill 文件夹
description: 让 Agent 按本讲终点检查 SKILL.md、参考文件、模板或脚本边界、三条测试和安全审计是否互相一致。
purpose: 我已经写完一个 Skill 文件夹；请检查它是否满足本课终点，并指出 description、资源路径、触发测试和安全边界之间的矛盾。
rules:
  - 一次只检查一个风险区域：结构、触发、输出、安全或测试记录。
  - 引用我提供的具体文件片段，不要泛泛重讲 Agent Skills 概念。
  - 对每个问题给出一个可直接编辑的修订建议。
```

<!-- exercises -->
## 练习

### Level 1（热身）

在你的练习目录中组装最终 Skill 文件夹。它必须包含 `SKILL.md`、一个 `references/` 文件、一个模板文件或脚本边界说明、`tests/trigger-tests.md` 和 `safety-audit.md`。

做法：先画出文件树，再逐个创建空文件，最后把前几讲的 brief、资源说明、测试矩阵和安全审计迁入对应位置。不要放私人原始数据。
<!-- rubric -->
- 文件树至少包含 5 个交付物：入口、参考、模板或脚本边界、测试、安全审计。
- `SKILL.md` 中引用的相对路径在文件夹里真实存在。
- Skill 不依赖本课程页面或隐藏上下文，单独复制文件夹仍能读懂。
<!-- answer -->
合格交付物应类似：`my-skill/SKILL.md`、`my-skill/references/format.md`、`my-skill/assets/output-template.md`、`my-skill/tests/trigger-tests.md`、`my-skill/safety-audit.md`。如果你选择不写模板，也要写一个清楚的脚本边界说明，例如 `scripts/README.md` 写明“不包含脚本；如未来加入脚本，必须说明依赖、输入、输出和失败信息”。
<!-- hint -->
先让 `SKILL.md` 只引用一个参考文件和一个模板，减少路径错误。
<!-- hint -->
如果你不能把文件夹复制给另一个 Agent 阅读，说明某些说明还藏在你的对话里。

### Level 2（进阶）

对最终 Skill 执行一次验证和三条代表性测试。如果你已经按官方仓库说明安装并激活 `skills-ref`，可以运行 `skills-ref validate ./your-skill`；否则执行本讲的六条手工等价检查。然后在自己的 Agent 中跑 3 条测试，把 observed 和 revision 写回 `tests/trigger-tests.md`。

做法：在 Skill 父目录运行验证或手工检查。确认目标客户端已安装并列出该 Skill 后，用三条测试分别发给 Agent，每条开新会话。观察它是否触发、读了什么、输出什么、是否越界，把结果原样记录。
<!-- rubric -->
- 验证结果或手工检查 6 项都有记录。
- 3 条测试都有 `expected`、`observed` 和 `revision`。
- 至少 1 条测试记录说明“不需要修改”或“已修改某一行”，不能全部留空。
- 如果测试失败，修订位置明确到 `description`、正文、参考文件、模板或测试用例。
<!-- answer -->
合格记录示例：`T2 expected should trigger; observed did not trigger on "customer-facing changelog"; revision added "customer-facing changelog" to description.` 另一条可以是：`T3 expected should not take over full task; observed offered to tag release; revision added "Do not create Git tags or publish versions" to Instructions.` 记录要能解释为什么改这句，不能只写“调整 description”。
<!-- hint -->
如果 Agent 没有明显触发 Skill，先检查 description 是否包含用户话术里的任务词。
<!-- hint -->
如果 Agent 触发后越界，优先改正文的禁止动作；如果它根本不该触发，改 description 的范围词。
<!-- /exercises -->

## 课程的终点，维护的起点

你现在完成了本课的终点任务：把一个重复工作流交付成完整 Skill 文件夹，并用三条代表性请求测试触发、输出和边界。后续维护时，不要把失败记录删掉；把它们当作 Skill 的变更历史。每次新增资源、模板或脚本，都同时更新测试矩阵和安全审计。
