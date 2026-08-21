# Agent Mentor Open Courses 多语言设计

## 目的

让同一门 Agent 课程拥有多个完整语言版本，并让读者从当前页面直接切换到同一课程、同一课节的其他语言版本。

多语言服务于开源课程的传播，不改变产品边界：网站仍然只负责静态课程阅读、互动练习、复制给 Agent 和指向 `agentmentor.dev` 的外链，不引入账户、在线 AI、数据库或运行时翻译。

## 已确定的范围

首批支持六种语言：

| URL locale | 页面语言 | `<html lang>` | 菜单名称 |
|---|---|---|---|
| `en` | English | `en` | English |
| `zh` | 简体中文 | `zh-CN` | 简体中文 |
| `ja` | 日本語 | `ja-JP` | 日本語 |
| `ko` | 한국어 | `ko-KR` | 한국어 |
| `es` | Español | `es-ES` | Español |
| `pt-BR` | Português do Brasil | `pt-BR` | Português (Brasil) |

这六种语言是首发内容范围，不是代码中的硬上限。新增语言必须先加入 locale registry，再提供完整课程版本并通过同样的检查。

不做以下事项：

- 不首发 15 种语言。
- 不在请求时调用模型或翻译 API。
- 不根据 IP 判断语言。
- 不用 query parameter 表示课程语言。
- 不用“文 A”或只有图标、需要猜测含义的语言按钮。
- 不把未完成的翻译显示成可用版本。

## 参考项目结论

`walkinglabs/learn-harness-engineering` 的正确方向是：

- 使用 `/en/...`、`/zh/...` 这类 locale-first URL。
- 每种语言保存完整课程正文，而不是只翻译导航。
- 语言菜单切换时保留当前页面其余路径。
- 导航、侧栏、页内目录和上一页/下一页都随页面语言变化。

本项目不照搬它的两个实现细节：

- 不在一个大型配置文件中手工维护每种语言的整套课程导航。
- 不在每篇 Markdown 顶部手写 “English Version →” 或“中文版 →”。

课程文件结构本身是语言菜单和课程导航的来源，避免添加语言时同时维护内容、配置和正文跳转三份状态。

## URL 与路由

所有正式内容路由以 locale 开头：

```text
/{locale}/courses
/{locale}/{course}
/{locale}/{course}/{lesson}
/{locale}/{course}/glossary
/{locale}/{course}/sources
```

例如：

```text
/zh/agent-skills-reuse/02-skill-metadata
/en/agent-skills-reuse/02-skill-metadata
/ja/agent-skills-reuse/02-skill-metadata
```

根路径 `/` 重定向到 `/en/courses`。默认英语有利于项目对外传播，但不代表英语内容比其他语言更完整。

当前未发布站点没有需要长期保留的公共旧链接。迁移后删除无 locale 的正式页面实现，避免 `/agent-skills-reuse/...` 与 locale-first 路由并存形成两套 canonical URL。

Next.js 使用 `app/[locale]/layout.tsx` 作为动态根布局，由路由参数生成正确的 `<html lang>`。根路径的重定向放在独立 route group 的 root layout 中。站内课程导航始终生成带 locale 的路径，不再使用 `?lang=zh`。

## 课程文件模型

课程按“课程 family → locale variant”组织：

```text
lessons/
  learn-agent-skills-reuse/
    logo.svg
    zh/
      README.md
      01-prompt-to-skill.md
      02-skill-metadata.md
      03-progressive-disclosure.md
      04-resources-and-boundaries.md
      05-testing-and-safety.md
      06-ship-a-skill.md
      glossary.json
      sources.md
      agentmentor.json
    en/
      README.md
      01-prompt-to-skill.md
      ...
    ja/
    ko/
    es/
    pt-BR/
```

约束如下：

- family 目录名决定公共 course slug：`learn-agent-skills-reuse` → `agent-skills-reuse`。
- locale 子目录名必须来自 locale registry。
- 同一 family 的课节文件名和课节 slug 在所有已发布语言中保持一致。
- 标题、正文、互动文字、术语表和来源说明可以本地化。
- `logo.svg` 属于课程 family，所有语言共享。
- 每个 locale variant 有独立 `agentmentor.json`，因为可读性、互动文案和课程质量必须分别审计。
- 每个 locale variant 有独立 `glossary.json`，术语解释、误区和干扰项使用该课程语言。
- 每个 locale variant 有独立 `sources.md`。来源 URL 可以相同，来源说明使用该课程语言，原始英文标题或原文证据可以保留。

`scanCourses` 改为扫描 family，再扫描其中的 locale variant。运行时数据模型分为：

- `CourseFamily`：稳定 slug、共享 logo、所有可发布语言。
- `CourseVariant`：locale、标题、简介、课节、术语表、来源和质量状态。

页面只加载当前 locale 的 `CourseVariant`，语言菜单从同一 `CourseFamily` 的其他可发布 variant 自动生成。

## 什么翻译，什么保持英文

### 本地化内容

- 课程标题、目标、正文解释和总结。
- 导航、面包屑、页内目录、按钮、反馈和无障碍标签。
- 练习题干、教学提示、参考答案与普通选项。
- 对代码或 Skill 示例的解释文字。
- 术语定义、常见误区和课程来源说明。

### 保持英文的 Skill 实物

课程中的真实 Agent Skill 交付物保持英文：

- `SKILL.md` 内容。
- YAML frontmatter 字段和值。
- `name`、`description` 和执行指令。
- 文件名、目录、相对路径和命令。
- `references/`、`assets/`、`scripts/` 中展示的真实产物。
- 测试矩阵中用于验证英文 Skill 触发的真实 prompt。

