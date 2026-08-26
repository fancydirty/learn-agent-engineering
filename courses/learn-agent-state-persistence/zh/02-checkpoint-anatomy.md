# 第 2 课：检查点：把执行现场落盘

> 学习目标：
> - 说出 checkpoint.json 该装哪六个字段，并对每个字段说清楚「恢复时缺了它会撞上什么问题」
> - 区分一轮循环里的两个存档点（模型点名之后、工具结果落账之后），说清楚只存其中一个会埋下什么隐患
> - 写出一个不会把检查点文件本身写坏的 saveCheckpoint 函数，用「先写临时文件、再原子改名」而不是直接覆盖写
>
> 前置要求：读过第 1 课，能区分「记忆」与「执行状态」；熟悉本系列第 7 门课里 messages 数组和 stop_reason 驱动的循环骨架 | 上一课 [第 1 课 <<](./01-memory-vs-state.md) | 下一课 [第 3 课 >>](./03-resume-from-checkpoint.md)

## 执行现场默认在内存里

第 1 课把记忆和执行状态分开：记忆是喂给模型看的东西，执行状态是宿主自己攥着的运行现场——`messages` 数组、轮次计数、还没落账的工具调用。这份现场默认只活在进程的内存里，进程一死，它跟着一起消失，哪怕磁盘上所有其他文件都完好无损，任务也只能从头再来。

把这份现场写到磁盘上、变成进程重启后还能读到的东西，这个动作就叫**检查点**（checkpoint）。工程实践里能撑住长任务可靠性的，往往不是让模型自己想办法扛住一切，而是给它配上「重试逻辑 + 定期检查点」这类确定性护栏，跟模型本身的适应力搭配着用[^S1]。这一课就讲检查点这半：一份检查点里该装什么、循环跑到哪一步该落盘、以及落盘这个动作本身要写对——不然存下来的东西可能比没存还糟。

## 存什么：checkpoint.json 里的六个字段

一份检查点不是「把内存里所有东西倒出来」，而是「把恢复循环需要的东西，一个不多一个不少地记下来」。本课程后面几课都基于同一份协议：

```javascript
const checkpoint = {
  version: 1,
  task: "把上季度的支持工单按问题类型分类汇总成一张表",
  turns: 3,
  tokensUsed: 14208,
  messages: [/* 完整对话历史 */],
  pendingToolUse: null, // 或 { id, name, input }
};
```

- **version**：协议版本号。以后这份格式会变（比如给 `messages` 加压缩、给 `pendingToolUse` 换形状），`version` 让恢复逻辑先问一句「这份检查点我认识吗」——版本不对就该拒绝装载、报错走人，而不是硬着头皮往下解析。
- **task**：原始用户任务的文字。进程重启后，宿主代码本身不记得自己在干什么，它能读到的只有磁盘上的这份文件。没有 `task`，宿主连「这个检查点对应哪个任务」都说不清，更别提向用户报告恢复进度。
- **turns**：已经跑过的轮次计数。用来判断要不要触发本系列第 7 门课里讲的停止条件（比如最大轮次上限），也是恢复后继续计数、而不是从零重来的起点。
- **tokensUsed**：累计消耗的 token 数。本系列第 8 门课的压缩阈值判断靠这个数字触发；检查点里不存它，恢复后要么假装从零重新计数（压缩时机整个错位），要么得把 `messages` 里每条消息重新估算一遍用量（多数场景根本拿不到历史 usage）。
- **messages**：整份对话现场，模型见过的每一条 user / assistant / tool_result 消息都在这里。这是检查点里最大的一块，但决不能省——模型本身没有记忆，它对「之前发生过什么」的全部认知，就是你在下一次请求里塞给它的这个数组。少了它，恢复出来的不是「接着跑」，是一个从零开始、却背着一堆已经产生的副作用的新任务。
- **pendingToolUse**：`null`，或者形如 `{ id, name, input }` 的一条记录——模型已经点名要用的工具，结果还没落账。这个字段的用法本课先按下不表，第 3 课恢复循环时要靠它做对账；这里只需要知道，它是检查点里专门用来标记「半吊子状态」的地方。为了让这个字段的形状保持简单，本课的例子都假设每轮只有一个 `tool_use` 块；一轮里有多个并发工具调用时，把它换成数组，道理一样。

## 什么时候存：一轮里有两个存档点

把上一节的字段套进循环，落盘的时机不是「每轮结束存一次」这么简单，而是有两个存档点：

