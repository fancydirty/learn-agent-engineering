# 第 2 课：核心循环：从一次往返到持续运转

> 学习目标：
> - 复述由 stop_reason 驱动的多轮循环四步，把一次工具调用往返接成一个能持续运转的 while 循环
> - 用 stop_reason 的取值（tool_use / end_turn）判断循环该继续还是该停，说清它为什么就是循环的 while 条件
> - 指出这个骨架循环缺了哪些边界，说明为什么每转一圈历史都在变长、不能只靠模型说「我说完了」来收尾
>
> 前置要求：读过第 1 课，知道 harness 是模型之外那层控制代码；会读一次工具调用往返的 tool_use / tool_result | 上一课 [第 1 课 <<](./01-what-is-a-harness.md) | 下一课 [第 3 课 >>](./03-stop-conditions.md)

## 一次往返，不够用了

上一课你已经拆开过一次完整的工具调用往返：模型返回 `stop_reason: "tool_use"` 和一个 `tool_use` 块，你的宿主代码读出 `name` 和 `input`、真去执行、把输出打包成 `tool_result` 发回去，模型这才说出最终答案。三段 JSON，一趟就完事。

可真实任务很少这么客气。换个场景：你在写一个值班机器人，用户说「帮我把 api 服务重启一下，重启完看看日志里还有没有报错，有的话贴给我」。这一句话里其实压着两件事，而且第二件依赖第一件的结果——不重启完，看日志没意义。模型没法在第一轮就把两件事都办了，它只能：

1. 第一轮返回 `tool_use`，调用 `restart_service`。你执行，把「重启成功」传回去。
2. 第二轮又返回 `tool_use`，这次调用 `read_logs`。你执行，把日志内容传回去。
3. 第三轮才返回 `stop_reason: "end_turn"`，附上一句「重启完成，日志里有两条 timeout 报错，贴在下面」。

同一句用户请求，模型来回跑了三趟。它每一步能看到什么、下一步做什么，取决于上一步的 `tool_result` 里回来了什么——这正是 Anthropic 对 Agent 的定义：一个在循环里、靠环境反馈用工具的 LLM[^S1]。上一课那种一趟结束的往返，只是这个循环恰好只转了一圈的特例。这一课要做的，就是把「一次往返」接成「持续往返」，看清中间那个循环长什么样、由什么驱动、又该在哪里踩刹车。

## 循环的四步

把单次往返接成循环，其实不用发明任何新东西，只是把你已经会的那套动作重复做。Claude API 文档把这个多轮过程写成了一套固定步骤[^S2]：

1. 你带着 `messages` 和 `tools` 清单发一次请求（`tools` 每一轮都要重新带上）。
2. 模型回一个响应。如果它还需要用工具，`stop_reason` 就是 `"tool_use"`，`content` 里带一个或多个 `tool_use` 块。
3. 你执行每一个 `tool_use` 块，把各自的输出做成 `tool_result` 块。这一步的关键是「每一个」——一轮响应里有几个 `tool_use`，下一条 `user` 消息里就得有几个对应的 `tool_result`，靠 `tool_use_id` 一一认领，全部打包进紧随其后的同一条 `user` 消息[^S6]。
4. 你把模型那一轮的完整响应（`assistant` 角色）和你拼好的 `tool_result`（`user` 角色）都追加进 `messages`，再发一次请求。

然后是最关键的一句：只要新响应的 `stop_reason` 还是 `"tool_use"`，就从第二步再来一遍[^S2]。这个「只要……就重复」，就是把单次往返撑成循环的那根轴。上一课的例子只走到第一次 `end_turn` 就停了，是因为那个任务一趟就够；值班机器人那个例子会把第二步到第四步跑三遍，直到第三轮拿到 `end_turn`。

