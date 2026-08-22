# Lesson 4: Commands in place of adjectives

> Lesson objectives:
> - Explain why an evaluative adjective gives an agent nothing to act on, in terms of what the model has to supply itself.
> - Rewrite an adjective as a line carrying a trigger, an object, and an observable result.
> - Decide when a rule needs its reason attached and when the reason is padding.
> - Apply the interface test — would a competent newcomer need to guess? — to each line of your own file.
>
> Prerequisites: Lesson 3 — you have rules placed in a directory layout | Previous [<< 03](./03-nearest-file-wins.md) | Next [05 >>](./05-conflicting-instructions.md)

## Everyone agreed with the line, and nothing changed

`Write clean, maintainable code.` It has been in the file for a year. Nobody has ever objected to it, because objecting sounds like arguing for dirty code. It has also never changed a single run.

Compare it with `Run npm run lint --fix before committing.` One of these can be complied with. The other requires the reader to decide what clean means here, and whatever they decide, you cannot tell afterwards whether they complied.

This is not a writing-style preference. It is the difference between a line that transfers information and a line that transfers a mood — and once you can see it, most instruction files turn out to be half mood. This lesson is the conversion procedure, applied to the rules you placed in Lesson 3.

## Explanation

### What an adjective asks the reader to supply

When you write `keep changes scoped`, you have named a property of a good outcome. You have not said what to do. The reader — human or model — has to supply the missing operation from somewhere, and the somewhere is their prior about what people usually mean.

That prior is generic by construction. It is not about your repository, so it fills the gap with the most common interpretation across everything it has seen, which is exactly the guess you wrote the file to prevent. The AAIF post states the contrast in one line: "'Follow best practices' gives an agent nothing to act on. 'Run npm run lint after any source change' and 'do not edit files in dist/' give it commands, paths, and boundaries."[^S2]

Claude Code's docs make the same point as a rewriting rule with three worked pairs:[^S5]

| Instead of | Write |
|---|---|
| "Format code properly" | "Use 2-space indentation" |
| "Test your changes" | "Run `npm test` before committing" |
| "Keep files organized" | "API handlers live in `src/api/handlers/`" |

Look at what changes across each pair. The left column names a *quality*; the right names an *action, a value, or a location*. And the right column has a property the left lacks: someone else can check it. That is the operational definition to hold for the rest of this lesson — **an instruction is actionable when a second person can tell, from the repository, whether it was followed.**

### The three parts of a usable line

A line an agent can act on carries three things. This decomposition is mine, synthesised from the vendor examples above rather than quoted from any of them, and it exists because it makes the rewrite mechanical rather than a matter of taste.

**Trigger** — when does this apply? "Before committing", "after editing anything in `schema/`", "when adding a component". Without a trigger, a rule is either always active (and mostly noise) or never fires at the moment it was needed.

**Object** — what exactly, named the way it appears in the repository? A path, a command, a filename, a function. `lib/pci.ts` and `npm run codegen` are objects. "The payment code" is not.

**Observable result** — how would anyone know it happened? A passing command, a file that exists, a diff that does not touch a directory. This is what makes the rule checkable, and it is the part most often missing.

Run the earlier example through it: `Run npm run lint --fix before committing` has trigger (before committing), object (`npm run lint --fix`), and result (the command exits clean). `Write clean, maintainable code` has none of the three, which is why it has never changed a run.

Not every line needs all three explicitly — `Use npm, not pnpm` has an implied trigger of "whenever you install anything" and that is fine. But a line missing *two* of the three is almost always an adjective in disguise.

### The interface test

There is a more general framing worth having, because it tells you how much effort a line deserves.

Anthropic's patterns essay argues that instructions written for a model deserve the same design attention as an interface written for a person: "One rule of thumb is to think about how much effort goes into human-computer interfaces (HCI), and plan to invest just as much effort in creating good agent-computer interfaces (ACI)."[^S8] The test it offers is a question you ask of your own writing: "Put yourself in the model's shoes. Is it obvious how to use this tool, based on the description and parameters, or would you need to think carefully about it? If so, then it's probably also true for the model."[^S8]

That essay is about tool definitions, not instruction files, and I am applying it by analogy — but the analogy is tight, because both are text a model reads before acting and both fail the same way when they leave a decision implicit. The essay's own summary of what good looks like transfers directly: a good definition "includes example usage, edge cases, input format requirements, and clear boundaries from other tools... Think of this as writing a great docstring for a junior developer on your team."[^S8]

