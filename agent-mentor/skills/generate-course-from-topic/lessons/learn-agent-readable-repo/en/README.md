---
domain: Agent Engineering
tags: [AGENTS.md, repository, instruction files, monorepo, intermediate]
lang: en
---
# An Agent-Readable Repository: Writing AGENTS.md

This course is for developers whose repository is now worked on by several people and several agent tools, and who keep re-typing the same corrections into every session — the package manager, the test command, the generated directory nobody should edit. It teaches what belongs in a repository-level instruction file and what does not, why one long file loses adherence, how nesting and nearest-file resolution decide which rules apply where, how to write a line an agent can act on without guessing, what happens when two of your own rules disagree, and how to gather evidence that the file changed behaviour rather than assuming it did. It covers the open AGENTS.md format and the judgment behind its contents; it does not teach how to build an agent harness, and it leaves portable reusable workflows to a separate course on Agent Skills.

**By the end you'll be able to (course objectives):**
- Decide whether a piece of knowledge belongs in a repository instruction file, in a portable Skill, or in neither.
- Predict which instructions in a long file are most likely to be ignored, and split the file so the surviving ones are the ones that matter.
- Place an instruction file at the directory depth where its rules are actually true, and say which file a given tool will load for a given edit.
- Rewrite an evaluative adjective as a command with a path, a trigger, and an observable result.
- Find the contradictions in your own instruction set and resolve them by rewriting scope rather than by adding emphasis.
- Design a before/after comparison that distinguishes a real behaviour change from run-to-run noise, and report what it does and does not show.

**Prerequisites:** You work in a repository you can commit to, you can run its build and test commands, and you have run a coding agent on a task in it at least once. No knowledge of any specific agent's configuration format is assumed.

**Practice environment:** Your own repository, terminal, and agent tool. This course has no embedded sandbox, runs nothing for you, and never asks you to upload anything.

## Lessons
| # | Topic | You'll learn |
|----|------|---------|
| 01 | [What a repository owes an agent](./01-repo-context-vs-portable-workflow.md) | The line between context that is true of this repo and a workflow that travels, and what belongs in neither |
| 02 | [The cost of one long file](./02-the-cost-of-one-long-file.md) | Why adherence falls as instructions accumulate, and which lines are dropped first |
| 03 | [Nearest file wins](./03-nearest-file-wins.md) | How a chain of instruction files is assembled, and where to put a rule so it applies exactly where it is true |
| 04 | [Commands in place of adjectives](./04-commands-not-adjectives.md) | Turning "keep it clean" into a line with a trigger, a path, and a checkable result |
| 05 | [When two rules disagree](./05-conflicting-instructions.md) | Finding contradictions in your own file, and why priority ordering is a convention rather than a mechanism |
| 06 | [Evidence that behaviour changed](./06-evidence-of-behaviour-change.md) | Running a before/after comparison that survives noise, and writing the file for one real repository |

> Sources and version boundaries are documented in [sources.md](./sources.md).
