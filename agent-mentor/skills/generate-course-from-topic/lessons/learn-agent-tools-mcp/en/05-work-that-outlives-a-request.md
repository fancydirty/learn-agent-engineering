# Lesson 5: Work that outlives a request

> Lesson objectives:
> - Name the three things blocking cannot survive, and recognise which one you are hitting.
> - Trace the task lifecycle from creation to a terminal state, and name the states.
> - Explain why both client and server must opt in, and predict what happens when one does not.
> - Decide between a blocking call, a task, and a plain handle for a given piece of work.
> - Say what cancellation does and does not guarantee.
>
> Prerequisites: Lessons 2 and 3 — you know the roles, and that state must be an explicit identifier | Previous [<< 04](./04-descriptions-are-the-interface.md) | Next [06 >>](./06-the-permission-boundary.md)

## The deploy takes four minutes and the call dies at sixty seconds

Your tool triggers a deployment. Locally it works. Connected to your agent it fails after about a minute with a timeout, and the deployment — this is the part that stings — completed fine. The work happened. The answer was lost.

So you raise the timeout. Now it fails differently: a proxy closes the connection, or your laptop sleeps, or the session restarts and the agent has no idea a deploy is running. Each fix moves the failure rather than removing it.

The problem is not the number. It is that you are holding a request open across something whose duration you do not control. This lesson is about the mechanism designed for that, why it lives outside the protocol core, and how to tell when you actually need it.

## Explanation

### What blocking cannot survive

The Tasks documentation states the case against holding the connection open, and it is worth reading as three separate failures rather than one:[^S9]

> "**No long-lived connections.** Blocking ties up a connection for the duration of the operation. Many clients and transport intermediaries impose timeouts that make this impractical beyond a few seconds."

> "**Crash resilience.** A task ID is a durable handle. If the client disconnects or restarts, it can resume polling with the same ID."

> "**Progress visibility.** Tasks carry status metadata... giving clients visibility into progress."

Three distinct things: the connection will be closed by someone who is not you; the client may not survive; and while blocked, nobody can see anything.

Lesson 3 sharpens the second one. As of the 2026-07-28 specification, stream resumability was removed — "A broken response stream loses the in-flight request; clients **MUST** re-issue it as a new request with a new request ID."[^S2] There is no picking up where you left off. A dropped stream means the request is gone, and if the work had side effects, re-issuing may repeat them.

### Tasks, and where they live

The **Tasks extension** is the mechanism: "MCP Tasks let servers return a durable handle instead of blocking, so clients can poll for progress, provide input when needed, and retrieve the final result after reconnecting."[^S9]

It is an extension, not a core feature, and it became one deliberately in this revision: "Move experimental tasks out of the core protocol and into an official extension (`io.modelcontextprotocol/tasks`)."[^S2] The maintainers' framing was that the release was "Formally locking in on a proper extensions framework," with "Tasks move out of the experimental core and into the `io.modelcontextprotocol/tasks` extension."[^S3]

That placement is the single most practical fact in this lesson. Recall from Lesson 3 that "Extensions are always disabled by default and require explicit opt-in from the developer," and that SDK support is optional.[^S8] Tasks are therefore available to you only if your specific client and your specific server both do them — which the documentation states plainly: "MCP Tasks is an extension to the core MCP specification. Host support varies by client."[^S9]

### The lifecycle

A task has five states, and knowing which are terminal is most of what you need:[^S9]

| Status | Meaning |
|---|---|
| `working` | The operation is in progress. |
| `input_required` | The server needs client input before continuing. |
| `completed` | The operation finished; `result` holds the final output. |
| `failed` | A JSON-RPC error occurred; `error` has details. |
| `cancelled` | The operation was cancelled (not always honored). |

And the rule that makes polling terminate: "`completed`, `failed`, and `cancelled` are terminal — once reached, the task's state does not change."[^S9]

`input_required` is the interesting one, and it is not a failure. It is the task pausing to ask — an approval gate, a confirmation, a missing parameter — and it is a state you can be in for a long time without anything being wrong.

### The flow, step by step

The documented sequence:[^S9]

