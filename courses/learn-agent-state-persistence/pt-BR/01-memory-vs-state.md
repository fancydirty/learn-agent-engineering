# Lição 1: Além da memória, existe o estado

> Objetivos de aprendizado:
> - Distinguir em uma frase “memória” (o contexto que você entrega ao modelo) de “estado de execução” (a cena em andamento que o harness está segurando), e dar um exemplo de cada
> - Nomear pelo menos três motivos concretos para “uma queda é especialmente fatal para uma tarefa longa”, e dizer para qual parte da execução cada um aponta
> - Dada uma lista de coisas que um harness em execução está manejando, decidir se cada uma é memória, estado de execução ou saída em disco — e se ela sobrevive ao processo ser morto
>
> Pré-requisitos: Conclua os cursos anteriores desta série e entenda o loop de harness dirigido pelo `stop_reason` de “Fundamentos do Harness de Agente: Laços e Controle” e o gerenciamento de contexto de “Context Engineering: gastando a atenção finita onde ela conta” | Próxima: [Lição 2 >>](./02-checkpoint-anatomy.md)

## Turno 23, e o processo é morto

Imagine o harness que você escreveu em “Fundamentos do Harness de Agente: Laços e Controle” rodando uma tarefa longa que leva 40 turnos: ler um lote de arquivos, analisá-los um a um e ir acrescentando conclusões a um relatório conforme avança. No turno 23, o processo é morto — talvez uma atualização de deploy, talvez o servidor tenha perdido energia, talvez você tenha errado o dedo no Ctrl+C.

Você confere o disco: os arquivos de relatório dos primeiros 22 turnos estão todos lá; o `NOTES.md` (aquele resumo de progresso da tarefa que você montou em “Context Engineering: gastando a atenção finita onde ela conta”) ainda registra “até qual arquivo eu analisei, e qual foi a conclusão”. Parece que não se perdeu muita coisa — é só reiniciar o processo e continuar de onde parou.

Mas assim que você reinicia, descobre que o array `messages` dentro de `runAgent` está vazio — ele tem que ser reconstruído a partir de `[{ role: "user", content: userInput }]`. O contador `turns` voltou a zero. `tokensUsed` também voltou a zero. E se a queda pegou o turno 23 bem no meio entre “o modelo indicou uma ferramenta” e “o resultado da ferramenta foi devolvido para `messages`”, aquela chamada de ferramenta — quer tivesse acabado de começar a rodar, quer já tivesse terminado — também não deixa rastro nenhum.

A tarefa não retoma do turno 23; ela recomeça do turno 1. Os arquivos em disco estão todos lá, mas o registro do próprio harness sobre “até onde eu cheguei” não deixou nada para trás.

## O que é memória, o que é estado

Antes que este curso possa ensinar o que veio ensinar, ele precisa traçar uma linha contra um conceito que é fácil de embaralhar.

**Memória** é o contexto que você entrega ao modelo — o Curso 5, “Memória e Estado de Agente”, cobre como persisti-la entre sessões, e o Curso 8, “Context Engineering: gastando a atenção finita onde ela conta”, cobre exatamente o que você entrega ao modelo para olhar a cada turno. Ela responde à pergunta “o que o modelo já viu?”. O `NOTES.md` é um dos veículos da memória: ele já está gravado em disco, e o turno seguinte ou a sessão seguinte pode lê-lo de volta e jogá-lo no prompt.

**Estado de execução** é a cena em andamento que o próprio processo do harness está segurando — o array `messages`, contadores como `turns` e `tokensUsed`, a chamada de ferramenta que ainda não foi registrada. Ele responde à pergunta “o harness lembra até onde chegou?”.

A diferença essencial entre os dois não é “qual é o conteúdo”, e sim “onde ele vive agora”. A memória pode já estar em disco (o `NOTES.md` fica no sistema de arquivos, e o processo viver ou morrer não muda o fato de que ele continua lá); o estado de execução, por padrão, vive apenas na memória do processo — aquilo que a linha `let messages = [...]` cria é liberado junto com a memória no instante em que o processo termina, a menos que alguém o grave deliberadamente em disco. Nada da seção anterior — `messages`, `turns`, `tokensUsed`, a chamada de ferramenta órfã — é gravado em disco por conta própria.

