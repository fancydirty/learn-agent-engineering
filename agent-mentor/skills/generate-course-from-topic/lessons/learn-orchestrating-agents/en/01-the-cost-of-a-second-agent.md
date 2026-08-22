# Lesson 1: The case for one agent

> Lesson objectives:
> - State what a second agent costs, in tokens and in coordination, using published figures with their settings attached.
> - Name the three task properties that made multi-agent work pay off in the one place it was measured.
> - Apply a four-question test to a task of your own and reach a defensible "keep it in one session" or "split it".
> - Explain why the strongest published objection to multi-agent architectures is about decisions rather than about cost.
>
> Prerequisites: You run an agent on real multi-step work | Previous [<< Course contents](./README.md) | Next [02 >>](./02-one-lead-many-workers.md)

## The task that no longer fits

You have a task that has stopped fitting. Maybe it is a migration across forty files, or an audit of a codebase you did not write, or a research question with six independent threads. One session grinds through it, loses the thread somewhere in the middle, and comes back with something that is a third right.

The obvious next move is more agents. Split the work, run the pieces at once, put the results together. It is a natural move and this course is about doing it well.

It is also the wrong move more often than the current enthusiasm suggests, and the first honest thing this course can do is give you the case against. Not a token caveat before the good part — the actual argument, with the numbers, so that when you do split a task you are doing it against a known cost rather than out of optimism.

## Explanation

### What one more agent costs

Start with the price, because it is the least ambiguous part.

Anthropic's team built a research product on this architecture and published what it cost: "in practice, these architectures burn through tokens fast. In our data, agents typically use about 4× more tokens than chat interactions, and multi-agent systems use about 15× more tokens than chats."[^S1] Their conclusion from that number is a constraint, not an advertisement: "For economic viability, multi-agent systems require tasks where the value of the task is high enough to pay for the increased performance."[^S1]

The 15× figure is measured on their own research workload, where subagents do heavy parallel web search, so read it as the shape of the cost on a search-heavy task rather than a constant you can apply to your migration. The direction is confirmed independently. OpenAI's Codex documentation states the same thing structurally: "Subagent workflows consume more tokens than comparable single-agent runs because each subagent does its own model and tool work."[^S9] Two vendors with opposite incentives to undersell the cost, agreeing.

A different Anthropic experiment gives the wall-clock and dollar shape on a build task rather than a search task. One prompt, run two ways: a solo agent took 20 minutes and about \$9; a three-agent harness with a planner, a generator and an evaluator took 6 hours and about \$200.[^S6] That is a single run of each on one prompt, not a repeated trial — but the ratio is worth holding, because the same report says the solo run's central feature "simply didn't work" while the harness run's did.[^S6]

So: roughly an order of magnitude more tokens, and on that build task, roughly twenty times the money and eighteen times the wall-clock. That is the entry fee.

### The gain, and the fine print on it

The headline gain from the same body of work is real and large: "a multi-agent system with Claude Opus 4 as the lead agent and Claude Sonnet 4 subagents outperformed single-agent Claude Opus 4 by 90.2% on our internal research eval."[^S1]

Three pieces of fine print, all from the same source.

It is an internal eval on a research product, not an independent benchmark. The task type is breadth-first search: "Our internal evaluations show that multi-agent research systems excel especially for breadth-first queries that involve pursuing multiple independent directions simultaneously."[^S1]

The mechanism behind the gain is less flattering than the number. Their own analysis: "Multi-agent systems work mainly because they help spend enough tokens to solve the problem... token usage by itself explains 80% of the variance."[^S1] The architecture is, to a first approximation, a way of spending more compute on a problem. That is a legitimate reason to use it. It is a poor reason to believe several agents are collectively smarter than one.

And the same post draws the boundary explicitly: "some domains that require all agents to share the same context or involve many dependencies between agents are not a good fit for multi-agent systems today. For instance, most coding tasks involve fewer truly parallelizable tasks than research, and LLM agents are not yet great at coordinating and delegating to other agents in real time."[^S1]

Read that last sentence twice if your task is a coding task. The team that published the 90.2% gain is telling you their own result probably does not transfer to your migration.

### The evidence from outside the vendors

