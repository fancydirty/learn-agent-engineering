# Lesson 1: When One Loop Isn't Enough

> Learning goals:
> - Use a real task that breaks single-loop agents to show why "get a bigger window" doesn't solve the shape problem
> - State the architectural distinction between workflows and agents, and use "who holds the plan" to place any system on that axis
> - List the triggers for moving up and the conditions for staying put, with latency and token costs on the table first
>
> Prerequisites: Completed the first 11 courses in this series, can hand-write a harness loop driven by `stop_reason` (course 7, "Agent Harness Fundamentals: Loops and Control") | Next: [Lesson 2 >>](./02-chaining-and-routing.md)

## By module 30, something's wrong

You need to migrate a backend repo from internal RPC framework v1 to v2. Before starting, you need an inventory: the repo has 40 modules, and each module needs a migration assessment—list the risk points, estimate the scope of changes, attach a dependency manifest. The work isn't hard, it's just numerous. You have that harness from course 7 in this series:

```javascript
while (response.stop_reason === "tool_use") {
  messages.push({ role: "assistant", content: response.content });
  const toolResults = await runToolUses(response.content);
  messages.push({ role: "user", content: toolResults });
  response = await client.messages.create({ model, max_tokens, tools, messages });
}
```

(A harness is the host code wrapping model calls: send the request, execute the tools the model wants to use, push results back, decide whether to continue.)

You hand it the list of 40 modules all at once, write "assess each one, one report per module," then go make coffee.

The first 5 modules look great: it greps out call sites, reads config, checks test files, and the reports are more detailed than you expected.

At module 15, you come back and check the logs. The `messages` array is already impressive: grep output from the first 14 modules, whole chunks of config files read in, success receipts from file writes, traces of paths taken then abandoned—all still sitting on that timeline. None of this content was wrong—each was necessary at the time. But their current function has been reduced to one thing: taking up space.

By module 30, quality collapses. It copies the conclusion from module 27 onto module 30 because the names are similar; it quietly skips the "check for custom interceptors" step it did every time before; by module 34, even the output format starts drifting.

Your first reaction is probably: switch to a model with a bigger context window.

That reaction only gets you halfway. Double the window and the collapse point probably moves from module 30 to module 55. Your next repo has 120 modules. You haven't solved the problem, you've bought a stay of execution.

What's actually exhausted isn't the window, it's **the shape of "one loop"**: 40 independent items forced to share one timeline, one attention budget. The quality of the assessment for module 30 depends on how much residue the first 29 modules left behind—and these two things have nothing to do with each other.

What this course does is swap out that shape.

## Get the official vocabulary straight first

**Agents can handle sophisticated tasks, but their implementation is often straightforward. They are typically just LLMs using tools based on environmental feedback in a loop**[^S1]. That `while` you wrote in course 7 of this series is exactly that, not one line different. So position yourself: you've already built an agent, this course isn't starting from zero.

One layer up. Anthropic categorizes all these variations as **agentic systems** (plain talk: systems assembled from models, tools, and some form of control flow that can walk through multiple steps on their own), but within this broad category they draw an important architectural distinction[^S1]:

- **Workflows are systems where LLMs and tools are orchestrated through predefined code paths**[^S1]. "Predefined code paths" is the key phrase—what happens next is written into the code.
- **Agents, on the other hand, are systems where LLMs dynamically direct their own processes and tool usage, maintaining control over how they accomplish tasks**[^S1]. What happens next, the model decides on the spot.

One more foundational term you'll use repeatedly in the next few lessons. **In computing, deterministic systems produce the same output every time given identical inputs, while non-deterministic systems—like agents—can generate varied responses even with the same starting conditions**[^S3].

Apply that definition to your `while` and you'll see it's two things stitched together: how to send the request, how to execute tool calls, when to stop—those are deterministic, written by you in code; while "what to grep next, whether this report is finished"—those are non-deterministic, decided by the model on the spot. The surgery you're about to perform is moving decision-making power between these two halves.

