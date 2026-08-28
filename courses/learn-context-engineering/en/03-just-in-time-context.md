# Lesson 3: Just-in-Time Retrieval: Letting the Agent Fetch Its Own Context

> Learning goals:
> - Use the attention budget to price the hidden cost of preloading, and decide whether a given piece of material belongs in the initial context
> - Describe how just-in-time retrieval works: lightweight identifiers, metadata as signal, relevant context discovered progressively through exploration
> - Draw the hybrid strategy for one concrete agent — what gets preloaded, and what stays behind as an identifier to be fetched at run time
>
> Prerequisites: You've read Lessons 1 and 2, and you have the harness loop from course 7 of this series, "Agent Harness Fundamentals: Loops and Control," within reach | Prev: [Lesson 2 <<](./02-anatomy-of-context.md) | Next: [Lesson 4 >>](./04-compaction-and-notes.md)

## First, Resist the Urge to Cram It All In

Say you're building a Q&A agent for a codebase: 200 source files in the repo, and users ask things like "where is this function defined" or "what breaks if I change this config." The obvious move is to read all 200 files and paste them into the initial context — context windows are big now, it'll fit.

It fits. That doesn't mean it belongs. Lesson 1 covered why: models parse large volumes of context by drawing on an "attention budget," and "Every new token introduced depletes this budget by some amount."[^S1] The arithmetic only gets worse as you go: "as the number of tokens in the context window increases, the model's ability to accurately recall information from that context decreases."[^S1] The saving grace is that this is a slope, not a ledge — "some models exhibit more gentle degradation than others, this characteristic emerges across all models," and together these factors "create a performance gradient rather than a hard cliff."[^S1] Which brings back Lesson 1's conclusion, worth repeating here: "context, therefore, must be treated as a finite resource with diminishing marginal returns."[^S1]

Back to those 200 files. A user asks one specific question, and maybe two or three files are genuinely relevant; the hundred-odd thousand tokens carried by the other 197 aren't harmless scenery. They compete for attention with the content that matters, out of the same budget. Worse, the agent runs in a loop, and "An agent running in a loop generates more and more data that could be relevant for the next turn of inference."[^S1] If the initial context is already seven-eighths full, the loop hits the wall after a handful of turns.

So the question becomes: when do you put material directly in front of the model, and when do you just tell it where the material lives and let it go get it? That's this whole lesson.

## The Two Strategies, Side by Side

Start by stating each one plainly.

**Preloading**: before inference begins, everything that might be needed goes into the initial context. The model sees all of it on turn one and never has to retrieve anything.

**Just-in-time retrieval**: the initial context holds no source material, only lightweight identifiers — the approach is to "maintain lightweight identifiers (file paths, stored queries, web links, etc.)"[^S1] and let the agent load content through tools at run time, as needed.

| | Preload | Just-in-time retrieval |
| --- | --- | --- |
| Initial context | Large | Small |
| When the material arrives | In front of the model on turn 1 | Costs one to several tool-call turns first |
| Where the tokens go | Mostly on "might be useful" | On "definitely needed right now" |
| Typical failure mode | Attention gets diluted; key content drowns | Retrieval wanders and spins, burning turns and budget |

Think about how you actually work: you haven't memorized the codebase. What you carry around is "auth logic lives in the auth directory," "config parsing is probably in config.js" — an index that points at content, and you open the file when you need the detail. Just-in-time retrieval hands that working style to the agent.

But look at the last cell of that table again: retrieval isn't free. Every just-in-time fetch is a full tool-call round trip — the model issues the call, the harness runs it, the result comes back, the model reasons again. In course 7 of this series, "Agent Harness Fundamentals: Loops and Control," you fitted your harness with two valves, max turns and a budget cap; retrieval spends exactly what those two valves govern. So "always just-in-time" isn't the answer either. It's a bill to be calculated, and the trade-off framework later in this lesson does the math.

## How Just-in-Time Retrieval Actually Works

Three things make it run: a set of identifiers (so the model knows what exists and roughly where), a few retrieval tools, and a loop that permits multiple turns of exploration. Put together, this "allows agents to incrementally discover relevant context through exploration."[^S1]

