# Lesson 6: Hands-On: Upgrading Your Harness into a Small Graph

> Learning goals:
> - Weld routing, fan-out, merge, review loop, and reporting from the first five lessons into one `orchestrate.mjs`: the plan lives in code, each node still runs the `stop_reason` loop from Course 7 (Agent Harness Fundamentals: Loops and Control), intermediate results stay in script variables
> - Get the review loop actually spinning, and watch both ways it can stop—one ticket fixed per gate report and done, another returning identical reports two rounds in a row, judged no further progress, flagged needs_human
> - Persist the entire graph's execution trace into `run-state.json` and `run.jsonl`, then reconcile against the real-run summary table: which node spent how long, how many model calls, how many tokens, how many gate rounds
>
> Prerequisites: Completed Lessons 1–5, able to run the harness loop from Course 7 (Agent Harness Fundamentals: Loops and Control) | Previous: [<< Lesson 5](./05-evaluator-and-graphs.md)

## First, see it run

The first five lessons pulled the parts apart: who holds the plan (Lesson 1), chaining and routing (Lesson 2), sectioning and voting plus a bounded concurrency pool (Lesson 3), orchestrator-workers and the four elements of delegation prompts (Lesson 4), the review loop and how to compose these patterns into what Lesson 5 calls a "graph" (Lesson 5). This lesson welds them into one file.

The task is deliberately mundane: `inbox/` holds six customer support tickets, and the job is to write a reply for each one that can be sent as-is. First, what it looks like when it finishes:

```text
\$ node orchestrate.mjs
inbox/ received 6 tickets: T-1001, T-1002, T-1003, T-1004, T-1005, T-1006
[route] T-1001=billing  T-1002=bug  T-1003=other  T-1004=billing  T-1005=bug  T-1006=other
[fanout] concurrency ceiling 2, produced 6 drafts
[merge] wrote out/ 6 files, passing downstream only refs and one-line summaries
[review] gate rewrites: 2 rounds total

=== Full graph execution summary ===
Node      Time    Model calls Tokens   Gate rounds Status
route     61ms    1           720      -           ok
fanout    243ms   8           8903     -           ok
merge     1ms     0           0        -           ok
review    126ms   2           3033     2           ok

=== Per-ticket breakdown ===
Ticket   Category  Handler           Gate rounds Stop reason     Status
T-1001   billing   worker:billing    0           gate_pass       pass
T-1002   bug       worker:bug        0           gate_pass       pass
T-1003   other     template          0           gate_pass       pass
T-1004   billing   worker:billing    1           no_progress     needs_human
T-1005   bug       worker:bug        1           gate_pass       pass
T-1006   other     template          0           gate_pass       pass

Output directory out/: 6 replies; needs human handoff: 1 ticket
  - T-1004 (no_progress): Ticket T-1004: Changing head from personal to company requir…
Trace: run-state.json / run.jsonl (run_id=run-mtf9z47q)
\$ echo \$?
1
```

Every terminal output in this lesson comes from this script's actual runs, copied line by line—not one line is a hand-typed example. Two things change each run: the millisecond timings, and the `run_id` (it's a base-36 timestamp). Everything else—classification results, call counts, token numbers, gate round counts, which ticket is `needs_human`—is a pinned constant. The reason is explained later in the "Verification Setup" section.

Worth staring at first is that final `1`. This isn't an error—it's a verdict: six tickets, one couldn't finish automatically, so the exit code isn't 0. Every run of this graph produces a conclusion that CI or a cron job can parse, not just a pile of logs.

## What the graph looks like: the plan is those dozen lines in `main()`

Start with the script's skeleton. Using "graph" and "node" is the vocabulary Lesson 5 introduced—this is our own visual system, not an official concept, and it rests on exactly one primary anchor: the workflow script itself holds the loop, branching, and intermediate results[^S5]. The snippet below is the literal implementation of that statement:

Lesson 5 drew a composed graph first; this graph is a **variant** of it, with three differences: Lesson 5 split by difficulty into "simple / complex," here we split by topic into `billing` / `bug` / `other`; Lesson 5's fan-out was "one complex ticket dispatched to three workers then merged," here it's sectioning—"six tickets each assigned one handler"; Lesson 5's back-edge returned to a separate `[Draft]` node, here it returns to the original worker. Why these changes are all collected in the "Reconciliation Table" section at the end.

```javascript
async function main() {
  seedWorkspace();
  initLog();
  saveState();

  const tickets = loadInbox();
  console.log(`inbox/ received ${tickets.length} tickets: ${tickets.map((t) => t.id).join(", ")}`);

  const { routed } = await node("route", () => routeNode(tickets));
  console.log(`[route] ${routed.map((t) => `${t.id}=${t.category}`).join("  ")}`);

  const { drafts } = await node("fanout", () => fanoutNode(routed));
  console.log(`[fanout] concurrency ceiling ${POOL_SIZE}, produced ${drafts.length} drafts`);

  const { items } = await node("merge", async () => mergeNode(drafts));
  console.log(`[merge] wrote out/ ${items.length} files, passing downstream only refs and one-line summaries`);

  if (process.env.STOP_AFTER === "merge") {
    console.log("[stop] STOP_AFTER=merge: stopping before review, no verdict this run");
    process.exit(2);
  }

  const byId = new Map(routed.map((t) => [t.id, t]));
  const reviewed = await node("review", () => reviewNode(items, byId));
  console.log(`[review] gate rewrites: ${reviewed.totalRounds} rounds total`);

  const { needsHuman } = await node("report", async () => reportNode(items, reviewed.totalRounds));

  process.exit(needsHuman > 0 ? 1 : 0);
}
```

`routed`, `drafts`, `items`—these three `const` declarations are the entire graph's state. They're plain JavaScript variables, not some typed state objects, and there's no merge strategy—intermediate results stay in script variables[^S5], nodes pass data via function return values. No model sees the full picture: the routing model sees only six ticket texts, the billing worker sees only its assigned ticket, the review gate sees only one reply file.

This is what the workflow vs. agent architectural distinction looks like in code: LLMs and tools are orchestrated through predefined code paths[^S1], not the model autonomously directing its own processes[^S1].

Five nodes, each handling one segment:

| Node | What it does | Who does it |
| --- | --- | --- |
| `route` | One cheap call splits six tickets into three categories | One model loop |
| `fanout` | Dispatch by category to specialized workers, concurrency bounded | Two kinds of model loops + one pure-code template |
| `merge` | Output hits disk, pass only refs and one-line summaries downstream | Pure code |
| `review` | Deterministic gate filters first, failures enter check-fix-recheck | Pure code + on-demand model loops |
| `report` | Print summary tables, determine exit code | Pure code |

Only two of the five nodes actually call models. **Not every node has to be a model**—this is the lesson's cheapest and most easily overlooked rule: `merge` and `report` are pure functions, the `other` category in `fanout` uses a string template, `review`'s first filter is a few lines of `includes`. Anywhere deterministic code can give the same answer, there's no reason to pay the cost and latency of a model call.

## Inside nodes: still the loop from Course 7

Pin down the innermost layer first, then the graph makes sense. Each model node internally runs the `stop_reason` loop from Course 7 (Agent Harness Fundamentals: Loops and Control), unchanged:

```javascript
async function runAgent(client, system, userInput, tools, toolImpls) {
  const messages = [{ role: "user", content: userInput }];
  let turns = 0;

  let response = await client.messages.create({
    model: MODEL,
    max_tokens: 1024,
    system,
    tools,
    messages,
  });

  while (response.stop_reason === "tool_use") {
    // —— Valve 1: max turns. At loop body start, before turns++ ——
    if (turns >= MAX_TURNS) {
      return `Hit max turns ${MAX_TURNS}, stopping (task may be too hard or model stuck)`;
    }
    turns++;

    // Append this turn's full response (assistant role) to history
    messages.push({ role: "assistant", content: response.content });

    // Execute all tool_use blocks this turn, wrap each as tool_result
    const toolResults = await runToolUses(response.content, toolImpls);

    // All tool_result blocks from one turn go in the immediately following user message
    messages.push({ role: "user", content: toolResults });

    // Send again with the lengthened history, loop back to while condition
    response = await client.messages.create({
      model: MODEL,
      max_tokens: 1024,
      system,
      tools,
      messages,
    });
  }

  // stop_reason is no longer tool_use, extract final text and return
  return response.content.find((b) => b.type === "text")?.text ?? "";
}
```

The four steps in the loop body—push assistant, execute tools, push tool_result, reassign `response`—are word-for-word identical to Lesson 6 of Course 7, even the comments are copied. Valve 1 (max turns) is in the original position: at the loop body's start, before `turns++`. Leaving a max iteration count as a stop condition for loops is standard practice for keeping control[^S1].

Compared to Course 7, two changes, both outside the loop body: `client` and `system` changed from module-level constants to parameters (three roles need different stubs and different system prompts, must be passed in); token and call counting moved from inside the loop body to a wrapper layer outside the client, the loop interior unchanged:

```javascript
function metered(client) {
  const meter = { calls: 0, tokens: 0 };
  const wrapped = {
    messages: {
      async create(req) {
        const res = await client.messages.create(req);
        meter.calls += 1;
        meter.tokens += res.usage.input_tokens + res.usage.output_tokens;
        return res;
      },
    },
  };
  return { client: wrapped, meter };
}
```

This change has a cost and it needs to be stated: Course 7's Valve 2 (token budget) originally relied on the accumulated value in the loop body; that accumulator isn't in the loop anymore, so Valve 2 didn't make the move either. In this graph, each node's stub response queue is fixed-length, exhausting the queue will throw directly, can't run away; but when you swap stubs for a real client, put Valve 2 back—either have `metered` throw when over budget, or move counting back into the loop body and restore Course 7's original form. Valve 3 (spin detection) and Valve 4 (human approval) likewise didn't move; the reason is listed in the "Reconciliation Table" section later.

The tool half is also copied: one turn's response contains multiple `tool_use` blocks, return that many `tool_result` blocks, a tool throws and it's wrapped into `is_error: true` and passed back to the model, rather than crashing the entire process.

## Node one: Routing—one cheap call, then tighten the output

Routing classifies an input and directs it to specialized follow-up tasks[^S1]. It's the graph's cheapest model call: one request classifies all six, no tools, no reply writing.

```javascript
async function routeNode(tickets) {
  const { client, meter } = metered(makeStubClient(SCRIPTS.router));
  const input = tickets.map((t) => `${t.id}: ${t.text}`).join("\n");
  const text = await runAgent(client, ROUTER_PROMPT, input, [], {});

  // Output tightening: only recognize "ticket_id: category" lines, category not in whitelist falls to other
  const parsed = new Map();
  for (const line of text.split("\n")) {
    const m = line.match(/^\s*(T-\d+)\s*:\s*(\S+)\s*$/);
    if (!m) continue;
    const [, id, raw] = m;
    const category = CATEGORIES.includes(raw) ? raw : "other";
    if (category !== raw) log({ node: "route", event: "clamped", ticket: id, raw, category });
    parsed.set(id, category);
  }

  const routed = tickets.map((t) => ({ ...t, category: parsed.get(t.id) ?? "other" }));
  for (const t of routed) log({ node: "route", event: "routed", ticket: t.id, category: t.category });
  return { routed, calls: meter.calls, tokens: meter.tokens };
}
```