## The axis of "who holds the plan"

Claude Code's documentation asks this more directly: **Subagents, skills, agent teams, and workflows can all run a multi-step task. The difference is who holds the plan**[^S5].

("Subagent" = an assistant that works independently in its own context window and returns only a summary; "fan out" = dispatch multiple subagents to work simultaneously. Course 6 in this series covered both terms.)

That sentence cuts through a bunch of approaches that look similar. Take "run assessments for 40 modules":

- You let the model proceed through all 40 in one conversation—the plan is in the model's hands, and it's implicit, hidden in the conversation history. You'd have to dig through logs to guess its intended path.
- You make the model an orchestrator, and it decides each turn which subagent to dispatch for which module—the plan is still in the model's hands, just a bit more explicit.
- You write a script, and the script `for`-loops through those 40 modules itself—the plan is in code. You can open the file and read it through, and run it again tomorrow unchanged.

The third approach has a precise description: **A workflow moves the plan into code. The workflow script holds the loop, the branching, and the intermediate results itself, so Claude's context holds only the final answer**[^S5]. And **intermediate results stay in script variables instead of landing in Claude's context**[^S5]. The grep output from module 27 stays in a JavaScript array, so the assessment for module 30 naturally can't see it—not because the model learned to ignore it, but because it never had the chance to see it at all.

For the two ends of this axis, the official guidance each gets one sentence on fit: **When more complexity is warranted, workflows offer predictability and consistency for well-defined tasks, whereas agents are the better option when flexibility and model-driven decision-making are needed at scale**[^S1].

**One thing to clarify**: this course calls this axis the "determinism spectrum" and calls the composition patterns in lesson 5 "graphs," "nodes," "edges." These labels are **this course's own engineering metaphors and never appear in the primary sources**—the primary materials only provide definitions of the two endpoints (predefined code paths vs. model-driven decisions)[^S1] and the framing of "who holds the plan"[^S5]. We borrow the spectrum and graph metaphors because they're convenient for arranging patterns that really exist; you won't read these terms in any official docs, so don't present them as official concepts.

## When to move up

"One loop isn't enough" sounds like intuition, but there are articulable triggers.

**Trigger one: the task needs more agents than one conversation can coordinate, or you want the orchestration codified as a script you can read and rerun**[^S5]. The first half is a capability issue, the second half is an engineering issue—even if one conversation can barely coordinate it, "can we run this exactly the same way tomorrow" qualifies as a reason on its own.

**Trigger two: when the task is larger than one agent can hold in context, or when the same step needs to run across many items**[^S5]. These two sentences together describe exactly the 40-module scenario at the start. Note the second sentence: the number of items itself is a reason, regardless of whether each item is difficult.

**Trigger three: when a side task would flood your main conversation**. The subagent documentation's scenario description: when a side task would flood your main conversation with search results, logs, or file contents you won't reference again, dispatch a subagent—it does that work in its own context and returns only the summary[^S4], **preserving context by keeping exploration and implementation out of your main conversation**[^S4]. Notice this trigger prescribes "dispatch a subagent"—the plan still stays in the model's hands; that and "move the plan into code" are two different things. The Level 2 exercise's columns B and C will lay out this distinction.

Look at this code to get a feel for what the shape looks like after it's swapped:

```javascript
// This course's own illustration, solely for comparing shapes; primary materials
// contain no orchestration script code samples.
const findings = [];
for (const mod of modules) {
  // Each module gets a fresh harness loop: clean messages, holding only this module's work
  const messages = [{ role: "user", content: assessPrompt(mod) }];
  findings.push(await runHarnessLoop(messages)); // Intermediate results land in this array
}
const report = await summarize(findings);        // Only the summary step goes back to model
```

The loop is still that loop—inside `runHarnessLoop` is the `while` you wrote in course 7 of this series. Only one thing changed: **who counts to 40**. Before, the model was counting. Now, the `for` is counting.

