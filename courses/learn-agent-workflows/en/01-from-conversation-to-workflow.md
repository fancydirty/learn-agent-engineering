# Lesson 1: From Conversation to Workflow: Why Orchestration Exists

> Learning goals:
> - Understand the fundamental difference between a single conversation and a workflow
> - Recognize the traits of a task that fits a workflow
> - Grasp the core value of workflow orchestration
>
> Prerequisites: You've used Claude Code or a similar AI tool | Next: [Lesson 2 >>](./02-workflow-building-blocks.md)

## Your Agent Hits a Wall

You ask Claude Code to refactor a large codebase: "Split this 5,000-line monolith into microservices."

Claude gets to work. It reads files, identifies module boundaries, pulls out dependencies, and then, somewhere around file 47, the context window fills up. It forgets what it did earlier, starts over, and gets stuck in a loop.[^S3]

Or you ask it to "review every open PR and write this week's release notes." Claude can only handle one PR at a time, so you run it 20 times by hand, re-explaining the formatting rules on every pass.

That's the ceiling of a single conversation: one conversation, one context window, one chain of reasoning. For complex tasks, this pattern breaks down.[^S1]

## What a Workflow Is

A workflow is an executable script that breaks a complex task into steps, delegates each step to a fresh agent, and coordinates the whole thing itself.[^S2]

The key differences:

| Dimension | Single conversation | Workflow |
|------|---------|--------|
| Control flow | The agent decides what to do next | The script decides what to do next |
| Context | All history lives in one window | Each step gets its own context |
| Parallelism | Runs sequentially | Can launch many agents at once |
| Repeatability | May differ each run | Fixed script, deterministic runs |
| Scale it fits | Small tasks (a few files) | Large tasks (hundreds of files, multiple validation stages) |

For example, a refactoring workflow might look like this:

```javascript
// Pseudocode example
async function refactorWorkflow(codebase) {
  // Step 1: analyze all modules in parallel
  const modules = await Promise.all(
    codebase.files.map(file => 
      agent({ task: `Analyze the responsibilities and dependencies of ${file}` })
    )
  );
  
  // Step 2: propose microservice boundaries
  const plan = await agent({ 
    task: 'Design microservice boundaries from the analysis',
    context: modules 
  });
  
  // Step 3: extract each service in parallel
  const services = await Promise.all(
    plan.services.map(svc => 
      agent({ task: `Extract the code for the ${svc.name} service` })
    )
  );
  
  // Step 4: verify every service's tests pass
  return await agent({ 
    task: 'Run the test suite for every service',
    context: services 
  });
}
```

The script holds the loops, the branches, and the intermediate results; Claude's context only ever sees the final answer. The orchestration is deterministic, and only the work inside each step is model-driven.[^S2]

## When a Workflow Fits

Four traits mark a task that fits a workflow:

1. **More agents than one conversation can coordinate.** A single conversation can manage 3-5 subagents; past that, you need a workflow.
2. **You want the orchestration codified as a readable, reusable script.** Write it once, rerun it whenever.
3. **The task splits into clear phases.** Analyze, plan, implement, verify.
4. **You need parallel execution or cross-checking.** Independent subtasks, adversarial validation, tournament-style comparison.

The official docs put it plainly: "Reach for a workflow when a task needs more agents than one conversation can coordinate, or when you want the orchestration codified as a script you can read and rerun."[^S1]

Typical scenarios:

- **Codebase audit.** Scan 500 files, one agent per file checking for security issues, then aggregate the results.
- **Large-scale migration.** Upgrade 200 components from Vue 2 to Vue 3 in parallel, then verify the integration at the end.
- **Cross-checked research.** Have 5 agents research the same question independently, cross-check the facts, and produce a consistency report.
- **Multi-angle design review.** Evaluate a design from three angles (architecture, performance, cost) independently, then merge.[^S1]

When a workflow is the wrong tool:

- Simple single-file edits or code reviews, where a direct conversation is enough.
- Open-ended work like creative writing or brainstorming.
- Tasks that need a lot of human judgment and can't be reduced to steps.

