# Lesson 5: The Lines That Hold Scope

> Lesson objectives:
> - Explain why a brief made only of positive statements leaves scope open.
> - Choose the two or three prohibitions worth their space, and say what each one costs if omitted.
> - Assemble the full brief and run your real task with it end to end.
>
> Prerequisites: Lessons 1–4 applied to one real task of your own | Previous [<< 04](./04-examples-over-adjectives.md) | Next [Course contents >>](./README.md)

## You got what you asked for, and some extra

A different failure from the one this course opened with. You asked for a bug fix. You got the bug fix, plus a refactor of the surrounding function, plus a new helper module, plus a config option to turn the new behaviour off. Every addition is defensible. Some of them are improvements. None of them was requested, all of them are now yours to review, and the twelve-line change you wanted to read carefully is buried in a two-hundred-line diff.

Nothing here went wrong in the sense the first four lessons described. There was no blank; you specified the fix. The agent formed a view about what the task ought to include, and its view was larger than yours.

This lesson is about the part of a brief that closes that gap: the small number of statements about what must *not* happen. It is short by design, because most of a brief should not be prohibitions — and it ends with the run you have been building toward since Lesson 1.

## Explanation

### A positive brief is silent, and silence is permission

Everything you have written so far says what must become true. Such a brief has nothing to say about the enormous space of things it did not mention, and an agent working in that space applies its own judgment about what a good job includes.

This is documented as current, model-specific behaviour rather than as a general truth. Anthropic's guidance for Claude Opus 5 states that the model "can also expand the scope of a task, adding steps that weren't requested or applying its own judgment about what the task should be," and recommends: "For narrow tasks, constrain scope explicitly."[^S5] Its published scope-limiting prompt opens with "Deliver what was asked, at the scope intended."[^S5]

The same vendor's general prompting guidance names the pattern with more detail, listing scope, documentation, defensive coding, and abstractions as the four places it shows up, and offering the line that covers the first: "Don't add features, refactor code, or make 'improvements' beyond what was asked. A bug fix doesn't need surrounding code cleaned up."[^S4]

As of 2026-08-23 that is what the documentation for these models says. Treat the specific behaviour as a snapshot — a future model may be more literal by default, and this section's prohibitions would then be wasted lines rather than load-bearing ones. What will not change is the structural point underneath: a brief made only of positive statements does not bound anything, and whatever fills that space is not your decision.

### A negative boundary is about actions, not qualities

Lesson 4 ended by warning that prohibitions are bad at conveying quality — that "positive examples of the communication style you want tend to be more effective than instructions about what not to do."[^S4] That still holds, and it is what makes the division of labour clean.

A **negative boundary** is a statement that a specific action or class of actions must not occur. Its subject is a verb: don't delete, don't send, don't touch, don't refactor, don't install. When the subject is an adjective — don't be verbose, don't make it generic, don't overcomplicate — you are trying to specify a quality by exclusion, which leaves the whole rest of the space open. Go back to Lesson 4's tools for those.

OpenAI's prompting documentation frames boundaries the same way, as one of four parts of a request: "Boundaries: What must stay unchanged? What should ChatGPT avoid or check with you before it acts?"[^S7] Both of its questions are about actions, and the published examples are all verbs — "Keep the approved dates and budget figures unchanged," "Prepare the message as a draft. Don't send it."[^S7]

### Which few earn their place

You will not write more than a handful, and there is a reason to keep the number down that has nothing to do with brevity for its own sake.

OpenAI's documentation states the budget directly: "Boundaries are the few instructions ChatGPT needs to avoid creating extra work or taking an action you didn't intend. Add one when changing the wrong detail would make the result unusable, or when you want to review something before it affects other people," followed by "Focus on the one or two boundaries that matter most. You don't need to control every step ChatGPT takes."[^S7]

The reason a long list backfires appears in the Claude Code documentation's list of common failure patterns, about a project's standing instruction file: "If your CLAUDE.md is too long, Claude ignores half of it because important rules get lost in the noise."[^S3] A brief works the same way. Fifteen prohibitions do not give you fifteen guarantees; they give you a wall of text in which the three that mattered are no more prominent than the twelve that did not.

Three questions, applied to a candidate prohibition, sort them quickly. This grouping is a synthesis — no source publishes it as a test — but each question comes from a documented concern:

1. **Is it irreversible?** Deleting, force-pushing, dropping a table, overwriting an original. Anthropic's guidance groups exactly these as actions warranting confirmation, listing "Destructive operations: deleting files or branches, dropping database tables" and "Hard to reverse operations: git push --force, git reset --hard, amending published commits."[^S4]
2. **Is it visible to other people?** Sending, publishing, posting, deploying, commenting on a shared thread. The same guidance names this class separately — "Operations visible to others: pushing code, commenting on PRs/issues, sending messages, modifying shared infrastructure"[^S4] — and it is a distinct category because these are not undone by reverting anything.
3. **Would it hide the work you actually need to read?** This is the scope-expansion case from the opening. Nothing is destroyed; the cost is that your twelve-line fix is now unreviewable in the time you had for it.

A candidate that answers no to all three is usually not worth the line. Let it happen, and if it turns out to matter, it becomes a line in your next brief — which is a better process than trying to enumerate everything in advance.

### Say why, and the boundary generalizes

One more property separates a boundary that holds from one that gets worked around.

Anthropic's prompting documentation makes the case with a small example: the instruction "NEVER use ellipses" is less effective than the same instruction with its reason attached — "Your response will be read aloud by a text-to-speech engine, so never use ellipses since the text-to-speech engine will not know how to pronounce them." The stated principle: "Providing context or motivation behind your instructions, such as explaining to Claude why such behavior is important, can help Claude better understand your goals and deliver more targeted responses," because the model "is smart enough to generalize from the explanation."[^S4]

Generalizing is the point. A bare prohibition covers exactly what it names. A prohibition with a reason covers the neighbouring cases you did not think to name — which matters most for boundaries, because the case that hurts you is nearly always the one you failed to enumerate.

A worked instance from Anthropic's own harness for long-running agents: "It is unacceptable to remove or edit tests because this could lead to missing or buggy functionality."[^S10] The reason clause is what stops an agent that cannot make a test pass from concluding the test must be wrong. Bare, the rule invites exactly that reasoning; with the reason attached, deleting the test is visibly a way of causing the outcome the rule exists to prevent.

### The whole brief, assembled

Everything from five lessons, in the order the material implies. The four-part frame here is OpenAI's — "Goal, Context, Output, Boundaries"[^S7] — with acceptance criteria added as their own section, since that is where the other vendors put the weight.[^S8][^S9]

```text
GOAL          What to build, with the Lesson 1 decision blanks filled in.
              Not the recoverable detail; only what lives in your head.

CONTEXT       What it needs to know that it cannot find: the reference
              pattern to match, the constraint from a conversation it
              wasn't in, the reason this is being done.

OUTPUT        What good looks like — examples rather than adjectives,
              varied so they teach one rule and not three (Lesson 4).

CRITERIA      What must be true before it reports done, each with the
              evidence to return (Lesson 3).

BOUNDARIES    The two or three things that must not happen, each with
              its reason attached (this lesson).

WHEN STUCK    What to do with a decision it cannot make: ask, or write it
              down and continue. Never guess silently (Lesson 2).
```

The last section is the one people drop, and it is what keeps the other five honest. Every section above it can be met with a case you did not anticipate — a criterion that turns out unreachable, an example that does not cover the input in front of it, a boundary that blocks the obvious path. Without a stated route for those, the agent resolves them by choosing, and you are back at Lesson 1.

## Worked example: three candidates, one cut

The task, with Lessons 1 through 4 already applied:

```text
GOAL      Fix the double-charge bug: clicking "Pay" twice quickly creates
          two charges. Disable the button on first click and make the
          endpoint reject a duplicate idempotency key.

CONTEXT   The payment flow is app/checkout/. Match the error handling in
          app/checkout/refund.ts — that one's current.

OUTPUT    On a duplicate submit the user sees the original confirmation,
          not an error. Example: "Payment received — receipt #8812" on
          both the first and second click.

CRITERIA  1. Two rapid clicks produce one charge in the payment provider's
             dashboard. Report the charge IDs you see.
          2. The existing checkout tests still pass. Report the output.
          3. A normal single payment still succeeds end to end. Report the
             steps you ran.
```

Five candidate boundaries. Running each through the three questions:

```text
CANDIDATE                          IRREVERSIBLE?  VISIBLE?  HIDES WORK?  KEEP?
--------------------------------------------------------------------------------
Don't make real charges in the
  payment provider while testing        yes         yes         —        KEEP
Don't refactor OrderService, even
  though it's a mess in there            no          no        yes       KEEP
Don't change the API response
  shape — the mobile app reads it        no*        yes*        —        KEEP
Don't add new dependencies                no          no         no       cut
Don't use var, use const                  no          no         no       cut

* reversible in the repo, not in the app store: a shipped mobile client
  keeps parsing the old shape for months
```

