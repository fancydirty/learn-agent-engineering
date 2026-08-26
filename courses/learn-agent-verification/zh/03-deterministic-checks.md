# 第 3 课：确定性验证器：能跑出 pass/fail 的检查才算数

> 学习目标：
> - 按「最快、最可靠、最可扩展」给候选验证器排序，为一个具体产出挑出合适的那个
> - 写出一个能返回 pass/fail 的确定性验证脚本，并让它的输出能被 Agent 在对话里读懂、拿去迭代
> - 认出「验证器过严把对的判错」这类假阴性，用归一化修好它，同时知道确定性检查在哪里到顶
>
> 前置要求：读完第 1、2 课（没有可跑的检查时「看起来做完了」是唯一信号；验终态优先、过程兜底，成功标准要可测量） | 上一课 [第 2 课 <<](./02-what-to-verify.md) | 下一课 [第 4 课 >>](./04-llm-as-judge.md)

## 从「验什么」到「用什么验」

第 2 课结束时，你手上应该已经有一份写死的成功标准了。拿本课要用的例子说：Agent 读一批销售 CSV，汇总成一个 `report.json`，里面有标题、分渠道的条目、以及一个总数。第 2 课教你把标准写成终态的样子——文件存在、字段齐全、总数等于各条目之和——而不是「先读文件再算总和再写文件」这种逐步核对。

标准有了，下一个问题很实在：**拿什么去检查这份标准？**

你可以人眼看一遍；可以让另一个模型读一读、给个评价；也可以写十几行 Node 脚本，把 JSON 读进来算一遍总和，对不上就退出码非零。三条路都能得到结论，代价和可靠程度却差得很远。

官方文档给了一条排序原则：**挑最快、最可靠、最可扩展的那种判分方式**[^S5]。按这条尺子量下来，三类方法的位置很清楚：

- **代码判分**——最快、最可靠，极易扩展；短板是对那些需要弹性、不适合用规则硬卡的复杂判断力不从心[^S5]。
- **LLM 判分**——快且灵活，可扩展，能处理复杂判断，但要先验证裁判本身靠不靠谱再放量用[^S5]。（第 4 课讲。）
- **人工判分**——最灵活、质量最高，但慢又贵，能免则免[^S5]。

这里的「可靠」指的是**同一个输入进去，每次给出同一个结论**。代码判分排第一不是因为它聪明，恰恰因为它笨——它不会今天心情好放你过关，明天换个措辞就把你毙了。在计算机里，确定性系统指的是相同输入每次产出相同输出，而 Agent 这样的非确定性系统即使起点一样也可能给出不同回答[^S3]。本课说的「确定性验证器」就是这种笨得可预测的检查：用一个确定的东西去卡一个不确定的东西。

设计评测题目时还有条相关建议：**尽量把问题设计成能自动判分的形式**，比如选择题、字符串匹配、代码判分[^S5]。有机会自动判的地方，别浪费。

## 验证器菜单：任何能返回一个信号的东西

「验证器」听起来像个专门的框架，其实门槛低得多。官方文档的定义直白得几乎有点粗糙：**检查可以是任何能返回一个信号、而且这个信号能被模型在对话里读到的东西——一个测试套件、一个构建的退出码、一个 linter、一个把输出和基准文件做 diff 的脚本，或者一张和设计稿比对的浏览器截图**[^S4]。

拆开看看这份清单：跑 `npm test` 全绿就是 pass，适合代码类产出——代码方案本来就是可以用自动化测试来验证的[^S1]；构建退出码最省事，工具链已经替你写好了断言；linter 单独用不够，但作为「不该犯的错」的地板很好使；diff 脚本把这次的输出和一份事先备好的基准文件（fixture，就是一份已知正确的样本）比一比，适合输出稳定、格式固定的场景；截图对比则用在前端改样式的时候。

