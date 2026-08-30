# Lesson 3: Parallelization: Sectioning and Voting

> Learning goals:
> - Distinguish between the two variants of parallelization—sectioning and voting—understand what each solves, and respect the boundary drawn by "outputs aggregated programmatically"
> - Use `Promise.all` and a custom concurrency pool to implement sectioning, ensuring aggregation passes references rather than payloads
> - Calculate the three costs of fan-out (results flooding context, real product concurrency ceilings, voting's N× token multiplier) and use them to decide whether a proposal should parallelize
>
> Prerequisites: Completed Lessons 1 and 2, have the `runAgent()` wrapper from Lesson 2 | Previous: [<< Lesson 2: Chain It, Route It: Chaining and Routing](./02-chaining-and-routing.md) | Next: [Lesson 4 >>](./04-orchestrator-workers.md)

## Twelve docs, one chain, an hour in the queue

The chain from Lesson 2 now works: outline → gate → draft → gate → check terminology. Swap in review-focused prompts—extract key points, suggest revisions, verify terms—and the chain's shape doesn't change. Run it on one document: six or seven minutes.

Then the product team drops a directory on your desk: 12 documents, each needs the same review pass.

You write a `for` loop, start it, and go make coffee. An hour later you're back. The log stopped at document 9. Document 10 is extracting key points.

For that hour, the machine spent most of its time waiting. Waiting for document 1's API response before sending document 2's request. Waiting for document 2 to finish all four stages before document 3 gets its turn. Ask a practical question: does document 3's review conclusion depend on a single word from document 2's result?

No. They're 12 independent documents. Their review reports don't care who finishes first. In chaining, the wait has a reason—the next step's input is the previous step's output. Here there's no such reason. These 12 runs are only queued because a `for` loop put them in line.

Course 6 in this series already covered fan-out-aggregate collaboration patterns and how multi-perspective voting works[^S1]. This lesson turns it into code and settles the accounts: fan-out isn't free. The speed is real, and so is the cost.

## Definition: can run simultaneously, outputs aggregated programmatically

Start with the original wording. LLMs can sometimes work simultaneously on a task and have their outputs aggregated programmatically. This workflow is parallelization, with two key variations[^S1]:

- **Sectioning**: Breaking a task into independent subtasks run in parallel[^S1]. Reviewing 12 documents is sectioning.
- **Voting**: Running the same task multiple times to get diverse outputs[^S1]. Having three perspectives each evaluate the same copy is voting.

When to use it: when the divided subtasks can be parallelized for speed, or when multiple perspectives or attempts are needed for higher confidence results[^S1]. There's an easy-to-skip but valuable addition—for complex tasks with multiple considerations, LLMs generally perform better when each consideration is handled by a separate LLM call, allowing focused attention on each specific aspect[^S1]. Translation: sectioning and voting aren't just time-savers. Cramming "legal, security, brand" into one prompt versus having three calls each watch one thing produces different quality.

One more half-sentence to nail down: **outputs aggregated programmatically**. After fanned-out results return, your code does the judging, filtering, and summarizing—not another model call to read all 12 reports and write a summary. Having the model aggregate is a different pattern. Lesson 4's orchestrator does exactly that work. Draw the line clearly here. Current Claude platform docs list Parallelization under multi-agent orchestration: fan out independent subtasks simultaneously (searching multiple sources, analyzing separate files) and have the coordinator synthesize the results[^S6]—note that in that version the coordinator does aggregation, while this lesson writes the programmatic aggregation version[^S1]. Same word, who does the aggregation is two different things.

## Sectioning: swap the for loop for Promise.all

Serial version looks like this, total time is the sum of all 12:

```javascript
const reports = [];
for (const doc of docs) {
  reports.push(await runAgent(client, reviewTask(doc)));
}
```

Sectioning version changes one line, total time approaches the slowest one:

```javascript
const reports = await Promise.all(
  docs.map((doc) => runAgent(client, reviewTask(doc))),
);
```

`runAgent()` still sits at the same wrapper position from Lesson 2—one complete harness loop, internally branching on `stop_reason`. This lesson's stub responses all complete in one turn (`end_turn`), so the version in the final script omits the tool branch as a simplification. When connecting to a real client or needing tools, bring back Lesson 2's tool-dispatching version unchanged. Parallelization doesn't alter any line of this loop itself. It just stops making these loops queue.

Aggregation happens in the next line, done by this code:

```javascript
const blockers = reports.filter((r) => r.level === "high");
const total = reports.reduce((n, r) => n + r.issues, 0);
console.log(`${docs.length} docs, ${total} issues, ${blockers.length} high-risk`);
```

These three lines contain no second model call. `filter`, `reduce`, a threshold check—all deterministic code. Same 12 reports in, same one-line conclusion out every time. That's the benefit of keeping aggregation in code: the 12 fan-out calls are non-deterministic, the merge step is deterministic. When something breaks, you know which side to suspect.

`Promise.all` has a temperament to know up front: if any one promise rejects, the whole `await` rejects, and even if the other 11 finished, you can't get their results. Review 12 documents, document 7 hits a 500 and the whole batch is wasted—the other 11 ran for nothing. That cost is unreasonable. Either switch to `Promise.allSettled`, or like this lesson's exercise, wrap each worker in `try/catch` to collect failures as records—every fan-out path should be able to fail independently.

## Why parallelization isn't just about speed

If parallelization were only "same thing done sooner," it would be a performance trick, not worth its own lesson. The real reason sits on the context side.

Anthropic's retrospective on their multi-agent research system is blunt: the essence of search is compression—distilling insights from a vast corpus. Subagents facilitate compression by operating in parallel with **their own context windows**, exploring different aspects of the question simultaneously before condensing the most important tokens for the lead research agent. Each subagent also provides separation of concerns—distinct tools, prompts, and exploration trajectories—which reduces path dependency and enables thorough, independent investigations[^S2].

Break those two sentences apart. Fan-out buys at least three things:

1. **Window capacity**. They wrote this architectural judgment as a conclusion: distributing work across agents with separate context windows adds capacity for parallel reasoning[^S2]. Lesson 1 covered this: what really hits the ceiling isn't window size, it's "one loop" as a shape. Fan-out works around single-window limits not by stretching the window but by opening several.
2. **Separation of concerns**. Three subagents carrying different tools and prompts naturally won't pollute each other.
3. **Reduced path dependency**. In one loop, step 3's judgment gets biased by step 2's phrasing. Three independent trajectories don't share the same bias.

Current platform docs offer the same direction: multiple agents can act in parallel with their own isolated context, which helps improve output quality and can also improve time to completion[^S6]. Note quality comes first.

On the speed side they gave a number, with context that must be copied together: their early agents executed sequential searches, which was painfully slow. For speed, they introduced two kinds of parallelization: (1) the lead agent spins up 3-5 subagents in parallel rather than serially; (2) the subagents use 3+ tools in parallel. These changes **cut research time by up to 90% for complex queries**[^S2].

This number must be used with its three qualifiers: it's a **latency** number, not a quality number; it's limited to **complex queries** (simple queries don't have much to parallelize); it comes from **their own system**. How much you save by swapping `for` for `Promise.all` depends on how much of your subtasks are truly independent, how slow each path is, and where concurrency gets bottlenecked—the rest of this lesson is about that.

```agentmentor-check
{
  "id": "orc-zh-03-unbounded-fanout",
  "label": "Judge what happens with an unbounded 200-way fan-out",
  "prompt": "The team needs to review 200 documents. A colleague read the parallelization section, wrote `const reports = await Promise.all(docs.map((d) => runAgent(client, reviewTask(d))))`, sending all 200 at once, reasoning 'they're independent anyway, more parallel is faster.' What happens when this code goes live?",
  "whyHere": "Just finished covering the three benefits of fan-out, exactly when it's easiest to read 'subtasks are independent' directly as 'unlimited parallelization is fine,' so learners need to check whether they're accounting for concurrency ceilings and aggregation cost",
  "mode": "single",
  "choices": [
    {
      "id": "a",
      "text": "Independence is correct, 'all at once' is wrong: real products cap concurrency—this needs a concurrency pool. 200 detailed results flooding the aggregation side will also blow up context; only pass references",
      "correct": true,
      "feedback": "Two things need fixing. Concurrency side: Claude Code fails with 'Concurrent subagent limit reached' when 20 subagents are running, and the error explicitly tells the model not to retry; workflow runtime supports up to 16 concurrent agents (fewer when CPU is limited), capped at 1,000 agents per run; Managed Agents supports a maximum of 25 concurrent threads. Three different teams, three different implementations, all set ceilings—that itself is the answer: unbounded fan-out isn't faster, it maxes out rate limits, memory, and batch-failure risk all at once. Plus `Promise.all` rejects the whole await if any one path rejects—even if the other 199 finished, you can't get their results. Aggregation side: subagent results return to the main conversation; many subagents each returning detailed results consumes significant context. 200 detailed reports flooding back will burn up the time saved by fan-out. Correct shape: concurrency pool throttling + each path stores output in an external system, passing only lightweight references back to the coordinator."
    },
    {
      "id": "b",
      "text": "No problem. Since 200 documents are independent, results won't pollute each other. Higher concurrency means shorter total time. 200 paths vs 3 paths is just a speed difference. Re-run failures individually",
      "correct": false,
      "feedback": "Independence only guarantees 'results compute correctly,' not '200 requests can send successfully.' 200 concurrent paths will hit rate limits together, occupy memory together, and fail in your face together, and `Promise.all` semantics mean one rejection rejects the whole—even if the other 199 finished, their results are lost. Reference real products: Claude Code defaults to 20 concurrent subagents, workflow runtime maxes at 16 concurrent agents with 1,000 per run ceiling, Managed Agents maxes at 25 concurrent threads. These ceilings were all taught by real traffic. Then aggregation: 200 detailed reports returning to the main flow is enough to exhaust context just in that step."
    },
    {
      "id": "c",
      "text": "Parallelization shouldn't be used at all. At 200 scale, stick to old-fashioned serial queueing. Slow but steady, at least they won't all break together. Stability trumps everything",
      "correct": false,
      "feedback": "Retreating to serial forces a shape that should parallelize into a queue. These 200 documents meet parallelization's conditions—divided subtasks can parallelize for speed, independence holds—serial just means waiting for nothing. The correct convergence point is in the middle: bounded parallelization. Use a concurrency pool to cap simultaneous paths to a number you can afford (3, 8, 16—depends on quotas and machines), wrap each path in `try/catch`, store output in external files, and pass only references and one-line summaries back to aggregation. Get the speedup without pushing the system to the cliff edge."
    }
  ]
}
```

## First cost: aggregation eats back the context you saved

When fanning out, everyone watches "how many paths run at once." Crashes usually happen on the way back.

Claude Code's subagent docs put this cost on the table: when subagents complete, their results return to your main conversation. Running many subagents that each return detailed results can consume significant context[^S4]. Subagents exist to **protect** main conversation context—keeping exploration and implementation out of your main conversation[^S4]—but once what returns is too heavy, protection reverses.

The same retrospective gave a remedy, and gave it specifically: rather than requiring subagents to communicate everything through the lead agent, implement artifact systems where specialized agents can create outputs that persist independently. Subagents call tools to store their work in external systems, then pass **lightweight references** back to the coordinator[^S2].

Translate that into a mantra for writing code: **pass references, not payloads**.

```javascript
// Aggregation side receives not 12 reports, but 12 records like this
{ id: "api-auth", file: "out/api-auth.md", summary: "Conclusion: 3 issues, risk level high" }
```

How big is the difference? This lesson's exercise script gives you a real number: 8 outputs on disk total 1,668 bytes, what returns to aggregation is only 643 bytes, and this ratio widens rapidly as documents grow—reports ten times longer, what passes back is still a one-line summary plus a path. Whoever needs the full text, read it from the path.

This path buys other things incidentally. Workflow docs mention that the runtime tracks each agent's result as the run progresses, which is what makes a run resumable within the same session. A workflow that fans work out across many small agents therefore preserves more progress than one long agent[^S5]. Outputs land outside, leaving a record line by line—the record-keeping part is the same principle as observability in Course 11 of this series. The "interrupted mid-run doesn't start from scratch" part is Course 9's territory, "making long tasks survive interruption."

## Second cost: concurrency is never unbounded

The moment you write `Promise.all(docs.map(...))`, you're actually saying "concurrency = array length." Array is 12, fine. Array is 200, that's another story.

Look at three real products' ceilings:

- Claude Code: by default, when 20 subagents are running in a session, spawning another with the Agent tool fails with `Concurrent subagent limit reached`, and the error message explicitly tells Claude not to retry[^S4].
- Claude Code workflow runtime: up to 16 concurrent agents, fewer when Claude Code has fewer CPUs available (including inside a CPU-limited container)[^S5]; 1,000 agents total per run[^S5].
- Managed Agents: a maximum of 25 concurrent threads is supported. The coordinator can call multiple copies of a single agent in the roster, creating multiple threads associated with one agent[^S6].

Three different teams, three different implementations, all set ceilings, and the numbers aren't even large. This fact itself is teaching material: **unbounded fan-out is an accident, not an optimization**. (Lesson 4 will cover a real crash case—early agents would spawn 50 subagents for a simple query[^S2]. By then you'll find that "who decides how many to spawn" is trickier than "what's the ceiling.")

The cheapest throttling is batching:

```javascript
// Batch: 3 per batch, batches serial
const reports = [];
for (let i = 0; i < docs.length; i += 3) {
  const batch = docs.slice(i, i + 3);
  reports.push(...(await Promise.all(batch.map((d) => runAgent(client, reviewTask(d))))));
}
```

Works, but has a bucket effect: each batch waits for its slowest to finish before starting the next. Of three documents, one is especially long, the other two paths just wait.

A concurrency pool doesn't have this problem—fix N "lanes," each lane grabs the next item from a shared cursor as soon as it finishes current work, always N in flight:

```javascript
async function pool(items, limit, worker) {
  const results = new Array(items.length);
  let cursor = 0;
  const lanes = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (true) {
      const i = cursor++;
      if (i >= items.length) return;
      results[i] = await worker(items[i], i);
    }
  });
  await Promise.all(lanes);
  return results;
}
```

Ten-ish lines, no dependencies. `cursor++` is safe in single-threaded JavaScript—synchronous code between two `await`s can't be interrupted. No risk of two lanes grabbing the same index. In the exercise you'll add `try/catch` so single-path failure doesn't drag down the whole batch.

What should `limit` be? No universal answer. It's the intersection of your API quota, downstream service capacity, and single-path duration. But filling in a specific number versus not filling one is two kinds of engineering.

## Third cost: voting pays N× tokens

Voting's definition is one sentence: running the same task multiple times to get diverse outputs[^S1]. Code is short:

```javascript
const angles = ["legal perspective", "security perspective", "brand perspective"];
const opinions = await Promise.all(
  angles.map((angle) => runAgent(client, reviewTask(doc, angle))),
);

// Threshold written in code: if 2 of 3 votes flag issues, reject
const flagged = opinions.filter((o) => o.verdict === "has issues").length;
const decision = flagged >= 2 ? "reject" : "pass";
```

Aggregation here is still done by code—`filter` plus a threshold. How many votes set the threshold is a product decision, hardcoded, changeable anytime, auditable. It shouldn't be left to the model's improvisation. High-risk scenarios can tune the threshold to "one veto," low-risk scenarios can require all three votes to block.

The accounting is straightforward: **vote N times, pay N× tokens**. Put this money alongside Lesson 1's multiplier—by their data, agents use about 4× the tokens of chat interactions, multi-agent systems about 15×. Multi-agent systems therefore need tasks valuable enough to cover the cost of this performance boost[^S2]. Three-perspective voting's price tag is that 4× for single-agent times 3 more. Don't multiply 15× by 3—that 15× already includes fan-out accounting.

So voting isn't "run a few more times for peace of mind." It must buy something concrete. Workflow docs are clearer: moving the plan into code also lets a workflow apply a repeatable quality pattern, not just run more agents—it can have independent agents **adversarially review** each other's findings before they're reported, or draft a plan from several angles and weigh them against each other, so you get a more trustworthy result than a single pass[^S5].

"Independent agents review each other" is the same rule as Course 10 in this series: the worker doesn't judge their own work. Having the model self-check in the same context, it will mostly defend what it just output. Switch to an independent context path, switch prompts, then it might actually catch problems. What voting and peer review buy isn't "majority," it's **independence**.

Note a boundary: three calls to one model aren't three independent judges. They share the same training biases. Voting can filter sampling noise and single-pass attention gaps. It can't filter systematic biases. Don't treat it as a mechanism that produces truth just by voting.

## Measure: independence is a prerequisite, not optional

All this lesson's benefits rest on one prerequisite that's appeared repeatedly and is worth pulling out: subtasks must truly not depend on each other.

Claude Code docs, when discussing multiple subagents investigating simultaneously, specifically add a sentence: each subagent explores its area independently, then Claude synthesizes the findings. **This works best when the research paths don't depend on each other**[^S4]. The reverse condition is written in the multi-agent retrospective: some domains require all agents to share the same context or involve many dependencies between agents, and these domains are not a good fit for multi-agent systems today. For instance, most coding tasks involve fewer truly parallelizable tasks than research, and LLM agents are not yet great at coordinating and delegating to other agents in real time[^S2].

To judge whether a proposal should parallelize, ask one question: **Does path 2 need to wait for path 1's conclusion to know what to do?**

- Need to wait → this isn't parallelization's shape. Previous step's output is next step's input—that's Lesson 2's chaining.
- Don't need to wait → sectioning.
- Same thing, want several independent judgments → voting.

The first case is easiest to blur: there's a dependency but you force fan-out because "it'll probably work out." Result is several agent paths each writing their own conclusions, unaware of others. At aggregation you manually smooth contradictions—the time saved is all spent smoothing, plus you paid extra tokens.

## Boundary: this lesson's decomposition is predefined

Pin down one word—it's Lesson 4's entrance.

In all this lesson's examples, **who defined the subtasks**? You did. Twelve documents, you read them from the directory. Three perspectives, you hardcoded them in an array. Before the code runs, how many paths fan out and what each does is all settled. This is called **predefined** decomposition.

Its opposite: the model decides how many parts and what each does. The original source treats this difference as the key watershed between two patterns—in the orchestrator-workers workflow, a central LLM dynamically breaks down tasks, delegates them to worker LLMs, and synthesizes their results[^S1]. Though topographically similar to parallelization, the **key difference is its flexibility—subtasks aren't pre-defined, but determined by the orchestrator based on the specific input**[^S1].

So the boundary between the two isn't "how many paths run at once," but "who wrote that array." Array is yours, it's this lesson. Array is generated by the model on the spot, it's the next lesson. Last lesson's routing already handed one decision to the model (which branch). Next lesson hands over a bigger piece: decomposition itself.

## 💻 Exercises

<!-- exercises -->

### Level 1: Five fan-out proposals, judge shape and find traps

Five proposals are on your desk. Give each a category—**sectioning** / **voting** / **should not parallelize**—and explain why. For those judged as sectioning or voting, add two handling notes: how to set concurrency, how to aggregate.

1. Twelve independent product docs, each needs the same review process.
2. A high-risk piece of copy about to go on the homepage, needs evaluation from legal, security, and brand perspectives.
3. A database migration script requiring backup → alter schema → backfill data, three steps in strict order.
4. Forty modules need technical debt assessment, but the evaluation rules require each module to reference conclusions from the previous module, gradually converging to a unified standard.
5. A user input needs classification as violating content or not, misclassification cost is high, want confidence higher than a single call.

<!-- rubric -->

- All five given clear categories, judgment basis lands on the "does path 2 need to wait for path 1's conclusion" question, not based on scale or intuition
- Items 3 and 4 both judged as should not parallelize, and item 4's reasoning must point out it's **conclusion dependency** (not "too many items" or "fear of errors")
- Every item judged as sectioning or voting (items 1, 2, 5) writes concurrency handling (set ceiling / batch or pool) and aggregation handling (pass references or return only structured conclusions), both required
- Item 5 must mention threshold defined by code, and explain high-risk scenarios should have stricter thresholds
- Point out voting's cost is N× tokens, can't vote indiscriminately on all inputs

<!-- answer -->

Reference answer:

**Item 1 — Sectioning.** Twelve docs don't reference each other, doc 3's conclusion doesn't need anything from doc 2—typical independent subtasks in parallel[^S1]. Concurrency handling: don't write `Promise.all(docs.map(...))` sending all 12 at once, use a concurrency pool capped at 3-5 paths. Twelve looks manageable, but the same code tomorrow will run on 200, ceiling should be there from day one. Aggregation handling: each review report lands in `out/<id>.md`, what returns is only file path plus one-line conclusion summary—many subagents each returning detailed results consumes significant context[^S4], correct approach is store output in external systems, pass only lightweight references back to coordinator[^S2]. Trap: `Promise.all` one rejection loses all other results, each path needs individual `try/catch`, failed ones logged for separate re-run.

**Item 2 — Voting.** Same copy run three times, each with a different perspective, exactly "running the same task multiple times to get diverse outputs"[^S1]. And for complex tasks with multiple considerations, each handled by a separate call with focused attention generally performs better[^S1], stronger than cramming three perspectives into one prompt. Concurrency handling: three paths can send together directly, scale is small enough to skip pooling. If batch-processing many pieces of copy, it's "outer sectioning × inner voting," outer layer must throttle or concurrency is copy count times 3. Aggregation handling: three opinions return, code judges—for example if 2 of 3 votes flag issues, reject, threshold hardcoded. Trap: three calls from one model share the same biases, voting suppresses sampling noise but not systematic bias. Also this pays 3× tokens per run, only enable for high-risk copy, don't enable at full scale.

**Item 3 — Should not parallelize.** Backup → alter → backfill, next step's prerequisite is previous step's success, pure sequential dependency, belongs to Lesson 2's chain shape. Should add programmatic gates between stages (don't proceed if backup fails). Forcing fan-out has consequences worse than slow: data corruption.

