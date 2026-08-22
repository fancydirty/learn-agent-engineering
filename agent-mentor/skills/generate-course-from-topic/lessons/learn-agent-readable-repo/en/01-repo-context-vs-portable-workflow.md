# Lesson 1: What a repository owes an agent

> Lesson objectives:
> - State the boundary between a repository instruction file and a README, in terms of who reads each.
> - Decide whether a given piece of knowledge belongs in a repo instruction file, in a portable Skill, or in neither.
> - Name the three tests a candidate line must pass before it earns a place in the file.
> - Explain why an instruction file is guidance rather than enforcement, and what that rules out.
>
> Prerequisites: You work in a repository you can commit to and have run an agent in it | Previous [<< Course contents](./README.md) | Next [02 >>](./02-the-cost-of-one-long-file.md)

## The correction you have now typed four times

Your repo uses npm. Somebody's agent ran `pnpm install` because the lockfile was ambiguous and pnpm is what it sees most often. You corrected it. Tomorrow a different session, or a colleague's different tool, does the same thing.

None of this is a model failure. The repository never said. The information exists — in your head, in a Slack thread, in the CI config if you know where to look — and it reaches the agent only when a human types it into a chat window. Every new session starts from zero, and every teammate's session starts from a different zero.

The fix is a file in the repository that agents read before they start work. This lesson is about which of your corrections belong in that file, because the answer is not "all of them," and a file that tries to hold all of them is the failure mode Lesson 2 measures.

## Explanation

### The file, and the boundary that defines it

**AGENTS.md** is a Markdown file at the root of a repository holding the context and instructions a coding agent needs to work on that project. The format's own site describes it as "a README for agents": no schema, no required fields, standard Markdown throughout.[^S1]

The boundary against a README is worth stating precisely, because it is the whole design. The site puts it this way: "README.md files are for humans: quick starts, project descriptions, and contribution guidelines. AGENTS.md complements this by containing the extra, sometimes detailed context coding agents need: build steps, tests, and conventions that might clutter a README or aren't relevant to human contributors."[^S1]

Read that as a question you can apply to any candidate line: *would a human contributor skip this, and would an agent need it?* The exact pretest chain, the directory of generated files, the reason `make test-payments` exists instead of `npm test` — a person skims past those and looks them up when they hit them. An agent that does not know them guesses, and guesses cost you a run.

### Who reads it, as of 2026-08-23

The format is not one vendor's configuration file. Its own site lists Codex, Jules, Factory, Aider, goose, opencode, Zed, Warp, VS Code, Devin, Junie, Amp, Cursor, RooCode, Gemini CLI, Kilo Code, Phoenix, Semgrep, GitHub Copilot's coding agent, Ona, Windsurf, and Augment Code among tools that read it.[^S1] Support matrices go stale within months, so treat that as a snapshot with a date on it rather than a standing fact; the durable point is that the filename is shared across vendors who compete with each other.

Governance backs that up. As of 2026-08-23 the site states that "AGENTS.md is now stewarded by the Agentic AI Foundation under the Linux Foundation,"[^S1] and AAIF's own project listing carries AGENTS.md alongside the Model Context Protocol, goose, agentgateway, and Agent2Agent.[^S2] A format under a neutral foundation is one no single vendor can revoke — which is the practical reason to write one file rather than three.

Not every tool reads the filename directly. Claude Code's documentation says plainly: "Claude Code reads CLAUDE.md, not AGENTS.md," and recommends bridging with a one-line `@AGENTS.md` import or a symlink "so both tools read the same instructions without duplicating them."[^S5] Amp resolves it differently again: if a directory has no AGENTS.md but does have `AGENT.md` or `CLAUDE.md`, it includes that file instead.[^S4] One file, several front doors — and knowing which door your tool uses is Lesson 6's verification step.

### The adoption number, and how much weight it carries

