# Lição 2: Checkpoints: gravando a cena de execução em disco

> Objetivos de aprendizado:
> - Nomear os seis campos que pertencem ao checkpoint.json e, para cada um, dizer com o que a retomada esbarra quando ele falta
> - Distinguir os dois pontos de gravação dentro de um único turno do loop (depois que o modelo indica uma ferramenta, depois que o resultado da ferramenta é registrado) e explicar para o que você se expõe ao gravar apenas um deles
> - Escrever um `saveCheckpoint` que não consegue corromper o próprio arquivo de checkpoint — gravar um arquivo temporário e depois renomear atomicamente, em vez de sobrescrever no lugar
>
> Pré-requisitos: Leia a Lição 1 e saiba distinguir memória de estado de execução; esteja à vontade com o array `messages` e com o esqueleto de loop dirigido pelo `stop_reason` de "Agent Harness Fundamentals: Loops and Control" | Anterior: [Lição 1 <<](./01-memory-vs-state.md) | Próxima: [Lição 3 >>](./03-resume-from-checkpoint.md)

## A cena de execução vive em memória por padrão

A Lição 1 separou memória e estado de execução: memória é o que você entrega ao modelo, estado de execução é a cena em andamento que o próprio harness está segurando — o array `messages`, o contador de turnos, a chamada de ferramenta cujo resultado ainda não foi registrado. Por padrão, essa cena existe apenas na memória do processo. Quando o processo morre, ela vai junto, e mesmo com todos os outros arquivos em disco intactos, a tarefa só pode recomeçar do zero.

Gravar essa cena em disco — transformá-la em algo que um processo reiniciado possa ler de volta — é o que um **checkpoint** é. O que de fato sustenta a confiabilidade de tarefas longas na prática normalmente não é pedir ao modelo que absorva sozinho toda falha; é combinar "the adaptability of AI agents built on Claude with deterministic safeguards like retry logic and regular checkpoints"[^S1] (a adaptabilidade de agentes de IA construídos sobre o Claude com salvaguardas determinísticas como lógica de retentativa e checkpoints regulares). Esta lição cobre a metade dos checkpoints: o que entra em um, onde no loop gravá-lo, e como realizar a gravação em si — porque um checkpoint gravado errado pode te deixar em situação pior do que checkpoint nenhum.

## O que salvar: os seis campos do checkpoint.json

Um checkpoint não é “despejar tudo o que está em memória em um arquivo”. É “registrar o que a retomada do loop precisa — nem mais, nem menos”. Todas as lições seguintes deste curso rodam sobre o mesmo protocolo:

```javascript
const checkpoint = {
  version: 1,
  task: "Classificar os tickets de suporte do último trimestre por tipo de problema e consolidá-los em uma única tabela",
  turns: 3,
  tokensUsed: 14208,
  messages: [/* o histórico completo da conversa */],
  pendingToolUse: null, // ou { id, name, input }
};
```