**Item 4 — Should not parallelize.** This is the trickiest trap: forty modules sounds like sectioning, but evaluation rules require each module to reference the previous module's conclusion, building dependency between subtasks. The wording is explicit: multiple subagents investigating simultaneously works best when research paths don't depend on each other[^S4]. Domains requiring shared context or many dependencies between agents are not a good fit for multi-agent today[^S2]. Viable fix is first fix requirements: if "unified standard" can be set by one call first, then passed as fixed input to 40 paths, dependency is broken and step two can parallelize. If standard must evolve one by one, can only be serial.

**Item 5 — Voting, with threshold.** Need higher confidence judgment, exactly parallelization's second use case: multiple perspectives or attempts are needed for higher confidence results[^S1]. Concurrency handling: 3 to 5 paths send together, no more—beyond this diminishing returns, tokens grow linearly. Aggregation handling: code tallies votes, high-risk scenarios use "one veto" not simple majority, borderline samples go to human review. Trap: calculate cost before going live—agents use about 4× chat tokens, multi-agent systems about 15×, these systems need task value high enough to cover the cost[^S2]. Violation judgment only votes on gray-area samples, obviously compliant inputs get single call.

<!-- hint -->

Ask each item one question: does path 2 need to wait for path 1's conclusion to know what to do? If wait is required, it's not parallelization's shape, having dozens or hundreds of items doesn't change this. Item 4's "40 modules" is a distractor, what really decides the answer is the "reference previous module's conclusion" half-sentence.