Vendor posts report their successes. A peer-reviewed study of the general population of multi-agent systems reports what happens on average, and it opens flatly: "Despite enthusiasm for Multi-Agent LLM Systems (MAS), their performance gains on popular benchmarks are often minimal."[^S4]

That study, MAST, annotated over 1,600 execution traces across seven open-source multi-agent frameworks and built a taxonomy of fourteen failure modes from them.[^S4] The population matters for how you read it: these are research frameworks — MetaGPT, ChatDev, AG2 and others — running on GPT-4-era and Claude-3-era models, not the coding agent on your machine today. The percentages describe that population.

What survives the caveat is the *shape* of the failures. The most common single mode was step repetition at 15.7% — agents redoing work that had already been done. Not recognising task completion came in at 12.4%, and disobeying the task specification at 11.8%.[^S4] These are coordination failures, not capability failures. The authors' own conclusion is that the failures "require more sophisticated solutions" than better models, since they arise from "organizational design and agent coordination rather than the limitations of individual agents."[^S4]

Two readings follow, and both are true. Coordination is where multi-agent systems break — which is the case against. And coordination is a design problem you can work on — which is why the rest of this course exists.

### The objection that is not about cost

The sharpest published argument against this architecture is not economic. Cognition's engineering blog makes it, and the mechanism is worth getting exactly right because everything in Lesson 5 depends on it.

Their setup is the architecture you were about to build: an agent that "breaks its work down into multiple parts, starts subagents to work on those parts, combines those results in the end." Their verdict: "This is a tempting architecture, especially if you work in a domain of tasks with several parallel components to it. However, it is very fragile."[^S3]

The worked example is a Flappy Bird clone split into "build a moving game background with green pipes and hit boxes" and "build a bird that you can move up and down." What comes back is a background that looks like Super Mario Bros and a bird that moves nothing like the one in Flappy Bird. "Now the final agent is left with the undesirable task of combining these two miscommunications."[^S3]

The obvious repair is to copy the original task down to every worker. They anticipate it and say why it is not enough: "in a real production system, the conversation is most likely multi-turn, the agent probably had to make some tool calls to decide how to break down the task, and any number of details could have consequences on the interpretation of the task."[^S3] And even with the full context shared, a second failure appears: "you might end up with a bird and background with completely different visual styles... The actions subagent 1 took and the actions subagent 2 took were based on conflicting assumptions not prescribed upfront."[^S3]

Which yields their two principles: "Share context, and share full agent traces, not just individual messages," and "Actions carry implicit decisions, and conflicting decisions carry bad results."[^S3]

The second one is the load-bearing idea in this course. Every action an agent takes embeds decisions it never announced — what counted as "green pipes", which layer to look at, whether the vendored code was in scope. Those decisions shape the result and do not travel with it. When two workers make incompatible ones, nothing reports a conflict; you get two defensible outputs that do not fit together, and a synthesiser holding both.

This is a position argued on a vendor engineering blog, not a measurement, and it is stronger than what this course recommends — they conclude "The simplest way to follow the principles is to just use a single-threaded linear agent."[^S3] But the mechanism they name is real, and it is why Lesson 5 exists at all.

### The default, and what moves you off it

The general form of the rule predates all of this. Anthropic's patterns essay states it as: "we recommend finding the simplest solution possible, and only increasing complexity when needed. This might mean not building agentic systems at all. Agentic systems often trade latency and cost for better task performance, and you should consider when this tradeoff makes sense."[^S2] That post is from December 2024 and is cited here as a durable design position rather than a claim about what any current system does.

A more recent restatement puts a maintenance obligation on it: "every component in a harness encodes an assumption about what the model can't do on its own, and those assumptions are worth stress testing, both because they may be incorrect, and because they can quickly go stale as models improve."[^S6] The same report describes removing scaffolding after a model upgrade made it unnecessary, and lands on: the extra agent "is worth the cost when the task sits beyond what the current model does reliably solo."[^S6]

That is the test. Not "is this task big" — big tasks routinely fit in one session — but "is this task beyond what one session does reliably." Those are different questions, and the second one has an answer you can find by trying.

