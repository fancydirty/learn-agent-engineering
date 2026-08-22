# Lição 1: Reuso de prompts e os limites do Skill

> Objetivos desta lição:
> - Identificar um workflow reutilizável a partir de uma tarefa real que se repete.
> - Distinguir as responsabilidades de prompt descartável, tarefa recorrente e Skill.
> - Escrever um Skill brief de quatro linhas: gatilho, entrada, saída e o que não tratar.
>
> Pré-requisito: saber usar um coding agent e editar Markdown | página anterior [<< Sumário do curso](./README.md) | próxima lição [02 >>](./02-skill-metadata.md)

## A tarefa que você precisa reexplicar toda vez

Você provavelmente já passou por esta cena: toda vez que pede ao Agent para escrever o relatório semanal, revisar um PR, organizar atas de reunião ou gerar notas de release, precisa reexplicar o tom, os arquivos de entrada, o formato de saída e quais diretórios não tocar. Escrever o prompt assim na primeira vez é normal; se na quinta vez você ainda está colando o mesmo bloco de instruções, o problema não é mais "o prompt não está bom o suficiente" — existe um workflow recorrente que ainda não foi fixado.

Esta lição não pede que você escreva o Skill completo agora. Primeiro vamos comprimir uma tarefa que se repete em um registro de limites de quatro linhas, para que o `SKILL.md` mais adiante tenha um esqueleto claro.

## Explicação

### Comece por uma tarefa concreta

Veja primeiro um prompt descartável:

```text
Organize a entrevista com o cliente de ontem em uma ata em chinês. Preserve as falas literais do cliente e termine com 3 sugestões de melhoria de produto. Não altere o transcript original.
```

Essa frase basta para uma tarefa única. O problema aparece na segunda e na terceira vez: você precisa explicar de novo "como preservar as falas literais", "quão específicas as sugestões devem ser", "quais arquivos não podem ser tocados". Um prompt descartável é uma instrução de tarefa escrita para a conversa atual; pode ser curto ou longo, mas por padrão não vira uma capacidade que o Agent descobrirá sozinho no futuro.

Quando o mesmo tipo de tarefa aparece repetidamente, com entradas, saídas e limites parecidos a cada vez, ela é uma tarefa recorrente. Tarefa recorrente não é sinônimo de tarefa chata; sua característica central é: você consegue dizer com clareza quando ela deve ser feita, com o quê, o que ela entrega e o que não deve ser feito junto.

### Nomeie a tarefa recorrente como workflow reutilizável

Um workflow reutilizável é um conjunto de passos, restrições e critérios de saída que pode ser invocado novamente. A Anthropic descreve um Skill como um diretório contendo um `SKILL.md`, instruções, scripts e recursos; a OpenAI/Codex também usa Agent Skills como extensões de capacidade específicas de tarefa para ChatGPT e Codex.[^S1][^S4]

O Skill permite que o Agent descubra, leia e execute um conjunto de materiais de workflow na tarefa adequada. Em relação ao prompt descartável, ele adiciona uma entrada descobrível, limites estáveis e recursos sob demanda — mas não se responsabiliza por um sistema de negócio inteiro.

Para julgar se uma tarefa recorrente merece virar Skill, comece com quatro perguntas:

- Gatilho: o que o usuário diz, ou que material apresenta, para que o Agent se lembre dele?
- Entrada: quais arquivos, campos ou contexto o Agent precisa receber?
- Saída: em que formato o Agent deve entregar o resultado final?
- Não tratar: quais tarefas vizinhas são fáceis de fazer por engano, mas não pertencem a este Skill?

Essas quatro linhas são o Skill brief usado neste curso. Ele ainda não é um campo da especificação formal, e sim um rascunho dos limites de responsabilidade antes de escrever o `SKILL.md`.

### Estreite os limites de responsabilidade do Skill

