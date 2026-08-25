# 第 6 课：实战：搭一个双 Agent 评审流水线

> 学习目标：
> - 用 Claude API 写出一个可以真正运行的生产者-评审者双 Agent 流水线
> - 让评审者返回结构化、可核查的评审结果，而不是一句笼统的「还不错」
> - 给这套循环装上安全阀，避免生产者和评审者无限来回打磨
>
> 前置要求：读完第 1-5 课，能读懂基本的 JavaScript/Node.js，有可用的 Claude API key | 上一课 [第 5 课 <<](./05-failure-and-coordination.md)

## 先看效果：一次完整的运行

这是本课最后要跑出来的东西。终端里给一个任务，两个 Agent 轮流干活，直到评审通过或者到达轮数上限：

```
$ node review-pipeline.js "写一段面向开发者的 API 变更公告：v2 接口把 user_id 字段从数字类型改成了字符串类型"

[生产者 第 1 版]
v2 接口升级啦!体验大幅提升,欢迎大家尽快使用新版本。

[评审者 第 1 轮] 未通过,问题:
- 没有明确说明这次变更影响的具体字段(user_id 从数字变成字符串这件事完全没提)
- 没有给出迁移建议,开发者不知道接下来该怎么改代码
- "体验大幅提升"是无法核实的夸张说法,没有给出具体依据

[生产者 第 2 版]
v2 接口变更通知:user_id 字段类型由 number 改为 string。
请检查所有解析该字段的代码,把数值类型的读取逻辑改为字符串处理,
避免因类型不匹配导致解析失败。本次变更已在 v2.1.0 生效。

[评审者 第 2 轮] 通过

最终定稿(第 2 轮通过):
v2 接口变更通知:user_id 字段类型由 number 改为 string。
请检查所有解析该字段的代码,把数值类型的读取逻辑改为字符串处理,
避免因类型不匹配导致解析失败。本次变更已在 v2.1.0 生效。
```

第一版被评审者打回，理由具体到每一条标准；生产者照着意见改出第二版，评审者再看一遍，这次通过。这就是第 4 课讲过的**生产者-评审者**模式落地成的代码：「一次 LLM 调用生成回复，另一次 LLM 调用提供评估和反馈，如此循环。」[^S2]

## 整体结构：和执行循环是同一个骨架

如果你学过本系列「Agent 工具调用基础」那门课，会发现这套流水线的骨架很眼熟：一个循环、每一轮做一次判断、判断结果决定要不要继续、外加一道防止无限循环的安全阀。区别只在于「判断」判断的是什么——那门课的工具执行循环判断的是「模型还要不要调用工具」（循环语义详见那门课第 2 课及其官方来源），这里判断的是「评审者说通过了没有」。骨架相同，循环体里装的东西不同。

整套流水线由三个函数拼起来：`runProducer` 负责生成或者修改正文，`runReviewer` 负责依据标准打分并给出具体意见，`runPipeline` 把两者串成循环，加上轮数上限这道安全阀。

## 第一步：生产者——接到任务，产出正文

生产者第一次运行时只有任务本身；如果是被评审者打回后的第二次运行，还要同时带上**上一版全文**和评审意见，让生产者在上一版的基础上照着意见改，而不是重新自由发挥：

```js
import Anthropic from "@anthropic-ai/sdk";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const MODEL = "claude-sonnet-5"; // 换成你账号下能调用的模型
const MAX_ROUNDS = 3; // 安全阀:生产者-评审者最多打磨 3 轮,避免无限循环

async function runProducer(task, feedback, prevDraft) {
  const prompt = feedback
    ? `任务:${task}\n\n你上一版的内容如下:\n"""\n${prevDraft}\n"""\n\n这一版被评审者打回,意见如下:\n${feedback}\n\n请在上一版的基础上按这些意见修改,直接给出修改后的完整正文,不要额外解释。`
    : `任务:${task}\n\n请直接给出正文,不要额外解释。`;

  const response = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 512,
    messages: [{ role: "user", content: prompt }],
  });
  const block = response.content.find((b) => b.type === "text");
  return block ? block.text.trim() : "";
}
```

