# 第 5 课：回退与分叉：检查点的第二重价值

> 学习目标：
> - 说清检查点除了灾后恢复，还有两种主动用法——回退到早先的现场重来、分叉出另一条时间轴去试——并理解它们和恢复（resume）同样建立在一份检查点序列上
> - 把检查点从「只留最新一份」改造成按轮次留存的序列，实现 `rewindTo(turn)`，并说清回退拨回的是决策现场，不是已经发生的外部副作用
> - 实现 `forkFrom(turn, branchName)` 从同一现场复制出独立时间轴，并说清检查点、Git、效果台账三者各自的分工边界
>
> 前置要求：完成第 1-4 课，熟悉 `checkpoint.json` 的字段结构（`version`、`task`、`turns`、`tokensUsed`、`messages`、`pendingToolUse`）与原子写、断点恢复怎么处理悬空调用、以及第 4 课的效果台账与幂等键 | 上一课 [第 4 课 <<](./04-side-effects-idempotency.md) | 下一课 [第 6 课 >>](./06-build-checkpointing.md)

## 检查点不只是保险丝

前三课一路把检查点讲成救灾用的保险——进程崩了，从最近一份检查点把循环接着跑起来。这么用没问题，但如果只在崩溃之后才想起打开它，等于让它大部分时间都闲置着：没崩，是不是就白存了？

不是。一串检查点攒起来，其实是这个任务的一条时间轴——每一轮它在想什么、准备做什么、已经落了哪些账，全都留了痕迹。除了灾后恢复，这条时间轴还能派上另外两种主动用场：回退到早先的某一轮重新来过；从某一轮分叉出去，同时跑另一条路线看结果。一份以 harness 工程为主线的社区路线图，给持久化这个组件的概括正是把这三件事连在一起说的：每一步都要落检查点，为的是能恢复、能回退、能分叉[^S5]。这是路线图给出的一个框架性说法，没有规定具体怎么实现，但它点出了一件事：resume 只是检查点用法的三分之一，后面两种才是这一课的正题。

- **回退（rewind）**：任务没崩，但走歪了，把决策现场拨回还没走歪的那一轮，重新来。
- **分叉（fork）**：还不确定哪条路线更好，从同一个现场复制出两条独立时间轴，分别跑，再挑结果。

这两种都不是「灾后处理」——任务顺顺当当往下跑的时候，都可能用得上。

## 回退：拨回决策现场，不是拨回外部世界

设想一个要跑 20 多轮工具调用的任务：模型在第 15 轮做了一个错误决策——选错了要改的文件，或者对一条含糊的需求做了错误的假设。接下来的 10 轮，它都在这个错误的基础上继续往下建。本系列第 8 门课讲过，上下文越堆越长、越堆越杂，模型准确召回其中信息的能力会随之下降；何况这段历史里还带着一个错误决策，与其让模型在这段又长又跑偏的上下文里继续挣扎，不如把现场拨回第 14 轮——那个还没做错决策的时间点——从那里重新开始。

要做到这一点，检查点不能再只留「最新一份」。前几课的 `saveCheckpoint` 每次都覆盖同一份 `checkpoint.json`，恢复时只能拿到最后一次写入的状态——这对灾后恢复够用，但没法回退，因为第 14 轮那份现场早被第 15 轮盖掉了。要支持回退，检查点得按轮次留存成一个序列，文件名里带上轮次号和存档点：`checkpoints/turn-014-A.json`、`checkpoints/turn-014-B.json` 这样——每一轮里，模型给出方案、工具还没执行时落一份存档点 A；这一轮的工具结果写回 `messages`、这一轮真正跑完时再落一份存档点 B。默认「回到第 N 轮」指这一轮跑完后的现场，也就是取该轮里最后落盘的那个存档点：

