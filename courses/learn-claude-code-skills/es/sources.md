# Fuentes

Todos los hechos y definiciones clave de este curso provienen de los siguientes materiales. Las citas se mantienen en su idioma original, el inglés.

## S1 — Documentación oficial de Claude Code: Extend Claude Code with skills

URL: https://code.claude.com/docs/en/skills

- authority: official-docs

La fuente del concepto central del curso: explica cómo funcionan las skills, la estructura en dos partes de un archivo SKILL.md (frontmatter YAML + contenido Markdown), cómo se activan e invocan las skills y cómo se relacionan con los custom commands.

Cita clave:
> "Every skill needs a SKILL.md file with two parts: YAML frontmatter between --- markers that tells Claude when to use the skill, and markdown content with the instructions Claude follows when the skill runs."

## S2 — Documentación de la plataforma de Anthropic: Agent Skills overview

URL: https://platform.claude.com/docs/en/agents-and-tools/agent-skills/overview

- authority: official-docs

Detalla el mecanismo de carga en tres niveles de las skills (el frontmatter para el descubrimiento, las instructions para la ejecución y los supporting files que se cargan bajo demanda), cómo se usan las skills en las distintas superficies y el principio de diseño de progressive disclosure.

Cita clave:
> "Claude operates in a virtual machine with filesystem access, allowing Skills to exist as directories containing instructions, executable code, and reference materials, organized like an onboarding guide you'd create for a new team member."

## S3 — Blog de ingeniería de Anthropic: Equipping agents for the real world with Agent Skills

URL: https://www.anthropic.com/engineering/equipping-agents-for-the-real-world-with-agent-skills

- authority: official-docs

Explica la filosofía de diseño de las skills desde una óptica de ingeniería: empaquetar la experiencia en recursos componibles, construir una skill como si armaras la guía de incorporación de alguien que acaba de entrar al equipo y convertir un agente de propósito general en uno especializado mediante skills.

Cita clave:
> "Building a skill for an agent is like putting together an onboarding guide for a new hire. Instead of building fragmented, custom-designed agents for each use case, anyone can now specialize their agents with composable capabilities."

## S4 — Centro de ayuda de Anthropic: How to create custom skills

URL: https://support.claude.com/en/articles/12512198-how-to-create-custom-skills

- authority: official-docs

Cubre la estructura mínima que requiere una skill (un directorio que contenga SKILL.md), los campos obligatorios del frontmatter YAML (name y description) y el rango que va desde unas pocas líneas de instrucciones hasta paquetes complejos con varios archivos y código ejecutable.

Cita clave:
> "Every skill consists of a directory containing at minimum a skill.md file, which is the core of the skill. This file must start with a YAML frontmatter to hold name and description fields, which are required metadata."

## S5 — Análisis a fondo de Claude Skills (una mirada desde los primeros principios)

URL: https://leehanchung.github.io/blogs/2025/10/26/claude-skills-deep-dive/

- authority: authoritative-guide

Analiza la estructura de SKILL.md desde los primeros principios: cómo el frontmatter configura el HOW (permisos, modelo, metadatos), cómo el contenido define el WHAT que se ejecuta y cómo se aplica progressive disclosure a las skills.

Cita clave:
> "The frontmatter configures HOW the skill runs (permissions, model, metadata), while the markdown content tells Claude WHAT to do."

## S6 — Building skills for Claude, en la práctica: frontmatter YAML y pruebas

URL: https://sjramblings.io/building-skills-for-claude-part-2/

- authority: authoritative-guide

Ofrece la fórmula para redactar el campo description del frontmatter (What it does + When to use it + Key capabilities), ejemplos de descripciones buenas frente a malas y buenas prácticas para el ciclo de pruebas.

Cita clave:
> "The description is the single most important field in your frontmatter. A bad description means your skill either never triggers or triggers on everything. The formula: What it does + When to use it + Key capabilities."

## S7 — The complete guide to building skills for Claude (PDF)

URL: https://resources.anthropic.com/hubfs/The-Complete-Guide-to-Building-Skill-for-Claude.pdf

- authority: official-docs

La guía completa oficial de Anthropic, que abarca el uso consistente de skills en Claude.ai, Claude Code y la API, métodos para identificar los flujos de trabajo que vale la pena automatizar y cómo conviven las skills con los servidores MCP.

Cita clave:
> "Skills work identically across Claude.ai, Claude Code, and API. Create a skill once and it works across all surfaces without modification."

## S8 — Claude Code skills: flujos de trabajo .NET y prompts reutilizables

URL: https://codewithmukesh.com/blog/skills-claude-code/

- authority: authoritative-guide

Explica la diferencia entre Skills, Rules (CLAUDE.md) y Hooks; la práctica de control de versiones para las skills de proyecto; el patrón de delegación en subagentes; y la implementación de cinco patrones de skills de nivel productivo.

Cita clave:
> "Skills vs Rules vs Hooks: Skills for what to do (workflows), Rules for how things are (conventions), Hooks for what happens automatically (triggers)."

## S9 — Teach Claude Code your workflow: guía práctica de skills personalizadas

URL: https://medium.com/@n913239/teach-claude-code-your-workflow-a-hands-on-guide-to-custom-skills-8bc35d4a11ed

- authority: blog

Comparte la visión de un profesional sobre la diferencia entre personal skills y project skills, los escenarios donde sirven las bundled skills y un ejemplo de cómo mejorar la calidad de salida de una skill con scripts de posprocesado (pandoc + python-docx para los bordes de tablas de Word).

Cita clave:
> "Personal Skills are for your own habits — things like code cleanup or file conversion that you use across every project. Project Skills are for project-specific workflows."

## S10 — Las skills de Claude como runbooks autodocumentados

URL: https://zackproser.com/blog/claude-skills-internal-training

- authority: blog

Describe el valor propio de las skills para el trabajo en equipo: SKILL.md es a la vez documentación legible por personas y una especificación ejecutable por la IA, lo que elimina la deriva entre los runbooks tradicionales y el código que los implementa.

Cita clave:
> "The SKILL.md file that Claude reads to understand the workflow? You can read it too. It's plain English instructions alongside the actual implementation code. The documentation is the executable specification - they can't drift apart because they're the same thing."