顺带说一句工程常识：编译器和静态类型检查器（比如 `tsc --noEmit`）在实际项目里也常被当成这类检查用，因为它们同样吐退出码、同样给出可读的错误位置。这条是我的补充，不在上面那份清单里，别当成官方推荐。

这些手段之间不是互斥的。验证器其实是**一条光谱**——一头是「和基准做精确字符串比对」这种最简单的形式，另一头是「请 Claude 来判」这种最高级的形式[^S3]。本课讲左半边，第 4 课去右半边。

## 最小形态：`output == golden_answer`

光谱最左端长这样[^S5]：

```text
output == golden_answer
```

就这样，一个等号。这叫精确匹配。它衡量的是模型输出跟一个预先定好的正确答案对不对得上，而且**通常要先做空白与大小写的归一化**；这是个简单、没有歧义的指标，特别适合那些答案清晰、可以归类的任务，比如情感分析的三分类（正面、负面、中性）[^S5]。

「归一化」这个词的意思很朴素：比较之前，先把那些不承载语义的差异抹掉。写成代码就是：

```javascript
// 情感三分类：答案只可能是 positive / negative / neutral
function grade(output, goldenAnswer) {
  const normalize = (s) => s.trim().toLowerCase();
  return normalize(output) === normalize(goldenAnswer);
}

grade("Positive\n", "positive"); // true —— 大小写和换行被抹掉了
grade("positive.", "positive");  // false —— 但一个句号照样判负
```

第二个调用的结果值得盯一会儿。`trim()` 和 `toLowerCase()` 救得了换行和大小写，救不了那个句号。归一化该做到哪一步，取决于你的任务里哪些差异是无关的——这个判断没法外包给库，只能你自己下。本课后面的陷阱小节，讲的就是这个判断做浅了会怎么样。

## 让验证器的输出能被读懂

上面那句定义里有半句常被忽略：信号得**能被模型在对话里读到**[^S4]。这半句决定了验证脚本该怎么写输出。对比两种失败信息：

```text
FAIL: 校验不通过
```

```text
FAIL  report.json
  - total 对不上：声明 48，各 count 之和 50
```

第一种只告诉 Agent「你错了」，它拿到之后只能瞎猜；第二种告诉它错在哪一项、期望是什么、实际是什么，下一轮就能直接去改那个数。同一个 pass/fail，信息量差一个数量级。官方文档的另一条建议说的是同一件事：**让 Claude 拿出证据，而不是断言成功**——测试输出、它跑了什么命令、命令返回了什么，或者一张结果截图；复核证据比你自己重跑一遍验证快，对你没盯着的那些会话同样有效[^S4]。你的验证脚本就是那份证据的生产者，它写得含糊，证据就含糊。

实操两条：退出码用 `0` 表示通过、非零表示失败（CI 和 shell 里的 `&&` 都能直接用）；stdout 里每条失败单独一行，写清「哪一项、期望什么、实际什么」。

## 有了 pass/fail，Agent 的行为会变

Agent 在执行过程中，**每一步都需要从环境里拿到真实反馈（ground truth，比如工具调用的结果或者代码执行的结果）来评估自己的进展**[^S1]。没有验证器的时候，它唯一能拿到的「进展信号」就是自己写下的那段话——它觉得写完了，那就是写完了。有了验证器，环境里多了一个不受它主观意愿影响的事实来源。

于是行为链条变了：**给 Claude 一个能产出通过或失败的东西，这个循环就能自己转完一圈——干活、跑检查、读结果，一直迭代到检查通过为止**[^S4]。换个说法：Agent 能把测试结果当反馈来迭代自己的方案[^S1]。

在你本系列第 7 门课手写的那种 harness 循环里，落地方式就是把检查做成一个工具：