值得记住的是 `tool_use` 块和 `tool_result` 块各自的字段没变——`tool_use` 带 `id` / `name` / `input`，`tool_result` 带 `tool_use_id` / `content`、失败时还可以带 `is_error`[^S6]。循环没有改写这些字段的含义，它只是让这套字段被反复填写、反复回传。

## stop_reason 就是这个循环的 while 条件

上面那句「只要 `stop_reason` 还是 `tool_use` 就重复」，翻译成代码就是一个 while 循环的判断条件。而这一课你最该带走的一句话是：**判断循环继续还是停下，就看 `stop_reason` 这一个字段。**它有很多取值，但对循环控制来说，先分清两个就够了：

- `"tool_use"`：模型还想用工具，它把请求交给你，等你执行完回传后再继续。循环转到下一圈。
- `"end_turn"`：模型不再要工具了，它认为话说完了。循环自然结束，你把最终文字交给用户。

一份讲 harness 工程的开源路线图把这层控制说得很直白：驱动 harness 的核心，就是那个「模型→工具→模型」的 while 循环[^S5]。而这个 while 的条件表达式，装的正是 `stop_reason`。同样一个模型、同样一套工具，它转几圈、什么时候停，全由宿主这边怎么读这个字段、怎么写这个条件决定——这也是为什么第 1 课说「同样的模型、不同的 harness，结果可能天差地别」[^S5]。

有一点要提前说清楚，免得把这个信号读反：`stop_reason: "tool_use"` 表示的是模型**想要**用工具，不是工具**已经**被用过了。模型自己从不执行任何东西，它只发出一段结构化的请求，真正跑工具的是你的宿主代码（或 Anthropic 的服务器），结果之后才回流进对话[^S2]。所以循环里 `tool_use` 出现的那一刻，动作还没发生；动作发生在你读出 `name`、`input`、去执行的那几行代码里。把「收到 tool_use」当成「工具跑完了」，是新手在从单次往返走向循环时最容易栽的一跤——它会让你误判循环现在到底转到了哪一步。

```agentmentor-check
{
  "id": "harness-zh-02-tooluse-not-executed",
  "label": "判断收到 stop_reason tool_use 之后工具到底跑了没有",
  "prompt": "你的循环发出第三轮请求，模型返回 stop_reason: \"tool_use\"，content 里有一个 tool_use 块，name 是 run_migration（在生产库上跑数据库迁移）。就在你的代码读到这个响应的这一刻，迁移脚本已经在数据库上执行了吗？",
  "whyHere": "这一节刚把 stop_reason 定成循环的 while 条件，并点明 tool_use 是「想用工具」而非「用过了」；此处要拦住「模型返回 tool_use 就等于这一轮工具已经执行完」的误解，因为它会让人误判循环当前转到了哪一步。",
  "mode": "single",
  "choices": [
    {
      "id": "a",
      "text": "已经执行了，模型既然返回了 tool_use 块，说明这一轮的迁移已经在库上跑完，循环该收尾了",
      "correct": false,
      "feedback": "这是把信号当成了执行回执。tool_use 块只是模型交出的一张请求单，意思是「我想调 run_migration」，模型本身没有连数据库、跑脚本的能力。迁移要等你的宿主代码读出这个块、真正去执行之后才发生，此刻库上什么都还没动。"
    },
    {
      "id": "b",
      "text": "还没有，这只是模型请求调用工具；真正跑迁移要等宿主代码执行、把 tool_result 回传后，下一轮才继续",
      "correct": true,
      "feedback": "对，tool_use 是「循环继续」的信号，不是「工具已跑完」的回执。执行权始终在宿主这一侧：你读出 name 和 input、调用真正的迁移逻辑、把输出打包成 tool_result 发回去，循环才转到下一圈，模型也才看得到迁移的真实结果。"
    }
  ]
}
```

## 写成代码，就是这么几行

把这四步和 `stop_reason` 这个 while 条件落成 JavaScript，骨架短得出乎意料：

