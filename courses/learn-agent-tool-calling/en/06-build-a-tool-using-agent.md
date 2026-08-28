# Lesson 6: Hands-On: Wiring Three Tools onto an Agent

> Learning goals:
> - Write a complete tool execution loop that actually gets an agent running
> - Register a tool's interface definition and implementation in one table, so the two sides never drift apart
> - Fit the loop with safety valves, and read the logs to tell when a tool is misconnected

> Prerequisites: Finish Lessons 1-5, and be able to read basic JavaScript / Node.js | Previous: [Lesson 5 <<](./05-permissions-and-safety.md)

## The Payoff First: One Complete Run

This is what this lesson builds up to. You type one sentence into the terminal, and the agent decides on its own which tools to call and how many times:

```
$ node agent.js "Are we using lodash in this project? Look into how it's doing on GitHub"

[turn 1] calls search_files { pattern: 'lodash', dir: '.' }
[turn 2] calls read_file { path: 'package.json' }
[turn 3] calls github_repo_info { owner: 'lodash', repo: 'lodash' }

Final answer:
Yes, the project uses lodash. package.json pins it at ^4.17.21, and
src/utils/format.js requires it directly. On GitHub, lodash/lodash
currently has over 60k stars, and its last push was a few weeks ago—the
repo is still maintained. To confirm whether ^4.17.21 is the latest
release, you'd need one more query against its release list.
```

Three turns, three tools, and every turn's arguments build on the previous turn's result: first find which files lodash appears in, then read package.json to confirm the version, then take that name and ask GitHub about it. This isn't a hardcoded script—the model itself decides which tool to call next and what arguments to pass.

This lesson builds it from scratch: three tools, one registry, one execution loop, a few safety valves.

## What's Happening Underneath: One API Round-Trip After Another

Every "turn" you saw above is a full HTTP request underneath. Lesson 2, "The Full Round-Trip of a Tool Call," showed what a single tool call's round-trip looks like; here we just wire it into a loop—the model returns `stop_reason: "tool_use"`, your code runs the tool, stitches the result back into the conversation, and sends another request, until the model stops asking for tool calls.[^S4]

Three tool-call turns are really four calls to `messages.create`: on the first three the model keeps asking for tools, and on the fourth it has GitHub's data, decides it has enough, and gives a text answer directly, ending the loop. The judgment of whether to keep asking for tools lives entirely on the model's side; your code only executes and sends results back.

## Step 1: Write the Contract for Each Tool

Lesson 4, "Designing Tool Interfaces: Name, Description, Parameters, Return Value," covered the three core fields of a tool interface: `name`, `description`, and `input_schema`.[^S3] Here we turn them straight into code. The three tools map onto three of the five tool types from Lesson 3, "Five Common Tool Types: Read, Write, Execute, Search, Call": search, read, and call—write and execute are left for you to wire up in the exercises.

```js
const searchFilesSchema = {
  name: "search_files",
  description:
    "Search project files for text matching a regular expression. Returns the path, " +
    "line number, and line content of each hit. Use it to locate which files a string, " +
    "dependency name, or function name appears in. " +
    "When there are no matches it returns explicit text saying so, never an empty string.",
  input_schema: {
    type: "object",
    properties: {
      pattern: { type: "string", description: "A JavaScript regular expression, without the leading and trailing slashes" },
      dir: { type: "string", description: "The directory to start searching from, relative to the project root, defaults to \".\"" },
    },
    required: ["pattern"],
  },
};

const readFileSchema = {
  name: "read_file",
  description:
    "Read the text content of a file inside the project, returning at most the first 4000 characters. " +
    "path must be a path relative to the project root; the tool cannot access files outside the project directory.",
  input_schema: {
    type: "object",
    properties: {
      path: { type: "string", description: "A file path relative to the project root, for example \"package.json\"" },
    },
    required: ["path"],
  },
};

const githubRepoInfoSchema = {
  name: "github_repo_info",
  description:
    "Look up basic information about a public GitHub repository: star count, open issue count, default branch, and last push time. " +
    "owner and repo are two separate fields for the repository owner and the repository name; a full URL is not accepted.",
  input_schema: {
    type: "object",
    properties: {
      owner: { type: "string", description: "The repository owner, for example \"lodash\"" },
      repo: { type: "string", description: "The repository name, for example \"lodash\"" },
    },
    required: ["owner", "repo"],
  },
};
```

