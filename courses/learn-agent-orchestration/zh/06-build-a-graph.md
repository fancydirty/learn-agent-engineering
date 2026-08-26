# 第 6 课：实战：把你的 harness 升级成一张小图

> 学习目标：
> - 把前五课的路由、扇出、汇合、评审回路、汇报焊进一个 `orchestrate.mjs`：计划写在代码里，每个节点内部还是本系列第 7 门课那个 `stop_reason` 循环，中间结果留在脚本变量里
> - 让评审回路真的转起来，并亲眼看到它的两种停法——一条工单按 gate 报告改对了收工，另一条连着两轮交回一模一样的报告、判定不再有进展、标记 needs_human
> - 把整张图的执行留痕落到 `run-state.json` 与 `run.jsonl`，用真实运行的汇总表对账：哪个节点花了多少时间、几次模型调用、多少 token、gate 转了几轮
>
> 前置要求：读完第 1–5 课，手边能跑起本系列第 7 门课的 harness 循环 | 上一课 [第 5 课 <<](./05-evaluator-and-graphs.md)

## 先看它跑起来的样子

前五课把零件拆开讲完了：谁持有计划（第 1 课）、链式与路由（第 2 课）、分段与投票加一个有上界的并发池（第 3 课）、编排者-工人与派工提示词的四要素（第 4 课）、评审回路以及把这些模式组合起来的画法（第 5 课）。这一课把它们焊成一个文件。

任务很土：`inbox/` 里有六条客服工单，要给每一条写出一份能直接发出去的回复。先看它跑完是什么样：

```text
$ node orchestrate.mjs
inbox/ 收到 6 条工单：T-1001, T-1002, T-1003, T-1004, T-1005, T-1006
[route] T-1001=billing  T-1002=bug  T-1003=other  T-1004=billing  T-1005=bug  T-1006=other
[fanout] 并发上界 2，产出 6 份初稿
[merge] 写入 out/ 6 份，向下只传引用与一行摘要
[review] gate 重写共 2 轮

=== 全图执行汇总 ===
节点      耗时    模型调用    token    gate 轮数   状态
route     62ms    1           720      -           ok
fanout    247ms   8           8903     -           ok
merge     2ms     0           0        -           ok
review    127ms   2           3033     2           ok

=== 逐条工单 ===
工单     类别      处理者            gate 轮数   停止原因        状态
T-1001   billing   worker:billing    0           gate_pass       pass
T-1002   bug       worker:bug        0           gate_pass       pass
T-1003   other     template          0           gate_pass       pass
T-1004   billing   worker:billing    1           no_progress     needs_human
T-1005   bug       worker:bug        1           gate_pass       pass
T-1006   other     template          0           gate_pass       pass

产出目录 out/：6 份回复；需要人工接手：1 条
  - T-1004（no_progress）：工单 T-1004：抬头从个人改成公司，需要…
留痕：run-state.json / run.jsonl（run_id=run-mta57gsx）
$ echo $?
1
```

这一课里所有终端输出都是这个脚本真实跑出来的，逐行照抄，没有一行是手敲的示例。两个地方每次跑都会变：耗时那几个毫秒数，以及 `run_id`（它是时间戳转的三十六进制）。其余部分——分类结果、调用次数、token 数、gate 轮数、哪条工单是 `needs_human`——都是钉死的常量，原因在后面「验证桥段」一节讲。

值得先盯一眼的是最后那个 `1`。这不是出错，是判定：六条工单里有一条没能自动收工，退出码就不是 0。这张图的每一次运行都会给出一个能被 CI 或者定时任务读懂的结论，而不只是打一堆日志。

## 这张图长什么样：计划就是 `main()` 那十几行

先看整个脚本的骨干。用「图」「节点」这套词是第 5 课说过的——这是我们自己的画法，不是官方概念，它的一手依据只有一条：工作流脚本自己持有循环、分支与中间结果[^S5]。下面这段就是那句话的字面落实：

第 5 课先画过一张组合图，这张图是它的**变体**，三处不一样：第 5 课按难度二分「简单 / 复杂」，这里按主题三分 `billing` / `bug` / `other`；第 5 课的扇出是「一条复杂工单分给三个工人再汇合」，这里是「六条工单各派一个处理者」的分段；第 5 课的回边打回一个独立的 `[起草]` 节点，这里打回原来那个工人。为什么这么变，都收在文末「对表」一节里。

```javascript
async function main() {
  seedWorkspace();
  initLog();
  saveState();

  const tickets = loadInbox();
  console.log(`inbox/ 收到 ${tickets.length} 条工单：${tickets.map((t) => t.id).join(", ")}`);

  const { routed } = await node("route", () => routeNode(tickets));
  console.log(`[route] ${routed.map((t) => `${t.id}=${t.category}`).join("  ")}`);

  const { drafts } = await node("fanout", () => fanoutNode(routed));
  console.log(`[fanout] 并发上界 ${POOL_SIZE}，产出 ${drafts.length} 份初稿`);

  const { items } = await node("merge", async () => mergeNode(drafts));
  console.log(`[merge] 写入 out/ ${items.length} 份，向下只传引用与一行摘要`);

  if (process.env.STOP_AFTER === "merge") {
    console.log("[stop] STOP_AFTER=merge：在评审之前停下，本次不做判定");
    process.exit(2);
  }

  const byId = new Map(routed.map((t) => [t.id, t]));
  const reviewed = await node("review", () => reviewNode(items, byId));
  console.log(`[review] gate 重写共 ${reviewed.totalRounds} 轮`);

  const { needsHuman } = await node("report", async () => reportNode(items, reviewed.totalRounds));

  process.exit(needsHuman > 0 ? 1 : 0);
}
```

`routed`、`drafts`、`items` 这三个 `const` 就是整张图的状态。它们是普通的 JavaScript 变量，不是什么类型化的状态对象，也没有合并策略——中间结果留在脚本变量里[^S5]，节点之间靠函数返回值传递。没有任何一个模型看得见这些变量的全貌：路由模型只看到六条工单文本，账单工人只看到自己那一条，评审 gate 只看到一份回复文件。

这就是 workflow 和 agent 的架构区分落在代码上的样子：LLM 与工具被预定义的代码路径编排[^S1]，而不是由模型自主决定自己的流程[^S1]。

五个节点各管一段：

| 节点 | 干什么 | 谁在干 |
| --- | --- | --- |
| `route` | 一次廉价调用把六条工单分成三类 | 一个模型循环 |
| `fanout` | 按类别派给专门化的工人，并发有上界 | 两种模型循环 + 一段纯代码模板 |
| `merge` | 产出落盘，只把引用和一行摘要交给下游 | 纯代码 |
| `review` | 确定性 gate 先拦，拦下的进查-修-再查 | 纯代码 + 按需回炉的模型循环 |
| `report` | 打汇总表、定退出码 | 纯代码 |

五个节点里只有两个真的调模型。**不是每个节点都得是模型**——这是这一课最省钱也最容易被忽略的一条：`merge` 和 `report` 是纯函数，`fanout` 里的 `other` 类走的是字符串模板，`review` 的第一道判断是几行 `includes`。凡是能用确定性代码给出同样答案的地方，就没有理由付一次模型调用的钱和延迟。

## 节点内部：还是本系列第 7 门课那个循环

先把最里面的东西定下来，图才好谈。每个模型节点内部跑的，是本系列第 7 门课那个 `stop_reason` 循环，一行没改：

```javascript
async function runAgent(client, system, userInput, tools, toolImpls) {
  const messages = [{ role: "user", content: userInput }];
  let turns = 0;

  let response = await client.messages.create({
    model: MODEL,
    max_tokens: 1024,
    system,
    tools,
    messages,
  });

  while (response.stop_reason === "tool_use") {
    // —— 阀1：最大轮次。放在循环体最前、turns++ 之前 ——
    if (turns >= MAX_TURNS) {
      return `已达最大轮次 ${MAX_TURNS}，主动收手（可能任务过难或模型卡住）`;
    }
    turns++;

    // 把模型这一轮的完整响应（assistant 角色）追加进历史
    messages.push({ role: "assistant", content: response.content });

    // 执行这一轮所有 tool_use 块，各自打包成 tool_result
    const toolResults = await runToolUses(response.content, toolImpls);

    // 一轮里的所有 tool_result 放进紧随其后的同一条 user 消息
    messages.push({ role: "user", content: toolResults });

    // 带着变长后的历史再发一次，循环回到 while 判断
    response = await client.messages.create({
      model: MODEL,
      max_tokens: 1024,
      system,
      tools,
      messages,
    });
  }

  // stop_reason 不再是 tool_use，取出最终文字返回
  return response.content.find((b) => b.type === "text")?.text ?? "";
}
```

循环体里的四步——push assistant、执行工具、push tool_result、重新赋值 `response`——和本系列第 7 门课的第 6 课那份逐字相同，连注释都是搬过来的。阀1（最大轮次）也在原来的位置：循环体最前、`turns++` 之前。给循环留一个最大迭代数这类停止条件，本来就是把控制权攥在自己手里的常规做法[^S1]。

和本系列第 7 门课比，有两处变化，都在循环体外面：`client` 与 `system` 从模块级常量变成了参数（三个角色要用不同的桩和不同的系统提示词，只能从外面传进来）；token 与调用次数的统计从循环体搬到了客户端外面的一层包装里，循环内部一个字没动：

```javascript
function metered(client) {
  const meter = { calls: 0, tokens: 0 };
  const wrapped = {
    messages: {
      async create(req) {
        const res = await client.messages.create(req);
        meter.calls += 1;
        meter.tokens += res.usage.input_tokens + res.usage.output_tokens;
        return res;
      },
    },
  };
  return { client: wrapped, meter };
}
```

这么改是有代价的，得说明白：本系列第 7 门课的阀2（token 预算）原本靠循环体里那个累加值来判断，累加值不在循环里了，阀2 也就没搬进来。这张图里每个节点的桩响应队列长度固定，队列耗尽会直接报错，跑不飞；但等你把桩换成真 client，请把阀2 装回去——要么让 `metered` 在超预算时抛错，要么把计数搬回循环体、恢复第 7 门课的原样。阀3（空转检测）和阀4（人工审批）同理没搬，理由在后面「对表」一节列。

工具那半边也是照搬的：一轮响应里有几个 `tool_use` 块就回几个 `tool_result`，工具抛错就包成 `is_error: true` 交回给模型，而不是让整个进程崩掉。

## 节点一：路由，一次廉价调用，然后把输出收紧

路由做的事是分类后分发到专门化的后续任务[^S1]。它是整张图最便宜的一次模型调用：一次请求分完六条，不给工具，不许写回复。

```javascript
async function routeNode(tickets) {
  const { client, meter } = metered(makeStubClient(SCRIPTS.router));
  const input = tickets.map((t) => `${t.id}: ${t.text}`).join("\n");
  const text = await runAgent(client, ROUTER_PROMPT, input, [], {});

  // 输出收紧：只认「工单号: 类别」这一种行，类别不在白名单里的一律落到 other
  const parsed = new Map();
  for (const line of text.split("\n")) {
    const m = line.match(/^\s*(T-\d+)\s*:\s*(\S+)\s*$/);
    if (!m) continue;
    const [, id, raw] = m;
    const category = CATEGORIES.includes(raw) ? raw : "other";
    if (category !== raw) log({ node: "route", event: "clamped", ticket: id, raw, category });
    parsed.set(id, category);
  }

  const routed = tickets.map((t) => ({ ...t, category: parsed.get(t.id) ?? "other" }));
  for (const t of routed) log({ node: "route", event: "routed", ticket: t.id, category: t.category });
  return { routed, calls: meter.calls, tokens: meter.tokens };
}
```

