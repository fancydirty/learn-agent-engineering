# Agent 课程矩阵设计（八门课）

## 目的

把 `learn.agentmentor.dev` 从"一门课六语言"扩成"八门课六语言"的开源课程站，形成一条从入门到从业者的能力阶梯，为 `agentmentor.dev` 提供持续的获客与转化入口。

## 竞品定位（实测，2026-08-22）

参考项目 `walkinglabs/learn-harness-engineering`（13.7k stars，实测其站点与正文）：

| 维度 | 竞品 | 本项目 |
|---|---|---|
| 规模 | 14 讲 + 8 项目 + 资料库，单一主题 | 8 门课，覆盖能力阶梯 |
| 语言 | 15 种 | 6 种（en/zh/ja/ko/es/pt-BR） |
| 单讲篇幅 | ~4300 字 | 相近 |
| 教学互动 | 实测 1 个（主题切换按钮，非教学互动） | 每讲 0–2 个确定性互动块 |
| 术语系统 | 正文内"核心概念"列表 | 独立 glossary + 正文悬浮卡 |
| 语言切换 | 正文顶部手写 `English Version →` | 结构化同页语言菜单 |
| 质量闸门 | 无公开闸门 | guard + interaction-report + family-guard |

**结论**：不回避同赛道，正面比教学质量与产能。竞品证明了这批读者存在且愿意读；它的弱点（无真互动、无术语系统、论证注水、单一主题）正是本项目产课 skill 的强项。手写仓库无法维持 8 门课 × 6 语言，这是结构性差异。

**竞品的可借鉴点**：讲题使用「为什么 X 会失败」的提问式标题，直击痛点，利于点击与 SEO。本项目采纳这一命题风格，但要求每个"为什么"都由真实来源支撑。

## 能力阶梯

三级递进，读完一级自然进入下一级：

```
L1 入门（2 门）    第一次让 agent 真正干活 → 把需求说清楚
L2 工作流（3 门）  复用工作流 → 管住上下文 → 验证产出
L3 工程（3 门）    让仓库可被读懂 → 接入工具 → 编排多 agent
```

## 八门课清单

课程 slug 均为 `learn-<slug>`，公开路由为 `/{locale}/{slug}`。已交付课程标注为现存。

### L1-1 · `agent-first-real-task`
- **标题方向**：Your First Real Agent Task
- **目标读者**：用过 AI 聊天、没让 agent 独立完成过真实任务的人。
- **终点任务**：在自己的真实目录里，让 agent 独立完成一个多步骤任务，并用一份交接记录证明它做完了什么。
- **核心讲题**：委托与聊天的区别；任务边界；agent 会在哪里卡住；如何读它的动作而不只读结论；何时中断。
- **边界**：不讲任何具体产品的 UI 步骤（易过时）；不讲编程。
- **不与谁重叠**：不进入 SKILL.md（L2-1）、不进入仓库结构（L3-1）。

### L1-2 · `brief-an-agent`
- **标题方向**：Why Agents Build the Wrong Thing
- **目标读者**：agent 能跑起来，但产出经常"不是我要的"的人。
- **终点任务**：把一个真实的模糊需求改写成含验收条件的 brief，并用它跑通一次 agent 任务。
- **核心讲题**：欠规约（underspecification）；agent 默认不追问；验收条件先于实现；示例优于形容词；负向边界。
- **来源钩子**：Ambig-SWE（arXiv 2502.13069，ICLR 2026 poster，Vijayvargiya 等）—— SWE-Bench Verified 的欠规约变体，实测模型难以区分"说清楚了"与"没说清楚"的指令；一旦发生交互，模型能从用户处获得关键信息并显著提升解决率。**已核验摘要与 OpenReview 收录页**。二手博客流传的"提升至多 74%"未在摘要中出现，引用前必须从 PDF 正文取得确切数值与实验设定，取不到就不写数字，只写方向性结论。
- **边界**：不讲提示词技巧清单；聚焦"说清需求"这一件事。

### L2-1 · `agent-skills-reuse`（现存，中文源，已六语交付）
- **终点任务**：产出一个可安装、可复测的 Skill 文件夹。
- **本轮动作**：不重写。补记 `sourceLocale: "zh"`；修 5 条 pt-BR 术语警告。