```javascript
const tools = [
  { name: "write_file", /* ... */ },
  {
    name: "run_check",
    description: "运行 verify.mjs 校验 report.json，返回 PASS/FAIL 与每一条失败原因",
    input_schema: { type: "object", properties: {}, required: [] },
  },
];

import { execFile } from "node:child_process";

// 小工具：跑 verify.mjs，把退出码和输出一起收回来
// （不用 promisify(exec)——它在退出码非零时会直接抛异常，而非零恰恰是我们要的信号）
function runVerify() {
  return new Promise((resolve) => {
    execFile("node", ["verify.mjs", "report.json"], (err, stdout, stderr) => {
      resolve({ code: err?.code ?? 0, stdout: stdout + stderr });
    });
  });
}

async function runTool(name, input) {
  if (name !== "run_check") return runOtherTool(name, input);
  const { code, stdout } = await runVerify();
  // 关键：退出码和 stdout 原样回传，别在这里压缩成一句「失败了」
  return `exit code: ${code}\n${stdout}`;
}

while (response.stop_reason === "tool_use") {
  const toolUse = response.content.find((block) => block.type === "tool_use");
  const output = await runTool(toolUse.name, toolUse.input);
  messages.push({ role: "assistant", content: response.content });
  messages.push({
    role: "user",
    content: [{ type: "tool_result", tool_use_id: toolUse.id, content: output }],
  });
  response = await client.messages.create({ model, tools, messages });
}
```

验证器的输出通过 `tool_result` 回到对话里，模型读到 `total 对不上：声明 48，各 count 之和 50`，下一轮就去改。你没有参与任何一步。

两个顺手的延伸。**一、检查不必只放在终点。** 第 2 课讲过，复杂流程可以拆成若干离散的验证检查点，在那些「本该发生某个状态变化」的位置上验一次，而不是核对每一个中间步骤[^S2]。这些验证检查点正好是确定性检查的落脚处——比如「CSV 全部读完之后，行数应该等于各文件行数之和」。同一篇复盘也提到，实践中会把 Agent 的灵活性和确定性的保障（例如重试逻辑、定期检查点——注意这个「检查点」指的是本系列第 9 门课那种存现场的恢复检查点）组合起来用[^S2]。

**二、有一类验证可以前移到 API 层。** 工具定义里加上 `strict: true`，可以确保 Claude 的工具调用严格符合你的 schema[^S6]。schema 就是你对参数结构的声明。

```json
{
  "name": "write_report",
  "description": "把汇总结果写入 report.json",
  "strict": true,
  "input_schema": {
    "type": "object",
    "properties": {
      "title": { "type": "string" },
      "items": {
        "type": "array",
        "items": {
          "type": "object",
          "properties": { "name": { "type": "string" }, "count": { "type": "integer" } },
          "required": ["name", "count"]
        }
      },
      "total": { "type": "integer" }
    },
    "required": ["title", "items", "total"]
  }
}
```

加上这一行，「字段名拼错」「count 传成字符串」这类结构问题就从「你要写代码去检查的东西」变成了平台层面的保证。工具本来就是确定性系统和非确定性 Agent 之间的一份契约[^S3]，`strict` 是把这份契约写进合同的方式。

但它管得住结构，管不住语义。`total` 是不是真等于各 `count` 之和，schema 一个字都说不上来——那部分仍然得你自己验。