重点在中间那十行，不在模型调用。模型返回的是自由文本，图后面所有分支都要靠这个值走，所以它必须在进入下游之前被收紧成三个合法标签之一：不匹配格式的行直接丢；类别不在白名单里的落到 `other`；连一行都没匹配上的工单，`parsed.get(t.id) ?? "other"` 兜底。

桩里我故意让模型把最后一条判成了「投诉」——一个中文词，不在白名单里。真实运行的日志里能看见这次收紧：

```text
{"ts":"2026-08-26T13:41:46.130Z","run_id":"run-mta57gsx","node":"route","event":"clamped","ticket":"T-1006","raw":"投诉","category":"other"}
```

模型给了一个自作主张的标签，代码把它压回 `other`，并且留了一条记录说明压了什么。**下游分支只认代码认过的值**——这是路由节点和「让模型直接决定下一步跳到哪」最实际的差别，也是它能被单元测试的原因。

## 节点二：扇出，三个工人和一个有上界的并发池

扇出走的是分段：把任务拆成互相独立的子任务并行跑[^S1]。这里的「独立」是天然的——六条工单之间没有任何依赖，谁先谁后都不影响结果。

三类工单三种处理者，其中只有两种是模型：

```javascript
const drafts = await runPool(routed, POOL_SIZE, async (ticket) => {
  if (ticket.category === "other") {
    const text = otherTemplate(ticket.id);
    log({ node: "fanout", event: "template_done", ticket: ticket.id });
    return { ticket, handler: "template", text };
  }
  const r = await callWorker(ticket, 1);
  calls += r.calls;
  tokens += r.tokens;
  return { ticket, handler: `worker:${ticket.category}`, text: r.text };
});
```

并发池就是第 3 课那个池子（那里叫 `pool`，这里叫 `runPool`）：任务放在一个游标后面，起 `limit` 个消费者去抢，抢完为止。上界是真的在起作用，不是摆设。把它调成 1 再跑一次，`fanout` 那一行的耗时会明显变长（调用次数和 token 一个不差，毫秒数照例会抖）：

```text
$ POOL_SIZE=1 node orchestrate.mjs
...
=== 全图执行汇总 ===
节点      耗时    模型调用    token    gate 轮数   状态
route     62ms    1           720      -           ok
fanout    494ms   8           8903     -           ok
merge     2ms     0           0        -           ok
review    131ms   2           3033     2           ok
```

494ms 对 247ms，调用次数和 token 一个不差。并发换到的是墙上时间，不是更少的工作量——这一点在真接 API 之后同样成立，只不过那时候你还要考虑供应商的速率限制，上界就更不能省了。

### 派工提示词：四要素一个不少

三个模型角色的提示词都按第 4 课那四要素写：目标、输出格式、工具指引、任务边界。子代理需要目标、输出格式、工具与来源的指引，以及清晰的任务边界；描述不到位，工人就会重复劳动、留下缺口，或者找不到该找的东西[^S2]。账单工人是这样：

```javascript
billing: [
  "你是账单工单专员，一次只处理一条工单。",
  "目标：查清这条工单的账单事实，给出一次把话说完的中文回复。",
  "输出格式：一段纯文本，开头写「工单 <工单号> 回复：」，依次交代查到的事实、已经做的处理、用户下一步能预期什么；不用列表，不写寒暄。",
  "工具指引：账单事实一律用 lookup_order 查，工单里的订单号原样传入；查不到就如实说查不到，不要从工单描述里推断金额或扣款次数。",
  "任务边界：只处理这条工单的账单部分，不修改订单、不承诺额外补偿、不回答与账单无关的问题；不要写「稍等」「请耐心等待」「尽快处理」这类没有信息量的话。",
].join("\n"),
```

四条各有各的活：目标决定它写什么；输出格式让下游的 gate 有东西可查（「开头写工单号」这条直接对应 gate 的第一条规则）；工具指引把「金额从哪来」钉死在 `lookup_order` 上，堵住凭工单描述编数字这条路；任务边界既拦住越权动作，也提前把敷衍词列进禁令。

故障工人那份内容换成查已知问题库、引用问题编号、不许自己编编号；分拣员那份的「工具指引」写的是「这一步不给你任何工具，只看工单文本判断」，对应代码里传进去的空工具数组。这三份提示词的差别本身就是路由的收益：分类之后各写各的，不必把三种活的要求硬塞进一个提示词里——这正是路由带来的关注点分离与更专门化的提示词[^S1]。

## 节点三：汇合，传引用不传载荷

`merge` 是纯代码，一次模型调用都没有。它做两件事：把每份初稿写进 `out/`，然后收集一份轻量的清单交给下游——`{id, category, handler, file, oneLine}`，一个文件路径加一行摘要，不是六份完整回复。（同一时刻它也在 `run-state.json` 里给每条工单开一条记录，字段见后面完整代码的第 9 节。）

这是把多 Agent 系统那条工程建议搬进单进程脚本：让专门化的代理把产出存进外部系统，只把轻量的引用传回协调者[^S2]。在那篇复盘里，这条建议解决的是「什么都经由主代理转述」带来的上下文膨胀；在这里，它解决的是同一件事的小号版本——评审节点需要的是「哪份文件该被检查」，不是六份全文都堆在一个变量里传来传去。

所以评审节点第一件事是重新从文件读回内容：

```javascript
let reply = fs.readFileSync(full, "utf8").trim(); // 载荷从文件读，不从上一节点带过来
```

这一步看着多余——反正都在同一个进程里，直接把字符串传过去不就行了。但它买到了两样东西：`out/` 里的文件成了这条工单唯一的真相，谁改了它评审就查谁；以及，这条边一旦要换成跨进程、跨机器，改的只是 `readFileSync` 这一行，节点之间的契约不用动。

## 一道判断题

到这里，图的前三个节点已经成型：路由是代码收紧的，汇合是纯代码的，接下来的 gate 也会是纯代码的。这时候最常听到的一个问题正好可以摆出来。

```agentmentor-check
{
  "id": "orc-zh-06-llm-as-glue",
  "label": "判断胶水逻辑该不该交给主模型现场决定",
  "prompt": "同事看完 orchestrate.mjs，提了个问题：「路由、汇合、gate 这些胶水逻辑为什么用代码写死？让一个主模型看着中间结果、情况来了现场决定下一步，不是更灵活吗？」这个提议在这批工单任务上，该怎么答？",
  "whyHere": "五个节点里有三个是纯代码，读者刚刚连着看了三段确定性胶水。这里正是检验他是否能说清『把计划放进代码』换来的是什么、以及什么情况下该反过来把决定权交回模型的位置。",
  "mode": "single",
  "choices": [
    {
      "id": "a",
      "text": "这批任务的步骤本来就能预先拆定，写进代码换到的是可预测与一致，中间结果留在脚本变量里也不占模型上下文；真正没法预先拆分的活儿才值得把决定权交回模型",
      "correct": true,
      "feedback": "正确，而且这正是 workflow 与 agent 那条架构区分的实际用法：workflow 是 LLM 与工具被预定义代码路径编排，agent 是模型自主决定自己的流程。任务定义清楚时，workflow 给的是可预测和一致；需要大规模的灵活性与模型驱动的决策时，才轮到 agent。「工单进来 → 分类 → 按类别处理 → 检查 → 汇报」这五步在写代码之前就已经确定了，让模型每一轮重新决定一次，付出的是不可预测和一次次额外调用，换回来的灵活性这里根本用不上。附带的好处是中间结果不进模型上下文：脚本自己持有循环、分支和中间结果，模型的上下文里只装它这一步该看的东西。"
    },
    {
      "id": "b",
      "text": "模型指挥当然更聪明：让主模型盯着每一步的中间结果随机应变，路由、汇合、gate 都能按当场情况调整，比写死的代码强",
      "correct": false,
      "feedback": "「更聪明」在这里没有兑现的地方。分类这一步的答案只有三个合法值，gate 检查的是「回复里有没有工单号、有没有敷衍词」这种一查便知的事实——这些交给模型，你得到的是一个每次可能不一样的答案，还得再写代码去收紧它。真正的代价还不止于此：模型要指挥，就得看得见中间结果，六份回复全文得进它的上下文，而这些内容此后再也不会被引用。灵活性是有价格的，只在你确实需要的时候买。"
    },
    {
      "id": "c",
      "text": "两种写法差不多，最终跑出来的结果是一样的，剩下的就是个人喜好和团队习惯，选哪个都行",
      "correct": false,
      "feedback": "这不是风格问题，是有判断依据的选择：步骤能不能提前拆定。能拆定就写进代码，换可预测与一致；拆不定——开放式问题，需要多少步事先无法预测，也没法硬编一条固定路径——才该交回给自主循环。（子任务数量和内容没法预先写死、但整体步骤还在你手里时，第 4 课那个编排者-工人是中间档；这张图的活儿连这一步都省了，分类和分工写代码前就定死。）把它当成口味问题，最常见的后果是在一个五步流程上养出一个每次都重新想一遍怎么走的系统，贵、慢，而且出了问题不知道该改哪一行。"
    }
  ]
}
```

## 节点四：评审回路，gate 先拦，拦下的才回炉

评审节点做的是查-修-再查：跑一个检查器，把没过的修掉，重复，直到通过或者不再有进展[^S5]。它是这张图里唯一一处「模型的产出会被打回去重写」的地方。

第一道关是确定性的，几行 `includes` 就写完了：

```javascript
function gateCheck(ticketId, reply) {
  const problems = [];
  if (!reply.includes(ticketId)) problems.push("missing_ticket_id");
  for (const w of FILLER_WORDS) {
    if (reply.includes(w)) problems.push(`filler_word:${w}`);
  }
  return { pass: problems.length === 0, report: problems.join(" | ") };
}
```

两条规则，都是本系列第 10 门课说的那种「能确定性判就别请裁判」：回复里必须出现工单号（客服系统靠它对账），不许出现「稍等」「请耐心等待」「尽快处理」这类没有信息量的话。两件事都不需要理解语义，字符串包含就能判，结果每次都一样，还顺便产出了一份能直接喂回给工人的报告字符串。

LLM 裁判在这里能干的活，是判断「这份回复的语气合不合适」「事实有没有超出工具返回的范围」——那些确实没法用 `includes` 判的东西。但它得排在 gate 后面：gate 是免费的、确定的，先让它把明确的毛病筛掉，剩下的才值得花一次调用去请人评。这张图只装了 gate 这一层，因为这批工单的验收标准恰好都能写成规则；等验收标准里出现「语气得体」这种词，再按本系列第 10 门课的分层判分把裁判那一层加上。

回路本身长这样：

```javascript
while (!gate.pass) {
  reports.push(gate.report);
  if (rounds >= MAX_REVIEW_ROUNDS) {
    verdict = "max_rounds";
    break;
  }
  if (gate.report === lastReport) {
    verdict = "no_progress"; // 连续两轮报告一模一样，回路不再往前走
    break;
  }
  if (item.handler === "template") {
    verdict = "no_rewriter"; // 纯代码模板没有可回炉的工人，直接交人
    break;
  }
  lastReport = gate.report;
  rounds += 1;
  totalRounds += 1;
  const r = await callWorker(byId.get(item.id), rounds + 1, { prev: reply, report: gate.report });
  calls += r.calls;
  tokens += r.tokens;
  reply = r.text;
  fs.writeFileSync(full, `${reply}\n`);
  gate = gateCheck(item.id, reply);
  log({ node: "review", event: "gate", ticket: item.id, round: rounds, pass: gate.pass, report: gate.report });
}
```

