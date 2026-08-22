# Lesson 3: Stating Done Before Stating How

> Lesson objectives:
> - Explain why an agent left to judge its own completion stops early.
> - Convert a finish line that needs your judgment into one that can be checked without you.
> - Write acceptance criteria before implementation begins, and place them where the run can use them.
>
> Prerequisites: Lesson 2's interview step, and one request whose blanks you have answered | Previous [<< 02](./02-why-agents-dont-ask.md) | Next [04 >>](./04-examples-over-adjectives.md)

## "Done" was its call, not yours

Go back to the last run you accepted. At some point the agent stopped working and told you it was finished. Ask what it actually consulted to reach that conclusion.

Usually: nothing. It stopped because the work matched its own picture of the request. Anthropic's Claude Code documentation puts the mechanism in one sentence — "Claude stops when the work looks done. Without a check it can run, 'looks done' is the only signal available, and you become the verification loop: every mistake waits for you to notice it."[^S3]

That is the last big blank from Lesson 1, and it is the one everyone leaves open. You may have specified what to build in detail and still not have said what finished means, which leaves the most consequential judgment in the run to the party least able to make it. This lesson is about writing that judgment down, before implementation, in a form the agent can check itself against.

## Explanation

### Self-assessment runs warm

The obvious repair — ask the agent whether it finished properly — does not work, and the reason is documented rather than folkloric.

An Anthropic engineer describing an agent harness built for long-running application work reports: "When asked to evaluate work they've produced, agents tend to respond by confidently praising the work—even when, to a human observer, the quality is obviously mediocre."[^S9] The same write-up describes what happened when a separate agent was assigned to grade the work: out of the box it "would identify legitimate issues, then talk itself into deciding they weren't a big deal and approve the work anyway."[^S9]

So an agent grading its own output is generous, and an agent grading another agent's output is also generous until it is deliberately tuned to be skeptical.[^S9] Either way, asking "is this done?" of the same system that produced the work returns a warm answer.

What breaks the loop is not a better question. It is having something outside the agent's judgment to compare against — which is exactly what an acceptance criterion is.

### A criterion is checkable or it is a preference

An **acceptance criterion** is a statement about the finished work that can be evaluated as true or false without consulting your opinion. That last clause is the whole test, and it disqualifies most of what people write.

Anthropic's guidance on defining success criteria states the requirement as two properties, specific and measurable: "Instead of 'good performance,' specify 'accurate sentiment classification'" and "Use quantitative metrics or well-defined qualitative scales."[^S6] Its worked pair is worth having in front of you, because the bad half looks so much like something you would write:

```text
Bad:   Safe outputs
Good:  Less than 0.1% of outputs out of 10,000 trials flagged for toxicity
       by the content filter.
```

Both describe the same intent. Only the second names a thing to count, a threshold, and the instrument that does the counting.[^S6] Notice that the good version did not become more precise about *what safe means* philosophically — it became precise about what evidence would settle the question.

Run your own criteria through this filter:

| Reads like a criterion | Actually checkable? | Why |
|---|---|---|
| "The code should be clean" | no | Needs your judgment, and the agent's judgment runs warm |
| "Handle errors properly" | no | "Properly" is the whole question, unanswered |
| "Tests pass" | partly | Which tests? Ones it wrote to pass are not evidence |
| "The 50k-row export completes in under 10s" | yes | A number, an instrument, a threshold |
| "No file outside src/export/ is modified" | yes | Verifiable by listing changed files |
| "Output is byte-identical to today's for the sample file" | yes | A diff answers it |

The pattern in the checkable rows: each names something to observe and a threshold to compare it against. Not one of them requires you to look at the work and form an impression.

### Making a subjective target gradable

The obvious objection is that some of what you want genuinely is a matter of taste. Sometimes the thing you want is a judgment call, and no number captures it.

The move here is not to pretend otherwise, and it is not to give up either. From the same harness write-up: "'Is this design beautiful?' is hard to answer consistently, but 'does this follow our principles for good design?' gives Claude something concrete to grade against."[^S9] The engineer wrote four named grading criteria — design quality, originality, craft, functionality — each with a paragraph saying what passing looks like, and gave the same criteria to both the agent doing the work and the agent grading it.[^S9]

