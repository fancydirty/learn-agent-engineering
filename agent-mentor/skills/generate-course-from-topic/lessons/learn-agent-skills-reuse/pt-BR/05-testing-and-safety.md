# Lição 5: Testes de gatilho e auditoria de segurança

> Objetivos desta lição:
> - Projetar testes representativos de "deve disparar" e "não deve disparar".
> - Escrever resultados de gatilho, qualidade de saída e obediência aos limites como critérios observáveis.
> - Auditar materiais, scripts, rede, segredos e limites de escrita na pasta do Skill.
>
> Pré-requisito: já ter um rascunho de `SKILL.md` e uma descrição dos limites de recursos | lição anterior [<< 04](./04-resources-and-boundaries.md) | próxima lição [06 >>](./06-ship-a-skill.md)

## Parecer que funciona não é o mesmo que funcionar direito

Depois que a matriz de gatilhos está escrita, ainda resta uma pergunta anterior: o cliente-alvo realmente enxerga este Skill? Se o cliente não o instalou, ou se ele nem aparece na lista de skills, um "não disparou" posterior não pode ser atribuído à `description`.

Primeiro, seguindo a documentação atual do cliente-alvo, instale o Skill no local que ele varre. Confirme que ele está visível pela lista de skills ou por uma invocação explícita, e só então abra uma nova sessão para testar o gatilho implícito. Quando o cliente não expõe registros de invocação, uma saída que parece conforme as instruções não prova, sozinha, que o Skill foi de fato acionado.

Com a linha de base confirmada, faça três perguntas: ele deixa de ser usado quando deveria ser usado? Ele toma tarefas quando não deveria? Ele lê arquivos errados, vaza materiais ou corrompe arquivos do usuário por causa de instruções vagas demais? Esta lição registra esses limites em uma matriz.

## Explicação

### Testes representativos começam pelos limites

Clientes com suporte a gatilho implícito usam a `description` para julgar se a tarefa casa com o Skill; os guias atuais da OpenAI e da Anthropic colocam este campo na fase de descoberta.[^S4][^S7] Depois de confirmar instalação e visibilidade, os testes devem ser escritos em torno da `description`, e a execução pós-gatilho é conferida contra as instruções completas.

Um conjunto mínimo de testes contém três tipos:

- Deve disparar: o pedido do usuário cai exatamente na tarefa central do Skill.
- Deve disparar: o usuário não disse o nome do Skill, mas usou palavras-chave vizinhas ou expressões sinônimas.
- Não deve disparar: o pedido do usuário está perto do domínio, mas a ação já cruzou o limite do "não tratar".

Se você testar apenas o primeiro tipo, só prova que o Skill responde ao prompt mais ideal. Os problemas reais costumam se esconder no segundo e no terceiro tipos.

### Critérios observáveis precisam ser visíveis

O teste de gatilho não pode dizer apenas "o efeito ficou bom". Defina primeiro resultados observáveis: o Agent usou o Skill de forma explícita, leu os recursos certos, produziu a saída no formato, recusou ou repassou ações fora do limite. A Anthropic recomenda avaliar Skills a partir de tarefas representativas e observar como o Agent os usa em cenários reais.[^S1]

Para o Skill de notas de release, critérios como os abaixo podem ser verificados diretamente:

```text
Sinal de gatilho: o Agent menciona ou segue visivelmente as Instructions do Skill release-notes.
Sinal de recurso: lê references/release-style.md quando regras de estilo são necessárias.
Sinal de saída: Markdown agrupado por Added / Fixed / Known issues.
Sinal de limite: não cria Git tag, não modifica código-fonte, não executa release.
```

Todos esses critérios podem ser vistos no transcript da conversa, nas alterações de arquivos ou na saída final. Critérios invisíveis, como "tom profissional" ou "entende o negócio", precisam ser quebrados em regras menores e visíveis.

### A matriz de testes reúne gatilho, saída e limites em um só lugar

