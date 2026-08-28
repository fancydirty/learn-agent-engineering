# Lesson 1: Why You Can't Say What Went Wrong

> Learning goals:
> - Understand why a single user-visible symptom can hide multiple indistinguishable root causes
> - Explain how non-determinism breaks the traditional "reproduce it and set a breakpoint" debugging intuition
> - Recognize the different shapes errors take in agent systems: cascading failures, trajectory divergence, cross-turn compounding, and multi-agent emergence
>
> Prerequisites: Complete the first 10 courses in this series, be able to hand-write a harness loop driven by `stop_reason`, understand that evaluation tracks only give you pass/fail | Next: [Lesson 2 >>](./02-transcripts-as-evidence.md)

## A Tuesday afternoon you can't explain

Your internal research agent has been live for two weeks. Tuesday afternoon, the ops team forwards you a user report:

> I asked it to find our pricing plan from last year. It said it couldn't find anything. But that document is right there in the knowledge base—took me two seconds to pull it up myself.

You open the session. Two things on screen: the user's question and the agent's final response, "I didn't find any relevant materials." What happened in between? You have nothing.

So you start guessing.

Did it construct a bad search query—like taking the user's natural-language question and shoving the whole thing into retrieval verbatim instead of extracting keywords? Or maybe it found results but picked the wrong sources, reading the two least relevant hits out of eight and concluding "nothing here"? Or the retrieval tool threw an error, and the agent interpreted the failure as "no information in this direction" and moved on?

All three guesses look identical from the user's side: the agent can't find information that's obviously there.

This isn't unique to you. When Anthropic's team did a retrospective on their multi-agent research system, they wrote down the exact same problem: users would report agents "not finding obvious information," but they couldn't see why. Were the agents using bad search queries? Choosing poor sources? Hitting tool failures?[^S1] Same three questions, no answers.

## The evaluation track only answers "did it break"

Your first instinct is probably to open the system you built in the previous course (Course 10 in this series): terminal-state scoring, validators, evaluation sets. That's the right first step. You add this real user question to the evaluation set, write a criterion "the answer must cite the pricing document," and run it.

Result: one red line. `fail`.

That red line is useful—it turns a subjective complaint into a reproducible, regression-testable verdict. But it doesn't answer the question you actually need answered right now: why. The scorer looks at terminal state. Terminal state is "didn't cite the document." Whether that "didn't cite" came from a bad query, source selection, or a swallowed tool error—the scorer doesn't care and has no way to care. It stands at the finish line holding up a scorecard.

This course fills in the middle section. Using a framework this course coined:

> **Verification tells you whether it broke. Observability tells you why.**

This isn't a line from any official documentation—it's this course's framing to tie together the next five lessons, backed by two real experiences. One comes from that multi-agent system retrospective: adding full production tracing let them diagnose why agents failed and fix issues systematically[^S1]. The other comes from the tooling engineering side: analyzing the raw transcripts your evaluation agent leaves behind can help you probe why agents do or don't call certain tools[^S3]. Both sentences point to the same thing—only when the process leaves a trail can you ask "why."