三个 `break` 对应三种停法，和第 5 课声明的一致：通过（`while` 条件自然为假）、不再有进展、撞到最大轮数。第三个 `if` 是个补丁——`other` 类的回复是纯代码模板生成的，没有可以回炉的工人，真要是模板本身写坏了，只能直接交人。这次运行里它没被走到（模板是常量，它必然过 gate），留着是因为一旦有人改坏了模板字符串，我宁可看见一条 `no_rewriter` 的记录，也不想看见一个空转的循环。

回炉时喂给工人的东西很朴素：上一版全文 + gate 报告 + 一句「只修报告里点名的问题，重写一版完整回复」（拼装在 `callWorker` 里）。

### 两种停法，都在这次运行里真的发生了

桩里我埋了两条剧本，让回路的两个出口各走一次。

**T-1005：改对了，收工。** 故障工人第一版忘了写工单号（第一条规则不过），gate 交回 `missing_ticket_id`，工人按报告补上开头那句，第二版通过：

```text
{"ts":"2026-08-26T13:41:46.444Z","run_id":"run-mta57gsx","node":"review","event":"gate","ticket":"T-1005","round":0,"pass":false,"report":"missing_ticket_id"}
{"ts":"2026-08-26T13:41:46.505Z","run_id":"run-mta57gsx","node":"review","event":"worker_done","ticket":"T-1005","round":2,"calls":1,"tokens":1638}
{"ts":"2026-08-26T13:41:46.506Z","run_id":"run-mta57gsx","node":"review","event":"gate","ticket":"T-1005","round":1,"pass":true,"report":""}
```

**T-1004：修了，但没修对，回路自己停了。** 账单工人第一版写了「请您稍等」，gate 交回 `filler_word:稍等`；工人重写了一版，句子完全不同、更长、多了一句解释，可那个词还在。第二轮的报告和第一轮一模一样：

```text
{"ts":"2026-08-26T13:41:46.381Z","run_id":"run-mta57gsx","node":"review","event":"gate","ticket":"T-1004","round":0,"pass":false,"report":"filler_word:稍等"}
{"ts":"2026-08-26T13:41:46.443Z","run_id":"run-mta57gsx","node":"review","event":"worker_done","ticket":"T-1004","round":2,"calls":1,"tokens":1395}
{"ts":"2026-08-26T13:41:46.443Z","run_id":"run-mta57gsx","node":"review","event":"gate","ticket":"T-1004","round":1,"pass":false,"report":"filler_word:稍等"}
```

这时候 `gate.report === lastReport` 成立，回路判定不再有进展，停下，把这条工单标成 `needs_human`。它本来还有两轮预算（`MAX_REVIEW_ROUNDS` 是 3），但花掉也是白花——同样的报告喂回去，大概率还是同样的回复。「不再有进展」这个出口的价值就在这儿：它比最大轮数更早地止损，而且它给出的是一个有信息量的结论——不是「试了三次还不行」，是「它听不懂这条意见」，这正是该转人工的信号。

两种出口在数据里的区别，一眼可辨：

```json
"T-1004": {
  "gate_rounds": 1,
  "gate_reports": [
    "filler_word:稍等",
    "filler_word:稍等"
  ],
  "stop": "no_progress",
  "status": "needs_human"
},
"T-1005": {
  "gate_rounds": 1,
  "gate_reports": [
    "missing_ticket_id"
  ],
  "stop": "gate_pass",
  "status": "pass"
}
```

两条工单的 `gate_rounds` 都是 1，光看轮数分不出谁成谁败；分水岭在 `gate_reports` 的长度——它记的是每一次没通过的报告，最后一次也算。T-1005 只留下一条（第二版过了，没有第二条报告），T-1004 留下两条且内容相同，`stop` 字段把结论直接写死成 `no_progress`。

## 节点五：汇报与留痕

最后一个节点也是纯代码：把 `state.nodes` 和逐条工单打成两张表，数一数 `needs_human`，定退出码。全部通过是 0，有一条需要人工就是 1。

留痕分两份，各司其职。`run.jsonl` 是本系列第 11 门课那种结构化日志，一行一个 JSON 事件，每条带 `ts` 和 `run_id`，事后随便 `grep`——这次运行一共 39 行，前面几段引的都是从它里面 `grep` 出来的原文。

`run-state.json` 记的是执行留痕（跟前面说的「图的状态＝那几个脚本变量」不是一回事），用本系列第 9 门课的家法写：先写 `.tmp`，再 `rename` 原子替换，任何时刻被杀，磁盘上要么是上一份完整状态，要么是新的完整状态，不会出现半截 JSON：

```javascript
function saveState() {
  state.updated_at = new Date().toISOString();
  const tmp = `${STATE_PATH}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(state, null, 2));
  fs.renameSync(tmp, STATE_PATH);
}
```

落笔时机是「每完成一小步就落一次」：每个节点跑完落一次，评审节点里每判完一条工单再落一次。这么做的理由第 5 课引过——运行时逐步追踪每个代理的结果，正是一次运行能在同一会话内被恢复的前提[^S5]；把活儿铺开到许多小代理上的工作流，比一个长代理保住的进度更多[^S5]。这张图不是多代理运行时，但同一句话在这里照样成立：六条工单是六份独立的进度，评审阶段中途死掉，已经落盘的那几份不该跟着一起没（扇出阶段还没做到这一点——见对表第 3 项那条差异）。

想看这句话的实际效果，用 `STOP_AFTER=merge` 在扇出之后、评审之前把进程停掉：

```text
$ STOP_AFTER=merge node orchestrate.mjs
inbox/ 收到 6 条工单：T-1001, T-1002, T-1003, T-1004, T-1005, T-1006
[route] T-1001=billing  T-1002=bug  T-1003=other  T-1004=billing  T-1005=bug  T-1006=other
[fanout] 并发上界 2，产出 6 份初稿
[merge] 写入 out/ 6 份，向下只传引用与一行摘要
[stop] STOP_AFTER=merge：在评审之前停下，本次不做判定
$ echo $?
2
```

此刻的 `run-state.json`（节选）：

```json
{
  "version": 1,
  "run_id": "run-mta4fnpe",
  "nodes": {
    "route": { "ms": 62, "calls": 1, "tokens": 720, "status": "ok" },
    "fanout": { "ms": 248, "calls": 8, "tokens": 8903, "status": "ok" },
    "merge": { "ms": 1, "calls": 0, "tokens": 0, "status": "ok" }
  },
  "tickets": {
    "T-1004": {
      "category": "billing",
      "handler": "worker:billing",
      "file": "out/T-1004.txt",
      "one_line": "工单 T-1004：发票抬头变更需要财务复核…",
      "gate_rounds": 0,
      "gate_reports": [],
      "stop": null,
      "status": "drafted"
    },
    "T-1005": {
      "category": "bug",
      "handler": "worker:bug",
      "file": "out/T-1005.txt",
      "one_line": "这是已知问题 KI-91——App 端头像走…",
      "gate_rounds": 0,
      "gate_reports": [],
      "stop": null,
      "status": "drafted"
    }
  }
}
```

三个节点的账在，六条工单的分类、处理者、产出文件路径都在，`out/` 里六份初稿也已经落盘。丢掉的只有评审这一段：所有工单都停在 `status: "drafted"`、`stop: null`。这份状态足够支撑一次续跑——从 `out/` 读回初稿，直接从评审节点开始。注意 T-1005 那条的 `one_line` 恰好暴露了初稿的毛病：开头没有工单号。评审还没跑，所以这个毛病此刻还没被发现。

（`STOP_AFTER` 只认 `merge` 这一个值，是本系列第 9 门课那个受控崩溃点的简化版：退出码 0 全过、1 有工单转人工、2 提前停下没做判定、3 是脚本自己崩了——四个码互不重叠，CI 一眼能分清「跑完了但有人要接手」和「跑挂了」。）

## 完整的 `orchestrate.mjs`

下面是全文，一整段，可以直接复制粘贴进一个空目录里的 `orchestrate.mjs` 然后 `node orchestrate.mjs`。零依赖，不需要 `npm i`，不需要 `package.json`（`.mjs` 后缀已经声明了它是 ES 模块），也不需要 API key——模型客户端是桩。第一次运行会自己把 `inbox/`、`kb/`、`out/` 建好并写进那六条工单。

```javascript
// orchestrate.mjs —— 工单批处理小图：路由 → 扇出 → 汇合 → 评审回路 → 汇报
// 零依赖，node orchestrate.mjs 直接跑。模型客户端是按固定队列出牌的桩。
import fs from "node:fs";
import path from "node:path";

// ============ 0. 常量与目录 ============

const MODEL = "claude-sonnet-5";
const MAX_TURNS = 6;          // 单个节点内部的循环上界（本系列第 7 门课 阀1）
const POOL_SIZE = Math.max(1, Number(process.env.POOL_SIZE) || 2); // 扇出并发上界（第 3 课）；0/非法值兜底为 1
const STUB_LATENCY_MS = 60;   // 桩的固定延迟，替代真实网络往返，好让耗时列有东西可看
const MAX_REVIEW_ROUNDS = 3;  // 评审回路的最大重写轮数（第 5 课）
const FILLER_WORDS = ["稍等", "请耐心等待", "尽快处理"];
const CATEGORIES = ["billing", "bug", "other"];

const ROOT = process.cwd();
const INBOX = path.join(ROOT, "inbox");
const OUT = path.join(ROOT, "out");
const KB = path.join(ROOT, "kb");
const STATE_PATH = path.join(ROOT, "run-state.json");
const LOG_PATH = path.join(ROOT, "run.jsonl");

// ============ 1. 输入：inbox/ 里的 6 条工单与一份已知问题库 ============

const TICKET_TEXT = {
  "T-1001": "订单 A-77301 这个月被扣了两次款，麻烦查一下，多扣的那笔退给我。",
  "T-1002": "在报表页点「导出 CSV」，按钮一直转圈，等了五分钟也没反应。Chrome，公司网络。",
  "T-1003": "你们的人工客服电话是多少？我想直接打电话问。",
  "T-1004": "订单 A-77420 的发票抬头开错了，开成了我的个人名字，要改成公司抬头。",
  "T-1005": "手机 App 上登录之后头像一直不显示，网页端是正常的。",
  "T-1006": "用了三个月，问题提了好几次都没下文，这产品到底还有没有人维护？",
};

const KNOWN_ISSUES = [
  "## KI-88 报表页导出 CSV 无响应",
  "影响：点击导出后按钮持续转圈，后台导出队列积压。状态：已在 3.4.2 修复，等待发版。",
  "临时办法：改用同一页的「导出 XLSX」，数据列完全一致。",
  "",
  "## KI-91 移动端头像不显示",
  "影响：App 端头像 URL 仍指向旧 CDN 域名，网页端不受影响。状态：修复中，预计本周五随版本发布。",
  "临时办法：退出登录后重新登录一次，头像通常会恢复显示。",
].join("\n");

