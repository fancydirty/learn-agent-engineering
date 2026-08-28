# Lesson 1: 'Looks Done' Isn't 'Is Done'

> Learning goals:
> - Explain why Claude stops when the work *looks* done, and who ends up doing the verification when that happens
> - Use the contrast between deterministic and non-deterministic systems to explain why traditional testing's "input X, path Y, output Z" assumptions break down for agents
> - Given a completion report, distinguish which statements are assertions vs. evidence, and identify what's still missing for sign-off
>
> Prerequisites: Complete the first 9 courses in this series; write `stop_reason`-driven harness loops by hand; understand checkpoints and recovery | Next: [Lesson 2 >>](./02-what-to-verify.md)

## Shipped on Tuesday, Broken on Friday

Tuesday afternoon, you ask an agent to add a "bulk import users" feature to an internal admin panel: upload CSV, parse it, validate fields, write to database. You spell out the requirements clearly, then head into a meeting.

When you get back, the session has stopped. The last message looks like this:

```text
Done.

- Added src/importer/parseCsv.js for parsing and field mapping
- Added src/importer/validate.js to check email format and required fields
- Wired up batch insert at POST /api/users/import

Implementation follows existing module code style. No errors during execution.
```

You skim the diff. Functions are cleanly separated, naming matches neighboring modules, edge cases look considered—empty files return an explicit error, the email regex isn't obviously broken. You merge it. You ship it.

Friday afternoon, operations posts in the channel: "Why did we just import 400 empty users?"

The cause is straightforward. Operations generated that CSV by doing "Save As" from Excel, which added a BOM—three invisible bytes `﻿` that Excel likes to prepend to UTF-8 files. So the first column name got parsed as `﻿email` instead of `email`, the entire field mapping fell through, and every row became "all fields are undefined." What about that validation layer? It checked "is the email format valid," but undefined took a different branch and was treated as "this column wasn't filled in," so it passed.

Nobody cut corners here. The agent wrote code that runs. It tested itself with a CSV it generated—and of course its own CSV doesn't have a BOM. When you reviewed the diff, you were checking "is this code written correctly," not "what happens when this code meets real-world input." Both sides tried their best. The gap still happened.

The problem is in **the moment it stopped**. When the agent stopped, what it had was "I wrote it, I read it once, looks fine." It didn't stop at "I've confirmed it's done." It stopped at "it looks done." And from the conversation history, you can't tell the difference.

## It Stops Where Things Look Done

The Claude Code docs spell it out plainly: Claude stops when the work looks done; without a check it can run, "looks done" is the only signal available, and you become the verification loop: every mistake waits for you to notice it[^S4].

This sentence is worth reading twice, word by word. It's not saying "Claude sometimes cuts corners," or "the model isn't capable yet." It's describing a structural fact: **if nothing in the entire pipeline can produce an objective result, then "looks done" is the only signal that exists in this system.** The model can only make decisions with that signal. It has nothing else.

The same docs give this phenomenon a name: the trust-then-verify gap—Claude produces a plausible-looking implementation that doesn't handle edge cases[^S4]. In plain English: you trust first (code looks good), and verification either doesn't happen or happens too late (Friday afternoon, in the ops channel). The BOM example above is the standard form of this gap: not wrong code, but nobody asked "what happens with an Excel-exported file?"

There's a second layer here that's easy to miss. The docs' suggested fix ends with: **if you can't verify it, don't ship it**[^S4]. The emphasis isn't on "verify"—it's on "don't ship." It acknowledges that some things you just can't verify. When you can't, the correct move isn't "trust your gut this one time." It's narrow the scope, change the requirement, or hold off on shipping.

## Assertions vs. Evidence: What's the Difference?

Go back to that completion message. Break it into individual sentences, and ask the same question for each one: **can I confirm this sentence without reading code, using only what it's shown me?**

