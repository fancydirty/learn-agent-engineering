# 第 6 课：实战：给 harness 装上检查点与恢复

> 学习目标：
> - 把「A 点存悬空调用、B 点清空悬空调用」的检查点方案，实际焊进本系列第 7 门课写的 `runAgent` 循环里，而不只是停留在概念图上
> - 给 `runToolUses` 接上副作用台账：工具执行成功后立刻落盘一条记录，让恢复时能分辨「这次工具到底跑没跑」
> - 写出 `reconcile` 的三分流逻辑，并用一段可控的「模拟被杀死 + `--resume`」流程，亲眼验证恢复行为符合预期
>
> 前置要求：读完第 1-5 课，手边能跑起本系列第 7 门课的 harness 循环 | 上一课 [第 5 课 <<](./05-rewind-and-fork.md)

## 先看它跑起来的样子

前五课把检查点、恢复、幂等、回退分叉拆开讲清楚了。这一课把它们焊进一个真能跑的 harness：还是那个熟悉的循环——带 `messages` 请求模型、`stop_reason === "tool_use"` 就执行工具再发一次——只是这次每一轮都往磁盘上落两次检查点，外加一本记录工具执行结果的台账。任务是「把销售笔记整理成报告」，会依次调用 `read_notes`、`count_words`、`write_report` 三个工具。先看它正常跑到第三轮、被硬生生杀掉是什么样：

```text
$ CRASH_AFTER=after-effect-write:3 node agent.js

[turn 1][save A] pending=read_notes
[turn 1][save B]
[turn 2][save A] pending=count_words
[turn 2][save B]
[turn 3][save A] pending=write_report
[kill] 模拟在 after-effect-write:3 处被杀死
EXIT=137
```

第 1、2 轮都走完了完整的 `save A` → 执行 → `save B` 三步，一切正常。第 3 轮存了 `save A`（记下悬空调用是 `write_report`），工具也确实执行完了、结果也已经写进了台账——但下一步的 `save B` 还没来得及存，进程就被杀了。这正是这一课要死磕的窗口：`checkpoint.json` 里此刻还留着一个悬空的 `pendingToolUse`。带着这份现场，用 `--resume` 把它接起来：

```text
$ node agent.js --resume

[resume] 读到 turn=3 pending=write_report
[resume][reconcile] tool_use_id=toolu_03 name=write_report 台账命中，复用结果，不重跑
[turn 3][save B] 恢复后补齐本轮工具结果
[done] 报告已经写进 report.txt，任务完成。
```

恢复流程读到 `turn=3 pending=write_report`，去查台账——发现这次调用其实已经在被杀死之前跑完并落账了，于是直接复用那条记录，**不重新执行 `write_report`**，补上这一轮缺的 `save B`，再照常往下推进到模型收尾。整段任务没有从头重来，也没有把报告重复写一遍。

这两段终端输出不是手写的示例，是后面「验证桥段」一节里那段用固定响应队列驱动的 Node 脚本跑出来的真实输出，逐行照抄在这里。

## 逐块搭建

### 检查点的读写：`saveCheckpoint` / `loadCheckpoint`

检查点就是把 `{version, task, turns, tokensUsed, messages, pendingToolUse}` 这份现场序列化写盘。唯一讲究的地方是别把文件写坏：先写到一个临时文件，再用 `fs.renameSync` 原子替换——`rename` 在同一个文件系统内是不可分割的操作，不会出现「写到一半」的中间态：

```javascript
function saveCheckpoint(cp) {
  const tmp = CHECKPOINT_PATH + ".tmp";
  fs.writeFileSync(tmp, JSON.stringify(cp, null, 2));
  fs.renameSync(tmp, CHECKPOINT_PATH);
}
```

读的时候要扛住两件事：文件不存在（还没跑过，或者本来就该从头开始），以及文件解析失败。第二种情况格外要小心——`JSON.parse` 失败，通常意味着上一次写入本身就被中断了（`saveCheckpoint` 理论上是原子的，但如果连 `.tmp` 文件都没写完整就被杀，或者磁盘本身出了问题，`rename` 之前的半成品也可能被误读）。这时候绝不能悄悄把状态重置为空、假装什么都没发生——那才是真正会丢任务的地方。正确做法是把错误明明白白地抛出来，告诉用户这份检查点已经不可信，该删掉重新开始，而不是让程序自己猜着补全：

