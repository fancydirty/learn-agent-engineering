# Lesson 3: Structured Logs and Metrics: Turning Every Step into Data

> Learning goals:
> - Explain the four questions production observability must answer, and recognize that they're the same numbers as evaluation metrics, just used differently
> - Design structured logs for your harness: one record per model request, one per tool call, with fields covering duration, tokens, tool name, and errors
> - Map metric patterns to specific fixes using diagnostic reads, and spot when signals like "zero errors" are warped by how they're recorded
>
> Prerequisites: Completed Lessons 1 and 2, and have a working harness loop (Course 7 in this series) | Previous: [<< Lesson 2](./02-transcripts-as-evidence.md) | Next: [Lesson 4 >>](./04-tracing.md)

## One run you can read, two hundred you can't

At the end of Lesson 2, you did something worthwhile: read a raw transcript from start to finish and caught three problems the agent never mentioned. The method works, and the evidence is solid. The problem is, that was **one** run.

Now put the same agent in production: two hundred runs per day, each with a dozen loop iterations, adding up to two or three thousand tool call round-trips. Monday morning someone says "Friday afternoon's batch seemed especially slow," and how do you respond? Reading two hundred transcripts is obviously not realistic. Even if you did, you still couldn't answer where it was slow—that judgment requires looking at the distribution across runs, not reading one sample. Human eyes can answer "why did it do this in this particular run," but not "how did this batch differ from the last batch."

So this lesson's job fits in one sentence: **turn questions that require reading transcripts into questions a single query can answer.** The former is "why did it search for the same word repeatedly this time"; the latter is "which tool was called most in the past seven days, and are the errors all on the same parameter." The rule from Lesson 2 still stands—raw transcripts are first-hand evidence, the agent's self-report doesn't count. This lesson just stores the same evidence in a different format, so it can be read by people AND filtered, aggregated, and analyzed for distributions.

## Four questions production environments must answer

Official documentation lists four things you need to see clearly in production observability: **which tools were called, how long each model request took, how many tokens were spent, and where failures occurred**[^S6]. When making design decisions, you'll return to these four questions repeatedly: does this field help answer one of them? If not, it's noise.

This might look familiar. Course 10 in this series used the same set of numbers when discussing evaluation: beyond final-state accuracy, it recommended collecting runtime for individual tool calls and whole tasks, total tool call count, total token consumption, and tool errors[^S3]. Same metrics, two appearances, different uses:

| This number | Course 10: on the evaluation track | This lesson: in daily monitoring |
| --- | --- | --- |
| Runtime for individual tool calls and whole tasks | Did the change make the task slower | Which time window slowed down today, and is it the model or the tools |
| Total tool call count | Which version of the prompt takes fewer detours | Spot new repetitive calling patterns that appeared in production |
| Total token consumption | Calculate the cost of running the full evaluation | Watch daily spend, find the sessions eating tokens |
| Tool errors | Did the change introduce new failures | See which tool is flaky, and which parameter it's failing on |

The difference isn't in the numbers—it's in **what you compare them to**. In evaluation, you compare "before the change vs after the change" against a fixed test set, so the numbers need to be reproducible. In monitoring, you compare "today vs the past seven days" or "this session vs other sessions," so the reference is the runs' own history, which means the numbers need to be continuous, timestamped, and sliceable by dimension. This lesson covers the latter.

## Structured logs: one record per step

> This section describes an engineering practice. There's no authoritative guidance on how to name log fields or which format to write to disk—what follows is a working default starting point, not an official spec. Field names borrow terms that actually appear in official materials (session id, prompt id, tool name, `tool_input`, `tool_response`, `duration_ms`, token counts, `error`), so when you later integrate with official telemetry, you won't need to remap the vocabulary.

### Recording unit: one for model request, one for tool call

The agent loop naturally has two kinds of "step": one model request, one tool execution. They have very different attributes—model requests have token counts but no tool name; tool executions are the reverse—but they share the same batch of context fields (which session, which prompt, how long).

So: **write one record per model request, one per tool call**, and use a `type` field to distinguish them. Don't compress a whole loop iteration into one record—that way you can never calculate the split between model time and tool time. Don't write only one summary record when the task finishes either—if the task stalls midway, you won't even know which step it stalled on.

### Format: JSON Lines, one object per line

JSON Lines (commonly written JSONL) is exactly what it sounds like: one file, each line is a complete JSON object, no commas between lines and no outer array wrapper.

```json
{"ts":"2026-08-26T09:12:03.118Z","type":"model_call","session_id":"s-4f1","prompt_id":"p-01","duration_ms":1840,"input_tokens":2310,"output_tokens":180}
{"ts":"2026-08-26T09:12:05.002Z","type":"tool_call","session_id":"s-4f1","prompt_id":"p-01","tool":"search_docs","duration_ms":412}
```