```javascript
while (response.stop_reason === "tool_use") {
  state.messages.push({ role: "assistant", content: response.content });

  const block = response.content.find((b) => b.type === "tool_use");

  // 存档点 A：模型已经点名要用的工具，还没执行
  state.pendingToolUse = { id: block.id, name: block.name, input: block.input };
  saveCheckpoint(state);

  const result = await executeTool(block.name, block.input);

  state.messages.push({
    role: "user",
    content: [{ type: "tool_result", tool_use_id: block.id, content: result }],
  });
  state.turns += 1;
  state.pendingToolUse = null;

  // 存档点 B：这一轮的工具结果已经全部落进 messages
  saveCheckpoint(state);

  response = await callModel({ tools, messages: state.messages });
  state.tokensUsed += response.usage?.output_tokens ?? 0;
}
```

**A 点**在拿到模型响应之后、执行工具之前：这时候把响应里的 `tool_use` 块记进 `pendingToolUse`，再落盘。**B 点**在工具结果全部追加进 `messages` 之后：这时候把 `pendingToolUse` 置回 `null`，再落盘一次。

只存 B 点行不行？隐患就出在 A 点和 B 点之间的这段区间——模型已经点名要用工具，工具正在跑、或者跑完了但结果还没来得及追加进 `messages`、还没来得及落盘。这时候进程如果崩了，磁盘上最后一份检查点还是上一轮 B 点存的那份，对这一轮「模型点过名」这件事完全不知情：不是「细节丢了一点」，是这次工具调用在磁盘上根本没有留下任何痕迹。第 3 课要在恢复时对账、判断这个工具当时到底有没有真的跑完、要不要重跑，靠的正是 A 点存下的 `pendingToolUse`；本课先把这个坑埋下，第 6 课的练习会专门让你诊断一份只存 B 点的检查点在恢复时会出什么问题。

## 怎么存：不能直接覆盖写

最直接的写法是把 `state` 对象 `JSON.stringify` 一下，`fs.writeFileSync` 直接盖掉旧的 `checkpoint.json`。这样写在进程正常退出时没问题，但「正常退出」恰恰不是检查点要防的场景——检查点就是为进程随时可能被杀掉、断电、容器被驱逐这类意外准备的。写文件不是一个原子操作，如果进程在写入过程中被打断，磁盘上留下的 `checkpoint.json` 可能只写进去了一半：它既不是旧版本、也不是新版本，是一段截断的 JSON。下次恢复时 `JSON.parse` 直接抛异常，而这份文件是这个任务唯一的现场副本，没有旧版本可以回退。

做法是「先写临时文件、再原子改名」：把完整内容写进 `checkpoint.json.tmp`，这一步就算写到一半崩溃，受影响的也只是这个临时文件，正式的 `checkpoint.json` 还是崩溃前那份完整的旧版本，恢复时能正常读到；等 `.tmp` 文件写完整了，再用 `fs.renameSync` 把它改名成正式文件名——在同一个文件系统上，`rename` 是一步原子替换，操作系统要么把目录项完整地指向新文件，要么保持指向旧文件，不存在「改了一半」的中间状态。

```javascript
import fs from "node:fs";
import path from "node:path";

function saveCheckpoint(state, dir = "./checkpoints") {
  fs.mkdirSync(dir, { recursive: true });

  const finalPath = path.join(dir, "checkpoint.json");
  const tmpPath = `${finalPath}.tmp`;

  fs.writeFileSync(tmpPath, JSON.stringify(state, null, 2));
  fs.renameSync(tmpPath, finalPath); // 同一文件系统上的 rename 是原子替换
}
```