The taste did not disappear. It moved: out of a per-result impression formed after the fact, into a written standard fixed before the work began. That is available to you on any subjective requirement. You are not scoring the output. You are writing down, in advance, the two or three properties you will judge it on — which is a much easier thing to state, and unlike your impression, it can be handed over.

### Criteria come before implementation, not after

Now the sequencing claim, which is the reason this lesson sits where it does.

The same harness ran a step before every unit of work: "Before each sprint, the generator and evaluator negotiated a sprint contract: agreeing on what 'done' looked like for that chunk of work before any code was written."[^S9] The agent doing the work "proposed what it would build and how success would be verified," and the reviewing agent checked that proposal "to make sure the generator was building the right thing" — the two iterating until they agreed.[^S9] Those contracts were not vague: "Sprint 3 alone had 27 criteria covering the level editor."[^S9]

Two things follow, and the second is easy to miss.

The obvious one: criteria written afterwards are contaminated. Once you have seen the output, your sense of what you wanted has already been reshaped by what you got, and you will accept things you would have rejected in advance.

The subtler one: writing criteria first *surfaces the blanks from Lesson 1*. When you try to state what done means for "make the export faster," you are forced to answer how fast, on what input, and with what allowed to change — questions you could otherwise leave open indefinitely. This is why the criteria step catches things the interview misses. An interview asks what you want. Writing a finish line asks how you would prove you got it, and that is a harder question that turns up different gaps.

GitHub's documentation for its coding agent lands in the same place from another vendor's direction, listing "complete acceptance criteria on what a good solution looks like (for example, should there be unit tests?)" among the three components of an ideal task.[^S8]

### One caution: criteria are followed literally

A criterion is an instruction, and instructions get followed more exactly than you may intend.

Anthropic's guidance for Claude Opus 5 gives a concrete case: "If your review prompt says 'only report high-severity issues' or 'be conservative,' the model may follow that instruction literally and report less; ask it to report everything and filter in a separate pass instead."[^S5] The instruction did its job. It was just aimed slightly wrong, and the result was a quieter report rather than a better one.

The version of this that bites in acceptance criteria is the criterion that can be satisfied without the underlying work being right — "the tests pass" being the standard example, when the agent also wrote the tests. The Claude Code documentation lists the general shape among its named failure patterns, calling it the trust-then-verify gap: "Claude produces a plausible-looking implementation that doesn't handle edge cases."[^S3] Anthropic's harness guidance for long-running agents includes a line written directly against the test-shaped version: "It is unacceptable to remove or edit tests because this could lead to missing or buggy functionality,"[^S10] alongside "Self-verify all features. Only mark features as 'passing' after careful testing."[^S10]

Before you commit to a criterion, spend one sentence asking: could this be true while the thing I actually want is false? If yes, either fix the criterion or add the one that closes the gap.

```agentmentor-check
{
  "id": "brief-an-agent-criterion-checkable",
  "label": "Pick the criterion that closes the gap",
  "prompt": "Your brief says: \"Fix the bug where saved settings don't persist after a page refresh.\" You're adding one acceptance criterion. Which one can be satisfied only if the thing you actually want is true?",
  "whyHere": "Readers who have just learned to make criteria measurable start reaching for numbers and test counts, both of which can be satisfied while the bug survives. This checks whether the criterion is tied to the real outcome rather than to a proxy for it.",
  "copyPurpose": "Have the agent check whether my acceptance criteria could be satisfied while the problem I care about is still there.",
  "mode": "single",
  "choices": [
    {
      "id": "tests-pass",
      "text": "The test suite passes with no failures",
      "correct": false,
      "feedback": "The suite passed before the fix too, since nothing in it covered this case. A criterion that was already true when the bug existed cannot tell you the bug is gone."
    },
    {
      "id": "new-test",
      "text": "A new test is added covering the settings save path",
      "correct": false,
      "feedback": "This is satisfied by a test that asserts the save function was called — which it already was. The bug lives in what survives the refresh, so a criterion about the code path can pass while the value still vanishes."
    },
    {
      "id": "manual-repro",
      "text": "Changing a setting, refreshing the page, and reloading shows the changed value; report the steps you ran and what you saw at each one",
      "correct": true,
      "feedback": "It restates the reported symptom as a sequence with an observable end state, so it cannot be satisfied while the bug survives. The reporting clause matters as much as the check: it returns evidence rather than a verdict, which is what makes the claim reviewable in the minute you have for it."
    },
    {
      "id": "root-cause",
      "text": "The root cause is identified and explained in the summary",
      "correct": false,
      "feedback": "A confident, wrong explanation satisfies this completely. It asks for an account of the fix rather than for the fixed behaviour, and an account is exactly the thing self-assessment inflates."
    }
  ]
}
```