- **version**: o número de versão do protocolo. Este formato vai mudar em algum momento (compressão para `messages`, um novo formato para `pendingToolUse`), e `version` permite que o caminho de retomada pergunte “eu reconheço este checkpoint?” antes de qualquer outra coisa — em uma versão que ele não conhece, deveria se recusar a carregar e falhar de forma barulhenta, em vez de cerrar os dentes e seguir analisando.
- **task**: a tarefa original do usuário, em palavras. Depois de um reinício, o código do harness não lembra o que estava fazendo; tudo o que ele pode ler é este arquivo em disco. Sem `task`, o harness não consegue nem dizer a qual tarefa o checkpoint pertence, quanto mais reportar ao usuário o progresso da retomada.
- **turns**: quantos turnos já rodaram. É o que decide se as condições de parada de "Agent Harness Fundamentals: Loops and Control" disparam (um teto máximo de turnos, digamos), e é o número a partir do qual a retomada continua contando, em vez de recomeçar do zero.
- **tokensUsed**: o gasto acumulado de tokens. O limiar de compactação de "Context Engineering: Spending Finite Attention Where It Counts" dispara a partir desse número. Deixe-o de fora do checkpoint e a retomada ou finge que a contagem começa em zero — pondo toda decisão de compactação fora de compasso — ou tem que reestimar o uso de cada mensagem em `messages`, e na maioria das montagens os números históricos de uso simplesmente não estão mais disponíveis.
- **messages**: a cena inteira da conversa, cada mensagem user / assistant / tool_result que o modelo viu. É a maior coisa do checkpoint e a única que você não pode pular: o modelo não tem memória própria, e tudo o que ele sabe sobre o que aconteceu antes é este array que você lhe entrega na requisição seguinte. Descarte-o e o que você retoma não é “seguir em frente” — é uma tarefa novinha começando do zero, arrastando junto todo efeito colateral que a execução antiga já produziu.
- **pendingToolUse**: ou `null`, ou um registro no formato `{ id, name, input }` — uma ferramenta que o modelo indicou e cujo resultado ainda não foi registrado. O que fazer com esse campo é assunto da Lição 3, onde a retomada faz a reconciliação contra ele; aqui você só precisa saber que ele é a vaga designada do checkpoint para marcar um estado pela metade. Para manter seu formato simples, todos os exemplos desta lição supõem um bloco `tool_use` por turno; quando um turno emite várias chamadas de ferramenta concorrentes, transforme-o em um array — o raciocínio é o mesmo.

## Quando salvar: dois pontos de gravação por turno

Jogue esses campos dentro do loop e o momento de gravar acaba não sendo tão simples quanto “gravar uma vez ao fim de cada turno”. Há dois pontos de gravação:

```javascript
while (response.stop_reason === "tool_use") {
  state.messages.push({ role: "assistant", content: response.content });

  const block = response.content.find((b) => b.type === "tool_use");

  // Ponto de gravação A: o modelo indicou uma ferramenta, ela ainda não rodou
  state.pendingToolUse = { id: block.id, name: block.name, input: block.input };
  saveCheckpoint(state);

  const result = await executeTool(block.name, block.input);

  state.messages.push({
    role: "user",
    content: [{ type: "tool_result", tool_use_id: block.id, content: result }],
  });
  state.turns += 1;
  state.pendingToolUse = null;

  // Ponto de gravação B: o resultado da ferramenta deste turno está inteiramente registrado em messages
  saveCheckpoint(state);

  response = await callModel({ tools, messages: state.messages });
  state.tokensUsed += response.usage?.output_tokens ?? 0;
}
```

O **ponto A** fica depois que a resposta do modelo chega e antes de a ferramenta rodar: registre o bloco `tool_use` da resposta em `pendingToolUse` e então grave. O **ponto B** fica depois que o resultado da ferramenta foi acrescentado a `messages`: devolva `pendingToolUse` a `null` e então grave de novo.

Só o B basta? A exposição é a janela entre A e B — o modelo indicou uma ferramenta e a ferramenta está rodando, ou terminou mas o resultado não chegou a `messages` nem foi gravado em disco. Se o processo morre nessa janela, o último checkpoint em disco ainda é o que o B gravou no turno anterior, e ele não sabe nada sobre a chamada deste turno: não é que algum detalhe se perdeu, é que essa chamada de ferramenta não deixou rastro nenhum em disco. A Lição 3 reconcilia na retomada — aquela ferramenta realmente terminou, ela precisa ser reexecutada — e o que ela reconcilia é exatamente o `pendingToolUse` que o A gravou. Esta lição só cava o buraco; os exercícios da lição 6 põem na sua frente um checkpoint só com B e pedem que você diagnostique o que dá errado na retomada.

## Como salvar: você não pode sobrescrever no lugar