- "Added `src/importer/parseCsv.js`"—you can confirm it. Whether the file exists is checkable at a glance. This is evidence (though the weakest kind).
- "Implementation follows existing module code style"—you can't confirm it. This is the model's aesthetic judgment. Assertion.
- "No errors during execution"—sounds like evidence, but it's actually an assertion. It's saying the tools it called didn't throw exceptions, not that the output is correct. All tools returning success while the result is completely wrong—totally possible.
- "Check email format and required fields"—you can't confirm it. This describes intent, not behavior. What that regex actually permits or rejects? This sentence says nothing about it.

Where's the line? **Evidence is something a second person can re-run exactly the same way**: a command plus its raw output, an exit code, a list of failed test names, a screenshot, a before/after numeric comparison. **Assertions are things you can only choose to believe or not**: "logic is correct," "should be fine," "already optimized," "won't happen again."

The official docs draw exactly this line: have Claude show evidence rather than asserting success—the test output, the command it ran and what it returned, or a screenshot of the result. Reviewing evidence is faster than re-running the verification yourself, and it works for sessions you weren't watching[^S4].

That last half-sentence is the key. If you were watching the whole time, the "assertion vs. evidence" distinction doesn't buy you much—you saw it yourself. But the moment you've looked away, all that's left in the conversation history is text, and in text, assertions look just as confident as evidence.

## Why Agents Especially Hit This Problem

We see "looks right but is wrong" in traditional software too. Why does it warrant a dedicated lesson for agents?

Because traditional testing rests on an assumption that agents don't satisfy.

Start with definitions. In computing, deterministic systems produce the same output every time given identical inputs, while non-deterministic systems—like agents—can generate varied responses even with the same starting conditions[^S3]. This isn't "has bugs so it's unstable." This is how it works. Even if you change nothing in your prompt, the decisions across two runs aren't guaranteed to match[^S2].

So the premise of traditional evaluation collapses. Traditional evaluations often assume that the AI follows the same steps each time: given input X, the system should follow path Y to produce output Z[^S2]. Multi-agent systems don't work this way. **Even with identical starting points, agents might take completely different valid paths to reach their goal**—one agent might search three sources while another searches ten, or they might use different tools to find the same answer[^S2].

Here's what that looks like concretely:

```text
Same task, same prompt, two runs

Run 1: read_file(schema.sql) → grep("user_id") → edit(models/user.js)
        → run_tests → done

Run 2: list_dir(src/) → read_file(models/user.js) → read_file(models/order.js)
        → edit(models/user.js) → edit(models/order.js) → run_tests
        → run_tests → done
```

You can't call either trajectory "wrong." The second run read an extra file, modified an extra place, and ran tests twice—maybe it took a detour, or maybe it caught coupling that the first run missed. If you write an assertion that says "must read schema.sql first," the second run fails—but the second run might've done better work.

**Checking the trajectory against a prescribed script doesn't work here**: because we don't always know what the right steps are, we usually can't just check if agents followed the "correct" steps we prescribed in advance[^S2].

Add one more layer: errors in agent systems **compound**. A minor bug in traditional software, when it hits an agent, can derail the entire task—one step failing can cause agents to explore entirely different trajectories, leading to unpredictable outcomes[^S2]. This isn't like a traditional program where "one function returns a bad value, it propagates up." An agent takes a bad result and **makes new decisions based on that bad result**: misread a file, it might conclude "this module doesn't exist" and create a new one; then it keeps working around that new module. By the time you see the final output, the error isn't in its original spot anymore. It's grown into something else.

Anthropic's own conclusion lands here: the autonomous nature of agents means higher costs, and the potential for compounding errors. We recommend extensive testing in sandboxed environments, along with the appropriate guardrails[^S1]. And one more direct line—the LLM will potentially operate for many turns, and you must have some level of trust in its decision-making[^S1].

