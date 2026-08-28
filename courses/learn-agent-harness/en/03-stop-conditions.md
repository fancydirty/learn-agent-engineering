# Lesson 3: Stop Conditions: When an Agent Should Quit

> Learning goals:
> - Explain why letting the model return `end_turn` on its own isn't enough to end a loop, and state the tension plainly: you have to trust the model, yet it may keep going for many turns
> - Add a max-turn hard gate to a skeleton loop, and explain why the counter only works if it lives outside the loop
> - Tell a hard stop (forced halt at the ceiling) from a soft stop / suspend (pause for a human, resumable), and list the conditions under which a given agent must stop
>
> Prerequisites: You've read Lesson 2, can write a `while` loop driven by `stop_reason`, and know that the loop ends on its own when `end_turn` comes back | Prev: [Lesson 2 <<](./02-the-core-loop.md) | Next: [Lesson 4 >>](./04-loop-failure-modes.md)

## Don't Count on the Model to Call It Quits

The skeleton loop from Lesson 2 stops for exactly one reason: on some round the model stops asking for tools, `stop_reason` flips from `tool_use` to `end_turn`, the `while` condition goes false, and the loop ends by itself.[^S2] Put another way, the decision about whether to go around again has been handed entirely to the model — the loop stops when the model says it's finished talking.

Most of the time that works, but be clear about who's making the call. An agent is, by definition, a system where the model dynamically directs its own process and its own tool usage,[^S1] and deciding when to quit is part of that. Autonomy is exactly what makes an agent useful, but the other side of the same coin is that "The autonomous nature of agents means higher costs, and the potential for compounding errors."[^S1] And the sentence that matters most here: "The LLM will potentially operate for many turns, and you must have some level of trust in its decision-making."[^S1]

The word to sit with is *trust*. Trust is not the same as leaving the model unsupervised. If the model gets stuck at some step, or gets pulled off course by something a tool handed back, and just never returns `end_turn`, a loop that only watches `stop_reason` won't get impatient on your behalf. It will keep the model company, round after round, spinning — because nothing in the `while` condition you wrote says "that's enough laps." So self-termination by the model isn't enough on its own. You need stop conditions the host decides, ones that don't wait on the model's mood.

## First, a Hard Gate on the Loop: Max Turns

The most basic stop condition of all is named right in Anthropic's engineering guidance: "it's also common to include stopping conditions (such as a maximum number of iterations) to maintain control."[^S1] Translated into code, that's a ceiling on how many times the loop is allowed to go around.

On top of the Lesson 2 skeleton, the change is small:

```javascript
// tools is the tool-definition manifest you send along on every round
const MAX_TURNS = 10;              // the hard gate: let the loop go around 10 times at most
const messages = [{ role: "user", content: userInput }];
let turns = 0;                     // counter lives outside the loop so it can accumulate across rounds

let response = await callModel({ tools, messages });

while (response.stop_reason === "tool_use") {
  // check the gate before this round starts: at the cap, hard-stop and send no further request
  if (turns >= MAX_TURNS) {
    return { stopped: "max_turns", turns, last: response };
  }
  turns += 1;

  messages.push({ role: "assistant", content: response.content });

  const toolUseBlocks = response.content.filter((b) => b.type === "tool_use");
  const toolResults = await Promise.all(
    toolUseBlocks.map(async (block) => ({
      type: "tool_result",
      tool_use_id: block.id,
      content: await executeTool(block.name, block.input),
    }))
  );
  messages.push({ role: "user", content: toolResults });

  response = await callModel({ tools, messages });
}

// two ways out of the loop: the early return above, or stop_reason no longer being tool_use
return { stopped: "end_turn", turns, last: response };
```

Two things carry the weight here. First, `let turns = 0` is declared **outside** the loop. It has to stay alive across rounds and add each one up, or the gate has no idea how many laps have gone by; move it into the loop body and you get exactly the trap the Level 2 exercise takes apart. Second, the gate doesn't care **why** the model is still asking for tools — stuck, going in circles, pulled off course by tool output, it never asks. Once the lap count hits the ceiling, the host stops, sends no further request, and takes control back to its own side.

That's a **hard stop**: at the boundary it halts unconditionally and the loop is over. It's a different thing from the soft finish of `end_turn`, where the model decides it's done — one is a ceiling you set, the other is the model's own judgment. Note that there's no standard answer for how large `MAX_TURNS` should be; it depends on roughly how many rounds the task ought to need. The 10 here is a placeholder. What matters is that the gate exists and can actually stop a loop that's run away.

