# Lesson 3: Reading a Compaction Boundary

> Lesson objectives:
> - Describe what a compaction boundary does to the message history, step by step.
> - Predict which of your instructions survive a boundary and which are lost, from how each was loaded.
> - Explain why the losses are systematic rather than random.
> - Steer a compaction pass before it runs, and say what steering cannot reach.
>
> Prerequisites: Lesson 2's four levers, and the distinction between clearing and summarizing | Previous [<< 02](./02-write-select-compress-isolate.md) | Next [04 >>](./04-notes-outside-the-window.md)

## The session survived and the constraint did not

Compaction did its job. The window emptied, the agent kept working, and the run continued without an error. Twenty minutes later it does the thing you told it not to do at the start.

The natural reading is that summarization is unreliable — that it kept the wrong things this time and might keep the right ones next time. That reading will cost you, because it suggests the fix is a better summarizer, or luck.

The losses are not random. What survives a boundary is determined by *how each piece of context got into the window in the first place*, and that is knowable in advance. This lesson is about reading that in advance, so that "will this survive?" becomes a question with an answer before you need it.

## Explanation

### What the boundary actually does

Start with the mechanism, because the vocabulary around compaction hides how absolute it is.

Anthropic's API documentation describes the sequence: the system "detects when input tokens reach your specified trigger threshold," then "generates a summary of the current conversation," "creates a `compaction` block containing the summary," and "continues the response with the compacted context."[^S14] Then the decisive sentence: "The API automatically drops all content blocks prior to the `compaction` block, continuing the conversation from the summary."[^S14]

*Drops.* Not de-prioritizes, not moves to the back. Everything before the boundary is gone from the conversation, and the summary is what is left of it.

The engineering write-up frames the same operation optimistically — "compaction distills the contents of a context window in a high-fidelity manner, enabling the agent to continue with minimal performance degradation"[^S1] — and both descriptions are accurate. High fidelity on the material the summary selected; total loss on everything else. Which is why the selection is the whole game.

As of 2026-08-23, the server-side API feature is in beta behind a dated header and its trigger must be set to at least 50,000 tokens.[^S14] Those specifics will move. The drop-everything-before-the-block mechanism is the part to remember.

### What the summary is optimised for

You can read the default instruction. Anthropic publishes it:

> "The purpose of this summary is to provide continuity so you can continue to make progress towards solving the task in a future context, where the raw history above may not be accessible and will be replaced with this summary. Write down anything that would be helpful, including the state, next steps, learnings etc."[^S14]

Read what that prompt asks for and, more usefully, what it does not. It asks for state, next steps, and learnings — a forward-looking brief for continuing work. It says nothing about preserving constraints, rejected approaches, or the reasons behind decisions.

That is the systematic bias. A summarizer optimising for "continue making progress" keeps the plan and drops the guardrails, because guardrails are not progress. Your "don't touch middleware.ts" is not state, not a next step, and not a learning. It is a boundary condition, and nothing in the instruction asks for it.

### The survival table

The most useful thing published on this is a table in Claude Code's documentation recording, mechanism by mechanism, what happens at a boundary:[^S10]

| Mechanism | After compaction |
|---|---|
| System prompt and output style | Unchanged; not part of message history |
| Project-root CLAUDE.md and unscoped rules | Re-injected from disk |
| Auto memory | Re-injected from disk |
| Rules with `paths:` frontmatter | Lost until a matching file is read again |
| Nested CLAUDE.md in subdirectories | Lost until a file in that subdirectory is read again |
| Invoked skill bodies | Re-injected, capped at 5,000 tokens per skill and 25,000 tokens total; oldest dropped first |

The organising principle is in the explanation underneath: "Path-scoped rules and nested CLAUDE.md files load into message history when their trigger file is read, so compaction summarizes them away with everything else."[^S10]

There it is. **Anything loaded into message history is summarized away. Anything re-read from disk comes back.** That is a single rule, and it predicts every row in the table.

Apply it to your own session and the answer for conversation is immediate: everything you typed is message history. Every constraint you stated, every correction you made, every decision you reached with the agent — all of it lives in exactly the category the boundary consumes. The documentation says so plainly elsewhere: "instructions from early in the conversation can get lost,"[^S11] and, on the order of operations, "It clears older tool outputs first, then summarizes the conversation if needed. Your requests and key code snippets are preserved; detailed instructions from early in the conversation may be lost."[^S11]

The behaviour and the caps above are current for the tool as of 2026-08-23; version-specific numbers like the 5,000-token skill cap are exactly the kind of detail that moves between releases. The rule underneath — disk survives, history does not — is the durable part.