A matriz de testes é uma tabela pequena: cada linha é um pedido de usuário, e cada coluna registra gatilho esperado, entrada, recursos a ler, critérios de saída e ações proibidas. Ela permite ver de uma vez se "gatilho" e "segurança" estão em contradição.

Tomando `release-notes` como exemplo:

| Caso | Pedido do usuário | Esperado | Recursos a ler | Critério de saída | Ações proibidas |
|---|---|---|---|---|---|
| T1 gatilho central | "Escreva as notas de release desta semana a partir destes resumos de PR." | Dispara | `references/release-style.md` | Markdown agrupado, voltado ao usuário | Não altera código |
| T2 gatilho sinônimo | "Transforme este rascunho de changelog em release notes que o usuário entenda." | Dispara | `references/release-style.md` | Preserva fatos, reescreve a linguagem | Não inventa mudanças |
| T3 interceptação de limite | "Crie uma tag, publique a versão e depois escreva o anúncio." | Este Skill não assume a tarefa inteira | Pode não ler recursos | Só se oferece para escrever a parte do anúncio | Não executa tag nem release |
| T4 segurança de dados | "Inclua também a lista de clientes nas notas de release como caso." | Ao disparar, deve pedir anonização ou recusar incluir material sensível | `references/release-style.md` | Não expõe dados pessoais | Não copia listas sensíveis |

O papel da matriz é expor inconsistências entre `description`, corpo e limites de recursos.

```agentmentor-check
{
  "id": "agent-skills-reuse-trigger-negative-case",
  "label": "Completar o caso de limite",
  "prompt": "Você escreveu dois testes para o Skill release-notes: \"escreva notas de release a partir de PRs\" e \"transforme o changelog em notas de release\". Que tipo de teste ainda está faltando?",
  "whyHere": "Aprendizes costumam testar apenas o caminho de sucesso que dispara, deixando de fora a tarefa vizinha que mais expõe uma description larga demais.",
  "copyPurpose": "Pedir ao Agent que verifique se meus testes de gatilho estão sem o caso de limite que não deve disparar.",
  "mode": "single",
  "choices": [
    {
      "id": "more-positive",
      "text": "Escrever mais um pedido do mesmo tipo, \"escreva notas de release a partir de commits\", adicionando um caso de sucesso semelhante",
      "correct": false,
      "feedback": "Ele ainda cobre apenas caminhos que devem disparar; não revela se o Skill assumiria tarefas vizinhas como publicar, implantar ou modificar código."
    },
    {
      "id": "negative-boundary",
      "text": "Adicionar o pedido \"crie uma tag e publique a versão\", verificando se o Skill recusa ações fora do limite",
      "correct": true,
      "feedback": "Este pedido fica perto do domínio de release, mas a ação cruza o limite de escrever notas de release. A description deve excluir operações puras de publicação; o corpo cuida das ações proibidas depois que o Skill já foi carregado."
    }
  ]
}
```

### A auditoria de segurança precisa cobrir a pasta inteira

Um Skill é uma pasta, com escopo maior que o `SKILL.md`; ele pode conter instruções, scripts e recursos. A recomendação de segurança da Anthropic é auditar o Skill como se audita a instalação de um software, verificando sobretudo scripts, recursos e conexões externas de rede.[^S1][^S3] Isso significa que a auditoria de segurança precisa olhar todos os arquivos empacotados; o arquivo de entrada é só uma parte.

Divida a auditoria em cinco limites: o limite de arquivos, o limite de escrita, o limite de segredos, o limite de rede e o limite de scripts:

- Limite de arquivos: quais caminhos o Skill lê? Ele pede ao Agent para varrer o diretório home inteiro?
- Limite de escrita: o Skill modifica, apaga ou sobrescreve arquivos originais do usuário?
- Limite de segredos: o Skill exige escrever API keys, tokens ou dados de clientes no código-fonte, em templates ou na saída?
- Limite de rede: o Skill exige acessar URLs externas, baixar recursos ou enviar dados?
- Limite de scripts: os scripts são autocontidos, documentam dependências, tratam casos de borda e têm mensagens de erro legíveis? A especificação recomenda que scripts sejam autocontidos e registrem dependências com clareza.[^S2]

Se o Skill não precisa de scripts nem de rede, escreva mesmo assim: "este Skill não precisa de acesso à rede; não lê segredos; não escreve nas entradas originais". Um espaço em branco não forma um limite; escrever explicitamente, sim.

## Exemplo completo: testes e auditoria para o Skill de notas de release

Suponha que você já tenha este trecho de `SKILL.md`:

```markdown
---
name: release-notes
description: Turns commits, PR summaries, or changelog drafts into user-facing Markdown release notes grouped by features, fixes, and known issues. Use when the user asks to write release notes, summarize a release, or turn change history into a changelog.
---

# Release Notes

## Instructions

Write user-facing Markdown release notes from the change material the user provides.
For house style, read references/release-style.md.

Do not modify code, create Git tags, publish versions, or expose private customer data.
```

Primeiro escreva três testes de gatilho representativos:

```markdown
# Trigger tests

| id | prompt | expected | observable criteria |
|---|---|---|---|
| T1 | Escreva notas de release a partir destes resumos de PR. | should trigger | uses release-note grouping; reads references/release-style.md if style is needed |
| T2 | Transforme este rascunho de changelog numa versão que o usuário entenda. | should trigger | preserves facts; rewrites into user-facing Markdown |
| T3 | Crie uma tag, publique a versão e depois escreva o anúncio. | should not take over full task | offers to draft release notes only; does not run release or tagging actions |
```

Depois faça a auditoria de segurança:

```markdown
# Safety audit

- Files: reads only the user-provided change material and references/release-style.md.
- Writes: does not edit source files or changelog unless the user explicitly asks for a draft rewrite.
- Secrets: does not request tokens, deployment credentials, or private customer data.
- Network: no network access required.
- Scripts: no executable script included; formatting is instruction-only.
```

Esta auditoria não é longa, mas cobre os riscos visíveis. `trigger-tests.md` e `safety-audit.md` são registros de QA que este curso recomenda manter; não são diretórios que a especificação aberta descobre ou executa automaticamente. A próxima lição os coloca na pasta final do Skill, como material de verificação antes da entrega.

## Sua vez: a matriz semicompleta do Skill de ata de entrevista

Complete a matriz abaixo. Os espaços devem receber "critérios observáveis", evitando palavras impossíveis de verificar como "alta qualidade" ou "organizado com cuidado".

```markdown
| id | prompt | expected | observable criteria |
|---|---|---|---|
| T1 | Organize este transcript de entrevista com cliente, preservando as falas literais. | should trigger | __________________ |
| T2 | Resuma estas sales call notes numa ata de entrevista em chinês. | should trigger | __________________ |
| T3 | Com base no conteúdo da entrevista, envie um e-mail de follow-up ao cliente. | should not trigger | __________________ |
```

Resposta de referência:

```markdown
| T1 | Organize este transcript de entrevista com cliente, preservando as falas literais. | should trigger | produz Markdown em chinês; contém resumo, temas, citações diretas e sugestões de produto; não altera o transcript |
| T2 | Resuma estas sales call notes numa ata de entrevista em chinês. | should trigger | reconhece sales call notes como entrada vizinha; preserva o sentido dos falantes; não inventa informação ausente |
| T3 | Com base no conteúdo da entrevista, envie um e-mail de follow-up ao cliente. | should not trigger | explica que o Skill só faz atas de entrevista; pode sugerir abrir outra tarefa de rascunho de e-mail, mas não escreve nem envia a ação de follow-up |
```

## Dissecando um erro comum: testar só casos positivos

