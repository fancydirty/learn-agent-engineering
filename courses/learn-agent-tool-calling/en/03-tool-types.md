# Lesson 3: Five Common Tool Types: Read, Write, Execute, Search, Call

> Learning goals:
> - Sort common tools into five categories by how much damage they can do, and name the typical signature of each
> - Explain why command-execution tools sit in a different risk class from the other four
> - Explain why search tools return matching snippets instead of whole files

Prerequisites: finished Lesson 2, you understand the round-trip shape of a tool call | Prev: [Lesson 2 <<](./02-one-tool-call-round-trip.md) | Next: [Lesson 4 >>](./04-designing-tool-interfaces.md)

## Start with a table

| Tool | Typical input | What it returns | Worst case when it goes wrong |
|---|---|---|---|
| Read file | `path` | File contents (string) | Reads a file it shouldn't, leaks information |
| Write file | `path`, `content` | Success/failure status | Overwrites work someone hasn't saved yet |
| Execute command | `command` | stdout/stderr/exit code | Wipes a database, sends requests, installs a poisoned package — irreversible |
| Search | `query`, `path` | List of match locations + snippets | Returns so much it blows out the context, or misses the key result |
| Call external API | Structured params (varies by service) | JSON/error object | Spends someone's money, sends the wrong message, gets stale data |

What sorts this table? Not the alphabet. It's "how wide a range of harm one call can cause" — the **blast radius** of that call. A read-only tool has a blast radius of roughly zero: reading the wrong file just derails this one turn of the conversation. Writing a file can overwrite existing content. Executing a command can do anything at all to the whole system. As we walk through each category, you'll see that beyond "what it can do," each one carries a pitfall that only that category trips over.

## Read: safest, but not zero risk

A read-file tool usually has a signature like this:

```json
{
  "name": "read_file",
  "input_schema": {
    "type": "object",
    "properties": {
      "path": { "type": "string", "description": "Absolute path to the file" },
      "offset": { "type": "integer", "description": "Line to start reading from (optional)" },
      "limit": { "type": "integer", "description": "Maximum number of lines to read (optional)" }
    },
    "required": ["path"]
  }
}
```

The return value is the file contents themselves, usually with line numbers so the model can reference them later:

```
1  export function add(a, b) {
2    return a + b;
3  }
```

Reading a file changes no state. If the model reads the wrong thing, or reads too much, the worst outcome is some irrelevant content in this one turn — and the model tends to notice it read the wrong thing and read again. That's why it's called the "safest" category: not that it carries no risk, but that the risk can't escape the bounds of this conversation.

The real risk is **reading a file it should never have touched**. If the agent has permission to read `~/.ssh/id_rsa` or the project's `.env`, an innocent-looking "show me what's in this directory" can lift a secret key verbatim into the conversation context. From there, the leak has already happened the moment that context gets emitted by the model, written to a log, or carried out by some later "call external API" tool. That's why read-file tools almost always go together with a path allowlist or a sandbox, rather than "it's read-only, just hand it the keys." Lesson 5 covers how to set that kind of boundary in detail.

## Write: where the consequences stop being symmetric

A write-file tool has one more parameter than read, and one less bit of safety:

```json
{
  "name": "write_file",
  "input_schema": {
    "type": "object",
    "properties": {
      "path": { "type": "string" },
      "content": { "type": "string" }
    },
    "required": ["path", "content"]
  }
}
```

The return value is usually simple, just a status:

```json
{ "success": true, "bytesWritten": 842 }
```

The problem isn't the return value, it's the call itself. If a read goes wrong, you read again and nothing has changed. If a write goes wrong — say the model fills in the wrong `path`, or the `content` is missing half of what it should be — the original file's contents are already overwritten and can't be recovered, unless there's version control or a backup. This is the "asymmetry between read tools and write tools": the two call shapes look almost identical (a `path` plus a couple of parameters), but one can be retried freely and the other gambles on every single call.

So a responsible write tool adds a layer of protection — for instance, requiring that the file was read before it can be edited (to stop the model editing from memory), or returning a diff of old versus new content instead of a bare "success," so the caller (the host application) has a chance to show the change before it actually hits disk. Those aren't the focus here; Lesson 4 opens them up when it covers interface design.

