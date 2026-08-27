# Lesson 5: Error Handling and Retry Strategies

> Learning goals:
> - Tell transient errors from permanent ones
> - Master retry strategies and backoff algorithms
> - Learn to design compensating actions and rollback mechanisms
>
> Prerequisites: [Lesson 4: State Management and Passing Context](./04-state-and-context.md) | Next: [Lesson 6 >>](./06-real-world-workflows.md)

## Errors Are the Norm in Workflows

Your workflow runs perfectly ten times. On the eleventh, at step 8, the API returns a 503. The workflow crashes.

So you add a `try-catch`, catch the error, log it, and keep going. On the twelfth run, the database connection times out. The workflow continues, but the write failed, and now your data is inconsistent.

**Error handling isn't as simple as "add a try-catch."**

In a workflow, error handling has to answer three questions:[^S7]

1. **Is this error temporary or permanent?** (network jitter vs missing permissions)
2. **Should you retry, skip, or abort?** (a retry might fix it vs a retry makes it worse)
3. **If you abort, how do you clean up the steps that already finished?** (roll back the database vs send a cancellation notice)

If the step that failed is optional (say, sending a notification), skip it and move on. Letting a non-critical failure not derail the whole run is called graceful degradation. But if the failed step is critical, skipping it leaves an inconsistent state, so you should abort instead.

Without answers, your workflow is either too fragile (one small error takes it down) or too dangerous (it ignores errors and keeps running, leaving inconsistent state behind).[^S9]

## Classifying Errors: Transient vs Permanent

**Transient errors** are temporary; a retry might succeed.[^S8]

**Common transient errors:**
- Network timeouts
- Service temporarily unavailable (503 Service Unavailable)
- Rate limiting (429 Too Many Requests)
- Database connection pool exhausted
- Temporary lock conflicts

**What they share:** they usually come from resource contention, network fluctuation, or temporary overload, and waiting a moment before retrying tends to work.

**Permanent errors** won't succeed on retry; they need a code or config fix.[^S9]

**Common permanent errors:**
- Missing permissions (401 Unauthorized, 403 Forbidden)
- Resource not found (404 Not Found)
- Malformed input (400 Bad Request)
- Business-logic errors (insufficient balance, zero stock)
- Code bugs (null pointer, divide by zero)

**What they share:** they come from misconfiguration, code bugs, or violated business rules, and retrying just wastes resources.

**How to tell them apart:**

```javascript
function classifyError(error) {
  // HTTP status code check
  if (error.status === 429) return 'transient';  // rate limit
  if (error.status >= 500) return 'transient';   // server-side error
  if (error.status === 404) return 'permanent';  // resource not found
  if (error.status === 401) return 'permanent';  // permission problem
  
  // Error type check
  if (error.code === 'ETIMEDOUT') return 'transient';    // timeout
  if (error.code === 'ECONNREFUSED') return 'transient'; // connection refused
  if (error.code === 'ENOTFOUND') return 'permanent';    // DNS failure
  
  // Error message check
  if (error.message.includes('rate limit')) return 'transient';
  if (error.message.includes('permission denied')) return 'permanent';
  
  // Default to permanent (conservative strategy)
  return 'permanent';
}
```

## Retry Strategies

**For transient errors, retrying is your first move. But there's more to retrying than meets the eye.**[^S8]

### Strategy 1: Fixed-delay retry

```javascript
async function retryWithFixedDelay(fn, maxAttempts = 3, delay = 1000) {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      if (attempt === maxAttempts) throw error;
      
      console.log(`Attempt ${attempt} failed, retrying in ${delay}ms...`);
      await sleep(delay);
    }
  }
}

// Usage
const data = await retryWithFixedDelay(
  () => fetchAPI('/users'),
  3,
  1000
);
```

**The problem:** if the errors come from an overloaded service, every client retrying at once makes the overload worse (the thundering-herd effect).

### Strategy 2: Exponential backoff