```agentmentor-check
{
  "id": "orc-zh-01-bigger-window",
  "label": "Not enough window, or wrong shape?",
  "prompt": "Your 40-module migration assessment crashed: after module 30, it starts cross-contaminating conclusions and skipping check items. A colleague glances at it and says: 'Just switch to a model with a bigger context. No need to change the architecture.' Which judgment holds up better?",
  "whyHere": "You just read the triggers for moving up. The most common misjudgment isn't not knowing orchestration exists, but treating a shape problem as a capacity problem—this question separates the two.",
  "mode": "single",
  "choices": [
    {
      "id": "a",
      "text": "Colleague's right: the immediate cause of collapse is context getting stuffed full. Double the window and this repo gets through. No need to touch architecture.",
      "correct": false,
      "feedback": "A bigger window does push the collapse point back, and this repo might genuinely get through; but how much is enough depends on item count, and item count is given by the task, not your choice. Every read/write remnant left by the first 29 modules was legitimate at the time, but they still consume the attention budget for later modules (course 8 in this series covered how that consumption happens). When the next repo has 120 modules, you're recalculating this bill."
    },
    {
      "id": "b",
      "text": "Swapping windows only postpones the collapse point: the root cause is the same step running across many items, prior residue consuming later attention—move the plan into code.",
      "correct": true,
      "feedback": "Correct. This task simultaneously hits two triggers: 'larger than one agent can hold in context' and 'the same step needs to run across many items'—both are shape-level signals. After moving the plan into code, each of the 40 modules runs a clean harness loop, the quality of module 30's assessment is no longer determined by residue from the first 29, and intermediate results stay in script variables."
    },
    {
      "id": "c",
      "text": "Shows the single-loop approach is obsolete: any task from now on should start with orchestration. The days of starting from one loop should be turned.",
      "correct": false,
      "feedback": "Overshooting. The official line is find the simplest solution first, add complexity only when needed—which might mean not building agentic systems at all. For many applications, optimizing single LLM calls with retrieval and in-context examples is usually enough. And open-ended problems with unpredictable step counts that can't be hardcoded into a fixed path should stay with autonomous loops."
    }
  ]
}
```

## When to stay put

Behind the trigger signals is an equally long checklist of the opposite, and this one is easier to skip.

**Find the simplest solution possible, and only increase complexity when needed. This might mean not building agentic systems at all**[^S1]. **For many applications, however, optimizing single LLM calls with retrieval and in-context examples is usually enough**[^S1]. That job of renaming a function in 12 places doesn't need a harness, doesn't need orchestration—one call plus one `grep` and it's done.

**Some domains today are not a good fit for multi-agent systems**: those requiring all agents to share the same context, or where there are many dependencies between agents. The text names one example—**most coding tasks involve fewer truly parallelizable tasks than research, and LLM agents are not yet great at coordinating and delegating to other agents in real time**[^S2]. You're refactoring a tightly coupled order module, and changes ripple through a chain of callers—fanning this out to five subagents only makes it slower and messier, because they all need to look at the same thing, and whoever moves first invalidates everyone else's information.

Conversely, the positive fit conditions are stated just as plainly: they found that multi-agent systems excel at tasks that **involve heavy parallelization, information that exceeds single context windows, and interfacing with numerous complex tools**[^S2], and **tasks where the value of the task is high enough to pay for the increased performance**[^S2]. The more of these three conditions you hit, the more worthwhile it is to move up.

There's also a category of tasks that **should stay with autonomous loops**, not forced into orchestration: **open-ended problems where it's difficult or impossible to predict the required number of steps, and where you can't hardcode a fixed path**—these can be given to agents, they'll potentially operate for many turns, and you must have some level of trust in their decision-making[^S1]. Anthropic's own research system is this type: **research work involves open-ended problems where it's very difficult to predict the required steps in advance. You can't hardcode a fixed path for exploring complex topics, as the process is inherently dynamic and path-dependent**[^S2].

