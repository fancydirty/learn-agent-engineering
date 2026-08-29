# Lição 4: Estado estruturado: como um agente lembra em que ponto uma tarefa está

> Objetivos de aprendizado:
> - Explicar por que enterrar o progresso de uma tarefa em prosa conversacional é pouco confiável, e por que ele precisa se tornar estado estruturado
> - Enunciar o ciclo de vida completo pelo qual um todo passa, da criação à remoção
> - Distinguir o custo de recomeçar do zero versus retomar de onde o trabalho foi interrompido
> - Decidir se um pedaço do estado de uma tarefa deve viver no histórico da sessão ou ser gravado em um checkpoint separado
>
> Pré-requisitos: Conclua a Lição 3 e entenda os dois modos de memória externa | Anterior: [Lição 3 <<](./03-external-memory-files.md) | Próxima: [Lição 5 >>](./05-memory-boundaries-and-safety.md)

## Depois de reiniciar o processo, o agente ainda sabe em qual etapa parou

Um agente está executando uma tarefa de várias etapas: refatorar um módulo, que se divide em quatro etapas — "atualizar as definições de tipo", "atualizar os pontos de chamada", "rodar os testes", "atualizar a documentação". Ele acabou de terminar a segunda etapa quando o processo é interrompido por um reinício inesperado. Quando volta a subir, está diante da mesma descrição de tarefa. Ele deve refazer a etapa um do zero, ou sabe que já concluiu as duas primeiras etapas e pode continuar direto da etapa três?

A resposta se resume a uma coisa: se o progresso da tarefa foi registrado como **estado estruturado**, em vez de espalhado por uma pilha de prosa conversacional. Se "as definições de tipo já foram atualizadas" for apenas uma linha de linguagem natural em uma das respostas anteriores do modelo, enterrada entre dezenas de mensagens, o código hospedeiro não tem como extrair de forma confiável o fato concreto "em qual etapa estamos". Mas se esse progresso for expresso como uma **lista de todos** com campos fixos — onde cada tarefa carrega um marcador de status explícito — o código hospedeiro pode lê-lo diretamente: as etapas um e dois estão completed, a etapa três não começou.

Essa é a questão central que esta lição aborda. As Lições 1, 2 e 3 trataram todas de como gerenciar *conteúdo* — histórico de conversa, arquivos de memória. Esta lição trata de como expressar *progresso*, para que um agente ou seu aplicativo host, depois de uma interrupção, saiba exatamente até onde a tarefa chegou.

## O ciclo de vida do todo: criado, ativado, concluído, removido

Tome a ferramenta de acompanhamento de tarefas do Claude Code como exemplo. A documentação oficial descreve o ciclo de vida completo pelo qual um todo passa durante a execução — quatro etapas:[^S4]

1. **Criado**: o Claude adiciona o todo como pending quando identifica uma tarefa
2. **Ativado**: o Claude define o todo como in_progress quando começa o trabalho
3. **Concluído**: o Claude o marca como completed quando a tarefa termina com sucesso
4. **Removido**: o Claude exclui um todo de que não precisa mais definindo status: "deleted" em uma chamada TaskUpdate[^S4]

Essas quatro etapas não são o vago "terminei" ou "estou trabalhando nisso" da linguagem natural. São quatro valores de status explícitos: pending, in_progress, completed, e deleted para remoção. Toda mudança de status acontece por meio de uma chamada de ferramenta explícita, não pelo modelo soltando um comentário no texto da resposta.

A documentação também detalha como esse mecanismo de fato aparece na conversa: "In a session that has the task-tracking tools, Claude keeps a written todo list, updating each item's status as it works. You see each change in the message stream as a structured tool call."[^S4] (Em uma sessão que tem as ferramentas de acompanhamento de tarefas, o Claude mantém uma lista de todos escrita, atualizando o status de cada item conforme trabalha. Você vê cada mudança no fluxo de mensagens como uma chamada de ferramenta estruturada.) Essa frase fixa a distinção central: o progresso não é passivamente "refletido" na conversa, ele é ativamente escrito como uma chamada de ferramenta que pode ser identificada e analisada por si só. Essa é a verdadeira diferença entre estado estruturado e uma descrição de progresso espalhada pela prosa.

