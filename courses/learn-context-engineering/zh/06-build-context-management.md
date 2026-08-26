# 第 6 课：实战：给 harness 装上上下文管理

> 学习目标：
> - 能给一个 stop_reason 驱动的 harness 循环接上 token 用量追踪：用 `response.usage` 累加，判断上下文是否逼近本轮窗口的上限
> - 能把第 4 课的 `compact()` 接成阈值触发的机制：定好触发比例，想清楚触发后 `messages` 和用量计数器该怎么重置
> - 能把结构化笔记接入这条压缩流程，让 `NOTES.md` 在每次重启新窗口时被读回来兜底，并跑通一个超出单窗口容量的长任务
> 前置要求：完成第 4 课的压缩与笔记、第 5 课的子代理隔离，手边能跑起本系列第 7 门课《Agent Harness 基础：循环与控制》写的 harness 循环 | 上一课 [第 5 课 <<](./05-subagent-context-isolation.md)

## 先看它跑起来的样子

前五课都在讲道理：为什么上下文是有限资源、压缩怎么做、笔记怎么记、子代理怎么隔离。这一课把前两件——压缩、笔记——真正焊进你在本系列第 7 门课写的那个 harness 循环。先看它跑起来是什么样，再拆代码。

下面是一次真实执行的记录（用一个桩 client 模拟模型的多轮回复，好让长任务在几行日志里就能复现；桩 client 的写法本课最后会给出）。任务是第 4 课那个熟悉的场景：修一个订单服务的并发竞态 bug。为了让压缩在几轮内就能触发，这次演示把上下文窗口故意设得很小：

```text
[call 1] stop_reason=tool_use 累计tokensUsed=400
[call 2] stop_reason=tool_use 累计tokensUsed=1050
[call 3] stop_reason=tool_use 累计tokensUsed=1850
[call 4] >>> 触发压缩 (第 1 次), tokensUsed 重置为 0
[call 5] stop_reason=tool_use 累计tokensUsed=280
[call 6] stop_reason=end_turn 累计tokensUsed=490

最终回复: 已给 orders 表加 version 字段并接入乐观锁, 竞态 bug 修复完成。
模型调用总次数: 6 (含 1 次压缩调用)
压缩触发次数: 1

NOTES.md 最终内容:
## 已定决策
- 修复方案: 数据库乐观锁 (orders 表加 version 字段)
## 未解决
- (无 -- updateStatus 竞态已随乐观锁合入解决)
```

逐行读一遍：前三次调用一路把 `tokensUsed` 从 400 累到 1050 再到 1850；第三轮工具结果追加进历史之后，累计值越过了设定的阈值，harness 没有等窗口真的爆掉，而是主动打了一次压缩调用（call 4，`stop_reason` 已经不重要了，因为这次响应根本不进主循环，它的产出直接被用来重启 `messages`）；`tokensUsed` 归零；后面两轮在新窗口里重新计数，直到模型收尾。整个过程只有一件事对用户可见——最终那句回复；压缩和笔记发生在幕后。这一课剩下的篇幅，就是把这段日志背后的代码一行行搭出来。

## 一、给循环装上 token 用量追踪

第一步最朴素：知道自己已经用了多少 token，是判断要不要压缩的前提。你在本系列第 7 门课写预算阀（阀2）时已经用过这个字段——`response.usage` 里带着这次调用的 `input_tokens` 和 `output_tokens`，每拿到一次响应就往一个累加器里加：

```javascript
function trackUsage(tokensUsed, response) {
  return tokensUsed + response.usage.input_tokens + response.usage.output_tokens;
}
```

本系列第 7 门课的 `TOKEN_BUDGET` 阀用这个累加值做的是一件事：到顶就整个停手。本课要做的是另一件事：到某个更早的比例就主动压缩、继续干活，而不是停。两者用的是同一个累加器，触发之后的动作完全不同——一个是刹车，一个是换气。