1. **Capability negotiation.** "The client includes `io.modelcontextprotocol/tasks` in its per-request capabilities. The server advertises the same extension in its own `server/discover` capabilities."
2. **Task creation.** "the server returns a `CreateTaskResult` (identified by `resultType: \"task\"`) containing a `taskId`, initial status, TTL, and suggested polling interval. The task is durably created before the response is sent."
3. **Polling.** "The client calls `tasks/get` with the `taskId`."
4. **Mid-flight input.** On `input_required`, the response "includes an `inputRequests` map... The client fulfills these via `tasks/update`."
5. **Completion.** On `completed`, "the `result` field contains what the original request would have returned synchronously."
6. **Cancellation.** "The client can send `tasks/cancel` at any time."

Two details in step 2 carry weight. *Durably created before the response is sent* means the handle you were given is real even if everything downstream falls over — that is what makes it survivable. And *suggested polling interval* means the server tells you how often to ask; the client is expected to respect `pollIntervalMs` rather than invent its own rate.

There is a push alternative: "Servers can push status updates via `notifications/tasks`," with clients opting in through `subscriptions/listen`, and "Polling is the default."[^S9]

### Who decides, and the rule that follows

You do not ask for a task. The server decides: "**Server-directed.** The server decides per-request whether to create a task. Clients opt in once via the extension capability and handle whichever result shape arrives. No per-tool warmup or per-request flag."[^S9]

Which means a client supporting the extension must handle a polymorphic result — the ordinary result, or a task handle — from the same call. That is what "handle whichever result shape arrives" is asking of you.

And there is a hard rule on the server side: "Before returning a `CreateTaskResult`, verify that the client included the extension in its per-request capabilities. Never return a task to a client that did not declare support."[^S9]

The reason is obvious once stated: a client that does not know what a task is receives a result it cannot interpret, and the work becomes invisible — running, with nobody holding the handle.

### Cancellation is a request, not a stop button

The precise wording: "Cancellation is cooperative — the server acknowledges the intent but is not obligated to stop the work."[^S9] The implementation guidance repeats it: "Honor them when possible, but cancellation is cooperative — the task may still reach a non-`cancelled` terminal status."[^S9]

Design as if cancel may do nothing. What the documentation calls cooperative cancellation means the request is advisory: if a task must be genuinely stoppable — a deployment, a bulk delete — the stopping has to be implemented in the underlying system, and the safe pattern is to hold the irreversible step behind an `input_required` gate rather than to rely on cancelling after it has begun.

```agentmentor-order
{
  "id": "agent-tools-mcp-tasks-lifecycle-order",
  "label": "Order one long-running call from capability to result",
  "prompt": "A client that supports the Tasks extension calls a tool that triggers a four-minute deployment needing one approval midway. Put the six steps in the order they actually occur.",
  "whyHere": "The two steps readers most often misplace are the capability declaration — which is not a one-time setup step but rides on the request itself — and the approval, which is not an error state but a pause the client resolves without a new call.",
  "feedback": "That is the documented sequence. Two things it makes visible: the capability travels on the request rather than being established once, which is what statelessness requires; and the approval is resolved with tasks/update against the existing taskId, so the original deployment is never re-triggered.",
  "feedbackWrong": "Check where you placed the capability declaration. Under the current core there is no handshake to carry it, so it rides in the request's own _meta — it cannot be a separate earlier step. Then check the approval: input_required is reached through a poll and answered with tasks/update, not by re-issuing the original tool call.",
  "copyPurpose": "Have the agent check whether I still think capability negotiation is a setup step that happens once before the real calls start.",
  "items": [
    { "id": "call", "text": "Client sends tools/call, with the tasks extension declared in that request's own capabilities" },
    { "id": "create", "text": "Server returns CreateTaskResult with a taskId, status working, and a suggested poll interval" },
    { "id": "poll", "text": "Client calls tasks/get with the taskId and receives status working" },
    { "id": "input", "text": "A later tasks/get returns status input_required with an inputRequests map" },
    { "id": "update", "text": "Client sends tasks/update with the responses to those input requests" },
    { "id": "done", "text": "A later tasks/get returns status completed, carrying the result the call would have returned synchronously" }
  ],
  "correctOrder": ["call", "create", "poll", "input", "update", "done"]
}
```