So "should I move to orchestration" isn't a one-directional progress bar. The 40-module assessment should move toward orchestration because the steps are fixed, just numerous; "should we swap message queue from A to B" shouldn't move toward orchestration because you don't even know how many articles you'll need to read.

## Put costs on the table first

Before you start learning the five patterns, open the ledger.

**Agentic systems often trade latency and cost for better task performance, and you should consider when this tradeoff makes sense**[^S1]. Not one word here is rhetoric: it's describing an **exchange**.

How expensive? Anthropic provides a set of observations from their own data: **agents typically use about 4× more tokens than chat interactions, and multi-agent systems use about 15× more tokens than chats**[^S2]. So their conclusion is—**for economic viability, multi-agent systems require tasks where the value of the task is high enough to pay for the increased performance**[^S2].

Notice the context of this number: it comes from their own data, not a universal benchmark, and not "all orchestration approaches cost 15× more." But the direction is clear: every step you take toward "more agents, more parallelism," the bill jumps up a tier. Quick boundary: this multiplier measures multi-agent systems relative to chat, not the price tag of "moving the plan into code" itself—primary materials never gave a standalone cost figure for orchestration scripts. This is also why those 40 modules are worth moving up while 12 renamings aren't—not because one is "complex" and one is "simple," but because a migration assessment that saves two weeks of rework can afford this cost.

## The next five lessons

The rest of this course starts with the lightest shape and builds toward composition:

- **Lesson 2: Chaining and Routing**: Break a task into fixed steps with programmatic gates between each; classify then dispatch to specialized prompts. The lightest form of "plan in code."
- **Lesson 3: Parallelization**: Sectioning (split into independent subtasks run in parallel) and voting (run the same task multiple times for diverse outputs), plus how to aggregate results in code.
- **Lesson 4: Orchestrator-Workers**: A central LLM dynamically breaks down tasks, delegates to worker LLMs, and synthesizes their results. The key difference: subtasks aren't predefined.
- **Lesson 5: Evaluation loops, and composing patterns into graphs**: Check-fix-recheck until it passes or stops making progress, then stitch the earlier patterns together. That lesson will state it again: "graph" is this course's own visualization.
- **Lesson 6: Hands-on**: Upgrade that single-loop harness from course 7 in this series into a deterministic orchestration script.

This pattern taxonomy isn't a 2024 relic: the current Claude platform's multi-agent orchestration docs still independently name **Parallelization (fan out independent subtasks simultaneously, coordinator synthesizes results), Specialization (route to agents with domain-focused system prompts and tools), Escalation (consult a more capable agent or model for a subset of complex subtasks)**[^S6]. The skin changed, the skeleton is the same.

One more thing about how this course divides from the previous two: **course 2** in this series taught the concept of workflows—steps, state, branching, diagram-level understanding; **course 6** in this series taught multi-agent collaboration division of labor and communication—fan out, delegation prompts being self-contained, producer-reviewer. This course doesn't reteach either. What it covers is **the control flow itself**: who counts, who branches, where intermediate results go, what happens when it crashes. Quick vocabulary bridge: what course 6 in this series called "producer-reviewer," primary materials call **evaluator-optimizer**[^S1], and Claude Code's workflow docs call **having independent agents adversarially review each other's findings**[^S5].

## Proportionality: everything must pass "measurable improvement"

This course will teach you five patterns and a bunch of composition methods. They all share one admission line, and the original text is unambiguous: **These building blocks aren't prescriptive. They're common patterns that developers can shape and combine to fit different use cases. The key to success, as with any LLM features, is measuring performance and iterating on implementations. To repeat: you should consider adding complexity only when it demonstrably improves outcomes**[^S1].

"Demonstrably improves outcomes" requires concrete support, which comes from the evaluations of course 10 and the observability of course 11 in this series: without an eval set, you can't say clearly "did adding routing actually make things better." The ending of the canonical text follows this order: **start with simple prompts, optimize them with comprehensive evaluation, and add multi-step agentic systems only when simpler solutions fall short**[^S1].