```agentmentor-check
{
  "id": "sp-zh-02-direct-overwrite-risk",
  "label": "判断直接覆盖写检查点文件会有什么问题",
  "prompt": "你打算把 saveCheckpoint 写成「把 state 对象 JSON.stringify 之后，直接用 fs.writeFileSync 覆盖写同一个 checkpoint.json」。这样写会有什么问题？",
  "whyHere": "刚讲完「先写 .tmp 再原子 rename」这套做法，这里要检查学习者是不是真的理解了不能直接覆盖写的原因，而不只是记住了「要用 tmp+rename」这个结论。",
  "mode": "single",
  "choices": [
    {
      "id": "a",
      "text": "没问题——checkpoint.json 本来就该只保留最新一份，直接覆盖写就是把旧的换成新的，没有多余的步骤",
      "correct": false,
      "feedback": "该不该只保留最新一份，和「怎么把新内容写进去」是两件事。检查点确实只需要留最新一份，但「直接覆盖写」这个动作本身不是原子的：写文件的过程可能被进程崩溃打断，打断的那一刻，磁盘上留下的既不是完整的旧版本，也不是完整的新版本，是一段写了一半的内容。"
    },
    {
      "id": "b",
      "text": "有问题：如果进程在写入过程中被杀掉，checkpoint.json 可能只写进去一半，变成一段无法被 JSON.parse 解析的截断内容，而这是任务唯一的现场副本，没有别的地方能恢复",
      "correct": true,
      "feedback": "对。写文件不是一步到位的原子操作，进程随时可能被杀掉，写到一半被打断就会把唯一的现场副本变成半截 JSON。先写临时文件、写完整了再用 rename 原子替换成正式文件名，才能保证磁盘上任何时刻看到的 checkpoint.json 要么是完整的旧版本，要么是完整的新版本，不会是中间状态。"
    },
    {
      "id": "c",
      "text": "有问题，但问题在于反复覆盖写会让 checkpoint.json 的文件体积越滚越大，占用更多磁盘空间",
      "correct": false,
      "feedback": "覆盖写不会让文件变大——每次写入前旧内容本来就会被新内容替换掉，体积大致只取决于当前这份 state 有多少内容，不会随写入次数累积。真正的风险不是磁盘空间，是写入过程本身可能被进程崩溃打断，让磁盘上留下一份既不完整、也无法解析的文件。"
    }
  ]
}
```

## 产品对照：Claude Code 的检查点长什么样

本课教的这套协议是给无人值守的长任务用的，粒度是每轮循环两个存档点。作为对照，看一眼一个真实产品——Claude Code——把「检查点」这个词用在哪：它的检查点在每条用户消息之前自动捕获代码状态[^S2]，每一条用户提示都会新建一条检查点[^S2]，检查点跟着会话一起保存，即便退出后又恢复了会话，也还能继续 `/rewind`[^S2]。

它服务的场景和本课不一样：Claude Code 的检查点面向的是人机协作会话——用户随时可能喊停、试错、想回到某条消息之前重新来过，粒度天然按「用户说了一句话」切分。本课要造的是无人值守的长任务：没有人在旁边随时喊停，粒度按「循环转了一圈」切分，一圈里还要再细分出 A、B 两个存档点，因为「模型点名」和「工具结果落账」之间可能隔着一次崩溃。两者不是在解决同一个问题，摆在一起看，主要是想说清楚：「检查点」该切多细、多久存一次，答案要看它服务的是什么场景，并不只有一种。

## 检查点不是没有代价的

检查点不是免费的：按本课的协议，一轮循环要写两次磁盘。对一个三五轮就能跑完的短任务，这纯粹是开销——进程正常跑完，那些检查点文件从没被读起来过。要不要在自己的 harness 里加这套机制，值得用「加了它是不是真的让结果更好」这条尺子去衡量，而不是默认「有检查点总比没有强」[^S3]。任务越长、崩溃代价越高，这笔开销就越划算；一个几秒钟能跑完的任务，多半用不上。

## 💻 练习

<!-- exercises -->

### Level 1：补全一份残缺的检查点

有人把 `saveCheckpoint` 写成了这样：

```javascript
function saveCheckpoint(state) {
  fs.writeFileSync("checkpoint.json", JSON.stringify({ messages: state.messages }));
}
```

按本课定的协议，这份检查点还少哪些字段？对每一个缺的字段，说清楚：如果拿着这份残缺的检查点去恢复，会具体在哪个环节出问题？

<!-- rubric -->
- 列全缺的五个字段：`version`、`task`、`turns`、`tokensUsed`、`pendingToolUse`
- 对 `version`：说明恢复逻辑没法判断这份文件的协议版本，没法在格式变了之后决定要不要拒绝装载
- 对 `task`：说明宿主不知道这份现场对应的原始任务是什么，没法向用户报告「正在恢复的是哪个任务」
- 对 `turns`：说明恢复后轮次计数从零开始，跟真实跑过的轮次对不上，可能让原本该触发的最大轮次停止条件失效或者提前触发
- 对 `tokensUsed`：说明压缩阈值判断拿不到准确的累计值，恢复后要么误判还没到压缩阈值，要么得重新估算用量（而重新估算在多数场景下根本拿不到历史 usage）
- 对 `pendingToolUse`：说明如果崩溃恰好发生在「模型点了名、工具还没执行完」的区间，恢复时完全不知道有一次工具调用悬空着，没法做第 3 课要讲的对账

