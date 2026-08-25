# 第 6 课：实战：手写一个带控制的 Agent Harness

> 学习目标：
> - 用 `@anthropic-ai/sdk` 把前两课的 `stop_reason` 循环写成一个能跑通的 `while` 循环，自己判断该继续调工具还是返回文字收尾
> - 按规范构造 `tool_use` 与 `tool_result` 内容块，把一轮里的多个结果拼进同一条 `user` 消息回传
> - 给这个循环装上四道控制阀（最大轮次、预算上限、无进展检测、高影响操作审批），并说清每道阀该插在循环的哪一步
>
> 前置要求：读过第 2 到第 5 课，理解 `stop_reason` 驱动的循环、停止条件、失控兜底与人在环干预 | 上一课 [第 5 课 <<](./05-intervention-and-steering.md)

## 先看它跑起来的样子

前五课全是拆零件：循环怎么转、什么时候停、失控长什么样、人怎么干预。这一课把它们焊成一个能跑的最小 harness。先别看代码，先看它在终端里跑起来是什么样——一个配了两个玩具工具（`get_time` 报时、`read_file` 读项目内文件）的 Agent，接到一句「读一下 README.md 的第一行，再告诉我现在几点」：

```text
$ node agent.js "读一下 README.md 的第一行，再告诉我现在几点"

[turn 1] 模型请求工具: read_file({"path":"README.md"})
[turn 1] 工具返回: "# Agent Harness 基础\n..."
[turn 2] 模型请求工具: get_time({})
[turn 2] 工具返回: "2026-08-26T10:42:07+08:00"
[turn 3] 模型收尾 (end_turn)

README.md 第一行是「# Agent Harness 基础」，现在是 2026 年 8 月 26 日 10:42。
用了 2 轮工具调用，共 3 次模型请求。
```

看清楚这里发生了什么：**用户只说了一句话，几次调工具、先调哪个、什么时候停，全是模型在循环里自己定的**——这正是 Agent 区别于工作流的地方，工作流的路径是代码写死的，Agent 是模型在循环里动态主导流程、自己决定用什么工具[^S1]。宿主代码（就是我们这一课要写的 harness）没有规定「先读文件再报时」，它只是老老实实地转循环、执行模型点名的工具、把结果喂回去。这一次两个工具都无害，所以一路畅通没打断；但这套 harness 还焊着一道审批阀——真碰上删文件、发请求这类高影响操作，它会在动手前停下来等人点头（本课后面就写它）。这一课剩下的篇幅，就是把这段终端输出背后的代码，一行行搭出来。

## 核心循环：把骨架搬进来，换成真 SDK

第 2 课那个 `callModel` 是伪代码，现在换成真的 `@anthropic-ai/sdk`。循环的骨架一模一样：带着 `messages` 发请求，看 `response.stop_reason`——是 `"tool_use"` 就执行工具、拼回结果再发一次，不是（比如 `end_turn`）就返回文字、跳出循环[^S2]。

先看不带任何控制阀的最小版，好把循环本身看清楚：

```javascript
import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic(); // 从环境变量 ANTHROPIC_API_KEY 读密钥

// 换成你账号下能用的模型 id
const MODEL = "claude-sonnet-5";

async function runAgent(userInput, tools, toolImpls) {
  const messages = [{ role: "user", content: userInput }];

  let response = await client.messages.create({
    model: MODEL,
    max_tokens: 1024,
    tools,
    messages,
  });

  while (response.stop_reason === "tool_use") {
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
      tools,
      messages,
    });
  }

  // stop_reason 不再是 tool_use，取出最终文字返回
  return response.content.find((b) => b.type === "text")?.text ?? "";
}
```

和第 2 课的骨架对着看，结构没变：`while` 那行还是「只要 `stop_reason` 还是 `tool_use` 就重复」，循环体还是「push assistant → 执行工具 → push tool_result → 重新赋值 `response`」那四步。唯一的实质变化是 `callModel` 变成了 `client.messages.create(...)`，以及循环体末尾那次重新赋值——它是循环能停下来的前提，漏了它 `stop_reason` 永远是老值，就成了第 4 课讲的死循环。

