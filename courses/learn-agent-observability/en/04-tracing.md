# Lesson 4: Tracing: Threading One Run into a Tree

> Learning goals:
> - Use correlation IDs to collect scattered records into "everything triggered by one prompt," and explain how that divides labor with session IDs
> - Read the hierarchy of spans and traces: root span, model requests, tool calls, the two phases of tools (permission wait vs execution), and how subagents nest under the parent agent's tool span
> - When the dashboard is empty, suspect the pipeline before suspecting the agent: know why export can fail silently, what conditions cause batch export to drop data, and how to verify the instrumentation itself
>
> Prerequisites: Lessons 1–3 (why non-determinism breaks reproduction, why raw records are primary evidence, how to instrument a harness with structured logs and metrics) | [<< Lesson 3](./03-logs-and-metrics.md) | [Lesson 5 >>](./05-hooks-and-debugging.md)

## 400 records — which 12 are that one run?

By the end of the last lesson, your harness was writing structured records to `runs.jsonl`: one per model request, one per tool call, with duration, tokens, and errors. Logs went from "one big text blob" to "one JSON object per line." You were satisfied.

Then a user reports a problem: "Yesterday afternoon I asked it to fix some copy on the login page and it also changed a test file. I didn't ask for that."

You open the logs, grep by date, and 400 records stare back at you. Two hundred tool calls, a hundred model requests, and dozens of records from subagents mixed in. The prompt the user is talking about probably corresponds to a dozen of them. Which dozen?

You have two clues, neither sufficient:

- **Session ID**. Last lesson you did write `session_id` on every record, but yesterday afternoon the user had seven or eight back-and-forth exchanges in the same session. Filter by session, 400 becomes 210. Smaller range, same nature.
- **Timestamp**. You can guess a time window and cut there, but subagents ran concurrently and their records interleave with the main loop's on the timeline; and the user's "afternoon" could mean 2pm or 4pm, they don't remember.

The problem isn't insufficient detail in the records — it's that **the records have no relationships**. Lesson 3 turned every step into data, but that data is a pile of parallel rows. Which row caused which, who is whose child — not a word about it. Hundreds of nicely formatted JSON objects, still a pile of sand — just squarer sand this time.

This lesson adds that missing layer.

## Correlation ID: a prompt's name tag

The simplest step: give "one trigger event" an ID, and every event that trigger spawned copies that ID. That's a correlation ID. It doesn't need any infrastructure — it's just a field.

Claude Code's first-party design does exactly this. After a user submits a prompt, Claude Code might make multiple API calls and run several tools; the `prompt.id` attribute lets you tie all of those events back to the single prompt that triggered them[^S4]. The debugging recipe the docs give is equally direct: to trace all activity triggered by a single prompt, filter your events by a specific `prompt.id` value[^S4].

This and session ID are two different granularities, each with its own job:

| Correlation ID | Coverage | Answers what question |
| --- | --- | --- |
| session id | An entire conversation | How much did this session cost in total? Did it change permission modes? |
| prompt id | One prompt within a session | Which model requests and tool calls did the sentence the user is complaining about actually trigger? |

Back to the opening 400 records: if every record carried `prompt_id`, you just find the id matching "fix some copy on the login page" in the session transcript, filter once, and 400 drops to 12. The sand has a boundary for the first time.

But a boundary isn't structure. Those 12 records are still 12 flat rows. You still don't know whether the erroneous test-file edit came directly from the main loop or from a subagent it dispatched; you don't know whether that 40-second tool spent 40 seconds waiting for you to click "approve."

## Spans and traces: arranging events into a tree

Let me translate a few terms into plain English first, since we'll use them from here on:

- **span**: The record of "a piece of work with a beginning and an end." It has a name (like `llm_request`), a start time, an end time, and several attributes hanging off it (model name, tool name, token count). A span can identify its parent span.
- **trace**: A whole tree of spans connected by parent-child relationships. Everything that happened during one complete request, from start to finish, read as a tree.
- **exporter**: The code inside the process responsible for packaging spans and sending them out.
- **collector**: The relay station or backend service that receives those spans. The exporter sends data to it; you see the tree on its dashboard.

Claude Code's distributed tracing exports spans that link each user prompt to the API requests and tool executions it triggers, so you can view a full request as a single trace in your tracing backend[^S4]. The specific hierarchy is this: each user prompt starts a `claude_code.interaction` root span; API calls, tool calls, and hook executions are recorded as its children; tool spans have two child spans of their own — one for the time spent waiting on a permission decision and one for the execution itself[^S4].