```javascript
import fs from "node:fs/promises";
import path from "node:path";

function turnFileName(turn, point) {
  return `turn-${String(turn).padStart(3, "0")}-${point}.json`;
}

// 取某一轮里最后落盘的存档点：A、B 按字典序排列，B 排在 A 后面，
// 正好对应「工具执行前」到「工具结果落账后」的先后顺序
async function pickLatestPoint(turn, dir) {
  const files = await fs.readdir(dir);
  const prefix = `turn-${String(turn).padStart(3, "0")}-`;
  const points = files
    .filter((f) => f.startsWith(prefix))
    .map((f) => f.slice(prefix.length, prefix.length + 1))
    .sort();
  if (points.length === 0) throw new Error(`没有第 ${turn} 轮的检查点`);
  return points[points.length - 1];
}

async function rewindTo(turn, { point, dir = "checkpoints" } = {}) {
  const wanted = point ?? (await pickLatestPoint(turn, dir));
  const raw = await fs.readFile(path.join(dir, turnFileName(turn, wanted)), "utf8");
  return JSON.parse(raw); // { version, task, turns, tokensUsed, messages, pendingToolUse }
}
```

拿到 `rewindTo(14)` 返回的现场，接下来的流程和断点恢复一样：用这份 `messages` 重建历史，从这个 `turns` 数字继续循环，只是这一次，模型面对的不再是被第 15 轮污染过的上下文，而是那个决策发生之前的干净现场。

但有一件事得主动点破：回退拨回的是**决策现场**，不是**外部世界**。如果第 16 轮那个错误决策已经调用了某个高影响工具——比如真的发出了一封邮件——回退到第 14 轮并不会把那封邮件收回来。检查点存的是 `messages`、`turns`、`pendingToolUse` 这些你自己定义进快照的状态字段，从来没打算，也做不到去撤销一次已经落地的外部动作。第 4 课的效果台账（`effects.json`）继续遵守只增不减的规则：回退之后从第 15 轮重新跑，哪怕模型这次选了完全不同的动作，台账里也只会多一条新记录，不会把旧的那条抹掉——被丢弃的十轮里到底发生过什么，账上依然留着痕迹，这正是第 4 课那份幂等视角在回退场景里的延续。

## 分叉：从同一现场跑出两条时间轴

回退解决的是「这条路走错了，退回去重来」；但有时候问题不是「错没错」，而是「不确定哪条更好」——两种重构方案都说得通，想各跑一遍看效果再挑。这种时候不该覆盖式地二选一，而是从同一个检查点复制出两条独立时间轴，分别跑：

```javascript
async function forkFrom(turn, branchName, { point, baseDir = "checkpoints" } = {}) {
  const startPoint = point ?? (await pickLatestPoint(turn, baseDir));
  const state = await rewindTo(turn, { point: startPoint, dir: baseDir });

  const branchDir = `${baseDir}-${branchName}`;
  await fs.mkdir(branchDir, { recursive: true });
  await fs.writeFile(
    path.join(branchDir, turnFileName(turn, startPoint)),
    JSON.stringify(state, null, 2)
  );

  // 独立的效果台账：这条时间轴自己往下跑，谁的效果记谁自己的账，不沿用主线的记录
  await fs.writeFile(path.join(branchDir, "effects.json"), "[]\n");
  return branchDir;
}
```

`forkFrom(14, "plan-b")` 之后，`checkpoints-plan-b/` 里有了它自己的检查点序列和一份空白的效果台账，从第 14 轮往后，这条时间轴要往哪走、跑几轮、落多少检查点，都跟主线互不干扰。

分叉出来的两条时间轴各自独立，这件事对高影响工具是个提醒：如果两条时间轴都会调用同一个真正对外的动作——比如都要发同一封邮件——让它们各自无审批地跑下去，就是两条时间轴各发一遍，变成双份副作用。给这类工具接上审批闸，或者分叉期间先切成干跑模式，是分叉之前值得做的准备；这和回退时台账不会跟着回滚是同一个道理：检查点可以复制成两份，但已经落地的外部效果没法跟着复制成「平行世界各一份」。

## 产品对照：Claude Code 把这套做成了功能

