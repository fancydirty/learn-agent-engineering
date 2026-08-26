# 第 6 课：实战：给你的 Agent 搭一条评测跑道

> 学习目标：
> - 把评测集、分层判分和 harness 循环拼成一个能反复跑的 `eval-runner.mjs`，一条评测任务跑一个独立循环
> - 让报告除通过率外记下每条任务的耗时、工具调用次数、token 消耗和工具报错，并用这几列诊断问题
> - 用这条跑道测出一次系统提示词修改的真实影响，并在同一条跑道上把「验证器过严把对的判错」抓出来修掉
>
> 前置要求：读完第 1–5 课，手边能跑起本系列第 7 门课的 harness 循环 | 上一课 [第 5 课 <<](./05-eval-sets.md)

前五课讲的都是零件：验终态别逐步核对（第 2 课）、确定性检查优先且当心过严的验证器（第 3 课）、自由文本才轮到 LLM 裁判（第 4 课）、评测集从二十来条真实任务起步（第 5 课）。单独看都成立，但改完提示词之后，你还是没有一个东西可以敲一行命令，让分数告诉你「变好了还是变坏了」。

这一课把零件焊起来，焊出来的是一个三百多行的文件，跑一次不到两秒。官方对「怎么跑评测」给的做法很直接：用直接的 LLM API 调用、以程序化的方式跑；用简单的 agentic 循环，也就是交替进行 LLM 调用和工具调用的 while 循环，**一条评测任务一个循环**[^S3]。这正是本系列第 7 门课那个 `stop_reason` 驱动的循环，原样搬过来就行。

## 先看它跑起来的样子

把后面那份完整的 `eval-runner.mjs` 存到本地，`node eval-runner.mjs`：

```text
=== 报告 · 提示词 v1 · 验证器 normalized（修好的） ===
任务              判分       结果     分数  调用  报错   tokens    耗时
-----------------------------------------------------------------------
t1-total          确定性     pass     1.00     3     0    1,800   124ms
t2-pending        确定性     pass     1.00     1     0      995    81ms
t3-no-orderid     确定性     FAIL     0.00     2     1    1,550   123ms
t4-refund-note    LLM 裁判   FAIL     0.67     1     0    1,432   124ms
t5-missing-order  确定性     pass     1.00     1     1      966    83ms
-----------------------------------------------------------------------
通过率 3/5 (60%) · 工具调用 8 次 · 工具报错 2 次 · tokens 6,743 · 总耗时 535ms

未通过明细：
  [t3-no-orderid] 判据：参数不全时应该一次工具都不调，直接反问要订单号
  Agent 回答：订单 SO-1001 的状态是已完成。
  [t4-refund-note] 判据：金额与订单一致，语气得体；但没写退款多久到账，客户拿不到预期，三项里缺一项。
  Agent 回答：您好，订单 SO-1003（金额 ¥320.00 元）我们已经受理取消，退款会原路退回。给您带来不便，非常抱歉。

=== 报告 · 提示词 v2 · 验证器 normalized（修好的） ===
任务              判分       结果     分数  调用  报错   tokens    耗时
-----------------------------------------------------------------------
t1-total          确定性     pass     1.00     3     0    1,800   123ms
t2-pending        确定性     pass     1.00     1     0      995    83ms
t3-no-orderid     确定性     pass     1.00     0     0      487    41ms
t4-refund-note    LLM 裁判   pass     1.00     1     0    1,518   123ms
t5-missing-order  确定性     pass     1.00     1     1      966    83ms
-----------------------------------------------------------------------
通过率 5/5 (100%) · 工具调用 6 次 · 工具报错 1 次 · tokens 5,766 · 总耗时 453ms

=== 分数变化 v1 -> v2 ===
任务                   v1     v2  变化
------------------------------------------------
t1-total             1.00   1.00  持平
t2-pending           1.00   1.00  持平
t3-no-orderid        0.00   1.00  fail => pass
t4-refund-note       0.67   1.00  fail => pass
t5-missing-order     1.00   1.00  持平
------------------------------------------------
通过率 3/5 -> 5/5
```

这不是手写的示例，是刚才在临时目录里真跑出来的，逐行照抄；你复制完整代码跑一遍，除了「耗时」那列会差几毫秒（真实墙钟时间，机器负载不同就会抖），其余数字都一样。

这份输出里藏着这一课的全部内容：五条任务各跑各的循环、两种判分方式混在一张表里、通过率之外还有四列指标、两个版本的差异被落成一张对比表。剩下的篇幅就是把它拆开。

## 跑道的五个零件

1. **被测系统**：工具定义、工具的真实实现，还有它们背后那点数据。评测跑的是「Agent 用你的工具干活」，工具是被测对象的一部分。
2. **桩 client**：一个假的 `messages.create`，按写死的队列顺序吐响应，让整条跑道可复现。
3. **评测集**：一个 `tasks` 数组，每条是 `{id, prompt, verify}`。官方的要求是每条评测提示都要配一个可验证的结果或产出[^S3]——没有验证器的提示词不算评测任务，只算试玩。
4. **判分**：能确定性判的走 `verify` 函数，自由文本才交给裁判。
5. **循环和报告**：一条任务一个 while 循环，跑完把指标汇成表。

有件事先说死：**任务之间不共享 `messages`**。每条任务的 `messages` 都从只有自己那条 user 提示的状态起步，跑自己的循环，跑完就扔[^S3]。为什么这么重要，中间那道题会专门问。

## 零件一：工具和它们背后的数据

被测对象是个订单助手，四条订单，两个工具：`search_orders`（按客户名或状态查，返回订单号列表）和 `get_order`（按订单号查单笔详情）。两个细节是故意留的：`search_orders` 只回订单号、不回金额，这会逼着 Agent 为每个订单再调一次 `get_order`，报告里「调用次数」那列就会把这个设计缺陷显出来；另一个是它在两个筛选条件都为空时直接抛错：

```javascript
search_orders({ customer, status }) {
  if (!customer && !status) {
    throw new Error("参数无效：customer 和 status 至少要给一个");
  }
  // ……按条件过滤，返回 { order_ids: [...] }
}
```

这是「无效参数」类型的工具报错。官方说这类报错扎堆通常意味着工具描述该写得更清楚、该补例子[^S3]，等下会在报告里看到它。工具报错不是崩溃：执行工具那段要把异常接住，包成带 `is_error` 的 `tool_result` 还给模型，同时给计数器加一。`tool_use` 与 `tool_result` 靠 `tool_use_id` 配对，这是本系列第 7 门课就打过的地基，这里只多了两个计数器。

## 零件二：桩 client 与验证桥段

这里要停一下，不然后面所有数字都站不住脚。

真实的 Claude 是非确定性的：同样的提示词跑两次，路径可能完全不同[^S2]。这对生产是好事，对讲课演示是灾难——你今天跑出 3/5、明天跑出 4/5，分不清是提示词改动的功劳还是模型今天状态好。所以本系列第 8、9 门课的实战都用同一个办法：**把模型换成一个按固定队列吐响应的桩**，让被测行为变成受控变量，这样验证的是你写的那套控制逻辑，而不是模型当天的发挥。

```javascript
function stubClient(script, label) {
  if (!script) throw new Error(`[桩] 没有为 ${label} 预写响应队列`);
  let cursor = 0;
  return {
    messages: {
      async create() {
        if (cursor >= script.length) {
          throw new Error(`[桩] ${label} 的响应队列已耗尽（已发出 ${cursor} 次请求）`);
        }
        const res = script[cursor++];
        await sleep(res.latency_ms);
        return res;
      },
    },
  };
}
```

