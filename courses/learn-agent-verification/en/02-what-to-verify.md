# Lesson 2: What to Verify: End State First, Process as Backstop

> Learning goals:
> - Understand why "record the correct steps then check them one by one" is guaranteed to misjudge agents, and switch to end-state evaluation instead
> - For complex workflows, identify a few discrete verification checkpoints that confirm "the expected state changes happened" rather than validating every step
> - Turn a vague requirement into measurable, achievable, multi-dimensional success criteria, and know how far to take trajectory assertions
>
> Prerequisites: Finished Lesson 1, know that when there's no runnable check you become the verification loop | Previous: [Lesson 1 <<](./01-looks-done-vs-is-done.md) | Next: [Lesson 3 >>](./03-deterministic-checks.md)

## Three Runs, Three "Failed" Verdicts

You decide to add verification for your agent. The first impulse is nearly universal: record the "standard approach." Run through the task manually once, write down every step—step 1 should call `search`, step 2 should call `fetch_page`, step 3 should call `write_note`—and save that as the answer key. From then on, every time the agent runs, compare its call sequence against this answer step by step. One mismatch and it fails.

You run it three times. Three failures.

You check the outputs: three summaries, facts correct, sources reliable, all requested angles covered. The only difference was the path—first run searched three sources and that was enough, second run searched ten, third run looked up terminology definitions first before searching. This is exactly what Anthropic observed in their own multi-agent research system: even with identical starting points, agents might take completely different but valid paths to reach their goal, one searching three sources while another searches ten, or using different tools to find the same answer[^S2].

What failed wasn't the agent. It was your verification method.

## You Don't Actually Know What the "Correct Steps" Are

Traditional evaluation carries a deeply buried default assumption: given input X, the system should follow path Y and produce output Z—the same steps every time[^S2]. This assumption holds so naturally for deterministic systems that most people never realize it's an assumption at all. Agents upend it immediately.

What's truly uncomfortable isn't just "the path will vary"—it's this sentence:

> Because we don’t always know what the right steps are, we usually can't just check if agents followed the “correct” steps we prescribed in advance. Instead, we need flexible evaluation methods that judge whether agents achieved the right outcomes while also following a reasonable process[^S2].

"We don't always know what the right steps are"—that's the key. The path you recorded isn't the only correct path. It's just **the path you happened to take** that time. You elevated it to the answer key, so every other approach became an error.

Note the second half: "while also following a reasonable process." This doesn't mean ignore process entirely. It means don't use one fixed path as the yardstick.

## End-State Evaluation: Judge Results, Not Flow

Anthropic's approach is direct: focus on end-state evaluation rather than turn-by-turn analysis—don't judge whether the agent followed a specific process, judge whether it achieved the correct final state[^S2]. This approach acknowledges that agents may find alternative paths to the same goal while still ensuring they deliver the intended outcome[^S2].

First, a plain-language definition of "end state": after the task completes, the state you can observe in the environment and verify after the fact. Which files appeared in the filesystem, what values that database record's fields have now, which label the ticket carries, whether the returned JSON has `status: "resolved"`.

A useful litmus test: end state is a **noun**, not a verb. "Called `rename_file`" is a verb; "all filenames match a certain format" is a noun. Verification accepts only nouns.

```text
Task: Rename invoice PDFs in downloads/ to "date_vendor.pdf"

Step-based verification (brittle)     End-state verification (stable)
1. Call list_files                    downloads/ has no original filenames
2. Call read_pdf for each             Each filename matches ^\d{8}_[a-z0-9-]+\.pdf$
3. Call extract_date                  File count matches pre-run count, nothing lost or added
4. Call rename_file for each          Filename dates match invoice dates in PDF content
```

The left column fails the moment the agent uses one batch read instead of four individual reads, even if results are identical. The right column doesn't care how it reads—because it describes "what downloads/ looks like now," unrelated to how it got that way.

There's an easy-to-miss spot when writing end-state assertions: **write down what shouldn't change too**. That "file count matches pre-run" line above is one. If the agent renames two files to the same name and the second overwrites the first, the "all filenames are valid" check passes perfectly. End-state assertions must guard both "expected changes happened" and "unexpected changes didn't."

## Complex Workflows: Split Evaluation Across Checkpoints

End-state evaluation isn't "ignore process entirely." The very next sentence in the source gives an out: for complex workflows, break evaluation into discrete checkpoints where specific state changes should have occurred, rather than attempting to validate every intermediate step[^S2].