## Worked example: choosing among three mechanisms

The same underlying work — "import this CSV into the customer table" — with three different sets of facts. Watch which mechanism each one selects.

**Case A: 200 rows, about two seconds.**
Blocking. No handle, no task, no polling. The connection will not time out, nobody needs progress, and a restart mid-call means re-running a two-second import. Adding tasks here costs you a polling loop, a durable store for task state, and a second result shape to handle, in exchange for nothing.

**Case B: 200,000 rows, about six minutes, run in one sitting, and the import happens in stages the caller controls.**
A plain handle from Lesson 3 — `import_start` returns an `import_id`, then `import_add_rows` and `import_commit` take it. Each individual call is fast, so nothing blocks for six minutes; the length comes from many short calls. The state spans requests, which is exactly what an explicit identifier is for: "State that needs to span multiple requests... **MUST** be referenced by an explicit identifier the client passes on each request."[^S5]

**Case C: 200,000 rows, one server-side operation, six minutes, and a human must approve before the write.**
A task. It hits all three of blocking's failures at once: it exceeds ordinary timeouts, it needs to survive a client restart because six minutes is long enough for one, and the approval is a pause that could last an hour. The approval is not an error — it is `input_required`, answered by `tasks/update` against the same `taskId`, with no re-trigger of the import.[^S9]

**The distinction between B and C is the one worth keeping.** Both have state spanning calls. In B, the caller drives each step and every call returns immediately. In C, the *server* is doing something long, and the caller has nothing to do but wait and be reachable. Task machinery earns its cost only in the second case.

**And before any of them, the availability question.** If your client does not implement the Tasks extension, Case C is not available to you regardless of which is technically right — extensions are off by default and SDK support is optional.[^S8] The honest fallback is to restructure toward Case B: make the tool return quickly with a handle to a job you started, and expose a second tool that reports its status. You lose the standard lifecycle and the client's built-in polling; you keep working.

## Your turn: classify your own long work

Find one piece of work in your systems that takes longer than a few seconds — a deploy, a report, a migration, an approval, a model run. Answer in order:

1. How long, typically, and what is the worst case? ________
2. Is the *server* doing something long, or is the *caller* making many short calls? ________
3. Does a human need to intervene partway? ________
4. If the client crashed at minute three, would you need to recover the result? ________
5. Does your client implement the Tasks extension? ________
6. Verdict: blocking / handle / task / task-shaped fallback ________

Questions 2 and 4 are the deciding pair. Long-on-the-server plus must-survive-a-crash is the task case; anything else usually is not. Question 5 can override the verdict, and that is not a defeat — it is the difference between the mechanism you would pick and the one you can have.

If you answered yes to question 3, note where the irreversible step falls relative to the approval. Since cancellation is cooperative and "not obligated to stop the work,"[^S9] the approval gate is what actually protects you, not your ability to cancel afterwards.

```agentmentor-action
mode: pressure_scenario
label: run my long-running tool design against a client restart at minute three
description: Forces me to say what my design does when the client dies mid-operation, which is the failure my timeout-raising fix never addressed.
purpose: Find out whether my chosen mechanism actually recovers the result, or whether I have only moved the timeout further out.
rules:
  - Play the failure, one step at a time — tell me the client just died at minute three and ask what state exists where.
  - Do not accept "it would retry" as an answer. Ask what identifier the retry uses and who is holding it.
  - If my answer requires the same connection or process to still exist, point out which requirement that violates and stop there.
```

<!-- exercises -->
## 💻 Exercises (point these at your own real environment)

### Level 1 (warm-up)
Determine whether the client you use supports the Tasks extension, and how you would find out for a server. Write down the evidence for each — not your impression, but what you actually read or ran. Then state what your client does when a server returns a result shape it does not understand.