队列耗尽就抛错，不给兜底响应——循环多转一圈，你会立刻看到 `Error: [桩] v1/t2-pending 的响应队列已耗尽（已发出 1 次请求）`（这行是我把 t2 队列里最后一条响应删掉之后真跑出来的报错原文），而不是拿到一个假的 `end_turn` 蒙混过去。每条响应还带自己的 `latency_ms`，桩会真的睡一下，让「耗时」那列量得出循环转了几圈；每条任务用自己的 script 新建一个 client，跨任务不共享游标。

**两个提示词版本的差异，是靠桩里的两套响应队列钉死的。** 真实场景里你改系统提示词、模型行为跟着变；这里我没有模型，所以预先写了 `SCRIPT_V1` 和 `SCRIPT_V2`，让 v2 在两条任务上给出不同响应——「假设 v2 提示词生效后模型会这么答」这个假设，被写成了数据：

```javascript
// v2 只有两条任务的响应换了——两个版本的差异就钉死在这里
const SCRIPT_V2 = {
  ...SCRIPT_V1,
  "t3-no-orderid": [
    finish("你说的是哪一笔订单？把订单号发我就行（形如 SO-1001）。", [455, 32]),
  ],
  "t4-refund-note": [/* 补上了到账时间的那版回复 */],
};
```

用展开语法从 v1 继承、只列改掉的两条，读代码的人一眼知道差异范围。这条跑道**验证的是跑道本身**：验证器判得对不对、指标记得准不准、报告算得对不对、两次运行能不能比。等你换成真 client，跑道不用改，改的只是数字会开始跳。

## 零件三：评测集——四条常规加一条边缘

第 5 课说评测集要贴合真实分布、要覆盖边缘用例[^S5]，官方也提醒别搞那种过于简单、不给工具施加足够复杂度的沙箱环境[^S3]。这里为篇幅只放五条，但结构是照真实评测集来的：

| 任务 | 考什么 | 判分 |
| --- | --- | --- |
| `t1-total` | 多步聚合：先查列表再逐单取金额 | 确定性 |
| `t2-pending` | 集合筛选：订单号要不多不少 | 确定性 |
| `t3-no-orderid` | **边缘用例**：用户没给订单号 | 确定性 |
| `t4-refund-note` | 自由文本：写给客户的退款说明 | LLM 裁判 |
| `t5-missing-order` | 工具报错后如实回报，不编数据 | 确定性 |

`t3-no-orderid` 值得单说。提示词是「帮我把那笔订单的状态查一下」——哪笔？没说。理想行为是反问要订单号，而不是自己挑一个去查。官方文档对这个行为的表述很克制：如果用户提示词没给全必需参数，Claude Opus 更有可能意识到参数缺失并主动要，但这个行为不保证，提示词越含糊、模型越弱就越不保证[^S6]。**「不保证」的行为恰恰是评测集该覆盖的**，保证的东西不用测。

```javascript
{
  id: "t3-no-orderid",
  grader: "确定性",
  prompt: "帮我把那笔订单的状态查一下。",
  verify: (r) => ({
    pass: r.toolCalls === 0 && r.answer.includes("？") && r.answer.includes("订单号"),
    note: "参数不全时应该一次工具都不调，直接反问要订单号",
  }),
},
```

`verify` 拿到的 `r` 里不只有 `answer`，还有 `toolCalls`、`toolErrors`、`tokens`，所以验证器能检查「终态加关键状态」而不只是文本：`t3` 判的其实是「一次工具都没调」，`t5` 判的是「恰好报了一次错并且如实说了查不到」——第 2 课的终态优先在这里落成了具体字段。`note` 是给人看的，任务失败时报告会把判据和 Agent 的原话一起打出来。

如果你第 5 课的作业用的是 `{id, prompt, expected, verifier, rubricRef, tags, split}` 那套字段，先对个表，免得以为自己上一课做错了：第 5 课的 `verifier` 在这里叫 `grader`，而且只用来在报告里显示——实际判分类型由这条任务有没有 `verify` 函数、有没有 `judge: true` 决定；`expected` 里的声明式断言，在这里直接写进了 `verify` 函数体（五条任务各自的断言长得不一样，写成函数比设计一套通用断言格式省事）；`rubricRef` 因为全场只有一条裁判用例，直接内联成了 `JUDGE_PROMPT`；`tags` 和 `split` 为篇幅省略，留出集的纪律在「分寸」一节照常复述。你第 5 课交付的那份 JSON 没有作废——它是这份 `TASKS` 的声明式版本，往下走就是把每条断言翻译成一个函数。

## 零件四：分层判分，确定性优先

判分方式有排序：代码判分最快、最可靠、扩展性最好，只是遇到需要细腻判断的场合不够灵；LLM 判分快而灵活，能处理复杂判断，但要先验证裁判本身可靠再放量；人工判分最灵活质量最高，但慢且贵，能免则免[^S5]。

所以规矩是：**能用代码判的绝不请裁判。** 五条任务里四条走 `verify`，只有 `t4-refund-note` 那条自由文本交给裁判——「这段话能不能发给客户」没法用字符串比对判。裁判的形状照第 4 课来，量表写死三项，输出格式限死成 JSON，先写理由再给分：

```javascript
const JUDGE_PROMPT = `你是评分员。按下面的量表给这段客服回复打分，先写理由，再给分。
量表（每项 0 或 1，取平均作为总分）：
- 金额准确：写清了退款金额，且与订单金额一致
- 到账时间：写清了退款多久到账
- 语气得体：是可以直接发给客户的措辞
只输出 JSON：{"reasoning": "...", "score": 0.0-1.0, "grade": "pass" | "fail"}
score >= 0.8 记 pass。`;
```

几条都有出处：让裁判先推理再给分、然后把推理丢掉，能提高评分质量，尤其是需要复杂判断的任务[^S5]；输出要具体、可量化，别做纯定性评价[^S5]；而「单次 LLM 调用、单个提示词、输出 0.0–1.0 的分数加一个通过/不通过」这个组合，是官方在多 Agent 研究系统里试过多种裁判方案之后，发现最一致、最贴近人类判断的那一种[^S2]。

裁判在这里也是桩：v1 那份回复缺了到账时间，三项中两项给 0.67 判 fail；v2 补上了，三项全中给 1.00 判 pass。分数和量表自洽——三项二元求平均，分数只能落在 0、0.33、0.67、1.00 上，出现 0.85 这种数反而说明裁判没按量表算。裁判自己也烧 token，它的用量被加进那条任务的 tokens 里，这就是为什么 `t4` 只调一次工具、token 却不低。

还有一条第 4 课的纪律：干活的模型不该自己当裁判。官方的说法是让一个全新的模型实例去试着反驳结果，这样干活的那个就不是打分的那个[^S4]。代码里的体现是：裁判用自己的 client、自己的 system 提示词、自己的消息数组，只看到任务提示词和待评回复，看不到 Agent 的工具调用轨迹。

## 零件五：循环和报告

循环就是本系列第 7 门课那个循环，骨架一行没变——只是补上了真实 API 必填的 `model` 和 `max_tokens`（桩会忽略它们），再在外面套了计数：

```javascript
let response = await client.messages.create({ model: MODEL, max_tokens: 4096, system, tools: TOOLS, messages });
metrics.tokens += response.usage.input_tokens + response.usage.output_tokens;
while (response.stop_reason === "tool_use") {
  messages.push({ role: "assistant", content: response.content });
  const toolResults = await runToolUses(response.content, metrics);
  messages.push({ role: "user", content: toolResults });
  response = await client.messages.create({ model: MODEL, max_tokens: 4096, system, tools: TOOLS, messages });
  metrics.tokens += response.usage.input_tokens + response.usage.output_tokens;
}
```

`messages` 是 `runTask` 里的局部变量，函数返回它就没了。这就是「任务之间不共享上下文」的全部实现——不需要额外机制，只要别把它提到外面去。