### L2-2 · `agent-context-engineering`
- **标题方向**：Why Longer Context Makes Agents Worse
- **目标读者**：长任务里 agent 开始遗忘、重复、偏航的使用者。
- **终点任务**：为一个真实的长任务设计上下文预算，并用外部笔记 + 压缩把它跑完。
- **核心讲题**：上下文腐化；write/select/compress/isolate 四杠杆；compaction 何时失效；结构化笔记；子代理隔离为何是上下文手段而非并发手段。
- **一手来源**：Anthropic《Effective context engineering for AI agents》《Effective harnesses for long-running agents》；Chroma context rot 研究；Drew Breunig 四种失效模式。
- **与竞品关系**：竞品第 5 讲触及跨会话连续性；本课不讲 harness 构件，讲上下文本身的经济学与四杠杆决策。

### L2-3 · `verify-agent-output`
- **标题方向**：Why Agents Declare Victory Too Early
- **目标读者**：已经在用 agent 产出、但不知道何时能信任产出的人。
- **终点任务**：为自己的真实项目建立一套三层验证闸门，并用它推翻一次 agent 的"已完成"声明。
- **核心讲题**：过早完成声明的机制；单测通过 ≠ 任务完成；外部化终止判定；分层验证；可操作的失败反馈。
- **来源钩子**：Sonar 2026 State of Code —— 96% 开发者不完全信任未经人工介入的 AI 生成代码。
- **与竞品关系**：**正面同题**（竞品第 9 讲）。差异化要求：竞品用一篇 2017 年图像分类模型校准论文论证 2026 年 coding agent 谎报完成——本课禁止此类跨域拉权威，必须给出可在读者自己项目上复跑的三层闸门与一个判断类互动块。

### L3-1 · `agent-readable-repo`
- **标题方向**：Make Your Repo Readable to Agents
- **目标读者**：团队或个人项目里已经多人/多工具用 agent 的开发者。
- **终点任务**：为一个真实仓库写出 AGENTS.md 并验证 agent 行为发生了可观测的变化。
- **核心讲题**：AGENTS.md 开放标准；一个巨型指令文件为何失败；嵌套与就近优先；写命令而非形容词；指令冲突与优先级。
- **一手来源**：agents.md 规范；Linux Foundation / Agentic AI Foundation 治理；60,000+ 仓库采用；AAIF 五轮基准实测文章。
- **与竞品关系**：竞品第 3、4 讲相邻。差异化：本课以开放标准与可验证行为变化为主线，不讲 harness 全套构件。

### L3-2 · `agent-tools-mcp`
- **标题方向**：Giving Agents Real Tools
- **目标读者**：想让 agent 接触真实系统（数据、API、内部服务）的开发者。
- **终点任务**：接入或最小实现一个 MCP server，并完成一次带权限边界的真实工具调用。
- **核心讲题**：工具与技能的区别；MCP 客户端/服务端模型；2026-07-28 规范转为无状态核心的含义；Tasks 扩展与长任务；工具描述如何决定调用正确率；权限与注入风险。
- **一手来源**：modelcontextprotocol.io 规范与 2026-07-28 发布说明；Anthropic MCP 公告。
- **时效风险**：MCP 规范演进快，须在 `topicCurrency` 明确记录规范版本与失效风险。

### L3-3 · `orchestrating-agents`
- **标题方向**：When One Agent Isn't Enough
- **目标读者**：单 agent 已经用熟、任务开始超出单会话承载的人。
- **终点任务**：把一个真实的大任务拆成可并行的子任务，编排执行，并给出一份可复核的汇总。
- **核心讲题**：何时不该上多 agent；主从与隔离上下文；子代理返回摘要而非全过程；串行与并行的取舍与失败模式；汇总者如何避免二次幻觉。
- **一手来源**：Anthropic 多代理研究系统（主 agent + 子 agent，子代理返回 1000–2000 token 摘要）；Anthropic《Building effective agents》"先用最简方案"。
- **边界**：不讲具体编排框架 API（易过时），讲决策与失败模式。

## 每门课的统一规格

沿用 `generate-course-from-topic` 现有契约，不新增：

