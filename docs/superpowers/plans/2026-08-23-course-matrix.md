# Agent 课程矩阵实施计划（八门课 × 六语言）

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把课程站从"1 门课六语言"扩到"8 门课六语言"，形成入门→工作流→工程的能力阶梯。

**Architecture:** 复用现有 `generate-course-from-topic` 七阶段产课流程与 family/locale 目录模型。7 门新课先全部产出英文版并过闸，术语对齐后统一翻译 5 个语言变体。子代理串行执行，主会话逐门独立复核。

**Tech Stack:** Markdown + JSON 课程内容、Next.js 16 阅读器、`course-guard.mjs` / `course-interaction-report.mjs` / `course-family-guard.mjs` 三道闸门。

**Spec:** `docs/superpowers/specs/2026-08-23-course-matrix-design.md`

---

## 全局约束（每个子代理都必须遵守）

- **禁止使用 AskUserQuestion 或任何交互式提问。** 无人值守运行，遇到判断分叉时自行按证据决策，并把决策与理由记入 `agentmentor.json.qualitySelfReview`。
- **时效铁律**：当前 2026 年 8 月。不得凭训练知识写事实断言；每条断言必须来自本次实时抓取的一手源。查不到就删，不许用"通常""一般来说"软化保留。
- **检索能力**：Brave/Tavily/Exa API key 在 `~/workspace/token.txt`；`agent-browser`（有状态浏览器）；`agent-reach`；WebFetch。至少用两种独立来源交叉验证关键事实。
- **引用切题**：每条 `[^Sn]` 必须支撑它所在那句话，禁止跨域拉权威撑场面。
- **英文优先**：7 门新课一律先写 `en/` 变体。
- **路径**：`agent-mentor/skills/generate-course-from-topic/lessons/learn-<slug>/en/`
- **落盘自证**：报告完成前必须 `ls -la` 确认每个文件真实存在且大小合理。
- **每门课独立提交**，提交信息说明课程 slug 与来源核验情况。

## 每门课的标准交付物

`README.md`、`01-*.md` ~ `06-*.md`（L1 课程可 5 讲）、`sources.md`、`glossary.json`（约 60 词）、`agentmentor.json`，以及 family 根的 `logo.svg`。

## 每门课的标准验收命令

```bash
cd /Users/dirtyfancy/projects/agent-mentor-open-courses
node scripts/course-guard.mjs agent-mentor/skills/generate-course-from-topic/lessons/learn-<slug>/en
node scripts/course-interaction-report.mjs agent-mentor/skills/generate-course-from-topic/lessons/learn-<slug>/en
node scripts/course-family-guard.mjs agent-mentor/skills/generate-course-from-topic/lessons/learn-<slug>
```

期望：`GUARD ok ✓`、`warnings: - none`、`FAMILY GUARD ok ✓`（family guard 会因缺其他 locale 报 warning，属正常）。

---

### Task 0: 清理三个遗留项

**Files:**
- Modify: `scripts/course-guard.mjs`（占位符正则）
- Modify: `lib/locales.ts`（移除 `bilingualLang`）
- Modify: `lib/prompt-copy.ts`、`lib/mentor-actions.ts`、`lib/interactive-blocks.ts`、`lib/learning-interactions.ts`、`lib/live-stats.ts`、`lib/code-exercises.ts`（扩六语）
- Modify: `agent-mentor/.../learn-agent-skills-reuse/pt-BR/0*.md`（术语入正文）
- Modify: `agent-mentor/.../learn-agent-skills-reuse/*/agentmentor.json`（加 `sourceLocale`）
- Test: `tests/course-localization.test.ts`

- [ ] **Step 1: 写占位符正则的失败测试**

在 `tests/course-localization.test.ts` 追加：

