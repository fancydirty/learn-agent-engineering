# 第 6 课：实战：给 Agent 接上三个工具

> 学习目标：
> - 写出一个完整的工具执行循环，让 Agent 真正跑起来
> - 用一张表同时注册工具的接口定义和实现，避免两边对不上
> - 给循环装上安全阀，并能从日志里判断"工具接错了"

> 前置要求：读完第 1-5 课，能读懂基本的 JavaScript / Node.js | 上一课 [第 5 课 <<](./05-permissions-and-safety.md)

## 先看效果：一次完整的运行

这是本课最后要跑出来的东西。终端里输入一句话，Agent 自己决定调用哪些工具、调几次：

```
$ node agent.js "我们项目里是不是用了 lodash?查一下它在 GitHub 上的情况"

[轮次 1] 调用 search_files { pattern: 'lodash', dir: '.' }
[轮次 2] 调用 read_file { path: 'package.json' }
[轮次 3] 调用 github_repo_info { owner: 'lodash', repo: 'lodash' }

最终回答:
是的,项目用了 lodash,package.json 里锁定的版本是 ^4.17.21,
src/utils/format.js 里也直接 require 了它。GitHub 上 lodash/lodash
目前 star 数超过 6 万,最后一次 push 是几周前——仓库还在维护。
要确认 ^4.17.21 是不是最新发布,还需要再查一次它的发布列表。
```

三轮，三个工具，每一轮的参数都建立在上一轮结果之上：先搜出 lodash 出现在哪些文件里，再读 package.json 确认版本号，最后拿着这个名字去问 GitHub。这不是写死的脚本，是模型自己决定"接下来调哪个工具、传什么参数"。

这一课把它从零搭出来：三个工具、一张注册表、一个执行循环、几道安全阀。

## 这背后发生了什么：一次一次的 API 往返

上面看到的每一"轮"，背后都是一次完整的 HTTP 请求。第 2 课讲过单次工具调用的往返长什么样；这里只是把它接成了循环——模型返回 `stop_reason: "tool_use"`，你的代码执行工具、把结果拼回对话，再发一次请求，直到模型不再要求调用工具为止[^S4]。

三轮工具调用的背后其实是四次 `messages.create`：前三次模型都在要工具，第四次它拿到了 GitHub 返回的数据，觉得信息够了，直接给出文字回答，循环结束。这个"要不要继续要工具"的判断完全在模型那边，你的代码只负责执行、回传。

## 第一步：给工具写契约

第 4 课讲过工具接口的三个核心字段：`name`、`description`、`input_schema`[^S3]。这里直接落成代码。三个工具分别对应第 3 课讲过的五类工具里的三类：搜索、读、调用——写和执行这两类留给你在练习里自己接。

```js
const searchFilesSchema = {
  name: "search_files",
  description:
    "在项目目录里按正则表达式搜索文本,返回命中的文件路径、行号和该行内容。" +
    "用于定位某个字符串、依赖名或函数名出现在哪些文件里。" +
    "没有命中时会返回明确的提示文字,不会返回空字符串。",
  input_schema: {
    type: "object",
    properties: {
      pattern: { type: "string", description: "JavaScript 正则表达式,不带首尾斜杠" },
      dir: { type: "string", description: "搜索起始目录,相对项目根目录,默认为 \".\"" },
    },
    required: ["pattern"],
  },
};

const readFileSchema = {
  name: "read_file",
  description:
    "读取项目内某个文件的文本内容,最多返回前 4000 个字符。" +
    "path 必须是相对项目根目录的相对路径,不能访问项目目录之外的文件。",
  input_schema: {
    type: "object",
    properties: {
      path: { type: "string", description: "相对项目根目录的文件路径,例如 \"package.json\"" },
    },
    required: ["path"],
  },
};

const githubRepoInfoSchema = {
  name: "github_repo_info",
  description:
    "查询一个公开 GitHub 仓库的基本信息:star 数、开放 issue 数、默认分支、最后一次 push 时间。" +
    "owner 和 repo 是仓库拥有者和仓库名两个独立字段,不接受完整 URL。",
  input_schema: {
    type: "object",
    properties: {
      owner: { type: "string", description: "仓库拥有者,例如 \"lodash\"" },
      repo: { type: "string", description: "仓库名,例如 \"lodash\"" },
    },
    required: ["owner", "repo"],
  },
};
```