So after learning each pattern, ask yourself: **Can I produce a number showing results got better after adding it?** If you can't, don't add it yet.

## 💻 Exercises

<!-- exercises -->

### Level 1: Put five tasks into three tiers

No code needed. For each of these 5 tasks, judge which tier it falls into:

- **Single loop sufficient** (or even one call is enough, don't add complexity)
- **Move to orchestration** (move the plan into code)
- **Keep with autonomous loop** (let the model decide step count)

The first and third tiers both run as one loop; they're listed separately because **the reason for not moving to orchestration differs**—one is the work is too simple to justify it, the other is the work is too open-ended to decompose. Judging tiers is about judging reasons. Each judgment needs one sentence of reasoning that names a **specific condition from this lesson** (same step running across many items / larger than one context / too many to coordinate in one conversation / unpredictable step count can't be hardcoded into fixed path / simple tasks don't need complexity / domains requiring shared context and many dependencies aren't a good fit for multi-agent). Don't just say "task is big" or "task is complex."

1. Write one migration assessment per module for 40 modules in a repo, each including risk points, scope estimate, dependency manifest.
2. Rename `getUserProfile` to `fetchUserProfile`, 12 call sites across the repo.
3. Research "should we swap our message queue from A to B," no predetermined list of information sources, read as you go.
4. Tag each of 200 backlog customer support tickets with a category label (8 categories total), labeling rules are written in one doc.
5. Refactor a tightly coupled order module: split 3 classes, move 2 interfaces, changes ripple through a chain of callers.

<!-- rubric -->

- Each of the five tasks gets a tier judgment and the tiers are correct: tasks 1 and 4 "move to orchestration," task 2 "single loop sufficient," tasks 3 and 5 "keep with autonomous loop"
- Each reason names a specific condition from this lesson, not vague "task is big" or "task is complex"; task 4's reason must land on item count and note that individual items are actually simple
- Task 5 additionally notes "don't fan out to multi-agent," with reasoning landing on "domains requiring shared context and many inter-agent dependencies aren't a good fit" and "most coding tasks involve fewer truly parallelizable tasks than research"

<!-- answer -->

**1. Migration assessments for 40 modules — move to orchestration.**
Hits two triggers simultaneously: larger than one agent can hold in context, and the same step needs to run across many items[^S5]. The assessment steps for each module are fixed (read code, find call sites, estimate scope, write report), only the items vary. After moving the plan into code, the `for` counts to 40, each module opens a clean harness loop, intermediate results stay in script variables[^S5].

**2. 12 function renamings — single loop sufficient, or even one call plus one `grep` is enough.**
This tests the reverse condition: find the simplest solution possible, add complexity only when needed, which might mean not building agentic systems at all[^S1]. Steps are completely determined, only 12 items, each change mechanical and independent of the others. Wrapping it in orchestration means you pay in latency and cost and get back zero[^S1].

**3. Message queue selection research — keep with autonomous loop.**
Open-ended problems, difficult to predict required step count, can't hardcode a fixed path—this is exactly agents' fit[^S1]. Research-type work has been explicitly named: the process is inherently dynamic and path-dependent, you don't know in advance which articles to read[^S2]. Forcing it into fixed-step orchestration only locks it onto the one path you guessed at the start.

**4. Label 200 tickets — move to orchestration.**
Hits "the same step needs to run across many items"[^S5]. Note the difference from task 1: each individual item is **extremely simple**—rules written in a doc, one LLM call plus a few examples can judge one ticket, this is exactly the typical case for "optimizing single calls with retrieval and examples is usually enough"[^S1]. What needs to move into code isn't "how to judge one ticket," but "how to count to 200": let the script count, so ticket 150 and ticket 1 get the same clean starting context.