<!-- answer -->
这份检查点只留了 `messages`，缺了另外五个字段：

1. **`version`**：没有它，恢复逻辑没法确认自己认不认识这份文件的格式。以后协议一旦变化（比如给某个字段换形状），恢复代码没有依据去判断「这份检查点是不是我能处理的版本」，只能硬着头皮解析，出错也说不清是哪里对不上。
2. **`task`**：没有它，宿主重启后读到的只有一堆 `messages`，却说不出这些消息串起来是要完成什么任务。既没法在恢复时向用户报告进度，也没法在多任务场景下确认自己接的是哪一个。
3. **`turns`**：没有它，恢复后只能从零开始计数。如果原本设了「跑够 N 轮就停」这类停止条件，恢复后的计数和实际已经发生的轮次对不上，这个停止条件要么提前触发、要么形同虚设。
4. **`tokensUsed`**：没有它，压缩阈值判断没有累计值可用。恢复后要么假装从零开始计数（这一轮该不该压缩，判断整个错位），要么试图把 `messages` 里的历史消息重新估算一遍用量——而在大多数场景下，历史 `usage` 数据根本拿不回来。
5. **`pendingToolUse`**：没有它，如果上次崩溃恰好发生在「模型已经点名要用某个工具、但工具执行还没完成或结果还没落账」的区间，这份检查点对此完全没有记录。恢复时没法判断当时是不是真有一次工具调用悬在半空，也没法做第 3 课要讲的「这次调用到底要不要重跑」的对账，只能假装什么都没发生过。

<!-- hint -->
回到「存什么」那一节，把 checkpoint 对象里的六个字段过一遍，看这份残缺版本里哪些没出现。

<!-- hint -->
不要只回答「缺了 X」，试着往前推一步：如果宿主代码现在真的照着这份文件去重建 `state`、重新进入循环，第一步会撞到什么问题？

### Level 2：两处隐患，改对

同事写了下面这段 `runAgent`，用来跑一个会连续调用两次工具的任务。平时看着能用，可一旦在跑的过程中进程被意外杀掉，恢复出来的现场要么打不开、要么对不上。找出两处会在崩溃时露馅的隐患，说明各自会导致什么后果，并改对——改完的代码要能跑通。

```javascript
import fs from "node:fs";

function saveCheckpoint(state) {
  fs.writeFileSync("checkpoint.json", JSON.stringify(state, null, 2));
}

async function runAgent(task, tools, callModel, executeTool) {
  const state = {
    version: 1,
    task,
    turns: 0,
    tokensUsed: 0,
    messages: [{ role: "user", content: task }],
    pendingToolUse: null,
  };

  let response = await callModel({ tools, messages: state.messages });

  while (response.stop_reason === "tool_use") {
    state.messages.push({ role: "assistant", content: response.content });

    const block = response.content.find((b) => b.type === "tool_use");
    const result = await executeTool(block.name, block.input);

    state.messages.push({
      role: "user",
      content: [{ type: "tool_result", tool_use_id: block.id, content: result }],
    });
    state.turns += 1;

    saveCheckpoint(state);
    response = await callModel({ tools, messages: state.messages });
  }

  return state;
}
```

<!-- rubric -->
- 指出第一处隐患：`saveCheckpoint` 直接 `fs.writeFileSync` 覆盖写同一个文件，写入过程被打断会留下一份解析不了的半截 JSON，且没有旧版本可退
- 指出第二处隐患：整段循环只在工具结果落账之后（B 点）存过一次盘，模型点名之后、工具执行完成之前（A 点）没有存档，这段区间崩溃会让这次工具调用在磁盘上无迹可寻
- 修正一：把 `saveCheckpoint` 改成「先写 `.tmp`、再 `fs.renameSync` 原子改名」
- 修正二：在读出 `block` 之后、执行 `executeTool` 之前补上一次 `pendingToolUse` 赋值加 `saveCheckpoint`（A 点），并在 B 点把 `pendingToolUse` 置回 `null`
- 给出的修正代码结构完整、能够运行（哪怕是配合示例里的 fake `callModel` / `executeTool`）

<!-- answer -->
两处隐患：