```agentmentor-check
{
  "id": "workflows-zh-01-scenario-judge",
  "label": "Judge whether a doc-generation scenario fits a workflow",
  "prompt": "You need to generate API docs for 10 microservices. Each service has 20-30 endpoints, and the work is: extract the interfaces from code, generate examples, check consistency, and finally roll everything up into one unified doc. Does this scenario fit a workflow?",
  "whyHere": "You just learned the four traits that mark a workflow-shaped task (agent count, reusable script, clear phases, parallel execution). This check verifies you can apply those criteria to a concrete case, and that you won't mislabel a highly structured, repeatable task as open-ended creative work.",
  "mode": "single",
  "choices": [
    {
      "id": "a",
      "text": "No, because generating docs is creative work that can't be reduced to steps.",
      "correct": false,
      "feedback": "API doc generation isn't creative work; it's a highly structured task: extract, generate, validate, aggregate. Every step has well-defined inputs and outputs, which is exactly what suits a workflow."
    },
    {
      "id": "b",
      "text": "Yes, because it coordinates 10 parallel agents, has clear phases, and runs in parallel.",
      "correct": true,
      "feedback": "Right. This scenario hits every trait: 10 services exceed what one conversation can manage, the process can be frozen into a reusable script, the phases are clear, and each service's docs can be generated in parallel before the final roll-up."
    }
  ]
}
```

## How Workflows Evolved

Workflows didn't appear out of nowhere. They're the fourth stage of Claude Code's orchestration capability:[^S3]

**Stage 1: Monolithic agent**
```
┌─────────┐
│ Claude  │  One context window does everything:
└─────────┘  read, plan, edit, test
```

**Stage 2: Subagent fan-out (the Agent tool)**
```
┌─────────┐
│ Claude  │──→ agent: "search the codebase"
│ (main)  │──→ agent: "read these 40 files"
└─────────┘  results return to the parent agent
```

**Stage 3: Agent teams**
```
┌─────────┐    ┌─────────┐    ┌─────────┐
│ Planner │───→│ Coder   │───→│ Tester  │
└─────────┘    └─────────┘    └─────────┘
     each agent keeps its own role and context
```

**Stage 4: Workflow orchestration**
```
    ┌─────────────────┐
    │ Workflow Script │  holds loops, branches, state
    └────────┬────────┘
         ┌───┴───┬───────┬───────┐
         ↓       ↓       ↓       ↓
    agent()  agent() agent() agent()
    each call launches an independent subagent
```

The core innovation of a workflow is inverted control flow: instead of letting the agent decide "what do I do next," the script decides "which agent do I call next."[^S2]

## What Orchestration Really Is

Orchestration is exactly what it sounds like: "one score, many musicians. A script deciding it — for loop, if statement — is orchestration."[^S3]

In a workflow:

- **The score** = the JavaScript/TypeScript script you write, with its `for` loops, `if` statements, and `Promise.all` calls.
- **The musicians** = the subagents each `agent()` call launches.
- **The conductor** = the script's execution engine, coordinating the agents according to the score.

Here's the distinction, in the words of the guide that named it: "A normal agent decides the control flow as it goes. A workflow inverts that. You write the control flow as plain code, and each individual step is delegated to a fresh subagent."

A normal agent improvises at runtime: "do A first, then decide whether to do B or C." A workflow pins the control flow down in code: "run A1-A10 in parallel, then do B once they all finish; if B returns `score > 0.8`, do C, otherwise D."

What deterministic orchestration buys you:

- **Predictable.** Same input, same execution path.
- **Debuggable.** Which step failed is obvious.
- **Rerunnable.** The script lives in `.claude/workflows/` and can be called by name.
- **Scalable.** Going from 10 agents to 100 is just a change to the loop count.[^S2]

## Your First Workflow Scenario: A Code-Review Pipeline

Let's look at a real case. Your team has 15 PRs waiting for review, and each PR needs four checks:

1. Does the code follow the style guide?
2. Are there any obvious bugs?
3. Is test coverage sufficient?
4. Were the relevant docs updated?

With a single conversation, you run it 15 times, switching PRs by hand each time.

