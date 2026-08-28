# Lesson 6: Hands-On: Hand-Writing an Agent Harness with Controls

> Learning goals:
> - Turn the `stop_reason` loop from the earlier lessons into a working `while` loop on top of `@anthropic-ai/sdk`, deciding for yourself whether to keep calling tools or return text and wrap up
> - Build `tool_use` and `tool_result` content blocks exactly to spec, and send a single turn's several results back inside one `user` message
> - Fit that loop with four control valves — max turns, budget cap, no-progress detection, and approval for high-impact actions — and say precisely which step of the loop each one belongs at
>
> Prerequisites: Read Lessons 2 through 5; understand the `stop_reason`-driven loop, stop conditions, runaway backstops, and human-in-the-loop intervention | Prev: [Lesson 5 <<](./05-intervention-and-steering.md)

## First, what it looks like running

The first five lessons took the machine apart piece by piece: how the loop turns, when it should stop, what runaway looks like, how a person steps in. This lesson welds those pieces into a smallest working harness. Before any code, look at what it does in a terminal — an agent wired with two toy tools (`get_time` reports the time, `read_file` reads a file inside the project), handed one sentence: "read the first line of README.md, then tell me what time it is."

```text
$ node agent.js "Read the first line of README.md, then tell me what time it is"

[turn 1] model requests tool: read_file({"path":"README.md"})
[turn 1] tool returned: "# Agent Harness Fundamentals\n..."
[turn 2] model requests tool: get_time({})
[turn 2] tool returned: "2026-08-26T10:42:07+08:00"
[turn 3] model wraps up (end_turn)

The first line of README.md is "# Agent Harness Fundamentals", and it's 10:42 on August 26, 2026.
That took 2 turns of tool calls across 3 model requests.
```

