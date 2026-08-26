# 第 4 课：副作用与幂等：恢复时哪些工具敢重跑

> 学习目标：
> - 说清恢复重放为什么默认给你的是「至少一次」执行语义，而不是「恰好一次」
> - 判断一个工具操作是否幂等，识别哪些副作用一旦重跑就会闯祸
> - 设计并实现效果台账（effects ledger），用 `tool_use_id` 做幂等键，让恢复时的悬空调用先查台账、再决定要不要真的执行
>
> 前置要求：读过第 2、3 课，理解 `checkpoint.json` 里 `pendingToolUse` 悬空调用的对账规则（第 3 课）；了解本系列第 7 门课的 `HIGH_IMPACT` 工具集合与执行前审批阀 | 上一课 [第 3 课 <<](./03-resume-from-checkpoint.md) | 下一课 [第 5 课 >>](./05-rewind-and-fork.md)

## 恢复带来的「至少一次」：第 3 课把高影响工具的对账挂起了

第 3 课教你从 `checkpoint.json` 里读出 `pendingToolUse`，用它把「崩溃发生在工具执行与结果落账之间」的悬空调用接回循环。当时的对账规则是：只读工具直接重跑就好，高影响工具查不清楚就补一个 `is_error` 的 `tool_result`，先让循环别卡死，把这件事交回给人。这是个诚实的兜底，但也是个没解决的问题——查不清楚，意味着任务没法自动续上，每次崩溃在高影响工具上，都得有人来盯着。

问题的根子在于：恢复这件事，天生给你的是**至少一次**（at-least-once）的执行语义。进程可能在工具真的执行成功之后、结果还没来得及写回 `messages` 或落进检查点之前崩掉——这时候「这个工具到底跑没跑」这件事，单看 `checkpoint.json` 是分辨不出来的。对 `read_file` 这种只读工具，分辨不出来无所谓，大不了多读一次，结果一样。可对 `send_email`、`create_ticket`、转账这类操作，分辨不出来就是事故：重跑意味着收件人可能收到两封同样的邮件，系统里可能凭空多出一张工单。

这不是个新问题。本系列第 1 门课就说过，Agent 是有状态的、错误会复利[^S1]——重复执行一次本该只发生一次的副作用，正是复利的一种具体形态：错误不会停在「多跑了一次」，它会顺着这次多余的副作用继续往下游滚。这一课要把第 3 课挂起的问题解决掉：引入**幂等性**这个概念，再给恢复循环装上一本**效果台账**，让「查不清楚」变成「查得清楚」。

## 幂等的定义：重跑一次和重跑多次，效果得一样

**幂等**（idempotent）说的是：一个操作执行一次和执行多次，最终效果相同，就是幂等的。注意这说的是「效果」，也就是操作对外部世界（文件、数据库、收件箱）留下的最终状态，不是说每次调用返回的字面值必须一样。

判断一个工具幂不幂等，问自己一句话就够：「如果这个操作被悄悄多跑了一次，外部世界会不会因此多出点什么、或者变得不一样？」下面几个小例子，照着这句话过一遍就能看出差别。

```javascript
// 幂等：读文件没有副作用，调用几次磁盘上的内容都一样
async function readFileContent(path) {
  return fs.readFile(path, "utf8");
}

// 非幂等：每调用一次，数组里就真的多了一行
function appendRow(sheet, row) {
  sheet.rows.push(row);
}

// 幂等：不管调用几次，第 42 行最终都收敛到同一个值
function setLine(doc, lineNo, text) {
  doc.lines[lineNo] = text;
}

// 非幂等：每调用一次，收件人的邮箱里就真的多了一封信
async function sendEmail(to, subject, body) {
  return mailer.send({ to, subject, body });
}
```

`readFileContent` 天然幂等，因为它压根没有副作用——没有「留下点什么」这回事。`setLine` 也幂等，尽管它确实修改了状态，但修改的方式是**覆盖**：调用一次把第 42 行设成 X，调用十次还是设成 X，终态不随调用次数变化。`appendRow` 和 `sendEmail` 不幂等，原因都一样：它们的效果是**累加**的——每调用一次，外部世界就真的多出一份东西，调用次数直接体现在最终状态里。

