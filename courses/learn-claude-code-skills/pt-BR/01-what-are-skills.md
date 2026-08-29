# Lição 1: O que são Skills: por que você precisa de fluxos de trabalho personalizados

> Objetivos de aprendizado:
> - Entender o problema central que as Skills resolvem
> - Reconhecer quais cenários de trabalho valem a pena automatizar com uma Skill
> - Compreender a mecânica básica de funcionamento das Skills
>
> Pré-requisitos: Você já usou os recursos básicos do Claude Code | Próxima: [Lição 2 >>](./02-skill-anatomy.md)

## Você explica o mesmo processo toda vez

Você está usando o Claude Code para organizar as anotações de uma reunião. Você digita: “Pegue esta transcrição de reunião e transforme em tópicos estruturados — separe em decisões, itens de ação e questões em aberto, e marque cada item de ação com um responsável e um prazo.”

O Claude faz. O resultado é bom.

No dia seguinte, outra reunião. Você digita a mesma coisa de novo.

Terceiro dia, quarto dia. Depois de cada reunião você reemite as mesmas instruções. O Claude acerta todas as vezes, mas todas as vezes você precisa explicar do zero.[^S1]

**É esse o problema que as Skills resolvem**: pegar um fluxo de trabalho que você vive explicando e empacotá-lo como uma instrução reutilizável. Escreva uma vez, chame sempre que precisar.[^S2]

## O que é uma Skill

**Uma Skill é um diretório contendo um arquivo SKILL.md que diz ao Claude como executar uma tarefa específica.**[^S4]

Pense nela como um procedimento escrito que você entrega ao Claude. Você anota os passos com clareza e o Claude trabalha a partir deles. Chega de recomeçar a explicação.[^S3]

Por exemplo, o núcleo de uma Skill de anotações de reunião pode ser assim:

```markdown
---
name: meeting-notes
description: Transforma uma gravação ou transcrição de reunião em decisões, itens de ação e questões em aberto
---

# Limpeza de anotações de reunião

## Passos

1. Leia o conteúdo da reunião (transcrição ou arquivo de gravação)
2. Extraia toda decisão que foi de fato tomada, uma por linha
3. Extraia todo item de ação, no formato: [ação] - responsável - prazo
4. Liste tudo que surgiu mas não foi decidido, como questões em aberto
5. Ordene a saída por data, com os prazos mais próximos primeiro
```

Depois de salvar isso, você digita `/meeting-notes` mais o conteúdo da reunião, e o Claude já sabe o que fazer.[^S1]

## Quais cenários combinam com Skills

**Cenários que combinam com uma Skill compartilham três características:**

1. **Repetição**: você faz a mesma coisa toda semana, todo dia, às vezes de hora em hora
2. **Passos fixos**: o processo pode ser escrito como passos claros, em vez de mudar a cada vez
3. **Verificável**: você consegue dizer se o Claude acertou

**Casos típicos:**

- Revisão de código (conferir o trabalho contra as convenções do seu time)
- Conversão de formato de documentos (Markdown para Word, preservando formatações específicas)
- Análise de logs (extrair o que importa de logs de erro)
- Geração de casos de teste (transformar a descrição de uma funcionalidade em cenários de teste)
- Normalização de mensagens de commit (reescrever commits lacônicos no formato acordado pelo time)

**Cenários que não combinam com uma Skill:**

- Tarefas pontuais (como “me ajude a desenhar o layout desta página”)
- Tarefas que exigem muito julgamento humano a cada passagem
- Trabalho criativo totalmente aberto

```agentmentor-check
{
  "id": "skills-zh-01-scenario-judge",
  "label": "Avaliação do cenário de commits para changelog",
  "prompt": "Todo dia você transforma as mensagens de commit do Git do seu time em um changelog que os clientes conseguem ler. Os passos são fixos: filtrar os commits internos, reescrever o jargão em linguagem simples, agrupar por funcionalidade. Esse cenário combina com uma Skill?",
  "whyHere": "Você acabou de aprender as três características que fazem um cenário combinar com uma Skill (repetição, passos fixos, verificabilidade). O erro comum neste ponto é confundir *conteúdo* variável com *processo* variável e descartar um cenário que na verdade se encaixa, então vale testar os critérios em um caso concreto antes de seguir.",
  "mode": "single",
  "choices": [
    {
      "id": "a",
      "text": "Não — o conteúdo dos commits é diferente todos os dias",
      "correct": false,
      "feedback": "Não exatamente. Conteúdo diferente não é problema. Uma Skill captura um **processo** que se repete, não um conteúdo que se repete. Enquanto filtrar → reescrever → agrupar continuar igual, o cenário se encaixa."
    },
    {
      "id": "b",
      "text": "Sim — o processo é fixo, se repete todo dia e dá para conferir",
      "correct": true,
      "feedback": "Correto. As três características se sustentam: repete-se diariamente, os passos são fixos (filtrar → reescrever → agrupar) e você consegue julgar se o changelog reescrito está bom o bastante. É exatamente para isso que as Skills existem."
    }
  ]
}
```