```ts
import { hasPlaceholderText } from "../scripts/course-guard.mjs";

describe("placeholder detection", () => {
  it("flags real placeholders", () => {
    expect(hasPlaceholderText("still <fill this in>")).toBe(true);
    expect(hasPlaceholderText("TODO: write this")).toBe(true);
    expect(hasPlaceholderText("TBD")).toBe(true);
    expect(hasPlaceholderText("待补")).toBe(true);
  });

  it("does not flag Romance-language words containing todo", () => {
    expect(hasPlaceholderText("Empilhar todos os sinônimos")).toBe(false);
    expect(hasPlaceholderText("una metodologia completa")).toBe(false);
    expect(hasPlaceholderText("leen todos los recursos")).toBe(false);
  });
});
```

Run: `npx vitest run tests/course-localization.test.ts`
Expected: FAIL —— `hasPlaceholderText` 尚未导出。

- [ ] **Step 2: 实现词边界正则并导出**

在 `scripts/course-guard.mjs` 中，把私有的 `hasPlaceholder` 改为导出的 `hasPlaceholderText`，正则改为词边界匹配：

```js
// Word-boundary matching: substring matching flagged Romance-language words
// (todos, metodologia) as unfilled placeholders. \b works for the ASCII
// markers; the CJK markers keep substring semantics since CJK has no word breaks.
const PLACEHOLDER_RE = /<[^>]+>|\bTODO\b|\bTBD\b|待补|待定|\bxxx\b/i;

export function hasPlaceholderText(s) {
  return PLACEHOLDER_RE.test(s);
}

function hasPlaceholder(s) {
  return hasPlaceholderText(s);
}
```

- [ ] **Step 3: 跑测试确认通过**

Run: `npx vitest run tests/course-localization.test.ts`
Expected: PASS

- [ ] **Step 4: 把 pt-BR 的 5 个术语写进正文**

这三个术语当前不在 pt-BR 正文中逐字出现：`limite de arquivos`、`limite de escrita`、`limite de rede`。它们属于第 4 讲（资源与执行边界）。在 `pt-BR/04-resources-and-boundaries.md` 讲解脚本边界的段落里，自然写入这三个短语（不是硬塞词表，而是在描述三类边界时正好用这些说法）。

`falso gatilho`、`gatilho perdido` 目前只出现在 `README.md`，而 guard 的正文扫描只读 `NN-*.md`。它们属于第 5 讲（触发测试），在 `pt-BR/05-testing-and-safety.md` 描述误触发与漏触发时写入这两个短语。

验证：

```bash
node scripts/course-guard.mjs agent-mentor/skills/generate-course-from-topic/lessons/learn-agent-skills-reuse/pt-BR --skip-url-check
```

Expected: `GUARD ok ✓` 且警告区不再出现这 5 条 `悬浮卡挂不上`。

- [ ] **Step 5: 给六个 locale 的 manifest 加 sourceLocale**

现存课程的源语言是 zh，其余五个是译本。在每个 `agentmentor.json` 顶层加一个字段：

```json
"sourceLocale": "zh"
```

六个变体都写 `"zh"`（记录的是这个 family 的源语言，不是当前变体的语言）。

- [ ] **Step 6: 把 Agent 载荷文案扩成六语**

`lib/locales.ts` 中的 `bilingualLang` 是一个临时回退，让 zh 以外的语言拿英文 Agent prompt 骨架。现在补齐六语并移除它。

逐个处理这六个文件：`lib/prompt-copy.ts`、`lib/mentor-actions.ts`、`lib/interactive-blocks.ts`、`lib/learning-interactions.ts`、`lib/live-stats.ts`、`lib/code-exercises.ts`。

每个文件里都有形如 `const COPY: Record<BilingualLang, {...}> = { zh: {...}, en: {...} }` 的声明。为每个补上 `ja`、`ko`、`es`、`pt-BR` 四份翻译，类型改回 `Record<Locale, ...>`，并把 `COPY[bilingualLang(lang)]` 改回 `COPY[lang]`。

翻译时注意：这些字符串会拼进交给 Agent 的 prompt，不是页面 UI。字段名、代码、路径保持英文；只翻译自然语言说明部分。

改完后从 `lib/locales.ts` 删除 `bilingualLang` 与 `BilingualLang`。

验证无残留：

```bash
rg -n "bilingualLang|BilingualLang" lib/ || echo "clean"
```

- [ ] **Step 7: 全量校验**

