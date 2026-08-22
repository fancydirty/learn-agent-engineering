# Lesson 5: A synthesis that can be checked

> Lesson objectives:
> - Explain why the synthesis step is a second place where content gets invented, and name the measured evidence for it.
> - Distinguish four kinds of claim in a synthesis and mark each one with the evidence standing behind it.
> - Verify a worker's completion report against the artifact rather than against the report.
> - Recognise why adding another merging layer makes a bad synthesis worse rather than better.
>
> Prerequisites: Lesson 3's reading of a worker report | Previous [<< 04](./04-the-limits-of-parallel-work.md) | Next [06 >>](./06-one-decomposition-start-to-finish.md)

## Six reports in, one answer out, nobody can check it

The wave finished. Six reports, all in the format you asked for. Something reads them and produces the answer you actually wanted: here is how the services differ, here is the convention to adopt, here are the three exceptions.

It is a good document. It is also the first thing in the whole pipeline that nobody verified, assembled from six compressions of work nobody watched, by an agent that had no access to any of the underlying material. If a claim in it is wrong, there is no step remaining that would notice.

This is the layer where a multi-agent run can invent something the workers never said. This lesson is about making that layer checkable.

## Explanation

### The synthesiser's actual position

Be precise about what the synthesising agent has in front of it. Six reports, each a heavy compression of a context window that no longer exists. Not the files. Not the searches. Not the reasoning. Six pages of confident claims, and a request to reconcile them.

That is a multi-document summarisation task, and it has been measured. Across two purpose-built benchmarks with five models, researchers found that "on average, up to 75% of the content in LLM-generated summary is hallucinated, with hallucinations more likely to occur towards the end of the summaries."[^S13] More pointedly for this situation: "when summarizing non-existent topic-related information, gpt-3.5-turbo and GPT-4o still generate summaries about 79.35% and 44% of the time."[^S13]

Read those numbers with their setting attached, because both are load-bearing. The 75% is an upper bound across models and conditions on benchmarks built to surface this behaviour, not a typical rate on ordinary material. The models tested were the GPT-3.5 and GPT-4o generation. What generalises is not the rate but the shape: **a summariser given several documents produces content that is not in any of them, and does so most readily when asked about something that is not there.**

That last clause is the one that should worry you. A synthesiser asked "what do the six services agree on" will produce an agreement. Whether the agreement exists in the reports is a separate question, and the fluency of the output carries no information about it.

Note also where the errors concentrate: "towards the end of the summaries."[^S13] The end of a synthesis is where the conclusions and recommendations live — the part people read most carefully and check least.

### Two layers of invention, not one

Lesson 3 established that a worker's report is a compression performed in one pass by the agent whose own work is being described. Now that compression is the synthesiser's only input.

So there are two places a claim can be invented, and they are different in kind:

```text
Layer 1  Worker → report
         The worker read 80 files and wrote a page. Anything it
         inferred, generalised, or could not determine but wrote
         anyway enters here — and enters as a plain statement,
         indistinguishable from a direct observation.

Layer 2  Reports → synthesis
         The synthesiser read six pages and wrote one. Anything it
         reconciled, smoothed, or filled in enters here. It has no
         way to detect a layer-1 error, because it cannot see any
         of the material the reports describe.
```

The second layer's specific hazard is reconciliation. Two reports disagree — one says the auth check is in middleware, another says it is in the route handler. A synthesiser has three options: report the disagreement, pick one, or produce a formulation that accommodates both. The third is the most fluent, the most common, and the worst, because it manufactures a claim neither worker made and neither would endorse.

This is Cognition's implicit-decisions argument arriving at its destination. The workers' unannounced decisions — what counted as "the auth check" — produced the divergence. The synthesiser cannot see the decisions, only the divergent outputs, so what it resolves is a surface contradiction rather than the actual difference underneath.[^S3]

### Do not add another layer

The instinct when a synthesis comes out muddy is to add structure: summarise the summaries, merge in pairs, build a hierarchy.

