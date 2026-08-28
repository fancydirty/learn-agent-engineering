# Lesson 5: Subagents and Context Isolation

> Learning goals:
> - Explain why a subagent counts as a context-management move: a clean window plus a summary sent back, keeping the "process" out of the main window
> - Use the ratio of process tokens to conclusion tokens, plus real cost data, to judge whether a task is worth handing to a subagent
> - Wire subagent dispatch into the harness loop you wrote in course 7 of this series, so each dispatch returns exactly one summary to the main window
>
> Prerequisites: You've finished Lesson 4 on compaction and notes, and you can run the harness loop you wrote in course 7 of this series, "Agent Harness Fundamentals: Loops and Control" | Prev: [Lesson 4 <<](./04-compaction-and-notes.md) | Next: [Lesson 6 >>](./06-build-context-management.md)

## A Shift in Perspective: Not Division of Labor, Just Isolation

You've already met subagents in course 6 of this series, "Multi-Agent Collaboration": how to split a task, how to report results, how several agents coordinate. That course answered the question of how multiple agents work together. This lesson answers a different one: **what makes a subagent a context-management technique in the first place?**

Put another way: even if you have a single lead agent and need no team coordination at all, you'll still want to reach for a subagent — not for the division of labor, but for the isolation.

Think back to the budget view from Lesson 1. When a model parses context, it draws on an attention budget, and every new token that enters context depletes that budget a little[^S1]. Pile on more tokens and the model's ability to accurately recall information from that context declines[^S1]. An agent is exactly the setting most prone to piling on tokens: each turn of the loop produces new data that could be relevant to the next turn of inference — hard to throw away, hard to keep[^S1].

Exploration tasks are the sharpest version of this. Say the main agent has to trace every call site of some deprecated API across a repo of a few hundred thousand lines: a dozen greps, twenty files opened, a few thousand lines read. That intermediate content runs to tens of thousands of tokens, while the conclusion worth keeping might be five lines: "the call sites cluster in these three modules, and here's the suggested migration order." If all of that happens in the main window, the attention budget gets eaten by process, leaving little for the conclusion and the work that follows.

The subagent is the knife aimed at exactly this problem.

## The Mechanism: Clean Window In, Compressed Summary Out

The mechanism fits in one sentence: a specialized subagent handles a focused task in a **clean context window**[^S1]; the large volume of intermediate content that exploration generates — search results, raw file contents, dead ends — all **stays inside the subagent**[^S1]; and what returns to the main agent is only a condensed, distilled summary of its work, often 1,000-2,000 tokens[^S1].

The main agent's window therefore carries only the conclusion, never the process. It's an asymmetric design: the subagent may burn tens of thousands of tokens exploring, but only a short passage of text ever leaves it.

In code, this is just a new opening move for the harness you wrote in course 7. To keep things compact, two actions that recurred throughout that course's loop are wrapped as helpers here: `textOf` pulls the text block out of a response, and `appendToolResults` runs this turn's tools and appends the `tool_result` blocks to the message array (internally it does exactly what you hand-wrote in that course — run each `tool_use`, collect the results, send them back).

```javascript
const SUBAGENT_SYSTEM = `You are a research subagent.
When the task is done, output a conclusion of at most 1500 tokens:
key findings, the file paths involved, and recommended actions for the main agent.
Do not repeat the raw text you read.`;

async function runSubagent(client, task, maxTurns = 15) {
  // The whole trick is this line: a brand-new message array, none of the main agent's history
  let messages = [{ role: "user", content: task }];
  for (let turn = 0; turn < maxTurns; turn++) {
    const response = await client.messages.create({
      model: "claude-sonnet-5",
      max_tokens: 4096,
      system: SUBAGENT_SYSTEM, // the subagent's own system prompt
      tools: SEARCH_TOOLS,     // only the tools exploration needs
      messages,
    });
    if (response.stop_reason === "end_turn") {
      return textOf(response); // only this text leaves the subagent
    }
    // run tools, append results to messages, all of it stays inside the subagent
    messages = await appendToolResults(messages, response);
  }
  return "Research did not finish within the turn budget";
}
```