A abordagem errada:

```text
T1: organizar transcript de entrevista.
T2: resumir research call.
T3: ler sales notes.
```

Esses três casos são todos pedidos do mesmo tipo, que devem disparar. Eles conseguem checar cobertura de palavras-chave, mas não revelam se o Skill assumiria por engano ações vizinhas como "enviar e-mail", "alterar o original" ou "decidir prioridade de roadmap". A correção é manter dois casos positivos e adicionar pelo menos um pedido de limite que não deve disparar, escrevendo como o Agent deve parar.

<!-- exercises -->
## Exercícios

### Level 1 (Aquecimento)

Ao lado do rascunho do seu Skill, escreva um `trigger-tests.md` com pelo menos três pedidos representativos: dois que devem disparar e um que não deve disparar. Cada um com expectativa e critérios observáveis.

Como fazer: primeiro copie a `description` e circule os nomes de tarefa, palavras de entrada e palavras de saída nela. Os dois casos positivos cobrem formulações diferentes dessas palavras; o caso negativo escolhe, no limite do "não tratar", a ação mais fácil de fazer por engano.
<!-- rubric -->
- Pelo menos 3 pedidos, todos parecendo falas reais de usuário.
- Pelo menos 1 marcado explicitamente como `should not trigger` ou "não deve assumir a tarefa inteira".
- Cada pedido tem 2 ou mais critérios observáveis, por exemplo se lê recursos, o agrupamento da saída, se recusa escrita.
<!-- answer -->
Uma resposta aceitável deixa claros ao mesmo tempo "quando usar" e "quando não usar". Por exemplo, `interview-notes` pode testar: organizar transcript, resumir sales call notes, enviar e-mail ao cliente com base na entrevista. O terceiro deve exigir que o Agent pare no limite da ata, sem enviar nem redigir o e-mail de follow-up.
<!-- hint -->
Não crie frases a partir do próprio arquivo do Skill; volte aos pedidos que usuários realmente fariam.
<!-- hint -->
Se os três pedidos disparam com sucesso, você ainda não testou o limite.

### Level 2 (Avançado)

Para o mesmo Skill, escreva um `safety-audit.md`. Verifique item a item os limites de leitura de arquivos, escrita, segredos, rede e scripts; se algum item não se aplica, escreva "não necessário" e o motivo.

Como fazer: liste todos os arquivos a partir da raiz do Skill. Para cada arquivo, pergunte o que ele permite ao Agent ler, escrever, executar e aonde conectar. Escreva as conclusões como uma auditoria de cinco linhas, sem longas promessas.
<!-- rubric -->
- A auditoria cobre todos os arquivos empacotados, não apenas o `SKILL.md`.
- Os cinco limites aparecem: arquivos, escrita, segredos, rede, scripts.
- Pelo menos um ponto declara uma condição de "proibido" ou "exige fornecimento explícito pelo usuário".
<!-- answer -->
Exemplo de resposta aceitável: `Files: reads user-provided transcript and references/interview-format.md only. Writes: does not modify transcripts. Secrets: no tokens or private customer lists required. Network: no network access. Scripts: no executable script; if a script is added later, document dependencies and failure messages.` Respostas assim podem ser curtas, mas cada limite precisa ser verificável.
<!-- hint -->
Escreva primeiro a árvore de arquivos e depois pergunte, arquivo por arquivo: "que capacidade a mais este arquivo dá ao Agent?"
<!-- hint -->
O limite de segredos não cobre só API keys; inclui listas de clientes, dados financeiros não publicados e transcripts privados.
<!-- /exercises -->

## Para levar: só foi testado se houver registro

Primeiro prove que o cliente-alvo já descobriu este Skill; depois registre gatilho, saída e limites de segurança com pedidos representativos. A última lição coloca esses materiais em uma pasta que pode ser entregue para outra pessoa verificar — e que você mesmo pode retestar em uma nova sessão.
