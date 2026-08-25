# 第 4 课：状态管理和上下文传递

> 学习目标：
> - 区分工作流状态和 Agent 上下文
> - 掌握三种状态管理模式
> - 理解检查点和恢复机制
>
> 前置要求：[第 3 课：如何拆解复杂任务](./03-task-decomposition.md) | 下一课 [第 5 课 >>](./05-error-handling-retry.md)

## 为什么状态管理是工作流的核心

你设计了一个完美的工作流，10 个步骤，清晰的依赖关系。第 8 步时，服务器重启了。工作流崩溃。

重新运行？那前 7 步的工作(可能花了 30 分钟)全部白费。

**这就是没有状态管理的代价。**

状态管理解决三个问题:[^S12]

1. **步骤间数据传递**: 步骤 3 如何拿到步骤 1 和 2 的结果？
2. **进度追踪**: 工作流做到哪一步了？还剩多少？
3. **故障恢复**: 崩溃后能从中断点继续，而不是从头开始

没有状态管理，Agent 只能通过对话历史传递信息。对话历史会溢出，会丢失，会被 Agent 遗忘。

有了状态管理，工作流有一个明确的"内存"，持久化、可查询、可恢复。[^S11]

## 状态 vs 上下文 vs 内存

这三个词容易混淆，先厘清概念:[^S12]

**状态(State)**
- 当前任务的所有信息：做到哪一步、每步的结果、接下来做什么
- 是快照：此时此刻工作流知道的一切
- 存储：脚本变量、数据库、文件

**上下文(Context)**
- 传递给单个 Agent 调用的信息
- 是输入：这个 Agent 需要知道什么才能完成任务
- 从状态中选择性提取：不是所有状态都给 Agent，只给相关的部分

**内存(Memory)**
- 从过去学到的经验：之前做过什么、遇到过什么问题、解决方案是什么
- 是历史：跨任务、跨会话的长期知识
- 本课不涉及(长期内存是另一个复杂话题)

**举个例子:**

```javascript
// 状态：工作流知道的所有信息
const workflowState = {
  phase: 'testing',
  filesProcessed: 47,
  totalFiles: 100,
  issues: [/* 前面步骤发现的所有问题 */],
  currentBatch: [/* 当前正在处理的文件 */]
};

// 上下文：给这个 Agent 的信息(从状态中提取)
const agentContext = {
  file: workflowState.currentBatch[0],
  previousIssues: workflowState.issues.filter(i => i.severity === 'high')
};

// Agent 调用
const result = await agent({
  task: '测试文件',
  context: agentContext  // 只给相关信息，不是全部状态
});

// 更新状态
workflowState.filesProcessed++;
workflowState.issues.push(...result.newIssues);
```

**关键原则: 状态是全局的，上下文是局部的。**[^S15]

## 状态管理模式 1：脚本变量(内存状态)

**适用场景:** 短工作流(< 10 分钟)，不需要跨进程或跨机器。

**优点:** 简单、快速、无需外部依赖。

**缺点:** 进程崩溃后状态丢失，无法恢复。

### 基本模式

```javascript
async function simpleWorkflow(files) {
  // 状态就是普通的 JavaScript 变量
  let processed = 0;
  let results = [];
  let errors = [];
  
  for (const file of files) {
    try {
      const result = await processFile(file);
      results.push(result);
      processed++;
      console.log(`进度: ${processed}/${files.length}`);
    } catch (error) {
      errors.push({ file, error });
    }
  }
  
  return { results, errors, total: files.length };
}
```

**状态存在哪里？** 在函数的局部变量里(`processed`、`results`、`errors`)。

**如果进程崩溃？** 状态全部丢失，必须从头开始。

### 改进：结构化状态对象

```javascript
async function betterWorkflow(files) {
  // 用对象组织状态，更清晰
  const state = {
    input: { files, total: files.length },
    progress: { current: 0, phase: 'processing' },
    output: { results: [], errors: [] },
    metadata: { startTime: Date.now() }
  };
  
  for (const file of state.input.files) {
    try {
      const result = await processFile(file);
      state.output.results.push(result);
      state.progress.current++;
    } catch (error) {
      state.output.errors.push({ file, error });
    }
  }
  
  state.progress.phase = 'completed';
  state.metadata.endTime = Date.now();
  state.metadata.duration = state.metadata.endTime - state.metadata.startTime;
  
  return state;
}
```