Notice the phrasing "some level of trust." It's not saying "you have to trust it." It's saying this trust has to come from somewhere. And trust has only two sources: you watched it yourself (so the agent didn't save you any time), or something watched it for you. This entire course is about the second kind.

```agentmentor-check
{
  "id": "vq-zh-01-plausible-not-correct",
  "label": "Trust this completion report?",
  "prompt": "You ask an agent to add a “split amount by currency” function to the billing module. It runs through twenty-some tool calls and finally reports: “Done. Implementation meets requirements. No errors during execution.” You skim the diff: structure is reasonable, naming follows conventions, no obvious issues. The project has a test suite, but the agent didn't run it and you haven't either. What should you do next?",
  "whyHere": "The first half of the lesson just explained why agents stop at “looks done”; the second half will show how to give them a runnable check. This question sits in the middle, forcing you to make one concrete judgment before we get to the principles behind it—make the judgment first, then the principles stick.",
  "mode": "single",
  "choices": [
    {
      "id": "a",
      "text": "No errors in the process, and the diff looks fine—merge it. If there's a real issue, downstream will surface it.",
      "correct": false,
      "feedback": "“No errors” means the tools it called didn't throw exceptions, not that the output is correct—all tools returning success while the result is completely wrong can both be true. As for “downstream will surface it”: this is exactly what it looks like when you become the verification loop, except the verification moment got deferred until after a failure. For billing amounts, by the time downstream surfaces it, accounting is usually already asking questions."
    },
    {
      "id": "b",
      "text": "Run the test suite first, let this change get a pass/fail result, then decide whether to trust it.",
      "correct": true,
      "feedback": "Right. The value of this step isn't “I ran a test.” It's that you turned a situation you can only judge by feel into a situation with an objective result. And this step can be moved earlier: since this check exists and you know the command, next time you can tell the agent up front “after the change, run npm test; report back when everything's green.” Then you're not the one reading the result."
    },
    {
      "id": "c",
      "text": "Send another round asking the agent to double-check itself; if it says no problem, merge.",
      "correct": false,
      "feedback": "This intuition is common, but it's backward. The model that did the work shouldn't also be the referee—the official docs' advice is to have a new model with a clean context try to refute the result. When it self-checks, it's still looking at the reasoning it just wrote, which was already self-consistent—otherwise it wouldn't have written it that way in the first place. Asking it to “look again” mostly just repeats the same judgment in a more confident tone."
    }
  ]
}
```

## The Way Out: Give It a Check It Can Run

All that setup lands on one sentence: **give Claude a check it can run**—tests, a build, a screenshot to compare. It's the difference between a session you watch and one you walk away from[^S4].

How does the difference arise? Give Claude something that produces a pass or fail, and the loop closes on its own. Claude does the work, runs the check, reads the result, and iterates until the check passes[^S4].

You can map this sentence back to the harness loop from course 7 in this series. First look at where your current loop stops:

```javascript
let response = await client.messages.create({ tools, messages });
while (response.stop_reason === "tool_use") {
  messages.push({ role: "assistant", content: response.content });
  const toolResults = await runToolUses(response.content);
  messages.push({ role: "user", content: toolResults });
  response = await client.messages.create({ tools, messages });
}
// Loop stops here: stop_reason changed from "tool_use" to "end_turn"
```

What does `end_turn` mean? It means the model thinks it's done talking for this turn. **That's all.** It doesn't mean the work is correct, and it doesn't even guarantee the response is complete—this loop only recognizes `tool_use`; if `stop_reason` becomes anything else it'll exit, including when output got cut mid-sentence by `max_tokens`. Nothing in the exit condition relates to "quality of output."

So what does wiring in a check look like? Two positions work.

Position one: make the check into a tool it can call, let it run inside the loop:

```javascript
const tools = [
  ...editTools,
  {
    name: "run_checks",
    description:
      "Run the importer module test suite. Returns exit code and failed test names. " +
      "Must be called once after modifying any file under src/importer/.",
    input_schema: { type: "object", properties: {}, required: [] },
  },
];
```

Position two: add a gate after the loop exits; don't trust its self-report, run it yourself:

```javascript
// while loop finished, don't treat it as complete yet
messages.push({ role: "assistant", content: response.content }); // model's closing reply goes into history too
let verdict = await runChecks(); // { exitCode, failed: ["BOM header parsing", ...] }

while (verdict.exitCode !== 0) {
  messages.push({
    role: "user",
    content: `Checks didn't pass. Failed tests: ${verdict.failed.join(", ")}. Fix them and report back.`,
  });
  response = await client.messages.create({ tools, messages });
  // …back into the tool_use loop above, until it wraps up again…
  messages.push({ role: "assistant", content: response.content }); // each closing reply goes into history
  verdict = await runChecks();
}
```

The code itself has no tricks. The key is **the exit condition changed owners**: from "the model says it doesn't want to call more tools" to "a piece of deterministic code returned 0." The former is the model's self-assessment. The latter isn't.

So what can "check" be? The official docs give a broader range than you might expect: the check is anything that returns a signal Claude can read in the conversation—a test suite, a build exit code, a linter, a script that diffs output against a fixture, or a browser screenshot compared against a design[^S4].

Explain "fixture": it's a "golden answer file" you saved ahead of time; after running, you compare output to it, and it can't differ by even one character. Sounds blunt, but for "output format must be stable" kinds of tasks, it's the simplest and most reliable form of check.

This line of thinking aligns with Anthropic's recommendation for agent execution: during execution, it's crucial for the agents to gain "ground truth" from the environment at each step (such as tool call results or code execution) to assess its progress[^S1]. Notice "from the environment"—not from its own reasoning. The model's reasoning is self-generated. The environment's return values aren't.

## The Next Five Lessons Solve What

With "give it a runnable check" as the main thread, the remaining questions become concrete.

**Lesson 2: What to verify.** Since checking the trajectory against a prescribed script doesn't work, what do you check? Answer: end state first—evaluate whether it achieved the correct final state, not whether it followed some specific process; for complex workflows, break evaluation into discrete checkpoints where specific state changes should have occurred[^S2]. This lesson will also cover how to turn a fuzzy requirement into a measurable success criterion.

**Lesson 3: Deterministic verifiers.** How to pick and write checks that can produce pass/fail. Exact match, script comparison, test suites—what fits where, and one counterintuitive pitfall: an overly strict verifier will reject correct answers. The concrete verifier catalog and prioritization order will be in that lesson; we won't expand here.

**Lesson 4: LLM as judge.** Free-form text can't use string comparison; you have to ask a model to score it. How to write rubrics, how to constrain output format, whether to reason first or score first, and why the model doing the work shouldn't grade itself—we've already touched on this in the quiz earlier. Specific rubric design is in lesson 4.

**Lesson 5: Evaluation sets.** One check handles one task; a set of tasks makes an evaluation set. How to collect cases from real usage, how to fill in edge cases, what a holdout set does, and "how many is enough"—all answered in lesson 5; the answer might be smaller than you think.

**Lesson 6: Build it yourself.** Wire together the first five lessons: one evaluation task gets one harness loop, run it and produce a report; change one version of the prompt and see if the score moved.

## Proportionality: Don't Wrap Every Small Thing in a Sign-Off Process

At this point, it's easy to swing to the other extreme: assuming every task needs tests, a judge, and an evaluation set. Not so.

Anthropic's original line is: **the key to success, as with any LLM features, is measuring performance and iterating on implementations. To repeat: you should consider adding complexity only when it demonstrably improves outcomes**[^S1]. The same article has a more specific route recommendation—start with simple prompts, optimize them with comprehensive evaluation, and add multi-step agentic systems only when simpler solutions fall short[^S1].

Applied to verification, the decision criteria come down to a few lines:

- **Will this task run repeatedly?** A one-off script, ad hoc data processing, a three-minute job you plan to watch—setting up a sign-off mechanism is a net loss. Things that run repeatedly, get modified by others, or run while you're not around—worth it.
- **Who bears the cost of an error?** You fix a typo wrong, you roll it back yourself and it's done. You break billing logic, accounting bears the cost. The further downstream the cost and the harder it is to roll back, the more you should gate it up front.
- **How much time do you spend verifying it now?** If every time you have to manually open three pages and compare them, scripting that three-page comparison is the thing that most deserves automation—you're already paying this cost; you just haven't noticed.

One more case worth calling out separately: **some checks you already have, you just haven't wired them to the agent.** That test suite in the project, that lint command, that build script—they probably existed already. Writing them into the task description or making them into a tool costs almost nothing, but the nature of the session changes. This is the highest ROI step, and it's the starting point for the next few lessons in this course.

## 💻 Exercises

<!-- exercises -->

### Level 1: Distinguish Assertions from Evidence

Below are three agent completion reports from three different sessions. For each one, judge: which parts are assertions, which are evidence? Then write **what specific pieces of evidence are still missing** from each report before you'd treat it as "sign-off passed."

Text answers, no code needed.

**Report A**

```text
Done. I refactored src/importer.js, extracted field mapping into a standalone
function mapFields(), logic is much clearer than before. Changes didn't affect
existing behavior.
```

**Report B**

```text
Done. After running npm test -- importer, output was:

  PASS  test/importer.test.js
  Tests: 14 passed, 14 total
  Time:  1.842 s