function seedWorkspace() {
  fs.mkdirSync(INBOX, { recursive: true });
  fs.mkdirSync(OUT, { recursive: true });
  fs.mkdirSync(KB, { recursive: true });
  for (const [id, text] of Object.entries(TICKET_TEXT)) {
    fs.writeFileSync(path.join(INBOX, `${id}.txt`), `${text}\n`);
  }
  fs.writeFileSync(path.join(KB, "known-issues.md"), `${KNOWN_ISSUES}\n`);
}

function loadInbox() {
  return fs
    .readdirSync(INBOX)
    .filter((f) => f.endsWith(".txt"))
    .sort()
    .map((f) => ({
      id: path.basename(f, ".txt"),
      text: fs.readFileSync(path.join(INBOX, f), "utf8").trim(),
    }));
}

// ============ 2. 桩 client：SCRIPTS 按工单 id 钉死每次回复 ============

const say = (text) => ({ type: "text", text });
const call = (id, name, input) => ({ type: "tool_use", id, name, input });
const turn = (stop_reason, content, inTok, outTok) => ({
  stop_reason,
  content,
  usage: { input_tokens: inTok, output_tokens: outTok },
});

const SCRIPTS = {
  // 路由节点：一次调用分完六条。注意最后一行故意不是合法标签，由代码收紧。
  router: [
    turn(
      "end_turn",
      [
        say(
          [
            "T-1001: billing",
            "T-1002: bug",
            "T-1003: other",
            "T-1004: billing",
            "T-1005: bug",
            "T-1006: 投诉",
          ].join("\n")
        ),
      ],
      624,
      96
    ),
  ],

  // billing 工人：查订单后一次写清，第一版就过 gate。
  "T-1001#1": [
    turn(
      "tool_use",
      [say("先查订单流水。"), call("toolu_a1", "lookup_order", { order_id: "A-77301" })],
      781,
      92
    ),
    turn(
      "end_turn",
      [
        say(
          "工单 T-1001 回复：订单 A-77301 本月确实扣款 2 次，每笔 399.00 元，系统标记为重复扣款。" +
            "多扣的那一笔已提交退款，按原路退回，到账时间取决于发卡行，一般 3-5 个工作日。" +
            "如果第 5 个工作日仍未到账，请在这条工单里回复，我们会带流水号找支付渠道核查。"
        ),
      ],
      1124,
      168
    ),
  ],

  // bug 工人：查已知问题库后回复，第一版就过 gate。
  "T-1002#1": [
    turn(
      "tool_use",
      [say("先查已知问题库。"), call("toolu_b1", "read_file", { path: "kb/known-issues.md" })],
      763,
      88
    ),
    turn(
      "end_turn",
      [
        say(
          "工单 T-1002 回复：你遇到的是已知问题 KI-88——报表页导出 CSV 时后台队列积压，按钮会一直转圈。" +
            "修复已合入 3.4.2，随下个版本发布后自动生效。在那之前可以改用同一页的「导出 XLSX」，数据列完全一致。" +
            "版本发布当天我们会在这条工单里通知你。"
        ),
      ],
      1312,
      176
    ),
  ],

  // billing 工人：第一版带敷衍词，第二版还是同一句敷衍词 —— 两轮 gate 报告完全相同。
  "T-1004#1": [
    turn(
      "tool_use",
      [say("先确认这张发票的抬头。"), call("toolu_c1", "lookup_order", { order_id: "A-77420" })],
      786,
      90
    ),
    turn(
      "end_turn",
      [
        say(
          "工单 T-1004：发票抬头变更需要财务复核，订单 A-77420 的申请我已经提上去了，请您稍等。"
        ),
      ],
      1133,
      96
    ),
  ],
  "T-1004#2": [
    turn(
      "end_turn",
      [
        say(
          "工单 T-1004：抬头从个人改成公司，需要财务在系统里作废重开一次发票，申请还排在复核队列里，请您稍等，复核完成后我会把新发票发到这条工单。"
        ),
      ],
      1291,
      104
    ),
  ],

  // bug 工人：第一版漏了工单号，第二版按 gate 报告补上。
  "T-1005#1": [
    turn(
      "tool_use",
      [say("查一下这是不是已知问题。"), call("toolu_d1", "read_file", { path: "kb/known-issues.md" })],
      752,
      86
    ),
    turn(
      "end_turn",
      [
        say(
          "这是已知问题 KI-91——App 端头像走的还是旧 CDN 域名，网页端不受影响，修复预计本周五随版本发布。" +
            "在那之前退出登录再重新登录一次，头像通常会恢复显示。"
        ),
      ],
      1298,
      158
    ),
  ],
  "T-1005#2": [
    turn(
      "end_turn",
      [
        say(
          "工单 T-1005 回复：这是已知问题 KI-91——App 端头像走的还是旧 CDN 域名，网页端不受影响，修复预计本周五随版本发布。" +
            "在那之前退出登录再重新登录一次，头像通常会恢复显示。发版后如果仍是空白，请在这条工单里补一张截图，我们再查你的账号。"
        ),
      ],
      1466,
      172
    ),
  ],
};

function makeStubClient(queue) {
  let i = 0;
  return {
    messages: {
      async create(req) {
        if (!req.model || !req.max_tokens) {
          throw new Error("桩 client：create 必须带 model 与 max_tokens");
        }
        if (i >= queue.length) {
          throw new Error(`桩队列耗尽：第 ${i + 1} 次请求没有预设响应`);
        }
        await new Promise((r) => setTimeout(r, STUB_LATENCY_MS));
        return queue[i++];
      },
    },
  };
}

// 计量包在客户端外面，循环内部一行不动。
function metered(client) {
  const meter = { calls: 0, tokens: 0 };
  const wrapped = {
    messages: {
      async create(req) {
        const res = await client.messages.create(req);
        meter.calls += 1;
        meter.tokens += res.usage.input_tokens + res.usage.output_tokens;
        return res;
      },
    },
  };
  return { client: wrapped, meter };
}

// ============ 3. 节点内部：本系列第 7 门课的那个循环，原样搬来 ============

async function runAgent(client, system, userInput, tools, toolImpls) {
  const messages = [{ role: "user", content: userInput }];
  let turns = 0;

  let response = await client.messages.create({
    model: MODEL,
    max_tokens: 1024,
    system,
    tools,
    messages,
  });

  while (response.stop_reason === "tool_use") {
    // —— 阀1：最大轮次。放在循环体最前、turns++ 之前 ——
    if (turns >= MAX_TURNS) {
      return `已达最大轮次 ${MAX_TURNS}，主动收手（可能任务过难或模型卡住）`;
    }
    turns++;

    // 把模型这一轮的完整响应（assistant 角色）追加进历史
    messages.push({ role: "assistant", content: response.content });

    // 执行这一轮所有 tool_use 块，各自打包成 tool_result
    const toolResults = await runToolUses(response.content, toolImpls);

    // 一轮里的所有 tool_result 放进紧随其后的同一条 user 消息
    messages.push({ role: "user", content: toolResults });

    // 带着变长后的历史再发一次，循环回到 while 判断
    response = await client.messages.create({
      model: MODEL,
      max_tokens: 1024,
      system,
      tools,
      messages,
    });
  }

  // stop_reason 不再是 tool_use，取出最终文字返回
  return response.content.find((b) => b.type === "text")?.text ?? "";
}

async function runToolUses(content, toolImpls) {
  const toolUseBlocks = content.filter((b) => b.type === "tool_use");

  return Promise.all(
    toolUseBlocks.map(async (block) => {
      const impl = toolImpls[block.name];
      try {
        const output = await impl(block.input);
        return {
          type: "tool_result",
          tool_use_id: block.id,
          content: output,
        };
      } catch (err) {
        return {
          type: "tool_result",
          tool_use_id: block.id,
          content: `工具执行出错: ${err.message}`,
          is_error: true,
        };
      }
    })
  );
}

// ============ 4. 两个工具 ============

const ORDERS = {
  "A-77301": { order_id: "A-77301", amount_cents: 39900, charged_times: 2, status: "duplicate_charge", invoice_title: "李明（个人）" },
  "A-77420": { order_id: "A-77420", amount_cents: 128000, charged_times: 1, status: "paid", invoice_title: "李明（个人）" },
};

const TOOLS = [
  {
    name: "read_file",
    description: "读取工作目录下的一个文本文件，用于查已知问题库或工单原文。",
    input_schema: {
      type: "object",
      properties: { path: { type: "string", description: "相对工作目录的路径" } },
      required: ["path"],
    },
  },
  {
    name: "lookup_order",
    description: "按订单号查账单事实：金额、扣款次数、状态、发票抬头。",
    input_schema: {
      type: "object",
      properties: { order_id: { type: "string", description: "形如 A-77301 的订单号" } },
      required: ["order_id"],
    },
  },
];

const toolImpls = {
  read_file({ path: rel }) {
    const full = path.resolve(ROOT, rel);
    if (!full.startsWith(ROOT)) throw new Error("越界路径");
    return fs.readFileSync(full, "utf8");
  },
  lookup_order({ order_id }) {
    const row = ORDERS[order_id];
    if (!row) throw new Error(`查无此订单：${order_id}`);
    return JSON.stringify(row);
  },
};

// ============ 5. 三份派工提示词：目标 / 输出格式 / 工具指引 / 任务边界 ============

const ROUTER_PROMPT = [
  "你是客服工单分拣员。",
  "目标：把下面每一条工单归到 billing（账单、扣款、发票、退款）、bug（功能故障）、other（其余）三类之一。",
  "输出格式：每行一条，格式严格为「工单号: 类别」，类别只能是 billing / bug / other，不要写理由，不要输出别的内容。",
  "工具指引：这一步不给你任何工具，只看工单文本判断，不要声称查过系统。",
  "任务边界：只分类，不写回复、不下结论、不合并工单；拿不准就归 other。",
].join("\n");

const WORKER_PROMPTS = {
  billing: [
    "你是账单工单专员，一次只处理一条工单。",
    "目标：查清这条工单的账单事实，给出一次把话说完的中文回复。",
    "输出格式：一段纯文本，开头写「工单 <工单号> 回复：」，依次交代查到的事实、已经做的处理、用户下一步能预期什么；不用列表，不写寒暄。",
    "工具指引：账单事实一律用 lookup_order 查，工单里的订单号原样传入；查不到就如实说查不到，不要从工单描述里推断金额或扣款次数。",
    "任务边界：只处理这条工单的账单部分，不修改订单、不承诺额外补偿、不回答与账单无关的问题；不要写「稍等」「请耐心等待」「尽快处理」这类没有信息量的话。",
  ].join("\n"),
  bug: [
    "你是故障工单专员，一次只处理一条工单。",
    "目标：判断这条工单是不是已知问题，给出一次把话说完的中文回复。",
    "输出格式：一段纯文本，开头写「工单 <工单号> 回复：」，依次交代命中的已知问题编号与结论、临时办法、修复什么时候到；不用列表，不写寒暄。",
    "工具指引：用 read_file 读 kb/known-issues.md 对照，命中就引用其中的编号；没命中就说没命中，不要自己编一个问题编号。",
    "任务边界：只做问题定位与回复，不下线功能、不承诺具体到分钟的修复时间、不索要账号密码；不要写「稍等」「请耐心等待」「尽快处理」这类没有信息量的话。",
  ].join("\n"),
};

