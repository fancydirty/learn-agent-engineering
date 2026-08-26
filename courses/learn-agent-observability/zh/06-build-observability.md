# 第 6 课：实战：给 harness 装上观测层

> 学习目标：
> - 给自己的 harness 装上一层能跑的观测：JSON Lines 结构化日志、从日志重建的 trace 树、一行指标汇总
> - 在一个真实的错误任务上走完「症状 → 过滤 → 第一处分岔 → 修复 → 复跑对比（真接 API 时换成从出错处恢复）」，并说清哪些荒唐是原因、哪些只是传染
> - 划清这层观测的边界：管到一个进程一次运行为止，内容默认不记，阈值不发明
>
> 前置要求：读完第 1–5 课，手边能跑起本系列第 7 门课的 harness 循环 | 上一课 [第 5 课 <<](./05-hooks-and-debugging.md)

## 症状：summary.md 里多了一个不存在的区

先说一个具体到能闻见味道的场景。

你写了个小 Agent 干周报的活儿：`data/` 目录下放着三份季度销售 CSV，让它读完、按区汇总、写出一份 `summary.md`。工具就三个：`list_files`、`read_file`、`write_file`。跑了几周都没事。

周一早上，同事在群里问了一句：「这个『华中区』是哪儿来的？我们公司没有华中区。」

你打开 `summary.md`，确实有：

```text
# 2026 Q1 各区销售汇总

| 区 | 合计（元） |
| --- | --- |
| 华东 | 548550 |
| 华中 | 208000 |
| 华北 | 432600 |
| 总计 | 1189150 |

数据来源：data/ 目录下的季度销售 CSV
```

你打开 `data/`，里面只有三份文件：`2026-q1-east.csv`、`2026-q1-south.csv`、`2026-q1-north.csv`，内容里的区名是华东、华南、华北。整个目录全文搜「华中」，一个字都搜不到。华南整个消失了，凭空冒出来一个华中，数字 208000 也不知道从哪儿来的。

现在的问题是：**这一步是在哪儿出的岔子？**

没有观测层的时候，你手里只有两样东西：一份写错的 `summary.md`，和一句「模型编的」。这句话不解决任何问题——你不知道它是在读文件那一步就没读到，还是读到了却算错了，还是三份都读到了但写的时候串了行。而且你没法靠「复现一下再打断点」把它逼出来：Agent 在两次运行之间是非确定性的，同样的提示词、同样的工具，它可能走一条完全不同但同样合法的路径[^S1]。你复跑三次，可能三次都对，也可能第四次换个花样错。

更麻烦的是错误会复合。一步失败可以让 Agent 拐进一条完全不同的轨迹，最后的结果和最初那个小毛病看上去毫无关系[^S1]。所以你不能只盯着终点看——终点的荒唐往往只是**传染**（第 1 课管这叫轨迹改道，说的是同一件事），真正的病灶在上游某一步。

这一课干的事，就是把这段「说不清」变成「有据可查」：给 harness 焊上一层观测，然后拿这个真实的 bug 走一遍定位流程。前五课的东西在这里全部落到一个能跑的文件里。

## 观测三件套要记什么

生产环境跑 Agent，你需要看清四件事：它调了哪些工具、每次模型请求花了多久、烧了多少 token、失败发生在哪一步[^S6]。官方的做法是把这些导成 OpenTelemetry 的 trace、metrics 和 log events；我们这一课不引任何 OTel 库，自己手写一个最小版，三件套：

1. **结构化日志**：每次模型请求、每次工具调用各写一条 JSON Lines 到 `run.log.jsonl`。
2. **trace 树**：跑完之后从那份 JSONL 重建出父子关系，缩进打印。
3. **指标汇总**：一行输出总轮数、工具调用次数、token、报错数、总耗时。

### span 模型：谁是谁的爹

官方开了增强遥测之后，Agent 循环的每一步都变成一个可以检视的 span：一次交互是根 span，模型请求和工具执行是它的子 span[^S6]。注意官方那棵树里，模型请求和工具调用是根底下的**平级兄弟**——第 4 课你重建的那棵就是这个形状。我们这个最小版刻意换了个挂法：把工具调用挂到**触发它的那次模型请求**底下，这样树的形状直接画出「模型这一轮想干几件事」，并行的工具在同一个爹底下一眼可见。父子关系的机制完全一样，只是给工具选了不同的父亲——两种挂法都对，选哪种取决于你想让树先回答哪个问题。我们的三层长这样：

```text
agent_run                 ← 一次运行，根记录
├─ model_call turn-1      ← 一次 messages.create
│  └─ tool_call ...       ← 这一轮模型请求出来的工具调用
├─ model_call turn-2
│  ├─ tool_call ...       ← 同一轮里并行请求的多个工具，是兄弟
│  ├─ tool_call ...
│  └─ tool_call ...
└─ model_call turn-3
```

父子关系不靠内存里的调用栈，靠日志里的两个字段：每条记录带一个 `span_id`，再带一个 `parent_id` 指向它爹。树是**跑完之后从磁盘上的 JSONL 重建出来的**，不是边跑边打印的。这一点很要紧：树上能看到的东西，日志里必须先记下来。你如果发现树上少了什么，那不是打印代码的问题，是记录代码的问题。

### 字段表

下面这份字段设计是本课的工程口径，不是官方规范——官方那边给的是 OTel 的 span 属性名，你自己写 harness 的时候字段叫什么由你定。有四个名字和第 3、4 课不一样，先对个表免得你以为写错了：第 3 课的 `type` 在这里叫 `kind`（那边只有两类记录，这边多了 `agent_run`，换个语义更宽的词）；`input_tokens`/`output_tokens` 收进了 `tokens:{input,output}` 一个对象（模型调用独有的东西打包放）；`tool_response` 在这里叫 `tool_result`（hook 载荷管它叫 response，这里的返回值直接来自工具实现，沿用 API 内容块的叫法）；第 4 课的 `parent_span_id` 缩成 `parent_id`。代价也明说：第 3 课那个 `stats.mjs` 要改两个字段名才能读这份日志——这正是「口径统一比起名好听重要」的一次现身说法。字段的**词汇**仍然值得对齐官方材料，你以后真接了后端不用换概念，只用换拼写：

| 字段 | 放什么 | 为什么要它 |
| --- | --- | --- |
| `ts` | ISO 时间戳 | 排序、对时，跨进程时唯一能对上的东西 |
| `trace_id` | 一次运行一个 | 把散落的行串回同一次运行 |
| `span_id` / `parent_id` | 本条 / 父条的 id | 重建树，靠它认「谁在谁下面」 |
| `kind` | `model_call` / `tool_call` / `agent_run` | 过滤时第一个用上的字段 |
| `name` | `turn-2` / `read_file` | 人读的时候第一眼看它 |
| `duration_ms` | 这一步耗时 | 找性能瓶颈，也用来看「是不是卡住了」 |
| `tokens` | 模型调用的 in / out | 官方数据里 token 用量是最强的单一解释变量[^S1] |
| `tool_input` / `tool_result` | 形状 + 长度 + 截断摘要 | 判断「参数对不对」「返回是不是空的」 |
| `error` | 报错文案的摘要，没报错就 `null` | 定位时第一个要过滤的字段 |

`trace_id` 这一招是从官方那儿学的：一次用户提示会触发好几次 API 调用和好几个工具，官方用 `prompt.id` 这个属性把它们全串回触发它们的那一次提示；官方给的追法也很直接——要追一次提示触发的全部活动，就按某个具体的 `prompt.id` 过滤事件[^S4]。我们这里一次运行就是一次任务，所以用 `trace_id`，作用完全一样。顺带说一句这里没有 `session_id`：这个脚本一次运行就是一场会话，这个字段留着没意义；多轮多会话的场景把它加回来，口径见第 3 课。

指标那一行也不是我随便挑的。除了顶层准确率之外，官方建议收集的是：单次工具调用和整个任务的总时长、工具调用总次数、总 token 消耗、工具报错[^S3]——这四样在汇总行和每条记录的 `duration_ms` 里都有落点。`rounds` 是我自己加的第五个数，方便一眼看循环转了几圈。本系列第 10 门课里你已经用过官方那一组——那边用来判分，这边同一把尺子用来诊断。

### 内容记多少：这是本课唯一一个需要你自己划线的地方

`tool_input` 和 `tool_result` 里可能是整份 CSV、整段用户输入、整份写出去的文档。全记进日志技术上一行代码的事，但默认不该这么干。

官方遥测的默认取向很明确：**结构性的东西一律记，内容一律不记**——每个 span 上都有时长、模型名、工具名，token 数在 API 返回用量时记，而 Agent 读到和写出的内容默认不采集[^S6]。用户提示词也一样，默认只记长度，要记内容得单独开一个环境变量[^S4]。而且官方给这类开关配了一句很硬的话：除非你的观测管道被批准存放你的 Agent 处理的这类数据，否则别设它们[^S6]。