The site's headline says the format is "used by over 60k open-source projects."[^S1] That figure is the project's own self-reported count, published without a stated method, and repeated widely enough that it is worth handling carefully: it is evidence that the format spread, not evidence that it works. The AAIF post that measured behaviour change makes exactly this distinction before presenting any numbers — "adoption isn't evidence. A format can spread because it's convenient... not because anyone's shown it changes what an agent actually does on a real task."[^S2]

Take the same care with the site's monorepo illustration: "at time of writing the main OpenAI repo has 88 AGENTS.md files."[^S1] The site itself hedges the count with "at time of writing," and a repository's file count is exactly the kind of number that moves. Cite it as an illustration of the nesting pattern from a dated source, which is Lesson 3's subject, and not as a current measurement.

### Guidance, not enforcement

This is the boundary that decides what you should *not* try to do with the file.

An instruction file is text that enters the model's context. It is not a permission system. Claude Code's documentation states the consequence directly: these files are "context, not enforced configuration. To block an action regardless of what Claude decides, use a PreToolUse hook instead."[^S5] The AAIF post reaches the same place from the measurement side: "It can tell an agent not to touch a file. It can't guarantee that. Real enforcement still belongs to CI, branch protection, and sandboxed execution."[^S2]

So a line reading `Never commit to main` is a request that will usually be honoured and sometimes will not. If the cost of "sometimes will not" is unacceptable, the instruction file is the wrong tool and a branch protection rule is the right one. Write the line anyway — it is cheap and it helps — but do not let it stand in for the control.

**A security note, since this file is committed.** Everything in an instruction file is checked into version control and read aloud into a model's context on every session. That makes it the wrong place for credentials, internal URLs you would not publish, or the contents of a `.env`. Write `Read the database URL from DATABASE_URL; never hardcode it` — the rule, not the value. If your repository is public, assume every line is public, because it is.

### Where the line against a Skill falls

A repository instruction file and an **Agent Skill** are both files that shape agent behaviour, and they answer different questions. Confusing them produces a bloated instruction file and a Skill nobody can reuse.

The distinction is about *portability*, and Claude Code's docs draw it on exactly that axis: keep in the instruction file "facts Claude should hold in every session: build commands, conventions, project layout, 'always do X' rules," and "if an entry is a multi-step procedure or only matters for one part of the codebase, move it to a skill or a path-scoped rule instead."[^S5]

| | Repo instruction file | Skill |
|---|---|---|
| Answers | What is true of *this* repository | How to perform *this kind of work*, anywhere |
| Loaded | Every session, whether or not it is relevant[^S5] | On demand, when the work matches |
| Travels to another repo | No — the facts stop being true | Yes — that is the point |
| Typical content | Package manager, test command, protected paths, layout | A multi-step procedure with its own reference material |

The test in one sentence: **if you copied this text into an unrelated repository and it was still true, it does not belong in this repository's instruction file.** "Run `pnpm test` before committing" fails that test — it is a fact about this repo. "How to review a database migration for lock contention" passes it — it is a procedure, it travels, and it belongs in a Skill.

This course stays on the first column from here. Skills have their own course; everything below is about facts that are true of one repository.

### Three tests before a line earns its place

The instruction file competes for the same context every session (Lesson 2 prices that competition). So each candidate line should pass all three:

1. **Non-obvious.** Could an agent discover this by reading the repository? A `package-lock.json` already announces npm. Something the code cannot tell you — *why* a directory is off-limits, which of three test commands is the real one — earns its place. Cursor's docs make the strong version of this point: do not copy style guides into a rules file, because "Agent already knows common style conventions."[^S10]
2. **Actionable.** Does it name something to do or not do? "Follow best practices" gives an agent nothing to act on; "Run `npm run lint` after any source change" and "do not edit files in `dist/`" give it commands, paths, and boundaries.[^S2] Lesson 4 is entirely about this test.
3. **Repeatedly needed.** Would it come up again? Claude Code's docs give a usable trigger: add to the file when "Claude makes the same mistake a second time," or when "A new teammate would need the same context to be productive."[^S5]