// other 类不进模型：一段纯代码模板。不是每个节点都得是模型。
const otherTemplate = (id) =>
  `工单 ${id} 已收到。这条工单不涉及账单，也不是功能故障，已经转给客服组人工跟进：` +
  `工作日 9:00-18:00 可拨打 400-000-1234 直接沟通，也可以在这条工单里补充信息，回复都会记在这条工单下。`;

// ============ 6. 观测：JSONL 结构化日志 + run-state.json 逐步留痕 ============

const RUN_ID = `run-${Date.now().toString(36)}`;

function initLog() {
  fs.writeFileSync(LOG_PATH, "");
}

function log(fields) {
  const line = { ts: new Date().toISOString(), run_id: RUN_ID, ...fields };
  fs.appendFileSync(LOG_PATH, `${JSON.stringify(line)}\n`);
}

const state = {
  version: 1,
  run_id: RUN_ID,
  started_at: new Date().toISOString(),
  updated_at: null,
  nodes: {},
  tickets: {},
};

// 原子写：先写 .tmp 再 rename（本系列第 9 门课的家法）
function saveState() {
  state.updated_at = new Date().toISOString();
  const tmp = `${STATE_PATH}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(state, null, 2));
  fs.renameSync(tmp, STATE_PATH);
}

async function node(name, fn) {
  const t0 = Date.now();
  log({ node: name, event: "node_start" });
  const result = await fn();
  const ms = Date.now() - t0;
  state.nodes[name] = {
    ms,
    calls: result.calls ?? 0,
    tokens: result.tokens ?? 0,
    status: result.status ?? "ok",
  };
  saveState(); // 每个节点跑完留一次痕
  log({ node: name, event: "node_end", ms, calls: result.calls ?? 0, tokens: result.tokens ?? 0 });
  return result;
}

// ============ 7. 节点一：路由 ============

async function routeNode(tickets) {
  const { client, meter } = metered(makeStubClient(SCRIPTS.router));
  const input = tickets.map((t) => `${t.id}: ${t.text}`).join("\n");
  const text = await runAgent(client, ROUTER_PROMPT, input, [], {});

  // 输出收紧：只认「工单号: 类别」这一种行，类别不在白名单里的一律落到 other
  const parsed = new Map();
  for (const line of text.split("\n")) {
    const m = line.match(/^\s*(T-\d+)\s*:\s*(\S+)\s*$/);
    if (!m) continue;
    const [, id, raw] = m;
    const category = CATEGORIES.includes(raw) ? raw : "other";
    if (category !== raw) log({ node: "route", event: "clamped", ticket: id, raw, category });
    parsed.set(id, category);
  }

  const routed = tickets.map((t) => ({ ...t, category: parsed.get(t.id) ?? "other" }));
  for (const t of routed) log({ node: "route", event: "routed", ticket: t.id, category: t.category });
  return { routed, calls: meter.calls, tokens: meter.tokens };
}

// ============ 8. 节点二：扇出（分段 + 并发池上界）============

async function runPool(items, limit, worker) {
  const results = new Array(items.length);
  let next = 0;
  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const i = next;
      next += 1;
      results[i] = await worker(items[i]);
    }
  });
  await Promise.all(runners);
  return results;
}

async function callWorker(ticket, round, extra) {
  const key = `${ticket.id}#${round}`;
  const queue = SCRIPTS[key];
  if (!queue) throw new Error(`桩脚本缺失：${key}`);
  const { client, meter } = metered(makeStubClient(queue));
  const input = extra
    ? [
        `下面是你上一版对工单 ${ticket.id} 的回复：`,
        "---",
        extra.prev,
        "---",
        `确定性检查没有通过，报告：${extra.report}`,
        "只修报告里点名的问题，重写一版完整回复。",
      ].join("\n")
    : `工单号 ${ticket.id}\n用户原文：${ticket.text}`;
  const text = await runAgent(client, WORKER_PROMPTS[ticket.category], input, TOOLS, toolImpls);
  log({ node: extra ? "review" : "fanout", event: "worker_done", ticket: ticket.id, round, calls: meter.calls, tokens: meter.tokens });
  return { text, calls: meter.calls, tokens: meter.tokens };
}

async function fanoutNode(routed) {
  let calls = 0;
  let tokens = 0;

  const drafts = await runPool(routed, POOL_SIZE, async (ticket) => {
    if (ticket.category === "other") {
      const text = otherTemplate(ticket.id);
      log({ node: "fanout", event: "template_done", ticket: ticket.id });
      return { ticket, handler: "template", text };
    }
    const r = await callWorker(ticket, 1);
    calls += r.calls;
    tokens += r.tokens;
    return { ticket, handler: `worker:${ticket.category}`, text: r.text };
  });

  return { drafts, calls, tokens };
}

// ============ 9. 节点三：汇合（纯代码，传引用不传载荷）============

function oneLineOf(text) {
  const head = text.split("。")[0];
  return head.length > 22 ? `${head.slice(0, 22)}…` : head;
}

function mergeNode(drafts) {
  const items = drafts.map((d) => {
    const rel = path.join("out", `${d.ticket.id}.txt`);
    fs.writeFileSync(path.join(ROOT, rel), `${d.text}\n`);
    const item = {
      id: d.ticket.id,
      category: d.ticket.category,
      handler: d.handler,
      file: rel,
      oneLine: oneLineOf(d.text),
    };
    state.tickets[item.id] = {
      category: item.category,
      handler: item.handler,
      file: item.file,
      one_line: item.oneLine,
      gate_rounds: 0,
      gate_reports: [],
      stop: null,
      status: "drafted",
    };
    log({ node: "merge", event: "collected", ticket: item.id, file: item.file, chars: d.text.length });
    return item;
  });
  return { items };
}

// ============ 10. 节点四：评审回路（确定性 gate 优先，查-修-再查）============

function gateCheck(ticketId, reply) {
  const problems = [];
  if (!reply.includes(ticketId)) problems.push("missing_ticket_id");
  for (const w of FILLER_WORDS) {
    if (reply.includes(w)) problems.push(`filler_word:${w}`);
  }
  return { pass: problems.length === 0, report: problems.join(" | ") };
}

async function reviewNode(items, byId) {
  let calls = 0;
  let tokens = 0;
  let totalRounds = 0;

  for (const item of items) {
    const full = path.join(ROOT, item.file);
    let reply = fs.readFileSync(full, "utf8").trim(); // 载荷从文件读，不从上一节点带过来
    let rounds = 0;
    let lastReport = null;
    const reports = [];
    let verdict = null;
    let gate = gateCheck(item.id, reply);
    log({ node: "review", event: "gate", ticket: item.id, round: 0, pass: gate.pass, report: gate.report });

    while (!gate.pass) {
      reports.push(gate.report);
      if (rounds >= MAX_REVIEW_ROUNDS) {
        verdict = "max_rounds";
        break;
      }
      if (gate.report === lastReport) {
        verdict = "no_progress"; // 连续两轮报告一模一样，回路不再往前走
        break;
      }
      if (item.handler === "template") {
        verdict = "no_rewriter"; // 纯代码模板没有可回炉的工人，直接交人
        break;
      }
      lastReport = gate.report;
      rounds += 1;
      totalRounds += 1;
      const r = await callWorker(byId.get(item.id), rounds + 1, { prev: reply, report: gate.report });
      calls += r.calls;
      tokens += r.tokens;
      reply = r.text;
      fs.writeFileSync(full, `${reply}\n`);
      gate = gateCheck(item.id, reply);
      log({ node: "review", event: "gate", ticket: item.id, round: rounds, pass: gate.pass, report: gate.report });
    }

    const rec = state.tickets[item.id];
    rec.gate_rounds = rounds;
    rec.gate_reports = reports;
    rec.stop = gate.pass ? "gate_pass" : verdict;
    rec.status = gate.pass ? "pass" : "needs_human";
    rec.one_line = oneLineOf(reply);
    item.oneLine = rec.one_line;
    item.status = rec.status;
    item.rounds = rounds;
    item.stop = rec.stop;
    saveState(); // 一条工单判完留一次痕
  }

  return { items, calls, tokens, totalRounds };
}

// ============ 11. 节点五：汇报（纯代码）============

const pad = (s, n) => {
  const w = [...String(s)].reduce((a, c) => a + (c.charCodeAt(0) > 127 ? 2 : 1), 0);
  return String(s) + " ".repeat(Math.max(1, n - w));
};

function reportNode(items, totalRounds) {
  console.log("\n=== 全图执行汇总 ===");
  console.log(pad("节点", 10) + pad("耗时", 8) + pad("模型调用", 12) + pad("token", 9) + pad("gate 轮数", 12) + "状态");
  // 汇报节点自己不进这张表：它就是这张表；它的耗时由外层 node() 记进 run-state.json
  const order = ["route", "fanout", "merge", "review"];
  for (const name of order) {
    const n = state.nodes[name];
    if (!n) continue;
    const rounds = name === "review" ? String(totalRounds) : "-";
    console.log(pad(name, 10) + pad(`${n.ms}ms`, 8) + pad(n.calls, 12) + pad(n.tokens, 9) + pad(rounds, 12) + n.status);
  }

  console.log("\n=== 逐条工单 ===");
  console.log(pad("工单", 9) + pad("类别", 10) + pad("处理者", 18) + pad("gate 轮数", 12) + pad("停止原因", 16) + "状态");
  for (const it of items) {
    console.log(
      pad(it.id, 9) + pad(it.category, 10) + pad(it.handler, 18) + pad(it.rounds, 12) + pad(it.stop, 16) + it.status
    );
  }

  const needsHuman = items.filter((it) => it.status === "needs_human");
  console.log(`\n产出目录 out/：${items.length} 份回复；需要人工接手：${needsHuman.length} 条`);
  for (const it of needsHuman) {
    console.log(`  - ${it.id}（${it.stop}）：${it.oneLine}`);
  }
  console.log(`留痕：run-state.json / run.jsonl（run_id=${RUN_ID}）`);
  return { needsHuman: needsHuman.length };
}

// ============ 12. 主流程：计划就是下面这十几行 ============

async function main() {
  seedWorkspace();
  initLog();
  saveState();

  const tickets = loadInbox();
  console.log(`inbox/ 收到 ${tickets.length} 条工单：${tickets.map((t) => t.id).join(", ")}`);

  const { routed } = await node("route", () => routeNode(tickets));
  console.log(`[route] ${routed.map((t) => `${t.id}=${t.category}`).join("  ")}`);

  const { drafts } = await node("fanout", () => fanoutNode(routed));
  console.log(`[fanout] 并发上界 ${POOL_SIZE}，产出 ${drafts.length} 份初稿`);

  const { items } = await node("merge", async () => mergeNode(drafts));
  console.log(`[merge] 写入 out/ ${items.length} 份，向下只传引用与一行摘要`);

  if (process.env.STOP_AFTER === "merge") {
    console.log("[stop] STOP_AFTER=merge：在评审之前停下，本次不做判定");
    process.exit(2);
  }

  const byId = new Map(routed.map((t) => [t.id, t]));
  const reviewed = await node("review", () => reviewNode(items, byId));
  console.log(`[review] gate 重写共 ${reviewed.totalRounds} 轮`);

  const { needsHuman } = await node("report", async () => reportNode(items, reviewed.totalRounds));

  process.exit(needsHuman > 0 ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(3); }); // 崩溃退 3，与 needs_human 的 1 区分开
