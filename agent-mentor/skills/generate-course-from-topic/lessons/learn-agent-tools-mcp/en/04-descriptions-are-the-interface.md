# Lesson 4: The description is the interface

> Lesson objectives:
> - Name every field of a tool definition and say which ones the model reads when deciding.
> - Rewrite a tool description so that acting on it requires no guesswork.
> - Tell a protocol error from a tool execution error, and say which one the model can recover from.
> - Write an error message a model can act on, rather than one a human would debug.
> - Decide whether a capability should be one tool or several, using a stated test.
>
> Prerequisites: Lesson 3 — you know what a request carries and where state lives | Previous [<< 03](./03-the-stateless-core.md) | Next [05 >>](./05-work-that-outlives-a-request.md)

## The tool is right there, and it called the wrong one

Your server exposes `search_issues` and `get_issue`. You ask the agent to find the ticket about tenant IDs, and it calls `get_issue` with a made-up number. Or it calls `search_issues` with the whole sentence you typed as the query string. Or it does not call anything, and confidently tells you what the ticket probably says.

Nothing errored. The connection is fine, the metadata is correct, the tool is listed. The model made a choice, and the choice was bad.

This is the failure mode that survives after everything else is set up correctly, and it has one cause: the model chose from what it was shown, and what it was shown was written as documentation rather than as an interface. This lesson is about the text that decides.

## Explanation

### What the model actually sees

A tool definition is a small object, and as of the 2026-07-28 specification it carries:[^S6]

- `name` — "Unique identifier for the tool"
- `title` — optional, "human-readable name of the tool for display purposes"
- `description` — "Human-readable description of functionality"
- `inputSchema` — "JSON Schema defining expected parameters", which "**MUST** be a valid JSON Schema object (not `null`)"
- `outputSchema` — optional, "JSON Schema defining expected output structure"
- `annotations` — optional, "properties describing tool behavior"
- `icons` — optional, for display

Two of those deserve a note before we go on. An **output schema** is optional and does two jobs: it lets clients validate what came back, and it tells the model what shape to expect. If you declare one, you are making a promise — servers "**MUST** provide structured results that conform to this schema."[^S6] What conforms to it is the **structured content**, a JSON value returned in the result's `structuredContent` field. The specification adds a clarification worth keeping, because the naming collides with a different idea: `structuredContent` "is server-produced result data and is unrelated to LLM 'structured outputs' (schema-constrained model generation)."[^S6]

There is also an annotation for a narrower need. Marking a parameter with **x-mcp-header** mirrors its value into an HTTP header so that "network intermediaries (load balancers, proxies, WAFs) [can] route and process requests based on parameter values without parsing the request body."[^S6] Useful for a region or tenant field; wrong for anything secret, since "Server developers **SHOULD NOT** mark sensitive parameters (passwords, API keys, tokens, PII) with `x-mcp-header`, as header values are visible to network intermediaries."[^S6]

Now the part that reframes the whole thing. Every one of `name`, `description`, and `inputSchema` is loaded into the model's context so it can decide whether to call the tool. They are not reference material a developer consults; they are text the model reads at decision time, on every request.

Anthropic's tools guidance states the consequence directly: "prompt-engineering your tool descriptions and specs. Because these are loaded into your agents' context, they can collectively steer agents toward effective tool-calling behaviors."[^S10] The older patterns essay reached the same conclusion from experience: "Tool definitions and specifications should be given just as much prompt engineering attention as your overall prompts," and "While building our agent for SWE-bench, we actually spent more time optimizing our tools than the overall prompt."[^S11]

Both of those sources predate the current revision — the second by well over a year. They are cited here for a design principle that has not changed with any protocol version: the interface between a model and a system is written text, and it deserves the attention text gets. The essay has a name for that surface — the **agent-computer interface** — and its argument is that it deserves the same deliberate design a user interface gets.[^S11] Nothing about protocol mechanics is being taken from either source.

### The new-hire test