```agentmentor-check
{
  "id": "mem-zh-04-structured-vs-prose",
  "label": "Avaliando como o progresso de uma tarefa deve ser expresso",
  "prompt": "Um agente escreve em uma resposta: “Terminei de atualizar as definições de tipo, e em seguida vou cuidar dos pontos de chamada.” Comparado com uma chamada de ferramenta estruturada que move o status de um todo de pending para in_progress e depois para completed, qual é a diferença entre os dois quando se trata de o código hospedeiro conseguir ler o progresso atual de forma confiável?",
  "whyHere": "Esta verificação aparece logo depois de mostrarmos que o ciclo de vida do todo é expresso por meio de chamadas de ferramenta estruturadas. Ela testa se o aprendiz presume que “o modelo dizer equivale ao estado ser registrado”, sem perceber que uma descrição em linguagem natural e o estado estruturado diferem fundamentalmente em se um programa consegue analisá-los de forma confiável.",
  "mode": "single",
  "choices": [
    {
      "id": "a",
      "text": "Nenhuma diferença — ambos expressam o fato de que as definições de tipo estão atualizadas, e o código hospedeiro os lê do mesmo jeito.",
      "correct": false,
      "feedback": "Não exatamente. Uma descrição em linguagem natural é um trecho de texto que o modelo produziu; seu formato e sua redação podem variar a cada vez, e extrair dela de forma confiável “qual etapa, qual status” é difícil para o código hospedeiro. Uma chamada de ferramenta estruturada tem campos fixos (um ID de tarefa e um valor de status, digamos) que o código hospedeiro pode ler diretamente, sem adivinhação e sem exigir compreensão de linguagem natural."
    },

    {
      "id": "b",
      "text": "Há uma diferença — uma chamada de ferramenta estruturada tem campos fixos que o código hospedeiro pode analisar direto em um status, enquanto uma descrição em linguagem natural precisa de interpretação extra para extrair a mesma informação, o que a torna bem menos confiável.",
      "correct": true,
      "feedback": "Correto. O valor do estado estruturado é que um programa pode lê-lo diretamente — campos como o ID da tarefa e o valor do status são fixos, então o código hospedeiro não precisa depender de compreensão de linguagem para adivinhar se “esta frase significa que a tarefa está pronta”. É exatamente por isso que a documentação enfatiza que a ferramenta de acompanhamento de tarefas faz cada mudança de status aparecer no fluxo de mensagens como uma chamada de ferramenta estruturada, não apenas como uma descrição em texto."
    },
    {
      "id": "c",
      "text": "Há uma diferença, mas é só que uma chamada de ferramenta estruturada parece mais formal — a quantidade de informação que de fato transmite é a mesma.",
      "correct": false,
      "feedback": "A diferença não é apenas “parece mais formal”. O que importa é se um programa consegue analisá-la de forma confiável — uma descrição em linguagem natural não tem formato nem redação fixos, então o código hospedeiro não consegue extrair de forma estável fatos estruturados como “qual etapa, qual status”; uma chamada de ferramenta estruturada tem campos fixos. Essa é uma diferença funcional substantiva, não uma questão de estilo."
    }
  ]
}
```

## Checkpoints: tornar a recuperação algo diferente de recomeçar

Uma vez que você tem uma lista de todos estruturada, a próxima pergunta é: onde a própria lista vive? Se ela existir apenas no histórico de conversa desta sessão, então no momento em que a sessão realmente terminar (não uma breve interrupção, mas um fechamento completo, como a ideia de "quando a sessão termina, tudo o que está na janela some" da Lição 3), o registro de progresso desaparece junto. No fundo, a API é sem estado: "The Messages API is stateless, which means that you always send the full conversational history to the API."[^S6] (A Messages API é sem estado, o que significa que você sempre envia todo o histórico da conversa para a API.)

É esse o problema que os **checkpoints** resolvem: gravar o estado de uma tarefa em algum momento no tempo — quais etapas estão prontas, qual etapa é a atual, quais etapas restam — em um pedaço de dado, e persisti-lo em algum lugar fora do tempo de vida da sessão. Os checkpoints usam o mesmo mecanismo subjacente da memória externa da Lição 3 (escrever um arquivo, lê-lo de volta depois); a diferença é que um checkpoint não armazena "conhecimento que vale a pena lembrar", ele armazena "até onde a tarefa chegou" — o tipo de estado que você pode usar diretamente para retomar a execução.

