---
domain: Agent Engineering
tags: [Agent Skills, workflow, beginner, Claude Code, Codex]
lang: en
---
# Agent Skills: Reusing Workflows, the Beginner Path

This course teaches creators and indie developers who already use Claude Code, Codex, or a similar agent how to turn a one-off prompt into a Skill that an agent can discover, load on demand, and re-test. It is built around the public Agent Skills file specification; it does not cover model training, MCP server implementation, plugin distribution platforms, or a complete methodology for any specific business domain.

**After finishing this course, you can:**
- Tell apart the responsibility boundaries of a one-off prompt, a Skill, and an external tool.
- Write spec-compliant `SKILL.md` metadata that triggers reliably.
- Use `references/`, `assets/`, and `scripts/` to layer materials and deterministic operations.
- Design trigger, boundary, and output-quality tests for a Skill, and record the failures.
- Complete an installable, re-testable Skill folder on one of your own workflows.

**Prerequisites:** You can use one coding agent, create directories, and edit Markdown files. No Python, JavaScript, or API calls required.

**Exercise environment:** Use your own IDE, terminal, and agent. The course provides no embedded execution environment and never asks you to upload private files.

## Lessons

| # | Topic | You will learn |
|---|---|---|
| 01 | [One-off prompts vs. reusable Skills](./01-prompt-to-skill.md) | Decide what work is worth packaging, and where a Skill's boundary lies. |
| 02 | [SKILL.md metadata and trigger descriptions](./02-skill-metadata.md) | Write a compliant name, description, and minimal instruction entry. |
| 03 | [Progressive disclosure and resource layering](./03-progressive-disclosure.md) | Split long material into layers the agent reads on demand. |
| 04 | [Resources, scripts, and execution boundaries](./04-resources-and-boundaries.md) | Decide what goes to the model and what goes to a deterministic script. |
| 05 | [Trigger testing and safety audits](./05-testing-and-safety.md) | Test false triggers, missed triggers, and boundary risks with representative tasks. |
| 06 | [From workflow to shippable Skill](./06-ship-a-skill.md) | Complete one build, audit, and handoff inside a real workflow. |

> Sources and version boundaries are documented in [sources.md](./sources.md).
