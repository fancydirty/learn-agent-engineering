# Lesson 4: Collaboration Patterns: Pipeline, Review, Voting

> Learning goals:
> - Tell apart how pipeline, producer-reviewer, and multi-perspective voting actually work
> - Judge which pattern fits a given task, and name the cost profile of each
> - Understand the key difference in who holds control between handoff-style collaboration and orchestrator-subagent collaboration
>
> Prerequisites: Finished Lesson 3, comfortable writing self-contained, clearly-scoped delegation prompts | Prev: [Lesson 3 <<](./03-writing-prompts-for-delegation.md) | Next: [Lesson 5 >>](./05-failure-and-coordination.md)

The orchestrator-subagent structure from the last two lessons is one shape: a central node splits the task, several subagents work in parallel, and their results get merged back. But that's not the only way to wire multiple agents together. This lesson covers three more specific collaboration patterns — pipeline, producer-reviewer, and multi-perspective voting — where each one fits and where its cost goes, and then a fourth way of collaborating that runs on a completely different idea from orchestrator-subagent: handing control off outright.

## Pipeline: One Step After Another, Each Feeding on the Last

**Pipeline** (prompt chaining): "Prompt chaining decomposes a task into a sequence of steps, where each LLM call processes the output of the previous one."[^S2] The biggest difference between a pipeline and orchestrator-subagent is this: orchestrator-subagent is a parallel structure — "a central LLM dynamically breaks down tasks, delegates them to worker LLMs, and synthesizes their results."[^S2] A pipeline is strictly one step after another — the next step can't start until the previous one finishes, and it takes that previous step's output directly as its own input.

Take a product-launch blog post. You can split it into three steps: draft a first version, translate the draft into another language, then check the translated version for inconsistent terminology. Step two's input is step one's output; step three's input is step two's output; none of them can skip ahead and start on its own. This shape fits tasks that carry a natural order, where the next step genuinely can't proceed without the previous step's result. Unlike researching three companies' pricing, which really does split into independent chunks, every step in a pipeline depends on the one before it.

## Producer-Reviewer: One Writes, One Picks It Apart, Repeat

**Producer-reviewer** (evaluator-optimizer): "one LLM call generates a response while another provides evaluation and feedback in a loop."[^S2] The key difference from a pipeline is that loop. A pipeline runs through a fixed set of steps and stops; producer-reviewer goes draft, reviewer gives feedback, revise against the feedback, review again, and doesn't stop until the reviewer is satisfied (or a preset maximum number of rounds is hit). How many rounds it takes is usually not known ahead of time.

For example, have one agent write code that handles payment logic, and another agent whose only job is to check whether that code misses edge cases — a negative amount, a duplicate submission under concurrency. If the reviewer agent finds a problem, the code goes back to the producer agent for another pass, then returns to the reviewer, until the reviewer sees no obvious issues. This shape fits tasks where "did it do a good job" can't be judged accurately in one shot and needs repeated polishing to converge. The first version is rarely the final one; the review step exists to catch obvious problems before delivery and push the producer to revise once more.

## Multi-Perspective Voting: Several Independent Judgments on One Thing

**Multi-perspective voting**: several agents each judge the same content independently, rather than processing it step by step in a relay. The official example is a code security review: "Reviewing a piece of code for vulnerabilities, where several different prompts review and flag the code if they find a problem."[^S2] Here the "several different prompts" each look at the same code independently, none depending on another's judgment; as long as one prompt flags a problem, the code gets flagged and is worth a closer look.

This pattern differs from producer-reviewer. Voting isn't a draft-then-revise loop; the agents judge one piece of already-existing content in parallel and independently. The goal is to drive down the odds of a miss by checking from several different angles, not to make the content better through repeated edits. It fits situations where you'd rather spend a few extra calls than let a problem slip through — in security reviews and compliance checks, missing a real problem usually costs far more than a few extra tokens.

## Choosing Among the Three, and Where the Cost Goes

The three patterns have different cost structures, so pick by doing the math against your actual situation:

- **Pipeline**: total cost is roughly the sum of the calls across the steps. The step count is fixed and predictable, but because execution is strictly sequential, total latency is every step's time added up, so it won't be fast. Good for tasks with clear step-to-step dependencies where each step's scope is fairly small.
- **Producer-reviewer**: cost depends on how many rounds it takes to converge, and the round count is uncertain. Once the producer and reviewer get into a back-and-forth, cost can run well past what you expected — which is why this pattern usually needs a maximum round cap on the loop, to keep it from spinning forever. Good for tasks where the first version probably isn't good enough and needs repeated polishing.
- **Multi-perspective voting**: cost is roughly single-review cost times the number of agents voting — a straight multiplication, so N agents means N times the cost. Good for tasks where a miss is expensive and you'd rather pay more for wider coverage; a poor fit for cost-sensitive situations where the content itself isn't very risky.