Com os checkpoints em vigor, a **recuperabilidade** finalmente se sustenta: depois de um reinício de processo, o agente não precisa adivinhar "onde eu estava". Ele lê o checkpoint mais recente, vê "as etapas um e dois estão completed, a etapa três está in_progress", e continua a partir da etapa três em vez de refazer as etapas um e dois.

A comparação de custo aqui é concreta. Na tarefa de refatoração, a etapa "atualizar as definições de tipo", se for idempotente (executá-la de novo produz o mesmo resultado), só custa tempo desperdiçado quando refeita do zero. Mas se alguma etapa for uma operação não idempotente como "inserir um registro de migração no banco de dados", recomeçar poderia inserir dois registros duplicados e até corromper dados. O que um checkpoint salva não é só tempo — é o risco de reexecutar por acidente esse tipo de operação não idempotente.

```agentmentor-check
{
  "id": "mem-zh-04-checkpoint-durability",
  "label": "Avaliando onde o estado de uma tarefa precisa viver para ser confiável",
  "prompt": "O estado da lista de todos de um agente sempre viveu apenas no histórico de conversa da sessão atual e nunca foi gravado em um arquivo de checkpoint separado. Se essa sessão for totalmente encerrada (não uma breve interrupção, mas um fim de verdade), na próxima vez que a mesma tarefa começar, o agente ainda consegue ler o progresso “as duas primeiras etapas já estão prontas”?",
  "whyHere": "Esta verificação aparece logo depois de mostrarmos que um checkpoint precisa gravar o estado fora do tempo de vida da sessão para de fato suportar recuperação. Ela testa se o aprendiz está confundindo “a lista de todos é estruturada” com “a lista de todos necessariamente vai sobreviver depois que a sessão terminar” — ser estruturada só resolve “um programa consegue lê-la”, não “ela ainda está lá depois que a sessão termina”.",
  "mode": "single",
  "choices": [
    {
      "id": "a",
      "text": "Sim, dá para ler, porque a lista de todos já é estado estruturado, e dados estruturados não se perdem quando uma sessão termina.",
      "correct": false,
      "feedback": "“Estruturado” e “persistente” são duas coisas diferentes. Estruturado resolve “o código hospedeiro consegue analisar de forma confiável o estado atual”; não resolve “esses dados ainda estão lá depois que a sessão termina”. A Lição 3 cobriu isso — quando uma sessão termina, tudo o que estava na janela e não foi movido para outro lugar se perde para sempre. Se essa lista de todos existir apenas no histórico de conversa e nunca tiver sido gravada em um arquivo de checkpoint, ela desaparece junto com a sessão do mesmo jeito."
    },
    {
      "id": "b",
      "text": "Não, não dá para ler, porque esse estado existe apenas no histórico desta sessão e nunca foi gravado em um checkpoint, então ele desaparece quando a sessão termina.",
      "correct": true,
      "feedback": "Correto. Se a lista de todos é estruturada só afeta se um programa consegue analisá-la de forma confiável; não afeta se ela sobrevive depois que a sessão termina. Para torná-la legível depois que a sessão fecha por completo, você tem que gravá-la em um arquivo de checkpoint separado, assim como a memória externa da Lição 3 — estado estruturado que vive só no histórico de conversa não escapa do destino de sumir quando a sessão termina."
    },
    {
      "id": "c",
      "text": "Sim, dá para ler, porque a ferramenta de acompanhamento de tarefas sincroniza automaticamente cada mudança de status para o disco.",
      "correct": false,
      "feedback": "Essa é uma premissa que você não pode simplesmente presumir. O próprio trabalho da ferramenta de acompanhamento de tarefas é fazer as mudanças de status aparecerem no fluxo de mensagens como chamadas de ferramenta estruturadas. Se há uma camada extra sincronizando-as para o disco, ou se o desenvolvedor tem que implementar essa persistência ele mesmo, depende do design específico — você não pode assumir por padrão que “estruturado significa automaticamente persistido”."
    }
  ]
}
```

## O estado estruturado existe para tornar a interrupção sobrevivível

