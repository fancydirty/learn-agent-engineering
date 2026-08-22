# Lição 2: A estrutura de metadados do SKILL.md

> Objetivos desta lição:
> - Escrever a estrutura mínima de `SKILL.md` exigida pela especificação aberta.
> - Distinguir as responsabilidades do bloco de metadados e do corpo.
> - Fazer a `description` dizer ao mesmo tempo o que o Skill faz e quando ele dispara.
>
> Pré-requisito: ter concluído um Skill brief de quatro linhas | lição anterior [<< 01](./01-prompt-to-skill.md) | próxima lição [03 >>](./03-progressive-disclosure.md)

## O Agent não vê primeiro as suas instruções completas

Você já tem o brief de quatro linhas, mas se jogá-lo sem critério em um arquivo Markdown, o Agent não necessariamente saberá que aquilo é um Skill, nem quando deve carregá-lo. Clientes com suporte a Agent Skills veem primeiro o `name` e a `description`; só depois de casar com a tarefa é que leem o `SKILL.md` completo.[^S1][^S4]

O segundo passo é escrever um `SKILL.md` mínimo, reconhecível por checagens estáticas e acionável corretamente pelo Agent. As instruções longas ficam para depois que a entrada estiver de pé.

## Explicação

### A estrutura mínima tem apenas duas camadas

A especificação aberta exige que o `SKILL.md` contenha YAML frontmatter seguido de um corpo em Markdown. O frontmatter precisa ter pelo menos `name` e `description`; o corpo traz as instruções operacionais que o Agent deve seguir depois que o Skill é ativado.[^S2][^S7]

Um arquivo mínimo tem esta cara:

```markdown
---
name: interview-notes
description: Turns customer interview transcripts into Chinese Markdown notes with quotes, themes, and product suggestions. Use when the user asks to summarize interviews, research calls, or transcript notes.
---

# Interview Notes

## Instructions

Read the transcript the user provides. Produce Chinese Markdown notes with:

- a short summary
- quoted evidence from the customer
- recurring themes
- 3 product suggestions

Do not edit the original transcript, send follow-up messages, or decide roadmap priority.
```

O frontmatter é o bloco de metadados YAML no início do arquivo, envolvido por duas linhas `---`. O corpo são as instruções Markdown que vêm depois do frontmatter. A diferença entre os dois importa: os metadados ajudam o Agent a descobrir o Skill; o corpo ajuda o Agent a executar o Skill.

### `name` é um identificador estável

`name` é o nome legível por máquina do Skill. A especificação aberta exige de 1 a 64 caracteres, apenas letras minúsculas, dígitos e hífens, sem hífen no início ou no fim, sem hífens consecutivos, e casando com o nome do diretório pai. As práticas recomendadas atuais da Anthropic trazem as mesmas restrições de comprimento e caracteres.[^S2][^S7]

Isso significa que os nomes abaixo têm problemas diferentes:

```yaml
name: InterviewNotes      # tem maiúsculas
name: interview_notes     # tem sublinhados
name: -interview-notes    # começa com hífen
name: interview--notes    # hífens consecutivos
```

Um nome válido deve parecer um nome de diretório:

```yaml
name: interview-notes
```

Ao nomear, não busque ser engraçado; busque primeiro estabilidade, brevidade e legibilidade. Não é um título, nem um slogan.

### `description` responde por capacidade e gatilho ao mesmo tempo

`description` é o texto curto que o Agent usa para decidir se carrega o Skill. A especificação exige que seja não vazia, com no máximo 1024 caracteres, e recomenda descrever ao mesmo tempo o que o Skill faz e quando usá-lo, incluindo palavras-chave que ajudem o Agent a reconhecer a tarefa. Os guias atuais da OpenAI e da Anthropic colocam o casamento implícito neste campo.[^S2][^S4][^S7]

Uma escrita fraca:

```yaml
description: Helps write notes.
```

Essa frase não diz entrada, saída nem cenário de gatilho. Uma escrita mais específica:

```yaml
description: Turns customer interview transcripts into Chinese Markdown notes with quotes, themes, and product suggestions. Use when the user asks to summarize interviews, research calls, or transcript notes.
```