记住这条分界线：覆盖式的写入通常幂等，追加式的写入通常不幂等；读操作和「先查重再决定要不要动手」的操作通常幂等，纯粹的「无条件新增」通常不幂等。下一节的效果台账，就是专门用来兜住那些不幂等、又不得不保留的操作。

## 效果台账：把「哪些副作用已经发生」也落盘

第 2 课教你把循环的执行现场——`messages`、计数器、还没落账的工具调用——存进检查点，好让崩溃后能从原地拉起来。但检查点回答的是「循环跑到哪一步了」，回答不了「这一步的副作用真的发生了吗」。这两件事在正常运行时几乎同步，可一旦崩溃发生在两者之间的缝隙里，它们就会对不上——这正是第 3 课挂起高影响工具对账的根本原因。

补上这道缝隙，靠的是一本**效果台账**（effects ledger）：把「哪些副作用已经发生」单独落盘，不和检查点混在一起。它的结构很简单，一个以 `tool_use_id` 为键的映射：

```javascript
// effects.json 的形状
{
  "toolu_01abc": {
    "name": "create_ticket",
    "result": { "id": "T-1", "title": "客户报障" },
    "at": "2026-08-26T09:12:03.000Z"
  }
}
```

写入台账的时机很讲究：工具函数真正执行成功、拿到结果的那一刻立刻写，而且要比第 2 课那次「B 点」检查点（工具结果被写进 `messages` 之后例行落盘的那个点）还要早一拍。原因很直接：如果崩溃恰好发生在「工具执行成功」和「B 点检查点写完」这段窄窗口里，B 点检查点根本来不及记录这件事发生过，恢复时你只能靠更早写完的台账去判断真相。台账写入本身也要用第 2、3 课那套 `.tmp` + `rename` 的原子写，道理相同——半成品的台账文件比没有台账更危险，它会让你误信一个从没真正完成的副作用。

