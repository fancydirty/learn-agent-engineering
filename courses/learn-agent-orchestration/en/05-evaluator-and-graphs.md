# Lesson 5: The Review Loop, and Composing Patterns into a Graph

> Learning goals:
> - Implement a review-and-refine loop (generate a draft, evaluate it, revise based on feedback), and use two decision criteria to determine whether this loop is worth building
> - Write stopping conditions smarter than "max N rounds," and place deterministic checks before the judge
> - Compose five patterns into what this lesson calls a "graph," and document in your own materials that this visual system is a custom metaphor anchored to a specific primary source quote
>
> Prerequisites: Read Lessons 1–4 (who holds the plan, chaining and routing, parallelization, orchestrator-workers), can hand-write a harness loop driven by `stop_reason` | Previous: [<< Lesson 4](./04-orchestrator-workers.md) | Next: [Lesson 6 >>](./06-build-a-graph.md)

## The draft that's always one step short

You ask an agent to write a database migration plan. The first draft comes back looking reasonable: background, steps, time window all present. But you spot two holes in one glance—the rollback section just says "roll back if necessary," and there's no risk rating anywhere. You type two lines of feedback pointing these out, the second draft comes back, both holes are filled, and the whole thing jumps up a quality tier.

You've repeated this process dozens of times. Every time it's the same: output falls short, human provides two sentences of feedback, output gets noticeably better.

The problem isn't that the model writes poorly. The problem is that **your two sentences of feedback aren't hard to produce**. "Rollback steps must include specific commands," "Each step needs a risk rating"—these are things a checklist could cover. If you can articulate it clearly, the model can probably articulate it too. So why does it have to be you saying it every time?

This shape is worth writing as a loop.

## Review-and-refine: Writing "revise once more" into control flow

The primary source defines it in one sentence: one LLM call generates a response while another provides evaluation and feedback in a loop[^S1].

The first four lessons' four patterns each have their own topology: chaining decomposes a task into a sequence of steps, with each step processing the previous one's output[^S1]; routing classifies and then dispatches to specialized followup tasks[^S1]; parallelization runs things simultaneously and aggregates results programmatically[^S1]; orchestrator-workers has a central LLM dynamically break down tasks, delegate to workers, and synthesize results[^S1]. They all share one trait: data flows forward. The review loop is the first pattern **with a back edge**—output loops back into the generation node.

What does it look like in a product? Claude Code's dynamic workflow documentation gives one plain-English description: run a checker, fix what failed, and repeat until it passes or stops making progress[^S5]. Another description covers a different use of the same division of labor: have independent agents adversarially review each other's findings before they're reported[^S5]. That's a one-time cross-review before reporting, with no back edge and no iteration—lumping it into the review loop is this lesson's categorization, not the original text describing the same topology.

### One concept, three names

We need to build an explicit bridge here, or you'll think you're learning three different things.

