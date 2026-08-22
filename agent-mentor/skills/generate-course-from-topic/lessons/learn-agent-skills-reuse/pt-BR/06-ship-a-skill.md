# Lição 6: Do workflow ao Skill entregável

> Objetivos desta lição:
> - Montar uma pasta de Skill completa com `SKILL.md`, arquivos de referência, template ou descrição do limite de scripts.
> - Confirmar que o arquivo de entrada é válido usando a ferramenta de validação da especificação ou a checagem manual equivalente.
> - Executar 3 testes representativos no seu próprio Agent, registrando falhas e revisões.
>
> Pré-requisito: ter concluído a matriz de testes de gatilho e a auditoria de segurança | lição anterior [<< 05](./05-testing-and-safety.md) | próxima página [Sumário do curso >>](./README.md)

## O entregável é um conjunto de arquivos revisáveis

A esta altura, você já tem `SKILL.md`, estratificação de recursos, limites de execução, testes de gatilho e auditoria de segurança. O último passo é colocar tudo em uma pasta que outra pessoa consiga verificar, que o Agent consiga ler e que você mesmo consiga retestar.

O destino desta lição é concreto: uma pasta de Skill completa, com pelo menos o arquivo de entrada, um arquivo em `references/`, um template ou a descrição do limite de scripts, e o registro de 3 testes representativos. Esse destino não exige que você escreva código executável.

## Explicação

### A pasta completa começa pela forma

A especificação aberta define o Skill como um diretório que contém pelo menos um `SKILL.md`, e convenciona `scripts/`, `references/` e `assets/` para organizar o conteúdo opcional comum. O guia atual da OpenAI adota a mesma forma de diretório.[^S2][^S4]

Este curso usa uma forma mínima de entrega, adequada para iniciantes:

```text
release-notes/
  SKILL.md
  references/
    release-style.md
  assets/
    release-notes-template.md
  tests/
    trigger-tests.md
  safety-audit.md
```

`SKILL.md` é a entrada; `references/release-style.md` guarda detalhes de estilo e limites; `assets/release-notes-template.md` guarda o esqueleto fixo de saída; `tests/trigger-tests.md` guarda os três testes representativos; `safety-audit.md` registra quais riscos você verificou.

Há um limite fácil de confundir aqui: `tests/` e `safety-audit.md` são registros de QA criados por este curso, e não diretórios de descoberta automática convencionados pela especificação. Eles ficam na pasta para que o próximo mantenedor veja o processo de testes e revisões.

### A validação tem duas camadas: checagem de especificação e checagem manual equivalente

Se você já instalou a biblioteca de referência seguindo as instruções do repositório `skills-ref`, e o comando está disponível no seu ambiente virtual atual, pode usá-la para checar o frontmatter do `SKILL.md` e as restrições de nomenclatura. A biblioteca é explicitamente marcada como material de demonstração, então este curso sempre mantém a checagem manual equivalente.[^S2][^S6]

```text
1. O nome da pasta é exatamente igual ao name do frontmatter.
2. O SKILL.md começa com --- já na primeira linha.
3. O frontmatter pode ser lido como YAML.
4. O name contém apenas letras minúsculas, dígitos e hífens; não começa nem termina com hífen; sem hífens consecutivos.
5. A description é não vazia e diz o que faz e quando usar.
6. O corpo aponta para caminhos relativos de `references/` ou `assets/` que existem de verdade.
```

A validação não prova que o Skill funciona bem; só prova que o arquivo de entrada não tem erros estruturais grosseiros. Se funciona bem de verdade, quem responde são os três testes representativos.

### Os três testes devem rodar no seu próprio Agent

ChatGPT e Codex suportam invocação explícita e implícita; a invocação implícita depende de a tarefa casar com a `description`. O guia atual da Anthropic também adota um processo de descoberta que olha primeiro os metadados e só depois lê o texto completo.[^S4][^S7] Antes de testar, instale o Skill conforme a documentação atual do cliente-alvo, confirme que ele está visível pela lista de skills ou por invocação explícita, e então abra uma nova sessão para cada caso de teste do gatilho implícito. Quando o cliente não mostra registros de invocação, uma saída parecida só indica resultado parecido — não prova, sozinha, que houve gatilho.

Cada teste registra quatro itens:

```text
Prompt: texto original do pedido do usuário
Expected: should trigger / should not trigger
Observed: o que o Agent realmente fez
Revision: se a mudança vai na description, no corpo, nos recursos ou no próprio teste
```

Se o Skill está confirmado como visível mas o Agent não disparou, não transforme a `description` direto numa lista longa. Olhe primeiro o que está faltando: palavra de gatilho, palavra de entrada, palavra de saída, ou uma desambiguação negativa larga demais. Depois da mudança, rode de novo o mesmo teste em uma nova sessão.

### O registro de falhas faz parte do entregável

Um Skill entregável não deve esconder falhas. A Anthropic recomenda observar como uma nova sessão usa o Skill em tarefas representativas e revisar com base nos resultados reais.[^S1][^S7] Por isso o `tests/trigger-tests.md` deve preservar o registro de falhas e o registro de revisões.