```agentmentor-check
{
  "id": "obs-zh-01-rerun-to-reproduce",
  "label": "Can you reproduce by re-running?",
  "prompt": "A production run failed. Your colleague says: 'Just run it again with the same input—once we reproduce it we can locate the issue.' Does this approach work for agents?",
  "whyHere": "This is the first reflex almost everyone carries over from traditional debugging, and it's also the foundation the next section dismantles. Answer it yourself before reading on.",
  "mode": "single",
  "choices": [
    {
      "id": "a",
      "text": "Works. Run it enough times and you'll eventually hit the same path. It's like tracking down an intermittent concurrency bug.",
      "correct": false,
      "feedback": "Intermittent concurrency bugs at least run on the same deterministic code—run it enough times and you do have a chance to hit the failure. Agents are different: they make decisions at every step. Even with identical starting conditions, you'll most likely hit a different but equally valid path."
    },
    {
      "id": "b",
      "text": "Doesn't work. Agent internals are fundamentally unobservable. When something breaks you can only tweak the prompt and see what happens—it's trial and error until you converge.",
      "correct": false,
      "feedback": "The first half is right, the second half is badly wrong. Reproducing doesn't work, but that doesn't mean there's no evidence—the model requests, tool parameters, and tool responses from the failing run can all be recorded. The next five lessons cover how to record them, how to read them."
    },
    {
      "id": "c",
      "text": "Doesn't work. Even with identical prompts, two runs can take different but equally valid paths. To reconstruct what happened, you need the records that specific run left behind.",
      "correct": true,
      "feedback": "Right. Breakpoints assume 'the second run will hit the same line.' Agents don't guarantee that. So the center of gravity in debugging shifts from 'run it again' to 'what did the last run leave behind'—that's the problem observability solves."
    }
  ]
}
```

## Why "reproduce it and set a breakpoint" doesn't work here

First, definitions. A **deterministic** system means: give it the same input, it produces the same output every time. A **non-deterministic** system is the opposite—agents are this kind of system. In computing, deterministic systems produce the same output every time given identical inputs, while non-deterministic systems—like agents—can generate varied responses even with the same starting conditions[^S3].

This pulls the rug out from under traditional debugging. Agents make dynamic decisions and are non-deterministic between runs, even with identical prompts. This makes debugging harder[^S1]. Traditional evaluations often assume that the AI follows the same steps each time: given input X, the system should follow path Y to produce output Z. But multi-agent systems don't work this way. Even with identical starting points, agents might take completely different valid paths to reach their goal[^S1].

Here's what it looks like in practice:

```text
Same question, same prompt version, two runs

Run A                                  Run B
1 search("2024 pricing plan")          1 search("pricing plan 2024 internal docs")
2 read_doc(doc_17)                     2 search("pricing archive")
3 respond (citing doc_17)              3 read_doc(doc_09)
                                       4 read_doc(doc_17)
                                       5 respond (citing doc_17 and doc_09)
```

Neither path is wrong, and both terminal states would pass. But if the failure happened in Run A step 2, and you re-run ten times and get nine Run Bs, those nine runs don't help.

Breakpoints are equally useless. Breakpoints sit on code lines, with the precondition that "the second execution will hit this line with the same context." But where agents go wrong is often not in your code—it's in a model decision. And even if you wanted to pause, you wouldn't know which turn to pause at: this time it breaks on turn 3, next time maybe turn 11, or maybe it doesn't break at all.

You might think of turning down sampling temperature or recording and replaying tool responses. These engineering techniques do reduce some jitter, and this course doesn't discourage you from using them. But they change the run you're doing in your lab, not the one that already failed in production—that one is gone, and the only thing it left behind is its records.

Anthropic's team took a different approach. They call it "think like your agents": build a simulation using the exact same prompts and tools from the system, then watch agents work step-by-step. This immediately revealed failure modes: agents continuing when they already had sufficient results, using overly verbose search queries, or selecting incorrect tools[^S1].

The key isn't "reproduce the same run"—it's "see each step." That's where observability diverges from traditional debugging.

## The errors agents throw come in different shapes

Even if you accept "you need records," there's another layer to understand: the shape of errors in agent systems isn't the same as traditional bugs.

In traditional software, a bug might break a feature, degrade performance, or cause outages. In agentic systems, minor changes cascade into large behavioral changes, which makes it remarkably difficult to write code for complex agents that must maintain state in a long-running process[^S1].

Within a single run, the most typical shape is **trajectory divergence**. Agents are stateful and errors compound. The compound nature of errors in agentic systems means that minor issues for traditional software can derail agents entirely. One step failing can cause agents to explore entirely different trajectories, leading to unpredictable outcomes[^S1].

```text
Turn 3: search times out, tool returns "Error: upstream timeout"
        ↓
Agent reads it as "no information in this direction"
        ↓
Switches to a completely different retrieval angle
        ↓
The next 12 turns all grow on this wrong branch
        ↓
Terminal state: a seemingly complete report, all sources from tangential material
```