`github_repo_info` carries a `github_` prefix—the official guidance is to namespace tool names with the service when a tool touches an external service, which sharply lowers the chance the model picks the wrong tool.[^S10] `search_files` and `read_file` operate on the local filesystem, where there's no "which service" ambiguity, so they need no prefix.

All three descriptions spell out what text comes back when nothing is found, and that's not filler. Lesson 4 made the point that a good description removes ambiguity in inputs and outputs;[^S8] the ambiguity here isn't in the parameters but in how the tool expresses "I didn't find anything"—a trap that goes off in the "Safety Valves" section.

## Step 2: Register the Contract and the Implementation in One Table

A common trap: if the schema list and the handler lookup table used at execution time are written as two separate copies, they'll drift apart sooner or later. You rename `search_files` to `find_in_files` but forget to update the key in the handler table; the model issues a call against the new schema, the handler table has nothing under that key, and it throws.

The fix is to maintain a single table where `name`, `description`, `input_schema`, and the function that actually runs all sit in the same object. The schema list the API needs and the handler lookup table execution needs are both derived from this one table:

```js
const TOOLS = {
  search_files: { ...searchFilesSchema, handler: searchFiles },
  read_file: { ...readFileSchema, handler: readFile },
  github_repo_info: { ...githubRepoInfoSchema, handler: githubRepoInfo },
};

// The tools parameter sent to the model, derived from TOOLS
const toolSchemas = Object.values(TOOLS).map(({ handler, ...schema }) => schema);

// The handler lookup table used at execution time, also derived from TOOLS
const toolHandlers = Object.fromEntries(
  Object.entries(TOOLS).map(([name, t]) => [name, t.handler])
);
```

`toolSchemas` and `toolHandlers` stay in sync forever, because they're two views computed from the same data, not two hand-written copies. Renaming a tool or adding a parameter means changing `TOOLS` in exactly one place.

## Step 3: Implement the Three Tools, With Boundaries

`searchFiles` walks the directory itself rather than shelling out to `grep`—that avoids splicing user input into a command line and inviting command injection. The hit count is capped, so a single search can't stuff thousands of lines into the context:

```js
import fs from "node:fs";
import path from "node:path";

const PROJECT_ROOT = process.cwd();
const IGNORE_DIRS = new Set(["node_modules", ".git", "dist", "coverage"]);

function walk(dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (IGNORE_DIRS.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(full));
    else out.push(full);
  }
  return out;
}

async function searchFiles({ pattern, dir = "." }) {
  const root = path.resolve(PROJECT_ROOT, dir);
  // Append path.sep before comparing: a bare startsWith would also let through
  // same-prefix sibling directories like /proj-backup
  const inRoot = root === PROJECT_ROOT || root.startsWith(PROJECT_ROOT + path.sep);
  if (!inRoot) {
    return "Refusing to run: the search directory cannot go outside the project root.";
  }
  let regex;
  try {
    regex = new RegExp(pattern);
  } catch {
    return `Refusing to run: "${pattern}" is not a valid regular expression.`;
  }

  const hits = [];
  for (const file of walk(root)) {
    let lines;
    try {
      lines = fs.readFileSync(file, "utf8").split("\n");
    } catch {
      continue; // binary files and the like can't be read as text, skip them
    }
    lines.forEach((line, i) => {
      if (regex.test(line)) {
        hits.push(`${path.relative(PROJECT_ROOT, file)}:${i + 1}:${line.trim()}`);
      }
    });
    if (hits.length >= 20) break; // safety valve: truncate early when there are too many hits
  }
  return hits.length ? hits.join("\n") : "No matching content found.";
}
```

