# Lesson 4: State Management and Passing Context

> Learning goals:
> - Distinguish workflow state from agent context
> - Master three state-management patterns
> - Understand checkpointing and recovery
>
> Prerequisites: [Lesson 3: Decomposing a Complex Task into a Workflow](./03-task-decomposition.md) | Next: [Lesson 5 >>](./05-error-handling-retry.md)

## Why state management is the heart of a workflow

You design a perfect workflow: 10 steps, clean dependencies. On step 8, the server restarts. The workflow crashes.

Rerun it? Then the work from the first 7 steps — maybe 30 minutes of it — is thrown away.

**That's the price of having no state management.**

State management solves three problems:[^S12]

1. **Passing data between steps**: how does step 3 get the results of steps 1 and 2?
2. **Progress tracking**: how far along is the workflow? How much is left?
3. **Failure recovery**: after a crash, resume from where it stopped instead of starting over.

Without state management, an agent can only pass information through conversation history. Conversation history overflows, gets lost, and gets forgotten by the agent.

With state management, the workflow has a clear "memory": persistent, queryable, recoverable.[^S11]

## State vs. context vs. memory

These three words are easy to mix up, so let's pin them down first:[^S12]

**State**
- All the information about the current task: which step you're on, the result of each step, what to do next
- It's a snapshot: everything the workflow knows at this moment
- Stored in: script variables, a database, files

**Context**
- The information passed into a single agent call
- It's input: what this agent needs to know to do its job
- Selectively pulled from state: not all state goes to the agent, only the relevant part

**Memory**
- Lessons learned from the past: what was done before, what problems came up, what the solutions were
- It's history: long-term knowledge across tasks and sessions
- Out of scope for this lesson (long-term memory is its own hard topic)

**An example:**

```javascript
// State: everything the workflow knows
const workflowState = {
  phase: 'testing',
  filesProcessed: 47,
  totalFiles: 100,
  issues: [/* all issues found in earlier steps */],
  currentBatch: [/* files being processed right now */]
};

// Context: the info for this agent (pulled from state)
const agentContext = {
  file: workflowState.currentBatch[0],
  previousIssues: workflowState.issues.filter(i => i.severity === 'high')
};

// Agent call
const result = await agent({
  task: 'test file',
  context: agentContext  // only relevant info, not the whole state
});

// Update state
workflowState.filesProcessed++;
workflowState.issues.push(...result.newIssues);
```

**The key principle: state is global, context is local.**[^S15]

## State pattern 1: script variables (in-memory state)

**When to use it:** short workflows (< 10 minutes) that don't need to cross processes or machines.

**Upside:** simple, fast, no external dependencies.

**Downside:** state is lost when the process crashes, with no way to recover.

### Basic pattern

```javascript
async function simpleWorkflow(files) {
  // State is just ordinary JavaScript variables
  let processed = 0;
  let results = [];
  let errors = [];
  
  for (const file of files) {
    try {
      const result = await processFile(file);
      results.push(result);
      processed++;
      console.log(`Progress: ${processed}/${files.length}`);
    } catch (error) {
      errors.push({ file, error });
    }
  }
  
  return { results, errors, total: files.length };
}
```

**Where does the state live?** In the function's local variables (`processed`, `results`, `errors`).

**What if the process crashes?** All state is lost, and you start over from the beginning.

### Better: a structured state object

