# Lesson 4: Orchestrator-Workers: Making Decomposition Itself Dynamic

> Learning goals:
> - Define orchestrator-workers and articulate the key difference from parallelization: topographically similar, but subtasks aren't predefined—the orchestrator decides them based on the specific input
> - Equip every dispatch with the four elements (objective, output format, guidance on tools and sources, task boundaries), and write the scaling rules ("how many to spawn, how much each can spend") into the prompt
> - Read a complete ledger from a real production system: where the 90.2% improvement shows up, why the 15× bill is the other half of the same mechanism, what synchronous execution blocks, and what three new costs asynchrony requires you to carry
>
> Prerequisites: Lessons 1–3 completed (this lesson picks up the unanswered question from the end of Lesson 3) | Previous: [<< Lesson 3](./03-parallelization.md) | Next: [Lesson 5 >>](./05-evaluator-and-graphs.md)

## The hole Lesson 3 left open

In Lesson 3 you wrote sectioning: split a task into independent subtasks, run them simultaneously, then aggregate the results with code. Look back at that code—where does the splitting logic live? It's in the array you hardcoded: `SECTIONS = ['security', 'performance', 'readability']`. The three branches were decided when you wrote the code; runtime just executes them.

This approach works under a rigid assumption: **you already know at write-time how to divide the task**. Code review fits that assumption because the review dimensions are stable—swap in a different repo and you still review the same aspects.

Now consider a different task:

> "Investigate the performance issues in this codebase."

How many pieces? Which pieces? You can't hardcode it. Maybe the bottleneck is in database queries, so you'd dispatch someone to scan ORM call sites. Maybe it's in a hot-path loop, so you'd send someone to read the profiler output. Maybe it's build artifact size, unrelated to runtime. Which files to change, which directions to investigate—you have to look at this specific repo, this specific problem description, before you know.

In other words: **the decomposition itself must be computed at runtime**. Your code no longer holds the "split into which pieces" decision; it only holds the "how to dispatch, how to collect, how to synthesize" mechanism. Who makes that decision? An LLM.

That's the fourth pattern.

## Definition, and how it differs from parallelization

The official source gives a one-sentence definition: in the orchestrator-workers workflow, a central LLM dynamically breaks down tasks, delegates them to worker LLMs, and synthesizes their results[^S1].

Three actions: **decompose, delegate, synthesize**. You already wrote the middle one—delegation—in Lesson 3; the fan-out code is nearly identical. What's truly new is the first action: decomposition moves from code to the model's hands.

The use-case statement is more precise: this workflow is well-suited for complex tasks where you can't predict the subtasks needed; the official example is coding—the number of files that need changing and the nature of each change likely depend on the task itself[^S1].

Then comes the comparison you must remember. The source says: though it's topographically similar to parallelization, the key difference is flexibility—subtasks aren't pre-defined, but determined by the orchestrator based on the specific input[^S1].

The term used is "topographically similar"—similar in shape. This phrasing is worth pausing on. If you diagram Lesson 3's sectioning and this lesson's orchestrator-workers, you'll draw nearly identical shapes: one node fans out to three, which then collapse back to one. The shape deceives. The difference isn't in the diagram; it's in **when that decision is made**:

| | Sectioning (Lesson 3) | Orchestrator-workers (this lesson) |
|---|---|---|
| Who decides the split | You, at code-writing time | The orchestrator LLM, at runtime |
| Subtask content | Hardcoded | May differ every run |
| Subtask count | Fixed | Determined by input |
| Can you write each branch's prompt in advance | Yes | No—you can only provide templates |

That last row is where the engineering pain sits. With sectioning, each branch's prompt is hand-crafted; you can iterate and tune, add examples for each dimension. Orchestrator-workers can't do that—dispatch prompts are generated on the fly by the orchestrator, and you can only control **the rules it follows when generating them**. The next two sections explain what those rules should contain.

First, let's write the mechanism as a skeleton. The code below is this lesson's own illustration; no official orchestration script exists in the primary materials, so don't treat this as a standard implementation:

```javascript
// This lesson's own illustration, not official code
async function orchestrate(userTask) {
  // 1) Orchestrator reads the task and computes how many dispatches, what each does
  const plan = await runOrchestrator({
    system: ORCHESTRATOR_PROMPT,   // scaling rules go here
    input: userTask,
    outputSchema: DispatchList,    // { dispatches: [{ objective, outputFormat, tools, boundaries, budget }] }
  });

  // 2) Each dispatch runs as a complete worker loop (Course 7's loop).
  //    dispatches.length is computed by the model, so the concurrency ceiling
  //    must be enforced by code—use Lesson 3's pool, never bare Promise.all
  const results = await pool(plan.dispatches, LIMIT, (d) =>
    runWorker({
      system: buildWorkerPrompt(d),  // four elements land here
      tools: d.tools,
      maxToolCalls: d.budget,
    })
  );

  // 3) Orchestrator synthesizes
  return runOrchestrator({ system: SYNTHESIS_PROMPT, input: results });
}
```