Those two child spans under a tool are worth pausing on. Last lesson you recorded `duration_ms`: a tool ran for 40 seconds. But "40 seconds where 38 were waiting for someone to click approve" and "40 seconds where 38 were running the command" are two completely different problems. The former means fix the permission config or change the interaction pattern; the latter means fix the tool implementation. Same 40 seconds, split into two segments and you get two different fixes. That's what tree structure gives you beyond flat fields.

The Agent SDK says it more directly: traces are the most detailed view you can get of an agent run; with `CLAUDE_CODE_ENHANCED_TELEMETRY_BETA=1` set, each step of the agent loop becomes a span you can inspect in your tracing backend[^S6]. The CLI has OpenTelemetry instrumentation built in: it records spans around each model request and tool execution, emits metrics for token and cost counters, and emits structured log events for prompts and tool results[^S6].

Compare that to the harness you wrote in course 7 of this series ("Agent Harness Fundamentals: Loops and Control"): your loop already has clear positions — "send request / receive `tool_use` / run tool / return `tool_result`" — and each position naturally maps to a span. You're not missing positions, you're missing parent-child relationships.

## Cross-boundary propagation: subagents, your application, Bash subprocesses

A tree looks nice, but a real run crosses several process boundaries. Can the tree stay connected after crossing? Yes, by passing "who my parent is" all the way down.

**Down one layer: subagents.** When the agent spawns a subagent through the Agent tool, the subagent's `llm_request` and `tool` spans nest under the parent agent's `claude_code.tool` span, so the full delegation chain appears as one trace[^S6]. This solves a question that's unanswerable without the tree — whose tokens are the subagent's tokens? They're nested under that tool call, which is nested under that prompt, so they belong to that prompt. You don't need extra stitching.

**Up one layer: your application.** The SDK automatically propagates W3C trace context into the CLI subprocess. W3C trace context is just a standardized string containing the trace id and current span id — whoever receives it knows where to attach themselves. When you call `query()` while an OpenTelemetry span is active in your application, the SDK injects `TRACEPARENT` and `TRACESTATE` into the child process environment, the CLI reads them, and its `claude_code.interaction` span becomes a child of your span — the agent run appears inside your application's trace instead of as a disconnected root[^S6].

This difference is very practical when troubleshooting production: the user complains "I clicked that button and the page spun for 20 seconds." You click into the HTTP request's trace and can follow it all the way to the tool call inside the agent that took 14 seconds, without switching systems or aligning timestamps.

**Further down: commands the agent itself runs.** When tracing is active, Bash and PowerShell subprocesses automatically inherit a `TRACEPARENT` environment variable containing the W3C trace context of the active tool execution span[^S4]. If a command launched through the Bash tool emits its own OpenTelemetry spans, those spans nest under the `claude_code.tool.execution` span that wraps the command[^S6].

Connect the three segments and a tree can start from your web request, pass through the CLI, pass through a subagent, and grow all the way down to a compilation stage inside the `npm run build` the agent ran.

## Structure only, not content

You might be wondering: if every step the agent takes gets sent to an external backend, does that include what the user said to it and the file contents it read and wrote?

Anthropic's postmortem of their multi-agent research system gives two parallel conclusions. One is the gain: after they brought full tracing online, they could diagnose why agents failed and fix issues systematically[^S1]. The other is the boundary: they monitored agent decision patterns and interaction structures without monitoring the contents of individual conversations, to maintain user privacy; even this high-level observability helped them diagnose root causes, discover unexpected behaviors, and fix common failures[^S1].

The first-party tools' default posture aligns exactly with that principle. Telemetry is structural by default: durations, model names, and tool names are recorded on every span; token counts are recorded when the underlying API request returns usage data, so spans for failed or aborted requests may omit them; the content your agent reads and writes is not recorded by default[^S6]. User prompt content is also not collected by default — only prompt length is recorded; to include prompt content, you must explicitly set `OTEL_LOG_USER_PROMPTS=1`[^S4]. The Agent SDK page puts the same reminder next to its own content-collection switches: leave these unset unless your observability pipeline is approved to store the data your agent handles[^S6].

For many teams this is good news: you don't need to win a compliance battle over "can we send user content to a third-party backend" before you can start seeing what your agent does. Many problems are visible at the structure layer.

When designing traces for your own harness, treat this as the default: record names, durations, tool names, token counts, and error types on spans; leave parameter and return content in the local raw records (from lesson 2), and fetch them by id when you need them.

## The observability pipeline itself can lie to you

Everything so far has been about "what you can see once the tree is built." This section is about something that happens earlier and is easier to get burned by: **you think you're looking at data, but you're actually looking at an empty panel**.