`readFile` does one thing: confirm the target path hasn't escaped the project root. The boundary idea from Lesson 5 shows up here as a single prefix check with a separator. Note it's not a bare `startsWith(PROJECT_ROOT)`: say the project root is `/Users/me/proj` and the model passes in `../proj-backup/x`; after resolve you get `/Users/me/proj-backup/x`, and a bare prefix match would still pass—append `path.sep`, and the boundary finally lands on the directory separator:

```js
async function readFile({ path: relPath }) {
  const abs = path.resolve(PROJECT_ROOT, relPath);
  const inRoot = abs === PROJECT_ROOT || abs.startsWith(PROJECT_ROOT + path.sep);
  if (!inRoot) {
    return "Refusing to run: the path is outside the project root, and this tool is not allowed to read files outside the project.";
  }
  if (!fs.existsSync(abs)) {
    return `File does not exist: ${relPath}`;
  }
  return fs.readFileSync(abs, "utf8").slice(0, 4000);
}
```

`githubRepoInfo` is the only tool that sends data outside the project—local file content, distilled by the model into the two strings `owner` and `repo`, then sent to the public internet. This is exactly the scenario where two high-risk conditions meet, "read private data" plus "communicate outward,"[^S19] so it gets an explicit permission rule: the arguments must match GitHub's valid naming format, nothing else:

```js
const SAFE_NAME = /^[\w.-]+$/;

async function githubRepoInfo({ owner, repo }) {
  // Permission rule: owner/repo can only be valid repository names,
  // not an arbitrary string sent out to the external network
  if (!SAFE_NAME.test(owner) || !SAFE_NAME.test(repo)) {
    return "Refusing to run: the owner/repo arguments are not a valid format; the outbound request was blocked.";
  }

  const headers = { Accept: "application/vnd.github+json" };
  if (process.env.GITHUB_TOKEN) {
    headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
  }

  const res = await fetch(`https://api.github.com/repos/${owner}/${repo}`, { headers });
  if (!res.ok) {
    return `GitHub API returned an error: ${res.status} ${res.statusText}`;
  }
  const data = await res.json();
  return JSON.stringify({
    stars: data.stargazers_count,
    open_issues: data.open_issues_count,
    default_branch: data.default_branch,
    pushed_at: data.pushed_at,
  });
}
```

`GITHUB_TOKEN` is read from an environment variable, never appearing in the code; it runs without one too, just with lower rate limits on anonymous requests. This is the same idea as Lesson 5's permission rules in a different form: that lesson covered the declarative `allow`/`deny`/`ask` rules in Claude Code's config file,[^S15] and this is the imperative version written into the tool code—both draw a line that a high-risk operation cannot cross.[^S18]

## Step 4: Write the Execution Loop

With `toolSchemas` and `toolHandlers` in hand, the loop itself isn't complicated. The core logic is four steps: send the request, look at `stop_reason`, return text if it isn't `tool_use`, and if it is, run every tool-call block and stitch the results back in.[^S4]

```js
import Anthropic from "@anthropic-ai/sdk";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const MAX_TURNS = 8;

async function runAgent(question) {
  const messages = [{ role: "user", content: question }];

  for (let turn = 1; turn <= MAX_TURNS; turn++) {
    const response = await anthropic.messages.create({
      model: "claude-sonnet-5", // swap in a model your account can call
      max_tokens: 1024,
      tools: toolSchemas,
      messages,
    });

    messages.push({ role: "assistant", content: response.content });

    if (response.stop_reason !== "tool_use") {
      const textBlock = response.content.find((b) => b.type === "text");
      return textBlock ? textBlock.text : "(the model gave no text answer)";
    }

    const toolResults = [];
    for (const block of response.content) {
      if (block.type !== "tool_use") continue;
      console.log(`[turn ${turn}] calls ${block.name}`, block.input);
      const handler = toolHandlers[block.name];
      const content = await handler(block.input);
      toolResults.push({ type: "tool_result", tool_use_id: block.id, content: String(content) });
    }
    messages.push({ role: "user", content: toolResults });
  }

  throw new Error(`Exceeded the maximum number of turns (${MAX_TURNS})`);
}