```

六百七十九行，其中约一百九十行是喂给桩的数据（`SCRIPTS` 那张表、六条工单原文、已知问题库、桩 client），真正的编排逻辑——五个节点、并发池、gate 与入口——约两百五十行，另有四十来行是观测与状态留痕。这个规模是刻意的：一个循环加几个模式，本来就是几行代码能实现的东西[^S1]。

## 验证桥段

这一课所有终端输出都是这个脚本真跑出来的，靠的不是「多跑几次挑一次好看的」，而是把两处不确定性提前钉死。

**模型换成按固定队列出牌的桩。** `SCRIPTS` 是一张表，键是「工单 id + 第几版」，值是一串预先写好的响应；每调一次 `messages.create` 就按顺序吐下一条，队列耗尽还在调就直接报错。这样「哪条工单在哪一轮调哪个工具、模型什么时候收尾」全是常量。桩还留了一道断言：`create` 必须带 `model` 与 `max_tokens`，缺一个就抛错——真 client 这两个参数是必填的，桩不替你兜着，免得换成真 client 那天才发现漏了。这套方法从本系列第 8 门课的实战一路用到这里，为的是让被验证的对象是你写的控制逻辑，而不是模型当天的发挥（真实的模型是非确定性的，同样输入也可能给出不同的响应[^S3]）。

桩里还加了一个 60 毫秒的固定延迟，代替真实的网络往返。不加的话每个节点都是 0ms，并发池的效果在汇总表里根本看不出来——上面 `POOL_SIZE=1` 那次对比（494ms 对 247ms）靠的就是它。

**两条埋在桩里的回路剧本。** 评审回路要真的转起来，就得有东西真的过不了 gate。所以：

- `T-1005#1`（故障工人的第一版）故意不写工单号，触发 `missing_ticket_id`；`T-1005#2` 补上开头那句话，第二版通过——这条演示的是「查-修-再查」正常收工的出口。
- `T-1004#1` 和 `T-1004#2`（账单工人的两版）都带着「请您稍等」。两版的句子完全不同，长度也不同，但 gate 看的是那个词在不在，于是两轮报告字符串一模一样，触发「不再有进展」——这条演示的是止损的出口。

两条剧本的写法是有讲究的：不是让第二版原样重复第一版（那样连人都看得出是死循环），而是让它「改了，但没改到点上」。这才是真实回路里最常见的失败形态，也正是「连续两轮报告相同」这个判据要抓的东西。

**受控的提前停止。** `STOP_AFTER=merge` 让进程在扇出之后、评审之前停下，退出码 2。它是本系列第 9 门课那个 `CRASH_AFTER` 的简化版：把「在哪一步中断」变成一个能精确指定的参数，而不是靠运气去撞。上面那份 `drafted` 状态的 `run-state.json` 就是这么跑出来的。

## 对表：这张图欠前面几课的账，逐条清一遍

一门课到了收尾的实战，最容易犯的毛病是悄悄推翻前面立过的规矩。所以这里逐条对一遍，有出入的地方明写。

**1. 循环本体和本系列第 7 门课一致。** 循环体里那四步——push assistant、执行工具、push tool_result、重新赋值 `response`——与本系列第 7 门课的第 6 课那段逐字相同，注释都没改。阀1 也在原位。**差异声明**：`runAgent` 的签名多了 `client` 和 `system` 两个参数（三个角色要用不同的桩和不同的系统提示词），`create` 调用里多了一个 `system` 字段；token 计量从循环体搬到了 `metered` 包装器里，因此第 7 门课的阀2（token 预算）没有跟着搬，阀3（空转检测）和阀4（人工审批）也没有搬——这张图里工具只有读文件和查订单两个只读操作，没有需要审批的高影响动作；桩队列有限，空转跑不飞。接真 API 之前，这三道阀都要装回去。

**2. 派工提示词四要素齐全（第 4 课）。** 三份提示词——分拣员、账单工人、故障工人——每一份都写全了目标、输出格式、工具指引、任务边界四段，各占一行，可以逐行对照[^S2]。

**3. 并发池有上界，汇合传引用不传载荷（第 3 课）。** `runPool` 的 `limit` 是硬上界，`POOL_SIZE=1` 与 `POOL_SIZE=2` 的耗时差已经验过。`merge` 之后向下游传的是 `{id, category, handler, file, oneLine}`，正文全文留在 `out/` 里，评审节点自己从文件读回来[^S2]。**差异声明**：第 3 课讲的池子是「同一批子任务并行跑」，这里的池子跨了三种处理者——两种模型工人加一段纯代码模板，模板那条走进池子几乎不耗时。池子的语义没变（在飞的任务数不超过上界），只是任务本身不同质。还有一条第 3 课立过、这里为了让脚本短没有装：第 3 课要求每条泳道单独 `try/catch`、让单路失败不拖垮整批，`runPool` 没有这层包裹——代价是扇出阶段任一路抛错，整批初稿都不会落盘。接真 API 之前必须补上，真实网络里一路超时是常态。

**4. gate 优先于裁判，回路的停止条件与第 5 课一致。** 第一道关是确定性代码，不是模型；这一课没有装 LLM 裁判那一层，因为这批工单的验收标准恰好都能写成规则，装了也是白花钱——本系列第 10 门课的分层判分就是这个顺序：能确定性判的先判完，剩下的才请裁判。回路的停止条件三种：通过、不再有进展、撞上最大轮数[^S5][^S1]，中文概念和第 5 课一一对应。**但字段和取值换了写法**：第 5 课落在 `reason` 字段、取值 `passed`/`no-progress`/`max-rounds`，这里落在 `stop` 字段、取值 `gate_pass`/`no_progress`/`max_rounds`（判据从裁判换成了 gate，连字符也按本课的 snake_case 惯例改成下划线）；另外第 5 课的 `rounds` 数的是生成次数、初稿算第 1 轮，本课的 `gate_rounds` 数的是重写次数、初稿是第 0 轮，所以同样一条工单，两课的轮数计数起点差一。**差异声明**：代码里多了第四个出口 `no_rewriter`（纯代码模板没有可回炉的工人）。这不是第 5 课漏讲的模式，是这张图特有的情况——第 5 课的回路预设了「产出者是个模型」，而这里有一类产出者是模板。这次运行没有走到这条分支。

**5. 「图」的措辞和第 5 课的声明一致。** 全文的「图」「节点」都是本课自己的工程隐喻，第 5 课引入这套画法时已经明说过，它不是任何一手材料里的官方概念；能站住的一手依据只有那一条：工作流脚本自己持有循环、分支与中间结果[^S5]。这一课没有给它添任何新术语——「状态机」「节点间传递的状态对象」一个没用；第 5 课定义过的「边」（谁的输出喂给谁）只在讲 `merge → review` 那条数据流时出现过一次，不是新词。`routed` / `drafts` / `items` 就是三个普通的局部变量。

**6. `run-state.json` 的原子写与本系列第 9 门课一致。** 先写 `.tmp`，再 `renameSync` 替换，一步不差。落笔时机也照那门课的口径：每完成一小步落一次，不是跑完才落一次。

**7. 观测口径与本系列第 11 门课同形，但粒度更粗。** 一行一个 JSON 事件，每条带 `ts` 和 `run_id`，事后随便 `grep`。**差异有四条**：(a) 第 11 门课的日志器记内容摘要（形状、长度、前若干字符），这一课只记 id、类别、文件名、报告字符串和计数，不记回复正文——正文本来就在 `out/` 里；(b) 关联字段第 11 门课叫 `trace_id`，这里叫 `run_id`；(c) 那门课的核心是用 `span_id`/`parent_id` 把记录串成一棵 trace 树，这张图虽然是 node→worker→tool 三层嵌套，却没有实现父子串联，所以没有 trace 树；(d) `initLog()` 每跑一次就清空 `run.jsonl`、只留最近一次运行，要做第 11 门课那种跨运行比对（`v-good` vs `v-bug`），得改成按 `run_id` 分文件追加。想把这张图接进真正的 trace 体系，第 11 门课那套 span 字段要照着补。

**8. 编排者-工人这个模式，本课有意没实现（第 4 课）。** 第 4 课讲的编排者-工人，关键是「派几份、每份干什么」由模型看着输入现场决定；这张图不是——六条工单怎么分类、每类走哪个工人，在写第一行代码之前就定死在 `CATEGORIES` 和三份常量提示词里了。这正是第 4 课那条「能预定义就别动态」的直接应用：这批活的形状是已知的，就不该把决定权交回模型。所以严格讲，焊进这个文件的是四个模式（链式、路由、并行化-分段、评审回路），投票在 Level 2 练习里补第五个，编排者-工人则是被这批任务的性质挡在门外的那一个。

## 分寸

这张图管的事情很小：一个进程，一批工单，跑完就退出。它值得建，是因为「工单进来 → 分类 → 按类别处理 → 检查 → 汇报」这五步在写第一行代码之前就已经定死了。要是任务变成「查清楚这个客户过去半年到底遇到了什么问题，需要几步你自己判断」，那这张图就是错的架构——那种事先没法预测需要多少步、也没法硬编一条固定路径的开放式问题，本来就该交回给自主循环[^S1]。

几处边界，说在明处：

**扇出是同步的，规模大了会疼。** `fanoutNode` 里的池子必须等这一批全部跑完才进 `merge`。这正是那个真实上线系统承认的瓶颈：同步执行简化了协调，但会在信息流上形成堵点——一个子代理迟迟不完，整个系统就卡在那儿等它[^S2]。六条工单、每条最多两次调用，这个瓶颈根本不疼；六百条、每条十次调用，它就会变成「最慢那条决定整批的墙上时间」。要不要改成异步，得算清楚代价：异步能让代理并发工作、按需再开新的，但它会在结果协调、状态一致性、跨子代理的错误传播这三件事上添难[^S2]——这三样在同步版本里根本不存在，因为顺序是代码定死的。

**评审回路的两条规则很浅，也很脆。** `includes("稍等")` 会把「不用稍等，已经处理完了」这种句子误判成敷衍。这是本系列第 10 门课提醒过的老问题：过严的确定性验证器会把对的判成错的。真要上线，这两条规则得配一小批真实回复反复校准，或者把它降级成「拦下来交给裁判复判」而不是直接打回重写。

**换成真 API，只换桩，结构不动。** `makeStubClient(queue)` 换成 `new Anthropic()`，`SCRIPTS` 整张表删掉，其余一行不用改——`runAgent` 本来就是照真实 API 的 `stop_reason` / `tool_use` / `tool_result` 形状写的，`model` 与 `max_tokens` 也一直带着。换完有三件事会变：分类结果会抖（同样的工单，两次跑可能落进不同的类），gate 轮数会抖，token 数会抖；跑一次要花钱花时间；本系列第 7 门课那三道没搬的阀得装回去。

**每加一层复杂度，都得过「可测量的改进」这道关。** 这张图里的每个模式都能被单独摘掉：不做路由，一个通用提示词也能回工单；不做扇出，串行跑六条也能跑完；不做评审回路，人工抽检也是一种办法。摘掉之后指标掉没掉、掉多少，得测了才知道。只有在复杂度确实改善了结果的时候，才值得把它加上去[^S1]。

## 💻 练习

<!-- exercises -->

### Level 1：读图诊断——回路里到底发生了什么

下面是这张图一次完整运行的汇总表，以及 `run-state.json` 里两条工单的记录（真实运行结果，毫秒数和 `run_id` 每次会变）：