A abordagem óbvia é passar o objeto `state` por `JSON.stringify` e jogá-lo com `fs.writeFileSync` direto por cima do velho `checkpoint.json`. Isso funciona bem quando o processo termina normalmente — mas “terminar normalmente” é exatamente o caso para o qual checkpoints não servem. Checkpoints existem para o processo ser morto a qualquer momento, para a queda de energia, para o contêiner ser despejado. Gravar um arquivo não é uma operação atômica. Se o processo for interrompido no meio da gravação, o `checkpoint.json` deixado em disco pode estar pela metade: nem a versão antiga, nem a nova, só JSON truncado. A retomada seguinte lança uma exceção no `JSON.parse`, e aquele arquivo era a única cópia da cena da tarefa — não há versão mais antiga para a qual recuar.

A jogada é “gravar um arquivo temporário e então renomear atomicamente”. Grave o conteúdo completo em `checkpoint.json.tmp`; se você cair na metade desse passo, a única baixa é o arquivo temporário, e o `checkpoint.json` de verdade continua sendo a versão anterior intacta, de antes da queda, que a retomada lê sem problema. Assim que o arquivo `.tmp` estiver completo, use `fs.renameSync` para movê-lo sobre o nome real. No mesmo sistema de arquivos, `rename` é uma substituição atômica de um passo só: o sistema operacional ou aponta a entrada de diretório para o novo arquivo por inteiro, ou a deixa apontando para o antigo. Não existe um estado de meio-renomeado no meio do caminho.

```javascript
import fs from "node:fs";
import path from "node:path";

function saveCheckpoint(state, dir = "./checkpoints") {
  fs.mkdirSync(dir, { recursive: true });

  const finalPath = path.join(dir, "checkpoint.json");
  const tmpPath = `${finalPath}.tmp`;

  fs.writeFileSync(tmpPath, JSON.stringify(state, null, 2));
  fs.renameSync(tmpPath, finalPath); // em um mesmo sistema de arquivos, rename é uma substituição atômica
}
```

```agentmentor-check
{
  "id": "sp-zh-02-direct-overwrite-risk",
  "label": "Avaliando o que dá errado ao sobrescrever o arquivo de checkpoint no lugar",
  "prompt": "Você está prestes a escrever saveCheckpoint assim: passar o objeto state por JSON.stringify e então jogá-lo com fs.writeFileSync direto por cima do mesmo checkpoint.json. Qual é o problema disso?",
  "whyHere": "Esta verificação aparece logo depois da receita de gravar um .tmp e então renomear, para checar se você de fato entende por que sobrescrever no lugar é inseguro, em vez de apenas decorar a conclusão de que se deve usar tmp mais rename.",
  "mode": "single",
  "choices": [
    {
      "id": "a",
      "text": "Nenhum problema — o checkpoint.json só deve mesmo guardar o instantâneo mais recente, então sobrescrevê-lo no lugar é apenas trocar o conteúdo velho pelo novo, sem arquivo extra e sem passo extra",
      "correct": false,
      "feedback": "Não exatamente. Se o arquivo deve guardar apenas o instantâneo mais recente e como você faz o novo conteúdo chegar até ele são duas perguntas distintas. Um checkpoint de fato só precisa de uma cópia atual — mas a sobrescrita em si não é atômica. Uma queda pode interromper a gravação, e nesse instante o que está em disco não é uma versão antiga completa nem uma nova completa; é um arquivo parcialmente gravado."
    },
    {
      "id": "b",
      "text": "Há um problema: se o processo for morto no meio da gravação, o checkpoint.json pode ficar pela metade — conteúdo truncado que o JSON.parse não consegue ler — e ele é a única cópia da cena da tarefa, sem nenhum outro lugar de onde se recuperar",
      "correct": true,
      "feedback": "Correto. Gravar um arquivo não é um único passo atômico, o processo pode ser morto a qualquer momento, e uma gravação interrompida transforma a única cópia da cena em meio documento JSON. Grave primeiro o arquivo temporário e, só quando ele estiver completo, renomeie-o sobre o nome real — assim o checkpoint.json em disco é, a cada instante, ou a versão antiga completa ou a nova completa, nunca algo no meio do caminho."
    },
    {
      "id": "c",
      "text": "Há um problema, mas o problema é uso de disco: gravar por cima do mesmo arquivo repetidamente faz o checkpoint.json crescer a cada gravação, então uma tarefa longa acaba comendo muito mais espaço do que deveria",
      "correct": false,
      "feedback": "Não exatamente. Sobrescrever não faz o arquivo crescer — cada gravação substitui o conteúdo antigo, então o tamanho acompanha aproximadamente o quanto há no estado atual, não quantas vezes você salvou. O risco real não é espaço em disco; é que a própria gravação pode ser cortada no meio por uma queda, deixando um arquivo que não está nem completo nem analisável."
    }
  ]
}
```