One more idea from that essay is worth stealing, because it outranks writing well. The essay describes fixing a recurring mistake by changing the interface so the mistake becomes impossible: agents kept using relative paths incorrectly, so "we changed the tool to always require absolute filepaths—and we found that the model used this method flawlessly."[^S8] The instruction-file equivalent: before writing a line telling agents not to edit generated files, ask whether the build could just fail when they do. **A rule you can delete because the repository now enforces it beats the best-written version of that rule** — which is the same guidance/enforcement boundary from Lesson 1, arriving from the other direction.

### When the reason earns its length

Adding *why* costs lines, and Lesson 2 established that lines are a budget. So the reason is not free and should not be automatic.

The distinction that decides it: **attach the reason when the rule looks like a bug.**

`Use npm, not pnpm` needs no reason. Nobody reads it, thinks it is an oversight, and switches package managers to be helpful.

`Session refresh is intentionally outside middleware` needs its reason, because the arrangement looks like an inconsistency somebody forgot to fix. An agent told only "do not move it" and then finding what looks like a clean refactor has a stated rule on one side and its own reasoning on the other. Add `(the edge runtime cannot reach the database)` and the reasoning now points the same way as the rule.

The same logic covers `Do not add to web/legacy/` — without `it is being deleted`, an agent that finds a `legacy/` directory full of components has excellent evidence that components go there.

A useful check: read the rule and ask what a smart, well-meaning contributor would conclude if they *disagreed* with it. If the answer is "nothing, they would just comply," skip the reason. If it is "they would think this was a mistake and improve it," the reason is load-bearing.

### The failure this catches

There is one more category worth naming, because it survives review the most easily: the line that is actionable in form but not in this repository.

`Follow the repository pattern` names an architecture, so it feels concrete. But it does not say which directory holds the repositories, what a compliant one looks like here, or what to do when a query does not fit. Cursor's docs cover this case in their best-practice list: "Provide concrete examples or referenced files" and "Reference files instead of copying their contents."[^S10] The fix is usually a pointer rather than an explanation: `Data access goes through a repository class — see src/data/UserRepository.ts for the shape.` One example file carries more than three sentences of description, and it stays current because it is code someone maintains.

```agentmentor-fix
{
  "id": "agent-readable-repo-adjectives-rewrite-the-migration-rule",
  "label": "Rewrite the migration rule",
  "prompt": "This line sits in a real AGENTS.md and has not prevented a single bad migration. Rewrite it so it carries a trigger, a named object, and an observable result — and keep the reason only if the rule looks like a bug without it.",
  "whyHere": "Migration rules are where adjective-shaped instructions survive longest, because 'careful' sounds like exactly the right word for something risky. The rewrite forces the judgment that a word describing an attitude cannot be complied with.",
  "bug": "Every word in the line describes how the author feels about migrations rather than what a reader should do. Nothing in it names a command, a path, or a state you could inspect afterwards to see whether it was followed.",
  "language": "text",
  "starter": "## Database\n\n- Be careful with database migrations. They are risky and should be handled properly.\n- Make sure migrations are safe and well tested before they go out.\n",
  "checks": [
    {
      "id": "names-a-command",
      "type": "regex",
      "pattern": "`[^`]*(?:run|migrate|npm|yarn|pnpm|make|npx)[^`]*`",
      "message": "A usable migration rule names the actual command in backticks — something like `npm run migrate:check`. Naming the command is what turns 'well tested' from a quality into a step someone can perform and someone else can confirm."
    },
    {
      "id": "has-a-trigger",
      "type": "regex",
      "pattern": "[Bb]efore |[Aa]fter |[Ww]hen |[Ww]henever |[Aa]ny time ",
      "message": "Without a trigger word, a rule has no moment attached to it, so it competes for attention on every turn and fires on none of them. State when it applies: before committing, after editing the schema, when adding a column."
    },
    {
      "id": "no-attitude-words",
      "type": "notIncludes",
      "value": "careful",
      "message": "'Careful' asks the reader to supply the operation from their own priors, which is the generic guess the file exists to prevent. Replace it with the specific thing carefulness would have produced here."
    }
  ],
  "copyPurpose": "Have the agent judge whether my rewritten migration rule is actually checkable by someone else, or whether I swapped one adjective for a more technical-sounding one."
}
```

## Worked example: six lines, converted