### Ask for evidence, not a verdict

One line converts a criterion from something the agent asserts into something you can check in the time you actually have.

From the Claude Code documentation: "Have Claude show evidence rather than asserting success: the test output, the command it ran and what it returned, or a screenshot of the result. Reviewing evidence is faster than re-running the verification yourself, and it works for sessions you weren't watching."[^S3]

The reason to attach this to every criterion is the self-assessment finding at the top of the lesson. "I verified the export completes in 8 seconds" is a claim from a system that grades itself generously. The command and its output is a fact, and it takes you five seconds to read. This is the cheapest line in a brief, and the one most consistently left out.

## Worked example: criteria written before the work

The request, after Lesson 2's interview has settled its blanks:

```text
Add pagination to the admin user list. It loads all 40,000 users right
now and takes about 12 seconds. Page size 50. Keep the existing search
box working across the whole list, not just the current page.
```

Clear enough to build from. Still no finish line — and watch what happens when you try to write one, because the criteria turn up things the request did not settle:

```text
ACCEPTANCE CRITERIA — all must hold before you report this done

1. Loading /admin/users with no search term returns in under 1 second
   and shows exactly 50 rows.
     Evidence: the timing you measured, and the row count.

2. Searching for a term that matches a user on page 14 finds them from
   page 1, without the user paging through.
     Evidence: the term you searched and the result you got.

3. Total user count shown in the header still reads 40,000, not 50.
     Evidence: what the header renders.

4. Sorting by any column sorts the whole list, not the loaded page.
     Evidence: first row before and after sorting by "created".

5. No file outside app/admin/users/ is modified.
     Evidence: the list of changed files.

If you cannot satisfy one of these, stop and tell me which one and why,
rather than reporting done with a caveat.
```

Criteria 3 and 4 did not exist before this exercise. Nobody had thought about the header count or about sorting — they surfaced only because writing "what would prove this worked" forces a pass over what the page currently does. Both are exactly the kind of thing that would have shipped broken and been discovered by an admin two weeks later.

Criterion 5 is doing different work: it is a boundary, not a finish line, and it belongs to Lesson 5. It is here because a criteria list is the natural place for it, and because a checkable statement about what was *not* touched is as easy to verify as one about what was.

The last line handles the case where a criterion cannot be met. Without it, an unmeetable criterion produces one of two bad outcomes: a report of success with the failure buried in a paragraph, or an agent quietly redefining the criterion into something it could satisfy. Naming what to do instead is one sentence.

## Your turn: three criteria and the gap in one

Below is a settled request and two acceptance criteria. Write a third, and find the hole in the second.

```text
Request: Migrate the notifications table from the old schema to the new one.
         Roughly 2 million rows. The app has to keep serving traffic
         throughout.

Criterion 1: After the migration, `SELECT COUNT(*)` on the new table equals
             the pre-migration count on the old table. Report both numbers.

Criterion 2: The migration script runs without errors.

Criterion 3: _____________________________________________________________
             _____________________________________________________________

The hole in criterion 2: ___________________________________________________
```

Reference answer:

```text
Criterion 3: Ten rows sampled from across the old table — oldest, newest, and
             eight at random — appear in the new table with every field
             matching. Report the ten IDs you checked and any field that
             differed.

The hole in criterion 2: "Runs without errors" is satisfied by a script that
             silently skips every row it can't convert. Errors are what a
             script chooses to raise; a migration that swallows 4,000
             malformed rows and exits zero passes this criterion completely.
             Criterion 1 catches a wholesale failure by count, but not a
             partial one where rows are created with empty fields. Only a
             criterion about the content of the rows closes that.
```

The general shape is worth naming: **criterion 2 is a process criteria statement, while criteria 1 and 3 check the result.** Process criteria are seductive because they are easy to write and easy to satisfy, and they are satisfied by a great many runs that did not do what you wanted. When you catch yourself writing a criterion about how the work went rather than about what is now true, rewrite it as a statement about the finished state.