const question = process.argv[2] ?? "Are we using lodash in this project? Look into how it's doing on GitHub";
runAgent(question).then((answer) => console.log("\nFinal answer:\n" + answer));
```

There's an easy-to-miss detail here: `for (const block of response.content)` iterates over **all the content blocks returned this turn**, not just the first. The model often requests two or three tools in parallel in one turn; each one has to be executed and produce its own `tool_result`, with `tool_use_id` matched one-to-one, and not one can be missing.[^S5] The Level 2 exercise will walk you through the trap of missing one firsthand.

## Safety Valves, and How to Tell When a Tool Is Misconnected

The loop above runs, but it's missing two safeguards. Add them:

**Safeguard one: a tool failure has to be fed back, not allowed to crash the loop.** Wrap the raw call in a `try/catch`, and on failure still produce a `tool_result`, just marked with `is_error: true`—when the model sees that mark, it usually adjusts the arguments and retries, rather than repeating the same error.[^S11][^S5]

```js
let content, isError = false;
try {
  if (!handler) throw new Error(`No tool registered under the name ${block.name}`);
  content = await handler(block.input);
} catch (err) {
  content = `Tool execution error: ${err.message}`;
  isError = true;
}
toolResults.push({
  type: "tool_result",
  tool_use_id: block.id,
  content: String(content),
  ...(isError ? { is_error: true } : {}),
});
```

**Safeguard two: the same tool with the same arguments, called three times in a row, should stop.** This isn't guesswork—it's based on recording the signatures of the last few calls:

```js
// Put this at the top of the runAgent function body, not the module top level—so each run
// starts recording from zero, and a second task in the same process doesn't get falsely
// terminated by the previous run's records
const recentCalls = [];

