# Lesson 2: Orchestrator and Subagents: Fan-Out and Aggregate

> Learning goals:
> - State what the orchestrator and the subagents are each responsible for in an orchestrator-subagent architecture
> - Explain what "context isolation" actually isolates, and why it eases the context pollution and attention dilution from the last lesson
> - Explain why a subagent should return only its conclusion to the orchestrator, instead of pushing its whole accumulated train of thought back in
>
> Prerequisites: Finish Lesson 1 and understand the definition of a "multi-agent system" and where it fits | Prev: [Lesson 1 <<](./01-why-multiple-agents.md) | Next: [Lesson 3 >>](./03-writing-prompts-for-delegation.md)

## The orchestrator: split the task, hand it out, wait for results

Last lesson we decided a task like "research the pricing of three cloud providers" is a good fit for splitting across multiple agents, but we never spelled out how that split actually works. One common structure for it is the **orchestrator-subagent** architecture. The official definition is "a central LLM dynamically breaks down tasks, delegates them to worker LLMs, and synthesizes their results."[^S2]

That definition names three actions, and they map onto the three things the orchestrator does: **break down** — look at one big task and figure out which chunks it splits into; **delegate** — hand each chunk, along with the background it needs, to a subagent to carry out; **synthesize** — once the subagents have returned their results, combine those results into the final answer. The orchestrator itself never goes down and reads a provider's pricing page. Its job is to decide how to divide the work, who gets what, and how to stitch several results into one answer that hangs together.

## The subagent: take one task, finish it inside its own context

On the subagent side, things work quite differently. The docs are explicit: "Each subagent starts with a fresh, isolated context window. It doesn't see your conversation history, the skills you've already invoked, or the files Claude has already read. Claude composes a delegation message that summarizes the task, and the subagent works from there."[^S3] In other words, a subagent has no idea what you first said to the orchestrator, or how the orchestrator weighed "should we split this" and "into how many pieces" internally. All it can see is the one task brief the orchestrator handed it.

This looks like a limitation, but it's actually the cure for the two problems from last lesson. The subagent's context doesn't carry the orchestrator's full conversation history, so it also doesn't carry the dead ends the orchestrator hit elsewhere or the irrelevant material it saw. That's **context isolation**: confining each agent's working scope to its own context window, so context pollution inside one agent doesn't spread to another. The subagent holds only the material for its own slice of the task, and doesn't have to juggle all the content for three companies at once, so the pressure of attention dilution drops too. As for how to write a task brief clear enough that a subagent can do good work on its own without ever seeing the conversation history, that's the next lesson.

```agentmentor-check
{
  "id": "mac-zh-02-subagent-visibility",
  "label": "Should a subagent see the orchestrator's full conversation history",
  "prompt": "Three subagents are researching the pricing of three cloud providers in parallel. Someone suggests: \"Let's just let every subagent see the orchestrator's full conversation history so far, including what the other two subagents have already found. That way they can cross-reference each other and avoid duplicating searches.\" Is this a good idea?",
  "whyHere": "We've just covered that a subagent starts from a fresh, isolated context by default, which makes it easy to be swayed by the plausible-sounding claim that 'sharing history avoids duplicate work.' This is the moment to draw the line: context isolation is the default mechanism, and avoiding duplicate work comes from the orchestrator drawing clear task boundaries when it delegates, not from subagents peeking at each other.",
  "mode": "single",
  "choices": [
    {
      "id": "a",
      "text": "Reasonable — the more a subagent can see, the less likely it is to duplicate work or miss information.",
      "correct": false,
      "feedback": "This puts an equals sign between 'avoid duplicate work' and 'share all history,' but the official mechanism is explicit that each subagent starts from a fresh, isolated context by default and can't see the conversation history. Letting subagents see each other's full process moves the context pollution and attention dilution from Lesson 1 out of 'inside one agent' and into 'between several subagents,' at real cost. The actual tool for avoiding duplicate work is the orchestrator drawing clear, non-overlapping task boundaries when it delegates."
    },
    {
      "id": "b",
      "text": "Not reasonable — a subagent sees neither the conversation history nor the others by default; avoiding duplicate work is the orchestrator's job when it draws task boundaries.",
      "correct": true,
      "feedback": "Correct. The docs say plainly that a subagent starts from a fresh, isolated context window and can't see the conversation history. Giving each subagent only the one task brief it needs is exactly how context isolation eases context pollution and attention dilution. Duplicate work should be solved when the orchestrator breaks down the task and divides the boundaries, not patched over by having subagents share large amounts of context."
    },
    {
      "id": "c",
      "text": "Doesn't matter — the orchestrator aggregates at the end anyway, so whether subagents see each other's work won't change the final result.",
      "correct": false,
      "feedback": "It does matter. Each subagent's context independence directly decides whether it gets pulled off course by irrelevant or wrong information another subagent turned up, and whether it burns attention juggling extra material. Aggregation happens after the subagents finish their work; it can't undo the quality lost during that work because a subagent was fed context it never needed."
    }
  ]
}
```

