# Lesson 3: External Memory: Files and Retrieval

> Learning goals:
> - Explain why memory that has to survive across sessions must be written outside the window, into files
> - Tell apart human-written memory files like CLAUDE.md from model-written memory files like Auto memory
> - State the tradeoff between "retrieve on demand" and "load everything up front"
> - Add a safe path boundary check to a tool that reads and writes memory files
>
> Prerequisites: finished Lesson 2, you understand the difference between compaction and tool-result clearing | Prev: [Lesson 2 <<](./02-managing-conversation-history.md) | Next: [Lesson 4 >>](./04-structured-task-state.md)

## When the Session Ends, Everything in the Window Is Gone

Lesson 2 closed on an unsolved problem: a scheduling assistant that a user told last week "I don't eat spicy food," then this week the user opens a fresh conversation with an empty window — and the agent has no idea that sentence was ever said.

Truncation, compaction, and tool-result clearing can't fix this. All three of those deal with "we ran out of room inside this one conversation." The problem here is different: this conversation had none of last week's content in it from the very first turn. The official Cookbook draws the line bluntly — clearing and compaction both operate on the current context; neither helps when a new session starts and the window is empty. Memory solves that problem[^S2]. The window, as a container, only lives as long as this one session. Close the session, and anything in the window that wasn't moved elsewhere is truly gone.

The only way to keep information alive past this session is to write it, before the session ends, somewhere outside the window — into **external memory**: storage that isn't bound to this conversation's lifecycle, usually just a file on disk. When the next session starts, you read that file back and load its contents into the new context window.

## CLAUDE.md: Human-Written, Loaded in Full Every Time

The most direct pattern for external memory is to have a human maintain a **memory file**, kept in the project and read in full at the start of every session. CLAUDE.md in Claude Code is the representative case: the official docs say a CLAUDE.md file is loaded into the context window at the start of every session, spending tokens right alongside the conversation itself, and the recommended size target is to keep each file under 200 lines — the longer the file, the more context it consumes and the lower the agent's adherence to instructions.[^S3] Note that 200 lines is a soft recommendation; the real hard limit is 4 MiB: a CLAUDE.md larger than that is skipped entirely.[^S3]

```markdown
# CLAUDE.md

## Code style
- Indent with 2 spaces, never tabs
- Prefer const; reach for let only when you actually have to

<!-- This note is for future me. It doesn't need to be in the agent's context. -->
## Internal notes
- Gotcha from the last payments-module refactor: xxx
```

One detail in this file is worth noticing: the official docs explain that **block-level HTML comments** in CLAUDE.md are stripped before the content is injected into the agent's context.[^S3] In other words, whatever you write inside `<!-- -->` is visible when a human opens the file, but the version the agent reads doesn't include that comment — which gives a human a way to "leave myself a note without spending the agent's token budget."

CLAUDE.md has another property that ties directly back to the compaction from Lesson 2: the docs note that a project-root CLAUDE.md survives compaction — after `/compact`, Claude re-reads it from disk and re-injects it into the session.[^S3] Put differently, a file like this isn't "incidentally preserved" by compaction; it's separately re-read and re-injected — it doesn't depend at all on whether that compaction kept its content in the summary.

