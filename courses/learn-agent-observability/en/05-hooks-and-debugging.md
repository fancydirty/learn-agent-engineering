# Lesson 5: Probes at the Gates: Hooks and a Debugging Workflow

> Learning goals:
> - Explain what hooks are: user-defined handlers that execute automatically at fixed points in the agent lifecycle, organized into three cadences (once per session / once per turn / per tool call in the loop), and be able to pick the right event for an observability need, write the correct matcher, and identify which payload fields to use
> - Avoid two traps that actually bite: hook subprocesses don't inherit the harness's OTel export config, and transcript files are written asynchronously so they may not contain recent messages when the hook fires
> - Apply a five-step workflow to locate problems under non-determinism: narrow by prompt id, find the first divergence, replay with identical inputs, repeatedly stress the same component, and recover from the failure point after fixing
>
> Prerequisites: Completed Lessons 1–4 (non-determinism and "can't tell why," raw records as primary evidence, structured logs and metrics, trace trees and telemetry pipeline traps) | Previous: [<< Lesson 4](./04-tracing.md) | Next: [Lesson 6 >>](./06-build-observability.md)

## You want to record before and after each tool execution

Lesson 3 taught you to write a structured log entry for each tool call in your own harness. Lesson 4 taught you to thread those records into a trace tree. That was your loop, you had the source code, you could drop a `log()` call wherever you wanted. But now you're running Claude Code in production — you don't have its `runToolUses`. What you want isn't complicated: record once before tool execution (what parameters it's about to use) and once after (what it got back). But the insertion points are in someone else's process.

The product anticipated this. The answer is called hooks.

**Hooks are user-defined shell commands, HTTP endpoints, or LLM prompts that execute automatically at specific points in Claude Code's lifecycle**[^S5]. In plain English: you declare in config "at such-and-such moment, run this script for me," and when Claude Code reaches that moment it runs it. And it doesn't come empty-handed — when an event fires and a matcher matches, Claude Code passes JSON context about the event to your handler[^S5].

In course 7 of this series, you wrote an approval gate in your harness loop — when it encountered a HIGH_IMPACT tool, it stopped and waited for human confirmation before executing. That was a hand-rolled interception point. Hooks do the same thing, but they've organized "which positions in the loop are worth pausing at" into a named list where each position has a fixed, dependable payload. For observability, the value of this list isn't that you "can change behavior" — it's that **you can see without changing behavior**.

## Three cadences: session, turn, tool call

Events fall into three cadences[^S5]:

- **Once per session**: `SessionStart` and `SessionEnd`
- **Once per turn**: `UserPromptSubmit`, `Stop`, and `StopFailure` (from the names, `StopFailure` corresponds to the exit where the turn didn't finish normally — the official citation only gave the cadence classification; rely on your reference page for precise semantics)
- **On every tool call inside the agentic loop**: `PreToolUse` and `PostToolUse`

Line this up against the loop anatomy from course 7, and the three layers match immediately:

```text
SessionStart                       ← session begins (entire runAgent starts)
  UserPromptSubmit                 ← turn begins (user submits prompt)
    while (stop_reason === "tool_use") {
       ... model request ...
       PreToolUse                  ← inside loop body, parameters generated, not yet executed
       ... tool execution ...
       PostToolUse                 ← inside loop body, tool finished executing
    }
  Stop / StopFailure               ← turn ends
SessionEnd                         ← session ends
```

Picking the wrong cadence gives you numbers that are hard to explain: if you want to count "how many tool calls did one task use" but hook into the per-turn gate, you'll only get zero. Before picking an event, ask: how many times per session does the thing I'm counting happen?

One detail worth calling out: `SessionStart` fires when you open a new session **and also when you resume an existing one**[^S5]. Course 9 covered `--resume` — from the loop's perspective that's not "starting fresh," but it still rings the `SessionStart` bell. If you write "initialize a new log when session starts," the first time you hit resume you'll overwrite the previous segment.

## Gate details useful for observability

**`PreToolUse` runs after Claude creates tool parameters and before processing the tool call**[^S5]. This gap matters: parameters are finalized (you can see exactly what the model intends to use) but the tool hasn't run yet. Lesson 2 covered a real case — the team discovered Claude would needlessly append `2025` to the search tool's query parameter, biasing results[^S3]. Evidence for this kind of bug lives in the parameters that `PreToolUse` can see.

**`PostToolUse` hooks fire after a tool has already executed successfully. The input includes both `tool_input`, the arguments sent to the tool, and `tool_response`, the result it returned**[^S5]. One firing gives you a complete call record; you don't have to piece together "which request goes with which response" yourself. The principle Lesson 2 emphasized — the complete round-trip is the primary evidence[^S3] — is handed to you here field by field. Note its trigger condition is "already executed successfully"[^S5]; if you want to cover cases where parameters were generated but execution didn't succeed, you need to pair it with `PreToolUse` and diff the two sides.

**How to write matchers**: To run a hook after any tool completes successfully, omit the `matcher` or set it to `"*"`[^S5]. Observability scenarios want exactly this one-hook-records-all behavior — you don't know which tool will break, so you record them all.

**How handlers send and receive data**: Command hooks receive JSON data via stdin and communicate results through exit codes, stdout, and stderr[^S5]. So a minimal observability handler is just "read JSON from stdin, pick a few fields to append to a file, exit with code 0" — no magic involved.

```json
{
  "hooks": {
    "PostToolUse": [
      {
        "matcher": "*",
        "hooks": [
          { "type": "command", "command": "node ~/.claude/obs/record-tool-call.mjs" }
        ]
      }
    ]
  }
}
```

```javascript
#!/usr/bin/env node
// record-tool-call.mjs — PostToolUse handler
// Reads JSON from stdin, writes one JSON Lines entry, exit code 0 means all clear
import { appendFileSync, mkdirSync } from "node:fs";

let raw = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", (chunk) => { raw += chunk; });
process.stdin.on("end", () => {
  const evt = JSON.parse(raw);
  const line = {
    ts: new Date().toISOString(),
    session_id: evt.session_id,
    prompt_id: evt.prompt_id,
    tool: evt.tool_name,
    input: evt.tool_input,       // parameters sent to tool
    response: evt.tool_response, // result returned by tool
  };
  mkdirSync("/tmp/agent-obs", { recursive: true });
  appendFileSync("/tmp/agent-obs/tool-calls.jsonl", JSON.stringify(line) + "\n");
  process.exit(0);
});
```

This is the JSON Lines log from Lesson 3, except the one writing the log has changed from "your harness" to "a small script you hung on someone else's loop." Consult the reference page for your version for exact config structure and field names.

**The payload includes duration, but check the definition**: The payload carries an optional field for tool execution time in milliseconds, which **excludes time spent in permission prompts and PreToolUse hooks**[^S5]. The second half is key: user-perceived "how long did I wait for this step" includes the time they spent clicking confirm, but this number strips it out. Using it to answer "is the tool slow" is correct; using it to answer "how long did the user wait" will be systematically low. Lesson 4 mentioned the same thing another way — the tool span has two child spans underneath, one for waiting on the permission decision and one for execution itself[^S4]. They're recorded separately precisely because these two segments shouldn't be mixed.

**Hooks themselves are in the trace too**: Each user prompt starts a `claude_code.interaction` root span. API calls, tool calls, and hook executions are recorded as its children[^S4]. The observability mechanism is itself an observed object.

## Two warnings that bite

**First: hook subprocesses don't inherit OTEL_\* exporter variables.** One set of variables is not inherited: Claude Code removes `OTEL_*` exporter variables from every subprocess it spawns, including hooks[^S5].

This sentence directly kills a very natural idea: "The harness already has the endpoint, protocol, and auth headers configured. I'll just import an OTel SDK in my hook and the environment variables will work out of the box." — They won't. When the handler process starts, those variables have already been stripped. The data either won't export or will hit the default endpoint and vanish. Don't expect anyone to yell and warn you: Lesson 4 covered that the CLI's own export fails silently[^S6], and by default the exporter you build yourself in the hook won't be any louder — when no data reaches the backend, both sides are quiet.

You have two paths forward: either the hook carries its own complete export config (explicitly write the endpoint and auth in the script, don't rely on inheritance), or don't emit telemetry from the hook at all — let it write a structured log and align it with telemetry in the backend using IDs. The second path has official support: the UUID identifying the user prompt currently being processed in the hook payload matches the `prompt.id` attribute on OpenTelemetry events, so you can correlate hook output with telemetry for a single prompt[^S5]. Each side writes its own, then you join on the same prompt id at the end — same trick as Lesson 4's "thread into a tree using correlation IDs," except this time across two data sources.

**Second: the transcript file is written asynchronously.** The payload gives you a path to the conversation JSON, but this file is written asynchronously and may lag the in-memory conversation, so it may not yet include the current turn's most recent messages when the hook fires[^S5].

The trap is it doesn't error, it just gives you stale data. Someone might think "the payload fields aren't enough, I'll read the transcript directly, it has everything," and end up with records that intermittently miss half their content. **If you want `tool_input` and `tool_response`, use the payload fields** — those are what `PostToolUse` explicitly guarantees to provide[^S5]. Transcripts are good for looking back afterward, not for using as a real-time data source at the instant the hook fires.

A reminder tied to your machine: command hooks execute shell commands with your full user permissions. They can modify, delete, or access any files your user account can access. Review and test all hook commands before adding them to your configuration[^S5].

```agentmentor-check
{
  "id": "obs-zh-05-hook-otel-shortcut",
  "label": "Can you reuse the harness's OTel config in a hook",
  "prompt": "A colleague shows you their approach: in the PostToolUse hook handler, directly import the OTel SDK and emit a span for each tool call. Their reasoning is 'the harness already configured the OTLP endpoint and auth headers as environment variables, the hook is a subprocess it spawned, so the environment naturally inherits — no extra config needed.' How will this approach work out?",
  "whyHere": "This is where the 'hooks are insertion points' and 'telemetry pipelines lie to you' threads connect — an approach that sounds bulletproof gets explicitly denied by first-party docs, and the failure is silent.",
  "mode": "single",
  "choices": [
    {
      "id": "a",
      "text": "Won't work: Claude Code removes OTEL_* exporter variables from every subprocess it spawns, including hooks, so the config won't pass through. Either the handler carries its own export config, or the hook only writes structured logs and you align with telemetry using prompt id.",
      "correct": true,
      "feedback": "Correct. This is an explicit negative conclusion in the docs, and failure is typically silent — data won't export but won't error either, so you'll think it's waiting in the backend. Each fallback path has a cost: carrying config means maintaining a second auth setup; writing logs and joining later requires an extra correlation step, but the prompt id in the hook payload and the prompt.id on telemetry events are the same value, so the join is guaranteed."
    },
    {
      "id": "b",
      "text": "Will work, but watch for duplication: the same tool call gets recorded once by the CLI's built-in tool span and once by the hook's emitted span, requiring deduplication by tool name in the backend.",
      "correct": false,
      "feedback": "Duplicate counting is indeed a common instrumentation problem, but it doesn't get a turn here — the approach dies one step earlier. Environment variables don't pass into the hook subprocess, so that span never exports at all. No collision with the built-in span."
    },
    {
      "id": "c",
      "text": "Will work, the only issue is timing: PostToolUse fires after tool execution finishes, so the span start time can only be back-calculated, making duration inaccurate.",
      "correct": false,
      "feedback": "Duration semantics do matter — that execution milliseconds field in the payload excludes permission wait time and PreToolUse. But that's not this approach's cause of death. Its cause of death is the exporter variables get stripped, so the data never gets out."
    }
  ]
}
```

## When hooks don't do their job

You hung a hook, the log file is empty. Did it not fire? Matcher didn't match? Or did the script itself crash? At this point the object you need to observe is the observability mechanism itself. Lesson 4's principle applies again here: verify the probe first.

**Hook execution details — which hooks matched, their exit codes, and full stdout and stderr — are written to the debug log file**[^S5]. Get it one of two ways: use `claude --debug-file <path>` to write to a location you specify, or run `claude --debug` and then read `~/.claude/debug/<session-id>.txt`[^S5]. For more granular hook matching details, set `CLAUDE_CODE_DEBUG_LOG_LEVEL=verbose` to see additional log lines such as hook matcher counts[^S5].

```text
Troubleshooting sequence: log file is empty
 └─ Does the debug log have a match record for this hook?
      No   → matcher is wrong; confirm it fires first with omitted matcher
      Yes  → Is the exit code 0?
               No  → read stderr, likely script path, permissions, or JSON parse
               Yes → ran but didn't write to the right place; check write path and directory existence
```

## A debugging workflow: how to track down a problem under non-determinism

First half of the lesson covered where to place probes. Second half covers how to actually use that data to track down a real problem.

Start by stating the difficulty clearly. Lesson 1 said: agents make dynamic decisions and are non-deterministic between runs, even with identical prompts. This makes debugging harder[^S1]. Step one in traditional debugging is "reproduce," and that step doesn't hold here — you re-run it, and it might take a completely different but equally valid path.

The five steps below are **this course's own arrangement**, not anyone's official methodology; but each step stands on a source.

### Step one: narrow

In the records you've accumulated across lessons 1–4, first narrow the scope to "this one problematic prompt." Lesson 4 gave you the method: **to trace all activity triggered by a single prompt, filter your events by a specific `prompt.id` value**[^S4].

This step's significance isn't technical, it's psychological. "The agent broke" is a proposition you can't debug; "one of these 11 events under this prompt id is off" is a proposition you can debug.

### Step two: find the first divergence

Read from the beginning forward and find **the first step where behavior starts to deviate from expectations**. Why insist on "first"? Because one step failing can cause agents to explore entirely different trajectories, leading to unpredictable outcomes[^S1]. The absurdities you see at the end (referencing non-existent files, erroring repeatedly, taking the long way around) are mostly downstream noise. Fix event #8 and you're probably just cleaning up after event #4's mistake.

Judging "deviation" has a few useful shapes[^S3]: called a tool it shouldn't have called, called the right tool with wrong parameters, called the right tool too few times, or processed the tool response incorrectly. The last kind is hardest to spot because the tool itself returned success, everything's green in the logs — what's wrong is the agent's interpretation of that successful result.

### Step three: replay and observe

The official approach: to understand the effects of prompts, **built simulations using the exact prompts and tools from the system, then watched agents work step-by-step**; this immediately revealed failure modes like agents continuing when they already had sufficient results, using overly verbose search queries, or selecting incorrect tools[^S1].

"Immediately revealed" is worth thinking about. These same bugs are invisible in aggregate metrics (success rate is pretty high), take line-by-line reading to notice in after-the-fact logs, but when you watch it run step by step, the human eye spots "it already has enough but keeps searching" in seconds. Two things to control during replay: input must be identical (prompts, tool definitions unchanged), and observation must be step-by-step.

### Step four: repeatedly stress the same component

If suspicion falls on a specific tool, running it a few times likely won't show anything — non-determinism makes bugs appear and vanish.

The team built a tool-testing agent: give it a flawed MCP tool, it attempts to use it, then rewrites the tool description to avoid failures. **By testing the tool dozens of times, this agent found key nuances and bugs**[^S1].

"Dozens of times" is the point. A bug that one run can hide, dozens of runs will force out: a return shape that's odd under boundary inputs, an ambiguous description, an error message that makes the model misjudge it as "just retry." The diagnostic readings from Lesson 3 connect here — lots of redundant tool calls might suggest pagination or token limit parameters need rightsizing; lots of tool errors for invalid parameters might suggest tools could use clearer descriptions or better examples[^S3]. One thing that saves many round-trips: when a tool call raises an error, you can prompt-engineer your error responses to clearly communicate specific and actionable improvements, rather than opaque error codes or tracebacks[^S3].

### Step five: recover from the failure point after fixing

After you fix it, don't reflexively hit "start over." The official line is direct: when errors occur, we can't just restart from the beginning: restarts are expensive and frustrating for users. Instead, we built systems that can resume from where the agent was when the errors occurred[^S1].

Course 9 covered how to build recovery mechanisms. That lesson's scenario was "how to pick up after task interruption." In debugging it's a different use: the dozens of tool calls before the failure point were valid, cost money, gave correct results. Re-running them gives you nothing but burned tokens, and introduces a bunch of new non-determinism so you can't tell whether "it worked this time" is because you fixed it right or because you got lucky.

## About "reproduction," an honest word

You might have seen elsewhere a set of techniques to make agents reproducible: fix the random seed, set temperature to 0, record real tool returns and use them as replay stubs.

These practices do exist in engineering. Courses 8–10's hands-on labs use that same stub client approach — save the `tool_result` from one real run, return the same data every time afterward, and the tool side becomes deterministic. Good for verifying "did the line of code I changed break the parsing logic."

But two things need saying. First, **these techniques have no first-party source backing**. I gave citations for every step of the five-step flow above. For this paragraph I'm not giving any, because there genuinely aren't any. If you see someone claim "official recommendation is temperature 0 to reproduce agent issues," ask them for the link.

Second, they lock down less than they sound like they do. Stubbing tool returns locks down the environment; the model side is still non-deterministic[^S1]. So it turns "two variables moving" into "one variable moving" — that's valuable, but it's not the "same input must give same output" kind of reproduction. Don't treat it as a guarantee, treat it as noise reduction.

## What problems are worth this workflow

Walking all five steps has a cost: narrowing requires reading logs, replay requires building a simulation, stressing a component means dozens of runs. A rough but workable split:

- **Low-frequency, harmless jitter** — like one time it called search once extra, but the result was still right. Log it, accumulate. Each individual instance isn't worth investigating; after you've collected a dozen you can often see a common pattern, and investigating once at that point is much more efficient.
- **High-impact** — gave a factually wrong answer, modified a file it shouldn't have touched, hung without returning. Doesn't matter how low the frequency, file a case. One occurrence is already expensive enough.
- **Recurring** — same failure shape shows up a third time, which means it's not luck, it's structural. File a case.

Lesson 1's line is the decision criterion here: for instance, users would report agents "not finding obvious information," but we couldn't see why. Were the agents using bad search queries? Choosing poor sources? Hitting tool failures?[^S1] You decide not to investigate a problem, you're accepting "I don't know which cause it is" — for harmless jitter that's fine, for high-impact problems you're gambling.

This lesson's been on paper so far. Lesson 6 puts both halves together hands-on: wire up a full observability layer onto the course 7 harness, then take an "I can't tell why" symptom and chase it all the way down.

## Recap

- Hooks are user-defined commands, HTTP endpoints, or LLM prompts that execute automatically at specific points in Claude Code's lifecycle; when an event fires and a matcher matches, Claude Code passes JSON context about the event to your handler[^S5].
- Events fall into three cadences — once per session (`SessionStart`/`SessionEnd`), once per turn (`UserPromptSubmit`/`Stop`/`StopFailure`), on every tool call inside the loop (`PreToolUse`/`PostToolUse`)[^S5]. Fix the cadence before picking the event. `SessionStart` also fires when resuming a session[^S5].
- `PreToolUse` runs after Claude creates tool parameters and before processing the tool call; `PostToolUse` fires after successful tool execution, with input carrying both `tool_input` and `tool_response`, giving you a complete call record in one firing[^S5]. Omit the matcher or set it to `"*"` for one-hook-records-all[^S5].
- Command hooks receive JSON via stdin, respond through exit codes, stdout, and stderr[^S5]; that execution milliseconds field excludes time spent in permission prompts and `PreToolUse`[^S5], so don't use it as user wait time.
- Two negative conclusions: Claude Code removes `OTEL_*` exporter variables from every subprocess it spawns (including hooks)[^S5], so if you want to emit telemetry from a hook you must carry your own export config; the transcript file provided in the payload is written asynchronously and may not yet include the current turn's most recent messages when the hook fires[^S5]. Command hooks execute with your full user permissions, so review before installing[^S5].
- When hooks don't work, check the debug log for which hooks matched, exit codes, and full stdout/stderr using `--debug-file`[^S5]; for matcher counts set log level to verbose[^S5]. The prompt id in the hook payload and the `prompt.id` on telemetry events are the same value, so the two data sources can align[^S5].
- Five-step debugging workflow (this course's arrangement): filter events by `prompt.id` to narrow to this prompt[^S4] → find the first divergence, because one step failing changes the entire trajectory[^S1] → replay using identical prompts and tools, watching step-by-step[^S1] → stress the suspected component dozens of times to force out the bug[^S1] → after fixing, recover from the failure point instead of restarting from the beginning[^S1].
- Techniques like fixed seed, temperature 0, and recorded tool return replay have no first-party source backing; this course presents them as engineering practice: they lock down the environment side, but the model remains non-deterministic[^S1], so they're noise reduction, not reproduction guarantees.
- Not every problem warrants the full workflow: log low-frequency harmless jitter, accumulate for patterns, investigate later; file cases for high-impact or recurring issues immediately.

[>> Lesson 6: Hands-On: Wiring an Observability Layer onto the Harness](./06-build-observability.md)

## 💻 Exercises

<!-- exercises -->

### Level 1: Match three observability needs to hooks

You have three observability needs. For each one, write: **which event to pick**, **how to write the matcher**, **which payload fields to use**, and **what trap is specific to this need**. You don't need full code, config snippets and a sentence or two of explanation are enough.

1. Record complete parameters and results for every tool call, written as JSON Lines.
2. Measure elapsed time for each turn (from user submitting a prompt to turn ending).
3. When resuming a session, remind the user "you left an incomplete task last time."

<!-- rubric -->

**Grading criteria**

- Need 1 picks `PostToolUse`, matcher omitted or `"*"`, fields use payload's `tool_input` and `tool_response`; trap mentions "don't read the transcript file" and explains the reason is asynchronous writing, may lag.
- Need 1 gets bonus points if it additionally notes "`PostToolUse` only fires after successful execution; to cover failure cases pair with `PreToolUse`."
- Need 2 picks paired events from the per-turn cadence: `UserPromptSubmit` records start, `Stop` records end, and considers `StopFailure` as the exception exit; trap mentions "can't sum the execution milliseconds from `PostToolUse` payloads as turn elapsed time" and explains that number excludes permission wait and `PreToolUse` time.
- Need 3 picks `SessionStart`; trap mentions "`SessionStart` fires both for new sessions and resumed sessions" and provides a concrete method to distinguish the two.
- All three questions must answer all parts (event + fields + trap) to count as complete; tool-related needs (need 1) require one more part: matcher. Naming only the event doesn't count.

<!-- answer -->

**Need 1**

- Event `PostToolUse`: fires after tool executes successfully, input carries both `tool_input` and `tool_response`, one firing gives you one complete round-trip record without manual pairing.
- Matcher omitted or `"*"` — observability wants one-hook-records-all because you don't know in advance which tool will break.
- Fields: `tool_name`, `tool_input`, `tool_response`, plus session identifier and prompt id. Include prompt id because it matches the `prompt.id` on telemetry events, so you can join later.
- Trap: **don't read the transcript file path in the payload trying to "get fuller context."** The transcript is written asynchronously and may lag the in-memory conversation, so at the instant the hook fires it may not yet contain the current turn's most recent messages. You'll get intermittently incomplete records with no error signal.
- Addition: `PostToolUse`'s precondition is "successful execution." If you also care about "parameters generated but didn't run," add a wildcard `PreToolUse` to record parameters, then diff both sides to catch calls that never reached `PostToolUse`.

**Need 2**

- Events are a pair, both in the "once per turn" cadence: `UserPromptSubmit` writes start timestamp, `Stop` writes end timestamp and calculates diff. `StopFailure` should hang the same handler, otherwise abnormally ended turns never get an end timestamp and the start record hangs forever.
- These events aren't tool-scoped, no need for tool wildcard.
- Fields: write start to a temp file keyed by prompt id, end uses the same prompt id to retrieve and diff. Use prompt id not session identifier because one session has many turns.
- Trap: **don't sum the execution milliseconds field from `PostToolUse` payloads as turn elapsed time.** That field's definition is tool execution time, explicitly excludes time spent in permission prompts and `PreToolUse` hooks, and model request time isn't in there at all. Calculating this way will be systematically low; the more the workflow requires human confirmation, the larger the gap.

**Need 3**

- Events `SessionStart` (reminder timing) plus `SessionEnd` (record leftover state timing), both in the "once per session" cadence. Fields use session identifier to match "who left what."
- Trap: **`SessionStart` fires both when opening a new session and when resuming an existing session.** Remind unconditionally and every fresh session gets told "you have incomplete tasks," people will stop reading quickly.
- Distinction method (robust version not tied to any specific field name): have `SessionEnd` judge whether finishing left incomplete work, if yes write a snapshot file named after the session identifier; `SessionStart` does one thing — check whether a corresponding snapshot exists, only remind if found, delete after reading. Fresh sessions find no snapshot, naturally don't fire. This also solves another problem: the information needed to judge "incomplete" is most complete at session end.
- Related trap: a handler written as "`SessionStart` initializes a fresh empty log" will wipe the previous segment the first time it hits resume.

<!-- hint -->

Hint: first locate each need to a cadence. Ask yourself "how many times per session does this thing happen" — once per tool call? once per turn? once per session? Cadence fixed, event is mostly fixed.

<!-- hint -->

Hint: the three traps are buried in three details — the first relates to "when is the transcript file written"; the second relates to "what does that milliseconds field exclude"; the third relates to "what other time besides new session does this event fire." All three were explicitly stated in the first half of this lesson.

### Level 2: A case file, walk through the five steps

**Symptom**: user reports "the summary report it gave me references files that don't exist at all."

You filter by this prompt's prompt id and get this event digest (original prompt was "read the reports/ directory, summarize conclusions from this quarter's three weekly reports"):

```text
prompt.id = 8f2c1a94-...   (Event digest triggered by one user prompt, sorted by time;
                            input/response are tool_input/tool_response from hook payload, abbreviated for layout;
                            tool_decision has one entry per call, digest keeps only #3 to illustrate)

#1   user_prompt     prompt_length=27
#2   llm_request     dur=1840ms  stop_reason=tool_use
#3   tool_decision   tool=list_files   decision=allow (on allowlist, no human wait)
#4   tool_result     tool=list_files   input={"path":"reports/"}
                     response={"entries":[]}   success=true   dur=12ms
#5   llm_request     dur=2210ms  stop_reason=tool_use
#6   tool_result     tool=read_file    input={"path":"reports/2026-Q2-week03.md"}
                     success=false   error="ENOENT: no such file or directory"
#7   llm_request     dur=1990ms  stop_reason=tool_use
#8   tool_result     tool=read_file    input={"path":"reports/q2-summary.md"}
                     success=false   error="ENOENT: no such file or directory"
#9   llm_request     dur=2400ms  stop_reason=tool_use
#10  tool_result     tool=search_notes input={"query":"Q2 weekly report conclusions 2026"}
                     response={"hits":[3 unrelated old notes from this project]}   success=true
#11  llm_request     dur=5100ms  stop_reason=end_turn
#12  final response  "According to reports/2026-Q2-week03.md and reports/q2-summary.md
                     two weekly reports, this quarter..."
```

No need to write code. Answer four questions following the five-step workflow:

1. **Which event is the first divergence?** Point to the specific number and explain why the ones before it don't count and the ones after it are downstream.
2. **How to replay and observe?** Which input to use, what to watch.
3. **What does "repeatedly stress the same component" stress here?** Specify the object and the phenomenon to observe.
4. **Where to recover after fixing?** Specify the recovery point and why not re-run from #1.

<!-- rubric -->

**Grading criteria**

- First divergence points to **#5** (after agent gets empty directory it still generates a `read_file` call), or points to "the decision between #4 and #5" and notes the earliest observable evidence lands on #6's `tool_input`. Pointing only to #6 or #12 is judged as "pointed to downstream."
- Must explain **#4 doesn't count as divergence**: `list_files` returned `success=true`, 12ms, tool itself worked fine, what's wrong is the agent's processing of the empty result.
- Must explain **#6/#8/#10 are downstream**: one step failing changes the entire trajectory, these steps are cleaning up after #5's misjudgment.
- Replay answer must include two constraints: input uses identical prompts and tool definitions; observation is step-by-step, focusing on the model's first reaction after getting empty `entries`.
- "Repeatedly stress the same component" must point to `list_files` (empty result return shape and tool description), not vaguely say "run a few more times"; must provide stress dimensions (different path shapes) and phenomenon to watch (how model interprets empty result each time).
- Recovery point answers **after #4, before #5**, and gives reasoning for not re-running from #1: #1–#4 results are correct, re-running just burns tokens, and introduces fresh non-determinism, can't tell whether "worked this time" is because you fixed it right or got lucky.
- All four questions must be answered to count as complete. Answer contradicting the event sequence (e.g. saying `list_files` errored) judged as fail.

<!-- answer -->

**1. First divergence: #5.**

#4's `list_files` returned `{"entries": []}`, `success=true`, 12ms — this step the tool did its job, it honestly reported "no entries under this path." What starts to deviate is #5: after the agent gets an empty directory, correct behavior is to stop and tell the user "nothing under reports/, please confirm the path," but it generated a `read_file` call with parameter `reports/2026-Q2-week03.md`.

The earliest place you can see this divergence in the records is **#6's `tool_input`** — that path never appeared in any prior `tool_response`. This is a criterion you can mechanically check: can file names appearing in subsequent calls or reports be traced back to prior tool responses; if not, they came from nowhere.

Why the ones before don't count: #2 judging to list directory, reasonable; #3 is permission allow, no human wait; #4 tool normal. Why the ones after are downstream: #6 and #8's two ENOENTs, #9 switching to `search_notes`, #10 pulling back three unrelated old notes, #12 writing the made-up file names into the report — all of these continue pushing forward on the wrong premise from #5. Fixing #6 (like making the ENOENT message friendlier) doesn't solve the problem because #5 shouldn't have happened at all.

Which divergence category: not "called wrong tool," also not "tool errored," but **processed tool response incorrectly** — this kind is hardest to spot in monitoring because the step that broke is green in the logs.

**2. Replay and observe.**

Build a simulation using identical prompts and identical tool definitions, watching it work step-by-step. Two constraints can't loosen: input copied as-is, don't smooth it out "to make it clearer" or you're observing a different system; observation must be step-by-step, can't run to completion and only check the final report — the divergence step's information is all in the middle.

Watch what: **the model's first action after getting empty `entries`**. Fix #4's response as `{"entries": []}` and feed it back, watch whether it stops and reports empty directory or continues making things up. If behavior varies across multiple replays, it's probabilistic and you need step four to quantify the frequency. This step will likely also surface other issues — the `2026` in #10's query collides with the real case from official sources (needlessly appending year to search terms, biasing results), and the entire query is too verbose.

**3. Repeatedly stress `list_files`.**

The stressed object isn't the entire agent, it's this one tool's behavior at the boundary of empty results. Specifically two things:

- **Return shape**: `{"entries": []}` carries too little information for the model. The same empty can return more explicitly, like distinguishing "path exists but no entries" from "path doesn't exist," so the model knows which kind to report.
- **Tool description**: does it explain what an empty result means, what to do after getting an empty result.

Method is to use this tool dozens of times repeatedly, covering different path shapes: non-existent, exists-but-empty, has-content, insufficient-permissions, run many times for each kind, watch how the model interprets the return value each time, what percentage will make up file names. The meaning of dozens of times is right here — run three to five times, the "sometimes makes things up" bug might not appear once. This is how the official tool-testing agent was used.

If stress testing shows the model tends to try a different name after ENOENT, then `read_file`'s error message should also be changed together — error responses can be written as prompts, explicitly tell it "this path doesn't exist, please list directory first to confirm, don't guess file names," more useful than throwing an `ENOENT`.

**4. Recover after #4.**

Recovery point is **at the position where #4's `tool_result` has entered context but #5 hasn't happened yet**. Swap in the fixed return shape and description, take another step from here, see if it stops and reports empty directory this time.

Two reasons not to re-run from #1. One is waste: #1–#4's results are completely correct, re-running just lists the same directory again. Two is more critical — re-running puts non-determinism back in. The model might not even call `list_files` this time, then you can't judge whether "didn't make up file names this time" is because you fixed it right or because it happened to walk another path. Recovering after #4 locks the variable to the one step you want to verify.

<!-- hint -->

Hint: read this event segment backward and you'll first see two ENOENTs, easy to stop there. But ENOENT means "this file doesn't exist" — the question is, where did those two file names come from? Search backward in the event sequence for their source, the place you can't find a source is the divergence.

<!-- hint -->

Hint: notice #4's `success=true`. The tool didn't fail, it returned a correct empty result. So this case file's divergence type isn't "tool errored," but "agent misunderstood a correct result" — think through this point and question three about what to stress has direction: stress the thing that returns empty results, not the thing that errors.

<!-- /exercises -->
