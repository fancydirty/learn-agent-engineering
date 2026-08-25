# 第 5 课：错误处理和重试策略

> 学习目标：
> - 区分瞬态错误和永久错误
> - 掌握重试策略和退避算法
> - 学会设计补偿操作和回滚机制
>
> 前置要求：[第 4 课：状态管理和上下文传递](./04-state-and-context.md) | 下一课 [第 6 课 >>](./06-real-world-workflows.md)

## 错误是工作流的常态

你的工作流完美运行了 10 次。第 11 次，在第 8 步，API 返回了 503 错误。工作流崩溃。

你加了 `try-catch`，捕获错误，打印日志，继续执行。第 12 次，数据库连接超时。工作流继续执行，但写入失败，数据不一致。

**错误处理不是"加个 try-catch"那么简单。**

在工作流中，错误处理需要回答三个问题:[^S7]

1. **这个错误是暂时的还是永久的？** (网络抖动 vs 权限不足)
2. **应该重试、跳过还是中止？** (重试可能解决 vs 重试会加剧问题)
3. **如果中止，如何清理已完成的步骤？** (回滚数据库 vs 发送取消通知)

如果失败的是可选步骤(比如发通知)，跳过它继续往下走，这种"非关键的地方失败了不耽误整体"的处理方式就叫优雅降级；但如果失败的是关键步骤，跳过反而会留下不一致状态，应该直接中止。

没有答案，你的工作流要么太脆弱(一个小错误就崩溃)，要么太危险(忽略错误继续执行，留下不一致状态)。[^S9]

## 错误分类：瞬态 vs 永久

**瞬态错误(Transient Errors):** 暂时性的，重试后可能成功。[^S8]

**常见瞬态错误:**
- 网络超时
- 服务暂时不可用(503 Service Unavailable)
- 速率限制(429 Too Many Requests)
- 数据库连接池已满
- 临时锁冲突

**特征:** 通常由资源竞争、网络波动、临时过载引起，等一会儿重试通常能成功。

**永久错误(Permanent Errors):** 重试也不会成功，需要修复代码或配置。[^S9]

**常见永久错误:**
- 权限不足(401 Unauthorized, 403 Forbidden)
- 资源不存在(404 Not Found)
- 输入格式错误(400 Bad Request)
- 业务逻辑错误(余额不足、库存为 0)
- 代码 bug(空指针、除零)

**特征:** 由配置错误、代码 bug、业务规则违反引起，重试只会浪费资源。

**判断方法:**

```javascript
function classifyError(error) {
  // HTTP 状态码判断
  if (error.status === 429) return 'transient';  // 速率限制
  if (error.status >= 500) return 'transient';   // 服务端错误
  if (error.status === 404) return 'permanent';  // 资源不存在
  if (error.status === 401) return 'permanent';  // 权限问题
  
  // 错误类型判断
  if (error.code === 'ETIMEDOUT') return 'transient';    // 超时
  if (error.code === 'ECONNREFUSED') return 'transient'; // 连接拒绝
  if (error.code === 'ENOTFOUND') return 'permanent';    // DNS 失败
  
  // 错误消息判断
  if (error.message.includes('rate limit')) return 'transient';
  if (error.message.includes('permission denied')) return 'permanent';
  
  // 默认为永久(保守策略)
  return 'permanent';
}
```

## 重试策略

**对于瞬态错误，重试是第一选择。但重试本身也有学问。**[^S8]

### 策略 1: 固定延迟重试

```javascript
async function retryWithFixedDelay(fn, maxAttempts = 3, delay = 1000) {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      if (attempt === maxAttempts) throw error;
      
      console.log(`尝试 ${attempt} 失败，${delay}ms 后重试...`);
      await sleep(delay);
    }
  }
}

// 使用
const data = await retryWithFixedDelay(
  () => fetchAPI('/users'),
  3,
  1000
);
```

**问题:** 如果服务过载导致错误，所有客户端同时重试会加剧过载(惊群效应)。

### 策略 2: 指数退避(Exponential Backoff)

```javascript
async function retryWithExponentialBackoff(fn, maxAttempts = 3, baseDelay = 1000) {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      if (attempt === maxAttempts) throw error;
      
      const delay = baseDelay * Math.pow(2, attempt - 1);
      console.log(`尝试 ${attempt} 失败，${delay}ms 后重试...`);
      await sleep(delay);
    }
  }
}

// 延迟序列: 1s, 2s, 4s, 8s, ...
```