指标这块，官方给的清单是：除了顶层准确率，还建议收集单个工具调用和整条任务的总运行时长、工具调用总数、token 消耗总量、以及工具报错[^S3]。报告表那几列照的就是这份清单。通过率只告诉你「过没过」，这几列告诉你「怎么过的」——一条任务过了但调了十二次工具，和过了只调两次，是两种质量。这几列还自带诊断读法：冗余的工具调用一多，通常说明分页或 token 上限这类参数该重新调；无效参数导致的工具报错一多，通常说明工具描述该写清楚、该补更好的例子[^S3]。练习会直接用上。

报告能给人看，这件事本身有价值。官方文档那条建议是：让 Claude 拿出证据而不是断言成功——测试输出、它跑了什么命令、返回了什么，或者结果的截图；审阅证据比你自己重跑一遍验证快，而且对你没在旁边看的那些会话同样管用[^S4]。这张报告表就是那个证据，贴进 PR 描述或者甩给同事，对方不用重跑就能判断。（打印上唯一的坑是中文全角字符宽度算 2，`padEnd` 直接用会错位，所以代码里自己写了个宽度感知的 `pad`。）

```agentmentor-check
{
  "id": "vq-zh-06-shared-session",
  "label": "所有评测任务共用一个长会话，行不行？",
  "prompt": "同事看完 eval-runner.mjs 提了个优化：现在每条任务都新建一个 messages 数组、跑一个独立循环，太浪费；不如让五条任务共用一个长会话连着跑。理由有两条——前面查过的订单数据后面还能接着用，省 token；而且模型「热身」之后，后面几条会答得更好。这个提议最根本的问题是什么？",
  "whyHere": "这条跑道的形状里，最容易被「优化」掉的就是任务隔离。它看着像重复劳动，其实是评测结果能不能拿来比较的前提。",
  "mode": "single",
  "choices": [
    {
      "id": "a",
      "text": "问题在于根本省不了 token：共用会话时每次请求都要把前面所有任务的消息重发一遍，输入 token 反而会一路涨上去。",
      "correct": false,
      "feedback": "这半句说对了——共用长会话的输入 token 是累加的，省 token 的算盘确实打不响。但这只是提议的理由不成立，不是做法本身不能用的原因。就算 token 真省下来了，这么跑出来的分数也没法用。再看 c。"
    },
    {
      "id": "b",
      "text": "问题在于指标没法按任务拆：共用一个会话之后，工具调用次数、耗时、token 这些数字混在一起，报告表就填不出来了。",
      "correct": false,
      "feedback": "指标确实更难拆，但这是个记账问题：在每条任务的边界打点、把计数器清零，照样能分开统计。能靠工程手段解决的就不是根本原因。根本原因在 c。"
    },
    {
      "id": "c",
      "text": "问题在于任务之间会互相污染：一条评测任务本来就该跑一个独立循环，共用会话后前一条任务留下的上下文会带着后一条走——模型可能直接拿上一条已经查到的订单数据作答，测出来的就不再是这条任务本身的能力；而且任务顺序一换结果就变，两次运行不再可比。",
      "correct": true,
      "feedback": "对。官方给的做法就是「一条评测任务一个循环」，隔离不是浪费，是前提。污染有两层：一层是测的东西变了——前一条任务查回来的数据还留在上下文里，后一条任务一旦撞上相关内容，就可能不调工具、直接凭上文作答，也可能被不相干的旧上下文带偏答错，这时你测的就成了「会不会翻上文」而不是「会不会用工具」；另一层是任务之间产生了顺序依赖，换个顺序、删掉中间一条，剩下几条的分数都可能变，那这条跑道就失去了它唯一的用处——把两次运行放在一起比。"
    }
  ]
}
```

## 完整的 eval-runner.mjs

复制保存成 `eval-runner.mjs`，`node eval-runner.mjs` 直接能跑。不装依赖、不要 `package.json`，Node 18 以上就行（用到顶层 `await`，所以后缀必须是 `.mjs`）。