The key is the middle ten lines, not the model call. The model returns free text, every downstream branch depends on this value, so it must be tightened into one of three legal labels before entering downstream: lines not matching the format are discarded; categories not in the whitelist fall to `other`; tickets without even one matched line, `parsed.get(t.id) ?? "other"` catches. 

I deliberately had the stub return "complaint" for the last ticket—not in the whitelist. The real-run log shows this tightening:

```text
{"ts":"2026-08-30T03:54:05.526Z","run_id":"run-mtf9z47q","node":"route","event":"clamped","ticket":"T-1006","raw":"complaint","category":"other"}
```

The model gave a self-invented label, code clamped it back to `other`, and left a record saying what was clamped. **Downstream branches only recognize values code has vetted**—this is the practical difference between a routing node and "letting the model directly decide where to jump next," and it's why routing can be unit-tested.

## Node two: Fan-out—three workers and a bounded concurrency pool

Fan-out follows sectioning: breaking the task into mutually independent subtasks and running them in parallel[^S1]. Here "independent" is natural—the six tickets have zero dependencies on each other, order doesn't matter.

Three categories, three handlers, only two are models:

```javascript
const drafts = await runPool(routed, POOL_SIZE, async (ticket) => {
  if (ticket.category === "other") {
    const text = otherTemplate(ticket.id);
    log({ node: "fanout", event: "template_done", ticket: ticket.id });
    return { ticket, handler: "template", text };
  }
  const r = await callWorker(ticket, 1);
  calls += r.calls;
  tokens += r.tokens;
  return { ticket, handler: `worker:${ticket.category}`, text: r.text };
});
```

The concurrency pool is Lesson 3's pool (called `pool` there, `runPool` here): tasks sit behind a cursor, spawn `limit` consumers to grab them, done when exhausted. The ceiling genuinely works, not decorative. Adjust it to 1 and run again, the `fanout` line's timing will noticeably lengthen (call count and tokens identical, milliseconds will jitter as usual):

```text
\$ POOL_SIZE=1 node orchestrate.mjs
...
=== Full graph execution summary ===
Node      Time    Model calls Tokens   Gate rounds Status
route     62ms    1           720      -           ok
fanout    487ms   8           8903     -           ok
merge     1ms     0           0        -           ok
review    124ms   2           3033     2           ok
```

487ms vs. 243ms, call count and tokens identical. Concurrency buys wall-clock time, not less work—this remains true after switching to a real API, except then you also need to consider the provider's rate limits, making the ceiling even more essential.

### Delegation prompts: all four elements present

All three model roles' prompts follow Lesson 4's four elements: objective, output format, tool guidance, task boundaries. Subagents need an objective, an output format, guidance on tools and sources, and clear task boundaries; without adequate description, workers duplicate work, leave gaps, or fail to find what they should[^S2]. The billing worker:

```javascript
billing: [
  "You are a billing ticket specialist, handling one ticket at a time.",
  "Objective: Investigate this ticket's billing facts, produce a complete Chinese-language reply.",
  "Output format: Plain text paragraph, start with 'Ticket <ticket_id> reply:', state facts found, actions already taken, what the user can expect next; no bullet lists, no pleasantries.",
  "Tool guidance: Billing facts must use lookup_order, pass the order ID from the ticket verbatim; if not found say so, don't infer amounts or charge counts from ticket description.",
  "Task boundaries: Handle only this ticket's billing portion, don't modify orders, don't promise extra compensation, don't answer non-billing questions; don't write filler like 'please wait,' 'thank you for your patience,' or 'we'll handle it soon.'",
].join("\n"),
```