Compare this line-by-line with Lesson 3's fan-out code; you'll see only step 1 is added. That added step replaces the entire system's predictability—which is also why the accounting in later sections needs to be itemized.

## What a real production system looks like

You can memorize pattern definitions without knowing what they look like in production. This lesson has an advantage: Anthropic published an engineering retrospective on their Research feature, which is an orchestrator-worker system running in production. This section and the next few draw from that ledger.

Architecture quote: their Research system uses a multi-agent architecture with an orchestrator-worker pattern, where a lead agent coordinates the process while delegating to specialized subagents that operate in parallel[^S2].

What it looks like running: when a user submits a query, the lead agent analyzes it, develops a strategy, and spawns subagents to explore different aspects simultaneously[^S2].

Notice "analyzes it, develops a strategy"—that's the runtime decision mentioned in the previous section. The user asks something; the lead agent figures out on the spot how many directions to pursue and what each should investigate.

One more definitional quote worth extracting: a multi-agent system consists of multiple agents (LLMs autonomously using tools in a loop) working together[^S2].

That parenthetical should sound familiar. **A worker isn't anything new—it's the harness loop you wrote in Course 7 of this series.** Orchestrator-workers doesn't introduce a new execution unit; it introduces "one loop starting another batch of loops." You already know how to write that loop. This lesson teaches how to connect them.

The same retrospective explains why fan-out helps: the essence of search is compression—distilling insights from a vast corpus. Subagents facilitate compression by operating in parallel with their own context windows, exploring different aspects of the question simultaneously before condensing the most important tokens for the lead research agent. Each subagent also provides separation of concerns—distinct tools, prompts, and exploration trajectories—which reduces path dependency and enables thorough, independent investigations[^S2].

"Independent context windows"—you already ran those numbers in Lesson 3. Here it reappears in a different role: not just capacity, but **isolation**. Three investigations can't see each other's intermediate steps, so they won't get pulled off course by each other's mistakes.

## The ledger's front side: 90.2% and that 80%

The most famous number from this retrospective is also the most often misquoted. Here's the full quote: their internal evaluations show that multi-agent research systems excel especially for breadth-first queries that involve pursuing multiple independent directions simultaneously. They found that a multi-agent system with Claude Opus 4 as the lead agent and Claude Sonnet 4 subagents outperformed single-agent Claude Opus 4 by 90.2% on their internal research eval[^S2].

**You can't cite this number without every one of these conditions**:

- **On their internal research eval**—not a public benchmark, you can't reproduce it, and you don't know if it resembles your task distribution.
- **Opus 4 lead + Sonnet 4 subagents**—that specific pairing's result. A different model combination makes no promises.
- **Excels especially for breadth-first queries**—those requiring multiple independent directions simultaneously. Tasks with deep dependencies (each step waits for the previous conclusion) aren't in this statement's scope.

One more critical discipline: **this number compares multi-agent against single-agent, not "structured orchestration against loops."** You can't use it to argue "moving control flow into code beats letting the model run a loop"—that's a different claim, and none of the primary materials in this lesson compare them. This lesson repeatedly uses the "who holds the plan" axis, but there's no primary benchmark data on that axis, only engineering tradeoffs.

Why is multi-agent generally effective? The retrospective offers a less romantic explanation—note that its supporting analysis comes from a different eval, not the one producing the 90.2%: multi-agent systems work mainly because they help spend enough tokens to solve the problem. In their analysis of the BrowseComp evaluation (which tests the ability of browsing agents to locate hard-to-find information), three factors explained 95% of the performance variance, and token usage by itself explains 80%, with the number of tool calls and the model choice as the two other explanatory factors[^S2]. They say this finding validates their architecture that distributes work across agents with separate context windows to add more capacity for parallel reasoning[^S2].

The 95% and 80% figures only hold for the BrowseComp analysis; don't move them elsewhere as general conclusions.

But this mechanism explanation has a practical use: **if your task doesn't require that many tokens to solve, the basis for orchestrator-workers' gains disappears.** (This is an engineering judgment inferred from the mechanism statement, not a direct consequence of the 95%/80% numbers.) A question answerable with one doc lookup won't become more correct by dispatching three workers; it'll just become more expensive.