窗口本身多大，交给一个常量，工程上自己定：

```javascript
const CONTEXT_WINDOW = 2000; // 演示用的小窗口, 方便几轮内触发; 实际项目里按你用的模型的真实上限设置
const COMPACT_RATIO = 0.7;   // 阈值: 用量超过窗口的 70% 就压缩

function shouldCompact(tokensUsed) {
  return tokensUsed >= CONTEXT_WINDOW * COMPACT_RATIO;
}
```

`COMPACT_RATIO` 定多少没有标准答案——这是一条工程判断，不是规范条款。定得太高，等你判断出「该压缩了」的时候窗口可能已经很挤，下一次请求都未必发得出去；定得太低，压缩会比该发生的更早、更频繁地打断任务，白白多花模型调用。经验上，留出三成左右的余量（也就是 0.7 这个阈值）通常够用，具体数字应该按你实际用的模型窗口大小和单轮工具输出的体积再调。

## 二、阈值触发压缩：把第 4 课的 `compact()` 接进循环

机制定了调，接下来是把它接进循环体。回忆第 4 课的结论：压缩不是把摘要塞回旧对话接着挤，而是用摘要**重启**一个新窗口——旧的 `messages` 整个放弃[^S1]。放进循环里，就是在合适的时机把 `messages` 整个替换掉：

```javascript
while (response.stop_reason === "tool_use") {
  messages = await appendToolResults(messages, response, toolImpls); // 沿用第 5 课的辅助函数

  if (shouldCompact(tokensUsed)) {
    messages = await compact(client, messages); // 重启: 整个替换
    tokensUsed = 0;                              // 新窗口, 用量从零算起
  }

  response = await client.messages.create({ model: MODEL, max_tokens: 1024, tools, messages });
  tokensUsed = trackUsage(tokensUsed, response);
}
```

三个位置决定了这段代码对不对：

- **检查放在哪一步**：紧跟在这一轮的工具结果追加进 `messages` 之后、下一次 `client.messages.create` 之前。太早（比如追加之前就判断）会漏算刚产生的这批工具输出；太晚（判断完才追加）则会让已经超线的这批内容白白多发一次请求。
- **压缩后 `messages` 是整个替换，不是追加**：`compact()` 的返回值直接赋给 `messages`，旧的那个数组连同它装的几十条工具往返一起被丢弃——这是「重启」和「继续在旧对话里堆」的分界线。
- **`tokensUsed` 必须归零**：新窗口从一份摘要开始，用量应该从这份摘要说起重新计数，而不是继续背着旧窗口的累计值。漏了这一步是个常见的坑，本课练习会专门诊断它。

`compact()` 本身沿用第 4 课的写法，`COMPACT_INSTRUCTION` 和取舍原则（保留架构决策、未解决的问题、关键实现细节，丢弃冗余工具输出）都不变[^S1]。下一节会给它加一处新能力：重启时不止读摘要，还把 `NOTES.md` 一起带上。

## 三、结构化笔记兜底：NOTES.md 在压缩里被读回来

压缩是被动的、事后的——它总结的是「触发那一刻窗口里还剩什么」。第 4 课已经讲过，笔记是主动的、随写随存的补丁：让 Agent 在做出决策、发现问题的当下就把它写到窗口之外的 `NOTES.md`[^S1]。两者接在一起的方式很直接：**新窗口重启时，除了读摘要，还应该把 `NOTES.md` 读回来**——这样即便这一次总结的取舍出了偏差，笔记里还有一份独立的底。

先给 Agent 一个能写笔记的工具：

