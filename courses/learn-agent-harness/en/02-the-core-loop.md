# Lesson 2: The Core Loop: From One Round-Trip to Continuous Operation

> Learning goals:
> - Recite the four steps of the multi-turn loop that stop_reason drives, and connect one tool-call round-trip into a while loop that keeps running
> - Use the value of stop_reason (tool_use / end_turn) to decide whether the loop continues or stops, and explain why that field is the loop's while condition
> - Point out which boundaries this skeleton loop is missing, and explain why the history grows on every turn and why you can't rely on the model alone saying "I'm done"
>
> Prerequisites: You've read Lesson 1 and know that a harness is the layer of control code around the model; you can read the tool_use / tool_result of a single tool-call round-trip | Prev: [Lesson 1 <<](./01-what-is-a-harness.md) | Next: [Lesson 3 >>](./03-stop-conditions.md)

## One Round-Trip Stops Being Enough

Lesson 1 already took a full tool-call round-trip apart: the model returns `stop_reason: "tool_use"` along with a `tool_use` block, your host code reads out `name` and `input`, actually runs the thing, packs the output into a `tool_result` and sends it back, and only then does the model give its final answer. Three chunks of JSON, one trip, done.

Real tasks are rarely that polite. Change the scenario: you're writing an on-call bot, and a user says, "Restart the api service for me, then check whether the logs still have errors, and paste them if they do." That one sentence packs in two jobs, and the second depends on the first — checking the logs means nothing until the restart has finished. The model can't do both in the first turn. All it can do is this:

1. Turn one returns `tool_use`, calling `restart_service`. You run it and send "restart succeeded" back.
2. Turn two returns `tool_use` again, this time calling `read_logs`. You run it and send the log contents back.
3. Turn three finally returns `stop_reason: "end_turn"`, with a line like "Restart complete; the logs have two timeout errors, pasted below."

One user request, three trips back and forth. What the model can see at each step, and what it does next, depends on what came back in the previous `tool_result` — which is exactly Anthropic's definition of an agent: an LLM using tools based on environmental feedback in a loop.[^S1] The single round-trip from Lesson 1 is just the special case where that loop happened to turn only once. What this lesson does is connect "one round-trip" into "round-trips that keep going," and get a clear look at what the loop in the middle is, what drives it, and where it needs a brake.

## The Four Steps of the Loop

Turning a single round-trip into a loop doesn't require inventing anything new. You just repeat the moves you already know. The Claude API docs write this multi-turn process out as a fixed sequence:[^S2]

1. You send a request carrying `messages` and the `tools` manifest (`tools` has to go along on every single turn).
2. The model returns a response. If it still needs a tool, `stop_reason` is `"tool_use"` and `content` carries one or more `tool_use` blocks.
3. You execute every `tool_use` block and turn each output into a `tool_result` block. The key word in that step is *every*: however many `tool_use` blocks came back in one response, the next `user` message needs that many matching `tool_result` blocks, each claimed by its `tool_use_id`, all packed into that one immediately following `user` message. The docs put the rule this way: "Whichever strategy you use, return one tool_result for each tool_use block, all together in the next user message. Match each result to its call with tool_use_id, and put every tool_result block before any text content in that message."[^S6]
4. You append both the model's full response for that turn (`assistant` role) and the `tool_result` batch you assembled (`user` role) to `messages`, then send another request.

Then comes the sentence that matters most: repeat from step 2 while `stop_reason` is `"tool_use"`.[^S2] That "repeat while" is the axle that stretches a single round-trip into a loop. Lesson 1's example stopped at the first `end_turn` because one trip was all that task needed; the on-call bot runs steps 2 through 4 three times over, until turn three comes back `end_turn`.

Worth remembering: the fields on the `tool_use` and `tool_result` blocks haven't changed at all. A `tool_use` block carries `id` / `name` / `input`; a `tool_result` block carries `tool_use_id` / `content`, plus an optional `is_error` when the call failed.[^S6] The loop doesn't rewrite what any of those fields mean. It only makes the same set of fields get filled in and sent back, over and over.

## stop_reason Is the Loop's while Condition

That line above — "repeat while `stop_reason` is still `tool_use`" — translates into code as the test on a while loop. And the one sentence you should carry out of this lesson is this: **deciding whether the loop continues or stops comes down to that single field, `stop_reason`.** It has many possible values, but for loop control, telling two of them apart is enough to start:

- `"tool_use"`: the model still wants a tool. It hands the request to you and waits for you to execute and send the result back before continuing. The loop turns another round.
- `"end_turn"`: the model doesn't want a tool anymore; it thinks it's said what it has to say. The loop ends on its own and you hand the final text to the user.