<!-- hint -->

"Run the same task many times" and "run many different tasks once each" are two different variants, don't mix. Also, the two items judged as voting owe one more thing: how many votes count? This threshold must be written in code, and the higher the misclassification cost, the stricter the threshold should be than simple majority.

### Level 2: Write a bounded fan-out, run it yourself

Write a runnable `fanout.mjs` (Node 18+, no dependencies), requirements:

- Built-in stub `client`, fakes `messages.create`, offline, each item's duration and conclusion hardcoded, so two runs can compare character by character
- 8 items, each item handled by one `runAgent()` call (reuse Lesson 2's wrapper shape)
- Implement your own concurrency pool, cap at 3, workers running simultaneously must not exceed 3; single-path failure can't drag down the whole batch
- Each worker writes output to a file in `out/` directory; aggregation only collects file paths and one-line summaries, doesn't bring report bodies back
- Finally print a summary table (item / duration / conclusion / result file), and print comparison of bytes-on-disk vs bytes-returned
- Judgment path with exit codes: all success `exit 0`, any failure or empty result file `exit 1`
- After running, change concurrency cap from 3 to 8 and run again (edit code or use env var), verify completion order changed but result set didn't. To make order actually change, hardcoded durations **don't make them increase by array order or all equal** (like 120/40/200/60/30/150/80/45), otherwise completion order under both concurrency levels happens to be the same

<!-- rubric -->

- Concurrency pool is self-written (fixed N lanes + shared cursor, or equivalent), no third-party dependencies introduced, and workers running simultaneously indeed don't exceed `limit`
- Each worker has internal `try/catch` (or equivalent handling), when one path fails others still complete and enter summary table
- Output actually written to files under `out/`, returned object only has lightweight fields like path and summary, no report body
- Judgment branches both paths hold: all success `process.exit(0)`, any failure or empty file `process.exit(1)` and print which one failed
- Both runs' outputs are actually from real execution, completion orders differ (prerequisite: duration arrangement satisfies above condition), result set fingerprints match, and can explain why order changes while results don't

<!-- answer -->

Reference answer: complete script below, this lesson's author ran it on Node, the two output blocks below are directly pasted run results.

```javascript
// fanout.mjs — Sectioning fan-out: 8 items, concurrency cap 3, aggregation passes references only
// Usage: node fanout.mjs          default concurrency 3
//        LIMIT=8 node fanout.mjs  concurrency 8
import { mkdir, writeFile, rm, stat } from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";

const OUT_DIR = "out"; // Relative path: returned references lighter, unaffected by run directory
const LIMIT = Number(process.env.LIMIT ?? 3);

// ---------- 1. Input: 8 independent items ----------
const DOCS = [
  { id: "api-auth", title: "API Authentication Guide" },
  { id: "billing-faq", title: "Billing FAQ" },
  { id: "onboarding", title: "Onboarding Guide" },
  { id: "webhook-guide", title: "Webhook Integration Guide" },
  { id: "rate-limit", title: "Rate Limiting Policy" },
  { id: "sdk-migration", title: "SDK Migration Guide" },
  { id: "error-codes", title: "Error Code Reference" },
  { id: "security-notes", title: "Security Best Practices" },
];

// ---------- 2. Stub client: fakes messages.create, offline ----------
// Each id's duration and conclusion hardcoded, so two runs compare identically
const FAKE = {
  "api-auth": { ms: 120, issues: 3, level: "high" },
  "billing-faq": { ms: 40, issues: 1, level: "low" },
  onboarding: { ms: 200, issues: 4, level: "medium" },
  "webhook-guide": { ms: 60, issues: 2, level: "medium" },
  "rate-limit": { ms: 30, issues: 0, level: "low" },
  "sdk-migration": { ms: 150, issues: 5, level: "high" },
  "error-codes": { ms: 80, issues: 2, level: "low" },
  "security-notes": { ms: 45, issues: 1, level: "medium" },
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function createStubClient() {
  return {
    messages: {
      async create({ messages }) {
        const last = messages[messages.length - 1].content;
        const id = /<doc id="([^"]+)">/.exec(last)?.[1];
        const f = FAKE[id];
        if (!f) throw new Error(`Stub client doesn't recognize item: ${id}`);
        await sleep(f.ms); // Fake network round-trip
        const findings = Array.from(
          { length: f.issues },
          (_, i) => `- Section ${i + 1}: Wording inconsistent with current API, needs review`,
        ).join("\n");
        return {
          stop_reason: "end_turn",
          content: [
            {
              type: "text",
              text: `# Review Report: ${id}\n\n## Findings\n${findings || "- None"}\n\nConclusion: ${f.issues} issues, risk level ${f.level}`,
            },
          ],
        };
      },
    },
  };
}

