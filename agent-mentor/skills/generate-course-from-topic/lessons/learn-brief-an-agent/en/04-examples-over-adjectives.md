# Lesson 4: Examples in Place of Adjectives

> Lesson objectives:
> - Explain why an evaluative adjective transfers less than an instance of the thing it describes.
> - Replace one adjective in your own brief with an example that carries the same requirement.
> - Choose how many examples to give, and vary them so the agent copies the rule and not the surface.
>
> Prerequisites: Lesson 3's acceptance criteria, written for your own task | Previous [<< 03](./03-naming-done-first.md) | Next [05 >>](./05-what-it-must-not-do.md)

## "Consistent with the others" was not a requirement

Some of what you want survives every technique so far. You wrote your blanks down, you ran the interview, you built a criteria list — and one line still reads: *make it consistent with the existing components*.

You know exactly what that means. You could sort a pile of components into the two bins in seconds. But there is no number in it, no threshold, and no instrument, so it fails Lesson 3's checkable test. And it fails it permanently: no amount of rewriting turns "consistent" into a measurement, because the property you are naming is real and you are not able to state its rule.

The way out is not a better adjective. It is to stop describing the property and hand over something that has it. This lesson is about that substitution, what it costs, and the two ways it goes wrong.

## Explanation

### An adjective points; an example contains

When you write "clean," you are compressing a large amount of accumulated taste into five characters. The compression works between people who share the taste and fails between people who do not, and it fails silently — the reader believes they decompressed it correctly.

An agent decompressing "clean" produces something clean by *some* standard. Lesson 2 explains why: the word has to resolve to concrete choices, no evidence is available for which choices you meant, and the machinery produces them anyway. Your version and its version are both consistent with the word.

An example does not have this problem, because it is not compressed. It is an instance of the thing. Anthropic's prompting documentation calls this out as a first-rank technique: "Examples are one of the most reliable ways to steer Claude's output format, tone, and structure."[^S4] The same documentation frames the underlying problem in a way worth holding onto — "Claude can infer intent, but it can't read your mind."[^S3] An adjective asks it to infer. An example removes the need to.

Compare a before-and-after pair published in the Claude Code documentation:

```text
Before:  implement a function that validates email addresses

After:   write a validateEmail function. example test cases:
         user@example.com is true, invalid is false, user@.com is false.
         run the tests after implementing
```

Both describe a validator. The second settles, without a word of specification, that a bare string with no `@` fails and that a domain with an empty label fails — two of the dozen decisions "validates email addresses" leaves open.[^S3] Notice how little writing it took: three instances, no rules.

That is the trade an example makes. It is longer than the adjective and enormously shorter than the specification the adjective was standing in for.

### Point at something that already exists

Before writing an example, check whether one is already sitting in your project.

The Claude Code documentation's before/after pairs include this one:

```text
Before:  add a calendar widget

After:   look at how existing widgets are implemented on the home page to
         understand the patterns. HotDogWidget.php is a good example. follow
         the pattern to implement a new calendar widget that lets the user
         select a month and paginate forwards/backwards to pick a year. build
         from scratch without libraries other than the ones already used in
         the codebase.
```

A **reference pattern** is an existing artifact you name as the thing to match.[^S3] It is the highest-leverage form of example available, because it costs you one filename and carries every convention in that file — naming, structure, error handling, the small habits you could not enumerate if asked.

It is also where Lesson 1's recoverable/decision split pays off. Which patterns exist is recoverable; the agent can find them. *Which one you consider exemplary* is not — a codebase usually contains three or four ways of doing the same thing, some of them regretted, and nothing marks which is current. Naming the file is the whole contribution, and it takes four words.

### Three to five, and make them differ

Once you are writing examples rather than pointing at one, two questions follow: how many, and which.

Anthropic's guidance gives a number and three properties. On quantity: "Include 3–5 examples for best results."[^S4] On selection, examples should be "Relevant: Mirror your actual use case closely. Diverse: Cover edge cases and vary enough that Claude doesn't pick up unintended patterns. Structured: Wrap examples in `<example>` tags (multiple examples in `<examples>` tags) so Claude can distinguish them from instructions."[^S4]