**好处:** 状态结构清晰，容易传递给其他函数，容易序列化(如果需要持久化)。

## 状态管理模式 2：检查点(Checkpointing)

**适用场景:** 中等时长工作流(10-60 分钟)，耗时操作后需要保存进度。

**优点:** 崩溃后可以从最近的检查点恢复，避免重复工作。

**缺点:** 需要设计检查点位置和恢复逻辑。[^S12]

### 检查点位置选择

```javascript
async function workflowWithCheckpoints(tasks) {
  const checkpointFile = '.workflow-state.json';
  
  // 尝试恢复之前的状态
  let state = await loadCheckpoint(checkpointFile) || {
    completed: [],
    pending: tasks,
    phase: 'processing'
  };
  
  console.log(`恢复: 已完成 ${state.completed.length}/${tasks.length}`);
  
  while (state.pending.length > 0) {
    const task = state.pending.shift();
    
    // 执行任务
    const result = await executeTask(task);
    state.completed.push({ task, result });
    
    // 检查点：每 10 个任务后保存
    if (state.completed.length % 10 === 0) {
      await saveCheckpoint(checkpointFile, state);
      console.log(`检查点: ${state.completed.length} 个任务已完成`);
    }
  }
  
  state.phase = 'completed';
  await saveCheckpoint(checkpointFile, state);
  
  return state;
}

async function saveCheckpoint(file, state) {
  await fs.writeFile(file, JSON.stringify(state, null, 2));
}

async function loadCheckpoint(file) {
  try {
    const data = await fs.readFile(file, 'utf-8');
    return JSON.parse(data);
  } catch {
    return null;  // 文件不存在，从头开始
  }
}
```

**检查点策略:**

- **定期检查点**: 每 N 个任务或每 M 分钟保存一次
- **阶段检查点**: 每个大阶段完成后保存(如"分析阶段完成")
- **关键操作前**: 不可逆操作(如部署、删除)之前保存

```agentmentor-check
{
  "id": "workflows-zh-04-checkpoint-placement",
  "label": "判断检查点位置的合理性",
  "prompt": "一个数据迁移工作流有 4 个阶段: (1) 从源数据库读取 1000 条记录(5 分钟) (2) 转换数据格式(10 分钟) (3) 写入目标数据库(20 分钟) (4) 验证数据一致性(5 分钟)。如果只能设置 1 个检查点，应该设在哪个阶段之后?",
  "whyHere": "刚学完检查点的概念和策略(定期、阶段、关键操作前)，需要检查学习者能否根据任务特征(耗时、可逆性)选择最优检查点位置",
  "mode": "single",
  "choices": [
    {
      "id": "a",
      "text": "阶段 1 之后，因为它是第一个阶段",
      "correct": false,
      "feedback": "阶段 1 只需要 5 分钟，崩溃后重跑成本很低。检查点应该设在耗时长或不可逆的操作之后，而不是简单地按顺序设置。"
    },
    {
      "id": "b",
      "text": "阶段 2 之后，因为它最耗时且在写操作之前",
      "correct": true,
      "feedback": "正确。阶段 2 是耗时最长的纯计算阶段(10 分钟),且阶段 3 是写操作(不可逆)。在阶段 2 之后设置检查点，既避免了重跑耗时的转换操作，又在即将进行不可逆写操作前保存了状态。如果阶段 3 失败，可以从检查点恢复，修复问题后重新写入，而不需要重新读取和转换数据。"
    },
    {
      "id": "c",
      "text": "阶段 3 之后，因为写入操作完成了",
      "correct": false,
      "feedback": "阶段 3 之后检查点能保护写入的结果，但如果阶段 3 本身失败(写了一半崩溃)，检查点没有机会保存。更好的策略是在阶段 3 之前保存，这样失败时可以修复问题后重新写入。"
    }
  ]
}
```