**好处:** 每次重试间隔加倍，给服务更多恢复时间，避免持续施压。[^S8]

### 策略 3: 指数退避 + 抖动(Jitter)

```javascript
async function retryWithBackoffAndJitter(fn, maxAttempts = 3, baseDelay = 1000) {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      if (attempt === maxAttempts) throw error;
      
      const exponentialDelay = baseDelay * Math.pow(2, attempt - 1);
      const jitter = Math.random() * exponentialDelay;
      const delay = exponentialDelay + jitter;
      
      console.log(`尝试 ${attempt} 失败，${delay.toFixed(0)}ms 后重试...`);
      await sleep(delay);
    }
  }
}

// 延迟序列(带随机性): 1.2s, 3.7s, 6.1s, ...
```

**好处:** 抖动避免多个客户端在完全相同的时间重试，分散负载。[^S8]

**这是生产环境的推荐策略。**[^S6]

### 策略 4: 选择性重试

```javascript
async function retrySelective(fn, maxAttempts = 3) {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      const errorType = classifyError(error);
      
      if (errorType === 'permanent') {
        console.log('永久错误，不重试');
        throw error;
      }
      
      if (attempt === maxAttempts) {
        console.log(`${maxAttempts} 次重试均失败`);
        throw error;
      }
      
      const delay = 1000 * Math.pow(2, attempt - 1) * (1 + Math.random());
      console.log(`瞬态错误，${delay.toFixed(0)}ms 后重试...`);
      await sleep(delay);
    }
  }
}
```

**关键:** 只重试瞬态错误，永久错误立即抛出，避免无意义的重试。[^S10]

```agentmentor-check
{
  "id": "workflows-zh-05-retry-strategy",
  "label": "选择合适的重试策略",
  "prompt": "一个工作流需要调用外部 API 获取数据。API 每分钟限制 60 次请求,超过后返回 429 错误,需要等 60 秒才能继续。工作流需要在 1 分钟内调用 100 次 API。应该如何处理 429 错误?",
  "whyHere": "刚学完错误分类(瞬态 vs 永久)和重试策略(固定、指数退避、选择性)，需要检查学习者能否根据具体错误类型(速率限制)选择合理的处理方式",
  "mode": "single",
  "choices": [
    {
      "id": "a",
      "text": "使用指数退避重试，延迟会越来越长，最终能成功",
      "correct": false,
      "feedback": "指数退避适合临时过载，但速率限制有明确的恢复时间(60 秒)。指数退避可能在几秒内就放弃重试，或者延迟不够长(如 1s, 2s, 4s)无法等到限制解除。更糟的是,工作流需要 100 次调用但限制是 60 次/分钟,即使重试也不可能在 1 分钟内完成。"
    },
    {
      "id": "b",
      "text": "将任务拆分成批次，每批 60 个请求，批次间等待 60 秒",
      "correct": true,
      "feedback": "正确。速率限制(429)是可预测的瞬态错误，但有明确的恢复时间。最优策略是主动遵守限制:第一批发送 60 个请求，等待 60 秒后发送剩余 40 个。如果仍然遇到 429，说明前一批还没完全重置，可以等待 API 响应头中的 Retry-After 时间后重试。这比盲目重试更高效。"
    },
    {
      "id": "c",
      "text": "429 是永久错误(配额不足)，应该立即失败并通知管理员",
      "correct": false,
      "feedback": "429 是瞬态错误，不是永久错误。它表示当前速率超限，但等待后可以继续。永久错误是指配置错误或权限不足(如 401、403)，重试也不会成功。速率限制是暂时的，解决方式是降低请求速率或等待限制窗口重置。"
    }
  ]
}
```

## 断路器模式(Circuit Breaker)

**问题:** 如果一个服务持续失败(如数据库崩溃)，每个请求都重试 3 次，会白白消耗资源并拖慢整个工作流。如果这个服务还是别的服务的依赖，失败会一路传导下去，变成级联故障。

**断路器:** 当错误率超过阈值时，暂时停止调用失败的服务，直接快速失败，避免资源浪费。[^S7]