代码、命令、API 名称和官方术语也不做机械翻译。

为了避免用户截图中那种突兀的中英混排，教学 UI 不直接把一整段英文 Skill 内容当作没有说明的中文选项。采用“本地语言角色说明 + 英文原文”的形式：

```text
泛化描述：`Helps with customer content.`

明确能力与触发条件：`Turns customer interview transcripts ...`
```

这样既保持 Skill 实物真实，也让学习者先看懂每个选项在比较什么。其他语言版本遵循同一规则。

## 语言切换器

语言切换器位于顶部导航右侧、主题按钮之前。按钮直接显示当前语言的本地名称和 chevron，例如：

```text
简体中文⌄
English⌄
日本語⌄
```

交互要求：

- 桌面端显示完整当前语言名称。
- 移动端仍显示可理解的短名称，不退化成“文 A”或纯地球图标。
- 菜单中的语言使用各自本地名称。
- 当前语言有选中状态，但不是可点击的重复链接。
- 键盘可打开、移动和关闭菜单；按钮和菜单有明确的无障碍名称。
- 切换保留当前页面：课程页到课程页、课节到同 slug 课节、术语表到术语表、来源页到来源页。
- 菜单只列当前页面真实存在的翻译。
- 如果某语言只有课程首页而没有当前课节，它不会出现在该课节菜单里，也不会悄悄把读者送回课程首页。

删除导航中的“当前 Agent 课程 / Current Agent courses”。品牌、语言、官网外链和主题切换已经足够表达导航职责。

## 课程库

每个 locale 有自己的课程库，例如 `/ja/courses`。课程库只显示该 locale 已发布的课程 variant，不在同一页面混排六种语言的课程卡。

页面标题、介绍、空状态和 Agent Mentor CTA 全部来自 locale registry 的站点文案。domain 和 tag 可以本地化显示，但课程 family slug 保持稳定。

## SEO 与发现

每个可发布页面生成：

- 指向自身的 canonical URL。
- 仅包含真实同页翻译的 `alternates.languages`。
- 指向英文同页版本的 `x-default`；如果英文版本不存在，则不生成 `x-default`。
- 与当前 locale 一致的标题和 description。
- 正确的 `<html lang>`。

Sitemap 收录六种语言下所有可发布课程、课节、术语表和来源页。相同 family 的各语言页面通过 `hreflang` 互相连接，但每个页面仍有自己的 canonical。

不使用自动跳转覆盖读者明确选择的 locale。根路径可以进入默认英语；一旦 URL 已含 locale，就以 URL 为准。

## 课程生成与质量闸门

`generate-course-from-topic` 的路径契约改为：

```text
lessons/learn-<course-slug>/<locale>/
```

生成一门新课时先完成一个 source locale。翻译属于同一 course family 的新 variant，不创建新的 course slug。

质量闸门分两层：

### 单语言课程检查

对每个 locale variant 分别运行现有检查：

- 课程文件完整。
- 引用可解析、来源 URL 可达。
- glossary 完整且能命中正文。
- 互动块和练习结构有效。
- `agentmentor.json` 质量状态真实。
- 页面语言与 README `lang` 一致。

### course family 一致性检查

新增 family 检查：

- locale 子目录合法。
- 已发布 variant 的课节文件集合一致。
- 每种语言都包含 README、课节、sources、glossary 和 agentmentor manifest。
- Skill 实物块在各语言之间保持英文且没有被误翻。
- 内部 Markdown 链接落在当前 locale variant。
- 同页语言映射不产生死链接。
- 六种首发语言全部完成后，课程才可作为“六语课程”发布。

代码样例不要求逐字完全相同，因为注释可能属于教学层；但 `SKILL.md`、frontmatter、路径和命令示例应经过稳定块检查。

## 文字审计结论

现有中文六讲整体没有明显 AI 腔，不做大面积重写。`humanizer-zh` 与 `dbs-ai-check` 命中的主要是弱信号：

- 六讲都使用“总结与下一步”作为相同收束标题。
- 少量段落以相似的“本讲 / 下一讲”句式结束。
- 第 2 讲互动缺少中文角色说明，英文 `description` 直接成为整段选项。

实施时只做以下修订：

- 给英文 Skill 选项增加当前页面语言的角色说明。
- 打散六讲完全相同的结尾标题和收束节奏。
- 保留课程现有观点、示例密度和技术口吻。

## 验证

完成标准包括：

- locale registry 和路径构造单元测试。
- course family 扫描、variant 解析和缺失页面判断测试。
- 六种课程库、课程页、课节、术语表和来源页静态生成。
- 语言菜单只显示同页存在版本的测试。
- 语言切换保持 course、lesson 或附属页面 slug 的测试。
- canonical、`hreflang`、`x-default`、sitemap 和 `<html lang>` 测试。
- 无 `?lang=` 课程链接。
- 无“当前 Agent 课程 / Current Agent courses”。
- `npm test`、`npm run build` 和 `npm run cf:build` 通过。
- 用 `agent-browser` 验收桌面和移动端：
  - 六种语言菜单；
  - 同课节切换；
  - 右侧页内导航；
  - 互动块；
  - Skill 英文实物与本地语言讲解；
  - 复制代码、复制课节、选中文字复制给 Agent；
  - glossary 和 sources；
  - 无失效语言链接。

不部署，不读取私人 token。交付停在当前功能分支的代码、测试、构建和浏览器验收。