```javascript
import { promises as fs } from "node:fs";

async function loadEffects(path) {
  try {
    return JSON.parse(await fs.readFile(path, "utf8"));
  } catch {
    return {}; // 文件不存在或损坏，当成空台账，不阻塞恢复
  }
}

async function saveEffects(path, effects) {
  const tmp = `${path}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(effects, null, 2));
  await fs.rename(tmp, path); // 原子替换，不留半成品
}
```

有了台账，恢复时的对账规则就能从第 3 课的「查不清楚」升级成「查得清楚」：拿到 `checkpoint.json` 里的 `pendingToolUse`，用它的 `id` 去台账里查——**命中**，说明这个副作用已经真实发生过，直接取台账里存的 `result` 补一个 `tool_result`，绝不再执行一遍；**没命中**，说明这次调用要么从没开始、要么执行到一半就崩了还没来得及成功，安全执行就是。这条规则对所有工具都成立，只是对幂等工具而言「查不查」都无所谓——真正靠它兜底的，是那些一旦重复就会闯祸的操作。

这里有个关键洞见，值得单独说一句：**`tool_use_id` 天然就是幂等键**。模型每次点名一个工具，都会带上一个「针对这个 `tool_use` 块的唯一标识符」[^S4]——这是官方规范里 `id` 字段的逐字定义。同一次点名如果因为恢复重放而被再看见一次，这个 `id` 不会变；台账正是靠这一点，把「这次调用」和「上次那次调用」认成同一件事，而不需要你自己再发明一套去重逻辑。

```agentmentor-check
{
  "id": "sp-zh-04-blind-retry",
  "label": "悬空的 send_email 调用，重跑之后模型能自己纠正吗",
  "prompt": "恢复时，你的 harness 在 checkpoint.json 里发现一个悬空的 send_email 调用——崩溃恰好发生在邮件发出去之后、结果还没落账之前。有同事说：「无脑重跑就行，反正模型看到回传结果会自己纠正。」这个说法站得住脚吗？",
  "whyHere": "刚讲完效果台账的对账规则，这里要检验你是不是真的理解「重跑」和「模型能不能纠正」是两码事——这也是台账存在的根本原因，而不只是一个可有可无的额外步骤。",
  "mode": "single",
  "choices": [
    {
      "id": "a",
      "text": "站得住脚：模型看到「邮件已发送」的结果后，只要发现和之前的记忆对不上，会主动处理重复问题",
      "correct": false,
      "feedback": "模型能看到的只是这一次 tool_result 里回传的内容，它没有独立的渠道去感知「这封邮件之前是不是已经发过一次」，更没法伸手把已经进了收件人邮箱的第二封信收回来。副作用发生在外部世界，模型的输出改不动外部世界已经发生的事——它顶多能在下一句话里道歉，邮件还是发出去了两封。"
    },
    {
      "id": "b",
      "text": "站不住脚，但解法应该是恢复时一律跳过所有悬空的工具调用，交给人工处理",
      "correct": false,
      "feedback": "方向反了。一律跳过等于把所有工具都当成危险的，可大多数悬空调用要么是只读工具（重跑零风险），要么真的还没执行成功（重跑才是唯一正确做法）。这样做会让恢复退化成「每次崩溃都得人工介入」，丢掉了自动续跑本该带来的好处，是用因噎废食解决了一个本该靠证据判断的问题。"
    },
    {
      "id": "c",
      "text": "站不住脚：模型只能看到这次调用回传的结果，感知不到「重复执行」本身已经发生在外部世界里；必须靠 harness 在执行前查效果台账，用 tool_use_id 判断这次调用是不是已经真的发生过",
      "correct": true,
      "feedback": "对。模型的世界就是它看到的那些 tool_result，它没有别的眼睛能看见「收件人的邮箱里现在有几封信」。能看见这件事、也只有它能拦住重复的，是 harness——在真的调用工具之前，先用这次调用的 tool_use_id 去效果台账里查一遍：命中就直接复用台账里存的结果，绝不重跑；没命中才安全执行。这道闸不依赖模型的判断力，靠的是台账里留下的确定证据。"
    }
  ]
}
```

## 分层防线：审批阀管「该不该做」，台账管「做没做过」

本系列第 7 门课给 `runToolUses` 装过一道审批阀：高影响工具在真正执行之前，先打印出即将做的事、等人确认，确认了才放行[^S3]。那道阀拦的问题是「这件事该不该做」。本课的效果台账拦的是另一个问题：「这件事做没做过」。两道闸问的问题不一样，但卡的位置一样——都堵在「模型点了名、工具还没真的跑」那一刻，谁都不准工具函数在没被自己检查过之前先执行。

把两道闸叠在一起，`runToolUses` 长这样：

```javascript
const HIGH_IMPACT = new Set(["send_email", "create_ticket", "delete_file"]);