```agentmentor-hotspot
{
  "id": "context-engineering-compaction-survival-boundary",
  "label": "Click what the boundary consumes",
  "prompt": "Four things are in your session when compaction triggers. Click the one that the boundary consumes and does not restore — the one whose only copy lives in message history.",
  "whyHere": "Readers reliably assume that an instruction they stated forcefully, or restated, is protected. The survival rule is about the loading mechanism, not about emphasis or recency, and this makes the reader apply it to a concrete set instead of nodding along to the table.",
  "copyPurpose": "Have the agent check whether I am judging what survives compaction by how important or recent an instruction felt, instead of by whether its only copy is in message history.",
  "layout": "flow",
  "nodes": [
    { "id": "claudemd", "label": "Project CLAUDE.md rule", "x": 12, "y": 22 },
    { "id": "spoken", "label": "Constraint you typed in turn 1", "x": 12, "y": 70 },
    { "id": "boundary", "label": "Compaction boundary", "x": 50, "y": 46 },
    { "id": "memory", "label": "Auto memory file", "x": 88, "y": 22 },
    { "id": "after", "label": "Session continues", "x": 88, "y": 70 }
  ],
  "edges": [
    { "from": "claudemd", "to": "boundary", "label": "on disk" },
    { "from": "spoken", "to": "boundary", "label": "in history" },
    { "from": "boundary", "to": "memory", "label": "re-read" },
    { "from": "boundary", "to": "after", "label": "summary only" }
  ],
  "hotspots": [
    { "nodeId": "claudemd", "correct": false, "feedback": "This one is re-injected from disk after the pass, so the boundary cannot destroy it — the file is still there to be read again. That is precisely why the repair for a lost constraint is to move it into this file rather than to restate it more firmly in conversation." },
    { "nodeId": "spoken", "correct": true, "feedback": "Its only copy is in message history, which is the category the summarizer consumes. Whether it survives depends on whether the summary happened to mention it, and the default summarization instruction asks for state, next steps, and learnings — a constraint is none of those three." },
    { "nodeId": "memory", "correct": false, "feedback": "Auto memory is re-read from disk on the far side of the boundary, so it arrives intact. Its risk is different in kind: it accumulates across sessions without anyone reviewing it, so it can carry a stale claim through every boundary faithfully." },
    { "nodeId": "boundary", "correct": false, "feedback": "The boundary is the event, not a thing that can be consumed. What it does is drop every content block before it and continue from the summary, so the question to ask of each item is which side of that drop its only copy is on." }
  ]
}
```

### Position matters on the far side too

One more mechanism, because it explains a failure that looks like a summary bug and is not.

A summary that mentions your constraint has not guaranteed the constraint is followed. Where it lands in the reconstructed window affects whether it is used. Models are measurably better at using material at the very start or the very end of their input than material in the middle — the "lost in the middle" U-shape.[^S4] That result is from 2023 and its models are long superseded, so take it as a durable design principle rather than as a current benchmark; the 2026 monitor study finds the same shape holds on current models, reporting that "detection is worst in the middle."[^S6]

So a compaction summary that dutifully lists your constraint as item seven of twelve, in a paragraph that then continues into next steps, has recorded it in the weakest available position. It is present. It is outcompeted. From outside, that is indistinguishable from having been dropped, which is why "but it's in the summary" is not the reassurance it appears to be.

### What steering can and cannot reach

You are not powerless at the boundary. The documented lever is to compact deliberately with instructions instead of waiting: run `/compact` with a focus, "like `/compact focus on the auth bug fix`, before starting a long new task. The summary keeps what you choose instead of what the automatic pass guesses is important."[^S10] At the API level the equivalent is the `instructions` parameter, with the caveat that custom instructions "don't supplement the default prompt. They replace it completely."[^S14]

Two limits on this, and they are the reason the next lesson exists.

The first is timing. Steering only works if you are there. An automatic pass fires when the threshold is reached, which on a long unattended run is a moment you are not present for. Every constraint's survival then depends on a default prompt that was not written with your constraint in mind.

The second is more fundamental. Compaction is not sufficient for work that spans multiple windows, and the vendor says so in its own evaluation: "However, compaction isn't sufficient."[^S9] The observed failure: an agent "running out of context in the middle of its implementation, leaving the next session to start with a feature half-implemented and undocumented. The agent would then have to guess at what had happened... This happens even with compaction, which doesn't always pass perfectly clear instructions to the next agent."[^S9]

That is not a criticism of summarization quality. It is a statement about what a summary structurally is: one model's judgment, made once, about what a future reader will need — written before knowing what that reader will be asked.