De volta ao cenário que abriu esta lição: depois de um reinício de processo, o agente deve recomeçar ou retomar de onde foi interrompido? Agora podemos responder com clareza — depende de duas coisas terem sido feitas. O progresso da tarefa foi expresso como estado estruturado (em vez de espalhado pela prosa conversacional), e esse estado foi gravado em um checkpoint (em vez de viver apenas no histórico desta única sessão)? Você precisa dos dois. Com estado estruturado mas sem checkpoint, o estado ainda desaparece quando a sessão termina; com um checkpoint mas sem estado estruturado, o que foi gravado no checkpoint é em si linguagem natural vaga, e lê-lo de volta ainda não vai lhe dizer de forma confiável em qual etapa a tarefa chegou.

Esta lição foi sobre como expressar e preservar o progresso. A próxima lição se volta para outra questão que importa tanto quanto: será que esse estado e essa memória preservados poderiam se tornar alvo de atacantes — o que acontece se um atacante conseguir gravar conteúdo em um checkpoint ou em um arquivo de memória?

<!-- exercises -->
## 💻 Exercícios

### Nível 1: Rotule o estado do ciclo de vida em uma única execução de tarefa

Um agente recebe a tarefa "adicionar testes unitários ao projeto" e a divide em três todos: "escrever os casos de teste", "rodar a suíte de testes", "corrigir os casos que falham". Seguindo a ordem cronológica abaixo, anote em qual estado do ciclo de vida (pending / in_progress / completed / deleted) cada todo deve estar em cada momento.

1. A tarefa acabou de ser decomposta; nenhum dos três começou.
2. O agente começa a escrever os casos de teste.
3. Os casos de teste estão escritos; o agente começa a rodar a suíte de testes.
4. Rodar os testes revela dois casos que falham (caso A e caso B). O agente refina "corrigir os casos que falham" em dois novos todos, "corrigir o caso A" e "corrigir o caso B", e começa a corrigir o caso A.
5. Ao corrigir o caso A, descobre-se que o caso B era na verdade o próprio teste escrito de forma errada e não precisa de mudança nenhuma, então "corrigir o caso B" é removido.

<!-- rubric -->
- Tempo 1: os três estão pending
- Tempo 2: "escrever os casos de teste" está in_progress, os demais seguem pending
- Tempo 3: "escrever os casos de teste" está completed, "rodar a suíte de testes" está in_progress
- Tempo 4: "rodar a suíte de testes" está completed, o "corrigir os casos que falham" original é refinado, "corrigir o caso A" está in_progress, "corrigir o caso B" está pending
- Tempo 5: "corrigir o caso B" muda para deleted, em vez de simplesmente sumir da lista sem deixar rastro

<!-- answer -->
Resposta de referência: No tempo 1, os três todos estão **pending** (criados mas não iniciados). No tempo 2, "escrever os casos de teste" passa a **in_progress**, enquanto os outros dois seguem pending. No tempo 3, "escrever os casos de teste" passa a **completed** e "rodar a suíte de testes" passa a in_progress. No tempo 4, "rodar a suíte de testes" passa a **completed**; o "corrigir os casos que falham" original, genérico, é refinado em dois novos todos, "corrigir o caso A" e "corrigir o caso B", com "corrigir o caso A" em **in_progress** e "corrigir o caso B" em **pending**. No tempo 5, tendo descoberto que o caso B não precisa de correção, "corrigir o caso B" deve ter seu status definido como **deleted** por meio de uma chamada TaskUpdate — a quarta etapa do ciclo de vida, "removido", é exatamente o que trata desse caso de "não é mais necessário", em vez de deixar o item sumir silenciosamente da lista sem deixar registro.

<!-- hint -->
Os quatro estados mapeiam para as quatro etapas do ciclo de vida: criado mapeia para pending, ativado para in_progress, concluído para completed, não mais necessário para deleted. Trabalhe cada item confrontando-o com a seção "O ciclo de vida do todo" desta lição, um por um.

<!-- hint -->
O tempo 5 é onde é fácil esquecer a etapa "passa a deleted" e tratá-la como "este item deixa de existir". Lembre o ponto desta lição de que toda mudança de status acontece por meio de uma chamada de ferramenta explícita — a remoção também precisa de uma mudança de status explícita, não de um desaparecimento implícito.

### Nível 2: Diagnostique um design de tarefa irrecuperável