```javascript
// eval-runner.mjs —— 一条评测任务一个 harness 循环的评测跑道
//
// 跑法：
//   node eval-runner.mjs                  用修好的（做了归一化的）验证器
//   node eval-runner.mjs --strict-verify   换回没做归一化的旧验证器，看误杀

const STRICT = process.argv.includes("--strict-verify");
const MODEL = "claude-opus-5"; // 桩会忽略它；换真 client 时它和 max_tokens 是必填参数

// ============ 1. 被测系统：工具和它们背后的数据 ============

const ORDERS = {
  "SO-1001": { customer: "启明科技", status: "已完成", month: "2026-08", amount: 780.0 },
  "SO-1002": { customer: "启明科技", status: "已完成", month: "2026-08", amount: 500.0 },
  "SO-1003": { customer: "启明科技", status: "待发货", month: "2026-08", amount: 320.0 },
  "SO-1004": { customer: "远山物流", status: "待发货", month: "2026-08", amount: 96.5 },
};

const TOOLS = [
  {
    name: "search_orders",
    description: "按客户名或订单状态查订单，返回订单号列表。customer 和 status 至少要给一个。",
    input_schema: {
      type: "object",
      properties: { customer: { type: "string" }, status: { type: "string" } },
    },
  },
  {
    name: "get_order",
    description: "按订单号查单笔订单的客户、状态、金额。",
    input_schema: {
      type: "object",
      properties: { order_id: { type: "string" } },
      required: ["order_id"],
    },
  },
];

const TOOL_IMPL = {
  search_orders({ customer, status }) {
    if (!customer && !status) {
      throw new Error("参数无效：customer 和 status 至少要给一个");
    }
    const ids = Object.keys(ORDERS).filter(
      (id) =>
        (!customer || ORDERS[id].customer === customer) &&
        (!status || ORDERS[id].status === status)
    );
    return { order_ids: ids };
  },
  get_order({ order_id }) {
    const o = ORDERS[order_id];
    if (!o) throw new Error(`订单 ${order_id} 不存在`);
    return { order_id, ...o };
  },
};

// ============ 2. 桩 client：固定响应队列 ============

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const text = (s) => ({ type: "text", text: s });
const toolUse = (id, name, input) => ({ type: "tool_use", id, name, input });
const useTools = (blocks, [i, o]) => ({
  stop_reason: "tool_use",
  content: blocks,
  usage: { input_tokens: i, output_tokens: o },
  latency_ms: 40,
});
const finish = (s, [i, o]) => ({
  stop_reason: "end_turn",
  content: [text(s)],
  usage: { input_tokens: i, output_tokens: o },
  latency_ms: 40,
});

function stubClient(script, label) {
  if (!script) throw new Error(`[桩] 没有为 ${label} 预写响应队列`);
  let cursor = 0;
  return {
    messages: {
      async create() {
        if (cursor >= script.length) {
          throw new Error(`[桩] ${label} 的响应队列已耗尽（已发出 ${cursor} 次请求）`);
        }
        const res = script[cursor++];
        await sleep(res.latency_ms);
        return res;
      },
    },
  };
}

// ============ 3. 两版系统提示词，和它们对应的响应队列 ============

const SYSTEM_PROMPTS = {
  v1: "你是订单助手。用工具查订单，然后回答用户。",
  v2:
    "你是订单助手。用工具查订单，然后回答用户。\n" +
    "两条硬规则：\n" +
    "1. 用户没给订单号时，先反问要订单号，不要自己猜一个去查。\n" +
    "2. 写给客户的退款说明必须写清退款金额和到账时间。",
};

const SCRIPT_V1 = {
  "t1-total": [
    useTools([toolUse("tu_1", "search_orders", { customer: "启明科技", status: "已完成" })], [420, 60]),
    useTools(
      [
        toolUse("tu_2", "get_order", { order_id: "SO-1001" }),
        toolUse("tu_3", "get_order", { order_id: "SO-1002" }),
      ],
      [520, 88]
    ),
    finish("客户启明科技 2026 年 8 月的已完成订单有 2 笔（SO-1001、SO-1002），合计 ¥1,280.00 元。", [660, 52]),
  ],
  "t2-pending": [
    useTools([toolUse("tu_1", "search_orders", { status: "待发货" })], [415, 46]),
    finish("目前待发货的订单是 SO-1003 和 SO-1004。", [500, 34]),
  ],
  "t3-no-orderid": [
    useTools([toolUse("tu_1", "search_orders", {})], [408, 38]),
    useTools([toolUse("tu_2", "get_order", { order_id: "SO-1001" })], [470, 44]),
    finish("订单 SO-1001 的状态是已完成。", [560, 30]),
  ],
  "t4-refund-note": [
    useTools([toolUse("tu_1", "get_order", { order_id: "SO-1003" })], [430, 42]),
    finish(
      "您好，订单 SO-1003（金额 ¥320.00 元）我们已经受理取消，退款会原路退回。给您带来不便，非常抱歉。",
      [540, 76]
    ),
  ],
  "t5-missing-order": [
    useTools([toolUse("tu_1", "get_order", { order_id: "SO-9999" })], [412, 40]),
    finish("系统里没有找到订单 SO-9999，请确认订单号是否正确。", [478, 36]),
  ],
};

// v2 只有两条任务的响应换了——两个版本的差异就钉死在这里
const SCRIPT_V2 = {
  ...SCRIPT_V1,
  "t3-no-orderid": [
    finish("你说的是哪一笔订单？把订单号发我就行（形如 SO-1001）。", [455, 32]),
  ],
  "t4-refund-note": [
    useTools([toolUse("tu_1", "get_order", { order_id: "SO-1003" })], [462, 42]),
    finish(
      "您好，订单 SO-1003（金额 ¥320.00 元）的取消申请已经受理，退款原路退回，通常 3-5 个工作日到账。给您带来不便，非常抱歉。",
      [572, 94]
    ),
  ],
};

const SCRIPTS = { v1: SCRIPT_V1, v2: SCRIPT_V2 };

// ============ 4. 裁判：也是桩，输出 0.0-1.0 加 pass/fail ============

const JUDGE_PROMPT = `你是评分员。按下面的量表给这段客服回复打分，先写理由，再给分。
量表（每项 0 或 1，取平均作为总分）：
- 金额准确：写清了退款金额，且与订单金额一致
- 到账时间：写清了退款多久到账
- 语气得体：是可以直接发给客户的措辞
只输出 JSON：{"reasoning": "...", "score": 0.0-1.0, "grade": "pass" | "fail"}
score >= 0.8 记 pass。`;

const JUDGE_SCRIPTS = {
  v1: {
    "t4-refund-note": [
      finish(
        JSON.stringify({
          reasoning: "金额与订单一致，语气得体；但没写退款多久到账，客户拿不到预期，三项里缺一项。",
          score: 0.67,
          grade: "fail",
        }),
        [286, 58]
      ),
    ],
  },
  v2: {
    "t4-refund-note": [
      finish(
        JSON.stringify({
          reasoning: "金额、到账时间、语气三项都满足，可以直接发给客户。",
          score: 1.0,
          grade: "pass",
        }),
        [302, 46]
      ),
    ],
  },
};

async function judgeAnswer(task, answer, version, metrics) {
  const client = stubClient(JUDGE_SCRIPTS[version][task.id], `judge/${version}/${task.id}`);
  const res = await client.messages.create({
    model: MODEL,
    max_tokens: 1024,
    system: JUDGE_PROMPT,
    messages: [{ role: "user", content: `【任务】${task.prompt}\n【待评回复】${answer}` }],
  });
  metrics.tokens += res.usage.input_tokens + res.usage.output_tokens;
  const verdict = JSON.parse(res.content.map((b) => b.text).join(""));
  return { pass: verdict.grade === "pass", score: verdict.score, note: verdict.reasoning };
}

// ============ 5. 评测集：4 条常规 + 1 条边缘用例 ============

function amountsIn(s) {
  return [...s.replace(/[,，\s¥￥]/g, "").matchAll(/\d+(?:\.\d+)?/g)].map((m) => Number(m[0]));
}
function orderIdsIn(s) {
  return [...new Set(s.match(/SO-\d+/g) ?? [])].sort();
}

const TASKS = [
  {
    id: "t1-total",
    grader: "确定性",
    prompt: "客户启明科技 2026 年 8 月的已完成订单，总金额是多少？",
    verify: (r) => ({
      pass: amountsIn(r.answer).some((n) => Math.abs(n - 1280) < 0.005),
      note: "答案里要出现 1280 这个数（允许货币符号、千分位、单位）",
    }),
    strictVerify: (r) => ({
      pass: r.answer.includes("1280.00"),
      note: "答案里要原样出现字符串 1280.00",
    }),
  },
  {
    id: "t2-pending",
    grader: "确定性",
    prompt: "现在有哪些订单还没发货？把订单号列出来。",
    verify: (r) => ({
      pass: JSON.stringify(orderIdsIn(r.answer)) === JSON.stringify(["SO-1003", "SO-1004"]),
      note: "答案里的订单号集合要正好等于 SO-1003 + SO-1004",
    }),
  },
  {
    id: "t3-no-orderid",
    grader: "确定性",
    prompt: "帮我把那笔订单的状态查一下。",
    verify: (r) => ({
      pass: r.toolCalls === 0 && r.answer.includes("？") && r.answer.includes("订单号"),
      note: "参数不全时应该一次工具都不调，直接反问要订单号",
    }),
  },
  {
    id: "t4-refund-note",
    grader: "LLM 裁判",
    judge: true,
    prompt: "客户为订单 SO-1003 申请取消并退款，给他写一段回复。",
  },
  {
    id: "t5-missing-order",
    grader: "确定性",
    prompt: "查一下订单 SO-9999 的状态。",
    verify: (r) => ({
      pass: r.toolErrors === 1 && /没有找到|未找到|不存在/.test(r.answer) && !/[¥￥]|元/.test(r.answer),
      note: "工具报错后要如实说查不到，且不能顺手编一个金额出来",
    }),
  },
];

// ============ 6. 一条任务一个 harness 循环 ============

async function runToolUses(content, metrics) {
  const results = [];
  for (const block of content) {
    if (block.type !== "tool_use") continue;
    metrics.toolCalls += 1;
    try {
      const out = TOOL_IMPL[block.name](block.input);
      results.push({ type: "tool_result", tool_use_id: block.id, content: JSON.stringify(out) });
    } catch (err) {
      metrics.toolErrors += 1;
      results.push({ type: "tool_result", tool_use_id: block.id, content: err.message, is_error: true });
    }
  }
  return results;
}

async function runTask(task, version) {
  const metrics = { toolCalls: 0, toolErrors: 0, tokens: 0 };
  const client = stubClient(SCRIPTS[version][task.id], `${version}/${task.id}`);
  const system = SYSTEM_PROMPTS[version];
  const messages = [{ role: "user", content: task.prompt }];
  const startedAt = Date.now();

  let response = await client.messages.create({ model: MODEL, max_tokens: 4096, system, tools: TOOLS, messages });
  metrics.tokens += response.usage.input_tokens + response.usage.output_tokens;
  while (response.stop_reason === "tool_use") {
    messages.push({ role: "assistant", content: response.content });
    const toolResults = await runToolUses(response.content, metrics);
    messages.push({ role: "user", content: toolResults });
    response = await client.messages.create({ model: MODEL, max_tokens: 4096, system, tools: TOOLS, messages });
    metrics.tokens += response.usage.input_tokens + response.usage.output_tokens;
  }

  const answer = response.content
    .filter((b) => b.type === "text")
    .map((b) => b.text)
    .join("\n");

  let verdict;
  if (task.judge) {
    verdict = await judgeAnswer(task, answer, version, metrics);
  } else {
    const fn = STRICT && task.strictVerify ? task.strictVerify : task.verify;
    const out = fn({ answer, ...metrics });
    verdict = { pass: out.pass, score: out.pass ? 1 : 0, note: out.note };
  }

  return {
    id: task.id,
    grader: task.grader,
    pass: verdict.pass,
    score: verdict.score,
    note: verdict.note,
    answer,
    durationMs: Date.now() - startedAt,
    ...metrics,
  };
}

async function runSuite(version) {
  const rows = [];
  for (const task of TASKS) rows.push(await runTask(task, version));
  return {
    version,
    verifier: STRICT ? "strict（旧版，没做归一化）" : "normalized（修好的）",
    rows,
    passed: rows.filter((r) => r.pass).length,
    total: rows.length,
    toolCalls: rows.reduce((n, r) => n + r.toolCalls, 0),
    toolErrors: rows.reduce((n, r) => n + r.toolErrors, 0),
    tokens: rows.reduce((n, r) => n + r.tokens, 0),
    durationMs: rows.reduce((n, r) => n + r.durationMs, 0),
  };
}

// ============ 7. 报告 ============

const CJK = /[ᄀ-ᅟ⺀-꓏가-힣豈-﫿︰-﹏＀-｠￠-￦]/;
const width = (s) => [...String(s)].reduce((n, ch) => n + (CJK.test(ch) ? 2 : 1), 0);
const pad = (s, n) => String(s) + " ".repeat(Math.max(0, n - width(s)));
const padL = (s, n) => " ".repeat(Math.max(0, n - width(s))) + String(s);

function printReport(report) {
  console.log(`\n=== 报告 · 提示词 ${report.version} · 验证器 ${report.verifier} ===`);
  console.log(
    pad("任务", 18) + pad("判分", 11) + pad("结果", 7) + padL("分数", 6) +
    padL("调用", 6) + padL("报错", 6) + padL("tokens", 9) + padL("耗时", 8)
  );
  console.log("-".repeat(71));
  for (const r of report.rows) {
    console.log(
      pad(r.id, 18) + pad(r.grader, 11) + pad(r.pass ? "pass" : "FAIL", 7) +
      padL(r.score.toFixed(2), 6) + padL(r.toolCalls, 6) + padL(r.toolErrors, 6) +
      padL(r.tokens.toLocaleString("en-US"), 9) + padL(`${r.durationMs}ms`, 8)
    );
  }
  console.log("-".repeat(71));
  const rate = ((report.passed / report.total) * 100).toFixed(0);
  console.log(
    `通过率 ${report.passed}/${report.total} (${rate}%) · 工具调用 ${report.toolCalls} 次 · ` +
    `工具报错 ${report.toolErrors} 次 · tokens ${report.tokens.toLocaleString("en-US")} · 总耗时 ${report.durationMs}ms`
  );
  const failed = report.rows.filter((r) => !r.pass);
  if (failed.length) {
    console.log("\n未通过明细：");
    for (const r of failed) {
      console.log(`  [${r.id}] 判据：${r.note}`);
      console.log(`  Agent 回答：${r.answer}`);
    }
  }
}

function printDiff(a, b) {
  console.log(`\n=== 分数变化 ${a.version} -> ${b.version} ===`);
  console.log(pad("任务", 18) + padL(a.version, 7) + padL(b.version, 7) + "  变化");
  console.log("-".repeat(48));
  for (let i = 0; i < a.rows.length; i++) {
    const x = a.rows[i], y = b.rows[i];
    let mark = "持平";
    if (!x.pass && y.pass) mark = "fail => pass";
    else if (x.pass && !y.pass) mark = "pass => FAIL";
    else if (y.score !== x.score) mark = `分数 ${(y.score - x.score).toFixed(2)}`;
    console.log(pad(x.id, 18) + padL(x.score.toFixed(2), 7) + padL(y.score.toFixed(2), 7) + "  " + mark);
  }
  console.log("-".repeat(48));
  console.log(`通过率 ${a.passed}/${a.total} -> ${b.passed}/${b.total}`);
}

// ============ 8. 入口 ============

const reportV1 = await runSuite("v1");
printReport(reportV1);
const reportV2 = await runSuite("v2");
printReport(reportV2);
printDiff(reportV1, reportV2);
```