## Execute: a risk class of its own

The command-execution tool has the plainest-looking signature of the five:

```json
{
  "name": "bash",
  "input_schema": {
    "type": "object",
    "properties": {
      "command": { "type": "string", "description": "The shell command to run" }
    },
    "required": ["command"]
  }
}
```

One string goes in; stdout, stderr, and an exit code come out:

```json
{
  "stdout": "3 files changed, 12 insertions(+)\n",
  "stderr": "",
  "exit_code": 0
}
```

The catch is that this `command` field is essentially an open-ended entry point — it isn't a specific, schema-bounded operation like "delete this file" or "read this line," it's an arbitrary shell script. `rm -rf`, a `curl` that ships data to an outside server, an `npm install` that pulls in a poisoned package — all of it fits inside that one string. The other four categories (read, write, search, call API), however you design their signatures, are limited by their parameter structure in what they can do. A command-execution tool's capability boundary is the whole operating system's capability boundary. That's why it's in a class of its own: not "a bit riskier," but a different order of magnitude of risk.

For exactly that reason, the official docs design operating-system-level isolation specifically for this category: filesystem access and network access are two separate sandbox layers, and even if the model is steered by a prompt injection and insists on running a dangerous command, the OS boundary holds regardless — it doesn't depend on whether the model "wants" to cooperate[^S16]. The stated motivation is blunt: the goal is that even a successful prompt injection is fully contained and can't escape the sandbox[^S17]. Lesson 5 covers how to configure that isolation; for now, hold on to one thing: wherever the "execute command" signature shows up, treat it by default as the category in the five that most needs extra constraint.

```agentmentor-check
{
  "id": "tool-zh-03-blast-radius",
  "label": "Decide which tool category has the largest blast radius",
  "prompt": "An agent is wired up with two tools at once: read_file (reads any file by path) and bash (runs any shell command, taking a single command string). If both tools are exposed to the same untrusted input source (say, hidden text on a web page), which tool has the larger potential for damage, and why?",
  "whyHere": "We've just covered the signatures and risks of the read and execute categories, so this checks whether the learner actually grasps that blast radius isn't judged by how dangerous a tool's name sounds, but by whether its input is bounded by a schema",
  "mode": "single",
  "choices": [
    {
      "id": "a",
      "text": "About the same, because reading a sensitive file's contents already counts as leaking a secret, and a leak is just as damaging as anything bash can do",
      "correct": false,
      "feedback": "A leak is a real risk, but its path takes an extra step — the content has to be read out first, then carried away through some other channel. bash's command parameter is itself an executable script: one command can read a file, make a network request, and delete data all at once, with no need for a second tool. The two risk levels aren't in the same order of magnitude."
    },
    {
      "id": "b",
      "text": "bash is larger, because command is an open string, unbounded by any schema, so its reach equals the whole operating system's",
      "correct": true,
      "feedback": "Correct. read_file's path parameter only lets the model choose which file to read; what it can do is pinned down by the parameter structure. bash's command parameter has no such limit — it's an arbitrary shell script, and delete, curl, and package installs all fit inside it. That's why command-execution tools usually need an OS-level sandbox to fall back on, not just permission rules[^S16]."
    }
  ]
}
```

## Search: returns locations, not the whole world

A search tool (say, one that finds a keyword or regex across a codebase) often carries a "limit how much comes back" parameter in its signature:

```json
{
  "name": "search_code",
  "input_schema": {
    "type": "object",
    "properties": {
      "pattern": { "type": "string" },
      "path": { "type": "string", "description": "Restrict the search to a directory (optional)" },
      "max_results": { "type": "integer", "default": 20 }
    },
    "required": ["pattern"]
  }
}
```

The return value isn't the files themselves, it's "where the match is and what the surrounding context looks like":

```json
{
  "matches": [
    { "file": "src/auth/login.ts", "line": 42, "snippet": "  if (!user.verified) {" },
    { "file": "src/auth/session.ts", "line": 17, "snippet": "export function verifyToken(token) {" }
  ],
  "total_matches": 2
}
```

