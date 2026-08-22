# Lesson 3: What comes back from a worker

> Lesson objectives:
> - Explain why a worker returns a condensed summary rather than its transcript, in terms of what a return channel can carry.
> - Predict the three classes of information a summary systematically drops.
> - Decide when a result should bypass the summary channel and be written to a file instead.
> - Read a worker's report as a claim with a known compression ratio behind it.
>
> Prerequisites: Lesson 2's four-part brief | Previous [<< 02](./02-one-lead-many-workers.md) | Next [04 >>](./04-the-limits-of-parallel-work.md)

## The report that answered everything and proved nothing

A worker comes back with a clean report. Five fields, all populated, exactly the format you asked for. It read maybe eighty files to produce it.

Then you try to act on it and find you cannot check anything. The report says the billing service returns 401 on an expired token. Which file? It says logging redacts the token. Under what condition? Every specific thing you would need to verify the claim stayed in a context window that no longer exists.

This is not a failure. It is the mechanism working as designed, and the design is the reason the architecture is affordable at all. This lesson is about what that mechanism costs you and what to do about it.

## Explanation

### The asymmetry, stated plainly

A worker runs "in its own context window with a custom system prompt, specific tool access, and independent permissions," and "the subagent does that work in its own context and returns only the summary."[^S7]

The ratio has been published. In Anthropic's research system, "Each subagent might explore extensively, using tens of thousands of tokens or more, but returns only a condensed, distilled summary of its work (often 1,000-2,000 tokens)."[^S1] Tens of thousands spent, one to two thousand returned. Roughly an order of magnitude of compression, sometimes more.

Two qualifications on that figure. It is from one system doing web research, and the number is described as typical rather than as a limit — a worker on a smaller task returns less, and a return format you specified tightly returns less still. What generalises is not the number but its direction: **the return channel is narrow by construction, and the narrowness is the point.**

That is worth saying explicitly, because it is easy to read compression as a defect. It is the feature. If workers returned their transcripts, the lead's window would fill with exactly the material the split was meant to keep out, and you would have paid an order of magnitude more tokens for a worse version of one session. The compression is what buys the architecture its reason to exist.

### Why it must be a summary and not a transcript

Three independent reasons, and they stack.

*The lead has a finite window too.* Six workers returning fifty thousand tokens each is three hundred thousand tokens of raw material arriving at one agent — the problem you split the task to avoid, reassembled at the end.

*The transcript is mostly not evidence.* A worker's context holds file contents it read and discarded, searches that found nothing, a path it started down and abandoned. The report is the part that survived the worker's own filtering. The rest is process.

*The channel is designed for it.* The documented recommendation across vendors is the same shape: "Return summaries from subagents instead of raw intermediate output."[^S9]

There is a fourth reason that is more interesting, from the source most skeptical of this architecture. Cognition argues that what you actually want to pass between agents is "full agent traces, not just individual messages," and then concedes what that costs: building a component that compresses "a history of actions & conversation into key details, events, and decisions" is "hard to get right," to the point that they fine-tuned a model for the job.[^S3]

Sit with the implication. The compression a worker performs on its own trace, in one pass, with no tuning, is the thing a company with a strong opinion about this found hard enough to train a model for. Every summary you receive is that hard problem, solved quickly, by the same agent whose work is being described.

### What a summary drops, systematically

Not randomly. Three classes, and knowing them tells you what to ask for explicitly.

**The reasoning that produced the conclusion.** The report says 401. It does not say the worker found three handlers, decided two were dead code, and read the third. If that judgment was wrong, the report is confidently wrong and reads identically.

**The decisions the worker made about scope.** Lesson 1 named the general mechanism: "Actions carry implicit decisions, and conflicting decisions carry bad results."[^S3] In the return channel this becomes specific — the worker decided what counted as a handler, whether generated code was in scope, whether the test fixtures counted. None of those decisions is in the report, and the report has no slot for them unless you made one.

**What it did not find.** This is the dangerous one, because its absence is indistinguishable from a negative finding. A worker that searched two directories and found no rate limiting, and a worker that searched the whole repository and found no rate limiting, both write "no rate limiting found."

The measured failure population supports treating these as structural rather than occasional. In the MAST study, "no or incomplete verification" ran at 8.2% of traces and "incorrect verification" at 9.1% — nearly one in five traces carrying a verification defect.[^S4] Those figures come from open-source research frameworks on GPT-4-era models, so read them as evidence that the category is real and common, not as a rate for your tool today.

### The two-channel repair