A primeira metade dessa frase descreve a capacidade; a segunda, quando disparar. O brief de quatro linhas não pode ser copiado mecanicamente para duas posições: capacidade, gatilhos positivos e a desambiguação negativa necessária entram na `description`; detalhes de entrada, requisitos completos de saída e proibições de execução entram no corpo. Se algum "não tratar" decide que este Skill simplesmente não deve ser selecionado, comprima-o como desambiguação negativa na `description` e mantenha a proibição concreta no corpo.

Glossário desta lição:

- `SKILL.md`: arquivo de entrada obrigatório no diretório do Skill, contendo metadados e instruções.
- frontmatter: bloco de metadados YAML no topo de um arquivo Markdown.
- `name`: identificador estável que respeita as restrições de nomenclatura e casa com o diretório pai.
- `description`: texto curto que diz o que o Skill faz e quando ele dispara.

```agentmentor-check
{
  "id": "agent-skills-reuse-description-trigger",
  "label": "Verificar a description de gatilho",
  "prompt": "Qual das descriptions abaixo é mais adequada para o Agent decidir quando carregar um Skill de ata de entrevista?",
  "whyHere": "Esta etapa verifica se o aprendiz escreveu a description como uma apresentação genérica de capacidade, em vez de deixar claros capacidade e gatilho ao mesmo tempo.",
  "copyPurpose": "Pedir ao Agent que verifique se minha description contém ao mesmo tempo o que o Skill faz e quando ele dispara.",
  "mode": "single",
  "choices": [
    {
      "id": "vague",
      "text": "Descrição vaga: Helps with customer content.",
      "correct": false,
      "feedback": "Ela não indica entrada estável, saída nem palavras-chave de gatilho; fica difícil para o Agent decidir quando carregar."
    },
    {
      "id": "specific",
      "text": "Descrição com capacidade e gatilhos: Turns customer interview transcripts into Chinese Markdown notes with quotes and themes. Use when summarizing interviews, research calls, or transcript notes.",
      "correct": true,
      "feedback": "Ela traz ao mesmo tempo capacidade, formato de saída e cenários de gatilho — adequada para a decisão rápida na camada de metadados."
    }
  ]
}
```

## Exemplo completo: SKILL.md mínimo verificável

Suponha que o brief da lição anterior seja:

```text
Gatilho: o usuário pede para organizar entrevistas com clientes, transcripts de pesquisa com usuários ou sales call notes.
Entrada: um ou mais textos de transcript, de preferência com falantes e ordem cronológica.
Saída: ata em Markdown em chinês, com resumo de temas, evidências em fala literal do cliente, lista de perguntas e 3 sugestões de produto.
Não tratar: não modificar o transcript original, não enviar e-mails em nome do usuário, não decidir prioridades de roadmap.
```

Primeiro crie o nome do diretório e o `name`:

```text
interview-notes/
  SKILL.md
```

Depois escreva o `SKILL.md` mínimo:

```markdown
---
name: interview-notes
description: Turns customer interview transcripts into Chinese Markdown notes with quoted evidence, themes, open questions, and product suggestions. Use when summarizing interviews, research calls, sales call notes, or transcript files.
---

# Interview Notes

## Instructions

Use this skill when the user provides or points to customer interview transcripts, research call notes, or sales call notes.

Input can be one or more transcript files or pasted transcript text. Preserve customer meaning and mark direct quotes clearly.

Return Chinese Markdown with:

- summary
- quoted evidence
- recurring themes
- open questions
- 3 product suggestions

Do not modify the original transcript, send follow-up messages, or decide roadmap priority.
```

Ele passa na checagem estática mais básica porque: o frontmatter existe, o `name` é válido e casa com o diretório, a `description` é não vazia e contém capacidade e gatilho, e o corpo traz regras de execução.

## Exemplo semicompleto: SKILL.md de notas de release

A partir do brief abaixo, complete o `name` e a `description`:

```text
Nome do diretório: release-notes
Gatilho: o usuário pede para gerar notas de release a partir de commits Git, PRs ou rascunhos de changelog.
Saída: notas de release em Markdown voltadas ao usuário, agrupadas por novidades, correções e problemas conhecidos.
```

Rascunho:

```markdown
---
name: __________________
description: __________________
---

# Release Notes

## Instructions

Write user-facing Markdown release notes from the change material the user provides.
```