```bash
npm test
npm run build
node scripts/course-family-guard.mjs agent-mentor/skills/generate-course-from-topic/lessons/learn-agent-skills-reuse
```

Expected: 测试全过、构建成功、`FAMILY GUARD ok ✓`。

- [ ] **Step 8: 提交**

```bash
git add -A lib scripts tests agent-mentor
git commit -m "fix: clear three localization follow-ups

Word-boundary placeholder matching (Romance words containing todo no
longer read as unfilled placeholders), six-locale Agent prompt payloads
replacing the zh/en bilingualLang fallback, pt-BR glossary terms written
into lesson prose so hover cards attach, and an explicit sourceLocale on
every variant manifest."
```

---

### Task 1: 课程 `agent-first-real-task`（L1-1，英文）

**Files:**
- Create: `agent-mentor/skills/generate-course-from-topic/lessons/learn-agent-first-real-task/en/README.md`
- Create: `.../en/01-*.md` 至 `.../en/05-*.md`（5 讲）
- Create: `.../en/sources.md`、`.../en/glossary.json`、`.../en/agentmentor.json`
- Create: `.../learn-agent-first-real-task/logo.svg`

**课程规格（来自设计文档 L1-1）：**
- 目标读者：用过 AI 聊天、但没让 agent 独立完成过真实任务的人。
- 终点任务：在自己的真实目录里让 agent 独立完成一个多步骤任务，并产出一份交接记录证明它做了什么。
- 讲题方向：委托与聊天的区别；任务边界怎么划；agent 通常在哪里卡住；如何读它的动作而非只读结论；何时该中断。
- 边界：不讲任何产品的 UI 步骤；不讲编程；不进入 SKILL.md 或仓库结构（那是 L2-1 与 L3-1）。
- 这是入门课：每讲压到 3–4 个新概念。

- [ ] **Step 1: 读产课流程**

按顺序读：`agent-mentor/skills/generate-course-from-topic/SKILL.md`、`course-authoring-guide.md`、`docs/learner-model-contract.md`、`docs/interaction-selection-guide.md`、`docs/course-quality-rubric.md`、`templates/` 下的全部模板。另读已交付的 `lessons/learn-agent-skills-reuse/en/` 作为质量基准。

- [ ] **Step 2: Stage 2 实时抓源**

先读 `agent-learning-sources.md` 的注册表，再实时抓取一手源。本课需要的证据类型：agent 与聊天助手的行为差异、agent 在真实任务中的典型失败模式、可观测的中断/接管时机。

至少 5 个来源，优先官方文档与一手工程文。每条都要当次打开确认现状，不得凭记忆。关键事实用两个独立来源交叉验证。

`sources.md` 顶部记录用到的注册表 id：`<!-- registry: An, An -->`。

- [ ] **Step 3: Stage 3 大纲（不回头确认）**

按设计文档给定的讲题方向定 5 讲，构建先修 DAG，每讲 3–4 个新概念。不要停下来找人确认——把"大纲由设计文档预先确定、未经逐门人工确认"写进 `agentmentor.json.qualitySelfReview.weakestPoints`。

- [ ] **Step 4: 先落最小完整骨架**

一次性创建全部 10 个文件（README、5 讲、sources、glossary、agentmentor、logo），内容可粗，但结构必须完整。立即 `ls -la` 确认它们真的在目标目录里。

- [ ] **Step 5: Stage 4 写正文**

用 `templates/lesson-template.md`。每讲从读者的真实失败或决策开场，具体到抽象，含 worked example → faded example，收尾是读者能对 agent 做的一个动作。

每讲收束标题必须各不相同（禁止五讲共用一个"Summary and next steps"）。

互动块每讲 0–1 个，全课至少一个 `agentmentor-action`。读 `docs/interaction-selection-guide.md` 再决定用哪种块。

- [ ] **Step 6: Stage 6 练习**

每讲的练习含：做法引导、可量化的完成标准、参考答案、渐进提示。练习指向读者自己的 IDE/终端/纸笔，不假设内嵌运行环境。

- [ ] **Step 7: 跑闸门并修到干净**