The second-mistake rule is the one worth internalising. It stops you writing the file speculatively — which produces long, aspirational documents nobody validated — and starts you writing it from evidence you already have.

```agentmentor-check
{
  "id": "agent-readable-repo-scope-where-does-this-line-live",
  "label": "Place a rule in the right file",
  "prompt": "Your team has a written procedure for releasing a package: bump the version, regenerate the changelog from commits since the last tag, run the full integration suite, tag, publish, then post to the release channel. It is six steps with judgment calls at three of them, and your other four repositories release the same way. Where does it belong?",
  "whyHere": "This is the exact judgment the rest of the course depends on, and the tempting answer is wrong for a reason worth naming: the procedure is real, important, and specific to your team, which feels like it should mean 'repo instruction file'.",
  "copyPurpose": "Have the agent check whether I am using the repo instruction file as a general dumping ground for team knowledge instead of applying the portability test.",
  "mode": "single",
  "choices": [
    {
      "id": "agents-md",
      "text": "In the repository instruction file — it is a real team convention and agents keep getting the release wrong",
      "correct": false,
      "feedback": "It fails the portability test: the same procedure is true in four other repositories, so it is not a fact about this one. It also fails on load cost — a six-step procedure with judgment calls would sit in context on every session, including the hundreds that have nothing to do with releasing. The documented rule is that a multi-step procedure moves out to a skill."
    },
    {
      "id": "skill",
      "text": "In a Skill, with at most a pointer from the instruction file to the repo-specific parts",
      "correct": true,
      "feedback": "Both signals point the same way: it is a multi-step procedure, and it travels to four other repositories unchanged. That is a Skill loaded when release work starts. What may stay in the instruction file is the thin repo-specific residue — the name of this package's integration command, if it differs — because that part does not travel."
    },
    {
      "id": "readme",
      "text": "In the README, since it is a contribution procedure and humans do releases too",
      "correct": false,
      "feedback": "Reasonable for the human half, but it misses what these files are for. A README is read by a person who chooses to open it; an instruction file or Skill is loaded into an agent's context by the tool. Putting the procedure only in the README means an agent asked to cut a release will not have it unless someone pastes it in."
    },
    {
      "id": "both",
      "text": "In both the instruction file and a Skill, so it works no matter which one the agent reads",
      "correct": false,
      "feedback": "Duplication is the specific problem the shared format was meant to end — the AAIF argument for one file is that multiple copies of the same advice each drift at their own pace, updated by whoever remembered last. Two copies of a six-step procedure means one of them is silently wrong within a quarter, and you will not know which."
    }
  ]
}
```

## Worked example: sorting one team's corrections

Here is a real-shaped list: six things a team found itself re-explaining. Watch each one go through the three tests.

**1. "We use npm, not pnpm."**
Non-obvious? Partly — `package-lock.json` implies it, but a stray `pnpm-lock.yaml` from an experiment makes it ambiguous. Actionable? Yes, once written as a command. Repeated? It is why we are here. **Keep**, as `Use npm. Do not run pnpm or yarn — the lockfile is package-lock.json.`

**2. "Don't edit anything in `src/generated/`."**
Non-obvious? Yes — nothing in the directory says it is regenerated on build. Actionable? Yes, with the path. Repeated? Every agent that greps for a symbol lands there. **Keep**, and add what to do instead: `Files in src/generated/ are produced by npm run codegen. Edit the .proto sources in schema/ and regenerate.` The second clause is what prevents the correction from being needed twice.

**3. "Use meaningful variable names."**
Non-obvious? No. Actionable? No — Lesson 4's whole subject. Repeated? It has never actually been the problem. **Drop.** This is the "copying entire style guides" case Cursor's docs warn about.[^S10]

**4. "Our auth flow: the session cookie is signed in `lib/session.ts`, verified in middleware, and the refresh path is deliberately not in middleware because of the edge runtime."**
Non-obvious? Very — the *deliberately* is the part no code review reconstructs. Actionable? As written, no; it is background. Repeated? Yes, every time someone tries to "fix" the inconsistency. **Keep, rewritten**: `Session refresh is intentionally outside middleware (edge runtime cannot reach the database). Do not move it there.` The reason survives, the instruction is now a command.