```agentmentor-check
{
  "id": "mem-zh-03-claudemd-size",
  "label": "Judge whether a memory file should grow without limit",
  "prompt": "Someone figures the more complete CLAUDE.md is, the better, so they stuff in the project's full requirements doc, its entire decision history, and a detailed writeup of every module — 2000 lines in all. What's the problem with doing that?",
  "whyHere": "We just covered that CLAUDE.md loads in full at the start of every session and that 200 lines is the official size target. This checks whether the learner is treating a memory file as a \"the more complete the better\" knowledge base, without realizing it spends token budget itself and drags down instruction adherence.",
  "mode": "single",
  "choices": [
    {
      "id": "a",
      "text": "No problem. The more complete the memory file, the more background the agent has, and the more accurate its answers get.",
      "correct": false,
      "feedback": "Not quite. CLAUDE.md is loaded in full at the start of every session, and 200 lines is the official size target — go past it and you spend more context and lower the agent's adherence to instructions. \"Remembering more\" isn't the same as \"using it well,\" which is exactly the context rot from Lesson 1 showing up in the specific setting of a memory file."
    },
    {
      "id": "b",
      "text": "Yes, there's a problem: the longer the file, the more context it takes, and the docs plainly say long files lower the agent's adherence to instructions.",
      "correct": true,
      "feedback": "Right. CLAUDE.md loads in full every session, and 200 lines is the official size target — the longer the file, the more context it burns and the lower the agent's adherence (the real hard limit is 4 MiB, and anything larger is skipped entirely). Information that changes often or runs large belongs behind on-demand retrieval, not dumped into a file that loads in full every single time."
    },
    {
      "id": "c",
      "text": "No problem. As long as the contents are accurate, length won't affect how the agent performs.",
      "correct": false,
      "feedback": "Length affects performance directly. CLAUDE.md's contents load into context alongside this conversation and spend the same token budget. An overly long file isn't just \"taking up room\" — the docs plainly say it lowers the agent's adherence to instructions, which isn't a detail you can wave off."
    }
  ]
}
```

## Auto memory: Model-Written, Retrieved on Demand

CLAUDE.md is human-written and loaded in full every time. There's a complementary pattern: let the model write down what's worth remembering as the conversation goes, storing it in its own memory files — Claude Code calls this mechanism **Auto memory**. Its division of labor with CLAUDE.md is complementary, and a comparison table puts the difference plainly: CLAUDE.md is written by you, Auto memory is written by Claude.[^S3]

Memory the model writes itself usually splits into two layers: an index file (say, `MEMORY.md`) plus a pile of specific memory files broken out by topic. The index file isn't loaded without limit either — the rule the docs give is: at the start of every conversation, only the first 200 lines of `MEMORY.md`, or the first 25KB, whichever comes first, get loaded; content past that threshold is not loaded at session start.[^S3]

That's **retrieval on demand**: at the start of a session the agent sees only the index entries' summaries (something like "the detailed notes on this topic live in some file"), not the full contents of each specific memory file. The docs are direct about it: topic files aren't loaded at startup; Claude reads them on demand with its standard file tools when it needs the information[^S3]. Only when the current task actually calls for a given topic does that specific memory file's content get pulled into this round's context window.

Side by side, CLAUDE.md and Auto memory handle two different dimensions of memory:

- **CLAUDE.md** — human-curated, size-disciplined rules and conventions that apply every time; a fit for stable information along the lines of "this is just how the project is supposed to work," loaded in full up front.
- **Auto memory** — specific details that may be large in number and only matter for particular tasks; a fit for on-demand retrieval, so window budget isn't wasted on memory this task doesn't need.

Both are external memory. The only differences are "who writes it" and "when it gets loaded" — which echoes the mental model from Lesson 2: the point of memory is to move information out of the window so it survives across sessions, and whether that information is loaded in full up front or retrieved on demand comes down to how stable it is and how often it's used.

```agentmentor-check
{
  "id": "mem-zh-03-on-demand-retrieval",
  "label": "Judge what on-demand retrieval actually solves",
  "prompt": "An agent's Auto memory has piled up 50 topic memory files covering the details of all sorts of past tasks. If every session started by loading the full contents of all 50 into context at once, what goes wrong? And what situation is that exactly what \"retrieval on demand\" is trying to avoid?",
  "whyHere": "We just covered the two-layer structure of an index file plus specific memory files. This checks whether the learner understands the motivation for on-demand retrieval — not that loading everything is technically impossible, but that doing so re-triggers the window-capacity and context-rot problems from Lessons 1 and 2.",
  "mode": "single",
  "choices": [
    {
      "id": "a",
      "text": "It fills the window fast, and most of what's loaded is irrelevant to the current task, re-triggering context rot — which is exactly what on-demand retrieval avoids.",
      "correct": true,
      "feedback": "Right. Load the full contents of all 50 files and the window fills up fast, when this task is probably only related to one or two of them; the rest is noise that re-triggers the context rot from Lesson 1. On-demand retrieval loads only the index summaries first, then fetches the single topic the task actually needs, so window budget isn't spent on memory that won't be used."
    },
    {
      "id": "b",
      "text": "No problem. The memory files hold what the agent itself decided was important, so loading all of it only makes answers more complete.",
      "correct": false,
      "feedback": "\"What the agent decided was important\" is a judgment made at write time; it doesn't mean this task needs all of it. Loading all 50 files fills the window and drags down performance — which is exactly why the docs load only the first 200 lines or 25KB of MEMORY.md and retrieve the rest on demand, not an incidental detail."
    },
    {
      "id": "c",
      "text": "No problem, because the memory files live on disk and don't take up context-window capacity.",
      "correct": false,
      "feedback": "\"Living on disk\" and \"being loaded into this request\" are two different things. Once loaded, the content shows up in messages or the system prompt and counts toward this request's context window all the same[^S1] — the flip side of Lesson 1's \"the model only knows what's in the window.\" Loaded means it costs capacity; it isn't free."
    }
  ]
}
```