## Referência de produto: como é um checkpoint no Claude Code

O protocolo que esta lição ensina é para tarefas longas sem supervisão, com granularidade de dois pontos de gravação por turno do loop. Para contraste, veja onde um produto real — o Claude Code — põe a palavra “checkpoint”: "checkpointing automatically captures the state of your code before each user prompt."[^S2] (o checkpointing captura automaticamente o estado do seu código antes de cada prompt do usuário.) "Every user prompt creates a new checkpoint"[^S2] (Todo prompt do usuário cria um novo checkpoint), e "Claude Code saves checkpoints with the conversation, so you can still run /rewind after you resume a session"[^S2] (o Claude Code salva checkpoints junto com a conversa, então você ainda pode rodar /rewind depois de retomar uma sessão).

O cenário que ele atende não é este. Os checkpoints do Claude Code são feitos para uma sessão com humano no loop — o usuário pode parar tudo a qualquer momento, testar uma abordagem, decidir voltar para antes de alguma mensagem e tentar de novo — então a unidade natural é “o usuário disse algo”. O que você está construindo aqui é para tarefas longas sem supervisão: ninguém está de plantão para pedir parada, a unidade é “o loop deu uma volta”, e dentro de um único turno ela se divide outra vez nos pontos de gravação A e B, porque uma queda pode cair entre “o modelo indicou uma ferramenta” e “o resultado foi registrado”. Os dois não estão resolvendo o mesmo problema. Pô-los lado a lado serve, sobretudo, para deixar uma coisa clara: quão fino cortar um checkpoint, e com que frequência gravá-lo, depende de a que o checkpoint serve. Não existe uma resposta única.

## Checkpoints não são de graça

Checkpoints custam alguma coisa. Sob o protocolo desta lição, um turno do loop grava em disco duas vezes. Para uma tarefa curta que termina em três ou cinco turnos, isso é puro custo adicional — o processo roda até o fim e esses arquivos de checkpoint nunca são lidos. Se vale a pena pôr esse maquinário no seu próprio harness é algo a medir contra a regra de que "you should consider adding complexity only when it demonstrably improves outcomes."[^S3] (você deveria considerar acrescentar complexidade apenas quando isso melhora comprovadamente os resultados.) Quanto mais longa a tarefa e mais alto o custo de uma queda, melhor fica essa troca; para algo que termina em poucos segundos, você provavelmente não vai precisar dela.

## 💻 Exercícios

<!-- exercises -->

### Nível 1: Complete um checkpoint incompleto

Alguém escreveu `saveCheckpoint` assim:

```javascript
function saveCheckpoint(state) {
  fs.writeFileSync("checkpoint.json", JSON.stringify({ messages: state.messages }));
}
```

Contra o protocolo que esta lição estabeleceu, quais campos ainda faltam neste checkpoint? Para cada campo faltante, diga especificamente: se você tentasse retomar a partir deste checkpoint incompleto, onde exatamente ele desmoronaria?