The most useful single heuristic in the literature: "When writing tool descriptions and specs, think of how you would describe your tool to a new hire on your team. Consider the context that you might implicitly bring — specialized query formats, definitions of niche terminology, relationships between underlying resources — and make it explicit."[^S10]

The phrase to sit with is *the context you implicitly bring*. When you write "Search issues," you are silently carrying: that your tracker's query syntax is Lucene-like, that closed issues are excluded by default, that "issue" in your company means a bug and not a task, and that there is a separate tool for the latter. A new hire would ask. A model does not — it guesses, and its guess is drawn from every issue tracker in its training data rather than from yours. Call this **the new-hire test**: read your description and mark every sentence a new colleague would have needed and did not get.

The same source names the parameter-level version: "input parameters should be unambiguously named."[^S10] A parameter called `id` is an invitation to pass the wrong kind of identifier.

### Where the definition comes from

In practice you rarely hand-write the JSON. A server SDK derives it. The Python tutorial notes: "The MCPServer class uses Python type hints and docstrings to automatically generate tool definitions."[^S12]

Which means your docstring *is* the description the model reads. Here is the tutorial's own tool, as of the 2026-07-28 documentation:[^S12]

```python
@mcp.tool()
async def get_alerts(state: str) -> str:
    """Get weather alerts for a US state.

    Args:
        state: Two-letter US state code (e.g. CA, NY)
    """
```

Read the `Args` line, because it is doing the work. It does not say "the state." It says the format (two letters), and it gives two examples. That is three pieces of guesswork removed in nine words — and it is why the same server does not get called with `"California"`.

This code is illustrative of a durable mechanism — the SDK turning your annotations into the wire definition — and the exact class name, decorator, and package are the fastest-moving surface in this course. They are shown as written in the documentation fetched 2026-08-23. What will still be true when the names change: something derives the definition from what you wrote, so what you wrote is the interface.

### Two error channels, and only one is useful to the model

When a call fails, the failure comes back on one of two channels, and the difference decides what happens next.

**Protocol errors** are "issues with the request structure itself that models are less likely to be able to fix" — unknown tool, malformed request, server error — and come back as JSON-RPC errors.[^S6]

**Tool execution errors** are different in kind: they "contain actionable feedback that language models can use to self-correct and retry with adjusted parameters" — API failures, input validation, business logic — and are "reported in tool results with `isError: true`."[^S6]

The specification's guidance follows from that split: "Clients **SHOULD** provide tool execution errors to language models to enable self-correction," while protocol errors "**MAY**" be provided, "though these are less likely to result in successful recovery."[^S6]

So when your tool rejects a bad date, returning a protocol error is a category mistake — you have classified a fixable problem as an unfixable one.

And once it is on the right channel, the text matters as much as any description: "if a tool call raises an error (for example, during input validation), you can prompt-engineer your error responses to clearly communicate specific and actionable improvements, rather than opaque error codes or tracebacks."[^S10] The specification's own example is a model of the form: "Invalid departure date: must be in the future. Current date is 08/08/2025."[^S6] It names the field, the rule, and the fact needed to fix it.

### How many tools

More surface is not better. The guidance is explicit: "More tools don't always lead to better outcomes. A common error we've observed is tools that merely wrap existing software functionality or API endpoints — whether or not the tools are appropriate for agents."[^S10]

The recommendation is to build "a few thoughtful tools targeting specific high-impact workflows... and scaling up from there."[^S10] The number to watch is your **tool count** across every connected server, because each one's name and description is loaded whether or not it is ever called. Where you have many, grouping helps: "Namespacing (grouping related tools under common prefixes) can help delineate boundaries between lots of tools; MCP clients sometimes do this by default."[^S10]

One caution on namespacing, from the same source: "We have found selecting between prefix- and suffix-based namespacing to have non-trivial effects on our tool-use evaluations. Effects vary by LLM and we encourage you to choose a naming scheme according to your own evaluations."[^S10] That is an honest "it depends," and worth repeating as one rather than converting into a rule.

