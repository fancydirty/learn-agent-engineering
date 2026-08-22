---
domain: Agent Engineering
tags: [verification, testing, acceptance criteria, hooks, advanced]
lang: en
---
# Verifying Agent Output: Building a Completion Gate

This course is for people who already ship work an agent produced and have no reliable way to tell a finished task from a confident summary. It teaches where a "done" claim comes from and why it arrives early, what a green test suite does and does not measure, how to move the finish line into a file the agent does not own, and how to stack three checks so the cheapest one runs first — ending with a gate wired into one of your own projects and used to overturn one real "done" claim. It covers verification you can re-run without reading a transcript; it does not cover writing the underlying tests, choosing a CI provider, or evaluating models against benchmarks.

**By the end you'll be able to (course objectives):**
- Explain why a completion claim is produced by the same process that did the work, and what that rules out as a check.
- Name what a passing unit-test suite leaves unmeasured, and predict which of your own failures it would miss.
- Write a definition of done that lives outside the agent's judgment and that the agent cannot edit to pass.
- Build a three-layer gate for one of your projects, ordered so the cheapest check fails first.
- Write failure output an agent can act on without a human translating it.
- Decide whether a specific "done" claim should be believed, from evidence rather than tone.

**Prerequisites:** You have run an agent on a multi-step task in a real project and shipped or nearly shipped the result. You can run a command in your project's terminal and edit a file in your repository. No knowledge of any particular test framework or CI system is assumed.

**Practice environment:** Your own repository, terminal, and editor — this course has no embedded sandbox. Every exercise points at a project you already have.

## Lessons
| # | Topic | You'll learn |
|----|------|---------|
| 01 | [Where a "done" claim comes from](./01-anatomy-of-a-done-claim.md) | What produces a completion claim, why asking the agent to double-check returns praise, and what a claim is actually evidence of |
| 02 | [What a green test suite does not cover](./02-what-green-tests-miss.md) | The measured gap between passing tests and accepted work, and the four things a suite you own cannot see |
| 03 | [Moving the finish line outside the agent](./03-moving-the-finish-line-outside.md) | Turning "done" into a condition something other than the agent evaluates, and protecting it from being edited |
| 04 | [Three layers, cheapest first](./04-three-layers-cheapest-first.md) | Ordering checks by cost and by what each one can catch, and choosing thresholds that fail loudly |
| 05 | [Failure output an agent can act on](./05-failure-output-an-agent-can-use.md) | Turning a red check into a repair instruction, and reading recurring failures as a defect in the gate |
| 06 | [Wiring the gate into your project](./06-wiring-the-gate-into-your-project.md) | Installing the gate in a real repository and using it to overturn one "done" claim |

> Sources listed in [sources.md](./sources.md).