## Adding a Safe Boundary to Memory File Reads and Writes

Whether it's a human-written file like CLAUDE.md or a model-written one like Auto memory, once an agent has a tool for reading and writing memory files, there's a concrete engineering question to face: can that tool be talked into reading or writing files outside the project directory?

A path check that only does a string-prefix match looks like it blocks "escape the memory directory" requests, but it has a classic hole. If the memory root is `/project/memory`, a naive `startsWith("/project/memory")` check will also wave through a path like `/project/memory-evil`, because it does start with that string — even though that's a completely different directory sitting outside the memory root. The safe way is to require the path to either equal the root exactly, or start with "the root plus a path separator":

```javascript
const path = require("node:path");
const MEMORY_ROOT = path.resolve("./memory");

async function readMemoryFile({ path: relPath }) {
  const abs = path.resolve(MEMORY_ROOT, relPath);
  const inRoot = abs === MEMORY_ROOT || abs.startsWith(MEMORY_ROOT + path.sep);

  if (!inRoot) {
    return "Refused: path is outside the memory directory, and this tool is not allowed to read files outside it.";
  }

  const fs = require("node:fs/promises");
  return await fs.readFile(abs, "utf-8");
}
```

The combination `abs === MEMORY_ROOT || abs.startsWith(MEMORY_ROOT + path.sep)` is what actually guarantees that only a path "equal to the root itself" or "starting with the root plus a separator" gets through — `/project/memory-evil` won't be mistaken for a path inside `/project/memory`, because it satisfies neither condition. This pattern gets reused directly in Lesson 6 when we build the read/write tools for a persistent memory layer, and Lesson 5 will make clear what kind of attack target a memory file becomes if this boundary check is toothless.

<!-- exercises -->
## 💻 Exercises

### Level 1: Pick the right memory home for a note

For each of the four pieces of information below, decide whether it's a better fit for CLAUDE.md or for one of Auto memory's topic files, and say why.

1. "This project indents with 4 spaces, never tabs" — unchanged since the day the project was created.
2. "Last Wednesday we chased down a production timeout; the root cause was the database connection pool being set too small, and we bumped it to 50 at the time" — a one-off record of a past event that might come in handy for a similar problem later.
3. "In a previous conversation the user mentioned their team's code review process is lint first, then a human review" — only relevant in sessions interacting with this user.
4. "In this conversation the user made a one-off request to change a certain function to a synchronous implementation" — only relevant to this one task; almost certainly won't come up again next session.

<!-- rubric -->
- Item 1 judged as CLAUDE.md, with a reason mentioning "stable, useful every time"
- Items 2 and 3 judged as Auto memory, with a reason mentioning "potentially large, only useful for particular tasks, a fit for on-demand retrieval"
- Item 4 judged as needing no external memory at all, with a reason mentioning "only relevant to this one session, no need to survive across sessions"