The reasons for choosing it are all mundane but all valid: append-only writes work without needing to go back and add a `]` at the end of the file, so even if the process gets killed, you don't end up with a syntactically broken file (the last line might be half-written, but all the lines before it can still be parsed—this is also the real-world origin of the exercise requirement that "bad lines are reported but don't halt processing"). When the file grows to hundreds of megabytes, you can stream-process it line by line. Each line is self-contained, so `grep` can filter, `jq` can process, and human eyes can read.

Compare this to the prose logs many harnesses already have—`[09:12:05] search_docs returned 3 results, took 412ms`. Reads nicely, but it can only be read by humans. To answer "what's the average `search_docs` duration over the past seven days," you'd need to write regex to extract that `412ms`; if someone changes "took" to "elapsed," the regex silently starts returning zero. Prose logs encode structure into natural language, and natural language is for humans to decode. Structured logs reverse it: structure sits in fields, and machines read it unambiguously. **Can be filtered, aggregated, analyzed for distributions**—these three abilities are what you actually need when moving from one run to two hundred.

### Field vocabulary

Context that goes on every record: `ts` (ISO 8601 timestamp with milliseconds and timezone), `type` (`model_call` or `tool_call`), `session_id` (identifier for one session, stays constant across multiple turns), `prompt_id` (identifier for one user prompt; all model requests and tool calls it triggers share this value), `duration_ms`. Model requests add `model`, `stop_reason`, `input_tokens` / `output_tokens`. Tool calls add `tool`, `tool_use_id` (for pairing with responses), `error` (only present when it fails).

`prompt_id` is the least conspicuous field here but becomes the most useful later. Right now you're just writing it into every record; Lesson 4 will use it to circle scattered records into "events from the same prompt," then thread them into a tree via parent-child relationships. As for the tool's input and return value themselves (`tool_input` / `tool_response`)—**don't write the full text by default**; only record length or byte count. The rationale comes in the second-to-last section.

### Integrating into the harness

The snippet below builds on the `stop_reason`-driven loop from Course 7 in this series. First, the logger:

```javascript
// logger.mjs
import { appendFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';

const LOG_PATH = process.env.AGENT_LOG ?? './agent.jsonl';

export function createLogger({ sessionId = randomUUID() } = {}) {
  let promptId = null;
  return {
    startPrompt() {
      promptId = randomUUID();
      return promptId;
    },
    logRecord(fields) {
      const line = JSON.stringify({
        ts: new Date().toISOString(),
        session_id: sessionId,
        prompt_id: promptId,
        ...fields,
      });
      appendFileSync(LOG_PATH, line + '\n');
    },
  };
}
```

`logRecord()` does one thing: merge the common context with the caller's fields into one line of JSON and append it to the file. It doesn't judge, doesn't format, doesn't do anything "smart"—the dumber the logger, the better, because when it breaks you have no logs to check. Then the two instrumentation points in the loop:

```javascript
// loop.mjs
import { createLogger } from './logger.mjs';

// The logger's lifecycle is "one session," not "one turn": create it once when
// the session starts, then for each prompt just call startPrompt() to get a new
// prompt_id—session_id stays constant across turns, which is exactly how it
// originates. Don't move createLogger() inside runTurn or every turn becomes a
// new session, making session_id a duplicate of prompt_id.
const log = createLogger();

export async function runTurn({ client, model, tools, runTool, userInput }) {
  log.startPrompt();
  const messages = [{ role: 'user', content: userInput }];

  while (true) {
    // Instrumentation point one: each model request
    const t0 = Date.now();
    const response = await client.messages.create({ model, max_tokens: 2048, tools, messages });
    log.logRecord({
      type: 'model_call',
      model,
      stop_reason: response.stop_reason,
      duration_ms: Date.now() - t0,
      input_tokens: response.usage.input_tokens,
      output_tokens: response.usage.output_tokens,
    });

    if (response.stop_reason !== 'tool_use') return response;
    messages.push({ role: 'assistant', content: response.content });
    const results = [];

    for (const block of response.content.filter((b) => b.type === 'tool_use')) {
      // Instrumentation point two: each tool call
      const t1 = Date.now();
      let output;
      let error = null;
      try {
        output = await runTool(block.name, block.input);
      } catch (e) {
        error = e.message;
        output = `Tool execution failed: ${e.message}`;
      }
      log.logRecord({
        type: 'tool_call',
        tool: block.name,
        tool_use_id: block.id,
        duration_ms: Date.now() - t1,
        input_bytes: Buffer.byteLength(JSON.stringify(block.input), 'utf8'),
        output_bytes: Buffer.byteLength(String(output), 'utf8'),
        ...(error ? { error } : {}),
      });
      results.push({ type: 'tool_result', tool_use_id: block.id, content: String(output) });
    }

    messages.push({ role: 'user', content: results });
  }
}
```

Two details worth calling out.

**Where you start and stop the timer determines what this number means.** `t1` starts before `runTool` and stops after it returns, so `duration_ms` includes the tool's own retries, backoff waits, and network round-trips, but not pre-call parameter validation. You define this boundary yourself; once defined, write it down—six months from now, when you're staring at a 30-second `duration_ms`, you'll need to know whether it includes retries.