// ---------- 3. runAgent: Lesson 2 wrapper simplified (stub only does end_turn, tool branch omitted) ----------
async function runAgent(client, task) {
  const messages = [{ role: "user", content: task.prompt }];
  for (let turn = 0; turn < 8; turn++) {
    const res = await client.messages.create({
      model: "claude-sonnet-4-5",
      max_tokens: 2048,
      messages,
    });
    const text = res.content
      .filter((b) => b.type === "text")
      .map((b) => b.text)
      .join("\n");
    if (res.stop_reason === "end_turn") return text;
    messages.push({ role: "assistant", content: res.content });
    messages.push({ role: "user", content: "continue" });
  }
  throw new Error(`${task.id}: exceeded turn limit without convergence`);
}

// ---------- 4. Concurrency pool: cap LIMIT, no dependencies ----------
async function pool(items, limit, worker) {
  const results = new Array(items.length);
  let cursor = 0;
  const lanes = Array.from(
    { length: Math.min(limit, items.length) },
    async () => {
      while (true) {
        const i = cursor++;
        if (i >= items.length) return;
        try {
          results[i] = { ok: true, value: await worker(items[i], i) };
        } catch (err) {
          results[i] = { ok: false, id: items[i].id, error: String(err) };
        }
      }
    },
  );
  await Promise.all(lanes);
  return results;
}