我们这层留了一个折中：默认记 `shape`（是字符串还是对象、多长、有哪些键）、`chars`（字符数），外加前 60 个字符的头部摘要。摘要是为了自己 debug 的时候能一眼认出「这次读的是哪个文件」，不用反复复跑。代码里那个 `HEAD_CHARS = 60` 就是这条线的位置，设成 `0` 就一个字的内容都不落盘。你自己的项目里这条线画在哪儿，取决于日志落到哪儿、谁能看、有没有过数据审批——这是个合规问题，不是技术问题。

## 验证桥段：三个版本的差异钉死在哪儿

这一课要跑三次：正常的一次、出事的一次、修好的一次。三次的输出要能逐行对比，所以**模型响应不能是真的**——真的模型每次跑都不一样，你没法拿它教定位。

沿用本系列第 8 到第 10 门课的老办法：**固定响应队列的桩 client**。`client.messages.create()` 不发网络请求，从一个数组里按顺序返回预先写好的响应对象，每个对象都带完整的 `stop_reason`、`content`、`usage`。harness 循环那边一个字都不用改——它拿到的东西和真 client 返回的形状完全一致。

三个版本的差异全部钉死在代码里的 `VERSIONS` 这一张表里，每个版本两样东西：

| 版本 | 响应队列 | `read_file` 的报错文案 | 结果 |
| --- | --- | --- | --- |
| `v-good` | 三份 CSV 全读对 | 晦涩版 | `summary.md` 正确 |
| `v-bug` | 第二份文件名拼成 `sourth` | 晦涩版 | 编出一个华中区 |
| `v-fixed` | 同样拼成 `sourth` | 带可执行建议版 | 回头重读，结果正确 |

除了这张表，**其余每一行代码三个版本共用**。工具是真的读写磁盘：`list_files` 真的 `readdirSync`，`read_file` 真的读文件、真的因为文件不存在而抛错，`write_file` 真的把 `summary.md` 写到盘上。所以 `v-bug` 里那次报错不是我伪造的错误对象，是文件系统真的没找到那个文件。

要说清楚的是：桩解决的是「模型这一侧可复现」，不是「Agent 就是确定性的」。真跑起来的时候，同一个提示词两次可能选不同的工具、走不同的路径[^S1]。这一层观测的价值恰恰在这儿——路径每次不一样，但每次都有一份能对着看的记录。

## 完整代码：observed-agent.mjs

一整个文件，零依赖，`node` 裸跑。存成 `observed-agent.mjs`，然后 `node observed-agent.mjs --version v-bug` 就能跑。

```javascript
#!/usr/bin/env node
// observed-agent.mjs —— 给 harness 装上观测层（结构化日志 + trace 树 + 指标汇总）
// 跑法：node observed-agent.mjs --version v-good|v-bug|v-fixed
// 零依赖，node 裸跑。模型调用由固定响应队列的桩 client 驱动，三个版本的差异全部在下面的 VERSIONS 表里。
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

const MODEL = "claude-sonnet-4-5";
const MAX_TOKENS = 4096;
const MAX_ROUNDS = 12;      // 循环上限：超了就当作跑飞，非零退出
const HEAD_CHARS = 60;      // 日志里每段内容最多留多少字符的摘要；设成 0 就一个字都不记

// ============ 1. 被测任务：从 data/ 读几份销售 CSV，汇总各区合计，写出 summary.md ============

const CSV_FILES = {
  "2026-q1-east.csv":
    "region,month,amount\n华东,2026-01,182400\n华东,2026-02,161250\n华东,2026-03,204900\n",
  "2026-q1-south.csv":
    "region,month,amount\n华南,2026-01,97300\n华南,2026-02,88600\n华南,2026-03,120450\n",
  "2026-q1-north.csv":
    "region,month,amount\n华北,2026-01,143000\n华北,2026-02,150700\n华北,2026-03,138900\n",
};

function setupWorkspace(root) {
  fs.rmSync(root, { recursive: true, force: true });
  fs.mkdirSync(path.join(root, "data"), { recursive: true });
  for (const [name, body] of Object.entries(CSV_FILES)) {
    fs.writeFileSync(path.join(root, "data", name), body);
  }
}

// ============ 2. 三个工具（真实读写磁盘，报错也是真的报错） ============

const tools = [
  {
    name: "list_files",
    description: "列出一个目录下的文件名，按字典序返回，每行一个。",
    input_schema: {
      type: "object",
      properties: { dir: { type: "string", description: "相对工作目录的路径，例如 data" } },
      required: ["dir"],
    },
  },
  {
    name: "read_file",
    description: "按路径读取一个文本文件，返回全文。路径必须用 list_files 返回的原样文件名。",
    input_schema: {
      type: "object",
      properties: { path: { type: "string", description: "相对工作目录的文件路径" } },
      required: ["path"],
    },
  },
  {
    name: "write_file",
    description: "把一段文本写到指定路径，覆盖同名文件。",
    input_schema: {
      type: "object",
      properties: {
        path: { type: "string", description: "相对工作目录的文件路径" },
        content: { type: "string", description: "要写入的完整文本" },
      },
      required: ["path", "content"],
    },
  },
];

function resolveInRoot(root, p) {
  const abs = path.resolve(root, p);
  if (abs !== root && !abs.startsWith(root + path.sep)) {
    throw new Error(`路径越界，拒绝访问：${p}`);
  }
  return abs;
}

const impls = {
  list_files({ dir }, ctx) {
    const abs = resolveInRoot(ctx.root, dir);
    return fs.readdirSync(abs).sort().join("\n");
  },
  read_file({ path: p }, ctx) {
    const abs = resolveInRoot(ctx.root, p);
    if (fs.existsSync(abs)) return fs.readFileSync(abs, "utf8");
    // 同一个「文件不存在」，两套文案。v-fixed 用的是带可执行建议的那套。
    if (ctx.errorStyle === "actionable") {
      const available = fs
        .readdirSync(path.join(ctx.root, "data"))
        .sort()
        .map((f) => `data/${f}`)
        .join("、");
      throw new Error(
        `找不到文件 ${p}。data/ 目录下现有：${available}。` +
          `请用 list_files 返回的原样文件名重试；如果你要的那份数据确实不在里面，` +
          `停下来告诉用户缺哪份文件，不要自己估算缺失的数字。`
      );
    }
    throw new Error(`ENOENT: no such file or directory, open '${p}'`);
  },
  write_file({ path: p, content }, ctx) {
    const abs = resolveInRoot(ctx.root, p);
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, content);
    return `已写入 ${p}（${content.length} 字符）`;
  },
};

// ============ 3. 桩 client：固定响应队列 ============

const SUMMARY_CORRECT = `# 2026 Q1 各区销售汇总

| 区 | 合计（元） |
| --- | --- |
| 华东 | 548550 |
| 华南 | 306350 |
| 华北 | 432600 |
| 总计 | 1287500 |

数据来源：data/2026-q1-east.csv、data/2026-q1-south.csv、data/2026-q1-north.csv
`;

const SUMMARY_FABRICATED = `# 2026 Q1 各区销售汇总

| 区 | 合计（元） |
| --- | --- |
| 华东 | 548550 |
| 华中 | 208000 |
| 华北 | 432600 |
| 总计 | 1189150 |

