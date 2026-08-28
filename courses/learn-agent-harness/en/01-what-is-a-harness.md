# Lesson 1: What a Harness Is: The Control Code Around the Model

> Learning goals:
> - Draw the line between the harness and the model, and say which side "proposing an action" falls on and which side "executing and controlling" falls on
> - Use the difference between agents and workflows to explain what earns a system the name "agent"
> - Decide whether an "our agent isn't reliable enough" problem should be fixed at the model layer or at the harness layer
>
> Prerequisites: You've finished the first six courses in this series and understand a single tool-call round-trip (`stop_reason: "tool_use"` / `tool_result`) | Next: [Lesson 2 >>](./02-the-core-loop.md)

## You Already Saw a Harness in That One Round-Trip

In "Agent Tool Calling: Getting Agents to Actually Do Things" you took apart a complete tool-call round-trip: the model sees your question plus a manifest of tools, and comes back with `stop_reason: "tool_use"` and a `tool_use` block that says "call this tool, with these parameters." The docs are blunt about what happens next: "The model never executes anything on its own. It emits a structured request, your code (or Anthropic's servers) runs the operation, and the result flows back into the conversation."[^S2] Opening the file, running the command, making the network call — all of that is the host code running the agent. When the host finishes, it wraps the output in a `tool_result`, appends it to the conversation, and fires off another request.

That chunk of host code — the part that runs tools and then decides what to do next — is the subject of this lesson. It has a name: the **harness**, the layer of control code wrapped around the model.

That earlier course stopped after one round-trip, though. Real agents rarely go back and forth only once. A tool call returns, the model looks at the result, and usually it wants to call another tool, and another, going around and around. Who runs that going-around-and-around? Who decides when it's time to stop? Who pulls it back when it drifts? All of that is the harness's job. This lesson draws the line between harness and model; the lessons after it pull the harness apart, one piece at a time.

## What an Agent Is: an LLM Using Tools in a Loop

Anthropic's engineering team has a plain definition of agents: "They are typically just LLMs using tools based on environmental feedback in a loop."[^S1] Three words in that sentence carry the weight — **tools**, **environmental feedback**, and **loop**. The model calls a tool (tools), the host runs it and feeds the result back (environmental feedback), the model reads the result and decides what to do next, possibly calling another tool, and around it goes (loop). The round-trip you learned earlier was the first turn of exactly this loop.

That same article separates two kinds of systems people constantly conflate. The first is the **workflow**: "Workflows are systems where LLMs and tools are orchestrated through predefined code paths."[^S1] Do this, then that, and at this branch go left — a person settled all of it in advance. The second is the **agent**: "Agents, on the other hand, are systems where LLMs dynamically direct their own processes and tool usage"[^S1].

Put those two definitions side by side and the difference isn't about how strong the model is. It's about **who makes the control-flow decisions**. In a workflow, the next step is hard-coded. In an agent, the next step is whatever the model decides in the moment, inside the loop. That's what earns the name, in the roadmap's phrasing: "An agent makes its own control-flow decisions inside a loop."[^S5] And the thing that carries that loop, that turns the model's decisions into actual effects, is the harness.

One bit of phrasing deserves care here. Saying "the model decides the next step" means the model proposes an action on each turn. Whether the loop turns at all, whether the model gets asked again — that's still up to the harness code. The model proposes, the harness rules. That line is the foundation for everything that follows.

## Same Model, Different Harness, Wildly Different Results

Now for the one sentence this lesson most wants you to keep. A community roadmap puts it flatly: **"Same model, different harness, completely different result."**[^S5]

That sounds backwards at first. We're used to charging an agent's reliability to the model's account — this one's strong, that one's weak. But think about what the model actually did in that round-trip: it looked at the current conversation and proposed the next action. Whether that action really runs, whether the loop keeps going afterward, whether to call a halt after twenty fruitless turns, whether to check with a person first when the proposed action would drop a database table — not one of those is the model's call. Every one of them belongs to the harness.

Here's a concrete comparison. Same model, same set of tools, same task: clean up the unused dependencies in a project.