### 三种状态

```
关闭(Closed) ──错误率 > 阈值──→ 打开(Open)
     ↑                              ↓
     └──测试成功──← 半开(Half-Open) ←─超时后
```

**关闭状态:** 正常工作，请求正常通过，统计错误率。

**打开状态:** 服务被认为不可用，请求直接快速失败，不调用服务。

**半开状态:** 超时后尝试少量请求，如果成功则恢复关闭状态，否则继续打开。

### 实现

```javascript
class CircuitBreaker {
  constructor(options = {}) {
    this.failureThreshold = options.failureThreshold || 5;  // 失败多少次打开
    this.resetTimeout = options.resetTimeout || 60000;      // 60 秒后尝试恢复
    
    this.state = 'closed';
    this.failureCount = 0;
    this.nextAttempt = null;
  }
  
  async execute(fn) {
    // 打开状态：直接快速失败
    if (this.state === 'open') {
      if (Date.now() < this.nextAttempt) {
        throw new Error('断路器打开，服务暂时不可用');
      }
      // 超时后进入半开状态
      this.state = 'half-open';
    }
    
    try {
      const result = await fn();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure();
      throw error;
    }
  }
  
  onSuccess() {
    this.failureCount = 0;
    if (this.state === 'half-open') {
      this.state = 'closed';
      console.log('断路器恢复关闭状态');
    }
  }
  
  onFailure() {
    this.failureCount++;
    
    if (this.failureCount >= this.failureThreshold) {
      this.state = 'open';
      this.nextAttempt = Date.now() + this.resetTimeout;
      console.log(`断路器打开，${this.resetTimeout}ms 后尝试恢复`);
    }
  }
}

// 使用
const breaker = new CircuitBreaker({ failureThreshold: 3, resetTimeout: 30000 });

async function callAPI() {
  return await breaker.execute(async () => {
    return await fetch('/api/data');
  });
}
```

**使用场景:** 调用外部服务、数据库、文件系统等可能批量失败的依赖。[^S7]

## 补偿操作和回滚

**问题:** 工作流执行了 3 个写操作(写数据库、发邮件、更新缓存)，第 4 步失败了。如何撤销前 3 步？[^S9]

### 模式 1: 事务性操作

```javascript
async function transactionalWorkflow() {
  const tx = await db.beginTransaction();
  
  try {
    await tx.insert('users', userData);
    await tx.update('accounts', accountData);
    await tx.insert('logs', logData);
    
    await tx.commit();
    console.log('事务提交成功');
  } catch (error) {
    await tx.rollback();
    console.log('事务回滚');
    throw error;
  }
}
```

**适用场景:** 所有操作都在同一个支持事务的数据库中。

**局限:** 无法跨系统(如数据库 + 文件系统 + API 调用)。

### 模式 2: 补偿操作(Saga Pattern)

**思路:** 为每个操作定义一个补偿操作，失败时执行补偿操作撤销已完成的步骤。[^S6]

```javascript
async function sagaWorkflow() {
  const completed = [];
  
  const steps = [
    {
      name: '创建订单',
      forward: async () => {
        const order = await createOrder(orderData);
        return { orderId: order.id };
      },
      compensate: async (context) => {
        await deleteOrder(context.orderId);
        console.log(`补偿: 删除订单 ${context.orderId}`);
      }
    },
    {
      name: '扣减库存',
      forward: async (context) => {
        await decrementInventory(orderData.items);
        return context;
      },
      compensate: async (context) => {
        await incrementInventory(orderData.items);
        console.log('补偿: 恢复库存');
      }
    },
    {
      name: '扣款',
      forward: async (context) => {
        await chargePayment(context.orderId, orderData.amount);
        return context;
      },
      compensate: async (context) => {
        await refundPayment(context.orderId);
        console.log(`补偿: 退款订单 ${context.orderId}`);
      }
    },
    {
      name: '发送确认邮件',
      forward: async (context) => {
        await sendEmail(orderData.email, context.orderId);
        return context;
      },
      compensate: async (context) => {
        await sendEmail(orderData.email, '订单已取消');
        console.log('补偿: 发送取消邮件');
      }
    }
  ];
  
  let context = {};
  
  try {
    // 正向执行所有步骤
    for (const step of steps) {
      console.log(`执行: ${step.name}`);
      context = await step.forward(context);
      completed.push(step);
    }
    
    console.log('工作流成功完成');
    return context;
    
  } catch (error) {
    console.log(`失败于: ${completed.length + 1}/${steps.length} 步`);
    
    // 反向执行补偿操作
    for (let i = completed.length - 1; i >= 0; i--) {
      const step = completed[i];
      try {
        await step.compensate(context);
      } catch (compensateError) {
        console.error(`补偿失败: ${step.name}`, compensateError);
        // 补偿失败需要人工介入
      }
    }
    
    throw error;
  }
}
```