生产者的提示词是自包含的——第 3 课讲过，子代理看不到编排者这边发生了什么，也看不到自己上一次是怎么被评审的[^S3]。所以每次调用都把「任务是什么」「上一版写了什么」「（如果有）上一轮的问题是什么」原样写进这次的 prompt 里。注意连生产者自己的上一稿也要显式传回去——这是自包含原则最容易被漏掉的一半：Messages API 是无状态的，每次请求都必须自带完整的所需历史，请求之间服务器什么都不保留[^S8]，「修改你上一版的内容」这句话只有在上一版真的写进了这次 prompt 时才有意义。

## 第二步：评审者——依据具体标准打分，不给模糊评价

评审者不是简单问模型「这段写得好不好」——第 5 课讲过，验证要落到具体、可核查的标准上，而不是凭印象打分[^S1]。这里给评审者一份明确的检查清单，并要求它按固定的 JSON 格式回复：

```js
const REVIEW_CRITERIA = [
  "是否明确说明了这次变更影响的具体字段或接口(不能只说「有变化」「体验提升」)",
  "是否给出了具体的迁移建议,告诉开发者接下来该怎么改代码",
  "全文是否控制在 150 字以内",
  "有没有出现无法核实的夸张说法(比如「大幅提升」却不给出具体依据)",
];

async function runReviewer(task, draft) {
  const prompt = `你是评审者,只负责挑毛病,不负责改写。任务要求:${task}

评审标准(逐条核查,不要笼统评价):
${REVIEW_CRITERIA.map((c, i) => `${i + 1}. ${c}`).join("\n")}

待评审的正文:
"""
${draft}
"""

严格按下面的 JSON 格式回复,不要输出 JSON 之外的任何文字:
{"approved": true 或 false, "issues": ["逐条指出没有通过的标准,每条说明具体问题;全部通过则给空数组"]}`;

  const response = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 512,
    messages: [{ role: "user", content: prompt }],
  });
  const block = response.content.find((b) => b.type === "text");
  return block ? block.text.trim() : "{}";
}
```

`approved` 和 `issues` 两个字段合起来就是一份**结构化评审结果**：不是一句「还可以」，而是「通过还是没通过」加上「没通过的每一条具体是什么问题」。生产者拿到 `issues` 之后，改的就是这几条具体问题，而不是对着一句模糊评价瞎猜该往哪改。

## 第三步：评审结果不能直接信——解析失败当作没通过

`runReviewer` 返回的是一段文本，不是真正的 JSON 对象，还需要解析。评审者虽然被要求「严格按 JSON 格式回复」，但没有结构化输出约束时，模型仍可能产出语法不合法的 JSON、漏掉字段，或者在 JSON 外面裹一层代码块、加几句解释[^S9]。这一步容易踩的坑是：解析失败了怎么办？如果图省事，解析失败就默认放行，等于把一次「评审者没干好活」的失败，悄悄当成了「评审通过」——这正是第 5 课讲过的道理：产出「看起来」处理完了，不等于真的做对了，没法验证就不该直接采用[^S6]。这里反过来处理：解析失败，一律当作**没通过**，而不是当作通过：

```js
function extractJson(raw) {
  // 模型有时会用代码块包住 JSON,先尝试把代码块剥掉
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
  return fenced ? fenced[1].trim() : raw.trim();
}

function parseReview(raw) {
  try {
    const parsed = JSON.parse(extractJson(raw));
    if (typeof parsed.approved !== "boolean" || !Array.isArray(parsed.issues)) {
      throw new Error("字段形状不对");
    }
    return parsed;
  } catch (err) {
    return {
      approved: false,
      issues: [`评审者没有按约定格式回复,原始内容:${raw.slice(0, 200)}`],
    };
  }
}
```