The 3 new test cases are "handles BOM in header", "rejects duplicate email",
and "errors on missing column". Did not run the full test suite, only this
importer group.
```

**Report C**

```text
Done. Fixed the issue where BOM header caused field mapping to fail. I double-
checked the code, logic is correct, shouldn't see similar problems again. Also
optimized parsing performance a bit while I was at it.
```

<!-- rubric -->

- All three get a "mainly assertions / mainly evidence" judgment, and the results are: B is mainly evidence (the only one close to sign-off-ready among the three), A and C are mainly assertions
- For each report, at least one **concrete** missing piece of evidence is identified—in the form of a command plus its raw output, a failed-to-passed comparison, before/after numbers, etc.—not just a vague "needs tests"
- Points out that "I double-checked the code" in C is the model that did the work grading itself, which doesn't count as independent verification; and notices that "optimized performance a bit" is an out-of-scope change with zero before/after baseline data to back it up
- Identifies the single most dangerous sentence in report A: "changes didn't affect existing behavior"—this is a completely verifiable claim (refactoring's definition is behavior unchanged), but the report gives zero verification, and a verifiable statement presented as an assertion is easier to let slip through than pure fluff, because it sounds like a conclusion

<!-- answer -->

**Report A: Almost entirely assertions.**

- "Extracted field mapping into a standalone function `mapFields()`"—weak evidence. Whether the function exists and what it's named can be confirmed from the diff, but that only proves the change happened, not that the change is correct.
- "Logic is much clearer than before"—assertion. This is an aesthetic judgment; it's not verifiable and it's not what sign-off should care about.
- "Changes didn't affect existing behavior"—**this is the most dangerous sentence**. It's a completely verifiable claim (the definition of refactoring is behavior unchanged), but the report provides zero verification. A verifiable statement spoken as an assertion slips past people more easily than pure fluff, because it sounds like a conclusion.

What's still missing for sign-off:

1. Test output from before and after the refactor, both copies needed, showing test count and pass count stayed the same (this is the minimum evidence for "behavior unchanged")
2. If `importer.js` had no test coverage to begin with, that needs to be stated up front—"no tests so can't prove behavior unchanged" is an honest state, far more useful than "changes didn't affect existing behavior"
3. Change scope: `git diff --stat`, confirming it only touched `src/importer.js` and didn't modify anything else on the side

**Report B: Mainly evidence.**

- Command `npm test -- importer` plus raw output—you can re-run this exactly. This is standard evidence form.
- Three new test names are listed; you can see what directions they cover (BOM, duplicate email, missing column).
- "Did not run the full test suite, only this importer group"—this sentence is valuable. It proactively states what it didn't do. When a report includes "I didn't do X," it usually means it has a concept of its own boundaries.

What's still missing for sign-off:

1. Full test suite results. Local pass doesn't rule out this change breaking another module—this is exactly where compounding errors love to hide
2. Test names are just names. What `"handles BOM in header"` actually asserts inside, you need to glance at source or more detailed output; a test named right but asserting nothing will still run green
3. Strictly speaking, there should also be a "saw it red first" record: roll back the fix, confirm these three tests fail. A test that's never been red can't prove what it's testing

**Report C: Assertions, plus one unverified out-of-scope change.**

- "Fixed the issue where BOM header caused field mapping to fail"—assertion. Says what was done, doesn't say how the result turned out.
- "I double-checked the code, logic is correct"—the model doing the work is grading itself. When it re-checks, it's reading the reasoning it just generated, and that reasoning was already self-consistent. This sentence doesn't count as independent verification.
- "Shouldn't see similar problems again"—assertion, and the least informative kind. Phrasings like "shouldn't," "won't again" contain zero verifiable content.
- "Optimized parsing performance a bit while I was at it"—out-of-scope change. No before/after numbers, not even saying where it changed or what technique it used. The risk here is higher than the bug it fixed: fixing a bug at least has a clear target; "optimize on the side" doesn't.

What's still missing for sign-off:

1. A test case that reproduces the BOM issue, plus its failed-to-passed comparison output (the only thing that can prove "fixed")
2. Baseline data for the performance claim: before-and-after timing running the same input, plus measurement method. If it can't produce that, the correct move is to revert this change and submit it separately, not let it merge bundled with the bug fix
3. Full test suite results—BOM fixes usually touch the parsing entry point, easiest place to affect other branches by accident

**One-sentence summary of all three**: the judgment standard is always the same—**can I confirm this sentence without reading code, using only what it's shown me?** Confirmable is evidence; can only choose to believe or not is assertion. Why B is best isn't because it's longest; it's because what it pasted you can re-run exactly.

<!-- hint -->

Ask the same question for every sentence: **can I confirm this without opening code, using only what it's pasted here?** If yes, it's evidence; if I can only choose to believe or not, it's assertion. Don't get swayed by the sentence's tone—"changes didn't affect existing behavior" sounds very certain, but it gave you nothing you can verify.

<!-- hint -->

"No errors," "logic is correct," "shouldn't happen," "already optimized"—these phrasings share one thing: the subject is always the model's evaluation of its own work. Flip it around: what does something actually verifiable look like? Usually it carries command lines, exit codes, test names, timing, line counts—concrete stuff, and a second person can re-run it identically. Pay special attention to sentences in report A that "could be verified but aren't"—they slip past defenses more easily than pure empty talk.

### Level 2: Design an Evidence Checklist for a Small Task

The task is this:

> Write a script that removes duplicate rows from `data/contacts.csv` based on the `email` column, keeping only the **first occurrence** of each email, and write the result back to the same file.

Suppose you hand this task to an agent, it runs, and reports "Done, duplicates removed."

Design an **evidence checklist**: what things do you need to see to sign off on this task? For each item, write clearly what form it takes (a command plus its output? A before/after comparison? A file?). Then answer the second question: **which one of these can make the loop close on its own**—meaning the agent can run it, read the result, and iterate until it passes, without you being there?

Pseudocode or command examples are fine, no need for full code.

<!-- rubric -->

- Checklist has at least one item in "command plus its raw output" form, and writes clearly what to look at **before and after** the change, not just the after-only result
- Explicitly identifies which check can produce pass/fail to let the loop close, with reasoning landing on "doesn't need a human to interpret, has a clear expected value," not "this one's most important"; and catches that a single metric is cheatable—indicators like "duplicate count is 0" can be achieved by truncating the file to empty, so a check that truly closes the loop has to bundle "no duplicates, kept first occurrence, row count matches expectation" into one exit code, not rely on any single one
- Realizes "no more duplicates" ≠ "did it right"; checklist has at least one item that guards against accidental deletion (e.g. verify the kept row is the first occurrence, non-duplicate rows untouched, or there's a backup/`git diff` for rollback)

<!-- answer -->

**Evidence Checklist**

**1. Row counts before and after**

```text
Before change: wc -l data/contacts.csv   →  1204
After change:  wc -l data/contacts.csv   →  1187
```

Both numbers needed. Just the after number is meaningless—you don't know what it changed from. Also watch whether the header row is counted; that one-line offset is easiest to overlook during sign-off.

**2. Count of duplicate emails (expected value: 0)**

```text
cut -d, -f2 data/contacts.csv | tail -n +2 | sort | uniq -d | wc -l
Before change → 17
After change  → 0
```

The key is this command **is independent of the script the agent wrote**. If you re-run its own script to prove its own correctness, you've proven nothing—bugs in the deduplication script will appear identically in the check. A 0 computed by a different set of tools—that's evidence.

**3. The kept row really is the first occurrence**

Pick an email that was duplicated in the original file, paste all its occurrences (with line numbers), then paste the one row left in the result file:

```text
Before change:
  grep -n "li.wei@example.com" data/contacts.csv
  42:1042,li.wei@example.com,李伟,2024-03-11
  877:1877,li.wei@example.com,李伟（重复导入）,2025-01-20