The three that survive, written with reasons:

```text
BOUNDARIES

  Use the payment provider's test mode only. A real charge here is money
  moving to a real customer's card, and refunding it is a support ticket,
  not an undo.

  Don't refactor OrderService. It does need work, but I need to read this
  diff line by line before it goes near payments, and a refactor makes that
  impossible. Note anything you'd change in your summary instead.

  Don't change the shape of the /checkout response. The iOS app parses it
  and can't be updated in step with the server, so a field rename breaks
  paying customers until they update.

WHEN STUCK

  If a criterion can't be met, or a boundary blocks the only fix you can
  see, stop and tell me which one and what you'd do instead. Don't route
  around a boundary — if one of them is wrong, I'd rather change it than
  discover it was worked around.
```

Three things about that block.

**Each reason is specific to this task.** "It's dangerous" would generalize to nothing. "Refunding it is a support ticket, not an undo" tells the agent what kind of harm it is avoiding, so a neighbouring case — running a real refund to test the refund path — is covered by the same sentence without being named.

**The refactor boundary buys reviewability, not safety.** It is the third question, and it is the one people leave out because nothing bad happens if you omit it. What happens is worse than bad in a quiet way: the diff gets big, your attention is finite, and the twelve lines that touch payments get the same glance as the other hundred and eighty.

**The two cut candidates were not wrong.** No new dependencies and a style preference are both real preferences. They failed all three questions, so if the agent violates them the cost is a comment in review — and keeping the boundary list at three means all three get read.

## Your turn: sort five candidates

Your task: "Clean up the analytics events — several are firing twice and two have the wrong name." Five candidate boundaries. Mark each keep or cut, and write the reason clause for the ones you keep.

```text
CANDIDATE                                              KEEP / CUT   WHY
-----------------------------------------------------------------------
Don't rename events that are working correctly           _____
Don't send test events to the production analytics
  workspace                                              _____
Don't reorganize the analytics module's file layout      _____
Don't add tracking to any event that isn't already
  tracked                                                _____
Don't use a different analytics library                   _____
```

Reference answer:

```text
Don't rename working events              KEEP — irreversible in effect: renaming
  breaks every saved dashboard and alert built on the old name, and the
  history doesn't merge. Reason clause: "Renaming an event orphans every
  dashboard using it, and the old and new names don't merge in the history."

Don't send test events to production     KEEP — visible to others: the data
  team's numbers are wrong for that day and nobody knows why. Reason clause:
  "Test events in the production workspace corrupt that day's numbers for
  everyone reading them, and there's no way to remove them after the fact."

Don't reorganize the file layout         KEEP — hides the work: this is a
  small behavioural fix and I need to see which events changed. Reason
  clause: "I need to review exactly which events changed; a file move turns
  a six-line diff into an unreviewable one."

Don't add tracking to untracked events   CUT — fails all three. It's a
  reasonable preference and a cheap thing to revert. If it happens, it
  becomes a line in the next brief.

Don't use a different library            CUT — fails all three, and it's
  also unlikely enough that spending a line on it dilutes the three that
  matter. Ruling out things nobody would do is how a boundary list turns
  into noise.
```

The last cut is worth dwelling on. Preemptively forbidding implausible things feels like diligence and is the main way boundary lists grow past the point where they are read. Every line you add costs attention from the lines already there — so the question is not "could this go wrong?" but "is this among the two or three most consequential things that could?"

One more line belongs in this brief, and it is not a boundary: *if you find a third mis-named event I haven't listed, add it to your summary rather than fixing it.* That is the WHEN STUCK section doing its job — routing an unforeseen case somewhere visible instead of leaving it to the agent's judgment. You saw the same move in Lesson 1's email exercise. It is the single most reusable sentence in this entire course.

<!-- exercises -->
## 💻 Exercises (point these at your own real environment)

### Level 1 (warm-up)

Write the boundaries section for the brief you have been building since Lesson 1. List at least five candidates, run each through the three questions, keep no more than three, and attach a task-specific reason to each survivor.

How: generate candidates by asking what you would be annoyed to find changed, then what would be visible to someone else, then what would make the result hard to review. Write the reason clause as though explaining to a colleague why this particular rule exists here — not as a general safety statement.