There is also a mechanical reason to care about names. A **tool name** must be unique, but uniqueness "is scoped to a single server," and a client aggregating several servers "**MAY** encounter naming collisions (for example, two servers each exposing a `search` tool)."[^S6] If you connect three servers that each expose `search`, the disambiguation is the client's problem — and the model's confusion is yours. Do not reach for the server's own name to break the tie either: it "is not guaranteed to be unique across servers and **SHOULD NOT** be relied upon for disambiguation."[^S6]

One more thing servers should do with their lists, which costs you nothing and saves tokens. Servers "**SHOULD** return tools in a deterministic order (i.e., the same ordering across requests when the underlying set of tools has not changed)," because that **deterministic order** "enables clients to reliably cache the tool list and improves LLM prompt cache hit rates when tools are included in model context."[^S6] A list built from an unordered map looks stable locally and reshuffles on restart, quietly costing every downstream cache hit. Related, and easy to get wrong on an authenticated server: list results carry a **cache scope** of `public` or `private`, which "controls whether shared intermediaries may cache the response."[^S2] If your tool list varies by who is asking, it is not public.

### Reading a wrong call backwards

Put the pieces together into a diagnostic. When the model calls wrongly, the cause is usually visible in the definition:

| Symptom | Usual cause in the definition |
|---|---|
| Called the wrong tool of two | Descriptions do not state the boundary between them |
| Right tool, malformed argument | Schema lacks a format, an example, or an enum |
| Invented an identifier | No tool exists to look one up, or its description does not say it returns one |
| Did not call anything | Description does not name the trigger — when to reach for it |
| Called repeatedly with variations | Error text did not say what was wrong |

The last row is the one people misread as the model being obstinate. Anthropic's guidance treats it as signal about the definition instead: "lots of tool errors for invalid parameters might suggest tools could use clearer descriptions or better examples."[^S10]

```agentmentor-fix
{
  "id": "agent-tools-mcp-description-rewrite-search-issues",
  "label": "Rewrite a description the model keeps misreading",
  "prompt": "This tool gets called with the user's whole sentence as `q`, and never gets called at all when someone asks about a closed ticket. Rewrite the docstring so both failures stop. Keep the signature; change only the text inside the triple quotes.",
  "whyHere": "Readers accept that descriptions matter and then write a slightly longer version of the same vague sentence. Doing the rewrite makes visible how much implicit context was riding on 'Search issues.'",
  "bug": "The model supplies natural language where a query expression is expected, and it excludes this tool from consideration whenever the request mentions closed or resolved tickets — both behaviours are consistent with what the current text tells it.",
  "language": "python",
  "starter": "@mcp.tool()\nasync def search_issues(q: str, state: str = \"open\") -> str:\n    \"\"\"Search issues.\n\n    Args:\n        q: The query\n        state: The state\n    \"\"\"",
  "checks": [
    {
      "id": "query-format",
      "type": "regex",
      "pattern": "q:[^\\n]*([Ee]\\.g\\.|[Ee]xample|[Ff]ormat|[Ss]yntax|label:|assignee:)",
      "message": "The q parameter needs a stated format and at least one concrete example. A parameter documented as 'the query' gives the model nothing to pattern-match against, so it falls back to prose — which is what it does when nothing tells it otherwise."
    },
    {
      "id": "state-values",
      "type": "regex",
      "pattern": "state:[^\\n]*(closed|resolved|all)",
      "message": "The state parameter must name its accepted values. The model cannot request closed issues from a parameter whose legal values are never stated, so it silently treats the tool as open-issues-only and looks elsewhere."
    },
    {
      "id": "trigger",
      "type": "regex",
      "pattern": "\"\"\"[^\\n]{25,}",
      "message": "The summary line should say what this searches and when to reach for it, not just name the verb. 'Search issues.' states a category; the model needs to know this is the tool that finds an issue when the user has words but no number."
    }
  ],
  "copyPurpose": "Have the agent compare my rewritten docstring against the two observed failures and tell me which one my rewrite does not actually fix."
}
```

