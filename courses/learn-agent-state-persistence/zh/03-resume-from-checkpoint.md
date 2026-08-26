# 第 3 课：断点恢复：从检查点拉起循环

> 学习目标：
> - 说清「悬空调用」为什么必然出现在崩溃恢复场景里，它和一次普通的工具执行失败并不是同一回事
> - 写出从 `loadCheckpoint()` 到重新进入循环的完整恢复路径，包括版本校验与状态重建
> - 按工具性质给悬空调用分流对账——只读工具直接重跑，高影响工具先兜底，而不是无脑重跑或无脑删除
>
> 前置要求：完成第 2 课，理解 `checkpoint.json` 的字段与两个存档点 | 上一课 [第 2 课 <<](./02-checkpoint-anatomy.md) | 下一课 [第 4 课 >>](./04-side-effects-idempotency.md)

## 只能续跑，不能重启

Agent 执行到一半崩溃，第一反应往往是「重新跑一遍」。但对一个已经推进了十几轮、调用过好几次工具的长任务来说，重启既昂贵，又会让用户沮丧[^S1]。上一课把执行现场存成了 `checkpoint.json`：`version`、`task`、`turns`、`tokensUsed`、`messages`、`pendingToolUse`，在模型响应之后（存档点 A）和工具结果落账之后（存档点 B）各落一次盘。这一课要做的，是把这份存档重新变回一个能往前走的循环——构建一种能从出错处恢复的系统，而不是每次出错都从头开始[^S1]。

## 恢复的主干：一半很简单

先看不难的那一半。恢复的主干就四步：读文件、`JSON.parse`、校验 `version`、把字段摊开塞回运行时状态。做完这四步，`runAgent` 不需要重新「构造初始 `messages`」——检查点里已经有一份完整的 `messages` 数组了，直接跳过初始化，进入循环。

```javascript
import { readFileSync, writeFileSync, renameSync, existsSync } from "node:fs";

const CHECKPOINT_PATH = "./checkpoint.json";
const CHECKPOINT_VERSION = 1;
const MAX_TURNS = 40;

function saveCheckpoint(state) {
  const tmpPath = `${CHECKPOINT_PATH}.tmp`;
  writeFileSync(tmpPath, JSON.stringify(state, null, 2));
  renameSync(tmpPath, CHECKPOINT_PATH); // .tmp + rename：写坏也不会破坏上一份可用的检查点
}

function loadCheckpoint() {
  if (!existsSync(CHECKPOINT_PATH)) return null;
  const raw = JSON.parse(readFileSync(CHECKPOINT_PATH, "utf8"));
  if (raw.version !== CHECKPOINT_VERSION) {
    throw new Error(`检查点版本不匹配：文件是 v${raw.version}，代码是 v${CHECKPOINT_VERSION}`);
  }
  return raw; // { version, task, turns, tokensUsed, messages, pendingToolUse }
}
```

有了这两个函数，`runAgent` 的开头就变成一次简单的分支：

```javascript
async function runAgent(task) {
  const cp = loadCheckpoint();

  let state;
  if (cp) {
    // 恢复：状态从检查点接过来，稍后处理 pendingToolUse
    state = cp.pendingToolUse ? await reconcile(cp) : cp;
  } else {
    // 全新开始：手写第一条 user 消息，其余计数器清零
    state = {
      version: CHECKPOINT_VERSION,
      task,
      turns: 0,
      tokensUsed: 0,
      messages: [{ role: "user", content: task }],
      pendingToolUse: null,
    };
  }

  while (state.turns < MAX_TURNS) {
    state.turns++;
    const response = await client.messages.create({ messages: state.messages });
    state.tokensUsed = response.usage.input_tokens + response.usage.output_tokens;
    state.messages.push({ role: "assistant", content: response.content });

    const toolUseBlock = response.content.find((b) => b.type === "tool_use");
    state.pendingToolUse = toolUseBlock
      ? { id: toolUseBlock.id, name: toolUseBlock.name, input: toolUseBlock.input }
      : null;
    saveCheckpoint(state); // 存档点 A：模型响应后

    if (response.stop_reason !== "tool_use") break;

    const output = await executeTool(toolUseBlock.name, toolUseBlock.input);
    state.messages.push({
      role: "user",
      content: [{ type: "tool_result", tool_use_id: toolUseBlock.id, content: output }],
    });
    state.pendingToolUse = null;
    saveCheckpoint(state); // 存档点 B：工具结果落账后
  }

  return state;
}
```