## 状态管理模式 3：外部存储(持久化状态)

**适用场景:** 长时间运行的工作流(> 1 小时)、需要跨机器协调、需要人工审批。

**优点:** 状态持久化，进程崩溃、机器重启都不影响，支持暂停/恢复。

**缺点:** 需要外部依赖(数据库、Redis)、增加复杂度。[^S13]

### 基本实现

```javascript
// 状态存储接口
class WorkflowStateStore {
  constructor(db) {
    this.db = db;
  }
  
  async save(workflowId, state) {
    await this.db.set(`workflow:${workflowId}`, JSON.stringify(state));
  }
  
  async load(workflowId) {
    const data = await this.db.get(`workflow:${workflowId}`);
    return data ? JSON.parse(data) : null;
  }
  
  async delete(workflowId) {
    await this.db.del(`workflow:${workflowId}`);
  }
}

// 使用外部存储的工作流
async function persistentWorkflow(workflowId, tasks) {
  const store = new WorkflowStateStore(redis);
  
  // 加载状态(如果存在)
  let state = await store.load(workflowId) || {
    id: workflowId,
    phase: 'init',
    completed: [],
    pending: tasks,
    createdAt: Date.now(),
    updatedAt: Date.now()
  };
  
  console.log(`工作流 ${workflowId}: 阶段 ${state.phase}, 
               进度 ${state.completed.length}/${tasks.length}`);
  
  // 阶段 1: 处理任务
  if (state.phase === 'init' || state.phase === 'processing') {
    state.phase = 'processing';
    
    while (state.pending.length > 0) {
      const task = state.pending.shift();
      const result = await executeTask(task);
      state.completed.push({ task, result });
      state.updatedAt = Date.now();
      
      // 每个任务后保存状态
      await store.save(workflowId, state);
    }
    
    state.phase = 'awaiting_approval';
    await store.save(workflowId, state);
  }
  
  // 阶段 2: 等待人工审批(可能在另一个进程/机器上恢复)
  if (state.phase === 'awaiting_approval') {
    console.log('等待审批...');
    // 这里可以返回，让另一个进程(或几小时后)继续
    return { workflowId, status: 'awaiting_approval' };
  }
  
  // 阶段 3: 执行最终操作(审批通过后)
  if (state.phase === 'approved') {
    state.phase = 'finalizing';
    await store.save(workflowId, state);
    
    await executeFinalAction(state.completed);
    
    state.phase = 'completed';
    state.completedAt = Date.now();
    await store.save(workflowId, state);
  }
  
  return state;
}

// 审批工作流
async function approveWorkflow(workflowId) {
  const store = new WorkflowStateStore(redis);
  const state = await store.load(workflowId);
  
  if (!state) throw new Error('工作流不存在');
  if (state.phase !== 'awaiting_approval') {
    throw new Error(`无法审批: 当前阶段是 ${state.phase}`);
  }
  
  state.phase = 'approved';
  state.approvedAt = Date.now();
  await store.save(workflowId, state);
  
  // 继续执行工作流
  return await persistentWorkflow(workflowId, []);
}
```

**关键模式: 状态机(State Machine)**[^S11]

工作流的阶段就是状态机的状态:

```
init → processing → awaiting_approval → approved → finalizing → completed
                         ↓
                     rejected → cancelled
```

每个阶段转换都保存到外部存储，确保工作流可以从任何阶段恢复。

## 上下文传递的最佳实践

### 原则 1: 只传递必要的信息

```javascript
// ❌ 不好: 把所有状态都给 Agent
const result = await agent({
  task: '分析这个文件',
  context: workflowState  // 包含 100 个文件的分析结果、配置、日志...
});

// ✓ 好: 只给相关信息
const result = await agent({
  task: '分析这个文件',
  context: {
    file: currentFile,
    guidelines: workflowState.config.analysisGuidelines,
    similarIssues: workflowState.results
      .filter(r => r.file.type === currentFile.type)
      .slice(0, 3)  // 最多 3 个相似案例
  }
});
```