```javascript
async function betterWorkflow(files) {
  // Organize state in an object — clearer
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

**Why it helps:** the state has a clear structure, it's easy to pass to other functions, and it's easy to serialize (if you need to persist it).

## State pattern 2: checkpointing

**When to use it:** medium-length workflows (10-60 minutes) where you need to save progress after expensive operations.

**Upside:** after a crash, you can resume from the most recent checkpoint and avoid redoing work.

**Downside:** you have to design checkpoint locations and recovery logic.[^S12]

### Choosing checkpoint locations

```javascript
async function workflowWithCheckpoints(tasks) {
  const checkpointFile = '.workflow-state.json';
  
  // Try to restore prior state
  let state = await loadCheckpoint(checkpointFile) || {
    completed: [],
    pending: tasks,
    phase: 'processing'
  };
  
  console.log(`Resuming: ${state.completed.length}/${tasks.length} done`);
  
  while (state.pending.length > 0) {
    const task = state.pending.shift();
    
    // Run the task
    const result = await executeTask(task);
    state.completed.push({ task, result });
    
    // Checkpoint: save after every 10 tasks
    if (state.completed.length % 10 === 0) {
      await saveCheckpoint(checkpointFile, state);
      console.log(`Checkpoint: ${state.completed.length} tasks done`);
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
    return null;  // file doesn't exist, start from scratch
  }
}
```

**Checkpoint strategies:**

- **Periodic checkpoints**: save every N tasks or every M minutes
- **Phase checkpoints**: save after each major phase completes (e.g. "analysis phase done")
- **Before critical operations**: save before an irreversible operation (e.g. a deploy, a delete)

```agentmentor-check
{
  "id": "workflows-zh-04-checkpoint-placement",
  "label": "Judging whether a checkpoint is well placed",
  "prompt": "A data-migration workflow has 4 phases: (1) read 1000 records from the source database (5 minutes) (2) transform the data format (10 minutes) (3) write to the target database (20 minutes) (4) verify data consistency (5 minutes). If you can set only 1 checkpoint, after which phase should it go?",
  "whyHere": "You just learned the checkpoint concept and its strategies (periodic, per-phase, before critical operations); this checks whether you can pick the optimal checkpoint location from a task's characteristics (time cost, reversibility)",
  "mode": "single",
  "choices": [
    {
      "id": "a",
      "text": "After phase 1, because it's the first phase",
      "correct": false,
      "feedback": "Phase 1 takes only 5 minutes, so re-running it after a crash costs little. A checkpoint belongs after a long or irreversible operation, not simply at the first step in sequence."
    },
    {
      "id": "b",
      "text": "After phase 2, because it's the most expensive and comes before the write",
      "correct": true,
      "feedback": "Correct. Phase 2 is the longest pure-computation phase (10 minutes), and phase 3 is an irreversible write. A checkpoint after phase 2 both avoids re-running the expensive transform and saves state right before the irreversible write. If phase 3 fails, you resume from the checkpoint, fix the problem, and write again — no need to re-read and re-transform."
    },
    {
      "id": "c",
      "text": "After phase 3, because the write is done",
      "correct": false,
      "feedback": "A checkpoint after phase 3 protects the written result, but if phase 3 itself fails (crashing halfway through the write), the checkpoint never gets a chance to save. The better strategy is to save before phase 3, so on failure you can fix the problem and write again."
    }
  ]
}
```

## State pattern 3: external storage (persistent state)

**When to use it:** long-running workflows (> 1 hour), work that needs to coordinate across machines, or work that needs human approval.

**Upside:** state is persistent; a process crash or machine restart doesn't matter, and pause/resume is supported.

**Downside:** it needs an external dependency (a database, Redis) and adds complexity.[^S13]

### Basic implementation

```javascript
// State store interface
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

// A workflow backed by external storage
async function persistentWorkflow(workflowId, tasks) {
  const store = new WorkflowStateStore(redis);
  
  // Load state (if it exists)
  let state = await store.load(workflowId) || {
    id: workflowId,
    phase: 'init',
    completed: [],
    pending: tasks,
    createdAt: Date.now(),
    updatedAt: Date.now()
  };
  
  console.log(`Workflow ${workflowId}: phase ${state.phase}, 
               progress ${state.completed.length}/${tasks.length}`);
  
  // Phase 1: process tasks
  if (state.phase === 'init' || state.phase === 'processing') {
    state.phase = 'processing';
    
    while (state.pending.length > 0) {
      const task = state.pending.shift();
      const result = await executeTask(task);
      state.completed.push({ task, result });
      state.updatedAt = Date.now();
      
      // Save state after each task
      await store.save(workflowId, state);
    }
    
    state.phase = 'awaiting_approval';
    await store.save(workflowId, state);
  }
  
  // Phase 2: wait for human approval (may resume in another process/machine)
  if (state.phase === 'awaiting_approval') {
    console.log('Awaiting approval...');
    // We can return here and let another process (or a few hours later) continue
    return { workflowId, status: 'awaiting_approval' };
  }
  
  // Phase 3: run the final operation (after approval)
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

// Approval workflow
async function approveWorkflow(workflowId) {
  const store = new WorkflowStateStore(redis);
  const state = await store.load(workflowId);
  
  if (!state) throw new Error('workflow does not exist');
  if (state.phase !== 'awaiting_approval') {
    throw new Error(`cannot approve: current phase is ${state.phase}`);
  }
  
  state.phase = 'approved';
  state.approvedAt = Date.now();
  await store.save(workflowId, state);
  
  // Continue running the workflow
  return await persistentWorkflow(workflowId, []);
}
```

**The key pattern: a state machine**[^S11]

The workflow's phases are the states of a state machine:

```
init → processing → awaiting_approval → approved → finalizing → completed
                         ↓
                     rejected → cancelled
```

Every phase transition is saved to external storage, which is what lets the workflow resume from any phase.

## Best practices for passing context

### Principle 1: pass only what's needed

```javascript
// ❌ Bad: hand the agent all the state
const result = await agent({
  task: 'analyze this file',
  context: workflowState  // analysis results for 100 files, config, logs...
});

// ✓ Good: give only the relevant info
const result = await agent({
  task: 'analyze this file',
  context: {
    file: currentFile,
    guidelines: workflowState.config.analysisGuidelines,
    similarIssues: workflowState.results
      .filter(r => r.file.type === currentFile.type)
      .slice(0, 3)  // at most 3 similar cases
  }
});
```

**Why?** The bigger the context, the easier it is for the agent to get distracted; reasoning quality drops and cost rises.[^S15]

### Principle 2: structure the context

```javascript
// ❌ Bad: unstructured text
const context = `
Analyzed 47 files earlier and found 23 issues.
The current file is src/utils.js, 350 lines.
Config requires checking for SQL injection and XSS.
`;

// ✓ Good: a structured object
const context = {
  progress: { filesAnalyzed: 47, issuesFound: 23 },
  currentFile: { path: 'src/utils.js', lines: 350 },
  checkTypes: ['sql_injection', 'xss']
};
```

**Why?** Structured context is easier for the agent to understand, and easier for you to debug.

### Principle 3: accumulating context vs. resetting context

**Accumulating context:** each step's result is added to the context, so it keeps growing.

```javascript
let context = { task: 'refactor codebase' };

for (const file of files) {
  const result = await agent({ task: 'analyze', context });
  context.results = context.results || [];
  context.results.push(result);  // accumulate
}

// In the end context holds every file's result, which can get huge
```

**Resetting context:** each step clears the context and keeps only what's needed.

```javascript
const allResults = [];

for (const file of files) {
  const context = {
    file,
    guidelines: config.guidelines,
    exampleIssues: allResults.slice(-3)  // only the last 3
  };
  
  const result = await agent({ task: 'analyze', context });
  allResults.push(result);  // lives in workflow state, not in context
}
```

**Which to pick:** use resetting context most of the time to avoid context explosion. Use accumulating context only when later steps genuinely need every earlier result (like a final summary step).[^S14]

## Observability of state

**A good workflow should be able to answer these questions:**

- Which phase is it in right now?
- How much is done? How much is left?
- How many errors has it hit?
- When is it expected to finish?

### Implementing progress tracking

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
                 step ${this.state.currentStep}/${this.state.totalSteps}: 
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

// Usage
async function myWorkflow() {
  const wf = new ObservableWorkflow('data migration', 4);
  
  const data = await wf.executeStep('read source data', async () => {
    return await readSourceData();
  });
  
  const transformed = await wf.executeStep('transform format', async () => {
    return await transformData(data);
  });
  
  await wf.executeStep('write to target database', async () => {
    return await writeToTarget(transformed);
  });
  
  await wf.executeStep('verify', async () => {
    return await validateMigration();
  });
  
  console.log('Final status:', wf.getStatus());
}
```

<!-- exercises -->


## 💻 Exercises

### Level 1: Choose a state-management pattern

For the three workflows below, choose the right state-management pattern (script variables, checkpointing, external storage) and explain why:

**Workflow A:** batch-compress 20 images, 5 seconds each, 100 seconds total

**Workflow B:** train a machine learning model, 50 epochs at 10 minutes each, 500 minutes total (8 hours)

**Workflow C:** review 100 PRs, each needing human approval before merge, and the whole process may run for several days

<!-- rubric -->
Correct pattern choices (A: script variables, B: checkpointing, C: external storage); sound reasoning (accounting for duration, recoverability, and whether human involvement is needed)

<!-- answer -->
Workflow A: script variables. The whole thing is only 100 seconds — very short — so even a full rerun after a crash costs little, and no elaborate state management is warranted. Workflow B: checkpointing. 8 hours is long, and starting over after a crash is too expensive, so you should checkpoint every few epochs. But training is continuous — no cross-process work and no waiting on a human — so checkpoints are enough. Workflow C: external storage. The process runs for days, involves human approval, and the workflow pauses and resumes at another time or in another process, so you must persist state externally (e.g. in a database) to support querying progress and resuming at any time.

<!-- hint -->
Consider three questions: (1) Is the total duration measured in minutes, hours, or days? (2) How expensive is a rerun after a crash? (3) Does it need to pause and resume later?

<!-- hint -->
Script variables suit quick tasks (< 10 minutes). Checkpointing suits expensive tasks (10 minutes to a few hours). External storage suits long-running tasks (> a few hours) or tasks that need human involvement.

### Level 2: Design a state structure

Design the state object for a "multi-service deployment" workflow. The workflow needs to: (1) build Docker images for 5 services (2) push them to an image registry (3) deploy to a test environment one by one (4) run integration tests (5) if tests pass, deploy to production.

**Requirements:**
- Design a JSON object that represents the workflow state
- Include: current phase, per-service status, error info, timestamps
- Explain where checkpoints should be saved

<!-- rubric -->
Sound state structure (includes a phase marker, a service list with each service's status, an error array, and timing info); each service's status carries enough info (e.g. build status, image ID, deploy status); correctly identifies checkpoint locations (at least after phases 2 and 4, and before production deploy)

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
    }
    // ... the other 4 services
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
Checkpoint locations: (1) after phase 2 (push) completes — building and pushing are expensive, so avoid re-running them (2) after phase 4 (integration_test) completes — passing tests is a precondition for the production deploy, and tests themselves may fail and need to rerun after a fix (3) before each service deploys to production — supports recovery after a partial failure.

<!-- hint -->
The state should be able to answer: which phase is the workflow in? What state is each service in (building / built / deployed / failed)? If it crashes, where does it resume from?

<!-- hint -->
Each service's status is independent (one service failing to build doesn't change another's status), so each service should have its own status fields. Checkpoints belong after expensive operations and before irreversible ones (the production deploy).

<!-- /exercises -->

---

**Next lesson:** [Lesson 5: Error Handling and Retry Strategies](./05-error-handling-retry.md) — learn how to make a workflow recover gracefully on failure instead of crashing outright