```agentmentor-check
{
  "id": "vq-zh-03-strict-verifier",
  "label": "越严越保险？",
  "prompt": "同事写了个验证器：Agent 的输出必须和基准文件逐字节相同，空格、标点一个不差才算通过。他的理由是「越严越保险，宁可错杀不可放过」。这个说法站得住吗？",
  "whyHere": "你刚看完确定性检查的好处，接下来就该看它最容易栽的那个跟头。动手写验证器之前，先想清楚「严」到底该严在哪。",
  "mode": "single",
  "choices": [
    {
      "id": "a",
      "text": "站不住。过严的验证器会因为格式、标点、合法的另一种措辞这类无关差异把正确输出判成失败；该严的是语义（比如 total 是否等于各 count 之和），无关格式应该先归一化掉。",
      "correct": true,
      "feedback": "对。严格要用在承载语义的地方，而不是用在空白和标点上。精确匹配的标准做法本来就是先归一化空白与大小写，再做比较。"
    },
    {
      "id": "b",
      "text": "基本站得住。严一点只是多误报几次，人工复核一下就好，总比漏掉真错误强。",
      "correct": false,
      "feedback": "误报不是免费的。假阴性会污染通过率，让一次真正的改进看起来毫无效果；更麻烦的是，当验证结果被回传给 Agent 当反馈时，它会花好几轮去「修」一个根本没错的地方。"
    },
    {
      "id": "c",
      "text": "说反了，应该越松越好——只要输出不为空就算通过，剩下的交给人看。",
      "correct": false,
      "feedback": "那等于退回没有可跑的检查的状态。一个永远通过的检查跟没有检查一样，「看起来做完了」重新变成唯一的信号，你自己又成了验证环节。松紧不是一根滑杆：该严在语义上，该松在无关格式上。"
    }
  ]
}
```

## 陷阱：验证器过严，会把对的判错

这是确定性检查最常翻的跟头，而且翻的时候你往往察觉不到。

官方给工具评测写的那条建议一针见血：**避免过于严格的验证器，它们会因为格式、标点、合法的另一种措辞这类无关差异，把正确的回答判成失败**[^S3]。

「无关差异」这个词是钥匙。同一个正确答案，可能带着一个尾随空格、可能把 `positive` 写成 `Positive`、可能在两个词之间多打了一个空格。这些差异对**任务**来说毫无意义，对一个逐字节比对的验证器来说却是灭顶之灾。判错的方向也很坑：它不会放过错的，它会**冤枉对的**——这叫假阴性。

来看一个具体的翻车与修复过程。基准标题是 `2026 年 Q1 渠道汇总`，Agent 产出的 `report.json` 里数据全对，只是标题前后多了空白、两个词之间多打了两个空格。天真的严格版验证器是这么写的：

```javascript
// strict.mjs —— 天真的严格版
import { readFileSync } from "node:fs";

const GOLDEN_TITLE = "2026 年 Q1 渠道汇总";
const data = JSON.parse(readFileSync(process.argv[2], "utf8"));

if (data.title === GOLDEN_TITLE) {
  console.log("PASS");
  process.exit(0);
} else {
  console.log(`FAIL: title 与基准不一致，实际收到 ${JSON.stringify(data.title)}`);
  process.exit(1);
}
```

跑一下，真实输出：

```text
$ node strict.mjs spacey.json
FAIL: title 与基准不一致，实际收到 "  2026 年   Q1 渠道汇总\n"
```

一份内容完全正确的报告，被一个尾随换行毙了。如果这个结果回传给 Agent，它接下来会去折腾标题的空白——一个跟任务毫无关系的方向。

修复只要一个函数：

```javascript
function normalize(text) {
  return text.replace(/\s+/g, " ").trim().toLowerCase();
}

if (normalize(data.title) === normalize(GOLDEN_TITLE)) { /* PASS */ }
```

`replace(/\s+/g, " ")` 把连续空白折成一个，`trim()` 去掉首尾，`toLowerCase()` 统一大小写。改完之后同一份文件就通过了——本课练习 Level 2 的完整脚本和真实运行结果在后面。

反过来也要提醒一句：归一化不是越狠越好。如果你把标点也一并抹掉，那么 `total: 48` 和 `total: 4.8` 这种真正的错误也可能被你自己抹平。判断标准始终是那一条——**这个差异承载语义吗？** 承载就该严，不承载就该归一化。

## 确定性检查到顶的地方

确定性验证器的适用范围有边界，而且边界很清楚。

**第一条边界是自由文本。** 研究类的产出很难用程序来评判，因为它们是自由格式的文字，而且很少有唯一正确答案[^S2]。你没法给一段摘要写 `output == golden_answer`——同样一份材料，两个写得都好的摘要可以用完全不同的措辞。这类判断交给谁，是第 4 课的题目。

