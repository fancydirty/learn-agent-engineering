# Sources

<!-- registry: A8 -->

## S1 — Anthropic: Equipping agents for the real world with Agent Skills
URL: https://www.anthropic.com/engineering/equipping-agents-for-the-real-world-with-agent-skills
- authority: official-docs
- supports: Supports the claims that a Skill is a directory containing SKILL.md plus instructions, scripts, and resources, and the principles of progressive disclosure, evaluation, and safety auditing.
- key-fact: “A skill is a directory containing a SKILL.md file that contains organized folders of instructions, scripts, and resources.”

## S2 — Agent Skills: Specification
URL: https://agentskills.io/specification
- authority: official-docs
- supports: Supports the format constraints on frontmatter fields, naming rules, description trigger information, and the optional directories.
- key-fact: “The SKILL.md file must contain YAML frontmatter followed by Markdown content.”

## S3 — Anthropic: Agent Skills overview
URL: https://platform.claude.com/docs/en/agents-and-tools/agent-skills/overview
- authority: official-docs
- supports: Supports how Skills load in Claude products, progressive disclosure, and the safety boundaries.
- key-fact: “Skills use progressive disclosure to manage context efficiently.”

## S4 — OpenAI: Build skills
URL: https://learn.chatgpt.com/docs/build-skills
- authority: official-docs
- supports: Supports Agent Skills as a reusable workflow format across ChatGPT, Codex, and the open standard, plus implicit/explicit triggering and repository discovery scope.
- key-fact: “Use agent skills to extend ChatGPT and Codex with task-specific capabilities.”

## S5 — Anthropic: Building effective agents
URL: https://www.anthropic.com/engineering/building-effective-agents
- authority: official-docs
- supports: Supports starting from the simplest composable solution and distinguishing workflows from agents that need autonomous decisions.
- key-fact: “We recommend finding the simplest solution possible, and only increasing complexity when needed.”

## S6 — Agent Skills: skills-ref reference library
URL: https://github.com/agentskills/agentskills/tree/main/skills-ref
- authority: official-docs
- supports: Supports the real installation prerequisites and command format of `skills-ref validate path/to/skill`; the same repository states the library is demo-only and must not be treated as a production guarantee.
- key-fact: “skills-ref validate path/to/skill”

## S7 — Anthropic: Agent Skills best practices
URL: https://platform.claude.com/docs/en/agents-and-tools/agent-skills/best-practices
- authority: official-docs
- supports: Cross-supports frontmatter field limits, progressive disclosure, representative testing, file layering, and script boundaries.
- key-fact: “At startup, only the metadata (name and description) from all Skills is pre-loaded.”
