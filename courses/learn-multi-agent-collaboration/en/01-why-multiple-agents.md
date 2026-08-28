# Lesson 1: Why Multiple Agents: The Limits of a Single Context

> Learning goals:
> - Name two specific limits a single agent hits on long tasks: context pollution and attention dilution
> - Use Anthropic's reported token-cost figures to judge whether a task is worth splitting across multiple agents
> - Recognize when coordination overhead outweighs the payoff, and say which kinds of tasks multi-agent systems are not good at today
>
> Prerequisites: the first five courses in this series (you can write prompts, understand the tool-calling protocol, know agent memory and state, and can read basic JS) | Next: [Lesson 2 >>](./02-orchestrator-and-subagents.md)

## What one agent runs into when it does the whole thing

Say you hand a single agent this task: "Research how three cloud providers changed their pricing over the past year, compare them side by side, and write a 2000-word recommendation on which to pick."

Here's how one agent works through it: it searches the first provider's pricing page and reads in a long block of HTML and price tables; it searches the second, another long block; it searches the third provider's history of changes, maybe paging through several times; along the way it turns up a few irrelevant or stale results and reads those in too; finally, working from this single conversation that keeps getting longer, it writes the 2000-word recommendation.

Nothing about this is wrong on its own. The earlier courses already showed you this is how an agent works: read the context, decide the next step, call a tool, put the result back into the context, and repeat. The trouble shows up once the task gets longer and more complex. That single, ever-growing context quietly drags down the final result in two places.

## Context pollution: an early wrong turn you can't shake

Halfway through the research, the agent turns up a misleading result — maybe a stale blog post quoting a price that's no longer in effect. It doesn't notice anything is off, treats it as real data, reasons forward from it, and even writes it into an early judgment about one of the providers.

Once that wrong judgment exists, it doesn't vanish. It stays in the conversation history and becomes part of the background for every later step of reasoning. By the time the agent finds the authoritative, current pricing page, both contradictory facts sit in the same context window, and the model may not cleanly work out which one to trust — especially when the wrong one showed up earlier and got referenced along the way.

That's **context pollution**: an error or irrelevant scrap from an early step mixes into the one context that all later reasoning depends on, and it's hard for later, correct information to fully wash it out. As Anthropic puts it, "as the number of tokens in the context window increases, the model's ability to accurately recall information from that context decreases"[^S7]. The longer the task and the more intermediate steps, the more chances this kind of pollution has to build up.

## Attention dilution: the more it reads, the blurrier it sees

The second problem is different from the first. It's not that the information is wrong, it's that having too much of it is itself a cost. Three providers' pricing pages and change histories might add up to tens of thousands of words of raw content, all piled into one context window. When the model writes the final recommendation, it in principle has to hold every detail across those tens of thousands of words at once, but its attention to any one of them gets spread thinner as the context grows.

That's **attention dilution**. Anthropic frames it as an attention budget: "LLMs have an 'attention budget' that they draw on when parsing large volumes of context" and "Every new token introduced depletes this budget by some amount"[^S7]. The more you cram into one context window, the less of that budget is left for any single detail, and the easier it is to slip up or leave things out on tasks — summaries, comparisons — that need many details held precisely at once.

Put context pollution and attention dilution together and you have the ceiling of the single-context path: once a task gets long enough, quality steadily erodes if one agent carries it end to end. Anthropic describes this decline as "a performance gradient rather than a hard cliff"[^S7], and a longer prompt alone rarely wins it back.

## Multi-agent systems: split a long task across several contexts

The multi-agent answer is to break one big task into pieces and hand each to a separate, independent agent, rather than stuffing everything into the same ever-growing context. Anthropic's definition: "A multi-agent system consists of multiple agents (LLMs autonomously using tools in a loop) working together."[^S1]

Back to the cloud research example: instead of one agent reading through all three companies' material end to end, have three agents each focus on one company, each with its own separate context window, out of each other's way[^S1]. The stale blog post picked up while researching the first company only pollutes that one agent's context; it never mixes into the reasoning about the other two. Anthropic calls this a "separation of concerns" — distinct tools, prompts, and exploration paths that reduce path dependency[^S1]. And the raw content each agent has to juggle drops from "all three companies' material" to "one company's material," which eases the attention-dilution problem too. Exactly how this structure runs — one central agent splits the task, several agents work in parallel, then results get aggregated — is what the next lesson gets into.

## The cost: multi-agent is more expensive

Splitting across agents isn't free. Each subagent has to read in the task background again and organize its own reasoning, and that burns tokens; then a final step aggregates the several agents' results, and that burns tokens too. Anthropic's measured figures: "In our data, agents typically use about 4× more tokens than chat interactions, and multi-agent systems use about 15× more tokens than chats."[^S1]

15× is not a small number. It means bringing in a multi-agent system only pays off when the task itself is valuable enough to justify that extra token cost — as Anthropic puts it, "For economic viability, multi-agent systems require tasks where the value of the task is high enough to pay for the increased performance."[^S1]