Resposta de referência:

```yaml
name: release-notes
description: Turns commits, PR summaries, or changelog drafts into user-facing Markdown release notes grouped by features, fixes, and known issues. Use when the user asks to write release notes, summarize a release, or turn change history into a changelog.
```

Note que a `description` não precisa carregar todos os detalhes operacionais. Primeiro ela precisa ajudar o Agent a julgar "devo carregar este Skill para esta tarefa?".

<!-- exercises -->
## Exercícios

### Level 1 (Aquecimento)

Ao lado do seu diretório de trabalho real, crie um diretório de prática, por exemplo `skill-drafts/<your-skill-name>/`, e escreva um `SKILL.md` mínimo para o brief da lição anterior. Não coloque dados privados; escreva apenas estrutura e instruções.

Como fazer: primeiro converta o nome do diretório para kebab-case minúsculo, depois faça o `name` ser exatamente igual ao nome do diretório. Comprima a capacidade, os gatilhos positivos e a desambiguação negativa necessária do brief em uma única `description`; escreva os detalhes de entrada, os requisitos completos de saída e as proibições de execução no corpo.
<!-- rubric -->
- O arquivo se chama `SKILL.md` e começa com frontmatter.
- O `name` contém apenas letras minúsculas, dígitos e hífens, e casa com o nome do diretório pai.
- A `description` diz ao mesmo tempo o que faz, quando dispara e, quando realmente necessário, a desambiguação negativa.
- O corpo registra pelo menos os detalhes de entrada, os requisitos completos de saída e as proibições de execução.
<!-- answer -->
Uma resposta aceitável deve começar com um frontmatter válido de várias linhas:

```markdown
---
name: release-notes
description: Turns ... Use when ...
---
```

E só depois escrever as Instructions em Markdown. Um erro comum é o diretório se chamar `ReleaseNotes` enquanto o `name` é `release-notes`; a especificação aberta exige que os dois casem.
<!-- hint -->
Verifique primeiro apenas as três primeiras linhas de frontmatter, sem pressa de embelezar o corpo.
<!-- hint -->
Se a description não sair, mescle as linhas "gatilho" e "saída" da lição anterior em uma frase curta, em inglês ou em português.

### Level 2 (Avançado)

Para o mesmo Skill, escreva três pedidos de usuário representativos e verifique se a sua `description` produz um falso gatilho ou um gatilho perdido. Pelo menos um pedido deve ser uma tarefa vizinha que não deveria disparar.

Como fazer: crie no diretório de prática um rascunho `trigger-cases.md`, listando "deve disparar 1", "deve disparar 2" e "não deve disparar 1". Compare um a um com as palavras-chave e os limites da `description`.
<!-- rubric -->
- Os três pedidos são falas que usuários realmente poderiam usar.
- Pelo menos dois pedidos que devem disparar encontram palavras-chave ou semântica correspondente na description.
- O pedido que não deve disparar é excluído pelas palavras de escopo da `description`; o corpo traz a proibição correspondente.
<!-- answer -->
Tomando `release-notes` como exemplo: "escreva notas de release a partir destes PRs" deve disparar; "transforme o changelog numa versão que o usuário entenda" deve disparar; "crie uma Git tag e publique em produção" não deve disparar. Se a `description` disser apenas "Helps with releases", o terceiro pedido é facilmente mal julgado; o escopo deve ser estreitado para "write release notes", com "Do not use for tagging, deployment, or publishing operations" escrito explicitamente. O corpo então registra "não criar tag, não executar release", para restringir a execução quando o Skill já foi carregado ou o usuário propõe uma tarefa mista.
<!-- hint -->
Escreva os pedidos como usuários realmente falariam, não como campos da especificação.
<!-- hint -->
Tarefas vizinhas costumam conter ações como "enviar, publicar, implantar, modificar arquivos-fonte, decidir prioridade".
<!-- /exercises -->

## Para levar: as duas responsabilidades dos metadados

O `SKILL.md` mínimo agora tem duas responsabilidades: o frontmatter cuida de descoberta e seleção, o corpo cuida da execução real. Quando a entrada funciona, surge um novo problema: os materiais não param de crescer. O próximo passo é fazer o Agent ler rótulos, exemplos e templates apenas quando a tarefa pedir.