The first thing to remember: **export failure is silent by default**. If the endpoint is unreachable or the backend rejects the data, the agent still runs normally and the CLI drops the telemetry without surfacing an error in your application[^S6]. This design is correct — the observability pipeline shouldn't bring down the main flow — but the cost is that a broken pipeline and everything-working look identical on your end.

The second thing: **batch export drops data under specific conditions**. The CLI batches telemetry and exports on an interval. On a clean process exit it attempts to flush pending data, but the flush is bounded by a short timeout, so spans can still be dropped if the collector is slow to respond; if your process is killed before the CLI shuts down, anything still in the batch buffer is lost[^S6]. By default, metrics export every 60 seconds and traces and logs export every 5 seconds[^S6]. Put those sentences together: a short-lived agent run in CI that finishes in three to five seconds relies on "the flush completes within the timeout AND the process isn't killed early" to preserve tail-end telemetry — and the export interval magnifies the amount sitting in the buffer. Such scenarios need export intervals significantly shorter than the run duration, and you need to ensure the process exits cleanly.

The third thing, and what you should do first when troubleshooting: **verify the instrumentation itself** (instrumentation is just another word for the probes you installed). To verify a setup that exports metrics, check your backend for the `claude_code.session.count` metric — Claude Code emits it when a session starts[^S4]; if nothing arrives, run `claude --debug` and check the debug log for OTel export errors[^S4]. The value of these two steps is that they split "does the agent have a problem" and "is the pipeline working" into two separately answerable questions.

Two more config traps that are easy to step on:

- By default, the CLI reports `service.name` as `claude-code`. If you run several agents, or run the SDK alongside other services that export to the same collector, override the service name and add resource attributes so you can filter by agent in your backend[^S6]. Otherwise three agents' spans mix under the same service name and you're looking at soup.
- When running through the SDK, do not set `console` as an exporter value[^S6]. The docs don't say why; based on how the SDK and CLI communicate, the SDK talks to the CLI over stdout, and printing spans there would scramble that channel.

```agentmentor-check
{
  "id": "obs-zh-04-silent-telemetry",
  "label": "One week, zero data: is nothing wrong, or nothing connected?",
  "prompt": "You connected OpenTelemetry export for your team's agent, committed the config, shipped it, and a week passed. You open the dashboard — not a single data point. No spans, no metrics, no events. The agent has been serving users all week; nobody complained. How should you judge the situation?",
  "whyHere": "This section just finished explaining that export failure is silent by default. Zero data is the signal that new practitioners misread most easily, and this is the most direct application of the mechanism knowledge in this lesson: distinguish 'agent is fine' from 'pipeline isn't connected' first, then decide what to check.",
  "mode": "single",
  "choices": [
    {
      "id": "a",
      "text": "Your colleague is right. 'No news is good news' — zero data means this week's runs were all clean. Wait until someone reports a problem, then look at the dashboard.",
      "correct": false,
      "feedback": "There's a hidden assumption here: telemetry is only produced when something goes wrong. But actually normal runs continuously emit spans and metrics; a session start generates records immediately. A week of zero data means even the 'normal' traces are missing — that itself is abnormal."
    },
    {
      "id": "b",
      "text": "If telemetry breaks, the application would report an error; since the app didn't error all week, the problem is probably in the dashboard's query expressions or panel config. Go tune the panels.",
      "correct": false,
      "feedback": "The first half is backwards. When the endpoint is unreachable or the backend rejects data, the agent still runs normally, the CLI drops the telemetry, and no error surfaces in your application. Queries and panels could indeed be misconfigured, but that's the second suspect after the pipeline."
    },
    {
      "id": "c",
      "text": "Suspect the pipeline first: export failure is silent by default; the agent runs normally and telemetry just gets dropped. Check the backend for session.count; if it's not there, run --debug to see export errors.",
      "correct": true,
      "feedback": "Correct. The counting metric emitted at session start is the cheapest probe to verify the instrumentation itself: if you can query it, the data path is live and you should then suspect queries and panels; if you can't, use the debug log to surface the export error."
    }
  ]
}
```

## Three signals, you can enable just the ones you need

You don't have to turn on the full suite right away. The CLI exports three independent OpenTelemetry signals — metrics, log events, and traces — each with its own enable switch and its own exporter, so you can turn on only the ones you need[^S6].

This gives a natural adoption sequence:

1. **Turn on metrics first**. Cost and token usage are the first questions people ask, metrics are the cheapest, and the default 60-second export interval is fine for long-running services.
2. **Then turn on log events**. Tool results and permission decisions — these structured events are the raw material for the diagnostic reading patterns from lesson 3.
3. **Turn on traces when you hit a problem you can't explain**. They're the most expensive and the most detailed — you need them when you truly have to "see the shape of one run."