## Como as Skills funcionam

Quando você cria uma Skill, na prática está fazendo duas coisas:[^S5]

1. **Escrevendo o YAML frontmatter** (a parte no topo do arquivo delimitada por `---`), que diz ao Claude como esta Skill se chama e quando usá-la
2. **Escrevendo as instruções em Markdown** (o corpo depois do frontmatter), que diz ao Claude exatamente como executar a tarefa

**Duas formas de usar:**

- **Invocação manual**: você digita `/meeting-notes`, o Claude carrega as instruções daquela Skill e as executa
- **Acionamento automático**: você diz “organize estas anotações de reunião para mim”, o Claude lê as descriptions, decide que a Skill meeting-notes é relevante e a carrega por conta própria[^S6]

O acionamento automático só funciona se a description estiver bem escrita. Vamos tratar disso em detalhe na Lição 2.

## Onde as Skills ficam

**Dois locais:**[^S1]

- **Skills pessoais**: `~/.claude/skills/` — só suas, disponíveis em todos os projetos
- **Skills de projeto**: `.claude/skills/` — ficam no diretório do projeto, então seus colegas as recebem ao clonar o repositório

Para a sua primeira Skill, comece pelas skills pessoais. Depois de escrever algumas e confirmar que são realmente úteis, mova as que você mais usa para o diretório do projeto, para que o time possa compartilhá-las.

<!-- exercises -->
## 💻 Exercícios

### Nível 1: Identificar sua primeira candidata a Skill

Revise sua última semana de trabalho e encontre uma tarefa que você explicou ao Claude pelo menos três vezes.

Anote:
1. Qual é a tarefa?
2. Os passos dela são fixos?
3. Você consegue dizer se o Claude acertou?

<!-- rubric -->
- Descrição da tarefa clara o bastante para outra pessoa entender o que você faz
- Afirmação explícita sobre os passos serem fixos ou não
- Explicação de como você verificaria o resultado

<!-- answer -->
Resposta de exemplo:

**Tarefa**: Classificar o feedback de clientes de um canal do Slack em relatos de bug, pedidos de funcionalidade e dúvidas de uso

**Passos fixos?**: Sim. É sempre ler as mensagens, decidir a categoria, arquivar e adicionar uma etiqueta de prioridade

**Verificável?**: Sim. Dá para ver se as categorias estão certas e se as etiquetas de prioridade fazem sentido

**Combina com uma Skill?**: Sim. Repetição alta, passos fixos, verificável

<!-- hint -->
Se não vier nada à cabeça, tente estes ângulos: algo que você faz diariamente ou semanalmente, algo em que suas instruções ao Claude passam de três frases, algo que você gostaria que o resto do time fizesse da mesma forma

<!-- hint -->
Não precisa ser uma tarefa de programação. Organização de documentos, limpeza de dados, conversão de formato, revisão de conteúdo — tudo vale

<!-- /exercises -->

## Recapitulação

- **Skills empacotam um fluxo de trabalho repetido como uma instrução reutilizável**, para você não reexplicá-lo toda vez
- **Cenários que combinam com uma Skill**: repetição, passos fixos, resultados verificáveis
- **Uma Skill é um diretório mais um arquivo SKILL.md** contendo YAML frontmatter e instruções em Markdown
- **Duas formas de usar**: invocação manual (`/skill-name`) ou acionamento automático (o Claude decide a partir da description)
- **Dois locais**: skills pessoais (`~/.claude/skills/`) e skills de projeto (`.claude/skills/`)

Na próxima lição vamos desmontar um arquivo SKILL.md real e ver o que cada parte dele faz.

[Lição 2 >>](./02-skill-anatomy.md)