There is one more thing missing from all three, and you have the tool for it: none of them says what the *app* should do during the migration, even though "keep serving traffic throughout" was in the request. A fourth criterion — a request to `/notifications` during the migration returns a normal response, with the response reported — would close it. Requirements stated in the request do not become criteria on their own; that translation is a separate pass, and it is the pass most briefs skip.

<!-- exercises -->
## 💻 Exercises (point these at your own real environment)

### Level 1 (warm-up)

Take the request you have been working with since Lesson 1 and write its acceptance criteria — three to six of them — before running anything. Attach an evidence line to each. Then check each criterion against the question: could this be true while what I want is false?

How: write them in your scratch file, in the order you would want them checked. Aim each at the finished state rather than at the process. For any criterion needing your taste, write the two or three named properties you would judge it on instead of trying to invent a number.

<!-- rubric -->
- Every criterion can be evaluated by someone who does not know what you had in mind.
- Every criterion names the evidence to report, not just the standard to meet.
- At least one criterion states something that must remain unchanged, not only something that must become true.
- You found at least one criterion that could be satisfied while your real requirement fails, and rewrote it.
- Writing the criteria surfaced at least one decision the request had not settled.
<!-- answer -->
A passing set reads as a checklist a stranger could run. For example, for "add CSV import to the contacts page": "1. Importing the 500-row sample file creates 500 contacts; report the count before and after. 2. A row with a malformed email is skipped and listed in an import report, not silently dropped; report the count skipped and the report contents. 3. Importing the same file twice does not create duplicates; report the count after the second import. 4. Existing contacts are unmodified; report any contact record whose updated_at changed. 5. The page still loads in under 2 seconds with 10,000 contacts; report the timing." The rewritten criterion in that set was originally "invalid rows are handled gracefully" — which the agent could satisfy by discarding them without a word, since discarding is a form of handling. A failing set is three criteria that all restate the request in different words: "the import works", "it handles errors", "nothing else breaks."
<!-- hint -->
For each criterion, ask what you would type or click to check it yourself. If the answer is "I'd look at it and see," it needs the named-properties treatment instead.
<!-- hint -->
The criterion people most often omit is the one about what should stay the same. Start there if you are stuck: what would you be upset to find changed?

### Level 2 (advanced)

Run your task with the criteria attached to the brief, then grade the result yourself against each criterion before reading the agent's summary. Compare your grades to its claims and note every place they differ.

How: read the evidence lines only — the outputs, counts, and timings it reported — and mark each criterion pass, fail, or unproven. Only then read the summary. "Unproven" is a legitimate and common verdict, and it is the one worth counting.

<!-- rubric -->
- You graded every criterion from the evidence before reading the summary.
- You have at least one criterion marked unproven, or can say why every criterion came back with real evidence.
- You identify any place the summary claims something the evidence does not show.
- You rewrite one criterion based on what you learned about how it could be satisfied hollowly.
<!-- answer -->
The revealing outcome is a criterion the agent called satisfied and you can only mark unproven. Example: criterion said "importing the sample file creates 500 contacts; report the count before and after." The summary said "Import works correctly — all 500 contacts imported." No before count, no after count. That is a verdict, not evidence, and it is unprovable from what was returned. The rewrite that fixes it is not a stronger criterion but a stricter evidence clause: "report the output of the contact count query, run before and after, as two numbers." A common mistake here is treating a criterion the agent restated in confident prose as satisfied — the restatement is precisely the self-assessment the evidence clause exists to bypass, so if the numbers are missing, the criterion is unproven regardless of how certain the summary sounds. If every criterion came back with real evidence, say so: that is a well-formed criteria set, and it means your next brief can lean on the same shapes.
<!-- hint -->
Grade the evidence in isolation. Reading the summary first makes it nearly impossible to see what the evidence does not contain.
<!-- hint -->
An "unproven" verdict usually points at a criterion that named a standard but not an instrument. Add what to run or what to report, not a stricter threshold.
<!-- /exercises -->

## What criteria still cannot express

You can now write a finish line the agent checks itself against, and get back evidence rather than a verdict. That closes the largest blank in most briefs.

It does not close all of them, and the leftovers cluster in one place. "Match the style of the existing components." "Make the tone consistent with our other emails." "Follow the pattern used elsewhere in the codebase." Each is a real requirement that people genuinely have, and each resists every technique from this lesson — there is no number, and even the named-properties move produces a description that is one more layer of adjectives. Lesson 4 is about the substitution that does work on these, which is to stop describing the property and hand over an instance of it.