## 回收第 3 课的坑：过严的验证器

第 3 课讲过一个陷阱，官方的原话是：别写过严的验证器，因为格式、标点、或者同样有效的不同措辞这类无关紧要的差异，把正确的回答给否了[^S3]。听着像常识，写代码时几乎躲不掉，因为过严的验证器写起来最省事。

跑道里就埋了一个。`t1-total` 有两版验证器，旧版是 `pass: r.answer.includes("1280.00")`——看上去无懈可击：正确答案就是 1280.00，那就查答案里有没有这串字符。跑 `node eval-runner.mjs --strict-verify`（下面只贴 v1 那一段，v2 报告和对比表照常打）：

```text
=== 报告 · 提示词 v1 · 验证器 strict（旧版，没做归一化） ===
任务              判分       结果     分数  调用  报错   tokens    耗时
-----------------------------------------------------------------------
t1-total          确定性     FAIL     0.00     3     0    1,800   122ms
t2-pending        确定性     pass     1.00     1     0      995    83ms
t3-no-orderid     确定性     FAIL     0.00     2     1    1,550   124ms
t4-refund-note    LLM 裁判   FAIL     0.67     1     0    1,432   124ms
t5-missing-order  确定性     pass     1.00     1     1      966    82ms
-----------------------------------------------------------------------
通过率 2/5 (40%) · 工具调用 8 次 · 工具报错 2 次 · tokens 6,743 · 总耗时 535ms

未通过明细：
  [t1-total] 判据：答案里要原样出现字符串 1280.00
  Agent 回答：客户启明科技 2026 年 8 月的已完成订单有 2 笔（SO-1001、SO-1002），合计 ¥1,280.00 元。
  [t3-no-orderid] 判据：参数不全时应该一次工具都不调，直接反问要订单号
  Agent 回答：订单 SO-1001 的状态是已完成。
  [t4-refund-note] 判据：金额与订单一致，语气得体；但没写退款多久到账，客户拿不到预期，三项里缺一项。
  Agent 回答：您好，订单 SO-1003（金额 ¥320.00 元）我们已经受理取消，退款会原路退回。给您带来不便，非常抱歉。
```

这段也是真跑出来的。看 `t1-total` 那条明细：Agent 答的是「合计 ¥1,280.00 元」，金额算对了、订单列对了、措辞是正常中文。它唯一的罪状是在 1 和 280 之间打了个千分位逗号，于是 `includes("1280.00")` 返回 false，一条完全正确的回答被判 fail。

**这时候要修的是验证器，不是 Agent。** 报告只会告诉你「t1 fail」，不会告诉你锅在谁那儿；分辨的办法就是读明细里的 Agent 原话，那正是报告特意把答案原文打出来的原因。

修法是归一化。官方对精确匹配的描述本来就带着这一步：精确匹配评估的是模型输出与预设正确答案是否一致，通常先做空白和大小写的归一化[^S5]。金额场景要洗的更多——货币符号、千分位、单位，所以修好的验证器先洗噪声，再把数字抠出来按数值比：