O limite de responsabilidade diz do que este Skill cuida — e também do que ele não cuida. Estreito demais, o Agent só consegue tratar um único exemplo; largo demais, o Agent arrasta tarefas vizinhas para dentro. A Anthropic recomenda começar pela solução mais simples e combinável, e o guia atual da OpenAI também pede que cada Skill foque em um único trabalho.[^S4][^S5]

Por exemplo, "me ajude com conteúdo" é largo demais; "organizar um transcript de entrevista com cliente em uma ata em chinês com evidências em fala literal" é um formato adequado de Skill. Ele tem gatilho, entrada e saída claros, e também consegue dizer o que não trata: não faz follow-up de vendas, não altera o transcript, não decide pelo produto.

Glossário desta lição:

- Prompt descartável: uma instrução de tarefa que serve apenas à conversa atual.
- Tarefa recorrente: uma tarefa que aparece várias vezes, com formas de entrada e saída parecidas.
- Workflow reutilizável: um conjunto de passos, restrições e critérios de saída que pode ser invocado de novo.
- Limite de responsabilidade: o escopo que diz o que o workflow trata e o que ele não trata.

```agentmentor-check
{
  "id": "agent-skills-reuse-skill-boundary",
  "label": "Estreitar o limite da ata de entrevista",
  "prompt": "Toda semana você pede ao Agent para organizar transcripts de reunião no mesmo formato em atas, mas às vezes também pede, no embalo, que ele agende as próximas ações de vendas. Qual limite de Skill é mais estável?",
  "whyHere": "Esta etapa verifica se o aprendiz está misturando um workflow reutilizável com ações de negócio vizinhas.",
  "copyPurpose": "Pedir ao Agent que verifique se escrevi o limite de responsabilidade de um Skill largo demais.",
  "mode": "single",
  "choices": [
    {
      "id": "wide",
      "text": "Criar um customer-success-skill que cuida de atas, follow-up, agendamento e todas as ações de operações de clientes",
      "correct": false,
      "feedback": "Esse limite cobre vários tipos de saída e decisão; as condições de gatilho ficam difusas e fica mais fácil executar tarefas vizinhas por engano."
    },
    {
      "id": "focused",
      "text": "Criar um interview-notes-skill que apenas transforma transcripts em atas com evidências em fala literal",
      "correct": true,
      "feedback": "Esse limite gira em torno de entrada estável e saída estável; as ações de vendas posteriores podem ser tratadas por outro workflow."
    }
  ]
}
```

## Exemplo completo: Skill brief de ata de entrevista

Suponha que você organize entrevistas com clientes toda semana. A tarefa original é:

```text
Ler os transcripts em transcripts/ e produzir uma ata em chinês, preservando as falas literais do cliente e terminando com sugestões de produto.
```

Reescrevendo como Skill brief de quatro linhas:

```text
Gatilho: o usuário pede para organizar entrevistas com clientes, transcripts de pesquisa com usuários ou sales call notes.
Entrada: um ou mais textos de transcript, de preferência com falantes e ordem cronológica.
Saída: ata em Markdown em chinês, com resumo de temas, evidências em fala literal do cliente, lista de perguntas e 3 sugestões de produto.
Não tratar: não modificar o transcript original, não enviar e-mails em nome do usuário, não decidir prioridades de roadmap.
```

Essas quatro linhas transformam explicações repetidas em limites revisáveis, mas não viram campos formais uma a uma. Ao escrever a `description`, incluem-se a capacidade, os gatilhos positivos e a desambiguação negativa quando for realmente necessária; detalhes de entrada, requisitos completos de saída e proibições de execução ficam no corpo. Por exemplo, "não use isto para enviar e-mails", se serve para excluir tarefas de e-mail, deve ser condensado na `description`; já "não modifique o transcript original" é uma regra de corpo que continua valendo depois que o Skill foi carregado.

## Exemplo semicompleto: Skill brief de notas de release

Complete o rascunho abaixo. Atenção: a linha "não tratar" precisa bloquear uma tarefa vizinha muito fácil de fazer por engano.

