# Sources

Every key fact and definition in this course comes from the following materials.

## S1 — Claude Code official docs: Extend Claude Code with skills

URL: https://code.claude.com/docs/en/skills

- authority: official-docs

The course's core concept source: explains how skills work, the two-part structure of a SKILL.md file (YAML frontmatter + Markdown content), how skills get triggered and invoked, and how skills relate to custom commands.

Key quote:
> "Every skill needs a SKILL.md file with two parts: YAML frontmatter between --- markers that tells Claude when to use the skill, and markdown content with the instructions Claude follows when the skill runs."

## S2 — Anthropic platform docs: Agent Skills overview

URL: https://platform.claude.com/docs/en/agents-and-tools/agent-skills/overview

- authority: official-docs

Details the three-level loading mechanism of skills (frontmatter for discovery, instructions for execution, supporting files loaded on demand), how skills are used across surfaces, and the design principle of progressive disclosure.

Key quote:
> "Claude operates in a virtual machine with filesystem access, allowing Skills to exist as directories containing instructions, executable code, and reference materials, organized like an onboarding guide you'd create for a new team member."

## S3 — Anthropic engineering blog: Equipping agents for the real world with Agent Skills

URL: https://www.anthropic.com/engineering/equipping-agents-for-the-real-world-with-agent-skills

- authority: official-docs

Explains the design philosophy of skills from an engineering angle: packaging expertise into composable resources, building a skill the way you'd assemble an onboarding guide for a new hire, and turning a general-purpose agent into a specialized one through skills.

Key quote:
> "Building a skill for an agent is like putting together an onboarding guide for a new hire. Instead of building fragmented, custom-designed agents for each use case, anyone can now specialize their agents with composable capabilities."

## S4 — Anthropic help center: How to create custom skills

URL: https://support.claude.com/en/articles/12512198-how-to-create-custom-skills

- authority: official-docs

Covers the minimum structure a skill requires (a directory containing SKILL.md), the required YAML frontmatter fields (name and description), and the range from a few lines of instructions to complex packages with multiple files and executable code.

Key quote:
> "Every skill consists of a directory containing at minimum a skill.md file, which is the core of the skill. This file must start with a YAML frontmatter to hold name and description fields, which are required metadata."

## S5 — Claude Skills deep dive (a first-principles view)

URL: https://leehanchung.github.io/blogs/2025/10/26/claude-skills-deep-dive/

- authority: authoritative-guide

Analyzes the structure of SKILL.md from first principles: how the frontmatter configures HOW (permissions, model, metadata), how the content defines WHAT gets executed, and how progressive disclosure applies to skills.

Key quote:
> "The frontmatter configures HOW the skill runs (permissions, model, metadata), while the markdown content tells Claude WHAT to do."

## S6 — Building skills for Claude, hands-on: YAML frontmatter and testing

URL: https://sjramblings.io/building-skills-for-claude-part-2/

- authority: authoritative-guide

Provides the writing formula for the frontmatter description field (What it does + When to use it + Key capabilities), good-versus-bad description examples, and best practices for the test loop.

Key quote:
> "The description is the single most important field in your frontmatter. A bad description means your skill either never triggers or triggers on everything. The formula: What it does + When to use it + Key capabilities."

## S7 — The complete guide to building skills for Claude (PDF)

URL: https://resources.anthropic.com/hubfs/The-Complete-Guide-to-Building-Skill-for-Claude.pdf

- authority: official-docs

Anthropic's official full guide, covering consistent skill usage across Claude.ai, Claude Code, and the API, methods for identifying workflows worth automating, and how skills work alongside MCP servers.

Key quote:
> "Skills work identically across Claude.ai, Claude Code, and API. Create a skill once and it works across all surfaces without modification."

## S8 — Claude Code skills: .NET workflows and reusable prompts

URL: https://codewithmukesh.com/blog/skills-claude-code/

- authority: authoritative-guide

Explains the difference between Skills, Rules (CLAUDE.md), and Hooks; version-control practice for project-level skills; the subagent delegation pattern; and implementations of five production-grade skill patterns.

Key quote:
> "Skills vs Rules vs Hooks: Skills for what to do (workflows), Rules for how things are (conventions), Hooks for what happens automatically (triggers)."

## S9 — Teach Claude Code your workflow: a hands-on guide to custom skills

URL: https://medium.com/@n913239/teach-claude-code-your-workflow-a-hands-on-guide-to-custom-skills-8bc35d4a11ed

- authority: blog

Shares a practitioner's view of the difference between personal skills and project skills, scenarios for bundled skills, and an example of improving skill output quality with post-processing scripts (pandoc + python-docx for Word table borders).

Key quote:
> "Personal Skills are for your own habits — things like code cleanup or file conversion that you use across every project. Project Skills are for project-specific workflows."

## S10 — Claude skills as self-documenting runbooks

URL: https://zackproser.com/blog/claude-skills-internal-training

- authority: blog

Describes the unique value of skills for team collaboration: SKILL.md is both human-readable documentation and an AI-executable spec, which eliminates the drift between traditional runbooks and the code that implements them.

Key quote:
> "The SKILL.md file that Claude reads to understand the workflow? You can read it too. It's plain English instructions alongside the actual implementation code. The documentation is the executable specification - they can't drift apart because they're the same thing."