```javascript
function loadCheckpoint() {
  let raw;
  try {
    raw = fs.readFileSync(CHECKPOINT_PATH, "utf8");
  } catch {
    throw new Error(`找不到 ${CHECKPOINT_PATH}，无法 --resume`);
  }
  let cp;
  try {
    cp = JSON.parse(raw);
  } catch {
    throw new Error(
      `${CHECKPOINT_PATH} 解析失败，文件可能在写一半时被中断。请删除这个文件后用不带 --resume 的方式重新开始，不要继续用它——半截的检查点不能猜着补全。`,
    );
  }
  if (cp.version !== 1) {
    throw new Error(`${CHECKPOINT_PATH} 的 version=${cp.version}，本程序只认 version=1，拒绝加载。`);
  }
  return cp;
}
```

`version` 字段也顺手校验一下：以后检查点结构改了，旧文件不该被当成新格式硬解出来，宁可拒绝加载也不要读出一份半对半错的状态。这两个函数都用真实的截断 JSON 测过：喂一段写了一半的 `{"version":1,"turns":3,"pendingT` 进去，`loadCheckpoint` 准确抛出上面那条「请删除重新开始」的错误，不会返回任何看似合理的默认值。

### A 点与 B 点：接进 `runAgent` 循环

本系列第 7 门课写的循环骨架没变——`while (response.stop_reason === "tool_use")`，`push assistant` → 执行工具 → `push tool_result` → 重新请求模型。这一课往循环体里插两个检查点，插入的位置就是这一课的核心：

```javascript
while (response.stop_reason === "tool_use") {
  if (turns >= MAX_TURNS) return `已达最大轮次 ${MAX_TURNS}，主动收手`;
  turns++;

  const toolUseBlock = response.content.find((b) => b.type === "tool_use");
  // —— A 点：拿到模型响应后，记下这一轮悬空的工具调用 ——
  saveCheckpoint({
    version: 1, task, turns, tokensUsed, messages,
    pendingToolUse: { id: toolUseBlock.id, name: toolUseBlock.name, input: toolUseBlock.input },
  });

  messages.push({ role: "assistant", content: response.content });
  const toolResults = await runToolUses(response.content);
  messages.push({ role: "user", content: toolResults });

  // —— B 点：工具结果已落进 messages（台账也已经落盘），悬空调用清零 ——
  saveCheckpoint({ version: 1, task, turns, tokensUsed, messages, pendingToolUse: null });

  response = await client.messages.create({ tools, messages });
  tokensUsed += response.usage.input_tokens + response.usage.output_tokens;
}
```

A 点插在拿到 `response` 之后、`messages.push({ role: "assistant", ... })` 之前——这是模型「点了名但还没真正执行」的那一刻，`pendingToolUse` 就是把这次点名原样记下来。B 点插在 `runToolUses` 执行完、`tool_result` 也已经推进 `messages` 之后——这时候这一轮彻底翻篇，`pendingToolUse` 清成 `null`。两次落盘之间夹着的，正是工具真正执行的那一段代码；如果进程恰好死在这段代码执行期间或刚执行完，磁盘上留下的就是「A 点存过、B 点没存过」的现场——`pendingToolUse` 非空，这正是恢复逻辑要处理的信号。

为了让这套单一悬空调用（`pendingToolUse` 是一个对象而不是数组）的协议站得住，这一课把任务设计成每轮模型只点一个工具的名——这是刻意简化，「分寸」一节会说清楚它的边界。

### 副作用台账：接进 `runToolUses`

台账要解决的问题是：如果崩溃恰好夹在「工具真的执行完」和「结果落进 messages」之间，恢复时怎么知道这次调用是不是已经跑过、不能再跑一次。做法是在工具执行成功后，立刻把结果单独存进一本按 `tool_use_id` 索引的台账（同样用临时文件加 `rename` 原子写）：