Here's the part that gets underrated: **the identifiers' metadata is itself signal**. File names and directory structure both advertise what content is for and how relevant it's likely to be.[^S1] You don't have to open `tests/refund.test.js` to know what's inside; a `legacy/` directory untouched for two years probably isn't the place to start. Anthropic's write-up of its multi-agent research system puts the underlying move sharply: "The essence of search is compression: distilling insights from a vast corpus."[^S3] Every step of just-in-time retrieval — listing a directory, searching a keyword, picking a file — performs that compression, narrowing "a broad swath of maybe-relevant" down to "the small piece I actually have to read."

Down to code. Give that codebase Q&A agent three tools; all three implementations are short:

```javascript
import fs from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

const REPO_ROOT = "/path/to/your/repo"; // swap in your own repo

function list_files({ path = "." } = {}) {
  const full = join(REPO_ROOT, path);
  const entries = [];
  for (const name of fs.readdirSync(full).sort()) {
    if (fs.statSync(join(full, name)).isDirectory()) {
      entries.push(name + "/");
    } else {
      entries.push(name);
    }
  }
  return entries.join("\n");
}

function grep({ pattern, path = "." }) {
  const result = spawnSync("grep", ["-rn", pattern, path], {
    cwd: REPO_ROOT,
    encoding: "utf8",
  });
  const lines = result.stdout.split("\n").filter((line) => line !== "");
  if (lines.length > 50) {
    return lines.slice(0, 50).join("\n") + `\n(${lines.length} matching lines total, truncated)`;
  }
  return lines.join("\n") || "(no matches)";
}

function read_file({ path }) {
  const text = fs.readFileSync(join(REPO_ROOT, path), "utf8");
  const lines = text.replace(/\n$/, "").split("\n");
  if (lines.length > 400) {
    return lines.slice(0, 400).join("\n") + `\n(${lines.length} lines total, truncated)`;
  }
  return lines.join("\n");
}
```

Then write the tool definitions to Lesson 2's standard — "self-contained," "extremely clear with respect to their intended use," with "minimal overlap in functionality":[^S1]

```javascript
const TOOLS = [
  {
    name: "list_files",
    description:
      "List the files and subdirectories under a directory in the repo; " +
      "subdirectories end with /. Use it to understand the code structure " +
      "and decide where to look next.",
    input_schema: {
      type: "object",
      properties: {
        path: {
          type: "string",
          description: "Path relative to the repo root; omit to list the root",
        },
      },
    },
  },
  {
    name: "grep",
    description:
      "Recursively search text under a directory and return matching lines as " +
      "file:line:content, up to 50 lines. Use it to narrow the search before " +
      "reading any file.",
    input_schema: {
      type: "object",
      properties: {
        pattern: { type: "string", description: "String or regex to search for" },
        path: { type: "string", description: "Search scope, relative to the repo root" },
      },
      required: ["pattern"],
    },
  },
  {
    name: "read_file",
    description:
      "Read the contents of a single file; anything past 400 lines is truncated. " +
      "Use it only after list_files or grep has confirmed the file is relevant.",
    input_schema: {
      type: "object",
      properties: {
        path: { type: "string", description: "File path relative to the repo root" },
      },
      required: ["path"],
    },
  },
];
```

The system prompt carries only the stable parts: the job, the citation requirement, the behavioral conventions for retrieval. Note that not one line of file content appears in it:

```javascript
const SYSTEM_PROMPT = `You are the Q&A assistant for this code repository.
Every answer must cite specific file paths and line numbers.
Retrieval convention: narrow the scope with list_files or grep first, then
use read_file; read only the files you actually need, one at a time.`;
```

Wire this up to a small e-commerce repo, ask "where does the order refund amount get calculated?", and a typical run looks like this. (The repo contents are illustrative; the shape of each call and the format of each return are fixed by the implementations above. The turn-3 file body is too long to print, so a one-line parenthetical stands in for it.)

```
Turn 1  list_files({ path: "." })
     →  README.md
        src/
        tests/
Turn 2  grep({ pattern: "Refund", path: "src" })
     →  src/payments/refund.js:12:export function calculateRefundAmount(order, policy) {
        src/orders/service.js:6:import { calculateRefundAmount } from "../payments/refund.js";
        src/orders/service.js:88:  const amount = calculateRefundAmount(order, policy);
Turn 3  read_file({ path: "src/payments/refund.js" })
     →  (60 lines in this file; returned in full)
Turn 4  The model stops calling tools and answers directly:
        "The refund amount is calculated in calculateRefundAmount at
        src/payments/refund.js:12; the orders module calls it from
        src/orders/service.js:88."
```