The dropped material does not have to be dropped. It has to be *asked for*, in the format, before the run.

This is the practical form of the field-plus-reference habit from Lesson 2, and it generalises into a rule with a shape:

| Class dropped | Field that recovers it | What it costs you |
|---|---|---|
| Reasoning | `basis:` one line on how the conclusion was reached | ~15 tokens per finding |
| Scope decisions | `assumed:` what the worker took as in or out of scope | ~20 tokens per report |
| Not-found | `undetermined:` plus what it would need to resolve it | ~15 tokens per gap |
| Verifiability | `file_refs:` path and line for every claim | ~10 tokens per claim |

The whole set costs perhaps a hundred tokens on a report of a thousand. Against a worker that spent forty thousand, that is a rounding error, and it is the difference between a report you can check and a report you must believe.

There is a second, larger repair for results that should not be compressed at all.

### When a result should not come back through the channel

Some outputs are the deliverable, not a description of it. A generated file, a full data extract, a long structured list — compressing those into a summary destroys the thing you asked for.

The documented pattern for this is to route around the channel: "Direct subagent outputs can bypass the main coordinator for certain types of results, improving both fidelity and performance... Subagents call tools to store their work in external systems, then pass lightweight references back to the coordinator. This prevents information loss during multi-stage processing and reduces token overhead from copying large outputs through conversation history."[^S1] The name they give the problem is exact: it minimises "the 'game of telephone'."[^S1]

The same shape shows up in the three-agent harness where "Communication was handled via files: one agent would write a file, another agent would read it and respond either within that file or with a new file that the previous agent would read in turn."[^S6] And in the sixteen-agent compiler build, coordination ran entirely through git and lock files on disk, with no direct agent-to-agent messaging at all.[^S5]

So the routing decision, which you make when you write the format:

```text
Through the summary channel:
  findings, conclusions, counts, judgments, small structured records
  — anything whose value survives being stated in one line

To a file, with a reference in the summary:
  generated code, full extracts, long lists, anything the next step
  consumes verbatim
  — anything whose value is destroyed by paraphrase
```

The test is whether paraphrase destroys it. A finding paraphrased is still a finding. A file paraphrased is a description of a file, which is not a file.

```agentmentor-check
{
  "id": "orchestrating-agents-reading-a-worker-report",
  "label": "Read what a clean report leaves out",
  "prompt": "A worker was asked which endpoints in a service lack rate limiting. It reports: 'Checked all endpoints in services/api. Three lack rate limiting: POST /upload, POST /import, GET /export. All others are covered by the middleware.' The format you specified did not include a basis, assumed, or undetermined field. What is the most important thing this report fails to tell you?",
  "whyHere": "Once readers accept that summaries compress, the temptation is to treat the compression as lossy-but-honest — some detail missing, conclusions intact. The systematic drops are the opposite: the conclusions are exactly what survives, and what disappears is everything that would let you judge them. This forces the reader to name which absence actually changes what they should do.",
  "copyPurpose": "Have the agent check whether I am treating a worker's completeness claim as a finding, when the report contains nothing that would distinguish a thorough search from a shallow one.",
  "mode": "single",
  "choices": [
    {
      "id": "locations",
      "text": "The file and line for each of the three endpoints, so the finding can be verified",
      "correct": false,
      "feedback": "A real gap and worth asking for, but it is the cheapest one to close after the fact — three endpoint names are enough to find them yourself in a minute. The absence that cannot be recovered afterwards is the one about the endpoints that are not on the list."
    },
    {
      "id": "coverage",
      "text": "What 'all endpoints' meant to this worker, and whether anything was unresolvable",
      "correct": true,
      "feedback": "This is the not-found class, and it is invisible by construction. 'All others are covered' could mean the worker traced the middleware registration for each route, or that it saw the middleware applied at the router level and generalised. A dynamically registered route, a second router, or a path it could not resolve produces the same sentence either way — because there was no field in which to say so."
    },
    {
      "id": "config",
      "text": "The rate limit values configured for the endpoints that are covered",
      "correct": false,
      "feedback": "That is a different question, and the worker was right not to answer it — an unasked field is a scope expansion, which is its own failure mode in a fan-out. The problem here is not a missing answer to another question but a missing boundary on the answer to this one."
    },
    {
      "id": "recommendation",
      "text": "What should be done about the three unprotected endpoints",
      "correct": false,
      "feedback": "Asking a worker for a recommendation is usually the wrong move: it holds one slice of the system and cannot see the others, so its recommendation is made without the context the decision requires. That judgment belongs where the reports converge, which is the subject of Lesson 5."
    }
  ]
}
```

