# Fontes

Todos os fatos e definições centrais deste curso vêm dos materiais a seguir. As citações permanecem no idioma original, o inglês.

## S1 — Documentação oficial do Claude Code: Extend Claude Code with skills

URL: https://code.claude.com/docs/en/skills

- authority: official-docs

A fonte do conceito central do curso: explica como as skills funcionam, a estrutura em duas partes de um arquivo SKILL.md (frontmatter YAML + conteúdo Markdown), como as skills são acionadas e invocadas e como elas se relacionam com os custom commands.

Citação principal:
> "Every skill needs a SKILL.md file with two parts: YAML frontmatter between --- markers that tells Claude when to use the skill, and markdown content with the instructions Claude follows when the skill runs."

## S2 — Documentação da plataforma da Anthropic: Agent Skills overview

URL: https://platform.claude.com/docs/en/agents-and-tools/agent-skills/overview

- authority: official-docs

Detalha o mecanismo de carregamento em três níveis das skills (o frontmatter para a descoberta, as instructions para a execução e os supporting files carregados sob demanda), como as skills são usadas nas diferentes superfícies e o princípio de design de progressive disclosure.

Citação principal:
> "Claude operates in a virtual machine with filesystem access, allowing Skills to exist as directories containing instructions, executable code, and reference materials, organized like an onboarding guide you'd create for a new team member."

## S3 — Blog de engenharia da Anthropic: Equipping agents for the real world with Agent Skills

URL: https://www.anthropic.com/engineering/equipping-agents-for-the-real-world-with-agent-skills

- authority: official-docs

Explica a filosofia de design das skills sob a ótica da engenharia: empacotar expertise em recursos combináveis, construir uma skill como quem monta um guia de integração para alguém que acabou de entrar no time e transformar um agente de propósito geral em um agente especializado por meio de skills.

Citação principal:
> "Building a skill for an agent is like putting together an onboarding guide for a new hire. Instead of building fragmented, custom-designed agents for each use case, anyone can now specialize their agents with composable capabilities."

## S4 — Central de ajuda da Anthropic: How to create custom skills

URL: https://support.claude.com/en/articles/12512198-how-to-create-custom-skills

- authority: official-docs

Cobre a estrutura mínima exigida por uma skill (um diretório contendo SKILL.md), os campos obrigatórios do frontmatter YAML (name e description) e o intervalo que vai de poucas linhas de instruções até pacotes complexos com vários arquivos e código executável.

Citação principal:
> "Every skill consists of a directory containing at minimum a skill.md file, which is the core of the skill. This file must start with a YAML frontmatter to hold name and description fields, which are required metadata."

## S5 — Claude Skills em profundidade (uma visão a partir dos primeiros princípios)

URL: https://leehanchung.github.io/blogs/2025/10/26/claude-skills-deep-dive/

- authority: authoritative-guide

Analisa a estrutura do SKILL.md a partir dos primeiros princípios: como o frontmatter configura o HOW (permissões, modelo, metadados), como o conteúdo define o WHAT que será executado e como progressive disclosure se aplica às skills.

Citação principal:
> "The frontmatter configures HOW the skill runs (permissions, model, metadata), while the markdown content tells Claude WHAT to do."

## S6 — Building skills for Claude, na prática: frontmatter YAML e testes

URL: https://sjramblings.io/building-skills-for-claude-part-2/

- authority: authoritative-guide

Traz a fórmula para escrever o campo description do frontmatter (What it does + When to use it + Key capabilities), exemplos de descrições boas e ruins e boas práticas para o ciclo de testes.

Citação principal:
> "The description is the single most important field in your frontmatter. A bad description means your skill either never triggers or triggers on everything. The formula: What it does + When to use it + Key capabilities."

## S7 — The complete guide to building skills for Claude (PDF)

URL: https://resources.anthropic.com/hubfs/The-Complete-Guide-to-Building-Skill-for-Claude.pdf

- authority: official-docs

O guia completo oficial da Anthropic, que cobre o uso consistente de skills no Claude.ai, no Claude Code e na API, métodos para identificar fluxos de trabalho que valem a pena automatizar e como as skills funcionam junto com servidores MCP.

Citação principal:
> "Skills work identically across Claude.ai, Claude Code, and API. Create a skill once and it works across all surfaces without modification."

## S8 — Claude Code skills: fluxos de trabalho .NET e prompts reutilizáveis

URL: https://codewithmukesh.com/blog/skills-claude-code/

- authority: authoritative-guide

Explica a diferença entre Skills, Rules (CLAUDE.md) e Hooks; a prática de controle de versão para skills de projeto; o padrão de delegação a subagentes; e a implementação de cinco padrões de skills de nível de produção.

Citação principal:
> "Skills vs Rules vs Hooks: Skills for what to do (workflows), Rules for how things are (conventions), Hooks for what happens automatically (triggers)."

## S9 — Teach Claude Code your workflow: guia prático de skills personalizadas

URL: https://medium.com/@n913239/teach-claude-code-your-workflow-a-hands-on-guide-to-custom-skills-8bc35d4a11ed

- authority: blog

Compartilha a visão de um profissional sobre a diferença entre personal skills e project skills, os cenários em que as bundled skills ajudam e um exemplo de como melhorar a qualidade da saída de uma skill com scripts de pós-processamento (pandoc + python-docx para as bordas de tabelas do Word).

Citação principal:
> "Personal Skills are for your own habits — things like code cleanup or file conversion that you use across every project. Project Skills are for project-specific workflows."

## S10 — Skills do Claude como runbooks autodocumentados

URL: https://zackproser.com/blog/claude-skills-internal-training

- authority: blog

Descreve o valor próprio das skills para a colaboração em equipe: o SKILL.md é ao mesmo tempo documentação legível por pessoas e uma especificação executável pela IA, o que elimina a divergência entre os runbooks tradicionais e o código que os implementa.

Citação principal:
> "The SKILL.md file that Claude reads to understand the workflow? You can read it too. It's plain English instructions alongside the actual implementation code. The documentation is the executable specification - they can't drift apart because they're the same thing."