```agentmentor-check
{
  "id": "harness-zh-03-self-stop-insufficient",
  "label": "Judge whether model self-termination alone is enough, with no other stop condition",
  "prompt": "You're designing an ops agent that will call tools round after round. A colleague argues: models are smart enough now that they return end_turn on their own once the task is done, so the loop needs no external stop condition — leave the decision to quit to the model. Should you go along with this?",
  "whyHere": "This section just argued that end_turn alone isn't enough, and bolted a max-turn hard gate onto the loop. The check exists to block the belief that a model is smart enough to stop at the right moment by itself and therefore needs no external stop condition, because that belief is precisely how the decision to quit gets handed over wholesale to the model and the loop runs away.",
  "mode": "single",
  "choices": [
    {
      "id": "a",
      "text": "Yes. The model can judge for itself whether the task is finished and will return end_turn when it is, so an extra stop condition is over-engineering.",
      "correct": false,
      "feedback": "This mistakes trust for a free hand. The model does direct its own process, but it can also get stuck at some step, or get pulled off course by what a tool returned, and never come back with end_turn — running for many turns while a loop that only watches stop_reason keeps it company and spins. That's exactly why adding an explicit stopping condition (a maximum number of iterations, say) to maintain control is a common practice, rather than leaving the boundary entirely to the model."
    },
    {
      "id": "b",
      "text": "No. Beyond the model's own end_turn, you need an explicit stop condition the host decides — a max turn count, for instance.",
      "correct": true,
      "feedback": "Right. end_turn is the model's own judgment, and autonomy itself brings higher costs and compounding errors. You do have to place some level of trust in its decision-making to let it run at all, but trust isn't the absence of a boundary; a max-turn hard gate takes control back from the model to the host when the model won't quit on its own."
    }
  ]
}
```

## Beyond the Hard Stop, Another Kind: Stopping to Wait for a Human

Gates like max turns share a property: hitting one is the end of the road — the loop is over and won't continue on its own. But that's not the only kind of stop condition. The same article names another: "Agents can then pause for human feedback at checkpoints or when encountering blockers."[^S1] That's a different animal from a hard stop, and worth pulling apart:

- **Hard stop**: at the ceiling it halts, the loop is finished for good, nothing continues automatically. Max turns and exhausted budget both belong here. It's a **terminal state**.
- **Soft stop / suspend**: the loop deliberately halts at a checkpoint, hands control to a person, and can pick up from that exact spot once they've answered. It isn't an ending; it's a **resumable pause**.

In code the difference lands on what you return. A hard stop returns a final result — this is where it ended. A soft stop has to preserve state: it returns a snapshot of the scene that can be resumed from, handing over the current `messages` along with the pending action it stalled on, so that once a human has dealt with it, that snapshot is enough to carry on:

```javascript
while (response.stop_reason === "tool_use") {
  if (turns >= MAX_TURNS) {
    return { stopped: "max_turns", turns, last: response };   // hard stop: terminal
  }

  const block = response.content.find((b) => b.type === "tool_use");
  if (needsHumanApproval(block)) {
    // soft stop / suspend: not an ending, a pause. Hand over the whole scene so it can resume here
    return { paused: "awaiting_human", pending: block, messages, turns };
  }

  // ...otherwise run the tool, append to history, and send the next request as usual
}
```

The classic soft-stop case is the model's next step being something irreversible — dropping a database, blasting out an email, submitting an order — and you want a person to look before it goes through; or the model reporting on its own that it's stuck and needs more information. Drawing the hard-stop / soft-stop line is enough for now. How `needsHumanApproval` actually decides, and how the loop resumes from that snapshot once a person answers, is the main subject of Lesson 5 on keeping a human in the loop.

## A Framework: Start by Asking "Under What Conditions Must It Stop?"

With hard stops and soft stops in hand, designing an agent gets a handy opening move. Before writing any loop, get one question answered: **under what conditions must this thing stop?** List the answers out and they usually come down to these four:

1. **The task is done** — the model returns `end_turn`. This is the softest of the four, judged by the model, and you still have to confirm it really finished rather than gave up partway.
2. **The turn ceiling** — a hard stop. That's the `MAX_TURNS` gate above, catching the worst case where the loop gets going and can't rein itself in.
3. **A blocker that needs a human decision** — a soft stop / suspend, pausing for human feedback.[^S1] Triggered by irreversible operations, or by the model explicitly reporting that it's blocked.
4. **Budget exhausted** — a hard stop. Tokens, spend, or elapsed time: whichever hits its ceiling first stops the loop. The details (how to count, where to instrument) wait for Lesson 4.

Line those four up and something becomes visible: the decision to stop doesn't all sit with the model. Number 1 belongs to the model, numbers 2 and 4 belong to the host (they stop at the mark regardless of what the model thinks), and number 3 is shared. That Lesson 2 skeleton loop implemented only number 1 and dropped the other three — this lesson adds number 2, the most basic hard gate, while numbers 3 and 4 come in Lesson 5 and Lesson 4 respectively.