async function runToolUses(content, toolImpls, opts = {}) {
  const toolUseBlocks = content.filter((b) => b.type === "tool_use");
  const effects = await loadEffects(opts.effectsPath);
  const results = [];

  for (const block of toolUseBlocks) {
    // 幂等闸：这次调用是否已经真的发生过
    const recorded = effects[block.id];
    if (recorded) {
      results.push({ type: "tool_result", tool_use_id: block.id, content: recorded.result });
      continue; // 命中台账，直接复用结果，绝不重跑
    }

    // 审批阀：高影响操作在执行前先要确认（本系列第 7 门课）
    if (HIGH_IMPACT.has(block.name)) {
      const ok = await opts.approve?.(block.name, block.input);
      if (!ok) {
        results.push({
          type: "tool_result", tool_use_id: block.id,
          content: "用户拒绝了这次高影响操作，未执行。", is_error: true,
        });
        continue; // 跳过执行，但仍回一个 tool_result，别让这次调用悬空
      }
    }

    let output;
    try {
      output = await toolImpls[block.name](block.input);
    } catch (err) {
      // 工具本身执行失败：副作用没发生，如实回 is_error
      results.push({
        type: "tool_result", tool_use_id: block.id,
        content: `工具执行出错: ${err.message}`, is_error: true,
      });
      continue;
    }

    // 走到这里，副作用已经真的发生了。接下来的台账落盘即便失败，也绝不能谎报成执行失败——
    // 一旦回了 is_error，模型会以为这次没跑过、换一个新的 tool_use_id 重试，
    // 台账再也认不出这是同一次调用，重复副作用就这么漏过去了。
    effects[block.id] = { name: block.name, result: output, at: new Date().toISOString() };
    try {
      await saveEffects(opts.effectsPath, effects); // 执行成功后立刻落盘，别攒着
    } catch (err) {
      // 落盘失败是运维问题，不是工具问题：如实把真实结果回给模型，另外单独告警
      console.error(
        `[台账落盘失败] tool_use_id=${block.id} name=${block.name}：` +
        `副作用已发生但没记进台账，恢复时有重复执行风险，请人工核查。原因：${err.message}`,
      );
    }
    results.push({ type: "tool_result", tool_use_id: block.id, content: output });
  }
  return results;
}
```

顺序不能乱：幂等闸必须排在最前面。原因很直白——如果这次调用已经在台账里了，后面那道审批阀问「要不要做」根本没有意义，这件事已经做完了，再问一遍只会让人费解：系统明明已经做完了这件事，为什么还要重新确认。恢复时的悬空调用，第一件要问的事永远是「这事发生过没有」，问清楚了，再轮到「该不该做」登场。

## 工具设计侧的幂等：能治本就别只靠兜底

效果台账是 harness 侧的兜底——不管工具本身设计得幂不幂等，台账都能靠 `tool_use_id` 把重复执行拦下来。但兜底终究是兜底，更值得花心思的是治本：能改造的工具，尽量设计成天然幂等，让台账连出场的机会都没有。

最常见的一处改造是把「创建」换成「确保存在」：

```javascript
// 治本：天然幂等——先查重，已经存在就直接返回，不新建
async function ensureTicket(input) {
  const existing = await findTicketByTitle(input.title);
  if (existing) return existing;
  return createTicketRecord(input);
}
```

`ensureTicket` 不管被调用一次还是十次，系统里都只会有一张标题匹配的工单——终态不随调用次数变化，这正是幂等的定义。同样的思路也适用于写文件：整体覆盖式的 `write_file` 天然幂等，反复调用留下的是同一份内容；追加式的 `append_file` 不幂等，调用几次文件就长几截。能选覆盖，就别选追加。

治本和治标不是二选一，是分工：能设计成天然幂等的工具，尽量在工具那一层解决，省得每次调用都要绕道台账查一遍；那些业务上本来就没法「查重合并」的操作——比如两次真实发生在不同时间的转账，本就该被认成两个不同的事件，没法靠幂等设计合并成一个——台账才是唯一的兜底。

## 呼应：护栏之一，分寸自己拿

本系列第 1 门课说过，可靠性来自把模型的适应力，和「重试逻辑、定期检查点」这类确定性护栏配合起来[^S1]。效果台账就是这样一道护栏：它不要求模型自己判断「我是不是已经做过这件事了」——那本来就超出了模型能感知的范围，它只能靠 harness 用一份写在磁盘上的确定证据，替模型把这个判断做掉。

分寸也要留意。如果你的 Agent 手里全是只读工具，那这一课讲的台账大概率用不上——效果台账本身也是一层复杂度，值得加，是因为它确实挡住了重复副作用这个实打实的风险；只在复杂度确实能改善结果时才该加[^S3]。判断标准和上一课一样：先看你的工具集里有没有不幂等的高影响操作，有，就值得装这道闸；没有，就先别急着写。

<!-- exercises -->
## 💻 练习

### Level 1：给六个工具挑幂等性和风险等级

下面六个工具，逐一判断：(1) 它是不是幂等的；(2) 如果恢复时把一次悬空调用对它重跑一遍，风险等级是高、中还是低，说明理由。

- `read_file(path)` —— 读取文件内容
- `send_email(to, subject, body)` —— 发一封邮件
- `ensure_ticket(title, body)` —— 按标题查重，已存在就返回，不存在才新建工单
- `append_log(line)` —— 在日志文件末尾追加一行
- `set_config(key, value)` —— 把某个配置项设成给定的值（覆盖式）
- `delete_file(path)` —— 删除一个文件

<!-- rubric -->
- 六个工具的幂等性判断全部正确（幂等：read_file、ensure_ticket、set_config、delete_file；不幂等：send_email、append_log）
- 风险等级判断合理并给出了理由，而不是只报一个词（高/中/低要能说出「为什么」）
- 至少指出一个「幂等性依赖实现是否严谨」的例外情况（ensure_ticket 的查重逻辑、delete_file 对「文件不存在」的处理方式）

<!-- answer -->
`read_file` 幂等，天然无副作用，重跑零风险（低）。`send_email` 不幂等，每调用一次收件人就真的多收一封信，恢复时悬空重跑会造成重复发送，风险高，必须查台账才能安全重放。`ensure_ticket` 设计上是幂等的：标题相同的工单已存在时它会跳过新建，系统终态不随调用次数变化；但这份幂等性依赖「按标题查重」这条逻辑本身可靠——如果标题里混进了时间戳之类每次都不同的内容，查重会失效，幂等性也就名存实亡，所以风险应算中低，最好还是配合台账兜底。`append_log` 不幂等，每调用一次日志文件就真的多一行，恢复重跑会让日志出现重复记录，风险中等——不像发邮件那样是业务事故，但会污染日志、可能干扰下游按行数或内容做的逻辑。`set_config` 幂等，覆盖式写入，把同一个 key 设成同一个 value 无论调用几次终态都一样，风险低，可以放心重跑。`delete_file` 幂等，删一个已经不存在的文件和文件本来就不存在，最终状态相同，风险低；但要留意实现细节——如果 `delete_file` 在文件不存在时抛错并被上层当成执行失败，重跑就会被误判成一次新的失败，所以「文件未找到」应当被当作幂等意义上的成功来处理。

<!-- hint -->
先别管风险等级，把六个工具按「效果是覆盖式的」还是「效果是累加式的」分成两组——这条分界线在正文里讲过，分组做对了，幂等性判断基本就定了。

<!-- hint -->
风险等级不是照抄「幂等就低、不幂等就高」这么简单——想想 `append_log` 造成的后果和 `send_email` 造成的后果哪个更严重，再想想 `ensure_ticket` 的幂等性建立在什么前提上，前提站不住会怎样。

### Level 2：给一个没有台账的 runToolUses 补上效果台账

上周你的 harness 在处理一个「客户报障 → 建工单」的任务时，执行完 `create_ticket` 拿到了成功结果，可容器恰好在这时被重启杀掉，结果还没来得及写回 `tool_result`。进程恢复后，harness 从 `checkpoint.json` 里读到 `pendingToolUse` 就是这个 `create_ticket` 调用，按下面这版没有台账的 `runToolUses`，它只能选择重跑——于是同一个客户报障，系统里凭空多出了一张重复工单。

```javascript
// 事故现场：这版 runToolUses 没有效果台账
async function runToolUses(content, toolImpls) {
  const toolUseBlocks = content.filter((b) => b.type === "tool_use");
  const results = [];
  for (const block of toolUseBlocks) {
    const output = await toolImpls[block.name](block.input);
    results.push({ type: "tool_result", tool_use_id: block.id, content: output });
  }
  return results;
}
```

请你：(1) 写出 `effects.json` 的读写函数 `loadEffects`/`saveEffects`，要求原子写（先写 `.tmp` 再 `rename`）；(2) 改造 `runToolUses`，补上「执行前查台账 → 没命中才执行 → 执行成功立刻记台账」这套逻辑；(3) 写一段 Node 脚本验证：对同一个 `tool_use_id` 调用两次改造后的 `runToolUses`（模拟恢复重放），第二次不会让 `create_ticket` 的真实实现被再执行一遍。

<!-- rubric -->
- `loadEffects`/`saveEffects` 用了 `.tmp` + `rename` 的原子写，而不是直接覆盖目标文件；`loadEffects` 对文件不存在的情况有兜底（返回空对象），不会让恢复本身崩掉
- 改造后的 `runToolUses`：执行前用 `block.id` 查台账，命中就直接复用台账里的 `result`、不再调用 `toolImpls`；只有真正执行成功后才写台账，且写入的是这次调用的真实结果，不是占位值
- 验证脚本用一个会计数的假 `create_ticket` 实现，证明「同一个 tool_use_id 第二次调用不会让计数器增加」，也就是真的做到了「查了台账就不再执行」，而不只是「看起来没报错」

<!-- answer -->
```javascript
import { promises as fs } from "node:fs";