If this tool just stuffed the full contents of every matched file back in, two problems show up. The first is a token problem: one search hits 50 files, each a few hundred lines, all of it poured into the context — and this single tool call has eaten the whole turn's input budget, leaving nothing for the model to keep working with[^S9]. Writing tool descriptions and controlling the bounds of input and output is itself a basic requirement for making a tool usable[^S8]. The second problem matters more: the point of search isn't "read through everything that might be relevant," it's "help the model figure out where to look next." Return the match locations plus a short snippet of context, the model reads those snippets and judges for itself — "of these results, the second one looks like what I'm after, let me read that file's full contents on its own." That's how a search tool and a read tool work together: search narrows the range, read gets the detail. Returning "match locations" rather than "whole files" is exactly the follow-up lead the model needs, instead of a one-time dump of everything that might be useful.

## Call external API: failure is the norm, not the exception

The first four categories mostly stay inside the local system. Calling an external API is different — it crosses the network, to a service you don't control:

```json
{
  "name": "send_slack_message",
  "input_schema": {
    "type": "object",
    "properties": {
      "channel": { "type": "string" },
      "text": { "type": "string" }
    },
    "required": ["channel", "text"]
  }
}
```

A normal return looks like this:

```json
{ "ok": true, "ts": "1735689600.000200" }
```

But an external service will rate-limit you, time out, reject a request for missing permissions, and change its own interface in the gap between your calls. These aren't "unexpected situations," they're the normal running conditions for this category. What actually decides whether the tool is any good isn't "what it returns when things are fine," it's "what it returns when things fail":

```json
{ "ok": false, "error": "rate_limited", "retry_after": 30 }
```

This error message isn't for you, it's for the model — whether it should retry or switch strategy next depends on whether it can read that `error` field. The MCP specification writes this straight into the protocol: clients should provide tool execution errors to language models so the model has a chance to self-correct and try again[^S11]. In other words, a tool that silently swallows a 429 and returns nothing but "call failed" is robbing the model of the chance to correct itself; a tool that carries back concrete detail like `retry_after` is the one designing "failure" as a normal part of the workflow.

The call-external-API category also drags in another layer of risk: if this agent can read private data at the same time as it's exposed to untrusted content (a chunk of web text a user pasted, say) and it can also send messages or requests outward, those three together are what security research calls the "lethal trifecta" — the attacker doesn't need to break into your system, they just hide an instruction in content the agent will read and let the agent carry the private data out itself[^S19]. Lesson 5 opens this topic up on its own; for now, know this: calling an external API is the last and most critical link in that chain, because it's the exit through which data actually leaves your system.

<!-- exercises -->
## 💻 Exercises

### Level 1: Pick the return value for a tool

Below are three draft results from tool calls, each with a problem. Say which category of tool the problem belongs to (read/write/execute/search/call API), explain why the design is a poor fit, and give the change you'd make.

1. `search_code` returns: `{ "content": "<the full source of 50 files stitched together, 8000 lines in total>" }`
2. `write_file` returns: `{ "success": true }` (no diff, no old-content information)
3. `send_email` on failure returns: `{ "error": "failed" }`

<!-- rubric -->
- All three problems map to a pitfall this lesson covered (search doesn't save tokens, the write tool gives no way to review the change, the API call's failure gives no actionable detail)
- The fix is specific down to the field level, not a vague "make it better"
- You can say "why the model needs this information," not just "this is more proper"

<!-- answer -->
1. This is a search-tool problem. Stuffing the full contents of every matched file back in one go merges "narrow the range" and "read the detail" into a single step, and 8000 lines will blow out this turn's context. It should return only match locations and a short snippet, like `{ "matches": [{ "file": "...", "line": 42, "snippet": "..." }] }`, and when the full content is needed, let the model call `read_file` again itself.
2. This is a write-tool problem. Returning a single boolean gives the caller no way to know how much this overwrite changed or what it looked like before, so if something goes wrong there's nothing to review or roll back against. It should carry the diff of old versus new content, or at least the byte count/hash before the change, so the two can be compared.
3. This is a call-external-API problem. `"failed"` tells the model nothing about what to do next — retry, switch recipient, or report to the user. It should be something like `{ "ok": false, "error": "invalid_recipient", "detail": "address format is wrong" }`, a specific error type the model can use to judge its next move.