To choose, come back to the shape of the task itself. Does it have a natural order of steps? If so, consider a pipeline. Does the output quality need repeated polishing to be good enough? If so, consider producer-reviewer. Is missing a problem expensive enough to be worth checking from several angles? If so, consider multi-perspective voting. The three aren't mutually exclusive either — a full workflow can run through a fixed pipeline and nest a producer-reviewer loop inside one of its steps. Lesson 6 builds exactly this kind of combination hands-on.

```agentmentor-check
{
  "id": "mac-zh-04-pipeline-vs-reviewer",
  "label": "Pipeline or producer-reviewer?",
  "prompt": "The task: have one agent write a draft of some API documentation, then have another agent check whether the draft is missing any parameter descriptions; if something's missing, send it back to the documentation agent to fill in, and repeat until the check passes. Is this a pipeline or a producer-reviewer pattern?",
  "whyHere": "Pipeline and producer-reviewer both hand one agent's output to the next, so on the surface they look alike, and it's easy to be led by that surface structure and miss the key difference — whether it loops back. The three patterns and how to choose among them were just covered, so a concrete scenario here pins the judgment criteria down to something practical.",
  "mode": "single",
  "choices": [
    {
      "id": "a",
      "text": "Producer-reviewer — a write-review-revise loop that ends only when the check passes.",
      "correct": true,
      "feedback": "Correct. The official definition of producer-reviewer is one call generating a response while another provides evaluation and feedback in a loop; the loop here converges only when the check passes. \"Send it back to rewrite if the check fails\" is exactly that loop, unlike a pipeline's fixed, one-directional run — a pipeline won't send a step's output back to redo an earlier step just because it wasn't good enough."
    },
    {
      "id": "b",
      "text": "Pipeline — there are two steps, and the first feeds its output to the second.",
      "correct": false,
      "feedback": "Looking only at \"there's an order of steps, and the later step processes the earlier one's output\" isn't enough. A pipeline runs through a fixed set of steps and stops; it doesn't send work back. Here a failed check goes back to the documentation agent to add more, again and again until it passes, so the round count isn't fixed. That's the producer-reviewer loop, not a pipeline's one-shot sequential run."
    },
    {
      "id": "c",
      "text": "Neither — this is multi-perspective voting, since two agents each make a judgment.",
      "correct": false,
      "feedback": "Multi-perspective voting requires several agents to judge the same already-existing content independently, in parallel and without depending on each other, to widen coverage against missed problems. Here the two agents are in a relay — write, check, revise — and the checking agent's feedback changes what the producer agent does next. That's not parallel independent judgment, so it doesn't fit the definition of voting."
    }
  ]
}
```

## Another Way to Collaborate: Hand Control Off Outright

The patterns so far share one thing: the orchestrator (or the connecting node in a pipeline) stays in charge of the whole thing, and subagents hand results back when they finish rather than keeping the wheel and directing what comes next. But there's a completely different idea for collaboration — **handoff**: "Handoffs: Peer agents hand off control to a specialized agent that takes over the conversation. This is decentralized."[^S4]

The core difference between handoff and orchestrator-subagent isn't only who holds control — it's also that the agent taking over sees a completely different amount of information. The docs are explicit: "When a handoff occurs, it's as though the new agent takes over the conversation, and gets to see the entire previous conversation history."[^S5] That's the default behavior, and there are configuration options like input filters to change how much history the new agent sees. This is the exact opposite of the subagent mechanism from Lessons 2 and 3: subagents start from a fresh, isolated context and don't see the earlier conversation[^S3], while a handoff's receiving agent sees the full history by default, because it isn't dispatched to do one isolated task and hand a result back — it genuinely takes over the conversation and carries on with the user or the next stage from there.

This difference decides which situations each style fits. Orchestrator-subagent fits splitting out a batch of independent subtasks where each hands back a conclusion and the central node stays in charge of the whole. Handoff fits the case where, as the conversation moves along, you realize a more specialized agent should take it from here, and you hand the whole conversation over intact — say, in customer support, a general support agent judges that the user's issue involves a refund and hands the entire conversation to an agent that specializes in refunds, so the user doesn't have to describe the problem all over again. This transfer of control still happens inside a single run, though: "Handoffs stay within a single run."[^S5]

<!-- exercises -->
## 💻 Exercises

### Level 1: Match Three Tasks to Collaboration Patterns

For each of the three tasks below, decide whether it's a better fit for pipeline, producer-reviewer, or multi-perspective voting, and explain why.