```agentmentor-check
{
  "id": "orchestrating-agents-when-not-to-split",
  "label": "Judge which task earns a second agent",
  "prompt": "Four tasks are on your list this week. Each one is too big to be comfortable in a single session. Using the evidence from this lesson — the token multiple, the dependency boundary, and the implicit-decisions objection — which one is the strongest candidate for splitting across several agents?",
  "whyHere": "The reflex after reading a 90.2% figure is to split whatever is largest. The published boundary is about dependency structure, not size, and the task most people pick is the one where independence is an illusion. This forces the judgment before the mechanics of Lessons 2 to 4 make splitting feel routine.",
  "copyPurpose": "Have the agent check whether I am choosing to split a task because it is large, rather than because its pieces are genuinely independent and its value justifies roughly an order of magnitude more tokens.",
  "mode": "single",
  "choices": [
    {
      "id": "survey",
      "text": "Find out how each of our six services handles authentication failure, so we can pick one convention",
      "correct": true,
      "feedback": "Six independent reads, no shared state between them, and each returns a short finding — this is the breadth-first shape the measured gain came from. It is also read-only, so the workers cannot make conflicting edits, and their implicit decisions arrive as claims you can check rather than as changes you have to discover."
    },
    {
      "id": "migration",
      "text": "Migrate forty files off a deprecated API, keeping the call sites consistent with each other",
      "correct": false,
      "feedback": "The word doing the damage is 'consistent with each other'. Forty files look independent, but the convention each worker invents is an unannounced decision, and forty of them will not agree — the exact failure the Flappy Bird example describes. This is the case where dependencies exist but are invisible until synthesis."
    },
    {
      "id": "debug",
      "text": "Track down an intermittent failure in the checkout flow that nobody has reproduced yet",
      "correct": false,
      "feedback": "Debugging is sequential by nature: each finding determines what is worth looking at next, so a worker dispatched at the start is working from a picture that is already obsolete. Several agents can test competing hypotheses in parallel, which is a real pattern, but that requires hypotheses — and here you have none yet."
    },
    {
      "id": "refactor",
      "text": "Restructure the payment module along the design we agreed on in yesterday's session",
      "correct": false,
      "feedback": "The whole specification lives in a conversation the workers cannot see, and writing it down is not a formality: the reasoning behind the design is what governs the edge cases. This is the coupled case, and it fails before the cost question is even reached."
    }
  ]
}
```

### Four questions before you split

Pulling the evidence into something you can run in two minutes. This is the course's own arrangement of the sourced findings, not a rule from any single source.

| Question | Split if | Keep it in one session if | Backed by |
|---|---|---|---|
| Do the pieces depend on each other? | Each piece is answerable without the others' results | Any piece needs another's output, or a convention they must share | Dependencies are the named boundary[^S1] |
| Does the work read or write? | Mostly reads and reports | Several workers would edit the same files | Read-heavy first, write-heavy carefully[^S9] |
| Can you specify each piece without your session? | The brief fits in a paragraph a stranger could act on | You would have to reconstruct your reasoning | Traces do not travel[^S3] |
| Is the result worth roughly 10× the tokens? | The task is high-value or currently unfinishable | It is merely large | Value must exceed the cost[^S1] |

Four yeses means split. One no is usually enough to stay put, and the second row is the one people override and regret.

There is a fifth constraint that no vendor post emphasises and that a practitioner names plainly: you have to read the output. "AI-generated code needs to be reviewed, which means the natural bottleneck on all of this is how fast I can review the results."[^S12] His resolution is not to parallelise less but to parallelise the work that does not queue up for review — research questions, small maintenance, and work built from a specification he wrote himself, of which he notes: "Code that started from your own specification is a lot less effort to review."[^S12] That is one practitioner's account rather than a measurement, but it points at something the token figures miss: five workers can produce more output than you can check, and unchecked output is not progress.

## Worked example: a task that fails the test

A real-shaped case, run through the four questions with the reasoning at each step.

**The task.** A service has grown to about 200 endpoints. You want to add structured logging to all of them, consistently, before the next incident review.

It is too big for one session. Ten workers, twenty endpoints each, looks obvious.