```javascript
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const NOTES_PATH = path.join(process.cwd(), "NOTES.md");

async function readNotes() {
  try {
    return await readFile(NOTES_PATH, "utf8");
  } catch {
    return "(NOTES.md 还是空的)";
  }
}

async function writeNotes(content) {
  await writeFile(NOTES_PATH, content, "utf8");
}

const NOTES_TOOL = {
  name: "update_notes",
  description: "用这次要保存的完整内容覆盖写入 NOTES.md, 用于记录架构决策、未解决的问题、下一步计划",
  input_schema: {
    type: "object",
    properties: { content: { type: "string" } },
    required: ["content"],
  },
};

const toolImpls = {
  update_notes: async ({ content }) => {
    await writeNotes(content);
    return "NOTES.md 已更新";
  },
  // ...你的其他工具
};
```

`update_notes` 的 `input` 是这次要保存的**完整**笔记内容，工具实现直接整份覆盖写入——这是最简单的语义：Agent 自己维护一份完整的笔记正文，每次更新都是「这是现在的全貌」，不用处理增量合并。系统提示里配一条要求：「每当做出重要决策、发现新问题、或完成一个阶段，先调用 `update_notes` 更新笔记再继续」，写法和第 4 课一致。

然后是这一课新加的一步：`compact()` 在生成摘要之后，顺手把 `NOTES.md` 也读进重启消息里：

```javascript
async function compact(client, messages) {
  const resp = await client.messages.create({
    model: MODEL,
    max_tokens: 2000,
    messages: [{
      role: "user",
      content: COMPACT_INSTRUCTION + "\n\n" + formatHistory(messages),
    }],
  });
  const summary = resp.content.find((b) => b.type === "text").text;
  const notes = await readNotes(); // 新增: 把窗外的笔记也带上
  return [{
    role: "user",
    content:
      "以下是此前工作的交接摘要, 请从这里继续:\n\n" + summary +
      "\n\n以下是 NOTES.md 当前内容:\n" + notes,
  }];
}
```

新窗口醒来时手里有两份材料：模型自己总结的摘要，和 Agent 亲手写下的笔记。前者可能因为总结取舍而丢掉细节，后者是无损的——这就是第 4 课说的「笔记记得越勤，压缩丢东西的后果就越轻」在代码里的样子。

```agentmentor-check
{
  "id": "ctx-zh-06-notes-every-turn",
  "label": "评估把 NOTES.md 塞进每轮系统提示的提案",
  "prompt": "同事看完 compact() 里「重启时读一次 NOTES.md」的做法，提议做得更彻底：干脆把 NOTES.md 的全文放进系统提示，让它在每一轮都跟着请求发出去，这样模型随时能看到最新笔记，不用等压缩触发才读一次。这个提议怎么样？",
  "whyHere": "上一段代码刚展示了「只在压缩重启那一刻读一次笔记」，如果读者没意识到这是刻意为之，很容易觉得「每轮都带上笔记岂不是更保险」——这里需要当场检验读者是否理解笔记外置的意义在于不占窗口，而不是在于让内容随时可见。",
  "mode": "single",
  "choices": [
    {
      "id": "a",
      "text": "更彻底也更安全：反正笔记本来就不大，每轮带上确保信息不丢，没有坏处",
      "correct": false,
      "feedback": "「不大」是相对的：笔记会随着任务推进越写越长，而系统提示是每一轮都会重新发送的内容。把它塞进每轮系统提示，就是让笔记的全部体量在整个任务期间反复消耗注意力预算——而笔记外置的本意，恰恰是把这部分状态挪到窗口之外，只在需要时才取用。"
    },
    {
      "id": "b",
      "text": "不建议：每个新增的 token 都会消耗一部分注意力预算，笔记外置的意义就是让它不占用窗口；只在真正需要恢复状态的重启时刻读一次，比每轮都带着更划算",
      "correct": true,
      "feedback": "抓住了要害。笔记之所以要写到窗口外面，为的就是不让它占用在场的每一轮注意力预算；每个新增的 token 都会消耗一部分这份预算。压缩重启是窗口真正「换了一批记忆」的时刻，此时读一次笔记是合理的成本；把同样的内容重复塞进每一轮，等于把「外置」又搬回了「内置」，笔记越写越长，代价就越滚越大。"
    },
    {
      "id": "c",
      "text": "无所谓：反正笔记内容和摘要迟早都会被下一次压缩再总结一遍，读几次不影响最终结果",
      "correct": false,
      "feedback": "这里的成本不是「最终结果对不对」，而是「达到这个结果要花多少注意力预算」。每一轮都携带全文笔记，是在每一轮都实打实地多付出对应的 token 与预算消耗，和它会不会被未来某次压缩总结是两件事——压缩发生之前的每一轮，多余的笔记副本已经在持续拖慢注意力的有效密度了。"
    }
  ]
}
```