// ---------- 5. One worker = one runAgent + one write to disk ----------
const completionOrder = [];

async function reviewOne(client, doc) {
  const t0 = Date.now();
  const report = await runAgent(client, {
    id: doc.id,
    prompt: `Review the following document, list places inconsistent with current API, final line starting "Conclusion:" gives issue count and risk level.\n\n<doc id="${doc.id}">${doc.title}</doc>`,
  });
  const file = path.join(OUT_DIR, `${doc.id}.md`);
  await writeFile(file, report, "utf8");
  const summary = report.split("\n").find((l) => l.startsWith("Conclusion:")) ?? "No conclusion";
  completionOrder.push(doc.id);
  // What passes back to coordinator is just this small chunk: reference + one-line summary
  return { id: doc.id, file, summary, ms: Date.now() - t0, bytes: Buffer.byteLength(report) };
}

// ---------- 6. Main flow ----------
const client = createStubClient();
await rm(OUT_DIR, { recursive: true, force: true });
await mkdir(OUT_DIR, { recursive: true });

const wallStart = Date.now();
const settled = await pool(DOCS, LIMIT, (doc) => reviewOne(client, doc));
const wallMs = Date.now() - wallStart;

const failed = settled.filter((r) => !r.ok);
const done = settled.filter((r) => r.ok).map((r) => r.value);