```javascript
function amountsIn(s) {
  return [...s.replace(/[,，\s¥￥]/g, "").matchAll(/\d+(?:\.\d+)?/g)].map((m) => Number(m[0]));
}
verify: (r) => ({
  pass: amountsIn(r.answer).some((n) => Math.abs(n - 1280) < 0.005),
  note: "答案里要出现 1280 这个数（允许货币符号、千分位、单位）",
}),
```

去掉 `--strict-verify` 再跑，`t1-total` 从 0.00 变成 1.00，v1 基线从 2/5 回到 3/5——而这中间，Agent 一个字都没改，桩里的响应队列一个字都没动。**分数变了但被测对象没变，这就是「验证器问题」的判定标准。**

顺带一句分寸：归一化不是越松越好。松到「出现过 1280 就算过」，Agent 答「共 1280 笔订单，金额未知」也会判 pass。验证器要卡在「无关差异放过、实质错误拦住」的位置上，找到这个位置的唯一办法是拿真实答案去试。

## 改一处提示词，看分数动了没有

跑道校准好了，可以拿它干正事。我只动了一个地方——系统提示词，在 v1 后面加了两条规则：

```javascript
const SYSTEM_PROMPTS = {
  v1: "你是订单助手。用工具查订单，然后回答用户。",
  v2:
    "你是订单助手。用工具查订单，然后回答用户。\n" +
    "两条硬规则：\n" +
    "1. 用户没给订单号时，先反问要订单号，不要自己猜一个去查。\n" +
    "2. 写给客户的退款说明必须写清退款金额和到账时间。",
};
```

这两条不是拍脑袋想的，是从 v1 那份报告的「未通过明细」里读出来的：`t3` fail 是因为参数不全时它自己猜了个订单号，`t4` 被扣分是因为漏了到账时间。**报告说什么，你就改什么**，这是有跑道和没跑道最实在的区别。

重跑之后的对比表就是开头那份输出的最后一段：通过率从 60% 到 100%，两条任务从 fail 转 pass，另外三条纹丝不动。最后这半句和前半句一样重要——它说明这次改动没把已经对的东西改坏。没有跑道时，你改完提示词只能看一眼输出觉得「好像更好了」；有了跑道，「哪条变好、哪条没动、有没有变坏」是三行数字。

官方对这件事的表述是：有了评测，你就能更有信心地测量提示词工程带来的影响，哪怕只是对工具描述做很小的改动，也可能带来相当大的提升[^S3]。这里还有个便宜可以捡：在 Agent 开发早期，改动的影响往往很大，因为唾手可得的改进点还很多——一次提示词微调就可能把成功率从 30% 提到 80%，效应量这么大的时候，几条测试用例就足以看出差异[^S2]。你现在只有五条任务，这不是缺陷，是起点。

再看指标列：v2 的工具调用从 8 次降到 6 次，工具报错从 2 次降到 1 次，token 少了近千，因为 `t3` 不再瞎猜着去调工具了。**同一次改动同时改善了正确率和成本**——这种事只有把这几列一起记下来才看得见。

## 分寸：这条跑道管什么，不管什么

**它管的是**：一个 Agent、一批任务、在你本机跑一遍，出一张能给人看的报告。

**换成真模型**，跑道结构不用改。把 `stubClient(...)` 换成 `@anthropic-ai/sdk` 的真 client，`runTask` 里那个 while 循环一行都不用动——它本来就是照真实 API 的 `stop_reason` / `tool_use` / `tool_result` 形状写的，`model` 和 `max_tokens` 这两个必填参数也已经带上（桩会忽略它们，真 client 正好用上）。换完有两件事会变：分数会抖，因为 Agent 在两次运行之间是非确定性的，即便提示词完全一样[^S2]，所以单次结果别看得太重；跑一轮要花钱花时间，五条任务无所谓，两百条就得考虑并发和成本了。

**它不管的**：把评测挂进 CI、每次提交都跑一遍、和历史版本比分数、跌破阈值就拦住合并——这些是常见的工程做法，也确实好用，但本课不展开；练习 Level 2 会带你把「两份报告比一比」这一小步做出来，剩下的编排是你自己 CI 的事。

还有一条第 5 课的纪律要复述一遍：**留出集别拿来调参**。你照着报告改提示词，改上几轮分数一定会涨，但涨的可能只是「在这五条任务上的分数」。官方的做法是依靠留出的测试集，确保没有对用来调优的那批评测过拟合[^S3]。所以真做起来任务该分两堆：一堆天天跑、照着改，另一堆锁起来，只在你觉得「这版应该行了」的时候开一次。第一堆的分数是导航，第二堆的分数才是结论。

最后一条老话：自动评测会漏。人工测试的人总能撞见评测漏掉的边缘情况——不寻常查询上的编造、系统性故障、隐蔽的信源偏好[^S2]。跑道跑得再顺，也别停掉自己上手用的习惯。

## 💻 练习

<!-- exercises -->

### Level 1：读报告，别急着改代码

不写代码。回到正文开头那两份报告（v1 基线和 v2 改动后），汇总行是：

```text
v1： 通过率 3/5 (60%)  · 工具调用 8 次 · 工具报错 2 次 · tokens 6,743
v2： 通过率 5/5 (100%) · 工具调用 6 次 · 工具报错 1 次 · tokens 5,766
```

对着完整的两张表回答三个问题，每题写三到五句：

1. `t1-total` 两份报告里都 pass，但它的工具调用次数是全场最高的 3 次。这说明什么问题？该动哪里？
2. v1 里有 2 次工具报错，v2 剩 1 次。这两次报错是同一类问题吗？各自意味着什么、各自该不该修？
3. 正文里还有第三份报告（`--strict-verify` 那份），里面 `t1-total` 是 0.00。同一条任务在两份报告里一个 0.00 一个 1.00，你凭什么判断这个分数差是验证器的问题而不是 Agent 的问题？

<!-- rubric -->

- 第 1 题要点出「`search_orders` 只返回订单号、不返回金额，所以每个订单都要再调一次 `get_order`」这个因果，指出订单数一多调用次数就跟着涨，并按 S3 的读法把冗余调用识别为「分页 / 返回量参数需要调整」的信号；改的对象要落在**工具**（让 `search_orders` 带上摘要字段），不是提示词或 Agent。
- 第 2 题要区分两次报错的性质：`t3` 那次是**无效参数**报错（`search_orders({})`），按 S3 的读法指向工具描述不清楚或缺例子，该修；`t5` 那次是订单本身不存在，是这条任务**故意要考的**行为，报错出现是预期内的。答案要明确说出「工具报错数不是越低越好」。
- 第 3 题要给出可操作的判据：两份报告里 Agent 的回答原文、调用次数、tokens 全都一致，变的只有验证器，所以变化来自判分侧；并指出判断依据是读明细里的 Agent 原话，确认答案实质正确（1,280.00 与 1280.00 只差一个千分位）。
- 三题都不要求写代码；写了代码但没答出上述判断的不算过。

<!-- hint -->

第 1 题别只盯着「3 次很多」这个结论，去看 `search_orders` 的返回值是什么。它返回 `{ order_ids: [...] }`——只有订单号。Agent 想知道金额，除了一条条 `get_order` 还有别的办法吗？

<!-- hint -->

第 3 题的关键是控制变量。把两份报告里 `t1-total` 那一行的每一列都对一遍：调用次数、报错次数、tokens 有没有变？再把两份明细里的 Agent 回答原文对一遍。哪一列变了，问题就在那一侧。

<!-- answer -->

**第 1 题。** `t1-total` 要 3 次工具调用，是 `search_orders` 的返回值设计造成的：它只回 `{ order_ids: ["SO-1001", "SO-1002"] }`，金额一个字没带，Agent 想算总额就只能对每个订单号再调一次 `get_order`。调用次数是 1 + N，N 是命中的订单数——四条订单看着还好，客户手上有五十笔时这一条任务就会打出五十一次调用，token 和耗时跟着线性涨，还容易撞上上下文上限。