// ...inside the for (const block of response.content) loop, before running the handler:
const signature = `${block.name}:${JSON.stringify(block.input)}`;
recentCalls.push(signature);
const last3 = recentCalls.slice(-3);
if (last3.length === 3 && last3.every((s) => s === signature)) {
  return "Detected the same tool being called 3 times in a row with identical arguments; execution terminated.";
}
```

Together with `MAX_TURNS` as the master switch, the three safety valves have distinct jobs: `MAX_TURNS` guards against "the model keeps asking for tools in new variations and never stops"; the repeat-call detection guards against "the model gets stuck spinning on the same arguments"; and the tools' internal path and format checks (the ones written in Step 3) guard against "the model made up an out-of-bounds argument and the tool dutifully ran it anyway." Drop any one of the three layers and the loop risks running away or overstepping.[^S18]

**How do you tell from the logs that a tool is misconnected?** Two of the most common signals:

- **The model calls the same tool over and over**, with arguments varying only within a narrow range (case changes, adding or dropping a word). Nine times out of ten the model isn't dumb—the `tool_result` content is too vague. "Not found" returns an empty string, the model can't tell "genuinely nothing there" from "the tool is broken," and can only guess and try again.
- **The model fills in arguments by guessing**, for instance passing `read_file` a path that doesn't exist. Tracing back usually turns up one of two causes: the `description` didn't spell out where the argument should come from (echoing Lesson 4), or the previous tool's output didn't give a precise path, leaving the model to invent one.

```agentmentor-check
{
  "id": "tool-zh-06-diagnose-loop",
  "label": "Diagnose why an agent keeps calling the same tool",
  "prompt": "Suppose a classmate changed searchFiles's no-match return value to an empty string (instead of this lesson's \"No matching content found.\"). Handling \"check whether the project uses moment.js,\" this modified agent calls search_files for 5 turns in a row, changing the regex only from \"moment\" to \"Moment\" to \"MOMENT,\" and finally hits MAX_TURNS and is terminated. The project in fact does not use moment.js. What is the most likely root cause of this loop?",
  "whyHere": "Right after covering the execution loop and safety valves, we need to check whether the learner can map the symptom 'the model keeps calling the same tool' onto the root cause 'whether the tool_result content states the status clearly,' rather than blaming the model's ability or the turn limit",
  "mode": "single",
  "choices": [
    {
      "id": "a",
      "text": "The model isn't capable enough and can't tell the cases apart; switch to a stronger model",
      "correct": false,
      "feedback": "Switching models treats the symptom, not the cause. The real problem is in the tool_result—an empty string is barely distinguishable from 'the tool is broken,' so the model can't tell 'genuinely not found' from 'the call failed' and can only reword and retry."
    },
    {
      "id": "b",
      "text": "searchFiles returns an empty string on no match, which the model reads as an uncertain result and retries",
      "correct": true,
      "feedback": "Correct. The tool_result content is the model's only basis for judging 'is this step done or not.' An empty string is an ambiguous signal—the model can't be sure whether it found nothing or the call failed, so it tries another regex. Change the return value to explicit text like 'No matching content found,' and once the model sees it, it stops retrying and concludes directly that the project doesn't use this library."
    },
    {
      "id": "c",
      "text": "MAX_TURNS is set too low; raise it and see whether the loop stops on its own",
      "correct": false,
      "feedback": "Raising MAX_TURNS only lets the loop spin a few more turns before hitting the wall; it doesn't address why the model retries. The root cause is the unclear signal returned by searchFiles, not the turn limit."
    }
  ]
}
```

<!-- exercises -->
## 💻 Exercises

### Level 1: Get It Running, Then Wire Up a Fourth Tool

Copy this lesson's code into an empty local directory, run `npm install @anthropic-ai/sdk`, then `npm pkg set type=module` (all the code in this lesson uses ESM `import` syntax; on Node versions below 22.7, skipping this step throws "Cannot use import statement outside a module" outright), set up your `ANTHROPIC_API_KEY` (`GITHUB_TOKEN` optional), and run `node agent.js "Are we using lodash in this project? Look into how it's doing on GitHub"` once. Confirm you see at least two different tool-call turns and a final text answer.

Once it runs, wire up a fourth tool, `write_report(path, content)`: write the check results into a Markdown file, allowed only under the project's `reports/` directory, and reject writes anywhere else. Change one prompt, for example "write the check results you just gathered into reports/lodash-check.md," and confirm the model calls this new tool on its own.

<!-- rubric -->
- The three existing tools run, the logs show at least two tool-call turns, and the later turn's arguments use the earlier turn's result
- `write_report`'s path restriction actually takes effect: trying to write a path like `reports/../secret.txt` or `reports-evil/x.md` gets rejected
- `write_report` is correctly registered into the `TOOLS` table: its schema shows up in `toolSchemas`, and `toolHandlers` can look up the corresponding function

<!-- answer -->
The core is to copy `readFile`'s boundary-check idea, only swapping "read" for "write" and narrowing the allowed range from the whole project root down to the single `reports/` subdirectory:

```js
const REPORTS_DIR = path.join(PROJECT_ROOT, "reports");

async function writeReport({ path: relPath, content }) {
  fs.mkdirSync(REPORTS_DIR, { recursive: true });
  const abs = path.resolve(PROJECT_ROOT, relPath);
  const inReports = abs === REPORTS_DIR || abs.startsWith(REPORTS_DIR + path.sep);
  if (!inReports) {
    return "Refusing to run: files can only be written under the reports/ directory.";
  }
  fs.writeFileSync(abs, content, "utf8");
  return `Wrote ${path.relative(PROJECT_ROOT, abs)}`;
}