The export target is any backend that accepts the OpenTelemetry Protocol (OTLP); the docs name a few: Honeycomb, Datadog, Grafana, Langfuse, or a self-hosted collector[^S6]. Which one to pick isn't in scope for this course — I'll just say: the three signals being independent means you can try the water with the smallest piece first, without waiting for the full infrastructure to be ready.

## Incidentally: the same batch of events is also an audit trail

Structured events have one more use that's unrelated to debugging, just know it exists.

With end-user identity attached, the `tool_decision`, `tool_result`, `mcp_server_connection`, and `permission_mode_changed` events, which export as log records named with a `claude_code.` prefix, become a per-user audit trail you can forward to a Security Information and Event Management (SIEM) platform[^S6]. Every event carries identity attributes that tie tool calls, MCP activity, and permission decisions back to the user who triggered them[^S4].

Same batch of data, read a different way and it's the raw material for another job: when debugging you slice horizontally by `prompt.id`, when auditing you slice vertically by user. Security topics aren't expanding in this course.

## Answers this course won't give you

A few things need clear boundaries so you don't look elsewhere for ready-made recipes:

- **Sampling rates and retention windows**: storing traces at full volume gets expensive, and how much to sample and how long to keep it are real questions, but there's no guidance in the primary material, so this course won't invent numbers. When your data volume actually becomes a problem, that's between you and your backend's bill.
- **Alert thresholds**: same — no numbers given.
- **Hooks**: how to install probes at lifecycle checkpoints, what `PreToolUse` and `PostToolUse` can each access — that's lesson 5. One interface to plant here first: the hook's input carries the UUID of the user prompt currently being processed, and it's the same value as the `prompt.id` attribute on telemetry events, so hook output and telemetry for the same prompt can be correlated[^S5]. The correlation ID established in this lesson becomes directly usable in the next.
- **Your own harness doesn't need full OTel**. This lesson uses the first-party design as a teaching tool because it lays out all the structure that should be there. But what you actually want is just the tree: lesson 6 will generate a `trace_id` for each run, add `span_id` and a parent-pointer field to each record, then write a dozen lines of code to print it indented — you'll get a tree built with the same parent-child mechanism (lesson 6 will explain it picked a different parent for tools), no collector needed, no backend needed, no dependencies. If you ever do need to connect OTLP, the fields are already there.

## 💻 Exercises

<!-- exercises -->

### Level 1: Draw 14 flat records as a tree

Below are 14 span records from an agent run, one JSON object per line. They're written **in order of end time** (a span doesn't know its duration until it finishes), so children often appear before their parents.

To keep this problem short, I've folded each tool's "permission wait" child record into a `wait_ms` field on the tool record and kept only the execution child record; `end_ms` is milliseconds relative to the start of this run.