`github_repo_info` 带了 `github_` 前缀——官方建议工具涉及外部服务时用服务名做命名空间前缀，模型选错工具的概率会低很多[^S10]。`search_files`、`read_file` 操作本地文件系统，不存在"哪个服务"的歧义，不需要前缀。

三段 `description` 都写了"找不到时返回什么样的文字"，不是废话。第 4 课提过好的描述要消除输入输出的歧义[^S8]；这里的歧义不在参数上，而在"工具没找到东西时该怎么表达"——这个坑会在"安全阀"一节炸出来。

## 第二步：把契约和实现注册在同一张表里

一个容易踩的坑：schema 列表和执行时用的 handler 查找表如果分开写成两份，迟早会对不上。你把 `search_files` 改名成 `find_in_files`，却忘了同步改 handler 表里的 key，模型照着新 schema 发起调用，handler 表里查不到，直接抛错。

解决办法是只维护一张表，`name`、`description`、`input_schema`、真正执行的函数全挤在同一个对象里，API 需要的 schema 列表和执行时需要的 handler 查找表都从这张表派生：

```js
const TOOLS = {
  search_files: { ...searchFilesSchema, handler: searchFiles },
  read_file: { ...readFileSchema, handler: readFile },
  github_repo_info: { ...githubRepoInfoSchema, handler: githubRepoInfo },
};

// 发给模型的 tools 参数,从 TOOLS 派生
const toolSchemas = Object.values(TOOLS).map(({ handler, ...schema }) => schema);

// 执行时用的 handler 查找表,同样从 TOOLS 派生
const toolHandlers = Object.fromEntries(
  Object.entries(TOOLS).map(([name, t]) => [name, t.handler])
);
```

`toolSchemas` 和 `toolHandlers` 永远同步，因为它们是同一份数据算出来的两个视图，不是两份手写的数据。改一个工具的名字、加一个参数，只需要改 `TOOLS` 这一处。

## 第三步：实现三个工具，带上边界

`searchFiles` 自己写目录遍历，不借 shell 的 `grep`——避免把用户输入拼进命令行触发命令注入。命中数量封顶，避免一次搜索把几千行塞进上下文：

```js
import fs from "node:fs";
import path from "node:path";

const PROJECT_ROOT = process.cwd();
const IGNORE_DIRS = new Set(["node_modules", ".git", "dist", "coverage"]);

function walk(dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (IGNORE_DIRS.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(full));
    else out.push(full);
  }
  return out;
}

async function searchFiles({ pattern, dir = "." }) {
  const root = path.resolve(PROJECT_ROOT, dir);
  // 拼上 path.sep 再比较:裸的 startsWith 会把 /proj-backup 这类同前缀兄弟目录也放行
  const inRoot = root === PROJECT_ROOT || root.startsWith(PROJECT_ROOT + path.sep);
  if (!inRoot) {
    return "拒绝执行:搜索目录不能超出项目根目录。";
  }
  let regex;
  try {
    regex = new RegExp(pattern);
  } catch {
    return `拒绝执行:"${pattern}" 不是合法的正则表达式。`;
  }

  const hits = [];
  for (const file of walk(root)) {
    let lines;
    try {
      lines = fs.readFileSync(file, "utf8").split("\n");
    } catch {
      continue; // 二进制文件之类读不出文本,跳过
    }
    lines.forEach((line, i) => {
      if (regex.test(line)) {
        hits.push(`${path.relative(PROJECT_ROOT, file)}:${i + 1}:${line.trim()}`);
      }
    });
    if (hits.length >= 20) break; // 安全阀:命中太多就提前截断
  }
  return hits.length ? hits.join("\n") : "没有找到匹配的内容。";
}
```