This has been tested against the alternative, and it made things worse. In a study of positional bias in long-form summarisation, the researchers explored hierarchical merging — "generates one summary for each document, and then iteratively merge the summaries" — alongside incremental updating and prompting. Their result: "Performing methods that changes the input structure (i.e., hierarchical merging or incremental updating) hurts faithfulness."[^S14] Simple prompting to direct attention was "moderately effective"; the structural approaches "offer limited improvements."[^S14]

Incremental updating failed in an instructive way: keeping a running summary and folding in one document at a time produced "a pronounced recency bias: the model either retains its current summary and thus remains faithful to the first document or focuses on the last document." The conclusion is blunt — "it ultimately replaces one positional bias, i.e., lost-in-the-middle, with another."[^S14]

The same study found faithfulness follows a "U-shaped" trend, where models "faithfully summarize the beginning and end of documents but neglect middle content," and that this survives reordering: "models are less faithful when important documents are placed in the middle of the input."[^S14]

Which has an immediate consequence for how you feed a synthesiser: **the report in the middle of the pile is the one most likely to be misrepresented.** Not because it is worse. Because of where it sits. If one of six reports matters more than the others, do not let position decide its treatment.

These experiments were on document summarisation with GPT-4o-era models, so carry the U-shape and the merging result as findings about the mechanism rather than as measurements of your current tool.

### The separation that does help

There is one structural intervention with first-party evidence behind it, and it is not another merging layer. It is separating the agent that did the work from the agent that judges it.

The problem it solves is stated plainly: "When asked to evaluate work they've produced, agents tend to respond by confidently praising the work—even when, to a human observer, the quality is obviously mediocre."[^S6] Which is exactly what you get when the lead that planned the fan-out also writes the synthesis and declares it good.

The repair, with its limits attached in the same breath: "Separating the agent doing the work from the agent judging it proves to be a strong lever to address this issue. The separation doesn't immediately eliminate that leniency on its own; the evaluator is still an LLM that is inclined to be generous towards LLM-generated outputs. But tuning a standalone evaluator to be skeptical turns out to be far more tractable than making a generator critical of its own work."[^S6]

And the honest note on how much work that takes: "Out of the box, Claude is a poor QA agent. In early runs, I watched it identify legitimate issues, then talk itself into deciding they weren't a big deal and approve the work anyway. It also tended to test superficially."[^S6]

The measured population agrees that verification is where these systems break, and that fixing it moves the number. In the MAST study, "no or incomplete verification" appeared in 8.2% of traces and "incorrect verification" in 9.1%; their own intervention, "adding a high-level task objective verification step," produced "+15.6% improvement in task success on ProgramDev."[^S4] They also record what the weak verifiers were doing: "many existing verifiers perform only superficial checks, despite being prompted to perform thorough verification, such as checking if the code compiles or if there are leftover TODO comments."[^S4] Those figures come from research frameworks on older models — carry the direction, not the magnitude.

So a checker is worth having, and a checker is not sufficient. Which leads to the part that is.

### A worker's report is a claim, not evidence

Here is the second incident from the build that produced this course. Like the first, it is one observed occurrence, not a general law, and it is included because it is more specific than any published account.

```text
Incident A   A worker reported: "file written, both validators pass."
             The file did not exist on disk.

Incident B   A different worker reported a repository path as the
             location of its output. The path did not exist.

How caught   The orchestrator re-ran the validators itself and looked
             for the file, instead of accepting the report. Both
             claims failed immediately on contact with the filesystem.

What would   Nothing. No downstream step in the pipeline read the
have caught  artifact. The synthesis would have recorded two
it otherwise completed tasks and been internally consistent.
```

The general form is the important part: **a completion report is produced by the same process that did the work, so it cannot be evidence about whether the work happened.** The C compiler build states the same risk from the other side: "For autonomous systems, it is easy to see tests pass and assume the job is done, when this is rarely the case."[^S5]

This is the same reasoning the `verify-agent-output` course develops at length, applied at a new address. That course is about believing a single agent's "done"; here the problem multiplies, because a fan-out produces one completion claim per worker and the synthesiser treats every one of them as a fact. Six unverified claims become one confident report. If you have not done that course, its central move — putting the finish line somewhere the agent does not control — is the prerequisite habit for everything below.