console.log(`Concurrency cap: ${LIMIT}  Items: ${DOCS.length}  Wall clock: ${wallMs}ms`);
console.log(`Completion order: ${completionOrder.join(" → ")}`);
console.log("");
console.log("Item             Duration Conclusion                 Result file");
console.log("-".repeat(78));
for (const d of DOCS) {
  const r = done.find((x) => x.id === d.id);
  if (!r) {
    console.log(`${d.id.padEnd(16)} ${"—".padEnd(8)} Failed                     —`);
    continue;
  }
  console.log(
    `${r.id.padEnd(16)} ${String(r.ms + "ms").padEnd(8)} ${r.summary.padEnd(26)} ${r.file}`,
  );
}
console.log("-".repeat(78));

const payload = done.reduce((n, r) => n + r.bytes, 0);
const carried = Buffer.byteLength(
  JSON.stringify(done.map((r) => ({ file: r.file, summary: r.summary }))),
);
console.log(`Output on disk: ${payload} bytes   Aggregation returned: ${carried} bytes`);

// Result set fingerprint: independent of concurrency, must match across runs
const digest = createHash("sha256")
  .update(done.map((r) => `${r.id}:${r.bytes}:${r.summary}`).sort().join("|"))
  .digest("hex")
  .slice(0, 12);