**第二条边界是「符合更大的系统要求」。** 自动化测试能验证功能是否正常，但要确保方案跟更大的系统要求对得上，人工审查仍然不可少[^S1]。一个补丁可以全绿通过测试，同时是个会让整个模块难以维护的糟糕设计。多 Agent 的工程复盘里也有同样的意思：即使自动化评测已经很成熟，人工测试仍然必需[^S2]。

确定性检查负责的是「不该错的地方没错」这个地板；地板之上的部分，得换工具。

## 分寸：不是每件事都值得配验证器

反方向也有个常见毛病：给一次性脚本配全套验证器。

Agent 写一段只跑一次、跑完就删的数据迁移脚本，你却给它搭上结构校验、基准比对、回归样例——写验证器的时间比亲眼看一遍输出还长。

判断的尺子还是那句老话：**只有当复杂度能带来可测量的改进时，才值得加**[^S1]。落到验证器上，挑一个问题问自己就够了：

- 这个检查会被跑几次？只跑一次的东西，你亲自看一眼可能更快。
- 没有它，错误多久才会被发现？「立刻，我就在旁边看着」和「等下游报错，两天后」，结论完全不同。
- 这个任务你打算改几版提示词？只要超过一版，你就需要一把能比较前后的稳定尺子，不然「这次是不是变好了」永远只能靠感觉。

至于什么时候必须写，官方文档给的原则很硬——**始终提供验证手段（测试、脚本、截图）；验不了的东西，别发**[^S4]。

## 💻 练习

<!-- exercises -->

### Level 1：给 6 种产出各挑一个验证器（不写代码）

下面 6 种是 Agent 常见的产出。请逐个回答：你会用什么验证器？为什么是它？

1. 一个 JSON 配置文件（含服务名、端口、超时时间）
2. 一份按「金额从大到小」排好序的 CSV
3. 一段自由文本摘要（从一篇长报告里提炼三百字）
4. 一个代码补丁（修一个已知 bug）
5. 一组文件名清单（Agent 说它处理了这些文件）
6. 一个情感标签（对一条评论输出 positive / negative / neutral 之一）

答完之后再回答一个问题：这 6 项里，**哪些没法纯靠确定性检查判定**？对这些项，确定性检查还能守住哪条地板？剩下的部分要留给第 4 课的什么手段？

<!-- hint -->
先给每一项问一句：「这个产出里，哪些差异是承载语义的，哪些是无关的？」承载语义的部分决定你要断言什么，无关的部分决定你要归一化掉什么。比如第 2 项里，行的顺序承载语义（任务就是排序），但换行符是 `\n` 还是 `\r\n` 不承载。

<!-- hint -->
别默认「和基准文件逐字节 diff」是通用答案。更稳的做法常常是**从产出里算出一个性质来断言**，而不是跟一份固定样本比。第 2 项与其比一份基准 CSV，不如断言「相邻两行的金额单调不增」——这样换一批数据脚本还能用。

<!-- rubric -->
- 6 项都给出了具体的验证器，而且是能产出 pass/fail 的形式（「检查一下质量」不算）
- 至少 4 项的理由点到了「哪些差异无关、要归一化或绕开」这一层，而不是只说「用脚本检查」
- 明确指出第 3 项（自由文本摘要）没法纯靠确定性检查判定，并说出确定性能守住的地板（长度、必须出现的实体、有没有冒出源文里没有的数字），把质量判断留给第 4 课
- 第 4 项（代码补丁）指出测试套件、构建退出码、linter 能自动验功能，但「是否符合更大的系统要求」这层仍需人工审查或第 4 课的手段
- 第 5 项（文件名清单）识别出「顺序通常不承载语义」，该做集合比对而不是有序比对
- 第 6 项（情感标签）识别出这是精确匹配的典型场景，并提到先归一化空白与大小写