`typeof parsed.approved !== "boolean"` 和 `!Array.isArray(parsed.issues)` 这两行也是同一个道理的延伸——就算 `JSON.parse` 成功了，也要确认解析出来的字段形状对不对，字段类型不对同样当作没通过，不能因为「至少是个合法 JSON」就放松警惕。

顺带一提：官方提供了结构化输出功能，能从采样层面保证响应严格符合 schema[^S9]。本课故意用「裸调用 + 自行防御解析」的写法，是为了让你亲手体会「模型输出不能直接信」这件事；生产环境里可以直接用结构化输出把这一层坑消掉。

## 第四步：串成循环，装上安全阀

有了 `runProducer`、`runReviewer`、`parseReview`，`runPipeline` 把三者接起来，`MAX_ROUNDS` 是这里唯一的安全阀——生产者和评审者理论上可以无限打磨下去，必须有个上限：

```js
async function runPipeline(task) {
  let draft = await runProducer(task);
  console.log(`[生产者 第 1 版]\n${draft}\n`);

  for (let round = 1; round <= MAX_ROUNDS; round++) {
    const review = parseReview(await runReviewer(task, draft));

    if (review.approved) {
      console.log(`[评审者 第 ${round} 轮] 通过`);
      return { draft, rounds: round, approved: true };
    }

    console.log(`[评审者 第 ${round} 轮] 未通过,问题:\n- ${review.issues.join("\n- ")}\n`);

    if (round === MAX_ROUNDS) {
      return { draft, rounds: round, approved: false, issues: review.issues };
    }

    draft = await runProducer(task, review.issues.join("\n"), draft);
    console.log(`[生产者 第 ${round + 1} 版]\n${draft}\n`);
  }
}

const task =
  process.argv[2] ??
  "写一段面向开发者的 API 变更公告:v2 接口把 user_id 字段从数字类型改成了字符串类型";

runPipeline(task)
  .then((result) => {
    if (result.approved) {
      console.log(`最终定稿(第 ${result.rounds} 轮通过):\n${result.draft}`);
    } else {
      console.log(
        `达到最大轮数 (${MAX_ROUNDS}) 仍未通过评审,输出最后一版供人工复核:\n${result.draft}\n\n` +
          `最后一轮未解决的问题:\n- ${result.issues.join("\n- ")}`
      );
    }
  })
  .catch((err) => {
    // API 调用本身也可能失败(网络、鉴权、限流),同样不能悄悄吞掉
    console.error(`流水线执行失败:${err.message}`);
    process.exitCode = 1;
  });
```

到达 `MAX_ROUNDS` 仍未通过时，`runPipeline` 不会强行判它「通过」，而是老老实实交出最后一版草稿和还没解决的问题，留给人工复核——这也是第 5 课讲过的道理在收尾这一步的体现：结果整合阶段遇到判断不了的情况，不该在代码里自己拍板蒙混过去。