## The ledger's back side: 4× and 15×

These two numbers appeared in Lesson 1; here's the full quote. The same retrospective immediately continues: there is a downside—in practice, these architectures burn through tokens fast. In their data, agents typically use about 4× more tokens than chat interactions, and multi-agent systems use about 15× more tokens than chats. For economic viability, multi-agent systems require tasks where the value of the task is high enough to pay for the increased performance[^S2].

Place the numbers from both sections side by side: on one side, 90.2% (under specific conditions); on the other, 15×. The previous section made it clear that the performance gain mainly comes from spending tokens, so the higher bill isn't a side effect—it's **the other half of the same mechanism**.

How do you operationalize "the task value must match"? It's actually asking you to answer a business question before a technical one: if this investigation succeeds, what's it worth? If the answer is "saves an engineer half an hour," the 15× bill probably doesn't pay off. If the answer is "prevents a production incident," that's another story.

The retrospective also draws a harder boundary: some domains that require all agents to share the same context or involve many dependencies between agents are not a good fit for multi-agent systems today. For instance, most coding tasks involve fewer truly parallelizable tasks than research, and LLM agents are not yet great at coordinating and delegating to other agents in real time[^S2]. Conversely, they've found that multi-agent systems excel at valuable tasks that involve heavy parallelization, information that exceeds single context windows, and interfacing with numerous complex tools[^S2].

Two sentences here must be read together, or you'll misunderstand them: the official pattern source uses coding as an example of "subtasks can't be predicted"[^S1], while the multi-agent retrospective says most coding tasks involve fewer truly parallelizable tasks than research[^S2]. They don't contradict—they're talking about two different things. The first says **decomposition must be computed dynamically**; the second says **the computed subtasks may not all run simultaneously**. Dynamic decomposition doesn't imply inevitable parallelism. An orchestrator can perfectly well compute five subtasks, then run three sequentially and two in parallel.

## The four elements of delegation prompts

This is the engineering discipline you should remember most from this lesson; the original quote is brief:

> "Teach the orchestrator how to delegate. In our system, the lead agent decomposes queries into subtasks and describes them to subagents. **Each subagent needs an objective, an output format, guidance on the tools and sources to use, and clear task boundaries.** Without detailed task descriptions, agents duplicate work, leave gaps, or fail to find necessary information"[^S2].

Four elements, none optional:

**Objective**—what conclusion this worker should produce. Not "investigate performance," but "find the 3 runtime CPU hotspots with the highest self-time." The objective must be narrow enough to judge whether it was achieved.

**Output format**—what the returned artifact looks like. Fields, item count ceiling, sort order. This item directly determines how easy the orchestrator's synthesis stage is to write: if three workers return three prose paragraphs, synthesis can only rely on the model reading them again. If they return JSON conforming to the same schema, half the synthesis can be done in code.

**Guidance on tools and sources**—which tools it's allowed to use, where to look. This item is both cost control and drift prevention: if you don't give it a web search tool, it can't go search for something that doesn't exist.

**Task boundaries**—explicitly what it **shouldn't** do. This item is easiest to omit, and most directly determines whether workers collide. "Don't look in `src/server/`; that's another worker's territory"—a single sentence like that is more effective than any post-hoc deduplication.

The retrospective's failure case is nearly textbook: for instance, one subagent explored the 2021 automotive chip crisis while 2 others duplicated work investigating current 2025 supply chains, without an effective division of labor[^S2].

Three workers, two duplicating and one running to an irrelevant year—this is exactly what "duplicate work, leave gaps" looks like in concrete terms.

Bridging to what you've already learned: **Course 6 of this series, when teaching multi-agent collaboration, already broke these four items apart (calling them objective, scope, sources, and output format); Lesson 2 also mentioned them.** This lesson does what those two places didn't: put the four elements back in the position of **orchestrator-generated dispatches on the fly**—you no longer control each dispatch's content, only the rules the orchestrator follows when generating them. The four elements still work as a checklist: after writing a dispatch, count them one by one to confirm all four are present.