```javascript
// No instante em que o turno 23 está rodando, estas coisas vivem apenas na memória do processo node
let state = {
  messages,        // o histórico completo da conversa — a única fonte para restaurar o contexto
  turns,           // em qual turno estamos
  tokensUsed,      // uso acumulado
  pendingToolUse,  // uma ferramenta indicada pelo modelo, cujo resultado ainda não voltou para messages
};
```

Este `state` é exatamente o que este curso vai te ensinar a transformar em algo que pode ser gravado em disco e restaurado.

## Por que isso é decisivo para tarefas longas

Primeiro, faça as contas: "Agents can run for long periods of time, maintaining state across many tool calls."[^S1] (Agentes podem rodar por longos períodos de tempo, mantendo estado ao longo de muitas chamadas de ferramenta.) É exatamente por isso que o array `messages` no turno 23 não para de crescer. Mas isso também significa que "Agents are stateful and errors compound."[^S1] (Agentes são stateful e os erros se acumulam.): quanto mais estado se empilha, no instante em que algo na cadeia dá errado o custo não é linear, ele se soma.

Some mais uma: "Without effective mitigations, minor system failures can be catastrophic for agents."[^S1] (Sem mitigações eficazes, falhas menores de sistema podem ser catastróficas para agentes.) Pôr “menor” e “catastrófica” lado a lado descreve exatamente a situação do turno 23 — o processo ser morto é, por si só, um evento de operação corriqueiro, mas ele apaga 22 turnos de estado de execução de uma só vez, e é isso que amplifica o custo.

Depois de um erro, "When errors occur, we can't just restart from the beginning: restarts are expensive and frustrating for users."[^S1] (Quando erros acontecem, não podemos simplesmente recomeçar do início: reinícios são caros e frustrantes para os usuários.) O que você quer construir, então, é um sistema em que, "Instead, we built systems that can resume from where the agent was when the errors occurred."[^S1] (Em vez disso, construímos sistemas que conseguem retomar de onde o agente estava quando os erros aconteceram.) — e é por isso que “além da memória, existe o estado” não é uma distinção acadêmica, e sim a base de saber se uma tarefa longa consegue sobreviver a uma interrupção.

Quanto mais longa a tarefa, mais pesada essa conta: "The LLM will potentially operate for many turns, and you must have some level of trust in its decision-making."[^S3] (O LLM potencialmente vai operar por muitos turnos, e você precisa ter algum nível de confiança na tomada de decisão dele.), e "The autonomous nature of agents means higher costs, and the potential for compounding errors."[^S3] (A natureza autônoma dos agentes significa custos maiores e o potencial de erros que se acumulam.). Quanto mais turnos ele roda, mais espesso o estado de execução que acumula, e mais uma única interrupção pode apagar.

## Quedas não são raras

Aquele “o processo foi morto” no turno 23 soa como um acidente de baixa probabilidade, mas para uma tarefa longa que roda dezenas de turnos, ser interrompida no meio do caminho não é nada incomum. Até a mais rotineira das atualizações de deploy pode colidir com um agente em execução — e é por isso que as equipes deliberadamente "use rainbow deployments to avoid disrupting running agents, by gradually shifting traffic from old to new versions"[^S1] (usam rainbow deployments para evitar interromper agentes em execução, deslocando gradualmente o tráfego das versões antigas para as novas), pela razão de que "whenever we deploy updates, agents might be anywhere in their process."[^S1] (sempre que implantamos atualizações, os agentes podem estar em qualquer ponto do seu processo.).

Em outras palavras, até quem toca a operação trata “o agente pode ser interrompido a qualquer momento” como algo que vai acontecer, e projeta mecanismos justamente para desviar disso. O seu harness não tem motivo nenhum para supor que terá mais sorte.

## A cura, em prévia: o roteiro deste curso

O estado de execução perdido no turno 23 tem uma correção em cinco etapas, que é também a ordem das cinco lições seguintes:

1. **Checkpoints** (Lição 2) — serializar periodicamente para um arquivo de checkpoint em disco o estado de execução, como `messages`, `turns`, `tokensUsed` e a chamada de ferramenta órfã.
2. **Retomar de um checkpoint** (Lição 3) — depois que o processo reinicia, ler esse estado de volta do arquivo de checkpoint, reconstruir `messages` e deixar o loop continuar de onde quebrou, em vez de recomeçar do turno 1.
3. **Efeitos colaterais e idempotência** (Lição 4) — a parte mais difícil de retomar não é “o estado sumiu”, é “algumas chamadas de ferramenta podem de fato já ter rodado”: quais ferramentas é seguro reexecutar, e quais precisam ser protegidas contra rodar duas vezes.
4. **Rebobinar e bifurcar** (Lição 5) — checkpoints não servem só para recuperação de desastre; eles também deixam você rebobinar para uma cena anterior e tentar de novo, ou bifurcar outra tentativa a partir de algum nó.
5. **Mão na massa** (Lição 6) — pegar o maquinário das lições anteriores, encaixá-lo no harness de “Fundamentos do Harness de Agente: Laços e Controle” e você mesmo levar uma tarefa longa pelo caminho “morta no meio, reiniciada, executada até o fim”.

Um roteiro comunitário de código aberto construído em torno de “engenharia de harness” resume isso em uma linha: "Checkpoint state every node so you can resume, rewind, fork."[^S5] (Faça checkpoint do estado em cada nó para que você possa retomar, rebobinar, bifurcar.) — isso é apenas um enquadramento, vindo de um documento comunitário, sobre o que o componente de persistência responde, não uma especificação que este curso copia literalmente, mas a ordem que ele aponta bate com as cinco etapas acima.

## Proporção: nem toda tarefa precisa disso

Nem todo agente tem que carregar o maquinário de checkpoints. Sobre acrescentar complexidade, "you should consider adding complexity only when it demonstrably improves outcomes."[^S3] (você deveria considerar acrescentar complexidade apenas quando isso melhora comprovadamente os resultados.) — uma tarefa que se encerra em alguns turnos de chamada de ferramenta tem só um punhado de entradas em `messages`, e se o processo morrer você simplesmente roda de novo; o custo é perguntar mais uma vez, o que não justifica projetar um mecanismo inteiro de gravar e restaurar.

O que de fato precisa do maquinário deste curso é um cenário como o do turno 23 lá em cima: uma tarefa que roda dezenas de turnos, pode levar de minutos a horas e acumula pelo caminho uma pilha grande de estado de execução não persistido. Para decidir se você traz checkpoints para dentro, faça a si mesmo uma pergunta primeiro: se ela fosse morta agora, você aguentaria o custo de reexecutá-la? Se não aguentaria, é aí que entram as próximas lições.

