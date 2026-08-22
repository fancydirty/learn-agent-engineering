# Lesson 6: Evidence that behaviour changed

> Lesson objectives:
> - Confirm which instruction files a tool actually loaded, before drawing any conclusion from a run.
> - Explain why a single before/after comparison can point the wrong way and still look convincing.
> - Design a comparison that separates a real behaviour change from run-to-run variation, using signals you can already observe.
> - Write and commit an instruction file for one real repository, and report what your evidence does and does not show.
>
> Prerequisites: Lessons 1–5 — you have a scoped, placed, concrete, non-contradicting rule set | Previous [<< 05](./05-conflicting-instructions.md) | Next [Course contents >>](./README.md)

## The file is written, and you still do not know if it works

Five lessons of design produce a file you can defend on every dimension: nothing discoverable, nothing portable, every line concrete, placed where it is true, no contradictions.

None of that is evidence. The file changes behaviour or it does not, and there are three ways it might not: the tool never loaded it, the rule that mattered was something the agent would have done anyway, or the thing you noticed afterwards was noise you would have seen either way.

This lesson closes those three in order, because they need different checks and the order is not optional — measuring a file the tool never read produces a clean number about nothing. At the end you commit a file to a real repository and write down what your evidence supports.

## Explanation

### First: confirm the file was loaded

Cheapest check, most common failure. Before anything else, make the tool tell you what it read.

Every major tool exposes this, as of 2026-08-23. Codex's documentation gives the command and the expected output: run `codex --ask-for-approval never "Summarize the current instructions."` from a repository root, and "Codex should echo guidance from global and project files in precedence order"; from a subdirectory, `codex --cd services/payments --ask-for-approval never "List the instruction sources you loaded."` should report "the global file first, the repository root AGENTS.md second, and the payments override last."[^S3] Amp has `agents-md list` in its command palette, which shows "the agent files that Amp is using."[^S4] Claude Code's instruction is to "run `/context` in a session and check the list under **Memory files**."[^S5]

Run whichever applies, from the directory where the work happens. Four failures show up here regularly, and each has a specific cause from an earlier lesson:

- **Nothing listed.** The filename is wrong for this tool — Claude Code reads `CLAUDE.md`, not `AGENTS.md`,[^S5] and needs an import or symlink to bridge.
- **The root file listed, the nested one missing.** You launched above the nested directory, or the tool has not yet read a file in that subtree — subtree files load on demand.[^S4][^S5]
- **The nested file listed, the root one missing.** Under Codex, a chain over `project_doc_max_bytes` (32 KiB by default) stops adding files.[^S3] Lesson 2's length problem, arriving as silent truncation.
- **A file you did not write.** Somebody's personal global file, which Lesson 5 covered — and which you can now see rather than infer.

Do this before every comparison. An unloaded file explains a null result completely, and no amount of careful measurement recovers from skipping it.

### Second: why one run tells you nothing

Now the harder problem, and the reason this lesson exists rather than ending at "try it and see."

The AAIF benchmark ran exactly the comparison you are about to run — two identical clones of a real repository, one with a twelve-line AGENTS.md, same agent, same prompt, same starting commit.[^S2] Its most useful finding is about the author's first attempt:

> "My first attempt to measure this, one run per condition, told me the wrong thing. On the harder task, the AGENTS.md run looked 44% slower and 41% more expensive for identical output. Clean numbers. Wrong conclusion. Agent wall-clock time and token counts are noisy enough per run that a single comparison can point the wrong direction and still look convincing."[^S2]

Sit with that. One run per condition produced a clean, specific, confidently-wrong result *against* the file. Five runs per condition reversed it: on the ambiguous task the file "cut wall time 27%, credits 24%, and produced diffs 26% smaller"; on the multi-file task the median win was "9 to 10%."[^S2]

Two things to take from this, and only one of them is the numbers.

**The numbers are one repository, one agent, two tasks.** The author states the limit plainly: "My results are one data point, gathered on one repo with one agent."[^S2] The publisher is AAIF, which stewards the format — the steward's own evidence for its value, which is worth noting even though the method is sound and the negative first result is reported rather than buried. Do not carry "expect 27%" to your repository.