With a workflow:

```javascript
async function reviewPRsWorkflow(prList) {
  // Phase 1: review all PRs in parallel
  const reviews = await Promise.all(
    prList.map(pr => 
      agent({
        task: `Review PR #${pr.number}`,
        prompt: `Check code style, potential bugs, tests, and docs.
                 Output JSON: { style: score, bugs: [], 
                 coverage: number, docs: boolean }`
      })
    )
  );
  
  // Phase 2: aggregate the report
  return await agent({
    task: 'Generate the weekly report',
    prompt: `Based on the review results for ${reviews.length} PRs,
             produce this week's code-quality report,
             sorting issues by severity`
  });
}
```

What this workflow gets you:

- 15 PRs reviewed in parallel, 15x faster than sequential.
- Consistent review standards (every PR uses the same prompt).
- It can run automatically every week, no manual steps.
- The script commits to Git and gets shared across the team.

<!-- exercises -->


## 💻 Exercises

### Level 1: Spot Your First Workflow Scenario

Look back at your past week of work, find a repetitive task, and judge whether it fits a workflow:

**Criteria:**
- Needs to process many similar inputs (many files, many data sources, many services)
- Has clear phases (extract, transform, validate, output)
- You want the process to run the same way every time
- It can run partly or fully in parallel

**Write down:**
1. The task, in one sentence
2. How you do it today
3. If you used a workflow, which phases it would split into
4. How much time you'd expect to save

<!-- rubric -->
The scenario is described clearly, the phases are reasonable (3-5 of them), you can point to where parallel execution helps, and the time estimate has a basis (e.g. "processing 10 files sequentially takes 30 minutes today; in parallel I'd expect 5").

<!-- answer -->
Example answer — Task: generate changelogs for several microservices. Today: manually read each service's Git commits and copy them into a doc. Workflow phases: (1) pull each service's commit history in parallel, (2) turn commits into user-readable change descriptions in parallel, (3) roll them up into release notes in a unified format, (4) generate a highlights summary comparing against the previous version. Expected: down from 45 minutes to 8, because steps 1 and 2 can process 8 services in parallel.

<!-- hint -->
Start from tasks where you do the same operation to many similar objects, like batch-processing files, batch-calling an API, or batch-generating reports.

<!-- hint -->
A good workflow scenario usually has a fan-out, process, aggregate shape: spread the task across many agents, each handling a slice, then merge the results.

### Level 2: Compare a Single Conversation With a Workflow

Pick one of these two scenarios and explain why one fits a single conversation and the other fits a workflow:

**Scenario A:** Fix a bug in a function that's 50 lines long with clear logic.

**Scenario B:** Upgrade a UI library of 30 components from Material-UI v4 to v5.

Write your judgment and reasoning (2-3 sentences per scenario).

<!-- rubric -->
Correctly identifies that Scenario A fits a single conversation (small task, manageable context, no need for parallelism) and Scenario B fits a workflow (large scale, decomposable, parallelizable); explains the "why" rather than just repeating definitions; names a concrete workflow benefit (parallelism, consistency, repeatability).

<!-- answer -->
Scenario A fits a single conversation. Fixing a bug in one function is small in scope; 50 lines load fully into one context window, and the agent can read, understand, fix, and verify directly with nothing to decompose. Scenario B fits a workflow. Thirty components exceed what one conversation can manage efficiently, and components are usually independent, so you can upgrade them in parallel (one agent per component) and then run integration tests to verify. The workflow makes sure every component uses the same upgrade rules, so nothing slips through.

<!-- hint -->
Ask yourself: if a person did these two tasks, is Scenario A the kind of thing you sit down and finish in 10 minutes, or a bigger job that takes days, a checklist, and staged steps?

<!-- hint -->
The keyword in Scenario B is "30 components." Once the count is above 10, consider a workflow; when a task can be described as "do the same operation to N objects," a workflow is almost always the better choice.

<!-- /exercises -->

---

**Next:** [Lesson 2 >>](./02-workflow-building-blocks.md) — Workflow Building Blocks: Steps, State, Branches, Loops