Four lines, each doing its job: objective determines what it writes; output format gives downstream gate something to check (the "start with ticket ID" requirement directly maps to the gate's first rule); tool guidance nails down "where amounts come from" to `lookup_order`, blocking the path of inventing numbers from ticket descriptions; task boundaries both block out-of-scope actions and preemptively ban filler words.

The bug worker's version swaps content to checking known-issues DB, citing issue numbers, forbidding self-invented numbers; the router's "tool guidance" says "this step gives you no tools, judge solely from ticket text," matching the empty tools array passed in code. These three prompts' differences are themselves routing's payoff: after classification, each writes its own, no need to cram three kinds of work's requirements into one prompt—this is precisely the separation of concerns and more specialized prompts routing enables[^S1].

## Node three: Merge—pass references, not payloads

`merge` is pure code, zero model calls. It does two things: write each draft to `out/`, then collect a lightweight manifest for downstream—`{id, category, handler, file, oneLine}`, one file path plus a one-line summary, not six full replies. (Simultaneously it also creates a record for each ticket in `run-state.json`, fields shown in the complete code's Section 9.)

This brings the multi-agent system engineering advice into a single-process script: have specialized agents store outputs in external systems, pass only lightweight references back to the coordinator[^S2]. In that retrospective, this advice solved context bloat from "everything relayed via the lead agent"; here it solves the small-scale version of the same thing—the review node needs "which file should be checked," not all six full texts piled in one variable passed around.

So the review node's first action is re-reading content from file:

```javascript
let reply = fs.readFileSync(full, "utf8").trim(); // Load payload from file, not carried from previous node
```

This step looks redundant—everything's in the same process anyway, just pass the string directly. But it buys two things: the file in `out/` becomes this ticket's sole source of truth, whoever edits it that's what review checks; and once this edge needs to go cross-process or cross-machine, only `readFileSync` this one line changes, the node-to-node contract doesn't budge.

## A quiz

By this point, three of the graph's five nodes are complete: routing is code-tightened, merge is pure code, and the upcoming gate will also be pure code. The most commonly heard question at this juncture can be posed directly.

```agentmentor-check
{
  "id": "orc-zh-06-llm-as-glue",
  "label": "Judging whether glue logic should be left to a lead model to decide on the fly",
  "prompt": "A colleague finishes reading orchestrate.mjs and asks: 'Why hardcode routing, merge, and gate glue logic? Wouldn't having a lead model watch intermediate results and decide the next step on the fly be more flexible?' For this batch of ticket tasks, how should you answer?",
  "whyHere": "Three of five nodes are pure code, and the reader just saw three consecutive deterministic glue layers. This is the right moment to check whether they can articulate what 'plan in code' buys you, and when it's worth handing decision authority back to the model.",
  "mode": "single",
  "choices": [
    {
      "id": "a",
      "text": "These tasks' steps were already decomposable in advance; hardcoding them into code buys predictability and consistency, intermediate results stay in script variables and don't occupy model context; truly non-decomposable work is what justifies handing decision authority back to the model",
      "correct": true,
      "feedback": "Correct, and this is precisely the practical application of the workflow vs. agent architectural distinction: workflow is LLMs and tools orchestrated through predefined code paths, agent is the model autonomously directing its own processes. When the task is well-defined, workflow provides predictability and consistency; when large-scale flexibility and model-driven decision-making are needed, agent is the right choice. The five steps 'tickets arrive → classify → handle by category → check → report' were already determined before writing the first line of code; having the model re-decide each round pays with unpredictability and repeated extra calls, buying flexibility this task doesn't need. A side benefit is intermediate results don't enter model context: the script itself holds the loop, branching, and intermediate results, the model's context holds only what it needs for this one step."
    },
    {
      "id": "b",
      "text": "Model steering is obviously smarter: have a lead model watch each step's intermediate results and adapt on the fly, routing, merge, gate can all adjust to live conditions, stronger than hardcoded logic",
      "correct": false,
      "feedback": "'Smarter' has nowhere to cash out here. Classification's answer has only three legal values, gate checks 'does the reply contain the ticket ID, does it contain filler words'—these are knowable facts you can check in one pass—handing them to a model, you get an answer that might differ each time, and you'd still need to write code to tighten it. The real cost isn't just that: for a model to steer, it must see intermediate results, all six full reply texts must enter its context, and that content will never be referenced again. Flexibility has a price, only buy it when you genuinely need it."
    },
    {
      "id": "c",
      "text": "Both approaches are about the same, final output is identical, the rest is personal preference and team habit, pick either",
      "correct": false,
      "feedback": "This isn't a style question, it's a decision with criteria: can steps be decomposed in advance. Can decompose → write into code, buy predictability and consistency; can't decompose—open-ended questions, steps unpredictable in advance, can't hardcode a fixed path—that's when it should go back to an autonomous loop. (When subtask count and content can't be hardcoded but overall steps remain in your hands, Lesson 4's orchestrator-workers is the middle tier; this graph's work doesn't even need that step, classification and dispatch were locked before code.) Treating it as a taste issue, the most common consequence is raising a system on a five-step flow that re-thinks how to proceed every turn, expensive, slow, and when something goes wrong you don't know which line to fix."
    }
  ]
}
```

## Node four: Review loop—gate filters first, failures go back to the furnace

The review node does check-fix-recheck: run a checker, fix what failed, repeat until it passes or stops making progress[^S5]. It's the only place in this graph where "a model's output gets sent back for rewriting."

The first filter is deterministic, a few lines of `includes` and done:

```javascript
function gateCheck(ticketId, reply) {
  const problems = [];
  if (!reply.includes(ticketId)) problems.push("missing_ticket_id");
  for (const w of FILLER_WORDS) {
    if (reply.includes(w)) problems.push(`filler_word:${w}`);
  }
  return { pass: problems.length === 0, report: problems.join(" | ") };
}
```

Two rules, both the kind Course 10 (Verification and Quality Assurance: Don't Let 'Looks Right' Slip Through) said "if it can be determined deterministically, don't ask a judge": the reply must contain the ticket ID (customer support systems key on it), must not contain filler like "please wait," "thank you for your patience," or "we'll handle it soon" with no information content. Both don't require semantic understanding, string inclusion suffices, result same every time, and it conveniently produces a report string that can be fed directly back to the worker.

The LLM judge here could do "is the reply's tone appropriate," "do the facts exceed what tools returned"—things truly unjudgeable via `includes`. But it must rank after the gate: gate is free and deterministic, let it filter out clear issues first, what's left is worth spending a call to consult a judge. This graph only installed the gate layer, because this batch of tickets' acceptance criteria happen to be expressible as rules; when acceptance criteria include words like "tone appropriateness," add the judge layer per Course 10's tiered judgment allocation.

The loop itself looks like this:

```javascript
while (!gate.pass) {
  reports.push(gate.report);
  if (rounds >= MAX_REVIEW_ROUNDS) {
    verdict = "max_rounds";
    break;
  }
  if (gate.report === lastReport) {
    verdict = "no_progress"; // Two consecutive rounds with identical report, loop no longer advancing
    break;
  }
  if (item.handler === "template") {
    verdict = "no_rewriter"; // Pure code template has no worker to send back, hand off directly
    break;
  }
  lastReport = gate.report;
  rounds += 1;
  totalRounds += 1;
  const r = await callWorker(byId.get(item.id), rounds + 1, { prev: reply, report: gate.report });
  calls += r.calls;
  tokens += r.tokens;
  reply = r.text;
  fs.writeFileSync(full, `${reply}\n`);
  gate = gateCheck(item.id, reply);
  log({ node: "review", event: "gate", ticket: item.id, round: rounds, pass: gate.pass, report: gate.report });
}
```

Three `break` statements correspond to three ways to stop, matching what Lesson 5 declared: pass (`while` condition naturally false), no further progress, hit max rounds. The third `if` is a patch—`other` category replies are pure code template generated, no worker to send back to, if the template itself is broken, only option is direct handoff. This run didn't hit it (template is constant, must pass gate), it's kept because if someone corrupts the template string, I'd rather see a `no_rewriter` record than a spinning loop.

What gets fed back to the worker on recycle is straightforward: previous version full text + gate report + one sentence "only fix issues named in report, rewrite complete reply" (assembled in `callWorker`).

### Both ways to stop actually happened in this run

I planted two scripts in the stubs, making each exit of the loop execute once.

**T-1005: Fixed correctly, done.** Bug worker's first version forgot ticket ID (first rule fails), gate returns `missing_ticket_id`, worker adds the opening line per report, second version passes:

```text
{"ts":"2026-08-30T03:54:05.837Z","run_id":"run-mtf9z47q","node":"review","event":"gate","ticket":"T-1005","round":0,"pass":false,"report":"missing_ticket_id"}
{"ts":"2026-08-30T03:54:05.897Z","run_id":"run-mtf9z47q","node":"review","event":"worker_done","ticket":"T-1005","round":2,"calls":1,"tokens":1638}
{"ts":"2026-08-30T03:54:05.898Z","run_id":"run-mtf9z47q","node":"review","event":"gate","ticket":"T-1005","round":1,"pass":true,"report":""}
```

**T-1004: Revised, but not fixed, loop stopped itself.** Billing worker's first version wrote "please wait," gate returns `filler_word:please wait`; worker rewrote a version, sentence entirely different, longer, added an explanation, but that phrase remains. Second round's report identical to first round:

```text
{"ts":"2026-08-30T03:54:05.775Z","run_id":"run-mtf9z47q","node":"review","event":"gate","ticket":"T-1004","round":0,"pass":false,"report":"filler_word:please wait"}
{"ts":"2026-08-30T03:54:05.835Z","run_id":"run-mtf9z47q","node":"review","event":"worker_done","ticket":"T-1004","round":2,"calls":1,"tokens":1395}
{"ts":"2026-08-30T03:54:05.836Z","run_id":"run-mtf9z47q","node":"review","event":"gate","ticket":"T-1004","round":1,"pass":false,"report":"filler_word:please wait"}
```

At this moment `gate.report === lastReport` holds, loop judges no further progress, stops, marks this ticket `needs_human`. It originally had two more rounds of budget (`MAX_REVIEW_ROUNDS` is 3), but spending them would be wasted—same report fed back, most likely same reply returns. The "no further progress" exit's value is here: it cuts losses earlier than max rounds, and it gives an informative conclusion—not "tried three times still fails," but "it doesn't understand this feedback," which is precisely the signal to escalate to human.

The difference between the two exits in data is immediately visible:

```json
"T-1004": {
  "gate_rounds": 1,
  "gate_reports": [
    "filler_word:please wait",
    "filler_word:please wait"
  ],
  "stop": "no_progress",
  "status": "needs_human"
},
"T-1005": {
  "gate_rounds": 1,
  "gate_reports": [
    "missing_ticket_id"
  ],
  "stop": "gate_pass",
  "status": "pass"
}
```

Both tickets' `gate_rounds` are 1, round count alone can't tell success from failure; the dividing line is `gate_reports` length—it records every failed report, including the last one that caused the stop. T-1005 leaves only one entry (second version passed, no second report), T-1004 leaves two with identical content, `stop` field writes the conclusion directly as `no_progress`.

## Node five: Reporting and tracing

The final node is also pure code: print `state.nodes` and per-ticket breakdown as two tables, count `needs_human`, determine exit code. All passed is 0, one needs human is 1.

Tracing splits into two files, each with its own purpose. `run.jsonl` is Course 11 (Observability and Debugging: Seeing Every Step Your Agent Takes) structured logging, one JSON event per line, each carrying `ts` and `run_id`, grep-able after the fact—this run totaled 39 lines, the excerpts in earlier sections are all grepped from it verbatim.

`run-state.json` records execution trace (distinct from "graph's state = those few script variables"), written per Course 9 (State Management and Persistence: Making Long Tasks Survive Interruption) style: write `.tmp` first, then `rename` atomic swap, killed at any moment, on disk is either the previous complete state or the new complete state, never half a JSON:

```javascript
function saveState() {
  state.updated_at = new Date().toISOString();
  const tmp = `${STATE_PATH}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(state, null, 2));
  fs.renameSync(tmp, STATE_PATH);
}
```

Write timing is "persist after each small step": after each node completes persist once, inside review node after each ticket's judgment persist again. The reason Lesson 5 quoted—incrementally tracking each agent's result is precisely the premise for recovering a run within the same session[^S5]; a workflow that fans work out across many small agents preserves more progress than one long agent[^S5]. This graph isn't a multi-agent runtime, but the same statement holds here: six tickets are six independent progress units, dying mid-review, already-persisted ones shouldn't disappear with it (fan-out phase hasn't achieved this yet—see Reconciliation Table item 3).

To see this statement's actual effect, use `STOP_AFTER=merge` to stop the process after fan-out, before review:

```text
\$ STOP_AFTER=merge node orchestrate.mjs
inbox/ received 6 tickets: T-1001, T-1002, T-1003, T-1004, T-1005, T-1006
[route] T-1001=billing  T-1002=bug  T-1003=other  T-1004=billing  T-1005=bug  T-1006=other
[fanout] concurrency ceiling 2, produced 6 drafts
[merge] wrote out/ 6 files, passing downstream only refs and one-line summaries
[stop] STOP_AFTER=merge: stopping before review, no verdict this run
\$ echo \$?
2
```

`run-state.json` at this moment (excerpt):

```json
{
  "version": 1,
  "run_id": "run-mtf9zyy3",
  "nodes": {
    "route": { "ms": 62, "calls": 1, "tokens": 720, "status": "ok" },
    "fanout": { "ms": 246, "calls": 8, "tokens": 8903, "status": "ok" },
    "merge": { "ms": 1, "calls": 0, "tokens": 0, "status": "ok" }
  },
  "tickets": {
    "T-1004": {
      "category": "billing",
      "handler": "worker:billing",
      "file": "out/T-1004.txt",
      "one_line": "Ticket T-1004: Invoice head change requires finance review, …",
      "gate_rounds": 0,
      "gate_reports": [],
      "stop": null,
      "status": "drafted"
    },
    "T-1005": {
      "category": "bug",
      "handler": "worker:bug",
      "file": "out/T-1005.txt",
      "one_line": "This is known issue KI-91—App avatar still uses old CDN doma…",
      "gate_rounds": 0,
      "gate_reports": [],
      "stop": null,
      "status": "drafted"
    }
  }
}
```

Three nodes' accounts are in, all six tickets' category, handler, output file paths are in, six draft files already persisted in `out/`. Only review segment lost: all tickets stuck at `status: "drafted"`, `stop: null`. This state is sufficient to support a resume—read drafts back from `out/`, start directly from review node. Notice T-1005's `one_line` happens to expose the draft's flaw: opening lacks ticket ID. Review hasn't run, so this flaw hasn't been caught yet.

(`STOP_AFTER` only recognizes `merge` as the one value, it's Course 9's controlled crash point's simplified version: exit code 0 all pass, 1 has tickets for human, 2 stopped early no verdict, 3 is script itself crashed—four codes non-overlapping, CI can tell "ran but some need handoff" from "crashed" at a glance.)

## Complete `orchestrate.mjs`

Below is the full text, one continuous block, copy-paste it into `orchestrate.mjs` in an empty directory then `node orchestrate.mjs`. Zero dependencies, no need for `npm i`, no need for `package.json` (`.mjs` suffix already declares it's an ES module), and no need for API key—model client is a stub. First run will create `inbox/`, `kb/`, `out/` and write those six tickets.

```javascript
// orchestrate.mjs —— ticket batch processing small graph: route → fan-out → merge → review loop → report
// Zero dependencies, node orchestrate.mjs runs directly. Model client is a stub that plays fixed queue.
import fs from "node:fs";
import path from "node:path";

// ============ 0. Constants and directories ============

const MODEL = "claude-sonnet-5";
const MAX_TURNS = 6;          // Single node's internal loop ceiling (Course 7 Valve 1)
const POOL_SIZE = Math.max(1, Number(process.env.POOL_SIZE) || 2); // Fan-out concurrency ceiling (Lesson 3); 0/invalid falls back to 1
const STUB_LATENCY_MS = 60;   // Stub's fixed latency, replaces real network round-trip, so timing column has something to show
const MAX_REVIEW_ROUNDS = 3;  // Review loop's max rewrite rounds (Lesson 5)
const FILLER_WORDS = ["please wait", "thank you for your patience", "we'll handle it soon"];
const CATEGORIES = ["billing", "bug", "other"];

const ROOT = process.cwd();
const INBOX = path.join(ROOT, "inbox");
const OUT = path.join(ROOT, "out");
const KB = path.join(ROOT, "kb");
const STATE_PATH = path.join(ROOT, "run-state.json");
const LOG_PATH = path.join(ROOT, "run.jsonl");

// ============ 1. Input: 6 tickets in inbox/ and one known-issues DB ============

const TICKET_TEXT = {
  "T-1001": "Order A-77301 got charged twice this month, please look into it and refund the extra charge.",
  "T-1002": "On the reports page I click 'Export CSV' and the button just keeps spinning; waited five minutes, nothing. Chrome, office network.",
  "T-1003": "What's your phone number for a human agent? I'd like to just call and ask.",
  "T-1004": "The invoice for order A-77420 has the wrong name on it: it came out under my personal name and I need it under the company name.",
  "T-1005": "On the phone app my avatar never shows up after I log in; on the web it's fine.",
  "T-1006": "Been using it three months, reported problems several times and never heard back. Is anyone still maintaining this product?",
};

const KNOWN_ISSUES = [
  "## KI-88 Reports page CSV export not responding",
  "Impact: after clicking export the button keeps spinning; the backend export queue is backed up. Status: fixed in 3.4.2, awaiting release.",
  "Workaround: use 'Export XLSX' on the same page; the data columns are identical.",
  "",
  "## KI-91 Avatar not showing on mobile",
  "Impact: in the app the avatar URL still points at the old CDN domain; the web is unaffected. Status: being fixed, ships this Friday with the release.",
  "Workaround: log out and log back in once; the avatar usually reappears.",
].join("\n");

function seedWorkspace() {
  fs.mkdirSync(INBOX, { recursive: true });
  fs.mkdirSync(OUT, { recursive: true });
  fs.mkdirSync(KB, { recursive: true });
  for (const [id, text] of Object.entries(TICKET_TEXT)) {
    fs.writeFileSync(path.join(INBOX, `${id}.txt`), `${text}\n`);
  }
  fs.writeFileSync(path.join(KB, "known-issues.md"), `${KNOWN_ISSUES}\n`);
}

function loadInbox() {
  return fs
    .readdirSync(INBOX)
    .filter((f) => f.endsWith(".txt"))
    .sort()
    .map((f) => ({
      id: path.basename(f, ".txt"),
      text: fs.readFileSync(path.join(INBOX, f), "utf8").trim(),
    }));
}

// ============ 2. Stub client: SCRIPTS pins each reply by ticket id ============

const say = (text) => ({ type: "text", text });
const call = (id, name, input) => ({ type: "tool_use", id, name, input });
const turn = (stop_reason, content, inTok, outTok) => ({
  stop_reason,
  content,
  usage: { input_tokens: inTok, output_tokens: outTok },
});

const SCRIPTS = {
  // Route node: one call classifies all six. Note last line deliberately not a legal label, gets clamped by code.
  router: [
    turn(
      "end_turn",
      [
        say(
          [
            "T-1001: billing",
            "T-1002: bug",
            "T-1003: other",
            "T-1004: billing",
            "T-1005: bug",
            "T-1006: complaint",
          ].join("\n")
        ),
      ],
      624,
      96
    ),
  ],

  // billing worker: looks up order then writes clearly, first version passes gate.
  "T-1001#1": [
    turn(
      "tool_use",
      [say("Look up order history first."), call("toolu_a1", "lookup_order", { order_id: "A-77301" })],
      781,
      92
    ),
    turn(
      "end_turn",
      [
        say(
          "Ticket T-1001 reply: Order A-77301 was indeed charged twice this month, 399.00 each charge, system marked as duplicate charge. " +
            "The extra charge has been submitted for refund, will return via original payment method, arrival time depends on card issuer, usually 3-5 business days. " +
            "If still not arrived by the 5th business day, please reply in this ticket, we'll take the transaction ID to check with payment channel."
        ),
      ],
      1124,
      168
    ),
  ],

  // bug worker: checks known-issues DB then replies, first version passes gate.
  "T-1002#1": [
    turn(
      "tool_use",
      [say("Check known-issues DB first."), call("toolu_b1", "read_file", { path: "kb/known-issues.md" })],
      763,
      88
    ),
    turn(
      "end_turn",
      [
        say(
          "Ticket T-1002 reply: You hit known issue KI-88—report page CSV export has backend queue backlog, button keeps spinning. " +
            "Fix merged into 3.4.2, will auto-apply after next version release. In the meantime you can switch to 'Export XLSX' on the same page, data columns identical. " +
            "We'll notify you in this ticket on release day."
        ),
      ],
      1312,
      176
    ),
  ],

  // billing worker: first version has filler word, second version still has same filler word — two gate reports identical.
  "T-1004#1": [
    turn(
      "tool_use",
      [say("Confirm this invoice's head first."), call("toolu_c1", "lookup_order", { order_id: "A-77420" })],
      786,
      90
    ),
    turn(
      "end_turn",
      [
        say(
          "Ticket T-1004: Invoice head change requires finance review, order A-77420's request I've submitted, please wait."
        ),
      ],
      1133,
      96
    ),
  ],
  "T-1004#2": [
    turn(
      "end_turn",
      [
        say(
          "Ticket T-1004: Changing head from personal to company requires finance to void and reissue invoice in system, request still in review queue, please wait, after review completes I'll send new invoice to this ticket."
        ),
      ],
      1291,
      104
    ),
  ],

  // bug worker: first version missing ticket ID, second version adds it per gate report.
  "T-1005#1": [
    turn(
      "tool_use",
      [say("Check if this is known issue."), call("toolu_d1", "read_file", { path: "kb/known-issues.md" })],
      752,
      86
    ),
    turn(
      "end_turn",
      [
        say(
          "This is known issue KI-91—App avatar still uses old CDN domain, web unaffected, fix expected this Friday with version release. " +
            "In the meantime log out then log back in, avatar usually reappears."
        ),
      ],
      1298,
      158
    ),
  ],
  "T-1005#2": [
    turn(
      "end_turn",
      [
        say(
          "Ticket T-1005 reply: This is known issue KI-91—App avatar still uses old CDN domain, web unaffected, fix expected this Friday with version release. " +
            "In the meantime log out then log back in, avatar usually reappears. If still blank after release, please add a screenshot to this ticket, we'll check your account."
        ),
      ],
      1466,
      172
    ),
  ],
};

function makeStubClient(queue) {
  let i = 0;
  return {
    messages: {
      async create(req) {
        if (!req.model || !req.max_tokens) {
          throw new Error("Stub client: create must carry model and max_tokens");
        }
        if (i >= queue.length) {
          throw new Error(`Stub queue exhausted: request ${i + 1} has no preset response`);
        }
        await new Promise((r) => setTimeout(r, STUB_LATENCY_MS));
        return queue[i++];
      },
    },
  };
}

// Metering wrapper outside client, loop interior unchanged.
function metered(client) {
  const meter = { calls: 0, tokens: 0 };
  const wrapped = {
    messages: {
      async create(req) {
        const res = await client.messages.create(req);
        meter.calls += 1;
        meter.tokens += res.usage.input_tokens + res.usage.output_tokens;
        return res;
      },
    },
  };
  return { client: wrapped, meter };
}

// ============ 3. Node interior: Course 7's loop, brought over verbatim ============

async function runAgent(client, system, userInput, tools, toolImpls) {
  const messages = [{ role: "user", content: userInput }];
  let turns = 0;

  let response = await client.messages.create({
    model: MODEL,
    max_tokens: 1024,
    system,
    tools,
    messages,
  });

  while (response.stop_reason === "tool_use") {
    // —— Valve 1: max turns. At loop body start, before turns++ ——
    if (turns >= MAX_TURNS) {
      return `Hit max turns ${MAX_TURNS}, stopping (task may be too hard or model stuck)`;
    }
    turns++;

    // Append this turn's full response (assistant role) to history
    messages.push({ role: "assistant", content: response.content });

    // Execute all tool_use blocks this turn, wrap each as tool_result
    const toolResults = await runToolUses(response.content, toolImpls);

    // All tool_result blocks from one turn go in the immediately following user message
    messages.push({ role: "user", content: toolResults });

    // Send again with the lengthened history, loop back to while condition
    response = await client.messages.create({
      model: MODEL,
      max_tokens: 1024,
      system,
      tools,
      messages,
    });
  }

  // stop_reason is no longer tool_use, extract final text and return
  return response.content.find((b) => b.type === "text")?.text ?? "";
}

async function runToolUses(content, toolImpls) {
  const toolUseBlocks = content.filter((b) => b.type === "tool_use");

  return Promise.all(
    toolUseBlocks.map(async (block) => {
      const impl = toolImpls[block.name];
      try {
        const output = await impl(block.input);
        return {
          type: "tool_result",
          tool_use_id: block.id,
          content: output,
        };
      } catch (err) {
        return {
          type: "tool_result",
          tool_use_id: block.id,
          content: `Tool execution error: ${err.message}`,
          is_error: true,
        };
      }
    })
  );
}

// ============ 4. Two tools ============

const ORDERS = {
  "A-77301": { order_id: "A-77301", amount_cents: 39900, charged_times: 2, status: "duplicate_charge", invoice_title: "Alex Reed (individual)" },
  "A-77420": { order_id: "A-77420", amount_cents: 128000, charged_times: 1, status: "paid", invoice_title: "Alex Reed (individual)" },
};

const TOOLS = [
  {
    name: "read_file",
    description: "Read a text file under the working directory, for checking known-issues DB or ticket original text.",
    input_schema: {
      type: "object",
      properties: { path: { type: "string", description: "Path relative to working directory" } },
      required: ["path"],
    },
  },
  {
    name: "lookup_order",
    description: "Look up billing facts by order ID: amount, charge count, status, invoice head.",
    input_schema: {
      type: "object",
      properties: { order_id: { type: "string", description: "Order ID like A-77301" } },
      required: ["order_id"],
    },
  },
];

const toolImpls = {
  read_file({ path: rel }) {
    const full = path.resolve(ROOT, rel);
    if (!full.startsWith(ROOT)) throw new Error("Out-of-bounds path");
    return fs.readFileSync(full, "utf8");
  },
  lookup_order({ order_id }) {
    const row = ORDERS[order_id];
    if (!row) throw new Error(`Order not found: ${order_id}`);
    return JSON.stringify(row);
  },
};

// ============ 5. Three delegation prompts: objective / output format / tool guidance / task boundaries ============

const ROUTER_PROMPT = [
  "You are customer ticket router.",
  "Objective: Classify each ticket below into billing (billing, charges, invoices, refunds), bug (feature malfunction), other (everything else).",
  "Output format: One line per ticket, format strictly 'ticket_id: category', category must be billing / bug / other, don't write reasons, don't output other content.",
  "Tool guidance: This step gives you no tools, judge solely from ticket text, don't claim you checked systems.",
  "Task boundaries: Only classify, don't write replies, don't draw conclusions, don't merge tickets; if unsure put other.",
].join("\n");

const WORKER_PROMPTS = {
  billing: [
    "You are billing ticket specialist, handling one ticket at a time.",
    "Objective: Investigate this ticket's billing facts, produce a complete reply in English.",
    "Output format: Plain text paragraph, start with 'Ticket <ticket_id> reply:', state facts found, actions already taken, what the user can expect next; no bullet lists, no pleasantries.",
    "Tool guidance: Billing facts must use lookup_order, pass the order ID from the ticket verbatim; if not found say so, don't infer amounts or charge counts from ticket description.",
    "Task boundaries: Handle only this ticket's billing portion, don't modify orders, don't promise extra compensation, don't answer non-billing questions; don't write filler like 'please wait,' 'thank you for your patience,' or 'we'll handle it soon.'",
  ].join("\n"),
  bug: [
    "You are bug ticket specialist, handling one ticket at a time.",
    "Objective: Determine if this ticket is a known issue, produce a complete reply in English.",
    "Output format: Plain text paragraph, start with 'Ticket <ticket_id> reply:', state matched known-issue number and conclusion, workaround, when fix arrives; no bullet lists, no pleasantries.",
    "Tool guidance: Use read_file to read kb/known-issues.md for cross-reference, if matched cite the number inside; if not matched say so, don't invent an issue number.",
    "Task boundaries: Only do issue identification and reply, don't disable features, don't promise minute-precise fix times, don't ask for account passwords; don't write filler like 'please wait,' 'thank you for your patience,' or 'we'll handle it soon.'",
  ].join("\n"),
};

// other category doesn't enter model: a pure code template. Not every node has to be a model.
const otherTemplate = (id) =>
  `Ticket ${id} received. This ticket doesn't involve billing, isn't a feature malfunction either, has been forwarded to customer service team for manual follow-up: ` +
  `Workdays 9:00-18:00 you can call 400-000-1234 to communicate directly, or add info in this ticket, replies all recorded under this ticket.`;

// ============ 6. Observability: JSONL structured log + run-state.json incremental trace ============

const RUN_ID = `run-${Date.now().toString(36)}`;

function initLog() {
  fs.writeFileSync(LOG_PATH, "");
}

function log(fields) {
  const line = { ts: new Date().toISOString(), run_id: RUN_ID, ...fields };
  fs.appendFileSync(LOG_PATH, `${JSON.stringify(line)}\n`);
}

const state = {
  version: 1,
  run_id: RUN_ID,
  started_at: new Date().toISOString(),
  updated_at: null,
  nodes: {},
  tickets: {},
};

// Atomic write: write .tmp first then rename (Course 9's practice)
function saveState() {
  state.updated_at = new Date().toISOString();
  const tmp = `${STATE_PATH}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(state, null, 2));
  fs.renameSync(tmp, STATE_PATH);
}

async function node(name, fn) {
  const t0 = Date.now();
  log({ node: name, event: "node_start" });
  const result = await fn();
  const ms = Date.now() - t0;
  state.nodes[name] = {
    ms,
    calls: result.calls ?? 0,
    tokens: result.tokens ?? 0,
    status: result.status ?? "ok",
  };
  saveState(); // Persist once after each node completes
  log({ node: name, event: "node_end", ms, calls: result.calls ?? 0, tokens: result.tokens ?? 0 });
  return result;
}

// ============ 7. Node one: Routing ============

async function routeNode(tickets) {
  const { client, meter } = metered(makeStubClient(SCRIPTS.router));
  const input = tickets.map((t) => `${t.id}: ${t.text}`).join("\n");
  const text = await runAgent(client, ROUTER_PROMPT, input, [], {});

  // Output tightening: only recognize "ticket_id: category" lines, category not in whitelist falls to other
  const parsed = new Map();
  for (const line of text.split("\n")) {
    const m = line.match(/^\s*(T-\d+)\s*:\s*(\S+)\s*$/);
    if (!m) continue;
    const [, id, raw] = m;
    const category = CATEGORIES.includes(raw) ? raw : "other";
    if (category !== raw) log({ node: "route", event: "clamped", ticket: id, raw, category });
    parsed.set(id, category);
  }

  const routed = tickets.map((t) => ({ ...t, category: parsed.get(t.id) ?? "other" }));
  for (const t of routed) log({ node: "route", event: "routed", ticket: t.id, category: t.category });
  return { routed, calls: meter.calls, tokens: meter.tokens };
}

// ============ 8. Node two: Fan-out (sectioning + concurrency pool ceiling) ============

async function runPool(items, limit, worker) {
  const results = new Array(items.length);
  let next = 0;
  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const i = next;
      next += 1;
      results[i] = await worker(items[i]);
    }
  });
  await Promise.all(runners);
  return results;
}

async function callWorker(ticket, round, extra) {
  const key = `${ticket.id}#${round}`;
  const queue = SCRIPTS[key];
  if (!queue) throw new Error(`Stub script missing: ${key}`);
  const { client, meter } = metered(makeStubClient(queue));
  const input = extra
    ? [
        `Below is your previous version for ticket ${ticket.id}:`,
        "---",
        extra.prev,
        "---",
        `Deterministic check didn't pass, report: ${extra.report}`,
        "Only fix issues named in report, rewrite complete reply.",
      ].join("\n")
    : `Ticket ID ${ticket.id}\nUser original text: ${ticket.text}`;
  const text = await runAgent(client, WORKER_PROMPTS[ticket.category], input, TOOLS, toolImpls);
  log({ node: extra ? "review" : "fanout", event: "worker_done", ticket: ticket.id, round, calls: meter.calls, tokens: meter.tokens });
  return { text, calls: meter.calls, tokens: meter.tokens };
}

async function fanoutNode(routed) {
  let calls = 0;
  let tokens = 0;

  const drafts = await runPool(routed, POOL_SIZE, async (ticket) => {
    if (ticket.category === "other") {
      const text = otherTemplate(ticket.id);
      log({ node: "fanout", event: "template_done", ticket: ticket.id });
      return { ticket, handler: "template", text };
    }
    const r = await callWorker(ticket, 1);
    calls += r.calls;
    tokens += r.tokens;
    return { ticket, handler: `worker:${ticket.category}`, text: r.text };
  });

  return { drafts, calls, tokens };
}

// ============ 9. Node three: Merge (pure code, pass references not payloads) ============

function oneLineOf(text) {
  const head = text.split(".")[0];
  return head.length > 60 ? `${head.slice(0, 60)}…` : head;
}

function mergeNode(drafts) {
  const items = drafts.map((d) => {
    const rel = path.join("out", `${d.ticket.id}.txt`);
    fs.writeFileSync(path.join(ROOT, rel), `${d.text}\n`);
    const item = {
      id: d.ticket.id,
      category: d.ticket.category,
      handler: d.handler,
      file: rel,
      oneLine: oneLineOf(d.text),
    };
    state.tickets[item.id] = {
      category: item.category,
      handler: item.handler,
      file: item.file,
      one_line: item.oneLine,
      gate_rounds: 0,
      gate_reports: [],
      stop: null,
      status: "drafted",
    };
    log({ node: "merge", event: "collected", ticket: item.id, file: item.file, chars: d.text.length });
    return item;
  });
  return { items };
}

// ============ 10. Node four: Review loop (deterministic gate first, check-fix-recheck) ============

function gateCheck(ticketId, reply) {
  const problems = [];
  if (!reply.includes(ticketId)) problems.push("missing_ticket_id");
  for (const w of FILLER_WORDS) {
    if (reply.includes(w)) problems.push(`filler_word:${w}`);
  }
  return { pass: problems.length === 0, report: problems.join(" | ") };
}

async function reviewNode(items, byId) {
  let calls = 0;
  let tokens = 0;
  let totalRounds = 0;

  for (const item of items) {
    const full = path.join(ROOT, item.file);
    let reply = fs.readFileSync(full, "utf8").trim(); // Load payload from file, not carried from previous node
    let rounds = 0;
    let lastReport = null;
    const reports = [];
    let verdict = null;
    let gate = gateCheck(item.id, reply);
    log({ node: "review", event: "gate", ticket: item.id, round: 0, pass: gate.pass, report: gate.report });

    while (!gate.pass) {
      reports.push(gate.report);
      if (rounds >= MAX_REVIEW_ROUNDS) {
        verdict = "max_rounds";
        break;
      }
      if (gate.report === lastReport) {
        verdict = "no_progress"; // Two consecutive rounds with identical report, loop no longer advancing
        break;
      }
      if (item.handler === "template") {
        verdict = "no_rewriter"; // Pure code template has no worker to send back, hand off directly
        break;
      }
      lastReport = gate.report;
      rounds += 1;
      totalRounds += 1;
      const r = await callWorker(byId.get(item.id), rounds + 1, { prev: reply, report: gate.report });
      calls += r.calls;
      tokens += r.tokens;
      reply = r.text;
      fs.writeFileSync(full, `${reply}\n`);
      gate = gateCheck(item.id, reply);
      log({ node: "review", event: "gate", ticket: item.id, round: rounds, pass: gate.pass, report: gate.report });
    }

    const rec = state.tickets[item.id];
    rec.gate_rounds = rounds;
    rec.gate_reports = reports;
    rec.stop = gate.pass ? "gate_pass" : verdict;
    rec.status = gate.pass ? "pass" : "needs_human";
    rec.one_line = oneLineOf(reply);
    item.oneLine = rec.one_line;
    item.status = rec.status;
    item.rounds = rounds;
    item.stop = rec.stop;
    saveState(); // Persist once after each ticket's judgment
  }

  return { items, calls, tokens, totalRounds };
}

// ============ 11. Node five: Report (pure code) ============

const pad = (s, n) => {
  const w = [...String(s)].reduce((a, c) => a + (c.charCodeAt(0) > 127 ? 2 : 1), 0);
  return String(s) + " ".repeat(Math.max(1, n - w));
};

function reportNode(items, totalRounds) {
  console.log("\n=== Full graph execution summary ===");
  console.log(pad("Node", 10) + pad("Time", 8) + pad("Model calls", 12) + pad("Tokens", 9) + pad("Gate rounds", 12) + "Status");
  // Report node itself doesn't enter this table: it is this table; its timing is recorded by outer node() into run-state.json
  const order = ["route", "fanout", "merge", "review"];
  for (const name of order) {
    const n = state.nodes[name];
    if (!n) continue;
    const rounds = name === "review" ? String(totalRounds) : "-";
    console.log(pad(name, 10) + pad(`${n.ms}ms`, 8) + pad(n.calls, 12) + pad(n.tokens, 9) + pad(rounds, 12) + n.status);
  }

  console.log("\n=== Per-ticket breakdown ===");
  console.log(pad("Ticket", 9) + pad("Category", 10) + pad("Handler", 18) + pad("Gate rounds", 12) + pad("Stop reason", 16) + "Status");
  for (const it of items) {
    console.log(
      pad(it.id, 9) + pad(it.category, 10) + pad(it.handler, 18) + pad(it.rounds, 12) + pad(it.stop, 16) + it.status
    );
  }

  const needsHuman = items.filter((it) => it.status === "needs_human");
  console.log(`\nOutput directory out/: ${items.length} replies; needs human handoff: ${needsHuman.length} ticket${needsHuman.length === 1 ? "" : "s"}`);
  for (const it of needsHuman) {
    console.log(`  - ${it.id} (${it.stop}): ${it.oneLine}`);
  }
  console.log(`Trace: run-state.json / run.jsonl (run_id=${RUN_ID})`);
  return { needsHuman: needsHuman.length };
}

// ============ 12. Main flow: the plan is these dozen lines below ============

async function main() {
  seedWorkspace();
  initLog();
  saveState();

  const tickets = loadInbox();
  console.log(`inbox/ received ${tickets.length} tickets: ${tickets.map((t) => t.id).join(", ")}`);

  const { routed } = await node("route", () => routeNode(tickets));
  console.log(`[route] ${routed.map((t) => `${t.id}=${t.category}`).join("  ")}`);

  const { drafts } = await node("fanout", () => fanoutNode(routed));
  console.log(`[fanout] concurrency ceiling ${POOL_SIZE}, produced ${drafts.length} drafts`);

  const { items } = await node("merge", async () => mergeNode(drafts));
  console.log(`[merge] wrote out/ ${items.length} files, passing downstream only refs and one-line summaries`);

  if (process.env.STOP_AFTER === "merge") {
    console.log("[stop] STOP_AFTER=merge: stopping before review, no verdict this run");
    process.exit(2);
  }

  const byId = new Map(routed.map((t) => [t.id, t]));
  const reviewed = await node("review", () => reviewNode(items, byId));
  console.log(`[review] gate rewrites: ${reviewed.totalRounds} rounds total`);

  const { needsHuman } = await node("report", async () => reportNode(items, reviewed.totalRounds));

  process.exit(needsHuman > 0 ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(3); }); // Crash exits 3, distinct from needs_human's 1
```

Six hundred seventy-nine lines total, of which roughly one hundred ninety lines are data fed to stubs (`SCRIPTS` table, six ticket original texts, known-issues DB, stub client), the actual orchestration logic—five nodes, concurrency pool, gate, and entry point—roughly two hundred fifty lines, another forty or so for observability and state tracing. This scale is deliberate: one loop plus a few patterns is genuinely something implementable in a few lines of code[^S1].

## Verification setup

Every terminal output in this lesson came from this script's actual runs, not by "run multiple times and pick a good-looking one," but by pinning two sources of non-determinism in advance.

**Swap model for a stub that plays a fixed queue.** `SCRIPTS` is a table, key is "ticket id + which version," value is a pre-written response sequence; each `messages.create` call spits the next one in order, queue exhausted and still calling throws directly. This way "which ticket calls which tool in which round, when model finishes" are all constants. The stub also left an assertion: `create` must carry `model` and `max_tokens`, missing one throws—real client requires these two parameters, stub won't cover for you, so you don't discover the gap the day you swap to real client. This method used from Course 8's hands-on all the way here, so the object being verified is your control logic, not the model's performance that day (real models are non-deterministic, same input can still give different responses[^S3]).

The stub also adds a fixed 60ms delay, replacing real network round-trip. Without it every node would be 0ms, concurrency pool's effect wouldn't show in the summary table at all—the `POOL_SIZE=1` comparison above (487ms vs. 243ms) relies on it.

**Two loop scripts planted in stubs.** The review loop needs to genuinely spin, which requires something genuinely failing gate. So:

- `T-1005#1` (bug worker's first version) deliberately omits ticket ID, triggers `missing_ticket_id`; `T-1005#2` adds the opening line, second version passes—this demonstrates the "check-fix-recheck" normal completion exit.
- `T-1004#1` and `T-1004#2` (billing worker's two versions) both carry "please wait." Two versions' sentences entirely different, lengths different, but gate looks for whether that word is present, so two rounds' report strings identical, triggers "no further progress"—this demonstrates the loss-cutting exit.

The two scripts' writing has craft: not making the second version verbatim repeat the first (that way even humans see it's a dead loop), but making it "revised, but not fixed correctly." This is the most common failure mode in real loops, and precisely what the "two consecutive rounds identical report" criterion catches.

**Controlled early stop.** `STOP_AFTER=merge` stops the process after fan-out, before review, exit code 2. It's Course 9's `CRASH_AFTER` simplified version: making "interrupt at which step" a precisely specifiable parameter, rather than relying on luck to hit it. The above `drafted` state `run-state.json` came from this run.

## Reconciliation table: This graph owes debts to earlier lessons, clear them line by line

A course reaching its capstone hands-on, the easiest mistake is quietly overturning rules established earlier. So reconcile line by line here, discrepancies written explicitly.

**1. Loop body matches Course 7.** The four steps in loop body—push assistant, execute tools, push tool_result, reassign `response`—word-for-word identical to Lesson 6 of Course 7, even comments unchanged. Valve 1 also in original position. **Declared differences**: `runAgent`'s signature added `client` and `system` two parameters (three roles need different stubs and different system prompts), `create` call added a `system` field; token metering moved from loop body to `metered` wrapper, so Course 7's Valve 2 (token budget) didn't follow, Valve 3 (spin detection) and Valve 4 (human approval) also didn't move—this graph's tools are only read-file and lookup-order, both read-only operations, no high-impact actions needing approval; stub queue finite, can't spin away. Before connecting real API, these three valves must be installed back.

**2. Delegation prompts four elements complete (Lesson 4).** Three prompts—router, billing worker, bug worker—each wrote full objective, output format, tool guidance, task boundaries four sections, one line each, can line-by-line compare[^S2].

**3. Concurrency pool has ceiling, merge passes references not payloads (Lesson 3).** `runPool`'s `limit` is hard ceiling, `POOL_SIZE=1` vs. `POOL_SIZE=2` timing difference already verified. `merge` onwards passes downstream `{id, category, handler, file, oneLine}`, full text stays in `out/`, review node reads back from file itself[^S2]. **Declared difference**: Lesson 3's pool was "same batch of subtasks run in parallel," here the pool spans three handler types—two model workers plus one pure code template, template's entry into pool costs almost no time. Pool's semantics unchanged (in-flight task count doesn't exceed ceiling), just tasks themselves heterogeneous. Also one thing Lesson 3 established but here omitted for script brevity: Lesson 3 required each lane separate `try/catch`, letting single-lane failure not drag down whole batch, `runPool` lacks this wrapping—cost is fan-out phase any one lane throws, whole batch of drafts won't persist. Before connecting real API must add, real network single-lane timeout is normal.

**4. Gate before judge, loop stop conditions match Lesson 5.** First filter is deterministic code, not model; this lesson didn't install LLM judge layer, because this batch of tickets' acceptance criteria happen to be expressible as rules, installing it would be wasted money—Course 10's tiered judgment is this order: deterministically judgeable judge first, what's left consult judge. Loop stop conditions three kinds: pass, no further progress, hit max rounds[^S5][^S1], Chinese concepts one-to-one match Lesson 5. **But field and value names changed**: Lesson 5 landed in `reason` field, values `passed`/`no-progress`/`max-rounds`, here lands in `stop` field, values `gate_pass`/`no_progress`/`max_rounds` (criterion swapped from judge to gate, hyphen also changed to underscore per this lesson's snake_case convention); additionally Lesson 5's `rounds` counts generation times, draft counts as round 1, this lesson's `gate_rounds` counts rewrite times, draft is round 0, so same ticket, two lessons' round count starting points differ by one. **Declared difference**: code has fourth exit `no_rewriter` (pure code template has no worker to send back). This isn't a pattern Lesson 5 omitted, it's this graph's specific situation—Lesson 5's loop preset "producer is a model," here one category of producers is template. This run didn't hit this branch.

**5. "Graph" phrasing matches Lesson 5's declaration.** Full text's "graph" and "node" are both this lesson's own engineering metaphor, Lesson 5 already explicitly stated when introducing this visual system, it's not any primary material's official concept; the primary anchor it can stand on is only that one: the workflow script itself holds the loop, branching, and intermediate results[^S5]. This lesson didn't add any new terminology—"state machine," "state objects passed between nodes" none used; Lesson 5 defined "edge" (whose output feeds to whom) only appeared once when explaining the `merge → review` data flow, not new vocabulary. `routed` / `drafts` / `items` are just three ordinary local variables.

**6. `run-state.json` atomic write matches Course 9.** Write `.tmp` first, then `renameSync` swap, not one step missing. Write timing also per that course's caliber: persist once after each small step completes, not once after full run completes.

**7. Observability caliber same form as Course 11, but coarser grain.** One JSON event per line, each carrying `ts` and `run_id`, grep-able after the fact. **Four differences**: (a) Course 11's logger records content summary (shape, length, first few chars), this lesson only records id, category, filename, report string and counts, doesn't record reply full text—full text already in `out/`; (b) association field Course 11 calls `trace_id`, here called `run_id`; (c) that course's core is using `span_id`/`parent_id` to string together a trace tree, this graph although node→worker→tool three-layer nested, didn't implement parent-child linking, so no trace tree; (d) `initLog()` each run clears `run.jsonl`, only keeps most recent run, to do Course 11's cross-run comparison (`v-good` vs. `v-bug`), must change to append by `run_id` separate files. To connect this graph into real trace system, Course 11's span fields need to be added following that pattern.

**8. Orchestrator-workers pattern, this lesson intentionally didn't implement (Lesson 4).** Lesson 4's orchestrator-workers, key is "dispatch how many, each does what" decided by model watching input on the fly; this graph isn't—how six tickets classify, each category goes which worker, locked into `CATEGORIES` and three constant prompts before writing first line of code. This is precisely Lesson 4's "can predefine then don't make dynamic" direct application: this batch of work's shape is known, shouldn't hand decision authority back to model. So strictly speaking, welded into this file are four patterns (chaining, routing, parallelization-sectioning, review loop), voting supplements fifth in Level 2 exercise, orchestrator-workers is the one barred by this batch of tasks' nature.

## Boundaries

This graph manages something small: one process, one batch of tickets, runs and exits. It's worth building because the five steps "tickets arrive → classify → handle by category → check → report" were locked down before writing the first line of code. If the task becomes "figure out what this customer actually encountered over the past six months, how many steps needed you judge yourself," then this graph is the wrong architecture—that kind of open-ended problem where you can't predict steps in advance, can't hardcode a fixed path, inherently belongs to an autonomous loop[^S1].

Several boundaries, state them explicitly:

**Fan-out is synchronous, will hurt at scale.** The pool in `fanoutNode` must wait for the entire batch to complete before entering `merge`. This is precisely the bottleneck that real production system acknowledged: synchronous execution simplifies coordination, but creates bottlenecks in the information flow—one subagent taking forever, entire system stuck waiting[^S2]. Six tickets, each at most two calls, this bottleneck doesn't hurt at all; six hundred tickets, each ten calls, it becomes "slowest one determines whole batch's wall-clock time." Whether to change to asynchronous, must calculate the cost: async lets agents work concurrently, spin up new ones on demand, but it adds difficulty in result coordination, state consistency, error propagation across subagents[^S2]—these three don't exist in synchronous version, because order is code-determined.

**Review loop's two rules are shallow and brittle.** `includes("please wait")` will mis-flag a legitimate sentence like "the export dialog shows please wait until the file is ready" as filler. This is Course 10's old warned problem: overly strict deterministic validators will judge correct as incorrect. For real production, these two rules need calibration against a small batch of real replies, or demote them to "flag for judge re-review" rather than directly send back for rewrite.

**Swap to real API, only swap stub, structure unmoved.** `makeStubClient(queue)` swap to `new Anthropic()`, delete entire `SCRIPTS` table, rest not one line changes—`runAgent` was always written to real API's `stop_reason` / `tool_use` / `tool_result` shape, `model` and `max_tokens` always carried. After swap three things will change: classification result will jitter (same tickets, two runs might land in different categories), gate rounds will jitter, token count will jitter; one run costs money and time; Course 7's three unmoved valves must be installed back.

**Each added layer of complexity must pass the "measurably improves" gate.** Every pattern in this graph can be individually removed: don't do routing, one generic prompt can also reply to tickets; don't do fan-out, serial run six also finishes; don't do review loop, manual spot-check is also a method. After removal whether metrics drop, drop how much, must test to know. Only when complexity genuinely improves results, is it worth adding[^S1].

## 💻 Exercises

<!-- exercises -->

### Level 1: Read the diagram—what actually happened in the loop

Below is this graph's one complete run's summary table, plus two tickets' records from `run-state.json` (real run results, milliseconds and `run_id` change each time):

```text
=== Full graph execution summary ===
Node      Time    Model calls Tokens   Gate rounds Status
route     61ms    1           720      -           ok
fanout    243ms   8           8903     -           ok
merge     1ms     0           0        -           ok
review    126ms   2           3033     2           ok

=== Per-ticket breakdown ===
Ticket   Category  Handler           Gate rounds Stop reason     Status
T-1001   billing   worker:billing    0           gate_pass       pass
T-1002   bug       worker:bug        0           gate_pass       pass
T-1003   other     template          0           gate_pass       pass
T-1004   billing   worker:billing    1           no_progress     needs_human
T-1005   bug       worker:bug        1           gate_pass       pass
T-1006   other     template          0           gate_pass       pass
```

```json
"T-1004": {
  "category": "billing",
  "handler": "worker:billing",
  "file": "out/T-1004.txt",
  "one_line": "Ticket T-1004: Changing head from personal to company requir…",
  "gate_rounds": 1,
  "gate_reports": ["filler_word:please wait", "filler_word:please wait"],
  "stop": "no_progress",
  "status": "needs_human"
},
"T-1005": {
  "category": "bug",
  "handler": "worker:bug",
  "file": "out/T-1005.txt",
  "one_line": "Ticket T-1005 reply: This is known issue KI-91—App avatar st…",
  "gate_rounds": 1,
  "gate_reports": ["missing_ticket_id"],
  "stop": "gate_pass",
  "status": "pass"
}
```

Without writing code, answer three questions: (1) Which of the six tickets entered review loop, each spun how many rounds, which field did you read this from? (2) T-1004 and T-1005's `gate_rounds` are both 1, why does one `pass` and one `needs_human`? Evidence in which field, how to read? (3) Assume process killed right after fan-out completes, before review starts, what can `run-state.json` preserve, what's lost? After restart which step can resume from?

<!-- rubric -->
- (1) T-1004 and T-1005 entered loop, each spun 1 round; basis is per-ticket table's `gate rounds` column non-zero, or `run-state.json`'s `gate_rounds` greater than 0; other four are 0, means draft passed gate first time. Summary table `review` row's gate rounds 2 is these two's 1 round each summed
- (2) Dividing line is `gate_reports` not `gate_rounds`: T-1005 has only one report `missing_ticket_id`, means after rewrite second version passed check, didn't produce second report, so `stop` is `gate_pass`; T-1004 has two entries with identical content `filler_word:please wait`, means after rewrite gate report had zero change, triggers "two consecutive rounds identical report judged no further progress," so `stop` is `no_progress`, `status` is `needs_human`. Must point out `gate_rounds` counts rewrite times, `gate_reports` records each failed report (including last one), the two aren't equivalent
- (3) Preserved: `nodes` has `route` / `fanout` / `merge` three nodes' timing and usage; six tickets' `category`, `handler`, `file`, `one_line`; and six draft files already persisted in `out/`. Lost: review verdict, all tickets stuck at `status: "drafted"`, `stop: null`, `gate_reports: []`. After restart can read drafts back from `out/`, start directly from review node, don't need to re-run route and fan-out—because state is persist once after each node completes, not persist once after full run completes
- Explain this "incremental trace" significance: incrementally recording each step's result during run, is precisely the premise for a run being recoverable; also pairs with Course 9's "write .tmp then rename" atomic write—killed at that moment on disk is either previous complete state or new complete state

<!-- answer -->
(1) Entered loop are T-1004 and T-1005, each spun 1 round. Most direct field is per-ticket table's `gate rounds` column (`run-state.json` corresponds to `gate_rounds`): these two are 1, other four are 0. 0 means draft first check passed gate, worker not called back once. Summary table's `review` row that 2 is these two's 1 round each added, not some one spun two rounds.

(2) Just looking at `gate_rounds` indeed can't tell success from failure—it counts "worker called back to rewrite how many times," whether rewrite result good or bad, it doesn't care. Real evidence is `gate_reports`, it records each failed report, including the last one causing loop stop. T-1005's array has only one entry `missing_ticket_id`: draft missing ticket ID, sent back; rewritten second version added it, gate passed, didn't produce another report, so `stop` records as `gate_pass`, `status` is `pass`. T-1004's array has two entries, and strings identical, both `filler_word:please wait`: draft wrote "please wait" sent back; worker rewrote a version—sentence changed, longer, explained more—but that phrase still there, gate returned report character-for-character same as previous round. Loop's criterion is "this round's report same as previous round judge no further progress," so it didn't spend remaining two rounds budget, directly stopped, marked `needs_human`, `stop` records as `no_progress`. One sentence: `gate_rounds` counts rewrite times, `gate_reports` reflects whether each rewrite produced different result.

(3) Preserved portion not little. `nodes` already has `route`, `fanout`, `merge` three complete accounts (timing, model call count, tokens); six tickets each have `category`, `handler`, `file`, `one_line`; `out/` directory six draft files all written and persisted. Lost only review segment—all tickets stuck at `status: "drafted"`, `stop: null`, `gate_reports` empty array, who should rewrite, who should hand off, none judged yet. So after restart can completely skip route and fan-out (these two steps' products all on disk), read six drafts back from `out/`, enter review node directly. Can do this because state's write timing: persist once after each node completes, inside review after each ticket judged persist again, not wait entire run completes before write. Incrementally recording each step's result is precisely the premise for a run being recoverable within same session; this lesson extending state to disk is own added layer promotion; pair with "write `.tmp` then `rename`" atomic swap, killed at any moment on disk is either one complete state or the other, won't leave half JSON you can't even read back.

<!-- hint -->
First distinguish what two fields each count: one counts "worker called back how many times," one records "each check report said what." Two tickets' first number same, second field's length and content different—difference hides there.

<!-- hint -->
Third question don't reason, directly look at `run-state.json` pasted from that `STOP_AFTER=merge` run: which keys have values, which ticket fields still initial values (`stop` is `null`, `gate_reports` is `[]`, `status` is `drafted`), those with values are preserved, those still initial values are lost.

### Level 2: Add voting node to graph

`other` category has one ticket hard to gauge tone—T-1006: "Been using it three months, reported problems several times and never heard back. Is anyone still maintaining this product?" One fixed template replying to it, most likely inappropriate: too cold seems dismissive, too warm risks over-promising.

Add a voting node to this graph: same ticket, same task, run once from two angles[^S1], then use pure code to compare both versions, pick superior one into merge. Comparison rules only two, both can't ask model: first use gate's deterministic rules to eliminate (has banned words or missing ticket ID directly out), survivors pick shorter one (customer replies don't ramble).

Requirements: both angles' prompts must all have four elements; both calls must honestly go through `runAgent` (meaning go through complete loop), stubs give each one response queue; selection process must leave trace in terminal and `run.jsonl`, let people know why this version chosen. After writing really run once, paste output. Also answer one question: why use pure code comparison here, not call a model to judge which version better?

<!-- rubric -->
- Two angles are different entry points for same task (e.g. "first catch emotion" vs. "only give facts"), not splitting task in half—this is voting, not sectioning
- Both calls go through complete `runAgent` loop, each has one stub response queue; model call count and tokens show corresponding increase in summary table (compared to base version added 2 calls)
- Both angles' prompts write full objective, output format, tool guidance, task boundaries four elements
- Selection is pure code: first run `gateCheck` to eliminate, then among passing candidates pick shortest by length; two rules' order written clearly, and can state which rule played decisive role this time
- Trace: terminal has one line showing both candidates' respective verdict and length, plus who ultimately chosen; `run.jsonl` has corresponding structured event
- Two angles run serially, or explicitly state why concurrent also won't break pool's ceiling—can't secretly open another concurrency layer inside pool, making total concurrency `POOL_SIZE × 2`
- State clearly reason for pure code not judge: these two rules (banned words, length) are inherently deterministically judgeable, same input forever same result, doesn't cost call, doesn't introduce new non-determinism; LLM judge should be saved for "is tone appropriate" this kind of rules can't write out judgment, and must rank after deterministic check

<!-- answer -->
Changes concentrated in four places: one constant, two stub response queues, two angle prompts, plus one branch in `fanoutNode` added plus two functions. Rest code not one line moved.

First place, mark which tickets need voting:

```javascript
const CATEGORIES = ["billing", "bug", "other"];
const VOTE_TICKETS = new Set(["T-1006"]); // Tickets with hard-to-gauge tone, worth running two angles
```

Second place, stubs add two response queues (in `SCRIPTS` after `T-1005#2`):

```javascript
  // Voting: same ticket, two angles run once each.
  "T-1006@warm#1": [
    turn(
      "end_turn",
      [
        say(
          "Ticket T-1006 reply: First apologize, previous feedbacks all didn't give you clear result, this is our follow-up's problem. " +
            "I re-threaded your three months' submitted tickets, forwarded to corresponding responsible colleagues, we'll handle it soon, progress written in this ticket. " +
            "Product still maintained, latest version update can check in help center's 'Update Log.'"
        ),
      ],
      812,
      164
    ),
  ],
  "T-1006@plain#1": [
    turn(
      "end_turn",
      [
        say(
          "Ticket T-1006 reply: Product still maintained, latest version update in help center's 'Update Log' can check. " +
            "Your previously submitted feedbacks didn't give results, this is our follow-up's problem, already re-consolidated them to corresponding responsible colleagues, progress will write in this ticket."
        ),
      ],
      806,
      142
    ),
  ],
```

Third place, two angle prompts (before `otherTemplate`), four elements complete:

```javascript
// Two angles for voting: task same, entry point different (Lesson 3 Voting)
const ANGLE_PROMPTS = {
  warm: [
    "You are customer ticket specialist, handling one ticket at a time, this version takes 'first catch emotion' angle.",
    "Objective: First acknowledge follow-up inadequacy, then answer user's real question 'still maintained or not' clearly.",
    "Output format: Plain text paragraph, start with 'Ticket <ticket_id> reply:', first apologize and state what's been done, then answer product status; no bullet lists.",
    "Tool guidance: This step gives you no system tools, only use facts from ticket original text, don't claim checked ticket history's specific count.",
    "Task boundaries: Don't promise specific fix dates, don't give compensation, don't evaluate colleagues; don't write filler like 'please wait,' 'thank you for your patience,' or 'we'll handle it soon.'",
  ].join("\n"),
  plain: [
    "You are customer ticket specialist, handling one ticket at a time, this version takes 'only give facts' angle.",
    "Objective: Directly answer whether product still maintained, then state these feedbacks next who follows up.",
    "Output format: Plain text paragraph, start with 'Ticket <ticket_id> reply:', first sentence give conclusion, follow with next step; no bullet lists, don't write apology boilerplate.",
    "Tool guidance: This step gives you no system tools, only use facts from ticket original text, don't fabricate version numbers.",
    "Task boundaries: Don't promise specific fix dates, don't give compensation, don't evaluate colleagues; don't write filler like 'please wait,' 'thank you for your patience,' or 'we'll handle it soon.'",
  ].join("\n"),
};
```

Fourth place, two new functions (before `fanoutNode`):

```javascript
async function callAngle(ticket, angle) {
  const key = `${ticket.id}@${angle}#1`;
  const queue = SCRIPTS[key];
  if (!queue) throw new Error(`Stub script missing: ${key}`);
  const { client, meter } = metered(makeStubClient(queue));
  const input = `Ticket ID ${ticket.id}\nUser original text: ${ticket.text}`;
  const text = await runAgent(client, ANGLE_PROMPTS[angle], input, [], {}); // Both angle prompts wrote "no system tools", here must pass empty tools, same form as routeNode
  log({ node: "fanout", event: "vote_candidate", ticket: ticket.id, angle, chars: text.length, calls: meter.calls, tokens: meter.tokens });
  return { angle, text, calls: meter.calls, tokens: meter.tokens };
}

// Pure code selection: first use gate's deterministic rules to eliminate, then among survivors pick shortest
function pickBest(ticketId, candidates) {
  const scored = candidates.map((c) => ({ ...c, gate: gateCheck(ticketId, c.text) }));
  const alive = scored.filter((c) => c.gate.pass);
  const pool = alive.length > 0 ? alive : scored; // All eliminated then all keep, hand to review node to judge
  const winner = pool.reduce((a, b) => (b.text.length < a.text.length ? b : a));
  return { winner, scored, allFailed: alive.length === 0 };
}
```

And `fanoutNode`'s pool callback front added one branch (`other` template branch stays original, T-1003 still goes it):

```javascript
  const drafts = await runPool(routed, POOL_SIZE, async (ticket) => {
    if (VOTE_TICKETS.has(ticket.id)) {
      // Two angles run serially: concurrency ceiling unified by pool, don't secretly open concurrency inside pool
      const candidates = [];
      for (const angle of ["warm", "plain"]) {
        const c = await callAngle(ticket, angle);
        calls += c.calls;
        tokens += c.tokens;
        candidates.push(c);
      }
      const { winner, scored } = pickBest(ticket.id, candidates);
      log({
        node: "fanout",
        event: "vote_pick",
        ticket: ticket.id,
        winner: winner.angle,
        detail: scored.map((c) => `${c.angle}/${c.gate.pass ? "ok" : c.gate.report}/${c.text.length}chars`).join(" | "),
      });
      console.log(
        `[vote] ${ticket.id} ` +
          scored.map((c) => `${c.angle}=${c.gate.pass ? "ok" : c.gate.report}(${c.text.length}chars)`).join("  ") +
          `  → pick ${winner.angle}`
      );
      return { ticket, handler: `vote:${winner.angle}`, text: winner.text };
    }
    if (ticket.category === "other") {
      const text = otherTemplate(ticket.id);
      log({ node: "fanout", event: "template_done", ticket: ticket.id });
      return { ticket, handler: "template", text };
    }
    const r = await callWorker(ticket, 1);
    calls += r.calls;
    tokens += r.tokens;
    return { ticket, handler: `worker:${ticket.category}`, text: r.text };
  });
```

Real run result:

```text
\$ node orchestrate.mjs
inbox/ received 6 tickets: T-1001, T-1002, T-1003, T-1004, T-1005, T-1006
[route] T-1001=billing  T-1002=bug  T-1003=other  T-1004=billing  T-1005=bug  T-1006=other
[vote] T-1006 warm=filler_word:we'll handle it soon(370chars)  plain=ok(305chars)  → pick plain
[fanout] concurrency ceiling 2, produced 6 drafts
[merge] wrote out/ 6 files, passing downstream only refs and one-line summaries
[review] gate rewrites: 2 rounds total

=== Full graph execution summary ===
Node      Time    Model calls Tokens   Gate rounds Status
route     62ms    1           720      -           ok
fanout    367ms   10          10827    -           ok
merge     1ms     0           0        -           ok
review    124ms   2           3033     2           ok

=== Per-ticket breakdown ===
Ticket   Category  Handler           Gate rounds Stop reason     Status
T-1001   billing   worker:billing    0           gate_pass       pass
T-1002   bug       worker:bug        0           gate_pass       pass
T-1003   other     template          0           gate_pass       pass
T-1004   billing   worker:billing    1           no_progress     needs_human
T-1005   bug       worker:bug        1           gate_pass       pass
T-1006   other     vote:plain        0           gate_pass       pass

Output directory out/: 6 replies; needs human handoff: 1 ticket
  - T-1004 (no_progress): Ticket T-1004: Changing head from personal to company requir…
Trace: run-state.json / run.jsonl (run_id=run-mtfa0ip9)
```

Compare against base version: `fanout`'s model calls from 8 rose to 10, tokens from 8903 rose to 10827, timing from 243ms rose to 367ms—this is voting's price, same ticket's work done twice. Per-ticket table T-1006's handler from `template` became `vote:plain`.

This time first rule decided victory: `warm` version has "we'll handle it soon," hit banned word directly out, length rule didn't even get a turn. To see length rule work, change stub's `T-1006@warm#1` that sentence "forwarded to corresponding responsible colleagues, we'll handle it soon, progress written in this ticket" to "forwarded to corresponding responsible colleagues, progress written in this ticket" then run again, real output is:

```text
[vote] T-1006 warm=ok(348chars)  plain=ok(305chars)  → pick plain
```

Both versions passed deterministic check, so by second rule pick shorter version, `plain` wins 305 chars vs. 348 chars.

**Why use pure code comparison, not call model to judge?** Because these two rules are inherently deterministically judgeable. "Has banned words present or not," "which version shorter" these questions, string operations one line gives answer, same input forever same result, doesn't cost one call, doesn't add one network wait, also won't introduce new non-determinism—Course 10's tiered judgment says exactly this order: deterministically judgeable judge first, what's left then judge's turn. Conversely speaking, if comparison standard becomes "which version's tone makes people more willing to continue communicating," that indeed can't write as rule, should consult judge; but even then, judge should rank after these two deterministic rules—first eliminate obviously unqualified candidates, then spend money to judge what's left.

By the way one easily stepped pit: two angles run serially. If for convenience write as `Promise.all`, pool's simultaneously in-flight model calls become `POOL_SIZE × 2`, your thought ceiling 2 actually is 4. Either serial like here, or treat voting candidates also as pool tasks hand to same pool scheduling—anyway ceiling can only have one place saying counts.

<!-- hint -->
First think clear voting vs. sectioning difference: sectioning is splitting one thing into pieces, each piece only does part; voting is same thing whole do twice, just entry points different, finally must pick one. So two angles' prompts, "objective" that line should say same thing, difference is how to enter, first say what.

<!-- hint -->
Selection don't write another set of rules—`gateCheck` already there, directly take it as first sieve, two candidates run once each, see whose `pass` is `true`. Remaining work just "among survivors pick shortest" this one sentence `reduce`. Really run once, see terminal that line `[vote]` printed two candidates each what state, you know this time which rule played role.

<!-- /exercises -->

## Recap

- Four patterns welded into one file (voting supplements fifth in exercise, orchestrator-workers intentionally absent because dispatch can be predefined), "plan in code" this statement has concrete shape: `main()`'s dozen lines are all control flow, `routed` / `drafts` / `items` three ordinary variables are all state. LLMs and tools are orchestrated through predefined code paths[^S1], script itself holds loop, branching, and intermediate results, model's context only holds what it needs for this step[^S5]
- Not every node has to be a model: five nodes two call models, `merge`, `report` and gate's first filter all pure code, `other` category goes string template. Anywhere deterministic code can give same answer, no reason to pay one call's money and latency
- Routing's value not in that call, but in those ten lines of tightening code after call: model's free text pressed into one of three legal labels, downstream branches only recognize values code has vetted; specialized prompts are dividend classification bought[^S1]
- Fan-out's concurrency must have ceiling, merge must pass references not payloads—output hits disk, pass only lightweight references downstream[^S2], review node reads back from file itself. Synchronous fan-out doesn't hurt at this scale, scale large it becomes bottleneck[^S2], changing to async must pay three costs: result coordination, state consistency, cross-subagent error propagation[^S2]
- Review loop is check-fix-recheck, until pass or no further progress[^S5], plus one max rounds safety net[^S1]. Deterministic gate ranks before judge; "two consecutive rounds identical report" this criterion cuts losses earlier than max rounds, and conclusion it gives more informative: not "tried three times fails," but "it doesn't understand this feedback"
- Incremental trace brings recoverability: persist once after each node completes is precisely the premise for a run being continuable within same session[^S5] (cross-process, cross-machine continuation is this lesson's own added layer promotion after persisting state to disk); pair with write `.tmp` then `rename` atomic swap, killed at any moment disk has one readable-back complete state
- This graph manages one process, one batch tickets, steps locked-down work. Steps-unpredictable open-ended problems should go back to autonomous loops[^S1]; each added complexity layer must pass "measurably improves" gate[^S1]

Twelve lessons complete here.

Looking back, what you have now came piece by piece: Course 1 (Claude Code Skills: Build Your Own AI Workflows) you wrote your first prompt, learned to state requirements clearly; then came tool calling, workflows, skills, multi-agent collaboration, all the way to Course 7—that course had you write a loop yourself, `while (response.stop_reason === "tool_use")`, from that day agents are no longer a black box to you, but a piece of code you can read. Course 8 (Context Engineering: Spending Finite Attention Where It Counts) taught you to manage its context, don't let the loop spin until window bursts. Course 9 taught you to make it survive interruption, killed can continue from last stopped place. Course 10 taught you to verify its output, separate "looks done" from "done." Course 11 taught you to see its process, when things break have logs, have traces to check. This course taught you to compose multiple loops into a graph that itself holds the plan.

These six things are six facets of one thing: **In code you wrote, you're controlling a non-deterministic thing.** Loop is your writing, context is your management, checkpoints are your saves, acceptance criteria are your definition, logs are your print, plan is your arrangement. Model very strong, but it works within this control code you built.

Final step lands on concrete action: swap `orchestrate.mjs`'s `makeStubClient(queue)` to `new Anthropic()`, delete `SCRIPTS` table, install back Course 7's three unmoved valves, then dump your work's real piled batch of tasks—real tickets, real logs, real todos—into `inbox/`, run first time. It'll likely have a few landing in `needs_human`, that's exactly what this graph should look like.