const writeReportSchema = {
  name: "write_report",
  description: "Write text content into a Markdown file. Can only write under the reports/ directory, not anywhere else in the project.",
  input_schema: {
    type: "object",
    properties: {
      path: { type: "string", description: "A path relative to the project root, must start with \"reports/\"" },
      content: { type: "string", description: "The full text content to write" },
    },
    required: ["path", "content"],
  },
};

TOOLS.write_report = { ...writeReportSchema, handler: writeReport };
```

<!-- hint -->
The path check is written the same way as `readFile`: after `path.resolve`, append `path.sep` and do a prefix comparison, only swapping the base from `PROJECT_ROOT` to `REPORTS_DIR`—without appending the separator, a same-prefix directory like `reports-evil/` would slip past the check.

<!-- hint -->
Before writing the file, remember `fs.mkdirSync(REPORTS_DIR, { recursive: true })`, otherwise `writeFileSync` throws outright the first time when the `reports/` directory doesn't exist yet.

### Level 2: Manufacture a Failure, Then Fix It

The loop code below has a bug. First explain under what condition it causes the next API request to error out, then give the fixed code.

```js
// buggy version
const block = response.content.find((b) => b.type === "tool_use");
if (block) {
  const result = await toolHandlers[block.name](block.input);
  messages.push({
    role: "user",
    content: [{ type: "tool_result", tool_use_id: block.id, content: String(result) }],
  });
}
```

<!-- rubric -->
- Pinpoints the bug precisely: using `.find()` to take only the first `tool_use` block means when the model requests multiple tools in parallel in one turn, the later calls are ignored entirely
- Explains the actual symptom: however many `tool_use` blocks were in the previous assistant message, there must be that many matching `tool_result` blocks next turn; a shortfall errors out directly
- The fix changes it to iterate over all blocks where `type === "tool_use"`, produce a matching `tool_result` for each, and put them all into one `user` message

<!-- answer -->
The bug is the assumption that there's at most one tool call per turn, when in fact the model can perfectly well request two or three in parallel at once. The fix is the very form shown in Step 4 of this lesson—replace `.find()` with a loop over all blocks:

```js
const toolResults = [];
for (const block of response.content) {
  if (block.type !== "tool_use") continue;
  const result = await toolHandlers[block.name](block.input);
  toolResults.push({ type: "tool_result", tool_use_id: block.id, content: String(result) });
}
messages.push({ role: "user", content: toolResults });
```

<!-- hint -->
Count how many elements in `response.content` might have `type` equal to `"tool_use"`—the model can perfectly well request two tools in parallel at once, not always just one.

<!-- hint -->
The API's rule is: however many `tool_use` blocks were in the previous assistant message, the next `user` message must have that many matching `tool_result` blocks, not one missing.

<!-- /exercises -->

## Recap

- Register a tool's schema and handler in the same table (`TOOLS`), with `toolSchemas` and `toolHandlers` both derived from it, so changing one place never leaves the other unchanged
- The core of the execution loop is: send the request → check whether `stop_reason` is `tool_use` → if so, iterate over **every** tool-call block, execute, and stitch back the `tool_result` → if not, return text and end the loop
- One turn may have multiple parallel tool calls; every `tool_use` needs a uniquely matching `tool_result`, and missing one errors out the next request
- The three safety valves each guard a layer: `MAX_TURNS` stops the model from asking for tools indefinitely, repeat-call detection stops the model from spinning on the same argument set, and the tools' internal path and format checks stop out-of-bounds arguments
- The `tool_result` content has to state "not found" versus "an error occurred" clearly; a vague empty return is the number-one cause of the model retrying over and over and the logs looking like a tool is misconnected

You've now finished all six lessons of this course, from "why agents need tools" to writing a working tool execution loop yourself. The most worthwhile thing to do next isn't reading another lesson—it's picking a small, real task from your own project, breaking it into two or three tools, and carrying this loop skeleton over with a few tweaks. Getting it running once beats reading ten more explanations. When debugging and unsure about a specific field, go back to `sources.md` and check S4 and S5, the two official docs; those are the most primary spec text for this multi-turn loop.