**Errors go into both log and model context.** The `catch` block stuffs the error message back into `tool_result`, so the agent sees it on the next turn. The official guidance fits perfectly here: when a tool call raises an error, the response should be prompt-engineered to clearly communicate specific and actionable improvements, not an opaque error code or traceback[^S3]. You can write `ETIMEDOUT` in the log, but what goes back to the model should be "Request timed out (30 seconds). This endpoint tends to time out on broad-range queries; try narrowing `date_range` to 7 days or less."

## Reading metrics diagnostically

A metric's value isn't in "today we made 1,283 tool calls" as a number—it's in **certain patterns pointing to certain fixes**. The official correlations are all leads worth verifying first:

**Many redundant calls → pagination or token limit parameters might need tuning.** Lots of redundant tool calls might suggest some rightsizing of pagination or token limit parameters is warranted[^S3]. The model needs to find a passage in the docs, your `search_docs` returns only 5 results per page, so it has to flip through 28 pages. Each of those 28 calls is legal, each succeeds, metrics show no "error," but they're all waste. Bump results-per-page to 25 and this pattern vanishes.

**Many invalid-parameter errors → tool description probably needs clarity or examples.** Lots of tool errors for invalid parameters might suggest tools could use clearer descriptions or better examples[^S3]. This one is powerful when errors cluster on **the same parameter**: seven errors all saying `invalid parameter: date_range` means you should first check whether your description explains what format this parameter expects. The direction of investigation is the tool description, not the model.

**Tracking tool calls reveals other things.** Tracking tool calls can help reveal common workflows that agents pursue and offer some opportunities for tools to consolidate[^S3]. For instance, if 90% of `read_file` calls are followed by `parse_config`, maybe you should provide a one-step `read_config`. This kind of discovery never emerges from any single run—only from aggregates. Another set of useful reads: analyze your tool calling metrics to identify the most frequently used tools, tool success rates, average tool execution times, and error patterns by tool type[^S4].

Some problems are inherently magnitude problems—you can't say "where is the many" without looking at aggregates. Anthropic documented early issues like this: scouring the web endlessly for nonexistent sources[^S1]—looking at any single search won't flag an error; you need to line up dozens of calls to see "it's spinning in place."

One general experience (no authoritative source): average duration almost always lies. 99 calls at 80ms plus 1 call at 30 seconds averages to 379ms, which looks a bit slow but okay; reality is 99 fast calls plus one completely stalled. When reading duration, look at median and high percentiles at minimum, or go straight to the slowest few records.

## The trap in reading numbers: what is your signal actually counting

The easiest way for a metric to lie isn't by counting wrong—it's when **what it counts isn't what you think it counts**.

Look at a real product design. Claude Code retries failed API requests internally and emits a single `api_error` event only after it gives up—this event is the **terminal signal** for that request; intermediate retry attempts are not logged as separate events[^S4]. This design makes sense: if every retry logged an error, the error graph would be flooded by transient hiccups that auto-recovery handled, obscuring how many requests actually failed. The cost is you have to remember this semantic—"3 api_error events today" means "3 requests ultimately failed," not "3 network hiccups," and it says nothing about how many successful retries are hiding underneath.

The same documentation page offers a very practical read: to distinguish whether a session **recovered from an error** or **stalled completely**, group events by session id and check whether a later API request event exists after the error[^S4]. If there's a follow-up, it kept going; if not, it stopped there. This judgment takes one grouping plus one "scan for whether there are records after the error" check, extremely high value-for-effort—the Level 2 exercise has you write exactly this. (JSONL written by append is naturally time-ordered, so you don't need explicit sorting within a single file; when logs come from multiple processes, sort by `ts` first.)

```agentmentor-check
{
  "id": "obs-zh-03-error-count-lies",
  "label": "What does 'zero errors' actually tell you",
  "prompt": "The dashboard shows zero tool errors today. A coworker glances at it and says, 'All runs are healthy today.' Your harness silently retries tool call failures up to three times, and only writes an error record when all three attempts fail. What's the main problem with this conclusion?",
  "whyHere": "You just learned to turn every step into a record; the next skill to practice is asking the reverse: what did this number actually record, and what did it leave out. Metrics usually lie not because the math is wrong, but because the recording method defines a semantic that nobody wrote down.",
  "mode": "single",
  "choices": [
    {
      "id": "a",
      "text": "No problem—zero errors really does mean the tool layer is healthy. Retries are internal details the tool absorbs; if no error was recorded, that means everything ultimately succeeded. If something went wrong today, it can only be in the model's judgment.",
      "correct": false,
      "feedback": "'Not in the record' doesn't mean 'didn't happen'—this is the metric version of Lesson 2's rule. Your retry logic determines what conditions a failure must meet to be written down; the tool layer could easily have been flaky all day, with every hiccup quietly caught by the second or third retry."
    },
    {
      "id": "b",
      "text": "This metric counts 'all three retries failed,' not 'call failed.' Today could have had lots of calls fail once or twice then succeed on retry, and the error count stays zero. The real clue is in duration—retries will push those calls' duration_ms to two or three times normal.",
      "correct": true,
      "feedback": "Right. A signal's semantic is defined by how it's recorded, regardless of what the metric is named. This design itself is fine—Claude Code does the same thing: internally retries failed API requests and only emits an api_error event when it gives up, with intermediate retries not logged separately. The key is knowing what your number counts, then looking for the clue this signal doesn't cover—in this case, that's the overall lift in the duration distribution."
    },
    {
      "id": "c",
      "text": "The problem is using an absolute number. Switch the dashboard to error rate (errors ÷ call count) with a seven-day moving average as reference—proportion plus trend is what reflects true health.",
      "correct": false,
      "feedback": "Changing the denominator doesn't fix a numerator that semantically excludes retries—0 divided by anything is still 0. Error rate is itself a useful metric, but it doesn't rescue a signal whose semantic never covered retries in the first place. What needs changing here is the recording method (log each retry attempt with an attempt sequence number), not the formula."
    }
  ]
}
```