```agentmentor-check
{
  "id": "mac-zh-06-invalid-review-json",
  "label": "评审者没有按格式回复，该怎么处理",
  "prompt": "跑这套流水线时，评审者有一次没有严格按 JSON 格式回复，而是多说了一句「大致看了一下，内容基本没问题」，导致 `JSON.parse` 抛出异常。为了让流水线能继续跑下去，是不是应该把这种解析失败的情况，当作评审通过来处理？",
  "whyHere": "解析失败时「干脆当成通过，先让程序跑下去再说」是很容易被采纳的省事做法，需要在这里用第 5 课「产出看起来合理不等于真的做对了」这条原则把这个想法挡回去，检验能不能把该原则用到自己写的代码里",
  "mode": "single",
  "choices": [
    {
      "id": "a",
      "text": "应该，反正评审者说了「基本没问题」，先放行，避免流水线卡住",
      "correct": false,
      "feedback": "这正是第 5 课警告过的「先信任、后验证」的落差——评审者没有按约定的 JSON 格式回复，说明它这一次没有严格依据评审标准逐条核查，一句「基本没问题」的自然语言表态不能替代结构化的评审结果。把解析失败当成通过，等于把一次「评审者没干好活」的失败，悄悄包装成了「评审通过」端上去。"
    },
    {
      "id": "b",
      "text": "应该，只要生产者的正文本身看起来没问题，评审者用什么格式回复不重要",
      "correct": false,
      "feedback": "评审者的回复格式恰恰是流水线用来自动判断「通过没通过」的唯一依据——如果格式可以随意不遵守还被当成通过，评审这一步等于名存实亡，前面设计的结构化评审标准也失去了意义。"
    },
    {
      "id": "c",
      "text": "不应该，解析失败应该当作没通过处理，把原始回复内容记录进问题列表，让生产者再试一次，或者留给人工复核",
      "correct": true,
      "feedback": "正确。评审结果格式不对，本身就是一种「没法核实」的情况，按第 5 课的原则，没法验证就不该直接采用。本课代码里 `parseReview` 就是这么处理的：解析失败一律返回 `approved: false`，并把原始内容作为问题记录下来，让流程按「没通过」继续走，而不是悄悄放行。"
    }
  ]
}
```

<!-- exercises -->
## 💻 练习

### Level 1：跑通它，再加一条评审标准

把本课代码拼成一个 `review-pipeline.js`，`npm install @anthropic-ai/sdk`，`npm pkg set type=module`，设置好 `ANTHROPIC_API_KEY`，跑一次本课示例任务，确认能看到至少一轮「未通过」再看到「通过」（如果生产者第一版就直接通过了，可以把任务换成一个更容易踩坑的场景，比如故意要求「写一段很短的公告」但不说清楚具体多短）。

跑通之后，给 `REVIEW_CRITERIA` 加一条新标准：「正文里是否提到了具体的生效版本号」，重新运行，确认评审者的 `issues` 里会出现和这条新标准相关的意见。

<!-- rubric -->
- 流水线能真正跑起来，日志里能看到生产者第一版、至少一轮评审意见
- 新增的评审标准确实影响了评审结果——缺这条信息的草稿会被标记出来
- 能说明白如果一直不通过、到达 `MAX_ROUNDS`，流水线最终会输出什么（不是报错崩溃，而是交出最后一版和未解决问题）

<!-- answer -->
把 `REVIEW_CRITERIA` 数组新增一项：

```js
const REVIEW_CRITERIA = [
  "是否明确说明了这次变更影响的具体字段或接口(不能只说「有变化」「体验提升」)",
  "是否给出了具体的迁移建议,告诉开发者接下来该怎么改代码",
  "全文是否控制在 150 字以内",
  "有没有出现无法核实的夸张说法(比如「大幅提升」却不给出具体依据)",
  "正文里是否提到了具体的生效版本号",
];
```

不需要改 `runReviewer` 或 `runPipeline` 的任何代码——评审标准是通过模板字符串拼进评审者的 prompt 里的，新增一条数组元素，评审者下一次调用就会按新的完整清单逐条核查。如果生产者的草稿一直没提到版本号，`issues` 里会出现针对这条标准的具体意见，生产者下一轮会照着这条意见修改。

<!-- hint -->
如果发现生产者第一版就直接通过、看不到「未通过」的日志，说明任务本身对生产者来说太容易达标了——试着让评审标准更严格，或者给任务加一个生产者第一次容易漏掉的具体要求。

<!-- hint -->
到达 `MAX_ROUNDS` 仍未通过时，回看 `runPipeline` 最后一段代码——它并没有抛错让程序崩溃，而是正常返回 `approved: false` 加上最后一版草稿和问题列表，交给调用它的代码决定怎么处理。

### Level 2：制造一个失败，再修好它