- 6 讲（L1 课程可 5 讲），每讲 ≤7 个新概念，入门讲压到 3–4 个。
- `README.md` + `NN-*.md` + `sources.md` + `glossary.json`（约 60 词）+ `agentmentor.json` + family 根 `logo.svg`。
- 每讲 0–2 个互动块，`agentmentor-live` 至多 1 且仅用于前端可见效果。
- 每门课至少一个 `agentmentor-action` 或练习复制入口回到 agent 对话。
- 六维评分无一项低于 4，`acceptanceReview.decision` 必须为 `ship`。

## 质量红线（在现有闸门之上新增）

1. **引用必须切题**：每条 `[^Sn]` 必须支撑它所在的那句话。禁止用相邻领域的论文或权威为当前论断背书（反例：用 2017 年图像分类的模型校准论文论证 2026 年 coding agent 谎报完成）。guard 能查引用可达性，查不了切题性，此项由 acceptance pass 人工判定，并在 `acceptanceReview` 中逐条留痕。
2. **收束标题各讲不同**：禁止六讲共用同一个"总结与下一步"式标题。
3. **无跨域断言**：版本、价格、默认行为等易变事实必须写明版本边界，不得绝对化。
4. **术语必须在正文逐字出现**：glossary 每个 term 在本变体正文中逐字可见，否则悬浮卡挂不上。

## 交付节奏

**先全部英文，再统一翻译。**

- 阶段 A：7 门新课的英文版全部写完并过闸。课程间的术语、叙事、交叉引用在此阶段对齐。
- 阶段 B：7 门新课 × 5 语言 = 35 个变体，统一翻译。
- 理由：跨课程术语一致性只有在英文全部定稿后才能一次校准；先翻译会导致返工 5 倍放大。

## Stage 3 大纲门禁的处理

产课流程要求大纲先经人工确认再写正文。本设计文档中的八门课清单（讲题、终点任务、边界）即为**预先确定的大纲输入**，子代理据此直接进入 Stage 4，不再逐门回头确认。

按流程要求，每门课的 `agentmentor.json.qualitySelfReview.weakestPoints` 必须如实记录：大纲由设计文档预先确定，未经逐门人工确认。这是 skill 明文允许的非交互路径，但必须留痕。

## 执行编排

- 子代理**串行**执行，一次一门课。并发多个子代理会打满同一 API 网关（已实测：五并发时全部 500）。
- 每门课交付后，由主会话独立复核：`ls` 确认文件真实落盘、亲自跑 guard 与 interaction-report，不采信子代理的完成汇报（已实测出现过汇报与磁盘不符）。
- 每门课一个提交。

## 本轮附带修复的三个遗留项

1. **`bilingualLang` 扩为六语**：复制给 Agent 的 prompt 骨架（`prompt-copy`、`mentor-actions`、`interactive-blocks`、`learning-interactions`、`live-stats`、`code-exercises`）目前仅 zh/en，非中文一律回退英文。扩为六语后移除 `bilingualLang`。
2. **pt-BR 5 条术语警告**：`limite de arquivos`、`limite de escrita`、`limite de rede` 未在正文逐字出现；`falso gatilho`、`gatilho perdido` 仅出现在 README（guard 正文扫描不含 README）。修法是在对应课节正文自然写入这些短语。
3. **guard 占位符正则加词边界**：现为 `/<[^>]+>|TODO|TBD|待补|待定|xxx/i`，按子串匹配，导致罗曼语族正常词汇（todos、metodologia）被误判为未填占位符。改为词边界匹配，并保留对真实占位符的拦截能力。

## 不做的事

- 不引入账号、支付、托管推理、站内 AI 问答、复习调度、音频。
- 不为课程引入运行时翻译。
- 不新增互动块类型；沿用现有九种。
- 不重写现存的 `agent-skills-reuse` 中文源课程。

## 验收标准

- 8 门课 × 6 语言 = 48 个变体全部通过 `course-guard` 与 `course-interaction-report`（无 warning）。
- `course-family-guard` 对 8 个 family 全部通过。
- `npm test`、`npm run build`、`npm run cf:build` 通过。
- 课程库页在六种语言下正确分组展示 8 门课。
- agent-browser 抽样验收：桌面与移动端、跨课程语言切换、互动块作答、复制给 Agent。