Uma equipe projetou esta lógica de execução: o progresso da tarefa do agente aparece apenas no resumo em linguagem natural de cada uma de suas respostas, algo como "até agora as duas primeiras etapas estão prontas, atualmente cuidando da terceira". Esse resumo existe apenas no histórico de mensagens da sessão atual; a equipe não grava nenhum arquivo de checkpoint. O sistema ocasionalmente reinicia o processo por limites de recurso, e depois de um reinício a mesma tarefa é retomada.

Aponte os dois problemas neste design (um sobre "se o estado é estruturado", outro sobre "se o estado é persistido") e dê a direção de correção correspondente para cada um.

<!-- rubric -->
- Problema um: um resumo em linguagem natural não é estado estruturado, então o código hospedeiro não consegue analisar de forma confiável "exatamente qual etapa ele alcançou"
- Problema dois: o progresso existe apenas no histórico da sessão sem checkpoint gravado, então quando um reinício de processo perde a sessão, o estado se perde junto
- As correções correspondem respectivamente a: migrar para uma lista de todos com campos fixos (como o conjunto de status pending/in_progress/completed/deleted), e adicionalmente gravar o estado da lista em um arquivo de checkpoint

<!-- answer -->
Resposta de referência: Problema um — o progresso existe apenas como um resumo em linguagem natural ("até agora as duas primeiras etapas estão prontas"), sem campos fixos, então o código hospedeiro não tem como analisar de forma confiável "exatamente quais etapas estão prontas, qual etapa é a atual". A redação do resumo pode variar de turno para turno, então a lógica de análise é fácil de errar ou não pode ser automatizada de jeito nenhum. A correção é migrar para uma lista de todos estruturada onde cada todo tem um campo de status explícito (pending / in_progress / completed / deleted), com mudanças de status feitas por meio de chamadas de ferramenta explícitas, em vez de reinterpretar linguagem natural. Problema dois — mesmo depois de migrar para uma lista estruturada, esse estado ainda vive apenas no histórico de mensagens da sessão atual, e a equipe não grava nenhum arquivo de checkpoint separado. Quando um reinício de processo encerra a sessão, o histórico e a lista de todos dentro dele desaparecem juntos, e na próxima vez que for retomada de novo não há como saber o progresso. A correção é adicionalmente persistir o estado da lista de todos em um arquivo de checkpoint, para que depois de um reinício de processo o agente primeiro leia o checkpoint mais recente, e então decida de qual etapa continuar, em vez de depender só do histórico da sessão.

<!-- hint -->
Pense nos dois problemas separadamente: um é "um programa consegue ler de forma confiável essa descrição de progresso", o outro é "mesmo que consiga, a descrição ainda está lá depois de um reinício de processo". Esta lição chama essas duas coisas de estado estruturado e checkpoints — elas resolvem problemas em níveis diferentes.

<!-- hint -->
Lembre o "quando a sessão termina, tudo o que está na janela some" da Lição 3 — se a lista de todos vive apenas no histórico da sessão, então por mais estruturada que seja, quando um reinício de processo encerra a sessão ela desaparece junto. É exatamente por isso que os checkpoints existem.

<!-- /exercises -->

## Recapitulação

- O progresso de uma tarefa só pode ser lido de forma confiável pelo código hospedeiro depois que se torna estado estruturado; uma descrição de progresso espalhada por respostas em linguagem natural não pode ser analisada de forma estável em "em qual etapa estamos agora"
- O ciclo de vida completo de um todo tem quatro etapas — criado (pending), ativado (in_progress), concluído (completed), removido (deleted) — e cada etapa acontece por meio de uma chamada de ferramenta estruturada explícita que pode ser observada no fluxo de mensagens
- Estruturado e persistente são duas coisas diferentes: estruturado resolve "um programa consegue lê-lo", um checkpoint resolve "o estado ainda está lá depois de um reinício de processo ou do fim de uma sessão" — você precisa dos dois
- Um checkpoint grava o estado de uma tarefa em um momento no tempo em algum lugar fora do tempo de vida da sessão, transformando a recuperação em "continuar de onde foi interrompido" em vez de "recomeçar", e evitando especialmente a reexecução acidental de operações não idempotentes
- O estado estruturado, assim como a memória externa, se torna seu próprio alvo de ataque uma vez persistido — o tema da próxima lição; quanto mais você preserva, mais limites você tem que manter

[>> Lição 5: Os limites e a segurança da memória](./05-memory-boundaries-and-safety.md)
