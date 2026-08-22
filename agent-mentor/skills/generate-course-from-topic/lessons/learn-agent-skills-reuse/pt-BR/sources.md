# Sources

<!-- registry: A8 -->

## S1 — Anthropic: Equipping agents for the real world with Agent Skills
URL: https://www.anthropic.com/engineering/equipping-agents-for-the-real-world-with-agent-skills
- authority: official-docs
- supports: Sustenta que um Skill é um diretório contendo SKILL.md, instruções, scripts e recursos, além dos princípios de progressive disclosure, avaliação e auditoria de segurança.
- key-fact: “A skill is a directory containing a SKILL.md file that contains organized folders of instructions, scripts, and resources.”

## S2 — Agent Skills: Specification
URL: https://agentskills.io/specification
- authority: official-docs
- supports: Sustenta os campos de frontmatter, as restrições de nomenclatura, as informações de gatilho da description e as restrições de formato dos diretórios opcionais.
- key-fact: “The SKILL.md file must contain YAML frontmatter followed by Markdown content.”

## S3 — Anthropic: Agent Skills overview
URL: https://platform.claude.com/docs/en/agents-and-tools/agent-skills/overview
- authority: official-docs
- supports: Sustenta como Skills são carregados nos produtos Claude, o progressive disclosure e os limites de segurança.
- key-fact: “Skills use progressive disclosure to manage context efficiently.”

## S4 — OpenAI: Build skills
URL: https://learn.chatgpt.com/docs/build-skills
- authority: official-docs
- supports: Sustenta Agent Skills como formato de workflow reutilizável no ChatGPT, no Codex e no padrão aberto, além do gatilho implícito/explícito e do escopo de descoberta no repositório.
- key-fact: “Use agent skills to extend ChatGPT and Codex with task-specific capabilities.”

## S5 — Anthropic: Building effective agents
URL: https://www.anthropic.com/engineering/building-effective-agents
- authority: official-docs
- supports: Sustenta começar pela solução combinável mais simples possível e distinguir workflows de Agents que exigem decisão autônoma.
- key-fact: “We recommend finding the simplest solution possible, and only increasing complexity when needed.”

## S6 — Agent Skills: skills-ref reference library
URL: https://github.com/agentskills/agentskills/tree/main/skills-ref
- authority: official-docs
- supports: Sustenta os pré-requisitos reais de instalação e o formato de comando de `skills-ref validate path/to/skill`; o mesmo repositório declara que a biblioteca serve apenas para demonstração e não deve ser tomada como garantia de produção.
- key-fact: “skills-ref validate path/to/skill”

## S7 — Anthropic: Agent Skills best practices
URL: https://platform.claude.com/docs/en/agents-and-tools/agent-skills/best-practices
- authority: official-docs
- supports: Sustenta transversalmente as restrições dos campos de frontmatter, o progressive disclosure, os testes representativos, a estratificação de arquivos e os limites de scripts.
- key-fact: “At startup, only the metadata (name and description) from all Skills is pre-loaded.”