**The method is the transferable part.** Repeat each condition, take the median, and treat any single run as uninformative. That is what you can copy exactly.

### Third: what to measure when you cannot measure much

You probably do not have per-run token accounting. Three signal classes remain, and the third is the one the benchmark found most useful.

**Direct observation of the specific mistake.** The narrowest and strongest. You wrote the rule because something went wrong repeatedly — wrong package manager, edited generated file, wrong test command. Does it still happen? A binary outcome across a handful of runs beats a percentage, because it is the thing you actually care about.

**Diff shape.** Files touched, lines changed, whether the diff includes work nobody asked for. This is observable from `git diff --stat` with no instrumentation, and it is where the benchmark's clearest effect appeared: diffs 26% smaller on the ambiguous task, "because the file's single instruction to keep changes scoped removed defensive code nobody asked for."[^S2]

**Tail behaviour, not the average.** The benchmark's own summary of where the value was: on the multi-file task the median win was small, "but the more useful finding was in the tail: two of five runs without AGENTS.md wasted time re-orienting in the repo or running an unrequested production build at the end. Every run with AGENTS.md skipped both."[^S2]

That is the shape to look for in your own runs, and tail behaviour is the right name for it. An instruction file rarely makes a good run better. It removes bad runs — the one where the agent spent four minutes working out which test command to use, the one that ran a production build for no reason. The author's closing advice says it directly: "Don't optimize for the average case. Optimize for the runs where an agent would otherwise wander, reorient, or touch something it shouldn't."[^S2]

Which is also why averaging three runs into one number is the wrong summary. **Count the bad runs.** Two-of-five versus zero-of-five is a result; a 6% mean difference across the same runs is not.

### Designing your own comparison

The design below is mine, scaled down from the benchmark's method to what a working developer can afford on a Tuesday. It trades statistical strength for feasibility, and it is honest about which.

**Pick one task that stresses the rule.** Not a task you care about the result of, and not a trivial one. It should be genuinely ambiguous in the way your rules resolve — if the rule names a test command, the task must require testing. The benchmark used exactly this shape: one ambiguous task, one multi-file task.[^S2]

**Hold everything else fixed.** Same starting commit, same prompt word for word, same tool, same model. Start each run in a fresh session so nothing carries over.

**Run three per condition, alternating.** Three is below the benchmark's five and above the one that misleads. Alternating runs — A/B/A/B rather than all the "without" runs first — matter because a model update or a slow afternoon would otherwise land entirely on one condition and read as the effect.

**Record per run, before looking at the comparison:** whether the specific mistake occurred (yes/no), `git diff --stat` output, and one line on anything unrequested — a re-orientation phase, an extra build, a refactor nobody asked for.

**Read it by counting, not averaging.** Out of three runs each: how many made the mistake? How many did something unrequested? The comparison is between counts, and if the counts are equal, your honest conclusion is that this design did not detect a difference — which is different from "the file does nothing."

**On removing the file for the "without" runs:** work on a branch or a scratch clone, and rename rather than delete. `git stash` and a temporary rename are both fine. Never run the comparison by deleting a committed file on a shared branch — a teammate pulling mid-experiment gets your "without" condition without knowing it.

### What this design cannot show

Say this part out loud in your write-up, because the temptation after three runs is to over-claim.

**Three runs per condition is a small sample**, below what the benchmark used, on a task set of one. A clean result is suggestive, not established.

**One tool.** Lesson 3's divergences mean a result under one tool does not transfer to another; a file loaded by Codex may not be loaded at all by a teammate's tool.

**One task.** The benchmark's two tasks produced very different effect sizes — 27% versus 9-10%[^S2] — from the same file on the same repository. Yours is one point on that spread.

**Attribution across a whole file.** If your file has eight rules and behaviour improved, you know the file helped. You do not know which rule did, and one of the eight may be doing nothing.