1. **覆盖写不安全。** `saveCheckpoint` 直接 `fs.writeFileSync` 盖掉旧的 `checkpoint.json`。进程随时可能被杀掉，写入过程被打断的话，磁盘上留下的既不是完整的旧版本也不是完整的新版本，是一段 `JSON.parse` 解析不了的截断内容——而这是唯一的现场副本，没有别的地方能恢复。
2. **只在 B 点存了盘，没有 A 点。** 循环里只在「工具结果追加进 `messages` 之后」调用了一次 `saveCheckpoint`。如果崩溃发生在「模型点名要用工具」和「结果落账」之间——也就是工具正在执行、或者跑完了但还没来得及追加进 `messages`——磁盘上最后一份检查点还是上一轮的旧状态，对这次工具调用完全不知情。

修正——原子写 + 补上 A 点：

```javascript
import fs from "node:fs";
import path from "node:path";

function saveCheckpoint(state, dir = "./checkpoints") {
  fs.mkdirSync(dir, { recursive: true });
  const finalPath = path.join(dir, "checkpoint.json");
  const tmpPath = `${finalPath}.tmp`;
  fs.writeFileSync(tmpPath, JSON.stringify(state, null, 2));
  fs.renameSync(tmpPath, finalPath); // 同一文件系统上的 rename 是原子替换
}

async function runAgent(task, tools, callModel, executeTool, dir) {
  const state = {
    version: 1,
    task,
    turns: 0,
    tokensUsed: 0,
    messages: [{ role: "user", content: task }],
    pendingToolUse: null,
  };

  let response = await callModel({ tools, messages: state.messages });

  while (response.stop_reason === "tool_use") {
    state.messages.push({ role: "assistant", content: response.content });

    const block = response.content.find((b) => b.type === "tool_use");

    // 存档点 A：模型已经点名要用的工具，还没执行
    state.pendingToolUse = { id: block.id, name: block.name, input: block.input };
    saveCheckpoint(state, dir);

    const result = await executeTool(block.name, block.input);

    state.messages.push({
      role: "user",
      content: [{ type: "tool_result", tool_use_id: block.id, content: result }],
    });
    state.turns += 1;
    state.pendingToolUse = null;

    // 存档点 B：这一轮的工具结果已经全部落进 messages
    saveCheckpoint(state, dir);

    response = await callModel({ tools, messages: state.messages });
  }

  return state;
}
```

用一对不接真实模型的 fake 函数跑一遍就能验证：一个会连续请求两次工具调用、第三次才返回 `end_turn` 的 `fakeCallModel`，配合一个只返回固定字符串的 `fakeExecuteTool`。跑完之后能看到磁盘上的 `checkpoint.json` 一共被写过 4 次（2 轮 × A、B 两个存档点），最终 `pendingToolUse` 是 `null`、`turns` 是 `2`，和内存里的最终状态完全一致。

<!-- hint -->
先只看 `saveCheckpoint` 这一个函数，跟本课「怎么存」那一节给出的版本对比，看少了哪一步。

<!-- hint -->
再看循环体里 `saveCheckpoint(state)` 出现了几次、分别在哪一行。数一数：模型点名（读出 `block`）和工具真正跑完（`await executeTool` 返回）之间，有没有落过盘。

<!-- /exercises -->

## 小结

- 执行状态默认只活在内存里，进程一死就没了；检查点要解决的问题，是让长任务不必每次崩溃都从头重跑，而是能从出错的地方接着来[^S1]
- checkpoint.json 要装六个字段：`version`、`task`、`turns`、`tokensUsed`、`messages`、`pendingToolUse`——`messages` 是最大的一块，没有它模型就没有任何「记得之前发生过什么」的依据；`pendingToolUse` 是留给第 3 课对账用的悬空标记
- 一轮循环有两个存档点：模型点名之后、工具执行之前是 A 点，工具结果全部落进 `messages` 之后是 B 点；只存 B 点会在「模型点了名、工具还没跑完」这段区间留下盲区
- 覆盖写检查点文件不安全，进程随时可能被杀掉，写到一半崩溃就会把唯一的现场副本变成一段解析不了的半截 JSON；先写 `.tmp` 再用 `fs.renameSync` 原子改名，才能保证磁盘上任何时刻看到的都是完整的一份
- Claude Code 的检查点是另一种粒度——每条用户消息前自动捕获一次[^S2]，服务的是人机协作会话；本课造的是给无人值守长任务用的检查点，切分的时机不一样，但都在回答同一个问题：出了事，回到哪
- 检查点不是免费的，每轮两次磁盘写入对短任务是纯开销，值不值得加，要看它是不是真的让结果更好，而不是默认多多益善[^S3]

[>> 第 3 课：断点恢复：从检查点拉起循环](./03-resume-from-checkpoint.md)