恢复之后，循环做的第一件事和平时完全一样：拿着 `state.messages` 照常发起下一次 `client.messages.create()`。模型看到的 `messages` 和崩溃前一模一样——它根本不知道中间发生过一次进程重启。这也是为什么第 2 课要求 `messages` 必须原样进检查点：只要这份数组还原得准确，恢复对模型来说就是无感的。

## 难的一半：悬空调用怎么对账

真正麻烦的，是 `state.pendingToolUse` 不为 `null` 的那种检查点。回忆一下两个存档点的位置：存档点 A 在模型响应之后，此时 `pendingToolUse` 记的是这次响应里的 `{id, name, input}`；存档点 B 在工具结果落账之后，`pendingToolUse` 被清回 `null`。如果进程恰好死在 A、B 之间——工具还没跑，或者跑完了但结果还没来得及塞进 `messages`——检查点里留下的就是一个不为 `null` 的 `pendingToolUse`。

这时候 `messages` 的末尾是一条含 `tool_use` 内容块的 `assistant` 消息，却没有配对的 `tool_result`。这不是一个可以将就的状态：协议要求每一个 `tool_use` 都必须有对应的 `tool_result`，作为下一条 `user` 消息集中回传给模型[^S4]。少了这一条，恢复后根本没法正常发起下一次调用——模型看到的是一个自己发起了工具调用、却永远等不到结果的半截对话。这条悬空的调用，必须在重新进入循环之前处理掉。

## 三种处置方式，一个能留

面对这条悬空的 `assistant` 消息，直觉上有三种做法，但只有一种真的站得住。

**方式一：把这条 `assistant` 消息从 `messages` 里删掉，当它没发生过。** 看起来最干净——恢复出来的对话里不再有任何缺口。但代价有两层：一是模型忘了自己已经做出的决策，同一次探索完全可能重新走一遍，白白多花一轮；二是更危险的一层——如果那次工具调用其实已经执行完了，只是进程在记录结果之前死掉，删除这条消息并不会撤销已经发生的副作用，它只是让模型和后续的日志都不再知道这件事发生过。删除掩盖的是事实，不是风险。

**方式二：直接重跑这个工具，把结果补成 `tool_result`。** 对只读工具（`read_file`、`grep` 这类）这完全正确——读两遍和读一遍没有区别，副作用为零。但对高影响工具（发邮件、写库这类）就危险了：工具很可能已经执行过一次，无条件重跑就是让它执行第二次。这正是第 4 课要专门讨论的幂等性问题，本课先立一条能落地的规则：**只读工具直接重跑；高影响工具必须先确认是否已经执行过，才能决定要不要重跑。**

**方式三：补一条 `is_error: true` 的 `tool_result`，内容写「执行状态未知，请重新评估」，把决定权交还给模型。** 这是查不清「有没有执行过」时的保守兜底——`is_error` 字段本就是为了告诉模型这次工具调用出了状况[^S4]。让模型知道工具出了状况、并让它自己去适应，这件事在工程上的效果好得超出预期[^S1]：模型会重新读一遍上下文，判断要不要换个方式确认结果，而不是被一个静默的、可能重复的动作坑到。

三种方式摆在一起，方式一出局；方式二和方式三分别对应「查得清」和「查不清」两种情况，组合起来才是完整的对账规则。