Watch what happened between turns 2 and 3. Grep returned three matching lines, and the model didn't read both files. From the line contents it worked out that the definition sits in `refund.js` while `service.js` is merely the importer and caller, so it opened exactly one file. That's metadata doing the model's first pass of filtering for it: "the metadata of these references provides a mechanism to efficiently refine behavior."[^S1] Across the whole trajectory, what entered the context was one directory listing, three lines of grep output, and one 60-line file — not 200 files.

Two more details reward a second look. The first is the truncation baked into two of the implementations: grep returns at most 50 lines, read_file at most 400. Lesson 2 made the point that tools should be "returning information that is token efficient"[^S1] — retrieval tools are the context's suppliers, and the loop only survives if the suppliers cap their shipments. The second is the failure case: if grep keeps coming up empty, the model may search over and over with different keywords. That is precisely the scenario the idle-spin detection and budget valve from the harness course exist to catch — exploration is good, unbounded exploration isn't.

## Hybrid Is the Normal Case

You might expect the conclusion to be "just-in-time retrieval wins." It isn't. Real systems rarely sit at either pole; the common shape is a hybrid — "retrieving some data up front for speed, and pursuing further autonomous exploration at its discretion."[^S1]

Claude Code, which you use every day, is a live example: "CLAUDE.md files are naively dropped into context up front, while primitives like glob and grep" support just-in-time exploration at run time.[^S1] The official docs describe it plainly — "CLAUDE.md is a special file that Claude reads at the start of every conversation."[^S4] Because it loads every single time, the docs advise keeping only broadly applicable material in it and asking of every single line: "Would removing this cause Claude to make mistakes?"[^S4] If the answer is no, that line should go. The docs put the consequence bluntly: "Bloated CLAUDE.md files cause Claude to ignore your actual instructions!"[^S4]

Skills take a third route — "Claude loads them on demand without bloating every conversation."[^S4] Line those three up and you get a tiered picture of a hybrid strategy:

- **CLAUDE.md**: stable, binding on every turn → preloaded at the start;
- **Skills**: packaged specialist capability, used only for specific tasks → loaded on demand;
- **The codebase itself**: enormous, and only a sliver is needed each time → explored just-in-time via glob and grep.

When you design your own agent, you're drawing a version of that same picture: which material sits in "the CLAUDE.md slot," and which sits in "the codebase slot."

```agentmentor-check
{
  "id": "ctx-zh-03-strategy-tradeoff",
  "label": "Pick a context strategy for a codebase Q&A agent using the attention budget and progressive discovery",
  "prompt": "You're building a codebase Q&A agent over a repo with 200 source files. Colleague A says: \"The context window fits it, so read all 200 files into the initial context — whatever the model needs is right there.\" Colleague B says: \"Don't put a single file in. Give it the file tree and a grep tool and let it find everything on the spot.\" By this lesson's reasoning, which judgment holds up better?",
  "whyHere": "The hybrid-strategy section just landed, and the reader needs to hold both edges at once — refute full preloading with the attention budget, and refute pure just-in-time with the cost of retrieval — instead of swapping one extreme for the other.",
  "mode": "single",
  "choices": [
    {
      "id": "a",
      "text": "A is right: with everything already in front of the model, it never has to go looking, so answer quality is best protected.",
      "correct": false,
      "feedback": "\"It fits\" isn't \"it belongs.\" Every new token depletes the attention budget, and the longer the context, the worse the model's accurate recall from it gets. Out of 200 files, usually only a few bear on any single question; the rest of those tokens dilute attention rather than protect anything."
    },
    {
      "id": "b",
      "text": "B is right: the smaller the initial context the better, and every piece of information should wait until it's needed and then be retrieved.",
      "correct": false,
      "feedback": "Half the direction is right, but this treats retrieval as free. Each fetch is a tool-call round trip costing latency, tokens, and the harness's turn budget. Small, every-turn material like behavioral conventions or the top-level directory shape gets more expensive, not less, if the model must rediscover it each session."
    },
    {
      "id": "c",
      "text": "Both went to an extreme: preload the small, stable material needed every turn, and leave identifiers for the rest so the model retrieves on demand.",
      "correct": true,
      "feedback": "That's the hybrid trade-off exactly: preloading buys speed, retrieval saves budget. Behavioral conventions and the top-level directory map are small and stable enough to sit in the initial context; the 200 files leave only their paths as identifiers, and the model narrows in using file names and grep results. Both costs stay bounded."
    }
  ]
}
```