```javascript
function saveEffect(toolUseId, entry) {
  const effects = loadEffects();
  effects[toolUseId] = entry;
  const tmp = EFFECTS_PATH + ".tmp";
  fs.writeFileSync(tmp, JSON.stringify(effects, null, 2));
  fs.renameSync(tmp, EFFECTS_PATH);
}

async function runToolUses(content) {
  const toolUseBlocks = content.filter((b) => b.type === "tool_use");
  const results = [];
  for (const block of toolUseBlocks) {
    let output;
    try {
      output = await toolImpls[block.name](block.input);
    } catch (err) {
      results.push({
        type: "tool_result", tool_use_id: block.id,
        content: `工具执行出错: ${err.message}`, is_error: true,
      });
      continue;
    }
    // 副作用已经发生：台账落盘即便失败，也不能谎报 is_error（否则模型会换新
    // tool_use_id 重试、造成重复副作用），只单独告警交人工处理
    try {
      saveEffect(block.id, { name: block.name, result: output, at: Date.now() });
    } catch (err) {
      console.error(`[台账落盘失败] tool_use_id=${block.id}：副作用已发生，恢复时有重复执行风险，请人工核查`);
    }
    results.push({ type: "tool_result", tool_use_id: block.id, content: output });
  }
  return results;
}
```

顺序不能颠倒：**必须先拿到 `toolImpls[block.name](block.input)` 的真实结果，`saveEffect` 才能跟着落盘**——先执行、后记录。台账记的是「这件事真的发生过，而且发生的结果是这个」，如果反过来先落账再执行，落进台账的就只能是个占位值，台账也就失去了「已完成」这个承诺的意义（Level 2 练习会让你亲手复现这个反面教材）。

正常的单次执行里，`runToolUses` 走的是「执行 → 记录」两步，因为每个 `tool_use_id` 都是第一次出现，无账可查。而恢复时要处理的那一个悬空调用，走的是更完整的「查台账 → 执行（如果需要）→ 记录（如果执行了）」三步——下面 `reconcile` 就是这三步的实现，两处遵循的是同一条纪律：不能在没有真实结果之前就往台账里写「已完成」。

### `reconcile`：崩溃时悬空调用的三分流

恢复时要处理的就是检查点里那一个（如果有的话）`pendingToolUse`。它对应三种可能：

```javascript
async function reconcile(cp) {
  const pending = cp.pendingToolUse;
  if (!pending) return null; // 没有悬空调用，直接接着跑

  const effects = loadEffects();
  const hit = effects[pending.id];

  if (hit) {
    console.log(`[resume][reconcile] tool_use_id=${pending.id} name=${pending.name} 台账命中，复用结果，不重跑`);
    return { type: "tool_result", tool_use_id: pending.id, content: hit.result };
  }

  if (READ_ONLY.has(pending.name)) {
    console.log(`[resume][reconcile] tool_use_id=${pending.id} name=${pending.name} 台账未命中，只读工具，直接重跑`);
    const output = await toolImpls[pending.name](pending.input);
    saveEffect(pending.id, { name: pending.name, result: output, at: Date.now() });
    return { type: "tool_result", tool_use_id: pending.id, content: output };
  }

  console.log(`[resume][reconcile] tool_use_id=${pending.id} name=${pending.name} 台账未命中且有副作用，查不清，补 is_error`);
  return {
    type: "tool_result", tool_use_id: pending.id, is_error: true,
    content: `这次 ${pending.name} 调用在恢复前的执行状态未知：台账里没有记录，为避免重复副作用没有重新执行。请自行核实是否已完成。`,
  };
}
```

三条分支，对应三种真实测过的场景：

- **台账命中**——就是本课开头那段崩溃演示：`write_report` 其实已经执行完、也已经落账，只是 `save B` 没赶上。恢复时直接复用台账里的结果，不重新执行，避免报告被写两遍。
- **台账未命中 + 只读工具**——比如 `read_notes` 这类不产生副作用的工具，落账之前就崩了也无所谓，直接重跑一次拿到结果，顺手把这次也补进台账：
  ```text
  [resume][reconcile] tool_use_id=toolu_ro name=read_notes 台账未命中，只读工具，直接重跑
  ```