数据来源：data/ 目录下的季度销售 CSV
`;

const say = (text) => ({ type: "text", text });
const call = (id, name, input) => ({ type: "tool_use", id, name, input });
const turn = (stop_reason, content, input_tokens, output_tokens) => ({
  id: `msg_stub_${crypto.randomBytes(3).toString("hex")}`,
  model: MODEL,
  stop_reason,
  content,
  usage: { input_tokens, output_tokens },
});

const READ_EAST = call("toolu_e", "read_file", { path: "data/2026-q1-east.csv" });
const READ_NORTH = call("toolu_n", "read_file", { path: "data/2026-q1-north.csv" });
const READ_SOUTH = call("toolu_s", "read_file", { path: "data/2026-q1-south.csv" });
const READ_TYPO = call("toolu_x", "read_file", { path: "data/2026-q1-sourth.csv" });

const VERSIONS = {
  // 顺风局：三份 CSV 都读到了，汇总正确。
  "v-good": {
    errorStyle: "opaque",
    queue: [
      turn("tool_use", [say("先看看 data/ 下有哪些文件。"), call("toolu_l", "list_files", { dir: "data" })], 812, 96),
      turn("tool_use", [say("三份区域 CSV，我一起读。"), READ_EAST, READ_SOUTH, READ_NORTH], 946, 218),
      turn("tool_use", [say("三个区都拿到了，写汇总。"), call("toolu_w", "write_file", { path: "summary.md", content: SUMMARY_CORRECT })], 1584, 342),
      turn("end_turn", [say("已写出 summary.md：华东 548550、华南 306350、华北 432600，总计 1287500。")], 1961, 74),
    ],
  },
  // 出事版：第二份 CSV 的文件名拼错了，工具报了个晦涩的错，模型没停，编了一个区继续写。
  "v-bug": {
    errorStyle: "opaque",
    queue: [
      turn("tool_use", [say("先看看 data/ 下有哪些文件。"), call("toolu_l", "list_files", { dir: "data" })], 812, 96),
      turn("tool_use", [say("三份区域 CSV，我一起读。"), READ_EAST, READ_TYPO, READ_NORTH], 946, 218),
      turn("tool_use", [say("数据齐了，写汇总。"), call("toolu_w", "write_file", { path: "summary.md", content: SUMMARY_FABRICATED })], 1602, 355),
      turn("end_turn", [say("已写出 summary.md：华东 548550、华中 208000、华北 432600，总计 1189150。")], 1990, 81),
    ],
  },
  // 修好版：同样拼错，但报错文案换成带可执行建议的，模型改成回去求证而不是编。
  "v-fixed": {
    errorStyle: "actionable",
    queue: [
      turn("tool_use", [say("先看看 data/ 下有哪些文件。"), call("toolu_l", "list_files", { dir: "data" })], 812, 96),
      turn("tool_use", [say("三份区域 CSV，我一起读。"), READ_EAST, READ_TYPO, READ_NORTH], 946, 218),
      turn("tool_use", [say("我把文件名拼成了 sourth，按报错里给的原样文件名重读。"), READ_SOUTH], 1688, 64),
      turn("tool_use", [say("三个区都拿到了，写汇总。"), call("toolu_w", "write_file", { path: "summary.md", content: SUMMARY_CORRECT })], 1849, 342),
      turn("end_turn", [say("已写出 summary.md：华东 548550、华南 306350、华北 432600，总计 1287500。补充一句：我第一次把文件名拼成了 data/2026-q1-sourth.csv，已按 list_files 的原样名重取。如果 data/ 之外还有别的区的数据，请告诉我文件在哪，我不会自己补数字。")], 2226, 118),
    ],
  },
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
          const err = new Error(`桩队列耗尽：第 ${i + 1} 次请求没有预设响应`);
          err.code = "STUB_QUEUE_EXHAUSTED";
          throw err;
        }
        return queue[i++];
      },
    },
  };
}

// ============ 4. 观测层之一：结构化日志（JSON Lines） ============

const newId = (prefix) => `${prefix}-${crypto.randomBytes(4).toString("hex")}`;

function shapeOf(value) {
  if (value === null || value === undefined) return "null";
  if (Array.isArray(value)) return `array(${value.length})`;
  if (typeof value === "string") return `string(${value.length})`;
  if (typeof value === "object") return `object{${Object.keys(value).join(",")}}`;
  return typeof value;
}

// 默认只记形状 + 长度 + 前 HEAD_CHARS 个字符的摘要，不记全文。
function summarize(value) {
  const text = typeof value === "string" ? value : JSON.stringify(value ?? null);
  const out = { shape: shapeOf(value), chars: text.length };
  if (HEAD_CHARS > 0) {
    const flat = text.replace(/\s+/g, " ").trim();
    out.head = flat.length > HEAD_CHARS ? `${flat.slice(0, HEAD_CHARS)}…` : flat;
  }
  return out;
}

function createLogger(logPath, traceId) {
  fs.writeFileSync(logPath, "");
  return {
    record(fields) {
      const line = { ts: new Date().toISOString(), trace_id: traceId, ...fields };
      fs.appendFileSync(logPath, `${JSON.stringify(line)}\n`);
    },
  };
}

// ============ 5. 观测层之二：从 JSONL 重建 trace 树 ============

function buildTree(records) {
  const byId = new Map(records.map((r) => [r.span_id, { ...r, children: [] }]));
  const roots = [];
  for (const node of byId.values()) {
    const parent = node.parent_id ? byId.get(node.parent_id) : null;
    if (parent) parent.children.push(node);
    else roots.push(node);
  }
  return roots;
}

const clip = (s, n) => (s.length > n ? `${s.slice(0, n)}…` : s);

function labelOf(n) {
  const name = n.name.padEnd(13);
  const dur = `${String(n.duration_ms).padStart(3)}ms`;
  if (n.kind === "agent_run") return `agent_run  ${name}${dur}  trace_id=${n.trace_id}`;
  if (n.kind === "model_call") {
    const t = n.tokens;
    return `model_call ${name}${dur}  in=${t.input} out=${t.output}  stop=${n.stop_reason}`;
  }
  if (n.kind === "harness_error") return `harness_err ${name}${dur}  ${n.error.head ?? n.error.shape}`;
  const inHead = clip(n.tool_input.head ?? n.tool_input.shape, 34);
  const out = n.error ? `ERROR ${clip(n.error.head ?? n.error.shape, 44)}` : `ok ${n.tool_result.shape}`;
  return `tool_call  ${name}${dur}  in=${inHead}  ${out}`;
}

function renderTree(nodes, prefix, lines) {
  nodes.forEach((node, idx) => {
    const last = idx === nodes.length - 1;
    lines.push(prefix === null ? labelOf(node) : `${prefix}${last ? "└─ " : "├─ "}${labelOf(node)}`);
    const childPrefix = prefix === null ? "" : `${prefix}${last ? "   " : "│  "}`;
    renderTree(node.children, childPrefix, lines);
  });
  return lines;
}

// ============ 6. 观测层之三：指标汇总 ============

function metricsOf(records) {
  const model = records.filter((r) => r.kind === "model_call");
  const tool = records.filter((r) => r.kind === "tool_call");
  const root = records.find((r) => r.kind === "agent_run");
  return {
    // 这个 harness 里一轮恰好等于一次模型请求，所以 rounds 直接取 model_calls；
    // 桩队列耗尽抛 harness_error 时，最后一轮没有对应的 model_call——那种运行里两个数会差 1
    rounds: model.length,
    model_calls: model.length,
    tool_calls: tool.length,
    errors: records.filter((r) => r.error).length,
    tokens_in: model.reduce((s, r) => s + r.tokens.input, 0),
    tokens_out: model.reduce((s, r) => s + r.tokens.output, 0),
    wall_ms: root ? root.duration_ms : 0,
  };
}

// ============ 7. 被观测的 harness 循环 ============

async function runToolUses(content, ctx) {
  const results = [];
  for (const block of content) {
    if (block.type !== "tool_use") continue;
    const spanId = newId("span");
    const startedAt = Date.now();
    const base = {
      span_id: spanId,
      parent_id: ctx.parentId,
      kind: "tool_call",
      name: block.name,
      tool_input: summarize(block.input),
    };
    try {
      const impl = impls[block.name];
      if (!impl) throw new Error(`未知工具：${block.name}`);
      const result = impl(block.input, ctx);
      ctx.log.record({ ...base, duration_ms: Date.now() - startedAt, tool_result: summarize(result), error: null });
      results.push({ type: "tool_result", tool_use_id: block.id, content: result });
    } catch (e) {
      ctx.log.record({ ...base, duration_ms: Date.now() - startedAt, tool_result: null, error: summarize(e.message) });
      results.push({ type: "tool_result", tool_use_id: block.id, content: e.message, is_error: true });
    }
  }
  return results;
}

async function main() {
  const argv = process.argv.slice(2);
  const version = argv[argv.indexOf("--version") + 1];
  if (!argv.includes("--version") || !VERSIONS[version]) {
    console.error("用法：node observed-agent.mjs --version v-good|v-bug|v-fixed");
    process.exit(2);
  }

  const root = path.resolve(process.cwd(), "runs", version);
  setupWorkspace(root);

  const traceId = newId("tr");
  const log = createLogger(path.join(root, "run.log.jsonl"), traceId);
  const rootSpan = newId("span");
  const runStartedAt = Date.now();

  const { queue, errorStyle } = VERSIONS[version];
  const client = makeStubClient(queue);
  const ctx = { root, errorStyle, log, parentId: rootSpan };
  const messages = [
    {
      role: "user",
      content: "把 data/ 目录下的销售 CSV 汇总成各区合计，写到 summary.md。只用文件里真实存在的数据。",
    },
  ];

  let rounds = 0;
  let exitCode = 0;
  const callModel = async () => {
    const spanId = newId("span");
    const startedAt = Date.now();
    rounds += 1;
    const response = await client.messages.create({ model: MODEL, max_tokens: MAX_TOKENS, tools, messages });
    log.record({
      span_id: spanId,
      parent_id: rootSpan,
      kind: "model_call",
      name: `turn-${rounds}`,
      duration_ms: Date.now() - startedAt,
      stop_reason: response.stop_reason,
      tokens: { input: response.usage.input_tokens, output: response.usage.output_tokens },
      error: null,
    });
    ctx.parentId = spanId;
    return response;
  };

  try {
    let response = await callModel();
    while (response.stop_reason === "tool_use") {
      if (rounds >= MAX_ROUNDS) throw new Error(`超过 MAX_ROUNDS=${MAX_ROUNDS}，判定为跑飞`);
      messages.push({ role: "assistant", content: response.content });
      const toolResults = await runToolUses(response.content, ctx);
      messages.push({ role: "user", content: toolResults });
      response = await callModel();
    }
  } catch (e) {
    log.record({
      span_id: newId("span"),
      parent_id: rootSpan,
      kind: "harness_error",
      name: e.code ?? "harness_error",
      duration_ms: 0,
      error: summarize(e.message),
    });
    console.error(`harness 中断：${e.message}`);
    exitCode = 2;
  }

  log.record({
    span_id: rootSpan,
    parent_id: null,
    kind: "agent_run",
    name: "sales-summary",
    duration_ms: Date.now() - runStartedAt,
    error: null,
  });

  // 跑完之后，只从磁盘上的 JSONL 重建视图——内存里那份不算数。
  const records = fs
    .readFileSync(path.join(root, "run.log.jsonl"), "utf8")
    .split("\n")
    .filter(Boolean)
    .map((l) => JSON.parse(l));

  const m = metricsOf(records);
  console.log(`\n=== trace 树（${version}，从 run.log.jsonl 重建）===`);
  console.log(renderTree(buildTree(records), null, []).join("\n"));
  console.log(
    `\n=== 指标汇总（${version}）===\n` +
      `rounds=${m.rounds} model_calls=${m.model_calls} tool_calls=${m.tool_calls} ` +
      `errors=${m.errors} tokens_in=${m.tokens_in} tokens_out=${m.tokens_out} ` +
      `tokens_total=${m.tokens_in + m.tokens_out} wall=${m.wall_ms}ms`
  );
  console.log(`日志：runs/${version}/run.log.jsonl　产物：runs/${version}/summary.md`);
  process.exit(exitCode);
}

main();
```