Notice how small the first link in that chain is: one timeout. In a traditional service it might just be a retry log entry. Here it rewrites the next twelve turns, and the terminal-state report doesn't error out, doesn't crash, reads perfectly fluently.

The second shape is **cross-turn compounding**. Agents are stateful and errors compound. Agents can run for long periods of time, maintaining state across many tool calls. This means we need to durably execute code and handle errors along the way[^S1]. That's also why you can't just restart from the beginning when errors occur: restarts are expensive and frustrating for users. Instead, we built systems that can resume from where the agent was when the errors occurred[^S1]. The implication for you is direct: if the state at failure time wasn't recorded, the question "where to resume from" has no answer.

The third shape only shows up in multi-agent systems: **emergent behavior**. Multi-agent systems have emergent behaviors, which arise without specific programming. For instance, small changes to the lead agent can unpredictably change how subagents behave. Success requires understanding interaction patterns, not just individual agent behavior[^S1].

What these shapes look like when they all converge, that team's early version gave a very direct answer: early agents made errors like spawning 50 subagents for simple queries, scouring the web endlessly for nonexistent sources, and distracting each other with excessive updates[^S1].

These three error types have something in common: viewed from the outside, the terminal state might just look like "answer quality is meh." You can't tell which one it is.

## Abstraction layers hide the evidence

There's another layer of trouble, and it doesn't come from the model—it comes from your tooling.