**5. Refactor tightly coupled order module — keep with autonomous loop, and explicitly don't fan out to multi-agent.**
Two layers of reasoning. First layer, unpredictable step count: only after splitting the first class do you know how to move the second interface, can't hardcode a fixed path[^S1]. The second layer is the key—this domain today is not a good fit for multi-agent: all agents need to share the same context, many inter-dependencies, the text directly names that most coding tasks involve fewer truly parallelizable tasks than research, and LLM agents are not yet great at coordinating and delegating in real time[^S2]. What should be done is one loop completing the work, adding deterministic checks at key points when necessary, not adding agent count.

<!-- hint -->

Before rushing to judgment, first separate each task's **steps** from its **items**: are the steps for this task fixed or determined as you go? How many items need repeating? "Fixed steps + many items" and "unfixed steps" will lead you to completely different tiers.

<!-- hint -->

Task 5 is the only one where **both reasons must be written**—it simultaneously steps on two different reverse conditions. Writing only one misses the most easily stepped-on reverse condition in this lesson's checklist.

### Level 2: Same task, three versions of "who holds the plan"

No code needed. Still that 40-module migration assessment, three approaches:

- **A: One big loop** — Hand the list of 40 modules to one harness loop all at once, let it proceed through them itself.
- **B: Model as orchestrator dispatching subagents one by one** — Model decides each turn in the main conversation which subagent to dispatch for which module, subagent returns results to main conversation.
- **C: Plan written into script** — A script `for`-loops through those 40 modules, each module starts a clean harness loop.

Complete this table (question marks are what you fill in). Row three is the key: when the process is killed / session dropped at module 25, what does each approach lose?

| | A: One big loop | B: Model as orchestrator | C: Plan written into script |
| --- | --- | --- | --- |
| Who holds the plan | ? | ? | ? |
| Where intermediate results land | ? | ? | ? |
| When it crashes at module 25, what's lost | ? | ? | ? |

<!-- rubric -->

- All three cells in "who holds the plan" are correct: A and B both have the model holding it, and the difference between the two is clear (A implicit hidden in one conversation history, B is the model explicitly deciding turn by turn who to dispatch); C has the script holding the loop, branching, and intermediate results
- "Where intermediate results land" distinguishes clearly: A and B ultimately land in the context window (B has an extra layer—subagent results return to main conversation, multiple subagents each returning detailed results consumes significant context); C stays in script variables, the model's context holds only the final answer
- "What's lost" answers C's recoverability **conditional on incremental persistence** (corresponding to: the runtime tracks each agent's result as the run progresses, making a run resumable within the same session), and points out A and B lose the entire progress, C after persistence mainly loses just that one current item

<!-- answer -->

| | A: One big loop | B: Model as orchestrator | C: Plan written into script |
| --- | --- | --- | --- |
| Who holds the plan | The model, **implicit**. The plan was never written out, hidden in conversation history, you have to dig through logs to guess its intended path—this is exactly the definition of "LLMs dynamically direct their own processes and maintain control over how they accomplish tasks"[^S1] | The model, a bit more **explicit**. It says each turn "next dispatch someone to look at the order module," but it's still deciding turn by turn[^S5] | **The script**. The script itself holds the loop, the branching, and the intermediate results, so Claude's context holds only the final answer[^S5] |
| Where intermediate results land | All in the same `messages` array: grep output from 40 modules, files read in, traces of wrong turns then backtracking, sharing one timeline | Back to the main conversation. When subagents complete, their results return to your main conversation; running many subagents that each return detailed results can consume significant context[^S4] | Stays in script variables, doesn't land in the model's context[^S5] |
| When it crashes at module 25, what's lost | Nearly everything. Progress is that conversation history itself; when the session is gone, progress is gone; even if the first 24 fell to disk, you don't have a clean "continue from module 25" entry point | Same loss of the entire orchestration state from the main conversation. Worse still, after restart the model has to re-think the plan—its previous plan was never written anywhere | **Conditional on you persisting each result as you go** (writing script variables to files is one line of code): only lose module 25 itself, the entry point to continue from module 26 is ready-made; if kept only in memory, the process dies and you lose as much as A. Corresponding to: the workflow runtime tracks each agent's result as the run progresses, which makes a run resumable **within the same session**[^S5]—cross-process recovery still requires you to persist yourself |