After change:
  grep -n "li.wei@example.com" data/contacts.csv
  42:1042,li.wei@example.com,李伟,2024-03-11
```

What's left is line 42, not line 877. This single check isn't catchable by "duplicate count is 0"—deleting either of the two rows makes duplicate count 0.

**4. Non-duplicate rows weren't touched**

```text
git diff --stat data/contacts.csv
 data/contacts.csv | 17 -----------------
 1 file changed, 17 deletions(-)
```

Only deletions, no additions, and no "modifications" (which show as one deletion plus one addition in diff). This guards against "while I was at it, unified date formats" or "trimmed whitespace"—out-of-scope changes.

**5. Rollback trail**

Writing back to the original file is a destructive operation. Either there's a backup file path (`data/contacts.csv.bak`), or this file was already in git and `git checkout` can revert it in one command. This isn't "prove it's right"; it's "if it's wrong, we can undo it"—but it equally belongs in sign-off.

**Which One Can Make the Loop Close on Its Own**

Item 2 comes closest, but **it alone isn't enough**.

First, why it's close: it's the only check in the list that needs zero human interpretation—one command, one number, one clear expected value of 0. Return value translates directly to pass/fail; the agent knows after running whether it passed. Item 1 requires a human to judge "is 17 fewer rows reasonable," item 3 needs a human to eyeball two text blocks, item 4 needs a human to understand the shape of the diff, and item 5 isn't even a check. Only item 2 can auto-judge.

Now why it's not enough: it only guards "didn't dedupe cleanly," not "deleted too much." `truncate -s 0 data/contacts.csv` empties the file; duplicate count is still 0; this check still passes green. **Hit the metric, broke the task**—this is that scenario.

So the correct approach is to merge items 2, 3, and 4 into one validation script, where all three assertions must pass to exit 0:

```javascript
// scripts/check-dedupe.js
// Usage: node scripts/check-dedupe.js <original-file-backup> <result-file>
// Exit code 0 = pass, 1 = fail