前面这套回退与分叉，Claude Code 已经把它做成了产品级功能——这里只作对照，不是要教的工具。它的检查点机制会在每条用户提示之前自动捕获代码状态[^S2]：每条用户提示都会新建一个检查点[^S2]，而且检查点跟着会话一起保存，就算你退出会话再回来，依然能用 `/rewind`[^S2]。

它的 `/rewind` 菜单把「恢复什么」拆成了三档：只恢复对话（代码保持当前状态）、只恢复代码（对话保留当前状态）、或者代码和对话一起恢复到那个时间点[^S2]——这恰好对应本课「回退拨回的是决策现场」这句话的产品化版本：可以选择只拨回决策现场（对话），也可以连同代码一起拨回。官方文档也列了检查点的几个常见用例，比如探索替代方案、尝试不同实现路径而不丢掉起点，以及从错误中恢复、快速撤销引入 bug 的改动[^S2]。要说明的是，这些用例文档是笼统挂在检查点（`/rewind`）名下讲的，并没有按「回退」「分叉」分开归类；但拿来对照本课「走错了退回去重来」和「不确定就分叉去试」这两种用法，方向是一致的。

分叉这一侧，Claude Code 提供了 `/branch` 或者 `claude --continue --fork-session`：在保留原会话完整不动的前提下，另起一条时间轴去试别的路子[^S2]。

## 边界与分工：检查点、Git、效果台账各管什么

Claude Code 的文档也主动划了一条边界：它的检查点不追踪 bash 命令改动的文件[^S2]，只追踪 Claude 自己那几个文件编辑工具做出的修改[^S2]。同理，你自己 harness 里的检查点，覆盖的也只是你显式定义进快照的那几个状态字段——`messages`、`turns`、`tokensUsed`、`pendingToolUse`；工具在外部世界造成的改动，无论是写数据库、调用别的服务、还是发一封邮件，统统不在检查点的管辖范围内，那是效果台账的活。

官方文档把这套机制的定位说得很直接：检查点是为快速的会话级恢复而设计的，长期历史和协作，还是要继续用 Git 这样的版本控制[^S2]。三者各管一段，摆在一起看更清楚：

| 机制 | 管什么 | 时间尺度 |
| --- | --- | --- |
| 检查点 | 运行现场——`messages`、轮次、待执行的工具调用 | 分钟级、会话级 |
| Git | 代码本身的历史——提交、分支、协作 | 永久、可协作 |
| 效果台账 | 已经发生的外部副作用——发过的邮件、写过的记录 | 只增不减，永久保留 |

```agentmentor-check
{
  "id": "sp-zh-05-checkpoint-vs-git",
  "label": "判断检查点能不能替代版本控制",
  "prompt": "团队里有人提议：现在检查点已经能按轮次回退了，功能上跟 Git 的提交历史很像，不如往后就用检查点管代码变更，Git 都可以不用了。这个提议站得住吗？",
  "whyHere": "刚讲完检查点、Git、效果台账三者的分工边界；『检查点都能回退了，Git 是不是就多余了』是这里最容易冒出来的过度引申，得当场把这条边界钉死，不然读者会把分钟级的会话恢复和永久的代码历史混成一回事。",
  "mode": "single",
  "choices": [
    {
      "id": "a",
      "text": "站得住。检查点已经按轮次存了每一步的现场，version、turns、messages 都在，跟 Git 提交记录的作用是一回事，用检查点回退、用检查点看历史，两件事都能干。",
      "correct": false,
      "feedback": "检查点存的这些字段，是为了重建某一次会话的运行现场准备的，跟 Git 提交要记录的「代码文件本身经过版本控制系统管理的完整变更」不是一回事。检查点被设计的定位就是快速的会话级恢复，长期历史和协作依然要靠 Git 这类版本控制[^S2]，二者管的不是同一件事，谈不上谁替代谁。"
    },
    {
      "id": "b",
      "text": "站不住。检查点是分钟级、会话级的运行现场恢复，Git 才是代码本身永久、可协作的历史记录，二者管的是完全不同的两件事，不能互相替代。",
      "correct": true,
      "feedback": "对。官方文档把这条边界说得很直接：检查点是为快速的会话级恢复而设计的，长期历史和协作仍然要继续用 Git 这样的版本控制[^S2]。检查点甚至不追踪 bash 命令改动的文件，只追踪 Claude 自己文件编辑工具做出的修改[^S2]——它对代码到底发生了什么变化的记录范围，本来就比 Git 窄得多。检查点、Git、效果台账各管一段，不能互相替代。"
    },
    {
      "id": "c",
      "text": "部分站得住。检查点已经能回退，只要把每次回退都记下来，本质上就是一种简化版的分支管理，只是操作方式不一样，慢慢替代 Git 也不是不可能。",
      "correct": false,
      "feedback": "检查点的回退和 Git 的分支管理，不是同一件事的两种写法。检查点连 bash 命令改动的文件都不追踪，只追踪 Claude 自己文件编辑工具的修改[^S2]，对代码变化的覆盖范围本来就比 Git 窄很多，也没有 Git 那套提交、合并、协作机制。它的定位是快速的会话级恢复，不是版本控制的替代品[^S2]。"
    }
  ]
}
```