console.log(`Result set fingerprint: ${digest}`);

// ---------- 7. Judgment ----------
for (const r of done) {
  const s = await stat(r.file);
  if (s.size === 0) failed.push({ id: r.id, error: "Result file empty" });
}
if (failed.length > 0 || done.length !== DOCS.length) {
  console.error(`Judgment: failed ${failed.length} of ${DOCS.length}`);
  for (const f of failed) console.error(`  ${f.id}: ${f.error}`);
  process.exit(1);
}
console.log("Judgment: passed");
process.exit(0);
```

First run, concurrency 3:

```text
$ node fanout.mjs; echo "exit=$?"
Concurrency cap: 3  Items: 8  Wall clock: 275ms
Completion order: billing-faq → webhook-guide → api-auth → rate-limit → onboarding → error-codes → security-notes → sdk-migration

Item             Duration Conclusion                 Result file
------------------------------------------------------------------------------
api-auth         122ms    Conclusion: 3 issues, risk level high out/api-auth.md
billing-faq      42ms     Conclusion: 1 issues, risk level low out/billing-faq.md
onboarding       201ms    Conclusion: 4 issues, risk level medium out/onboarding.md
webhook-guide    62ms     Conclusion: 2 issues, risk level medium out/webhook-guide.md
rate-limit       31ms     Conclusion: 0 issues, risk level low out/rate-limit.md
sdk-migration    153ms    Conclusion: 5 issues, risk level high out/sdk-migration.md
error-codes      81ms     Conclusion: 2 issues, risk level low out/error-codes.md
security-notes   47ms     Conclusion: 1 issues, risk level medium out/security-notes.md
------------------------------------------------------------------------------
Output on disk: 1668 bytes   Aggregation returned: 643 bytes
Result set fingerprint: dd4a82283a3d
Judgment: passed
exit=0
```

Second run, concurrency changed to 8:

```text
$ LIMIT=8 node fanout.mjs; echo "exit=$?"
Concurrency cap: 8  Items: 8  Wall clock: 201ms
Completion order: rate-limit → billing-faq → security-notes → webhook-guide → error-codes → api-auth → sdk-migration → onboarding