```agentmentor-check
{
  "type": "check",
  "id": "sp-zh-03-dangling-tool-use",
  "label": "悬空调用怎么处置",
  "prompt": "恢复时发现检查点里 pendingToolUse 不为 null——最后一条 assistant 消息里有一个 tool_use，却没有配对的 tool_result。有人认为最干净的做法是把这条 assistant 消息从 messages 里删掉，当它没发生过，这样恢复出来的对话就没有缺口。这个说法对吗？",
  "whyHere": "这题卡在「悬空调用」小节和「三种处置方式」小节之间，检查你是否理解删除为什么不是安全选项。",
  "mode": "single",
  "choices": [
    {
      "id": "a",
      "text": "不对。删除既会让模型忘记自己已经做出的决策，还可能掩盖一个已经真实发生的副作用；正确做法是按工具性质对账，把配对的 tool_result 补上，而不是把 tool_use 抹掉",
      "correct": true,
      "feedback": "对。删除代价有两层：模型可能重新探索一遍已经做过的事；更危险的是，如果工具其实已经执行完了，删除只会让这个事实从对话和后续判断里消失。协议要求每个 tool_use 都要有配对的 tool_result，对账而不是删除才是恢复到可继续状态的方式。"
    },
    {
      "id": "b",
      "text": "对，只要 messages 里不再出现没有配对结果的 tool_use，恢复后的对话就是干净且安全的",
      "correct": false,
      "feedback": "「没有缺口」只是表面干净。如果那次工具调用其实已经执行过（比如邮件已经发出去了），删除这条消息并不会撤销已经发生的事，只是让模型和日志都不再知道它发生过，风险被掩盖而不是被消除。"
    },
    {
      "id": "c",
      "text": "对，反正只读工具和高影响工具最终都要重新问一遍模型，删掉旧的 tool_use 不会有实质影响",
      "correct": false,
      "feedback": "两类工具的处置并不相同：只读工具应该直接重跑拿真实结果，高影响工具在查不清是否已执行时应该用 is_error 兜底，两种路径都是给悬空的 tool_use 补一条配对的 tool_result，而不是删除它、也不是一律重新问模型。"
    }
  ]
}
```

## reconcile(cp)：把对账写成代码

把上面的规则落成一个函数：按工具名判断是不是只读，只读就重跑；不是只读，就去查「效果台账」确认这次调用是否已经执行过——效果台账本课还没有，先用注释占位，第 4 课会给出真正的实现。查不清的时候，落到 `is_error` 兜底。

```javascript
const READ_ONLY_TOOLS = new Set(["read_file", "grep", "list_dir", "web_search"]);

async function reconcile(cp) {
  const { pendingToolUse, messages } = cp;
  const { id, name, input } = pendingToolUse;

  let toolResult;
  if (READ_ONLY_TOOLS.has(name)) {
    // 只读工具：副作用为零，直接重跑取真实结果
    const output = await executeTool(name, input);
    toolResult = { type: "tool_result", tool_use_id: id, content: output };
  } else {
    // 高影响工具：先查效果台账确认是否已执行（第 4 课引入 ledger，这里先占位）
    // const record = await ledger.checkExecuted(id);
    // if (record) toolResult = { type: "tool_result", tool_use_id: id, content: record.result };
    // else toolResult = { type: "tool_result", tool_use_id: id, content: await executeTool(name, input) };
    //
    // 本课台账还没实装，查不清就用保守兜底：
    toolResult = {
      type: "tool_result",
      tool_use_id: id,
      content: "执行状态未知：进程在这次调用完成前崩溃，无法确认是否已生效，请重新评估当前情况。",
      is_error: true,
    };
  }

  messages.push({ role: "user", content: [toolResult] });
  cp.pendingToolUse = null;
  return cp;
}
```

`reconcile()` 做完之后，`cp.messages` 末尾已经补上了配对的 `tool_result`，`cp.pendingToolUse` 也归位成 `null`。这份 `cp` 现在和一份正常落在存档点 B 的检查点没有区别，可以直接交给 `while` 循环继续往前走。

## 恢复之后：turns 和 tokensUsed 怎么算

有两个计数器容易被恢复流程带偏，需要单独说清楚。