```javascript
async function retryWithExponentialBackoff(fn, maxAttempts = 3, baseDelay = 1000) {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      if (attempt === maxAttempts) throw error;
      
      const delay = baseDelay * Math.pow(2, attempt - 1);
      console.log(`Attempt ${attempt} failed, retrying in ${delay}ms...`);
      await sleep(delay);
    }
  }
}

// Delay sequence: 1s, 2s, 4s, 8s, ...
```

**The benefit:** each retry doubles the interval, giving the service more time to recover instead of hammering it.[^S8]

### Strategy 3: Exponential backoff + jitter

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
      
      console.log(`Attempt ${attempt} failed, retrying in ${delay.toFixed(0)}ms...`);
      await sleep(delay);
    }
  }
}

// Delay sequence (with randomness): 1.2s, 3.7s, 6.1s, ...
```

**The benefit:** jitter keeps multiple clients from retrying at the exact same instant, spreading the load.[^S8]

**This is the recommended strategy for production.**[^S6]

### Strategy 4: Selective retry

```javascript
async function retrySelective(fn, maxAttempts = 3) {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      const errorType = classifyError(error);
      
      if (errorType === 'permanent') {
        console.log('Permanent error, not retrying');
        throw error;
      }
      
      if (attempt === maxAttempts) {
        console.log(`All ${maxAttempts} retries failed`);
        throw error;
      }
      
      const delay = 1000 * Math.pow(2, attempt - 1) * (1 + Math.random());
      console.log(`Transient error, retrying in ${delay.toFixed(0)}ms...`);
      await sleep(delay);
    }
  }
}
```

**The key idea:** only retry transient errors. Throw permanent errors immediately so you don't burn cycles on pointless retries.[^S10]

```agentmentor-check
{
  "id": "workflows-zh-05-retry-strategy",
  "label": "Pick the right retry strategy",
  "prompt": "A workflow needs to call an external API to fetch data. The API allows 60 requests per minute; past that it returns 429, and you have to wait 60 seconds to continue. The workflow needs to call the API 100 times within one minute. How should you handle the 429 errors?",
  "whyHere": "You've just learned error classification (transient vs permanent) and retry strategies (fixed, exponential backoff, selective). This checks whether you can look at a specific error type (rate limiting) and pick a sensible way to handle it rather than reaching for backoff reflexively.",
  "mode": "single",
  "choices": [
    {
      "id": "a",
      "text": "Use exponential backoff; the delays keep growing and it'll eventually succeed",
      "correct": false,
      "feedback": "Backoff suits temporary overload, but a rate limit has a known recovery window (60 seconds). Backoff might give up within a few seconds, or its delays (1s, 2s, 4s) may be too short to outlast the window. Worse, the workflow needs 100 calls against a 60/min ceiling, so no amount of retrying finishes it inside one minute."
    },
    {
      "id": "b",
      "text": "Split the work into batches of 60 requests, waiting 60 seconds between batches",
      "correct": true,
      "feedback": "Right. A 429 is a predictable transient error with a known recovery time. The best move is to respect the limit up front: send 60 requests in the first batch, wait 60 seconds, then send the remaining 40. If you still hit a 429, the previous window hasn't fully reset, so wait for the Retry-After header value and try again. That beats retrying blindly."
    },
    {
      "id": "c",
      "text": "A 429 is a permanent error (quota exhausted), so fail immediately and alert an admin",
      "correct": false,
      "feedback": "A 429 is transient, not permanent. It means you're over the current rate, but you can continue after waiting. Permanent errors are things like misconfiguration or missing permissions (401, 403) that a retry won't fix. Rate limiting is temporary; you solve it by slowing your request rate or waiting for the window to reset."
    }
  ]
}
```

## The Circuit Breaker Pattern

**The problem:** if a service keeps failing (say, a crashed database) and every request retries three times, you burn resources for nothing and drag down the whole workflow. And if that service is a dependency of other services, the failure propagates down the chain into a cascading failure.

**A circuit breaker:** when the error rate crosses a threshold, it temporarily stops calling the failing service and fails fast instead, avoiding wasted resources.[^S7]

### Three states

```
Closed ──error rate > threshold──→ Open
   ↑                                 ↓
   └──test succeeds──← Half-Open ←──after timeout