## tool_use / tool_result 的字段，按规范一个不漏

`runToolUses` 是把「模型点名的工具」真正跑起来的地方。这里最容易出错的是内容块的字段，照规范来：`tool_use` 块带 `id` / `name` / `input`，`tool_result` 块带 `tool_use_id`（认领是哪一次调用的结果）/ `content`，工具执行失败时再加一个 `is_error: true`[^S6]。还有一条硬规则：一轮响应里有几个 `tool_use` 块，就得回几个 `tool_result`，并且全部塞进紧随其后的同一条 `user` 消息里[^S6]——上面循环体那句 `messages.push({ role: "user", content: toolResults })` 就是在守这条规则。

```javascript
async function runToolUses(content, toolImpls) {
  const toolUseBlocks = content.filter((b) => b.type === "tool_use");

  // 并行执行，但结果最终会集中进同一条 user 消息
  return Promise.all(
    toolUseBlocks.map(async (block) => {
      const impl = toolImpls[block.name];
      try {
        const output = await impl(block.input);
        return {
          type: "tool_result",
          tool_use_id: block.id, // 认领：这是对 block.id 那次调用的回应
          content: output,
        };
      } catch (err) {
        return {
          type: "tool_result",
          tool_use_id: block.id,
          content: `工具执行出错: ${err.message}`,
          is_error: true, // 失败时置真，让模型知道这次调用没成
        };
      }
    })
  );
}
```

注意 `try/catch`：工具跑挂了不该让整个 harness 崩，而是把错误包成 `is_error: true` 的 `tool_result` 传回去，模型看到后有机会换个参数重试或换条路走。这比直接抛异常、让进程死掉要稳得多。

## 装上四道控制阀

到这里循环能转了，但它是第 2 课那个「信任模型、不给自己留后路」的裸循环：模型哪轮回 `end_turn` 它哪轮停，中间不设任何边界。而 Agent 的自主性意味着更高的成本，以及误差沿着一圈圈循环累积放大的可能，模型有可能连续跑很多轮[^S1]——裸循环把停不停完全押在模型身上，太险。现在把前几课的四道阀逐个焊上去。

```javascript
const MAX_TURNS = 8;        // 阀1：最大轮次（第 3 课 停止条件）
const TOKEN_BUDGET = 40000; // 阀2：累计 token 预算（第 4 课 预算耗尽）

async function runAgent(userInput, tools, toolImpls, opts = {}) {
  const messages = [{ role: "user", content: userInput }];
  let turns = 0;
  let tokensUsed = 0;
  let lastSignature = null; // 阀3 用：上一轮工具调用的签名

  let response = await client.messages.create({
    model: MODEL, max_tokens: 1024, tools, messages,
  });
  tokensUsed += response.usage.input_tokens + response.usage.output_tokens;

  while (response.stop_reason === "tool_use") {
    // —— 阀1：最大轮次。放在循环体最前面，进这一圈前先问「还允许再转吗」 ——
    if (turns >= MAX_TURNS) {
      return `已达最大轮次 ${MAX_TURNS}，主动收手（可能任务过难或模型卡住）`;
    }
    // —— 阀2：预算上限。累计 token 到顶就停，别烧穿钱包 ——
    if (tokensUsed >= TOKEN_BUDGET) {
      return `已达 token 预算 ${TOKEN_BUDGET}，主动收手`;
    }
    turns++;

    // —— 阀3：无进展检测。这一轮的工具调用签名和上一轮一模一样，判定空转 ——
    const signature = signatureOf(response.content);
    if (signature === lastSignature) {
      return `连续两轮工具调用完全相同（${signature}），判定空转，主动收手`;
    }
    lastSignature = signature;

    messages.push({ role: "assistant", content: response.content });

    // —— 阀4：审批阀。执行前先过一遍高影响操作的确认（下面展开） ——
    const toolResults = await runToolUses(response.content, toolImpls, opts);
    messages.push({ role: "user", content: toolResults });

    response = await client.messages.create({
      model: MODEL, max_tokens: 1024, tools, messages,
    });
    tokensUsed += response.usage.input_tokens + response.usage.output_tokens;
  }

  return response.content.find((b) => b.type === "text")?.text ?? "";
}
```