From this trap you can extract a general practice: **write one sentence for each metric saying 'it counts what.'** Write it in code comments or field documentation. "Tool error count = one count after all retries fail" and "= one count per exception thrown" are two completely different metrics, but the name can be identical, and someone reading the dashboard six months from now can't tell from the number alone.

## Cost and tokens: the one number most worth watching

If you could only watch one number, watch tokens.

First, the magnitude. In Anthropic's data, agents typically use about 4× more tokens than chat interactions, and multi-agent systems use about 15× more tokens than chats[^S1]. This is their observation on their own systems, not a universal constant, but it sets an expectation: when you convert a chat feature into an agent, the bill won't go up "a little bit." They have another statistical observation: token usage by itself explains 80% of the variance, with the number of tool calls and the model choice as the two other explanatory factors[^S1]—this comes from their paragraph analyzing evaluation performance, meaning "which quantities best explain differences between runs," and tokens rank first. Read both together: tokens are both the biggest part of the bill and the top explanatory factor for run-to-run variance, so among candidate metrics it's the one most worth watching first.

Two practical notes. **Cost numbers are approximations**: the official docs say cost metrics are approximations; for official billing data, refer to your API provider[^S4]. So their use is "spot anomalies, compare trends," not "reconcile with finance." **Attribution needs slicing by dimension**: usage metrics can be used to track trends across teams or individuals, identify high-usage sessions, and also attribute spend to specific things like skill name, plugin name, or subagent type[^S4]. The implication for self-built harnesses is direct—write those dimensions into log records from the start, don't try to join them later; joining dimensions after the fact is basically a re-run. Also, copy token counts directly from the model response's `usage` field; don't estimate using character count divided by 4 or similar methods—those are noticeably off in multilingual, code-heavy, or image-heavy scenarios.

## Restraint: don't invent thresholds, don't log full content

Once you have metrics, the natural next impulse is to set alerts: error rate exceeds 5%, alert; high-percentile duration exceeds 10 seconds, alert.

Stop. **This lesson gives no threshold numbers, because there are none in authoritative materials.** Official docs mention that alerting is something someone should do, but they've never given any specific values—error budgets, SLO targets, alert thresholds, not a single number. If I wrote "recommend 5%" here, that's me making it up, and you'd use it. Thresholds can only grow from your own baseline: record two weeks of data first, see the range of normal fluctuation, then define what counts as abnormal. Reverse the order and you get a rule that false-alarms three times a day and gets muted by everyone after two weeks.

The division of responsibility is also worth copying from official products: Claude Code emits the raw event stream only; anomaly detection, baselining, correlation across sessions, and alerting are the responsibility of your SIEM or observability backend[^S4]. For self-built harnesses this means: **the observed system doesn't make judgments itself.** Don't write "after 3 consecutive tool errors, send email" into the harness—that logic gets deployed with the agent, restarted with the agent, and breaks with the agent, and it has no historical data to compare against.

One last thing, also the easiest to turn into an incident three months after launch: **don't log content by default.** Claude Code doesn't collect user prompt content by default—only prompt length; to include content you must explicitly set an environment variable[^S4]. The Agent SDK's telemetry is similarly structure-first—every span records duration, model name, tool name; token counts are recorded when the API returns usage data, but the content your agent reads and writes is not recorded by default[^S6].

These two defaults reflect the same judgment: structural information (who, when, how long, which tool, how many tokens) is enough to answer the vast majority of ops questions; content is not. Once content enters logs, it follows logs into backups, into long-term storage, into the view of anyone with read permissions. So your harness should default to recording `input_bytes: 137` rather than `tool_input: {...}`; when you really need to troubleshoot the exact parameters of a specific call, turn on full recording for that one instance. This doesn't conflict with Lesson 2's "raw transcripts are first-hand evidence": when debugging you absolutely should see the full round-trip, in an environment you control, for a specific run, and you're done after reading it. Production logs default to long-term retention and multi-person visibility—that's a different thing.

