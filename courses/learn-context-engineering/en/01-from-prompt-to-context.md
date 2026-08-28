# Lesson 1: From Prompt Engineering to Context Engineering

> Learning goals:
> - Restate the definitions of prompt engineering and context engineering, and say why the two are an "evolution" rather than a "replacement"
> - Use the two ideas of "attention budget" and "context rot" to explain to a colleague what's wrong with "the window's big enough, so stuff everything in"
> - Point to the places in the harness loop you built in this series' course "Agent Harness Fundamentals: Loops and Control" where context only grows and never shrinks
>
> Prerequisites: You've finished this series' course "Agent Harness Fundamentals: Loops and Control" and have a working stop_reason-driven loop on hand | Next: [Lesson 2 >>](./02-anatomy-of-context.md)

## A Familiar Scene: Every Turn of the Loop, the Window Gets Heavier

In this series' course "Agent Harness Fundamentals: Loops and Control," you hand-wrote a loop like this (simplified; the four control valves — max turns, budget, and the rest — are left out for now):

```javascript
let response = await client.messages.create({
  model: MODEL, max_tokens: 1024, tools, messages, // keep your eye on the messages array
});

while (response.stop_reason === "tool_use") {
  messages.push({ role: "assistant", content: response.content });

  const toolResults = await runToolUses(response.content, toolImpls);
  messages.push({ role: "user", content: toolResults }); // tool results come in too

  response = await client.messages.create({
    model: MODEL, max_tokens: 1024, tools, messages,
  });
}
```

Back then all our attention was on control flow: how to read `stop_reason`, how to install the control valves. Now change the angle and stare at the `messages` array — it only ever gets `push`ed to, never trimmed. Every turn, at least two things come in: the model's reply for this turn (with its tool_use blocks), and the results the tools return. That second kind is often the bulk of it: picture a single `list_files` bringing back a few hundred filenames, or a log search bringing back tens of KB of raw text. From that point on they sit in the window forever, re-read from scratch on every round of reasoning.

This isn't a slip in your implementation; it's the nature of an agent. "An agent running in a loop generates more and more data that could be relevant for the next turn of inference"[^S1], and because it holds the autonomy, it may keep going for a great many turns[^S2]. In this series' course "Prompt Engineering Basics: How to Write Effective Instructions" you learned how to write a single instruction clearly — but however well an instruction is written, it's still just one small block inside the window. What actually decides how the agent performs on turn 40 is everything that happens to be sitting in the whole window at that moment.

## Two Definitions: From "Write One Good Sentence" to "Manage the Whole Window"

Formalize that observation and you get two definitions.

**Prompt engineering**: "Prompt engineering refers to methods for writing and organizing LLM instructions for optimal outcomes"[^S1]. The question it answers is: "How should I write and arrange this instruction for the best effect?"

**Context engineering**: "the set of strategies for curating and maintaining the optimal set of tokens (information) during LLM inference"[^S1]. The question it answers is: "For this round of reasoning, which tokens should be in the window, and which shouldn't?"

Notice the lift in perspective. The first is a one-time writing problem — write it once and it's set. The second is a tradeoff you have to re-answer on every turn of the loop. Anthropic explicitly frames context engineering as the natural progression of prompt engineering — "we view context engineering as the natural progression of prompt engineering"[^S1] — so the skill you built up in this series' course "Prompt Engineering Basics: How to Write Effective Instructions" isn't wasted at all. It becomes a subset of a bigger problem: the system prompt still has to be written well, but it's only one of the many context ingredients you now have to manage.

The community has more aggressive takes. A 2026 agent-engineering roadmap asserts "Prompt engineering is dead as a standalone skill in 2026."[^S5] Note that this is that roadmap's opinionated call, and this lesson doesn't treat it as consensus — Anthropic's phrasing is far more measured: evolution, not replacement[^S1]. That said, the one-line definition the same roadmap gives context engineering is worth keeping: "deciding what tokens are in front of the model at every step of the loop"[^S5]. And the same roadmap puts its finger on how much the harness matters: "Same model, different harness, completely different result."[^S5] — something you should already feel in your gut from the experiments in this series' course "Agent Harness Fundamentals: Loops and Control."

## Attention Budget: Every New Token Runs Up the Tab

Why is this something you have to manage? Isn't a bigger window just free rein? That brings us to the first physical fact.

"LLMs have an "attention budget" that they draw on when parsing large volumes of context"[^S1]. The catch is that this budget is finite: "Every new token introduced depletes this budget by some amount"[^S1].

Here's an analogy. Window capacity is the floor area of a warehouse; the attention budget is the crew you send in to find the goods. Expand the warehouse tenfold and the crew doesn't grow with it — the fuller the shelves, the harder it is to dig out the one item you actually want. Slipping one more "just in case" document into the window isn't a free backup; it's a real charge against the budget, paid out to cover the cost of reading it and ruling it out.