<!-- rubric -->
- You listed at least five candidates and cut at least two, with a stated reason for each cut.
- Every kept boundary names an action, not a quality.
- Every kept boundary has a reason clause specific to this task, that would let a reader judge a case you did not name.
- At least one kept boundary is there for reviewability rather than for safety.
- You wrote a WHEN STUCK line saying what to do with a decision the brief does not cover.
<!-- answer -->
A passing boundaries section for "add a nightly backup job" might keep three: "Don't run against the production database while testing — a backup job that reads under load can lock tables, and the site goes down for real users while you're experimenting" (irreversible in effect); "Don't wire it into the scheduler yet. I want to run it by hand a few times before it runs unattended at 3am with nobody watching" (visible/unrecoverable); and "Don't add monitoring or alerting in this change. That's a separate piece of work and I need this diff small enough to read" (reviewability). Cut: "don't use bash" and "don't write it in a new directory," both preferences that fail all three questions. The WHEN STUCK line: "If the backup can't complete inside the maintenance window, stop and tell me the timing you measured rather than splitting it into chunks on your own." A failing section lists eight prohibitions, several of them qualities — "don't overcomplicate it," "don't write messy code" — and none with a reason.
<!-- hint -->
If a candidate boundary starts with "don't be" or "don't make it," it is about a quality. Convert it to Lesson 4's tools or cut it.
<!-- hint -->
Write the reason clause before deciding whether to keep the boundary. A boundary whose reason you cannot state in one specific sentence is usually one of the ones to cut.

### Level 2 (advanced)

This is the course's terminal task. Assemble the full six-part brief for your real task, run it end to end with your own agent in your own environment, grade the result against your criteria from the evidence, and write down which section of the brief each remaining gap traces back to.

How: assemble goal, context, output, criteria, boundaries, and when-stuck into one file, in that order. Run it. Grade from the evidence lines before reading the summary, exactly as in Lesson 3. For anything wrong or surprising in the result, trace it to a specific section rather than concluding the brief was too vague in general.

<!-- rubric -->
- All six sections are present, and the goal section contains no recoverable detail the agent could have found itself.
- The run completed and returned evidence for each criterion, or you can name which criteria came back unproven.
- You graded every criterion from the evidence before reading the summary.
- Every gap between what you got and what you wanted is traced to a named section — including gaps traced to a section you wrote and got wrong, not only to sections you omitted.
- You name the one line you would add to the brief before running a task like this again, and say which section it belongs in.
<!-- answer -->
The finished artifact is a brief you would hand to someone else, plus a graded run. A good trace is specific about the section: "The summary claimed the caching worked, and the criterion asked for the timing — but the evidence line was 'significantly faster,' which is a verdict. That is a CRITERIA failure: I named a threshold but not the instrument, so I never said what to run. Next time: 'report the output of `time curl /api/reports`, before and after.'" A common mistake in this exercise is a trace that blames the model: "it ignored my instruction not to refactor." Check the wording first — a bare "don't refactor" with no reason is a boundary the model has no way to weigh against a competing instruction to leave the code better than it found it, and adding "because I need to read this diff line by line" is often the whole fix. If the run came back clean against every criterion, the trace is still worth writing: name which section did the most work, since that tells you what to spend your effort on next time. If a boundary blocked the only viable approach and the agent stopped and said so, that is the WHEN STUCK section working as designed, not a failed run.
<!-- hint -->
Trace gaps in the order the brief is written. Most of them turn out to be criteria that named a standard without naming an instrument.
<!-- hint -->
If the result is right but the run went somewhere you did not expect on the way, that is a boundaries finding rather than a goal finding — the destination was specified and the route was not.
<!-- /exercises -->

## What a rejected brief tells you

You now have a brief with a filled-in goal, a reference pattern, examples in place of adjectives, criteria that return evidence, a short list of prohibitions with reasons, and a stated route for the cases nobody foresaw. You have run a real task with it, and traced what still went wrong to the section responsible.

The habit worth keeping is the tracing, not the template. A brief is not a form to complete — it is a record of the decisions that would otherwise be made without you, and which decisions those are differs for every task you have. The signal that your briefing is improving is not that runs succeed; it is that when one fails, you can point at the sentence.

Two directions from here. If your briefs are landing but you cannot tell whether to trust what comes back, the work is in verification — building checks that survive the agent's own generous assessment of them. If the briefs are right and long runs drift away from them anyway, the constraint is context rather than specification, and that is a different problem with different levers.