下面这版 `parseReview` 有一个问题，请先说明它在什么情况下会导致一份没有真正评审过的草稿被当成「通过」放行，再给出修复后的代码。

```js
// 有问题的版本
function parseReview(raw) {
  try {
    return JSON.parse(raw);
  } catch (err) {
    return { approved: true, issues: [] };
  }
}
```

<!-- rubric -->
- 准确指出问题：解析失败时返回 `approved: true`，等于把「评审者没按格式回复」的失败情况，当成了「评审通过」
- 说明了这会带来什么具体后果（结合第 5 课「不能直接信」的原则）
- 修复方案把解析失败的兜底结果改成 `approved: false`，并把原始内容记录进 `issues`，供排查或者交给生产者重试

<!-- answer -->
问题在于 `catch` 分支里把兜底结果设成了 `{ approved: true, issues: [] }`——只要评审者这次没有按 JSON 格式回复（哪怕只是多说了一句寒暄），`JSON.parse` 就会抛异常，`catch` 分支立刻把这次「根本没有被有效评审」的草稿标记成「通过」，直接放行。这正是第 5 课警告过的：产出「看起来」处理完了不等于真的做对了，没法验证的情况不该被当成合格结果直接采用。

修复方式是把解析失败一律当作没通过：

```js
function parseReview(raw) {
  try {
    const parsed = JSON.parse(extractJson(raw));
    if (typeof parsed.approved !== "boolean" || !Array.isArray(parsed.issues)) {
      throw new Error("字段形状不对");
    }
    return parsed;
  } catch (err) {
    return {
      approved: false,
      issues: [`评审者没有按约定格式回复,原始内容:${raw.slice(0, 200)}`],
    };
  }
}
```

<!-- hint -->
把自己代入到评审者「没按格式回复」这一种具体情况——如果兜底结果是「通过」，那这份草稿相当于完全没有经过任何有效检查就被端上去了，跟评审者根本没运行过没有区别。

<!-- hint -->
兜底结果该设成什么，可以反过来想：解析失败到底更接近「已确认没问题」，还是更接近「没法确认有没有问题」？第 5 课的答案是：没法确认，就不该当成没问题处理。

<!-- /exercises -->

## 小结

- 生产者-评审者流水线的骨架和执行循环是同一套东西：一个循环、每一轮做一次判断、判断结果决定要不要继续，外加一道防止无限循环的安全阀。官方对这个模式的定义正是「一次调用生成回复、另一次调用提供评估和反馈、如此循环」[^S2]——这里的判断从「要不要调用工具」换成了「评审者说通过了没有」。
- 生产者的提示词是自包含的：每次调用都把任务、上一版全文和（如果有）上一轮的具体问题原样写进 prompt——Messages API 无状态，每次请求都要自带完整历史，请求之间什么都不保留[^S8]，不能指望模型自己记得上一轮发生了什么[^S3]。
- 评审者要依据具体、可核查的标准逐条打分，返回结构化的 `{approved, issues}`，而不是一句笼统的评价[^S1]。
- 评审者返回的内容本身也不能直接信——解析失败或者字段形状不对，应该当作没通过处理，而不是悄悄放行[^S6]；这条原则不只适用于「相信子代理说的话」，也适用于「相信子代理返回的数据格式」。
- 到达最大轮数仍未通过时，流水线应该老实交出最后一版草稿和未解决的问题，留给人工复核，而不是在代码里自己拍板判定通过。

到这里，这门课的六课就学完了：从「为什么要多个 Agent」，到编排者-子代理怎么分工、委派提示词怎么写、几种协作模式各自适合什么场景、失败该怎么应对，最后自己动手搭出了一套能跑的生产者-评审者流水线。接下来最值得做的，不是再读一遍解释，而是挑一个你手头真实的小任务，套进这套流水线骨架里改一改评审标准，跑起来看看它到底会不会打回、打回几次——亲手调一次评审标准，比再读十遍原理都管用。