Diversity is the one that decides whether the technique works. Three examples that resemble each other teach two rules at once — the one you meant, and an accidental one shared by all three. Give three examples of short summaries and you may get a length rule you never intended. **The agent has no way to tell which shared property is the requirement**, so vary everything except the property you actually care about.

The structural point is smaller but real: an unmarked example can be read as part of the instructions. Fencing them off — `<example>` tags, a code block, a clearly labelled section — keeps "here is what good looks like" from being read as "do this specific thing."

### Where an example beats a criterion, and where it doesn't

These two techniques do different jobs, and briefs go wrong when one is asked to do the other's.

| | Acceptance criterion | Example |
|---|---|---|
| Answers | Is it finished? | What should it look like? |
| Checked | After the run, by comparison | During the run, as a model |
| Good at | Thresholds, counts, states, invariants | Format, tone, structure, conventions |
| Fails at | Anything requiring taste | Proving the work is complete |

An example never tells you whether the work is done — three examples of good error messages say nothing about whether every error path has one. A criterion never conveys a house style. Most real briefs need both, and the seam between them is usually the line that reads like an adjective: whenever you find one, ask which of the two columns it belongs in.

### Two ways this goes wrong

**Examples that are all the same.** Covered above; the most common failure, and it produces work that is subtly over-constrained. The tell is output that matches your examples too closely — the same length, the same structure, the same phrasing rhythm — on inputs where that made no sense.

**Trying to say it in the negative instead.** When an adjective resists definition, the tempting alternative is to describe what you do not want. Anthropic's guidance on tuning an agent's communication style is direct about how that compares: "Positive examples of the communication style you want tend to be more effective than instructions about what not to do."[^S4]

This is worth stating plainly because Lesson 5 is about negative boundaries and will not contradict it. A prohibition is the right tool for an *action* you want ruled out — deleting, sending, deploying. It is a poor tool for a *quality* you want achieved. "Don't make it look generic" leaves the entire space of non-generic outputs open. One page you consider good closes it.

```agentmentor-diff
{
  "id": "brief-an-agent-example-diversity-diff",
  "label": "Read what the added examples changed",
  "prompt": "This edit revises the examples in a brief for an agent writing commit messages. What does the change actually fix?",
  "whyHere": "Readers who accept that examples beat adjectives still tend to pick examples that resemble each other, which teaches an accidental rule alongside the intended one. This asks them to spot the accidental rule in a concrete case.",
  "focus": "Compare what the three removed examples share with each other, against what the three added ones share. The property common to all of one set and not the other is what the edit is about.",
  "language": "text",
  "diff": "--- a/brief.md\n+++ b/brief.md\n@@\n Write the commit message for this change.\n Examples of the style I want:\n \n-  fix: correct timezone offset in export\n-  fix: handle empty cart in checkout\n-  fix: prevent double-submit on signup\n+  fix: correct timezone offset in export\n+\n+  refactor: extract PaymentValidator from OrderService\n+\n+  feat: add CSV export to the reports page\n+\n+  Adds a download button and a /reports/export endpoint.\n+  Rows match the on-screen filter. Large exports stream\n+  rather than buffering.",
  "choices": [
    {
      "id": "more-examples",
      "text": "It raises the example count, and more examples give the agent more to learn the style from",
      "correct": false,
      "feedback": "The count went from three to three. If quantity were the fix, the edit would have appended rather than replaced, and the three originals would still be there."
    },
    {
      "id": "breaks-shared-shape",
      "text": "The originals were all one-line fixes, so they taught 'always one line, always fix:' alongside the format; the replacements vary type and length so only the format is common to all of them",
      "correct": true,
      "feedback": "Exactly the accidental-rule problem. The first set shares three properties — the fix: prefix, a single line, and a bug-shaped subject — and nothing marks which one is the requirement, so a feature commit comes back mislabelled and truncated. The second set varies prefix and length while holding the format constant, leaving only the format for the agent to generalize."
    },
    {
      "id": "adds-body",
      "text": "It shows that commit messages should have a body paragraph explaining the change",
      "correct": false,
      "feedback": "Only one of the three added examples has a body, and that is deliberate: if all three had one, the set would teach 'always write a body,' which is the same accidental-rule failure in a new place. The body appears once to show it is permitted when the change warrants it."
    },
    {
      "id": "conventional",
      "text": "It switches the brief to the Conventional Commits standard by including more of its prefixes",
      "correct": false,
      "feedback": "Both sets already use that prefix format, so the standard is not what changed. Reading the edit as adopting a convention misses that the convention was constant across both versions — what varies between them is which properties the three examples happen to share."
    }
  ],
  "copyPurpose": "Have the agent check whether the examples in my own brief share a property I did not intend to require."
}
```