几处值得单独说一句的：

- **循环本身没变。** 本系列第 7 门课那个 `while (response.stop_reason === "tool_use")` 一个字都没动，观测是包在外面的：`callModel()` 在请求前后各记一个时间戳，`runToolUses()` 在每个工具块外面套了一层 try/catch 加计时。你把这两个包装扒掉，剩下的就是原来那个循环。
- **`MAX_ROUNDS` 是硬闸。** Agent 得有停止条件，比如最大迭代次数，这是控制权的一部分[^S2]。超了就抛错、记一条 `harness_error`、退出码 2。
- **退出码分工。** 这个脚本只负责跑和记录，跑完了就是 0；参数不对或者跑飞了才非零。「跑出来的东西对不对」是本系列第 10 门课那套验证器的活儿——注意 `v-bug` 也是退出码 0，harness 认为它顺利跑完了。验证告诉你挂没挂，这一层告诉你为什么。
- **工具报错不中断循环。** 报错被包成 `is_error: true` 的 `tool_result` 塞回去给模型，循环继续。这是对的——Agent 每一步要从环境拿到实打实的反馈来判断进度[^S2]，报错也是反馈。这一课的整个 bug 就发生在这句话的下半场：反馈给到了，但给得太烂。

## 先跑顺风局：v-good

先看正常长什么样。下面这一段和后面所有终端输出**都是真跑出来的，不是我手写的示例**。

```text
$ node observed-agent.mjs --version v-good

=== trace 树（v-good，从 run.log.jsonl 重建）===
agent_run  sales-summary 16ms  trace_id=tr-0f4f0551
├─ model_call turn-1         0ms  in=812 out=96  stop=tool_use
│  └─ tool_call  list_files     4ms  in={"dir":"data"}  ok string(52)
├─ model_call turn-2         0ms  in=946 out=218  stop=tool_use
│  ├─ tool_call  read_file      0ms  in={"path":"data/2026-q1-east.csv"}  ok string(74)
│  ├─ tool_call  read_file      1ms  in={"path":"data/2026-q1-south.csv"}  ok string(72)
│  └─ tool_call  read_file      0ms  in={"path":"data/2026-q1-north.csv"}  ok string(74)
├─ model_call turn-3         0ms  in=1584 out=342  stop=tool_use
│  └─ tool_call  write_file     1ms  in={"path":"summary.md","content":"# …  ok string(22)
└─ model_call turn-4         0ms  in=1961 out=74  stop=end_turn

=== 指标汇总（v-good）===
rounds=4 model_calls=4 tool_calls=5 errors=0 tokens_in=5303 tokens_out=730 tokens_total=6033 wall=16ms
日志：runs/v-good/run.log.jsonl　产物：runs/v-good/summary.md
```

你跑出来的 `trace_id`、`span_id`、`ts` 和各处的毫秒数会和我这份不一样——id 是每次运行随机生成的，毫秒是真实耗时。除这些之外每一行都应该逐字相同。

这棵树读下来是一句完整的话：先列目录（`turn-1`），然后**一轮之内并行读了三个文件**（`turn-2` 底下三个兄弟节点），再写文件（`turn-3`），最后收尾（`turn-4`，`stop=end_turn`）。并行那三条是同一次模型响应里的三个 `tool_use` 块，所以它们的 `parent_id` 指向同一个 `model_call` ——树的形状直接把「模型这一轮想干几件事」画出来了。

`model_call` 那一列的 `0ms` 别当真：桩 client 没有网络往返，所以模型请求的耗时全是 0。接了真 API 之后这一列才有诊断价值——追踪 API 请求时长和工具执行时长正是用来找性能瓶颈的[^S4]。

日志文件长这样，每行一条完整的 JSON，可以直接 `grep`：

```text
$ head -3 runs/v-good/run.log.jsonl
{"ts":"2026-08-26T09:01:32.516Z","trace_id":"tr-0f4f0551","span_id":"span-c72deaec","parent_id":"span-69103346","kind":"model_call","name":"turn-1","duration_ms":0,"stop_reason":"tool_use","tokens":{"input":812,"output":96},"error":null}
{"ts":"2026-08-26T09:01:32.528Z","trace_id":"tr-0f4f0551","span_id":"span-8fb2e82a","parent_id":"span-c72deaec","kind":"tool_call","name":"list_files","tool_input":{"shape":"object{dir}","chars":14,"head":"{\"dir\":\"data\"}"},"duration_ms":4,"tool_result":{"shape":"string(52)","chars":52,"head":"2026-q1-east.csv 2026-q1-north.csv 2026-q1-south.csv"},"error":null}
{"ts":"2026-08-26T09:01:32.528Z","trace_id":"tr-0f4f0551","span_id":"span-833bd890","parent_id":"span-69103346","kind":"model_call","name":"turn-2","duration_ms":0,"stop_reason":"tool_use","tokens":{"input":946,"output":218},"error":null}
```

第二行就是那次 `list_files`：`parent_id` 指向第一行的 `span_id`（所以它挂在 `turn-1` 底下），`tool_input` 里只有形状、长度和一小截摘要，`tool_result` 同理——`shape` 是 `string(52)`，`head` 里是三个文件名。这一行里没有任何一个字节是「文件正文」，但你已经能回答「这一步调了什么、拿到了什么形状的东西、有没有出错」。

再看指标汇总那行：4 轮、5 次工具调用、0 报错、6033 token，行尾还有总耗时。这一行数字每次跑完都值得扫一眼——工具调用次数能暴露 Agent 反复走的固定套路，一堆冗余调用往往提示分页或者 token 上限参数该调了；而一堆参数无效的报错，可能说明工具描述得写得更清楚、例子得给得更足[^S3]。token 尤其值得盯：官方分析评测表现时发现，光是 token 用量本身就解释了 80% 的方差，另外两个解释变量是工具调用次数和模型选择[^S1]。