None of this makes the exercise pointless. It makes the claim you are entitled to a modest one: *on this repository, with this tool, on this task, the file removed a specific failure across three runs.* That is a real finding, it is more than almost anyone has, and it is the honest size of it.

```agentmentor-predict
{
  "id": "agent-readable-repo-evidence-single-run-reading",
  "label": "Read a single-run result",
  "prompt": "You run the task once without your new AGENTS.md: 3m40s, and the diff touches 4 files. Once with it: 5m17s, and the diff touches the same 4 files with near-identical content. The file is 12 lines and was confirmed loaded. In one short sentence, what does this comparison establish about whether the file changed behaviour?",
  "whyHere": "This is the exact numeric shape that misled the benchmark author on his first attempt, and the pull toward 'the file made it slower' is strong precisely because the numbers are clean and the output is identical.",
  "language": "text",
  "snippet": "without AGENTS.md:  3m40s   4 files changed, 61 insertions(+), 12 deletions(-)\nwith AGENTS.md:     5m17s   4 files changed, 58 insertions(+), 12 deletions(-)\n\nfile confirmed loaded via the tool's instruction-listing command\nruns: 1 per condition",
  "match": "contains",
  "expected": "nothing",
  "feedbackCorrect": "Right — nothing, because a single run per condition cannot separate an effect from run-to-run variation. The benchmark author hit this exact shape: one run per condition made the AGENTS.md run look '44% slower and 41% more expensive for identical output', which he describes as 'Clean numbers. Wrong conclusion.' Repeating each condition and taking the median reversed the direction entirely.",
  "feedbackWrong": "The pull here is to read 5m17s versus 3m40s as a cost the file imposed. But agent wall-clock time varies enough between runs on an identical task that one comparison can point either way and still look convincing — this is the shape that produced a confidently wrong conclusion in the published five-run benchmark, where repeating the runs flipped the result. With one run per condition, the honest answer is that the comparison establishes nothing, and the fix is more runs, not a better reading of these two.",
  "copyPurpose": "Have the agent check whether I am about to draw a conclusion from a comparison too small to support it, using the actual run data from my own repository."
}
```

## Worked example: one rule, tested in twenty minutes

A repository where agents keep editing `src/generated/`. The rule, written in Lesson 4's shape:

```markdown
Files in `src/generated/` are produced by `npm run codegen`.
Edit the `.proto` sources in `schema/` and regenerate — do not edit generated files directly.
```

**Step 0 — confirm the load.** `codex --ask-for-approval never "List the instruction sources you loaded."` from the repo root. It lists the root `AGENTS.md`. Without this step, everything below measures nothing.[^S3]

**Step 1 — pick the task.** "The `OrderStatus` enum is missing a `REFUNDED` value. Add it." Chosen because the enum lives in a generated file, so the ambiguity the rule resolves is exactly the ambiguity the task presents.

**Step 2 — fix the variables.** Same commit, same prompt text, fresh session each time, file renamed to `AGENTS.md.off` for the "without" runs on a scratch branch.

**Step 3 — six runs, alternating.**

| Run | Condition | Edited generated file? | Diff | Unrequested work |
|---|---|---|---|---|
| 1 | without | yes | 1 file, 3 lines | — |
| 2 | with | no | 2 files, 5 lines | — |
| 3 | without | no | 2 files, 5 lines | added a comment block to the proto |
| 4 | with | no | 2 files, 5 lines | — |
| 5 | without | yes | 1 file, 3 lines | — |
| 6 | with | no | 2 files, 6 lines | — |

**Step 4 — read by counting.** Without: 2 of 3 edited the generated file. With: 0 of 3. Run 3 shows the "without" condition can get it right — which is the point of repeating, and why one run either way proves nothing.

Note the diffs. The correct runs touch *more* files and change *more* lines, because regenerating is more work than editing one enum. A metric of "smaller diffs are better" would have scored this backwards. The measurement that matters is the specific mistake, not a proxy for tidiness.

**Step 5 — write down the claim, at its real size.**