Look closely at what happened: **the user said one sentence, and how many tools got called, which one went first, and when to stop were all decided by the model inside the loop.** That's the line between an agent and a workflow — a workflow's path is fixed in code, while an agent is the model dynamically directing its own process and deciding which tools to use[^S1]. The host code (the harness we're writing this lesson) never specified "read the file first, then check the time." It just faithfully turned the loop, ran whichever tool the model named, and fed the result back. Both tools here are harmless, so nothing interrupted the run — but this harness also has an approval valve welded in, and if the model reaches for something high-impact like deleting a file or firing off a request, it stops and waits for a human nod before acting (we write that later in the lesson). The rest of this lesson builds, line by line, the code behind that terminal output.

## The core loop: carry the skeleton over, swap in the real SDK

The `callModel` from Lesson 2: The Core Loop: From One Round-Trip to Continuous Operation was pseudocode. Now it becomes the actual `@anthropic-ai/sdk`. The skeleton of the loop is identical: send a request carrying `messages`, look at `response.stop_reason` — if it's `"tool_use"`, run the tools, stitch the results back, and send again; if it isn't (say, `end_turn`), return the text and break out of the loop[^S2].

Here's the minimal version with no valves at all, so the loop itself stays visible:

```javascript
import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic(); // reads the key from the ANTHROPIC_API_KEY env var

// Swap in a model id your account can actually use
const MODEL = "claude-sonnet-5";

async function runAgent(userInput, tools, toolImpls) {
  const messages = [{ role: "user", content: userInput }];

  let response = await client.messages.create({
    model: MODEL,
    max_tokens: 1024,
    tools,
    messages,
  });

  while (response.stop_reason === "tool_use") {
    // Append the model's complete response for this turn (assistant role) to the history
    messages.push({ role: "assistant", content: response.content });

    // Run every tool_use block from this turn, packing each one into a tool_result
    const toolResults = await runToolUses(response.content, toolImpls);

    // All of a turn's tool_result blocks go into the one user message that follows
    messages.push({ role: "user", content: toolResults });

    // Send again with the now-longer history; control returns to the while check
    response = await client.messages.create({
      model: MODEL,
      max_tokens: 1024,
      tools,
      messages,
    });
  }

  // stop_reason is no longer tool_use — pull out the final text and return it
  return response.content.find((b) => b.type === "text")?.text ?? "";
}
```

Set this beside the Lesson 2 skeleton and the structure hasn't moved: the `while` line still says "repeat as long as `stop_reason` is `tool_use`," and the body is still the same four steps — push assistant, run tools, push tool_result, reassign `response`. The only substantive change is `callModel` becoming `client.messages.create(...)`, plus that reassignment at the end of the body. That reassignment is what makes stopping possible at all; drop it and `stop_reason` stays at its old value forever, which is exactly the dead loop from Lesson 4: Runaway and Fallback: Dead Loops, Idle Spinning, Budget Burnout.

## tool_use / tool_result fields, not one of them missing

`runToolUses` is where the tool the model named actually runs. The easiest thing to get wrong here is the content-block fields, so follow the spec: a `tool_use` block carries `id` / `name` / `input`, a `tool_result` block carries `tool_use_id` (claiming which call it answers) and `content`, and when tool execution fails you add `is_error: true`[^S6]. There's one more hard rule: however many `tool_use` blocks a response contains, that many `tool_result` blocks must come back, all of them packed into the single `user` message that immediately follows[^S6] — the `messages.push({ role: "user", content: toolResults })` line in the loop body above is what keeps that rule.

```javascript
async function runToolUses(content, toolImpls) {
  const toolUseBlocks = content.filter((b) => b.type === "tool_use");

  // Run them in parallel, but the results still gather into one user message
  return Promise.all(
    toolUseBlocks.map(async (block) => {
      const impl = toolImpls[block.name];
      try {
        const output = await impl(block.input);
        return {
          type: "tool_result",
          tool_use_id: block.id, // the claim: this answers the call with id block.id
          content: output,
        };
      } catch (err) {
        return {
          type: "tool_result",
          tool_use_id: block.id,
          content: `Tool execution failed: ${err.message}`,
          is_error: true, // set on failure, so the model knows the call didn't succeed
        };
      }
    })
  );
}
```

Note the `try/catch`: a tool blowing up shouldn't take the whole harness down with it. Wrap the error into a `tool_result` marked `is_error: true` and send it back, and the model gets a chance to retry with different arguments or take another route. That's far steadier than throwing and killing the process.

## Bolting on four control valves

The loop turns now, but it's the bare loop from Lesson 2 — the one that trusts the model and leaves itself no way out. It stops on whichever turn the model returns `end_turn`, with no boundary anywhere in between. And an agent's autonomy means higher costs plus the potential for errors compounding around lap after lap of the loop, with the model potentially operating for many turns[^S1] — a bare loop stakes the entire stop-or-continue decision on the model, which is too risky. Now we weld on the four valves from the earlier lessons, one at a time.

```javascript
const MAX_TURNS = 8;        // Valve 1: max turns (Lesson 3, stop conditions)
const TOKEN_BUDGET = 40000; // Valve 2: cumulative token budget (Lesson 4, budget burnout)

async function runAgent(userInput, tools, toolImpls, opts = {}) {
  const messages = [{ role: "user", content: userInput }];
  let turns = 0;
  let tokensUsed = 0;
  let lastSignature = null; // for valve 3: the previous turn's tool-call signature

  let response = await client.messages.create({
    model: MODEL, max_tokens: 1024, tools, messages,
  });
  tokensUsed += response.usage.input_tokens + response.usage.output_tokens;

  while (response.stop_reason === "tool_use") {
    // —— Valve 1: max turns. First thing in the body: before this lap, ask "am I still allowed to turn?" ——
    if (turns >= MAX_TURNS) {
      return `Hit the max turn limit of ${MAX_TURNS}, stopping on my own (the task may be too hard, or the model may be stuck)`;
    }
    // —— Valve 2: budget cap. Cumulative tokens hit the ceiling, stop; don't burn through the wallet ——
    if (tokensUsed >= TOKEN_BUDGET) {
      return `Hit the token budget of ${TOKEN_BUDGET}, stopping on my own`;
    }
    turns++;

    // —— Valve 3: no-progress detection. This turn's tool-call signature matches the last one: call it spinning ——
    const signature = signatureOf(response.content);
    if (signature === lastSignature) {
      return `Two turns in a row made identical tool calls (${signature}); calling it spinning and stopping on my own`;
    }
    lastSignature = signature;

    messages.push({ role: "assistant", content: response.content });

    // —— Valve 4: the approval valve. High-impact actions get confirmed before execution (unpacked below) ——
    const toolResults = await runToolUses(response.content, toolImpls, opts);
    messages.push({ role: "user", content: toolResults });

    response = await client.messages.create({
      model: MODEL, max_tokens: 1024, tools, messages,
    });
    tokensUsed += response.usage.input_tokens + response.usage.output_tokens;
  }

  return response.content.find((b) => b.type === "text")?.text ?? "";
}
```

Each valve guards one thing, and none of their positions is arbitrary:

- **Valve 1, max turns** (Lesson 3: Stop Conditions: When an Agent Should Quit): `turns >= MAX_TURNS` sits at the very top of the body, ahead of `turns++`. It means "before this lap, check whether another lap is still permitted." This explicit stopping condition exists so that, alongside the model's own `end_turn`, you keep control in your own hands[^S1].
- **Valve 2, budget cap** (Lesson 4: Runaway and Fallback: Dead Loops, Idle Spinning, Budget Burnout): every time a response comes back, add up tokens from `response.usage` and stop at the ceiling. When turns are few but each turn's context is enormous, turn count alone won't hold back the spend; you need tokens as a separate, independent gate.
- **Valve 3, no-progress detection** (Lesson 4): flatten this turn's tool calls into a signature and compare it with the last one; identical means spinning. This catches the stagnant case where turns aren't over the limit and the budget hasn't blown, but the model is walking in place, calling the same tool with the same arguments over and over.
- **Valve 4, the approval valve** (Lesson 5: Intervention and Steering: Interrupt, Redirect, Human-in-the-Loop): inside `runToolUses`, ahead of actually executing a tool, high-impact actions get a human confirmation first. Human-in-the-loop approval on high-impact actions is precisely the recommended way to hold down excessive-agency risk[^S4].

Valve 3's signature function is plain to the point of dullness — join the names and arguments of every `tool_use` block in the turn into one string. Telling apart "what got called with what arguments" is all it needs to do:

```javascript
function signatureOf(content) {
  return content
    .filter((b) => b.type === "tool_use")
    .map((b) => `${b.name}(${JSON.stringify(b.input)})`)
    .sort()
    .join(" | ");
}
```

## The approval valve: wedged into the moment before execution

Of the four valves, the approval valve's position matters most and is the easiest to get wrong. It has to wedge into the moment when the model has named a tool but the tool hasn't actually run — print the action about to happen, wait for a human, execute only after confirmation. One step later and the file is already written, the request already sent, and asking "confirm?" is pointless. So it goes inside `runToolUses`, ahead of the `impl(...)` line:

```javascript
const HIGH_IMPACT = new Set(["write_file", "http_post", "delete_file"]);

async function runToolUses(content, toolImpls, opts = {}) {
  const toolUseBlocks = content.filter((b) => b.type === "tool_use");

  const results = [];
  for (const block of toolUseBlocks) {
    // The approval valve: high-impact actions get confirmed before execution
    if (HIGH_IMPACT.has(block.name)) {
      const ok = await opts.approve?.(block.name, block.input);
      if (!ok) {
        results.push({
          type: "tool_result",
          tool_use_id: block.id,
          content: "The user declined this high-impact action; it was not executed.",
          is_error: true,
        });
        continue; // skip execution, but still return a tool_result — don't leave the call dangling
      }
    }

    try {
      const output = await toolImpls[block.name](block.input);
      results.push({ type: "tool_result", tool_use_id: block.id, content: output });
    } catch (err) {
      results.push({
        type: "tool_result", tool_use_id: block.id,
        content: `Tool execution failed: ${err.message}`, is_error: true,
      });
    }
  }
  return results;
}
```

`approve` is a function passed in from outside; in a terminal it means "print the action, read one line of input":

```javascript
import readline from "node:readline/promises";

async function approveInTerminal(name, input) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const answer = await rl.question(
    `[approve] About to run high-impact action ${name}(${JSON.stringify(input)}) — Enter to allow / type n to decline: `
  );
  rl.close();
  return answer.trim().toLowerCase() !== "n";
}
```

One detail that matters: even when the user declines, you still return a `tool_result` marked `is_error: true` rather than returning nothing. The spec requires every `tool_use` to have a corresponding `tool_result` sent back[^S6]; skip it and the next request errors out because one tool call has no result. Declining isn't the same as ignoring — a decline is itself a result the model deserves to hear about, and a model that learns it was declined will often switch to a route that doesn't need the high-impact action at all.

```agentmentor-check
{
  "id": "harness-zh-06-approval-before-exec",
  "label": "Placing the approval valve correctly in the loop's control flow",
  "prompt": "A colleague wires the approval valve like this: inside runToolUses, every tool runs as usual and produces its output first; then, just before the result gets pushed into results, high-impact actions pop a \"confirm?\" prompt, and if the user says no, that tool_result is marked is_error and discarded. He argues: \"the result gets thrown away anyway when it's declined, so it's equivalent.\" Is this wiring correct?",
  "whyHere": "This section just insisted the approval valve must wedge into the moment before the tool has actually run. Following it immediately with a concrete code-placement error — the confirmation moved after impl executes — tests whether the reader really grasps that the valve intercepts the execution itself, not whether the result gets used.",
  "mode": "single",
  "choices": [
    {
      "id": "a",
      "text": "No. Approval has to complete before impl is called; running first and asking after means the side effect already landed, so confirming intercepts nothing",
      "correct": true,
      "feedback": "Correct. What the approval valve acts on is performing the action itself, not whether to accept its result. So it has to sit ahead of the impl(...) line — call impl only once approval comes back, and on a decline just continue without ever touching impl. That is the whole point of human-in-the-loop approval on high-impact actions: hold the gate before an irreversible action actually happens, rather than filing a void notice after it has."
    },
    {
      "id": "b",
      "text": "Yes. Since a declined tool_result is marked as an error and never used, executing or not makes no difference; run first, ask after, same outcome",
      "correct": false,
      "feedback": "The problem is that the tool genuinely already ran. For high-impact actions like write_file, http_post, and delete_file, the side effect lands the moment impl returns — the file is written, the request is out, the record is deleted. Asking \"confirm?\" at that point gates only whether you use this result; it cannot gate a side effect that already happened, which leaves the approval valve doing nothing at all."
    }
  ]
}
```

## Two toy tools, so the loop actually runs

The valves are on; what's missing is tools the model can call. This lesson uses only two absolutely safe toys and keeps dangerous operations outside the door: `get_time` reports the current time, and `read_file` reads a file — with `path.resolve` pinning it firmly inside the project directory, so the model (or a model knocked off course by tool output) can't go read out-of-bounds paths like `/etc/passwd`:

```javascript
import path from "node:path";
import fs from "node:fs/promises";

const ROOT = process.cwd();

const toolImpls = {
  get_time: async () => new Date().toISOString(),

  read_file: async ({ path: p }) => {
    const abs = path.resolve(ROOT, p);
    // Boundary check: the resolved absolute path must still be inside the project directory
    if (!abs.startsWith(ROOT + path.sep)) {
      throw new Error(`Refusing to read a path outside the project directory: ${p}`);
    }
    return (await fs.readFile(abs, "utf8")).slice(0, 2000);
  },
};

const tools = [
  {
    name: "get_time",
    description: "Return the current time as an ISO 8601 string",
    input_schema: { type: "object", properties: {} },
  },
  {
    name: "read_file",
    description: "Read the first 2000 characters of a text file inside the project directory",
    input_schema: {
      type: "object",
      properties: { path: { type: "string", description: "Path relative to the project root" } },
      required: ["path"],
    },
  },
];
```

Neither tool is in the `HIGH_IMPACT` set, so neither triggers approval — they're harmless by construction. To demo the approval valve, add a `write_file` to `toolImpls` and to `HIGH_IMPACT`. This lesson deliberately avoids introducing a real write operation so that running the example can't damage your files.

## Putting it together: an entry point you can run with node agent.js

Last, gather `runAgent`, `runToolUses`, the tool definitions, and the approval function into an entry point you can run directly — the thing behind the terminal output at the top of this lesson:

```javascript
async function main() {
  const userInput = process.argv[2] ?? "Read the first line of README.md, then tell me what time it is";
  const answer = await runAgent(userInput, tools, toolImpls, {
    approve: approveInTerminal,
  });
  console.log("\n" + answer);
}

main().catch((err) => {
  console.error("harness crashed:", err);
  process.exit(1);
});
```

Drop the preceding pieces (`import`, `client`, `MODEL`, `runAgent`, `runToolUses`, `signatureOf`, `approveInTerminal`, `toolImpls`, `tools`, `main`) into one `agent.js`, set `ANTHROPIC_API_KEY`, run `npm i @anthropic-ai/sdk`, and `node agent.js "your task"` will run.

Look back over these hundred-odd lines and you'll notice not one of them is a new concept: the `while` loop and `stop_reason` came from Lesson 2, `MAX_TURNS` from Lesson 3, the budget and spin detection from Lesson 4, and the approval valve from Lesson 5. **A harness isn't some deep framework; it's this layer of loop-plus-valves that you write and control yourself.** Same model, same two tools — but a harness with these four valves and the bare loop from Lesson 2 can differ enormously in how steadily they run the same task, because what decides whether an agent is dependable is largely this outer layer of control code, not just the model inside it[^S5].

Keep a sense of proportion about complexity too: not every agent needs all four valves, and one line worth remembering is that you should consider adding complexity only when it demonstrably improves outcomes[^S1]. A small tool that runs three to five turns in a controlled environment might be fine with `MAX_TURNS` alone; four valves are for the cases that run many turns in a row and may reach for high-impact actions.

<!-- exercises -->
## 💻 Exercises

### Level 1: Add a per-tool tiered control valve to the harness

Right now the approval valve has two settings: ask if high-impact, allow everything else. A product colleague raises a finer requirement — control by tool name across three tiers: `allow` (straight through, like `get_time`), `ask` (human confirmation required before execution, like `write_file`), and `deny` (always refused, never callable at all, like a retired `send_email`). Add this policy valve to the harness: design its data structure, say which step of the loop it belongs at and how it relates to the existing approval valve, and write out what should go back to the model when `deny` hits.

<!-- rubric -->
- Gives a policy structure capable of expressing three tiers (e.g. `{ get_time: "allow", write_file: "ask", send_email: "deny" }`), and states the default tier (which tier unlisted tools fall into)
- Places the policy valve inside `runToolUses`, evaluated per `tool_use` block, before impl executes — the same position as the approval valve, with the `ask` tier reusing the existing confirmation logic
- On a `deny` hit, doesn't execute the tool but still returns an `is_error: true` `tool_result` telling the model the tool is forbidden by policy, rather than silently dropping it

<!-- answer -->
Data structure: a map from tool name to tier, plus a default tier that unlisted tools fall into (conservatively, defaulting to either `ask` or `deny` is reasonable — just don't default to `allow`):

```javascript
const POLICY = { get_time: "allow", read_file: "allow", write_file: "ask", send_email: "deny" };
const DEFAULT_POLICY = "ask"; // unlisted tools conservatively require confirmation
```

Position: exactly where the approval valve sits — inside `runToolUses`, while walking each `tool_use` block, before `impl` is called. Two of the three tiers, `ask` and `deny`, both have to intercept before the tool actually runs, which is the same moment the approval valve intercepts. It's really a generalization of the approval valve: the original was equivalent to two tiers, high-impact = ask and everything else = allow, and now there's a `deny` tier as well.

```javascript
for (const block of toolUseBlocks) {
  const policy = POLICY[block.name] ?? DEFAULT_POLICY;

  if (policy === "deny") {
    results.push({
      type: "tool_result", tool_use_id: block.id,
      content: `Tool ${block.name} is forbidden by policy; it was not executed.`, is_error: true,
    });
    continue; // never touch impl at all
  }
  if (policy === "ask") {
    const ok = await opts.approve?.(block.name, block.input);
    if (!ok) {
      results.push({
        type: "tool_result", tool_use_id: block.id,
        content: "The user declined this action; it was not executed.", is_error: true,
      });
      continue;
    }
  }
  // allow, or ask that got approved: execute
  const output = await toolImpls[block.name](block.input);
  results.push({ type: "tool_result", tool_use_id: block.id, content: output });
}
```

The key point on a `deny` hit is the same as on a declined approval: don't execute, but still return an `is_error: true` `tool_result`, because every `tool_use` must have a matching result sent back[^S6]. A model told "this tool is forbidden" will usually switch to a different tool or tell the user plainly that it can't be done, rather than locking up.

<!-- hint -->
Ask yourself first: which of the three tiers need to intercept before the tool executes? Both `deny` and `ask` do; `allow` doesn't — so this valve can only go where the approval valve goes, ahead of the `impl(...)` line.

<!-- hint -->
Don't leave denied or declined calls dangling. The spec requires every `tool_use` in a turn to have a `tool_result` in the next user message; refusing to execute still means returning one (marked `is_error`), or the next request errors out for a missing result.

### Level 2: Which gates is this loop missing, and how does it run away

A colleague says the harness loop below "works," but the moment the model stops returning `end_turn` on its own, or falls into walking in place, it breaks. Point out: (1) which controls it lacks and what runaway behavior each absence produces; (2) the minimal fix — at least one hard boundary that guarantees the loop will stop, with a clear statement of which step it goes at.

```javascript
async function runAgent(userInput, tools, toolImpls) {
  const messages = [{ role: "user", content: userInput }];
  let response = await client.messages.create({ model: MODEL, max_tokens: 1024, tools, messages });

  while (response.stop_reason === "tool_use") {
    messages.push({ role: "assistant", content: response.content });
    const toolResults = await runToolUses(response.content, toolImpls);
    messages.push({ role: "user", content: toolResults });
    response = await client.messages.create({ model: MODEL, max_tokens: 1024, tools, messages });
  }
  return response.content.find((b) => b.type === "text")?.text ?? "";
}
```

<!-- rubric -->
- Points out that it hands the stop-or-continue decision entirely to the model's `stop_reason`, with no explicit stopping condition — as long as the model keeps returning `tool_use`, it turns forever, which is exactly where an autonomous loop needs you to keep hold of control separately
- Names at least two classes of runaway: the model never wrapping up, so turns burn without limit (turn/budget runaway), and repeated identical calls to the same tool with the same arguments (no progress) never being detected
- Minimal fix: add a `MAX_TURNS` counter and check, with the check at the top of the loop body ahead of `turns++`, guaranteeing the loop will stop

<!-- answer -->
(1) Missing controls: apart from the model's own `end_turn`, this code has no explicit stopping condition, no budget cap, no no-progress detection, and no approval for high-impact actions. The consequences, one by one:

- **No explicit stopping condition**: as long as the model returns `tool_use` every turn, the `while` condition stays true and the loop turns forever. An agent's autonomy already means it may operate for many turns, with rising costs and compounding errors[^S1], and here there isn't even one hard boundary — it relies purely on the model being well-behaved enough to wrap up.
- **No budget cap**: history grows every lap (Lesson 2), tokens only go up, and a long run will burn through the budget with nobody stopping it.
- **No no-progress detection**: if the model keeps calling the same tool with the same arguments, walking in place, this code accepts all of it and never notices the spinning.
- **No approval valve**: if `toolImpls` contains something high-impact like `write_file`, it gets executed unconditionally, and a single misjudgment can produce an irreversible outcome.

(2) Minimal fix: add at least one hard boundary that guarantees the loop will stop — `MAX_TURNS`. The counter is initialized outside the loop, and the check goes at the very top of the body, ahead of `turns++`:

```javascript
const MAX_TURNS = 8;
async function runAgent(userInput, tools, toolImpls) {
  const messages = [{ role: "user", content: userInput }];
  let turns = 0;
  let response = await client.messages.create({ model: MODEL, max_tokens: 1024, tools, messages });

  while (response.stop_reason === "tool_use") {
    if (turns >= MAX_TURNS) return `Hit the max turn limit of ${MAX_TURNS}, stopping on my own`; // hard boundary, right at the top
    turns++;

    messages.push({ role: "assistant", content: response.content });
    const toolResults = await runToolUses(response.content, toolImpls);
    messages.push({ role: "user", content: toolResults });
    response = await client.messages.create({ model: MODEL, max_tokens: 1024, tools, messages });
  }
  return response.content.find((b) => b.type === "text")?.text ?? "";
}
```

With that one addition, whether or not the model wraps up and whether or not it spins, the loop turns at most `MAX_TURNS` laps and then certainly exits — the most basic step in taking control back from the model and into the host's hands[^S1]. Budget, no-progress, and approval can be layered on top as needed.

<!-- hint -->
Stare at the line `while (response.stop_reason === "tool_use")`: apart from the model choosing to return `end_turn`, is there anything at all that can make it `false`? If not, then whether the loop stops is entirely the model's call.

<!-- hint -->
A boundary that "will definitely stop" relies on a counter the host maintains itself, independent of model output. Work out where that counter should be initialized, where incremented, and where checked — the check goes before the increment, so you don't let one extra lap through.

<!-- /exercises -->

## Recap

- The core of a working harness is still the loop from Lesson 2: send a request carrying `messages` → check `stop_reason`, and if it's `tool_use`, run the tools, stitch a `tool_result` back, and send again; if it isn't, return text and wrap up[^S2]. Switching to the real SDK just turns `callModel` into `client.messages.create(...)`
- Content-block fields follow the spec with none missing: `tool_use` carries `id` / `name` / `input`, `tool_result` carries `tool_use_id` / `content` plus `is_error` on failure; however many `tool_use` blocks a turn has, that many `tool_result` blocks come back, all packed into the one `user` message that immediately follows[^S6]
- Each of the four control valves guards one spot, and their positions can't be shuffled: max turns (Lesson 3) and the budget cap (Lesson 4) are the hard boundaries that make the loop certain to stop, no-progress detection (Lesson 4) catches walking in place, and the approval valve (Lesson 5) has to wedge in ahead of tool execution — because an agent's autonomy brings higher costs and compounding errors, and the model may operate for many turns[^S1], so the model's own `end_turn` can't hold it
- The approval valve requiring human confirmation on high-impact actions is the recommended way to hold down excessive-agency risk[^S4]; even on a decline, return an `is_error` `tool_result` and don't leave the call dangling[^S6]
- A harness isn't a deep framework; it's this layer of loop-plus-valves that you write and control yourself — same model, different control code, and reliability can differ enormously[^S5]. But don't pile valves on for their own sake either: add complexity only when it demonstrably improves outcomes[^S1]

You've finished this course. From "what a harness is" to hand-writing a loop with four control valves, what you're holding now isn't only a set of concepts — it's real code that runs, that you can edit, and that you can keep adding control to. Wire it up to your own tools and let it do some work for you.
