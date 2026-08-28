# Lesson 3: Deterministic Verifiers: Only Checks That Output Pass/Fail Count

> Learning goals:
> - Rank candidate verifiers by "fastest, most reliable, most scalable" and pick the right one for a specific output
> - Write a deterministic verification script that returns pass/fail in a form the agent can read and iterate on
> - Recognize false negatives where over-strict verifiers reject correct outputs, fix them with normalization, and understand where deterministic checks hit their ceiling
>
> Prerequisites: Lessons 1 and 2 (without a runnable check, "looks done" is the only signal; verify end state first, process as backstop; success criteria must be measurable) | Previous: [<< Lesson 2](./02-what-to-verify.md) | Next: [Lesson 4 >>](./04-llm-as-judge.md)

## From "what to verify" to "how to verify it"

By the end of Lesson 2, you should have a concrete success criteria written down. Take the example this lesson uses: the agent reads a batch of sales CSVs, aggregates them into a `report.json` with a title, per-channel items, and a total. Lesson 2 taught you to frame the criteria as end state—file exists, fields present, total equals sum of item counts—rather than turn-by-turn process checks like "read file, then compute sum, then write file."

You have the criteria. The next question is practical: **what do you use to check against that criteria?**

You could eyeball it. You could have another model read it and give feedback. Or you could write a dozen lines of Node that loads the JSON, sums the counts, and exits non-zero if they don't match. All three reach a conclusion, but the cost and reliability differ wildly.

The official docs offer a ranking principle: **choose the fastest, most reliable, most scalable grading method**[^S5]. By that yardstick, the three categories land in clear order:

- **Code-based grading**—fastest and most reliable, extremely scalable; the weakness is that it lacks nuance for complex judgments that need less rule-based rigidity[^S5].
- **LLM-based grading**—fast and flexible, scalable and suitable for complex judgment, but test to ensure reliability first then scale[^S5]. (That's Lesson 4.)
- **Human grading**—most flexible and high quality, but slow and expensive; avoid if possible[^S5].

"Reliable" here means **same input, same verdict every time**. Code-based grading ranks first not because it's smart, but because it's predictably dumb—it won't pass you today on good vibes and fail you tomorrow over phrasing. In computing, deterministic systems produce the same output every time given identical inputs, while non-deterministic systems—like agents—can generate varied responses even with the same starting conditions[^S3]. The "deterministic verifiers" this lesson covers are that kind of predictably dumb check: a deterministic thing evaluating a non-deterministic thing.

One related principle for designing eval tasks: **structure questions to allow for automated grading** (for example, multiple-choice, string match, code-graded, LLM-graded)[^S5]. Where you have a shot at automation, take it.

## The verifier menu: anything that returns a signal

"Verifier" sounds like a specialized framework, but the bar is much lower. The official docs definition is almost blunt: **the check is anything that returns a signal Claude can read in the conversation: a test suite, a build exit code, a linter, a script that diffs output against a fixture, or a browser screenshot compared against a design**[^S4].

Unpack that list. Running `npm test` that goes all green is a pass, perfect for code deliverables—code solutions are verifiable through automated tests[^S1]. Build exit codes are the easiest: the toolchain already wrote the assertions for you. A linter alone isn't enough, but it's great as the floor for "mistakes you shouldn't make." A diff script compares this run's output to a fixture file you prepared (a known-good sample), suitable when output is stable and format is fixed. Screenshot comparison is for when you're tweaking frontend styles.

One engineering-practice note: compilers and static type checkers (like `tsc --noEmit`) are often used this way in real projects because they also emit exit codes and readable error locations. That's my addition, not on the official list—don't treat it as officially endorsed.

These methods aren't mutually exclusive. Verifiers form **a spectrum**—one end is "exact string match against a fixture," the other end is "ask Claude to judge"[^S3]. This lesson covers the left half, Lesson 4 goes right.

## Minimal form: `output == golden_answer`

The left edge of the spectrum looks like this[^S5]:

```text
output == golden_answer
```

Just an equality check. This is called exact match. It measures whether the model's output matches a predefined correct answer, **typically after normalizing whitespace and case**; it's a simple, unambiguous metric that's perfect for tasks with clear-cut, categorical answers like sentiment analysis (positive, negative, neutral)[^S5].

"Normalization" here is plain: before comparing, erase differences that don't carry meaning. In code:

```javascript
// Sentiment three-way classification: answer must be positive / negative / neutral
function grade(output, goldenAnswer) {
  const normalize = (s) => s.trim().toLowerCase();
  return normalize(output) === normalize(goldenAnswer);
}

grade("Positive\n", "positive"); // true — case and newline erased
grade("positive.", "positive");  // false — but a period still fails it
```

The second call's result is worth staring at. `trim()` and `toLowerCase()` rescue newlines and case, but not that period. How far normalization should go depends on which differences are irrelevant **to your task**—a judgment no library can make for you. The pitfall section later in this lesson is about what happens when you get that judgment wrong.

## Make the verifier's output readable

That definition had a clause often skipped: the signal must be **something Claude can read in the conversation**[^S4]. That clause determines how your verification script should write its output. Compare two failure messages:

```text
FAIL: validation did not pass
```

```text
FAIL  report.json
  - total mismatch: declared 48, item counts sum to 50
```

The first tells the agent "you're wrong," then leaves it guessing. The second tells it which field failed, what was expected, what was actual—next turn it can go fix that number directly. Same pass/fail, order-of-magnitude difference in information. Another piece of official guidance says the same thing: **have Claude show evidence rather than asserting success**—the test output, the command it ran and what it returned, or a screenshot of the result; reviewing evidence is faster than re-running the verification yourself, and it works for sessions you weren't watching[^S4]. Your verification script is the producer of that evidence. If it's vague, the evidence is vague.

Two practical rules: use exit code `0` for pass, non-zero for fail (CI and shell `&&` can use it directly). In stdout, one failure per line, stating "which field, expected what, got what."

## With pass/fail, the agent's behavior changes

During execution, agents need **"ground truth" from the environment at each step (such as tool call results or code execution) to assess progress**[^S1]. Without a verifier, the only progress signal it can get is the paragraph it just wrote—if it thinks it's done, it's done. With a verifier, the environment contains a source of fact independent of its own judgment.

So the behavior chain changes: **give Claude something that produces a pass or fail, and the loop closes on its own; Claude does the work, runs the check, reads the result, and iterates until the check passes**[^S4]. Put another way: agents can iterate on solutions using test results as feedback[^S1].

In the kind of harness loop you hand-wrote in Course 7 of this series, the implementation is to expose the check as a tool:

```javascript
const tools = [
  { name: "write_file", /* ... */ },
  {
    name: "run_check",
    description: "Run verify.mjs to check report.json, returns PASS/FAIL and per-item failure reasons",
    input_schema: { type: "object", properties: {}, required: [] },
  },
];

import { execFile } from "node:child_process";

// Utility: run verify.mjs, collect both exit code and output
// (Don't use promisify(exec)—it throws on non-zero exit, but non-zero is the signal we want)
function runVerify() {
  return new Promise((resolve) => {
    execFile("node", ["verify.mjs", "report.json"], (err, stdout, stderr) => {
      resolve({ code: err?.code ?? 0, stdout: stdout + stderr });
    });
  });
}

async function runTool(name, input) {
  if (name !== "run_check") return runOtherTool(name, input);
  const { code, stdout } = await runVerify();
  // Key: pass exit code and stdout through as-is, don't compress to "it failed"
  return `exit code: ${code}\n${stdout}`;
}

while (response.stop_reason === "tool_use") {
  const toolUse = response.content.find((block) => block.type === "tool_use");
  const output = await runTool(toolUse.name, toolUse.input);
  messages.push({ role: "assistant", content: response.content });
  messages.push({
    role: "user",
    content: [{ type: "tool_result", tool_use_id: toolUse.id, content: output }],
  });
  response = await client.messages.create({ model, tools, messages });
}
```

The verifier's output flows back into the conversation via `tool_result`. The model reads `total mismatch: declared 48, item counts sum to 50`, and next turn it goes to fix it. You participated in zero steps.

Two convenient extensions. **First, checks don't have to sit only at the end.** Lesson 2 covered how complex workflows can be broken into discrete checkpoints where specific state changes should have occurred, rather than validating every intermediate step[^S2]. Those verification checkpoints are natural landing spots for deterministic checks—like "after all CSVs are read, row count should equal sum of individual file row counts." The same retrospective also mentions combining the adaptability of agents with deterministic safeguards like retry logic and regular checkpoints[^S2] (note that "checkpoints" there refers to the kind of state-saving recovery checkpoints from Course 9 of this series).

**Second, one class of verification can move upstream to the API layer.** Add `strict: true` to your tool definitions to ensure Claude's tool calls always match your schema exactly[^S6]. The schema is your declaration of parameter structure.

```json
{
  "name": "write_report",
  "description": "Write aggregated results to report.json",
  "strict": true,
  "input_schema": {
    "type": "object",
    "properties": {
      "title": { "type": "string" },
      "items": {
        "type": "array",
        "items": {
          "type": "object",
          "properties": { "name": { "type": "string" }, "count": { "type": "integer" } },
          "required": ["name", "count"]
        }
      },
      "total": { "type": "integer" }
    },
    "required": ["title", "items", "total"]
  }
}
```

With that one line, structural issues like "typo in field name" or "count passed as string" go from "something you write code to check" to a platform-level guarantee. Tools are a contract between deterministic systems and non-deterministic agents[^S3], and `strict` is how you write that contract into the interface.

But it polices structure, not semantics. Whether `total` actually equals the sum of all `count` values, the schema has nothing to say—that part you still verify yourself.

```agentmentor-check
{
  "id": "vq-zh-03-strict-verifier",
  "label": "Stricter is safer?",
  "prompt": "A colleague wrote a verifier: the agent's output must match the fixture file byte-for-byte, every space and punctuation mark identical, or it fails. Their reasoning is \"stricter is safer, better to over-reject than under-reject.\" Does that reasoning hold?",
  "whyHere": "You just saw the benefits of deterministic checks; next you need to see the easiest way they trip. Before you write a verifier, get clear on what \"strict\" should even mean.",
  "mode": "single",
  "choices": [
    {
      "id": "a",
      "text": "Doesn't hold. Over-strict verifiers reject correct outputs due to spurious differences like formatting, punctuation, or valid alternative phrasings; strictness should apply to semantics (like whether total equals sum of counts), and irrelevant formatting should be normalized away first.",
      "correct": true,
      "feedback": "Right. Strictness belongs on the parts that carry meaning, not on whitespace and punctuation. The standard practice for exact match is to normalize whitespace and case before comparing."
    },
    {
      "id": "b",
      "text": "Mostly holds. Being stricter just means a few more false alarms; humans can review those, and it's better than missing real errors.",
      "correct": false,
      "feedback": "False alarms aren't free. False negatives pollute your pass rate, making a real improvement look like it had no effect; worse, when verification results are fed back to the agent as feedback, it'll spend several turns \"fixing\" something that was never broken."
    },
    {
      "id": "c",
      "text": "Got it backwards, should be as loose as possible—as long as output isn't empty, pass it, leave the rest to human review.",
      "correct": false,
      "feedback": "That's retreating to the state of having no runnable check. A check that always passes is the same as no check, \"looks done\" becomes the only signal again, and you become the verification loop. Loose vs. strict isn't a single slider: be strict on semantics, be loose on irrelevant formatting."
    }
  ]
}
```

## The pitfall: over-strict verifiers reject correct outputs

This is the most common way deterministic checks fail, and you often won't notice when it happens.

The official guidance for tool evals is sharp: **avoid overly strict verifiers that reject correct responses due to spurious differences like formatting, punctuation, or valid alternative phrasings**[^S3].

"Spurious differences" is the key phrase. The same correct answer might carry a trailing space, might write `positive` as `Positive`, might have two spaces between words instead of one. These differences mean nothing **to the task**, but to a byte-by-byte comparison verifier they're catastrophic. The failure direction is also insidious: it doesn't let errors through, it **punishes correct outputs**—that's a false negative.

Here's a concrete crash and fix. The fixture title is `2026 年 Q1 渠道汇总`. The agent's `report.json` has all data correct, just whitespace before and after the title and two spaces between words. The naive strict verifier looks like this:

```javascript
// strict.mjs — naive strict version
import { readFileSync } from "node:fs";

const GOLDEN_TITLE = "2026 年 Q1 渠道汇总";
const data = JSON.parse(readFileSync(process.argv[2], "utf8"));

if (data.title === GOLDEN_TITLE) {
  console.log("PASS");
  process.exit(0);
} else {
  console.log(`FAIL: title mismatch, got ${JSON.stringify(data.title)}`);
  process.exit(1);
}
```

Run it, actual output:

```text
$ node strict.mjs spacey.json
FAIL: title mismatch, got "  2026 年   Q1 渠道汇总\n"
```

A report with entirely correct content, failed by a trailing newline. If this result gets fed back to the agent, it'll go tinker with the title's whitespace—a direction unrelated to the task.

The fix is one function:

```javascript
function normalize(text) {
  return text.replace(/\s+/g, " ").trim().toLowerCase();
}

if (normalize(data.title) === normalize(GOLDEN_TITLE)) { /* PASS */ }
```

`replace(/\s+/g, " ")` folds consecutive whitespace into one, `trim()` removes leading and trailing, `toLowerCase()` unifies case. After the change, the same file passes—the full script and real run results are in Level 2 of the exercises below.

Flip side reminder: normalization isn't a "the more the better" thing. If you also strip punctuation, you might smooth over real errors like `total: 48` vs. `total: 4.8`. The judgment standard is always the same—**does this difference carry meaning?** If yes, be strict. If no, normalize it.

## Where deterministic checks hit their ceiling

Deterministic verifiers have a well-defined boundary of applicability.

**First boundary is free text.** Research outputs are difficult to evaluate programmatically, since they are free-form text and rarely have a single correct answer[^S2]. You can't write `output == golden_answer` for a summary—given the same material, two well-written summaries can use completely different wording. That kind of judgment goes to Lesson 4's domain.

**Second boundary is "fits broader system requirements."** Code solutions are verifiable through automated tests, but to ensure solutions align with broader system requirements, human review remains crucial[^S1]. A patch can pass all tests while being a bad design that makes the whole module unmaintainable. The multi-agent retrospective echoes this: even in a world of automated evaluations, manual testing remains essential[^S2].

Deterministic checks own the floor of "things that shouldn't be wrong aren't wrong." Above that floor, you need different tools.

## Proportion: not everything deserves a verifier

The opposite mistake is also common: building a full verification suite for a one-off script.

The agent writes a data migration script that runs once then gets deleted, and you set up structure validation, fixture comparison, regression samples—the time spent writing the verifier exceeds the time to just eyeball the output.

The judgment yardstick is still that old line: **you should consider adding complexity only when it demonstrably improves outcomes**[^S1]. For verifiers specifically, ask yourself one question:

- How many times will this check run? If it's once and you're standing right there watching, your eyes might be faster.
- Without it, how long until errors get discovered? "Immediately, I'm looking right at it" versus "when downstream breaks, two days later" yield totally different conclusions.
- How many prompt iterations do you plan for this task? As soon as it's more than one, you need a stable yardstick to compare before and after, or "did this get better" is always just a guess.

As for when you must write one, the official guidance is hard—**always provide verification (tests, scripts, screenshots); if you can't verify it, don't ship it**[^S4].

## 💻 Exercises

<!-- exercises -->

### Level 1: Pick a verifier for 6 outputs (no code)

Below are 6 common agent outputs. For each, answer: what verifier would you use? Why that one?

1. A JSON config file (service name, port, timeout)
2. A CSV sorted "amount descending"
3. A free-text summary (300 words distilled from a long report)
4. A code patch (fixing a known bug)
5. A list of filenames (the agent claims it processed these files)
6. A sentiment label (outputs positive / negative / neutral for a comment)

After answering all six, answer one more question: **which of these six can't be judged purely by deterministic checks?** For those, what floor can deterministic checks still hold? What's left for Lesson 4's methods?

<!-- hint -->
Start each one with this question: "For this output, which differences carry meaning, and which are spurious?" The meaning-carrying parts determine what you assert, the spurious parts determine what you normalize away. For example, in #2, row order carries meaning (the task is sorting), but whether line ending is `\n` or `\r\n` doesn't.

<!-- hint -->
Don't default to "byte-by-byte diff against a fixture file" as the universal answer. A more robust approach is often to **compute a property from the output and assert that**, rather than comparing to a fixed sample. For #2, rather than diffing against a fixture CSV, assert "adjacent rows have monotonically non-increasing amounts"—that way the script still works when you swap in different data.

<!-- rubric -->
- All 6 items have a concrete verifier, in a form that produces pass/fail (saying "check the quality" doesn't count)
- At least 4 items' reasoning touches on "which differences are spurious and need normalization or avoidance," not just "use a script to check"
- Explicitly identifies #3 (free-text summary) as not fully judgeable by deterministic checks, and states the floor deterministic can hold (length, required entities must appear, no numbers from outside the source), leaving quality judgment to Lesson 4
- For #4 (code patch), notes that test suite, build exit code, linter can auto-verify functionality, but "fits broader system requirements" still needs human review or Lesson 4's methods
- For #5 (filename list), recognizes "order typically doesn't carry meaning," should do set comparison not ordered comparison
- For #6 (sentiment label), recognizes this is the classic exact-match scenario, and mentions normalizing whitespace and case first

<!-- answer -->
**1. JSON config file → schema validation + a few semantic assertions.**
Schema polices structure (fields present, types correct, required fields filled), then add a few assertions schema can't express, like port in 1–65535 range, timeout is positive. Don't byte-by-byte diff against a fixture config—key order, indentation, trailing commas are all spurious differences that'll cause daily false alarms. If the config is agent-produced via tool call, the structure half can even move upstream to the API layer with `strict: true`[^S6].

**2. Sorted CSV → script loads it and asserts properties.**
Assert column names are right, row count is right, adjacent rows have monotonically non-increasing amounts. The third is the task core, the first two prevent "sort is right but half the data is gone." This especially shouldn't use fixture-file diff: line ending, number format (`1000` vs. `1000.00`), trailing whitespace are all spurious, and swapping in different input data invalidates the fixture.

**3. Free-text summary → deterministic checks hold the floor, quality judgment goes to Lesson 4.**
Research outputs are difficult to evaluate programmatically, since they are free-form text and rarely have a single correct answer[^S2]. The floor is still holdable: word count in required range, specified entities (names, product names, quarters) must appear, no numbers from outside the source report. But "did it capture the key points" or "did it misinterpret intent" needs LLM-judge scoring on a rubric—that's Lesson 4's content.

**4. Code patch → test suite + build exit code + linter, with human review as backstop.**
Code solutions are verifiable through automated tests[^S1], and those three are right on the official check menu[^S4]. But **automated testing helps verify functionality; to ensure solutions align with broader system requirements, human review remains crucial**[^S1]—the patch can pass all tests while being a design that kills maintainability.

**5. Filename list → set comparison (sort first then compare, or use `Set`).**
Filename **order** typically doesn't carry meaning; whether `a.csv` was processed before or after `b.csv` doesn't affect whether the task is complete. Ordered line-by-line diff will false-alarm on different order. Add one more check: do these files actually exist on disk—agent reporting processed files that don't match what's actually there is a classic failure mode.

**6. Sentiment label → exact match, after normalization.**
`output == golden_answer`[^S5], normalize whitespace and case before comparing. This is exactly what exact match excels at: tasks with clear-cut, categorical answers, only three valid values[^S5]. Watch out for the model outputting `Positive.` or `Sentiment: positive`—normalization needs to tolerate that kind of spurious wrapper, or just lock down the output format hard in the prompt.

**Which can't be purely judged by deterministic checks:** #3 entirely, and the "fits broader system requirements" layer of #4. Those two go to Lesson 4's LLM judge, or to humans.

### Level 2: Write a real `verify.mjs`

**Task setup.** The agent needs to produce a `report.json` with these requirements:

- Has `title`, type is string
- Has `items`, an array where each item has `name` (string) and `count` (integer)
- Has `total` (integer), and `total` equals the sum of all `count` values
- `title` should match the fixture title `2026 年 Q1 渠道汇总`

Write a Node script `verify.mjs` that does three layers of checks: **structure validation**, **`total` consistency check**, **title comparison after whitespace normalization**. Usage is `node verify.mjs report.json`, exits 0 on pass, exits 1 on fail and prints reasons one per line.

After writing it, create three sample files to validate it: one entirely correct, one where `total` is genuinely miscalculated, one "all content correct but title has extra whitespace." The third must pass—it's your proof that normalization rescued a false negative.

<!-- hint -->
The three layers have a dependency order: when structure doesn't pass, don't rush to compute `total`. If `items` isn't even an array, calling `.reduce()` on it will throw an exception, turning a clear "items is not an array" into a hard-to-read stack trace. The pattern is: structure layer collects errors and `return`s early; the next two layers only run if structure passed.

<!-- hint -->
When normalizing the title, `trim()` only removes leading and trailing whitespace, it won't remove the extra space between words. To handle both, use `text.replace(/\s+/g, " ").trim()`: first fold all consecutive whitespace (including newlines, tabs) into a single normal space, then trim ends. For checking integers, don't use `typeof x === "number"`—`3.5` is also a number. Use `Number.isInteger(x)`.

<!-- rubric -->
- Uses exit code to express verdict: pass `process.exit(0)`, fail `process.exit(1)`
- Structure validation covers `title` is string, `items` is array, each item has string `name` and integer `count`, `total` is integer
- JSON parse failure is separately caught and reported as a readable error, not letting the exception crash the process
- When structure validation fails, returns early without executing sum and comparison
- `total` consistency uses "sum of all `count` values" computed on the fly, not compared to a hardcoded number
- `title` comparison normalizes before comparing, at minimum folding consecutive whitespace and trimming ends
- Both `total` and `title` failure messages include both expected and actual values
- The three sample files' verdicts are PASS, FAIL (`total` mismatch), PASS, and the third's pass is demonstrably thanks to normalization

<!-- answer -->
Full script:

```javascript
// verify.mjs
import { readFileSync } from "node:fs";

const GOLDEN_TITLE = "2026 年 Q1 渠道汇总";

// Normalize: fold consecutive whitespace, trim ends, unify case
function normalize(text) {
  return text.replace(/\s+/g, " ").trim().toLowerCase();
}

export function verify(raw) {
  const errors = [];

  let data;
  try {
    data = JSON.parse(raw);
  } catch (err) {
    return { pass: false, errors: [`JSON parse failed: ${err.message}`] };
  }

  if (data === null || typeof data !== "object" || Array.isArray(data)) {
    return { pass: false, errors: ["Top level is not a JSON object"] };
  }

  // First layer: structure validation
  if (typeof data.title !== "string") {
    errors.push("title missing or not a string");
  }
  if (!Array.isArray(data.items)) {
    errors.push("items missing or not an array");
  } else {
    data.items.forEach((item, i) => {
      if (item === null || typeof item !== "object") {
        errors.push(`items[${i}] is not an object`);
        return;
      }
      if (typeof item.name !== "string") {
        errors.push(`items[${i}].name missing or not a string`);
      }
      if (!Number.isInteger(item.count)) {
        errors.push(`items[${i}].count missing or not an integer`);
      }
    });
  }
  if (!Number.isInteger(data.total)) {
    errors.push("total missing or not an integer");
  }

  // Structure fails, don't proceed, or errors will cascade
  if (errors.length > 0) {
    return { pass: false, errors };
  }

  // Second layer: total consistency
  const sum = data.items.reduce((acc, item) => acc + item.count, 0);
  if (sum !== data.total) {
    errors.push(`total mismatch: declared ${data.total}, item counts sum to ${sum}`);
  }

  // Third layer: title comparison, normalize first
  if (normalize(data.title) !== normalize(GOLDEN_TITLE)) {
    errors.push(
      `title mismatch: normalized to "${normalize(data.title)}", expected "${normalize(GOLDEN_TITLE)}"`
    );
  }

  return { pass: errors.length === 0, errors };
}

const path = process.argv[2];
if (!path) {
  console.error("Usage: node verify.mjs <report.json>");
  process.exit(2);
}

const result = verify(readFileSync(path, "utf8"));
if (result.pass) {
  console.log(`PASS  ${path}`);
  process.exit(0);
}
console.log(`FAIL  ${path}`);
for (const e of result.errors) {
  console.log(`  - ${e}`);
}
process.exit(1);
```

Three samples. `good.json`—all correct:

```json
{
  "title": "2026 年 Q1 渠道汇总",
  "items": [
    { "name": "直客", "count": 12 },
    { "name": "渠道商", "count": 30 },
    { "name": "线上自助", "count": 8 }
  ],
  "total": 50
}
```

`broken.json`—`items` and `title` identical to `good.json`, only changed the last line, `total` genuinely miscalculated (12 + 30 + 8 = 50, but wrote 48):

```json
  "total": 48
```

`spacey.json`—`items` and `total` identical to `good.json`, only swapped the title to a version with leading/trailing whitespace, two extra spaces in the middle, and a trailing newline. This is the false-negative case:

```json
  "title": "  2026 年   Q1 渠道汇总\n",
```

Run it (`node --version` is v26.3.0, the script uses no new syntax, older versions work too):

```text
$ for f in good.json broken.json spacey.json; do node verify.mjs "$f"; echo "  exit code: $?"; done
PASS  good.json
  exit code: 0
FAIL  broken.json
  - total mismatch: declared 48, item counts sum to 50
  exit code: 1
PASS  spacey.json
  exit code: 0
```

Three verdicts correspond to three key points from this lesson. `good.json` passes, that's baseline. `broken.json` gets caught, failure message has both expected and actual (`declared 48, item counts sum to 50`), agent reads this line and knows which number to fix. `spacey.json` passes—if `title` comparison were written byte-by-byte, this one would false-fail, and the agent would spend next turn fiddling with a task-irrelevant newline; normalization is what rescued this false negative. Take the `strict.mjs` from the pitfall section and run it on the same file to see what it looks like without normalization:

```text
$ node strict.mjs spacey.json
FAIL: title mismatch, got "  2026 年   Q1 渠道汇总\n"
```

<!-- /exercises -->

## Recap

- The ranking principle for grading methods is "fastest, most reliable, most scalable"; code-based grading ranks first on all three, the tradeoff is it lacks nuance for complex judgments that need less rule-based rigidity[^S5].
- A check can be anything that returns a signal Claude can read in the conversation: a test suite, build exit code, linter, a script that diffs output against a fixture, or a screenshot compared to a design[^S4].
- Verifiers form a spectrum; the left edge is exact string match against a fixture, the right edge is asking Claude to judge[^S3]; minimal form is just `output == golden_answer`, typically after normalizing whitespace and case, perfect for tasks with clear-cut, categorical answers[^S5].
- With pass/fail, the loop closes on its own: do work, run check, read result, iterate until it passes[^S4]; that's because agents need ground truth from the environment at each step to assess progress[^S1], and why they can iterate using test results as feedback[^S1].
- Complex workflows can be broken into discrete verification checkpoints where specific state changes should have occurred, rather than validating every intermediate step[^S2]; one class of structure validation can even move upstream to the API layer with `strict: true` to make tool calls strictly conform to schema[^S6].
- The biggest pitfall is over-strict verifiers: they reject correct responses due to spurious differences like formatting, punctuation, or valid alternative phrasings[^S3]. The fix is to normalize first, then compare, saving strictness for the parts that truly carry meaning.
- Deterministic checks have a ceiling: research outputs are difficult to evaluate programmatically[^S2]; automated testing verifies functionality, but to ensure solutions align with broader system requirements, human review remains crucial[^S1], and even with mature automated evals, manual testing remains essential[^S2].
- Don't build a full verifier for a one-off script—you should consider adding complexity only when it demonstrably improves outcomes[^S1]; but in the other direction, if you can't verify it, don't ship it[^S4].

[>> Lesson 4: LLM as Judge: Rubrics, Formats, and What Not to Let It Judge](./04-llm-as-judge.md)