## Worked example: predicting a boundary in advance

A real session about to hit compaction. Before it fires, here is what will survive, derived from the rule rather than guessed.

```text
IN THE SESSION                          PREDICTION        WHY
───────────────────────────────────────────────────────────────────────────
Project CLAUDE.md: "run make fmt        SURVIVES          Re-injected from
before every commit"                                      disk. Loading
                                                          mechanism, not
                                                          importance.

You, turn 1: "The export endpoint is    AT RISK           Message history. It
being deprecated — don't build                            is a constraint, and
anything new on it"                                       the default prompt
                                                          asks for state, next
                                                          steps, learnings.
                                                          A prohibition is
                                                          none of those.

Turn 14: agreed the retry limit         AT RISK           Message history, and
should be 3 because the upstream                          the reason is the
gateway times out at 30s                                  fragile half — a
                                                          summary may keep
                                                          "retry limit 3" and
                                                          drop the why, which
                                                          is what a later turn
                                                          needs to defend it.

Rule in .claude/rules with              LOST              Path-scoped: it
paths: src/api/**                                         entered history when
                                                          a matching file was
                                                          read, so it is
                                                          summarized away.
                                                          Returns only when
                                                          another matching
                                                          file is read.

Test output from turn 9                 GONE, FINE        Spent. Cleared
                                                          before summarization
                                                          anyway, and nobody
                                                          wants it back.

The current file being edited           SURVIVES          Re-read on demand;
                                                          it is on disk.
```

The two AT RISK rows are the ones to act on, and the action is not "hope the summary catches them."

The deprecation constraint moves to the project instructions file — one line, permanently, on the disk side of the boundary. It stops being a thing you said and becomes a thing that is true about the project. That is the write lever from Lesson 2, applied at exactly the point where the compress lever is about to fail.

The retry decision is more interesting, because moving it to a rules file feels heavy for one number. But look at what is actually at risk: not the number, the reason. "Retry limit 3" survives as a fact and reads like an arbitrary preference; "retry limit 3 because the upstream gateway times out at 30s" is defensible against a later turn that thinks 5 would be more robust. A decision that has lost its reason gets re-litigated, and re-litigating a settled decision is one of the two symptoms this course started from.

The general shape: **before a boundary, ask of each load-bearing item whether its only copy is in message history — and if it is, move the copy.** The prediction is not the deliverable. The relocation is.

## Your turn: predict and place

Six items are in a session approaching its threshold. Mark each SURVIVES, AT RISK, or LOST, and for anything not surviving, name where you would move it.

```text
1. A rule in .claude/rules/ with no paths: frontmatter          ______
2. Your instruction, turn 3: "prefer readability over
   cleverness in this module"                                   ______
3. A skill body the agent invoked at turn 5, 9,000 tokens       ______
4. The agent's own conclusion from turn 11 that the bug is
   in the serializer, not the parser                            ______
5. A nested CLAUDE.md in src/billing/, loaded when the
   agent read a file there                                      ______
6. Auto memory, holding a build command it learned last week    ______
```

Reference answers:

```text
1. SURVIVES. Unscoped rules are re-injected from disk. The paths: frontmatter
   is the only thing that would have changed this — it is what puts a rule
   into message history instead.

2. AT RISK. Message history, and it is a preference rather than state, so the
   default instruction has no reason to keep it. Move it to the project
   instructions file if it is a standing preference; if it applies only to
   this task, restate it after the boundary.

3. SURVIVES, PARTIALLY. Skill bodies are re-injected but capped at 5,000
   tokens per skill, so a 9,000-token skill comes back truncated. Truncation
   keeps the start of the file, which is why important instructions belong
   near the top of a skill rather than in a section at the end.

4. AT RISK, and this is the expensive one. It is a finding, not a file — the
   product of eleven turns of investigation with no copy anywhere. If the
   summary drops it, the next window re-derives it from scratch, which is
   exactly the repeated-work symptom. This one belongs in a note, and Lesson 4
   is about the shape that note should take.

5. LOST. Same mechanism as a path-scoped rule: it entered history when a file
   in that directory was read. It returns when another file there is read,
   which may be many turns later — during which the agent is working on
   billing code without the billing conventions.

6. SURVIVES. Re-injected from disk. Worth noting the different risk it
   carries: nobody reviewed it, and it will carry a stale build command
   through every boundary just as faithfully as a correct one.
```

Item 4 is the one that changes how you work. Items 1, 3, 5, and 6 are properties of your tool that you can look up. Item 2 has an obvious home. Item 4 — the thing you and the agent worked out together, that exists nowhere but the conversation — is the material a boundary is worst at preserving and that costs the most to lose.