```bash
cd /Users/dirtyfancy/projects/agent-mentor-open-courses
node scripts/course-guard.mjs agent-mentor/skills/generate-course-from-topic/lessons/learn-agent-first-real-task/en
node scripts/course-interaction-report.mjs agent-mentor/skills/generate-course-from-topic/lessons/learn-agent-first-real-task/en
```

Expected: `GUARD ok ✓` 且 `warnings: - none`。逐条修完所有 violation 与 warning。

注意 glossary 的每个 term 必须在正文逐字出现，写一个脚本自查。

- [ ] **Step 8: Stage 5 验收自评**

如实填 `qualitySelfReview`（含至少 3 条弱点）与 `acceptanceReview`（六维打分、终点任务、逐块互动说明、来源复核）。六维任一低于 4 就回去改课，不要靠调分过关。`decision` 必须是 `ship`。

- [ ] **Step 9: 站点构建验证**

```bash
npm test && npm run build
```

Expected: 测试全过；构建产物中出现 `/en/agent-first-real-task` 及其课节路由。

- [ ] **Step 10: 提交**

```bash
git add -A agent-mentor
git commit -m "feat: add the first-real-agent-task course (en)"
```

---

### Task 2: 课程 `brief-an-agent`（L1-2，英文）

同 Task 1 的十步流程，替换课程规格如下：

- 目标读者：agent 能跑起来、但产出经常"不是我要的"的人。
- 终点任务：把一个真实的模糊需求改写成含验收条件的 brief，并用它跑通一次 agent 任务。
- 讲题方向：欠规约；agent 默认不主动追问；验收条件先于实现；示例优于形容词；负向边界。
- 讲数：5 讲，每讲 3–4 个新概念。
- **必查来源**：Ambig-SWE（arXiv 2502.13069，ICLR 2026 poster）。摘要与 OpenReview 收录页已核实。二手博客流传的"提升至多 74%"未出现在摘要中——必须从 PDF 正文取得确切数值与实验设定才能引用，取不到就只写方向性结论，不写数字。
- 边界：不写提示词技巧清单；聚焦"把需求说清楚"这一件事。
- 与 L1-1 的边界：L1-1 讲怎么委托一次任务，本课讲怎么把需求说到 agent 不会做错。

验收命令中的 slug 为 `learn-brief-an-agent`。

---

### Task 3: 课程 `agent-context-engineering`（L2-2，英文）

同 Task 1 的十步流程，替换课程规格如下：

- 目标读者：长任务里 agent 开始遗忘、重复、偏航的使用者。
- 终点任务：为一个真实长任务设计上下文预算，并用外部笔记 + 压缩把它跑完。
- 讲题方向：上下文腐化；write/select/compress/isolate 四杠杆；compaction 何时失效；结构化笔记；子代理隔离作为上下文手段。
- 讲数：6 讲。
- **必查来源**：Anthropic《Effective context engineering for AI agents》《Effective harnesses for long-running agents》、Chroma 的 context rot 研究、Drew Breunig 的四种失效模式分类。全部当次打开核实。
- 与竞品边界：竞品第 5 讲触及跨会话连续性；本课不讲 harness 构件，只讲上下文本身的经济学与四杠杆决策。
- 与 L3-3 的边界：本课把子代理当作**上下文隔离手段**来讲；L3-3 才讲编排与并行。

验收命令中的 slug 为 `learn-agent-context-engineering`。

---

### Task 4: 课程 `verify-agent-output`（L2-3，英文）

同 Task 1 的十步流程，替换课程规格如下：

- 目标读者：已在用 agent 产出、但不知道何时能信任产出的人。
- 终点任务：为自己的真实项目建立三层验证闸门，并用它推翻一次 agent 的"已完成"声明。
- 讲题方向：过早完成声明的机制；单测通过 ≠ 任务完成；外部化终止判定；分层验证；可操作的失败反馈。
- 讲数：6 讲。
- **必查来源**：Sonar 2026 State of Code 调查（96% 开发者不完全信任未经人工介入的 AI 生成代码）——必须找到 Sonar 原始报告页核实该数字与口径，不得只引二手报道。
- **本课是与竞品的正面同题**（竞品第 9 讲 "Why do agents declare victory too early?"）。差异化是硬要求：
  - 竞品用一篇 2017 年图像分类的模型校准论文论证 2026 年 coding agent 谎报完成。**本课禁止这类跨域拉权威。**
  - 必须给出可在读者自己项目上复跑的三层闸门。
  - 必须有一个判断类互动块（`agentmentor-check` 或 `agentmentor-order`），让读者判断"这个完成声明该不该信"。
