# Lição 4: Recursos, scripts e limites de execução

> Objetivos desta lição:
> - Distinguir os usos de `references/`, `assets/` e `scripts/`.
> - Julgar se um material deve ficar nas instruções, nas referências, em um template ou em um script.
> - Fazer uma estratificação de recursos em uma pasta de Skill real, sem exigir programação.
>
> Pré-requisito: entender camada de metadados, camada de instruções, camada de recursos e carregamento sob demanda | lição anterior [<< 03](./03-progressive-disclosure.md) | próxima lição [05 >>](./05-testing-and-safety.md)

## A camada de recursos também precisa de limites

A Lição 3 tirou os materiais longos de dentro do `SKILL.md`. Mas depois de tirá-los, surge uma nova bagunça: explicações de tags, arquivos de exemplo, templates em branco e comandos de checagem ficam todos juntos, e o Agent não sabe o que é conhecimento, o que é uma forma para copiar e o que é uma ação executável de forma estável.

O mesmo Markdown pode ser regra, material de referência ou template de saída, dependendo de como o Agent deve usá-lo. Aqui o trabalho é julgar o destino de cada conteúdo: continuar nas instruções, servir de leitura para o Agent, servir de cópia para preencher, ou ficar reservado a um script determinístico. Esse julgamento não exige escrever nem rodar scripts.

## Explicação

### `references/`: material de fundo para o Agent ler

`references/` é o lugar de explicações longas, glossários, definições de tags, regras de revisão e análises de exemplos. Sua característica é "ler para julgar". O Agent lê esse material para entender melhor os critérios da tarefa, não para copiá-lo palavra por palavra.

No Skill de ata de entrevista, `references/tag-guide.md` pode explicar as três tags `pain-point`, `workaround` e `buying-signal`, com exemplos de julgamento para cada uma. Ele não deve carregar o esqueleto da saída final, porque o uso principal de uma referência é explicar.

### `assets/`: formas para o Agent reutilizar

`assets/` é o lugar de formatos de saída estáveis e insumos estáticos: atas em branco, templates de configuração, imagens ou tabelas de dados. Templates de texto não precisam de um diretório `templates/` separado; vão direto em `assets/`, com nomes de arquivo que deixem o uso claro. A especificação aberta e o guia atual da OpenAI adotam essa convenção de diretório.[^S2][^S4]

Se a sua ata de entrevista precisa sempre das quatro seções "resumo, evidências em fala literal, temas, perguntas abertas", coloque esse esqueleto em `assets/note-template.md`. O Agent lê esse arquivo quando precisa da forma fixa e depois o preenche com o material do usuário.

### `scripts/`: o lugar das operações determinísticas

`scripts/` serve para operações repetíveis, com regras claras e resultados verificáveis. Por exemplo: checar se um Markdown contém os títulos obrigatórios, converter um CSV para nomes de campo uniformes, verificar se falta um template em um diretório. A documentação oficial lista scripts como parte do que um Skill pode organizar, e também lembra de auditar dependências, recursos e acesso externo à rede antes da instalação.[^S1][^S3]

Este curso não exige que você escreva código. Para julgar se um script merece existir, olhe apenas três pontos: a regra é fixa, fazer à mão é fácil de errar, e o resultado da execução pode ser verificado. Se as respostas forem claras, um script pode ser considerado no futuro; se ainda houver muito julgamento semântico, deixe nas instruções ou nas referências.

### Limite determinístico: o que não deve ir para scripts

O limite determinístico é a linha que separa "a máquina executa por regra" de "o Agent julga por semântica". Scripts são bons em checar se um título existe, se um nome de arquivo casa, se um campo está vazio; o Agent é bom em julgar se uma fala literal de cliente realmente sustenta uma conclusão.

Na ata de entrevista, "checar se a saída contém `## 原话证据`" pode ser um script; "julgar se esta fala é um sinal forte de compra" combina mais com referência mais julgamento do Agent. Empurrar julgamento semântico para dentro de scripts costuma produzir regras que parecem estáveis, mas são rígidas.

Glossário desta lição:

- `references/`: diretório de referências para materiais longos de fundo, explicações de regras e critérios de julgamento.
- `assets/`: diretório de recursos estáticos para templates reutilizáveis, imagens e arquivos de dados.
- `scripts/`: diretório de scripts para operações com regras claras, repetíveis e verificáveis.
- Limite determinístico: a fronteira que separa execução por regra fixa de julgamento semântico.

## Exemplo completo: distribuir quatro tipos de conteúdo no Skill de ata de entrevista