```javascript
// tools 是每轮都要带上的工具定义清单
const messages = [{ role: "user", content: userInput }];

let response = await callModel({ tools, messages });

while (response.stop_reason === "tool_use") {
  // 1. 把模型这一轮的完整响应追加进历史
  messages.push({ role: "assistant", content: response.content });

  // 2. 执行这一轮所有 tool_use 块，各自打包成 tool_result
  const toolUseBlocks = response.content.filter((b) => b.type === "tool_use");
  const toolResults = await Promise.all(
    toolUseBlocks.map(async (block) => ({
      type: "tool_result",
      tool_use_id: block.id,
      content: await executeTool(block.name, block.input),
    }))
  );

  // 3. 把这一批 tool_result 作为一条 user 消息追加进历史
  messages.push({ role: "user", content: toolResults });

  // 4. 带着变长后的历史再发一次请求，循环回到 while 判断
  response = await callModel({ tools, messages });
}

// 循环出来了，说明 stop_reason 不再是 tool_use（比如 end_turn），
// response 里就是最终的文字回答
```

对着代码把四步再走一遍：`while` 那行就是「只要还是 `tool_use` 就重复」；循环体里先把 `assistant` 响应和 `user` 的 `tool_result` 双双 `push` 进 `messages`，再重新给 `response` 赋值。最后这次赋值是循环能停下来的前提——漏了它，`response.stop_reason` 永远是老值，while 就再也出不来了（这类死循环是第 4 课的主角）。

这段代码能跑，但它只是骨架，够简单到能看清循环本身，还远不能放心丢给生产。它默认模型总会规规矩矩地在某一轮回 `end_turn`，默认每个工具都能顺利执行，默认历史怎么长都无所谓——这三个「默认」，恰好是后面几课要逐个拆掉的。

## 每多转一圈，历史就长一截

回头盯着那行 `messages.push`：循环每转一圈，都会往 `messages` 里塞两条消息——模型的 `assistant` 响应、你回传的 `tool_result`。而下一次 `callModel` 又得把整个 `messages` 原样发出去。也就是说，这个循环转得越久，每一轮请求携带的历史就越长，而且只增不减。

这不是实现上的疏忽，是循环这种结构的固有性质：一个在循环里运转的 Agent，会不断产出更多可能与下一轮推理相关的数据[^S3]。值班机器人转三圈，攒下的还只是重启结果加一段日志；可要是任务需要几十轮，历史就会滚成一大坨。

这里藏着一个要留到「记忆与状态」那门课才展开、但现在必须先埋下的隐患：模型有一份「注意力预算」，每塞进一个新 token 都会消耗掉一点[^S3]。历史越长，token 越多，模型准确回忆起上下文里某条信息的能力反而越差[^S3]——注意这是一条随长度平缓下滑的性能曲线，不是过了某个长度就突然崩掉的悬崖[^S3]，别把它理解成「超了就废」。但方向是明确的：上下文得当成一种有限、且边际收益递减的资源来对待[^S3]。骨架循环那句无脑的 `messages.push` 完全没管这件事，它假设历史可以无限长——这个假设，「记忆与状态」那门课会来还账。

## 光有循环还不够，边界得另外加

现在你手里有一个能转起来的循环了。但「能转」和「转得住」是两码事。骨架循环把停不停的决定权完全交给了模型：它哪轮回 `end_turn`，循环哪轮停。可 Agent 是自己动态决定接下来做什么、用什么工具的系统[^S1]——这份自主正是它有用的地方，也正是风险所在：自主意味着更高的成本，以及误差沿着一圈圈循环累积放大的可能[^S1]。模型有可能连续跑很多轮，你得对它的决策有一定程度的信任才敢让它跑[^S1]。

问题在于，「信任」不等于「放任」。如果模型因为某个环节卡住、或者被工具返回的内容带偏，一直不肯回 `end_turn`，这个只认 `stop_reason` 的循环就会一直陪着它空转下去。所以在模型自己的收尾信号之外，通常还要另外加上显式的停止条件——比如给循环设一个最大轮次上限，来把控制权攥在自己手里[^S1]。骨架里那个光秃秃的 `while (response.stop_reason === "tool_use")` 没有这道保险：它信任模型，却没给自己留后路。