## Worked example: three adjectives, three substitutions

A brief line that has survived Lessons 1 through 3 intact:

```text
Write the API error responses. Keep them clean, consistent with the rest of
the API, and helpful to whoever's debugging.
```

Three adjectives. Taking each in turn:

**"consistent with the rest of the API"** → a reference pattern. There is already an API; one of its handlers is the one you would point at if asked.

```text
Match the error format used in app/api/orders/route.ts — that one's current.
Some older handlers under app/api/legacy/ use a different shape; don't copy
those.
```

The second sentence is doing as much work as the first. A codebase with two patterns and no marker for which is current is the normal case, and pointing at the good one without ruling out the bad one leaves the agent to pick by frequency — which, in a codebase with more legacy than current code, picks wrong.

**"helpful to whoever's debugging"** → instances, varied.

```text
<examples>
  400: {"error": "invalid_date_range", "message": "start_date (2026-03-01)
       is after end_date (2026-02-01)", "field": "start_date"}

  404: {"error": "order_not_found", "message": "No order with id ord_8812.
       It may have been deleted, or belong to another workspace."}

  500: {"error": "internal", "message": "Something went wrong on our end.
       Reference: req_ff31a90 — include this if you contact support."}
</examples>
```

Look at what varies. Three status codes; one includes a `field` and two do not; one names two possible causes and the others name none; the 500 deliberately reveals nothing about internals. What is constant across all three is the only thing meant as a rule: a machine-readable `error` code, a human sentence, and the specific values echoed back where they exist. Had all three been 400s with a `field`, the brief would have quietly required a `field` on every error, including the ones that have no field.

**"clean"** → this one gets deleted.

That is the third option, and it is underused. When you try to substitute an example for an adjective and cannot produce one, the usual reason is that the adjective was not carrying a requirement — it was carrying a wish to sound thorough. "Clean" here adds nothing the reference pattern and the three examples do not already supply. A brief with fewer, load-bearing lines gets read more carefully than one padded with agreeable ones.

## Your turn: substitute, and count what varies

Two brief lines. Replace each with a reference pattern or examples, then check your examples for an accidental shared property.

```text
Line A: "Add a confirmation dialog before deletion. Keep the wording friendly
         but serious — it's a destructive action."

Substitution: ____________________________________________________________

Line B: "The migration script should log its progress in the usual way."

Substitution: ____________________________________________________________

For A, what do all my examples share besides the property I meant?
_________________________________________________________________________
```

Reference answer:

```text
Line A — examples, since there's no existing dialog to point at:

  <examples>
    Delete 3 selected invoices? This can't be undone.
      [Cancel]  [Delete 3 invoices]

    Remove Dana Chen from this workspace? They'll lose access immediately.
      Their comments and files stay. [Cancel] [Remove Dana]

    Delete the entire "Q3 Planning" project, including 47 tasks and all
    attachments? Type the project name to confirm.
      [Cancel]  [Delete project]
  </examples>

Line B — a reference pattern, because "the usual way" means an existing thing:

  Log progress the way scripts/backfill-users.ts does — same logger, same
  interval, same shape of line. If you're unsure whether that's the current
  convention, ask me before choosing a different one.

What my three A examples share besides friendly-but-serious:
  - Every one names the exact count or the exact name, never "these items"
  - Every one states what happens after, in one clause
  - The confirm button repeats the verb and object; none says "OK" or "Yes"
  - Severity scales with the action: the third demands typed confirmation

The first three are the rule I meant. The fourth I did not intend to require —
and it is the one worth keeping, because I do want it and would not have
thought to write it down.
```

That last note is the reward for checking. Auditing your examples for accidental shared properties turns up two kinds of thing: requirements you did not mean, which you fix by varying them, and requirements you did mean but had never articulated, which you keep. The second kind is why this exercise is worth doing on your own briefs even when the examples are working.

