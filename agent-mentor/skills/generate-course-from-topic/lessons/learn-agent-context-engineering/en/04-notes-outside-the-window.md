# Lesson 4: Notes the Window Cannot Lose

> Lesson objectives:
> - Explain why an agent starting a fresh session has no memory of the previous one, and what that costs.
> - Distinguish a progress log that reads well from one an agent can resume from.
> - Write a note that carries a decision's reason, not only its conclusion.
> - Decide what belongs in a note and what does not, without turning the note into a second context problem.
>
> Prerequisites: Lesson 3's survival rule, and one at-risk item you have relocated | Previous [<< 03](./03-what-compaction-keeps.md) | Next [05 >>](./05-subagents-as-a-context-boundary.md)

## The next session does not know you

Close the session. Open a new one tomorrow. The agent that greets you is not the agent you worked with — it has read your project instructions and nothing else. The eleven turns of investigation, the approach you rejected and why, the thing you discovered about the staging database: none of it exists.

Anthropic states this as the defining constraint of long-running work: "The core challenge of long-running agents is that they must work in discrete sessions, and each new session begins with no memory of what came before."[^S9] Their analogy is exact — "a software project staffed by engineers working in shifts, where each new engineer arrives with no memory of what happened on the previous shift."[^S9]

Most people already write something down. The problem is that what they write is a log of what happened, and what the next session needs is a briefing for what to do. Those are different documents, and only one of them works.

## Explanation

### The two failures when the note is missing

Anthropic's evaluation ran a frontier model on a multi-session build and observed two specific failures. Both are worth recognising, because they look like different problems and have one cause.

The first: the agent "tended to try to do too much at once—essentially to attempt to one-shot the app. Often, this led to the model running out of context in the middle of its implementation, leaving the next session to start with a feature half-implemented and undocumented. The agent would then have to guess at what had happened, and spend substantial time trying to get the basic app working again."[^S9]

The second, and this one is stranger: "After some features had already been built, a later agent instance would look around, see that progress had been made, and declare the job done."[^S9]

Sit with the second for a moment. The agent was not lazy and did not misunderstand the task. It arrived with no memory, saw a working application, and reached the only conclusion available from the evidence in front of it — that the work was finished. Without a record of what was *supposed* to exist, "looks done" and "is done" are the same observation.

That is the strongest argument for notes that exists, and it is not about memory. A note is not a convenience that saves re-reading. It is the only thing standing between a fresh agent and a wrong conclusion it has no way to detect.

### What a note is for, stated precisely

Anthropic's term is **structured note-taking**: "a technique where the agent regularly writes notes persisted to memory outside of the context window. These notes get pulled back into the context window at later times."[^S1]

The mechanism connects directly to Lesson 3's survival rule. A note is on disk. Disk survives boundaries. That is the whole reason this works — not because writing is virtuous, but because the file is on the side of the boundary that does not get consumed.

The artifacts in Anthropic's own setup were unglamorous: "an init.sh script, a claude-progress.txt file that keeps a log of what agents have done, and an initial git commit that shows what files were added."[^S9] And the conclusion drawn: "The key insight here was finding a way for agents to quickly understand the state of work when starting with a fresh context window, which is accomplished with the claude-progress.txt file alongside the git history."[^S9]

Note "quickly understand the state of work." Not "review the history." The test of a note is how fast a stranger reaches the point of being able to act.

### A log is not a briefing

Here is the distinction that decides whether your notes work. Both of these are honest records of the same session.

```text
A LOG                              A BRIEFING
─────────────────────────────────  ─────────────────────────────────
Fixed the auth bug. Refactored     NEXT: Add the rate limiter to
the token module. Added tests      auth/middleware.ts. It goes after
for the refresh path. Started      the token check, not before —
on rate limiting but ran out       before means unauthenticated
of time.                           requests consume quota.

                                   DONE: 401-on-refresh fixed (the
                                   token module was comparing expiry
                                   in seconds against a millisecond
                                   timestamp). Tests in
                                   auth.test.ts cover it.

                                   DECIDED: retry limit is 3, because
                                   the upstream gateway times out at
                                   30s and a fourth attempt always
                                   exceeds it. Do not raise this
                                   without changing the gateway.

                                   DO NOT: touch middleware.ts's
                                   routing section — it is being
                                   rewritten separately this week.
```