```text
Q1. Do the pieces depend on each other?

    Surface answer: no. Endpoint 47 knows nothing about endpoint 112.

    Real answer: yes, through the log format. Every worker must choose
    field names, decide what gets redacted, decide whether the request
    id comes from the header or gets generated. None of those choices
    is in the task description, so each worker invents one.

    This is "actions carry implicit decisions" with a concrete face:
    ten reasonable schemas, no two alike, no error anywhere.  → NO

Q2. Read or write?

    Write, in 200 places. Parallel write-heavy work is the case the
    documentation explicitly flags for conflicts and coordination
    overhead.                                                    → NO

Q3. Specifiable without your session?

    Only after the schema exists. Right now the specification is
    "consistent with what we'd want", which is not a specification.
                                                                 → NO

Q4. Worth 10x the tokens?

    Probably, if it works. But this is the only yes.             → YES
```

One yes out of four. Do not split — yet.

**What to do instead.** Every no in that list is a missing artifact rather than a permanent property, and Q1 is where they all originate. So:

```text
Session 1 (one agent, no delegation):
  Instrument five endpoints, chosen to differ from each other.
  Extract the schema that emerges: field names, redaction rules,
  where the request id comes from, what an error case logs.
  Write it to logging-schema.md. Review it yourself.
```

Now re-run the test. Q1: with the schema fixed on disk, the pieces are genuinely independent — the shared decision has been made once instead of ten times. Q3: the brief is now "apply logging-schema.md to endpoints 1-20, follow the pattern in the five worked examples," which a stranger could act on. Q2 is still a write, so the guard is that each worker owns a disjoint file set and nobody touches the schema.

The general move: **when a decomposition fails, the fix is usually to promote the shared decision into an artifact, not to write longer briefs.** The schema file is doing what a delegation message cannot — carrying a decision to ten workers identically.

This is also what made the largest published parallel-agent build work. Sixteen agents on a C compiler could parallelise while there were many distinct failing tests, because "each agent picks a different failing test to work on."[^S5] Lesson 4 covers what happened when that stopped being true.

## Your turn: run the test on your own task

Take a real task from your own week that felt too big for one session. Fill this in before reading the reference answer.

```text
Task: ______________________________________________

Q1  Pieces independent?        Y / N   because ____________
Q2  Read-heavy?                Y / N   because ____________
Q3  Specifiable without you?   Y / N   because ____________
Q4  Worth ~10x tokens?         Y / N   because ____________

Verdict:  SPLIT  /  KEEP  /  KEEP UNTIL ____________

If any answer is N: what artifact would turn it into Y?
    ____________________________________________
```

Reference answer, on the pattern rather than your specific task:

```text
Most real tasks come out KEEP UNTIL rather than KEEP or SPLIT, and that
is the useful verdict. A flat KEEP means the task is small enough that
this whole course does not apply. A flat SPLIT on the first pass usually
means Q1 was answered from the task's surface — the pieces looked
independent because nobody had yet asked what convention they share.

The productive answer names the artifact that unblocks the split: a
schema, a spec, an interface, a list of what "done" means for each
piece, a worked example. That artifact is almost always cheaper to
produce in one session than the incoherence is to repair afterwards.

The one honest exception to Q4: sometimes the task is not high-value,
it is currently impossible. If one session cannot finish it at any
price, the comparison is not 10x tokens against 1x tokens — it is 10x
tokens against not doing the work. That comparison is easier to win.
```

Test your Q3 answer this way: write the delegation brief for one piece, then reread it as someone who was not in your session. Anything you understand only because of the last two hours has to be on the page. That difficulty is not a prompting problem to push through — it is the measurement of coupling, arriving before you pay for it.

```agentmentor-action
mode: reasoning_audit
label: Argue me out of splitting the task I just decided to split
description: Tests whether my four-question verdict rests on the pieces being genuinely independent, or on the task merely being large and my patience being short.
purpose: I want the strongest available case against my own decomposition before I spend an order of magnitude more tokens finding out it was wrong.
rules:
  - Ask me to state the task and my four answers before you comment on any of them.
  - Attack Q1 first and hardest — ask what convention, format, or assumption every piece would have to share, and whether I have written it down anywhere.
  - If I claim the pieces are independent, ask me to name what each worker would have to decide on its own, and whether two different answers would be visible to me.
  - Do not help me plan the decomposition. This turn is only for finding out whether it should happen.
  - One question at a time, and take my answers seriously rather than agreeing with them.
```

<!-- exercises -->
## 💻 Exercises (point these at your own real environment)

### Level 1 (warm-up)