```agentmentor-check
{
  "id": "obs-zh-06-log-everything",
  "label": "工具的输入输出该记多全",
  "prompt": "你刚把这层观测接进项目。同事看了一眼日志，说日志里 tool_input 和 tool_result 只有前 60 个字符的摘要太抠了，建议改成把每次工具调用的完整输入输出原文都记进去：「反正磁盘便宜，记全了总没错，真出事的时候什么都在。」你会怎么回应？",
  "whyHere": "读者刚看完真实的 run.log.jsonl，里面的 head 字段确实是截断的——这是本课观测层唯一一处需要自己划线的设计决定，也是最容易被「记全总没错」这句直觉带偏的地方，正好在这里检查他是否理解默认取向和开全文的前提条件",
  "mode": "single",
  "choices": [
    {
      "id": "a",
      "text": "同意，磁盘确实便宜，全文记下来最保险，出事时不用复跑就能还原现场",
      "correct": false,
      "feedback": "「记全总没错」只在磁盘这一个维度上成立。日志里躺的是 Agent 读过和写过的业务内容——用户输入、文件正文、写出去的文档，这些东西一旦落进一个当初只按「运维日志」申请过权限的地方，就成了没人管的敏感数据副本。而且文件会涨得很快：一次运行几十条记录，每条塞几 KB 全文，跑上几千次之后 grep 一次都要等半天，反而更难查。真需要全文的时候，正确的做法是去读会话转录本身，而不是在遥测日志里囤一份。"
    },
    {
      "id": "b",
      "text": "默认还是记结构和摘要——形状、长度、前几十个字符，这够定位到「哪一步、哪个参数、返回是不是空的」；要记全文得先确认日志落盘的地方被批准存这类数据，抽查需要全文时去读会话转录",
      "correct": true,
      "feedback": "对。官方遥测的默认取向就是这样：时长、模型名、工具名这些结构性的东西每个 span 都记，token 数在返回用量时记，而 Agent 读到和写出的内容默认不采集；提示词也一样，默认只记长度，要记内容得单独开开关。而且官方对这类开关的说法是「除非你的观测管道被批准存放这类数据，否则别设它们」——这是一句合规约束，不是性能建议。定位问题真正靠的是结构：哪一步、什么参数、返回是什么形状、有没有报错。全文是抽查时才需要的东西，去读转录就行。"
    },
    {
      "id": "c",
      "text": "反过来，内容一个字都别记，只统计各个工具被调了多少次就够了，剩下的靠复跑重现",
      "correct": false,
      "feedback": "矫枉过正了，而且「靠复跑重现」这条路在 Agent 上是走不通的——同样的提示词两次运行会走不同但都合法的路径，你复跑十次可能十次都是对的。只有次数统计，你连「那次报错的 read_file 传的是哪个路径」都答不上来，这一课的整个定位过程第一步就断了。真正的分界线不在「记不记」，而在「记结构还是记正文」：形状、长度、参数名、报错文案属于结构，能定位；文件正文和用户原话属于内容，默认不落盘。"
    }
  ]
}
```

## 复现症状：v-bug

现在跑出事的那次。桩队列里埋的是本课开头那个真实分岔，跑之前先别看，自己从输出里找。

```text
$ node observed-agent.mjs --version v-bug

=== trace 树（v-bug，从 run.log.jsonl 重建）===
agent_run  sales-summary 16ms  trace_id=tr-b8934bdd
├─ model_call turn-1         0ms  in=812 out=96  stop=tool_use
│  └─ tool_call  list_files     1ms  in={"dir":"data"}  ok string(52)
├─ model_call turn-2         0ms  in=946 out=218  stop=tool_use
│  ├─ tool_call  read_file      1ms  in={"path":"data/2026-q1-east.csv"}  ok string(74)
│  ├─ tool_call  read_file      0ms  in={"path":"data/2026-q1-sourth.csv"}  ERROR ENOENT: no such file or directory, open 'dat…
│  └─ tool_call  read_file      1ms  in={"path":"data/2026-q1-north.csv"}  ok string(74)
├─ model_call turn-3         0ms  in=1602 out=355  stop=tool_use
│  └─ tool_call  write_file     1ms  in={"path":"summary.md","content":"# …  ok string(22)
└─ model_call turn-4         0ms  in=1990 out=81  stop=end_turn

=== 指标汇总（v-bug）===
rounds=4 model_calls=4 tool_calls=5 errors=1 tokens_in=5350 tokens_out=750 tokens_total=6100 wall=16ms
日志：runs/v-bug/run.log.jsonl　产物：runs/v-bug/summary.md
```

产物确实错了：

```text
$ cat runs/v-bug/summary.md
# 2026 Q1 各区销售汇总

| 区 | 合计（元） |
| --- | --- |
| 华东 | 548550 |
| 华中 | 208000 |
| 华北 | 432600 |
| 总计 | 1189150 |

数据来源：data/ 目录下的季度销售 CSV
```

先注意几件从外面看不出来的事：

- 轮数、工具调用次数和 `v-good` 完全一样：4 轮、5 次调用。光看这两个数，两次运行长得一模一样。
- token 只多了 67 个（6100 对 6033）。要是你的告警是「token 超阈值」，这次根本不会响。
- 只有 `errors=1` 这一个数字变了。这就是为什么工具报错必须是指标里的一等公民[^S3]——它是这次运行里唯一一个从汇总层面就能看出不对劲的信号。
- 最后那次 `model_call` 是 `stop=end_turn`，Agent 认为自己**顺利完成了任务**。它没报错、没求助、没提缺了一份数据。它在反馈里省略掉的东西，往往比它说出来的更要紧[^S3]。

## 五步定位：从症状追到第一处分岔

第 5 课那套五步定位是通用编排；这次的材料特殊——三份可以逐行对比的日志摆在手边——所以五步里有三步换了形态，对照着写清楚：

| 第 5 课的通用步骤 | 这次的形态 | 为什么变 |
| --- | --- | --- |
| 1 收窄 | 固定住这一次运行 | 一样，按 id 过滤 |
| 2 找第一处分岔 | 在树里指认 | 一样，只是证据变成了树 |
| 3 重放观察 | 把下游认成传染 | 桩本身就是钉死的重放，这一步的位置让给传染分析 |
| 4 反复压同一个组件 | 定因 | 三份日志可逐行对比，不用靠反复压来逼出概率性毛病 |
| 5 修复后从出错处恢复 | 复跑对比 | 见下——两者不矛盾，适用条件不同 |

第五步要单独说一句。第 5 课主张「修完从出错处恢复、别从头重跑」，理由是全量重跑会把非确定性重新放进来，你分不清「修对了」还是「这次运气好」。这一课敢全量复跑，恰恰因为模型侧被桩钉死了——复跑不会引入任何新变量，逐行对比才成立。等你接上真 API，桩没了，就回到第 5 课那条：从出错处恢复。

落到这次的材料上是下面五步。假装你还不知道答案，跟着走一遍。

### 第一步：固定住这一次运行

生产环境里所有运行的日志会混在一条流里。先模拟一下这个处境，把三次运行的日志并起来：

```text
$ cat runs/v-good/run.log.jsonl runs/v-bug/run.log.jsonl runs/v-fixed/run.log.jsonl > all-runs.log.jsonl
$ wc -l < all-runs.log.jsonl
      32
$ grep -c 'tr-b8934bdd' all-runs.log.jsonl
10
```

32 行里，属于出事那次运行的只有 10 行。这一步用的就是官方给的那个追法：要追一次提示词触发的全部活动，就按那个具体的 id 把事件过滤出来[^S4]。名字叫 `prompt.id` 还是 `trace_id` 不重要，重要的是这个 id 存在，而且每条记录都带着它。

顺手可以看看整条流里有几条报错：

```text
$ grep -c '"error":{"shape"' all-runs.log.jsonl
2
```

两条：`v-bug` 一条，`v-fixed` 一条。`v-good` 干干净净。

### 第二步：在树里指认第一处分岔

树已经打出来了，从上往下扫，找**第一条与预期不符的记录**：

```text
│  ├─ tool_call  read_file      0ms  in={"path":"data/2026-q1-sourth.csv"}  ERROR ENOENT: no such file or directory, open 'dat…
```

`turn-2` 底下三个并行读取，中间那条挂了。挂的原因写在 `tool_input` 里：路径是 `data/2026-q1-sourth.csv`——`south` 拼成了 `sourth`。树上那条 `list_files` 只显示 `ok string(52)`，正确的文件名要回日志里捞：把它那条记录翻出来（前面 `head -3` 里你已经见过），`tool_result.head` 写着 `2026-q1-east.csv 2026-q1-north.csv 2026-q1-south.csv`——正确的名字模型是拿到过的。树管定位，日志管细节，两层配合本来就是这么用的。

要看完整那条记录，把它从流里捞出来：

```text
$ node -e '
const fs = require("node:fs");
const TRACE = "tr-b8934bdd";
for (const line of fs.readFileSync("all-runs.log.jsonl", "utf8").split("\n").filter(Boolean)) {
  const r = JSON.parse(line);
  if (r.trace_id === TRACE && r.error) console.log(r.kind, r.name, r.tool_input.head, "->", r.error.head);
}'
tool_call read_file {"path":"data/2026-q1-sourth.csv"} -> ENOENT: no such file or directory, open 'data/2026-q1-sourth…
```

这就是分岔点。注意它是**怎么被认出来的**：不是靠猜，是靠三个字段——`trace_id` 把范围锁到这一次运行，`error` 非空把它从十条记录里挑出来，`tool_input.head` 告诉你参数错在哪儿。三个字段，一个不能少。

### 第三步：把下游的荒唐认成传染，不要单独修

分岔点之后，`turn-3` 让模型写了一份带华中区的汇总，`turn-4` 汇报「任务完成」。这两步看起来都很离谱，但它们都是下游：

| 记录 | 表现 | 是原因还是传染 |
| --- | --- | --- |
| `turn-2` 的 `read_file` 报错 | 参数拼错，工具返回一句 ENOENT | **原因** |
| `turn-3` 的 `write_file` | 写进去一个不存在的华中区 | 传染 |
| `turn-4` 的 `end_turn` | 声称顺利完成 | 传染 |