Flip to this view and a lot of habits deserve a second look. "The window can hold it, so let's just paste in the entire API doc" — holding it is a warehouse question, reading it well is a budget question, and the two aren't the same thing.

## Context Rot: A Gentle Slope, Not a Cliff

The macro consequence of a budget being drained continuously has a vivid name: **context rot** — "as the number of tokens in the context window increases, the model's ability to accurately recall information from that context decreases"[^S1].

Two details that are easy to get wrong, pinned down here:

**First, it's gradual, not a sudden drop.** This degradation shows up as a performance slope — "These factors create a performance gradient rather than a hard cliff"[^S1] — not a hard cliff where things suddenly stop working past some token count. So you'll never get an error; the agent just gets slowly duller. In everyday terms (this is the typical shape it takes in engineering experience, not an enumeration from the source): conventions confirmed earlier start getting forgotten, files already read get read again, bugs already fixed get reverted. Degradation with no alarm is harder to track down than an error.

**Second, it's a general rule, not one model's quirk.** Some models degrade more gently than others, but "some models exhibit more gentle degradation than others, this characteristic emerges across all models"[^S1]. Switching to a stronger model can postpone the problem; it can't cancel it.

Put those two together and you have this lesson's first cornerstone: "context, therefore, must be treated as a finite resource with diminishing marginal returns"[^S1]. The thousandth token you stuff into the window and the hundred-thousandth take up the same amount of room, but they're worlds apart in the value they add. The "more is safer" instinct has the direction exactly backwards — every extra bit of "insurance" you cram in dilutes the model's attention on the information that actually matters.

```agentmentor-check
{
  "id": "ctx-zh-01-finite-attention",
  "label": "Use attention budget to test the \"stuff everything in for safety\" instinct",
  "prompt": "A colleague sees you weighing what to put in the window each turn and tells you: \"The model window is 200K tokens. Just stuff in the project docs, the full conversation history, and all the tool descriptions — having all the information is safer than missing any.\" Which judgment is right?",
  "whyHere": "The previous section just covered attention budget and context rot, so this checks whether you've actually let go of the \"more is safer\" instinct — it's the core misconception this lesson needs to break, and all five lessons that follow build on this foundation.",
  "mode": "single",
  "choices": [
    {
      "id": "a",
      "text": "The colleague is right: as long as the window isn't full, extra information just sits there unused and doesn't cost anything.",
      "correct": false,
      "feedback": "\"Not full means no cost\" is a misconception: parsing large volumes of context itself consumes the attention budget, every new token depletes it by some amount, and irrelevant content dilutes the model's recall of key information — all of this is independent of whether the window is at capacity."
    },
    {
      "id": "b",
      "text": "Every new token consumes the finite attention budget, and the more tokens there are, the worse accurate recall gets — context is a finite resource with diminishing marginal returns, so \"full\" doesn't mean \"safe.\"",
      "correct": true,
      "feedback": "Right. Window capacity and attention budget are two different things: the first decides how much you can fit, the second decides how well you can use it. Though the degradation is a slope rather than a cliff, the trend appears across all models, so tradeoffs aren't optional."
    },
    {
      "id": "c",
      "text": "The problem is only cost: more tokens cost more money, but as long as you can cover the bill, filling the window doesn't affect answer quality.",
      "correct": false,
      "feedback": "Cost does go up, but that's not the root issue: the more tokens there are, the worse the model's ability to accurately recall information from the context — that's a performance rule unrelated to billing, and no amount of money buys back diluted attention."
    }
  ]
}
```

## Back to Agents: Why This Is the Foundation, Not Icing

In a single-turn Q&A, you might not even notice context rot — the window gets used once and discarded, and the token count usually doesn't reach the danger zone. Agents turn this problem from "occasionally encountered" to "getting worse every turn": data in the loop only grows and never shrinks[^S1], and agents may autonomously run for many turns[^S2]. Look back at the opening code — that `messages` array that only takes `push` and never gives anything back is this process made concrete.

On-the-ground engineering experience lines up completely. The official Claude Code docs state that "Claude's context window fills up fast, and performance degrades as it fills."[^S4] They call the context window "the most important resource to manage."[^S4] The same docs also have an observation worth copying down: "A clean session with a better prompt almost always outperforms a long session with accumulated corrections."[^S4] — "talked longer" doesn't mean "talked better," and every correction piled up, every tangent wandered down, is still sitting in the window taking part in the next round of reasoning.