```agentmentor-check
{
  "id": "orc-zh-04-vague-dispatch",
  "label": "Three one-sentence dispatches, crashed",
  "prompt": "Your orchestrator split a supply chain investigation across three workers, sending each the same single sentence: 'Investigate supply chain issues.' After the run finishes, you discover: worker A and worker B returned reports with highly overlapping content, worker C went off to investigate an old crisis from years ago that's unrelated to the current situation you asked about. The token bill is three times over, but you got one usable conclusion. What should you do next?",
  "whyHere": "Four elements were just taught; scaling rules haven't been covered yet. Practice recognizing the root cause in a scene where you can only see symptoms.",
  "mode": "single",
  "choices": [
    {
      "id": "a",
      "text": "Add a deduplication step in the synthesis stage to merge the two overlapping reports into one, and have the orchestrator append a note that 'C's result is irrelevant, ignore it.'",
      "correct": false,
      "feedback": "This is putting a band-aid on symptoms. Deduplication can make the final report look clean, but the three token charges have already been spent, and the work that A and B overlapped on—the direction someone should have covered—is still missing. Post-processing can't fix failed division of labor."
    },
    {
      "id": "b",
      "text": "Equip each of the three dispatches with the four elements: their own objective, output format, guidance on tools and sources, and task boundaries.",
      "correct": true,
      "feedback": "Correct. One-sentence dispatches are exactly what it looks like when all four elements are missing. The official retrospective's prototype failure is nearly identical: one subagent explored an old crisis from years ago while two others duplicated current supply chain work, without an effective division of labor. The root cause is insufficient task descriptions, so agents duplicate work, leave gaps. The fix is in the same quote: objective, output format, guidance on tools and sources, clear task boundaries—equip all four, and the boundaries item should explicitly state 'don't touch the other two workers' territory.'"
    },
    {
      "id": "c",
      "text": "Replace the three workers with a more capable model, so they can judge for themselves what different directions to pursue.",
      "correct": false,
      "feedback": "Changing models can't fix the fact that the three workers each received the same single sentence—they can't see each other, so no matter how strong, each can only make its own reasonable guess about the same input, and collision probability won't drop. A later section will show that the retrospective also says agents struggle to judge appropriate effort for different tasks, so they embedded rules in the prompts. What's missing here is task descriptions, not model capability."
    }
  ]
}
```

## Scaling effort by complexity: writing allocation rules into the prompt

The four elements solve "what each worker does"; one question remains: **how many to spawn, how much each can spend**.

This set of numbers appeared in Course 6's opening; here it's used differently—not to judge whether to use multi-agent, but to write it into the orchestrator's prompt so it allocates quotas itself. The retrospective's diagnosis is blunt: agents struggle to judge appropriate effort for different tasks, so they embedded scaling rules in the prompts. Simple fact-finding requires just 1 agent with 3-10 tool calls, direct comparisons might need 2-4 subagents with 10-15 calls each, and complex research might use more than 10 subagents with clearly divided responsibilities[^S2].

One citation discipline about these numbers: **their identity is "rules they embedded in their own prompts," not industry standards, and not scales you should copy verbatim.** Your task distribution, tool speeds, and models all differ from theirs. What's truly portable is the practice itself—**write allocation rules explicitly into the orchestrator's prompt, rather than expecting the orchestrator to self-regulate**.

What happens if you don't write them? The retrospective provides the scene: multi-agent systems have key differences from single-agent systems, including a rapid growth in coordination complexity. Early agents made errors like spawning 50 subagents for simple queries, scouring the web endlessly for nonexistent sources, and distracting each other with excessive updates[^S2].

"Spawning 50 subagents for simple queries"—convert that using the previous section's ledger and you'll understand: by their data, multi-agent is about 15× the tokens of chat[^S2], so this kind of runaway fan-out pushes that multiplier much higher. Quota rules aren't penny-pinching; they're **the means of keeping cost and task value in the same order of magnitude**.

How do you write this rule into your own orchestrator prompt? Follow their shape and fill in your own scale: tier your tasks into a few levels, specify subagent count ceiling and per-subagent tool call ceiling for each tier, then add a clause like "if you exceed the ceiling, return current findings; don't continue." This can reduce the probability of runaway, but it's still just a prompt—for non-deterministic models, a ceiling written in the prompt is always only advice. The real gate is on the code side: the `LIMIT` in the skeleton's `pool`. The prompt layer handles "model self-awareness"; the code layer handles "fallback." You need both.

## Synchronous bottlenecks, and asynchrony's price

This section discusses problems the architecture hasn't solved today. The original text comes in two paragraphs.

First paragraph, current state: synchronous execution creates bottlenecks. Currently, their lead agents execute subagents synchronously, waiting for each set of subagents to complete before proceeding. This simplifies coordination, but creates bottlenecks in the information flow between agents. For instance, the lead agent can't steer subagents, subagents can't coordinate, and the entire system can be blocked while waiting for a single subagent to finish searching[^S2].

Three "can't do" items, each corresponding to a real loss:

- **Lead agent can't redirect mid-flight**—at minute 2 it can already tell worker C's direction is wrong, but it has to wait until the batch ends to do anything.
- **Subagents can't coordinate**—worker A already found something, worker B doesn't know, and might be re-searching it right now.
- **The entire batch is blocked by the slowest**—two workers finishing in 3 minutes will wait with one timing out at 25 minutes, until minute 25.

Second paragraph, the other path's cost: asynchronous execution would enable additional parallelism—agents working concurrently and creating new subagents when needed. But this asynchronicity adds challenges in result coordination, state consistency, and error propagation across the subagents[^S2].

Notice the tone of this sentence: the primary material **lists these three items as challenges**, not as solved problems. So this lesson won't give you "the officially recommended async orchestration scheme"—that doesn't exist. If you go async yourself, these three items are yours to carry:

- **Result coordination**: workers trickle back; "when are we done enough to start synthesis" is a judgment you must define.
- **State consistency**: the lead agent changed the investigation scope mid-flight; running workers still use the old scope; the two sides' premises have forked.
- **Error propagation**: one worker failed, but its intermediate output was already used to spawn new workers. Who in that chain should rerun, whose results are voided—this requires explicit rules.

This lesson's Level 2 exercise will ask you to give one concrete instance of each on a specific timeline.

## Emergent behavior, and the last mile

A few more engineering lessons from the same retrospective; each is short, but each is worth a production incident.

**Multi-agent systems have emergent behaviors, which arise without specific programming. For instance, small changes to the lead agent can unpredictably change how subagents behave. Success requires understanding interaction patterns, not just individual agent behavior**[^S2]. The same retrospective adds a harsher line: in traditional software, a bug might break a feature, degrade performance, or cause outages. In agentic systems, minor changes cascade into large behavioral changes, which makes it remarkably difficult to write code for complex agents that must maintain state in a long-running process[^S2].

Impact on your daily work: **change the orchestrator's prompt, and you must rerun the entire eval suite; you can't just check the orchestrator's own output**. Course 10's evaluation runway comes into play here—it's the only instrument you have for seeing whether a small change threw the subagents off course.

**The last mile often becomes most of the journey**: when building AI agents, the last mile often becomes most of the journey. Codebases that work on developer machines require significant engineering to become reliable production systems. The compound nature of errors in agentic systems means that minor issues for traditional software can derail agents entirely[^S2].

Two accompanying practices: they combine the adaptability of AI agents built on Claude with deterministic safeguards like retry logic and regular checkpoints[^S2]; they use rainbow deployments to avoid disrupting running agents, by gradually shifting traffic from old to new versions while keeping both running simultaneously[^S2].

Rainbow deployments—this ties back to a problem mentioned in Course 9's opening when using deployment updates as a crash scenario: a normal web service restarts, users retry once and it's fine. An agent that's been running for 20 minutes gets interrupted by a restart, and you've lost 20 minutes of work plus the tokens already spent. **Deploying long-running tasks isn't the same as deploying stateless services.**

## Calibration: this is the most expensive of the five patterns

At this point you've seen four of the five patterns. Ranked by cost, orchestrator-workers is the most expensive so far: on top of parallelization's overhead, it adds another "have the model compute the split" invocation, plus the risk of "the split might be computed incorrectly."

So before you start, ask three questions in order:

**First, can the split be hardcoded?** If yes, go back to Lesson 3 and use sectioning. In sectioning, each branch's prompt is hand-polished; in orchestrator-workers, dispatches are generated on the fly by the model—the former has a higher quality ceiling and is easier to debug. **If you can predefine it, don't make it dynamic.**

**Second, is this task worth that much money?** By their data, multi-agent is about 15× the tokens of chat[^S2], and for economic viability, the task value must be high enough to pay for the increase[^S2]. This is a business judgment, not a technical one, but it must be made before writing code.

**Third, if uncertain, measure first.** The official source's closing stance on the entire pattern set is: these building blocks aren't prescriptive. The key to success is measuring performance and iterating on implementations; you should consider adding complexity only when it demonstrably improves outcomes[^S1]. Course 10 gave you that runway—first run your real task set with a single loop, get a baseline, then judge whether orchestrator-workers lifts it. Without a baseline, "feels better" and "spent 15× to get the same result" look identical to you.

This lesson has only covered "dispatch out, collect back." What if the returned work is low quality—should another agent review it, and how do you combine these four patterns—that's Lesson 5's content.

## 💻 Exercises

<!-- exercises -->

### Level 1: Rewrite one-sentence dispatches into three qualified dispatches