`readFile` 只做一件事：确认目标路径没有跑出项目根目录。第 5 课讲过的边界思路在这里就是一行带分隔符的前缀检查。注意不是裸的 `startsWith(PROJECT_ROOT)`：假如项目根目录是 `/Users/me/proj`，模型传一个 `../proj-backup/x` 进来，resolve 之后得到 `/Users/me/proj-backup/x`，裸前缀匹配照样通过——拼上 `path.sep` 之后，边界才真正落在目录分隔符上：

```js
async function readFile({ path: relPath }) {
  const abs = path.resolve(PROJECT_ROOT, relPath);
  const inRoot = abs === PROJECT_ROOT || abs.startsWith(PROJECT_ROOT + path.sep);
  if (!inRoot) {
    return "拒绝执行:路径超出了项目根目录,这个工具不允许读取项目外的文件。";
  }
  if (!fs.existsSync(abs)) {
    return `文件不存在:${relPath}`;
  }
  return fs.readFileSync(abs, "utf8").slice(0, 4000);
}
```

`githubRepoInfo` 是唯一会把数据发到项目之外的工具——本地文件内容经模型提炼成 `owner`、`repo` 两个字符串，再发到公网。这正好是"读了私有数据 + 对外通信"两个高风险条件凑在一起的场景[^S19]，所以加一条明确的权限规则：参数必须匹配 GitHub 合法命名格式，不许是别的：

```js
const SAFE_NAME = /^[\w.-]+$/;

async function githubRepoInfo({ owner, repo }) {
  // 权限规则:owner/repo 只能是合法的仓库命名,
  // 不许把任意字符串当参数发到外部网络
  if (!SAFE_NAME.test(owner) || !SAFE_NAME.test(repo)) {
    return "拒绝执行:owner/repo 参数格式不合法,已阻止对外请求。";
  }

  const headers = { Accept: "application/vnd.github+json" };
  if (process.env.GITHUB_TOKEN) {
    headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
  }

  const res = await fetch(`https://api.github.com/repos/${owner}/${repo}`, { headers });
  if (!res.ok) {
    return `GitHub API 返回错误:${res.status} ${res.statusText}`;
  }
  const data = await res.json();
  return JSON.stringify({
    stars: data.stargazers_count,
    open_issues: data.open_issues_count,
    default_branch: data.default_branch,
    pushed_at: data.pushed_at,
  });
}
```

`GITHUB_TOKEN` 从环境变量读，不出现在代码里；不设置也能跑，只是匿名请求的速率限制更低。这跟第 5 课讲的权限规则是一个思路的两种写法：那一课讲 Claude Code 配置文件里 `allow`/`deny`/`ask` 那种声明式规则[^S15]，这里是写进工具代码里的命令式版本——核心都是"给高风险操作画一条不能越过的线"[^S18]。

## 第四步：写执行循环

有了 `toolSchemas` 和 `toolHandlers`，循环本身并不复杂。核心逻辑就四步：发请求、看 `stop_reason`、不是 `tool_use` 就返回文字、是就执行每一个工具调用块并把结果拼回去[^S4]：

```js
import Anthropic from "@anthropic-ai/sdk";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const MAX_TURNS = 8;

async function runAgent(question) {
  const messages = [{ role: "user", content: question }];

  for (let turn = 1; turn <= MAX_TURNS; turn++) {
    const response = await anthropic.messages.create({
      model: "claude-sonnet-5", // 换成你账号下能调用的模型
      max_tokens: 1024,
      tools: toolSchemas,
      messages,
    });

    messages.push({ role: "assistant", content: response.content });

    if (response.stop_reason !== "tool_use") {
      const textBlock = response.content.find((b) => b.type === "text");
      return textBlock ? textBlock.text : "(模型没有给出文字回答)";
    }

    const toolResults = [];
    for (const block of response.content) {
      if (block.type !== "tool_use") continue;
      console.log(`[轮次 ${turn}] 调用 ${block.name}`, block.input);
      const handler = toolHandlers[block.name];
      const content = await handler(block.input);
      toolResults.push({ type: "tool_result", tool_use_id: block.id, content: String(content) });
    }
    messages.push({ role: "user", content: toolResults });
  }

  throw new Error(`超过最大轮数 (${MAX_TURNS})`);
}