四道阀各自守一件事，位置都不是随便放的：

- **阀1 最大轮次**（第 3 课）：`turns >= MAX_TURNS` 放在循环体最前、`turns++` 之前。含义是「进这一圈之前先检查还允不允许再转」。这道显式停止条件是为了在模型自己的 `end_turn` 之外，把控制权攥在自己手里[^S1]。
- **阀2 预算上限**（第 4 课）：每次拿到响应就用 `response.usage` 累加 token，到顶即停。轮次少但每轮上下文巨大时，光靠轮数拦不住烧钱，得靠 token 这道独立的闸。
- **阀3 无进展检测**（第 4 课）：把这一轮的工具调用「拍平成一个签名」，和上一轮比，一样就判空转。这拦的是那种「轮次没超、预算没爆，但模型在原地打转、反复调同一个工具同样参数」的死水局面。
- **阀4 审批阀**（第 5 课）：在 `runToolUses` 里、真正执行工具之前，对高影响操作先要一个人工确认。对高影响动作引入人在环审批，正是抑制过度授权风险的推荐手段[^S4]。

阀3 的签名函数很朴素——把这一轮所有 `tool_use` 块的名字和参数拼成一个字符串，能区分「调了什么、参数是什么」就够：

```javascript
function signatureOf(content) {
  return content
    .filter((b) => b.type === "tool_use")
    .map((b) => `${b.name}(${JSON.stringify(b.input)})`)
    .sort()
    .join(" | ");
}
```

## 审批阀：卡在「执行之前」那一刻

四道阀里，审批阀的位置最讲究，也最容易写错。它必须卡在「模型点了名、但工具还没真的跑」的那一刻——先打印将要执行的动作，等人确认，确认了才执行。放晚一步，文件就已经被写了、请求就已经发出去了，再问「确认吗」毫无意义。所以它得写进 `runToolUses` 里、`impl(...)` 那一行之前：

```javascript
const HIGH_IMPACT = new Set(["write_file", "http_post", "delete_file"]);

async function runToolUses(content, toolImpls, opts = {}) {
  const toolUseBlocks = content.filter((b) => b.type === "tool_use");

  const results = [];
  for (const block of toolUseBlocks) {
    // 审批阀：高影响操作在执行前先要确认
    if (HIGH_IMPACT.has(block.name)) {
      const ok = await opts.approve?.(block.name, block.input);
      if (!ok) {
        results.push({
          type: "tool_result",
          tool_use_id: block.id,
          content: "用户拒绝了这次高影响操作，未执行。",
          is_error: true,
        });
        continue; // 跳过执行，但仍回一个 tool_result，别让这次调用悬空
      }
    }

    try {
      const output = await toolImpls[block.name](block.input);
      results.push({ type: "tool_result", tool_use_id: block.id, content: output });
    } catch (err) {
      results.push({
        type: "tool_result", tool_use_id: block.id,
        content: `工具执行出错: ${err.message}`, is_error: true,
      });
    }
  }
  return results;
}
```

`approve` 是外面传进来的一个函数，在终端里就是「打印动作、读一行输入」：

```javascript
import readline from "node:readline/promises";

async function approveInTerminal(name, input) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const answer = await rl.question(
    `[approve] 即将执行高影响操作 ${name}(${JSON.stringify(input)}) —— 回车放行 / 输入 n 拒绝: `
  );
  rl.close();
  return answer.trim().toLowerCase() !== "n";
}
```