## Boundaries: where this lesson stops

At this point you have a pile of structured records and a set of readable metrics. Three things this lesson doesn't do: threading parent-child relationships between records (which model requests did one prompt trigger, which tool call nests under which subagent) requires correlation IDs to build a tree—that's Lesson 4. Hooking probes into lifecycle checkpoints without modifying harness code is Lesson 5's hooks. Mounting this entire layer onto your Course 7 harness and walking through a complete debugging drill is Lesson 6.

## 💻 Exercises

<!-- exercises -->

### Level 1: Read three kinds of problems from one metrics table

No code needed. Below is a metrics summary for five tasks your agent ran yesterday:

| Task | Total time | Tool call count | Total tokens | Tool error count |
| --- | --- | --- | --- | --- |
| T1 Fix a failing test | 42s | 9 | 38,400 | 0 |
| T2 Find API usage in docs | 186s | 41 | 214,000 | 0 |
| T3 Generate a weekly report | 71s | 12 | 44,900 | 7 |
| T4 Refactor a module | 402s | 16 | 806,000 | 1 |
| T5 Answer a config question | 55s | 8 | 31,200 | 0 |

Additional context pulled from logs:

- T2's 41 calls include 28 calls to `search_docs`, with only the `offset` parameter changing: 0, 20, 40, 60…
- T3's 7 errors all came from `search_issues`, with identical error text: `invalid parameter: date_range`
- T4's 16 calls include 4 `read_file` calls reading the same 3,000-line file; the 1 error is `run_tests` timing out
- T1 and T5 show no repeated calls to the same tool

Answer three questions, stating which number (or context detail) you relied on for each: which pattern points to "pagination or token limit parameters need tuning"? Which points to "tool description needs clarity or examples"? Which token value is worth investigating first, and why is it that one rather than the second-highest total? Plus one true/false: does T4's 1 error constitute a signal that "tool description needs fixing"?

<!-- rubric -->

**Grading criteria**

- Question 1 answers T2, based on "same tool called 28 times with only offset changing" as a redundant call pattern, corresponding to pagination size / token limit parameters needing adjustment. Answering "highest call count" alone isn't enough—high count itself isn't the problem, repetition is.
- Question 2 answers T3, based on 7 errors all clustering on the same tool and same parameter, which is invalid-parameter errors, corresponding to tool description needs clarity or examples.
- Question 3 answers T4, and the reasoning must be **tokens per call** (806,000 ÷ 16 = 50,375), not total tokens. Must explain that while T2 has the second-highest total, per-call it's only about 5,200, in the same range as the others; T4 is an order of magnitude higher.
- True/false answers "false": a single error isn't a pattern; official guidance says "**lots of** invalid-parameter errors" points to tool description; besides, this one is execution timeout, not invalid parameters.
- Throughout, doesn't treat 5 samples as statistical conclusions: no percentages, no claims about "overall production." Spotting a pattern and proving a distribution are two different things.

<!-- answer -->

**Reference answer**

**1. Pagination / token limit parameters: T2.** The basis isn't "41 calls is the most," but that 28 of those 41 are the same tool with only `offset` incrementing. The agent is flipping page by page because one page doesn't give it enough to make a decision. Official read on this pattern—lots of redundant tool calls might suggest some rightsizing of pagination or token limit parameters is warranted[^S3]. Fix: bump `search_docs` results-per-page from 20 to 60 or 100, or add a `max_results` parameter letting the agent request enough at once; re-run the same task after the change and see how many of those 28 calls compress down. Worth noting, a big chunk of that 214,000 tokens came from these 28 paginated results repeatedly entering context—redundant calls and token consumption are often two faces of the same problem.

**2. Tool description / add examples: T3.** The basis is the error distribution: not scattered across tools, but all landing on `search_issues`'s `date_range` parameter, with identical error text. This is the classic shape of invalid-parameter errors; official guidance gives the corresponding fix as making tool descriptions clearer and adding examples[^S3]. Two-step fix: in the parameter description, specify what format `date_range` expects and give a copy-pasteable example; simultaneously rewrite the error response itself—don't return `invalid parameter: date_range`, return "`date_range` requires `YYYY-MM-DD/YYYY-MM-DD` format, for example `2026-08-01/2026-08-26`; you passed `last week`." When a tool call raises an error, the response should clearly communicate specific and actionable improvements, not an opaque error code[^S3].

**3. Investigate tokens first: T4.** Not because it has the highest total (though it does), but because **tokens per call** is absurdly out-of-range: T1 about 4,300, T2 about 5,200, T3 about 3,700, T5 is 3,900—four tasks clustered in one tier; T4 is 806,000 ÷ 16 = 50,375, an order of magnitude higher. Harder tasks usually show up as more calls (like T2), not each call costing ten times as much. The suspect is obvious: 4 `read_file` calls reading the same 3,000-line file—each read pulls in a complete copy, and each copy stays in context participating in every subsequent model request. Verification is simple: check whether the `input_tokens` in T4's `model_call` records jump in steps after certain turns.