Item             Duration Conclusion                 Result file
------------------------------------------------------------------------------
api-auth         123ms    Conclusion: 3 issues, risk level high out/api-auth.md
billing-faq      42ms     Conclusion: 1 issues, risk level low out/billing-faq.md
onboarding       200ms    Conclusion: 4 issues, risk level medium out/onboarding.md
webhook-guide    61ms     Conclusion: 2 issues, risk level medium out/webhook-guide.md
rate-limit       32ms     Conclusion: 0 issues, risk level low out/rate-limit.md
sdk-migration    151ms    Conclusion: 5 issues, risk level high out/sdk-migration.md
error-codes      81ms     Conclusion: 2 issues, risk level low out/error-codes.md
security-notes   45ms     Conclusion: 1 issues, risk level medium out/security-notes.md
------------------------------------------------------------------------------
Output on disk: 1668 bytes   Aggregation returned: 643 bytes
Result set fingerprint: dd4a82283a3d
Judgment: passed
exit=0
```

Three points worth comparing across runs:

1. **Completion order changed.** With concurrency 3, the first three items started first, whoever finished first freed a lane for item 4, order determined by "start time + individual duration." With concurrency 8, all eight started together, completion order is just duration from small to large (30 → 40 → 45 → 60 → 80 → 120 → 150 → 200 milliseconds). Fan-out completion order is non-deterministic. Any logic relying on "first back processed first" will crash here.
2. **Result set didn't change.** Summary table prints in `DOCS` fixed order, fingerprint both times is `dd4a82283a3d`. This is by design: the summary table iterates the input array not completion order, fingerprint `sort()`s before calculating. **Concurrency number is a performance parameter, shouldn't affect results**—make this a verifiable assertion so when changing concurrency you can change confidently.
3. **Aggregation only carried back under 40%.** 1,668 bytes on disk, 643 bytes returned. With 8 items that's already this much difference. Scale to 200 items, each report ten times longer, on-disk side swells to hundreds of KB, returned side is still one-line summary plus a path.

Deliberately misspell one item's id (say write `rate-limitX`) and run again, judgment path takes the other branch:

```text
$ node fanout.mjs; echo "exit=$?"
…(item-by-item and summary table omitted: rate-limitX line marked Failed, other 7 landed on disk)
Judgment: failed 1 of 8
  rate-limitX: Error: Stub client doesn't recognize item: rate-limitX
exit=1
```

Note the other 7 still completed and landed on disk—that's what the pool's `try/catch` bought. Switch to `Promise.all(DOCS.map(reviewOne))`, one rejection makes the whole `await` reject, can't get any of the other 7's already-completed results.

<!-- hint -->

Separate "concurrency cap" and "batch" as two things. Batching is "each batch waits for slowest to finish before next batch," concurrency pool is "fix N lanes, each grabs next as soon as it finishes current." When writing the pool use a shared `cursor` variable as a ticket dispenser, open N async functions each with a `while` loop pulling tickets—JavaScript is single-threaded, `cursor++` won't be interrupted.

<!-- hint -->

How to prove "result set doesn't change" to yourself? Don't eyeball-compare two screens of output. Compress each result into a short string (`id:bytes:summary`), sort then join and hash sha256 take first 12 characters print it. Order-independent fingerprint matches, that's real unchanged. Also remember summary table should iterate input array, not completion order, or the table itself will jitter with concurrency number.

<!-- /exercises -->

## Recap

- Parallelization's definition is "LLMs can sometimes work simultaneously on a task and have their outputs aggregated programmatically," two variants are sectioning (breaking a task into independent subtasks run in parallel) and voting (running the same task multiple times to get diverse outputs)[^S1]
- Its conditions are subtasks can parallelize for speed, or need multiple perspectives and attempts for higher confidence. For complex tasks with multiple considerations, handling each with a separate call for focused attention generally performs better[^S1]
- Fan-out buys more than speed: subagents operating in parallel with their own context windows explore and compress the most important tokens back, also bringing separation of concerns (different tools, prompts, exploration trajectories) and less path dependency[^S2]. Distributing work across agents with separate context windows adds capacity for parallel reasoning[^S2]
- The speedup number comes with context: their Research system introduced two-level parallelization (lead spins 3-5 subagents in parallel, subagents use 3+ tools in parallel), cutting research time by up to 90% for complex queries[^S2]—this is a latency number from their own system, not a quality number
- Aggregation is the first cost: subagent results return to main conversation, many subagents each returning detailed results consumes significant context[^S4]. Solution is artifact systems—subagents store output in external systems, pass only lightweight references back to coordinator[^S2]
- Concurrency is never unbounded: Claude Code defaults to 20 concurrent subagents, fails with explicit "don't retry" when exceeded[^S4]. Workflow runtime supports up to 16 concurrent agents (fewer when CPU-limited), capped at 1,000 per run[^S5]. Managed Agents maxes at 25 concurrent threads[^S6]
- Voting's cost is N× tokens, must be placed in that multiplier together—by their data, agents are about 4× chat, multi-agent systems about 15× chat. Task value must be high enough to cover it[^S2]. What it should buy is a repeatable quality pattern, like independent agents adversarially reviewing, or drafting from several angles then weighing[^S5]
- Independence is prerequisite: multiple subagents investigating simultaneously works best when research paths don't depend on each other[^S4]. Domains requiring shared context or many dependencies aren't a good fit today[^S2]—with dependency, return to chaining's shape
- This lesson's decomposition is all predefined (you wrote the array). Subtasks not predefined but determined by orchestrator based on specific input is the key difference between orchestrator-workers and parallelization[^S1], also next lesson's topic

[>> Lesson 4: Orchestrator-Workers: Making Decomposition Itself Dynamic](./04-orchestrator-workers.md)