## A Trade-Off Framework You Can Apply Right Away

For each candidate piece of material, ask two questions:

1. **Is it stable?** Does the content stay put over time, independent of any particular question?
2. **Is it used on every turn — or nearly every turn?**

Two yeses → **preload**. Typical cases: coding standards, core business constraints, the agent's rules of conduct, the top-level directory structure. Material like this is usually small too — if something billed as "needed every turn" turns out to be enormous, start by doubting that it really is needed every turn.

Any no → **leave an identifier and retrieve just-in-time**. Typical cases: a module's full source (needed only for questions about that module), historical tickets (consulted only when chasing a specific failure), a long design doc (opened only when aligning on an approach).

Then put the cost of retrieval on the scale and check the result once more: each fetch adds a round trip, adds latency, spends budget. So don't stubbornly push small, frequently used material into retrieval — trading 600 words of preload space for an extra `list_files` turn in every session is a losing deal. Going the other way, preloading a 2,000-line script that probably won't come up is pure attention-budget burn.[^S1]

The Claude Code docs put the stakes in one line: "The context window is the most important resource to manage."[^S4] Preloading and just-in-time retrieval aren't rival doctrines. They're the two hands you manage that resource with.

## This Lesson Skips RAG, On Purpose

Say "retrieval" and many people jump straight to vector stores, embeddings, RAG pipelines. This lesson deliberately doesn't touch any of it — the course README draws the boundary, and "just-in-time retrieval" here means something plainer: an agent holding filesystem and search tools, pulling content on demand.

That isn't pedagogical laziness. File paths come with hierarchy and naming semantics for free, grep results are precise and explainable, and the pair is already enough to sustain a full loop of incrementally discovering relevant context through exploration.[^S1] Anthropic's guidance on building agents offers a matching sense of proportion: "you should consider adding complexity only when it demonstrably improves outcomes."[^S2] Note the verb — *consider*. That's a posture of weighing, not a prohibition. For a codebase Q&A agent, walking the simplest path (filesystem plus grep) until you can measure where it falls short fits that posture better than standing up vector retrieval on day one.

One thread to leave hanging: however disciplined your just-in-time retrieval is, an agent grinding through a long task keeps accumulating tool results turn after turn,[^S1] and the context window creeps toward its ceiling regardless. At that point, being good at "taking less" stops being enough — you also need to be good at throwing things out and writing things down. That's Lesson 4.

<!-- exercises -->
## 💻 Exercises

### Level 1: Sort a Context Inventory

You're designing the context for an internal on-call ops Q&A agent, and five candidate materials are on the table:

1. The on-call handbook (about 500 words — the hard lines every answer must respect, such as never handing out production database passwords);
2. All 800 historical incident tickets (each a few hundred to a few thousand words);
3. The service catalog's top-level structure (40 service names plus a one-line responsibility each, about 600 words);
4. One service's complete deployment script (about 2,000 lines, relevant only to deployment questions);
5. A mapping table from common alert keywords to ticket search queries (about 30 lines).

Using this lesson's framework, sort each item into "preload" or "leave an identifier, retrieve just-in-time," and give a one-line reason for each.

<!-- rubric -->
- Puts the small, worth-resident materials (1, 3, 5) into preload, with reasons landing on "small, reused often, or itself an entry point into retrieval"
- Puts the large, branch-specific materials (2, 4) into just-in-time retrieval, and notes that preloading them spends attention budget on content that mostly goes unused
- At least one place mentions the precondition for just-in-time retrieval: the agent needs a usable entry point — a search tool, a query mapping, or file paths as identifiers

<!-- answer -->
1. **On-call handbook → preload**. The hard lines bind every single answer, and 500 words is tiny. Both questions come back yes.
2. **800 tickets → leave an identifier**. Far too large, and only a handful matter when chasing one specific failure; preloading all of them spends attention budget on content that probably never comes up. Give the agent a "search tickets by keyword" tool as the entry point and let it pull whichever it needs.
3. **Service catalog top-level structure → preload**. A 600-word top-level map that nearly every question leans on to figure out which service to investigate — the classic small-and-frequent case.
4. **2,000-line deployment script → leave an identifier**. Only deployment questions need it; keep the script path around and pull it with a file-reading tool when a relevant question shows up.
5. **Alert mapping table → preload**. Thirty lines is minuscule, and the table is itself the entry metadata for just-in-time retrieval — it tells the model which query to search tickets with for a given class of alert. Preloading it is what makes item 2's retrieval work.