A team needs to investigate performance issues in a library. The orchestrator sent three workers the same single sentence:

> "This library seems slower recently; go investigate."

Three reports came back: two with highly overlapping content, the third about build speed—no one touched runtime.

Given environment (no code, prompts only):

- Repo structure: `src/core/` (algorithms and data structures), `src/server/` (request handling paths), `profiles/latest.cpuprofile` (an already-generated CPU profile)
- Workers have only three tools available: `read_file`, `grep`, `read_profile`
- None of the three workers may modify code

Your task:

1. Rewrite that sentence into **three** dispatches, each with all four elements: objective, output format, guidance on tools and sources, task boundaries. The three territories must not overlap—you should be able to explain in one sentence "why worker B can't return the same thing as worker A."
2. Add **one line** of quota rationale for the whole batch: how many workers to spawn, per-worker tool call ceiling, which tier you're comparing to, and explain that tier's identity.

<!-- rubric -->

- [ ] Three dispatches, each pointing out where all four elements appear; any dispatch missing any element is unqualified
- [ ] The three **objectives** don't overlap, and each is narrow enough to judge achievement (not "look at performance" scale)
- [ ] **Output format** is programmatically mergeable: fixed field names, item count ceiling; ideally all three use the same schema so synthesis can do half the work in code
- [ ] **Tools and sources guidance** specifies concrete paths or files, not "use whatever tools you need"
- [ ] **Task boundaries** include at least one "don't do X" item, and at least one explicitly blocks another worker's territory
- [ ] The quota line gives: worker count, per-worker tool call ceiling, which tier it compares to, and states that this scale is rules one team embedded in their own prompts, not universal standards
- [ ] The quota line includes a wind-down clause like "if you exceed the ceiling, return current findings"
- [ ] Disqualifying signals: the three dispatches are actually the same sentence rephrased; or relying on "add a final deduplication step" to cover for division of labor

<!-- answer -->

**Dispatch A (profile hotspots)**

- Objective: From the existing CPU profile, find the 3 functions with the highest self-time percentage, and provide their source code locations.
- Output format: JSON array, max 3 items, each `{ "file": string, "line": number, "self_time_pct": number, "reason": string }`, sorted by `self_time_pct` descending.
- Tools and sources: Only use `read_profile` to read `profiles/latest.cpuprofile`; use `read_file` to open matched source files and confirm line numbers. Don't use `grep` for full-repo scans.
- Boundaries: Don't modify any code; don't go into `src/server/` for request path analysis (that's B's task); don't evaluate algorithmic complexity (that's C's task); if you spot a suspected bug, just note it in `reason`, don't expand.

**Dispatch B (repeated I/O on request paths)**

- Objective: On the request handling paths in `src/server/`, find data source calls that are read repeatedly within a single request (the same key/query read multiple times).
- Output format: Same JSON schema, max 5 items; fill `self_time_pct` with `null` if not applicable; `reason` must state the object being repeatedly read and how many times within one request.
- Tools and sources: `grep` and `read_file`, paths restricted to `src/server/`. Don't read the profile (A is reading it).
- Boundaries: Don't modify any code; don't go into `src/core/`; don't judge algorithmic complexity; don't propose fixes, only report phenomena and locations.

**Dispatch C (super-linear algorithmic structures)**

- Objective: In `src/core/`, find structures that degrade super-linearly as input size grows—nested traversals, linear lookups inside loops, large objects repeatedly constructed in loop bodies.
- Output format: Same JSON schema, max 5 items; fill `self_time_pct` with `null`; `reason` should state the nesting structure and growth-rate expression (e.g., "outer loop over n, inner `indexOf` is also n, together n²").
- Tools and sources: `read_file` and `grep`, paths restricted to `src/core/`. Don't read the profile—avoid reaching the same batch of conclusions as A.
- Boundaries: Don't modify any code; don't go into `src/server/`; don't give rewrite proposals; don't run benchmarks.

**Quota rationale (one line)**

> This is a "multi-direction comparison" investigation, heavier than simple fact-finding but far short of needing 10+ subagents with explicit division of responsibilities, so spawn 3 workers with a 12-call ceiling each; if a worker exceeds the ceiling, return current findings and stop. The comparison tier is the public retrospective's "direct comparisons might need 2-4 subagents with 10-15 calls each"—that's rules they embedded in their own prompts, not an industry standard; I'm just borrowing its order of magnitude.

**Why this split**: the three dispatches are divided by **evidence source** (profile / server-side call sites / core algorithm structure), not vague dimensions like "three aspects of performance." Non-overlapping sources naturally produce non-overlapping conclusions. All three use the same schema, so the orchestrator's synthesis stage can first use code to merge by `file`, then have the model judge only the merged conflicts.