Notice the phrasing—"specific state changes should have occurred," still state, still nouns. Just moving the observation point from "the finish line" to "a few spots along the way."

> **Term collision warning**: The "checkpoint" in Course 9 of this series means **saving context**—writing the agent's running state to disk so it can resume from there after a crash, for recovery. The "checkpoint" in this lesson means **verifying state**—confirming expected state changes happened at a point in the flow, for validation. The positions often overlap (checkpointing where you also verify is natural), but they solve different problems. Mixing them in discussion leads to confusion, so below we'll call these "verification checkpoints" and those in Course 9 "recovery checkpoints."

When a verification checkpoint is worth adding, look at three things:

- **Long workflow, end state too far from start**. When it fails you only know "didn't reach the end," not where the deviation began.
- **Irreversible operations**. Emails sent, inventory deducted, files overwritten—by the time end state reveals the error it's too late.
- **Intermediate output is the foundation for subsequent steps**. Migration script creates table then loads data; wrong table structure means all loaded data is garbage, rework cost multiplies.

If none of these apply, don't add one.

Where to add them: at **positions where state undergoes substantive change**, not after every tool call.

```text
Task: Migrate user table from old schema to new schema

Verification checkpoint 1 (after table creation): new_users table exists, columns exactly match target schema
Verification checkpoint 2 (after data load): new_users row count == old_users row count, no duplicate primary keys
End state: App reads new table and passes smoke test (most basic "does it run" check), old_users renamed to old_users_backup

What we don't check: whether it wrote CREATE TABLE or copied from a template,
whether it loaded all at once or in batches, how many batches, how many rows per batch.
```

Two checkpoints, one end state. Three assertions govern the entire migration. If you went with "validate every intermediate step," this workflow could generate dozens of assertions, most of them penalizing legitimate implementation differences.

## Pause Here: What's Wrong with This Proposal

```agentmentor-check
{
  "id": "vq-zh-02-endstate-vs-steps",
  "label": "Record-replay as verification standard?",
  "prompt": "A colleague proposes: pick one particularly clean run, record its complete tool call sequence as the answer key, and after every future run, diff the new sequence against it step by step—anything that doesn't match fails. He says this is most rigorous because \"not a single step goes unchecked.\" What's the fundamental problem with this proposal?",
  "whyHere": "You just read the \"evaluate end state not turn-by-turn\" rule. The rule itself sounds simple, but when faced with a concrete proposal it's easy to get swayed by the \"recording is more rigorous\" intuition—test it here first.",
  "mode": "single",
  "choices": [
    {
      "id": "a",
      "text": "Record-replay itself is fine; the problem is the recorded run might not be optimal. Run several rounds, pick the cleanest one to record and you're set.",
      "correct": false,
      "feedback": "Switching which run you record doesn't fix the core issue: no matter how clean the recorded path is, it's still just one path. Even with identical starting points, agents might take completely different but valid paths—one searches three sources, another searches ten[^S2]. \"A better answer key\" doesn't solve \"there shouldn't be a single answer key.\""
    },
    {
      "id": "b",
      "text": "A single sequence is too rigid. Record several valid paths to form a whitelist; as long as the run matches any path in the whitelist it passes.",
      "correct": false,
      "feedback": "This is looser than a single path, but the direction is still wrong. Valid paths have no upper bound; the whitelist can never be complete. Every time the agent finds a new correct approach you have to come back and add another entry—you're maintaining a list that's guaranteed incomplete, and it can't catch \"path is in the whitelist but result is wrong\" failures."
    },
    {
      "id": "c",
      "text": "It treats \"process consistency\" as a proxy for \"result correctness.\" But you don't always know what the correct steps are, so you usually can't check if the agent followed your prescribed steps; what you should check is whether it achieved the correct final state and followed a reasonable process.",
      "correct": true,
      "feedback": "Right. This is exactly the source's judgment: because we don't always know what the right steps are, we usually can't just check if agents followed prescribed \"correct\" steps; we need flexible evaluation methods that judge whether they achieved the right outcomes while following a reasonable process[^S2]. Step-by-step diff has two fatal misjudgments: different path, correct result—false failure; same path, wrong result—false pass."
    }
  ]
}
```

## How to Define Success Criteria: Measurable, Achievable, Multi-Dimensional

Those four words "correct end state" need to land on concrete numbers or clear judgments, otherwise you've just circled back to "looks right." The official docs give two hard requirements for success criteria:

- **Measurable**: Use quantitative metrics or well-defined qualitative scales (a scale is a scoring rubric checklist; specifics of how to write one are Lesson 4 content). Numbers provide clarity and scalability, but qualitative measures can be valuable if consistently applied along with quantitative measures[^S5].
- **Achievable**: Base your targets on industry benchmarks, prior experiments, AI research, or expert knowledge. Your success metrics should not be unrealistic to current frontier model capabilities[^S5].

And one more: most use cases need multidimensional evaluation along several success criteria[^S5].

The official docs' complete example is one sentence (annotations in parentheses are from the original):

> The sentiment analysis model should achieve an F1 score of at least 0.85 (Measurable, Specific) on a held-out test set* of 10,000 diverse Twitter posts (Relevant), which is a 5% improvement over the current baseline (Achievable)[^S5].

This sentence is worth unpacking because each component blocks a specific failure mode:

| Component | What it blocks |
| --- | --- |
| F1 score | Blocks "feels about right." F1 (harmonic mean of precision and recall, 0 to 1) is a computable number; two people must get the same result |
| At least 0.85 | Blocks moving goalposts after the fact. Define "passing" after you run and it always passes |
| 10,000 posts | Blocks coincidental results from too-small samples. This is the scale from the official example, not a universal threshold |
| Held-out test set | Blocks tuning against the eval set—high scores on seen questions don't count |
| Diverse Twitter posts | Blocks looking good only on clean samples, collapsing when real distribution arrives |
| 5% over baseline | Blocks unrealistic targets. It anchors to already-achieved levels, not wishful thinking |

That last row is the concrete method for "achievable": the threshold isn't reverse-engineered from wishes; it's a small step forward from current state. If you have no baseline, run one version of the most naive implementation and use its score as baseline. When you can't even run a baseline, don't rush to set numbers.

There's an even earlier question. When Anthropic describes agent-appropriate scenarios, they say: agents add the most value for tasks that require both conversation and action, **have clear success criteria**, **enable feedback loops**, and integrate meaningful human oversight[^S1]. Read it backwards—if you can't write success criteria for this task no matter what, the problem isn't the verification step; this task shouldn't have been handed entirely to the agent to run alone. Can't write criteria, you have to watch the whole thing—as Lesson 1 said, you become the verification loop at that point.

## Trajectory Assertions: You Can Add Them, But Don't Hard-Code

End-state evaluation catches "is the result correct," but it misses one class of problem: does the agent actually recognize that new tool you gave it.

Official docs give an optional addition: for each prompt-response pair, you can optionally also specify the tools you expect an agent to call in solving the task, to measure whether or not agents are successful in grasping each tool's purpose during evaluation[^S3]. This is trajectory assertion—not judging order, not judging count, only judging whether certain tools appeared in the trajectory.

When it's useful: you just added a `search_internal_docs` tool and want the agent to use it for internal-process questions. But it goes searching the public web, finds a similar enough answer, and end-state validation still passes. Only trajectory can see that difference.

The limit is written in the immediately following sentence: because there might be multiple valid paths to solving tasks correctly, try to avoid overspecifying or overfitting to strategies[^S3].

Concrete boundaries:

- Assert only "set contains," not order, not count
- List only the one or two tools you truly care about; don't copy the whole sequence in—that's record-replay again
- Trajectory assertion fails but end state passes: log an observation, don't fail the whole evaluation
- It's an optional addition, not the default. Default is still end state[^S2]

```javascript
// Shape of one eval case: end-state judgment is mandatory, trajectory assertion is optional
const evalCase = {
  id: 'invoice-rename-003',
  prompt: 'Rename this month\'s invoices in downloads/ to date_vendor.pdf',
  // Required: check what the environment became after the run (how to write this in Lesson 3)
  checkEndState: async (env) => { /* ... */ },
  // Optional: expect it touched at least these tools, regardless of order or call count
  expectedTools: ['read_pdf', 'rename_file'],
};
```

## Beyond Pass Rate: What Else to Record

After an eval run, if you only get a pass rate, you'll find yourself with nothing to say—what does 78% mean? Should you adjust the prompt next or the tools?

Official docs recommend collecting these metrics beyond top-level accuracy: the total runtime of individual tool calls and tasks, the total number of tool calls, the total token consumption, and tool errors[^S3]. These metrics don't participate in judgment; they participate in **diagnosis**.

Official docs give two readings:

- Lots of redundant tool calls might suggest some rightsizing of pagination or token limit parameters is warranted[^S3]
- Lots of tool errors for invalid parameters might suggest tools could use clearer descriptions or better examples[^S3]

What these share: they point the finger at **tool design**, not the model. Lots of redundant calls usually means it can only fetch 20 items at a time so it has to paginate through ten pages; lots of parameter errors usually means the tool description didn't explain what format that field needs. These problems root on the tool side—just adding "call less often" or "write parameters carefully" to the system prompt usually doesn't work; you have to adjust the tool's parameter design and description.

Following this thread yields a few more (below aren't officially endorsed, they're engineering judgments extrapolated from the above two—verify on your own data): pass rate unchanged but token consumption doubled means this change isn't free; one category of tasks has especially large duration variance, likely hiding retries or circling; errors concentrated on one tool, look at that tool first, don't suspect the prompt.

An eval run should drop at least these columns; Lesson 6 when building the eval harness will use them directly (to save column width, tokens in/out will be merged into one):

```text
case_id | passed | duration_ms | tool_calls | tokens_in | tokens_out | tool_errors
```

## Boundaries: Three Things Not to Do

**One: Don't try to validate every intermediate step**[^S2]. This is the easiest boundary in this lesson to break because the "verify more is safer" intuition is so strong. The actual result is opposite: the finer the assertions, the more legitimate differences get penalized, the noisier the eval, until you start ignoring red—at which point it's completely useless.

**Two: Don't make trajectory assertions the default**. Adding a trajectory assertion is so cheap you can write another `expectedTools` entry with no effort. By the tenth entry you're already substantively prescribing strategy, only formally still calling it "assertion." Each time you add one, ask yourself: will output truly break if this tool isn't called? If the answer is "not necessarily," don't add it.

**Three: Don't set thresholds after the run**. Looking at a score of 0.82 and saying "0.8 should be enough," and looking at 0.86 and saying "needs to be 0.85," are the same self-deception. Set thresholds before the run, and write down the justification.

## 💻 Exercises

<!-- exercises -->

### Level 1: Write End States for Four Tasks (No Code)

For the four tasks below, write for each: (1) what **end state** you're verifying; (2) whether to add verification checkpoints, where, and why.

1. **Batch rename**: Rename 200 PDFs in `invoices/` to "YYYYMMDD_vendor.pdf"
2. **Research and write summary**: Research three competitors' pricing strategies, write a summary with citations
3. **Fix a failing test**: `user.spec.ts` has a `should reject expired token` test failing; have the agent fix it
4. **Ticket classification and labeling**: Tag last week's 500 tickets as "billing / outage / feature request / other"

<!-- rubric -->

Rubric:

- All four tasks' end states are written as "state you can verify in the environment after the run," are nouns not verbs, don't mix in step descriptions like "step N should call which tool"; and at least one task writes assertions like "things that shouldn't change didn't change"
- Each task has a clear "add / don't add verification checkpoint" judgment with reasoning grounded in workflow length, whether there are irreversible operations, or whether subsequent steps depend on intermediate outputs—not "safer to be thorough"
- Wherever verification checkpoints were added, they describe "a specific state change should have occurred," and each task has at most two or three, without sliding into step-by-step validation

<!-- answer -->

Reference answer:

**1. Batch rename**