## Worked example: one description, three passes

The tool: look up a customer's subscription. Watch what each pass removes.

**Pass 1 — what most servers ship.**

```python
@mcp.tool()
async def get_subscription(id: str) -> str:
    """Get subscription."""
```

Everything is implicit. Which `id` — customer, subscription, account? Does it return the current one or all of them? What happens for a customer who never subscribed? The model will guess all three, and it will guess from other people's billing systems.

**Pass 2 — apply the new-hire test.** Say the things you would say out loud to someone on day one.

```python
@mcp.tool()
async def get_subscription(customer_id: str) -> str:
    """Get the current subscription for one customer.

    Use when you have a customer ID and need their plan, status, or renewal
    date. Returns the active subscription only — for past subscriptions use
    list_subscription_history. Customers on the free tier have no
    subscription and this returns a not-found error, which is expected.

    Args:
        customer_id: Stripe-style customer ID, e.g. cus_N7v2mQ. Not an
            email address and not our internal numeric account number.
    """
```

Four pieces of guesswork gone: which identifier and in what format, the trigger for reaching for this tool, the boundary against the neighbouring tool, and the meaning of the most common failure. The parameter rename from `id` to `customer_id` does as much work as any sentence — this is the "unambiguously named" point in practice.[^S10]

**Pass 3 — fix the error text.** The description now warns that free-tier customers produce a not-found error. Make that error itself actionable, on the right channel:

```python
# Wrong channel and unusable text:
raise ValueError("404")

# Tool execution error the model can act on:
return {
    "content": [{"type": "text", "text":
        "No active subscription for cus_N7v2mQ. This customer is on the "
        "free tier. To see whether they ever subscribed, call "
        "list_subscription_history with the same customer_id."}],
    "isError": True,
}
```

The second one names what happened, why, and the next call to make. That is what "actionable feedback that language models can use to self-correct" means concretely,[^S6] and it is the difference between a model that recovers in one turn and one that retries the same call four times.

**What pass 3 is not.** It is not a claim that this exact result shape is what your SDK returns — SDKs wrap results differently, and the shape shown here is the wire-level form from the 2026-07-28 tools specification. The durable part is the two-channel choice and the content of the sentence.

## Your turn: three passes on one of your own

Take one tool from the decision note you wrote in Lesson 1 — or any tool on a server you have connected — and run the same three passes.

**Pass 1.** Write the description as you would have written it before this lesson. One line is fine; that is the point.

**Pass 2.** Add, in order: (a) the trigger — when should the model reach for this rather than think? (b) the boundary — what is the neighbouring tool and how do they differ? (c) per parameter, the format plus one real example. (d) the expected failure and what it means.

**Pass 3.** Write the two most likely error messages as text a model can act on. Each must name the field, the rule, and the next step.

Then the check that makes it real: hand your pass-2 description to someone who has never used the system — or to an agent with no other context — and ask them what the tool does and what they would pass to it. Every question they ask is a sentence your description still owes.

The failure to watch for in your own writing is length without content. A description that grew to a paragraph while still saying "the query" has not improved; it has just cost more context. Each added sentence should remove a specific guess.

<!-- exercises -->
## 💻 Exercises (point these at your own real environment)

### Level 1 (warm-up)
Open one MCP server you have connected and read the actual tool definitions it exposes — most clients can show them, and any server's source has them. Pick the three tools with the weakest descriptions and, for each, write down the specific guess the model has to make. Then predict the wrong call each weakness would produce.