Notice three details. First, `messages` starts from a single lone task description, carrying not one word of the main agent's history — that is the entire meaning of "clean window." Second, the function returns `textOf(response)`, a plain string; the dozens of tool round trips that stacked up inside the loop vanish along with the local variable `messages`. Third, the subagent's system prompt explicitly demands "do not repeat the raw text" — the compression quality of the summary is set right here.

On the main agent's side, the dispatch action is just an ordinary tool that plugs into the stop_reason loop you already have:

```javascript
const DISPATCH_TOOL = {
  name: "dispatch_research",
  description:
    "Hand a focused research task to a subagent and return its summary of the findings. " +
    "Use for tasks that need heavy exploration but whose conclusion can be stated briefly.",
  input_schema: {
    type: "object",
    properties: {
      task: {
        type: "string",
        description: "A self-contained task description; the subagent cannot see this conversation's history",
      },
    },
    required: ["task"],
  },
};

async function handleDispatch(mainMessages, toolCall) {
  const summary = await runSubagent(client, toolCall.input.task);
  mainMessages.push({
    role: "user",
    content: [{
      type: "tool_result",
      tool_use_id: toolCall.id,
      content: summary, // the main window gains only this one entry
    }],
  });
}
```

Look at the description of the `task` field: "A self-contained task description; the subagent cannot see this conversation's history." That line is written for the main agent — it has to state the task in full, because on the other side is an amnesiac new window. Spelling out purpose and boundaries this precisely in a tool description is exactly the "tools as context" idea from Lesson 2: tools should be self-contained, robust to error, and extremely clear with respect to their intended use[^S1].

```agentmentor-check
{
  "id": "ctx-zh-05-clean-window",
  "label": "How much of the main agent's history should a subagent start with",
  "prompt": "You're writing the dispatch logic for a research subagent, and a colleague suggests: \"Just pass the main agent's full message history so far to the subagent — it'll understand the big picture and do a better job.\" From a context-economics standpoint, how should you evaluate this?",
  "whyHere": "The previous section just laid out the \"clean window in, compressed summary out\" mechanism, and \"more context can't hurt\" is the intuition most likely to surface right here. This checks on the spot whether the reader sees that the isolation itself is where the value comes from.",
  "mode": "single",
  "choices": [
    {
      "id": "a",
      "text": "It has it backwards: the isolation is where the value lives. A clean window spends the whole attention budget on the task, and sharing the full history makes both windows hold the same pile, so the benefit drops to zero.",
      "correct": true,
      "feedback": "The key is seeing where the benefit comes from: a clean window keeps the subagent's attention budget fully on the task, and the summary return keeps the main window carrying only the conclusion. Once both windows hold the same content, you're paying two token bills to maintain one context, and the isolation is gone."
    },
    {
      "id": "b",
      "text": "The only issue is transfer cost: the full history is too many tokens, so compress it first and then pass it, and you get the best of both.",
      "correct": false,
      "feedback": "That only sees the surface. Even compressed, the subagent starts out carrying history unrelated to its focused task, so its window isn't clean from turn one and its attention gets split — the loss lands on the subagent's reasoning quality, not on the transfer bill."
    },
    {
      "id": "c",
      "text": "The suggestion is fine: more context means the model understands more of the whole, so the result can only get better.",
      "correct": false,
      "feedback": "\"More context is always better\" is the exact intuition this course has been dismantling since Lesson 1: more tokens make the model's accurate recall from context worse, and the attention budget is a finite resource. Feeding a subagent history unrelated to its task spends its budget, it doesn't help it."
    }
  ]
}
```

## First-Hand Data: Subagents as Intelligent Filters

The mechanism is settled; now for measurements. Anthropic has publicly written up their multi-agent research system — the architecture behind Claude's Research feature — which is a rare piece of first-hand engineering material[^S3].

Three of its findings bear directly on this lesson:

- **Subagents facilitate compression by operating in parallel with their own context windows**[^S3]. Each subagent explores in a window of its own, without crowding the others.
- They call the subagents "intelligent filters": condensing the most important tokens for the lead research agent[^S3]. The word "filter" is apt — corpus goes in, essentials come out.
- One line worth chewing on: "The essence of search is compression: distilling insights from a vast corpus."[^S3] Read in this lesson's context: every exploration a subagent runs exists to produce that thousand-token distillate.

As an aside, the parallelism also buys speed — several lines of research advancing at once. But that's an orchestration topic, already covered in course 6 of this series; this lesson keeps its eye on the compression side only.

## The Other Side of the Ledger: Isolation Isn't a Cost-Saver

With the upside laid out, the bill has to be laid out too. The same write-up gives the measured numbers — note these are measurements from Anthropic's research system, not universal laws:

- Agents typically use about 4× more tokens than chat interactions[^S3];
- Multi-agent systems use about 15× more tokens than chats[^S3];
- When they analyzed where performance came from, token usage by itself explained 80% of the variance, with the number of tool calls and the model choice accounting for most of the rest[^S3].

Their own conclusion is candid: "Multi-agent systems work mainly because they help spend enough tokens to solve the problem."[^S3]

So let's be blunt: **a subagent is not a cost-saver.** Total tokens only go up — the task has to be restated, the background re-laid, several windows burning at once. What it buys is something else: every window stays in a range that hasn't degraded, so attention density holds high throughout. It's an attention trade — spend more total tokens, get a clean window each.

When is that trade worth making? Back to the budget view from Lesson 1: context is a finite resource with diminishing marginal returns[^S1]. Two questions to judge by:

1. **Process-to-conclusion ratio.** How large is this task's intermediate content, and how small is its final conclusion? The more lopsided the ratio, the greater the isolation payoff. Conversely, a task whose process is short to begin with is pure handoff overhead if you dispatch it.
2. **Whether complexity demonstrably improves the result.** Anthropic's guidance is to consider adding complexity only when it demonstrably improves outcomes — the word in the original is "consider," a matter of proportion, not an iron rule[^S2]. If the extra tokens don't buy a better output, fall back to a single window.

## The Long-Task Combo: Notes as the Base, Handoffs for Endurance

However clean a subagent's window is, it's still finite. For genuinely long-horizon tasks, the write-up describes a combo: agents summarize completed work phases and store essential information in external memory[^S3]; then they spawn fresh subagents with clean contexts to carry on, maintaining continuity through careful handoffs[^S3].

That threads Lesson 4 and this one into a single sequence of moves:

- Lesson 4's structured notes handle "putting the key state outside the window" — a NOTES.md, a task list — they live in the filesystem and occupy no window's attention;
- This lesson's isolation handles "keeping every stretch of work inside a clean window" — the first thing a fresh subagent does is read the notes; it doesn't need to inherit its predecessor's full history, only its predecessor's distilled essentials.

What goes in a handoff document? Reuse the same trade-off standard from Lesson 4's compaction: keep architectural decisions, unresolved bugs, and implementation details, and discard redundant tool outputs[^S1]. Writing a handoff and writing a compaction summary are the same craft; only the reader changes, from "your future self" to "the next subagent."

## What This Looks Like in Claude Code

Finally, hold this up against an implementation you use every day. Claude Code's official best practices put it plainly: the context window fills up fast, and performance degrades as it fills; "The context window is the most important resource to manage."[^S4] Since context is the fundamental constraint, subagents are one of the most powerful tools available[^S4].

Its implementation matches the mechanism this lesson describes: subagents run in separate context windows and report back summaries[^S4]. Ask Claude Code to "find the root cause of this bug" and the subagent it dispatches will grep, read files, and follow the call chain — all of that exploration happening in the subagent's own window, with the main conversation receiving only a summary of the investigation at the end. Scope investigations narrowly or hand them to subagents, and the exploration doesn't consume your main context[^S4].

When you see a subtask running in the background in the interface and the main conversation gains only a short report when it finishes, that's the "clean window in, compressed summary out" this lesson has been describing from the start.