An open-source roadmap on harness engineering puts this control layer bluntly: what drives a harness is the while loop running model→tools→model.[^S5] And what sits in that while loop's condition expression is `stop_reason`. Same model, same tool set — how many rounds it turns and when it stops is decided entirely by how the host reads that field and how it writes that condition. Which is why Lesson 1 said "Same model, different harness, completely different result."[^S5]

One thing to settle up front, so you don't read the signal backwards: `stop_reason: "tool_use"` means the model **wants** to use a tool, not that a tool **has been** used. The model never executes anything on its own. It emits a structured request; the thing that actually runs the tool is your host code (or Anthropic's servers), and the result only flows back into the conversation afterward.[^S2] So at the instant `tool_use` shows up in the loop, nothing has happened yet. The action happens in the few lines of your code that read out `name` and `input` and go do the work. Treating "I received a tool_use" as "the tool finished running" is the easiest trip-up when moving from a single round-trip to a loop — it makes you misjudge which step the loop is actually on right now.

```agentmentor-check
{
  "id": "harness-zh-02-tooluse-not-executed",
  "label": "Decide whether the tool has actually run after stop_reason tool_use arrives",
  "prompt": "Your loop sends its third request. The model returns stop_reason: \"tool_use\", and content holds one tool_use block whose name is run_migration (running a database migration against the production database). At the moment your code reads this response, has the migration script already executed against the database?",
  "whyHere": "This section has just made stop_reason the loop's while condition and pointed out that tool_use means the model wants a tool, not that one has been used. The check stops the belief that a returned tool_use block means this turn's tool has already finished, because that belief makes you misjudge which step the loop is currently on.",
  "mode": "single",
  "choices": [
    {
      "id": "a",
      "text": "It has run. Since the model returned a tool_use block, this turn's migration is already done on the database and the loop should wrap up.",
      "correct": false,
      "feedback": "That treats a signal as an execution receipt. A tool_use block is only the request slip the model hands over, meaning \"I want to call run_migration\" — the model itself has no way to connect to a database or run a script. The migration happens only after your host code reads the block and actually executes it; at this instant nothing on the database has moved."
    },
    {
      "id": "b",
      "text": "Not yet. This is only the model requesting a call; the migration runs when the host executes it and sends the tool_result back, and the next turn follows.",
      "correct": true,
      "feedback": "Right. tool_use is the signal to keep looping, not a receipt saying the tool finished. Execution always stays on the host side: you read out name and input, call the real migration logic, package the output as a tool_result and send it back, and only then does the loop turn again and the model get to see what the migration actually did."
    }
  ]
}
```

## Written Out, It's Only a Few Lines

Put those four steps and the `stop_reason` while condition into JavaScript and the skeleton is surprisingly short:

```javascript
// tools is the list of tool definitions that has to go along on every turn
const messages = [{ role: "user", content: userInput }];

let response = await callModel({ tools, messages });

while (response.stop_reason === "tool_use") {
  // 1. Append the model's full response for this turn to the history
  messages.push({ role: "assistant", content: response.content });

  // 2. Run every tool_use block in this turn, packing each into a tool_result
  const toolUseBlocks = response.content.filter((b) => b.type === "tool_use");
  const toolResults = await Promise.all(
    toolUseBlocks.map(async (block) => ({
      type: "tool_result",
      tool_use_id: block.id,
      content: await executeTool(block.name, block.input),
    }))
  );

  // 3. Append this batch of tool_result blocks to the history as one user message
  messages.push({ role: "user", content: toolResults });

  // 4. Send another request with the now-longer history; back to the while check
  response = await callModel({ tools, messages });
}

// We're out of the loop, so stop_reason is no longer tool_use (end_turn, say),
// and response holds the final text answer
```

Walk the four steps once more against the code: the `while` line is "repeat while it's still `tool_use`"; inside the body, both the `assistant` response and the `user` message of `tool_result` blocks get `push`ed into `messages`, and then `response` gets reassigned. That last assignment is what makes stopping possible at all — drop it, and `response.stop_reason` keeps its old value forever, so the while loop never exits (that flavor of infinite loop is the star of Lesson 4).

This code runs, but it's a skeleton — simple enough to make the loop itself visible, and nowhere near safe to hand to production. It assumes the model will always come back with `end_turn` on some turn, assumes every tool executes fine, and assumes it doesn't matter how long the history gets. Those three assumptions are exactly what the next few lessons take apart one at a time.

## Every Extra Turn Makes the History Longer

Look again at those `messages.push` lines: every turn of the loop stuffs two more messages into `messages` — the model's `assistant` response and the `tool_result` batch you sent back. And the next `callModel` has to ship the whole of `messages` again, unchanged. So the longer this loop runs, the more history each request carries, and it only ever grows.