```text
Gatilho: o usuário pede para gerar notas de release a partir de commits Git, PRs ou rascunhos de changelog.
Entrada: ________________________________.
Saída: ________________________________.
Não tratar: ________________________________.
```

Resposta de referência:

```text
Entrada: lista de commits, resumos de PR ou rascunho de changelog existente, além do tipo de público-alvo.
Saída: notas de release em Markdown voltadas ao usuário, agrupadas por novidades, correções e problemas conhecidos.
Não tratar: não modificar código, não criar Git tag, não decidir pelo responsável se o release sai ou não.
```

Sua redação pode ser diferente, mas precisa permitir que o Agent julgue "quando usar" e "quando parar".

<!-- exercises -->
## Exercícios

### Level 1 (Aquecimento)

No seu próprio diretório de trabalho real, encontre uma tarefa que você reexplicou ao Agent nas últimas três vezes e escreva o Skill brief de quatro linhas dela. Não crie um Skill formal; faça isso apenas em um Markdown de rascunho ou em anotações.

Como fazer: abra esse diretório, revise as instruções de tarefa ou o histórico de chat recentes, copie primeiro o trecho de prompt mais repetido e depois o comprima nas quatro linhas "gatilho, entrada, saída, não tratar".
<!-- rubric -->
- As quatro linhas existem, e cada uma descreve apenas um tipo de informação.
- O gatilho permite ao Agent julgar quando deve se lembrar deste workflow.
- O "não tratar" bloqueia pelo menos uma tarefa vizinha real.
<!-- answer -->
Uma resposta aceitável parece um registro de limites, não um manual completo. Por exemplo: "Gatilho: o usuário pede para gerar ata a partir de transcript de reunião; Entrada: um transcript; Saída: ata em Markdown em chinês; Não tratar: não enviar e-mails, não agendar reuniões". Um erro comum é escrever no limite coisas como "seja caprichado" ou "saída de alta qualidade" — palavras que não ajudam o Agent a julgar o escopo da tarefa.
<!-- hint -->
Comece pelo trecho de prompt que você mais copia e cola.
<!-- hint -->
Se o "não tratar" não vier à mente, lembre o que o Agent já fez a mais por iniciativa própria.

### Level 2 (Avançado)

Escreva a mesma tarefa recorrente em três briefs — "versão estreita demais", "versão larga demais" e "versão adequada" — e explique por que você escolheu a versão adequada.

Como fazer: escreva três conjuntos de briefs de quatro linhas em torno da mesma tarefa real. A versão estreita demais cobre apenas um exemplo; a versão larga demais engole processos vizinhos; a versão adequada mantém entrada estável e saída estável.
<!-- rubric -->
- As três versões giram em torno da mesma tarefa, não de três tarefas diferentes.
- Os riscos da versão estreita demais e da larga demais aparecem em uma frase cada.
- O formato de saída e o limite de "não tratar" da versão adequada são verificáveis.
<!-- answer -->
Exemplo: para "notas de release", a versão estreita demais pode tratar apenas dos 5 commits de hoje de um repositório específico; a versão larga demais pode incluir alterar código, criar tag e avisar usuários; a versão adequada gera apenas notas de release voltadas ao usuário a partir do material de mudanças fornecido. A razão para escolher a versão adequada: ela é reutilizável, mas não substitui a decisão de release.
<!-- hint -->
A versão estreita demais costuma trazer datas específicas, nomes de arquivos específicos ou nomes de projeto descartáveis.
<!-- hint -->
A versão larga demais costuma trazer palavras como "tudo", "responsável completo", "do início ao fim".
<!-- /exercises -->

## Para levar: um brief pronto para adaptar

Este brief de quatro linhas já marca onde a tarefa começa, do que ela precisa, o que ela entrega e onde ela para. O próximo passo é traduzi-lo para o `SKILL.md` formal: na fase de descoberta ficam apenas as informações suficientes para escolher o Skill; os detalhes de execução vão para o corpo.