```text
=== 全图执行汇总 ===
节点      耗时    模型调用    token    gate 轮数   状态
route     62ms    1           720      -           ok
fanout    247ms   8           8903     -           ok
merge     2ms     0           0        -           ok
review    127ms   2           3033     2           ok

=== 逐条工单 ===
工单     类别      处理者            gate 轮数   停止原因        状态
T-1001   billing   worker:billing    0           gate_pass       pass
T-1002   bug       worker:bug        0           gate_pass       pass
T-1003   other     template          0           gate_pass       pass
T-1004   billing   worker:billing    1           no_progress     needs_human
T-1005   bug       worker:bug        1           gate_pass       pass
T-1006   other     template          0           gate_pass       pass
```

```json
"T-1004": {
  "category": "billing",
  "handler": "worker:billing",
  "file": "out/T-1004.txt",
  "one_line": "工单 T-1004：抬头从个人改成公司，需要…",
  "gate_rounds": 1,
  "gate_reports": ["filler_word:稍等", "filler_word:稍等"],
  "stop": "no_progress",
  "status": "needs_human"
},
"T-1005": {
  "category": "bug",
  "handler": "worker:bug",
  "file": "out/T-1005.txt",
  "one_line": "工单 T-1005 回复：这是已知问题 KI…",
  "gate_rounds": 1,
  "gate_reports": ["missing_ticket_id"],
  "stop": "gate_pass",
  "status": "pass"
}
```

不写代码，回答三个问题：（1）六条工单里哪几条进过评审回路、各转了几轮，你是从哪个字段看出来的？（2）T-1004 和 T-1005 的 `gate_rounds` 都是 1，为什么一条 `pass`、一条 `needs_human`？证据在哪个字段，怎么读？（3）假设进程在扇出跑完、评审还没开始的那一刻被杀掉，`run-state.json` 里能保住什么、丢掉什么？重启之后能从哪一步接着跑？

<!-- rubric -->
- （1）T-1004 与 T-1005 进过回路，各转 1 轮；依据是逐条工单表里 `gate 轮数` 列非零，或 `run-state.json` 里 `gate_rounds` 大于 0；另外四条是 0，说明初稿一次过 gate。汇总表 `review` 行的 gate 轮数 2 是这两条各 1 轮的总和
- （2）分水岭是 `gate_reports` 而不是 `gate_rounds`：T-1005 只有一条报告 `missing_ticket_id`，说明重写后的第二版通过了检查、没有产生第二条报告，`stop` 因此是 `gate_pass`；T-1004 有两条内容完全相同的 `filler_word:稍等`，说明重写后 gate 报告没有任何变化，触发「连续两轮报告相同判为不再有进展」，`stop` 是 `no_progress`、`status` 是 `needs_human`。必须指出 `gate_rounds` 数的是重写次数、`gate_reports` 记的是每一次未通过的报告（含最后一次），两者不等价
- （3）保住的：`nodes` 里 `route` / `fanout` / `merge` 三个节点的耗时与用量；六条工单的 `category`、`handler`、`file`、`one_line`；以及 `out/` 里六份已经落盘的初稿。丢掉的：评审判定，所有工单停在 `status: "drafted"`、`stop: null`、`gate_reports: []`。重启后可以从 `out/` 把初稿读回来，直接从评审节点开始，不必重跑路由和扇出——因为状态是每个节点跑完就落一次、而不是跑完全程才落一次
- 说明这套「逐步留痕」的意义：运行过程中逐步记录每一步的结果，正是一次运行可恢复的前提；也与本系列第 9 门课「先写 .tmp 再 rename」的原子写配套——被杀的那一刻磁盘上要么是上一份完整状态、要么是新的完整状态

<!-- answer -->
（1）进过回路的是 T-1004 和 T-1005，各转了 1 轮。最直接的字段是逐条工单表的 `gate 轮数` 列（`run-state.json` 里对应 `gate_rounds`）：这两条是 1，其余四条是 0。0 的含义是初稿第一次送检就过了 gate，工人一次都没被叫回来。汇总表里 `review` 行那个 2，是这两条各 1 轮加起来的总数，不是某一条转了两轮。

（2）光看 `gate_rounds` 确实分不出成败——它数的是「工人被叫回去重写了几次」，而重写完的结果是好是坏，它不管。真正的证据在 `gate_reports`，它记的是每一次没通过的报告，包括导致回路停下的最后那一次。T-1005 的数组里只有一条 `missing_ticket_id`：初稿漏了工单号，被打回；重写的第二版补上了，gate 通过，没有再产生报告，于是 `stop` 记成 `gate_pass`、`status` 是 `pass`。T-1004 的数组里有两条，而且字符串完全一样，都是 `filler_word:稍等`：初稿写了「请您稍等」被打回；工人重写了一版——句子换了、更长了、多解释了一句——但那个词还在，gate 交回的报告和上一轮一字不差。回路的判据是「这一轮的报告和上一轮相同就判定不再有进展」，于是它没有把剩下的两轮预算花掉，直接停下、标 `needs_human`，`stop` 记成 `no_progress`。一句话：`gate_rounds` 数的是重写次数，`gate_reports` 才反映每一次重写有没有换来不同的结果。

（3）保住的部分不少。`nodes` 里已经有 `route`、`fanout`、`merge` 三条完整记账（耗时、模型调用数、token）；六条工单每条都有 `category`、`handler`、`file`、`one_line`；`out/` 目录里六份初稿都已经写完落盘。丢掉的只有评审这一段——所有工单都停在 `status: "drafted"`、`stop: null`、`gate_reports` 是空数组，谁该重写、谁该转人工，一个都还没判。所以重启之后完全可以跳过路由和扇出（这两步的产物都在磁盘上），从 `out/` 把六份初稿读回来，直接进评审节点。能做到这一点的原因是状态的落笔时机：每个节点跑完就写一次，评审里每判完一条工单再写一次，而不是等整趟跑完才写。逐步记录每一步的结果，正是一次运行能在同一会话内被恢复的前提；本课把它推广到跨进程续跑，靠的是把状态落到磁盘——一手材料的原句只说同一会话内，跨进程那一步是我们自己加的；配上「先写 `.tmp` 再 `rename`」的原子替换，被杀的那一刻磁盘上要么是上一份完整状态、要么是新的完整状态，不会出现半截 JSON 让你连读都读不回来。

<!-- hint -->
先分清两个字段各自数的是什么：一个数「工人被叫回去几次」，一个记「每次检查报告说了什么」。两条工单的第一个数字相同，第二个字段的长度和内容却不同——差别就藏在那里。

<!-- hint -->
第三问不用推理，直接对着 `STOP_AFTER=merge` 那次运行贴出的 `run-state.json` 看：哪些键有值、哪些工单字段还是初始值（`stop` 是 `null`、`gate_reports` 是 `[]`、`status` 是 `drafted`），有值的那些就是保住的，还是初始值的那些就是丢掉的。

### Level 2：给图加一个投票节点

`other` 类里有一条工单语气不好拿捏——T-1006：「用了三个月，问题提了好几次都没下文，这产品到底还有没有人维护？」。一段固定模板回它，多半是不合适的：太冷淡显得敷衍，太热情又容易过度承诺。

给这张图加一个投票节点：同一条工单、同一个任务，用两种角度各跑一次[^S1]，然后用纯代码比较两版，选优的那版进汇合。比较规则只有两条，都不许请模型：先用 gate 那套确定性规则淘汰（有禁用词或缺工单号的直接出局），活下来的里面选更短的（客服回复不啰嗦）。

要求：两个角度的提示词都要配齐四要素；两次调用要老老实实走 `runAgent`（也就是走完整的循环），桩里各给一条响应队列；选优过程要在终端和 `run.jsonl` 里都留下痕迹，让人知道为什么选了这一版。写完真的跑一遍，把输出贴出来。另外回答一个问题：这里为什么用纯代码比较，而不是叫一个模型来评哪版更好？

<!-- rubric -->
- 两个角度是同一个任务的不同切入点（例如「先接住情绪」与「只给事实」），不是把任务拆成两半——这才是投票，不是分段
- 两次调用都走完整的 `runAgent` 循环，各自一条桩响应队列；模型调用数和 token 在汇总表里能看到相应增长（比基础版多 2 次调用）
- 两个角度的提示词都写全目标、输出格式、工具指引、任务边界四要素
- 选优是纯代码：先跑 `gateCheck` 淘汰，再在通过的候选里按长度取最短；两条规则的顺序要写清楚，并且能说明这一次是哪条规则起的决定作用
- 留痕：终端有一行能看出两个候选各自的判定与长度、以及最终选了谁；`run.jsonl` 里有对应的结构化事件
- 两个角度串行跑，或者显式说明为什么并发也不会突破池子的上界——不能在池子内部偷偷再开一层并发，把总并发数变成 `POOL_SIZE × 2`
- 说清用纯代码而不用裁判的理由：这两条规则（禁用词、长度）本来就是确定性可判的，同样输入永远同样结果，不花调用、不引入新的不确定性；LLM 裁判该留给「语气得不得体」这类规则写不出来的判断，而且要排在确定性检查后面

<!-- answer -->
改动集中在四处：一个常量、两条桩响应队列、两份角度提示词，以及 `fanoutNode` 里多出来的一个分支加两个函数。其余代码一行没动。

第一处，标出哪些工单要投票：

```javascript
const CATEGORIES = ["billing", "bug", "other"];
const VOTE_TICKETS = new Set(["T-1006"]); // 语气拿捏不准、值得跑两个角度的工单
```

第二处，桩里加两条响应队列（放在 `SCRIPTS` 里 `T-1005#2` 之后）：

```javascript
  // 投票：同一条工单，两个角度各跑一次。
  "T-1006@warm#1": [
    turn(
      "end_turn",
      [
        say(
          "工单 T-1006 回复：先说抱歉，前几次反馈都没有给你一个明确结果，这是我们跟进上的问题。" +
            "我把你这三个月提过的工单重新串了一遍，交给对应的负责同事，会尽快处理，进展写在这条工单里。" +
            "产品仍在维护，最近一次版本更新可以在帮助中心的「更新日志」里查到。"
        ),
      ],
      812,
      164
    ),
  ],
  "T-1006@plain#1": [
    turn(
      "end_turn",
      [
        say(
          "工单 T-1006 回复：产品仍在维护，最近一次版本更新在帮助中心的「更新日志」里可以查到。" +
            "你之前提的几条反馈没有给出结果，这是我们跟进上的问题，已经把它们重新汇总给对应的负责同事，进展会写在这条工单里。"
        ),
      ],
      806,
      142
    ),
  ],
```

第三处，两份角度提示词（放在 `otherTemplate` 前面），四要素齐全：

```javascript
// 投票用的两个角度：任务同一个，切入点不同（第 3 课 投票）
const ANGLE_PROMPTS = {
  warm: [
    "你是客服工单专员，一次只处理一条工单，这一版走「先接住情绪」的角度。",
    "目标：先认下跟进不到位这件事，再把用户真正问的「还有没有人维护」回答清楚。",
    "输出格式：一段纯文本，开头写「工单 <工单号> 回复：」，先致歉并说明已经做了什么，再回答产品状态；不用列表。",
    "工具指引：这一步不给你系统工具，只用工单原文里的事实，不要声称查过工单历史的具体条数。",
    "任务边界：不承诺具体修复日期、不给补偿、不评价同事；不要写「稍等」「请耐心等待」「尽快处理」这类没有信息量的话。",
  ].join("\n"),
  plain: [
    "你是客服工单专员，一次只处理一条工单，这一版走「只给事实」的角度。",
    "目标：直接回答产品是否仍在维护，再说明这几条反馈接下来归谁跟进。",
    "输出格式：一段纯文本，开头写「工单 <工单号> 回复：」，第一句就给结论，后面补下一步；不用列表，不写致歉套话。",
    "工具指引：这一步不给你系统工具，只用工单原文里的事实，不要编造版本号。",
    "任务边界：不承诺具体修复日期、不给补偿、不评价同事；不要写「稍等」「请耐心等待」「尽快处理」这类没有信息量的话。",
  ].join("\n"),
};
```