## 四、拼起来：一次超出单窗口容量的长任务

三块零件——用量追踪、阈值触发的压缩、读写 `NOTES.md`——放进同一个 `runAgent`，就是本课开头那段日志背后的完整代码：

```javascript
import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic();
const MODEL = "claude-sonnet-5";

async function runAgent(userInput, tools, toolImpls, opts = {}) {
  let messages = [{ role: "user", content: userInput }];
  let tokensUsed = 0;

  let response = await client.messages.create({
    model: MODEL, max_tokens: 1024, tools, messages,
  });
  tokensUsed = trackUsage(tokensUsed, response);

  while (response.stop_reason === "tool_use") {
    messages = await appendToolResults(messages, response, toolImpls);

    if (shouldCompact(tokensUsed)) {
      messages = await compact(client, messages);
      tokensUsed = 0;
      opts.onCompact?.();
    }

    response = await client.messages.create({
      model: MODEL, max_tokens: 1024, tools, messages,
    });
    tokensUsed = trackUsage(tokensUsed, response);
  }

  return response.content.find((b) => b.type === "text")?.text ?? "";
}
```

这就是本课开头日志的完整来源：三次工具调用把 `tokensUsed` 从 400 推到 1050 再到 1850，越过 `2000 * 0.7 = 1400` 这道阈值线，`compact()` 被调用、`messages` 整个替换、计数器归零；随后在新窗口里再走两轮，模型收尾。全程只发生了一次压缩，但任务本身如果继续做下去、再撞到阈值线，同一套逻辑会再触发第二次、第三次——`shouldCompact` 不关心这是第几次窗口，它只看当前这个窗口的用量。这正是「跑通一个超出单窗口容量的长任务」的含义：任务的总长度不受限于某一次窗口的容量，受限的只是「一次连续不中断的推理」。

要跑一次完整验证，接上一个模拟模型多轮回复的桩 client（真实调用时把它换成 `new Anthropic()` 即可，`runAgent` 的代码不用改一个字）：

```javascript
let callIndex = 0;
const queue = [ /* ...按调用顺序排好的响应, 其中第 4 个是压缩调用自己的回复... */ ];

const stubClient = {
  messages: {
    create: async () => queue[callIndex++],
  },
};
```

用这样一份桩 client 验证的意义在于：它把「模型这一轮会不会调工具、用了多少 token」完全钉死成已知量，于是压缩到底在第几轮触发、`tokensUsed` 到底归不归零、`NOTES.md` 到底有没有被写进又读出来，全都可以拿断言核对，而不用靠肉眼看真实调用的输出去猜。

## 分寸：不是所有任务都要这套机关

装完这一整套，容易生出一种错觉：往后写 Agent 就该默认带上用量追踪、阈值压缩、结构化笔记这三件套。回到第 2 课就定下的分寸：只在额外的复杂度能被证明确实改善结果时，才考虑增加它[^S2]。十几轮内能跑完的任务，压缩和笔记都是多余的零件——先从本系列第 7 门课那个裸循环加基本控制阀开始，真撞到窗口上限、真出现「新窗口不知道旧窗口做过什么」的失忆症状，再把本课这一层往上装。