<!-- rubric -->
- Lista todos os cinco campos faltantes: `version`, `task`, `turns`, `tokensUsed`, `pendingToolUse`
- Sobre `version`: explica que o caminho de retomada não tem como julgar a versão de protocolo do arquivo, nem como decidir se deve se recusar a carregar quando o formato mudar
- Sobre `task`: explica que o harness não sabe a qual tarefa original esta cena pertence, e não consegue reportar ao usuário qual tarefa está sendo retomada
- Sobre `turns`: explica que a contagem de turnos recomeça do zero depois da retomada, deixando de corresponder aos turnos realmente rodados, o que pode fazer uma condição de parada por número máximo de turnos disparar cedo demais ou nunca disparar
- Sobre `tokensUsed`: explica que o limiar de compactação não tem um total acumulado exato com que trabalhar, então a retomada ou julga errado que ainda não bateu no limiar, ou tem que reestimar o uso (e reestimar em geral não alcança os números históricos de uso)
- Sobre `pendingToolUse`: explica que, se a queda caiu na janela em que o modelo tinha indicado uma ferramenta mas a execução não havia terminado, a retomada não faz ideia de que ficou uma chamada de ferramenta órfã, e não pode fazer a reconciliação que a Lição 3 cobre

<!-- answer -->
Este checkpoint guardou apenas `messages` e está sem os outros cinco campos:

1. **`version`**: sem ele, o caminho de retomada não pode confirmar se reconhece o formato do arquivo. Quando o protocolo mudar (um campo ganhando novo formato, digamos), o código de retomada não terá nada contra o que julgar “esta é uma versão de checkpoint com que eu consigo lidar?”. Só lhe resta cerrar os dentes e analisar, e quando isso falhar ele não consegue dizer o que não bateu.
2. **`task`**: sem ele, tudo o que o harness reiniciado lê é um monte de `messages`, sem meio de declarar para que essas mensagens foram encadeadas. Ele não consegue reportar progresso ao usuário na retomada e, numa montagem com várias tarefas, não consegue confirmar qual tarefa acabou de pegar.
3. **`turns`**: sem ele, a retomada só pode começar a contar do zero. Se você definiu uma condição de parada como “pare depois de N turnos”, a contagem pós-retomada deixa de corresponder aos turnos que de fato aconteceram, então a condição dispara cedo demais ou deixa de significar qualquer coisa.
4. **`tokensUsed`**: sem ele, o limiar de compactação não tem um total acumulado para consultar. A retomada ou finge que a contagem começa em zero — pondo toda a decisão de “este turno deve compactar?” fora de compasso — ou tenta reestimar o uso sobre as mensagens históricas em `messages`, e na maioria das montagens esses números históricos de `usage` não podem ser recuperados.
5. **`pendingToolUse`**: sem ele, se a última queda caiu na janela em que o modelo já tinha indicado uma ferramenta mas a execução não havia terminado ou o resultado não havia sido registrado, este checkpoint não guarda registro nenhum disso. A retomada não consegue dizer se uma chamada de ferramenta realmente ficou pendurada, e não pode fazer a reconciliação “esta chamada precisa ser reexecutada?” que a Lição 3 cobre. Só lhe resta agir como se nada tivesse acontecido.

<!-- hint -->
Volte à seção “o que salvar” e percorra um a um os seis campos do objeto de checkpoint, checando quais não aparecem nesta versão reduzida.

<!-- hint -->
Não pare em “falta X” — empurre um passo além: se o código do harness de fato reconstruísse `state` a partir deste arquivo e reentrasse no loop, com o que ele esbarraria primeiro?

<!-- rubric -->

### Nível 2: Duas falhas latentes, corrigidas

Um colega escreveu o `runAgent` abaixo para rodar uma tarefa que chama ferramentas duas vezes seguidas. Ele parece correto no dia a dia, mas no instante em que o processo é morto no meio da execução, a cena que você recupera ou não abre ou não bate. Encontre os dois pontos que cedem sob uma queda, diga a que cada um leva e corrija-os — o código corrigido tem que rodar de verdade.