```

**Closed:** working normally. Requests pass through, and the breaker tracks the error rate.

**Open:** the service is considered unavailable. Requests fail fast without calling it.

**Half-open:** after a timeout, a few trial requests go through. If they succeed, the breaker returns to closed; otherwise it stays open.

### Implementation

```javascript
class CircuitBreaker {
  constructor(options = {}) {
    this.failureThreshold = options.failureThreshold || 5;  // failures before opening
    this.resetTimeout = options.resetTimeout || 60000;      // try to recover after 60s
    
    this.state = 'closed';
    this.failureCount = 0;
    this.nextAttempt = null;
  }
  
  async execute(fn) {
    // Open state: fail fast
    if (this.state === 'open') {
      if (Date.now() < this.nextAttempt) {
        throw new Error('Circuit breaker open, service temporarily unavailable');
      }
      // After the timeout, move to half-open
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
      console.log('Circuit breaker recovered to closed state');
    }
  }
  
  onFailure() {
    this.failureCount++;
    
    if (this.failureCount >= this.failureThreshold) {
      this.state = 'open';
      this.nextAttempt = Date.now() + this.resetTimeout;
      console.log(`Circuit breaker opened, will retry in ${this.resetTimeout}ms`);
    }
  }
}

// Usage
const breaker = new CircuitBreaker({ failureThreshold: 3, resetTimeout: 30000 });

async function callAPI() {
  return await breaker.execute(async () => {
    return await fetch('/api/data');
  });
}
```

**When to use it:** calls to external services, databases, file systems, and other dependencies that can fail in bulk.[^S7]

## Compensating Actions and Rollback

**The problem:** the workflow did three writes (write to the database, send an email, update the cache), and step 4 failed. How do you undo the first three?[^S9]

### Pattern 1: Transactional operations

```javascript
async function transactionalWorkflow() {
  const tx = await db.beginTransaction();
  
  try {
    await tx.insert('users', userData);
    await tx.update('accounts', accountData);
    await tx.insert('logs', logData);
    
    await tx.commit();
    console.log('Transaction committed');
  } catch (error) {
    await tx.rollback();
    console.log('Transaction rolled back');
    throw error;
  }
}
```

**When it fits:** every operation lives in the same database that supports transactions.

**The limit:** it can't span systems (say, database + file system + API call).

### Pattern 2: Compensating actions (the Saga pattern)

**The idea:** define a compensating action for each operation, and on failure run the compensations to undo the steps that already completed.[^S6]

```javascript
async function sagaWorkflow() {
  const completed = [];
  
  const steps = [
    {
      name: 'Create order',
      forward: async () => {
        const order = await createOrder(orderData);
        return { orderId: order.id };
      },
      compensate: async (context) => {
        await deleteOrder(context.orderId);
        console.log(`Compensate: deleted order ${context.orderId}`);
      }
    },
    {
      name: 'Decrement inventory',
      forward: async (context) => {
        await decrementInventory(orderData.items);
        return context;
      },
      compensate: async (context) => {
        await incrementInventory(orderData.items);
        console.log('Compensate: restored inventory');
      }
    },
    {
      name: 'Charge payment',
      forward: async (context) => {
        await chargePayment(context.orderId, orderData.amount);
        return context;
      },
      compensate: async (context) => {
        await refundPayment(context.orderId);
        console.log(`Compensate: refunded order ${context.orderId}`);
      }
    },
    {
      name: 'Send confirmation email',
      forward: async (context) => {
        await sendEmail(orderData.email, context.orderId);
        return context;
      },
      compensate: async (context) => {
        await sendEmail(orderData.email, 'Order cancelled');
        console.log('Compensate: sent cancellation email');
      }
    }
  ];
  
  let context = {};
  
  try {
    // Run all steps forward
    for (const step of steps) {
      console.log(`Running: ${step.name}`);
      context = await step.forward(context);
      completed.push(step);
    }
    
    console.log('Workflow completed successfully');
    return context;
    
  } catch (error) {
    console.log(`Failed at: step ${completed.length + 1}/${steps.length}`);
    
    // Run compensations in reverse
    for (let i = completed.length - 1; i >= 0; i--) {
      const step = completed[i];
      try {
        await step.compensate(context);
      } catch (compensateError) {
        console.error(`Compensation failed: ${step.name}`, compensateError);
        // A failed compensation needs a human
      }
    }
    
    throw error;
  }
}
```

**Key points:**

1. Every step has a `forward` (the action) and a `compensate` (the undo).
2. On failure, run the compensations for completed steps in reverse order.
3. A compensation can itself fail; log it and flag it for a human.[^S6]

### Pattern 3: Idempotent design

**Idempotent:** running it N times has the same effect as running it once.[^S9]

```javascript
// Not idempotent: repeat runs keep adding up
async function incrementCounter(userId) {
  const current = await getCounter(userId);
  await setCounter(userId, current + 1);
}

