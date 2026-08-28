# Lesson 3: Writing Prompts for Delegation

> Learning goals:
> - Write a self-contained delegation prompt that doesn't rely on the subagent seeing the conversation between you and the orchestrator
> - Spell out the task's scope, boundaries, and which sources to use inside the delegation prompt itself
> - Explain the "one problem domain, one agent" principle and what breaking it costs you
>
> Prerequisites: Finish Lesson 2 and understand the orchestrator-subagent architecture and context isolation | Previous: [Lesson 2 <<](./02-orchestrator-and-subagents.md) | Next: [Lesson 4 >>](./04-collaboration-patterns.md)

## Recap: Anything the Subagent Can't See, You Have to Write In for It

Lesson 2 covered one mechanism that matters here: "Each subagent starts with a fresh, isolated context window. It doesn't see your conversation history, the skills you've already invoked, or the files Claude has already read. Claude composes a delegation message that summarizes the task, and the subagent works from there."[^S3] This lesson makes that concrete. It means all the background you talked through with the user at the orchestrator level, the tradeoffs you settled in earlier rounds, the offhand constraint the user tossed in — the subagent knows none of it. The only thing the subagent knows is whatever words you wrote into this one delegation task.

This isn't a gentle reminder, it's a hard constraint: **the quality ceiling of the delegation prompt sets the quality ceiling of what the subagent produces**. Anything the prompt doesn't spell out, the subagent will either guess at, skip, or invent an assumption for and keep going. Guess right and you got lucky. Guess wrong and that whole subtask is basically wasted.

## Self-Contained: The Prompt Has to Say the Whole Thing on Its Own

**Self-contained**: after reading a delegation prompt, the subagent needs no extra background to work out accurately what it should do. There's a simple test for whether a prompt is self-contained. Pull it out on its own, strip away all the context between you and the orchestrator, and read it cold. If you still have to *guess* to fill in the task details, the prompt fails the test.

Take the Lesson 1 example of researching pricing across three cloud providers. If the orchestrator hands the subagent a task that says only "look up AWS pricing," that one line carries enough information for the orchestrator itself — because the orchestrator's context still holds the background of "why we're looking this up," "who we'll compare it against afterward," and "what dimensions we're comparing on." But the subagent can't see any of that. What it receives is one lonely line, "look up AWS pricing," and it's left to guess: pricing for which product categories? Just current prices, or the changes over the past year? What should the deliverable look like once it's found? Every guess is a bet that can go wrong.

## Spell Out Scope and Constraints: What to Do, What Not to Do, Which Sources to Use

The official guidance lists what a solid subagent task description should contain: "Each subagent needs an objective, an output format, guidance on the tools and sources to use, and clear task boundaries. Without detailed task descriptions, agents duplicate work, leave gaps, or fail to find necessary information."[^S1]

Break that list open. "Objective" and "output format" are easy to grasp. The two that get skipped are the last pair — **source guidance** and **task boundaries**. Source guidance tells the subagent where to look for the answer: the official pricing page, a third-party price-comparison site, or both with the official page taking precedence. Task boundaries tell the subagent this run only covers this slice, don't reach beyond it: only current prices, no historical price changes; only the main product lines, don't list out every obscure service. Miss those two and the subagent tends to drift one of two ways. It either misses information you actually wanted, or it fetches far more than you wanted and burns tool calls and tokens you could have saved.

Rewritten as a self-contained task description with clear scope, the cloud-provider research looks roughly like this:

```json
{
  "objective": "Research the current pricing structure of AWS's main compute service (EC2), focused on the two billing models: on-demand instances and reserved instances",
  "scope": "Only look up pricing in effect right now, no historical price changes; only cover general-purpose and compute-optimized instance types, no need to cover every instance family",
  "sources": "Use the AWS official pricing page as the source of truth; if the official page isn't clear enough, you may supplement with the official AWS pricing calculator",
  "output_format": "A text summary under 300 words covering: the hourly price range for on-demand instances, the discount reserved instances offer relative to on-demand, and a one-line conclusion on which billing model suits which use case"
}
```

Pulled out on its own, this description lets the subagent judge accurately "what to look up, how far to take it, what to deliver" without knowing anything the orchestrator discussed internally.

## The Counterexample: Vague Instructions Leave Subagents to Improvise

What actually goes wrong when you don't spell out scope and boundaries — the official team gave a real example from practice: "We started by allowing the lead agent to give simple, short instructions like 'research the semiconductor shortage,' but found these instructions often were vague enough that subagents misinterpreted the task or performed the exact same searches as other agents."[^S1]