async function loadEffects(path) {
  try {
    return JSON.parse(await fs.readFile(path, "utf8"));
  } catch {
    return {};
  }
}

async function saveEffects(path, effects) {
  const tmp = `${path}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(effects, null, 2));
  await fs.rename(tmp, path);
}

async function runToolUses(content, toolImpls, opts) {
  const toolUseBlocks = content.filter((b) => b.type === "tool_use");
  const effects = await loadEffects(opts.effectsPath);
  const results = [];
  for (const block of toolUseBlocks) {
    const recorded = effects[block.id];
    if (recorded) {
      results.push({ type: "tool_result", tool_use_id: block.id, content: recorded.result });
      continue;
    }
    const output = await toolImpls[block.name](block.input);
    effects[block.id] = { name: block.name, result: output, at: new Date().toISOString() };
    await saveEffects(opts.effectsPath, effects);
    results.push({ type: "tool_result", tool_use_id: block.id, content: output });
  }
  return results;
}

// 验证：同一个 tool_use_id 恢复重放，第二次不再真的建单
let calls = 0;
async function createTicket(input) {
  calls += 1;
  return { id: "T-1", title: input.title };
}

const block = {
  type: "tool_use",
  id: "toolu_01abc",
  name: "create_ticket",
  input: { title: "客户报障" },
};
const effectsPath = "./effects.json";

await runToolUses([block], { create_ticket: createTicket }, { effectsPath });
console.assert(calls === 1, "第一次应该真的执行");

// 模拟恢复：同一个 tool_use_id 再次出现在 pendingToolUse 里
await runToolUses([block], { create_ticket: createTicket }, { effectsPath });
console.assert(calls === 1, "第二次命中台账，不应该再执行");

console.log("calls =", calls); // 输出 calls = 1，证明重放没有二次建单
```

这段代码已经用 Node 实际跑过验证：第一次调用 `runToolUses` 时台账是空的，`create_ticket` 真的执行了一次，`calls` 变成 1，同时台账文件里记下了这次调用的结果。第二次用同一个 `tool_use_id` 模拟恢复重放，`runToolUses` 在台账里查到了这个 id，直接把存好的 `result` 塞进 `tool_result` 返回，`toolImpls.create_ticket` 根本没被再调用一次，`calls` 仍然是 1。这正是效果台账要证明的事：恢复重放不会让一个已经发生过的副作用再发生一遍。

<!-- hint -->
台账要不要写，取决于「工具真的执行成功了没有」，不是「这次 for 循环走到这一步了没有」——`saveEffects` 得放在 `toolImpls[...]` 调用**之后**、拿到结果**之后**。

<!-- hint -->
验证的关键不是「第二次调用没报错」，而是「第二次调用没有让真实的 `create_ticket` 实现再跑一遍」——用一个会计数的假实现，比对两次调用前后计数器有没有变化，才是可信的证据。

<!-- /exercises -->

## 小结

- 恢复给你的是「至少一次」执行语义：进程可能在工具真的执行成功之后、结果还没落账之前崩掉，单看检查点分不清这次悬空调用「跑没跑过」——第 3 课把高影响工具的对账挂起来，根子就在这里。
- 幂等的定义：一个操作执行一次和执行多次，最终效果相同，就是幂等的。覆盖式写入（`set_config`、`write_file`）通常幂等，追加式写入（`append_log`、`send_email`）通常不幂等。
- 效果台账把「哪些副作用已经发生」单独落盘，以 `tool_use_id` 为键——这个 id 是模型点名工具时自带的唯一标识符[^S4]，同一次点名恢复重放时不会变，天然就是幂等键；写入要用 `.tmp` + `rename` 原子写，且要在工具执行成功后立刻落盘。
- 恢复对账升级为：`pendingToolUse.id` 在台账里命中，直接复用存好的结果，绝不重跑；没命中，安全执行。
- 审批阀管「该不该做」，效果台账管「做没做过」，两道闸互补，都卡在工具真正执行之前，幂等闸要排在审批阀前面。
- 治本优于治标：能把工具设计成天然幂等（「确保存在」优于「创建」、覆盖优于追加），就不必事事依赖台账兜底；可靠性来自模型的适应力配合确定性护栏[^S1]，但护栏本身也是复杂度，只在它确实改善结果时才该加[^S3]。

[>> 第 5 课：回退与分叉：检查点的第二重价值](./05-rewind-and-fork.md)