## Fan-out: split the task and hand it to several subagents at once

Back to the three-provider pricing example. Once the orchestrator has broken the work into "check the first," "check the second," "check the third," it doesn't queue them up one at a time. It hands all three out at once — which is exactly what the production system does: the lead agent spins up 3-5 subagents in parallel rather than serially[^S1]. That "hand it all out at the same time" move is **fan-out**: the orchestrator distributes the split-up subtasks in parallel to a matching number of subagents, letting each start working independently and simultaneously, instead of waiting for the first subagent to finish before dispatching the second.

The payoff from fan-out is direct: three subagents working in parallel means the total time is close to doing one piece of research, not the sum of three. After the production system introduced this kind of parallelization, research time on complex queries dropped by up to 90%[^S1]. But fan-out isn't just hacking the task into pieces and calling it done — how you cut matters. Three companies are naturally independent, so cutting into three is a clean fit. Switch to "review a 20-page contract" and the clauses may reference and constrain each other; a bad cut leaves subagents each missing key context and reaching conclusions that contradict one another. Deciding how and how finely to cut goes back to the test from last lesson: is each chunk you cut out truly something that can be handled on its own, without depending on another chunk's intermediate results?

## Aggregate: pull the results together, not just paste them

After the three subagents each finish checking their own company's pricing and hand the results back, what the orchestrator does is not paste three blocks of text end to end. What the subagents return are research conclusions from their own vantage points, and the orchestrator's job is to **aggregate**: put several independently produced results side by side, compare them, resolve whatever duplication or contradiction shows up, and reorganize them into the final deliverable's shape — writing a document that reads as one whole, not as three obviously seamed-together pieces.

The docs, describing subagents handing off in sequence, note that "Each subagent completes its task and returns results to Claude, which then passes relevant context to the next subagent."[^S3] So aggregation isn't necessarily as simple as "wait for every subagent to turn in its work, then the orchestrator collects all of it at once and processes it." In some cases the earlier subagent's result is itself part of the next subagent's task brief, and the orchestrator moves back and forth between fanning out and aggregating until every subtask has a result.

The path a result travels doesn't always have to route through the orchestrator either. When the content a subagent produces is large and needs to be kept intact, the docs mention one approach: "Subagent output to a filesystem to minimize the 'game of telephone.' Direct subagent outputs can bypass the main coordinator for certain types of results, improving both fidelity and performance."[^S1] Writing straight to the filesystem is, at bottom, a way to keep a result from being paraphrased, compressed, and losing detail along the "subagent → orchestrator → final output" chain.

## Return only the conclusion, not the subagent's whole train of thought

To finish its task, a subagent might read many pages of irrelevant material along the way, try a few paths that go nowhere, even make small mistakes and correct itself. That process doesn't need to — and shouldn't — get stuffed back into the orchestrator's context as-is. What the orchestrator needs is the subagent's final, defensible conclusion and the key evidence behind it, not the whole reasoning trail with its detours.

The reason goes back to the point from Lesson 1: the orchestrator has a context window of its own, and it goes through context pollution and attention dilution too. The docs are direct about this: when subagents complete, their results return to the main conversation, and running many subagents that each return detailed results can consume significant context[^S3]. If three subagents each push several thousand words of full reasoning back in as-is, the orchestrator ends up meeting, at its own layer, the very problem multiple agents were supposed to ease. **Return** should carry only the conclusion itself, and leave the "how I got there" detail in the subagent's own context, which it has already used up and is about to discard.

This doesn't mean every delegation starts from scratch. The docs mention a special subagent type — a **fork**: "A fork is a subagent that inherits the entire conversation so far instead of starting fresh... The fork's own tool calls still stay out of your conversation and only its final result comes back, so your main context window stays clean."[^S3] So even when a subagent rarely does need to see the full history (say, it has to produce a deep summary grounded in all the prior discussion), its intermediate thinking still doesn't enter the orchestrator's context as-is. The "return only the conclusion" principle is stable; what changes is only whether the subagent starts out with history in hand.

## Put another way: the same division of labor shows up in other frameworks

"Orchestrator-subagent" isn't one vendor's private phrasing. OpenAI's Agents SDK docs call the same structure the **Manager pattern**: "A central manager/orchestrator invokes specialized sub‑agents as tools and retains control of the conversation."[^S4] Swap the words — manager for orchestrator, agents-as-tools for subagents — and it's describing the same thing: a central node breaks down the task, hands out work, and keeps control of the whole, while the actual execution goes to specialized subordinates who return their results, and the central node keeps steering what comes next. Recognizing the shape of this division of labor matters more than memorizing one framework's terminology — you'll see some variant of this logic in the docs of nearly every multi-agent framework.

<!-- exercises -->
## 💻 Exercises

### Level 1: Draw the orchestrator/subagent split for a code-review task

The task is: "Review the last 10 PRs of an open-source project, find the PRs that touched the core permissions logic, and write a risk note for each such PR." Answer:

1. What should the orchestrator do?
2. How should this task fan out — into how many chunks, and roughly what is each chunk?
3. When a subagent finishes, what should it return? And once the orchestrator has the returns, what exactly is the "aggregate" step?