- **台账未命中 + 有副作用**——比如 `write_report` 这类会改动外部状态的工具，落账之前就崩了：不知道它到底有没有真的执行过（真实文件系统上，`write_report` 的副作用完全可能已经发生，只是没来得及记进台账），这时候宁可不猜，用一条 `is_error: true` 的 `tool_result` 如实告诉模型「这次调用状态不明」，把判断权交回去：
  ```text
  [resume][reconcile] tool_use_id=toolu_side name=write_report 台账未命中且有副作用，查不清，补 is_error
  ```

这三段日志都是真实跑出来的，不是编的——`reconcile` 本身不需要知道任务是什么，只要给它一份 `pendingToolUse` 和对应的台账状态，三条分支各自独立可测。

```agentmentor-check
{
  "id": "sp-zh-06-a-point-necessity",
  "label": "判断『只保留 B 点检查点』是否安全",
  "prompt": "同事看了这一课的两个检查点位置，提出简化方案：『反正每一轮最后都要在 B 点存一次完整快照，A 点存的字段 B 点也全存了，干脆去掉 A 点，只在循环末尾——也就是工具结果已经落进 messages、台账也写完之后——存一次检查点，省一次磁盘写入。』这个简化方案站得住脚吗？",
  "whyHere": "reconcile 的三分流刚讲完，这里立刻用一个『去掉 A 点』的具体简化提案，检验读者是否真的理解 A 点记录的是什么、为什么 B 点单独存在时补不上这个洞。",
  "mode": "single",
  "choices": [
    {
      "id": "a",
      "text": "站不住脚：如果崩溃发生在『模型点名了工具』和『结果落进 messages、台账写完』之间，只有 B 点的检查点对这次调用一无所知，恢复时既配不出对应的 tool_result，也没有台账可查",
      "correct": true,
      "feedback": "正确。协议要求每个 tool_use 都要配一个 tool_result 一起回传。如果检查点只在 B 点存，崩溃恰好卡在『模型给出工具调用』和『结果落账』这段窗口时，磁盘上根本没有任何记录说『这一轮曾经点过一个工具的名』——不是台账缺一条，是检查点本身就不知道有过这次悬空调用。reconcile 无从查起，也就没有分支可走。A 点在拿到响应的那一刻就把这次调用单独记下来，恰恰是为了让这段窗口内发生的事有据可查。"
    },
    {
      "id": "b",
      "text": "站得住脚，只是会多花一次磁盘写入，功能上没有任何损失，可以放心去掉 A 点",
      "correct": false,
      "feedback": "把这次简化想成『少写一次文件』，忽略了 A 点和 B 点存的其实不是同一份东西——A 点记的是『模型刚点了这个工具的名，还悬着』，B 点记的是『这一轮已经翻篇』。去掉 A 点，丢掉的不是一次冗余写入，而是『工具执行期间』这整段窗口的记录能力，这段窗口恰恰是最容易被进程杀死的地方。"
    },
    {
      "id": "c",
      "text": "站不住脚，但原因是 B 点检查点写入的频率不够高，应该在工具执行过程中每隔一小段时间就多存几份 B 点快照来兜底",
      "correct": false,
      "feedback": "问题不出在 B 点存得勤不勤——B 点存的内容本来就只反映『这一轮已完成』这一种状态，不管存多少份 B 点快照，存的都是同一种『事后』信息，永远补不出『工具正在执行、还没执行完』这个中间状态。缺的不是频率，是一个专门记录『刚点名、还没执行完』这件事本身的落点。"
    }
  ]
}
```

### 入口：`main()` 里的 `--resume`

最后是入口。`main()` 只做一件判断：命令行有没有 `--resume`。有，就走 `loadCheckpoint()` 恢复；没有，就清掉上一次遗留的检查点和台账文件，从头开始——这条清理逻辑保证「不带 `--resume` 重新开始」永远是一次干净的开局，不会被上一次跑到一半的现场污染：