Agent frameworks make it easy to get started by simplifying standard low-level tasks like calling LLMs, defining and parsing tools, and chaining calls together. However, they often create extra layers of abstraction that can obscure the underlying prompts and responses, making them harder to debug[^S2]. That's why the advice to developers is: start by using LLM APIs directly—many patterns can be implemented in a few lines of code. If you do use a framework, ensure you understand the underlying code. Incorrect assumptions about what's under the hood are a common source of customer error[^S2]. (That article includes an editorial note saying its tool ecosystem descriptions are outdated, so we're citing the principles here, not treating it as current selection guidance.)

For you, this is actually good news. You hand-wrote the harness loop in Course 7 of this series. You don't have that layer of abstraction:

```javascript
while (response.stop_reason === "tool_use") {
  messages.push({ role: "assistant", content: response.content });
  // What runs through this line: tool name, parameters, response body, duration, errors
  const toolResults = await runToolUses(response.content);
  messages.push({ role: "user", content: toolResults });
  response = await client.messages.create({ model, max_tokens, tools, messages });
  // What runs through this line: which request number, how long, how many tokens, what stop_reason
}
```

Evidence flows through this loop every time, without fail. The problem is after it flows through, it's gone. You have no obstruction, but you also have no retention—from the perspective of asking for evidence after the fact, those two are equally painful.

So this course's diagnosis is: half the difficulty of debugging agents comes from the objective fact of non-determinism, and the other half comes from "things that could have been recorded weren't." The first half can't be changed. The second half is in your hands.

## The way forward: what the next five lessons give you

That multi-agent system's team put this on the same tier as prompt engineering and tool design: getting this right relies on careful prompting and tool design, solid heuristics, observability, and tight feedback loops[^S1]. The retrospective has an even more direct line—they focused on a fast iteration loop with observability and test cases[^S1].

Notice the "test cases" half: observability isn't here to replace the evaluation track. They're two ends of one carrying pole. Evaluation tells you whether this run broke and whether the change made things better. Observation tells you why this run broke and which part to change.

The next five lessons proceed in this order:

- **Lesson 2** lays the foundation: raw records are the first-hand evidence. What the agent says about itself doesn't count—what it omits is often more important than what it includes.
- **Lesson 3** turns each step into data: structured logs and metrics. The same metrics Course 10 used for scoring, this course uses for diagnosis.
- **Lesson 4** threads scattered records into a tree: read all the model requests and tool executions triggered by one prompt as a single unit, with subagent calls nested inside the parent.
- **Lesson 5** installs probes at the lifecycle checkpoints of the loop, walks through the locate-under-non-determinism workflow: finding the first divergence from a pile of records.
- **Lesson 6** hands-on: install a full observability layer on the harness you wrote in Course 7, tracing from a symptom you "can't explain" to the specific step that diverged.

This lesson only names them without expanding: how to read records is Lesson 2's job, how to design metrics is Lesson 3, what structure a trace has is Lesson 4.

## When you don't need the full stack

Not every agent needs all of this. A one-off script—run once, glance at the output, delete—giving it logs, metrics, and traces is pure waste.

The judgment criterion is simple: **observability investment should be proportional to "how long it would take you to explain why after something breaks."** If you run it yourself, watch it yourself, and it costs nothing to re-run when it fails, don't record. If someone else uses it, if it runs long, if you'd spend half a day digging through chat transcripts when it fails, record from day one.

There's one line that has nothing to do with scale: if the agent can take action—write files, send requests, spend money—don't skip testing. The autonomous nature of agents means higher costs, and the potential for compounding errors. We recommend extensive testing in sandboxed environments, along with the appropriate guardrails[^S2].

As for knowing you got it right: the key to success, as with any LLM features, is measuring performance and iterating on implementations[^S2]. And the precondition for measurement is having something to measure—which loops back to what this course is solving.

## 💻 Exercises

<!-- exercises -->

### Level 1: One symptom, three indistinguishable causes

No code required. Below are three symptoms you'd encounter in production, each given only the information visible from the user's side:

1. The agent's research report cites a file named `docs/pricing-2024.md`, but that file doesn't exist in the repository at all.
2. The same archival task took 12 turns yesterday and finished. Today it ran to turn 47 before stopping, with roughly the same result.
3. The user asks "help me check how many times this error appears in our codebase," and the agent responds with a long explanation of what the error means.

For each symptom:

- List **at least three** candidate causes that are indistinguishable from the outside.
- For each candidate cause, write down "to confirm it's this one and rule out the other two, I need to see what evidence"—be specific to the field level. "Check the logs" isn't an answer.

<!-- rubric -->

- Each symptom has at least three candidate causes, and they land in different stages (the model's decision, the tool's input and output, the harness's control flow or context handling), not three rewordings of the same cause.
- Each candidate cause is paired with evidence specific enough to say "look at which turn, which record, which field," not generic answers like "look at the logs."
- Each symptom explains: when you only have the terminal output, why are these causes indistinguishable from each other—in other words, explains why process evidence is non-negotiable.

<!-- answer -->

**Symptom 1: report cites a non-existent filename**

- Model decision stage: the retrieval tools returned all real files, but when writing the report the model conflated filenames or invented one following naming conventions. Evidence—list out the parameters of every `read_file` / `read_doc` call in that run and check whether this filename ever appeared as a parameter. If it never appeared, it was fabricated during generation.
- Tool input/output stage: the retrieval tool did return this name because the index was built three weeks ago and the file was later renamed or deleted. Evidence—look at the raw response body from that turn's `search` and see if it carries this filename.
- Control flow stage: when reading the file the tool threw "does not exist," but the harness swallowed the exception and only put an empty string into `tool_result`, so the model continued on its previous assumption. Evidence—look at whether that turn's `tool_result` content is empty and whether it carries an error marker.
- Why they're indistinguishable: all three paths end with the same report containing the same fake filename, and no field can separate them.

**Symptom 2: 12 turns became 47 turns**

- Model decision stage: today's retrieval results were more fragmented, so the model tried different phrasings repeatedly. Evidence—list out the tool name and parameters from every turn's `tool_use` and check whether the same tool was called a dozen times with different wording.
- Tool input/output stage: a tool's page size or return limit changed today, so it couldn't fetch everything in one go and had to make multiple trips. Evidence—compare the response body size and call count for the same tool across both days.
- Control flow stage: one step failed so the agent switched branches and re-did the first half of the work. Evidence—align both runs by turn number, find the **first** differing step, and look only at that turn's tool response.
- Why they're indistinguishable: both terminal states are "task completed, took a bit longer." The turn count is just an aggregate; it doesn't tell you where the extra 35 turns grew.

**Symptom 3: answered the wrong question**

- Model decision stage: the model interpreted "appears how many times" as "what does it mean." Evidence—check whether it called the retrieval tool in turn 1, or just started generating an answer.
- Tool input/output stage: the retrieval tool errored or returned empty, so the model fell back to answering from its parametric knowledge. Evidence—that turn's `tool_result` content and error markers.
- Context stage: the history before this turn was truncated or compressed, so the user's qualifier "in our codebase" was no longer present in the messages actually sent. Evidence—look at the `messages` sent in that request, not the ones you thought you sent.
- Why they're indistinguishable: in all three cases the user receives text that's "off-topic but reads smoothly." To tell them apart you need to see both "what went in" and "what came back."

<!-- hint -->

Prepare three drawers for yourself: the model's decision, the tool's input and output, the harness's control flow and context handling. The same symptom often has one plausible cause in each drawer. If all three causes land in the same drawer, you haven't stepped out of your first reflex.

<!-- hint -->

When writing evidence, force yourself to get to the field level: not "check the logs," but "check that turn's `tool_result` content and whether it was marked as an error." If you can't get to the field level, it means you haven't figured out what to leave in the records—which is exactly what Lessons 2 and 3 will have you do hands-on.

### Level 2: Dismantle the traditional debugging flow step by step

No code required. Below is the four-step debugging flow every backend engineer knows:

```text
1 Reproduce      Run the bug locally with the same input
2 Set breakpoint Stop at the suspicious line
3 Step through   Go line by line, watch when variables go wrong
4 Fix and verify Change it and run again; green means fixed
```

For each step, answer two questions:

- Why does it fail for agents? Ground the reason in specific mechanisms (non-determinism, trajectory divergence, evidence hidden or never recorded).
- What's the corresponding replacement in the agent world? Just write the direction—"what evidence to get, organized by what dimension"—the concrete implementation is the job of later lessons.

<!-- rubric -->

- All four steps are handled individually, each with both why-it-fails and the replacement direction written, including the easily skipped Step 4 "fix and verify."
- The failure reason is grounded in specific mechanisms (non-determinism across runs, one-step failure causing whole-trajectory divergence, abstraction layers or missing records hiding evidence), not vague statements like "because models are uncertain."
- The replacement direction says "what evidence to get and how to organize it," not "install observability product X." Giving direction without expanding implementation details also counts as passing.

<!-- answer -->

**Step 1: Reproduce**

Failure reason: Agents are non-deterministic between runs, even with identical prompts. Even with identical starting points, they might take completely different valid paths to reach their goal. You run it ten times locally and you'll probably never walk the path the failing run took.

Replacement direction: Abandon the goal of "run it again" and make the failing run record its process as it happens. The evidence to get is that run's complete model requests and tool round-trips—that's Lesson 2's content.

**Step 2: Set breakpoint**

Failure reason: Breakpoints sit on code lines, but where agents go wrong is often not in your code—it's in a model decision. And the loop might run dozens of turns; you don't know which turn to pause at. If you're also using a framework that wraps prompts and responses under abstraction layers, you can't even locate which line to look at.

Replacement direction: Replace "pause at one line" with "record one entry per step," filter afterward by correlation ID to pull out all records belonging to one prompt. Where exactly in the loop's lifecycle to hang the probes is Lesson 3 and Lesson 5's content.

**Step 3: Step through**

Failure reason: Stepping assumes state changes are local and predictable. But agents are stateful and errors compound; one step failing can cause the whole trajectory to diverge. The step 5 you manually walk through is probably not the same thing as step 5 in the failing run.

Replacement direction: Don't read a run as a linear command sequence; read it as a tree—all the model requests and tool executions triggered by one prompt grouped together, with subagent activity nested inside the parent. What you're looking for isn't "which line was wrong" but **the first divergence**: from which step did this run become different from the successful one. How to build the tree is Lesson 4's content; the divergence-finding flow is in Lesson 5.

**Step 4: Fix and verify**

Failure reason: One green run doesn't mean it's fixed, because the next run might take a different path. And minor changes cascade into large behavioral changes; a small adjustment to the main agent can unpredictably change the subagents. Looking only at this one case turning green makes it easy to mistake "this time it didn't hit that branch" for "fixed."

Replacement direction: After the change, go back to the evaluation set and batch-run (the system from Course 10 of this series), while also watching whether the behavior distribution in the observability data moved—tool call counts, turn counts, error rates. Evaluation answers "did things get better overall," observation answers "is the reason they got better the one I thought it was."

<!-- hint -->

In the traditional four steps, each step secretly depends on a precondition: reproduce depends on "same input must walk same path," breakpoint depends on "the problem is in some line of code," step-through depends on "state changes are local," verify depends on "passing once means passing." Write out these four preconditions verbatim first, then ask one by one whether each still holds for agents.

<!-- hint -->

The replacement direction doesn't need to be written as an implementation plan. "Need a turn-aligned complete round-trip record" is a passing answer. So is "need to group all requests triggered by the same prompt together." How to land it concretely is the job of later lessons; this exercise only tests whether you can articulate the requirement clearly.

<!-- /exercises -->

## Recap

- A single user-visible symptom often hides multiple causes that are completely indistinguishable from the outside. When users report agents "not finding obvious information," you can't tell whether it's bad search queries, poor source selection, or hitting tool failures[^S1].
- The evaluation track answers "did it break." This course uses a framing it coined to clarify the division of labor: verification tells you whether it broke, observability tells you why. Backing it are two real experiences—adding full production tracing let them diagnose failures and fix systematically[^S1], and reading raw transcripts can help you probe why agents do or don't call certain tools[^S3].
- "Reproduce and set a breakpoint" fails because agents make dynamic decisions and are non-deterministic between runs, even with identical prompts[^S1]. Deterministic systems give the same output for the same input; agents, as non-deterministic systems, don't guarantee this[^S3]. Traditional evaluation's assumption—"input X follows path Y produces output Z"—doesn't hold either. Identical starting points can produce completely different valid paths[^S1].
- Agent error shapes differ from traditional bugs: in traditional software bugs break a feature, but in agentic systems minor changes cascade into large behavioral changes, making it remarkably difficult to write code for complex agents that must maintain state[^S1]. One step failing can cause agents to explore entirely different trajectories, leading to unpredictable outcomes[^S1]. Agents are stateful and errors compound, so you need to durably execute and handle errors along the way[^S1]. Multi-agent systems also have emergent behaviors—small changes to the lead agent can unpredictably change subagent behavior; what you need to understand is interaction patterns, not just individuals[^S1]. The early version once spawned 50 subagents for simple queries, scoured the web endlessly for nonexistent sources, and distracted each other with excessive updates[^S1].
- Abstraction layers hide evidence: frameworks often create extra layers of abstraction that can obscure the underlying prompts and responses, making them harder to debug[^S2]. The advice is to start with LLM APIs directly, and if using a framework, understand the code underneath[^S2]. Your hand-written harness has no obstruction, but also no retention.
- The way forward is to treat observability and tight feedback loops as first-tier requirements[^S1], built into a fast iteration loop with observability and test cases[^S1]. The next five lessons in sequence: raw records, logs and metrics, traces, hooks and locate workflow, hands-on installation.
- Judgment on scope: one-off scripts don't need the full stack. But if the agent can take action, do extensive testing in sandboxed environments with appropriate guardrails[^S2]. Knowing you got it right relies on measuring performance and iterating on implementations[^S2].

[Lesson 2 >>](./02-transcripts-as-evidence.md)