<!-- rubric -->
- The orchestrator's responsibilities reflect "break down, delegate, synthesize," rather than the orchestrator reading the PRs itself
- The fan-out plan gives a concrete basis for the split (e.g. group by PR), not a vague "split into a few pieces"
- Makes clear whether the subagent returns a conclusion or its whole train of thought, and what the aggregation is actually doing

<!-- answer -->
1. The orchestrator first takes the list of 10 PRs and decides this task splits into a parallelizable layer of subtasks — "check one by one whether each PR touched the permissions logic." It hands each PR (or a group of a few PRs) to a subagent to check. Once the subagents return, it organizes the risk notes for the PRs that did touch permissions logic into one unified review report.
2. You can split by PR — say each subagent handles 2-3 PRs, for 4-5 subagents checking in parallel; or finer, one subagent per PR across all 10. The exact granularity depends on how large each PR's changes are and how much context the check needs.
3. A subagent should return only the conclusion: whether this PR touched the core permissions logic, and if so, the risk note plus the key code locations that back the judgment — not the whole diff it read and its trial-and-error thinking along the way. Once the orchestrator has the returns, "aggregate" means picking out every PR the subagents flagged as risky and organizing them into one report in a consistent risk-note format, rather than pasting 10 raw subagent replies end to end.

<!-- hint -->
Among the orchestrator's three actions — break down, delegate, synthesize — the one that's easy to miss is that it does not go read the actual contents of a PR. The moment the orchestrator reads a full diff itself, it's doing the subagent's work, and the line of division blurs.

<!-- hint -->
For what a subagent should return, reason backwards: if the orchestrator received each subagent's full train of thought, would its own context turn long and cluttered again? If yes, then what should be returned is only the conclusion.

### Level 2: Spot the problem in this orchestration design

Someone designed an orchestrator-subagent flow like this: "Right at the start, the orchestrator packages up its full conversation history with the user — including a few rounds of small talk unrelated to this task — and sends it as background to every subagent, on the logic that 'in case a subagent needs some background, giving it up front beats leaving it out.'" Find the problem in this design and give a better approach.

<!-- rubric -->
- Names the problem and cites a specific principle from this lesson (not a vague "it's bad")
- Explains the concrete consequence this practice causes
- The improvement reflects the "provide on demand, draw clear boundaries" principle

<!-- answer -->
The problem is that it defeats the whole point of a subagent starting from a fresh, isolated context by default. Packaging the unrelated small talk into every subagent artificially reintroduces the irrelevant material from the orchestrator's own context into each subagent's context — this is exactly the context pollution from Lesson 1, just with the source swapped from "wrong information the agent found itself" to "irrelevant history the orchestrator helpfully stuffed in." The consequence is that a subagent spends extra attention sorting real, useful background from irrelevant chatter, so attention dilution shows up too, and the "in case something's missing" worry isn't even solved — the background that's actually needed should be written explicitly into the task brief, not backstopped by dumping all the history in. The better approach: the orchestrator picks out only the background this task genuinely needs, writes it explicitly into the subagent's brief, and passes none of the unused history.

<!-- hint -->
Recall the "should a subagent see the full conversation history" question — "in case it's needed" and "clearly needed" are two different things. The former slides easily into stuffing everything in; the latter asks whoever delegates to first think through what background this task actually needs.

<!-- hint -->
Compare: if that "full conversation history" is itself several thousand words, feeding it to three subagents means the orchestrator, before it has even fanned out, has already passed the cost of context pollution and attention dilution onto every subagent.

<!-- /exercises -->

## Recap

- In the **orchestrator-subagent** architecture, a central LLM breaks down the task, delegates subtasks to multiple worker LLMs, and synthesizes their results[^S2]; the orchestrator itself doesn't go down and handle the detailed contents of a subtask.
- Each subagent starts by default from a fresh, isolated context window and can't see the orchestrator's conversation history[^S3] — this is **context isolation**, the key mechanism for easing the context pollution and attention dilution from the last lesson.
- **Fan-out** distributes the split subtasks in parallel to multiple subagents to work at once; **aggregate** isn't a simple paste of the subagents' replies but a compare, resolve-contradictions, reorganize-to-one-format step; and result passing can also bypass the orchestrator and write straight to the filesystem, to reduce information lost in paraphrase[^S1].
- After a subagent finishes, its result returns to the orchestrator[^S3]; what's returned should be only the **conclusion**, not the detours it hit or its whole train of thought — the docs are explicit that many subagents each returning detailed results can consume significant context[^S3], and the orchestrator would meet context pollution and attention dilution again at its own layer.
- "Orchestrator-subagent" isn't one framework's private phrasing — the OpenAI Agents SDK calls the same structure the Manager pattern, a central manager invoking subagents as tools while retaining control of the conversation[^S4]. Recognizing the shared logic behind this division of labor matters more than memorizing any one term.

[>> Lesson 3: Writing Prompts for Delegation](./03-writing-prompts-for-delegation.md)