### The compression ratio as a reading habit

One practical habit, cheap and worth building: alongside each report, note roughly what the worker consumed to produce it.

Some tools show token usage per worker directly. Where they do not, the shape of the task is enough — eighty files read, one page returned. Either way the ratio tells you how much judgment happened out of sight.

A worker that read four files and returned a page compressed almost nothing; its report is close to a direct observation. A worker that read four hundred files and returned the same page made hundreds of decisions about relevance that you will never see. Both reports look identical on the screen. They are not equally trustworthy, and the ratio is the only signal you have about the difference.

## Worked example: one report, read three ways

A dependency audit worker was given this format:

```text
Return, for each package with a known advisory:
  package, current_version, severity, fixed_version, file_refs
For packages with no advisory: a count only, not a list.
For packages you cannot determine: list under "undetermined" with the
reason.
Do not modify any file.
```

What came back:

```text
4 packages with advisories:
  - lodash 4.17.15 → 4.17.21 (high, prototype pollution)
      package.json:34
  - minimist 1.2.0 → 1.2.6 (critical, prototype pollution)
      packages/cli/package.json:19, transitive via mkdirp
  - node-fetch 2.6.1 → 2.6.7 (high, information exposure)
      packages/api/package.json:41
  - tar 4.4.10 → 4.4.19 (high, path traversal)
      package-lock.json:2891
187 packages checked, no advisories.
5 undetermined: private registry, no advisory data reachable
  (@internal/auth, @internal/db, @internal/queue, @internal/rpc,
   @internal/telemetry)
```

**Reading one — what it claims.** Four affected packages, four fixes, one transitive. 187 clean. 5 unknown. Roughly ninety tokens.

**Reading two — what is checkable.** Every advisory claim carries a `path:line`, so any of the four can be confirmed in seconds without re-running anything. That is what the `file_refs` field bought, and it is the difference between a lead you must trust and a lead you can spot-check.

**Reading three — what the compression hid, and where it surfaced anyway.**

The five undetermined entries are the most valuable line in the report, and they exist only because the format made a place for them. Without that field, those five packages fall into "187 packages checked, no advisories," and five internal packages with no advisory data become five packages with no advisories. Nobody lies. The category simply has nowhere else to go.

The count-only clause is doing the second piece of work. A list of 187 clean packages would put the noise you delegated to avoid straight back into the lead's window — the boundary defeated through the front door.

And what remains hidden even here: the worker's definition of "known advisory." Which database, how recent, whether it followed transitive dependencies to full depth or one level. The report says minimist arrived "transitive via mkdirp," which tells you it followed at least one level, and that is inference from a detail rather than a stated fact. Before acting on this report you would verify one entry directly against the advisory source — not out of distrust, but because that is the only way to find out whether the worker's reading of "advisory" matched yours.

**What should not have come back this way.** Nothing here — every line is a finding that survives being stated. If the brief had also said "and produce the updated lockfile," that output belongs in a file with a path in the report, not pasted into the return channel.[^S1]

## Your turn: specify the return

You are dispatching a worker to inventory every place your codebase writes to the audit log. Write the output format. The objective, sources, and boundaries are already settled; this is only the format section.

```text
OUTPUT FORMAT

Per finding:
  ______________ :  ______________________________
  ______________ :  ______________________________
  ______________ :  ______________________________
  ______________ :  ______________________________

Aggregate:
  ______________ :  ______________________________

Uncertainty:
  ______________ :  ______________________________

Anything routed to a file instead of the report?
  ______________________________________________
```

Reference answer:

```text
Per finding:
  location:     path:line of the write call
  event_type:   the event name or category written
  fields:       the keys included in the log record, as a list
  trigger:      what code path reaches this write, in one clause

Aggregate:
  total_writes: count, plus count of distinct event types

Uncertainty:
  undetermined: any write reached only through dynamic dispatch,
                configuration, or a code path you could not resolve —
                with what you would need to resolve it

Routed to a file:
  Nothing, unless the inventory exceeds ~40 findings. Past that the
  report becomes the noise it was meant to filter: write the full
  inventory to audit-log-inventory.md and return the counts plus the
  file path.
```

Three judgment calls in that answer worth naming.

`trigger` is the reasoning field in disguise. It forces one line about how the code reaches this write, which is the part that normally evaporates. It costs almost nothing and is where a wrong finding usually reveals itself.