- 与 L1-1 的边界：L1-1 讲怎么读 agent 的动作；本课讲怎么建立不依赖人工阅读的验证闸门。

验收命令中的 slug 为 `learn-verify-agent-output`。

---

### Task 5: 课程 `agent-readable-repo`（L3-1，英文）

同 Task 1 的十步流程，替换课程规格如下：

- 目标读者：团队或个人项目里已有多人/多工具用 agent 的开发者。
- 终点任务：为一个真实仓库写出 AGENTS.md，并验证 agent 行为发生了可观测变化。
- 讲题方向：AGENTS.md 开放标准；一个巨型指令文件为何失败；嵌套与就近优先；写命令而非形容词；指令冲突与优先级。
- 讲数：6 讲。
- **必查来源**：agents.md 官方规范站、Linux Foundation / Agentic AI Foundation 的治理声明、当前采用规模、AAIF 的多轮基准实测文章。采用数字（如"60,000+ 仓库"）必须当次核实并在正文标注核实日期。
- 与竞品边界：竞品第 3、4 讲相邻。本课以开放标准与可验证的行为变化为主线，不讲 harness 全套构件。
- 时效风险：工具支持矩阵变化快，须在 `topicCurrency.staleRisk` 说明。

验收命令中的 slug 为 `learn-agent-readable-repo`。

---

### Task 6: 课程 `agent-tools-mcp`（L3-2，英文）

同 Task 1 的十步流程，替换课程规格如下：

- 目标读者：想让 agent 接触真实系统（数据、API、内部服务）的开发者。
- 终点任务：接入或最小实现一个 MCP server，并完成一次带权限边界的真实工具调用。
- 讲题方向：工具与技能的区别；MCP 客户端/服务端模型；无状态核心改版的含义；Tasks 扩展与长任务；工具描述如何决定调用正确率；权限与注入风险。
- 讲数：6 讲。
- **必查来源**：modelcontextprotocol.io 规范与最新版本发布说明、Anthropic 的 MCP 公告。**特别注意**：MCP 于 2026-07-28 发布了一次重大修订（转为无状态协议核心，新增 Extensions 框架、Tasks、MCP Apps）。写作时必须确认当前最新规范版本号与状态，不得假定 2026-07-28 仍是最新。
- 时效风险：MCP 规范演进极快，`topicCurrency` 必须写明所依据的规范版本与失效条件。
- 与 L2-1 的边界：L2-1 讲 Skill（给 agent 工作流）；本课讲 MCP（给 agent 外部能力）。第 1 讲必须讲清这两者的区别。

验收命令中的 slug 为 `learn-agent-tools-mcp`。

---

### Task 7: 课程 `orchestrating-agents`（L3-3，英文）

同 Task 1 的十步流程，替换课程规格如下：

- 目标读者：单 agent 已用熟、任务开始超出单会话承载的人。
- 终点任务：把一个真实大任务拆成可并行的子任务，编排执行，并给出可复核的汇总。
- 讲题方向：何时不该上多 agent；主从与隔离上下文；子代理返回摘要而非全过程；串行与并行的取舍与失败模式；汇总者如何避免二次幻觉。
- 讲数：6 讲。
- **必查来源**：Anthropic 多代理研究系统（主 agent + 子 agent，子代理返回约 1000–2000 token 摘要）、Anthropic《Building effective agents》中"先用最简方案"的立场。当次核实。
- 边界：不讲具体编排框架的 API（易过时），讲决策与失败模式。
- 与 L2-2 的边界：L2-2 把子代理当上下文隔离手段；本课讲编排本身——拆分、并行、汇总、失败处理。
- **真实素材**：本项目自身的经验可作为案例——五个子代理并发打同一 API 网关导致全部失败、串行后稳定；以及子代理汇报"文件已写入"但磁盘上并不存在，因此需要独立复核。这是第一手的失败模式，比二手论述更有教学价值。