const question = process.argv[2] ?? "我们项目里是不是用了 lodash?查一下它在 GitHub 上的情况";
runAgent(question).then((answer) => console.log("\n最终回答:\n" + answer));
```

这里有个容易漏的细节：`for (const block of response.content)` 遍历的是**这一轮返回的所有内容块**，不是只取第一个。模型经常一次并行请求两三个工具，每一个都要执行、生成对应的 `tool_result`，`tool_use_id` 一一对应，一个都不能少[^S5]。Level 2 练习会让你亲手踩一次漏处理的坑。

## 安全阀，以及怎么看出工具接错了

上面这版循环能跑，但少了两道保险。加上它们：

**保险一：工具执行失败要喂回去，不能让循环崩掉。** 把裸调用包一层 `try/catch`，失败也生成一个 `tool_result`，只是标上 `is_error: true`——模型看到这个标记，通常会调整参数重试，而不是重复同一个错误[^S11][^S5]：

```js
let content, isError = false;
try {
  if (!handler) throw new Error(`没有注册名为 ${block.name} 的工具`);
  content = await handler(block.input);
} catch (err) {
  content = `工具执行出错:${err.message}`;
  isError = true;
}
toolResults.push({
  type: "tool_result",
  tool_use_id: block.id,
  content: String(content),
  ...(isError ? { is_error: true } : {}),
});
```

**保险二：同一个工具、同一组参数，连续调三次就该停了。** 这不是靠猜，是靠记录最近几次调用的签名：

```js
// 放在 runAgent 函数体开头,而不是模块顶层——每次运行从零开始记录,
// 避免同一进程里跑第二次任务时,上一次的记录误触发终止
const recentCalls = [];