The value of the framework isn't memorizing four items. It's building a habit: before you write the loop, count the "must stop" conditions out explicitly, instead of leaving them buried under the default assumption that the model will stop anyway.

## Stop Conditions Are Cheap Insurance, Not Over-Engineering

Someone may grumble that these gates turn a simple loop into a complicated one. Which brings up a principle Anthropic keeps returning to: "you should consider adding complexity only when it demonstrably improves outcomes."[^S1] That line usually gets quoted to talk people out of piling on elaborate machinery, but for stop conditions it points the other way — it lets them through.

Do the arithmetic and it's obvious. A max-turn counter is one declaration outside the loop and one comparison inside it, a few lines of code. What it blocks — a loop that won't stop spinning, costs climbing out of control, an irreversible action taken on a manipulated or malformed output — costs far more. Agent autonomy already carries higher costs and the potential for compounding errors,[^S1] and a stop condition is the cheapest brake aimed squarely at that risk.

So a stop condition isn't the kind of complexity you should add only when it demonstrably improves outcomes[^S1] — it clears that bar outright. It compresses the worst-case boundary from "unbounded" to "bounded," which is itself a verifiable improvement in outcomes. It's the most basic control that makes an autonomous loop something you dare let run, not a decorative extra.

<!-- exercises -->
## 💻 Exercises

### Level 1: Count Out an Agent's Stop Conditions

You're designing a "fix CI automatically" agent. It picks up a failing pipeline and has these tools: `read_logs` (read the logs), `edit_file` (change code), `run_tests` (run the tests), and `push` (push to the remote, triggering a fresh CI run). The goal is to get the tests green. Answer these for it:

1. List at least four conditions under which this agent must stop.
2. For each one, mark it as a **hard stop** or a **soft stop / suspend**, and say whether the decision to stop belongs to the model, to the host, or to both.
3. Would you design `push` (which pushes to the remote and triggers a CI run other people can see) as a soft stop waiting for a human to approve? Give one line of reasoning.

<!-- rubric -->
- At least four stop conditions given, covering most of the four categories: task done / turn ceiling / blocker needing a human decision / budget exhausted
- Each condition classified correctly as hard or soft, with a reasonable call on who decides (task done → the model, turns and budget → the host, blocker-type → shared)
- A clear position on `push` with a reason: recognizes it as an externally visible, relatively costly action, well suited to a soft stop awaiting approval

<!-- answer -->
1. Four (or more) stop conditions:
   - **Tests are green / the task is done** — the model judges it fixed and returns `end_turn`.
   - **The turn ceiling** — for example, several rounds of "edit code → run tests" without going green, hitting `MAX_TURNS` and being forced to stop.
   - **Right before pushing to the remote (`push`)** — halt and wait for approval, because this step is externally visible and triggers a CI run other people can see.
   - **Budget exhausted** — cumulative tokens / spend / elapsed time hits a ceiling and it stops (details in Lesson 4).
   - (Optional) **The model reports a blocker** — for instance it decides it needs a permission or credential it can't get, and suspends for a human.
2. Classification and who decides:
   - Task done: **soft finish**, decided by the **model** (it returns `end_turn`).
   - Turn ceiling: **hard stop**, decided by the **host** (stops at the mark, regardless of what the model wants).
   - Budget exhausted: **hard stop**, decided by the **host**.
   - Approval before `push`, and the model reporting a blocker: **soft stop / suspend**, **shared** (the host sets the checkpoint, a person decides whether to continue).
3. Yes. `push` sends changes to the remote and kicks off a CI run other people can see — an externally visible action that costs something to roll back, which suits a soft stop: the loop halts before the push, a person looks at the changes and decides whether to let them through, rather than letting the model push all the way out on its own.

<!-- hint -->
Go back to the four in the main text: task done, turn ceiling, blocker needing a human decision, budget exhausted. Apply each one to this CI-fixing scenario and see which concrete step it maps to.

<!-- hint -->
To tell a hard stop from a soft one, ask a single question: after it stops, can it pick up from where it left off? If it can't and that's the end, it's a hard stop. If it can resume once a person answers, it's a soft stop.

### Level 2: Why This Max-Turns Gate Didn't Catch Anything

A colleague wanted a max-turn safeguard on the loop and wrote the version below. He tried it on tasks needing one or two tool calls and it "looked fine." But once the model fell into calling the same tool over and over without returning `end_turn`, this gate caught nothing at all and the loop kept running away. Find the root cause and fix it.