Real lines from real files, each with the diagnosis and the rewrite.

**1. `Write secure code.`**
Diagnosis: pure adjective; no trigger, object, or result. Also unfalsifiable — nobody has ever written code they believed was insecure.
→ `Never build SQL by string concatenation. Use the query builder in lib/db.ts; see getUserOrders() for the pattern.`
The example reference does the work three sentences of explanation would have done badly.[^S10]

**2. `Keep the bundle small.`**
Diagnosis: names a quality, no threshold, no trigger. "Small" relative to what?
→ `Before adding a runtime dependency to web/, run npm run analyze and check the delta. Anything over 10 KB gzipped needs a note in the PR.`
Now there is a number, a command, and a moment. Note it does not prohibit — it makes the cost visible, which is what you actually wanted.

**3. `Don't break existing functionality.`**
Diagnosis: restates the goal of all software work. Also unactionable — nobody breaks things on purpose.
→ Delete it, and replace it with what would actually have caught the breakage: `Run npm test before committing. If a test you did not touch fails, stop and report it rather than adjusting the test.`
The second sentence is the load-bearing one and would never have appeared in the original.

**4. `Follow our TypeScript conventions.`**
Diagnosis: points at conventions without naming them or where they live.
→ `Strict mode is on; do not add // @ts-ignore. If a type is genuinely unknown, use unknown and narrow it.`
Everything the linter already enforces stays out — that is Lesson 2's deletion rule and Cursor's explicit advice against copying style guides.[^S10] What survives is the one convention with a judgment call in it.

**5. `The payments service is important, be extra careful there.`**
Diagnosis: an attitude with a location attached. "Extra careful" has no operation.
→ Two lines, in `services/payments/AGENTS.md` by Lesson 3's placement rule:
`Never log the full card object — use maskCard() from lib/pci.ts.`
`Run make test-payments, not npm test. The root suite does not cover this service.`
The vague warning became two checkable rules, and they moved to where they are true.

**6. `Try to keep changes minimal and focused.`**
Diagnosis: adjective-shaped, and the most interesting case because the underlying instruction is real and measurable.
→ `Change only what the task requires. Do not add error handling, tests, or refactors that were not asked for — raise them instead.`
This one has evidence behind it. In the AAIF benchmark, the twelve-line file's single scoping instruction "produced diffs 26% smaller, because the file's single instruction to keep changes scoped removed defensive code nobody asked for."[^S2] That is one median from five runs on one repository with one agent, and the author says so — but it is the clearest published case of a single concrete line changing what an agent did.

## Your turn: convert your own file

Take the rules you placed in Lesson 3. For each, work through:

- The line as it stands: ________
- Trigger present? ________ Object present? ________ Observable result? ________
- If two or more are missing, the rewrite: ________
- Does the rule look like a bug without its reason? ________
- Is there an example file in the repo that would carry this better than prose? ________
- Could the repository enforce this instead, making the line deletable? ________

<details>
<summary>Answer: the three rewrites that go wrong</summary>

**Rewriting into a longer adjective.** `Write clean code` becomes `Write clean, well-structured, maintainable code following SOLID principles.` Four adjectives now instead of two, and the line is still unfalsifiable. The test is not whether it sounds more technical; it is whether a second person could check compliance from the repository.

**Adding a trigger to something with no object.** `Before committing, make sure the code is good.` The trigger is real and there is still nothing to do. All three parts have to land, and the object is the one people skip because naming it requires knowing your own repository precisely.

**Converting a rule that should have been deleted.** Some adjectives are covering for the absence of a mechanism. `Be careful not to commit secrets` rewrites into a command — `Run git secrets --scan before committing` — but the better move is a pre-commit hook that makes the commit fail. That is the poka-yoke idea from the patterns essay applied to your repo:[^S8] the best line is the one you get to delete because the repository now enforces it.

If a rule resists rewriting, that is usually diagnostic rather than a writing problem. Either the rule is a portable norm rather than a repo fact — Lesson 1's test — or it is a value statement, and value statements belong in the contributing guide where humans read them, not in a file loaded into a model's context every session.
</details>

<!-- exercises -->
## 💻 Exercises (point these at your own real environment)

### Level 1 (warm-up)
Grep your own instruction file for the adjective pattern. From the repository root run `grep -n -iE 'clean|proper|good|best practice|appropriate|careful|maintainable|readable|robust' AGENTS.md` (substitute your filename) — in your terminal; success is a numbered list of lines, and no output means your file is already free of the most common offenders. For each hit, decide: rewrite, delete, or keep-with-justification.