> On this repository, with Codex, on the enum task, the generated-files rule prevented a specific failure in 3 of 3 runs where it occurred in 2 of 3 without it. n=3 per condition, one task, one tool. It does not establish an effect on speed or cost, and I did not measure them. Two teammates use different tools; unverified there.

Twenty minutes, six runs, one defensible sentence. That is the achievable standard.

## Your turn: run the comparison on your own rule

Pick the single rule in your file whose violation costs the most. Then:

- The rule, quoted: ________
- The tool command that lists loaded instruction files, and its output: ________
- The task that stresses this rule: ________
- The specific mistake, stated as a yes/no observation: ________
- Runs without (count of mistakes, out of 3): ________
- Runs with (count of mistakes, out of 3): ________
- Anything unrequested, per condition: ________
- The claim you are entitled to, in one sentence with its limits: ________

<details>
<summary>Answer: three results, and how to read each</summary>

**A clean split (2-3 mistakes without, 0 with).** The strongest outcome available at this sample size. Write the claim with its limits and move on — do not expand it into a general statement about instruction files.

**No difference (0 without, 0 with).** The most common surprise, and it has three distinct causes worth separating. The mistake may be rarer than your memory suggests — three runs cannot detect something that happens one time in ten. The task may not stress the rule. Or the rule may be genuinely redundant: the agent would do this anyway, which means the line fails Lesson 1's discoverability test and should be deleted. Do not assume the third; check the first two by making the task more ambiguous and running again.

**Mixed (1 without, 1 with).** Underpowered. This is the honest reading — it is not weak evidence for the file, it is no evidence either way. Either run more or accept that this design did not settle it, and say so.

**The trap that ruins the whole exercise: changing the prompt between conditions.** It happens by accident, because the "without" runs go badly and you clarify. The moment the prompts differ, you are comparing prompts. Paste from the same file every time.

**The second trap: reading time as the primary signal.** It is the noisiest thing you can measure — the variable that produced the benchmark author's wrong conclusion.[^S2] Use it as a secondary note, never as the finding.
</details>

<!-- exercises -->
## 💻 Exercises (point these at your own real environment)

### Level 1 (warm-up)
Confirm the load, for every tool your team uses on this repository. In your terminal, run each tool's instruction-listing command from the repository root, then again from your busiest subdirectory. Record which files each tool reports at each location. Success looks like a list of file paths; an empty list is a finding, not a failure.

<!-- rubric -->
- Every agent tool used on this repository is covered, not only your own.
- Both locations are tested for each tool, root and subdirectory, with output recorded separately.
- Any tool reporting no files, or missing your nested file, is noted with the likely cause from Lesson 3's divergences.
- One sentence stating whether every teammate's tool sees the rules you wrote.

<!-- answer -->
Testing from two locations is what makes this exercise worth doing. A tool that lists your root file from the root proves only that the root file exists. The nested file is the one whose loading depends on where work starts and on whether a file in that subtree has been read yet[^S4][^S5] — so it is the one most likely to be silently absent.

The cross-tool sweep is the part people skip because they only run their own tool. This course exists for repositories with several people and several tools; a file that works for you and is invisible to two teammates has not solved the problem it was written for. The usual finding is a filename bridge missing at the nested level — a root symlink or import was set up and the subtree files were never bridged, which Amp's migration note calls out explicitly.[^S4]

<!-- hint -->
If you do not know your tool's command, ask it: "which instruction or memory files are you currently loading, and from what paths?" Most will answer accurately about their own configuration.

<!-- hint -->
Run the subdirectory test by actually starting the tool there, not by opening a file from the root. Launch location is what changes the chain under some tools.

<!-- hint -->
Record the order the files come back in, not just the set. Order is what determines which rule dominates, per Lesson 3.

### Level 2 (advanced) — the terminal task
Write, test, and commit an instruction file for one real repository. This is the course's end state: a file in a repository you own, plus evidence that it changed something.