一个关键细节：即便用户拒绝，也要回一个 `is_error: true` 的 `tool_result`，而不是什么都不返回。因为规范要求每个 `tool_use` 都得有对应的 `tool_result` 回传[^S6]；漏掉它，下一次请求就会因为「有个工具调用没有结果」而报错。拒绝不等于无视，拒绝也是一种要如实告诉模型的结果——模型收到「被拒绝」后，往往会改走一条不需要高影响操作的路。

```agentmentor-check
{
  "id": "harness-zh-06-approval-before-exec",
  "label": "判断审批阀插在循环控制流的哪个位置才有效",
  "prompt": "同事把审批阀这样接：在 runToolUses 里先照常执行每个工具、拿到 output，然后在把结果 push 进 results 之前，才对高影响操作弹出「确认吗」，用户点否就把这条 tool_result 标成 is_error 丢弃。他说「反正拒绝了结果就不用，等价」。这样接对不对？",
  "whyHere": "这一节刚强调审批阀必须卡在「工具还没真的跑」的那一刻，这里紧接着用一个「把确认放到 impl 执行之后」的具体代码位置错误，检验读者是否真的理解审批阀拦的是执行本身、而不是结果的采用与否。",
  "mode": "single",
  "choices": [
    {
      "id": "a",
      "text": "不对，审批必须在调用 impl 之前完成；先执行再问，副作用已经产生，确认就失去了拦截意义",
      "correct": true,
      "feedback": "正确。审批阀的作用对象是「执行这个动作」本身，不是「采不采用它的结果」。所以它必须卡在 impl(...) 这一行之前——确认通过才调 impl，被拒就直接 continue、连 impl 都不碰。这正是对高影响操作做人在环审批的意义：在不可逆动作真正发生前把住关，而不是在它发生后补一张作废单。"
    },
    {
      "id": "b",
      "text": "对，既然拒绝时那条 tool_result 被标成错误、不被采用，执行与否没区别，先跑再问结果一样",
      "correct": false,
      "feedback": "问题在于工具已经真的跑过了。write_file、http_post、delete_file 这类高影响操作，副作用在 impl 返回的那一刻就已经落地——文件被写了、请求发出去了、记录被删了。此时再问「确认吗」，拦得住的只是「要不要采用这条结果」，拦不住已经发生的副作用，审批阀等于形同虚设。"
    }
  ]
}
```

## 两个玩具工具：把循环真正跑通

控制阀都装好了，还差能被调用的工具。这一课只用两个绝对安全的玩具，把危险操作挡在门外：`get_time` 报当前时间，`read_file` 读文件——但用 `path.resolve` 把它死死限制在项目目录内，防止模型（或被工具输出带偏后）去读 `/etc/passwd` 这类越界路径：

```javascript
import path from "node:path";
import fs from "node:fs/promises";

const ROOT = process.cwd();

const toolImpls = {
  get_time: async () => new Date().toISOString(),

  read_file: async ({ path: p }) => {
    const abs = path.resolve(ROOT, p);
    // 越界防线：解析后的绝对路径必须仍在项目目录内
    if (!abs.startsWith(ROOT + path.sep)) {
      throw new Error(`拒绝读取项目目录外的路径: ${p}`);
    }
    return (await fs.readFile(abs, "utf8")).slice(0, 2000);
  },
};

const tools = [
  {
    name: "get_time",
    description: "返回当前时间的 ISO 8601 字符串",
    input_schema: { type: "object", properties: {} },
  },
  {
    name: "read_file",
    description: "读取项目目录内一个文本文件的前 2000 字",
    input_schema: {
      type: "object",
      properties: { path: { type: "string", description: "相对项目根目录的路径" } },
      required: ["path"],
    },
  },
];
```