到这里，这门课从第 1 课到第 6 课讲的东西——注意力预算、系统提示的高度、即时检索、压缩与笔记、子代理隔离——都汇到了同一个落点：每一轮该让模型看到什么，永远是一个要不断权衡的工程判断，不是一次性配置完就一劳永逸的开关。

<!-- exercises -->
## 💻 练习

### Level 1：追踪一次压缩的触发时机

某个 harness 配置为 `CONTEXT_WINDOW = 6000`、`COMPACT_RATIO = 0.75`。任务跑起来后，连续四轮的单轮用量（`input_tokens + output_tokens` 之和）依次是：1200、1500、900、1100。请回答：

1. 压缩会在第几轮结束后被触发？触发那一刻的累计 `tokensUsed` 是多少？
2. 压缩触发并完成之后，`tokensUsed` 应该是多少？
3. 如果压缩之后紧接着的下一次模型调用返回 `usage = { input_tokens: 300, output_tokens: 100 }`，这时 `tokensUsed` 变成多少？

<!-- rubric -->
- 正确算出阈值为 `6000 * 0.75 = 4500`，并正确累加四轮用量：1200、2700、3600、4700，指出第 4 轮结束后累计值 4700 首次达到/超过阈值，压缩在此时触发
- 明确压缩完成后 `tokensUsed` 应重置为 0，理由是新窗口的用量应从这份摘要开始重新计数，而不是延续旧窗口的累计值
- 正确算出重置后第一次调用的 `tokensUsed = 0 + 300 + 100 = 400`

<!-- answer -->
1. 逐轮累加：第 1 轮后 1200，第 2 轮后 2700，第 3 轮后 3600，第 4 轮后 4700。阈值是 `6000 * 0.75 = 4500`，4700 是四轮里第一个达到/超过阈值的累计值，所以压缩在**第 4 轮结束后**触发，触发时的累计 `tokensUsed` 是 **4700**。
2. 压缩把 `messages` 整个替换成 `compact()` 返回的重启消息，新窗口从这份摘要（加 `NOTES.md`）重新开始，`tokensUsed` 应重置为 **0**——它不应该继续背着旧窗口那 4700 的累计值，否则下一轮判断永远会误以为「窗口已经很满」。
3. 重置后的第一次调用返回 `usage = { input_tokens: 300, output_tokens: 100 }`，`tokensUsed = 0 + 300 + 100 = 400`。

<!-- hint -->
先把四轮用量老老实实累加成一个前缀和数列，再逐个和阈值 `6000 * 0.75` 比大小，找到第一个越线的位置。

<!-- hint -->
压缩「重启」的含义不只是换消息数组，用量计数器也要跟着换一个新的起点——想想它统计的到底是「历史总用量」还是「当前这个窗口的用量」。

### Level 2：诊断一次「压缩风暴」

有人把阈值触发的压缩接进了循环，但漏了一行：

```javascript
while (response.stop_reason === "tool_use") {
  messages = await appendToolResults(messages, response, toolImpls);

  if (shouldCompact(tokensUsed)) {
    messages = await compact(client, messages);
    // 少了 tokensUsed = 0
  }

  response = await client.messages.create({ model: MODEL, max_tokens: 1024, tools, messages });
  tokensUsed = trackUsage(tokensUsed, response);
}
```

接入之后，任务跑到某一轮第一次触发了压缩；但从那之后，每一轮都会再触发一次压缩，哪怕新窗口里其实只进行了一两轮、根本没攒下多少内容。请解释这是为什么，并给出修复。