Suponha que você esteja organizando este Skill fictício:

```text
interview-notes/
  SKILL.md
```

Você tem seis itens de conteúdo em mãos:

```text
1. Quando o usuário fornece um transcript, produzir uma ata em Markdown em chinês.
2. Não modificar o transcript original, não inventar falas de cliente.
3. Explicações das tags pain-point, workaround, buying-signal.
4. Um esqueleto fixo de ata.
5. Três transcripts fictícios com os bons exemplos de ata correspondentes.
6. Checar se a saída contém os três títulos "resumo, evidências em fala literal, perguntas abertas".
```

Primeiro distribua as regras de leitura obrigatória. Os itens 1 e 2 devem ser seguidos em toda execução, então ficam no corpo do `SKILL.md`:

```markdown
## Instructions

When the user provides interview transcripts, produce Chinese Markdown notes.
Preserve quoted evidence and do not modify the original transcript.
Do not invent quotes that are not present in the source material.
```

Depois distribua os critérios de julgamento que precisam de explicação. O item 3 pertence às referências:

```text
references/tag-guide.md
```

Seu papel é ajudar o Agent a julgar as tags, não fornecer diagramação fixa para a ata final.

Em seguida distribua a forma reutilizável. O item 4 pertence a um template:

```text
assets/note-template.md
```

O Agent o lê quando o usuário pede uma estrutura fixa e preenche com o conteúdo real.

O item 5 pode ir para `references/examples.md`, porque serve principalmente para entender o que conta como "boa ata". Se os exemplos contiverem informação privada, não podem entrar em um Skill público; aqui é obrigatório usar material público ou fictício.

O item 6 é o que mais se aproxima do limite de script. Sua regra é fixa, a checagem manual é fácil de deixar passar algo, e o resultado consegue responder claramente "qual título está faltando". No futuro pode ficar em:

```text
scripts/check-note-headings.js
```

Mas se você não programa, escrevê-lo primeiro como uma checklist em `references/quality-check.md` também funciona. O importante é não inventar scripts perigosos do nada e não deixar scripts modificarem arquivos do usuário; primeiro deixe os limites claros.

Estrutura final:

```text
interview-notes/
  SKILL.md
  references/
    tag-guide.md
    examples.md
    quality-check.md
  assets/
    note-template.md
  scripts/
    check-note-headings.js
```

O `scripts/` aqui é uma posição futura, não código que esta lição exige implementar agora. Você precisa saber explicar por que ele é uma checagem determinística, e não um julgamento semântico.

```agentmentor-check
{
  "id": "agent-skills-reuse-deterministic-boundary",
  "label": "Apontar o script de checagem de títulos",
  "prompt": "No Skill de ata de entrevista, qual item é o mais adequado para ir no futuro para `scripts/` como checagem determinística?",
  "whyHere": "O limite de scripts é o ponto mais fácil de entender errado nesta lição: nem toda tarefa que parece repetitiva deve virar script.",
  "copyPurpose": "Pedir ao Agent que verifique se estou confundindo julgamento semântico com tarefa de script determinístico.",
  "mode": "single",
  "choices": [
    {
      "id": "semantic",
      "text": "Julgar se uma fala literal de cliente é um sinal forte de compra",
      "correct": false,
      "feedback": "Isso exige entender contexto e força da evidência; combina mais com referência mais julgamento do Agent."
    },
    {
      "id": "deterministic",
      "text": "Checar se a saída contém os três títulos \"resumo, evidências em fala literal, perguntas abertas\"",
      "correct": true,
      "feedback": "A presença de títulos é uma regra fixa e o resultado é fácil de verificar — adequado para virar script no futuro."
    }
  ]
}
```

## Exemplo semicompleto: colocar o conteúdo no lugar certo

Abaixo está a lista de recursos de um Skill de notas de release. Coloque cada item em `SKILL.md`, `references/`, `assets/` ou `scripts/`.

```text
A. Dado o resumo de PRs, produzir notas de release em Markdown voltadas ao usuário.
B. Não criar Git tag, não executar deploy.
C. Explicações de julgamento para "breaking change", "known issue", "migration note".
D. Estrutura fixa das notas de release: novidades, correções, problemas conhecidos.
E. Checar se o Markdown contém os títulos de segundo nível "novidades" e "correções".
```

Complete:

```text
`SKILL.md`: ________________________________
`references/`: ________________________________
`assets/`: ________________________________
`scripts/`: ________________________________
```

Resposta de referência:

```text
`SKILL.md`: A, B. São as instruções centrais e os limites que toda tarefa deve seguir.
`references/`: C. Explica critérios de julgamento, que o Agent precisa ler e entender.
`assets/`: D. É um esqueleto de saída reutilizável, adequado para copiar e preencher.
`scripts/`: E. É uma checagem de títulos fixa, com resultado claramente julgável.
```

Se você colocar C em um script, transforma julgamento semântico em casamento rígido de palavras-chave; se escrever D por extenso dentro do `SKILL.md`, a entrada fica pesada.

<!-- exercises -->
## Exercícios

### Level 1 (Aquecimento)

Escolha um rascunho de Skill que você já escreveu, liste 8 itens de conteúdo e distribua-os em quatro categorias: `SKILL.md`, `references/`, `assets/`, `scripts/`. Não é preciso escrever scripts de verdade; basta indicar quais conteúdos poderiam virar script no futuro.

Como fazer: abra o rascunho ou brief do seu Skill e quebre cada regra, exemplo, template e item de checagem em entradas separadas. Ao lado de cada uma, marque "leitura obrigatória de toda vez", "ler para julgar", "copiar e preencher" ou "checagem fixa".
<!-- rubric -->
- Pelo menos 8 itens de conteúdo listados.
- Pelo menos três das quatro categorias têm conteúdo; se alguma ficar vazia, escreva uma frase de justificativa.
- Cada item tem uma frase explicando a alocação.
- Pelo menos um julgamento semântico inadequado para script é apontado.
<!-- answer -->
Uma resposta aceitável coloca "entrada, saída e limites do que não tratar" no `SKILL.md`, "explicações de termos e exemplos bons e ruins" em `references/`, "esqueleto fixo de relatório" em `assets/`, e checagens fixas como "o título existe, o campo está vazio" como candidatas futuras a `scripts/`. Um erro comum é listar "julgar se o conteúdo tem insight" como script; isso depende demais de semântica e deve voltar para critérios de referência mais julgamento do Agent.
<!-- hint -->
Não pense em nomes de diretório primeiro; apenas cole em cada item uma das quatro etiquetas.
<!-- hint -->
Se uma frase contém "julgar se realmente sustenta a conclusão", ela normalmente não é um script determinístico.

### Level 2 (Avançado)

Faça uma estratificação de recursos na sua pasta de Skill de prática real. É permitido criar apenas arquivos vazios ou de rascunho, mas o resultado precisa formar um diretório legível: `SKILL.md` mais pelo menos dois arquivos de recurso. Não coloque dados privados e não escreva scripts que modifiquem ou apaguem arquivos.

Como fazer: abra a pasta do Skill de prática no IDE ou no terminal. Reduza o corpo do `SKILL.md` às instruções centrais e aos apontamentos de recursos; crie pelo menos um arquivo em `references/` e um em `assets/`. Se achar que algum item combina com script no futuro, crie apenas um `scripts/README.md` explicando o objetivo da checagem, sem código executável.
<!-- rubric -->
- O diretório contém pelo menos `SKILL.md`, um arquivo em `references/` e um arquivo em `assets/`.
- O corpo do `SKILL.md` contém apontamentos de recursos, sem embutir referências longas.
- Os nomes dos arquivos de recurso e os títulos do conteúdo explicam o uso.
- Sem materiais privados reais, sem scripts perigosos, sem comandos que modifiquem arquivos do usuário automaticamente.
<!-- answer -->
Um diretório aceitável pode ser: `SKILL.md`, `references/tag-guide.md`, `assets/note-template.md`, `scripts/README.md`. O `SKILL.md` diz "quando precisar das definições de tags, leia `references/tag-guide.md`; quando precisar da estrutura fixa de saída, leia `assets/note-template.md`." O `scripts/README.md` apenas registra "no futuro, checar se os títulos obrigatórios existem". Assim a estratificação de recursos já está completa, mesmo sem nenhum script executável.
<!-- hint -->
Na pasta real, comece com conteúdo de placeholder bem curto, como um título e duas linhas de explicação.
<!-- hint -->
Se quiser escrever um script, primeiro reescreva como uma frase de objetivo de checagem; esta lição só exige limites claros.
<!-- /exercises -->

## Para levar: um mapa de camadas com lugar para cada coisa

Com a estratificação de recursos concluída, regras de entrada, materiais de referência, formas de saída e checagens fixas têm cada um seu lugar. A próxima lição devolve esse mapa de camadas às tarefas reais, para verificar se o Skill aparece quando deveria, para quando não deve assumir, e se os arquivos anexos não trazem riscos.
