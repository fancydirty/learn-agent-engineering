# Lesson 1: From "Just Talking" to "Taking Action": Why Agents Need Tools

> Learning goals:
> - Say what a "tool" actually is inside an Agent, and how it differs from an ordinary block of reply text
> - Recognize the three things a tool definition has to include at minimum
> - Decide whether a given task actually needs a tool at all
>
> Prerequisites: You can write a basic prompt and have used something like Claude Code | Next: [Lesson 2 >>](./02-one-tool-call-round-trip.md)

## The same sentence, asked twice

You're in a project with a few dozen files, and you say this to an Agent:

> "Find every console.log in the project."

**The first time, this Agent is just a chat box wired to an API, with no tools connected.** Its reply reads like this:

> I can't access your file system directly, but you can run the following command in your terminal to find them:
>
> ```
> grep -rn "console.log" src/
> ```
>
> This recursively searches every file under `src/` for lines containing `console.log` and prints the filename and line number. If your project uses TypeScript, remember to include `.ts`/`.tsx` in the search scope.

Nothing wrong with that — it's even thoughtful. But you didn't ask for instructions on how to search, you asked for the results. When this turn ends, you still don't know which files in your project actually contain `console.log`. You have to go open a terminal and type that command yourself.

**The second time, same sentence, handed to an Agent with a search tool connected.** Its reply reads like this:

> I searched the project and found 7 occurrences of `console.log`:
>
> - `src/api/client.ts:42`
> - `src/api/client.ts:88`
> - `src/utils/logger.ts:12`
> - `src/components/Cart.tsx:156`
> - `src/components/Checkout.tsx:23`
> - `src/hooks/useAuth.ts:67`
> - `scripts/seed-db.js:5`
>
> The one at `src/utils/logger.ts:12` looks like an intentional logging wrapper; the other 6 look like leftovers from debugging. Want me to clean them up?

Both times the question was word-for-word the same. Same model, same prompt. One thing was different: the second time, this Agent had one extra thing in hand — a **tool**. The first time it could only guess, from knowledge it saw in training, at a command that "probably does the job" and describe it to you. The second time it actually ran a search, saw what's in your project right now, and only then spoke.

What this lesson makes clear is exactly that: what a tool is, what lets it turn an Agent from "talking through an approach" into "actually running the search," and which tasks don't need one at all.

## A tool is a menu the host hands the model

First, correct an instinct: the thing that found those 7 files was not the model. The model has no file system; it can't open a directory or run a regex match on its own. What actually ran that search was the **host program** running the Agent — maybe Claude Code, maybe a few-dozen-line script you wrote that calls the Claude API.

**A tool is the host program's list telling the model "here are the things I can do for you."** Each item spells out three things: what the capability is called, when to use it, and what parameters to pass. [^S3]

Take that search. The tool list the host stuffs into the request looks roughly like this:

```json
{
  "name": "search_files",
  "description": "Search the project source directory for all files matching a string or regular expression, returning the file path and line number of each match. Use this to find specific function calls, variable names, TODO comments, and the like.",
  "input_schema": {
    "type": "object",
    "properties": {
      "pattern": {
        "type": "string",
        "description": "The string or regular expression to search for, e.g. console\\.log"
      },
      "path": {
        "type": "string",
        "description": "The directory to start searching from; defaults to the project root"
      }
    },
    "required": ["pattern"]
  }
}
```

Each of the three fields has its own job: `name` is the identifier the model writes when it picks this tool; `description` is a block of text telling the model what the tool does, when it should be used, and how it behaves; `input_schema` is a JSON Schema that spells out which parameters to pass on a call and what type each one is. [^S3]

The model has never seen your file system, but it has seen this list. It reads in the `description` that this tool "searches the project source directory ... returns the file path and line number," it sees your request "find every console.log in the project," it lines the two up, and it decides to pick this tool and pass `pattern` equal to `console\.log`. This step is the model's work — picking the tool, filling in the parameters — which is what a language model is best at: reading intent and matching it to the right option.

But once it's picked? Who actually goes and reads the files?

## The model only proposes; the host does the work

Here's a line, the single most important one in this lesson: **the model never executes anything itself. It only packages "which tool I want to call and what parameters to pass" into a chunk of structured data and hands it back to the host program; the code that actually opens files, runs commands, and sends requests is the host program's own.** [^S4]

For that search, the full sequence goes like this:

1. The model sees your question and the `search_files` tool list, and decides to call it with `{"pattern": "console\\.log"}`. It wraps that decision up as the content of this turn's reply — note that there are no search results in the reply, because the model has no search results; it only made a request.
2. The host program (Claude Code, or the script you wrote) receives that data, sees "this is a tool call," and goes and executes it itself — actually runs the search on disk and gets those 7 matches.
3. The host program puts the search results back into the conversation history and asks the model once more: "here's the result of that call, keep going."
4. Only now does the model see the real search results for the first time, and from them it writes the reply you saw.

OpenAI's docs call this "a multi-step conversation between your application and a model": when the model calls a function, the responsibility for executing it and returning the result sits on your application's side, not the model's. [^S1] Anthropic puts it more bluntly: "The model never executes anything on its own. It emits a structured request, your code (or Anthropic's servers) runs the operation, and the result flows back into the conversation." [^S4]

Worth adding: "who executes" splits one layer further. The docs call the tools your program has to run itself "client tools," and the ones Anthropic's own servers run for you (web search, for example) "server tools." [^S2] Either way, the model's side of the behavior is unchanged — it still only proposes, never acts; the only difference is who turns the proposal into a real action.

Claude Code, which you're using, makes this concrete: it is exactly this kind of host program, with a built-in set of tools — read a file, write a file, run a terminal command, search code, and so on. Every time the model decides which one to use, it's choosing from this fixed list, not inventing a new capability out of thin air. [^S6] Where this list comes from and what each item looks like, we'll go through one by one in Lesson 3.

```agentmentor-check
{
  "id": "tool-zh-01-who-runs-it",
  "label": "Who actually ran that search",
  "prompt": "Back to the console.log example at the start. In the second reply, the Agent says \"I searched the project and found 7 occurrences.\" Behind that sentence, who performed the \"search\"?",
  "whyHere": "You just drew the line between \"the model only proposes, the host executes,\" and the Agent's reply is written in the first person, which makes it easy to assume the model read the files itself. This is the moment to break that misconception with the exact same example.",
  "mode": "single",
  "choices": [
    {
      "id": "a",
      "text": "The model read the project files itself and ran the search",
      "correct": false,
      "feedback": "The model has no file system; it can't open a directory or run a regex match on its own. All it did was decide to call the search_files tool and fill in pattern as console\\.log, and that decision got packaged into structured data and handed back to the host program. \"I searched\" is wording the model produced after seeing the results — it doesn't mean the model did the searching."
    },
    {
      "id": "b",
      "text": "The host program ran the search, handed the results back to the model, and only then did the model write that reply",
      "correct": true,
      "feedback": "Right. The model only made the request \"call search_files, pattern is console\\.log\"; the host program (Claude Code, or the script calling the API) is what actually opened the file system and ran the match. Once the host put the 7 matches back into the conversation, the model saw them for the first time and wrote the final reply from them."
    },
    {
      "id": "c",
      "text": "Both times the model did it itself; the second time it just answered in a smarter way",
      "correct": false,
      "feedback": "Both turns used the same model, and its own ability didn't change. The difference is that the second time it had a tool, which let the host program go touch your project's real contents for it. That's not the model getting smarter — it's the model gaining a channel to fetch outside information and take outside action."
    }
  ]
}
```

## Not every task needs a tool

After watching that process, it's easy to swing to the other extreme: since tools are this useful, why not just give the Agent a tool for everything? Don't. The test is simple — ask yourself one question: **does the model already have the information or action this task needs, in hand?**

Some tasks the model can handle on its own, with no contact with the outside world:

- Rewrite a passage to be more concise
- Summarize a set of meeting notes
- Translate a chunk of Python into JavaScript with the same logic
- Write a new piece of code straight from a requirement you describe (before it touches any existing file in your project)

The knowledge these draw on, the model saw plenty of similar examples for during training; language ability alone finishes them. Force a tool onto this kind of task and the model still has to decide, each time, "do I call it or not this round" — one more decision is one more chance to pick wrong. Pure waste.

Other tasks the model can't do no matter how clever it is, because what it's missing isn't ability — it's **information**:

- "How many console.log are in my project right now" — the model's knowledge stops at its training moment; it knows nothing about the file contents on your disk this instant
- "What did that command just print" — the command hasn't run, the output doesn't exist yet, and the model can't know it in advance
- "What does this endpoint return right now" — that's the response the server gives this moment, unrelated to any example the model saw in training

For this kind of task, no matter how detailed or leading you make the prompt, the model can't conjure a real answer, because it simply doesn't have the data in hand. The only way is to give it a channel so the host program can go fetch it — and that's the reason tools exist.