By now you've seen all three pieces of the long-task toolkit: compaction (Lesson 4), structured notes (Lesson 4), and multi-agent architectures (this lesson). Their shared goal is to let an agent maintain coherence, context, and goal-directed behavior over sequences of actions[^S1]. In Lesson 6 we wire all three into your own harness.

<!-- exercises -->
## 💻 Exercises

### Level 1: Make the isolation call for three tasks

Your main agent takes on three tasks:

- **Task A**: In a repo of a few hundred thousand lines, find every call site still using the deprecated `LegacyLedgerReader` API, and suggest a migration order.
- **Task B**: The main agent has just read an 80-line function into context; the user points out an off-by-one bug in it and asks for a fix.
- **Task C**: For a library-selection decision, research three candidate parsing libraries — read each one's docs, dig through its issue tracker, and do a side-by-side comparison.

For each task, write down your decision — isolate (dispatch a subagent) or don't (do it in the main window) — noting parallelism where it applies, and give a sentence or two of reasoning using this lesson's criteria.

<!-- rubric -->
- All three judgments turn on the ratio of process tokens to conclusion tokens: the heavier the process and the smaller the conclusion, the more worth isolating
- Task B is judged not-to-isolate, with reasoning that includes the cost side: the function is already in the main window, so a fresh subagent would have to re-transfer the function and the task background, making the isolation overhead exceed the benefit
- Task C notes that the three research threads don't depend on each other, so they can occupy separate windows in parallel, each returning only the points the comparison needs

<!-- answer -->
- **Task A: isolate.** The process means a dozen greps and dozens of files read, with intermediate content possibly running to tens of thousands of tokens; the conclusion is just a list of call sites plus a migration order, a few hundred tokens at most. The process-to-conclusion ratio is very lopsided — the textbook case of "process stays inside the subagent, conclusion returns to the main window."
- **Task B: don't isolate.** The function is already in the main window and the fix is a one-step change with almost no intermediate process; a fresh subagent would only mean re-transferring the raw function and the task background. Isolation has a cost of its own, and a task whose benefit is smaller than that overhead isn't worth dispatching.
- **Task C: isolate, and run the three in parallel.** Research on the three libraries doesn't cross-depend, so each takes a separate window advancing at the same time, and each returns only the points the comparison needs (interface style, maintenance status, performance characteristics). The main agent then does its side-by-side on three summaries rather than on three sets of raw docs.

<!-- hint -->
First estimate how large each task's "intermediate content" is — how many files to read, how many searches to run — then estimate whether the final conclusion fits in a few sentences, and put the two numbers side by side.

<!-- hint -->
Don't forget the cost section: isolation itself spends tokens (the task description, the re-stated background). Is there a task whose needed context is already sitting in the main window?

### Level 2: Fix a "fake isolation" dispatch function

You've wired a subagent into the harness from course 7 of this series, with this dispatch logic:

```javascript
async function runSubagent(client, task, maxTurns = 15) {
  let messages = [{ role: "user", content: task }];
  for (let turn = 0; turn < maxTurns; turn++) {
    const response = await client.messages.create({
      model: "claude-sonnet-5",
      max_tokens: 4096,
      system: SUBAGENT_SYSTEM,
      tools: SEARCH_TOOLS,
      messages,
    });
    if (response.stop_reason === "end_turn") {
      // tack on the final reply too, return the full history
      return [
        ...messages,
        { role: "assistant", content: textOf(response) },
      ];
    }
    messages = await appendToolResults(messages, response);
  }
  return messages;
}

async function handleDispatch(mainMessages, toolCall) {
  const subHistory = await runSubagent(client, toolCall.input.task);
  mainMessages.push({
    role: "user",
    content: [{
      type: "tool_result",
      tool_use_id: toolCall.id,
      // render the whole history to text and stuff it back into the main window
      content: renderAsText(subHistory),
    }],
  });
}
```

Symptom: after three research dispatches, the main agent's context usage is nearing the window limit, and the compaction logic you installed in Lesson 4 is forced to trigger early. Inspect the main agent's message array and you'll find the vast majority of the tokens are the subagent's original tool returns.

Point out the root cause, edit the code so that each dispatch adds only one summary message to the main window.