Why investigate it **first**: four tasks have per-call tokens clustered in 3,700–5,200, T4 is 50,375—off by an order of magnitude. That alone is enough to open a case. Outlier magnitude needs no other justification.

**True/false: false.** One error isn't a pattern. Official guidance says "**lots of** invalid-parameter errors" point to tool description[^S3]—one occurrence just means it happened once. And this one isn't even a parameter problem—`run_tests` timing out is an execution-layer issue (tests really do run long, or the timeout is set too tight), unrelated to whether the tool description is clear. Note it and move on; wait for it to become a pattern.

**About this table itself**: five data points let you spot a pattern, not calculate proportions. "20% of today's tasks had errors" means nothing when stated from 5 samples—swap in five different tasks and this number can be 0% or 60%. To prove a distribution, scale up the sample; these five tell you where to dig.

<!-- hint -->

**Hint 1**: The three questions correspond to three different reads; don't fixate on "which number is biggest." Question 1 looks for "is the same thing being repeated," question 2 looks for "are errors scattered or clustered," question 3 looks for "does this number divided by another number still look normal." The four columns can be divided pairwise—try which ratios are interesting.

<!-- hint -->

**Hint 2**: Question 3's trap is in the phrase "rather than the second-highest total." Divide each task's tokens by its call count, line up the five ratios, and you'll see four clumped together and one flying off—that's your answer. Also don't forget the true/false: "7 identical errors" and "1 error" aren't the same evidentiary strength.

### Level 2: Write a log aggregation script

This one requires code that actually runs. Below is a segment of JSONL log from your harness (20 records, 4 prompts, 2 sessions). Save it as `agent.jsonl`:

```json
{"ts":"2026-08-26T09:12:03.118Z","type":"model_call","session_id":"s-4f1","prompt_id":"p-01","duration_ms":1840,"input_tokens":2310,"output_tokens":180}
{"ts":"2026-08-26T09:12:05.002Z","type":"tool_call","session_id":"s-4f1","prompt_id":"p-01","tool":"search_docs","duration_ms":412}
{"ts":"2026-08-26T09:12:05.460Z","type":"model_call","session_id":"s-4f1","prompt_id":"p-01","duration_ms":2260,"input_tokens":3480,"output_tokens":210}
{"ts":"2026-08-26T09:12:07.780Z","type":"tool_call","session_id":"s-4f1","prompt_id":"p-01","tool":"read_file","duration_ms":86}
{"ts":"2026-08-26T09:12:07.900Z","type":"model_call","session_id":"s-4f1","prompt_id":"p-01","duration_ms":1970,"input_tokens":4120,"output_tokens":330}
{"ts":"2026-08-26T09:18:41.004Z","type":"model_call","session_id":"s-4f1","prompt_id":"p-02","duration_ms":2010,"input_tokens":2280,"output_tokens":160}
{"ts":"2026-08-26T09:18:43.060Z","type":"tool_call","session_id":"s-4f1","prompt_id":"p-02","tool":"search_docs","duration_ms":455}
{"ts":"2026-08-26T09:18:43.560Z","type":"tool_call","session_id":"s-4f1","prompt_id":"p-02","tool":"search_docs","duration_ms":448}
{"ts":"2026-08-26T09:18:44.050Z","type":"tool_call","session_id":"s-4f1","prompt_id":"p-02","tool":"search_docs","duration_ms":437}
{"ts":"2026-08-26T09:18:44.530Z","type":"model_call","session_id":"s-4f1","prompt_id":"p-02","duration_ms":3120,"input_tokens":9640,"output_tokens":240}
{"ts":"2026-08-26T09:18:47.700Z","type":"tool_call","session_id":"s-4f1","prompt_id":"p-02","tool":"read_file","duration_ms":91}
{"ts":"2026-08-26T09:18:47.840Z","type":"model_call","session_id":"s-4f1","prompt_id":"p-02","duration_ms":2450,"input_tokens":11200,"output_tokens":420}
{"ts":"2026-08-26T10:02:11.220Z","type":"model_call","session_id":"s-9c7","prompt_id":"p-03","duration_ms":1760,"input_tokens":2260,"output_tokens":140}
{"ts":"2026-08-26T10:02:13.030Z","type":"tool_call","session_id":"s-9c7","prompt_id":"p-03","tool":"fetch_url","duration_ms":30150,"error":"ETIMEDOUT"}
{"ts":"2026-08-26T11:31:52.410Z","type":"model_call","session_id":"s-9c7","prompt_id":"p-04","duration_ms":2130,"input_tokens":2340,"output_tokens":170}
{"ts":"2026-08-26T11:31:54.600Z","type":"tool_call","session_id":"s-9c7","prompt_id":"p-04","tool":"run_tests","duration_ms":8420}
{"ts":"2026-08-26T11:32:03.080Z","type":"model_call","session_id":"s-9c7","prompt_id":"p-04","duration_ms":2890,"input_tokens":6180,"output_tokens":520}
{"ts":"2026-08-26T11:32:06.030Z","type":"tool_call","session_id":"s-9c7","prompt_id":"p-04","tool":"write_file","duration_ms":74}
{"ts":"2026-08-26T11:32:06.150Z","type":"tool_call","session_id":"s-9c7","prompt_id":"p-04","tool":"run_tests","duration_ms":7960}
{"ts":"2026-08-26T11:32:14.170Z","type":"model_call","session_id":"s-9c7","prompt_id":"p-04","duration_ms":2040,"input_tokens":7050,"output_tokens":260}
```