Both are true. Only one lets a fresh agent start working.

The log answers "what happened." Every sentence is backward-looking, and none of it constrains the next action. An agent reading it knows rate limiting is unfinished and nothing about where it goes, what was already decided, or what it must not disturb. It will make those calls itself, and it will make them differently from you — which is Lesson 1's blank-filling problem arriving through a different door.

The briefing answers "what should the next person do, and what do they need to know not to break." The order matters too: next action first, because that is what a fresh reader needs in the first three seconds.

### The half that gets dropped

Look at the DECIDED line again: "retry limit is 3, because the upstream gateway times out at 30s."

The number alone would survive most summaries and most logs. The reason is what makes it defensible. An agent that reads "retry limit: 3" has a configuration value with no standing — when a later turn suggests 5 for robustness, nothing in the note argues back. An agent that reads the reason can evaluate the suggestion and reject it.

This is the shape of the repeated-work symptom you came in with. Decisions do not get re-litigated because the agent forgot the decision; they get re-litigated because the decision arrived without the argument that settled it. **A conclusion without its reason is an opinion, and an agent will happily replace an opinion with its own.** No single source states that as a rule — it is this course's reading of the failure patterns above — but the practice follows directly from what compaction is documented to keep.

### Four briefing sections, and why each earns its place

A working note needs four things, and the reasons are traceable to specific failures:

| Section | Answers | Prevents |
|---|---|---|
| NEXT | What is the immediate next action, and where | The fresh agent choosing its own starting point |
| DONE | What is genuinely finished, and how you know | Declaring the job done on seeing progress[^S9] |
| DECIDED | What was settled, and why | Re-litigating a settled decision |
| DO NOT | What must not be touched, and why not | Constraints that do not survive a boundary[^S10] |

Everything else is optional. Notice what is not on the list: narrative, a chronology of the session, an account of what was tried. Those belong in git history and in the transcript, and putting them in the note makes it longer without making a fresh agent faster.

The DONE section carries more weight than it looks. It is the direct counter to "look around, see progress, declare it finished"[^S9] — but only if it is specific enough to contrast against the feature list. "Auth work: done" does not prevent that failure. "401-on-refresh fixed; rate limiting not started" does.

### The note is context too

One caution, because the failure here is a real one and it is self-inflicted.

A note is read into the window at session start. It draws on the same attention budget as everything else,[^S1] and a note that grows without pruning becomes the thing it was meant to prevent: a large block of mostly-stale text competing for attention with the actual task.

The discipline is that a note is **replaced, not appended**. When a feature is finished, its NEXT line disappears rather than being marked done. When a decision is superseded, the old one is deleted rather than annotated — a note holding both the old and new decisions is Lesson 1's clash, in a file you wrote yourself.

The 2026 monitor study offers a related finding worth borrowing: degradation in long transcripts "can be partially mitigated with prompting techniques such as periodic reminders throughout the transcript."[^S6] That was measured on a classification task rather than a coding one, so do not import the result directly — but the shape supports what practitioners do anyway, which is re-read the note at intervals rather than only at session start.

## Worked example: a session's notes, written twice

The same session, ninety minutes of work on a data export feature. First, what most people write:

```text
PROGRESS NOTE — 2026-08-22

Worked on CSV export today. Looked into why it's slow — turns out the
query is doing N+1 on the user join. Tried adding an index but that
didn't help much. Ended up batching the fetch instead, which got it
from 40s to about 6s. Also found that the date formatting was wrong
for non-US locales, fixed that. Tests are passing. Next time probably
should look at the memory usage, it seemed high.
```

Readable, honest, and close to useless to a fresh agent. It buries the next action in a hedge at the end, records an abandoned attempt as prominently as the successful one, and states "tests are passing" without saying which tests or what they cover. Worst: "the query is doing N+1 on the user join" is a real finding that cost investigation, and it is written as narrative rather than as something the next session can act on.

Now the same ninety minutes as a briefing:

```text
EXPORT FEATURE — state as of 2026-08-22

NEXT: Profile memory during a 50k-row export. Peak looked high in
      manual testing (no number measured — that is step one). If it
      is over ~500MB, the batch size in exporters/csv.py:L84 is the
      first thing to try lowering.

DONE: - Export time 40s → 6s for 50k rows. Cause was N+1 on the user
        join; fixed by batching the fetch, not by indexing.
      - Locale date formatting fixed for non-US.
      - tests/test_export.py covers both: row count and the date
        format for three locales. Full suite passes.

DECIDED: Batching over indexing. An index on user_id was tried and
      gave under 15% improvement, because the cost was the round
      trips rather than the lookup. Do not re-try the index route
      unless the batching is removed.

DO NOT: Change the CSV column order. Two downstream consumers parse
      by position, not by header. This is documented in
      docs/export-format.md and is the reason the column list looks
      arbitrary.
```

Walk the differences, because each one prevents something specific.

The NEXT section names a file and a line, and states what "too high" means — with an honest note that the number was never measured. That candour matters: an agent told "memory seemed high" will guess a threshold, and a guessed threshold is a blank being filled silently.

The DONE section attaches evidence. "Tests are passing" became "tests/test_export.py covers row count and date format for three locales," which lets a fresh agent judge coverage rather than trust an assertion — and is specific enough to contrast against the feature list, which is what stops the declare-it-finished failure.

The DECIDED section preserves the failed attempt as a *decision with a reason*, not as narrative. "Tried an index, didn't help much" invites a retry. "Index gave under 15% because the cost was round trips" closes the question. That is the same information doing different work.

The DO NOT section explains itself. A bare "don't change the column order" is a rule an agent will weigh against a competing instinct to tidy up. With "two downstream consumers parse by position," there is nothing to weigh.

The briefing is longer than the log, and that is the correct trade: it is read once per session and saves a re-derivation that costs many turns. But it is also bounded — when the memory profiling is done, that NEXT line is replaced, not appended to.

## Your turn: convert a log to a briefing

Below is a real-shaped log. Rewrite it as a four-section briefing. Two things in it are traps: one sentence is a decision whose reason is missing, and one is narrative that should not survive the rewrite at all.

```text
NOTES, THURSDAY

Spent most of today on the notification service. The webhook handler
was dropping events when the queue backed up — took a while to find,
it was a silent exception swallow in the retry wrapper. Fixed. Also
we're using Redis for the dedupe cache now instead of the in-memory
one. Started writing the integration test but it needs a Redis
instance in CI which isn't set up yet, so it's half done and skipped.
Tried three different approaches to the backoff before settling on
exponential with jitter.

NEXT: _______________________________________________
DONE: _______________________________________________
DECIDED: ____________________________________________
DO NOT: _____________________________________________

The decision missing its reason: ____________________
The narrative that should not survive: ______________
```

Reference answer:

```text
NEXT: Set up a Redis instance in CI, then un-skip the integration test
      in tests/test_notifications.py. The test is written; it is
      skipped because CI has no Redis.

DONE: - Webhook handler no longer drops events under queue backpressure.
        Cause was a silent exception swallow in the retry wrapper.
      - Dedupe cache moved from in-memory to Redis.
      - Backoff is exponential with jitter.

DECIDED: Redis for the dedupe cache over the in-memory one, because
      [THE REASON IS MISSING FROM THE LOG — recover it before the
      session ends, or the next agent will re-open this on the first
      sign of Redis latency]

DO NOT: Re-enable the integration test without a Redis instance
      available — it will fail for an environment reason and look
      like a code regression.

The decision missing its reason: the Redis switch. "We're using Redis
now" is a conclusion with no argument. Was it for multi-instance
correctness, for persistence across restarts, for memory pressure?
Each implies different things about whether Redis can be swapped out
later, and an agent that does not know which will make that call itself.

The narrative that should not survive: "Tried three different
approaches to the backoff before settling on exponential with jitter."
The three approaches are gone and nobody needs them. What survives is
the outcome — exponential with jitter — under DONE. If one of the
rejected approaches was rejected for a reason worth preserving, that
reason belongs in DECIDED; the count of attempts never does.
```

The general test, and it is the useful takeaway from this exercise: **a note has room for what was decided and what is true, and no room for what happened.** Chronology feels like the natural shape for a note because it is the shape of your memory of the day. It is not the shape a fresh reader needs.

