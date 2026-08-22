# Sources

<!-- registry: A8 -->

## S1 — Anthropic: Equipping agents for the real world with Agent Skills
URL: https://www.anthropic.com/engineering/equipping-agents-for-the-real-world-with-agent-skills
- authority: official-docs
- supports: sostiene que un Skill es un directorio que contiene SKILL.md junto con instrucciones, scripts y recursos, además de los principios de divulgación progresiva, evaluación y auditoría de seguridad.
- key-fact: “A skill is a directory containing a SKILL.md file that contains organized folders of instructions, scripts, and resources.”

## S2 — Agent Skills: Specification
URL: https://agentskills.io/specification
- authority: official-docs
- supports: sostiene las restricciones de formato de los campos del frontmatter, las reglas de nombre, la información de disparo del description y los directorios opcionales.
- key-fact: “The SKILL.md file must contain YAML frontmatter followed by Markdown content.”

## S3 — Anthropic: Agent Skills overview
URL: https://platform.claude.com/docs/en/agents-and-tools/agent-skills/overview
- authority: official-docs
- supports: sostiene cómo se cargan los Skills en los productos de Claude, la divulgación progresiva y los límites de seguridad.
- key-fact: “Skills use progressive disclosure to manage context efficiently.”

## S4 — OpenAI: Build skills
URL: https://learn.chatgpt.com/docs/build-skills
- authority: official-docs
- supports: sostiene que los Agent Skills son un formato de flujo de trabajo reutilizable en ChatGPT, Codex y la especificación abierta, además del disparo implícito y explícito y el alcance de descubrimiento en un repositorio.
- key-fact: “Use agent skills to extend ChatGPT and Codex with task-specific capabilities.”

## S5 — Anthropic: Building effective agents
URL: https://www.anthropic.com/engineering/building-effective-agents
- authority: official-docs
- supports: sostiene empezar por la solución más simple y componible, y distinguir los flujos de trabajo de los Agent que necesitan decisiones autónomas.
- key-fact: “We recommend finding the simplest solution possible, and only increasing complexity when needed.”

## S6 — Agent Skills: skills-ref reference library
URL: https://github.com/agentskills/agentskills/tree/main/skills-ref
- authority: official-docs
- supports: sostiene los requisitos reales de instalación y el formato del comando `skills-ref validate path/to/skill`; el mismo repositorio declara que la librería es solo de demostración y no debe tratarse como una garantía de producción.
- key-fact: “skills-ref validate path/to/skill”

## S7 — Anthropic: Agent Skills best practices
URL: https://platform.claude.com/docs/en/agents-and-tools/agent-skills/best-practices
- authority: official-docs
- supports: sostiene de forma cruzada los límites de los campos del frontmatter, la divulgación progresiva, las pruebas representativas, la estratificación de archivos y los límites de los scripts.
- key-fact: “At startup, only the metadata (name and description) from all Skills is pre-loaded.”