How many subagents to run isn't a "more is better" call either. Anthropic has offered a scaling rule of thumb: simple fact-finding is fine with 1 agent and 3 to 10 tool calls; a direct comparison might take 2 to 4 subagents with 10 to 15 calls each; and only research complex enough to have clearly divided responsibilities is worth more than 10 subagents.[^S1] Early on, the team hit the counterexamples — agents that spawned 50 subagents for a simple query, or scoured the web endlessly for a source that didn't exist, with agents distracting each other by sending a pile of needless updates.[^S1]

The attitude behind that rule lines up with the advice Anthropic gives in another piece on agent architecture: "you should consider adding complexity only when it demonstrably improves outcomes."[^S2] Get the task working with one agent first, watch where it actually gets stuck — context pollution or attention dilution — and then decide whether, and at which step, to bring in multiple agents. That beats standing up a complex multi-agent system from the start.

## When not to use multi-agent: coordination overhead beats the payoff

A multi-agent system's value rests on one premise: the task can be broken into pieces that are each handled independently. Once that premise fails, the splitting itself becomes extra weight. That's **coordination overhead**: the extra time and tokens spent getting several agents to divide work and collaborate, including splitting the task, aggregating results, and reconciling agents' contradictory output. When a task doesn't have much that can genuinely be **parallelized**, coordination overhead easily outruns whatever splitting buys you.

Anthropic names one kind of task that's a poor fit: "most coding tasks involve fewer truly parallelizable tasks than research, and LLM agents are not yet great at coordinating and delegating to other agents in real time."[^S1] Fixing a bug usually means understanding several interlocking pieces of logic in the code, tightly coupled front to back, hard to cut cleanly into chunks for different agents without them stepping on each other. That's closer to a **depth-first task**: the answer lives in one chain of reasoning you have to work through step by step, not scattered across several unrelated directions. By contrast, what Anthropic finds multi-agent systems genuinely excel at is the high-value work — "multi-agent systems excel at valuable tasks that involve heavy parallelization, information that exceeds single context windows, and interfacing with numerous complex tools"[^S1] — and researching cloud pricing or comparing several documents side by side is a **breadth-first task**: the answer spreads across a few relatively independent directions you can go chase separately, without depending on each other's intermediate results.

To decide whether a task should go multi-agent, start with three questions: Can the task be split into subtasks that are independent of each other? Once split, does the total information exceed what a single **context window** can hold? Is the task valuable enough to cover that extra token cost? If even one answer leans toward "no" or "not worth it," getting the task done honestly with a **single-agent system** is usually the better deal than forcing it into multiple agents.

```agentmentor-check
{
  "id": "mac-zh-01-when-to-split",
  "label": "Should this task be split across multiple agents",
  "prompt": "Someone says: \"Multi-agent systems perform better anyway, so from now on I'll just go multi-agent on every task — it can't hurt.\" Are they right?",
  "whyHere": "You've just seen the token-cost figures and the \"coding tasks parallelize poorly\" evidence, so it's easy to get swept up by the vague impression that \"multi-agent is stronger\" and forget it carries a cost and has boundaries — this is the spot to puncture that with one concrete judgment standard",
  "mode": "single",
  "choices": [
    {
      "id": "a",
      "text": "Right — if an approach performs better, use it every time. Multi-agent just costs a bit more, which is worth it.",
      "correct": false,
      "feedback": "This skips two things. First, a multi-agent system uses on average about 15× the tokens of a chat interaction, so it only pays off when the task's value is high enough — it's not just 'a bit more.' Second, Anthropic states plainly that most coding tasks have little that can be parallelized, so splitting them across agents isn't necessarily better and can be worse because of coordination overhead. 'Performs better' isn't a default property of multi-agent; it depends on whether the task suits being split."
    },
    {
      "id": "b",
      "text": "No — multi-agent systems are only for saving tokens, so you should reach for them only on simple tasks.",
      "correct": false,
      "feedback": "This has it backwards. Anthropic's figures say a multi-agent system uses on average about 15× the tokens of a chat interaction, so it's not a token-saving tool. And simple fact-finding is fine with 1 agent and 3 to 10 tool calls, so simple tasks need multi-agent less, not more. It's tasks complex enough to split cleanly that may be worth several subagents."
    },
    {
      "id": "c",
      "text": "No — first check whether the task splits into truly independent subtasks, whether its information exceeds one context, and whether its value covers the extra tokens.",
      "correct": true,
      "feedback": "Correct. Anthropic's data shows a multi-agent system uses on average about 15× the tokens of a chat interaction, so it only pays off when the task's value covers that cost; Anthropic also states that coding-type work has far less that can truly be parallelized than research. The call comes down to whether the task can be broken into independently handled pieces, not 'it performs better, so always use it.'"
    }
  ]
}
```

<!-- exercises -->
## 💻 Exercises

### Level 1: Judge whether to split four tasks

For the four tasks below, decide whether each is a better fit for a single agent or for splitting across multiple agents, and explain why.