Take the three largest tasks currently on your list and run all three through the four-question test. Write each verdict with its reason, and for every N answer, name the artifact that would flip it to Y.

How: work from tasks you actually intend to do, not hypotheticals — the test only teaches you something when the answer costs you. Write the results in a scratch file so you can compare them against what you actually do later.

<!-- rubric -->
- Three real tasks, each with four answers and a stated reason per answer.
- At least one task ends in KEEP or KEEP UNTIL, with the blocking question named.
- Every N answer has a specific artifact attached — a file you could write, not "more clarity".
- For any task you verdict as SPLIT, you can state roughly what it would cost against doing it in one session.
<!-- answer -->
The expected distribution is roughly one SPLIT, one KEEP UNTIL, one KEEP. If all three come out SPLIT, Q1 is being answered from the task's surface — go back and ask, for each one, what convention every piece would silently have to share. If none come out SPLIT, check whether you are answering Q4 by comparing against a single session that actually finishes; when one session cannot finish the task at all, the comparison changes.

The artifact question is the one that pays. A recurring pattern is that the same artifact unblocks Q1 and Q3 at once, because both are asking about the same missing thing: a decision that currently exists only in your head. Naming it is most of the work of Lesson 2.

A common mistake here is treating "I would have to write a spec first" as a reason not to split. It is a reason not to split *today*. The spec is usually an hour, and it is the same hour you would otherwise spend reconciling ten inconsistent outputs — except that this hour happens before the tokens are spent rather than after.
<!-- hint -->
For Q1, do not ask whether the pieces touch each other. Ask what each worker would have to invent on its own, and whether you would notice two different inventions.
<!-- hint -->
For Q4, price against the alternative you would actually pick, not against a hypothetical perfect single session. If the honest alternative is "the task does not get done," say so.

### Level 2 (advanced)

Find a task you already ran across multiple agents, or already split by hand into parallel sessions, and audit it against the four questions after the fact. Identify which question you would have failed at the time, and whether the failure showed up in the result.

How: pick something you can still inspect — the outputs, the diffs, the reports. Compare the pieces against each other rather than against the task, since the coupling failures are only visible between pieces.

<!-- rubric -->
- One real past decomposition, with what it produced described concretely.
- A retrospective answer to all four questions as they stood at the time.
- At least one inconsistency between pieces identified, or a specific reason you can rule inconsistency out.
- Each inconsistency traced to an unannounced decision one worker made, named in that worker's terms.
- A statement of whether the split was worth it, with the cost you actually paid.
<!-- answer -->
The instructive result is finding an inconsistency you had not noticed until you compared the pieces side by side — different naming, different error handling, different depth of coverage, one worker solving a narrower problem than the others. That is the implicit-decisions mechanism showing up in your own work, and it is invisible from any single piece because each piece is defensible on its own terms.

A common mistake in this exercise is to conclude that a particular worker performed badly. On the information it had, it usually performed well. The question that produces something useful is which decision it had to make that nobody made for it — and then whether an artifact could have made that decision once, for everyone.

If you genuinely find no inconsistencies, check the read/write split. Read-only fan-outs frequently come back clean, which is exactly why they are the shape the published gains came from, and why every documented recommendation starts there rather than with parallel edits.
<!-- hint -->
Put two workers' outputs side by side and read them as a reviewer who does not know which was which. Differences in style, depth, or vocabulary are decision divergence, not noise.
<!-- hint -->
If the pieces agree perfectly, ask whether they were doing genuinely different work or whether you paid several times for overlapping coverage. Duplicated work is the other documented failure of vague dispatch.
<!-- /exercises -->

## Where this leaves the default

You now have the case against, in the form you can act on: roughly an order of magnitude more tokens, a headline gain that is mostly an artifact of spending more compute, a measured failure population dominated by coordination rather than capability, and an argument that the decisions workers make silently are what actually breaks the result.

Against that, the four questions, and one clear positive finding: when the pieces are genuinely independent, the work is read-heavy, and each piece can be specified without your session, this architecture does something a single session cannot.

The rest of the course assumes you have passed the test on a real task. The next question is what a worker actually needs from you — because the most common failure in the measured population is not a worker doing its job badly, it is a worker doing a job nobody specified.

<!-- Prev/Next links live in the objectives block at the top of this file. -->