<!-- answer -->
**1. JSON 配置文件 → schema 校验 + 少量语义断言。**
schema 卡结构（字段齐不齐、类型对不对、必填有没有），再补几条 schema 表达不了的断言，比如端口在 1–65535 之间、超时时间是正数。别跟一份基准配置逐字节 diff——键的顺序、缩进、尾随逗号都是无关差异，会天天误报。如果配置是 Agent 通过工具调用产出的，结构那一半还能前移到 API 层，用 `strict: true` 保证[^S6]。

**2. 排好序的 CSV → 脚本读进来做性质断言。**
断言列名对不对、行数对不对、相邻两行的金额单调不增。第三条是任务核心，前两条防的是「排序对了但丢了一半数据」。这里尤其不该用基准文件 diff：换行符、数字格式（`1000` 还是 `1000.00`）、尾随空格全是无关差异，而且换一批输入数据，基准文件就作废了。

**3. 自由文本摘要 → 确定性检查只能守地板，质量判断留给第 4 课。**
自由文本很难用程序来评判，因为它是自由格式、很少有唯一正确答案[^S2]。地板还是守得住：字数在不在要求区间内、指定必须提到的实体（人名、产品名、季度）有没有出现、有没有冒出源报告里根本不存在的数字。但「抓没抓住重点」「有没有曲解原意」，得靠 LLM 裁判按量表打分——那是第 4 课的内容。

**4. 代码补丁 → 测试套件 + 构建退出码 + linter，人工审查兜底。**
代码方案本来就是可以用自动化测试来验证的[^S1]，而这三样正好都在官方那份检查清单里[^S4]。但**自动化测试验证的是功能，要确保方案符合更大的系统要求，人工审查仍不可少**[^S1]——补丁可能全绿通过，同时是个会拖垮可维护性的设计。

**5. 文件名清单 → 集合比对（排序后再比，或者用 `Set`）。**
文件名的**顺序**通常不承载语义，先处理 `a.csv` 还是 `b.csv` 不影响任务是否完成，逐行有序 diff 会因为顺序不同而误报。再多验一步：这些文件是不是真的存在于磁盘上——Agent 报告处理过的文件和实际存在的对不上，是很典型的一类失败。

**6. 情感标签 → 精确匹配，先归一化。**
`output == golden_answer`[^S5]，比较之前先归一化空白与大小写。这正是精确匹配最擅长的场景：答案清晰、可以归类、只有三个合法取值[^S5]。要小心模型输出 `Positive.` 或者 `情感：positive`——归一化要能容纳这类无关包装，或者干脆在提示里把输出格式限死。

**哪些没法纯靠确定性检查判定：** 第 3 项整体，以及第 4 项里「是否符合更大的系统要求」那一层。这两处交给第 4 课的 LLM 裁判，或者交给人。

### Level 2：写一个真能跑的 `verify.mjs`

**任务设定。** Agent 需要产出一个 `report.json`，要求是：

- 有 `title`，类型是字符串
- 有 `items`，是个数组，每一项都有 `name`（字符串）和 `count`（整数）
- 有 `total`（整数），且 `total` 等于所有 `count` 之和
- `title` 应当与基准标题 `2026 年 Q1 渠道汇总` 一致

请写一个 Node 脚本 `verify.mjs`，做三层检查：**结构校验**、**`total` 一致性校验**、**对 `title` 做了空白归一化之后的比对**。用法是 `node verify.mjs report.json`，通过退出 0，失败退出 1 并逐条打印原因。

写完之后，自己造三份样例验证它：一份完全正确的、一份 `total` 真算错了的、一份「内容全对但标题多了空白」的。第三份必须通过——它是用来证明你的归一化确实救回了一个假阴性的。