```javascript
async function main() {
  const resume = process.argv.includes("--resume");
  const task = "把 sales-notes.txt 整理成一份简短报告，写到 report.txt。";
  const tools = [];

  const client = resume ? makeStubClient([R4]) : makeStubClient([R1, R2, R3]);

  try {
    const result = await runAgent(client, task, tools, { resume });
    console.log(`[done] ${result}`);
  } catch (err) {
    if (err instanceof SimulatedCrash) {
      console.log(`[kill] ${err.message}`);
      process.exit(137);
    }
    throw err;
  }
}
```

`runAgent` 内部对应地分两条路：`opts.resume` 为真就 `loadCheckpoint()`、跑 `reconcile`、把补齐的结果（如果有）推进 `messages` 并存一次 B 点，再照常向模型发请求；为假就 `fs.rmSync` 清掉旧的检查点与台账，从一条空 `messages` 开始。真实的 `agent.js` 里，模型客户端换成 `@anthropic-ai/sdk` 的 `client.messages.create({ model, max_tokens, tools, messages })`，其余结构不用动。

## 协议引用

这一课的两个设计决定都不是凭空定的：

`reconcile` 在台账缺失又拿不准状态时，选择补一条 `is_error: true` 的 `tool_result` 而不是沉默地跳过，依据的是协议对内容块配对的硬性要求——每一个 `tool_use` 都必须有一个对应的 `tool_result` 一起回传，用 `tool_use_id` 认领[^S4]。少存一次 A 点会让恢复流程连「有过这次调用」都不知道，也就没法满足这条配对要求；`reconcile` 存在的意义，正是不管台账命不命中，都保证这次悬空调用最终会有一个配对的 `tool_result` 补上。

选择「resume 接着跑」而不是「出错就从头重来」，呼应的是 Anthropic 工程团队在其研究系统复盘中描述的经验：出错时不能简单地从头重启，重启对长任务而言代价太大也太让人沮丧，应该让系统能从出错的那个位置继续[^S1]。同一篇复盘也提到，Agent 的适应力可以和「重试逻辑、定期检查点」这类确定性护栏配合起来，而不是二选一[^S1]——检查点负责兜住「进程死了」这种确定性的失败，模型的适应力负责处理「台账查不清」这种没法用代码硬判的情况。`reconcile` 那条 `is_error` 分支正是把这两者接起来的地方：把「状态不明」如实告诉模型，让它自己决定要不要核实或重试，其实往往能处理得不错[^S1]。

## 验证桥段

这一课的两段终端演示，靠的不是真的杀掉一个进程去看会发生什么——那样每次跑出来的崩溃时机都不受控制，没法针对性地断言「崩溃发生在第几次工具调用之后、恢复行为对不对」。做法是把模型客户端换成一个按固定顺序出牌的桩：一个响应队列，每调一次 `messages.create` 就按顺序吐出下一条预先写好的响应，队列耗尽还在调就直接报错——这样任务会在哪几轮调用哪个工具、模型什么时候收尾,全都是写死的常量，不会因为一次真实调用而变化。

「杀进程」则是一个受环境变量控制的 `crashPoint(label)`：`runToolUses` 里每完成一次台账落盘，就把当前是第几次落盘拼进一个字符串标签，和 `CRASH_AFTER` 环境变量比对，一致就抛出一个专门的 `SimulatedCrash` 异常。这样「在第几次工具调用之后崩溃」就成了一个可以精确指定的整数，而不是听天由命的偶然事件。`main()` 只在最外层捕获这一种异常，打一行 `[kill]` 日志、用 `137`（约定俗成的「被 `SIGKILL`」退出码）退出，让演示读起来像一次真实的进程被杀，而不是一段难看的堆栈。

这套「响应队列钉死内容、崩溃点钉死次数」的方法，和本系列第 8 门课第 6 课验证上下文工程时用的是同一套思路：把原本不确定的东西（模型这次会说什么、进程这次会死在哪）先钉成固定的量，恢复行为才能被逐条断言，而不是每跑一次结果都不一样。这一课就是靠这套方法，把「台账命中不重跑」「只读工具台账缺失直接重跑」「有副作用工具台账缺失补 `is_error`」三条分支，还有 `loadCheckpoint` 对截断文件的容错，逐条用真实的 `node` 执行验证过一遍，而不是只在纸面上推理。