"research the semiconductor shortage" reads like it hands over a task, but it pins down nothing — over what time range? Focused on the supply side, the demand side, or policy impact? Delivered in what form? Three subagents handed the same vague instruction will very likely all search toward "the causes of the semiconductor shortage," the angle that comes to mind first, and the result is three heavily overlapping bodies of research, while the angles that actually needed coverage (say, the impact on downstream industries, or how different countries responded) go untouched. This is the root, at the prompt level, of the "duplicated work" problem from Lesson 2 — it's not that the subagents won't listen, it's that the task description itself never drew the boundaries.

```agentmentor-check
{
  "id": "mac-zh-03-vague-instruction",
  "label": "Is this delegation instruction good enough",
  "prompt": "The orchestrator sends the same instruction to three subagents: \"Take a look at this company's recent product activity.\" Each subagent searches around on its own, and what they hand back overlaps heavily while also missing the thing the orchestrator cared about most — \"new feature releases in the last six months.\" Where's the problem?",
  "whyHere": "We just covered how vague instructions cause subagents to misinterpret the task or run duplicate searches against each other. This gives a concrete duplicated-work case to check whether the learner can pinpoint the root cause as \"the task description lacks scope and boundaries\" rather than blaming weak subagent ability or bad luck.",
  "mode": "single",
  "choices": [
    {
      "id": "a",
      "text": "The subagents' search ability isn't strong enough; you should swap in a more capable model",
      "correct": false,
      "feedback": "The problem isn't model capability. The official real-world case shows that even the same batch of subagents, handed a vague instruction like \"research the semiconductor shortage,\" will misinterpret the task and run duplicate searches against each other — because the instruction itself sets no scope, which has nothing to do with how strong the model is. A stronger model won't fix an instruction that lacks boundaries."
    },
    {
      "id": "b",
      "text": "This instruction never spells out the objective, scope, and output format, so the subagents can only search by their own reading of it, naturally piling onto the most obvious angle in duplicate while missing the angle the orchestrator actually wanted",
      "correct": true,
      "feedback": "Correct. \"Take a look at recent product activity\" doesn't say which specific aspect to focus on (like \"new feature releases in the last six months\"), and draws no scope or output format, so the subagents can only search by their own reading and tend to cluster on the most obvious angle, producing heavy overlap while the specific angle the orchestrator cared about goes uncovered. This is exactly what the official guidance means by \"vague instructions lead to misinterpreting the task or duplicate searches.\""
    },
    {
      "id": "c",
      "text": "The three subagents should sync their search progress with each other to avoid searching the same content",
      "correct": false,
      "feedback": "This amounts to asking the subagents to share context, but Lesson 2 already covered that the default mechanism is each subagent starting from an isolated context and receiving only the task description the orchestrator wrote for it, so it can't see the others' work either. The official system hit exactly this trap early on: multiple agents \"distracting each other with excessive updates\"[^S1], filling up each other's attention. The real fix is to write each subagent's scope and boundaries clearly at delegation time, preventing overlap at the source, rather than relying on subagents to coordinate at runtime after the fact."
    }
  ]
}
```

## One Problem Domain, One Agent

Beyond writing a single prompt clearly, how multiple subagents split the work also follows a principle you can distill from official practice — the official team never named it, this naming is ours: **one problem domain, one agent** — each subagent should own only one class of clearly bounded problem, rather than having a single subagent juggle several unrelated things at once.

The official system has a direct example: they set up a dedicated CitationAgent, "a CitationAgent, which processes the documents and research report to identify specific locations for citations. This ensures all claims are properly attributed to their sources."[^S1] Finding where citations go is a completely different kind of work from "researching some company's pricing strategy" — the former is checking and locating, the latter is searching and judging. Hand both to the same subagent and it has to switch back and forth between two entirely different modes of thinking, and its task description grows long and tangled from trying to serve two objectives, easy to shortchange one for the other. Split into two focused subagents, each one's task description stays simple and clearly bounded — which echoes the yardstick from Lesson 1: if it can be split into independent subtasks, it's worth splitting.

<!-- exercises -->
## 💻 Exercises

### Level 1: Critique a vague instruction and rewrite it

The orchestrator's delegation instruction to a subagent is: "Take a look at this open-source project's recent issues and find anything worth paying attention to." Point out which elements this instruction is missing, and rewrite it as a self-contained task description with clear scope (you can use the JSON structure from the Lesson 3 example, or your own format, but it has to cover all four element types: objective, scope, sources, and output format).