<!-- hint -->
三层检查之间是有先后依赖的：结构不过关的时候，别急着去算 `total`。如果 `items` 根本不是数组，你调 `.reduce()` 会直接抛异常，把一条清楚的「items 不是数组」变成一条难读的堆栈。做法是结构那层收集完错误就先 `return`，后面两层只在结构过关时才跑。

<!-- hint -->
归一化标题时，`trim()` 只能去掉首尾空白，去不掉词与词之间多打的那个空格。要同时处理这两种，用 `text.replace(/\s+/g, " ").trim()`：先把所有连续空白（含换行、制表符）折成一个普通空格，再去首尾。判整数别用 `typeof x === "number"`——`3.5` 也是 number，用 `Number.isInteger(x)`。

<!-- rubric -->
- 用退出码表达结论：通过 `process.exit(0)`，失败 `process.exit(1)`
- 结构校验覆盖 `title` 是字符串、`items` 是数组、每项有字符串 `name` 和整数 `count`、`total` 是整数
- JSON 解析失败被单独捕获、报成一条可读错误，而不是让异常把进程崩掉
- 结构校验不通过时提前返回，不再执行后面的求和与比对
- `total` 一致性用「各 `count` 之和」现算，而不是跟写死的数字比
- `title` 比对前做了归一化，至少折叠连续空白并去掉首尾空白
- `total` 与 `title` 两类失败信息里同时给出了期望值和实际值
- 三份样例的判定分别是 PASS、FAIL（`total` 对不上）、PASS，且第三份的通过确实是归一化的功劳

<!-- answer -->
完整脚本：

```javascript
// verify.mjs
import { readFileSync } from "node:fs";

const GOLDEN_TITLE = "2026 年 Q1 渠道汇总";

// 归一化：折叠连续空白、去掉首尾空白、统一大小写
function normalize(text) {
  return text.replace(/\s+/g, " ").trim().toLowerCase();
}

export function verify(raw) {
  const errors = [];

  let data;
  try {
    data = JSON.parse(raw);
  } catch (err) {
    return { pass: false, errors: [`JSON 解析失败：${err.message}`] };
  }

  if (data === null || typeof data !== "object" || Array.isArray(data)) {
    return { pass: false, errors: ["顶层不是一个 JSON 对象"] };
  }

  // 第一层：结构校验
  if (typeof data.title !== "string") {
    errors.push("title 缺失或不是字符串");
  }
  if (!Array.isArray(data.items)) {
    errors.push("items 缺失或不是数组");
  } else {
    data.items.forEach((item, i) => {
      if (item === null || typeof item !== "object") {
        errors.push(`items[${i}] 不是对象`);
        return;
      }
      if (typeof item.name !== "string") {
        errors.push(`items[${i}].name 缺失或不是字符串`);
      }
      if (!Number.isInteger(item.count)) {
        errors.push(`items[${i}].count 缺失或不是整数`);
      }
    });
  }
  if (!Number.isInteger(data.total)) {
    errors.push("total 缺失或不是整数");
  }

  // 结构不过关就不往下算了，否则报错会连环炸
  if (errors.length > 0) {
    return { pass: false, errors };
  }

  // 第二层：total 一致性
  const sum = data.items.reduce((acc, item) => acc + item.count, 0);
  if (sum !== data.total) {
    errors.push(`total 对不上：声明 ${data.total}，各 count 之和 ${sum}`);
  }

  // 第三层：title 比对，先归一化再比
  if (normalize(data.title) !== normalize(GOLDEN_TITLE)) {
    errors.push(
      `title 与基准不符：归一化后为「${normalize(data.title)}」，期望「${normalize(GOLDEN_TITLE)}」`
    );
  }

  return { pass: errors.length === 0, errors };
}

const path = process.argv[2];
if (!path) {
  console.error("用法：node verify.mjs <report.json>");
  process.exit(2);
}

const result = verify(readFileSync(path, "utf8"));
if (result.pass) {
  console.log(`PASS  ${path}`);
  process.exit(0);
}
console.log(`FAIL  ${path}`);
for (const e of result.errors) {
  console.log(`  - ${e}`);
}
process.exit(1);
```