// ……在 for (const block of response.content) 循环体内,执行 handler 之前:
const signature = `${block.name}:${JSON.stringify(block.input)}`;
recentCalls.push(signature);
const last3 = recentCalls.slice(-3);
if (last3.length === 3 && last3.every((s) => s === signature)) {
  return "检测到连续 3 次用相同参数调用同一个工具,已终止执行。";
}
```

加上 `MAX_TURNS` 这道总闸，三道安全阀分工不同：`MAX_TURNS` 防"模型换着花样一直要工具，永远不停"；重复调用检测防"模型卡在同一个参数上原地打转"；工具内部的路径和格式校验（第三步写的那些）防"模型编了个越权参数，工具还老老实实执行了"。三层缺一，循环就有失控或越权的风险[^S18]。

**怎么从日志里看出"工具接错了"?** 两个最常见的信号：

- **模型反复调同一个工具**，参数只在小范围内变化（大小写、加减一个词）。十有八九不是模型笨，是 `tool_result` 内容太模糊——"没找到"返回空字符串，模型分不清"确实没有"和"工具坏了"，只能靠猜再试一次。
- **模型把参数猜着填**，比如给 `read_file` 传了一个不存在的路径。往回查通常有两种原因：`description` 没交代清楚参数该从哪来（呼应第 4 课），或前一步工具返回的内容里没给出精确路径，模型只能拍脑袋编一个。

```agentmentor-check
{
  "id": "tool-zh-06-diagnose-loop",
  "label": "判断 Agent 反复调用同一个工具的原因",
  "prompt": "假设一位同学把 searchFiles 的未命中返回值改成了空字符串（而不是本课写的「没有找到匹配的内容。」）。这个改过的 Agent 处理「检查项目里有没有用 moment.js」时，连续 5 轮都在调用 search_files，参数只是把正则从 \"moment\" 换成 \"Moment\" 再换成 \"MOMENT\"，最后撞上 MAX_TURNS 被终止。项目里其实确实没有用 moment.js。这个循环最可能的根本原因是什么？",
  "whyHere": "刚讲完执行循环和安全阀，需要检查学习者能不能把「模型反复调同一个工具」这个症状，和「tool_result 内容有没有把状态说清楚」这个根因对应起来，而不是归咎于模型能力或轮数上限",
  "mode": "single",
  "choices": [
    {
      "id": "a",
      "text": "模型能力不够，分不清大小写，应该换一个更强的模型",
      "correct": false,
      "feedback": "换模型治标不治本。真正的问题在 tool_result 里——空字符串和「工具坏了」几乎没区别，模型没法区分「确实没找到」和「调用失败」，只能换个写法再试。"
    },
    {
      "id": "b",
      "text": "searchFiles 在没有命中时返回空字符串，模型把它当成一次不确定的结果，于是换个参数重试",
      "correct": true,
      "feedback": "正确。tool_result 的内容是模型判断「这一步做完了没有」的唯一依据。空字符串是个模糊信号，模型没法确定是没找到还是执行失败，于是换个正则再试。把返回值改成「没有找到匹配的内容」这样的明确文字，模型看到后就会停止重试，直接得出「项目里没有用这个库」的结论。"
    },
    {
      "id": "c",
      "text": "MAX_TURNS 设置得太低，应该调大之后再看会不会自己停下来",
      "correct": false,
      "feedback": "调大 MAX_TURNS 只是让循环多转几轮再撞墙，不解决模型为什么重试。根因在 searchFiles 返回的信号不明确，不在轮数上限。"
    }
  ]
}
```

<!-- exercises -->
## 💻 练习

### Level 1：跑通它，再接上第四个工具

把本课代码抄到本地一个空目录，`npm install @anthropic-ai/sdk`，再执行 `npm pkg set type=module`（本课代码全部用 ESM 的 import 语法，Node 22.7 以下版本少了这一步会直接报 "Cannot use import statement outside a module"），设置好 `ANTHROPIC_API_KEY`（`GITHUB_TOKEN` 可选），跑一次 `node agent.js "我们项目里是不是用了 lodash?查一下它在 GitHub 上的情况"`，确认能看到至少两轮不同的工具调用、最后给出文字回答。

跑通之后，接上第四个工具 `write_report(path, content)`：把检查结果写成 Markdown 文件，只允许写到项目下的 `reports/` 目录，写到别处一律拒绝。改一句提示词，比如"把刚才的检查结果写成 reports/lodash-check.md"，确认模型会主动调用这个新工具。

<!-- rubric -->
- 三个已有工具能跑通，日志里能看到至少两轮工具调用，且后一轮参数用到了前一轮的结果
- `write_report` 的路径限制真的生效：尝试写 `reports/../secret.txt` 或 `reports-evil/x.md` 之类的路径会被拒绝
- `write_report` 正确注册进了 `TOOLS` 表：`toolSchemas` 能看到它的 schema，`toolHandlers` 能查到对应函数

<!-- answer -->
核心是照抄 `readFile` 的边界检查思路，只是把"读"换成"写"，并且把允许的范围从整个项目根目录收窄到 `reports/` 一个子目录：

```js
const REPORTS_DIR = path.join(PROJECT_ROOT, "reports");

async function writeReport({ path: relPath, content }) {
  fs.mkdirSync(REPORTS_DIR, { recursive: true });
  const abs = path.resolve(PROJECT_ROOT, relPath);
  const inReports = abs === REPORTS_DIR || abs.startsWith(REPORTS_DIR + path.sep);
  if (!inReports) {
    return "拒绝执行:只能把文件写到 reports/ 目录下。";
  }
  fs.writeFileSync(abs, content, "utf8");
  return `已写入 ${path.relative(PROJECT_ROOT, abs)}`;
}

const writeReportSchema = {
  name: "write_report",
  description: "把文本内容写成一个 Markdown 文件,只能写到 reports/ 目录下,不能写到项目其它位置。",
  input_schema: {
    type: "object",
    properties: {
      path: { type: "string", description: "相对项目根目录的路径,必须以 \"reports/\" 开头" },
      content: { type: "string", description: "要写入的完整文本内容" },
    },
    required: ["path", "content"],
  },
};