## 分寸

这一课焊上去的机制——两个检查点、一本台账、三分流的 `reconcile`——是给「会连续跑很多轮、中间还有副作用」的长任务准备的。一个几秒钟就能跑完、失败了重新点一下也无所谓的小任务，未必值得背上这一整套磁盘 I/O 和状态机；这里可以借用本系列第 7 门课引用过的同一条分寸：值得考虑的是只在复杂度确实能改善结果时才往上加[^S3]。这不是一条「必须这样做」的硬规定，更像是动手之前先问自己一句：这个任务真的长到、真的重要到值得为它维护一份检查点吗。

这一课的实现还有两处明确划了边界，值得说在明处，别当成「学完就能直接套进生产系统」：

- 每轮只处理一个悬空的 `pendingToolUse`，对应的是演示任务里模型每轮只点一个工具的名。真实场景里一轮模型响应完全可能带着好几个并发的 `tool_use` 块（本系列第 7 门课的 `runToolUses` 就是用 `Promise.all` 并发执行的），要把这一课的单一悬空调用协议扩展成一组悬空调用，`pendingToolUse` 得从一个对象改成一个数组、`reconcile` 也要挨个跑一遍——这一课刻意没有引入这层复杂度，是为了先把单个悬空调用的对账逻辑讲透。
- 这一课的检查点与台账，管的是「一个进程、跑一个任务」这一件事。多个会话之间怎么共享状态、多个进程同时碰同一份检查点会不会冲突、跨机器的一致性怎么保证——这些属于多会话并发与分布式一致性的范畴，不在这一课、也不在这门课程的范围内。

<!-- exercises -->
## 💻 练习

### Level 1：崩溃时刻演练手册

这一课的检查点在一轮里最多能踩中三个「崩溃时刻」：① 刚存完 A 点、工具还没开始执行；② 工具的实现函数已经跑完，但台账还没来得及落盘；③ 刚存完 B 点。请你对着这一课实现的 `saveCheckpoint` / `saveEffect` / `reconcile`，把这三个时刻分别写清楚：崩溃发生后 `checkpoint.json` 和 `effects.json` 各自处于什么状态；用 `--resume` 恢复时 `reconcile` 会落进哪一条分支；如果被中断的是一个有副作用、非只读的工具（比如 `write_report`），①和②在磁盘上留下的可观测状态是否一样、恢复行为是否一样——如果一样，这说明了什么。

<!-- rubric -->
- 时刻①（A 点已存、工具未执行）：`checkpoint.json` 里 `pendingToolUse` 是这一轮的调用；`effects.json` 里没有这个 `tool_use_id` 的记录；resume 时 `reconcile` 走「台账未命中」分支——只读工具直接重跑，非只读工具补 `is_error`
- 时刻②（工具已执行完、台账未落盘）：`checkpoint.json` 的状态和①完全一样（`pendingToolUse` 还是 A 点存的那份），`effects.json` 也和①一样没有记录，因此 resume 时 `reconcile` 走的分支和①完全相同；必须点出「代码没法区分①和②」这一点——工具在②里其实已经真的执行完了（比如 `report.txt` 已经写好），但由于台账还没落盘，恢复时会被当成状态未知处理，非只读工具会拿到 `is_error` 而不是被直接复用，这正是台账要在工具执行成功后立刻同步落盘、尽量缩小这个不确定窗口的原因
- 时刻③（B 点已存）：`checkpoint.json` 里 `pendingToolUse` 为 `null`，`messages` 已经包含这一轮的 `tool_result`；`effects.json` 里有对应记录；resume 时 `reconcile(cp)` 因为 `pending` 为空直接返回 `null`，`runAgent` 不会做「补齐」这一步，直接带着完整的 `messages` 再发一次模型请求