That isn't an oversight in the implementation. It's an inherent property of the loop as a structure: an agent running in a loop generates more and more data that could be relevant for the next turn of inference.[^S3] Three turns of the on-call bot only piles up a restart result plus a chunk of logs. But a task that needs dozens of turns rolls the history into something enormous.

Hidden in here is a problem that only gets opened up in the "Agent Memory and State" course, but that has to be planted now: models have an "attention budget," and every new token introduced depletes that budget by some amount.[^S3] Longer history means more tokens, and as the number of tokens in the context window increases, the model's ability to accurately recall information from that context decreases.[^S3] Note that this is a performance gradient that slopes down gently with length, not a hard cliff you fall off past some threshold[^S3] — don't read it as "over the limit means useless." But the direction is unambiguous: context has to be treated as a finite resource with diminishing marginal returns.[^S3] That thoughtless `messages.push` in the skeleton loop does nothing about any of this. It assumes history can grow forever — and "Agent Memory and State" is the course that comes back to settle that bill.

## A Loop Alone Isn't Enough; Boundaries Have to Be Added

You now have a loop that turns. But "can turn" and "turns safely" are two different things. The skeleton loop hands the stop-or-continue decision entirely to the model: whichever turn it returns `end_turn` is the turn the loop stops. Yet agents are systems where the model dynamically directs its own process and tool usage.[^S1] That autonomy is precisely where the usefulness comes from, and precisely where the risk lives: autonomy means higher costs and the potential for compounding errors accumulating around turn after turn of the loop.[^S1] The model will potentially operate for many turns, and you have to have some level of trust in its decision-making before you let it run.[^S1]

The catch is that trust isn't the same as no supervision. If the model gets stuck on some step, or gets pulled off course by what a tool returned, and simply never comes back with `end_turn`, a loop that watches nothing but `stop_reason` will keep spinning alongside it indefinitely. So on top of the model's own finishing signal, you usually add explicit stopping conditions as well — a cap on the maximum number of iterations, for instance, to keep control on your side.[^S1] The bare `while (response.stop_reason === "tool_use")` in the skeleton has no such fuse: it trusts the model without leaving itself a way out.