**为什么？** 上下文越大，Agent 越容易分心，推理质量下降，成本上升。[^S15]

### 原则 2: 结构化上下文

```javascript
// ❌ 不好: 非结构化的文本
const context = `
之前分析了 47 个文件,发现了 23 个问题。
当前文件是 src/utils.js,大小 350 行。
配置要求检查 SQL 注入和 XSS。
`;

// ✓ 好: 结构化对象
const context = {
  progress: { filesAnalyzed: 47, issuesFound: 23 },
  currentFile: { path: 'src/utils.js', lines: 350 },
  checkTypes: ['sql_injection', 'xss']
};
```

**为什么？** 结构化上下文更容易被 Agent 理解，也更容易被你调试。

### 原则 3: 累积式上下文 vs 重置式上下文

**累积式上下文:** 每步的结果加到上下文中，越来越大。

```javascript
let context = { task: 'refactor codebase' };

for (const file of files) {
  const result = await agent({ task: 'analyze', context });
  context.results = context.results || [];
  context.results.push(result);  // 累积
}

// 最后 context 包含所有文件的结果,可能非常大
```

**重置式上下文:** 每步清空上下文，只保留必要信息。

```javascript
const allResults = [];

for (const file of files) {
  const context = {
    file,
    guidelines: config.guidelines,
    exampleIssues: allResults.slice(-3)  // 只看最近 3 个
  };
  
  const result = await agent({ task: 'analyze', context });
  allResults.push(result);  // 存在工作流状态里,不在上下文里
}
```

**选择:** 大部分情况用重置式，避免上下文爆炸。累积式只在后续步骤真的需要前面所有结果时使用(如最后的汇总步骤)。[^S14]

## 状态的可观察性

**好的工作流应该能回答这些问题:**

- 当前在哪个阶段？
- 完成了多少？还剩多少？
- 遇到了多少错误？
- 预计什么时候完成？

### 实现进度追踪

```javascript
class ObservableWorkflow {
  constructor(name, totalSteps) {
    this.state = {
      name,
      totalSteps,
      currentStep: 0,
      phase: 'init',
      startTime: Date.now(),
      errors: [],
      results: []
    };
  }
  
  async executeStep(stepName, fn) {
    this.state.currentStep++;
    this.state.phase = stepName;
    
    console.log(`[${this.state.name}] 
                 步骤 ${this.state.currentStep}/${this.state.totalSteps}: 
                 ${stepName}`);
    
    const stepStart = Date.now();
    
    try {
      const result = await fn();
      this.state.results.push({ stepName, result, duration: Date.now() - stepStart });
      return result;
    } catch (error) {
      this.state.errors.push({ stepName, error: error.message });
      throw error;
    }
  }
  
  getStatus() {
    const progress = (this.state.currentStep / this.state.totalSteps) * 100;
    const elapsed = Date.now() - this.state.startTime;
    const avgStepTime = elapsed / this.state.currentStep;
    const remainingSteps = this.state.totalSteps - this.state.currentStep;
    const estimatedRemaining = avgStepTime * remainingSteps;
    
    return {
      progress: `${progress.toFixed(1)}%`,
      currentPhase: this.state.phase,
      elapsed: `${(elapsed / 1000).toFixed(1)}s`,
      estimatedRemaining: `${(estimatedRemaining / 1000).toFixed(1)}s`,
      errors: this.state.errors.length
    };
  }
}

// 使用
async function myWorkflow() {
  const wf = new ObservableWorkflow('数据迁移', 4);
  
  const data = await wf.executeStep('读取源数据', async () => {
    return await readSourceData();
  });
  
  const transformed = await wf.executeStep('转换格式', async () => {
    return await transformData(data);
  });
  
  await wf.executeStep('写入目标数据库', async () => {
    return await writeToTarget(transformed);
  });
  
  await wf.executeStep('验证', async () => {
    return await validateMigration();
  });
  
  console.log('最终状态:', wf.getStatus());
}
```

<!-- exercises -->


## 练习

### Level 1: 选择状态管理模式