官方对这个信号的读法是：大量冗余的工具调用通常说明分页或 token 上限这类参数需要重新调整[^S3]。具体改法是让 `search_orders` 直接返回摘要字段（订单号 + 状态 + 金额），再配分页参数控制单次返回量。**要动的是工具，不是提示词，也不是 Agent。** 这条也解释了为什么通过率之外的指标必须记——`t1` 两份报告都 pass，光看通过率你永远发现不了这个问题。

**第 2 题。** 不是同一类，两次报错的性质相反。

`t3-no-orderid` 那次是 Agent 没有订单号还调了 `search_orders({})`，两个筛选参数都没给，被工具拒了——这是**无效参数**报错。官方的读法是：这类报错多了，通常说明工具描述可以写得更清楚、或者该补更好的例子[^S3]。这次该修，v2 加了「先反问要订单号」之后它就消失了；不想改提示词的话，另一个方向是把工具描述写硬，或者给工具定义加 `strict: true`，让参数约束在 API 层面就生效[^S6]。

`t5-missing-order` 那次是查 `SO-9999`，工具报「订单不存在」。这不是缺陷，正是这条任务要考的东西——工具报错之后 Agent 会不会如实说查不到，还是顺手编个金额出来。这条的验证器写的是 `r.toolErrors === 1`，也就是说**这次报错必须发生**，报错数变成 0 反而说明测试没跑到点上。所以工具报错这一列不是越低越好，要看报错是哪来的；把两类混着看「报错从 2 降到 1，进步了」，是把一个真修复和一个预期行为搅成了一个数。

**第 3 题。** 判据是控制变量：把 `t1-total` 那一行在两份报告里逐列对比——调用 3 次对 3 次，报错 0 对 0，tokens 1,800 对 1,800，Agent 侧一切没变。再看明细，`--strict-verify` 那份打出的 Agent 原话是「……合计 ¥1,280.00 元。」，金额对、订单对、措辞正常。两次运行之间唯一变的是命令行上那个开关，也就是判分侧，所以分数差全部来自验证器：旧版做的是 `includes("1280.00")` 的字面比对，被千分位逗号绊倒了。这正是官方警告过的那类错误——别让验证器因为格式、标点这种无关差异否掉正确的回答[^S3]。修的对象是 `verify` 函数；改 Agent 去迁就验证器，是把跑道的毛病记在被测对象头上。

这个判断能做出来，靠的是报告把 Agent 的回答原文打进了明细。报告只打 pass/fail 的话，你得手动重跑一遍才知道它到底答了什么——报告要能当证据用，就得带上原始材料[^S4]。

---

### Level 2：给跑道加「两次运行对比」

写代码，必须能跑。给 `eval-runner.mjs` 加两件事：

1. **报告落盘**：加一个 `writeJsonAtomic(file, obj)`，用本系列第 9 门课的原子写法（先写 `.tmp` 再 `rename`）把一次运行的报告写成 JSON。命令行支持 `--version v1 --out reports/v1.json`。
2. **写一个 `compare.mjs`**：读两份报告 JSON，按任务打印分数差（基线分、新分、差值、状态），最后打印通过率变化；只要有任何一条任务从 pass 变成 fail，就往 stderr 打一条摘要并以非零码退出。

跑通这四条命令并贴出输出：

```text
node eval-runner.mjs --version v1 --out reports/v1.json
node eval-runner.mjs --version v2 --out reports/v2.json
node compare.mjs reports/v1.json reports/v2.json   # 应该退出码 0
node compare.mjs reports/v2.json reports/v1.json   # 应该退出码 1
```

（把参数反过来传，就等于人为制造一次「新版比基线差」的场景，用来验证非零退出这条路径真的走得通。）

<!-- rubric -->

- `writeJsonAtomic` 必须是「写临时文件 + `fs.renameSync`」两步，不能直接 `fs.writeFileSync(file, ...)` 了事；要能自动创建目录（`fs.mkdirSync(..., { recursive: true })`）。
- 落盘的 JSON 要能被 `compare.mjs` 单独消费：至少包含 `version`、`passed`、`total` 和一个 `rows` 数组，每行带 `id`、`pass`、`score`。**不要把 `durationMs` 写进去**——耗时每次都抖，写进报告会让两份 JSON 永远不相等；写进去也不算错，但比对时必须忽略这一列。
- `compare.mjs` 要按任务 id 对齐两份报告，不能按数组下标硬对——任务增删之后下标会错位。
- 换掉入口之后要把失去调用方的 `printDiff` 删干净，改完的文件里不能留没人调用的函数。
- 退出码分两档：有 pass 转 fail 时 `process.exit(1)`，回归摘要走 stderr；没有回归时正常退出（0）。参数缺失可以用其他非零码（比如 2）区分「用法错误」和「有回归」。
- 必须贴出四条命令的真实输出，且第三条退出码为 0、第四条为 1。

<!-- hint -->

原子写只有三行，别想复杂：`fs.writeFileSync(file + ".tmp", JSON.stringify(obj, null, 2))`，然后 `fs.renameSync(file + ".tmp", file)`。同一个文件系统内的 `rename` 是原子的，所以 `compare.mjs` 要么读到完整的旧文件，要么读到完整的新文件，不会读到写了一半的。

<!-- hint -->

判断有没有回归时别拿分数差来判。分数从 1.00 掉到 0.67 是下降，但可能还在 pass 线以上（裁判那条的 pass 线是 0.8）；从 1.00 掉到 0.00 才是确定的 fail。直接比 `pass` 这个布尔字段：`was.pass && !now.pass` 才叫回归，分数变化单独作为一列打印就行。

<!-- answer -->

**改 `eval-runner.mjs`。** 文件顶部加两个 import 和原子写函数：

```javascript
import fs from "node:fs";
import path from "node:path";

const STRICT = process.argv.includes("--strict-verify");

// 原子写：先写 .tmp，再 rename——半截文件不会被 compare.mjs 读到
function writeJsonAtomic(file, obj) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(obj, null, 2));
  fs.renameSync(tmp, file);
}
```

再把第 8 节的入口整段换掉——一次跑一个版本，写到指定文件：

```javascript
// ============ 8. 入口 ============
// 用法：node eval-runner.mjs --version v1 --out reports/v1.json
const argOf = (flag, fallback) => {
  const i = process.argv.indexOf(flag);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
};
const version = argOf("--version", "v1");
const out = argOf("--out", null);

const report = await runSuite(version);
printReport(report);

if (out) {
  writeJsonAtomic(out, {
    version: report.version,
    passed: report.passed,
    total: report.total,
    ranAt: new Date().toISOString(),
    rows: report.rows.map(({ id, pass, score, toolCalls, toolErrors, tokens }) => ({
      id, pass, score, toolCalls, toolErrors, tokens,
    })),
  });
  console.log(`\n报告已写入 ${out}`);
}
```

换掉入口之后 `printDiff` 就没有调用方了——**把这个函数一并删掉**，别留着当死代码。它的活儿从这一步起归 `compare.mjs`：`printDiff` 只能比同一次进程里跑出来的两份报告，`compare.mjs` 能比任意两次运行，隔几天、换台机器都行。落盘时还特意把 `durationMs` 和 `answer` 剔掉了：耗时每次都抖，答案原文太长，两样都会让 JSON 之间的比对变吵。

**`compare.mjs` 全文：**