在 Agent 系统里，一步失败足以让它拐进一条完全不同的轨迹，最后的结果无法预测[^S1]——这里就是最干净的一个例子。如果你只拿到最终的 `summary.md`，你会去修哪儿？多半是去改提示词：「不许编造数据」「必须注明数据来源」。这些改动全都打在传染上，打不着病灶。下次换个文件名拼错法，它照样编。

顺便说一句这次症状为什么长成「华中」而不是「华南少了」：文件名它拿到过（`2026-q1-south.csv` 就在 `list_files` 的返回里），east 对华东、north 对华北的对应关系也已经在前两次成功读取的内容里——它缺的只是那三个月的具体数字。可 `ENOENT` 这句晦涩的报错既没告诉它「重试正确的文件名」，也没告诉它「停下来说清楚」，于是它选了最省事的一条路：把缺失伪装成完整，区名和数字一起补齐一行。编造不是因为它一无所知，是因为报错没给它任何更好的出路。

### 第四步：定因——它拿到的反馈太烂

到这一步别急着骂模型。看看那次报错到底给了它什么：

```text
ENOENT: no such file or directory, open 'data/2026-q1-sourth.csv'
```

这句话对人类工程师来说信息够了，对一个正在决定「下一步干什么」的 Agent 来说几乎是空的。它读不出「这个目录里有哪些文件是可以读的」，读不出「是我拼错了还是这份数据真的不存在」，更读不出「遇到这种情况我应该停下来问，而不是自己补」。Agent 每一步要靠环境给的实打实反馈来判断进度[^S2]，这句 ENOENT 就是它拿到的全部反馈。

官方在工具工程那边给的建议正对这个口子：工具调用抛错的时候，报错响应本身也该好好写，把具体的、可执行的改进建议说清楚，而不是甩一个晦涩的错误码或者堆栈[^S3]。所以这次要改的不是提示词，是 `read_file` 的报错文案。

### 第五步：复跑对比（桩钉死了模型侧，这里可以全量复跑）

修法在下一节，跑完再回来看数字变没变。定位不是在「我知道原因了」这一刻结束的，是在「改完之后同一条 trace 上那一步真的不一样了」这一刻结束的。

## 修复与复跑：v-fixed

改的是代码里 `read_file` 那一段，只有报错文案：

```javascript
if (ctx.errorStyle === "actionable") {
  const available = fs
    .readdirSync(path.join(ctx.root, "data"))
    .sort()
    .map((f) => `data/${f}`)
    .join("、");
  throw new Error(
    `找不到文件 ${p}。data/ 目录下现有：${available}。` +
      `请用 list_files 返回的原样文件名重试；如果你要的那份数据确实不在里面，` +
      `停下来告诉用户缺哪份文件，不要自己估算缺失的数字。`
  );
}
```

这段文案里塞了三样东西：**现状**（目录里实际有什么）、**下一步该干什么**（用原样文件名重试）、**什么时候该停**（数据真不在就问人，别估算）。前两样让模型有路可走，第三样堵死了编造那条路。

`v-fixed` 的响应队列演示模型收到这份报错之后的反应：不再往下编，而是回头向环境求证——按报错里列出来的原样文件名重读一次，最后在收尾那句话里还向用户反问了一句「如果 data/ 之外还有别的区的数据，请告诉我文件在哪，我不会自己补数字」。

```text
$ node observed-agent.mjs --version v-fixed

=== trace 树（v-fixed，从 run.log.jsonl 重建）===
agent_run  sales-summary  7ms  trace_id=tr-80892fc3
├─ model_call turn-1         0ms  in=812 out=96  stop=tool_use
│  └─ tool_call  list_files     1ms  in={"dir":"data"}  ok string(52)
├─ model_call turn-2         0ms  in=946 out=218  stop=tool_use
│  ├─ tool_call  read_file      0ms  in={"path":"data/2026-q1-east.csv"}  ok string(74)
│  ├─ tool_call  read_file      1ms  in={"path":"data/2026-q1-sourth.csv"}  ERROR 找不到文件 data/2026-q1-sourth.csv。data/ 目录下现有：da…
│  └─ tool_call  read_file      0ms  in={"path":"data/2026-q1-north.csv"}  ok string(74)
├─ model_call turn-3         0ms  in=1688 out=64  stop=tool_use
│  └─ tool_call  read_file      1ms  in={"path":"data/2026-q1-south.csv"}  ok string(72)
├─ model_call turn-4         0ms  in=1849 out=342  stop=tool_use
│  └─ tool_call  write_file     0ms  in={"path":"summary.md","content":"# …  ok string(22)
└─ model_call turn-5         0ms  in=2226 out=118  stop=end_turn

=== 指标汇总（v-fixed）===
rounds=5 model_calls=5 tool_calls=6 errors=1 tokens_in=7521 tokens_out=838 tokens_total=8359 wall=7ms
日志：runs/v-fixed/run.log.jsonl　产物：runs/v-fixed/summary.md
```

树的形状变了：`turn-2` 那条 ERROR 还在原地，但它下面多出来一个 `turn-3`，里面是一次拿正确文件名的重读。产物对了：

```text
$ diff runs/v-good/summary.md runs/v-fixed/summary.md
$ echo $?
0
```

两份 `summary.md` 逐字节相同，华中区没了。

三次运行放在一起看：

| | `v-good` | `v-bug` | `v-fixed` |
| --- | --- | --- | --- |
| rounds | 4 | 4 | 5 |
| tool_calls | 5 | 5 | 6 |
| errors | 0 | 1 | 1 |
| tokens_total | 6033 | 6100 | 8359 |
| `summary.md` | 正确 | 有华中区 | 正确 |

有两件事必须说清楚，不然这个修复容易被理解错：

**第一，`errors` 没有归零，也不该归零。** 那次拼错的读取照样报了错，我们只是换了报错文案，让模型能从错里爬出来。真正让 `errors` 归零的修法在另一个方向——把工具描述写得更明确、给上例子，让模型一开始就别拼错。官方给的诊断读法正是这样对应的：大量参数无效的报错，说明工具描述该更清楚、例子该更足[^S3]。这个脚本里 `read_file` 的 description 已经写了「路径必须用 list_files 返回的原样文件名」，显然还不够，下一轮该给它配个正例。

**第二，修复不是免费的。** token 从 6033 涨到 8359，多了三成八，多的是那一轮重读带来的往返。这不是暴涨，但也不是零成本。修复的代价要摆在台面上算，不能只看「结果对了」。

## 这层观测管到哪儿为止

这层东西很小，边界要说清楚，免得你以为装完就有生产可观测性了。

**它管一个进程、一次运行。** 日志是 `appendFileSync` 直接写本地文件，进程被 kill 也不丢——这是刻意的。真接了后端就不是这个待遇了：OTLP 那条路上，导出失败默认是静默的，端点不可达或者拒收，Agent 照跑，遥测被直接丢掉，你的应用里连个报错都看不见；而且遥测是攒一批再按间隔导出，进程在导出之前被杀，批缓冲区里的东西就没了[^S6]。第 4 课讲过的「观测管道会静默骗你」，说的就是这段。本地文件绕开了这个坑，代价是它只在本机。

**接真后端和多进程聚合不在这一课。** 你要把这层接到 Honeycomb、Datadog、Grafana、Langfuse 或者自建 collector 上，走的是 OTLP 那套协议[^S6]，字段要重新映射，那是另一个话题。多个 Agent 进程的日志怎么汇到一起、怎么按服务名区分，同理。

**告警阈值这一课不给数字。** 「工具报错率超过多少要报警」「一次运行超过多少 token 算异常」——官方文档只点了告警这件事该由你的后端来做，没有给任何数字[^S4]。我也不发明。你自己的阈值只能从自己的基线里长出来：先跑一段时间，看正常运行的分布长什么样，再定线。

**内容记录默认是关的。** 上面那个 `HEAD_CHARS = 60` 只留了很短的一截摘要。真要打开全文，前提是你的观测管道被批准存放你的 Agent 处理的这类数据[^S6]——先过数据审批，再改代码，不是反过来。

**采样率、日志保留窗口也不展开。** 一次运行几十行 JSONL，本地跑几百次都不用管；等你需要考虑这些的时候，已经是后端的问题了。

最后一句：这层观测的价值不在它记了多少东西，在于**它让你能提出一个具体的问题**。「它为什么编了个华中区」是个没法回答的问题；「`trace_id=tr-b8934bdd` 这次运行里第一条 `error` 非空的记录是哪条、参数是什么」是个能回答的问题。上了完整的生产 tracing 之后，才谈得上系统性地诊断 Agent 为什么失败、系统性地修[^S1]。

## 💻 练习

<!-- exercises -->

### Level 1：不看讲解，自己读这棵树

下面这棵 trace 树是 `v-bug` 那次运行真跑出来的（就是正文里那份，`trace_id` 和毫秒数会因运行而异）。假装你是第一次见它，同事只丢给你一句「summary.md 里有个我们公司没有的华中区」。