为下面三个工作流选择合适的状态管理模式(脚本变量、检查点、外部存储)并说明理由:

**工作流 A:** 批量压缩 20 张图片，每张耗时 5 秒，总共 100 秒

**工作流 B:** 训练一个机器学习模型，需要 50 个 epoch,每个 epoch 10 分钟，总共 500 分钟(8 小时)

**工作流 C:** 审查 100 个 PR,每个 PR 需要人工批准后才能合并，整个流程可能持续几天

<!-- rubric -->
正确选择模式(A: 脚本变量，B: 检查点，C: 外部存储)；理由合理(考虑时长、可恢复性、是否需要人工介入)

<!-- answer -->
工作流 A: 脚本变量。总时长只有 100 秒，很短，即使崩溃重跑成本也很低，不需要复杂的状态管理。工作流 B: 检查点。8 小时很长，崩溃后从头开始代价太大，应该每隔几个 epoch 设置检查点。但训练过程是连续的，不需要跨进程或等待人工，检查点足够。工作流 C: 外部存储。流程持续几天，涉及人工审批，工作流会暂停并在另一个时间/进程恢复，必须用外部存储(如数据库)持久化状态，支持随时查询进度、恢复执行。

<!-- hint -->
考虑三个问题: (1) 总时长是分钟级、小时级还是天级？ (2) 崩溃后重跑的成本有多高？ (3) 是否需要暂停并在稍后恢复？

<!-- hint -->
脚本变量适合快速任务(< 10 分钟)。检查点适合耗时任务(10 分钟到几小时)。外部存储适合长期任务(> 几小时)或需要人工介入的任务。

### Level 2: 设计状态结构

为"多服务部署"工作流设计状态对象。工作流需要: (1) 构建 5 个服务的 Docker 镜像 (2) 推送到镜像仓库 (3) 依次部署到测试环境 (4) 运行集成测试 (5) 如果测试通过，部署到生产环境。

**要求:**
- 设计一个 JSON 对象表示工作流状态
- 包含: 当前阶段、每个服务的状态、错误信息、时间戳
- 说明在哪些点应该保存检查点

<!-- rubric -->
状态结构合理(包含阶段标识、服务列表及其状态、错误数组、时间信息)；每个服务的状态包含足够信息(如构建状态、镜像 ID、部署状态)；正确识别检查点位置(至少在阶段 2 和 4 之后，生产部署前)

<!-- answer --> 
```json
{
  "workflowId": "deploy-2026-08-25-001",
  "phase": "production_deployment",
  "phases": ["build", "push", "test_deploy", "integration_test", "prod_deploy"],
  "services": [
    {
      "name": "api-gateway",
      "buildStatus": "completed",
      "imageId": "sha256:abc123...",
      "testDeployStatus": "completed",
      "prodDeployStatus": "in_progress"
    },
    // ... 其他 4 个服务
  ],
  "integrationTestResult": { "passed": true, "duration": 120 },
  "errors": [],
  "timestamps": {
    "started": 1724572800000,
    "buildCompleted": 1724573100000,
    "pushCompleted": 1724573200000,
    "testDeployCompleted": 1724573500000,
    "integrationTestCompleted": 1724573620000
  }
}
```
检查点位置: (1) 阶段 2(push)完成后 — 构建和推送耗时，避免重跑 (2) 阶段 4(integration_test)完成后 — 测试通过是生产部署的前置条件，且测试本身可能失败需要修复后重跑 (3) 每个服务部署到生产前 — 支持部分失败后的恢复。

<!-- hint -->
状态应该能回答: 工作流在哪个阶段？每个服务分别处于什么状态(构建中/已构建/已部署/失败)？如果崩溃，从哪里恢复？

<!-- hint -->
服务的状态是独立的(一个服务构建失败不影响其他服务的状态),所以每个服务应该有自己的状态字段。检查点应该在耗时操作后、不可逆操作(生产部署)前。

<!-- /exercises -->

---

**下一课:** [第 5 课:错误处理和重试策略](./05-error-handling-retry.md) — 学习如何让工作流在失败时优雅恢复，而不是直接崩溃