- **Harness A** executes every action the model proposes, unconditionally. No turn limit, no check for whether the agent is spinning in place. The model misjudges on some turn and proposes a wrong deletion; the harness deletes. The model then reasons forward from a state it has already broken, and one wrong step turns into ten. The trouble with systems like this comes straight from agent autonomy: "The autonomous nature of agents means higher costs, and the potential for compounding errors."[^S1]
- **Harness B** runs the same model and takes the same proposals, but this control layer caps the number of turns, watches for several turns in a row with no real progress, and stops to ask a person before executing a high-impact action like a deletion. The same bad proposal hits an approval gate here instead of hitting the disk.

Identical model. Possibly identical proposals both times. One run wrecks the project, the other stays on the rails. The whole difference comes from the control code on the outside. So when your agent is unreliable, don't reach for a stronger model first — a lot of the time the problem lives in the harness layer, not the model layer.

```agentmentor-check
{
  "id": "harness-zh-01-swap-model-vs-harness",
  "label": "Locate which layer an agent's unreliability comes from",
  "prompt": "Your agent occasionally deletes a package that's still in use while cleaning up unused dependencies, and the project stops building. Someone proposes swapping the underlying model for a stronger version, which should take care of it. Is that judgment sound?",
  "whyHere": "We just established that the same model in a different harness produces a completely different result, and \"just use a stronger model\" is the exact instinct a reader has at this moment. The mental model of which layer reliability actually comes from has to be corrected right here.",
  "mode": "single",
  "choices": [
    {
      "id": "a",
      "text": "It's sound. A stronger model proposes more accurate actions, so the bad deletions should mostly stop.",
      "correct": false,
      "feedback": "A stronger model may lower the odds of a misjudgment, but it can't drive them to zero. As long as the model can still propose a wrong deletion, and the harness still executes unconditionally without pausing to confirm, that action still lands on disk. Betting reliability entirely on the model never being wrong charges the harness's job to the model's account."
    },
    {
      "id": "b",
      "text": "It makes no difference. Agent behavior is essentially random, so there's no controlling it either way.",
      "correct": false,
      "feedback": "That pushes the conclusion too far. Agent behavior is exactly what can be controlled, and that's the whole point of a harness: turn limits, no-progress detection, and human approval before dangerous actions all change the outcome in measurable ways. Calling it uncontrollable throws out everything this lesson is teaching."
    },
    {
      "id": "c",
      "text": "It isn't sound. Stopping a bad deletion depends on the harness gating high-impact actions, not model strength.",
      "correct": true,
      "feedback": "Right. The model only proposes actions. Whether a deletion actually runs, and whether a person confirms it first, is decided by control logic in the harness. The same model can't delete anything inside a harness with an approval gate, and wrecks a project inside one that executes blindly. Reliability comes largely from the control code outside the model; the model is one piece of it. Adding approval and progress detection to the loop fixes more than a model swap does."
    }
  ]
}
```

## A Harness Isn't One Thing, It's a Set of Parts

At this point you might picture the harness as "that loop" — not quite. The loop is its central piece, but a harness is a set of components working together. The roadmap describes it as a union: "the harness is the union of:" loop control, tool dispatch, context management, and more.[^S5] Get to know their faces now; later lessons take one apart each:

- **Loop control**, described in the roadmap as "loop control. The while-loop driving model→tools→model."[^S5] It reads the `stop_reason` the model returns and decides whether this turn is followed by another one or by a stop. This is the heart of the harness, and Lesson 2 is devoted to it.
- **Tool dispatch**: once the model proposes "call this tool with these parameters," the code that routes the request to the real function, runs it, and packs the output back into a `tool_result`. You met the single-step version of this earlier; what a harness does is wire it into the loop and use it over and over.
- **Context management**: every turn of the loop piles more data into the conversation, because "An agent running in a loop generates more and more data that could be relevant for the next turn of inference"[^S3]. And the model's attention isn't free: "LLMs have an "attention budget" that they draw on when parsing large volumes of context"[^S3], and "Every new token introduced depletes this budget by some amount"[^S3]. So the harness has to decide where that history goes and how much of it stays, instead of letting it balloon.