## 留存的代价：按需取舍

按轮次留存整条检查点序列，不是没有成本的——每一轮两份存档点，跑得越久，磁盘上堆的文件就越多。Anthropic 那条「只在复杂度能明确改善结果时才考虑添加」的原则[^S3]，放到这里同样适用：如果任务本来就跑不了几轮，也不太需要回退重来，按轮次留存整条序列这份开销，可以考虑省下来——像前几课那样只留最新一份，也够用。反过来，任务动辄几十轮、又常常需要回退或者分叉着试几条方案，序列化留存换来的是明确的收益：出了岔子不必从头再来，试错的成本也压低了。这终归是个按任务规模取舍的判断，不是哪种做法天生更对。

<!-- exercises -->
## 💻 练习

### Level 1：四个场景，选对工具

以下四个场景，各自该用回退、恢复、分叉、还是 Git？请逐个作答并说明理由。

1. 一个跑了 20 多轮的任务里，你发现模型在第 12 轮选错了修改方案，后面的轮次都建立在这个错误方案之上，但进程本身一直好好地在跑，没有崩溃。
2. 同一个任务跑到第 18 轮，宿主机被重启了，进程整个断掉，什么都没跑完。
3. 你不确定该把一个模块拆成两个服务还是拆成三个，想让 Agent 各按一种方案跑一遍，再比较结果。
4. 你想知道三天前这份代码是什么样子、是谁在什么时候改的。

<!-- rubric -->
- 场景 1 选回退，理由点出「没崩、但决策走歪，后续都建立在错误之上」这个特征，而不是恢复或分叉
- 场景 2 选恢复，理由点出「进程整体中断、不是决策失误」，用的是断点恢复而不是回退
- 场景 3 选分叉，理由点出「两条方案都要真的各跑一遍拿结果比较」，而不是先信一个再说
- 场景 4 选 Git，理由点出「问的是代码本身经过版本控制管理的历史，时间跨度是天而不是分钟」，不属于检查点的会话级范围

<!-- answer -->
1. **回退**。进程没有崩，问题出在第 12 轮的决策本身，后面十几轮全都建立在这个错误之上。硬着头皮在这段已经跑偏的历史里继续推进，不如把现场拨回第 11 轮（错误发生之前）重新来过，把决策现场换成还没走歪的那一份。
2. **恢复（resume）**。这不是决策出了问题，是进程本身整个断掉了，跟第 12 轮怎么想的无关。该做的是从最近一份检查点把循环接着跑起来，续上原来的执行现场，不需要换掉任何决策。
3. **分叉**。这不是「哪个错了要退回去」，是两个方案都说得通，需要真的各跑一遍才知道哪个更好。从当下这个检查点复制出两条独立时间轴，各自带上自己的效果台账分别跑，比先赌一个、跑完发现不行再回退重来更直接。
4. **Git**。这里问的是代码本身「三天前长什么样、谁改的」，这是版本控制系统要管的永久历史，横跨的时间是天而不是分钟。检查点按轮次留存，是为了这一次会话能快速回退，通常不会保留那么久，更谈不上记录「谁改的」这类协作信息。