<!-- rubric -->
- The client answer cites documentation, a capability listing, or an observed behaviour — with where you found it.
- The server answer names the specific place a server advertises the extension, and what identifier you would look for.
- You state whether the extension is on by default in your setup, and why that default is what it is.
- The unknown-result-shape answer distinguishes "errors visibly" from "silently loses the work".
<!-- answer -->
The identifier to look for is `io.modelcontextprotocol/tasks`. On the server side, extensions are advertised in the capabilities returned by `server/discover`; on the client side they are declared in `io.modelcontextprotocol/clientCapabilities` inside each request's `_meta`.[^S8][^S9]

The default is off. "Extensions are always disabled by default and require explicit opt-in from the developer,"[^S8] so absence of evidence here really is evidence of absence — if nothing declares it, it is not in play.

The last question is the one with a documented answer worth knowing: a well-behaved server should never put you in that position, because it must "verify that the client included the extension in its per-request capabilities. Never return a task to a client that did not declare support."[^S9] If you find a server that does it anyway, that is a bug in the server, and the symptom is work running with nobody holding the handle.
<!-- hint -->
Search your client's documentation for "extension" before searching for "tasks" — the extension mechanism is where support is declared, and clients often document it as a category.
<!-- hint -->
If you cannot find a definitive answer, that is a valid result to write down. Note what you checked, so you are not re-deriving it in a month.

### Level 2 (advanced)
Design the task-shaped version of the long-running work you classified above, then design its fallback for a client without the extension. For the task version: what does the creation call return, what does a poll return at each stage, where does the approval sit, and what is the TTL. For the fallback: which two tools replace it, and what capability do you lose.

<!-- rubric -->
- The creation result names the fields it carries, including a poll interval and a TTL with a stated value.
- Each lifecycle state is mapped to something concrete in your system, including at least one route to a non-`completed` terminal state.
- The approval is placed before the irreversible step, and you say why cancellation is not a substitute.
- The fallback names two real tools and states, specifically, what the client no longer gets.
- You state what happens to a task whose TTL expires before anyone polls it.
<!-- answer -->
A task design that holds up: `deploy_start(service, ref)` returns a `taskId`, `status: working`, `pollIntervalMs: 5000`, `ttlMs` for one hour. Polls return `working` with a status message naming the current stage; when the build finishes and the production switch is next, status becomes `input_required` with an elicitation asking for confirmation; `tasks/update` supplies it; later polls return `working`, then `completed` with the deployed revision. A failed build routes to `failed` with the error.

The approval placement is the load-bearing decision, and the reason to state it explicitly is that cancellation cannot cover for it: cancellation "is cooperative — the server acknowledges the intent but is not obligated to stop the work."[^S9] A gate that must be passed is a control; a cancel you may send afterwards is a request.

The fallback: `deploy_start` returns a job ID immediately as an ordinary result, and `deploy_status(job_id)` reports on it. What you lose is real and worth naming — the client's own polling loop and the standard states, meaning the model is now driving the polling, which spends context on every check; the durable-creation guarantee; the standard `input_required` path, so your approval has to become its own tool call.

The TTL question catches an assumption. A TTL is how long the task record lives, not how long the work takes — a task can complete and then expire unretrieved, and the result is gone even though the deployment happened. This is the same failure as the opening scenario, arriving later. If the result matters after the fact, it needs to be recoverable from your system, not only from the task record.
<!-- hint -->
Write the poll responses as literal JSON for three moments: minute one, the approval, and completion. The fields you struggle to fill are the ones your design has not decided yet.
<!-- hint -->
For the fallback, ask who runs the polling loop. In the task version it is the client; in the fallback it is the model, and that difference is the cost.
<!-- /exercises -->

## Long work, accounted for

You can tell which of blocking's three failures you are actually hitting, name the five task states and the three that end the loop, place an approval as a gate rather than trusting cancellation, and — the part that decides whether any of it applies — check whether both sides support the extension before designing around it.

One thing has been assumed throughout the course and never examined: that the tools your agent sees are the ones you meant it to see, and that their descriptions say what you think they say. For a server you wrote, that is fair. For the ones most people connect, it is a trust decision made once, in a hurry. Lesson 6 is about where the permission boundary actually sits, and what changes when tool text is written by someone else.