```javascript
// compare.mjs —— 读两份报告，按任务打印分数差；有 pass 变 fail 就非零退出
// 用法：node compare.mjs reports/v1.json reports/v2.json
import fs from "node:fs";

const [baseFile, headFile] = process.argv.slice(2);
if (!baseFile || !headFile) {
  console.error("用法：node compare.mjs <基线报告.json> <新报告.json>");
  process.exit(2);
}
const read = (f) => JSON.parse(fs.readFileSync(f, "utf8"));
const base = read(baseFile);
const head = read(headFile);
const wasById = new Map(base.rows.map((r) => [r.id, r]));
const regressions = [];

console.log(`base ${baseFile} (${base.version})  ->  head ${headFile} (${head.version})`);
console.log("task".padEnd(18) + "base".padStart(6) + "head".padStart(7) + "delta".padStart(8) + "  状态");
console.log("-".repeat(52));

for (const now of head.rows) {
  const was = wasById.get(now.id);
  if (!was) {
    console.log(now.id.padEnd(18) + "-".padStart(6) + now.score.toFixed(2).padStart(7) + "-".padStart(8) + "  新增任务");
    continue;
  }
  const delta = now.score - was.score;
  let state = "持平";
  if (was.pass && !now.pass) {
    state = "回归 pass => FAIL";
    regressions.push(now.id);
  } else if (!was.pass && now.pass) {
    state = "修复 fail => pass";
  } else if (Math.abs(delta) > 1e-9) {
    state = delta > 0 ? "分数上升" : "分数下降";
  }
  console.log(
    now.id.padEnd(18) + was.score.toFixed(2).padStart(6) + now.score.toFixed(2).padStart(7) +
    (delta >= 0 ? `+${delta.toFixed(2)}` : delta.toFixed(2)).padStart(8) + "  " + state
  );
}

console.log("-".repeat(52));
console.log(`通过率 ${base.passed}/${base.total} -> ${head.passed}/${head.total}`);
const missing = base.rows.filter((r) => !head.rows.some((n) => n.id === r.id)).map((r) => r.id);
if (missing.length) console.log(`新报告里缺失的任务：${missing.join("、")}`);

if (regressions.length) {
  console.error(`\n有 ${regressions.length} 条任务从 pass 变 fail：${regressions.join("、")}`);
  process.exit(1);
}
console.log("\n没有任务从 pass 变 fail。");
```

（这段可以放心用裸 `padEnd`：被填充的列全是 ASCII 的任务 id 和数字，中文状态词只出现在行尾、不参与对齐，正文里「全角宽度算 2」那个坑踩不到。列里会出现中文时，还是得用宽度感知的 `pad`。）

**真实运行输出。** 两次跑评测的报告表和正文里的一样，这里只留最后一行；`退出码=` 那行是在命令后面接了 `echo "退出码=$?"` 打出来的。

```text
$ node eval-runner.mjs --version v1 --out reports/v1.json | tail -1
报告已写入 reports/v1.json

$ node eval-runner.mjs --version v2 --out reports/v2.json | tail -1
报告已写入 reports/v2.json
```

正向比对，没有回归，退出码 0：

```text
$ node compare.mjs reports/v1.json reports/v2.json
base reports/v1.json (v1)  ->  head reports/v2.json (v2)
task                base   head   delta  状态
----------------------------------------------------
t1-total            1.00   1.00   +0.00  持平
t2-pending          1.00   1.00   +0.00  持平
t3-no-orderid       0.00   1.00   +1.00  修复 fail => pass
t4-refund-note      0.67   1.00   +0.33  修复 fail => pass
t5-missing-order    1.00   1.00   +0.00  持平
----------------------------------------------------
通过率 3/5 -> 5/5

没有任务从 pass 变 fail。
退出码=0
```

把两个文件反过来传，模拟一次「新版把 v2 的改动退回去了」，非零退出这条路径也走通了：

```text
$ node compare.mjs reports/v2.json reports/v1.json
base reports/v2.json (v2)  ->  head reports/v1.json (v1)
task                base   head   delta  状态
----------------------------------------------------
t1-total            1.00   1.00   +0.00  持平
t2-pending          1.00   1.00   +0.00  持平
t3-no-orderid       1.00   0.00   -1.00  回归 pass => FAIL
t4-refund-note      1.00   0.67   -0.33  回归 pass => FAIL
t5-missing-order    1.00   1.00   +0.00  持平
----------------------------------------------------
通过率 5/5 -> 3/5

有 2 条任务从 pass 变 fail：t3-no-orderid、t4-refund-note
退出码=1
```

两个实现细节值得留意。一是按 `id` 对齐而不是按下标——`wasById` 那个 Map 就是干这个的，以后往评测集里插一条新任务，老报告也还能比。二是回归的判定用 `was.pass && !now.pass`，不用分数阈值：`t4` 从 1.00 掉到 0.67 是分数下降**且**越过了裁判的 0.8 pass 线，两个条件都成立才算回归；哪天量表调了、pass 线跟着变，这段代码不用改。

<!-- /exercises -->

## 小结

- 跑评测的标准形状是程序化的直接 API 调用加简单 agentic 循环，**一条评测任务一个循环**；任务之间不共享 `messages`，否则前一条的上下文会污染后一条，结果不再可比[^S3]。
- 每条评测提示都要配一个可验证的结果，验证器从精确字符串比对到请模型当裁判是一条光谱——能用代码判的绝不请裁判，因为代码判分最快、最可靠、最能扩展[^S3][^S5]。
- 自由文本才交给裁判，形状是单次调用、单个提示词、输出 0.0–1.0 的分数加一个通过/不通过；量表要先推理再给分，输出格式要限死[^S2][^S5]。
- 报告除通过率外还要记任务耗时、工具调用次数、token 消耗和工具报错；这几列自带诊断读法——冗余调用多指向分页/返回量参数该调，无效参数报错多指向工具描述该写清楚[^S3]。
- 验证器过严会把正确回答判死：格式、标点、合理的不同措辞都可能绊倒字面比对，精确匹配前先做归一化[^S3][^S5]。分数变了但被测对象没变，锅在验证器。
- 有了跑道，提示词改动的影响就能被测量出来，小改动也可能带来相当大的提升；早期效应量大，几条用例就够看出差异[^S3][^S2]。报告本身就是可以给人看的证据，审阅证据比自己重跑一遍验证快[^S4]。
- 照着报告改会让分数涨，但涨的可能只是这批任务上的分数，留出集要锁起来防过拟合[^S3]；自动评测漏掉的边缘情况，仍要靠人上手用出来[^S2]。

## 走完这门课之后

回头看这条主线其实很短。第 1 课分清了「看起来做完了」和「做完了」——没有可跑的检查时，「看起来做完了」是唯一可用的信号，而你自己就成了那个验证环节[^S4]。第 2 课定了验什么：Agent 可能走完全不同的合理路径到达同一个目标，所以评终态，别逐步核对轨迹[^S2]。第 3 课把「检查」落成能跑出 pass/fail 的确定性验证器，也提醒了过严的验证器会把对的判错[^S3]。第 4 课处理自由文本那一块——量表、输出格式，以及干活的模型不该自己当裁判[^S2][^S4]。第 5 课解决「拿多少条用例验」：二十来条真实任务就能起步，别等攒够几百条再开始[^S2]。这一课把前五课焊成了一个三百行的文件。

那个文件不复杂，跑一次不到两秒，但它改变的东西是具体的：从今天起你改一版提示词，不用再凭「读了几段输出感觉更好了」下判断——敲一行命令，v1 到 v2 那张对比表会替你说话，就像这次 `t3` 和 `t4` 翻绿、其余三条纹丝不动那样。下次你的 Agent 说「做完了」，你手里有两条命令和一个退出码去核实这句话。

下次你的 Agent 说「做完了」，你手里有一条能跑的跑道去核实。