<!-- rubric -->
- The grep ran at the repository root and its output is recorded, including an empty result.
- Every hit has a verdict, and no line is left undecided.
- Every rewrite names at least a trigger and an object, and states its observable result.
- At least one line is deleted rather than rewritten, with the reason it did not deserve a rewrite.

<!-- answer -->
The word list is not exhaustive and is not meant to be — it catches the common cases and misses domain-specific vagueness like "idiomatic", "sensible defaults", or "follow the existing pattern". Treat the grep as a starting sample, then read the file for the same shape.

The requirement to delete at least one is deliberate. Rewriting is the more satisfying move and it is not always the right one: a line saying "write good documentation" in a repository where documentation has never once been the problem should go, not get a trigger bolted onto it. Rewriting every hit is how a file stays long while feeling improved.

Watch for the hit that turns out to be fine on inspection. `Run npm run lint --fix before committing — it handles formatting` contains no adjective doing any work; "handles formatting" is a description of what the command does. Context matters more than the word list.

<!-- hint -->
If your `grep` does not support `-E`, use `egrep` or `grep -n -i` with one word at a time. The pattern is the point, not the tool.

<!-- hint -->
For each hit, try to state the compliance check in one sentence: "you would know this was followed because ______." If the sentence will not finish, the line is not actionable yet.

<!-- hint -->
The keep-with-justification verdict is legitimate but rare. If you are using it more than once, you are probably defending lines rather than testing them.

### Level 2 (advanced)
Take the three rules in your file whose violation would be most expensive, and write each one twice: once as it stands, once fully converted. Then hand both versions to someone else on your team — or to an agent in a fresh session with no other context — and ask them to state what they would do differently under each. Record the answers verbatim.

<!-- rubric -->
- Three rules chosen by cost of violation, with the cost stated in concrete terms.
- Both versions written out in full, differing only in wording, not in what they require.
- A second reader's response to each version recorded verbatim, not summarised.
- One rule identified where the reader's answers to both versions were the same, and an explanation of why the rewrite added nothing.
- One line noted where the reader misread the converted version, and how you would fix the wording.

<!-- answer -->
The verbatim requirement is what makes this exercise informative rather than confirmatory. Summarising your reader's answer lets you hear what you meant instead of what they said, and the gap between those two is precisely what the exercise measures.

**The most common mistake here is testing the two versions with a reader who already knows the answer** — a teammate who wrote the original rule, or an agent session that has already seen your repository. Both will perform correctly on the vague version, because they are supplying the missing context from memory rather than from the line. Use someone or something without that context; that is the condition every fresh session runs under.

Expect one of the three rewrites to add nothing. Rules that were already concrete — a package manager, a command name — do not improve when you decorate them, and finding one is useful calibration: it tells you the conversion is a fix for a specific defect rather than a general improvement to apply everywhere.

The misreading case is the most valuable result, and it usually comes from an ambiguous object rather than a missing one. `Run the tests in the payments directory` can mean the tests located there or the tests covering it — different commands, and the reader picks one silently. Naming the command removes the ambiguity that naming the directory created.

<!-- hint -->
"Most expensive to violate" is measured in cleanup: a corrupted lockfile everyone has to fix, a leaked value that needs rotating, a generated file edited by hand and lost on the next build.

<!-- hint -->
When testing with a fresh agent session, paste only the single rule and ask what it would do differently. Adding repository context defeats the test.

<!-- hint -->
If a reader asks a clarifying question about your converted version, that question names the part still missing. Write the answer into the line.
<!-- /exercises -->

## Lines that can be checked, and the ones that fight each other

What you can now do:

- Explain why an adjective transfers no information: the reader supplies the operation from a generic prior, which is the guess the file was written to prevent.
- Decompose a rule into trigger, object, and observable result, and treat two missing parts as a rewrite signal.
- Judge whether a rule needs its reason by asking whether it looks like a bug without one.
- Prefer an example file to a description, and repository enforcement to any line at all.

Concrete rules have a property vague ones do not: they can flatly contradict each other. `Run npm test` and `Run make test-payments, not npm test` are both precise, and in a nested layout both are in context at once. Lesson 3 said the nearer one is expected to win. Lesson 5 is about how much weight "expected" carries, and what to do about the contradictions already sitting in your file.