<!-- hint -->
先问自己一个问题：进程是不是整个断掉了？断了就是恢复；没断但是走歪了，才轮到回退登场。

<!-- hint -->
「不确定选哪个」和「已经选错了」不是一回事：前者该分叉去比较，后者该回退去重来。而「代码本身的历史」这个词一出现，基本就该想到 Git，而不是检查点。

### Level 2：把 saveCheckpoint 改造成按轮次序列

下面这段代码是前几课的旧版本：每次都覆盖同一份 `checkpoint.json`，只能支持恢复，不能支持回退。请把它改造成本课要求的样子：文件名按 `turn-NNN-A.json` / `turn-NNN-B.json` 的规则按轮次留存；提供一个恢复用的 `loadLatest()`，默认取最新轮次里最后落盘的存档点；再提供一个 `rewindTo(turn)`，取指定轮次的现场。改完之后，写一段验证：连续存 5 轮，调用 `rewindTo(3)`，确认拿回的现场 `turns` 是 3，而且效果台账 `effects.json` 的长度没有跟着回滚。

```javascript
// 旧版本：每次都覆盖同一份文件，只能取到「最新」，取不到「第 N 轮」
import fs from "node:fs/promises";

async function saveCheckpoint(state) {
  const tmp = "checkpoint.json.tmp";
  await fs.writeFile(tmp, JSON.stringify(state, null, 2));
  await fs.rename(tmp, "checkpoint.json");
}

async function loadCheckpoint() {
  const raw = await fs.readFile("checkpoint.json", "utf8");
  return JSON.parse(raw);
}
```

<!-- rubric -->
- `saveCheckpoint` 改成按 `turn-NNN-A.json` / `turn-NNN-B.json` 命名落盘，且保留原子写（先写临时文件再改名）
- 提供能找到「某一轮里最后落盘的存档点」的逻辑，`loadLatest()` 能正确取到跑过的最大轮次里最新的那个存档点
- `rewindTo(turn)` 能取到指定轮次的现场，且不碰 `effects.json`
- 给出的验证脚本能跑通：存 5 轮之后 `rewindTo(3).turns === 3`，`effects.json` 的长度仍然是 5（没有被回退动作改变）

<!-- answer -->
```javascript
import fs from "node:fs/promises";
import path from "node:path";

function turnFileName(turn, point) {
  return `turn-${String(turn).padStart(3, "0")}-${point}.json`;
}

async function saveCheckpoint(state, turn, point, dir = "checkpoints") {
  const file = path.join(dir, turnFileName(turn, point));
  const tmp = `${file}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(state, null, 2));
  await fs.rename(tmp, file); // 原子写：先写临时文件，再整体改名
}

async function pickLatestPoint(turn, dir) {
  const files = await fs.readdir(dir);
  const prefix = `turn-${String(turn).padStart(3, "0")}-`;
  const points = files
    .filter((f) => f.startsWith(prefix))
    .map((f) => f.slice(prefix.length, prefix.length + 1))
    .sort();
  if (points.length === 0) throw new Error(`没有第 ${turn} 轮的检查点`);
  return points[points.length - 1];
}

async function rewindTo(turn, { point, dir = "checkpoints" } = {}) {
  const wanted = point ?? (await pickLatestPoint(turn, dir));
  const raw = await fs.readFile(path.join(dir, turnFileName(turn, wanted)), "utf8");
  return JSON.parse(raw);
}

async function loadLatest(dir = "checkpoints") {
  const files = await fs.readdir(dir);
  const maxTurn = Math.max(
    ...files.filter((f) => f.startsWith("turn-")).map((f) => Number(f.slice(5, 8)))
  );
  return rewindTo(maxTurn, { dir });
}

export { saveCheckpoint, rewindTo, loadLatest };
```

验证脚本（`effects.json` 用同样的原子写方式追加，代表恢复、回退都不会碰的那份台账）：

```javascript
import fs from "node:fs/promises";
import assert from "node:assert/strict";
import { saveCheckpoint, rewindTo, loadLatest } from "./checkpoint.mjs";