<!-- hint -->
Go back to this lesson's table. The "worst case when it goes wrong" column for each category is exactly that category's most typical pitfall — match the problem to a category first, then think about the fix.

<!-- hint -->
Imagine you're the model that received this return value, with no background, just this JSON. Can you decide what to do next? If you can't, the return value is missing key information.

### Level 2: Pick the tool types for a new scenario and design a signature

You need to wire up a tool for an agent: it periodically checks the shipment status of a third-party logistics API, and if the status turns to "abnormal," it writes the tracking number and the reason into a local `alerts.log` file.

This task actually involves more than one category of tool. Write out:

1. Which of this lesson's five categories does it need? What is each responsible for?
2. Write a JSON `input_schema` for the "call external API to query shipment status" tool, with at least a tracking-number parameter (the systematic take on interface design is next lesson; here just mimic the signature format that's shown up in this lesson)
3. When this tool's query fails (tracking number doesn't exist, request times out), what should the return value look like?

<!-- rubric -->
- Correctly identifies at least two categories (call external API to query status + write file to record the anomaly; read file can count too, depending on how you frame it)
- The input_schema includes the basic fields `type: object`, `properties`, `required`, with sensible parameter naming
- The failure return distinguishes "tracking number doesn't exist" from "request timed out" as two different kinds of failure, not one blanket `error`

<!-- answer -->
1. At least two categories: call external API (query the logistics status) is responsible for getting the latest status; write file (log to alerts.log) is responsible for writing to disk when the status is abnormal. If you also want to de-duplicate (avoid logging the same anomaly twice), you might also need read file to first check whether alerts.log already has a record for this tracking number.
2. A reference signature:

```json
{
  "name": "check_shipment_status",
  "input_schema": {
    "type": "object",
    "properties": {
      "tracking_number": { "type": "string", "description": "Tracking number" }
    },
    "required": ["tracking_number"]
  }
}
```

3. Reference failure returns: `{ "ok": false, "error": "not_found", "detail": "tracking number doesn't exist" }` and `{ "ok": false, "error": "timeout", "retry_after": 10 }` should be two different `error` values. When the model sees `not_found` it should stop retrying and report to the user; only when it sees `timeout` should it retry after the time `retry_after` suggests.

<!-- hint -->
First split the task into the two actions "query the status" and "log the anomaly," then check each one against this lesson's table to decide which category it belongs to.

<!-- hint -->
"Tracking number doesn't exist" and "request timed out" are completely different signals to the model: one means give up retrying, the other means retry later. If the return value merges them into the same value of the same `error` field, the model has no way to tell which move to make.

<!-- /exercises -->

## Recap

- The risk across the five categories isn't evenly spread: read file has the lightest consequences, write file is where things start being irreversible, execute command's blast radius equals the whole operating system, and search and call-external-API each have their own separate pitfalls
- The core difference between read tools and write tools is **whether you can safely retry** — read wrong and you just read again, write wrong and the original content may be gone for good
- Command-execution tools need an OS-level sandbox to fall back on because their `command` parameter is an open string, not bounded by a schema structure the way the other four are[^S16][^S17]
- Search tools return match locations plus snippets rather than whole files, first to save tokens, and second to split "locate" from "read the detail," handing the model a lead it can follow up on[^S9]
- Call-external-API tools should carry failure information (error type, whether it can be retried) back to the model as-is rather than swallowing it — in this category, failure is the norm, not the exception[^S11]

Next lesson, we take the "signatures" of these five categories apart: how to write a good tool name, description, parameter schema, and return value, so the model calls it right the first time.

[>> Lesson 4: Designing Tool Interfaces: Name, Description, Parameters, Return Value](./04-designing-tool-interfaces.md)