到这里，这一课的两个伏笔就都埋下了：**这个循环需要边界**（不能只靠模型说 `end_turn`，得有显式的停止条件——第 3 课），**这个循环产出的历史需要治理**（token 是有限资源，不能无脑往里塞——留给记忆与状态那门课）。而循环真正失控时会长成什么样、又该怎么兜住，是第 4 课的正题。这一课你只要先把「循环本身怎么转起来、由 `stop_reason` 驱动」这根轴立住就够了。

<!-- exercises -->
## 💻 练习

### Level 1：数一数这个循环转了几圈

一个日程助理 Agent 配了 `search_calendar`（查日历）和 `create_event`（建日程）两个工具。用户说「看看我周四下午有没有空，有的话约个 30 分钟的评审会」。宿主用本课的骨架循环驱动它，实际发生的 `stop_reason` 序列如下：

- 第 1 次 `callModel` 返回 → `stop_reason: "tool_use"`（一个 `tool_use` 块，调 `search_calendar`）
- 第 2 次 `callModel` 返回 → `stop_reason: "tool_use"`（一个 `tool_use` 块，调 `create_event`）
- 第 3 次 `callModel` 返回 → `stop_reason: "end_turn"`（文字：「已约周四 14:00 的评审会」）

请回答：(1) `callModel` 一共被调用了几次？(2) `executeTool` 一共被调用了几次？(3) while 循环体一共执行了几遍？(4) 循环是在读到哪个 `stop_reason` 时退出的？

<!-- rubric -->
- `callModel` 调用次数正确（3 次），并能说清「循环外 1 次 + 循环体内每圈 1 次」的来源
- `executeTool` 调用次数正确（2 次），对应两个 `tool_use` 块
- while 循环体执行遍数正确（2 遍），退出发生在读到 `end_turn` 时
- 能说明第 3 次 `callModel` 是在循环体内发出的，但它的返回让 while 条件不成立，于是没进第 3 遍循环体

<!-- answer -->
1. `callModel` 调用了 **3 次**：循环外 1 次（发出首轮请求），加上循环体末尾那行 `response = await callModel(...)` 执行了 2 次（前两圈各一次）。第 3 次返回的是 `end_turn`。
2. `executeTool` 调用了 **2 次**：第 1、2 轮各有一个 `tool_use` 块，各执行一次；`end_turn` 那轮没有 `tool_use` 块，不执行工具。
3. while 循环体执行了 **2 遍**：第 1 次响应是 `tool_use`，进第一遍；第 2 次响应还是 `tool_use`，进第二遍；第 3 次响应是 `end_turn`，while 条件不成立，不再进入。
4. 循环在读到 **`end_turn`** 时退出——具体是第二遍循环体末尾那次 `callModel` 返回了 `end_turn`，回到 while 判断时条件为假，跳出循环。

<!-- hint -->
把骨架代码里的 `callModel` 标个记号：一次在 while 之前，一次在循环体最后一行。循环体每执行一遍，后者就被调一次。

<!-- hint -->
`stop_reason` 是 `end_turn` 的那一轮，模型的响应里没有 `tool_use` 块，所以 `executeTool` 和进不进循环体，是两个要分开数的问题。

### Level 2：这个循环为什么停不下来

同事想把单次往返改成多轮循环，写了下面这段代码。它在只需要一次工具调用的任务上「看起来能用」，可一旦任务需要模型连续调用两次工具，进程就卡死、资源被耗尽，日志里同一个工具被反复调用。找出根本原因，并改对。