1. "Figure out why this function occasionally returns a wrong result under concurrency, and pin down the exact bug."
2. "Research the top companies in five different industries and, for each, which AI-related products they've shipped in the past year, organized into a comparison table."
3. "Translate this 300-word product blurb into English."
4. "Read the descriptions and discussion on the last 20 PRs in this repo and summarize which kinds of issues the team has been focused on lately."

<!-- rubric -->
- All four tasks get a clear call (single agent / multi-agent / or under what conditions you'd pick which)
- Each call explains its reasoning, not just a verdict
- The reasoning shows the judgment criteria in use: whether it splits into independent subtasks, whether the information exceeds a single context, whether it's simple enough not to be worth splitting

<!-- answer -->
1. Single agent. Pinning down a concurrency bug means working step by step down one chain of reasoning — reading the function's logic, tracing call timing, locating shared state — and those steps depend tightly on each other. It's a depth-first task, hard to split into unrelated pieces for different agents.
2. Multi-agent. The five industries are independent of each other and can genuinely be researched separately, a breadth-first task; and five write-ups combined most likely exceed the single context one agent can cleanly handle. Put one subagent on each industry, each gathering its own material, then aggregate into a comparison table.
3. Single agent. The task is simple and the information small; a translation is something the model does directly from its language ability and the given source text. There are no independent subtasks worth splitting out, and multi-agent would just waste tokens.
4. It depends, leaning single agent or a light split: 20 PRs isn't a huge number, and if the content isn't long, one agent reading through them and summarizing is workable; if each PR's discussion is long and the total clearly exceeds what a single context holds, you can group the PRs across two or three subagents to read in parallel, then aggregate the themes. The key is to estimate the total volume first, not to default to splitting just because you see "20."

<!-- hint -->
Start with "is this task's answer spread across several independent directions, or buried in one chain of reasoning you have to work through step by step?" The former is breadth-first and splits well; the latter is depth-first and just makes agents step on each other.

<!-- hint -->
Then ask "once split, does the total information clearly exceed what one agent's context can hold?" If the volume was small to begin with and one agent fits it fine, the coordination overhead from splitting usually isn't worth it.

### Level 2: Estimate an agent setup for one research task

The task is: "Research each of three competitors' newly shipped features over the past six months, and write a roughly 200-word summary for each — no side-by-side comparison needed." Using the scaling rule of thumb from this lesson, estimate roughly how many agents to run and about how many tool calls each needs, and explain the basis for your estimate.

<!-- rubric -->
- Gives a specific agent-count estimate, not just "run a few more"
- Gives a rough tool-call range per agent
- The basis reflects the "three competitors are independent and can be researched separately" judgment

<!-- answer -->
The three competitors are independent of each other and each needs moderate-depth retrieval, which puts this in the middle tier of Anthropic's scaling rule (2 to 4 subagents, 10 to 15 tool calls each). Since it's exactly three companies, one subagent per company is the most natural fit — run 3 subagents, each focused on one company; each subagent needs roughly 10 to 15 tool calls to search that company's releases over the past six months, product-page updates, official blog, and other sources, gathering enough material for a 200-word summary. Because no side-by-side comparison is needed, the final aggregation step is much lighter than a "comparison table" task — it's close to just stitching the three summaries together, with no extra deep integration.

<!-- hint -->
The scaling rule gives three tiers: simple fact-finding uses 1 agent with 3 to 10 calls; a direct comparison uses 2 to 4 subagents with 10 to 15 calls each; only research complex enough to divide responsibilities cleanly reaches more than 10 subagents. Figure out which tier this task falls in first, then refine the numbers.

<!-- hint -->
Note the task says "no side-by-side comparison needed," which means the final aggregation is light — no deep integration of several sources into a unified judgment. That affects how big the coordination overhead is, and whether splitting is worth it.

<!-- /exercises -->

## Recap

- A single agent doing it end to end runs into two specific limits on long tasks: **context pollution** (an early error or irrelevant scrap mixes into later reasoning and is hard to wash out) and **attention dilution** (the more you pack into one context, the less the model attends to any single detail).
- A **multi-agent system** is several agents that each use tools independently working together[^S1], easing pollution and dilution by giving each agent its own context window.
- Multi-agent isn't free: Anthropic's data shows it uses on average about 15× the tokens of a chat interaction, so it only pays off when the task's value is high enough[^S1]; how many subagents to run also has an Anthropic scaling rule to lean on, rather than "more is better"[^S1].
- The safer stance is to get the task working with a single agent first, and only consider adding complexity when it demonstrably improves outcomes[^S2].
- To decide whether to split across agents, ask: can the task be broken into independent subtasks? Does the information exceed a single context? Is the value worth the extra token cost? Anthropic states plainly that coding-type, depth-first, tightly-coupled tasks parallelize poorly and aren't multi-agent's strength[^S1]; breadth-first research tasks you can go chase separately are.

[Lesson 2: Orchestrator and Subagents: Fan-Out and Aggregate >>](./02-orchestrator-and-subagents.md)