验收命令中的 slug 为 `learn-orchestrating-agents`。

---

### Task 8: 英文全量对齐复核

**Files:**
- Modify: 前七个任务产出的任意课程文件（按需）

- [ ] **Step 1: 跨课程术语一致性检查**

7 门新课 + 1 门现存课的 glossary 合并检查：同一个概念在不同课里是否用了不同术语，不同概念是否用了同一术语。

```bash
cd /Users/dirtyfancy/projects/agent-mentor-open-courses
python3 - <<'EOF'
import json, glob, collections
base="agent-mentor/skills/generate-course-from-topic/lessons"
terms=collections.defaultdict(list)
for p in glob.glob(f"{base}/learn-*/en/glossary.json"):
    course=p.split("/")[-3]
    for e in json.load(open(p)):
        terms[e["term"].lower()].append((course, e["def"][:60]))
for t,v in sorted(terms.items()):
    if len(v)>1:
        print(f"\n{t}:")
        for c,d in v: print(f"  {c}: {d}")
EOF
```

同一术语跨课出现时，确认定义一致；不一致就统一到最准确的那个。

- [ ] **Step 2: 交叉引用检查**

阶梯上相邻的课应该互相知道对方存在。确认每门课的 README 里，"这门课不覆盖 X"处的 X 确实由另一门课覆盖，且描述一致。

- [ ] **Step 3: 全量闸门**

```bash
for c in agent-first-real-task brief-an-agent agent-skills-reuse agent-context-engineering verify-agent-output agent-readable-repo agent-tools-mcp orchestrating-agents; do
  echo "=== $c ==="
  node scripts/course-guard.mjs agent-mentor/skills/generate-course-from-topic/lessons/learn-$c/en --skip-url-check 2>&1 | grep -E "^GUARD"
done
```

Expected: 八门课全部 `GUARD ok ✓`（`agent-skills-reuse` 的 en 是译本，同样应通过）。

- [ ] **Step 4: 课程库页验证**

```bash
npm run build
```

Expected: 构建成功，`/en/courses` 页面包含全部 8 门课。

- [ ] **Step 5: 提交**

```bash
git add -A agent-mentor
git commit -m "docs: align terminology and cross-references across the eight courses"
```

---

### Task 9 – 15: 七门新课的五语言变体

每门新课一个任务，串行执行。每个任务把该课的 `en/` 翻成 `zh`、`ja`、`ko`、`es`、`pt-BR` 五个变体。

**翻译规则**（每个子代理都必须遵守，与已交付课程一致）：

- 逐字保留：含 `name:` 与 `description:` 两行的围栏代码块（Skill 实物）必须与 en 逐字节一致；命令、路径、YAML/JSON 字段名、真实英文触发词。
- 逐字保留：互动块的 `id`、选项/条目/行列的 `id`、`correct` 标志、块的数量与顺序。
- 逐字保留：`sources.md` 的 URL、`## Sn` 块 id、`<!-- registry: ... -->` 注释、`authority:` 标签、引号内的 `key-fact` 行。
- 逐字保留：HTML 标记注释 `<!-- exercises -->` 等，以及内部相对链接。
- 翻译：教学正文、标题、练习题干/评分标准/答案/提示、互动块的 label/prompt/whyHere/copyPurpose/feedback/message、glossary 的 term/def/pitfall/distractor_rationale/deeper、`sources.md` 的 `supports:` 说明、`agentmentor.json` 的自然语言字段。
- 每讲收束标题各语言内部也必须各不相同。
- glossary 的每个 term 必须在该变体正文中逐字出现。
- `agentmentor.json` 的 `status.guardCommand` 指向该变体目录；`sourceLocale` 写 `"en"`。
- **占位符陷阱**：guard 的占位符正则在 Task 0 已改为词边界匹配，但仍需自查字符串中不含真实占位符。

**每个变体的验收：**