`turns` 恢复后不清零。它记的是这个任务从开始到现在的总轮次，不是「本次进程运行了几轮」——检查点里的 `turns` 就应该原样接着往上加，第 2 课定的最大轮次阀 `MAX_TURNS` 才会继续起作用。如果恢复时把 `turns` 归零，一个反复崩溃又反复恢复的任务就能绕开轮次上限，无限跑下去。

`tokensUsed` 同理，也从检查点接续，不重新计算。第 8 门课讲上下文压缩时，`tokensUsed` 的语义就是「当前窗口的用量」，而检查点里存的正是崩溃那一刻这份窗口的用量——两者语义是一致的，恢复时直接拿来接着用即可，不需要额外换算。

<!-- exercises -->
## 💻 练习

### Level 1：三份检查点，三种恢复动作

下面是三份在恢复时读到的检查点（为了阅读方便，`messages` 里省略了具体内容）。针对每一份，写出 `runAgent` 恢复时应该做什么、为什么。

```javascript
// 检查点 A
const cpA = {
  version: 1,
  task: "帮我整理这周的会议纪要",
  turns: 6,
  tokensUsed: 18420,
  messages: [/* … 最后一条是 assistant 的纯文本回复 … */],
  pendingToolUse: null,
};

// 检查点 B
const cpB = {
  version: 1,
  task: "帮我整理这周的会议纪要",
  turns: 7,
  tokensUsed: 19310,
  messages: [/* … 最后一条是含 tool_use 的 assistant 消息 … */],
  pendingToolUse: { id: "toolu_01A", name: "read_file", input: { path: "./notes/meeting-08-25.md" } },
};

// 检查点 C
const cpC = {
  version: 1,
  task: "帮我把结论发邮件通知团队",
  turns: 9,
  tokensUsed: 24003,
  messages: [/* … 最后一条是含 tool_use 的 assistant 消息 … */],
  pendingToolUse: { id: "toolu_01B", name: "send_email", input: { to: "team@example.com", subject: "本周结论" } },
};
```

<!-- rubric -->
- cpA：`pendingToolUse` 为 `null`，说明崩溃发生在存档点 B 之后、下一次 `create()` 之前，恢复时直接拿 `messages` 发起下一次调用即可，不需要对账
- cpB：`pendingToolUse` 指向 `read_file`，是只读工具，副作用为零，恢复时直接重跑取结果、补一条 `tool_result` 就能继续
- cpC：`pendingToolUse` 指向 `send_email`，是高影响工具，不能无条件重跑；本课还没有效果台账，应该走 `is_error` 兜底，把「执行状态未知」如实告诉模型，而不是直接重发一封邮件

<!-- hint -->
① 先看 `pendingToolUse` 是不是 `null`——是的话根本不涉及对账，问题问的是另外两份。② 再看工具名：判断它属不属于 `READ_ONLY_TOOLS`。③ 只有判断不出「是否已执行」的高影响工具，才需要考虑兜底，而不是重跑。

<!-- answer -->
cpA 不需要对账：`pendingToolUse` 为 `null` 意味着崩溃发生在存档点 B 之后，`messages` 是完整的，恢复时直接用它发起下一次 `client.messages.create()` 即可。cpB 需要重跑：`read_file` 是只读工具，重复执行不会产生任何副作用，恢复时调用 `reconcile()` 会自然落进 `READ_ONLY_TOOLS` 分支，拿到真实文件内容补成 `tool_result`。cpC 不能重跑：`send_email` 是高影响工具，工具很可能已经执行过一次，无条件重跑会导致团队收到重复邮件；本课还没有效果台账可以确认是否已执行，`reconcile()` 应该落进 `is_error` 兜底分支，把「执行状态未知，请重新评估」如实回传给模型，而不是直接再发一次。

### Level 2：找出重复发信的根因

运维事故报告：「进程在 `send_email` 工具调用后、结果落账前被 OOM Killer 杀掉重启。重启后 harness 自动 `--resume`，几分钟后用户反馈收到了两封内容完全相同的邮件。」