<!-- rubric -->
- Points out the specific elements the original instruction is missing (rather than vaguely saying "not clear enough")
- The rewritten task description covers all four element types: objective, scope, sources, output format
- The scope reflects concrete boundaries of "what to look up, what not to" rather than empty adjectives

<!-- answer -->
Elements the original instruction is missing: it never says what time range "recent" means; it never defines the criterion for "worth paying attention to" (by star count, by discussion activity, or by whether it's a bug); it never says which sources to use (the issue list itself, or the linked discussions and PRs too); it never says what format to deliver in.

Rewrite example:

```json
{
  "objective": "From the issues opened in this open-source project within the last 30 days, find the ones labeled as bugs with more than 5 comments",
  "scope": "Only look at issues opened within the last 30 days, no need to cover older historical issues; only look at ones with the bug label, ignore feature-request issues",
  "sources": "Use the project's GitHub repo issue list and the comments under each issue as the source of truth",
  "output_format": "A list where each entry contains the issue title, link, and comment count, sorted by comment count from high to low, at most 10 entries"
}
```

<!-- hint -->
Start by circling every vague word in the original instruction — "recent," "worth paying attention to." Behind each vague word sits a judgment criterion you have to decide on the subagent's behalf. Write those criteria out clearly, and only then is the instruction self-contained.

<!-- hint -->
"Output format" is easy to leave out, but it decides whether the orchestrator can use the result directly once it comes back. Picture what the orchestrator does next after receiving the subagent's reply, and work backward to what the subagent should deliver.

### Level 2: Judge whether a delegation breaks "one problem domain, one agent"

The orchestrator designed this subagent: "Responsible for looking up this company's recent funding news, and at the same time summarizing the copy style of the company's homepage, so the team has a reference when writing copy later." Judge whether this design is sound and explain why; if it isn't, give a more reasonable way to split it.

<!-- rubric -->
- Judges whether the design fits "one problem domain, one agent" and explains why
- The reasoning reflects how these two tasks differ in nature (rather than just saying "feels off")
- The proposed split (if judged unsound) clearly separates into independent subagents

<!-- answer -->
Not sound; it breaks "one problem domain, one agent." Looking up funding news falls into the "search and verify factual data" class of work, which needs judging whether sources are authoritative and whether numbers are accurate; summarizing homepage copy style falls into the "read and distill the tone of writing" class of work, which needs sensitivity to language style and has almost nothing to do with verifying numeric accuracy. Cram both into the same task description and the subagent has to switch between two different modes of work, and the task description itself grows longer and more tangled from covering two objectives, easy to fall short on one of them. The more reasonable split sets up two subagents: one dedicated to verifying funding news, with an output format of structured data like funding round, amount, and date; the other dedicated to reading the homepage copy and summarizing its style traits, with an output format of a few style descriptions plus example sentences.

<!-- hint -->
To judge whether two things are the same "problem domain," ask: do the two tasks call for the same kind of judgment? Verifying numeric accuracy and summarizing writing style clearly call for different criteria.

<!-- hint -->
Compare against this lesson's CitationAgent example — finding citation locations and researching a company's pricing strategy get split into two different subagents precisely because they call for different kinds of work, even though both ultimately serve the same research report.

<!-- /exercises -->

## Recap

- The subagent can't see the orchestrator's conversation history,[^S3] which means a delegation prompt has to be **self-contained**: readable on its own, apart from any conversational background, and still enough for the subagent to judge accurately what it should do.
- A solid task description has to contain an objective, an output format, source guidance, and clear task boundaries; without these, subagents duplicate work, leave gaps, or fail to find necessary information.[^S1]
- The official real-world counterexample proves that vague instructions like "research the semiconductor shortage" lead subagents to misinterpret the task or run the exact same searches as other subagents[^S1] — scope and boundaries aren't optional, they're the key to avoiding duplicated work.
- **One problem domain, one agent** (this lesson's distillation of official practice): each subagent should own only one class of clearly bounded problem, like setting up a dedicated CitationAgent to handle citation locations, splitting work of different natures across different subagents[^S1] so each task description stays simple and focused.
- To judge whether a delegation prompt is good enough, the test is simple: pull it out on its own and read it once, and see whether the subagent has to guess to fill in the task details.

[>> Lesson 4: Collaboration Patterns: Pipeline, Review, Voting](./04-collaboration-patterns.md)