Two more pieces get full treatment later in this course. They're named here so you know they belong to the harness too:

- **Stopping conditions**: beyond following `stop_reason`, "it's also common to include stopping conditions (such as a maximum number of iterations) to maintain control."[^S1] When to call it quits is Lesson 3's subject.
- **Runaway backstops and human intervention**: the loop may run for a long stretch, and "The LLM will potentially operate for many turns, and you must have some level of trust in its decision-making."[^S1] Trust isn't the same as a free hand, though — "Agents can then pause for human feedback at checkpoints or when encountering blockers."[^S1] How to catch infinite loops, spinning, and blown budgets (Lesson 4), and how a person interrupts and redirects mid-run (Lesson 5), both live at this layer.

You don't have to memorize the details of each part right now. Just hold the overall shape: **a harness is the collective name for the control code around the model, assembled from several parts that together determine how steadily this agent runs.** That also explains why swapping harnesses changes the outcome so much — what you swapped isn't one line of code, it's an entire strategy for controlling the loop.

## When You Actually Need This Control Layer

Seeing how much a harness can manage, it's easy to slide to the opposite extreme: does every use of a model need a full setup with loop control, approval gates, and spin detection? No.

Go back to the agent-versus-workflow line. If your task follows a fixed path — a ticket comes in, gets classified, gets routed by category — and every branch can be settled in advance, that's a workflow, and orchestrating it "through predefined code paths"[^S1] is enough. There's no reason to let a model make control-flow decisions inside a loop. Strapping an autonomous loop onto it only adds chances for it to go off course.

What genuinely needs a full harness are tasks where **the number of steps and the path can't be stated in advance**: how many files need changing, which one to read first, whether the result of one step sends it back to redo an earlier one. Only the model, looking at the current state, can settle those. That's when you want a harness that lets it decide for itself inside a loop while holding it firmly under control. One piece of general restraint is worth keeping: "you should consider adding complexity only when it demonstrably improves outcomes."[^S1] Every piece of control logic in your harness should be there because you hit a real loss-of-control problem, not because everyone else builds it that way.

The rest of this course focuses on the part that matters most in that second kind of task, and breaks most often — the loop itself. Since the harness decides whether an agent is dependable, and loop control is the harness's heart, the next lesson starts with how that loop grows from a single round-trip into something that keeps running.

<!-- exercises -->
## 💻 Exercises

### Level 1: Sort Out Who Owns Each Step

Below is a scenario where an agent automatically fixes failing unit tests. Five things happen along the way. For each one, decide whether it's the **model** doing it or the **harness** (the control code around the model), and give a short reason.

1. The model reads the test failure, replies with a message saying it wants to call `read_file` on the file that failed, and `stop_reason` is `"tool_use"`.
2. The program actually goes to disk and reads that file.
3. The program wraps the file contents in a `tool_result`, appends it to the conversation, and sends another request.
4. The loop has gone twenty turns without a fix, and the program decides not to continue, stopping and reporting "turn limit reached."
5. On some turn the model proposes calling `delete_file` on the entire test directory. The program blocks it and pops up "this operation deletes files, confirm?" to wait for a person to say yes.

<!-- rubric -->
- All five items are explicitly labeled either "model" or "harness"
- Every judgment comes with a reason, not just a label
- The reasoning identifies which side of the "proposing an action" versus "executing and controlling" line each item falls on

<!-- answer -->
1. Model. It's looking at the current conversation and proposing the next action, packing "call read_file" into a structured request — a proposal, not an execution.
2. Harness. The host code is what actually opens the filesystem and reads the file. The model has no filesystem and can't do this.
3. Harness. Wrapping the result in a `tool_result`, appending it to the conversation, and sending another request is all orchestration done by the loop-control code.
4. Harness. "Stop after twenty turns" is an explicit stopping condition (a turn limit), which is harness control logic and has nothing to do with what the model proposed.
5. Proposing the directory deletion is the model (still just proposing an action); blocking it to wait for confirmation is the harness. That's exactly what an approval gate is: the model can still propose a high-impact action, but the harness stops it before it executes.