```agentmentor-check
{
  "id": "sp-zh-01-restart-illusion",
  "label": "Avaliando se dá para simplesmente reiniciar e reexecutar depois que o processo cai",
  "prompt": "Seu harness está rodando uma tarefa longa de 40 turnos, e no turno 23 o processo é morto (digamos que ele colidiu com uma atualização de deploy). Você confere o disco: os arquivos de relatório dos primeiros 22 turnos estão todos lá, e o `NOTES.md` registra o progresso concluído até então. Você conclui: esta queda não causou dano real, é só reiniciar o processo e rodar a tarefa do começo. Essa conclusão se sustenta?",
  "whyHere": "Esta verificação aparece logo depois de ensinarmos a diferença de localização física entre memória e estado de execução — a memória pode já estar em disco, o estado de execução por padrão vive apenas na memória do processo. “Os arquivos de saída estão todos em disco, então nada se perdeu” é a armadilha de intuição em que é mais fácil cair aqui, e ela precisa ser corrigida na hora.",
  "mode": "single",
  "choices": [
    {
      "id": "a",
      "text": "Se sustenta — os arquivos de relatório e o NOTES.md estão ambos em disco, então nada se perdeu; é só reiniciar e reexecutar do começo",
      "correct": false,
      "feedback": "Não exatamente. Arquivos em disco não significam que o estado de execução continua lá. O array `messages`, `turns` e `tokensUsed` são variáveis na memória do processo, e enquanto ninguém as serializar deliberadamente em disco elas são liberadas junto com a memória no instante em que o processo morre — elas e os arquivos de relatório já persistidos e o `NOTES.md` vivem fisicamente em dois lugares diferentes, e um ter sumido não significa que o outro continue por lá."
    },
    {
      "id": "b",
      "text": "Não se sustenta, mas a única coisa realmente perdida é o contador tokensUsed; o array messages e a chamada de ferramenta órfã podem, na verdade, ser reconstruídos a partir dos arquivos de relatório já gerados",
      "correct": false,
      "feedback": "Não exatamente. Os arquivos de relatório são a saída da tarefa executada até certa etapa, não um registro da execução em si — eles não preservam o que o modelo disse a cada turno, os argumentos completos e o resultado de cada chamada de ferramenta, nem se a queda pegou uma chamada de ferramenta em pleno voo. Você não consegue deduzir esses detalhes a partir da saída, então o array messages e a chamada órfã não podem ser recuperados dali; isso exige um instantâneo feito para esse fim."
    },
    {
      "id": "c",
      "text": "Não se sustenta — a cena em andamento que o harness segura (o array messages, os contadores de turno e de uso, a chamada de ferramenta ainda não registrada) vive por padrão apenas na memória do processo e some no instante em que o processo morre; reiniciar é caro, e reexecutar do começo também pode repetir efeitos colaterais que já aconteceram",
      "correct": true,
      "feedback": "Correto. Você não pode recomeçar do início depois de um erro, porque reinícios são caros e frustrantes, e é exatamente por isso que se constroem sistemas que retomam de onde o erro aconteceu. Pior: “rodar tudo de novo” não é só tempo desperdiçado — se uma ferramenta dos primeiros 22 turnos de fato executou (enviou um e-mail, alterou um registro), rodar do turno 1 outra vez significa que essas ações acontecem uma segunda vez. Como lidar com esse tipo de efeito colateral é assunto da Lição 4."
    }
  ]
}
```

<!-- exercises -->
## 💻 Exercícios

### Nível 1: Classifique seis “coisas” em execução

Abaixo estão seis “coisas” envolvidas em um harness em execução. Encaixe cada uma em “memória”, “estado de execução” ou “saída em disco”, e diga: se o processo for morto neste exato instante, ela continua lá?

1. O resumo de progresso da tarefa já gravado no `NOTES.md` (aquele que você montou em “Context Engineering: gastando a atenção finita onde ela conta”)
2. O array `messages` em memória
3. O arquivo de relatório `report.md` já gravado em disco
4. O contador `turns` (em qual turno estamos)
5. Um trecho de análise sobre a estrutura do projeto no texto de resposta que o modelo acabou de produzir neste turno — ainda não gravado no `NOTES.md`
6. Um bloco `tool_use` que o modelo indicou, cuja ferramenta não terminou de rodar e cujo resultado não foi devolvido para `messages`

<!-- rubric -->
- Todas as seis recebem uma classificação, e as linhas gerais estão certas: `messages`, `turns` e o `tool_use` órfão vão para “estado de execução”; o resumo já persistido do `NOTES.md` vai para “memória” (com a observação de que está em disco), e o `report.md` vai para “saída em disco” — ambos estão em disco, mas um é contexto para devolver ao modelo e o outro é um artefato de saída da tarefa, então pertencem a categorias diferentes; o item 5 vai para “memória”, mas com a ressalva especial de que ainda não foi persistido
- Consegue articular que “memória” não é o mesmo que “já persistido” — o item 5 prova que a própria memória ainda pode estar na memória do processo e se perder com ele, o mesmo aperto do estado de execução
- O veredito “continua lá / sumiu” depois de uma queda está correto: os itens 1 e 3 continuam lá; os itens 2, 4 e 6 sumiram; o item 5 também sumiu (porque, mesmo sendo conteúdo de memória, não foi persistido a tempo)