```json
{"span_id":"a1b2c3d4e5f60002","parent_span_id":"a1b2c3d4e5f60001","trace_id":"4bf92f3577b34da6a3ce929d0e0e4736","name":"llm_request","prompt_id":"p-9c41","end_ms":1180,"dur_ms":1140,"model":"sonnet","tokens_in":3120,"tokens_out":186}
{"span_id":"a1b2c3d4e5f60004","parent_span_id":"a1b2c3d4e5f60003","trace_id":"4bf92f3577b34da6a3ce929d0e0e4736","name":"tool.execution","prompt_id":"p-9c41","end_ms":1455,"dur_ms":215}
{"span_id":"a1b2c3d4e5f60003","parent_span_id":"a1b2c3d4e5f60001","trace_id":"4bf92f3577b34da6a3ce929d0e0e4736","name":"tool","prompt_id":"p-9c41","end_ms":1460,"dur_ms":260,"tool":"Read","wait_ms":40}
{"span_id":"a1b2c3d4e5f60005","parent_span_id":"a1b2c3d4e5f60001","trace_id":"4bf92f3577b34da6a3ce929d0e0e4736","name":"llm_request","prompt_id":"p-9c41","end_ms":3050,"dur_ms":1570,"model":"sonnet","tokens_in":4980,"tokens_out":312}
{"span_id":"9f8e7d6c5b4a0001","traceparent":"00-4bf92f3577b34da6a3ce929d0e0e4736-a1b2c3d4e5f60007-01","name":"build.compile","service":"repo-build-script","end_ms":5100,"dur_ms":1500}
{"span_id":"a1b2c3d4e5f60007","parent_span_id":"a1b2c3d4e5f60006","trace_id":"4bf92f3577b34da6a3ce929d0e0e4736","name":"tool.execution","prompt_id":"p-9c41","end_ms":5210,"dur_ms":1810}
{"span_id":"a1b2c3d4e5f60006","parent_span_id":"a1b2c3d4e5f60001","trace_id":"4bf92f3577b34da6a3ce929d0e0e4736","name":"tool","prompt_id":"p-9c41","end_ms":5220,"dur_ms":2140,"tool":"Bash","wait_ms":320}
{"span_id":"a1b2c3d4e5f6000d","parent_span_id":"a1b2c3d4e5f60001","trace_id":"4bf92f3577b34da6a3ce929d0e0e4736","name":"hook","prompt_id":"p-9c41","end_ms":5310,"dur_ms":70,"hook_event":"PostToolUse"}
{"span_id":"a1b2c3d4e5f6000a","parent_span_id":"a1b2c3d4e5f60009","trace_id":"4bf92f3577b34da6a3ce929d0e0e4736","name":"llm_request","prompt_id":"p-9c41","end_ms":6900,"dur_ms":1500,"model":"sonnet","tokens_in":11240,"tokens_out":840}
{"span_id":"a1b2c3d4e5f6000c","parent_span_id":"a1b2c3d4e5f6000b","trace_id":"4bf92f3577b34da6a3ce929d0e0e4736","name":"tool.execution","prompt_id":"p-9c41","end_ms":7470,"dur_ms":520}
{"span_id":"a1b2c3d4e5f6000b","parent_span_id":"a1b2c3d4e5f60009","trace_id":"4bf92f3577b34da6a3ce929d0e0e4736","name":"tool","prompt_id":"p-9c41","end_ms":7480,"dur_ms":528,"tool":"Grep","wait_ms":0}
{"span_id":"a1b2c3d4e5f60009","parent_span_id":"a1b2c3d4e5f60008","trace_id":"4bf92f3577b34da6a3ce929d0e0e4736","name":"tool.execution","prompt_id":"p-9c41","end_ms":8355,"dur_ms":3015}
{"span_id":"a1b2c3d4e5f60008","parent_span_id":"a1b2c3d4e5f60001","trace_id":"4bf92f3577b34da6a3ce929d0e0e4736","name":"tool","prompt_id":"p-9c41","end_ms":8360,"dur_ms":3030,"tool":"Agent","wait_ms":10,"agent":"code-searcher"}
{"span_id":"a1b2c3d4e5f60001","trace_id":"4bf92f3577b34da6a3ce929d0e0e4736","name":"interaction","prompt_id":"p-9c41","end_ms":8420,"dur_ms":8420}
```

Without writing code, use pen and paper or a text editor to complete:

1. Rebuild these 14 records as an indented trace tree. Siblings at the same level should be ordered by **start time** from top to bottom (start time = `end_ms - dur_ms`). Each line should show name and duration; mark tool names on tools.
2. Answer: In this run, the tokens consumed by the subagent count toward which prompt? Why? Calculate the total tokens for that prompt.
3. Answer: Which **one** record can prove that `build.compile` was triggered by the **second** tool call? Specify which field and which portion of its value.

<!-- rubric -->

Self-assessment checklist:

- [ ] The root of the tree is the one record that has neither `parent_span_id` nor `traceparent` — doesn't identify any parent (`interaction`, 8420ms) — note that `build.compile` also lacks `parent_span_id`, but it uses `traceparent` to identify a parent, so it's not the root
- [ ] The root has exactly 6 direct children: two `llm_request`, three `tool`, one `hook`, ordered by start time as llm → Read → llm → Bash → hook → Agent
- [ ] Each of the three tool calls has one `tool.execution` child in the correct position
- [ ] `build.compile` hangs under Bash's `tool.execution` (`...60007`), not under Bash's `tool` span or the root
- [ ] All three subagent records (`llm_request`, `tool` Grep, Grep's `tool.execution`) are nested inside the Agent tool's `tool.execution` (`...60009`) subtree, not placed as children of the root
- [ ] Question 2 answers "counts toward prompt `p-9c41`" and gives the reason that subagent spans nest under the parent agent's tool span, the full delegation chain is one trace
- [ ] Token total is correct: input 19340, output 1338, and notes the subagent's run accounts for over half the input
- [ ] Question 3 names the `build.compile` record and explains the basis is that its `traceparent` parent span id segment equals the Bash execution span id
- [ ] Doesn't mistakenly place the `hook` record as a child of any tool (it's a direct child of the root)

<!-- answer -->

**1. Reconstructed tree**