这两个工具都不在 `HIGH_IMPACT` 集合里，所以不触发审批——它们本就无害。要演示审批阀，把一个 `write_file` 加进 `toolImpls` 和 `HIGH_IMPACT` 就行，本课刻意不引入真的写操作，免得跑示例时改坏你的文件。

## 拼起来：一个能 `node agent.js` 的入口

最后把 `runAgent`、`runToolUses`、工具定义、审批函数凑成一个能直接跑的入口，就是本课开头那段终端输出背后的东西：

```javascript
async function main() {
  const userInput = process.argv[2] ?? "读一下 README.md 的第一行，再告诉我现在几点";
  const answer = await runAgent(userInput, tools, toolImpls, {
    approve: approveInTerminal,
  });
  console.log("\n" + answer);
}

main().catch((err) => {
  console.error("harness 崩了:", err);
  process.exit(1);
});
```

把前面几段代码（`import`、`client`、`MODEL`、`runAgent`、`runToolUses`、`signatureOf`、`approveInTerminal`、`toolImpls`、`tools`、`main`）放进一个 `agent.js`，设好 `ANTHROPIC_API_KEY`、`npm i @anthropic-ai/sdk`，就能 `node agent.js "你的任务"` 跑起来。

回头看这一百来行代码，会发现它没有一处是新概念：`while` 循环和 `stop_reason` 是第 2 课的，`MAX_TURNS` 是第 3 课的，预算和空转检测是第 4 课的，审批阀是第 5 课的。**harness 不是某个高深的框架，就是这层「你亲手写、亲手控制」的循环加几道阀。**同样的模型、同样两个工具，装了这四道阀的 harness 和第 2 课那个裸循环，跑同一个任务的稳当程度可以天差地别——因为决定 Agent 靠不靠谱的，很大程度是外面这层控制代码，而不只是里面那个模型[^S5]。

也别忘了给复杂度留个分寸：这四道阀不是每个 Agent 都必须全上，值得记住的一条是，只在复杂度确实能改善结果时才考虑增加它[^S1]。一个只在受控环境里跑三五轮的小工具，也许 `MAX_TURNS` 一道阀就够了；四道阀是给那些「会连续跑很多轮、还可能碰高影响操作」的场景准备的。

<!-- exercises -->
## 💻 练习

### Level 1：给 harness 再加一道「按工具名分级」的控制阀

现在的审批阀只有「高影响就问、其余放行」两档。产品同学提了个更细的需求：希望按工具名分三档管控——`allow`（直接放行，如 `get_time`）、`ask`（执行前必须人工确认，如 `write_file`）、`deny`（一律拒绝、根本不许调，如某个已下线的 `send_email`）。请你给这个 harness 加上这道「策略阀」：设计它的数据结构，说清它该插在循环的哪一步、和现有审批阀是什么关系，并写出 `deny` 命中时该怎么回给模型。

<!-- rubric -->
- 给出一个能表达三档的策略结构（如 `{ get_time: "allow", write_file: "ask", send_email: "deny" }`），并说明默认档（未列出的工具按哪档处理）
- 明确策略阀插在 `runToolUses` 里、对每个 `tool_use` 块、在执行 impl 之前判定——和审批阀同一位置，`ask` 档复用现有确认逻辑
- `deny` 命中时不执行工具，但仍回一个 `is_error: true` 的 `tool_result` 告知模型「该工具被策略禁止」，而不是静默丢弃

<!-- answer -->
数据结构：一张工具名到档位的映射，外加一个默认档，未列出的工具落到默认档（保守起见默认 `ask` 或 `deny` 都合理，别默认 `allow`）：

```javascript
const POLICY = { get_time: "allow", read_file: "allow", write_file: "ask", send_email: "deny" };
const DEFAULT_POLICY = "ask"; // 没列出的工具，保守地要求确认
```

位置：和审批阀完全同一处——在 `runToolUses` 里遍历每个 `tool_use` 块、调用 `impl` 之前判定。因为三档里 `ask` 和 `deny` 都必须在「工具真的跑起来之前」拦截，跟审批阀拦的是同一个时刻。它其实是审批阀的推广：原来的审批阀等价于「高影响=ask、其余=allow」两档，现在多出一个 `deny` 档。