<!-- answer -->
1. **Memória, já persistida** — o `NOTES.md` é um veículo de contexto entregue ao modelo, e este resumo já está gravado no arquivo; uma queda do processo não o toca, e ele pode ser lido de volta depois do reinício.
2. **Estado de execução** — o array `messages` é o histórico de conversa que o próprio harness segura, vivendo apenas na memória do processo; ele é varrido por uma queda e tem que ser reconstruído do zero.
3. **Saída em disco** — o `report.md` é o artefato que a execução da tarefa produziu, já persistido, e continua lá intacto depois de uma queda.
4. **Estado de execução** — `turns` é uma variável contadora em memória, de volta a zero depois de uma queda; ao retomar você precisa saber de qual turno continuar contando.
5. **Memória, mas não persistida** — este “entendimento da estrutura do projeto” é, em essência, do mesmo tipo do que está no `NOTES.md` (ambos são contexto para entregar ao modelo), mas neste instante ele existe apenas no texto de resposta do modelo deste turno. Se o harness ainda não o levou para o `NOTES.md` e o processo cai, esse entendimento vai junto. Isso mostra que a classificação “memória” versus “estado de execução” não é exatamente a mesma coisa que “em disco” versus “em memória” — a memória também pode estar ainda não persistida.
6. **Estado de execução** — este bloco `tool_use` órfão é o caso clássico de “queda entre a execução da ferramenta e o registro do resultado”, existindo apenas no `messages` em memória ou em alguma fila pendente; depois de uma queda ele não deixa registro nenhum, e a Lição 3 trata especificamente desse tipo de ruptura.

<!-- hint -->
Não use “em disco” versus “em memória” como único teste — o item 5 é um contraexemplo: pelo conteúdo ele é memória, mas neste instante ainda não está persistido.

<!-- hint -->
Os itens 2, 4 e 6 têm algo em comum: são todos coisas que o loop do harness usa, enquanto roda, para registrar “até onde eu cheguei”, e sem um mecanismo de persistência feito para isso eles morrem com o processo.

### Nível 2: Escreva um inventário de perdas por queda para o harness de "Agent Harness Fundamentals"

De volta ao cenário de abertura: o `runAgent` de “Fundamentos do Harness de Agente: Laços e Controle” (dirigido por um loop de `stop_reason` sobre as variáveis `messages`, `turns`, `tokensUsed`) está rodando uma tarefa de 40 turnos, e no turno 23 o processo é morto — e a queda cai exatamente entre “o modelo indicou uma ferramenta” e “o resultado da ferramenta foi devolvido para `messages`”. Sem escrever código, faça duas coisas em palavras:

1. **Inventário de perdas por queda**: o que exatamente esta queda perdeu? O que não foi afetado e continua lá?
2. **O que o checkpoint deveria segurar**: se este harness tivesse um mecanismo de checkpoint, quais campos você acha que o arquivo de checkpoint precisa segurar, no mínimo, para manter essa perda a menor possível? Liste os nomes dos campos e diga por que cada um tem que ser salvo.

<!-- rubric -->
- O inventário de perdas aponta explicitamente o array `messages`, `turns`, `tokensUsed` e a chamada `tool_use` presa entre a execução da ferramenta e o registro do resultado — todas essas coisas em memória se perdem; e reconhece que os arquivos de saída já gerados em disco e o `NOTES.md` não foram afetados e continuam lá
- A proposta de campos cobre ao menos `messages`, `turns` e `tokensUsed` — as três variáveis prontas que você reconhece direto no código do `runAgent` — e dá um “por que salvar” de uma linha para cada uma (por exemplo, `messages` é a única fonte para restaurar o contexto da conversa, `turns` serve para julgar a que distância se está do teto de turnos, `tokensUsed` alimenta o orçamento e o limiar de compactação de “Context Engineering: gastando a atenção finita onde ela conta”)
- Reconhece que “uma chamada de ferramenta em execução, ainda não registrada” precisa de um campo próprio (mesmo que você mesmo lhe dê nome; ele não precisa bater com o nome usado nas lições seguintes), e explica que isso se deve ao fato de a queda poder cair exatamente entre a ferramenta terminar e o resultado ser gravado de volta em `messages`, de modo que, sem um registro separado, não há como julgar se a chamada conta