<!-- hint -->
Ask both questions of each material first: is it stable, and is it used every turn? Only two yeses put preloading on the table.

<!-- hint -->
Large materials don't get thrown away — the job is to decide what "entry point" you leave the agent. Paths, queries, and mapping tables all count as lightweight identifiers.

### Level 2: Add Retrieval Tools to Your Harness

Pull out the harness loop you wrote in course 7 of this series, "Agent Harness Fundamentals: Loops and Control," register this lesson's three tools (list_files, grep, read_file), point them at a real repository of your own, and turn it into a Q&A agent. Requirements:

- The system prompt preloads stable information only — job, citation requirement, retrieval conventions — and no file contents;
- All three tool descriptions are self-contained and non-overlapping, and their returns are truncated;
- Run a real question, record the tool-call trajectory, and check whether it shows progressive discovery from coarse to fine.

<!-- rubric -->
- The system prompt stays a small stable set (job + citation requirement + retrieval convention), with no file contents preloaded
- All three tool descriptions are self-contained, clearly purposed, and non-overlapping; grep and read_file both truncate their returns by line count
- The submitted trajectory shows the order "narrow with list_files/grep first, then read_file on a small number of files," and identifies which step turned on metadata like a file name or directory structure

<!-- answer -->
A reference approach (key points plus skeleton):

1. Take the tool functions and the `TOOLS` definition straight from this lesson's "How Just-in-Time Retrieval Actually Works" section and change `REPO_ROOT` to your repo path; leave the grep 50-line and read_file 400-line truncations alone.
2. Copy the `SYSTEM_PROMPT` from the main text as-is — it holds only three things, the job, the citation requirement, and the retrieval convention, with no file contents.
3. Register them with the harness: at the tool-dispatch point in your course 7 loop, route each call to the matching function by tool name:

```javascript
const HANDLERS = { list_files, grep, read_file };

// where the harness loop handles tool_use:
const result = HANDLERS[toolName](toolInput);
```

4. A trajectory that passes (take "where does the config get loaded from" as the question) should look like: `list_files({ path: "." })` reveals `config/` or `src/` → `grep({ pattern: "loadConfig", path: "src" })` finds the definition and the call sites → `read_file` opens only the file holding the definition → answer, with path and line number. Two self-checks: the narrowing happened before any file was read, and at least one step was steered by a directory or file name (metadata) rather than by reading candidate files one after another.

<!-- hint -->
All three implementations are in the main text. Change `REPO_ROOT` and they connect to your harness — no rewriting required.

<!-- hint -->
If the agent opens with read_file on a big file, go back and tighten the retrieval convention in the system prompt, or state in read_file's tool description that it's for use only after grep or list_files has confirmed relevance.

<!-- /exercises -->

## Recap

- "It fits" is not a reason to preload: every new token depletes the attention budget, and as token count grows the model's accurate recall from context declines — a performance gradient rather than a hard cliff; context has to be managed as a finite resource with diminishing marginal returns[^S1]
- How just-in-time retrieval works: the context keeps only lightweight identifiers (file paths, stored queries, web links), and tools load content on demand at run time; the identifiers' metadata — file names, directory structure — signals relevance by itself, which lets agents incrementally discover relevant context through exploration[^S1]
- Retrieval isn't free: each fetch is a tool-call round trip, spending latency plus the turns and budget governed by the control valves from the harness course
- Hybrid is the normal case: retrieve some data up front for speed, and let the model pursue further autonomous exploration at its discretion[^S1]. Claude Code is the ready-made reference — CLAUDE.md dropped in whole at the start, skills loaded on demand, the codebase explored on the spot via glob and grep[^S1][^S4]
- The framework is two questions: stable? needed every turn? Two yeses means preload, otherwise leave an identifier; don't force small-and-frequent material into retrieval, and don't force large-and-rare material into preload
- "Just-in-time retrieval" in this lesson means on-demand pulls through filesystem and search tools, with no vector store involved; before you bring in heavier retrieval machinery, keep that sense of proportion in mind — consider adding complexity only when it demonstrably improves outcomes[^S2]

[>> Lesson 4: Compaction and Notes: Context Management for Long Tasks](./04-compaction-and-notes.md)