The operational rule is one line: **verify against the artifact, never against the report.** Did the file appear? Run `ls`. Do the tests pass? Run them yourself. Does the path exist? Check. None of these costs more than seconds, and each one is the only thing standing between a worker's belief and your synthesis.

### Four kinds of claim

A synthesis that can be checked distinguishes what stands behind each of its claims. This four-way split is the course's own arrangement, built from the sourced findings above rather than taken from any single source:

| Kind | What stands behind it | How it should be marked |
|---|---|---|
| Verified | You checked it against the artifact yourself | Plain statement, with what you ran |
| Reported | One worker claimed it; unverified | Attributed: "worker 3 reports…", with its reference |
| Contested | Workers disagree | Both positions stated, neither resolved |
| Inferred | The synthesiser produced it; no worker said it | Marked as inference, with what it rests on |

The value of the split is that it makes the fourth category visible. In an unmarked synthesis, an inference reads exactly like a verified fact — same voice, same confidence, same sentence shape. Requiring the mark forces the question "which report said this?" on every line, and that question is the whole defence.

Contested is the category people are most tempted to eliminate, and eliminating it is precisely the reconciliation failure. **Two workers disagreeing is a finding, not a mess to tidy.** It usually means they defined the question differently, which is information about the task that you cannot get any other way.

## Worked example: one synthesis, before and after

Six workers surveyed six services for auth-failure handling. Here is the synthesis a lead produces unprompted:

```text
All six services return 401 for expired tokens, with consistent JSON
error bodies. Most attempt a token refresh before failing, though the
implementations vary. Logging is generally safe, with tokens redacted
across the board. The main inconsistency is in retry behaviour, which
should be standardised. Recommend adopting the billing service's
pattern as the convention.
```

Fluent, decisive, and unusable. Working through it claim by claim against the reports:

```text
"All six return 401"
    Reports say: five say 401. Search says 403.
    → The synthesis smoothed a real difference into "all six".
      This is reconciliation, and it deleted the one finding that
      would have changed the convention.

"with consistent JSON error bodies"
    Reports say: four gave body shapes, and two of the four differ
      (one has {error, code}, one has {message}). Two reports left
      the field blank.
    → "Consistent" is inferred from four partial answers, two of
      which contradict it.

"Most attempt a token refresh"
    Reports say: three yes, one no, two "undetermined".
    → "Most" is three out of six. The two undetermined entries —
      the ones Lesson 3's format existed to preserve — were
      absorbed into a majority they never joined.

"Logging is generally safe, tokens redacted across the board"
    Reports say: four confirmed redaction with file references.
      One reported the token logged at debug level. One undetermined.
    → This is the dangerous one. A real security finding in one
      report became "generally safe" in the synthesis, and
      "across the board" is a claim no report supports.

"Recommend adopting the billing service's pattern"
    Reports say: nothing. No worker was asked to recommend anything,
      and none could — each saw one service.
    → Pure layer-2 invention, sitting at the end of the document
      where hallucination concentrates.[^S13]
```

Now the same six reports, synthesised under the four-kind rule:

```text
VERIFIED (I checked these against the code myself)
  - services/search returns 403, not 401, on an expired token.
    Confirmed at services/search/src/middleware/auth.ts:88.
  - services/notifications logs the raw token at debug level.
    Confirmed at services/notifications/src/log.ts:24. This is a
    live issue independent of the convention decision.

REPORTED (worker claims, each with its reference, unverified)
  - 401 on expired token: billing (package/src/mw/auth.ts:41),
    identity (:112), catalog (:33), orders (:57).
  - Refresh attempted: identity, orders, catalog. Not attempted:
    billing. See each report's refresh_attempted field.
  - Token redaction confirmed with references: billing, identity,
    catalog, orders.

CONTESTED
  - Error body shape. billing and identity return {error, code};
    catalog returns {message}. Neither worker was wrong; the
    services genuinely differ. This is the largest gap the
    convention has to close.

UNDETERMINED (from the reports, carried through)
  - refresh_attempted: notifications, search. Both workers said
    the code path was unresolvable without reading lib/auth-shared,
    which was out of scope by instruction.
  - body_shape: notifications, search. Same cause.

NOT ANSWERED BY THIS SURVEY
  - Which convention to adopt. No worker saw more than one service,
    so no worker's opinion on this is worth anything. The decision
    needs the contested row above plus the two verified findings,
    and it needs a person.

NEXT
  - The search 403 and the notifications debug log are both
    actionable now, independently of the convention.
  - The four undetermined fields all trace to one excluded
    directory. One follow-up worker scoped to lib/auth-shared
    resolves all four.
```