**关键点:**

1. 每个步骤都有 `forward`(正向操作)和 `compensate`(补偿操作)
2. 失败时，反向执行已完成步骤的补偿操作
3. 补偿操作本身也可能失败，需要记录并通知人工介入[^S6]

### 模式 3: 幂等性设计

**幂等:** 执行 N 次和执行 1 次效果相同。[^S9]

```javascript
// ❌ 非幂等: 重复执行会累加
async function incrementCounter(userId) {
  const current = await getCounter(userId);
  await setCounter(userId, current + 1);
}

// ✓ 幂等: 重复执行结果相同
async function setCounter(userId, value) {
  await db.update('counters', { userId }, { value });
}

// ✓ 幂等: 用唯一 ID 去重
async function processOrder(orderId, orderData) {
  // 检查是否已处理
  const existing = await db.get('orders', orderId);
  if (existing) {
    console.log(`订单 ${orderId} 已处理，跳过`);
    return existing;
  }
  
  // 首次处理
  const result = await createOrder(orderData);
  await db.insert('orders', { id: orderId, ...result });
  return result;
}
```

**好处:** 如果步骤因为网络问题执行了两次(第一次超时但实际成功了)，幂等性确保不会产生副作用。[^S9]

## 错误处理的层次

**好的工作流在三个层次处理错误:**

### 层次 1: 单个操作

```javascript
async function callAPIWithRetry(endpoint) {
  return await retryWithBackoffAndJitter(
    async () => {
      const response = await fetch(endpoint);
      if (!response.ok) {
        const error = new Error(`HTTP ${response.status}`);
        error.status = response.status;
        throw error;
      }
      return response.json();
    },
    3,
    1000
  );
}
```

### 层次 2: 工作流步骤

```javascript
async function workflowStep(stepName, fn) {
  try {
    console.log(`开始: ${stepName}`);
    const result = await fn();
    console.log(`完成: ${stepName}`);
    return result;
  } catch (error) {
    console.error(`失败: ${stepName}`, error.message);
    
    // 记录到状态
    workflowState.errors.push({
      step: stepName,
      error: error.message,
      timestamp: Date.now()
    });
    
    throw error;
  }
}
```

这一步把每次失败都写进 `workflowState.errors`，步骤名、错误信息、发生时间都留了下来——这就是错误日志，排查问题时靠的就是这份记录而不是记忆。

### 层次 3: 整个工作流

```javascript
async function robustWorkflow() {
  const checkpointFile = '.workflow-checkpoint.json';
  
  try {
    // 加载检查点
    let state = await loadCheckpoint(checkpointFile) || { phase: 'init' };
    
    // 执行各阶段(带跳过逻辑)
    if (state.phase === 'init') {
      state.data = await workflowStep('收集数据', collectData);
      state.phase = 'collected';
      await saveCheckpoint(checkpointFile, state);
    }
    
    if (state.phase === 'collected') {
      state.processed = await workflowStep('处理数据', () => processData(state.data));
      state.phase = 'processed';
      await saveCheckpoint(checkpointFile, state);
    }
    
    if (state.phase === 'processed') {
      await workflowStep('保存结果', () => saveResults(state.processed));
      state.phase = 'completed';
      await saveCheckpoint(checkpointFile, state);
    }
    
    return state;
    
  } catch (error) {
    // 工作流级错误处理
    console.error('工作流失败:', error);
    
    // 通知人工
    await notifyAdmin({
      workflow: 'robustWorkflow',
      phase: workflowState.phase,
      error: error.message
    });
    
    throw error;
  }
}
```