<!-- exercises -->
## 💻 Exercises (point these at your own real environment)

### Level 1 (warm-up)

Write a briefing for a task you currently have in progress, using the four sections. Then test it the only way that works: start a genuinely fresh session, give the agent nothing but the note, and ask it to state what it is about to do and why.

How: put the note in a file in the project — the name matters less than that it is on disk and you point the agent at it. Then open a new session, with no history, and give it one instruction: read the note and tell you the next action, the constraints on it, and anything it would need to ask you about.

<!-- rubric -->
- The note has all four sections, and every DECIDED item carries a reason.
- The NEXT section names a file or a specific location, not a general area of work.
- The fresh agent, given only the note, states the next action you intended.
- The fresh agent does not ask you a question the note should have answered — or if it does, you add the answer to the note.
- The note contains no chronology of what you did in what order.
<!-- answer -->
A note passes when the fresh agent's stated next action matches yours and it names the constraint without being asked. The most common failure is the agent asking something you consider obvious, which is the note's most valuable output — the question marks exactly the blank you could not see, because you have context the note does not carry. Typical questions of this kind are "should I add tests for this?" and "is it acceptable to change the function signature?", both of which are decisions you have already made without noticing you made them. A common mistake is testing the note in the same session where you wrote it, where the agent still has the conversation and appears to understand the note perfectly; the test only means something with a genuinely fresh context. If the agent proposes a reasonable action that is not the one you meant, the defect is usually in NEXT being an area rather than an action.
<!-- hint -->
Write the NEXT section first and make it a single sentence starting with a verb. If you cannot, the next action is not decided yet, and deciding it is the real task.
<!-- hint -->
For each DECIDED line, read it aloud and ask "so what if I did the opposite?" If the note gives no answer, the reason is missing.

### Level 2 (advanced)

Run a task across a real session boundary using notes, and measure what the note carried. Work until you compact or end the session, write the note, then resume in a fresh window and record every point where the new session lacked something.

How: pick work that genuinely will not fit in one window. Before the boundary, write the briefing. After it, work for at least twenty minutes and keep a running list: every time the agent asks something the note should have answered, re-derives something already known, or does something a lost constraint would have prevented. Then revise the note and say which section each gap belonged in.

<!-- rubric -->
- The work genuinely crossed a boundary; you did not simulate it by clearing early.
- You have a list of at least two gaps, each traced to a specific section.
- For each gap you can say whether it was omitted from the note or stated too vaguely to act on.
- The revised note is not longer than the original in every section — at least one thing was removed.
- You can name what the note cost you to maintain against what it saved.
<!-- answer -->
The two gap types separate cleanly and want different repairs. Omissions are things you knew and did not think to write, and they cluster in DO NOT — constraints are so obvious to the person holding them that they feel unnecessary to state. Vagueness clusters in NEXT and DONE: "finish the export work" and "tests pass" both feel like information and neither constrains an action. The removal requirement in the rubric is doing real work: the reflex on revising a note is to add the missing thing, and a note revised only by addition becomes a slow-growing context problem of exactly the kind Lesson 1 described. A finished revision has both an addition and a deletion, most often deleting a DONE item that is now so settled nobody would question it. On the cost side, the honest accounting is usually a few minutes of writing against many turns of re-derivation, but state it from your own run rather than assuming it — if the note saved nothing, the likely cause is that your task fits in one window and does not need this machinery yet.
<!-- hint -->
Keep the gap list while you work rather than reconstructing it afterwards. A gap you noticed and worked around is invisible twenty minutes later.
<!-- hint -->
The gaps that matter most are the ones where the agent did something reasonable that you did not want. Those trace to DO NOT or to a DECIDED item that lost its reason.
<!-- /exercises -->

## What a note cannot do

You can now write something that survives every boundary and gets a fresh agent working in one read. The four sections have specific jobs, decisions carry their reasons, and the note is pruned rather than grown.

There is a category this does not reach. A note handles state that must persist. It does nothing about work that produces enormous volume in the moment — the dependency audit that reads two hundred files, the log analysis, the documentation sweep. That material does not need to persist. It needs to happen somewhere other than in your window, and then to come back as a conclusion.

That is a boundary of a different kind, and the next lesson is about when to draw one and what crossing it costs.