<!-- rubric -->
- Identifies the root cause in `runSubagent`'s return value and `handleDispatch`'s write-back: the subagent's full message history (with all its tool returns) is rendered wholesale into text and stuffed into the main window, so the isolation is a hollow shell
- After the fix, `runSubagent` returns only the final summary text, the `tool_result` content is that summary, and each dispatch adds one message to the main window
- Explains the tie to Lesson 4: the main window is no longer flooded with the subagent's process content, so the compaction logic triggers less often

<!-- answer -->
Root cause: `runSubagent` returns not the conclusion but the subagent's **full message history** — `messages` gets padded turn after turn by `appendToolResults`, filling up with search results and raw file contents; then `handleDispatch` renders that entire stack to text with `renderAsText` and stuffs it into the main window. The longer the subagent runs, the more the main window is flooded — the whole process flows back, and the isolation is left an empty frame. That's exactly the symptom: three dispatches fill the main window near its limit, and the filler is those raw tool returns.

Fix: let only the summary leave the subagent.

```javascript
async function runSubagent(client, task, maxTurns = 15) {
  let messages = [{ role: "user", content: task }];
  for (let turn = 0; turn < maxTurns; turn++) {
    const response = await client.messages.create({
      model: "claude-sonnet-5",
      max_tokens: 4096,
      system: SUBAGENT_SYSTEM,
      tools: SEARCH_TOOLS,
      messages,
    });
    if (response.stop_reason === "end_turn") {
      // return only the summary; the full history dies with the local variable
      return textOf(response);
    }
    messages = await appendToolResults(messages, response);
  }
  return "Research did not finish within the turn budget";
}

async function handleDispatch(mainMessages, toolCall) {
  const summary = await runSubagent(client, toolCall.input.task);
  mainMessages.push({
    role: "user",
    content: [{
      type: "tool_result",
      tool_use_id: toolCall.id,
      content: summary, // each dispatch adds only this one entry
    }],
  });
}
```

After the fix, the main window gains only one summary message per dispatch, and the subagent's exploration process disappears along with the local variable. The knock-on effect: the main window is no longer flooded with process content, and Lesson 4's compaction logic won't get pushed into early triggering by three dispatches — compaction is left for the conversations that genuinely run long, rather than mopping up after a leaky dispatch function.

<!-- hint -->
Trace what's actually inside `renderAsText(subHistory)`: `messages` gets thicker and thicker in the loop via `appendToolResults` — where does that whole stack end up?

<!-- hint -->
Check against the mechanism section: what should be allowed to leave the subagent? Between "a distilled summary, often 1,000-2,000 tokens" and "the full message history," which one should the main window receive?

<!-- /exercises -->

## Recap

- A subagent is a context-management technique: the focused task runs in a clean context window, the intermediate content of exploration is isolated inside the subagent, and what returns is often only a distilled summary of 1,000-2,000 tokens — the main window carries the conclusion, not the process[^S1].
- In Anthropic's multi-agent research system, subagents run in separate context windows in parallel and achieve compression through that, acting as "intelligent filters" that condense the most important tokens for the lead agent; "The essence of search is compression"[^S3].
- Measured numbers from the same system: agents use about 4× more tokens than chats, multi-agent systems about 15×, and token usage by itself explains 80% of the performance variance — isolation is an attention trade, "spend more total tokens for a window that doesn't degrade," not a cost-saver[^S3].
- Whether isolation is worth it depends on the process-to-conclusion ratio, and on whether the added complexity demonstrably improves the result — Anthropic's word is "consider," a matter of proportion rather than an iron rule[^S2].
- The long-task combo: summarize once a phase completes, store the essentials in external memory, then spawn a fresh subagent with clean context and maintain continuity through careful handoffs — Lesson 4's notes and this lesson's isolation are a matched pair[^S3].
- In Claude Code the context window is the most important resource to manage, which makes subagents one of the most powerful tools available: they run in separate context windows and report back only summaries[^S4].

[>> Lesson 6: Hands-On: Wiring Context Management onto the Harness](./06-build-context-management.md)