Formato recomendado:

```markdown
| id | expected | observed | revision |
|---|---|---|---|
| T1 | should trigger | triggered and used template | no change |
| T2 | should trigger | did not trigger on "customer-facing changelog" | add "customer-facing changelog" to description |
| T3 | should not trigger | offered to create Git tag | add "Do not create Git tags" to Instructions |
```

Esse registro leva o Skill de "escrito uma vez" para "mantível". Da próxima vez que você — ou outro Agent — assumir, ficará claro por que determinada frase está ali.

## Exemplo completo: a pasta do Skill de notas de release

Abaixo está um Skill `release-notes` completo, porém bem pequeno. Ele não precisa de scripts; usa apenas arquivo de referência e template.

```text
release-notes/
  SKILL.md
  references/
    release-style.md
  assets/
    release-notes-template.md
  tests/
    trigger-tests.md
  safety-audit.md
```

`SKILL.md`:

```markdown
---
name: release-notes
description: Turns commits, PR summaries, customer-facing changelog drafts, or change lists into user-facing Markdown release notes. Use when the user asks to write release notes, summarize a release, or turn change history into a changelog. Do not use for tagging, deployment, or publishing operations.
---

# Release Notes

## Instructions

Use this skill when the user asks for user-facing release notes from commits, PR summaries, changelog drafts, or change lists.

Read references/release-style.md before writing if the user asks for house style, audience tone, or wording rules.

Use assets/release-notes-template.md for the output structure unless the user provides a different structure.

Return Markdown grouped by Added, Fixed, Changed, and Known issues. Preserve the facts in the input. Mark missing facts as open questions instead of inventing them.

Do not modify source code, create Git tags, deploy, publish, send announcements, or expose private customer data.
```

`references/release-style.md`:

```markdown
# Release style

- Write for product users, not internal engineers.
- Keep each bullet under 25 words when possible.
- Start each bullet with the user-visible change.
- Avoid commit hashes unless the user asks for an engineering changelog.
- If a change affects privacy, reliability, or data loss, keep the warning explicit.
```

`assets/release-notes-template.md`:

```markdown
# Release notes

## Added

- 

## Changed

- 

## Fixed

- 

## Known issues

- 

## Open questions

- 
```

`tests/trigger-tests.md`:

```markdown
| id | prompt | expected | observed | revision |
|---|---|---|---|---|
| T1 | Escreva notas de release a partir destes resumos de PR. | should trigger | pending | pending |
| T2 | Transforme o rascunho de customer-facing changelog em release notes mais claras. | should trigger | pending | pending |
| T3 | Crie uma tag, publique a versão e depois escreva o anúncio. | should not take over full task | pending | pending |
```

`safety-audit.md`:

```markdown
# Safety audit

- Files: reads only user-provided change material, references/release-style.md, and assets/release-notes-template.md.
- Writes: produces draft Markdown in the conversation unless the user explicitly asks for a file path.
- Secrets: does not request deployment credentials, API keys, private customer lists, or unreleased financial data.
- Network: no network access required.
- Scripts: no executable script included; formatting is instruction-only.
```

Na entrega, valide a estrutura primeiro. Se você instalou a ferramenta de validação da especificação, siga as instruções dela; se não, percorra uma a uma as seis checagens manuais anteriores. Em seguida, coloque o Skill num local que o Agent-alvo consiga ler, confirme a visibilidade pela lista de skills ou por invocação explícita, e rode os pedidos T1, T2 e T3 cada um em uma nova sessão, para que um teste não contamine o julgamento do seguinte. Se o cliente não oferece registro de invocação, anote "a saída segue as regras" como evidência de resultado, e não como evidência de gatilho.

## Sua vez: o rascunho do Skill de pesquisa de concorrentes

Complete as duas posições abaixo: a `description` precisa dizer quando disparar, e o `references/research-boundaries.md` precisa segurar um limite de segurança.

```text
competitor-research/
  SKILL.md
  references/
    research-boundaries.md
  assets/
    competitor-brief-template.md
  tests/
    trigger-tests.md
  safety-audit.md
```

`SKILL.md` semicompleto:

```markdown
---
name: competitor-research
description: ________________________________________
---

# Competitor Research

## Instructions

Use this skill to turn user-provided competitor notes, public website excerpts, or product comparison notes into a structured competitor brief.

Read references/research-boundaries.md before writing the brief.

Use assets/competitor-brief-template.md for the output structure.
```

`references/research-boundaries.md` semicompleto:

```markdown
# Research boundaries

- Use only sources or excerpts the user provides in the task.
- ________________________________________
- Mark unsupported claims as "unverified" instead of presenting them as fact.
```

Resposta de referência:

```yaml
description: Turns user-provided competitor notes, public website excerpts, or product comparison notes into a structured competitor brief. Use when the user asks to summarize competitors, compare positioning, or prepare competitor research from supplied material. Do not use for scraping, private-data collection, or claims without sources.
```

```markdown
- Do not collect private employee, customer, or account data; ask the user to provide public, sourceable material instead.
```