```javascript
async function runAgent(userInput, tools) {
  const messages = [{ role: "user", content: userInput }];
  let response = await callModel({ tools, messages });

  while (response.stop_reason === "tool_use") {
    const block = response.content.find((b) => b.type === "tool_use");
    const result = await executeTool(block.name, block.input);

    messages.push({ role: "assistant", content: response.content });
    messages.push({
      role: "user",
      content: [{ type: "tool_result", tool_use_id: block.id, content: result }],
    });
    // 循环体到此结束
  }

  return response;
}
```

<!-- rubric -->
- 准确指出根本原因：循环体里没有重新给 `response` 赋值，`response.stop_reason` 永远停留在第一次的 `tool_use`，while 条件恒为真
- 说明这为什么表现为「单次往返看着没事、多轮任务卡死」：只要响应真进了循环体，就是死循环、再也出不来；之所以有时「看着能用」，是因为那次响应根本不是 `tool_use`、压根没进循环——不是「第一次 tool_use 之后正常停了」
- 给出的修正在循环体末尾补上 `response = await callModel({ tools, messages })`

<!-- answer -->
根本原因：**循环体末尾漏了给 `response` 重新赋值。**`response` 在循环外只赋值过一次，循环体里只往 `messages` 里追加消息，从没重新发请求、也没更新 `response`。于是 `response.stop_reason` 永远是第一次那个 `"tool_use"`，while 条件恒为真，循环再也出不来——`messages` 被无限追加、同一个 `tool_use` 块被反复执行，进程就卡死了。

至于「单次往返看着没事」：那只是错觉。哪怕任务只需一次工具调用，这段代码进入循环体后同样不会退出；之所以有人觉得「能用」，往往是把它套在别处、或响应恰好不是 `tool_use` 而根本没进循环。只要真进了循环体，就是死循环。

修正——在循环体最后补上重新请求这一行：

```javascript
  while (response.stop_reason === "tool_use") {
    const block = response.content.find((b) => b.type === "tool_use");
    const result = await executeTool(block.name, block.input);

    messages.push({ role: "assistant", content: response.content });
    messages.push({
      role: "user",
      content: [{ type: "tool_result", tool_use_id: block.id, content: result }],
    });

    response = await callModel({ tools, messages }); // 补上这一行，循环才有机会读到新的 stop_reason
  }
```

<!-- hint -->
while 的条件读的是 `response.stop_reason`。在整个循环体里搜一下 `response` 这个变量，看它有没有在某一遍里被重新赋值过。

<!-- hint -->
循环要能停，靠的是「每转一圈都拿到一个新的 `stop_reason` 来重新判断」。如果这一圈结束时手里的 `response` 还是上一圈那个，while 条件就永远算出同一个结果。

<!-- /exercises -->

## 小结

- 把一次工具调用往返接成循环，不用新机制，只是重复四步：发请求 → 读 `stop_reason` 与 `tool_use` 块 → 执行工具并打包 `tool_result` → 追加历史后再发一次；只要 `stop_reason` 还是 `tool_use` 就重复[^S2]
- `stop_reason` 就是这个循环的 while 条件：`tool_use` 表示模型还要用工具、循环继续，`end_turn` 表示模型收尾、循环自然结束——「模型→工具→模型」这根轴由它驱动[^S5]
- `tool_use` 是「模型想用工具」的信号，不是「工具已跑完」的回执；模型自己从不执行，动作发生在宿主读出 `name`、`input` 去执行的那一步[^S2]
- 循环每转一圈，历史都在只增不减地变长，Agent 会不断产出更多可能相关的数据[^S3]；而注意力预算有限、上下文越长召回越差，token 得当成有限且边际递减的资源[^S3]
- 光有循环不够：自主性带来更高成本和误差累积，模型可能连续跑很多轮[^S1]，所以除了模型自己的 `end_turn`，通常还要加显式停止条件（如最大轮次）把控制权攥在自己手里[^S1]——具体怎么设，是第 3 课的正题

[>> 第 3 课：停止条件：Agent 什么时候该收手](./03-stop-conditions.md)