This series' Course 6, which teaches multi-agent collaboration, calls this "one does the work, one critiques" division **producer-reviewer**. That's our own teaching vocabulary. In primary materials, Claude Code's workflow documentation describes its product use in one sentence: have independent agents adversarially review each other's findings (this lesson's shorthand for that sentence is "adversarial cross-review"). The same shape has two names in primary sources: Anthropic's pattern reference calls it **evaluator-optimizer**[^S1]; Claude Code's workflow documentation doesn't give it a name, just describes the use—that sentence about adversarially reviewing each other's findings[^S5].

Three names, one shape. The difference is which angle you're looking from: when discussing collaboration roles you see two actors, when discussing orchestration patterns you see a back edge, when discussing product capabilities you see a reusable quality technique.

There's one more division of labor to clarify. This series' Course 10 spends an entire course teaching you **how to be a good judge**: how to write rubrics, how to constrain the judge's output format, why the judge needs its own independent context, why the worker shouldn't also be the judge. That course teaches the quality of the judge itself. This lesson doesn't repeat those topics. This lesson teaches **how to wire the judge into control flow**—where in the loop it sits, when it runs, how many rounds it runs, when it stops.

## When this loop is worth building

The primary source's applicability criteria: this workflow is particularly effective when we have clear evaluation criteria, and when iterative refinement provides measurable value; the two signs of good fit are, first, that LLM responses can be demonstrably improved when a human articulates their feedback; and second, that the LLM can provide such feedback[^S1].

You've seen this quote before. This series' Course 10 quoted this exact sentence when answering the question "is a review-revise loop worth building." Same criteria, reframed in an orchestration context—except this time you're implementing the answer as a loop in control flow.

Broken out, these two signs each guard against different failure modes:

**The first sign guards against "revision doesn't help."** Some tasks won't get better in a second draft no matter how clearly you state the feedback—because the problem is missing input data or a vaguely defined task, not the wording of the output. In this case, building a loop just means you're paying twice to get two equally unusable versions. The validation method is crude but effective: **do it manually three times yourself**. How many of those three were "clearly better after human feedback"? If two out of three were "feedback didn't help," don't build the loop.

**The second sign guards against "the judge can't give that kind of feedback."** Even if human feedback works, you still have to ask: can the model itself provide the same kind of feedback? If your feedback depends on things only you know (what this customer complained about last quarter, what legal verbally briefed last week), the model doesn't have that information, so the feedback it gives will be something else entirely. In that case, either feed that information into the judge's prompt—turn it into criteria the model can evaluate—or accept that this step needs a human.

**There's a precondition that kicks in even earlier than these two signs: evaluation criteria must be clear.** When criteria aren't clear, the loop reliably produces a specific kind of failure—the judge gives feedback pointing in different or even contradictory directions each round, output ping-pongs between two versions, rounds burn out, and the final draft is worse than the first. This isn't the loop's fault. It's that the criteria haven't been defined yet.

### Deterministic checks come before the judge

The primary source's definitional distinction between deterministic and non-deterministic systems: deterministic systems produce the same output every time given identical inputs, while non-deterministic systems—like agents—can generate varied responses even with the same starting conditions[^S3].

Judges are non-deterministic. Every rule that "code can decide definitively" handed to a judge means you're using something that might give different results each time to evaluate something that should give the same result every time—while also paying for an extra model call.

This series' Course 10 calls this discipline layered scoring: use code for what code can decide, only hand to the model what code can't. This lesson copies it straight into the loop's node ordering. The quote from Lesson 2 still applies here—you can add programmatic checks at any intermediate step to ensure the process is still on track[^S1]. Every draft in the loop is an intermediate step.

Applied to the migration plan example: "Does each step have a corresponding rollback command?" can be decided definitively with regex or structured parsing—that's a gate. "Are the rollback commands written credibly?" needs a judge. The former failing doesn't even wake up the judge; just tell the writer which steps are missing and move on.

## The loop's code skeleton

```javascript
const MAX_ROUNDS = 3;

async function reviewLoop(task) {
  let draft = null;
  let bestDraft = null;
  let feedback = null;
  let bestScore = -1;
  let rounds = 0;

  while (rounds < MAX_ROUNDS) {
    rounds++;

    // Node A: generate. First round feedback is null, later rounds rewrite with previous feedback
    draft = await runAgent(writerPrompt(task, draft, feedback));

    // Deterministic gate before judge: don't pay to ask the model what code can decide
    const gate = checkDeterministic(draft);
    if (!gate.pass) {
      feedback = gate.problems.join('\n');
      continue;
    }

    // Node B: judge. Independent context, independent prompt, doesn't see the writing process
    const verdict = await runVerdict(rubricPrompt(task, draft));
    if (verdict.pass) {
      return { draft, rounds, reason: 'passed' };
    }

    // Stopping condition: this round didn't beat the previous round, stop burning another one
    if (verdict.score <= bestScore) {
      return { draft: bestDraft ?? draft, rounds, reason: 'no-progress' };
    }

    bestScore = verdict.score;
    bestDraft = draft;
    feedback = verdict.notes;
  }

  return { draft: bestDraft ?? draft, rounds, reason: 'max-rounds' };
}
```

A few details worth calling out individually.

**`runAgent` is a complete harness loop.** This hasn't changed since Lesson 2: every `await runAgent(...)` in this script has, behind it, the `stop_reason`-driven loop from this series' Course 7 running. This is just another layer of code-written control flow wrapped around the loop.

**These `reason` values are different outcomes, don't collapse them into a boolean (real systems often need to subdivide further—for example, gate repeatedly failing gets its own bucket).** `passed` can be delivered directly; `max-rounds` means rounds burned out without passing, likely needs human handoff; `no-progress` means the model got stuck, burning more money won't make it better. These three outcomes should be three separate lines in your observability data—the logging approach Course 11 of this series teaches should land on this `reason` field here.

**Gate failure also counts as a round.** Before the `continue`, `rounds` has already incremented. This is intentional: repeatedly failing the gate means the writer's prompt has a problem, letting it retry indefinitely just burns money on the same hole.

**You need both kinds of stopping conditions.** The primary source discussing agent loops says: the task often terminates upon completion, but it's also common to include stopping conditions (such as a maximum number of iterations) to maintain control[^S1]. That's where "max N rounds" comes from—it's a fuse, guaranteeing this code stops under any circumstance. The "no further progress" stopping mechanism comes from elsewhere: run a checker, fix what failed, and repeat until it passes or stops making progress[^S5]. It's smarter than the fuse because it watches **whether this round beat the last round**, not how many rounds have run.

Score not rising means exit—that's the easiest implementation, but not the only one. If your judge doesn't output a score, you can switch to watching **whether the count of failing items decreased**; if the task itself is high-variance, you can switch to "exit only after two consecutive rounds without improvement" with a `stalled` counter. Which one you pick depends on how stable your judge is, not which one sounds sophisticated. (Note the `bestDraft` in the skeleton: exiting when score doesn't rise presumes you're always holding onto the highest-scoring draft; tracking only `bestScore` without `bestDraft` means the `no-progress` and `max-rounds` exits will hand out the worse current version.)

## Composing patterns: This lesson calls it a "graph"

Five patterns, all accounted for. The next question is how to arrange them together.

Official position first: these building blocks aren't prescriptive, they're common patterns that developers can shape and combine to fit different use cases; the key to success, as with any LLM features, is measuring performance and iterating on implementations[^S1].

In other words, for "how to compose," the primary source gives permission, not a recipe. You write the recipe yourself.

### An honest declaration about graph terminology

**This lesson's use of "graph / nodes / edges" throughout is this lesson's own engineering metaphor, not official terminology (the preceding sections have already used "node" and "back edge" with this meaning).**

Copy this sentence into your own architecture documentation. The words "graph," "node," "edge," "DAG," "state machine" appear zero times across all primary sources this lesson cites. The primary source vocabulary is workflows, patterns, orchestrator-workers, fan out—it's discussing a pattern catalog, not topological structure.

We still need to use the word "graph," because when five patterns sit together you need a language to talk about them clearly, and "graph" is the least-effort option. But this metaphor must have an anchor point, or it's just made-up jargon. The anchor is this sentence that actually exists in primary materials: the workflow script itself holds the loop, branching, and intermediate results, while the model's context holds only the final answer[^S5].

That sentence already names all three elements of a graph: loop (back edge), branching (fork point), intermediate results (state). All we're doing is giving each a name.

### Drawing conventions

In this lesson's visual system:

- **Node** = one `runAgent` loop, or a piece of pure code (gate, classification, aggregation, batching). Labeling each node's type is the most valuable action when drawing—it forces you to answer "does this step actually need the model?"
- **Edge** = "whose output feeds whom." An edge isn't a data structure, just the next line of code reading the previous line's variable.
- **State** = script variables. The primary anchor has a sentence here too: intermediate results stay in script variables instead of landing in the model's context[^S5]. **There's no official concept of "a state object passed between nodes"**—that's a phrase we borrowed from other domains; this lesson doesn't build that abstraction, just pass whatever variables you need.

```agentmentor-check
{
  "id": "orc-zh-05-graph-is-ours",
  "label": "A colleague says they can't find “node” or “edge” in the official docs",
  "prompt": "Your team's architecture doc uses “nodes” and “edges” to organize the five orchestration patterns. During review, a colleague leaves a comment: “I searched Anthropic's docs for 'nodes' and 'edges'—found nothing. Are you making up citations?” They're right—this visual system is indeed your own. How do you respond, and what should the doc say?",
  "whyHere": "This lesson just introduced the “graph / nodes / edges” visual system, and it appears zero times in primary sources. This question practices citation honesty: custom organizational metaphors are fine to use, but you must mark them as custom in the doc and state which real quote they anchor to. Course 10's verification principles finish here.",
  "mode": "single",
  "choices": [
    {
      "id": "a",
      "text": "If it's not searchable, it's a problem. Delete all graph terminology from the doc and rewrite using only official words, even if it gets verbose—better safe than misleading.",
      "correct": false,
      "feedback": "That's overreacting. Custom metaphors aren't the same as fabrication—fabrication is disguising custom terminology as official. Deleting the visual system loses the language that organizes the five patterns, making it harder for readers. The issue is just unlabeled sourcing; fix the label, keep the vocabulary."
    },
    {
      "id": "b",
      "text": "Reply: Graph, node, and edge are general software engineering terms used in compilers and dataflow for decades—they're common knowledge and don't need source explanation in the doc.",
      "correct": false,
      "feedback": "That's exactly the problem. The terms are indeed general, but you're using them in the doc as if they're the official classification for this Agent orchestration pattern set—readers will naturally assume “review loop is an official node type in the five patterns.” What's being misread isn't the word “graph” itself, but its relationship to primary sources."
    },
    {
      "id": "c",
      "text": "Add a paragraph at the doc's start: mark that graph / nodes / edges is our team's visual system, not official vocabulary, and point to which source quote it anchors to, then verify citations throughout.",
      "correct": true,
      "feedback": "Right. The cost of custom vocabulary isn't “can't use,” it's “must price.” Mark “this is our visual system,” point to which real quote it anchors to, and readers get both: a useful organizational language and a verifiable citation chain. The colleague's search-failure question also resolves itself—they were searching for official vocabulary, and you never claimed it was official."
    }
  ]
}
```

## Five patterns in this visual system's shapes

```text
Chaining       A ──> B ──> C                    A straight line

Routing           ┌──> B1
               A ─┼──> B2                       One fork point
                  └──> B3

Parallelization   ┌──> W1 ──┐
               A ─┼──> W2 ──┼──> merge          A fan: fan out, then merge
                  └──> W3 ──┘

Orchestrator-     ┌──> W? ──┐                   Fork point is dynamic: how many
  workers      A ─┼──> W? ──┼──> merge          edges, what each does, decided by A
                  └──> W? ──┘                   after seeing input

Review loop    A ──> J ──┐                      One loop with a back edge
               ^         │
               └───no────┘
```

That fourth shape's annotation is worth re-reading. Parallelization and orchestrator-workers are topographically similar in shape, with the key difference being that subtasks aren't predefined but determined by the orchestrator based on specific input[^S1]. Drawn on paper, the difference is "I drew three edges" versus "A drew three edges"—indistinguishable on paper, but very different in code.

### A composition example

Stringing together routing, fan-out, merge, and review loop:

```text
[classify] ─┬─ simple ──> [direct answer] ──────────────────────> deliver
  pure code │
 (keyword + └─ complex ──┬─> [worker1] ─┐
   rules)                ├─> [worker2] ─┼─> {merge} ─> [draft] <──────┐
                         └─> [worker3] ─┘              runAgent │       │
                                                           v      │       │
                                                        {gate} ─no────────┤
                                                           │ pass  │       │
                                                           v      │       │
                                                        [review] ─no──────┘
                                                           │ yes   runAgent
                                                           v
                                                        deliver

Node types: [ ] = runAgent loop    { } = pure code
Edge = whose output feeds whom. {gate} is deterministic check, comes before [review]; gate fail or review no both kick back to [draft].
[classify] is drawn as a model loop rather than {pure code} because the refund/tech/complaint boundary is fuzzy—when boundaries are clear, swap in a traditional classifier (this is layered scoring: use code first when code can decide).
```

Lesson 6 implements **a variant of this graph**: that batch of tickets happens to have acceptance criteria that can all be written as rules, so the [review] layer degrades to a {gate}, and fan-out switches from "one complex item to three workers" to "one batch of tickets, each dispatched to one handler." Which parts changed and why—Lesson 6's opening lists them point by point. Look at the shape here first, code waits until the next lesson.

## Engineering benefits from composition

Moving control flow into code delivers more than just "understandable." A few benefits have primary backing:

**Step-by-step tracking brings recoverability.** The runtime tracks each agent's result as the run progresses, which is what makes a run resumable within the same session[^S5]. Translated into this lesson's visual system: every node in the graph is naturally a checkpoint location—node finishes, result lands in a script variable, that variable is the "where we got to" record. The checkpoint design taught in Course 9 of this series doesn't need a separate foundation here; node boundaries are natural landing points.

**Fine-grained fan-out preserves more progress.** The primary source's words: a workflow that fans work out across many small agents preserves more progress than one long agent[^S5]. One forty-minute long agent crashes, forty minutes gone; forty one-minute small nodes and one crashes, you lose one minute and you know which minute.

**Repeatable quality techniques become reusable.** Moving the plan into code also lets a workflow apply a repeatable quality pattern, not just run more agents: it can have independent agents adversarially review each other's findings before they're reported, or draft a plan from several angles and weigh them against each other, so you get a more trustworthy result than a single pass[^S5]. The key word here is "repeatable"—doing one cross-review manually is an operation, writing it into a script is a capability.

**Deterministic guardrails wrap non-deterministic agents.** Anthropic's multi-agent research system retrospective states: they combine the adaptability of AI agents built on Claude with deterministic safeguards like retry logic and regular checkpoints[^S2]. Translated into this lesson's visual system: the graph's skeleton is deterministic (who calls whom, when to stop, which edge to take on failure), node interiors are non-deterministic. This layering isn't aesthetic preference, it's a prerequisite for making the system operable.

## Composition discipline: Every added layer must pass one gate

Benefits stated, now constraints.

**Every added layer must pass the "measurable improvement" gate.** The primary source says the same thing in two places, with the second explicitly flagged as a reiteration: you should consider adding complexity only when it demonstrably improves outcomes[^S1]. This is especially critical for this lesson—five patterns laid out in front of you, the easiest mistake is using all of them. Adding one node means one more model call, one more place that can fail, one more thing to troubleshoot. Before adding, ask: remove it, do metrics drop? Can't answer means you haven't measured yet.

**Node-level retry and timeout are engineering practice, not official design.** Primary sources mention this only as a subordinate clause (deterministic safeguards like retry logic and regular checkpoints[^S2]). So the following is written as engineering practice; you won't find their endorsement in any primary documentation: wrap every `runAgent` node in a timeout, after timeout either retry or mark this node failed and continue; retry count depends on the node's nature (read-only retrieval nodes can retry several times, nodes with side effects ideally don't auto-retry even once); when a node fails, distinguish "this edge can be skipped" from "the entire graph must stop," don't let one optional node's failure drag down the whole run. These are ordinary distributed-systems common sense, just applied to agents—don't treat them as anything new.

**Depth is bounded.** The product-level reference is right there: by default, a subagent can spawn subagents of its own, up to three layers below the main conversation[^S4]. Three layers isn't a threshold this lesson invented, but the message is clear—nesting depth in real products isn't unlimited, someone seriously thought about where to stop. Your graph should have a similar answer. If your drawn graph has five layers of nesting, suspect the task is decomposed too finely first, don't go thinking about how to support deeper.

## The graph isn't the goal, it's a description of task shape

One failure mode is especially worth preventing at this course's end: **pick a cool topology first, then find tasks to stuff into it.**

The order should reverse. Draw the task's own dependency shape first—which steps must queue (previous step's output is next step's input), which steps don't affect each other (doesn't matter who runs first), which step needs to see input before knowing how many pieces to split into, which step's output needs someone to critique before it's trustworthy. That drawing finished, which patterns to use is basically decided: queuing places are chains, mutually independent places are fans, see-then-decide places are orchestrators, needs-critique places are loops.

Patterns are names for task shapes, not a menu you can pick arbitrarily from.

And above that discipline is one that kicks in even earlier: find the simplest solution possible, and only increase complexity when needed[^S1]. This sentence appeared in Lesson 1, and at this lesson's end it's still the same sentence. After learning five patterns, "one LLM call is enough" remains a completely valid answer—primary sources themselves say that for many applications, optimizing single LLM calls with retrieval and in-context examples is usually enough[^S1].

Complete, runnable composition code is in Lesson 6. This lesson stops here. What you have now: five patterns, one visual system, and a list of when not to use them.

## 💻 Exercises

<!-- exercises -->

### Level 1: Draw two graphs and design stopping conditions for the loops

No code. Use this lesson's visual system to draw an ASCII diagram for each of the two tasks below (in ```text fences), **labeling every node as either `runAgent` loop or pure code**.

**Task one · Customer tickets**: Ticket comes in, classify first (refund / technical / complaint), route by category to different handling flows; after handling, do risk scoring, high-risk ones must pass through a review loop before sending, low-risk ones send directly.

**Task two · 40 module code assessment**: One run assesses 40 modules, batch them and fan out for parallel evaluation, finish and merge, then have one node write the summary report; report must pass a gate (all 40 modules have conclusions? scores in valid range? references parsable?), fail means kick back for rewrite.

After drawing, design stopping conditions for the loop in each graph (task one's review loop, task two's report gate loop): maximum rounds is a required fuse and doesn't participate in selection; between "pass" and "no further progress," decide which is the primary stopping mechanism and explain why you kept or dropped the other.

<!-- rubric -->

- Both graphs label each node as `runAgent` or pure code, and classify, risk-score, batch, merge, gate as pure code (classify using an LLM is also fine if you explain why not a traditional classifier)
- Task one's graph has a real fork point (three or more mutually exclusive edges), task two's graph shows both fan-out and merge actions
- Both loops draw the back edge (fail → back to generation node), not drawn as a straight line
- Each loop retains the maximum rounds fuse and clarifies primary/secondary between "pass" and "no further progress," with reasoning tied to task nature
- "No further progress" is defined as a decidable quantity (score didn't rise, count of failing items didn't decrease), not just "model looks like it didn't improve"
- States what happens after each stopping outcome (deliver / human handoff / escalate), doesn't collapse three outcomes into a boolean

<!-- answer -->

**Task one reference graph**

```text
[classify] ──┬── refund ──> [refund handler] ──┐
  pure code  │                                  │
 (keyword +  ├── tech ──> [tech handler] ──────┤
   rules)    │   runAgent                       │
             └── complaint ──> [complaint handler]
                  runAgent  │  runAgent
                            v
                       {risk score}  pure code (amount threshold / sensitive words / VIP flag)
                            │
               low risk ────┴──── high risk
                  │                    │
                  │              [draft reply] <────────┐  runAgent
                  │                    │                │
                  │              {compliance gate}  pure code
                  │                    │                │
                  │               [review] ──── no ─────┘  runAgent
                  │                    │ yes
                  v                    v
               [send] ─────────────> [send]   pure code
```

Classify marked as pure code is intentional: ticket classification is typical "traditional classification model or algorithm can handle accurately" territory—don't use a model if you don't have to. If your category boundaries are fuzzy and rules can't be written, switching to `runAgent` is also correct, but note the reason in the graph.

**Task one stopping conditions: pass + max rounds.**

Drop "no further progress." Reason: this loop evaluates **compliance**—"didn't pass" means this reply can't go out, it's not a quality score you can compromise on. If you exit because score didn't rise and send anyway, you're using a money-saving rule to release non-compliant content. Max rounds here acts as a fuse: rounds burn out without passing, outcome is **human handoff**, not send. Three outcomes: `passed` → send directly, `max-rounds` → enter human queue with judge's last-round feedback attached, gate repeatedly fails → alert (means draft prompt is broken).

**Task two reference graph**

```text
[read 40 module list]   pure code
          │
      {batch: 5 batches × 8 each}   pure code (concurrency ceiling hardcoded)
          │
   ┌──────┼──────┬──────┬──────┐
   v      v      v      v      v
[assess] [assess] [assess] [assess] [assess]   runAgent × 5, per-module within batch
   │      │      │      │      │
   └──────┴──merge─┴──────┴──────┘   pure code (collect results, log failures, backfill as needed)
          │
     [write summary] <──────────┐   runAgent
          │                     │
     {report gate} ─── fail ────┘   pure code: all 40 modules have conclusions?
          │                          scores 0–100? references parsable?
          │ pass
          v
        deliver
```

**Task two stopping conditions: pass + no further progress.**

This gate checks **enumerable gaps** (which modules lack conclusions, which references can't parse), so "has progress" can be defined very rigidly: did this round's failing-item count drop compared to last round? Dropped, continue; didn't drop, stop—one round goes by with gap count unchanged usually means the root cause is upstream (those modules' assessment results were empty to begin with), rewriting the report node a hundred times won't materialize them. Stopping at this point and handing the gap list plus upstream failure log to a human is more useful than continuing to burn money.

Drop "max rounds" as primary mechanism (you can layer a large value as a backstop fuse, say 10, but it shouldn't normally trigger). Reason: "no further progress" decides earlier and more accurately for this task; the rounds ceiling only gets to play when it fails.

<!-- hint -->

When labeling node types, if you're stuck on "does this step count as pure code," ask: **Given the same input run twice, will this step's output differ?** Will differ = `runAgent`, won't = pure code. Your graph's nodes that do aggregation, filtering, decisions likely all fall into the latter.

<!-- hint -->

When designing stopping conditions, first think clearly **what the next-step action is for each stopping mechanism**. If "no further progress" and "pass" trigger the same action (both deliver), this loop likely doesn't need "no further progress" at all; if three outcomes map to three different downstream handlers, you probably need to keep all three.

### Level 2: Three scenarios, judge whether each loop is worth building

No code. Use this lesson's two decision signs—(1) when a human articulates feedback clearly, output can indeed be demonstrably improved; (2) the LLM can also provide such feedback—to judge each of the three scenarios below, and give your handling recommendation.

**Scenario one · Copy polish**: A marketing landing page headline generator. Product manager says current generated copy is "usable but flat," she provides two or three specific points every time (selling point doesn't land in first sentence, call-to-action too soft, length exceeds mobile two-line limit), and the version after her feedback is noticeably better. Team asks whether to add a review loop.

**Scenario two · Financial total verification**: An agent that generates monthly financial summaries from raw receipts. Various totals in the summary frequently don't add up; someone proposes adding an "audit agent" to read the summary, pick out miscalculated parts, kick back for recalculation, repeat until the audit agent approves.

**Scenario three · Component naming style**: An agent that names new components and writes docs. Three frontend colleagues' assessments of output are chronically inconsistent: A says naming is too verbose, B says not descriptive enough, C thinks either is fine but doc tone is too formal. Someone proposes adding a review loop with a "style review agent" as gatekeeper.

<!-- rubric -->

- All three scenarios check against both signs one by one, each sign gets a clear "meets / doesn't meet" judgment and reasoning, not just an overall impression score
- Scenario one judged "worth building," with stopping condition design provided, doesn't stop at the word "worth"
- Scenario two judged "shouldn't build review agent," explicitly points out the replacement is a deterministic verifier (code recalculates totals and compares), explains the reason is things code can decide definitively shouldn't be handed to a non-deterministic judge
- Scenario three judged "problem is in the precondition," points out evaluation criteria aren't clear and humans' own judgments are inconsistent, conclusion is define criteria first rather than build loop first
- At least one scenario names "what happens if you build the loop wrong" with specific consequences (extra money spent, ping-ponging output, errors let through)
- Doesn't equate "worth building" with "more rounds is better"

<!-- answer -->

**Scenario one: Worth building.**

Sign one met, and evidence is ready-made—the product manager's feedback leads to noticeably better versions, this "human feedback works" cycle has already run many times manually, no need to validate again. Sign two also met: her three points (selling point position, call-to-action strength, length) can all be written into a rubric, model can absolutely give the same kind of feedback. Evaluation criteria are also reasonably clear.

Recommendation: Solidify her three points into the judge's rubric, but **don't hand "exceeds mobile two-line limit" to the judge**—use character count to decide definitively, put it in a gate. Stopping conditions use "pass + max rounds," set rounds to 2–3; copy tends to get flatter with too many revisions, max rounds here isn't just a fuse, it's itself a quality control. Rounds burn out without passing, hand the final version plus judge feedback to product manager for final cut.

**Scenario two: Shouldn't build this audit agent.**

Both signs aren't the key here—there's a judgment that kicks in even earlier: code can decide this definitively. Whether a total is correct is a deterministic problem: take the raw receipt numbers and add them up again, doesn't match means doesn't match, result identical every time. Having a non-deterministic judge evaluate something that should be deterministic costs you two things (one extra model call) plus one risk (judge itself might wrongly mark correct as wrong or let wrong slip through).

Recommendation: Write a verifier, use code to recalculate every total and cross-check relationship, fail means throw "which item, calculated value, should-be value" directly back to the generation node. This is still a loop, shape same as review loop, but the node in the loop is pure code not an agent—this is Course 10's layered scoring discipline: use code for what code can decide, only hand to model what code can't. If you really want to leave a spot for the model, leave it for parts code can't decide like "does the summary's text narrative match the numbers."

**Scenario three: Don't build the loop first, define criteria first.**

Sign one already doesn't meet: three colleagues' feedback contradicts each other, means there's no consensus feedback of "gets better when human provides it"—A's feedback implemented, B gets more dissatisfied. Sign two even less so, model can't give feedback that even humans haven't reached consensus on. Precondition "evaluation criteria clear" directly doesn't hold here.

If you force-build, you'll reliably get that predictable failure: judge's feedback points different directions each round, naming ping-pongs between verbose and terse, rounds burn out, final draft no better than first, and three colleagues each still have their complaints—you just automated an inconclusive argument while paying for every round.

Recommendation: Have the three people first sit down and write naming rules into a decidable checklist (use abbreviations or not, verb-first or noun-first, max how many words, doc uses which person). Once the checklist exists, sign one and sign two will both hold, then come back to build the loop, and most conditions can already be decided definitively in a gate. **This scenario's real lesson: review loops don't produce criteria, they only execute criteria.**

<!-- hint -->

Before judging, do one thing first: write down "the feedback a human would give" verbatim. Look at what it resembles after writing—if it looks like an assertion that can be true/false on the spot ("this section is missing the ticket number"), it should likely go to code; if it looks like a judgment requiring taste ("tone too soft"), then it's the judge's turn.

<!-- hint -->

If any scenario has you stuck, try role-playing the judge: lay out the input you have, see if you yourself can write a clear, specific feedback statement for the writer. If you can't write it, the model likely can't either—that's not the model's problem, it's the criteria's problem.

<!-- /exercises -->

## Recap

- Review-and-refine is one LLM call generating a response while another provides evaluation and feedback in a loop[^S1]; its product form is "run a checker, fix what failed, repeat until it passes or stops making progress"[^S5], adversarial cross-review is another use of the same division of labor (single cross-review, no back edge), lumping it into review loop is this lesson's categorization[^S5]. Course 6 of this series calls it producer-reviewer, that's our teaching vocabulary, primary vocabulary is evaluator-optimizer[^S1].
- Worth building depends on two signs: LLM responses can be demonstrably improved when a human articulates their feedback, and the LLM can also provide such feedback; it's particularly effective when evaluation criteria are clear and iterative refinement provides measurable value[^S1]. When criteria aren't clear, define criteria first, don't build loop first.
- Stopping conditions aren't just one kind: stopping conditions like maximum iterations are used to maintain control[^S1], "no further progress" is another more cost-effective stopping mechanism[^S5]; three outcomes (pass / rounds burned / no progress) map to three different downstream actions, don't collapse into a boolean. Deterministic gates come before judges.
- Five patterns can be composed: these building blocks aren't prescriptive, they're common patterns developers can shape and combine to fit different use cases, the key to success is measuring performance and iterating on implementations[^S1].
- "Graph / nodes / edges" is this lesson's own visual system, not official terminology; its primary anchor is just one sentence—the workflow script itself holds the loop, branching, and intermediate results, while the model's context holds only the final answer[^S5], plus intermediate results stay in script variables[^S5]. When using this vocabulary in your own docs, include this declaration with it.
- Composition benefits are documented: the runtime tracks each agent's result as the run progresses, which is what makes a run resumable within the same session[^S5]; a workflow that fans work out across many small agents preserves more progress than one long agent[^S5]; moving the plan into code also lets a workflow apply repeatable quality techniques (adversarial cross-review, draft from multiple angles then weigh)[^S5]; deterministic safeguards (retry logic and regular checkpoints) wrap non-deterministic agents[^S2].
- Constraints are equally clear: you should consider adding complexity only when it demonstrably improves outcomes[^S1]; node-level retry and timeout are ordinary engineering practice, primary sources offer only one subordinate clause[^S2]; depth is also bounded, product-level reference is subagents nest up to three layers below the main conversation[^S4]; simplest solution first[^S1].

[>> Lesson 6: Hands-On: Upgrading Your Harness into a Small Graph](./06-build-a-graph.md)