Do all of it: assemble the file from Lessons 1–5 (scoped, placed, concrete, audited for conflicts), confirm every team tool loads it, run the three-per-condition comparison on your highest-cost rule, and commit — with a commit message stating what you tested and what you found. Then write the four-sentence report: what you measured, what changed, what you did not measure, and what you would check next.

<!-- rubric -->
- The file is committed to a real repository, with nested files placed where Lesson 3's ancestor rule puts them.
- Every line passes Lesson 4's trigger/object/result test, or is explicitly justified as an exception.
- The assembled chain was audited for the four conflict patterns, and any conflict is resolved by narrowing or deletion rather than emphasis.
- Loading is confirmed for every tool the team uses, from both root and subdirectory.
- Six runs recorded as alternating runs — three per condition, interleaved — with the mistake count for each condition, not an average.
- The report names at least two things the evidence does not establish.
- No credential, internal URL, or secret value appears anywhere in the committed file.

<!-- answer -->
The report is the deliverable that proves you learned the lesson rather than the format. A shape that works:

> *I tested whether the generated-files rule stops agents editing `src/generated/` directly, using the "add an enum value" task, three runs per condition, alternating, on Codex with the file confirmed loaded. Without the file, 2 of 3 runs edited the generated file; with it, 0 of 3 did, and the correct runs produced larger diffs because regenerating touches more files. I did not measure time or token cost, and I did not test the other two tools my team uses. Next I would confirm the nested payments file loads under Amp, since the root symlink does not bridge subtree files.*

Four sentences, one real finding, two named limits, one next step.

**The most common failure is committing the file and skipping the comparison,** because by that point the file looks obviously correct. That is precisely the state the benchmark author was in before one run per condition told him the file made things 44% worse — the design was sound and the measurement was not, and only repetition sorted it out.[^S2] Reasoning about a file predicts nothing reliable about runs.

**The second failure is claiming more than six runs support.** "AGENTS.md improves agent performance" is not what you measured. You measured one rule, one task, one tool, three runs each. The narrow claim is the valuable one, because it is true.

**The third is committing on the default branch mid-experiment.** Your "without" runs need the file absent, and a teammate pulling during that window gets your experimental condition silently. Branch or scratch-clone, always.

<!-- hint -->
Keep the prompt for your test task in a file and paste from it every run. Retyping is how prompts drift between conditions without anyone noticing.

<!-- hint -->
Before the runs, write down what you expect. A prediction you recorded is much harder to rationalise around afterwards than one you only held in your head.

<!-- hint -->
If the comparison shows nothing, resist deleting the rule immediately. Check first whether the task actually stressed it and whether three runs could have detected the frequency of the mistake you are chasing.

<!-- hint -->
For the commit message, state the finding rather than the action: "add AGENTS.md — prevented generated-file edits in 3/3 runs vs 1/3 without" tells the next person what the evidence was.
<!-- /exercises -->

## What you can defend, and what to watch next

What you can now do:

- Confirm which instruction files a tool loaded, from the directory where work happens, before drawing conclusions.
- Explain why a single before/after comparison can be clean, specific, and wrong, and repeat conditions to detect it.
- Measure the specific mistake and the tail rather than an average, and read results by counting bad runs.
- Write, place, audit, test, and commit an instruction file for a real repository, with a claim sized to your evidence.

Across the course: the file holds what is true of this repository and nothing portable; length is a budget with adherence and truncation penalties; rules live at the depth where they are true and win by appearing last; every line carries a trigger, an object, and an observable result; contradictions get narrowed rather than shouted; and none of it counts until a comparison you designed shows it.

Two things to keep watching, because they are the parts most likely to have moved by the time you re-read this. The **tool support matrix and resolution mechanics** — filenames, walk depth, size caps — are product surface, and everything in Lessons 3 and 6 is a snapshot dated 2026-08-23; re-run your loading check when a tool updates, not when you remember to. And the **file itself**, against the same trigger that started Lesson 1: a correction you have now typed twice is a line the file is missing, and a rule naming something that no longer exists is a line to delete today. The file is not a document you finish. It is the part of the repository that records what the code cannot say for itself.