<!-- hint -->

Don't rush to write objectives. First ask yourself: **after these three reports come back, how will I combine them into one conclusion?** Output format's fields and item count ceiling should be reverse-engineered from that combination plan. If you can't figure out how to combine them, your objectives are split incorrectly.

<!-- hint -->

The half of boundaries easiest to omit is "don't do X." Check pairwise: between A and B, between B and C, between A and C—does each have a sentence explicitly blocking the other's territory? Can any two read the same file and reach the same conclusion?

### Level 2: Calculate the costs on a synchronous orchestration timeline

One orchestration ran like this (time starts when the lead agent sends dispatches):

- Minute 0: lead agent dispatches workers A, B, C simultaneously.
- Minute 3: A returns results.
- Minute 4: B returns results.
- Minute 25: C never returned; worker-side 25-minute timeout hits, C is judged as timed out, returns nothing.
- Minute 25: this batch is finally done; lead agent begins synthesis.

The lead agent **synchronously** executes subagents: it waits for the entire batch to complete before continuing.

Answer three things (no code):

1. **Calculate the wait waste for this batch**. Give at least three perspectives with their formulas.
2. **Point out three things the lead agent can't do under the synchronous model**, and anchor each to a specific moment on this timeline.
3. **If switched to async, what three new costs must you carry**, and give one concrete manifestation of each on this timeline.

<!-- rubric -->