<!-- answer -->
时刻①和②在磁盘上留下的是完全同一份状态：`checkpoint.json` 里的 `pendingToolUse` 都还是 A 点存下的那份调用描述，`effects.json` 里都还没有这个 `tool_use_id` 的记录（区别只在于②里工具其实已经真的跑完了，只是这个事实还没来得及被写进任何持久化的地方）。因为 `reconcile` 只看磁盘上的状态、不知道内存里发生过什么，①和②触发的是完全相同的分支：读不到工具，判读为只读就直接重跑一遍；判读为有副作用就不敢猜，补一条 `is_error: true` 的 `tool_result` 交回给模型，宁可信息不完整，也不去猜一个可能造成重复副作用的答案。

时刻③则完全是另一条路径：`pendingToolUse` 已经是 `null`，`reconcile` 一进函数就直接返回 `null`，`runAgent` 里 `if (reconciled)` 判断为假，跳过「补一条工具结果、再存一次 B 点」的整段逻辑，直接带着已经完整的 `messages` 去发下一次模型请求——这一轮对恢复流程来说，早就翻篇了。

<!-- hint -->
先把「代码能看到什么」和「世界上实际发生了什么」分开想：时刻②里工具明明已经执行完了，但只要这个事实没有被写进 `checkpoint.json` 或 `effects.json`，`reconcile` 就没有任何办法知道它发生过。

<!-- hint -->
判断落进哪条分支，只需要看两个磁盘文件里的两个值：`cp.pendingToolUse` 是不是 `null`，以及 `effects.json` 里有没有这个 `tool_use_id`。把①②③各自对应的这两个值先写出来，分支自然就定了。

### Level 2：找出台账写反的顺序错误

线上事故报告写着：「用户中断了一次任务，`--resume` 之后有一个工具被跳过了——日志里显示它『已经完成』，可实际上这个工具从来没有真正执行过，约定要写的文件根本不存在。」你翻出了当时线上跑的 `runToolUses`，发现和这一课的版本有一处不同：

```javascript
async function runToolUses_线上版(content) {
  const toolUseBlocks = content.filter((b) => b.type === "tool_use");
  const results = [];
  for (const block of toolUseBlocks) {
    saveEffect(block.id, { name: block.name, result: null, at: Date.now() });
    const output = await toolImpls[block.name](block.input);
    results.push({ type: "tool_result", tool_use_id: block.id, content: output });
  }
  return results;
}
```

找出这处顺序错误，说清它为什么会导致「工具明明没跑却被当成已完成」，并改成正确的顺序。改完后，请照着这一课「验证桥段」里的方法，自己写一小段脚本复现：在 `saveEffect` 和 `toolImpls[block.name](...)` 之间插一个受环境变量控制的模拟崩溃点，用 `node` 实际跑一遍——错误顺序下，崩溃之前台账里就已经留下了一条 `result: null` 的记录；顺序修好之后，同样位置崩溃，台账里根本不会出现这个 `tool_use_id`。

<!-- rubric -->
- 指出 bug：`saveEffect` 被放在了 `toolImpls(...)` 之前，此时工具还没有真正执行，也就不可能有真实的 `output`，只能塞一个占位值（如 `result: null`）
- 说清后果：如果崩溃恰好发生在落账之后、工具真正执行完成之前，恢复时 `reconcile` 查台账会命中这条占位记录，判定为「台账命中，复用结果，不重跑」——把一次从未真正执行过的调用当成已完成处理，用一个 `null` 结果去满足 `tool_result` 的配对要求，而不是让台账如实反映「还没执行」
- 给出正确顺序：必须先 `await toolImpls[block.name](block.input)` 拿到真实结果，执行成功之后才调用 `saveEffect` 把这个真实结果写进台账，再 push `tool_result`——执行和记录之间的先后不能颠倒
- 用脚本验证：在 `saveEffect` 和 `toolImpls` 之间插入一个受控崩溃点，用 `node` 分别跑错误顺序和修复后的顺序，观察 `effects.json` 是否在崩溃前就已经写入了这个 `tool_use_id`——错误顺序下会有（且 `result` 是占位值），修复后不会有

