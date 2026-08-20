# 第 4 讲：可检查的完成标准

> 本讲目标：
> - 把含糊需求改写为任务与可观察 outcome。
> - 区分 Agent 的 transcript 与环境最终状态。
> - 组合确定性 grader 与人工判断，而不是只看单一分数。
>
> 前置条件：能用持久工件描述当前任务状态 | 上一讲 [<< 03](./03-cross-session-continuity.md) | 下一讲 [05 >>](./05-minimal-harness-loop.md)

## 输出很完整，结果仍可能是错的

Agent 可以给出结构清楚的总结、列出改动文件、甚至声称测试通过，但真实环境可能没有生成目标文件、没有写入数据库或页面仍打不开。评价执行时，过程记录和最终结果必须分开。

Anthropic 将 evaluation 定义为给 AI 一个输入，再用 grading logic 衡量输出是否成功；对于 Agent，还必须考虑多轮工具调用和环境状态变化。[^S4]

## 解释

### 六个可复用部件

task 是给 Agent 的一个具体工作单元，包含输入、环境和成功条件。trial 是 Agent 对该 task 的一次独立尝试。grader 是评分逻辑，内部可含多个 assertion；同一 task 可以有多个 grader。[^S4]

transcript 是一次 trial 的完整过程记录，包括输出、工具调用和中间结果；它也常被叫做 trace 或 trajectory。outcome 是 trial 结束后环境中的最终状态。例如 Agent 说“已创建订单”属于 transcript，数据库里确实存在订单才是 outcome。[^S4]

eval suite 是围绕同一能力的一组 task，例如“公开课程边界”可以包含无账户路由、无托管推理、复制按钮存在、所有课程可静态构建等任务。evaluation harness 则是负责运行任务、记录过程、调用 grader 并汇总结果的基础设施。它与被测的 Agent harness 不是同一个东西。[^S4]

### 把一句需求改写成验收表

含糊需求“把课程站清理干净”无法直接评分。可以改写为：

| 部分 | 明确内容 |
|---|---|
| task | 从公开站移除账户、支付、Ask AI、Review 和播客逻辑 |
| trial | 在一个独立分支上完成一次改造 |
| assertion 1 | 路由树不含对应页面与 API |
| assertion 2 | 生产构建成功 |
| assertion 3 | 课程、词汇表、来源和复制按钮仍可访问 |
| outcome | 构建产物只暴露允许的公开页面 |

确定性 grader 适合检查文件、退出码、HTTP 状态和 DOM 元素。对“讲解是否清楚”这类主观质量，可以增加人工或模型评分，但必须给出标准并定期校准。Anthropic 建议组合代码 grader、模型 grader 与人工 grader，并阅读 transcript 检查评分是否公平。[^S4]

### 把失败变成 regression

regression 是已有能力在修改后退化。每次真实失败都可以变成一个小 task 和 assertion：先复现，再固定为检查。这样验证不再依赖某位开发者记得旧事故。OpenAI 的 harness 工程实践同样强调把反馈、结构测试和架构约束编码进仓库。[^S1]

```agentmentor-check
{
  "id": "agent-eval-transcript-outcome",
  "label": "区分过程与结果",
  "prompt": "Agent 的最后一条消息写着“已发送邮件”，日志也出现 send() 调用，但测试邮箱没有收到邮件。哪项是 outcome？",
  "whyHere": "这一步检查学习者是否用过程中的动作替代环境最终状态。",
  "copyPurpose": "让 Agent 检查我的验收标准是否只验证它说了什么或调用了什么。",
  "mode": "single",
  "choices": [
    {
      "id": "call",
      "text": "日志中的 send() 调用",
      "correct": false,
      "feedback": "调用属于 transcript 中的中间动作，不能证明外部系统接受并送达邮件。"
    },
    {
      "id": "mailbox",
      "text": "测试邮箱中是否出现目标邮件",
      "correct": true,
      "feedback": "邮箱状态是任务结束后环境中可检查的结果，因此属于 outcome。"
    }
  ]
}
```

本讲的术语检查点是：evaluation、task、trial、grader、assertion、transcript、trace、trajectory、outcome、eval suite、evaluation harness、regression。

## 完整示例

任务是“为课程正文增加选区复制给 Agent”。一个 trial 由 Agent 修改组件并运行站点。grader 组合三条 assertion：无选区时按钮隐藏；选中正文后按钮出现；剪贴板同时包含文本和当前公开 URL。浏览器操作 transcript 可以帮助定位失败，但 outcome 由 DOM 与剪贴板最终内容决定。

若第三条失败，就把这次失败保留为 regression task。下一次更换复制逻辑、浏览器 API 或框架版本时，都重跑同一任务。

## 轮到你

把“让 Agent 不要过度工程”改写为一项可检查任务。半成品如下：

```text
task：为已有按钮补一个禁用状态。
允许范围：现有按钮组件与对应测试。
assertion：________。
outcome：________。
```

参考答案：assertion 可以是“改动文件不超过允许范围，新增测试证明禁用时不触发回调”；outcome 可以是“测试通过，diff 中没有新增设计系统或无关依赖”。不要把“Agent 表示保持简洁”当成结果。

<!-- exercises -->
## 练习

### Level 1（热身）

选择一个真实 Agent 任务，写出 task、两个 assertion 和一个 outcome。
<!-- rubric -->
- task 指向一个具体环境。
- assertion 能由命令、文件或界面检查。
- outcome 描述任务结束后的状态，而不是 Agent 的话。
<!-- answer -->
若你无法写 outcome，需求仍停在活动层，例如“优化”“处理”“研究”。先问完成后世界中什么会不同。
<!-- hint -->
把句子改写为“运行什么，会看到什么”。

### Level 2（进阶）

为同一 task 设计一个确定性 grader 和一个需要人工判断的 grader，并说明二者如何互补。
<!-- rubric -->
- 确定性 grader 至少有两个 assertion。
- 人工 grader 有 3–5 条明确标准。
- 说明何时阅读 transcript 复核误判。
<!-- answer -->
例如课程任务用脚本检查结构、链接和构建，用人工标准判断解释是否具体、练习是否可执行、边界是否诚实。两者分数冲突时阅读 transcript 与产物：脚本可能漏掉语义问题，人工也可能被流畅总结影响。
<!-- hint -->
先把“机器肯定能判断的”与“需要上下文判断的”分成两列。
<!-- /exercises -->

## 总结与下一步

Agent eval 把完成拆成 task、trial、grader、transcript 和 outcome。下一讲把前四讲的入口、状态、范围和验证组装成一个能在真实仓库运行的最小 harness。