```text
agent_run  sales-summary 16ms  trace_id=tr-b8934bdd
├─ model_call turn-1         0ms  in=812 out=96  stop=tool_use
│  └─ tool_call  list_files     1ms  in={"dir":"data"}  ok string(52)
├─ model_call turn-2         0ms  in=946 out=218  stop=tool_use
│  ├─ tool_call  read_file      1ms  in={"path":"data/2026-q1-east.csv"}  ok string(74)
│  ├─ tool_call  read_file      0ms  in={"path":"data/2026-q1-sourth.csv"}  ERROR ENOENT: no such file or directory, open 'dat…
│  └─ tool_call  read_file      1ms  in={"path":"data/2026-q1-north.csv"}  ok string(74)
├─ model_call turn-3         0ms  in=1602 out=355  stop=tool_use
│  └─ tool_call  write_file     1ms  in={"path":"summary.md","content":"# …  ok string(22)
└─ model_call turn-4         0ms  in=1990 out=81  stop=end_turn
```

同事还把那条 `list_files` 的日志记录捞出来贴给了你——树上它只显示 `ok string(52)`，细节在日志里（id 与毫秒数照例因运行而异）：

```json
{"trace_id":"tr-b8934bdd","span_id":"span-3d81c04a","parent_id":"span-71f2ce09","kind":"tool_call","name":"list_files","tool_input":{"shape":"object{dir}","chars":14,"head":"{\"dir\":\"data\"}"},"duration_ms":1,"tool_result":{"shape":"string(52)","chars":52,"head":"2026-q1-east.csv 2026-q1-north.csv 2026-q1-south.csv"},"error":null}
```

不写代码，用文字回答四个问题：

1. 第一处分岔在**哪一行**？
2. 你判断它是分岔点的**依据**是树上和这条日志里的哪几个字段？说出字段名和它们各自排除了什么可能。
3. 分岔之后哪些行是**传染**，不是独立的毛病？逐行说。
4. 如果手上只有最终那份 `summary.md`，没有这棵树，你多半会把责任**错怪给谁**？为什么那个方向修不好这个 bug？

<!-- rubric -->

- 第 1 题指到 `turn-2` 底下那条带 ERROR 的 `read_file`，并且说出参数是 `data/2026-q1-sourth.csv`（拼错的那个）
- 第 2 题至少说出三个字段各自的作用：`error`（非空，把这一条从其余记录里挑出来）、`tool_input`（暴露参数拼错，排除「文件真的不存在」）、日志里那条 `list_files` 的 `tool_result.head`（证明正确文件名模型拿到过，排除「它不知道有哪些文件」）
- 第 3 题把 `turn-3` 的 `write_file` 和 `turn-4` 的 `end_turn` 都判为传染，并说明它们的荒唐都源于上游那次失败的读取
- 第 4 题指出会错怪给模型的「幻觉」或者提示词，并说明为什么在提示词上加「不许编造」修不好——因为病灶是工具反馈太烂，不是指令不够严

<!-- answer -->

1. 第一处分岔是 `turn-2` 底下三条并行 `read_file` 里的**中间那条**：`in={"path":"data/2026-q1-sourth.csv"}`，结果是 ERROR。它上面两行和下面一行都是 `ok`，只有它挂了。

2. 三个字段合起来才认得出来：

   - `error` 字段非空——这一条是整棵树里唯一带 ERROR 的记录，其余九条都正常。它把候选范围从十条压到一条。
   - `tool_input` 的摘要——路径写的是 `sourth`，不是 `south`。这一条排除了「那份数据真的不存在」这个可能：错的是参数，不是数据。
   - 日志里那条 `list_files` 的 `tool_result.head` 里有 `2026-q1-south.csv`——正确的文件名模型明明拿到过。这条排除了「它不知道目录里有什么」。

   三个字段少任何一个，结论都立不住：只有 `error` 你知道有事发生但不知道错在哪；只有 `tool_input` 你看不出这次调用是成是败；没有那条 `list_files` 的返回，你没法判断模型是不是压根没机会知道正确名字。

3. 分岔之后的两行都是传染：

   - `turn-3` 的 `write_file`：它写进去的华中区是编的，但模型编它的时候手上确实缺一份数据、而且拿到的报错没告诉它缺的是什么。这一步是在上一步的残局上做的决定。
   - `turn-4` 的 `end_turn`：它汇报任务完成、只字不提缺了一份数据。这同样是残局的延续——它自己认为该做的都做了。

   一步失败足以让 Agent 拐进一条完全不同的轨迹，这两行就是那条轨迹上的两个点，不是两个独立的 bug。单独修任何一个，换个失败方式还会长出新的。

4. 只看 `summary.md` 的话，最容易怪到**模型头上**：说它产生幻觉、编造数据，于是往提示词里加「禁止编造数据」「必须注明每个数字来自哪份文件」。这个方向修不好，原因有两层：

   - 病灶不在指令，在反馈。模型那一步收到的全部信息是一句 `ENOENT: no such file or directory`，里面既没有「目录里有哪些文件」，也没有「你应该重试还是停下来问人」。你在提示词里喊得再响，到那一步它手上的材料还是那句话。
   - 提示词是全局的，分岔是局部的。加一句「不许编造」会影响它每一轮的行为，而真正需要改变行为的只有「工具报错之后的下一步」这一个点。改报错文案是打在点上的，改提示词是撒在面上的。

   顺带一提：如果连 `trace_id` 都没有、日志混在一条流里，你连「哪十行属于这次运行」都圈不出来，这四个问题一个都开不了头。

<!-- hint -->

从上往下扫，别从 `summary.md` 往回倒推。第一条与预期不符的记录出现在哪一层？「与预期不符」在这棵树上有一个非常明显的视觉标记。

<!-- hint -->

第 2 题要的不是「因为它写着 ERROR」，而是**三个**字段各排除了一种可能。试着分别问：这次调用是成是败（哪个字段）？错的是参数还是数据本身（哪个字段）？模型当时知不知道正确的文件名（哪个字段——在树上，还是在那条日志里）？

### Level 2：给观测层加一个「运行对比」

只看单次运行的指标很难判断一次改动是好是坏。写一个 `compare-runs.mjs`，读两份 `run.log.jsonl`，按 `kind` 聚合之后并排对比。要求：

- 命令行接两个日志文件路径：`node compare-runs.mjs <A> <B>`，缺参数打用法并以退出码 2 结束。
- 对比至少这些：模型调用次数、工具调用次数、报错数、`tokens_in` / `tokens_out` / `tokens_total`、总时长；token 这几行同时给出百分比变化。
- 再按工具名分组，对比每个工具各被调了几次。
- **任何一侧报错数大于零就非零退出**，并打印是哪一侧、几次。
- 写完之后用它对比 `v-good` 与 `v-fixed`，回答：修复有没有引入新的报错？token 涨了多少？

<!-- rubric -->

- 脚本零依赖、`node` 裸跑，两个参数都缺时打印用法并 `process.exit(2)`
- 聚合方式是按 `kind` 过滤（`model_call` / `tool_call` / `agent_run`）之后再统计，不是硬编码行号
- token 三行带百分比变化，计数行给出增减数
- 按工具名分组的对比覆盖两侧出现过的所有工具名（一侧有另一侧没有时补 0）
- 报错 gate 真实生效：两侧都为 0 时退出码 0，任一侧大于 0 时退出码非零，并打印各侧报错数
- 结论部分说清楚 `v-fixed` 的报错数仍是 1（那次拼错的读取还在），以及 token 涨幅的具体数字

<!-- answer -->

下面这份是完整实现，和 `observed-agent.mjs` 放同一个目录：