`fields` is there because the aggregate you actually want later — which events log which data — cannot be reconstructed from a report that omitted it. **A field you did not ask for is a field you will not get, and asking afterwards means running the worker again.**

The size threshold is the routing rule applied honestly. Forty findings is a judgment, not a constant; the principle is that a report which stops fitting in one read has become a document, and documents belong in files with references in the report.

<!-- exercises -->
## 💻 Exercises (point these at your own real environment)

### Level 1 (warm-up)

Take a worker report you have already received — from this course's earlier exercises or from your own work — and audit it against the three drop classes. For each class, mark whether the report contains it, and pick one claim to verify directly against the source.

How: work with a real report you still have. If nothing in it can be verified because no locations were included, that is the finding, and it tells you what to change in the next format.

<!-- rubric -->
- Three drop classes checked explicitly: reasoning, scope decisions, not-found.
- One claim verified against the actual artifact, with the outcome recorded — confirmed, narrower than stated, or wrong.
- The verification took under two minutes, or you can say what made it slow.
- One scope decision named that the worker must have made and did not report.
- A revised output format written, with at least one field added.
<!-- answer -->
The most common outcome is confirmed-but-narrower: the claim is true of what the worker looked at, and what it looked at was smaller than the words suggest. That is the scope-decision class arriving in the only way it can, since a worker that examined a subset and generalised writes the same sentence as one that examined everything.

If verification was slow, the cause is almost always the missing location field, and the cost compounds: six reports without locations means six manual searches before you can trust anything, which is often more work than the delegation saved.

A common mistake here is auditing the report for correctness rather than for checkability. Whether this particular report happens to be right is luck. Whether the next one can be checked in two minutes is design, and only the second is under your control.
<!-- hint -->
For the not-found class, ask what sentence the worker would have written if it had found nothing because it looked in the wrong place. If that sentence is identical to the one in front of you, the class is undetectable in this format.
<!-- hint -->
For scope decisions, list what the worker had to define for itself before it could start — what counts as a handler, a write, an endpoint. Each definition is a decision that did not come back.

### Level 2 (advanced)

Run the same worker twice on the same task, once with a loose format and once with the full field set including basis, assumed, undetermined, and locations. Compare what each report lets you do, and measure the token cost of the difference.

How: same task, same sources, same boundaries — vary only the format section. Record the length of each report. Then attempt the same three verification steps against both.

<!-- rubric -->
- Both reports captured, with the two format specifications recorded verbatim.
- Report lengths compared, and the extra cost of the specified format stated as a rough proportion.
- Three verification attempts made against each report, with time or outcome recorded.
- At least one thing the specified report reveals that the loose one conceals, named precisely.
- A judgment about whether the extra fields would be worth it across six workers rather than one.
<!-- answer -->
Expect the specified report to be meaningfully longer and still small — a rough shape is a tenth to a fifth more, against a worker that consumed vastly more than either report contains. The comparison that decides it is not report against report but extra fields against worker cost, and on that comparison the fields are close to free.

The revealing case is when the two reports disagree about coverage. The loose report says "all X are handled"; the specified report has two entries under undetermined. Same worker, same task, same underlying reality — the difference is that one format had a place to put the gaps and the other did not. If you see this, you have observed the not-found class directly, which is otherwise almost impossible to catch.

A common mistake is concluding the loose format is fine because both reports reached the same conclusions. They usually do. The question is not whether the conclusions match but whether you could tell if they did not, and the loose format's answer to that is no. Across six workers this stops being an aesthetic preference: six unverifiable reports produce a synthesis nobody can check, which is exactly the failure Lesson 5 is about preventing.
<!-- hint -->
Pick verification steps you can actually complete: confirm one location, confirm one count, confirm one negative claim. The third is the hardest and the most informative.
<!-- hint -->
Compare the reports on what they let you do next, not on which reads better. A well-written report you cannot check is worse than an awkward one you can.
<!-- /exercises -->

## The narrow channel, priced

You can now read a worker's report for what it is: a heavy compression of work you did not see, performed in one pass by the same agent whose conclusions are being described. The three classes it drops are predictable — the reasoning, the scope decisions, and everything it failed to find — which means they can be asked back into the format for a rounding error in tokens. And you know which results should not travel through the channel at all, because paraphrase destroys them.

So far every worker has been considered on its own. The moment there is more than one, a second set of questions appears: do they run at the same time, and what happens when they do. The answer is not the one that the word "parallel" suggests, and one build in this project's own history found that out the hard way.