```javascript
for (const block of toolUseBlocks) {
  const policy = POLICY[block.name] ?? DEFAULT_POLICY;

  if (policy === "deny") {
    results.push({
      type: "tool_result", tool_use_id: block.id,
      content: `工具 ${block.name} 被策略禁止调用，未执行。`, is_error: true,
    });
    continue; // 根本不碰 impl
  }
  if (policy === "ask") {
    const ok = await opts.approve?.(block.name, block.input);
    if (!ok) {
      results.push({
        type: "tool_result", tool_use_id: block.id,
        content: "用户拒绝了这次操作，未执行。", is_error: true,
      });
      continue;
    }
  }
  // allow，或 ask 被放行：执行
  const output = await toolImpls[block.name](block.input);
  results.push({ type: "tool_result", tool_use_id: block.id, content: output });
}
```

`deny` 命中时的关键和审批被拒一样：不执行，但仍回一个 `is_error: true` 的 `tool_result`，因为每个 `tool_use` 都必须有对应结果回传[^S6]。模型收到「该工具被禁止」后，通常会改用别的工具或直接向用户说明做不了，而不是卡死。

<!-- hint -->
先问自己：三档里哪几档需要在「工具执行之前」就拦下来？`deny` 和 `ask` 都要，`allow` 不用——所以这道阀的位置只能和审批阀一样，在 `impl(...)` 那行之前。

<!-- hint -->
别让被 `deny` 或被拒的调用「悬空」。规范要求一轮里每个 `tool_use` 都要有一个 `tool_result` 回到下一条 user 消息里；拒绝执行也得回一条（标 `is_error`），否则下一次请求会因缺结果而报错。

### Level 2：这个循环少了哪几道闸，会怎么失控

下面这段 harness 循环，同事说「能跑」，但只要模型不主动回 `end_turn`，或者陷进原地打转，它就会出事。请指出：(1) 它缺了哪些控制、各会导致什么失控现象；(2) 给出最小修复——至少补上一道能保证循环「一定会停」的硬边界，并说清补在哪一步。

```javascript
async function runAgent(userInput, tools, toolImpls) {
  const messages = [{ role: "user", content: userInput }];
  let response = await client.messages.create({ model: MODEL, max_tokens: 1024, tools, messages });

  while (response.stop_reason === "tool_use") {
    messages.push({ role: "assistant", content: response.content });
    const toolResults = await runToolUses(response.content, toolImpls);
    messages.push({ role: "user", content: toolResults });
    response = await client.messages.create({ model: MODEL, max_tokens: 1024, tools, messages });
  }
  return response.content.find((b) => b.type === "text")?.text ?? "";
}
```

<!-- rubric -->
- 指出它把停不停完全交给了模型的 `stop_reason`，没有任何显式停止条件——模型只要一直回 `tool_use` 就永远转下去，这正是自主循环需要额外攥住控制权的地方
- 至少点出两类失控：模型迟迟不收尾导致轮次无上限地烧下去（轮次/预算失控），以及反复调同一工具同参数的原地打转（无进展）不会被发现
- 最小修复：补上 `MAX_TURNS` 计数与判断，且判断放在循环体开头、`turns++` 之前，保证循环一定会停

<!-- answer -->
(1) 缺的控制：这段代码除了模型自己的 `end_turn`，没有任何显式停止条件、没有预算上限、没有无进展检测、也没有高影响操作审批。后果分别是：