<!-- answer -->
bug 在于 `saveEffect(block.id, { ..., result: null, ... })` 写在了 `const output = await toolImpls[block.name](block.input)` 前面。此时工具还没有被调用，函数根本不知道真实的执行结果是什么，只能先塞一个占位值（这里是 `null`）占住这个 `tool_use_id`。如果进程恰好在落账之后、`toolImpls` 真正执行完成之前被杀死，磁盘上的台账会显示「这个 `tool_use_id` 已经有记录了」，但对应的工具其实从来没有真正跑过。恢复时 `reconcile` 只看台账有没有这个 id，查到就直接判定为「台账命中」并复用那条记录——于是一次从未执行过的调用，被当成已经完成、结果是 `null` 的调用处理掉了，这正是事故报告里「工具被跳过、日志显示已完成、但文件根本不存在」的成因。

修复就是把顺序换回「先执行、后记录」：

```javascript
async function runToolUses(content) {
  const toolUseBlocks = content.filter((b) => b.type === "tool_use");
  const results = [];
  for (const block of toolUseBlocks) {
    const output = await toolImpls[block.name](block.input); // 先执行，拿到真实结果
    saveEffect(block.id, { name: block.name, result: output, at: Date.now() }); // 再落账
    results.push({ type: "tool_result", tool_use_id: block.id, content: output });
  }
  return results;
}
```

验证的写法可以参照这一课「验证桥段」的思路：写一个只处理单个 `block` 的最小脚本，在 `saveEffect` 之后（错误版本）或 `toolImpls` 之后（正确版本）插一个读环境变量的 `crashPoint`，跑两次 `node`，对比崩溃后 `effects.json` 里有没有这个 `tool_use_id`——错误顺序下崩溃前就已经写入了一条 `result: null` 的记录，正确顺序下崩溃前台账里什么都不会有。

<!-- hint -->
台账里一条记录的存在，本该等价于「这个工具已经真正跑完，而且这是它真实的结果」。反过来想：如果落账这一步发生在执行之前，这条记录还能保证这件事吗？

<!-- hint -->
搭验证脚本时，不需要还原整个 `runAgent`，只需要单独把这一个 `block` 的执行过程摘出来，插一个由环境变量控制的 `throw`，跑完之后读一下台账文件里有没有这个 id 就够了。

<!-- /exercises -->

## 小结

- 检查点在一轮里存两次：A 点在拿到模型响应后记下悬空的 `pendingToolUse`，B 点在工具结果落进 `messages` 后把它清零；只存 B 点会让「模型点名工具」和「结果落账」之间的窗口在检查点里完全不可见，而每个 `tool_use` 都必须有配对的 `tool_result` 一起回传[^S4]，A 点正是为了让这段窗口内的悬空调用有据可查
- 副作用台账按 `tool_use_id` 记录，纪律是「先执行、后记录」——落账的前提是已经拿到真实结果，反过来会把「还没跑」误记成「已完成」
- `reconcile` 三分流处理恢复时的悬空调用：台账命中就复用、不重跑；台账缺失但只读就直接重跑；台账缺失且有副作用就不猜，补一条 `is_error` 的 `tool_result` 把状态如实交还给模型——这呼应了「出错时不能从头重启、要能从出错处恢复」以及「让模型知道工具失败了、交给它自己适应，往往效果不错」这两点工程经验[^S1]，也和「确定性护栏配合模型适应力」的思路一致[^S1]
- 检查点、台账这套机制不是白拿的，只在复杂度确实能改善结果时才值得往上加[^S3]；这一课的实现只管「一个进程跑一个任务」，多会话并发与分布式一致性不在其列，也不在这门课程的范围内

你已经走完这门课。从「Agent 是有状态的、错误会复利」这句判断出发，一路拆开检查点该存什么、什么时机落盘、恢复时怎么应对悬空调用、幂等性怎么给恢复兜底、检查点还能怎么用在回退与分叉上，到这一课亲手把它们焊进一个真能跑、真能被杀死、真能接着跑完的 harness——你现在手里的不只是一套概念，而是一段经过真实 `node` 执行验证过的代码。把它接到你自己的 harness 上，下一次它真的被杀掉的时候，会稳稳地从上次停下的地方接着干。