```javascript
#!/usr/bin/env node
// compare-runs.mjs —— 对比两次运行的 run.log.jsonl
// 跑法：node compare-runs.mjs <A 的 run.log.jsonl> <B 的 run.log.jsonl>
// 任何一侧有工具报错就非零退出。
import fs from "node:fs";

function load(file) {
  const records = fs
    .readFileSync(file, "utf8")
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line));
  const model = records.filter((r) => r.kind === "model_call");
  const tool = records.filter((r) => r.kind === "tool_call");
  const root = records.find((r) => r.kind === "agent_run");
  const byTool = new Map();
  for (const r of tool) byTool.set(r.name, (byTool.get(r.name) ?? 0) + 1);
  return {
    file,
    trace_id: records[0]?.trace_id ?? "(空日志)",
    model_calls: model.length,
    tool_calls: tool.length,
    errors: records.filter((r) => r.error).length,
    tokens_in: model.reduce((s, r) => s + r.tokens.input, 0),
    tokens_out: model.reduce((s, r) => s + r.tokens.output, 0),
    wall_ms: root?.duration_ms ?? 0,
    byTool,
  };
}

const pad = (v, w) => String(v).padStart(w);

function deltaOf(a, b, asPercent) {
  const d = b - a;
  const sign = d > 0 ? "+" : d < 0 ? "" : "±";
  if (!asPercent || a === 0) return `${sign}${d === 0 ? 0 : d}`;
  return `${sign}${d}（${sign}${((d / a) * 100).toFixed(1)}%）`;
}

function main() {
  const [fileA, fileB] = process.argv.slice(2);
  if (!fileA || !fileB) {
    console.error("用法：node compare-runs.mjs <A 的 run.log.jsonl> <B 的 run.log.jsonl>");
    process.exit(2);
  }
  const a = load(fileA);
  const b = load(fileB);

  console.log(`A: ${a.file}  trace_id=${a.trace_id}`);
  console.log(`B: ${b.file}  trace_id=${b.trace_id}`);
  console.log(`\n${"指标".padEnd(11)}${pad("A", 7)}${pad("B", 8)}   变化`);
  const rows = [
    ["model_calls", a.model_calls, b.model_calls, false],
    ["tool_calls", a.tool_calls, b.tool_calls, false],
    ["errors", a.errors, b.errors, false],
    ["tokens_in", a.tokens_in, b.tokens_in, true],
    ["tokens_out", a.tokens_out, b.tokens_out, true],
    ["tokens_total", a.tokens_in + a.tokens_out, b.tokens_in + b.tokens_out, true],
    ["wall_ms", a.wall_ms, b.wall_ms, false],
  ];
  for (const [name, va, vb, pct] of rows) {
    console.log(`${name.padEnd(13)}${pad(va, 7)}${pad(vb, 8)}   ${deltaOf(va, vb, pct)}`);
  }

  console.log("\n按工具名：");
  for (const name of [...new Set([...a.byTool.keys(), ...b.byTool.keys()])].sort()) {
    const va = a.byTool.get(name) ?? 0;
    const vb = b.byTool.get(name) ?? 0;
    console.log(`${name.padEnd(13)}${pad(va, 7)}${pad(vb, 8)}   ${deltaOf(va, vb, false)}`);
  }

  if (a.errors > 0 || b.errors > 0) {
    console.log(`\ngate 不通过：A 侧 ${a.errors} 次报错，B 侧 ${b.errors} 次报错。`);
    process.exit(1);
  }
  console.log("\ngate 通过：两侧都没有报错记录。");
  process.exit(0);
}

main();
```

**先验证 gate 本身。** 这是第 4 课那条规矩的直接应用：新装的探测器，先确认它在「应该放行」的情况下真的放行，否则你后面读到的每一个退出码都不可信。拿 `v-good` 跟它自己比：

```text
$ node compare-runs.mjs runs/v-good/run.log.jsonl runs/v-good/run.log.jsonl
A: runs/v-good/run.log.jsonl  trace_id=tr-0f4f0551
B: runs/v-good/run.log.jsonl  trace_id=tr-0f4f0551

指标               A       B   变化
model_calls        4       4   ±0
tool_calls         5       5   ±0
errors             0       0   ±0
tokens_in       5303    5303   ±0（±0.0%）
tokens_out       730     730   ±0（±0.0%）
tokens_total    6033    6033   ±0（±0.0%）
wall_ms           16      16   ±0

按工具名：
list_files         1       1   ±0
read_file          3       3   ±0
write_file         1       1   ±0

gate 通过：两侧都没有报错记录。
$ echo $?
0
```

全 `±0`，退出码 0。gate 能放行，可以用了。

**再对比 `v-good` 与 `v-fixed`：**

```text
$ node compare-runs.mjs runs/v-good/run.log.jsonl runs/v-fixed/run.log.jsonl
A: runs/v-good/run.log.jsonl  trace_id=tr-0f4f0551
B: runs/v-fixed/run.log.jsonl  trace_id=tr-80892fc3

指标               A       B   变化
model_calls        4       5   +1
tool_calls         5       6   +1
errors             0       1   +1
tokens_in       5303    7521   +2218（+41.8%）
tokens_out       730     838   +108（+14.8%）
tokens_total    6033    8359   +2326（+38.6%）
wall_ms           16       7   -9

按工具名：
list_files         1       1   ±0
read_file          3       4   +1
write_file         1       1   ±0

gate 不通过：A 侧 0 次报错，B 侧 1 次报错。
$ echo $?
1
```

回答那两个问题：

- **有没有引入新的报错？** 没有新的，但老的那次还在。`v-fixed` 的 `errors=1` 就是那次把 `south` 拼成 `sourth` 的读取——改报错文案改的是「报错之后模型怎么办」，没改「模型会不会拼错」。所以 gate 判不通过、退出码 1，这个结果是对的：这条 gate 问的是「这次运行里还有没有工具报错」，不是「最后的产物对不对」。产物对不对得另外验（`diff runs/v-good/summary.md runs/v-fixed/summary.md` 是空的）。真想让 `errors` 归零，下一步该动的是 `read_file` 的 description，给它配个正例，让模型一开始就用 `list_files` 返回的原样文件名。
- **token 涨了多少？** 总量从 6033 涨到 8359，多 2326，涨幅 38.6%；多出来的全在那一轮重读的往返上（`read_file` 从 3 次变 4 次，模型调用从 4 次变 5 次）。三成八不算暴涨，但也不是白来的——修复的代价要在这张表上认下来，不能只看结果对了就完事。

另外 `wall_ms` 那行的 `-9` 别当回事：桩 client 不发网络请求，两次运行的墙钟时间基本是文件 I/O 的噪声，每次跑都不一样。接了真 API 之后这一行才有意义。

<!-- hint -->

`load()` 只需要一次 `readFileSync` 加 `split("\n")`，然后所有统计都是在同一个数组上做 `filter` 和 `reduce`。`byTool` 用 `Map` 累加最省事；两侧工具名求并集的时候记得用 `new Set([...a.keys(), ...b.keys()])`，不然一侧独有的工具会漏掉。

<!-- hint -->

退出码要用 `process.exit()` 显式给，别指望脚本正常跑完就自动是 0——`console.log` 之后进程默认退出码确实是 0，但 gate 不通过那条路必须自己写 `process.exit(1)`。验证的时候在 shell 里用 `echo $?` 看上一条命令的退出码。

<!-- /exercises -->

## 小结

- 观测三件套各管一段：JSON Lines 日志负责「记下来」，trace 树负责「看清顺序和从属」，指标汇总负责「一眼看出这次跑得正不正常」；树和汇总都从磁盘上那份 JSONL 重建，日志里没记的东西，树上永远不会出现
- 每条记录必须带 `trace_id` 和 `parent_id`：前者把散落在一条流里的记录圈回同一次运行，后者让它们能重建成树——这正是官方用 `prompt.id` 把一次提示触发的全部事件串起来、按它过滤定位的同一套办法[^S4]
- 内容默认不落全文：官方遥测的默认取向是结构性的东西都记、Agent 读写的内容不采集，提示词只记长度；要开内容记录，前提是你的观测管道被批准存放这类数据[^S6]
- 指标那五个数（时长、调用次数、token、报错数、总耗时）和本系列第 10 门课判分用的是同一组[^S3]，这里换成诊断用途；在这次的对比里，`v-good` 和 `v-bug` 的轮数、调用次数、token 全都几乎一样，唯一变了的是报错数
- 定位的关键动作是在树上指认**第一处**分岔，然后把它下游的所有荒唐一律当传染处理：一步失败足以让 Agent 拐进一条完全不同的轨迹[^S1]，去修最终产物那一层等于在修影子
- 修工具报错文案是打在病灶上的修法：报错响应要把具体的、可执行的改进建议说清楚，而不是甩一个晦涩的错误码或者堆栈[^S3]；这次改完之后模型从「编一个华中区」变成「按原样文件名重读一次，并且回头问用户还有没有别的数据」
- 修完要复跑对比，而且要认账：`errors` 没有归零（拼错还在），token 涨了三成八（多了一轮往返）；「结果对了」不等于「代价为零」

六课的主线到这儿走完了。第 1 课说清了为什么你说不清——Agent 两次运行走不同的路，一个症状底下压着几个从外面看一模一样的原因。第 2 课把第一手证据定在了原始记录上，不是它的自述。第 3 课把每一步变成带字段的数据。第 4 课把散落的数据串成一棵树，顺带告诉你这条管道自己也会静默骗人。第 5 课在循环的关口安上探头，给出定位的走法。这一课把前面五课焊成了一个四百来行、零依赖的文件，还拿它把一个「华中区是哪儿来的」真追到了 `turn-2` 那条拼错路径的读取上。

这也是这个系列的第 11 门课。下一次你的 Agent 说不清哪儿错了的时候，你手上不再只有一句「模型编的」——你有一份可以 `grep` 的日志、一棵能指着某一行说话的树、一张能算出代价的汇总表，和一套从症状追到第一处分岔的走法。剩下的事就是把 `observed-agent.mjs` 里观测那三段（logger、trace 树、指标汇总）整段搬进你自己的 harness，照第 7 段的样子给你的循环套上那两层包装——夹具和桩是本课教学用的脚手架，不用带走——然后跑第一次真实任务，看看第一份 `run.log.jsonl` 里有什么是你原来根本不知道的。