<!-- hint -->
Keep asking yourself where the line falls: is this thing "deciding what to do next" (the model proposing), or "actually carrying out an action, or deciding whether the loop continues" (the harness controlling)?

<!-- hint -->
Notice that item 5 straddles both sides: the model proposes, the harness rules on whether it really runs. A single event can have a model part and a harness part, so don't rush to fill in just one.

### Level 2: Decide Which Layer to Fix It In

Your team has an agent whose job is to make the corresponding inserts, updates, and deletes in a database based on a user's plain-language description. Two problems showed up after launch. For each one, decide whether it should be fixed mainly at the **model layer** (swap the model, change the prompt) or the **harness layer** (change the control code on the outside), and explain why.

- Problem A: The agent occasionally turns a vague "clean up those old records" into a statement that deletes thousands of rows, and runs it immediately, which caused one real data-loss incident.
- Problem B: The SQL the agent generates often has syntax errors and misspelled column names, so many calls fail outright.

<!-- rubric -->
- Both problems get an explicit "mainly model layer" or "mainly harness layer" verdict
- The reasoning turns on whether the issue is fundamentally about proposal quality or about missing control
- For Problem A, the answer points out that even a more accurate model leaves the data-loss risk in place without an interception step before execution

<!-- answer -->
- Problem A: mainly the harness layer. The core issue isn't whether the model should have proposed a delete; it's that a high-impact, irreversible action was executed immediately and unconditionally. What's missing is a human approval gate before execution. Even a stronger model that cuts the misjudgment rate leaves the risk intact — without that interception, a vague instruction can still trigger a real data loss. Adding a confirmation step before delete-class operations is the actual fix. (This echoes the idea of human-in-the-loop approval for high-impact operations, which Lesson 5 develops.)
- Problem B: mainly the model layer. Syntax errors and misspelled column names are quality problems in the model's proposal step, and they improve with a model that's better at SQL, or with accurate table structure and column names supplied in the prompt or the tool descriptions. There's only so much the harness can do here (at most mark the failed `tool_result` with `is_error` so the model retries) — the root cause is proposal quality.

<!-- hint -->
Classify each problem first: is it "the model proposed badly," or "the proposal wasn't especially wrong, but nothing controlled the execution"? The first points at the model layer, the second at the harness layer.

<!-- hint -->
For Problem A, run a counterfactual: if the model had proposed perfectly this time, would the problem definitely never recur? If the risk survives even a correct proposal, the weak spot is in the control layer, not the proposal layer.

<!-- /exercises -->

## Recap

- **A harness is the collective name for the control code around the model** — running tools, driving the loop, deciding when to stop and when to wait for a person. The model only proposes the next action; the harness rules on whether that action executes and whether the loop continues.[^S2]
- **An agent is an LLM using tools in a loop based on environmental feedback.**[^S1] What separates it from a workflow isn't model strength but who makes the control-flow decisions: a workflow follows predefined code paths, while an agent's next step is set by the model inside the loop,[^S1] and the thing carrying that loop is the harness — an agent makes its own control-flow decisions inside a loop.[^S5]
- **Same model, different harness, completely different result.**[^S5] So when an agent is unreliable, check the harness layer first: turn limits, no-progress detection, and approval for high-impact actions usually fix more than a stronger model does.
- **A harness is a set of parts, not a single object**: loop control, tool dispatch, and context management each have their own job.[^S5] Context in particular needs managing, because every turn of the loop piles more data into the conversation and draws down a finite attention budget.[^S3]
- **Not every situation needs a full harness.** Tasks with a fixed path are fine as workflows;[^S1] reach for a harness only when the steps and the path can't be stated in advance and the model genuinely has to decide for itself, and add complexity only when it demonstrably improves outcomes.[^S1]

[>> Lesson 2: The Core Loop: From One Round-Trip to Continuous Operation](./02-the-core-loop.md)