async function appendEffect(entry, file = "effects.json") {
  let ledger = [];
  try {
    ledger = JSON.parse(await fs.readFile(file, "utf8"));
  } catch {}
  ledger.push(entry);
  await fs.writeFile(file, JSON.stringify(ledger, null, 2));
}

await fs.mkdir("checkpoints", { recursive: true });

for (let turn = 1; turn <= 5; turn++) {
  const stateA = {
    version: 1,
    task: "demo",
    turns: turn,
    tokensUsed: turn * 100,
    messages: [{ role: "user", content: `turn ${turn} A` }],
    pendingToolUse: { name: "send_email" },
  };
  await saveCheckpoint(stateA, turn, "A");

  const stateB = {
    ...stateA,
    messages: [...stateA.messages, { role: "user", content: `turn ${turn} B` }],
    pendingToolUse: null,
  };
  await saveCheckpoint(stateB, turn, "B");

  await appendEffect({ turn, action: "send_email" });
}

const rewound = await rewindTo(3);
assert.equal(rewound.turns, 3);
console.log("rewindTo(3).turns =", rewound.turns); // rewindTo(3).turns = 3

const effects = JSON.parse(await fs.readFile("effects.json", "utf8"));
assert.equal(effects.length, 5);
console.log("effects.json length =", effects.length); // effects.json length = 5

console.log("PASSED");
```

在本地跑 `node verify.mjs`，输出是：

```
rewindTo(3).turns = 3
effects.json length = 5
PASSED
```

第一行证明 `rewindTo(3)` 确实把现场拨回了第 3 轮，不是恢复到最新的第 5 轮；第二行证明回退这个动作只重建了决策现场，效果台账压根没被碰过——5 轮里真实发生过的记录，一条都没少。

<!-- hint -->
「某一轮里最后落盘的存档点」该怎么判断？A、B 两个字母按字典序排列，恰好和「工具执行前」到「工具结果落账后」的时间顺序一致，直接取排序后的最后一个就行，不需要额外记时间戳。

<!-- hint -->
效果台账是单独一份文件（`effects.json`），跟检查点序列完全独立。只要 `rewindTo` 里没有一行代码碰它，这份验证自然就能通过，用不着专门去「保护」它。

<!-- /exercises -->

## 小结

- 检查点不只是灾后恢复用的保险：一串留存下来的检查点是任务的一条时间轴，除了恢复（resume），还能回退（rewind）、分叉（fork）——一份社区路线图把这三件事作为持久化组件的框架性概括放在一起说[^S5]
- 回退拨回的是**决策现场**，不是**外部世界**：已经真实发生的外部动作不会因为回退而撤销，效果台账继续只增不减，这是第 4 课幂等视角在回退场景里的延续
- 支持回退的前提是检查点按轮次留存成序列（如 `turn-014-A/B.json`），而不是覆盖式地只留最新一份；`rewindTo(turn)` 默认取该轮里最后落盘的存档点
- 分叉是从同一现场复制出独立时间轴，各自带上自己的检查点序列和效果台账；两条时间轴如果都会碰同一个高影响工具，记得接上审批或切成干跑模式，否则就是双份副作用
- Claude Code 已经把回退与分叉做成产品功能：每条提示自动建检查点、`/rewind` 可分别恢复对话或代码、`/branch` 与 `--fork-session` 用于分叉[^S2]；但它自己划了边界——只追踪 Claude 自己文件编辑工具的修改、不追踪 bash 命令改动的文件[^S2]，定位是快速的会话级恢复，长期历史与协作仍归 Git[^S2]
- 三者分工不同：检查点管分钟级的运行现场，Git 管永久、可协作的代码历史，效果台账管已经发生的外部副作用；按轮次全量留存检查点有磁盘成本，是否值得取决于任务规模，而不是哪种做法天生更对[^S3]

[>> 第 6 课：实战：给 harness 装上检查点与恢复](./06-build-checkpointing.md)