That plants both of this lesson's setups: **this loop needs boundaries** (you can't depend on the model saying `end_turn`; you need explicit stopping conditions — Lesson 3), and **the history this loop produces needs managing** (tokens are a finite resource, so you can't just shovel things in — left to the Agent Memory and State course). What a loop actually looks like when it goes off the rails, and how to catch it, is Lesson 4's subject. For this lesson it's enough to get the axle set: how the loop turns, and that `stop_reason` is what drives it.

<!-- exercises -->
## 💻 Exercises

### Level 1: Count How Many Times This Loop Turns

A scheduling-assistant agent is set up with two tools, `search_calendar` (look at the calendar) and `create_event` (book something). The user says, "See if I'm free Thursday afternoon, and if I am, book a 30-minute review." The host drives it with this lesson's skeleton loop, and the `stop_reason` sequence that actually happens is:

- 1st `callModel` returns → `stop_reason: "tool_use"` (one `tool_use` block, calling `search_calendar`)
- 2nd `callModel` returns → `stop_reason: "tool_use"` (one `tool_use` block, calling `create_event`)
- 3rd `callModel` returns → `stop_reason: "end_turn"` (text: "Booked the review for Thursday at 14:00")

Answer these: (1) How many times was `callModel` called in total? (2) How many times was `executeTool` called in total? (3) How many times did the while loop body execute? (4) On reading which `stop_reason` did the loop exit?

<!-- rubric -->
- The `callModel` count is right (3), with a clear account of where it comes from: "1 outside the loop + 1 per turn inside the body"
- The `executeTool` count is right (2), matching the two `tool_use` blocks
- The number of while-body executions is right (2), and the exit happens on reading `end_turn`
- Explains that the 3rd `callModel` was issued from inside the loop body, but its return makes the while condition false, so there was no 3rd pass through the body

<!-- answer -->
1. `callModel` was called **3 times**: once outside the loop (the opening request), plus the `response = await callModel(...)` line at the end of the body running twice (once on each of the first two turns). The third return is `end_turn`.
2. `executeTool` was called **2 times**: turns 1 and 2 each had one `tool_use` block, executed once each; the `end_turn` turn has no `tool_use` block, so no tool runs.
3. The while body executed **2 times**: the 1st response is `tool_use`, so we enter the first pass; the 2nd response is still `tool_use`, so we enter the second pass; the 3rd response is `end_turn`, the while condition is false, and we don't enter again.
4. The loop exits on reading **`end_turn`** — specifically, the `callModel` at the end of the second pass returned `end_turn`, so when control got back to the while check the condition was false and we broke out.

<!-- hint -->
Mark both `callModel` calls in the skeleton code: one before the while, one on the last line of the body. Every time the body runs, the second one gets called once.

<!-- hint -->
On the turn where `stop_reason` is `end_turn`, the model's response has no `tool_use` block. So "how many times `executeTool` ran" and "whether we enter the body" are two separate things to count.

### Level 2: Why This Loop Never Stops

A colleague tried to turn a single round-trip into a multi-turn loop and wrote the code below. It "seems to work" on tasks that only need one tool call, but the moment a task needs the model to call tools twice in a row, the process hangs, resources get eaten, and the logs show the same tool being called over and over. Find the root cause and fix it.

```javascript
async function runAgent(userInput, tools) {
  const messages = [{ role: "user", content: userInput }];
  let response = await callModel({ tools, messages });

  while (response.stop_reason === "tool_use") {
    const block = response.content.find((b) => b.type === "tool_use");
    const result = await executeTool(block.name, block.input);

    messages.push({ role: "assistant", content: response.content });
    messages.push({
      role: "user",
      content: [{ type: "tool_result", tool_use_id: block.id, content: result }],
    });
    // end of the loop body
  }

  return response;
}
```

<!-- rubric -->
- Names the root cause precisely: the body never reassigns `response`, so `response.stop_reason` stays on the first turn's `tool_use` forever and the while condition is permanently true
- Explains why this shows up as "fine on a single round-trip, hangs on multi-turn tasks": once a response actually enters the body it's an infinite loop with no way out; the reason it sometimes "seems to work" is that the response wasn't `tool_use` at all and never entered the loop — not that it "stopped normally after the first tool_use"
- The fix adds `response = await callModel({ tools, messages })` at the end of the body

<!-- answer -->
Root cause: **the end of the loop body never reassigns `response`.** `response` is assigned exactly once, outside the loop; the body only appends messages to `messages` and never sends a new request or updates `response`. So `response.stop_reason` stays on that first `"tool_use"` forever, the while condition is permanently true, and the loop can never get out — `messages` grows without bound, the same `tool_use` block gets executed again and again, and the process hangs.

As for "fine on a single round-trip": that's an illusion. Even when a task needs only one tool call, this code won't exit once it enters the body. When someone thinks it works, it's usually because they ran it somewhere else, or the response happened not to be `tool_use` and never entered the loop at all. Once you're really in the body, it's an infinite loop.

The fix — add the new-request line at the end of the body:

```javascript
  while (response.stop_reason === "tool_use") {
    const block = response.content.find((b) => b.type === "tool_use");
    const result = await executeTool(block.name, block.input);

    messages.push({ role: "assistant", content: response.content });
    messages.push({
      role: "user",
      content: [{ type: "tool_result", tool_use_id: block.id, content: result }],
    });

    response = await callModel({ tools, messages }); // add this line so the loop can read a new stop_reason
  }
```

<!-- hint -->
The while condition reads `response.stop_reason`. Search the whole body for the variable `response` and check whether it ever gets reassigned on any pass.

<!-- hint -->
A loop can only stop because every turn produces a fresh `stop_reason` to test again. If the `response` you're holding at the end of a pass is still the one from the pass before, the while condition computes the same answer forever.

<!-- /exercises -->

## Recap

- Connecting one tool-call round-trip into a loop needs no new mechanism, just four repeated steps: send the request → read `stop_reason` and the `tool_use` blocks → run the tools and package the `tool_result` blocks → append to the history and send again; repeat while `stop_reason` is still `tool_use`[^S2]
- `stop_reason` is this loop's while condition: `tool_use` means the model still wants a tool and the loop continues, `end_turn` means the model is wrapping up and the loop ends on its own — the model→tools→model axle is driven by that field[^S5]
- `tool_use` is the signal that the model wants a tool, not a receipt saying one has run; the model never executes anything itself, and the action happens where the host reads out `name` and `input` and goes to work[^S2]
- Every turn of the loop makes the history longer and never shorter, since an agent in a loop keeps generating more data that could be relevant[^S3]; and with a finite attention budget, recall degrades as context grows, so tokens have to be treated as a finite resource with diminishing marginal returns[^S3]
- A loop alone isn't enough: autonomy brings higher costs and compounding errors, and the model may operate for many turns[^S1], so on top of the model's own `end_turn` you usually add explicit stopping conditions (a maximum number of iterations, say) to keep control on your side[^S1] — how to set those is Lesson 3's subject

[>> Lesson 3: Stop Conditions: When an Agent Should Quit](./03-stop-conditions.md)