**Reasoning process:**

The three rows are actually three facets of the same thing. **Whoever holds the plan, intermediate results will land in that holder's container, and when the process crashes you lose what's in that container.**

A and B both have the plan in the model's hands, so the container is the context window, and the context window is a session-level thing that resets to zero when the session ends—so A and B's "progress" and "context" are the same thing, lose one and you lose the other. B looks stronger than A because each module's assessment is done cleanly in the subagent's own window; but the summaries still pile up in the main conversation one by one, and by the 25th summary the main conversation is just as squeezed. It only postponed A's problem, didn't swap out the container.

C swapped out the container: intermediate results are in script variables, and script variables can be written to files or databases with one line. This is the **incremental tracing brings recoverability** idea—the runtime version is tracking each agent's result as the run progresses, resumable within the same session[^S5]; the script version is you writing each result to a file yourself. This is also where course 9 in this series's "making long tasks survive interruption" thinking lands at the orchestration layer—progress must exist in a place that **lives longer than the model's context**. Bonus benefit: C's module 25 and module 1 get the exact same starting context, so rerunning module 25 is a true retry, not "try again in a scene dirtied by the first 24."

<!-- hint -->

Fill the middle row first. Think clearly about where each approach's intermediate results **physically exist in which container** (a `messages` array? The main conversation's context window? A JavaScript variable?), and the third row's answer will emerge on its own—what's lost when it crashes is what's in that container.

<!-- hint -->

B is easily judged as "about the same as C" because it also isolates each module's dirty work in the subagent's independent context. Think about: after the subagent finishes, where does that result **go**? By module 25, how many summaries are sitting in the main conversation?

<!-- /exercises -->

## Recap

- That `while` you wrote in course 7 of this series is an agent—agents can handle sophisticated tasks, but their implementation is often straightforward. They are typically just LLMs using tools based on environmental feedback in a loop[^S1].
- These variations are collectively called agentic systems, within which an architectural distinction is drawn: workflows are systems where LLMs and tools are orchestrated through predefined code paths, agents are systems where LLMs dynamically direct their own processes and tool usage, maintaining control over how they accomplish tasks[^S1].
- The axis that distinguishes them is "who holds the plan": a workflow moves the plan into code, the script itself holds the loop, the branching, and the intermediate results, so Claude's context holds only the final answer[^S5]. This course calls this axis the "determinism spectrum" and calls lesson 5's composition visualization "graphs"—both terms are this course's own metaphors and don't appear in primary materials.
- Triggers for moving up: the task needs more agents than one conversation can coordinate, or you want the orchestration codified as a script you can read and rerun[^S5]; when the task is larger than one agent can hold in context, or when the same step needs to run across many items[^S5]; when a side task would flood your main conversation with content you won't reference again[^S4].
- Conditions for staying put: find the simplest solution possible, add complexity only when needed, which might mean not building agentic systems at all[^S1]; for many applications, optimizing single LLM calls with retrieval and in-context examples is usually enough[^S1]; domains requiring shared context or many inter-agent dependencies today are not a good fit for multi-agent, most coding tasks involve fewer truly parallelizable tasks than research[^S2].
- Keep with autonomous loops: open-ended problems, difficult to predict step count, can't hardcode a fixed path[^S1]—research-type work is typical, the process is inherently dynamic and path-dependent[^S2].
- Get the bill first: agentic systems often trade latency and cost for better task performance[^S1]; in their own data, agents use about 4× more tokens than chat, multi-agent about 15×, economic viability requires the task value to support that improvement[^S2].
- Everything this course teaches must pass the same gate: add complexity only when it demonstrably improves outcomes[^S1]; start with simple prompts, optimize them with comprehensive evaluation, add multi-step agentic systems only when simpler solutions fall short[^S1].

[>> Lesson 2: Chain It, Route It: Chaining and Routing](./02-chaining-and-routing.md)