```javascript
import fs from "node:fs";

function saveCheckpoint(state) {
  fs.writeFileSync("checkpoint.json", JSON.stringify(state, null, 2));
}

async function runAgent(task, tools, callModel, executeTool) {
  const state = {
    version: 1,
    task,
    turns: 0,
    tokensUsed: 0,
    messages: [{ role: "user", content: task }],
    pendingToolUse: null,
  };

  let response = await callModel({ tools, messages: state.messages });

  while (response.stop_reason === "tool_use") {
    state.messages.push({ role: "assistant", content: response.content });

    const block = response.content.find((b) => b.type === "tool_use");
    const result = await executeTool(block.name, block.input);

    state.messages.push({
      role: "user",
      content: [{ type: "tool_result", tool_use_id: block.id, content: result }],
    });
    state.turns += 1;

    saveCheckpoint(state);
    response = await callModel({ tools, messages: state.messages });
  }

  return state;
}
```

<!-- rubric -->
- Identifica a primeira falha: `saveCheckpoint` sobrescreve o mesmo arquivo com um `fs.writeFileSync` cru, então uma gravação interrompida deixa meio documento JSON que não pode ser analisado, sem versão mais antiga para a qual recuar
- Identifica a segunda falha: o loop inteiro grava só depois que o resultado da ferramenta é registrado (ponto B), sem nenhuma gravação entre o modelo indicar uma ferramenta e a ferramenta terminar (ponto A), então uma queda nessa janela deixa a chamada de ferramenta sem rastro em disco
- Correção um: reescrever `saveCheckpoint` para gravar primeiro um arquivo `.tmp` e depois movê-lo para o lugar atomicamente com `fs.renameSync`
- Correção dois: depois de extrair `block` e antes de chamar `executeTool`, acrescentar a atribuição de `pendingToolUse` mais um `saveCheckpoint` (ponto A), e devolver `pendingToolUse` a `null` no ponto B
- O código corrigido é estruturalmente completo e executável (ainda que apenas contra os `callModel` / `executeTool` falsos do exemplo)

<!-- answer -->
Duas falhas:

1. **Sobrescrever no lugar não é seguro.** O `saveCheckpoint` grava direto por cima do velho `checkpoint.json` com `fs.writeFileSync`. O processo pode ser morto a qualquer momento e, se a gravação for interrompida, o que fica em disco não é uma versão antiga completa nem uma nova completa — é conteúdo truncado que o `JSON.parse` não consegue ler. E esse arquivo é a única cópia da cena; não há outro lugar de onde se recuperar.
2. **Ele salva só em B, nunca em A.** O loop chama `saveCheckpoint` uma vez, depois que o resultado da ferramenta foi acrescentado a `messages`. Se a queda cai entre “o modelo indicou uma ferramenta” e “o resultado foi registrado” — enquanto a ferramenta roda, ou depois que ela terminou mas antes de o resultado chegar a `messages` — o último checkpoint em disco ainda é o estado velho do turno anterior, sem conhecimento nenhum desta chamada de ferramenta.

A correção — gravação atômica mais uma gravação em A:

```javascript
import fs from "node:fs";
import path from "node:path";

function saveCheckpoint(state, dir = "./checkpoints") {
  fs.mkdirSync(dir, { recursive: true });
  const finalPath = path.join(dir, "checkpoint.json");
  const tmpPath = `${finalPath}.tmp`;
  fs.writeFileSync(tmpPath, JSON.stringify(state, null, 2));
  fs.renameSync(tmpPath, finalPath); // em um mesmo sistema de arquivos, rename é uma substituição atômica
}

async function runAgent(task, tools, callModel, executeTool, dir) {
  const state = {
    version: 1,
    task,
    turns: 0,
    tokensUsed: 0,
    messages: [{ role: "user", content: task }],
    pendingToolUse: null,
  };

  let response = await callModel({ tools, messages: state.messages });

  while (response.stop_reason === "tool_use") {
    state.messages.push({ role: "assistant", content: response.content });

    const block = response.content.find((b) => b.type === "tool_use");

    // Ponto de gravação A: o modelo indicou uma ferramenta, ela ainda não rodou
    state.pendingToolUse = { id: block.id, name: block.name, input: block.input };
    saveCheckpoint(state, dir);

    const result = await executeTool(block.name, block.input);

    state.messages.push({
      role: "user",
      content: [{ type: "tool_result", tool_use_id: block.id, content: result }],
    });
    state.turns += 1;
    state.pendingToolUse = null;

    // Ponto de gravação B: o resultado da ferramenta deste turno está inteiramente registrado em messages
    saveCheckpoint(state, dir);

    response = await callModel({ tools, messages: state.messages });
  }

  return state;
}
```

Um par de dublês que nunca encosta em um modelo real basta para verificar: um `fakeCallModel` que pede uma chamada de ferramenta duas vezes seguidas e só retorna `end_turn` na terceira chamada, junto com um `fakeExecuteTool` que devolve uma string fixa. Rode e você verá o `checkpoint.json` em disco gravado 4 vezes (2 turnos × pontos de gravação A e B), terminando com `pendingToolUse` em `null` e `turns` em `2` — exatamente batendo com o estado final em memória.

<!-- hint -->
Comece só pelo `saveCheckpoint`. Compare-o com a versão da seção “como salvar” desta lição e veja qual passo está faltando.

<!-- hint -->
Depois conte quantas vezes `saveCheckpoint(state)` aparece no corpo do loop, e em quais linhas. Pergunte a si mesmo: entre o modelo indicar uma ferramenta (extrair `block`) e a ferramenta de fato terminar (o `await executeTool` retornar), alguma coisa é gravada em disco?

<!-- /exercises -->

## Recapitulação

- A cena de execução vive em memória por padrão e morre com o processo. O que os checkpoints fazem é poupar uma tarefa longa de reexecutar do zero depois de cada queda, para que ela possa continuar de onde quebrou[^S1]
- O checkpoint.json guarda seis campos: `version`, `task`, `turns`, `tokensUsed`, `messages`, `pendingToolUse`. `messages` é a maior peça, e sem ele o modelo não tem em que se apoiar sobre o que aconteceu antes; `pendingToolUse` é o marcador da chamada órfã contra o qual a Lição 3 reconcilia
- Um turno do loop tem dois pontos de gravação: A depois que o modelo indica uma ferramenta e antes de ela rodar, B depois que o resultado da ferramenta está inteiramente registrado em `messages`. Salvar só em B deixa um ponto cego ao longo da janela em que o modelo indicou uma ferramenta que ainda não terminou
- Sobrescrever o arquivo de checkpoint no lugar não é seguro. O processo pode ser morto a qualquer momento, e uma queda no meio da gravação transforma a única cópia da cena em meio documento JSON. Grave primeiro um arquivo `.tmp` e mova-o para o lugar com `fs.renameSync` — é isso que garante que o que está em disco a qualquer instante seja uma versão completa
- Os checkpoints do Claude Code funcionam em outra granularidade — capturados automaticamente antes de cada prompt do usuário[^S2], servindo a uma sessão com humano no loop. O que esta lição constrói é para tarefas longas sem supervisão. Os pontos de corte diferem, mas ambos respondem à mesma pergunta: quando algo dá errado, para onde você volta?
- Checkpoints não são de graça. Duas gravações em disco por turno são puro custo adicional em uma tarefa curta, e se vale a pena acrescentá-los se resume a se isso melhora comprovadamente o resultado, não a supor que mais é melhor[^S3]

[>> Lição 3: Retomando de um checkpoint: reiniciando o loop](./03-resume-from-checkpoint.md)