```text
interaction  p-9c41  8420ms                                   a1b2c3d4e5f60001
├─ llm_request  1140ms  in 3120 / out 186                     a1b2c3d4e5f60002
├─ tool Read  260ms (wait 40ms)                               a1b2c3d4e5f60003
│  └─ tool.execution  215ms                                   a1b2c3d4e5f60004
├─ llm_request  1570ms  in 4980 / out 312                     a1b2c3d4e5f60005
├─ tool Bash  2140ms (wait 320ms)                             a1b2c3d4e5f60006
│  └─ tool.execution  1810ms                                  a1b2c3d4e5f60007
│     └─ build.compile  1500ms (emitted by build script)      9f8e7d6c5b4a0001
├─ hook PostToolUse  70ms                                     a1b2c3d4e5f6000d
└─ tool Agent(code-searcher)  3030ms (wait 10ms)              a1b2c3d4e5f60008
   └─ tool.execution  3015ms                                  a1b2c3d4e5f60009
      ├─ llm_request  1500ms  in 11240 / out 840              a1b2c3d4e5f6000a
      └─ tool Grep  528ms                                     a1b2c3d4e5f6000b
         └─ tool.execution  520ms                             a1b2c3d4e5f6000c
```

Reconstruction method: first pick out records with no parent — you'll find **two** records lacking `parent_span_id`: `interaction` and `build.compile`. Among them, `build.compile` uses `traceparent` to identify a parent (this is exactly the entry point for question 3), so the true root is the remaining `interaction`. The rest recognize their parents by `parent_span_id`. The file is written in end-time order, so reading top to bottom you'll see children appear first — that's normal and doesn't affect reconstruction. Same-level ordering uses start time: `llm_request` starts at 40, Read at 1200, second `llm_request` at 1480, Bash at 3080, hook at 5240, Agent at 5330.

**2. Which prompt do the subagent's tokens count toward**

They count toward prompt `p-9c41`. After the subagent is spawned through the Agent tool, its `llm_request` and `tool` spans nest under the parent agent's tool span, and the full delegation chain is one trace[^S6] — the subagent's model request is a child of "Agent tool execution," which is a grandchild of this prompt. Not a single record escapes outside the tree.

Total tokens for this prompt:

- Input 3120 + 4980 + 11240 = **19340**
- Output 186 + 312 + 840 = **1338**

The subagent's single run alone accounts for 11240 of the input, about 58%. If you tallied by "only count model requests issued by the main loop," this prompt's cost would be under-reported by more than half — this kind of miss is the norm in multi-agent systems because the delegated portion is often the bulk.

**3. The record that proves `build.compile` belongs to the second tool call**

It's the `build.compile` record itself (`span_id` is `9f8e7d6c5b4a0001`). It looks different from other records: no `prompt_id`, no `parent_span_id`, because it was emitted by the build script in **another process** that has no idea what a prompt is. What it has is a `traceparent`:

```text
00-4bf92f3577b34da6a3ce929d0e0e4736-a1b2c3d4e5f60007-01
   └─ trace id ─────────────────────┘└ parent span id ┘
```

The third segment `a1b2c3d4e5f60007` is its parent span id, and that's exactly the Bash tool's `tool.execution` child span. Ordered by start time, the three tool calls are Read (1200), Bash (3080), Agent (5330) — Bash is second. So this command's span belongs to the second tool call, based on trace context rather than timestamps or guesses.

This is also what cross-process propagation actually looks like: the CLI puts the active tool execution span's trace context into the subprocess's `TRACEPARENT` environment variable[^S4], and spans emitted by the subprocess automatically nest under that tool execution[^S6].

<!-- hint -->

Do just the mechanical step first: copy the 14 records into two columns (`span_id`, `parent_span_id`), and you'll find **two** rows with no parent — you didn't copy wrong; one of them hides the entry point for question 3. The rest is a "find your parent" game. Don't let file order mislead you — records are written in end-time order, so children appearing before parents is normal.

<!-- hint -->

One record's fields look different from the others: it has no `prompt_id`, but it has a `traceparent`. Split that string into four segments by `-`, and the third segment is its parent span's id. Take that id and search for it in other records' `span_id` fields, and question 3 is done.

### Level 2: Three empty dashboards, give a troubleshooting path for each

No code. The three scenarios below all wear the "dashboard looks wrong" appearance, but they're three different mechanisms underneath. For each one, write: **most likely cause**, **what order you'd verify in**, and **how to handle after verification passes**. Every judgment must point back to a specific mechanism covered in this lesson — don't just attribute everything to "config was wrong."