O ponto central deste exemplo semicompleto: mesmo num Skill de pesquisa, não escreva "pesquisar" como permissão ilimitada. Fontes de entrada e afirmações não verificadas precisam de limites.

```agentmentor-action
mode: reasoning_audit
label: Auditar minha pasta final de Skill
description: Pedir ao Agent que verifique, segundo o destino desta lição, se SKILL.md, arquivos de referência, template ou limite de scripts, três testes e auditoria de segurança são consistentes entre si.
purpose: Já terminei de escrever uma pasta de Skill; verifique se ela atende ao destino deste curso e aponte contradições entre description, caminhos de recursos, testes de gatilho e limites de segurança.
rules:
  - Verifique uma área de risco por vez: estrutura, gatilho, saída, segurança ou registro de testes.
  - Cite os trechos concretos dos arquivos que eu fornecer, sem repetir genericamente conceitos de Agent Skills.
  - Para cada problema, dê uma sugestão de revisão que eu possa editar diretamente.
```

<!-- exercises -->
## Exercícios

### Level 1 (Aquecimento)

No seu diretório de prática, monte a pasta final do Skill. Ela deve conter `SKILL.md`, um arquivo em `references/`, um arquivo de template ou a descrição do limite de scripts, `tests/trigger-tests.md` e `safety-audit.md`.

Como fazer: primeiro desenhe a árvore de arquivos, depois crie os arquivos vazios um a um e, por fim, migre o brief, a descrição de recursos, a matriz de testes e a auditoria de segurança das lições anteriores para as posições correspondentes. Não coloque dados brutos privados.
<!-- rubric -->
- A árvore de arquivos contém pelo menos 5 entregáveis: entrada, referência, template ou limite de scripts, testes, auditoria de segurança.
- Os caminhos relativos citados no `SKILL.md` existem de verdade na pasta.
- O Skill não depende desta página de curso nem de contexto escondido; copiada sozinha, a pasta continua compreensível.
<!-- answer -->
Um entregável aceitável deve parecer: `my-skill/SKILL.md`, `my-skill/references/format.md`, `my-skill/assets/output-template.md`, `my-skill/tests/trigger-tests.md`, `my-skill/safety-audit.md`. Se você optar por não escrever um template, escreva uma descrição clara do limite de scripts, por exemplo um `scripts/README.md` declarando "não contém scripts; se scripts forem adicionados no futuro, devem documentar dependências, entradas, saídas e mensagens de falha".
<!-- hint -->
Comece fazendo o `SKILL.md` citar apenas um arquivo de referência e um template, para reduzir erros de caminho.
<!-- hint -->
Se você não consegue entregar a pasta para outro Agent ler, alguma instrução ainda está escondida na sua conversa.

### Level 2 (Avançado)

Execute uma validação e três testes representativos no Skill final. Se você já instalou e ativou o `skills-ref` conforme as instruções do repositório oficial, pode rodar `skills-ref validate ./your-skill`; caso contrário, execute as seis checagens manuais equivalentes desta lição. Depois rode os 3 testes no seu próprio Agent, escrevendo observed e revision de volta no `tests/trigger-tests.md`.

Como fazer: rode a validação ou a checagem manual no diretório pai do Skill. Depois de confirmar que o cliente-alvo instalou e lista o Skill, envie os três testes ao Agent, cada um em uma nova sessão. Observe se ele dispara, o que lê, o que produz e se ultrapassa o limite, registrando os resultados como estão.
<!-- rubric -->
- O resultado da validação ou as 6 checagens manuais estão registrados.
- Os 3 testes têm `expected`, `observed` e `revision`.
- Pelo menos 1 registro de teste diz "nenhuma mudança necessária" ou "linha tal foi alterada"; não podem ficar todos em branco.
- Se um teste falhar, a posição da revisão está precisa até `description`, corpo, arquivo de referência, template ou caso de teste.
<!-- answer -->
Exemplo de registro aceitável: `T2 expected should trigger; observed did not trigger on "customer-facing changelog"; revision added "customer-facing changelog" to description.` Outro pode ser: `T3 expected should not take over full task; observed offered to tag release; revision added "Do not create Git tags or publish versions" to Instructions.` O registro precisa explicar por que aquela frase mudou; não basta escrever "description ajustada".
<!-- hint -->
Se o Agent não disparou o Skill de forma visível, verifique primeiro se a description contém as palavras de tarefa que aparecem na fala do usuário.
<!-- hint -->
Se o Agent disparou e ultrapassou o limite, corrija primeiro as ações proibidas no corpo; se ele nem deveria ter disparado, ajuste as palavras de escopo da description.
<!-- /exercises -->

## O fim do curso, o começo da manutenção

Você concluiu a tarefa final deste curso: transformar um workflow recorrente em uma pasta de Skill completa, testando gatilho, saída e limites com três pedidos representativos. Na manutenção futura, não apague os registros de falha; trate-os como o histórico de mudanças do Skill. Cada vez que adicionar um recurso, template ou script, atualize junto a matriz de testes e a auditoria de segurança.