<!-- rubric -->
- Each of the three weaknesses is named as a missing fact, not as a style complaint — "no format stated for `since`", not "vague".
- Each prediction is a concrete wrong call: the tool name and the specific argument the model would supply.
- At least one weakness is in an `inputSchema` or parameter documentation rather than in the summary line.
- You state which of the five symptoms in the table above each prediction corresponds to.
<!-- answer -->
A worked row: "`list_deployments(env)` — `env` has no enum and no example. Model has to guess whether we say `prod`, `production`, or `PRODUCTION`. Predicted wrong call: `list_deployments(env='production')` against a server expecting `prod`. Symptom row: right tool, malformed argument."

Another: "`search` and `find` both exist, neither description says which corpus it covers. Predicted: model calls `search` for a file path question that only `find` can answer. Symptom row: called the wrong tool of two."

If all three of your tools have good descriptions, that is a real finding — write down what they do that the weak ones do not, because that is your template.
<!-- hint -->
For each parameter, ask "could I pass the wrong thing here and have it look right?" A string parameter with no stated format almost always yields yes.
<!-- hint -->
Look for pairs of tools with overlapping names. If two descriptions could both plausibly answer the same question, neither states its boundary.

### Level 2 (advanced)
Rewrite one tool's full definition — name, description, parameter documentation, and its two most likely error messages — then test the rewrite against your own agent. Ask it, in a fresh session with no other context, three questions: what does this tool do, when should you call it instead of its neighbour, and what would you pass for each parameter. Record where its answers are wrong, and fix the text rather than explaining it.

<!-- rubric -->
- The rewrite is in place in the actual server (or in a copy you can point the agent at), not only in a notes file.
- All three questions were asked in a session with no prior context about your system.
- Every wrong answer is traced to a specific missing or misleading sentence, and the fix is a text change.
- You state one thing you deliberately did not add, and why — length has a cost.
- The error messages name field, rule, and next step, and are returned as tool execution errors rather than protocol errors.
<!-- answer -->
The test is the exercise. An agent reading your definition cold is the closest thing you have to the new hire the guidance describes, and its wrong answers are a direct readout of what the text failed to say.

What people find, in rough order of frequency: the agent cannot say when to use the tool versus its neighbour (no boundary sentence); it invents a plausible format for an ID (no example); it treats an expected empty result as an error (failure semantics never stated); it misses that one parameter is a handle from a previous call (the Lesson 3 problem — the model must carry handles forward, so the description has to say where the handle comes from).

The deliberate omission matters because it proves you are trading rather than accumulating. A reasonable one: "I did not document the seven optional filter parameters individually — I named the three that get used and pointed at the schema for the rest. Each sentence is loaded on every request, and the other four filters have never been the cause of a wrong call."

**Common mistake breakdown:** the most frequent wrong approach is answering the agent's confusion in the chat instead of in the definition. It works — the agent gets it right for the rest of that session — and it fixes nothing, because the next session starts from the same text. Anything you find yourself explaining in chat about a tool is a sentence missing from its description. That is the same second-mistake trigger that applies to any persistent instruction, and here it is measurable: you can watch the wrong call stop happening.
<!-- hint -->
Ask the three questions in exactly the order given. The "when instead of its neighbour" question is the one that exposes missing boundaries, and asking it second stops the agent from reasoning its way there from your first answer.
<!-- hint -->
If the agent's answer is right but hedged — "probably an ID of some kind" — treat that as a failure. Hedging at read time becomes a guess at call time.
<!-- hint -->
For the error messages, write them as the sentence you would want to read in a log at 2am, then delete anything a model could not act on, like a stack trace or an internal error code.
<!-- /exercises -->

## What you can fix without touching code

You can read a tool definition and name what the model has to guess. You can rewrite a description so the trigger, the boundary, and the formats are explicit; put failures on the channel the model can recover from; and write error text that names the next call. You also have a test that does not depend on your own familiarity — a cold agent reading your definition.

All of that assumed the call returns while everyone is still waiting. Some work does not: a deployment, a batch import, an approval that needs a human. Lesson 5 is about what happens when a tool call outlives the request that started it, and why the answer is an extension rather than a core feature.