What those five kinds of tools look like — read, write, run commands, search, call external services — we'll take apart one by one in Lesson 3; for this lesson, all you need to hold onto is how to ask the "does this need a tool" question.

<!-- exercises -->
## 💻 Exercises

### Level 1: Sort six tasks

Below are six tasks. For each, decide whether the Agent needs a tool to actually get it done, and explain why (hint: ask yourself "does the model have this information in hand").

1. "Translate this English email into Chinese, and keep the tone polite."
2. "Check whether last night's 3 a.m. deployment logs have any errors."
3. "Write a regular expression that validates email format."
4. "Check which version of React this repo depends on in its `package.json`."
5. "Break this requirements doc into 5 acceptance criteria."
6. "Call the weather API and see whether it'll rain in Beijing tomorrow."

<!-- rubric -->
- All six tasks get a clear "needs" or "doesn't need" call
- Every call comes with a reason, not just a verdict
- For the "needs" calls, it's clear what information or action ability the model is missing

<!-- answer -->
1. Doesn't need. Translation and tone adjustment are pure language ability; the model already has everything required to do it.
2. Needs. The log file's contents are real data from this moment, which the model couldn't have seen in training; it has to read them with a tool.
3. Doesn't need. Writing a regex is a language / code-generation task the model has seen plenty of examples of; no current external state is involved.
4. Needs. The exact version number written in `package.json` right now is your project's real content this instant; the model has to read the file with a tool to know it.
5. Doesn't need. This is a structured rewrite of content already given; the information in the model's hands is already enough.
6. Needs. Weather data is a real-world state at this moment, and it takes an actual network request to fetch; the model can't generate it out of nothing.

<!-- hint -->
When a question contains words pointing at a specific moment — "now," "just," "this time," "last night" — it usually means what's wanted is the real state right now, not the general knowledge the model saw in training.

<!-- hint -->
Conversely, if the task is only "turn A into B" (rewrite, translate, summarize, generate new content from a description) and A is already fully written out in what you said, a tool usually isn't needed — the raw material in the model's hands is enough to finish on its own.

### Level 2: Draft a tool definition

The task is: "let the Agent look up the latest published version number of an npm package on npmjs.com." Following the way the `search_files` tool definition is written in this lesson, draft a tool definition for this capability, with at least the three fields `name`, `description`, and `input_schema`. You don't have to produce valid, runnable JSON Schema — just think the three fields through clearly and get the rough format right.

<!-- rubric -->
- `name` is an identifier whose purpose is legible (not something meaningless like "tool1")
- `description` makes clear what the tool does and when it should be used
- `input_schema` defines at least one required parameter (the package name, say), with the parameter's type and purpose spelled out

<!-- answer -->
Example answer:

```json
{
  "name": "get_npm_package_version",
  "description": "Look up the latest version number currently published on npmjs.com for a given npm package. Use this to confirm whether a newer version of a dependency is available, or to verify that a given version number actually exists.",
  "input_schema": {
    "type": "object",
    "properties": {
      "package_name": {
        "type": "string",
        "description": "The name of the npm package to look up, e.g. react or lodash"
      }
    },
    "required": ["package_name"]
  }
}
```

<!-- hint -->
The half-sentence most easily dropped from `description` is "when to use it" — just "look up a version number" is too vague; better to add a typical use case so the model can judge whether to pick it this time.

<!-- hint -->
In `input_schema` the package name has to be a required parameter (put it in the `required` array), because without a package name the tool can't run at all; if you also want an optional parameter (a registry address, say), remember not to stuff it into `required` too.

<!-- /exercises -->

## Recap

- **A tool is a list of callable capabilities the host program exposes to the model**, each one spelling out at least `name`, `description`, and `input_schema`, which the model uses to judge whether to call it and what to pass. [^S3]
- **The model only proposes; it never executes itself.** It packages "which tool to call, what parameters to pass" into structured data and hands it back to the host program; the code that actually opens files, runs commands, and sends requests is the host program's own. [^S1][^S4]
- The result takes a round-trip: after the host finishes executing, it puts the result back into the conversation, and only then does the model see the real result and write the final reply — the full round-trip of that step is the next lesson's topic.
- To decide whether a task needs a tool, one question is enough: **does the model already have the information or action this task needs, in hand?** If not, you need a tool; if it does, adding one is a waste.
- The same question, with or without a tool, can produce wildly different results — without a tool the Agent can only lean on general knowledge from training to talk you through an approach; with one it can actually touch what your project looks like right now.

[Lesson 2: The Full Round-Trip of a Tool Call >>](./02-one-tool-call-round-trip.md)