```javascript
async function runAgent(userInput, tools) {
  const MAX_TURNS = 10;
  const messages = [{ role: "user", content: userInput }];
  let response = await callModel({ tools, messages });

  while (response.stop_reason === "tool_use") {
    let turns = 0;                       // meant to catch a runaway loop
    if (turns >= MAX_TURNS) {
      return { stopped: "max_turns", response };
    }
    turns += 1;

    const block = response.content.find((b) => b.type === "tool_use");
    const result = await executeTool(block.name, block.input);
    messages.push({ role: "assistant", content: response.content });
    messages.push({
      role: "user",
      content: [{ type: "tool_result", tool_use_id: block.id, content: result }],
    });

    response = await callModel({ tools, messages });
  }
  return response;
}
```

<!-- rubric -->
- Names the root cause exactly: `let turns = 0` is declared inside the loop body, gets reset to 0 on every round, `turns >= MAX_TURNS` is never true, and the gate is dead code
- Explains how this differs from the Lesson 2 infinite loop: here `response` does get reassigned and the loop can still stop on the model's own `end_turn`, which is why "short tasks look fine"; but the max-turn backstop that should have caught the runaway never engaged
- Gives the fix: move `let turns = 0;` above the `while` (counter state has to accumulate across rounds), keeping `turns += 1` inside the loop body

<!-- answer -->
Root cause: **the counter `turns` is declared inside the loop body.** `let turns = 0` runs again at the top of every round, so `turns` is reset to 0 each lap; `turns += 1` bumps it to 1, the next round drops it back to 0, and the test `turns >= MAX_TURNS` (10) can never come out true. The gate is dead code from start to finish — a stop condition works because its state accumulates across rounds, and the scope of a `let` declaration ends at that pair of braces, so it can't carry over.

Why "short tasks look fine": this code isn't the same as the Lesson 2 infinite loop. The bug there was forgetting to reassign `response`, so the loop could never exit at all. Here `response` does get reassigned, and the loop can stop normally whenever the model returns `end_turn` on some round. So as long as the model behaves and quits within a round or two, you never notice the gate is inert — it simply never got called on. But the moment the model refuses to return `end_turn` and starts spinning, the safeguard you thought you had turns out never to have been wired up, and the loop runs away all the same.

The fix — move the counter outside the loop so it accumulates across rounds:

```javascript
async function runAgent(userInput, tools) {
  const MAX_TURNS = 10;
  const messages = [{ role: "user", content: userInput }];
  let turns = 0;                         // moved outside: the state has to live across rounds to stop anything
  let response = await callModel({ tools, messages });

  while (response.stop_reason === "tool_use") {
    if (turns >= MAX_TURNS) {
      return { stopped: "max_turns", response };
    }
    turns += 1;

    const block = response.content.find((b) => b.type === "tool_use");
    const result = await executeTool(block.name, block.input);
    messages.push({ role: "assistant", content: response.content });
    messages.push({
      role: "user",
      content: [{ type: "tool_result", tool_use_id: block.id, content: result }],
    });

    response = await callModel({ tools, messages });
  }
  return response;
}
```

<!-- hint -->
A stop condition can only hold back a loop if its state accumulates across rounds. Look at which line declares `turns`: at the top of the second round, does it still remember what the first round added?

<!-- hint -->
A variable declared with `let` is scoped to the pair of braces it sits in. Right now `turns` lives inside the `while` body, so every round executes a brand-new `let turns = 0`.

<!-- /exercises -->

## Recap

- The loop ends naturally on `end_turn`, but that's the model's own judgment; you can only place some level of trust in its decision-making, and it may operate for many turns, so relying on model self-termination alone isn't enough[^S1]
- The most basic hard gate is a max turn count: including an explicit stopping condition such as a maximum number of iterations to maintain control is a common practice[^S1]; the counter has to sit **outside** the loop to accumulate across rounds, and moving it into the body turns it into dead code that stops nothing
- Beyond hard stops there are soft stops / suspends: pausing for human feedback at checkpoints or when encountering blockers[^S1] — not a terminal state but a resumable pause that picks up from a snapshot of the scene
- When designing an agent, ask first under what conditions it must stop: task done (`end_turn`, the model's call), turn ceiling (hard stop, the host's call), a blocker needing a human decision (soft stop, shared), budget exhausted (hard stop, covered in Lesson 4)
- Stop conditions are cheap control with a large payoff: autonomy already brings higher costs and compounding errors,[^S1] and a max-turns gate catches exactly the worst case; against the principle of adding complexity only when it demonstrably improves outcomes,[^S1] it clears the bar outright — compressing the unbounded into the bounded is a verifiable improvement

[>> Lesson 4: Runaway and Fallback: Dead Loops, Idle Spinning, Budget Burnout](./04-loop-failure-modes.md)