End state: file count in `invoices/` matches pre-run count; every filename matches `^\d{8}_[a-z0-9-]+\.pdf$`; spot-check that filename dates match invoice dates in PDF content; set of all file content hashes before and after is identical (this guards "things that shouldn't change didn't"—renaming shouldn't alter content or lose files to same-name overwrites).

Verification checkpoint: needed. Renaming is an overwriting irreversible operation; second criterion directly applies. Approach is to change **the deliverables** to two items: first produce a complete `old_name → new_name` mapping file (like `rename-map.json`), then execute renames. The verification checkpoint sits at "mapping file generated, renames not yet executed"—at that point the expected state change is "mapping file exists"; verify it covers all 200 files, new names don't collide pairwise, all formats are valid; stop before any file gets overwritten if broken. Note this changes what the task delivers (one more mapping file as intermediate output), not prescribing its internal path: how it reads PDFs, how it extracts dates, which it calculates first—still don't care at all.

**2. Research and write summary**

End state: all three competitors' pricing tiers appear in the summary; every factual claim has a citation; every citation's link is openable and content actually supports that claim; portions without public pricing are explicitly written as "no public pricing found," not fabricated numbers. Some of these end states are programmatically testable (link reachability, whether all three appear, whether each paragraph has at least one citation); some require humans or judges (whether citations truly support the statement)—Lesson 3 and Lesson 4 content respectively.

Checkpoint: not necessary. Workflow is long but every step is reversible (searching wrong and re-searching has no cost), intermediate outputs aren't foundations for later steps. If you insist on adding one, put a verification checkpoint at "source list collected, writing hasn't started," checking each of the three has at least one source—whole-company omissions are cheaper caught early.

**3. Fix a failing test**

End state: the originally failing case now passes; other cases in the entire test suite still pass (didn't break another to fix one); `user.spec.ts` itself wasn't modified. That last one prevents it from changing the assertion rather than the implementation—if the task explicitly allows changing tests, swap it for "test file modifications require human review."

Checkpoint: not necessary. This is the most comfortable of the four: end state itself is a command that outputs pass/fail; one run gives you the answer; inserting mid-checkpoints is pure excess.

**4. Ticket classification and labeling**

End state: all 500 tagged with no omissions, no null values; all tag values fall within the four allowed values, out-of-bounds is wrong; on a held-out manually-labeled sample, accuracy or per-class F1 reaches pre-set threshold; distribution across the four classes doesn't obviously collapse (like 480 all tagged "other"—total accuracy might look fine but should still alarm).

Checkpoint: depends on write method. If writing to DB one by one (partially irreversible), add a checkpoint at "first 50 tagged" position, verify tag values are legal and distribution isn't absurd, stop early if broken; if producing complete labeling result first then batch-writing to DB, that intermediate output itself is a natural checkpoint position, no need for an extra one.

<!-- hint -->

Hint 1: To judge whether what you wrote is end state, use the "noun or verb" ruler. "Called `rename_file`" is a verb; "all filenames match a certain format" is a noun. Verification accepts only nouns.

<!-- hint -->

Hint 2: Whether to add verification checkpoints, only look at three things—how long is the workflow, are there irreversible actions, will later steps use intermediate outputs as foundation. If none apply don't add; adding them only makes evals noisy.

### Level 2: Rewrite Vague Requirement into Multi-Dimensional Success Criteria (No Code)

Original requirement is one sentence: "Help me organize this week's meeting notes, citations should be reliable."

Rewrite it into measurable **multi-dimensional** success criteria. For each dimension write all four items: what the metric is called, how to measure it, what threshold, **why that threshold is realistically achievable**. Then decide which dimensions verify end state and which set intermediate checkpoints, with reasoning. At least three dimensions. No code needed.

<!-- rubric -->

Rubric:

- At least three dimensions, each with all four items "metric / how to measure / threshold / threshold justification" fully written; missing any one item is incomplete; and these dimensions don't overlap substantially, each blocking different failure modes
- Thresholds aren't pulled from thin air: anchored to current baseline, human performance on the same task, or observations from a small-scale trial run[^S5]; any dimension set to 100% explains why it's purely mechanically checkable and model failure just means rerun, not using "100%" as a slogan
- Marked which method each dimension uses for scoring (programmatically feasible / needs human or judge), and made clear which dimensions verify end state, which set intermediate checkpoints, with reasoning

<!-- answer -->

Reference answer:

First, unpack the word "reliable." It mixes at least three different things: citation format correct or not, whether the thing the citation points to exists, whether the citation actually supports that claim. Without unpacking, you can't set thresholds individually.

**Dimension 1: Citation resolvability rate**

- Metric: proportion of citations in the notes that can locate a specific source (audio timestamp, shared doc paragraph anchor, chat message ID)
- How to measure: programmatically. Parse each citation per agreed format, query source system for each to check existence
- Threshold: 100%
- Justification: this dimension doesn't depend on the model's judgment, only format constraints and existence checks. Parse failure means have the agent rewrite, rewrite until it passes. Only this kind of purely mechanical check can demand full marks

**Dimension 2: Citation support quality**

- Metric: among sampled "claim–citation" pairs, proportion where citation content actually supports the claim
- How to measure: needs human or LLM judge (Lesson 4 content). Have humans label a batch first as baseline
- Threshold: above 0.9, and failed samples can't include hard errors like "citation exists but content completely unrelated to claim"
- Justification: don't demand 100% because "counts as support" itself has fuzzy boundaries; two people labeling the same batch won't fully agree. Threshold should anchor near human consistency rate on the same task—official requirement for "achievable" is to base targets on existing benchmarks, prior experiments, or expert knowledge, not arbitrarily set to 1.0[^S5]

**Dimension 3: Coverage completeness**

- Metric: every meeting this week has a corresponding section in the notes; decisions reached and to-dos assigned in each meeting are all listed
- How to measure: whether meetings are complete can be programmatically verified (N meetings in calendar means N sections should be in notes); whether decisions and to-dos are missed needs human spot-check or judge
- Threshold: meeting coverage 100%; decision and to-do recall above 0.85
- Justification: missing an entire meeting is a hard error and mechanically checkable, shouldn't tolerate. Missing one to-do is constrained by source material—a vaguely-mentioned "I'll follow up on this" in audio, humans listening might not all catch it either; setting 1.0 is digging your own hole

**Dimension 4 (optional): Format compliance**

- Metric: output conforms to agreed template (title, attendees, decisions, to-dos, citation blocks—five parts complete)
- How to measure: programmatically, regex or schema validation
- Threshold: 100%
- Justification: pure format, same reasoning as dimension 1; non-compliant means rewrite

**Which verify end state, which set checkpoints**

- Citation resolvability, format compliance, meeting coverage: verify end state. All three are mechanical checks computed once after the run; checking mid-way has no extra benefit
- Citation support quality: set an intermediate checkpoint. This dimension is most expensive (needs human or judge), also most prone to systematic deviation. At "first meeting's notes written" position spot-check a few; if citation method is fundamentally wrong, all subsequent meetings will be equally wrong; earlier you stop the more you save
- Decision and to-do recall: verify end state, but record "which meetings had the most misses" in metrics, to distinguish model problem from those few meetings' audio being inherently unclear

**Why multi-dimensional is non-negotiable**: they undermine each other. Only look at citation resolvability, agent writes fewer citations and gets full marks; only look at coverage completeness, it verbatim-copies the audio and passes. Lock them together, less room for shortcuts—most use cases need multidimensional evaluation along several success criteria in the first place[^S5].

<!-- hint -->

Hint 1: First unpack "reliable" into several non-overlapping things. One adjective often hides three or four different checks underneath; without unpacking, the threshold you write can only be a vague number.

<!-- hint -->

Hint 2: Before setting thresholds ask "how well can humans do this." If humans can't hit 100%, then 100% isn't the goal, it's an excuse—it guarantees this dimension will never pass so you'll quickly start ignoring it. Conversely, purely format, purely existence-check mechanical validations—non-compliant means have it rewrite; setting 100% is actually reasonable there.

<!-- /exercises -->

## Recap

- Traditional evaluation assumes "given input X follow path Y get output Z"; agents don't satisfy this assumption: identical starting points can still take completely different but valid paths, one searching three sources another searching ten[^S2]
- You don't always know what the right steps are, so you usually can't check if agents followed your prescribed steps; use flexible evaluation methods that judge whether they achieved the right outcomes while following a reasonable process[^S2]
- Default approach is end-state evaluation not turn-by-turn analysis: don't judge whether it followed a specific process, judge whether it achieved the correct final state[^S2]. End state is nouns not verbs, and must guard both "expected changes happened" and "unexpected changes didn't"
- For complex workflows break evaluation into discrete checkpoints confirming "specific state changes should have occurred," don't try to validate every intermediate step[^S2]. The "checkpoint" here means verifying state, different from the context-saving checkpoint in Course 9
- Success criteria must be measurable (quantitative metrics or well-defined qualitative scales), achievable (base targets on industry benchmarks, prior experiments, or expert knowledge), and most use cases need multidimensional evaluation[^S5]
- Official docs list "have clear success criteria, enable feedback loops" as conditions where agents add the most value[^S1]; read backwards—tasks for which you can't write success criteria shouldn't be handed entirely to agents to run alone; you'll have to watch the whole time
- Trajectory assertions are an optional addition: you can specify which tools you expect it to call, to measure whether it grasps tool purpose, but because valid paths aren't singular, avoid overspecifying or overfitting to strategies[^S3]
- Beyond pass rate also record runtime, call count, token consumption, tool errors; lots of redundant calls consider adjusting pagination and token limit parameters, lots of invalid parameter errors consider making tool descriptions and examples clearer[^S3]

[>> Lesson 3: Deterministic Verifiers: Only Checks That Output Pass/Fail Count](./03-deterministic-checks.md)