// Idempotent: repeat runs land on the same result
async function setCounter(userId, value) {
  await db.update('counters', { userId }, { value });
}

// Idempotent: dedupe with a unique ID
async function processOrder(orderId, orderData) {
  // Check whether it's already processed
  const existing = await db.get('orders', orderId);
  if (existing) {
    console.log(`Order ${orderId} already processed, skipping`);
    return existing;
  }
  
  // First time through
  const result = await createOrder(orderData);
  await db.insert('orders', { id: orderId, ...result });
  return result;
}
```

**The benefit:** if a step runs twice because of a network hiccup (the first attempt timed out but actually succeeded), idempotency guarantees no duplicate side effects.[^S9]

## Layers of Error Handling

**A good workflow handles errors at three layers:**

### Layer 1: The individual operation

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

### Layer 2: The workflow step

```javascript
async function workflowStep(stepName, fn) {
  try {
    console.log(`Starting: ${stepName}`);
    const result = await fn();
    console.log(`Finished: ${stepName}`);
    return result;
  } catch (error) {
    console.error(`Failed: ${stepName}`, error.message);
    
    // Record it in the state
    workflowState.errors.push({
      step: stepName,
      error: error.message,
      timestamp: Date.now()
    });
    
    throw error;
  }
}
```

This layer writes every failure into `workflowState.errors` with the step name, error message, and timestamp. That's your error log, and when you're debugging you lean on this record rather than your memory.

### Layer 3: The whole workflow

```javascript
async function robustWorkflow() {
  const checkpointFile = '.workflow-checkpoint.json';
  
  try {
    // Load the checkpoint
    let state = await loadCheckpoint(checkpointFile) || { phase: 'init' };
    
    // Run each phase (with skip logic)
    if (state.phase === 'init') {
      state.data = await workflowStep('Collect data', collectData);
      state.phase = 'collected';
      await saveCheckpoint(checkpointFile, state);
    }
    
    if (state.phase === 'collected') {
      state.processed = await workflowStep('Process data', () => processData(state.data));
      state.phase = 'processed';
      await saveCheckpoint(checkpointFile, state);
    }
    
    if (state.phase === 'processed') {
      await workflowStep('Save results', () => saveResults(state.processed));
      state.phase = 'completed';
      await saveCheckpoint(checkpointFile, state);
    }
    
    return state;
    
  } catch (error) {
    // Workflow-level error handling
    console.error('Workflow failed:', error);
    
    // Notify a human
    await notifyAdmin({
      workflow: 'robustWorkflow',
      phase: workflowState.phase,
      error: error.message
    });
    
    throw error;
  }
}
```

**Three layers of protection:** retry at the operation layer, record at the step layer, recover and notify at the workflow layer.

<!-- exercises -->


## 💻 Exercises

### Level 1: Classify errors and design retry strategies

Design a handling strategy (retry / fail fast / compensate) for each of these three errors:

**Error A:** calling the payment API returns an `ETIMEDOUT` error

**Error B:** inserting into the database returns a `duplicate key` error

**Error C:** uploading a file to S3 returns a `403 Forbidden` error

**Requirements:**
- Decide whether each error is transient or permanent
- Explain how to handle it (how many retries, which strategy, or fail fast)
- If it needs a retry, write out the retry code snippet

<!-- rubric -->
Correct classification (A: transient, B: permanent, C: permanent); reasonable handling strategy (A: retry 3x + exponential backoff, B: check whether it already exists / fail fast, C: check the permission config / fail fast); the retry code includes exponential backoff and jitter

<!-- answer -->
Error A (ETIMEDOUT): transient. A network timeout may be temporary. Strategy: retry 3 times with exponential backoff + jitter (1s, 2-4s, 4-8s). Code: `await retryWithBackoffAndJitter(async () => await callPaymentAPI(data), 3, 1000)`. Error B (duplicate key): permanent. A primary-key conflict means the record already exists, so a retry fails too. Strategy: check whether the record exists; if it exists with identical content, treat it as success (idempotency); if the content differs, throw so the caller can handle it. Error C (403 Forbidden): permanent. A permission problem needs a config or IAM policy change. Strategy: fail fast, log the details (bucket name, file path, current role), and notify an admin to fix the permissions.

<!-- hint -->
Timeouts (ETIMEDOUT), connection refused, and 503 errors are usually transient. Permission errors (401/403), resource-not-found (404), and malformed input (400) are usually permanent.

<!-- hint -->
duplicate key is a special case: if the workflow is designed to be idempotent (dedupe with a unique ID), a repeated insert should count as "already done" rather than an error.

### Level 2: Design compensating actions

A "user registration" workflow has 4 steps: (1) create the user record in the database, (2) create the user directory `/users/{userId}/`, (3) send a welcome email, (4) add to the mailing list. If step 3 or 4 fails, how do you roll back the earlier steps?

**Requirements:**
- Design a compensating action for each step
- Write the Saga-pattern pseudocode (forward and compensate)
- Explain which compensations might fail, and what to do when they do

<!-- rubric -->
Reasonable compensations for every step (1: delete the user record, 2: delete the directory, 3/4: send a cancellation notice); pseudocode includes forward execution and reverse compensation logic; recognizes that compensations can also fail (e.g. email send fails, insufficient permission to delete the directory) and explains that these need to be logged and handled by a human

<!-- answer -->
Step 1 compensation: `deleteUser(userId)` — delete the record from the database. Step 2 compensation: `deleteDirectory(path)` — delete the user directory and its contents. Step 3 compensation: none needed (a failed email send doesn't affect data consistency). Step 4 compensation: `removeFromMailingList(email)` — remove from the mailing list. Pseudocode omitted (see the course example). Compensation failures: (1) deleting the directory may fail due to insufficient permissions -> log to a failure queue for manual cleanup; (2) removing from the mailing list may fail if the API is down -> log to a retry queue and try again later; (3) deleting the database record should always succeed (if it fails, the database itself has a problem and needs an urgent alert). The key: a failed compensation shouldn't stall the whole workflow. Log the failed compensations, keep going, and finally send an admin a summary of the failed items.

<!-- hint -->
A compensation is the "undo" of a forward action: create -> delete, write -> delete or overwrite, send a message -> send a cancellation message.

<!-- hint -->
Some actions can't truly be undone (an email that's already sent, a third-party webhook that's already fired). In that case the compensation is "notify the affected parties that the action was cancelled" rather than "undo the action itself."

<!-- /exercises -->

---

**Next:** [Lesson 6: Real-World Workflows in Practice](./06-real-world-workflows.md) — Put it all together to build three production-grade workflows: code refactoring, documentation generation, and test automation
