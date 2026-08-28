# Lesson 4: Designing Tool Interfaces: Name, Description, Parameters, Return Value

> Learning goals:
> - Judge whether a tool description gives the model enough to pick the right tool and fill in the right parameters
> - Use JSON Schema's enum and required to close off room for parameter misuse, and know when to use strict mode to turn those constraints into hard guarantees
> - Design return values and error messages the model can act on to correct itself
>
> Prerequisites: You've finished Lesson 3 and know the difference between the five tool types — read / write / execute / search / call | Prev [Lesson 3 <<](./03-tool-types.md) | Next [Lesson 5 >>](./05-permissions-and-safety.md)

## One Tool, Two Descriptions, Two Outcomes

Say your toolbox has a code search tool. Here's the first version of how it's registered:

```json
{
  "name": "search_files",
  "description": "Search files",
  "input_schema": {
    "type": "object",
    "properties": {
      "query": { "type": "string" }
    },
    "required": ["query"]
  }
}
```

The user asks: "Which directory is utils.ts in?"

All the model has to go on is those two lines — the name and the description. It has no way to tell whether `search_files` looks up files by name or searches for a string inside file contents; the description doesn't say. The model picks this tool and passes `utils.ts` as the query:

```json
{ "id": "call_1", "name": "search_files", "input": { "query": "utils.ts" } }
```