Write a `stats.mjs` that runs with `node stats.mjs agent.jsonl` and does four things: read JSONL (one object per line, skip empty lines, catch and report bad lines but don't halt); aggregate by `type` to produce count, total duration, total tokens, error count; group by `prompt_id` to find runs where "error exists and no subsequent records follow" and print their `prompt_id`, `session_id`, and error message; exit code 1 means suspected stall detected, 0 means none (so it can plug into CI or cron). Use only Node standard library, no dependencies.

<!-- rubric -->

**Grading criteria**

- Script actually runs, `node stats.mjs agent.jsonl` produces output without throwing; empty lines are skipped, single-line parse failures are caught, reported, and processing continues on remaining lines.
- Aggregates by `type` into two groups, four numbers all correct: `model_call` 10 records, total duration 22,470ms, total tokens 53,490, errors 0; `tool_call` 10 records, total duration 48,533ms, total tokens 0, errors 1. Missing fields (tool records have no token fields) are treated as 0, not `NaN`.
- Stall detection logic is "the last record in that `prompt_id` group has `error`," not "the group contains error." Only finds `p-03`.
- When suspected stall is detected, `process.exit(1)` (or equivalent) takes effect; running on this data followed by `echo $?` must return 1.
- Groups by `prompt_id`, not `session_id`: session `s-9c7` contains two prompts p-03 and p-04; grouping by session would make p-04's records appear as "follow-up" to p-03's error, missing the stall.

<!-- answer -->

**Reference answer**

```javascript
// stats.mjs
import { readFileSync } from 'node:fs';

const file = process.argv[2] ?? 'agent.jsonl';

// One JSON per line, skip empty lines, report bad lines but don't halt
const records = readFileSync(file, 'utf8')
  .split('\n')
  .filter((line) => line.trim() !== '')
  .map((line, i) => {
    try {
      return JSON.parse(line);
    } catch {
      console.error(`Record ${i + 1} is not valid JSON, skipped`);
      return null;
    }
  })
  .filter((r) => r !== null);

// 1. Aggregate by record type: count / total duration / total tokens / error count
const byType = new Map();
for (const r of records) {
  const acc = byType.get(r.type) ?? { count: 0, ms: 0, tokens: 0, errors: 0 };
  acc.count += 1;
  acc.ms += r.duration_ms ?? 0;
  acc.tokens += (r.input_tokens ?? 0) + (r.output_tokens ?? 0);
  if (r.error) acc.errors += 1;
  byType.set(r.type, acc);
}

console.log('=== By type ===');
for (const [type, acc] of byType) {
  console.log(
    `${type.padEnd(11)} count=${String(acc.count).padStart(3)}` +
      ` total_ms=${String(acc.ms).padStart(7)}ms` +
      ` total_tokens=${String(acc.tokens).padStart(7)}` +
      ` errors=${acc.errors}`,
  );
}

// 2. Group by prompt_id, find "error exists and no subsequent records follow"
const byPrompt = new Map();
records.forEach((r, i) => {
  if (!byPrompt.has(r.prompt_id)) byPrompt.set(r.prompt_id, []);
  byPrompt.get(r.prompt_id).push({ ...r, seq: i + 1 });
});

const stalled = [];
for (const [promptId, group] of byPrompt) {
  const lastErrorAt = group.findLastIndex((r) => r.error);
  if (lastErrorAt === -1) continue; // This prompt had no errors at all
  if (lastErrorAt === group.length - 1) {
    // Error is the last record in this prompt: no subsequent action, suspected stall
    const last = group[lastErrorAt];
    stalled.push({ promptId, sessionId: last.session_id, error: last.error, seq: last.seq });
  }
}

console.log('\n=== Suspected stalls (error with no subsequent records) ===');
if (stalled.length === 0) {
  console.log('None');
} else {
  for (const s of stalled) {
    console.log(`prompt_id=${s.promptId} session_id=${s.sessionId} error=${s.error} (record ${s.seq})`);
  }
}

console.log(`\nTotal ${records.length} records, ${byPrompt.size} prompts, suspected stalls ${stalled.length}`);
process.exit(stalled.length > 0 ? 1 : 0);
```

Running on Node v26 produces this (actual output):

```text
$ node stats.mjs agent.jsonl
=== By type ===
model_call  count= 10 total_ms=  22470ms total_tokens=  53490 errors=0
tool_call   count= 10 total_ms=  48533ms total_tokens=      0 errors=1

=== Suspected stalls (error with no subsequent records) ===
prompt_id=p-03 session_id=s-9c7 error=ETIMEDOUT (record 14)

Total 20 records, 4 prompts, suspected stalls 1

$ echo $?
1
```

**Why group by `prompt_id` not `session_id`.** Official guidance says group by session id and check whether there's a subsequent request event after the error[^S4], because in that context the session is the correlation unit. Applied to this data, session `s-9c7` contains two prompts: p-03 errored and stalled at 10:02, p-04 is a completely new prompt launched an hour and a half later. Grouping by session would make p-04's records look like "follow-up action" after p-03's error, missing the stall. Which id you group by depends on the boundary of the question you're asking—here the question is "did this prompt finish," so the boundary is the prompt.

**`findLastIndex` is key.** The condition must be "last record has error," not "exists error." Writing `group.some(r => r.error)` would flag runs that errored then recovered and continued—exactly the two cases this read is meant to distinguish. Also handle missing fields with `?? 0` everywhere: tool records have no token fields, model records have no `error`; without catching them, `undefined + number` yields `NaN`, which contaminates the entire aggregation column without throwing.

**Build a counter-example to confirm detection actually splits the two cases.** Copy the data, insert one p-03 `model_call` record after line 14 (simulating "agent continued after error"), run again—output becomes "None / Total 21 records, 4 prompts, suspected stalls 0," exit code 0. Don't skip this step—a check script that always returns 0 is the same as no check script. With 0/1 working, the script can plug into cron, CI, or any "non-zero triggers alert" system; note it only emits the raw signal—the observed system only emits raw signals; anomaly detection and alerting are the backend's job[^S4].

<!-- hint -->

**Hint 1**: Build in four steps, run after each to check output. First just "read in, `JSON.parse`, print count"—confirm it's 20. Then add type aggregation using a `Map` to hold accumulators, `?? 0` on every missing field. Then do grouping and stall detection. Only add `process.exit` last. Writing the whole script at once means when something breaks you can't tell whether parsing failed or aggregation failed.

<!-- hint -->

**Hint 2**: Stall detection core is one sentence—**is the last record in this prompt the one with `error`**. `findLastIndex` returns the index of the last match; compare it to `group.length - 1` and you have the answer. Especially note grouping uses `prompt_id`: session `s-9c7` contains two prompts; grouping by `session_id` would let the second prompt's records "cover up" the first prompt's stall. After writing, remember to `echo $?` to check exit code—screen output alone doesn't count as verification.

<!-- /exercises -->

## Recap

- Production observability must answer four questions: which tools were called, how long each model request took, how many tokens were spent, and where failures occurred[^S6]. These four and the evaluation metrics from Course 10 in this series (runtime for individual tool calls and whole tasks, total tool call count, total token consumption, tool errors)[^S3] are the same set of numbers—in evaluation you use them to judge whether a change improved things; in monitoring you use them to watch run health.
- Log field design and JSONL selection have no authoritative spec—it's your engineering decision. Default starting point: one record per model request, one per tool call, one JSON object per line, with session id, prompt id, duration, token counts, tool name, and errors. Prose logs can only be read by humans; structured ones can be filtered, aggregated, and analyzed for distributions.
- Metrics' value lies in patterns mapping directly to fixes: lots of redundant calls means pagination or token limit parameters need tuning; lots of invalid-parameter errors mean tool descriptions need clarity or examples[^S3]. Tracking tool calls also reveals common agent workflows and opportunities to consolidate tools[^S3]. When a tool call raises an error, the response itself should be written as specific, actionable guidance, not an opaque error code[^S3].
- A signal's semantic is defined by how it's recorded. Claude Code internally retries failed API requests and emits a single `api_error` event only after giving up—it's a terminal signal for that request; intermediate retries aren't logged separately[^S4]—so one "error count" can hide many invisible retries underneath. To distinguish whether a session recovered or stalled, group events by session id and check whether a later request event exists after the error[^S4].
- Tokens are the single metric most worth watching: in Anthropic's data, agents use about 4× the tokens of chat, multi-agent systems about 15×[^S1]. When analyzing evaluation performance, they found token usage by itself explains 80% of the variance, with tool call count and model choice as the two other explanatory factors[^S1]. Cost metrics are approximations; official billing comes from your API provider[^S4]. Spend can be attributed to specific things like skill name, plugin name, or subagent type[^S4].
- Two restraint principles: the observed system only emits the raw event stream; anomaly detection, baselining, and alerting are the backend's responsibility[^S4]. Logs shouldn't record content by default—official products default to not collecting prompt content, only length[^S4]; telemetry defaults to recording only structural information, not what the agent reads and writes[^S6]. Alert thresholds and SLOs have no numbers in authoritative materials—don't invent them; record a two-week baseline first.

[>> Lesson 4: Tracing: Threading One Run into a Tree](./04-tracing.md)