Line B's final sentence is worth one more look. "If you're unsure whether that's the current convention, ask me before choosing a different one" is Lesson 2's move, applied to a reference pattern. Pointing at a file assumes the file is a good example; that sentence handles the case where you are wrong about your own codebase.

<!-- exercises -->
## 💻 Exercises (point these at your own real environment)

### Level 1 (warm-up)

Go through the brief you have built across Lessons 1 to 3 and mark every evaluative adjective — every word describing a quality rather than naming a thing or a number. For each, do one of three things: point at a reference pattern in your own project, write three varied examples, or delete it.

How: read the brief aloud; adjectives are easier to hear than to see. For each one, first search your project for something you would call a good instance — pointing is cheaper than writing. If nothing exists, write three examples and vary everything except the property you mean.

<!-- rubric -->
- Every evaluative adjective in the brief is now a reference pattern, a set of examples, or deleted.
- At least one is deleted rather than replaced, and you can say what it was doing there.
- Any reference pattern names a real file path you have opened and confirmed is current.
- Any example set has at least three members that differ in something other than the property you mean.
- You checked one example set for an accidental shared property, and name what you found.
<!-- answer -->
A passing pass on a brief for "improve the settings page" turns "make the layout cleaner" into "match the two-column layout in app/settings/billing/page.tsx"; turns "error messages should be more useful" into three varied error strings; and deletes "the code should be well-organized" outright, on the grounds that it was standing in for nothing checkable and the reference pattern already carries the file's organization. The accidental-property check on those three error strings found that all three began with a verb, which was not intended — and one was rewritten to start with the field name to break the pattern. A failing pass replaces "cleaner" with "well-structured and modern," which is a substitution of adjectives for adjectives and transfers no more than the original.
<!-- hint -->
Adjectives to hunt for first: clean, consistent, proper, appropriate, robust, simple, modern, intuitive, reasonable, sensible.
<!-- hint -->
Before writing examples, spend two minutes searching your project. A file path you can name is worth more than examples you have to invent, and it takes a tenth of the time.

### Level 2 (advanced)

Run the same task twice with the same acceptance criteria — once with your adjectives, once with the substitutions — and compare which criteria came back satisfied. Then find one requirement the examples conveyed that you never stated in words.

How: fresh session for each. Keep the criteria and the request text identical between runs, so the substitution is the only variable. Grade both against the criteria as in Lesson 3, from the evidence, before reading either summary.

<!-- rubric -->
- Both runs used identical criteria and differed only in adjectives versus examples.
- You can name at least one concrete difference in the outputs, described as a decision rather than as a code difference.
- You identify at least one property the example version got right that no line of your brief stated.
- You note honestly whether the substitution changed anything on this task — including if it did not.
<!-- answer -->
The interesting find is usually the unstated property. Example, for a form-validation task: the adjective run produced messages like "Invalid input" and "This field is required"; the example run produced messages naming the field and the specific problem, which was the stated intent — but it also put every message below its input rather than in a summary at the top, which no line of the brief mentioned. The three examples had all been written as single strings attached to fields, and that placement travelled with them. Worth noting that this cuts both ways: the same mechanism that transferred a layout convention I wanted could have transferred one I did not, which is the accidental-property risk seen from the other side. If the two runs come back equivalent, that is a real result and worth recording — the adjectives in that brief were doing less work than they appeared to, most likely because the reference pattern in your project was already unambiguous. A common mistake is changing the criteria between runs to "improve" them, which makes the comparison meaningless.
<!-- hint -->
Compare the outputs on an input none of your examples covered. That is where a transferred rule shows itself, since neither run could be copying.
<!-- hint -->
If you cannot find an unstated property that transferred, your examples may be too similar to each other — three near-identical examples transfer roughly what one does.
<!-- /exercises -->

## The half of the brief that says no

Your brief now states what to build, what done means, and what good looks like. Everything in it so far is positive: things that must become true.

What it does not yet do is bound the work. A brief made entirely of positive statements is silent about everything it does not mention, and silence is the condition under which an agent's own judgment about what the task *should* include takes over — adding the fallback nobody asked for, tidying the surrounding code, extending the fix to two files you never named. Lesson 5 is about the small number of prohibitions worth writing, how to word them so they hold, and it ends with the run this course has been building toward.