const before = readRows(process.argv[2]);
const after = readRows(process.argv[3]);
const failures = [];

// Assertion one: result has no duplicate emails
const emails = after.map((r) => r.email);
if (new Set(emails).size !== emails.length) {
  failures.push("Result file still contains duplicate emails");
}

// Assertion two: kept rows are each email's first occurrence (guards deleting the wrong one)
const expected = [];
const seen = new Set();
for (const row of before) {
  if (seen.has(row.email)) continue;
  seen.add(row.email);
  expected.push(row);
}
if (JSON.stringify(expected) !== JSON.stringify(after)) {
  failures.push("Kept rows don't match the 'first occurrence' expectation");
}

// Assertion three: row count exactly equals expected post-deduplication count (guards over- or under-deletion)
if (after.length !== expected.length) {
  failures.push(`Row count mismatch: expected ${expected.length}, got ${after.length}`);
}

if (failures.length > 0) {
  console.error(failures.join("\n"));
  process.exit(1);
}
console.log("check-dedupe: passed");
```

Notice assertion two actually implies assertions one and three—but splitting them into three separate reports means the agent gets more specific failure info and a clearer direction for fixing. Giving checks the ability to "say clearly what's wrong" is as important as the check itself.

With this script, the task description can become: "Before deduping, back up the original file as `data/contacts.csv.bak`; after deduping, run `node scripts/check-dedupe.js data/contacts.csv.bak data/contacts.csv`; if exit code isn't 0, keep fixing until it passes." At that point the agent does the work, runs the check, reads the result, and iterates to pass—the entire process doesn't need you there[^S4].

The remaining item 5 (rollback trail) is better placed outside the script, with your harness code unconditionally making a backup before running the task—backup shouldn't rely on the model remembering to do it.

<!-- hint -->

Destructive write-back is the hidden reef in this problem. "Duplicates are gone" as an outcome can also be achieved by `truncate -s 0` to empty the file. Does your checklist block this "metric achieved, task broken" case? Think in that direction first—what's still missing?

<!-- hint -->

When picking "which one can make the loop close on its own," there's only one standard: **after the agent runs this check, can it know whether it passed without asking a human?** Anything requiring you to eyeball two text blocks or judge "is this number reasonable" doesn't count. Also think about whether, if no single item qualifies alone, you can merge a few into one script that together produces one exit code.

<!-- /exercises -->

## Recap

- Claude stops when the work **looks** done. Without a check it can run, "looks done" is the only signal available, and you become the verification loop: every mistake waits for you to notice it[^S4].
- The official docs name this gap: the trust-then-verify gap—Claude produces a plausible-looking implementation that doesn't handle edge cases. The paired fix's second half is equally important: **if you can't verify it, don't ship it**[^S4].
- The line between assertions and evidence is "can a second person re-run this exactly the same way." Have Claude show evidence—test output, the command it ran and what it returned, a screenshot of the result—not assertions of success. Reviewing evidence is faster than re-running the verification yourself, and it works for sessions you weren't watching[^S4].
- Agents are non-deterministic systems: even with the same starting conditions, they can generate varied responses[^S3]; even with identical prompts, decisions across runs aren't guaranteed to match[^S2]. So the traditional evaluation assumption "given input X, follow path Y, produce output Z" fails[^S2]—identical starting points can produce completely different but valid paths[^S2].
- Errors in agent systems compound: one step failing can cause agents to explore entirely different trajectories, leading to unpredictable outcomes[^S2]. Autonomy brings higher costs and potential for compounding errors, so extensive testing in sandboxed environments with guardrails is recommended[^S1].
- The way out is to give it a runnable check. With something that produces pass or fail, the loop closes on its own: do the work, run the check, read the result, iterate until it passes[^S4]. The check can be a test suite, a build exit code, a linter, a script that diffs output against a fixture, or a browser screenshot compared against a design[^S4].
- During execution, let the agent gain "ground truth" from the environment at each step (tool results, code execution results) to assess progress, not from its own reasoning[^S1].
- The LLM will potentially operate for many turns, and you must have some level of trust in its decision-making[^S1]—but that trust has to come from somewhere.
- Don't wrap every small thing in a full sign-off mechanism. You should consider adding complexity only when it demonstrably improves outcomes[^S1]; first check whether this task runs repeatedly, who bears the cost of errors, and how much time you spend manually verifying it now.
- The highest ROI step is often: that test suite, that lint command, that build script in your project already exists—you just haven't wired it to the agent yet.

[>> Lesson 2: What to Verify: End State First, Process as Backstop](./02-what-to-verify.md)