TOOLS.write_report = { ...writeReportSchema, handler: writeReport };
```

<!-- hint -->
路径检查的写法和 `readFile` 一样：`path.resolve` 之后拼上 `path.sep` 做前缀比较，只是把基准从 `PROJECT_ROOT` 换成 `REPORTS_DIR`——不拼分隔符的话，`reports-evil/` 这种同前缀目录就能绕过检查。

<!-- hint -->
写文件前记得 `fs.mkdirSync(REPORTS_DIR, { recursive: true })`，不然 `reports/` 目录第一次不存在时 `writeFileSync` 会直接抛错。

### Level 2：制造一个失败，再修好它

下面这段循环代码有一个 bug，请先说明它在什么情况下会导致下一轮 API 请求报错，再给出修复后的代码。

```js
// 有 bug 的版本
const block = response.content.find((b) => b.type === "tool_use");
if (block) {
  const result = await toolHandlers[block.name](block.input);
  messages.push({
    role: "user",
    content: [{ type: "tool_result", tool_use_id: block.id, content: String(result) }],
  });
}
```

<!-- rubric -->
- 准确指出 bug：用 `.find()` 只取第一个 `tool_use` 块，模型一次并行请求多个工具时，后面的调用完全被忽略
- 说清楚实际症状：上一轮助手消息里有几个 `tool_use` 块，下一轮就必须有几个对应的 `tool_result`，少了会直接报错
- 修复方案改成遍历所有 `type === "tool_use"` 的块，每一个都生成对应的 `tool_result`，一起塞进同一条 `user` 消息

<!-- answer -->
bug 在于假设一轮里最多只有一个工具调用，实际上模型完全可能一次并行请求两三个。修复方式就是本课第四步展示过的写法，把 `.find()` 换成遍历所有块：

```js
const toolResults = [];
for (const block of response.content) {
  if (block.type !== "tool_use") continue;
  const result = await toolHandlers[block.name](block.input);
  toolResults.push({ type: "tool_result", tool_use_id: block.id, content: String(result) });
}
messages.push({ role: "user", content: toolResults });
```

<!-- hint -->
数一数 `response.content` 里可能有几个 `type` 为 `"tool_use"` 的元素——模型完全可能一次并行请求两个工具，而不是永远只请求一个。

<!-- hint -->
API 的规则是：上一轮助手消息里有几个 `tool_use` 块，下一轮的 `user` 消息里就必须有几个对应的 `tool_result`，一个都不能少。

<!-- /exercises -->

## 小结

- 工具的 schema 和 handler 放在同一张表(`TOOLS`)里注册，`toolSchemas`、`toolHandlers` 都从这张表派生，改一处不会漏改另一处
- 执行循环的核心是：发请求 → 看 `stop_reason` 是不是 `tool_use` → 是就遍历**每一个**工具调用块、执行、拼回 `tool_result` → 不是就返回文字，循环结束
- 一轮里可能有多个并行的工具调用，每一个 `tool_use` 都要有唯一对应的 `tool_result`，漏一个下一轮请求就会报错
- 三道安全阀各管一层：`MAX_TURNS` 防止模型无限索要工具，重复调用检测防止模型在同一组参数上打转，工具内部的路径和格式校验防止参数越权
- `tool_result` 的内容要把"没找到"和"出错了"说清楚，含糊的空返回是模型反复重试、日志看起来像是"接错了"的头号原因

你已经走完这门课的六课，从"Agent 为什么需要工具"讲到自己写出一个能跑的工具执行循环。接下来最值得做的，不是再读一课，而是挑一个你项目里真实要做的小任务，拆成两三个工具，把这套循环骨架搬过去改一改——跑起来一次，比再读十遍解释都管用。调试时拿不准具体字段，回 `sources.md` 查 S4、S5 两篇官方文档，那是这套多轮循环最原始的规范文本。