<!-- answer -->
**Inventário de perdas por queda**:
- Perdido: o array `messages` em memória (os primeiros 22 turnos mais a parte do turno 23 já montada nele), o contador `turns` (que deveria estar em 22 ou 23), o uso acumulado `tokensUsed`, e a chamada de ferramenta presa entre “o modelo já a indicou” e “o resultado ainda não devolvido para `messages`” — se ela terminou sem ser registrada ou se nunca chegou a terminar é completamente indecidível depois do reinício.
- Não perdido: os arquivos de relatório dos turnos anteriores já gravados em disco, e o resumo de progresso já persistido no `NOTES.md`; uma queda do processo não toca nisso, e eles estão lá intactos.

**Campos que o checkpoint deveria segurar**:
- `messages` — a única fonte para restaurar o contexto da conversa; sem ele, tudo o que o modelo viu e disse antes do turno 23 não pode ser reconstruído.
- `turns` — depois de retomar você tem que saber quantos turnos já rodou para julgar corretamente a que distância se está do teto de turnos, para não bater no teto no instante em que retoma ou, no sentido oposto, se dar turnos extras.
- `tokensUsed` — depois de retomar você tem que continuar contando o uso para se alinhar com o orçamento e o limiar de compactação definidos em “Context Engineering: gastando a atenção finita onde ela conta”; caso contrário, você retomou um agente que não sabe quanto já gastou.
- Um campo dedicado a registrar “uma chamada de ferramenta em execução, ainda não registrada” — porque a queda pode cair exatamente entre a ferramenta terminar e o resultado ser gravado de volta em `messages`. Sem registrar separadamente a identidade e os argumentos dessa chamada, ao retomar você não sabe nem se deve reexecutá-la, nem que tipo de resultado preencher de volta em `messages`.

<!-- hint -->
Volte ao corpo do `runAgent` em “Fundamentos do Harness de Agente: Laços e Controle” e veja em quais variáveis ele empurra coisas conforme o loop gira — essas variáveis são basicamente a espinha dorsal tanto do inventário de perdas quanto dos campos do checkpoint.

<!-- hint -->
O instante exato da queda importa: uma queda entre “a resposta do modelo chegou” e “a ferramenta de fato começou a rodar” versus uma entre “a ferramenta terminou” e “o resultado foi devolvido para messages” leva a respostas diferentes sobre se a chamada de ferramenta conta e como lidar com ela — resolva isso primeiro, depois decida que informação esse campo deve registrar.

<!-- /exercises -->

## Recapitulação

- Agentes podem rodar por longos períodos, mantendo estado ao longo de muitas chamadas de ferramenta, e justamente por isso são stateful e os erros se acumulam[^S1] — quanto mais estado se empilha, mais uma única falha pode apagar.
- Sem mitigações eficazes, uma falha menor de sistema pode ser catastrófica para um agente[^S1]; depois de um erro você não pode recomeçar do início, porque reinícios são caros e frustrantes para os usuários, então você constrói sistemas que retomam de onde o erro aconteceu[^S1].
- Quedas não são raras — até uma atualização rotineira de deploy pede rainbow deployments justamente para evitar interromper agentes em execução, porque, na hora de implantar, um agente pode estar em qualquer ponto do seu processo[^S1].
- A operação autônoma carrega inerentemente custos maiores e o risco de erros que se acumulam[^S3]; quanto mais longa a tarefa, mais pesada essa conta, e mais ela precisa de um mecanismo que sobreviva a uma interrupção.
- Nem toda tarefa tem que carregar esse maquinário — acrescente complexidade apenas quando isso melhora comprovadamente os resultados[^S3], e para uma tarefa que se encerra em alguns turnos o custo de simplesmente reexecutá-la costuma ser aceitável.
- Memória (o contexto entregue ao modelo) e estado de execução (a cena em andamento que o harness segura) são duas coisas diferentes: a memória pode já estar persistida, o estado de execução por padrão vive apenas na memória do processo — e as próximas lições são sobre transformar também esse estado de execução em algo que pode ser gravado em disco e restaurado.

[>> Lição 2: Checkpoints: gravando a cena de execução em disco](./02-checkpoint-anatomy.md)