第四处，两个新函数（放在 `fanoutNode` 前面）：

```javascript
async function callAngle(ticket, angle) {
  const key = `${ticket.id}@${angle}#1`;
  const queue = SCRIPTS[key];
  if (!queue) throw new Error(`桩脚本缺失：${key}`);
  const { client, meter } = metered(makeStubClient(queue));
  const input = `工单号 ${ticket.id}\n用户原文：${ticket.text}`;
  const text = await runAgent(client, ANGLE_PROMPTS[angle], input, [], {}); // 两份角度提示词都写了「不给系统工具」，这里就得传空工具，和 routeNode 同形
  log({ node: "fanout", event: "vote_candidate", ticket: ticket.id, angle, chars: text.length, calls: meter.calls, tokens: meter.tokens });
  return { angle, text, calls: meter.calls, tokens: meter.tokens };
}

// 纯代码选优：先用 gate 那套确定性规则淘汰，再在活下来的里挑最短的
function pickBest(ticketId, candidates) {
  const scored = candidates.map((c) => ({ ...c, gate: gateCheck(ticketId, c.text) }));
  const alive = scored.filter((c) => c.gate.pass);
  const pool = alive.length > 0 ? alive : scored; // 全被淘汰就都留下，交给评审节点判
  const winner = pool.reduce((a, b) => (b.text.length < a.text.length ? b : a));
  return { winner, scored, allFailed: alive.length === 0 };
}
```

以及 `fanoutNode` 里池子回调最前面多出来的一个分支（`other` 那个模板分支原样保留，T-1003 还走它）：

```javascript
  const drafts = await runPool(routed, POOL_SIZE, async (ticket) => {
    if (VOTE_TICKETS.has(ticket.id)) {
      // 两个角度串行跑：并发上界由池子统一管，别在池子内部再偷偷开并发
      const candidates = [];
      for (const angle of ["warm", "plain"]) {
        const c = await callAngle(ticket, angle);
        calls += c.calls;
        tokens += c.tokens;
        candidates.push(c);
      }
      const { winner, scored } = pickBest(ticket.id, candidates);
      log({
        node: "fanout",
        event: "vote_pick",
        ticket: ticket.id,
        winner: winner.angle,
        detail: scored.map((c) => `${c.angle}/${c.gate.pass ? "ok" : c.gate.report}/${c.text.length}字`).join(" | "),
      });
      console.log(
        `[vote] ${ticket.id} ` +
          scored.map((c) => `${c.angle}=${c.gate.pass ? "ok" : c.gate.report}(${c.text.length}字)`).join("  ") +
          `  → 选 ${winner.angle}`
      );
      return { ticket, handler: `vote:${winner.angle}`, text: winner.text };
    }
    if (ticket.category === "other") {
      const text = otherTemplate(ticket.id);
      log({ node: "fanout", event: "template_done", ticket: ticket.id });
      return { ticket, handler: "template", text };
    }
    const r = await callWorker(ticket, 1);
    calls += r.calls;
    tokens += r.tokens;
    return { ticket, handler: `worker:${ticket.category}`, text: r.text };
  });
```

真实运行结果：

```text
$ node orchestrate.mjs
inbox/ 收到 6 条工单：T-1001, T-1002, T-1003, T-1004, T-1005, T-1006
[route] T-1001=billing  T-1002=bug  T-1003=other  T-1004=billing  T-1005=bug  T-1006=other
[vote] T-1006 warm=filler_word:尽快处理(124字)  plain=ok(102字)  → 选 plain
[fanout] 并发上界 2，产出 6 份初稿
[merge] 写入 out/ 6 份，向下只传引用与一行摘要
[review] gate 重写共 2 轮

=== 全图执行汇总 ===
节点      耗时    模型调用    token    gate 轮数   状态
route     62ms    1           720      -           ok
fanout    371ms   10          10827    -           ok
merge     1ms     0           0        -           ok
review    127ms   2           3033     2           ok

=== 逐条工单 ===
工单     类别      处理者            gate 轮数   停止原因        状态
T-1001   billing   worker:billing    0           gate_pass       pass
T-1002   bug       worker:bug        0           gate_pass       pass
T-1003   other     template          0           gate_pass       pass
T-1004   billing   worker:billing    1           no_progress     needs_human
T-1005   bug       worker:bug        1           gate_pass       pass
T-1006   other     vote:plain        0           gate_pass       pass

产出目录 out/：6 份回复；需要人工接手：1 条
  - T-1004（no_progress）：工单 T-1004：抬头从个人改成公司，需要…
留痕：run-state.json / run.jsonl（run_id=run-mta4ffwe）
```

对着基础版比：`fanout` 的模型调用从 8 涨到 10、token 从 8903 涨到 10827、耗时从 247ms 涨到 371ms——这就是投票的价格，同一条工单的活干了两遍。逐条工单表里 T-1006 的处理者从 `template` 变成了 `vote:plain`。

这一次是第一条规则分的胜负：`warm` 那版里有「会尽快处理」，撞上禁用词直接出局，长度那条根本没轮到。想看长度规则起作用，把桩里 `T-1006@warm#1` 那句「交给对应的负责同事，会尽快处理，进展写在这条工单里」改成「交给对应的负责同事，进展写在这条工单里」再跑一次，真实输出是：

```text
[vote] T-1006 warm=ok(118字)  plain=ok(102字)  → 选 plain
```

两版都过了确定性检查，于是按第二条规则取更短的那版，`plain` 以 102 字对 118 字胜出。

**为什么用纯代码比较，不叫模型来评？** 因为这两条规则本来就是确定性可判的。「有没有出现禁用词」「哪版更短」这种问题，字符串操作一行就能给出答案，同样的输入永远给同样的结果，不花一次调用、不多等一次网络往返，也不会引入新的不确定性——本系列第 10 门课的分层判分讲的就是这个顺序：能确定性判的先判完，剩下的才轮到裁判。反过来说，如果比较标准变成「哪一版的语气更让人愿意继续沟通」，那确实写不成规则，该请裁判；但即便到那时候，裁判也该排在这两条确定性规则后面——先把明显不合格的候选淘汰掉，再花钱去评剩下的。

顺带一个容易踩的坑：两个角度是串行跑的。如果图省事写成 `Promise.all`，池子里同时在飞的模型调用就变成了 `POOL_SIZE × 2`，你以为的上界 2 实际是 4。要么像这里一样串行，要么把投票的候选也当成池子的任务项交给同一个池子调度——反正上界只能有一处说了算。

<!-- hint -->
先想清楚投票和分段的区别：分段是把一件事拆成几块，每块只做一部分；投票是同一件事整个做两遍，只是切入点不同，最后要挑一个。所以两个角度的提示词，「目标」那一行说的应该是同一件事，差别在怎么切入、先说什么。

<!-- hint -->
选优不用另写一套规则——`gateCheck` 已经在了，直接拿它当第一道筛子，两条候选各跑一次，看谁的 `pass` 是 `true`。剩下的活就只有「在活下来的里面挑最短的」这一句 `reduce`。真的跑一遍，看终端那行 `[vote]` 打出来的两个候选各是什么状态，你就知道这次是哪条规则起的作用。

<!-- /exercises -->

## 小结

- 四个模式焊进一个文件之后（投票在练习里补第五个，编排者-工人因为分工能预定义而有意缺席），「计划在代码里」这句话有了具体形状：`main()` 那十几行就是全部的控制流，`routed` / `drafts` / `items` 三个普通变量就是全部的状态。LLM 与工具被预定义的代码路径编排[^S1]，脚本自己持有循环、分支与中间结果，模型的上下文里只装它这一步该看的东西[^S5]
- 不是每个节点都得是模型：五个节点里两个调模型，`merge`、`report` 和 gate 的第一道关都是纯代码，`other` 类走的是字符串模板。凡是确定性代码能给出同样答案的地方，就没有理由付一次调用的钱和延迟
- 路由的价值不在那次调用，而在调用之后那十行收紧代码：模型给的自由文本被压成三个合法标签之一，下游分支只认代码认过的值；专门化的提示词则是分类换来的红利[^S1]
- 扇出的并发要有上界，汇合要传引用不传载荷——产出落盘，只把轻量的引用交给下游[^S2]，评审节点自己从文件读回来。同步扇出在这个规模不疼，规模大了它就是瓶颈[^S2]，而改成异步要付出结果协调、状态一致性、跨子代理错误传播这三项代价[^S2]
- 评审回路是查-修-再查，直到通过或不再有进展[^S5]，外加一道最大轮数兜底[^S1]。确定性 gate 排在裁判前面；「连续两轮报告相同」这个判据比最大轮数更早止损，而且它给出的结论更有信息量：不是「试了三次不行」，是「它听不懂这条意见」
- 逐步留痕带来可恢复：每个节点跑完落一次状态，正是一次运行能在同一会话内被接着跑的前提[^S5]（跨进程、跨机器接着跑，是本课把状态落盘后自己加的一层推广）；配上先写 `.tmp` 再 `rename` 的原子替换，任何时刻被杀，磁盘上都是一份能读回来的完整状态
- 这张图管的是一个进程、一批工单、步骤事先定死的活。步数没法预测的开放式问题该交回自主循环[^S1]；每加一层复杂度，都得过「可测量的改进」这道关[^S1]

十二门课到这里走完了。

回头看，你手里现在有的东西是一件一件攒起来的：本系列第一门课你写下第一个 prompt，学会把要求说清楚；然后是工具调用、工作流、技能、多 Agent 协作，一路到第 7 门课——那门课让你自己写了一个循环，`while (response.stop_reason === "tool_use")`，从那天起 Agent 对你不再是一个黑盒，而是一段你读得懂的代码。第 8 门课教你管住它的上下文，别让循环转着转着把窗口撑爆。第 9 门课教你让它经得起中断，被杀掉也能从上次停下的地方接着干。第 10 门课教你验它的产出，把「看起来做完了」和「做完了」分开。第 11 门课教你看清它的过程，出了事有日志、有 trace 可查。这门课教你把多个循环编成一张自己持有计划的图。

这六件东西是同一件事的六个侧面：**你在自己写的代码里，控制着一个非确定性的东西。**循环是你写的，上下文是你管的，检查点是你存的，验收标准是你定的，日志是你打的，计划是你排的。模型很强，但它在你这套控制代码里干活。

最后一步落在具体动作上：把 `orchestrate.mjs` 里的 `makeStubClient(queue)` 换成 `new Anthropic()`，删掉 `SCRIPTS` 那张表，把本系列第 7 门课那三道没搬的阀装回去，然后把你自己工作里真正堆着的那批任务——真实的工单、真实的日志、真实的待办——倒进 `inbox/`，跑第一遍。它多半会有几条落进 `needs_human`，那正是这张图该有的样子。