- **Scenario A**: Connected telemetry export, shipped it, a week passed, the dashboard has no data at all. No spans, no metrics, no events. The agent has been serving users normally all week; nobody complained.
- **Scenario B**: The metrics panel is completely normal — token counts are climbing, cost curves are moving, session counts match up. But you open the tracing backend, search by today's time range, and not a single trace.
- **Scenario C**: A short script that runs in CI — every time it finishes the trace is "missing its tail": the root span is there, the first few steps are there, the last two or three tool spans are gone. The same config on a local dev machine with long runs shows everything fine.

<!-- rubric -->

Self-assessment checklist:

- [ ] The three scenarios are given three **different** mechanisms; you didn't collapse them all into the same cause
- [ ] Scenario A captures "export failure is silent by default": agent runs normally, telemetry is dropped, application doesn't error, so zero data can't be read as "no problems"
- [ ] Scenario A's verification step 1 is checking the backend for that session-start counting metric, step 2 is turning on debug mode to see export errors
- [ ] Scenario B captures "three signals each have their own enable switch and exporter," explicitly pointing out that metrics working doesn't mean traces work
- [ ] Scenario B mentions the enhanced telemetry switch for traces needs separate confirmation
- [ ] Scenario C captures "batch export + short-lived process": flush has a timeout ceiling, process killed means buffer entirely lost
- [ ] Scenario C cites the default export intervals (traces and logs 5 seconds) and relates it to the script's alive duration
- [ ] Scenario C's handling includes "shorten export interval" or "ensure process exits cleanly, don't let CI kill it early," not enlarge batch size
- [ ] At least one place considers the "data actually arrived but mixed under same `service.name` and can't be found" kind of "looking in wrong place" possibility, and ranks it after the pipeline rather than before
  
<!-- answer -->

**Scenario A: One week, zero data**

Most likely cause: the pipeline never connected. Export failure is silent by default — when the endpoint is unreachable or the backend rejects data, the agent still runs normally and the CLI drops the telemetry without surfacing an error in your application[^S6]. So "a week with no data" and "a week with no problems" look identical on your end; you can't use it to infer agent health.

Verification sequence:

1. Check the backend for the `claude_code.session.count` metric — Claude Code emits it when a session starts[^S4]. If you can query it, the data path is live and the problem is at the query or panel layer; if you can't, continue to the next step.
2. Run `claude --debug` and look for OTel export errors in the debug log[^S4]. Wrong endpoint, bad certificate, backend rejection — all will show up here.
3. If both steps look normal but you still see nothing, then suspect "looking in the wrong place": by default the CLI reports `service.name` as `claude-code`, and if several agents or other services export to the same collector, your data might be mixed under someone else's service name; override the service name and add resource attributes, and you can filter by agent[^S6].

Handling: after fixing, don't wait for "next time something breaks" to confirm — run a session right away and see whether that counting metric appears in the backend. Use an action that's guaranteed to produce data to verify the path; it's more reliable than waiting for an uncertain error.

**Scenario B: Have metrics, no traces**

Most likely cause: the trace signal isn't turned on, or its own exporter isn't configured. The CLI exports three independent signals, each with its own enable switch and its own exporter, so you can turn on only the ones you need[^S6] — flipping that around, metrics working doesn't imply traces also work; they're two separate configs.

Verification sequence:

1. Check the trace path's enable switch and exporter endpoint separately; don't reuse the conclusion that "metrics can get out."
2. Confirm whether `CLAUDE_CODE_ENHANCED_TELEMETRY_BETA=1` is set — each step of the agent loop becoming an inspectable span happens when this switch is on[^S6]. Without the switch, you'll see a thin or outright empty trace view.
3. If both switches are on, then run `--debug` and see whether the trace exporter has separate errors in the debug log[^S4]. The metrics exporter and trace exporter can point to different endpoints; one misconfigured while the other works normally is a very common situation.

Handling: after filling in the trace's switch and endpoint, run a session with tool calls, go to the tracing backend and find that tree by trace id or time range, confirm the root span and children are all present.

**Scenario C: Short script's trace is missing its tail**

Most likely cause: batch export collided with a short-lived process. The CLI batches telemetry and exports on an interval; on a clean exit it attempts to flush pending data, but the flush is bounded by a short timeout, so spans can still be dropped if the collector is slow to respond; if the process is killed before the CLI shuts down, anything still in the batch buffer is lost[^S6]. By default traces and logs export every 5 seconds[^S6] — a CI script that finishes in a few seconds has all its tail-end telemetry betting on exit flush, and if the flush gets cut off by timeout (or CI just kills the process), it's gone; the longer the export interval, the more piles up in the buffer waiting for flush. This also explains why local long runs show no problems: when you run long enough, every batch gets a chance to be sent out in the regular interval.

Verification sequence:

1. For a run that's "missing its tail," check whether the dropped spans are the ones **temporally last**. If loss is randomly distributed across the whole tree, it's not this mechanism — need to go back and suspect something else.
2. Shrink the export interval to significantly shorter than the script's total duration, re-run, see if the tail comes back.
3. Check whether CI is waiting for the process to exit on its own. If the task uses a timeout kill, or the container gets recycled immediately after the main process exits, the CLI has no chance to do that flush.
4. Try a local, fast-responding collector again to reproduce. If switching fixes it, that means the slow backend ate the flush timeout.

Handling: shorten the export interval, and ensure the script lets the CLI exit cleanly (don't set a timeout on the CI step that happens to cut off the shutdown process). The direction is "make data send more frequently, let the process live long enough," not enlarge batch size — the bigger the batch, the worse the loss when the last batch gets dropped.

<!-- hint -->

Give each scenario a label first before you write: A is "all missing," B is "one type missing," C is "one segment missing." Loss **shape** differs, meaning mechanism differs — in the "pipeline can lie to you" section of this lesson, there are three shapes each with a corresponding explanation.

<!-- hint -->

Ask yourself for each scenario first: "Can this phenomenon be explained by 'telemetry is quietly dropped but nobody errors'?" If yes, go investigate the pipeline direction; if no, then ask "is it all missing, is it one signal type missing, or is it the last little time segment?" The answer to the third question will directly send you to "signals are independent" or "batch export + flush timeout."

<!-- /exercises -->

## Recap

- Structured logs solved "are records detailed enough," but didn't solve "what relationship do records have." Correlation IDs are the first step to adding relationships: one prompt might trigger multiple API calls and several tools, and `prompt.id` ties all of those events back to the single prompt that triggered them; the debugging starting move is to filter by this value[^S4].
- A span is the record of a piece of work with a beginning and an end; a trace is the tree strung together by parent-child relationships. Distributed tracing links each user prompt to the API requests and tool executions it triggers as spans, so the full request reads as one trace in your tracing backend[^S4].
- The hierarchy is fixed: each prompt opens a `claude_code.interaction` root span, API calls, tool calls, and hook executions are its children; tool spans have two child spans that separately record the time spent waiting for permission and the time actually executing[^S4]. With enhanced telemetry on, each step of the agent loop becomes an inspectable span; traces are the most detailed view of a run[^S6].
- Trees can stay connected across process boundaries: subagent spans nest under the parent agent's tool span, the full delegation chain reads as one trace; the SDK injects `TRACEPARENT` and `TRACESTATE` into the CLI subprocess, so the agent run appears inside your application's trace instead of as a disconnected root[^S6]; going further down, Bash subprocesses inherit `TRACEPARENT`[^S4], and spans emitted by commands nest under that tool execution's span[^S6].
- Bringing full tracing online enables systematic diagnosis of failures[^S1]; and monitoring only decision patterns and interaction structures without looking at conversation content is sufficient to diagnose root causes and discover unexpected behaviors[^S1]. The mechanism aligns exactly: telemetry is structural by default — durations, model names, and tool names are recorded on every span; content is not recorded by default[^S6]; prompt content also defaults to only recording length; to include content you must explicitly set a switch[^S4].
- Metrics, log events, and traces are three independent signals, each with its own enable switch and exporter, so you can turn on only the ones you need[^S6] — incremental adoption, no need to go all-in at once.
- The observability pipeline itself can lie to you: export failure is silent by default, agent runs normally while telemetry is dropped and no error is surfaced[^S6]; batch export will attempt to flush on clean exit but it's bounded by a short timeout, and if the process is killed the buffer is entirely lost[^S6]; by default metrics every 60 seconds, traces and logs every 5 seconds[^S6], so short-lived runs need shorter intervals. First thing when troubleshooting is to verify the instrumentation itself: check the backend for that session count metric[^S4], and if it's not there turn on `--debug` to see export errors[^S4].
- Two config traps: multiple agents sharing one backend need to override `service.name` and add resource attributes to be distinguishable[^S6]; when running through the SDK don't set `console` as the exporter[^S6].
- The same batch of structured events read a different way is audit material: with identity attributes attached, tool decisions, tool results, MCP connections, and permission mode changes become a per-user audit trail you can forward to a SIEM[^S6], and each event's identity attributes tie tool calls back to the person who triggered them[^S4].
- There's no primary guidance on sampling rates and retention windows, so this course gives no numbers. Your own harness also doesn't need full OTel — lesson 6 uses a `trace_id` plus parent-pointer fields plus indented printing to get a tree built with the same parent-child mechanism.

[>> Lesson 5: Probes at the Gates: Hooks and a Debugging Workflow](./05-hooks-and-debugging.md)