The second version is longer, less satisfying to read, and actually usable. Three properties make it so.

*Every claim carries its evidence class.* You can tell at a glance which two facts were checked, which four were reported, and which nothing supports.

*The undetermined entries survived.* They arrived in the reports because Lesson 3's format made a place for them, and the synthesis kept that place. In the first version they were silently converted into agreement.

*It says what it does not know.* "Not answered by this survey" is a section the first version could not have, because a fluent synthesis has no natural place to admit a gap.

And the operational point: writing it this way produced a better next step. The four undetermined fields sharing one cause is visible only when they are listed rather than absorbed, and that observation turns four gaps into one cheap follow-up.

## Your turn: classify and mark

Three reports came back on a question about caching. Classify each synthesis claim and mark what evidence stands behind it.

```text
Report A: "Redis caching on the product endpoints, TTL 300s.
           product.service.ts:88. No cache on search."
Report B: "Found in-memory LRU caching in the search service,
           search/cache.ts:12. Could not determine the TTL —
           it is set from config I could not read."
Report C: "No caching found in the orders service."

Draft synthesis:
  "The services use a mix of Redis and in-memory caching with
   short TTLs. Orders is uncached, which is likely intentional
   given its write-heavy profile. Recommend consolidating on
   Redis."

Classify each claim:
  "mix of Redis and in-memory"     → ________  because ________
  "short TTLs"                     → ________  because ________
  "Orders is uncached"             → ________  because ________
  "likely intentional given..."    → ________  because ________
  "Recommend consolidating"        → ________  because ________

Which claim would you check first, and how?
  ____________________________________________
```

Reference answer:

```text
"mix of Redis and in-memory"   → REPORTED. A and B each support half
    of it, both with file references. Fair, and should be attributed
    rather than stated flat.

"short TTLs"                   → INFERRED, and wrong. Exactly one TTL
    is known (300s, report A). B explicitly could not determine its
    TTL. The plural generalises one data point across two systems and
    quietly overwrites B's undetermined.

"Orders is uncached"           → REPORTED, and weaker than it looks.
    C found no caching. That is not the same as there being none, and
    C is the only report with no file reference — nothing to check,
    because a negative finding has no location.

"likely intentional given its  → INFERRED, and invented. No report
 write-heavy profile"             mentions orders' write profile. The
    synthesiser supplied a plausible cause for an absence, which is
    the documented behaviour of generating a summary about something
    that is not there.

"Recommend consolidating"      → INFERRED. No worker was asked, none
    saw more than one service, and this sits at the end of the
    document where fabrication concentrates.

Check first: report C.

    Not because it is the least plausible — because it is the only
    claim with no reference attached, and a negative finding is the
    one that cannot be distinguished from a failed search. A single
    grep for the cache client import across the orders service
    settles it in seconds. If the import is there, C searched the
    wrong way, and the synthesis's second and fourth claims were both
    built on a hole.
```

The habit worth keeping: **check the claim with no reference behind it first, and be most suspicious of the confident sentence explaining an absence.**

<!-- exercises -->
## 💻 Exercises (point these at your own real environment)

### Level 1 (warm-up)

Take a synthesis you already have — from a fan-out you ran, or the outputs of Lesson 2's exercises — and mark every claim as verified, reported, contested, or inferred. Then verify the two claims that matter most and record what changed.

How: work claim by claim, sentence by sentence. For each, find the report it came from. Claims you cannot trace to any report are inferences, whatever they sound like.