- **无显式停止条件**：模型只要每轮都回 `tool_use`，`while` 条件就恒真，循环无限转下去。Agent 的自主性本就意味着它可能连续跑很多轮、成本升高、误差累积[^S1]，而这里连一道硬边界都没有，纯靠模型「懂事」收尾。
- **无预算上限**：每转一圈历史都在变长（第 2 课），token 只增不减，长时间运行会烧穿预算也没人拦。
- **无进展检测**：模型若反复调用同一个工具、同样的参数原地打转，这段代码照单全收，永远发现不了空转。
- **无审批阀**：若 `toolImpls` 里有 `write_file` 之类高影响操作，会被无条件执行，一次误判就可能造成不可逆后果。

(2) 最小修复：至少补一道能保证「循环一定会停」的硬边界——`MAX_TURNS`。计数器在循环外初始化，判断放在循环体最前面、`turns++` 之前：

```javascript
const MAX_TURNS = 8;
async function runAgent(userInput, tools, toolImpls) {
  const messages = [{ role: "user", content: userInput }];
  let turns = 0;
  let response = await client.messages.create({ model: MODEL, max_tokens: 1024, tools, messages });

  while (response.stop_reason === "tool_use") {
    if (turns >= MAX_TURNS) return `已达最大轮次 ${MAX_TURNS}，主动收手`; // 硬边界，放在最前
    turns++;

    messages.push({ role: "assistant", content: response.content });
    const toolResults = await runToolUses(response.content, toolImpls);
    messages.push({ role: "user", content: toolResults });
    response = await client.messages.create({ model: MODEL, max_tokens: 1024, tools, messages });
  }
  return response.content.find((b) => b.type === "text")?.text ?? "";
}
```

补上这一道后，无论模型是否收尾、是否打转，循环最多转 `MAX_TURNS` 圈就一定退出——这是把控制权从模型手里攥回宿主的最基本一步[^S1]。预算、无进展、审批三道阀可以在此基础上按需再加。

<!-- hint -->
盯着 `while (response.stop_reason === "tool_use")` 这一行：能让它变成 `false` 的，除了模型主动回 `end_turn`，还有别的东西吗？如果没有，那循环停不停就完全是模型说了算。

<!-- hint -->
「一定会停」的边界，靠的是一个宿主这边自己维护、跟模型输出无关的计数器。想清楚这个计数器该在哪初始化、在哪自增、在哪判断——判断要放在自增之前，才不会多放一圈进去。

<!-- /exercises -->

## 小结

- 一个能跑的 harness 核心还是第 2 课那个循环：带 `messages` 请求 → 看 `stop_reason`，是 `tool_use` 就执行工具、拼 `tool_result` 回传再发一次，不是就返回文字收尾[^S2]；换成真 SDK 只是把 `callModel` 变成 `client.messages.create(...)`
- 内容块字段按规范一个不漏：`tool_use` 带 `id` / `name` / `input`，`tool_result` 带 `tool_use_id` / `content`、失败加 `is_error`；一轮里几个 `tool_use` 就回几个 `tool_result`，全塞进紧随其后的同一条 `user` 消息[^S6]
- 四道控制阀各守一处、位置不能乱：最大轮次（第 3 课）和预算上限（第 4 课）是「循环一定会停」的硬边界，无进展检测（第 4 课）拦原地打转，审批阀（第 5 课）必须卡在工具执行之前——因为 Agent 的自主性带来更高成本和误差累积、模型可能连续跑很多轮[^S1]，光靠模型自己的 `end_turn` 收不住
- 审批阀对高影响操作要人工确认，是抑制过度授权风险的推荐手段[^S4]；即便被拒也要回一个 `is_error` 的 `tool_result`，别让调用悬空[^S6]
- harness 不是高深框架，就是这层你亲手写、亲手控制的循环加几道阀——同样的模型换套控制代码，可靠性可以天差地别[^S5]；但也别过度堆阀，只在复杂度确实能改善结果时才考虑加[^S1]

你已经走完这门课。从「什么是 harness」到亲手写出一个带四道控制阀的循环，你现在手里有的不只是概念，而是一段能跑、能改、能往上加控制的真代码——去把它接上你自己的工具，让它替你干活吧。