**三层防护:** 操作层重试、步骤层记录、工作流层恢复和通知。

<!-- exercises -->


## 练习

### Level 1: 分类错误并设计重试策略

为下面三个错误设计处理策略(重试/快速失败/补偿)：

**错误 A:** 调用支付 API 时收到 `ETIMEDOUT` 错误

**错误 B:** 插入数据库时收到 `duplicate key` 错误

**错误 C:** 上传文件到 S3 时收到 `403 Forbidden` 错误

**要求:**
- 判断每个错误是瞬态还是永久
- 说明应该如何处理(重试几次、用什么策略、或快速失败)
- 如果需要重试，写出重试代码片段

<!-- rubric -->
正确分类(A: 瞬态，B: 永久，C: 永久)；处理策略合理(A: 重试 3 次 + 指数退避，B: 检查是否已存在/快速失败，C: 检查权限配置/快速失败)；重试代码包含指数退避和抖动

<!-- answer -->
错误 A(ETIMEDOUT): 瞬态错误，网络超时可能是临时的。策略: 重试 3 次，使用指数退避 + 抖动(1s, 2-4s, 4-8s)。代码: `await retryWithBackoffAndJitter(async () => await callPaymentAPI(data), 3, 1000)`。错误 B(duplicate key): 永久错误，主键冲突说明记录已存在，重试也会失败。策略: 检查记录是否已存在，如果存在且内容相同则视为成功(幂等性)，如果内容不同则抛出错误让调用者处理。错误 C(403 Forbidden): 永久错误，权限问题需要修改配置或 IAM 策略。策略: 快速失败，记录详细错误信息(bucket 名称、文件路径、当前角色)，通知管理员修复权限。

<!-- hint -->
超时(ETIMEDOUT)、连接拒绝、503 错误通常是瞬态的。权限错误(401/403)、资源不存在(404)、输入格式错误(400)通常是永久的。

<!-- hint -->
duplicate key 特殊：如果工作流设计为幂等的(用唯一 ID 去重)，重复插入应该被视为「已经完成」而不是错误。

### Level 2: 设计补偿操作

一个"用户注册"工作流包含 4 个步骤: (1) 在数据库创建用户记录 (2) 创建用户目录 `/users/{userId}/` (3) 发送欢迎邮件 (4) 添加到邮件列表。如果步骤 3 或 4 失败，如何回滚前面的步骤？

**要求:**
- 为每个步骤设计补偿操作
- 写出 Saga 模式的伪代码(包含正向和补偿)
- 说明哪些补偿操作可能失败，失败了怎么办

<!-- rubric -->
为所有步骤设计了合理的补偿操作(1: 删除用户记录，2: 删除目录，3/4: 发送取消通知)；伪代码包含正向执行和反向补偿逻辑；识别出补偿操作也可能失败(如邮件发送失败、目录删除权限不足)，说明需要记录并人工处理

<!-- answer -->
步骤 1 补偿: `deleteUser(userId)` — 从数据库删除记录。步骤 2 补偿: `deleteDirectory(path)` — 删除用户目录及其内容。步骤 3 补偿: 无需补偿(邮件发送失败不影响数据一致性)。步骤 4 补偿: `removeFromMailingList(email)` — 从邮件列表移除。伪代码(略，见课程示例)。补偿失败情况: (1) 删除目录可能因权限不足失败 → 记录到失败队列，人工清理 (2) 从邮件列表移除可能因 API 不可用失败 → 记录到重试队列，稍后重试 (3) 删除数据库记录应该总是成功(如果失败说明数据库本身有问题，需要紧急通知)。关键: 补偿失败不应该让整个工作流卡住，应该记录失败的补偿操作并继续，最后汇总失败项通知管理员。

<!-- hint -->
补偿操作就是「撤销」正向操作: 创建 → 删除，写入 → 删除或覆盖，发送消息 → 发送取消消息。

<!-- hint -->
有些操作无法真正撤销(如已发送的邮件、已触发的第三方 webhook)，这种情况补偿操作是「通知相关方操作已取消」而不是「撤销操作本身」。

<!-- /exercises -->

---

**下一课:** [第 6 课:真实场景工作流](./06-real-world-workflows.md) — 综合运用所有知识，构建三个生产级工作流：代码重构、文档生成、测试自动化