<!-- rubric -->
- 指出病根：`tokensUsed` 是只增不减的累加器，第一次触发压缩时它已经达到或超过阈值；由于没有归零，之后每一轮 `trackUsage` 只会让它在原有基础上继续变大，`shouldCompact(tokensUsed)` 从此恒为真
- 说明后果：每一轮都会再触发一次 `compact()`（多花一次模型调用），而新窗口实际的用量远没有真的逼近阈值，压缩变得比该发生的频繁得多，浪费调用次数也可能拖慢任务
- 修复：在 `compact()` 调用成功之后加一行 `tokensUsed = 0`，让计数器的语义保持为「当前这个窗口的用量」而不是「历史总用量」

<!-- answer -->
病根在 `shouldCompact` 判断的是 `tokensUsed` 这个只增不减的累加器。第一次触发压缩的那一刻，`tokensUsed` 已经达到或超过了阈值；`compact()` 把 `messages` 换成了一个干净的新窗口，但代码忘了让 `tokensUsed` 也回到与新窗口相符的起点。于是接下来 `trackUsage(tokensUsed, response)` 只会在这个已经越线的数字上继续往上加——不管新窗口这一轮实际增加了多少 token，`shouldCompact(tokensUsed)` 从第一次触发之后永远为真。表现出来就是：新窗口哪怕只进行了一两轮、内容少得可怜，下一次循环开头的判断照样命中，于是又调用一次 `compact()`，如此反复。每一次多余的压缩都是一次额外的模型调用，任务本该继续往前推进，却在原地反复「总结、重启、又总结」。

修复只需要把归零这一行补上：

```javascript
if (shouldCompact(tokensUsed)) {
  messages = await compact(client, messages);
  tokensUsed = 0; // 新窗口, 用量从零重新计数
}
```

补上之后，`tokensUsed` 的语义变回「当前这个窗口已经用了多少」，压缩只会在新窗口自己也攒够阈值用量时才会再次触发，不会被上一个窗口的历史数字拖着走。

<!-- hint -->
`shouldCompact` 只是拿 `tokensUsed` 和一个固定阈值比大小。压缩触发的那一刻，`tokensUsed` 相对阈值是偏大还是偏小？如果之后一直不把它改小，接下来的每一次比较结果会是什么？

<!-- hint -->
对照 Level 1：压缩完成后 `tokensUsed` 应该代表什么？是「从任务开始到现在总共用了多少」，还是「当前这个窗口用了多少」？这道题的 bug 正是把这两种语义搞混了。

<!-- /exercises -->

## 小结

- 给 harness 装用量追踪只需要一个累加器：每次拿到响应就用 `response.usage.input_tokens + response.usage.output_tokens` 往上加；它和本系列第 7 门课的 `TOKEN_BUDGET` 阀共用同一份数据，但触发之后的动作不同——预算阀到顶即停，本课的阈值到点即压缩、继续干活。
- 阈值触发的压缩把第 4 课的 `compact()` 接进循环体：检查放在「这一轮工具结果追加完毕、下一次请求发出之前」；触发后 `messages` 被整体替换成压缩结果——是重启，不是追加[^S1]；`tokensUsed` 必须同步归零，否则会陷入不断重复压缩的风暴。
- 笔记与压缩在这一课接成了一条线：`update_notes` 工具随写随存——这正是把笔记持久到上下文窗口之外[^S1]——`compact()` 再在生成摘要之外顺手把 `NOTES.md` 读回重启消息；摘要可能因总结取舍丢内容，笔记则是被原样读回的无损副本。「只在窗口重启这类关键时刻读一次、不塞进每一轮的系统提示」是本课基于注意力预算原理（每个新增 token 都在消耗这份预算[^S1]）做出的工程取舍。
- 一次真实跑通的验证显示：三次工具调用把用量从 400 累到 1850、越过阈值触发一次压缩、计数器归零、再跑两轮收尾——任务的总长度不再受限于单次窗口的容量，受限的只是「一次连续不中断的推理」。
- 别把这套机关当成默认配置：只有当额外复杂度能被证明确实改善结果时才值得加上[^S2]；跑几轮就能收尾的任务，本系列第 7 门课那个裸循环加基本控制阀就够了。