三份样例。`good.json`——全对：

```json
{
  "title": "2026 年 Q1 渠道汇总",
  "items": [
    { "name": "直客", "count": 12 },
    { "name": "渠道商", "count": 30 },
    { "name": "线上自助", "count": 8 }
  ],
  "total": 50
}
```

`broken.json`——`items` 和 `title` 与 `good.json` 一字不差，只把最后一行改掉，`total` 真算错了（12 + 30 + 8 = 50，却写了 48）：

```json
  "total": 48
```

`spacey.json`——`items` 和 `total` 与 `good.json` 一字不差，只把标题换成首尾有空白、中间多了两个空格、末尾还带个换行的版本。这份就是那个假阴性案例：

```json
  "title": "  2026 年   Q1 渠道汇总\n",
```

跑起来（`node --version` 是 v26.3.0，脚本没用任何新语法，旧版本一样跑）：

```text
$ for f in good.json broken.json spacey.json; do node verify.mjs "$f"; echo "  exit code: $?"; done
PASS  good.json
  exit code: 0
FAIL  broken.json
  - total 对不上：声明 48，各 count 之和 50
  exit code: 1
PASS  spacey.json
  exit code: 0
```

三条结论对应本课的三个要点。`good.json` 通过，是基本盘。`broken.json` 被抓住，失败信息里同时有期望和实际（`声明 48，各 count 之和 50`），Agent 读到这一行就知道该改哪个数。`spacey.json` 通过——要是 `title` 比对写成逐字节的，这一份会被误判成失败，Agent 接下来会去折腾一个跟任务无关的换行符；归一化在这里救回来的，就是一个假阴性。把陷阱小节里的 `strict.mjs` 拿来跑同一份文件，就能看到没有归一化的样子：

```text
$ node strict.mjs spacey.json
FAIL: title 与基准不一致，实际收到 "  2026 年   Q1 渠道汇总\n"
```

<!-- /exercises -->

## 小结

- 挑判分方式的排序原则是「最快、最可靠、最可扩展」；代码判分在这三项上都排第一，代价是对需要弹性的复杂判断力不从心[^S5]。
- 检查可以是任何能返回一个信号、且信号能被模型在对话里读到的东西：测试套件、构建退出码、linter、把输出和基准文件 diff 的脚本、和设计稿比对的截图[^S4]。
- 验证器是一条光谱，最左端是和基准做精确字符串比对，最右端是请 Claude 来判[^S3]；最小形态就是 `output == golden_answer`，通常先归一化空白与大小写，适合答案清晰、可归类的任务[^S5]。
- 有了 pass/fail，循环能自己转完一圈：干活、跑检查、读结果、迭代到通过[^S4]；这背后是 Agent 每一步都需要从环境拿到真实反馈来评估进展[^S1]，也是它能把测试结果当反馈来迭代的原因[^S1]。
- 复杂流程可以拆成离散的验证检查点，在该发生状态变化的位置验一次，而不是核对每个中间步骤[^S2]；一部分结构校验还能前移到 API 层，用 `strict: true` 让工具调用严格符合 schema[^S6]。
- 最大的陷阱是验证器过严：它会因为格式、标点、合法的另一种措辞这类无关差异，把正确回答判成失败[^S3]。修法是先归一化再比，把严格留给真正承载语义的部分。
- 确定性检查有天花板：自由文本很难用程序评判[^S2]；自动化测试验证功能，但要确保方案符合更大的系统要求，人工审查仍不可少[^S1]，人工测试在自动化评测之外也依然必需[^S2]。
- 别给一次性脚本配全套验证器——复杂度只在能带来可测量改进时才值得加[^S1]；但反过来，验不了的东西就别发[^S4]。

[>> 第 4 课：LLM 当裁判：量表、格式与不该让它裁的事](./04-llm-as-judge.md)