So here's an accurate position for context engineering: it's not polish you add in the tuning phase; it's the foundation of agent reliability. The four control valves in this series' course "Agent Harness Fundamentals: Loops and Control" manage "don't let the loop run away"; this course installs another set of mechanisms — "don't let the window rot." Put both sets together and your harness is actually ready to be trusted with long tasks.

## This Course's Roadmap

For long-horizon tasks, Anthropic summarizes three classes of techniques — "compaction, structured note-taking, and multi-agent architectures," aimed at helping agents "maintain coherence, context, and goal-directed behavior over sequences of actions"[^S1]. This course follows that path:

- **Lesson 2** dissects the window: system prompt, tool definitions, examples — how much room does each take, and how do you write them without waste.
- **Lesson 3** covers just-in-time retrieval: instead of stuffing all the material in ahead of time, give the agent lightweight identifiers and let it go look things up on demand.
- **Lesson 4** covers compaction and notes: when the window approaches the limit, how to summarize and restart, and how to record key information outside the window.
- **Lesson 5** covers sub-agents and context isolation: send the messy exploratory work to a sub-agent with a clean window, and only pull back the distilled conclusion.
- **Lesson 6** returns to your own harness and installs these mechanisms one by one.

One last reminder about proportion. Every one of these mechanisms adds complexity, and Anthropic's engineering guidance says "you should consider adding complexity only when it demonstrably improves outcomes."[^S2] So every lesson ahead explains "when is it worth doing" before it explains "how to do it" — not every agent needs sub-agents, and not every task is worth compacting.

<!-- exercises -->
## 💻 Exercises

### Level 1: Sort Six Practices Into Two Drawers

Six practices are listed below. Which mainly belong to prompt engineering (focused on "how to write and organize the instruction itself"), and which mainly belong to context engineering (focused on "which tokens to maintain in the window on each round of reasoning")? Classify each one and write a one-sentence rationale for each.

1. Rewrite the system prompt from "you are an assistant" to a specific description of responsibilities and boundaries
2. Every turn of the harness, replace tool results from three turns ago with a one-line summary
3. Add an "input looks like this, output looks like that" example to the task instruction
4. Given a 500-page product manual, only give the model the table of contents and file paths, and let it look things up when needed
5. Change "be concise" in the instruction to "reply in no more than three sentences"
6. When the session reaches turn 40, compress the full history into a summary and use it to restart with a fresh window

<!-- rubric -->
- Provides a clear criterion for the judgment: does this practice change "the quality of some instruction text," or "the entry and exit and retention of the token set in the window" — rather than slapping on labels by feel
- Classification matches the reference answer (1, 3, 5 are prompt engineering; 2, 4, 6 are context engineering), or for disputed items, gives a self-consistent argument based on the stated criterion
- Can use the ideas of attention budget or finite resource to explain why the context engineering category is not optional in multi-turn agent scenarios

<!-- answer -->
Criterion: look at the object the practice acts on. If it modifies **how a piece of instruction text itself is written** (wording, structure, examples), and once written it's fixed, that's prompt engineering. If it decides **which content enters the window, in what form it stays, and when it leaves**, and needs to be executed repeatedly in the running loop, that's context engineering.

Item by item:

- **1 → Prompt engineering.** Changing the quality of the system prompt text, written once and done; doesn't involve entry and exit of window content.
- **2 → Context engineering.** Decides the retention and removal of old tool results in the window — swapping the original for a summary is a window-maintenance action executed every turn.
- **3 → Prompt engineering.** Adding examples is organizing the components of the instruction to better convey intent.
- **4 → Context engineering.** Choosing between "full text in the window" and "just paths, look up on demand" is exactly deciding which tokens go in the window.
- **5 → Prompt engineering.** Changing fuzzy wording to a testable constraint is classic instruction rewriting.
- **6 → Context engineering.** Summary-and-restart changes the token set of the entire window and has nothing to do with how a single instruction is written.

Why the second category isn't optional in multi-turn agent scenarios: data in the loop only grows and never shrinks, while the attention budget is finite and every new token consumes some of it; context is a finite resource with diminishing marginal returns[^S1]. However well the instruction is written, it can't stop the window from being filled turn by turn with tool results and message history — someone (meaning your harness) has to make the tradeoffs.

<!-- hint -->
Go back to the two definitions: one is about "how to write and organize instructions," the other is about "maintaining which optimal token set in the window at reasoning time." For each practice, ask: does it change the wording of a piece of text, or the entry and exit and retention of window content?

<!-- hint -->
Another litmus test: is this practice written once and done, or is it an action that has to be executed every turn (or on specific turns) of the loop? The latter is almost always managing the window.

### Level 2: Install a Minimal Observation Gauge on the Loop