<!-- exercises -->
## 💻 Exercises (point these at your own real environment)

### Level 1 (warm-up)

Find your own tool's survival rules and write them down, then check one prediction against reality.

How: search your agent tool's documentation for what happens at compaction — the terms differ by vendor, so look for "compact," "summariz," or "context limit." Build a table like the one in this lesson for the mechanisms your setup actually uses. Then take a session approaching its threshold, write down one prediction for a specific item before compacting, compact, and ask the agent about that item.

<!-- rubric -->
- Your table covers every mechanism you actually use to give the agent instructions, with a survival outcome for each.
- Each outcome is sourced from current documentation you read this session, not from memory or from this lesson.
- You made one written prediction before the boundary and checked it after.
- You can state the general rule your tool follows in one sentence.
- You name at least one instruction mechanism you use whose survival you had never considered.
<!-- answer -->
A completed table separates disk-loaded from history-loaded mechanisms, and the general rule usually reduces to the same sentence: material re-read from disk survives, material in message history is summarized. The prediction check is where people learn the most — a common finding is that a scoped or conditional instruction they thought of as "always on" is actually loaded on a trigger, which means it lives in history and goes away. A common mistake is testing the prediction by asking the agent "do you remember X?", which is unreliable in both directions: it may reconstruct a plausible answer, or deny something present but low-attention. Test by asking it to *act* — give it a task where honouring X changes what it does, and watch what it does. If your tool documents no compaction behaviour at all, that is the finding, and it means every long-run instruction of yours belongs on disk by default.
<!-- hint -->
The distinction to look for in the docs is not "important vs unimportant" but "loaded once at startup vs loaded when something triggers it."
<!-- hint -->
For the prediction, pick something with an observable consequence. "Don't modify files in vendor/" is testable; "prefer clear naming" is not.

### Level 2 (advanced)

Take a real long task and do a boundary audit before it hits its threshold. List everything load-bearing in the session, predict each item, relocate the at-risk ones, then compact and verify.

How: work in a real session past the halfway mark. Load-bearing means the run would go wrong without it — constraints, decisions with their reasons, findings the agent worked out. For each, apply the rule: is the only copy in message history? Relocate what is, using the destination that fits — project instructions for standing rules, a notes file for findings and decisions. Then compact and check three of your relocations by giving the agent work that requires each one.

<!-- rubric -->
- Every load-bearing item is listed with a prediction and a justification from its loading mechanism.
- At least two at-risk items were relocated before the boundary, to a named file.
- You verified at least three items after the boundary by observing behaviour, not by asking the agent what it remembers.
- You identify at least one item that survived and was not acted on — present in the summary but outcompeted.
- You can name one thing you would relocate earlier next time, and say what made you notice it late.
<!-- answer -->
The audit's most common finding is that the largest at-risk category is not constraints — most people relocate those once they know the rule — but agreed decisions with their reasons. The reason is the fragile half: summaries keep conclusions and drop justifications, and a conclusion without its justification gets re-argued the moment something makes it inconvenient. A good relocation reads "retry limit is 3, because the upstream gateway times out at 30s and a fourth attempt always exceeds it" rather than "retry limit: 3." The verification step is where the "present but outcompeted" case shows up: the agent, asked directly, can quote the constraint from its summary, and yet its unprompted behaviour a few turns later ignores it. That is the U-shaped position effect rather than a lost instruction, and the repair is different — the item needs to be somewhere re-read on demand, not merely mentioned. A common mistake is relocating everything, which turns the project instructions file into a second context problem: a bloated instructions file loads in full at every session start and competes for the same attention budget.
<!-- hint -->
Sort your load-bearing list by what it would cost to re-derive. Findings that took many turns to reach are worth more relocation effort than constraints you can restate in one line.
<!-- hint -->
When you verify, give the agent a task where the constraint is inconvenient — where the easy path violates it. A constraint that only holds when nothing pushes against it has not been verified.
<!-- /exercises -->

## The gap a summary cannot close

You can now predict a boundary instead of surviving it. The rule is one sentence — disk survives, message history does not — and it explains the whole published survival table. You can steer a pass when you are watching, and you know steering does not help when you are not.

What remains is the thing the vendor's own evaluation names: compaction is not sufficient for work that outlives one window, because a summary is a single judgment made in advance about a reader whose questions are not yet known. Even done well, it hands the next session a paragraph where the previous session had a working understanding.

The alternative is not a better summary. It is having the load-bearing state somewhere the boundary never touches — which means writing it down, and writing it in a form an agent starting from nothing can actually act on.