```bash
node scripts/course-guard.mjs .../learn-<slug>/<locale> --skip-url-check
node scripts/course-interaction-report.mjs .../learn-<slug>/<locale>
```

**每门课五语完成后：**

```bash
node scripts/course-family-guard.mjs .../learn-<slug>
```

Expected: `FAMILY GUARD ok ✓`

任务与 slug 对应：

- Task 9: `learn-agent-first-real-task`
- Task 10: `learn-brief-an-agent`
- Task 11: `learn-agent-context-engineering`
- Task 12: `learn-verify-agent-output`
- Task 13: `learn-agent-readable-repo`
- Task 14: `learn-agent-tools-mcp`
- Task 15: `learn-orchestrating-agents`

每个任务单独提交：`feat: add five locale variants for <slug>`

---

### Task 16: 全站验收

**Files:**
- Create: `.superpowers/sdd/course-matrix/progress.md`

- [ ] **Step 1: 48 变体全量闸门**

```bash
cd /Users/dirtyfancy/projects/agent-mentor-open-courses
for c in agent-first-real-task brief-an-agent agent-skills-reuse agent-context-engineering verify-agent-output agent-readable-repo agent-tools-mcp orchestrating-agents; do
  for l in en zh ja ko es pt-BR; do
    printf "%-32s %-6s " "$c" "$l"
    node scripts/course-guard.mjs agent-mentor/skills/generate-course-from-topic/lessons/learn-$c/$l --skip-url-check 2>&1 | grep -E "^GUARD"
  done
done
```

Expected: 48 行全部 `GUARD ok ✓`。

- [ ] **Step 2: 八个 family 一致性**

```bash
for c in agent-first-real-task brief-an-agent agent-skills-reuse agent-context-engineering verify-agent-output agent-readable-repo agent-tools-mcp orchestrating-agents; do
  printf "%-32s " "$c"
  node scripts/course-family-guard.mjs agent-mentor/skills/generate-course-from-topic/lessons/learn-$c 2>&1 | head -1
done
```

Expected: 八行全部 `FAMILY GUARD ok ✓`。

- [ ] **Step 3: 站点全量构建**

```bash
npm test && npm run build && npm run cf:build
```

Expected: 三者全过。静态页数约为 8 门课 × 6 语言 × (1 课程页 + 5~6 课节 + 术语 + 来源) + 6 个库页，量级在 400 页以上。

- [ ] **Step 4: 浏览器抽样验收**

启动 dev server，用 `agent-browser` 验证：

```bash
(npm run dev > /tmp/cc-scratch/dev.log 2>&1 &) ; sleep 6
```

- 六个语言的 `/courses` 页各自列出 8 门课，且按 domain 分组正确。
- 抽查 3 门新课的课节页：`<html lang>` 正确、互动块可作答、复制按钮为当前语言。
- 跨课程语言切换：在某门新课的第 3 讲切换语言，应停在同课同讲。
- 移动端 390px：无横向滚动、语言切换器在视口内。

- [ ] **Step 5: 边界扫描**

```bash
rg -n "ask ai|topup|podcast|\?lang=" app components lib | grep -v "code-review\|preview\|reviewed" || echo "clean"
```

- [ ] **Step 6: 写进度记录并提交**

在 `.superpowers/sdd/course-matrix/progress.md` 记录：每门课的提交号、闸门结果、来源核验日期、验收发现的问题与处理、以及遗留的非阻断项。

```bash
git add -A .superpowers
git commit -m "test: verify the eight-course six-locale library"
```

---

## 执行顺序与编排

严格串行，一次一个子代理。顺序：Task 0 → 1 → 2 → 3 → 4 → 5 → 6 → 7 → 8 → 9 → 10 → 11 → 12 → 13 → 14 → 15 → 16。

**每个任务完成后，主会话必须独立复核**（不采信子代理的完成汇报）：

```bash
ls -la <该任务产出的目录>
node scripts/course-guard.mjs <目录> --skip-url-check
```

已实测出现过子代理汇报"文件已写入并通过校验"但磁盘上文件不存在的情况。复核不通过就把具体差距发回同一个子代理修，不要另起一个。