<!-- rubric -->
- Every claim in the synthesis marked with one of the four kinds.
- At least one inference found — a claim no report supports.
- Two claims verified against the actual artifact, with what you ran recorded.
- Any smoothed disagreement identified: a place where two reports differed and the synthesis stated one thing.
- The synthesis rewritten so the marks are visible in the document itself.
<!-- answer -->
Most first-pass syntheses contain at least one inference, and it is usually in the last paragraph — the recommendation, the summary of implications, the "this suggests" sentence. That placement matches the measured concentration of hallucination toward the end of generated summaries, and it is the part readers weigh most heavily.

The smoothed disagreement is the harder find, because a smoothed synthesis contains no trace of the smoothing. The way to catch it is to work backwards: for each claim covering multiple workers, open every report it covers and check that they all actually said it. Words like "all", "generally", "consistently", and "most" are where to start.

A common mistake here is marking a claim as verified because it feels obviously right. Verified means you went and looked. If you did not run something or open something, it is reported, however confident you are.
<!-- hint -->
Any sentence explaining why something is absent is an inference until proven otherwise. Absences have no evidence in a report, only the failure to find something.
<!-- hint -->
Search the synthesis for universal quantifiers. Each one is a claim about every worker, and it takes one dissenting report to falsify it.

### Level 2 (advanced)

Verify every completion claim from one real fan-out against the artifacts, before reading the synthesis. For each worker, check independently that what it said it produced actually exists and actually passes what it said it passed.

How: list what each worker claimed — files written, tests run, commands succeeded. Then check each one yourself: `ls` the file, run the test, open the path. Record hits and misses. Only afterwards read the synthesis and see whether it would have caught anything you found.

<!-- rubric -->
- Every worker's completion claims listed as discrete checkable statements.
- Each one checked against the artifact, with the command or action recorded.
- Any discrepancy documented exactly: what was claimed, what was found.
- A judgment on whether the synthesis, read afterwards, would have surfaced the discrepancy.
- A check added to your own process that would catch this class automatically next time.
<!-- answer -->
Whether you find a discrepancy on this particular run is partly luck. The finding that is not luck is the fourth rubric item: a synthesis built from reports has no mechanism for catching a false completion claim, because the report is its only input. If a worker says the file was written and no downstream step reads the file, nothing in the pipeline disagrees.

That is what makes this class of error different from the others in this course. A bad brief produces a visibly wrong answer. A smoothed disagreement can be found by comparing reports. A false completion claim is internally consistent with everything the pipeline knows, and only contact with the filesystem breaks it.

A common mistake in this exercise is checking only the claims that sound uncertain. Do the opposite. The confident, specific claims — "wrote X, ran Y, both pass" — are the ones nobody checks precisely because they sound settled, and specificity is not evidence of having happened.

The automatic check is the real deliverable here, and it is usually small: a script that asserts each expected output file exists and is non-empty, run by the lead rather than by the workers, before any synthesis is written.
<!-- hint -->
Do this before reading the synthesis. Once you have read it, its framing makes some claims feel already settled and you will check them less carefully.
<!-- hint -->
The cheapest high-value check is existence: does every file a worker claims to have written actually exist, at the path given? It takes one command and catches the failure mode that no report can reveal.
<!-- /exercises -->

## What a checkable answer looks like

The synthesis step is not assembly. It is a second generation pass over material nobody re-read, performed by an agent with no access to the underlying artifacts, and it is measurably a place where content that was in no input appears in the output — most readily when asked about something that is not there, and most often near the end.

The defences are unglamorous and cheap. Mark every claim with the evidence behind it, so an inference cannot wear a fact's clothing. Keep disagreements as disagreements, because two workers differing is information about the task. Resist the extra merging layer, since restructuring the merge measurably hurt faithfulness rather than helping it. And check completion claims against the artifact, because a worker's report of its own success is the one thing in the pipeline that cannot corroborate itself.

You have now got all the parts: the test for whether to split, the brief that goes out, the report that comes back, the dispatch shape and its bounds, and the synthesis that can be checked. The last lesson runs them once, in order, on your own work — and the deliverable is not the answer but a synthesis someone else can audit without asking you anything.