事发时线上跑的 `reconcile()` 是这样写的：

```javascript
// 出事故时线上的版本
async function reconcile(cp) {
  const { pendingToolUse, messages } = cp;
  const { id, name, input } = pendingToolUse;

  const output = await executeTool(name, input);
  messages.push({
    role: "user",
    content: [{ type: "tool_result", tool_use_id: id, content: output }],
  });
  cp.pendingToolUse = null;
  return cp;
}
```

定位根因，并把这个 `reconcile()` 改成按工具性质分流的版本（提示：本课定的规则是「只读直接重跑，高影响工具没有台账时用 `is_error` 兜底」）。改完之后用 `node` 跑一遍，验证 `send_email` 这类高影响工具不会再触发 `executeTool()`。

<!-- rubric -->
- 根因：`reconcile()` 对 `pendingToolUse` 一律调用 `executeTool()` 重跑，没有区分只读工具和高影响工具；`send_email` 很可能已经在崩溃前执行过一次，无条件重跑等于让它又执行了一次，造成邮件重复发送
- 修复：引入 `READ_ONLY_TOOLS` 集合按工具名分流——只读工具才允许调用 `executeTool()` 重跑；高影响工具（如 `send_email`）不再无条件重跑，而是补一条 `is_error: true` 的 `tool_result`，把「执行状态未知」交回模型判断
- 改完的代码里，`read_file` 这类调用和 `send_email` 这类调用必须走两条不同的路径，但两条路径最终都要给 `messages` 补上一条配对的 `tool_result`，否则恢复后没法正常继续对话

<!-- answer -->
根因是 `reconcile()` 把所有 `pendingToolUse` 都当成「可以放心重跑」处理，没有按工具的副作用区分对待。`send_email` 在崩溃前极可能已经把邮件发出去了，进程只是没来得及把结果记进 `messages`；恢复时再调用一次 `executeTool("send_email", …)`，就是让同一封邮件被真实发送了第二次。修复版本需要按工具名分流：

```javascript
const READ_ONLY_TOOLS = new Set(["read_file", "grep", "list_dir", "web_search"]);

async function reconcile(cp) {
  const { pendingToolUse, messages } = cp;
  const { id, name, input } = pendingToolUse;

  let toolResult;
  if (READ_ONLY_TOOLS.has(name)) {
    const output = await executeTool(name, input);
    toolResult = { type: "tool_result", tool_use_id: id, content: output };
  } else {
    toolResult = {
      type: "tool_result",
      tool_use_id: id,
      content: "执行状态未知：进程在这次调用完成前崩溃，无法确认是否已生效，请重新评估当前情况。",
      is_error: true,
    };
  }

  messages.push({ role: "user", content: [toolResult] });
  cp.pendingToolUse = null;
  return cp;
}
```

改完后，`send_email` 这类不在 `READ_ONLY_TOOLS` 里的工具永远不会再触发 `executeTool()`，`reconcile()` 只会给它补一条 `is_error` 的 `tool_result`；只有 `read_file` 这类只读工具才会真的重跑。用 `node` 跑一遍，分别用一个只读工具名和 `send_email` 调用 `reconcile()`，检查 `executeTool` 的调用记录：只读那次里应该出现，`send_email` 那次里不应该出现。
<!-- /exercises -->

## 小结

断点恢复的主干并不难：读检查点、校验版本、把字段摊回运行时状态、跳过初始化直接进循环，模型甚至感觉不到中间发生过崩溃。真正需要设计的是悬空调用的对账——删除会丢决策、掩盖已发生的副作用；只读工具可以放心重跑；高影响工具在查不清是否已执行时，`is_error` 兜底是比无脑重跑更安全的选择。但这条规则里还留着一个没解决的问题：高影响工具「是否已经执行过」到底怎么查？本课只是把它兜底成了「查不清」，真正查得清需要一份效果台账——这正是下一课要解决的。

[>> 第 4 课：副作用与幂等：恢复时哪些工具敢重跑](./04-side-effects-idempotency.md)
