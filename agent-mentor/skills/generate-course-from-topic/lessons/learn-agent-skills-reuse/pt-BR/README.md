---
domain: Agent Engineering
tags: [Agent Skills, workflow, beginner, Claude Code, Codex]
lang: pt-BR
---
# Agent Skills: introdução à reutilização de workflows

Este curso ensina criadores e desenvolvedores independentes que já usam Claude Code, Codex ou Agents semelhantes a transformar prompts descartáveis em um Skill que o Agent consegue descobrir, carregar sob demanda e testar de novo. O curso gira em torno da especificação aberta de arquivos Agent Skills; não cobre treinamento de modelos, implementação de servidores MCP, plataformas de distribuição de plugins nem metodologias completas de domínios de negócio específicos.

**Ao concluir o curso, você será capaz de:**
- Distinguir os limites de responsabilidade entre um prompt descartável, um Skill e ferramentas externas.
- Escrever metadados de `SKILL.md` conformes com a especificação e fáceis de acionar.
- Organizar materiais e operações determinísticas em camadas com `references/`, `assets/` e `scripts/`.
- Projetar testes de acionamento, de limites e de qualidade de saída para um Skill, registrando as falhas.
- Entregar, no seu próprio workflow, uma pasta de Skill instalável e retestável.

**Pré-requisitos:** saber usar um coding agent, criar diretórios e editar arquivos Markdown; não é preciso saber escrever Python, JavaScript ou chamar APIs.

**Ambiente de prática:** use seu próprio IDE, terminal e Agent. O curso não oferece ambiente de execução embutido nem exige upload de arquivos privados.

## Curso

| # | Tema | Você vai aprender |
|---|---|---|
| 01 | [Prompt descartável e Skill reutilizável](./01-prompt-to-skill.md) | Julgar que trabalho vale a pena encapsular e quais são os limites de um Skill. |
| 02 | [Metadados do SKILL.md e description de gatilho](./02-skill-metadata.md) | Escrever nome, descrição e entrada mínima de instruções conforme a especificação. |
| 03 | [Progressive disclosure e camadas de recursos](./03-progressive-disclosure.md) | Dividir materiais longos em níveis que o Agent lê sob demanda. |
| 04 | [Recursos, scripts e limites de execução](./04-resources-and-boundaries.md) | Decidir o que fica com o modelo e o que vai para scripts determinísticos. |
| 05 | [Testes de gatilho e auditoria de segurança](./05-testing-and-safety.md) | Testar com tarefas representativas os riscos de falso gatilho, gatilho perdido e excesso de alcance. |
| 06 | [Do workflow ao Skill entregável](./06-ship-a-skill.md) | Concluir um ciclo de construção, auditoria e entrega em um workflow real. |

> Fontes e limites de versão em [sources.md](./sources.md).