<!-- answer -->
Reference answer: Item 1 fits **CLAUDE.md** — it's a convention that's been stable since the project began, useful in every session, matching CLAUDE.md's role of "human-curated, size-disciplined, useful every time." Items 2 and 3 fit **Auto memory** topic files — both are specific historical details that could pile up over time, only needing retrieval when a similar situation comes up, not a fit for loading in full every time, which is exactly the on-demand case. Item 4 needs **no** external memory at all — it only matters for this one session and doesn't need to survive across sessions; writing it to external memory would just be waste. Information like this can stay in the current session's context window, disappear naturally when the session ends, and that's the expected behavior.

<!-- hint -->
There are two tests: is this information "stable, or does it change," and "is it useful every session, or only in particular situations."

<!-- hint -->
Item 4 is easy to misjudge as "should be recorded" — but think back to the problem this lesson opened with: external memory exists to solve "survive across sessions." If a piece of information only matters for this one session, writing it to external memory buys you nothing, it just wastes storage and later retrieval cost.

### Level 2: Diagnose a buggy path check

The code below is trying to restrict a memory-reading tool to files inside the `MEMORY_ROOT` directory:

```javascript
const MEMORY_ROOT = "/project/memory";

async function readMemoryFile({ path: relPath }) {
  const abs = require("node:path").resolve(MEMORY_ROOT, relPath);

  if (!abs.startsWith(MEMORY_ROOT)) {
    return "Refused: path out of range.";
  }

  return await require("node:fs/promises").readFile(abs, "utf-8");
}
```

Find the security hole in this code, give a concrete path example that bypasses the check and reads a file outside `MEMORY_ROOT`, and write the corrected check condition.

<!-- rubric -->
- Points out that using `startsWith` on its own has a same-prefix bypass problem
- Gives a concrete path example that bypasses the check (e.g. resolving into a directory like `/project/memory-evil`)
- The corrected condition must include both "equals the root itself" and "starts with the root plus a path separator"

<!-- answer -->
Reference answer: The hole is that `abs.startsWith(MEMORY_ROOT)` is a plain string-prefix match that ignores the "same prefix but actually a different directory" case. Example: if a directory `/project/memory-evil` happens to exist on disk, then when `relPath` resolves so that `abs` becomes `/project/memory-evil/secrets.txt`, `"/project/memory-evil/secrets.txt".startsWith("/project/memory")` returns `true` — it does start with that string, even though `memory-evil` is a completely different directory that isn't inside `MEMORY_ROOT`, and the check gets bypassed. The corrected condition should be `abs === MEMORY_ROOT || abs.startsWith(MEMORY_ROOT + path.sep)`: only a path that equals the root exactly, or starts with "the root plus a path separator," counts as genuinely inside the root. `/project/memory-evil` neither equals `/project/memory` nor starts with `/project/memory/`, satisfies neither condition, and is correctly refused.

<!-- hint -->
Think of a concrete counterexample: is there a directory name that starts with the literal `MEMORY_ROOT` string but is actually a different directory?

<!-- hint -->
In the correct version from this lesson's "Adding a Safe Boundary" section, neither side of the `||` can be dropped — one condition alone isn't enough. Work out why the two together are what close the hole.

<!-- /exercises -->

## Recap

- When a session ends, anything in the window that wasn't moved out is gone for good; to keep information across sessions, you have to write it into external memory outside the window before the session ends
- CLAUDE.md is human-written, loaded in full into context every session, with an official size target of 200 lines (hard limit 4 MiB, larger files skipped entirely); block-level HTML comments are stripped before injection, and a project-root CLAUDE.md is re-read and re-injected after `/compact`[^S3]
- Auto memory is model-written, split into an index file plus specific topic files; the index loads only its first 200 lines or 25KB, and topic files aren't loaded at startup, they're read on demand when needed[^S3], so window budget isn't wasted on memory that won't be used
- The two are complementary: CLAUDE.md fits stable rules useful every time; Auto memory fits large-volume details needed only for particular tasks
- A memory file's read/write tool must do a safe path boundary check; the combined condition `abs === ROOT || abs.startsWith(ROOT + path.sep)` needs both halves, since a lone `startsWith` check has a same-prefix bypass hole

[>> Lesson 4: Structured State: How an Agent Remembers Where a Task Stands](./04-structured-task-state.md)