1. "Translate a technical document into another language, then check whether the specialized terminology is used consistently in the translation, and finally format it to the company's document template."
2. "Review a draft contract and find every clause that might carry legal risk, trying hard not to miss a single risk."
3. "Write the core code for a recommendation algorithm, aiming to optimize its performance as much as possible, with several rounds of polishing allowed until it's satisfactory."

<!-- rubric -->
- All three tasks get a clear pattern call
- The reasoning shows each pattern's key feature (fixed steps / looping back / parallel independent judgment), not just a conclusion
- Doesn't treat "multiple agents are involved" as automatically meaning one specific pattern

<!-- answer -->
1. Pipeline. Translation, terminology consistency, and formatting are three fixed steps with a clear order of dependencies; each step processes the previous step's output, there's no sending work back to redo based on a check, and it ends once the three steps are done.
2. Multi-perspective voting. "Trying hard not to miss a single risk" means a miss is expensive, so it fits using several independent review angles (say, one focused on payment terms, one on breach liability, one on intellectual property) each checking the same contract; as long as one angle flags a risk it's worth attention, trading multiple perspectives for wider coverage.
3. Producer-reviewer. "Several rounds of polishing allowed until it's satisfactory" is exactly the write-a-draft, get-feedback, revise, review-again loop; the round count isn't fixed, and it stops only once it converges on a satisfactory version.

<!-- hint -->
Keywords help you place a task fast: a clear "first … then … finally …" description of fixed steps usually points to pipeline; "try not to miss anything" and "multiple angles" point to voting; "polish repeatedly" and "loop until satisfied" point to producer-reviewer.

<!-- hint -->
The easy trap is task 1 — it's also "one step after another," but note it doesn't involve "send it back to rewrite if the check fails." The three steps are strictly one-directional, and that's what makes it a pipeline rather than producer-reviewer.

### Level 2: Pick an Approach for a Budget-Limited Security Review

The task: before submission, review a piece of code for security vulnerabilities, with a budget of at most 3 LLM calls, aiming to maximize the odds of finding real vulnerabilities. Decide which collaboration pattern to use, and explain exactly how to configure those 3 calls.

<!-- rubric -->
- The chosen approach is multi-perspective voting, not producer-reviewer or pipeline
- Explains why, under this budget constraint, voting beats repeated looping and polishing
- Gives a concrete split of the 3 calls (say, focusing on different vulnerability types)

<!-- answer -->
Multi-perspective voting fits. The task's core need is "maximize the odds of finding real vulnerabilities" — a miss is expensive and you want wider coverage from multiple angles, which is exactly voting's strength. Producer-reviewer's round count is uncertain, and under a hard budget of only 3 calls you'd likely burn through the calls before the loop finishes polishing; spending the 3 calls directly on parallel independent reviews is more predictable. Concrete setup: use the 3 calls to review the same code independently, each focused on a different vulnerability type — the first on injection flaws (SQL injection, command injection), the second on permission and privilege-escalation issues, the third on sensitive-information leaks (keys, private data in logs). As long as one call flags a problem it's worth a human review, trading three different angles for wider coverage than a single review.

<!-- hint -->
Rule out producer-reviewer first — its call count isn't fixed in advance; it depends on how many rounds it takes to converge, which doesn't sit well with the task's hard "at most 3 calls" budget.

<!-- hint -->
If all 3 calls use the same prompt to review the same code, the payoff is limited; having each call focus on a different category of problem is what actually widens coverage — which is the point of the official example's "several different prompts" each reviewing.

<!-- /exercises -->

## Recap

- **Pipeline** splits a task into a chain of order-dependent fixed steps, each processing the previous step's output[^S2]; good for tasks with a natural order that don't need work sent back.
- **Producer-reviewer** is a write-a-draft, get-feedback, revise, review-again loop that runs until it converges[^S2]; good for tasks whose output quality needs repeated polishing, with cost driven by the round count, so it usually needs a maximum round cap.
- **Multi-perspective voting** has several agents judge the same content in parallel and independently, flagging it as soon as any one angle finds a problem[^S2]; good for situations where a miss is expensive and you'll pay several times the cost for wider coverage, with cost roughly the single-run cost times the number of agents judging.
- To choose among the three, look at the shape of the task: does it have a natural order of steps, does it need repeated polishing, and is a miss expensive — the three questions point to pipeline, producer-reviewer, and multi-perspective voting respectively.
- **Handoff** is a different collaboration idea: agents hand control off to each other outright, the receiving agent takes over the conversation and by default sees the entire previous conversation history[^S5], the opposite of orchestrator-subagent's mechanism where subagents start from a fresh, isolated context and only return a conclusion[^S3] — a handoff stays within a single run and fits the case where a more specialized agent should take over the conversation from here[^S4].

[>> Lesson 5: Failure and Coordination](./05-failure-and-coordination.md)