If this tool is actually a full-text search (looking for the string `utils.ts` inside each file's contents), and no file's contents literally contain those characters, the result comes back empty. The model gets an empty result and can't tell whether the file doesn't exist or its search approach was wrong, so it guesses. The common guess is to try a few synonyms and search again, and keep getting empty results.

Now swap in this description:

```json
{
  "name": "code_search_grep",
  "description": "Search the contents of source files for lines matching a regular expression, returning file paths and line numbers. Use this to answer 'where in the code does a given variable/function/string appear'. To find files by their name (rather than by content), use the code_search_glob tool instead.",
  "input_schema": {
    "type": "object",
    "properties": {
      "pattern": { "type": "string", "description": "The regular expression to match" },
      "path": { "type": "string", "description": "Directory to start the search from; defaults to the project root" }
    },
    "required": ["pattern"]
  }
}
```

Same question, but this time the model reads "to find files by their name, use code_search_glob" and switches directly to code_search_glob, which is registered in the same toolbox, passing the right parameter:

```json
{ "id": "call_1", "name": "code_search_glob", "input": { "pattern": "**/utils.ts" } }
```

Between the two calls, nothing changed: same model, same prompt, no change to any implementation code. The only difference is those few lines the model can read in the tool definition — a more precise name, a description that spells out the boundary and names the alternative tool, and parameters with their own descriptions. That's what this lesson is about: every field in a tool interface is the only thing the model has to reason with when it makes a decision.

## The Description Is All the Model Sees When Choosing a Tool

Developers tend to write tools the way they write API comments: give the function a meaningful name, put the logic in the body, and let whoever needs it read the source. That habit breaks down on tool definitions — **the model doesn't read your implementation code**. All it can see is the name, description, and input_schema fields[^S3]; which tool to pick and what parameters to pass all come down to those few lines.

The official requirement for a description is direct: it should be "A detailed plaintext description of what the tool does, when it should be used, and how it behaves."[^S3] Miss any one of those three and the model has to guess. Miss "what it does" and the model may skip the tool entirely and take a longer route to fake the result. Miss "when to use it" and, when the toolbox holds several similar tools (say both a grep and a glob), the model can't tell where the boundary is, and its odds of choosing wrong climb with the number of tools. Miss "how it behaves" and the model doesn't know what shape of result it'll get back, so it can't write correct follow-up logic to parse that result.

A good description should "Avoid ambiguity by clearly describing (and enforcing with strict data models) expected inputs and outputs."[^S8] rather than reaching for elegant phrasing. The `code_search_grep` description in the last section works because it does two things: it makes clear it searches contents, not file names, and it names `code_search_glob` as the tool for finding files by name. Those two sentences let the model choose between similar tools without trial and error.

```agentmentor-check
{
  "id": "tool-zh-04-description-audience",
  "label": "Who the description is written for",
  "prompt": "A colleague thinks writing the description in detail is unnecessary, reasoning: 'this text is really there so whoever maintains the code understands the logic, and the model happens to read it too, so there's no need to fuss over the wording.' How do you respond?",
  "whyHere": "The opening example already showed two descriptions driving the model to pick the wrong tool versus the right one; this checks whether the learner understands who the description field's reader actually is and what role it plays in the decision path, rather than treating it as an ordinary code comment",
  "mode": "single",
  "choices": [
    {
      "id": "a",
      "text": "The description is mainly a comment for whoever maintains this code later; the model just happens to read it along the way",
      "correct": false,
      "feedback": "Backwards. When the model picks a tool and fills in parameters, all it can see is the name, description, and input_schema fields — it can't see the implementation code, let alone the comments in it. The description isn't narration the model 'happens' to read; it's the whole basis for the model's decision. Notes for a colleague belong in code comments or docs, which are a separate thing from this field."
    },
    {
      "id": "b",
      "text": "The description is the only text the model reads when deciding whether to call this tool and what to pass; it can't see the implementation code",
      "correct": true,
      "feedback": "Right. That's also why, in the opening example, swapping one description on the same tool flipped the model from picking the wrong tool to picking the right one — no model change, no implementation change, just the text the model could read."
    },
    {
      "id": "c",
      "text": "The description is mainly for saving tokens, so the shorter the better; let the model guess how to use it from the system prompt",
      "correct": false,
      "feedback": "Wrong direction. A vague description doesn't save tokens — it makes the model trial-and-error across several similar tools, get empty results, and retry, and those failed round-trips cost far more tokens than a few clear sentences. Token cost does matter once tool count gets high enough, but you solve that by trimming tool count and granularity, not by writing each tool's explanation vaguely."
    }
  ]
}
```

## Names Should Signal Ownership Too: Namespacing

The description's job is to spell out what the tool does; the name's job is different — it should keep the tool from being confused with another one in a crowded toolbox. Once you have a lot of tools, especially after wiring in several external services, names like `list_prs`, `send_message`, `create_issue` are names anyone might pick, and the name alone doesn't tell you which service they belong to.

The official advice is to prefix tool names with the service: "When your tools span multiple services or resources, prefix names with the service (e.g., github_list_prs, slack_send_message). This makes tool selection unambiguous as your library grows, and is especially important when using tool search."[^S10] When the model has to pick one tool out of dozens, a prefixed name narrows the field first, so it can rule out most of the options without opening each description to compare them line by line. The five tool types from Lesson 3 (read, write, execute, search, call) benefit the same way if each one is backed by a different service: `fs_read_file` and `db_read_row` are obviously not the same thing at a glance, whereas a bare `read` blurs them together.

## input_schema: Nail Down the Shape of the Parameters

The description decides whether the model will pick this tool; the input_schema decides whether it can fill in the parameters correctly[^S3]. Here's an easy thing to miss: in JSON Schema, not every field is "constraining" a parameter — some fields only "describe" it.

Adding a description to a parameter only states intent; it won't reject any input that doesn't match what the sentence says[^S14]:

```json
{
  "file_type": {
    "type": "string",
    "description": "Limits the search to a file type, e.g. typescript"
  }
}
```

The model might pass `"typescript"`, might pass `"ts"`, might pass `"TypeScript files"` — the description is only a suggestion, and nothing stops it from passing something arbitrary. What actually stops arbitrary values is enum:

```json
{
  "file_type": {
    "type": "string",
    "enum": ["js", "ts", "py", "all"],
    "description": "Limits the search to a file type"
  }
}
```

With enum in place, the legal values are listed explicitly, the model almost always fills one in, and the odds of an arbitrary value drop sharply. But note: this is strong guidance to the model, not a hard platform guarantee. In the default mode the API does not validate parameters against the schema for you, and the model will still occasionally produce inputs with wrong types or missing required fields[^S20], so the checks on invalid values in your tool implementation still need to stay. Same goes for required: if a "write file" tool doesn't mark `path` as required, the model will occasionally leave it out, and the implementation then has to either error out or guess a default path, neither of which is good. Marking `path` as required drops the odds of that kind of misuse very low — and having "required" actually enforced by the platform depends on the strict mode in the next section.

**Remember this distinction**: type, enum, and required are real constraints in validation terms, while title and description are only notes for the model — no matter how detailed, they don't constitute a validation rule[^S14]. When you design an input_schema, ask first: can the "inputs that shouldn't appear" on this parameter be blocked outright with enum or required, instead of only writing "please pass xxx" in the description? How to upgrade these constraints from "written in the schema" to "enforced by the platform" is the next section.

## Turning Soft Constraints into Hard Guarantees: additionalProperties: false and strict Mode

The last section kept stressing the difference between "constraining" and "describing," but there's another layer to keep straight: writing a constraint in the schema and the model's produced parameters actually passing validation are still two different things. In the default mode, the API won't intercept a call that doesn't match the schema for you — the model will occasionally write a number as the string `"2"`, or just leave out a required field[^S20].

There's a subtler direction too: the model may add fields out of nowhere. Say a ticket-creation tool's schema declares only two parameters, `title` and `priority`, but one call comes back with:

```json
{ "title": "Login page returns 500", "priority": "high", "skip_review": true }
```

That `skip_review` key was never in the schema's properties; the model invented it on its own. Standard JSON Schema's default behavior is precisely to allow an object to carry undeclared extra keys — and if your tool implementation happens to pass the whole input through to a downstream system, and the downstream code really does have a branch checking that field name, one model hallucination silently bypasses a review step that was supposed to happen. Adding `"additionalProperties": false` at the top of the input_schema writes "only declared keys are allowed" into the validation rules too.

To make the platform actually enforce all of this, add the top-level field `"strict": true` to the tool definition. The way strict mode works is by constraining the model's sampling itself: "Setting strict: true on a tool definition guarantees Claude's tool inputs match your JSON Schema by constraining the model's token sampling to schema-valid outputs (a technique called grammar-constrained sampling)."[^S20] Type, enum, required, additionalProperties all get honored, and invalid parameters simply never get generated. In the official docs, the strict-mode example schemas all carry `additionalProperties: false` as well — the two are meant to be used together. Only at this point does "invalid values are ruled out before the request is even sent" truly hold; for a tool without strict mode on, you can't drop a single line of parameter validation on the implementation side.

## Return Values: Give the Model What It Can Use Next, Not a Log for Humans

When a tool finishes, its result is wrapped in a tool_result block and passed back to the model. The core fields are `tool_use_id` (which call this is for), `content` (the result), and `is_error` (whether it failed)[^S5]. Of these three, the one most often written badly is the content on failure.

Say a "write file" tool fails because the directory doesn't exist. Two ways to write it:

```json
{
  "tool_use_id": "call_1",
  "content": "Error: ENOENT: no such file or directory, open '/reports/q3.csv'",
  "is_error": true
}
```

This throws the system log straight back. The model can tell it failed, but can't tell what to do next — the common result is that the model retries the exact same call, hits the same error a second time, and falls into a loop.

```json
{
  "tool_use_id": "call_1",
  "content": "Write failed: the directory /reports does not exist. Create it first with fs_create_dir, or switch to a path under a directory that already exists.",
  "is_error": true
}
```

Same failure, but this version tells the model three things: what the failure was, which tool it can call to fix it, and what other path is available. The MCP spec is explicit: "Clients SHOULD provide tool execution errors to language models to enable self-correction."[^S11] — on the condition that this message itself carries the clues needed to correct, not a stack trace only the person debugging the code can read.

## Tool Count and Granularity: More Isn't Better

A bigger toolbox isn't a better one. Every tool definition (name, description, and input_schema combined) has to be packed into the context before the conversation begins, and once you have a lot of tools, that overhead grows fast. The Anthropic engineering team gave a figure: "That's 58 tools consuming approximately 55K tokens before the conversation even starts." — that much context burned before the conversation truly starts. They've also seen more extreme cases internally: "At Anthropic, we've seen tool definitions consume 134K tokens before optimization."[^S9] The more crowded the context, the less room the model has left to reason about the actual task.

The second problem that comes with a high tool count has nothing to do with tokens: choosing gets harder. Pile up several tools with similar functions and the model has to spend an extra step just on "which one do I use," with the odds of getting it wrong climbing along with the tool count — "More tools don't always lead to better outcomes."[^S8] That's also why the earlier sections kept stressing that a description has to spell out the boundary.

The reverse — granularity too coarse — doesn't work either. A "file operations" tool that crams read, write, delete, and edit into one input_schema and distinguishes behavior with an `action` parameter forces the model to first guess the right `action` value, then guess which parameters to fill — more error-prone than splitting into single-responsibility tools like `fs_read_file` and `fs_write_file`. The practical trade-off: first split tools along Lesson 3's five types, then, once the count grows, control the odds of a wrong pick with namespacing and precise descriptions — rather than stacking one do-everything tool to keep the count down.

<!-- exercises -->
## 💻 Exercises

### Level 1: Rewrite a Vague Tool Definition

A project has a "write file" tool, currently defined like this:

```json
{
  "name": "write_file",
  "description": "Write a file",
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

The toolbox also has an `edit_file` tool that does one thing: make local replacements inside an existing file. The model often calls `write_file` when it should call `edit_file` for a small change, overwriting the entire file.

Rewrite `write_file`'s description and input_schema so that:

1. The description makes clear this tool **overwrites the whole** file's contents, and points to `edit_file` for local changes
2. The input_schema adds an enum-constrained parameter that distinguishes "create when the file doesn't exist" from "overwrite when the file already exists," so the model doesn't accidentally overwrite a file it shouldn't touch
3. Check: if the model gets "change the port number in config.json to 8080," would it still reach for `write_file`?

<!-- rubric -->
- The description explicitly states the "overwrite the whole file" behavior and names edit_file as the alternative for local changes
- The input_schema has one enum-constrained parameter that distinguishes create from overwrite
- You can explain why this change lowers the odds of "calling write_file when edit_file was the right choice"

<!-- answer -->
A reference version:

```json
{
  "name": "write_file",
  "description": "Create a new file, or overwrite the entire contents of an existing file. If you only need to change a small part of a file (e.g. one config value, one line of code), use edit_file to make a local replacement instead — don't use this tool to overwrite the whole file.",
  "input_schema": {
    "type": "object",
    "properties": {
      "path": { "type": "string", "description": "Path of the target file" },
      "content": { "type": "string", "description": "The complete file contents to write" },
      "mode": {
        "type": "string",
        "enum": ["create_new", "overwrite_existing"],
        "description": "create_new: the file must not exist, otherwise error; overwrite_existing: allow overwriting a file that already exists"
      }
    },
    "required": ["path", "content", "mode"]
  }
}
```

Key changes: the description spells out "overwrite the whole file" and "use edit_file instead," so when the model sees a local-change request like "change the port number" it will consider edit_file first. The mode enum forces the model to state up front whether this is a create or an overwrite, so even if it still picks write_file, it won't overwrite an existing file without realizing it.

<!-- hint -->
Look back at the opening example: it solves "picked the wrong tool" by naming the alternative tool directly in the description. This exercise is the same pattern, just swapped to write_file and edit_file.

<!-- hint -->
Which parameter the enum goes on depends on what you want the model to think through before it calls. Here it's "is this operation actually meant to overwrite an existing file," so the enum should constrain that, not an unrelated parameter like file type.

### Level 2: Diagnose a Call That Failed Because of a Bad Return Value

Below is a simplified but real round-trip record. A "run tests" tool was called 3 times in a row, with identical inputs each time:

```
Call 1: { "name": "run_tests", "input": { "suite": "unit" } }
Returns: { "content": "Error: connect ECONNREFUSED 127.0.0.1:5432", "is_error": true }

Call 2: { "name": "run_tests", "input": { "suite": "unit" } }
Returns: { "content": "Error: connect ECONNREFUSED 127.0.0.1:5432", "is_error": true }

Call 3: { "name": "run_tests", "input": { "suite": "unit" } }
Returns: { "content": "Error: connect ECONNREFUSED 127.0.0.1:5432", "is_error": true }
```

Answer these:

1. Why does the model repeat the call 3 times with identical parameters instead of trying something different?
2. What does the model need to do to resolve the real cause (the database connection was refused; nothing is listening on port 5432)? Assume the toolbox also has a `start_service` tool.
3. Rewrite the `content` field into an error message that would get the model to switch to the right approach before the second call.

<!-- rubric -->
- Points out that the original error message is only a raw log with no clue about "what to do next," so the model can only repeat the retry
- Correctly connects the root cause (a dependency service isn't running) to the available tool (start_service)
- The rewritten message includes the failure reason, the suggested action, and the specific tool name to call

<!-- answer -->
1. The original return value just passes the underlying log (`ECONNREFUSED 127.0.0.1:5432`) straight back, and `is_error: true` only tells the model "this failed" — not why it failed or what to do next. The model can only assume it's a transient issue and try again with the same parameters. This is exactly what the MCP spec's "provide actionable error messages to the model" is meant to avoid: without actionable information there's no self-correction, only repetition.

2. Port 5432 is PostgreSQL's default port, and `ECONNREFUSED` means the database service the tests depend on isn't running. The model needs to first call `start_service` (assume it can take a service name, e.g. `postgres`), confirm it started, then call `run_tests` again.

3. A reference version:

```json
{
  "content": "Test run failed: can't connect to the local database service (nothing responding on port 5432); the postgres service the tests depend on is not currently running. Call start_service to start the postgres service first, confirm it started, then call run_tests again.",
  "is_error": true
}
```

<!-- hint -->
Write "what the model saw" and "what the model should do" separately first — the raw log only answers the first half.

<!-- hint -->
A good error message should read like an answer to "which tool do I call next, and what do I pass," not like a debugging note for a human engineer.

<!-- /exercises -->

## Recap

- The description is the only text the model sees when it picks a tool and fills in parameters; spelling out "what it does, when to use it, when not to" matters more than writing it elegantly
- Adding a service prefix (namespacing) to the name helps the model rule out a big batch of irrelevant options first, once there are a lot of tools
- In input_schema, type, enum, and required are real constraints in validation terms while title and description are only notes; enum plus required drives the odds of arbitrary values very low, and turning "invalid inputs simply never get generated" into a hard guarantee takes additionalProperties: false plus strict mode[^S20]
- Return values — especially on failure — need to spell out "why it failed" and "what to do next" so the model can self-correct instead of retrying verbatim
- More tools isn't better: the definitions eat context tokens, and the more similar the tools the easier it is for the model to pick wrong; granularity isn't "finer is better" either — split by function first, then control the odds of a wrong pick with clear naming and descriptions

[>> Lesson 5: Permissions and Safety: The Boundaries of What an Agent Can Do](./05-permissions-and-safety.md)