Without calling a real model, write a standalone script that simulates the loop from this series' course "Agent Harness Fundamentals: Loops and Control" running for 20 turns: each turn, append a simulated assistant message (assume 200 characters) and a simulated tool result (assume 3000 characters) to `messages`, and print the cumulative character count turn by turn. Then add a switch: keep only the most recent 5 turns' worth of tool results (move older ones out of the list), and run it again. Answer two questions: what trend does the cumulative count show in each of the two modes? What does the difference say?

<!-- rubric -->
- The script runs independently and outputs the cumulative count turn by turn; the "keep everything" mode shows linear growth, confirming "data in the loop only grows and never shrinks"
- The "keep only the most recent 5 turns of tool results" mode clearly slows its growth rate from turn 6 onward (the tool results cap out, leaving only the assistant messages slowly accumulating), and can point out that the difference comes entirely from trimming tool results
- Can connect the observation to this lesson's ideas: unmanaged linear growth continuously drains the finite attention budget, so the content to trim first is "largest in size and shortest in usefulness"

<!-- answer -->
Reference implementation:

```javascript
const ASSISTANT_LEN = 200;    // simulated length (characters) of each turn's assistant message
const TOOL_LEN = 3000;        // simulated length (characters) of each turn's tool result
const TURNS = 20;
const KEEP_RECENT_TOOL = 5;   // keep only the most recent 5 turns of tool results; set to null to keep all

let messages = [];
for (let turn = 1; turn <= TURNS; turn++) {
  messages.push({ role: "assistant", size: ASSISTANT_LEN });
  messages.push({ role: "tool", size: TOOL_LEN });

  if (KEEP_RECENT_TOOL !== null) {
    const toolIndexes = messages
      .map((m, i) => (m.role === "tool" ? i : -1))
      .filter((i) => i >= 0);
    const stale = new Set(toolIndexes.slice(0, -KEEP_RECENT_TOOL));
    messages = messages.filter((_, i) => !stale.has(i));
  }

  const total = messages.reduce((sum, m) => sum + m.size, 0);
  console.log(`turn=${String(turn).padStart(2)} total_chars=${total}`);
}
```

Trends in the two modes:

- **Keep everything** (`KEEP_RECENT_TOOL = null`): net gain of 3200 characters every turn, a strict straight line, cumulative total of 64000 at turn 20. This is what "data only grows and never shrinks" looks like — with no intervention, growth never stops.
- **Keep only the most recent 5 turns**: identical to "keep everything" for the first 5 turns; from turn 6 onward, each new tool result coming in displaces the oldest one going out, canceling each other so the net gain per turn drops to just 200 characters (the assistant message), cumulative total at turn 20 is 200 × 20 + 3000 × 5 = 19000. The curve flattens noticeably after turn 5.

What the difference says: the gap between the two curves comes entirely from trimming tool results — the largest-in-size, shortest-in-usefulness content in the window (old file listings, old search raw text, typically no longer referenced after a few turns). Without management, linear growth continuously drains the finite attention budget, and context is a finite resource with diminishing marginal returns[^S1]. This "keep only the most recent N turns of tool results" switch is the simplest form of the compaction strategy Lesson 4 will expand systematically.

<!-- hint -->
You don't need to call a real API — the observation target is the size of `messages`, not the content the model outputs. Use fixed-length placeholder messages to simulate the per-turn additions.

<!-- hint -->
"Keep only the most recent 5 turns" means from turn 6 onward, every new tool result coming in has an oldest one going out. Do the math: at that point, what's left of the net gain per turn?

<!-- /exercises -->

## Recap

- Context engineering is the natural progression of prompt engineering: the first manages "which optimal token set to maintain in the window at reasoning time," the second manages "how to write and organize instructions," and the perspective lifts from one sentence to the whole window[^S1].
- "Prompt engineering is dead as a standalone skill" is an opinionated assertion from a community roadmap[^S5]; this lesson uses the more measured phrasing — evolution, not replacement[^S1].
- LLMs parse context using a finite attention budget, and every new token consumes some of it[^S1] — "the window can hold it" and "the model can use it well" are two different things.
- Context rot is a gradual performance slope rather than a cliff, steeper on some models and gentler on others but the trend appears across all models[^S1], so it doesn't error out; it just quietly makes the agent duller.
- Context is a finite resource with diminishing marginal returns[^S1]; data in the agent loop only grows and never shrinks[^S1], which is why the official Claude Code docs call the context window "the most important resource to manage."[^S4]
- The three classes of techniques for long-horizon tasks — compaction, structured note-taking, and multi-agent architectures[^S1] — correspond to the main threads of Lessons 4 and 5; Lesson 6 installs them into your harness. Before introducing any complexity, confirm it actually improves outcomes[^S2].

[>> Lesson 2: Anatomy of Context: System Prompt, Tools, and Examples](./02-anatomy-of-context.md)