- [ ] Question 1 gives at least three perspectives with self-consistent formulas: latency perspective (entire batch 25 min vs. 4 min without C; C alone added 21 min), idle output perspective (A idle 22 min + B idle 21 min = 43 min), consumption perspective (3 + 4 + 25 = 32 worker-minutes, C's 25 produced nothing, ~78%)
- [ ] Explicitly states the lead agent itself was blocked by the sync barrier from minute 4 to minute 25 for 21 minutes: holding two complete results but unable to act
- [ ] Question 2's three items match: **can't redirect subagents mid-flight**, **subagents can't coordinate with each other**, **entire system blocked by the slowest one**; each anchored to a specific moment on the timeline, not just restating definitions
- [ ] Question 3's three costs match: **result coordination**, **state consistency**, **error propagation across subagents**; each paired with a concrete manifestation on this timeline
- [ ] Doesn't write async as "has an official solution, just follow it"—primary materials list these three as challenges
- [ ] Disqualifying signals: only answers "sync is slow, go async"; or calculated numbers contradict each other (e.g., says entire batch finishes at 4 min, also says A idle 22 min)

<!-- answer -->

**1. Wait waste, three perspectives**

- **Latency perspective**: entire batch wall-clock = 25 minutes, determined by the slowest worker C. If C didn't exist, this batch could finish at minute 4. So C alone added `25 − 4 = 21` minutes of latency.
- **Idle output perspective**: A's result has been sitting unused since minute 3, sitting for `25 − 3 = 22` minutes; B's result sat for `25 − 4 = 21` minutes. Total `22 + 21 = 43` minutes of "completed but unusable." The lead agent itself is also blocked during this window: from minute 4 to minute 25, 21 minutes total, it holds two complete results but can't start synthesis, can't redirect, can't report early.
- **Consumption perspective**: the three workers actually ran `3 + 4 + 25 = 32` worker-minutes, of which C's 25 minutes produced nothing due to timeout, accounting for `25 ÷ 32 ≈ 78%`. In other words, over three-quarters of this batch's execution time produced no usable output—and the corresponding tokens are still charged.

**2. Three things the lead agent can't do under the synchronous model**

- **Can't redirect subagents mid-flight**. Suppose the lead agent already sees from A and B's results at minute 6 that C's direction is probably a dead end; it still can't send C any instruction, can't stop it, can't change its topic. It can only wait until minute 25.
- **Subagents can't coordinate with each other**. A returned a key clue at minute 3 that C desperately needs—but C can't see it. During C's 25 minutes, it might be re-searching what A already investigated, with no mechanism to know.
- **Entire system blocked by the slowest one**. On this timeline, two workers finishing within 4 minutes wait alongside one timing-out worker until minute 25. The batch's latency equals the slowest member's latency, regardless of how fast the other two ran.

**3. Switching to async, three new costs to carry**

- **Result coordination**. After going async, A comes back at minute 3, B at minute 4, C might never come back. "When are we done enough to start synthesis" no longer has a natural answer—you must define it yourself: wait for a fixed timeout? Proceed after collecting 2? Or incrementally update conclusions each time one arrives? Concrete manifestation on this timeline: at minute 4 you're holding two results; should synthesis start now? The code must have an explicit criterion.
- **State consistency**. Async's benefit is that the lead agent can narrow the investigation scope at minute 6 based on A and B's results. But C is still running under the old scope from minute 0. If C actually returns a result at minute 20, that result is built on a premise that's been overturned—you need a way to identify and mark it, or it will enter synthesis as "a legitimate result."
- **Error propagation across subagents**. Async means the lead agent can dispatch D and E at minute 8 based on C's intermediate output. After C times out at minute 25, do D and E's results still count? They're built on an investigation that never finished. Who should rerun, whose results are voided, how far does failure propagate along this spawn chain—the synchronous model doesn't have this problem (C's failure is just one empty result); async requires an explicit rule set.

Primary materials list these three as **unsolved challenges**, not recipes. So if you actually go async, treat these three as your own design tasks, not copying homework.

<!-- hint -->

Don't calculate just one number for question 1. "Waste" under three different perspectives is three different quantities: **how much longer the wall-clock took**, **how long completed output sat idle**, **how much of the run time produced nothing**. Calculate all three; that's how you see exactly where sync's cost lands.

<!-- hint -->

Questions 2 and 3 are paired: each thing the lead agent **can't do** under sync becomes something it **can do but at a cost** under async. Try pairing them up—which cost item corresponds to "can't redirect mid-flight"? After pairing, you'll see that async didn't fix these three things; it traded them for three harder things.

<!-- /exercises -->

## Recap

- Orchestrator-workers is a workflow where a central LLM dynamically breaks down tasks, delegates them to worker LLMs, and synthesizes their results; it's well-suited for complex tasks where you can't predict the subtasks needed[^S1]
- Though topographically similar to parallelization, the key difference is flexibility: subtasks aren't pre-defined, but determined by the orchestrator based on the specific input[^S1]—same shape, different timing of the decision
- A worker isn't anything new: a multi-agent system is multiple "LLMs autonomously using tools in a loop" working together, with a lead agent coordinating the process and delegating to specialized subagents that operate in parallel[^S2]
- The 90.2% only holds in its complete context: their internal research eval, Claude Opus 4 lead + Claude Sonnet 4 subagents, excelling especially for breadth-first queries[^S2]; the mechanism explanation is that multi-agent mainly helps spend enough tokens—in the BrowseComp analysis, three factors explain 95% of variance, with token usage alone accounting for 80%[^S2]
- The bill is the other side of the same ledger: by their data, agents are about 4× the tokens of chat, multi-agent about 15×, and for economic viability the task value must be high enough to pay for it[^S2]
- Each subagent needs an objective, an output format, guidance on the tools and sources to use, and clear task boundaries; without detailed task descriptions, agents duplicate work, leave gaps, or fail to find necessary information[^S2]—Course 6's "self-contained delegation prompts" expand into these four items
- Agents struggle to judge appropriate effort, so write allocation rules into the prompt: their scale is simple fact-finding 1 agent 3-10 calls, direct comparisons 2-4 subagents 10-15 calls each, complex research 10+ subagents with clear division[^S2]; without written rules they've seen the consequences—spawning 50 subagents for simple queries, endlessly scouring the web for nonexistent sources, distracting each other with excessive updates[^S2]
- Synchronous execution simplifies coordination but blocks information flow: the lead agent can't redirect mid-flight, subagents can't coordinate, the entire system can be blocked by one subagent[^S2]; async enables more parallelism, at the cost of result coordination, state consistency, and error propagation across subagents—these three are challenges in the primary materials, not solved solutions[^S2]
- Multi-agent systems have emergent behaviors; small changes to the lead agent can unpredictably change subagent behavior; understanding interaction patterns matters, not just individual agents[^S2]; the last mile often becomes most of the journey; codebases working on developer machines require significant engineering to become reliable production systems[^S2]; accompanying practices are deterministic safeguards (retry logic, regular checkpoints)[^S2] and rainbow deployments—gradually shifting traffic while keeping both versions running, avoiding disruption to running agents[^S2]
- This is the most expensive of the four patterns learned so far: before starting, confirm decomposition truly can't be predefined (if it can, go back to Lesson 3's sectioning), then confirm the task value can support 15×; if uncertain, use Course 10's runway to measure a baseline first—only add complexity when it demonstrably improves outcomes[^S1]

[>> Lesson 5: The Review Loop, and Composing Patterns into a Graph](./05-evaluator-and-graphs.md)