**5. "How to write a good PR description for our team."**
Non-obvious? Somewhat. Actionable? Yes. Repeated? Yes — but it is identically true in all six of our repositories. **Move to a Skill**, or to personal global guidance. It fails portability.

**6. "The staging database password is `hunter2`."**
**Drop, and rotate it.** The file is committed and read into a model's context on every session. Credentials never go in it; if you need to name the mechanism, write `Staging credentials come from 1Password, item "staging-db" — never inline them.`

Four kept, one relocated, one deleted with a follow-up. The file starts at four lines rather than six, and every line came from a mistake that already happened twice.

## Your turn: run your own list through the tests

Open your repository. Write down five things you have corrected an agent about in the last month — real ones, from memory or from scrollback.

For each, fill in:

- Test 1, non-obvious: could an agent find this by reading the repo? ________
- Test 2, actionable: does it name a command, a path, or a boundary? ________
- Test 3, repeated: has this cost you twice or more? ________
- Verdict: keep / rewrite / move to a Skill / drop ________
- If keep or rewrite, the line as it would appear in the file: ________

<details>
<summary>What the sort usually looks like, and the two traps</summary>

Most people's five sort roughly: two clear keeps (a command and a protected path), one that is really a Skill, one that fails the non-obvious test, and one that is a genuine fact but written as an adjective and needs Lesson 4's treatment before it is usable.

**The first trap is keeping something that fails test 1 because it feels important.** "We care a lot about accessibility" is important and is not a repository fact; `Every interactive element needs an accessible name — run npm run test:a11y` is. Importance is not the test; discoverability is.

**The second trap is the opposite — dropping a line because "the agent should know that."** If it has cost you twice, it does not know it, whatever it should do. The second-mistake rule is a rule about your evidence, not about the model's capability.

If you finished with fewer than three keeps, that is a normal and good result. A four-line file that is entirely true beats a forty-line file you have not validated, and Lesson 2 explains why the difference is larger than it looks.
</details>

```agentmentor-action
mode: confusion_breaker
label: Have the agent argue one of my keeps out of the file
description: Tests whether my keep/drop calls came from the three tests or from a feeling that the line was important, by making me defend a specific line against the portability and discoverability arguments.
purpose: I want to pressure-test the list I just sorted, because the failure mode is keeping lines that feel important rather than lines that are non-obvious, actionable, and already proven necessary.
rules:
  - Ask me to paste the five candidate lines and my verdict on each, with no explanation attached.
  - Pick the one you think is weakest and argue that it should be dropped or moved to a Skill.
  - Make me defend it against a specific test — discoverability, portability, or evidence of repetition — not against a general "is this useful".
  - If I defend it well, say so and move to the next weakest; do not rewrite my whole list for me.
  - One line at a time.
```

<!-- exercises -->
## 💻 Exercises (point these at your own real environment)

### Level 1 (warm-up)
In your own repository, check whether an instruction file already exists. Run `ls AGENTS.md CLAUDE.md AGENT.md .github/copilot-instructions.md .cursorrules 2>/dev/null` from the repository root — run it in your terminal; success looks like either a list of filenames or no output at all, and no output means none of them exist. Then, for each file you found (or for the empty result), write down two things: which of your agent tools reads that filename, and whether the file's contents pass the three tests from this lesson.

<!-- rubric -->
- The command was run at the repository root and its result recorded, including "no files found" as a valid result.
- For each file present, the tool that reads it is named, and if you are unsure, that uncertainty is written down as an open question for Lesson 6.
- Every existing line is marked pass or fail against test 1 (non-obvious) and test 2 (actionable).
- At least one concrete finding is stated in a sentence: a line that should not be there, a file no current tool reads, or a confirmed absence.

<!-- answer -->
Three outcomes are common. **Nothing exists** — the cleanest start; your file gets written in Lesson 6 from evidence rather than from a template. **A file exists and is stale** — usually generated months ago by an `init`-style command and never revised, so it describes a layout that has since changed. Lines that were true at generation time and are false now are worse than no file, because they are followed. **Several files exist and disagree** — an `AGENTS.md`, a `.cursorrules` from someone's experiment, and a `CLAUDE.md` with a fourth version of the test command. That is the duplication problem the shared format exists to remove, and Lesson 5 is about resolving it.

One thing to note explicitly if you find it: an instructions file that no tool in your team's current stack reads. It costs nothing at runtime and it costs a lot in trust, because people keep editing it and expecting effects.

<!-- hint -->
If `ls` returns nothing, that is a finding, not a failed exercise. Record it and move on — the whole course builds toward writing the file that is missing.

<!-- hint -->
For "which tool reads this," start from the tools your team actually runs, not from the list of tools that exist. Two people on two tools is the case this course is written for.

<!-- hint -->
Judging test 2 quickly: read each line and ask what you would type or click to comply. If nothing comes to mind in five seconds, it fails, and Lesson 4 will show you how to rewrite it.

### Level 2 (advanced)
Take the largest instruction file in your repository — or, if none exists, the onboarding doc a new teammate is pointed at. Classify every line into exactly one of four buckets: **repo fact** (true here, would be false elsewhere), **portable procedure** (a Skill), **not discoverable from the repo but not actionable** (background), and **already discoverable** (drop). Then write the one-sentence justification for the three lines you are least sure about.

<!-- rubric -->
- Every line lands in exactly one bucket; no line is left unclassified or dual-classified.
- Bucket counts are recorded, so the shape of the file is visible as numbers.
- The three least-certain lines have a written justification naming which test decided them.
- One line is identified that you would have kept before this lesson and now would not, with the reason.

<!-- answer -->
The instructive result is the shape of the distribution. Files that grew by accretion are usually heavy in "already discoverable" — style preferences, framework conventions, restatements of what the code says — because those lines are the easiest to write and feel productive. The "repo fact" bucket, the one that justifies the file's existence, is often the smallest.

**The common mistake here is bucketing by topic rather than by portability.** People put everything about testing in one bucket and everything about style in another, which reproduces the document's own headings and decides nothing. The classification only does work if you ask, line by line, "would this still be true in a different repository?" — because that question splits a testing section down the middle. `Run npm test` is a repo fact. "Write tests for new behaviour" is a portable norm, and probably a team-wide Skill or simply a code review standard.

The background bucket is the subtle one, and the right move is usually to rewrite rather than drop. Explanatory context that is genuinely non-obvious — the *why* behind a structural oddity — earns its place if you attach an instruction to it, as in the auth-flow line from the worked example. Left as pure explanation, it is prose the model reads on every session and cannot act on.

<!-- hint -->
Do the portability test first on every line and the other tests after. It is the fastest single cut and it splits the file into two piles that need different treatment.

<!-- hint -->
If a line is long enough that it does not fit in one bucket, that is a signal it is two lines. Split it and classify the halves.

<!-- hint -->
For the "would have kept before" line, look for something aspirational — a value statement about quality, security, or care. Those survive review because arguing against them feels like arguing against the value.
<!-- /exercises -->

## What the file is now allowed to contain

What you can now do:

- Say what separates a repository instruction file from a README (who reads it) and from a Skill (whether it travels).
- Apply three tests — non-obvious, actionable, repeatedly needed — to a candidate line, and drop the ones that fail.
- Treat the format's adoption figure as a self-reported claim about spread rather than evidence about effect.
- Explain why the file cannot enforce anything, and name what to use instead when enforcement is required.

You now have a list of lines that deserve to exist. The obvious next move is to write them all down, and that move has a cost most people never see: instruction adherence is not flat as a file grows. Some of what you write will be read past. Lesson 2 shows what the measurements say about which lines those are.
