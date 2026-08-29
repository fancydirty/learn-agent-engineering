# Lição 3: Condições de parada: quando um agente deve desistir

> Objetivos de aprendizado:
> - Explicar por que deixar o modelo devolver `end_turn` por conta própria não basta para encerrar um loop, e enunciar a tensão de forma clara: você tem que confiar no modelo, e ainda assim ele pode seguir por muitos turnos
> - Adicionar uma trava rígida de turno máximo a um loop esqueleto, e explicar por que o contador só funciona se viver fora do loop
> - Distinguir uma parada rígida (interrupção forçada no teto) de uma parada suave / suspensão (pausa para um humano, retomável), e listar as condições sob as quais um dado agente deve parar
>
> Pré-requisitos: Você leu a Lição 2, consegue escrever um loop `while` dirigido por `stop_reason`, e sabe que o loop termina por conta própria quando `end_turn` volta | Anterior: [Lição 2 <<](./02-the-core-loop.md) | Próxima: [Lição 4 >>](./04-loop-failure-modes.md)

## Não conte com o modelo para dar o basta

O loop esqueleto da Lição 2 para por exatamente um motivo: em alguma rodada o modelo deixa de pedir ferramentas, `stop_reason` vira de `tool_use` para `end_turn`, a condição do `while` fica falsa, e o loop termina por si.[^S2] Dito de outro jeito, a decisão sobre girar de novo foi entregue inteiramente ao modelo — o loop para quando o modelo diz que terminou de falar.

Na maior parte das vezes isso funciona, mas fique claro sobre quem toma a decisão. Um agente é, por definição, um sistema em que o modelo dirige dinamicamente seu próprio processo e seu próprio uso de ferramentas,[^S1] e decidir quando desistir faz parte disso. Autonomia é exatamente o que torna um agente útil, mas o outro lado da mesma moeda é que "The autonomous nature of agents means higher costs, and the potential for compounding errors."[^S1] (A natureza autônoma dos agentes significa custos maiores e o potencial de erros que se acumulam.) E a frase que mais importa aqui: "The LLM will potentially operate for many turns, and you must have some level of trust in its decision-making."[^S1] (O LLM vai potencialmente operar por muitos turnos, e você precisa ter algum nível de confiança na tomada de decisão dele.)

A palavra em que se demorar é *confiança*. Confiança não é o mesmo que deixar o modelo sem supervisão. Se o modelo empaca em algum passo, ou é puxado para fora do rumo por algo que uma ferramenta devolveu, e simplesmente nunca devolve `end_turn`, um loop que só vigia o `stop_reason` não vai se impacientar no seu lugar. Ele fará companhia ao modelo, rodada após rodada, girando — porque nada na condição do `while` que você escreveu diz "chega de voltas". Então a autoterminação pelo modelo não basta por si só. Você precisa de condições de parada que o host decide, que não esperam o humor do modelo.

## Primeiro, uma trava rígida no loop: turnos máximos

A condição de parada mais básica de todas é nomeada bem ali na orientação de engenharia da Anthropic: "it's also common to include stopping conditions (such as a maximum number of iterations) to maintain control."[^S1] (também é comum incluir condições de parada — como um número máximo de iterações — para manter o controle.) Traduzido em código, é um teto em quantas vezes o loop tem permissão para girar.

Sobre o esqueleto da Lição 2, a mudança é pequena:

```javascript
// tools é o manifesto de definição de ferramentas que você envia junto em cada rodada
const MAX_TURNS = 10;              // a trava rígida: deixe o loop girar 10 vezes no máximo
const messages = [{ role: "user", content: userInput }];
let turns = 0;                     // o contador vive fora do loop para poder acumular entre rodadas

let response = await callModel({ tools, messages });

while (response.stop_reason === "tool_use") {
  // cheque a trava antes desta rodada começar: no teto, pare de forma rígida e não envie mais requisição
  if (turns >= MAX_TURNS) {
    return { stopped: "max_turns", turns, last: response };
  }
  turns += 1;

  messages.push({ role: "assistant", content: response.content });

  const toolUseBlocks = response.content.filter((b) => b.type === "tool_use");
  const toolResults = await Promise.all(
    toolUseBlocks.map(async (block) => ({
      type: "tool_result",
      tool_use_id: block.id,
      content: await executeTool(block.name, block.input),
    }))
  );
  messages.push({ role: "user", content: toolResults });

  response = await callModel({ tools, messages });
}

// duas saídas do loop: o return antecipado acima, ou stop_reason deixar de ser tool_use
return { stopped: "end_turn", turns, last: response };
```

Duas coisas carregam o peso aqui. Primeiro, `let turns = 0` é declarado **fora** do loop. Ele tem que permanecer vivo entre rodadas e somar cada uma, ou a trava não faz ideia de quantas voltas já se passaram; mova-o para dentro do corpo do loop e você ganha exatamente a armadilha que o exercício de Nível 2 desmonta. Segundo, a trava não se importa **por que** o modelo ainda está pedindo ferramentas — empacado, girando em círculos, puxado para fora do rumo pela saída de uma ferramenta, ela nunca pergunta. Uma vez que a contagem de voltas bate no teto, o host para, não envia mais requisição, e retoma o controle para o seu próprio lado.

Isso é uma **parada rígida**: na fronteira ela interrompe incondicionalmente e o loop acabou. É coisa diferente da conclusão suave do `end_turn`, em que o modelo decide que terminou — uma é um teto que você define, a outra é o julgamento do próprio modelo. Note que não há resposta padrão para quão grande `MAX_TURNS` deveria ser; depende de aproximadamente quantas rodadas a tarefa deveria precisar. O 10 aqui é um valor de exemplo. O que importa é que a trava exista e consiga de fato parar um loop que desgovernou.

```agentmentor-check
{
  "id": "harness-zh-03-self-stop-insufficient",
  "label": "Julgar se a autoterminação do modelo sozinha basta, sem outra condição de parada",
  "prompt": "Você está projetando um agente de operações que chamará ferramentas rodada após rodada. Um colega argumenta: os modelos são espertos o bastante hoje para devolver end_turn por conta própria quando a tarefa termina, então o loop não precisa de nenhuma condição de parada externa — deixe a decisão de desistir com o modelo. Você deveria concordar com isso?",
  "whyHere": "Esta seção acabou de argumentar que end_turn sozinho não basta, e aparafusou uma trava rígida de turno máximo no loop. A checagem existe para barrar a crença de que um modelo é esperto o bastante para parar na hora certa por conta própria e portanto não precisa de condição de parada externa, porque essa crença é precisamente como a decisão de desistir é entregue por atacado ao modelo e o loop desgoverna.",
  "mode": "single",
  "choices": [
    {
      "id": "a",
      "text": "Sim. O modelo consegue julgar por si só se a tarefa terminou e devolverá end_turn quando terminar, então uma condição de parada extra é excesso de engenharia.",
      "correct": false,
      "feedback": "Não exatamente. Isso confunde confiança com rédea solta. O modelo de fato dirige seu próprio processo, mas ele também pode empacar em algum passo, ou ser puxado para fora do rumo pelo que uma ferramenta devolveu, e nunca voltar com end_turn — rodando por muitos turnos enquanto um loop que só vigia o stop_reason lhe faz companhia e gira. É exatamente por isso que adicionar uma condição de parada explícita (um número máximo de iterações, digamos) para manter o controle é uma prática comum, em vez de deixar a fronteira inteiramente para o modelo."
    },
    {
      "id": "b",
      "text": "Não. Além do próprio end_turn do modelo, você precisa de uma condição de parada explícita que o host decide — uma contagem máxima de turnos, por exemplo.",
      "correct": true,
      "feedback": "Correto. end_turn é o julgamento do próprio modelo, e a autonomia em si traz custos maiores e erros que se acumulam. Você de fato tem que depositar algum nível de confiança na tomada de decisão dele para deixá-lo rodar, mas confiança não é a ausência de uma fronteira; uma trava rígida de turno máximo retoma o controle do modelo para o host quando o modelo não desiste por conta própria."
    }
  ]
}
```

## Além da parada rígida, outro tipo: parar para esperar um humano

Travas como turnos máximos compartilham uma propriedade: bater em uma é o fim da linha — o loop acabou e não vai continuar por conta própria. Mas esse não é o único tipo de condição de parada. O mesmo artigo nomeia outro: "Agents can then pause for human feedback at checkpoints or when encountering blockers."[^S1] (Agentes podem então pausar para feedback humano em checkpoints ou ao encontrar bloqueios.) É um bicho diferente de uma parada rígida, e vale desmontar:

- **Parada rígida**: no teto ela interrompe, o loop terminou de vez, nada continua automaticamente. Turnos máximos e orçamento esgotado pertencem aqui. É um **estado terminal**.
- **Parada suave / suspensão**: o loop deliberadamente interrompe em um ponto de verificação, entrega o controle a uma pessoa, e consegue retomar daquele exato ponto uma vez que ela tenha respondido. Não é um fim; é uma **pausa retomável**.

No código a diferença cai sobre o que você retorna. Uma parada rígida retorna um resultado final — foi aqui que terminou. Uma parada suave tem que preservar estado: ela retorna um instantâneo da cena a partir do qual dá para retomar, entregando o `messages` atual junto com a ação pendente em que empacou, de modo que, uma vez que um humano tenha lidado com ela, aquele instantâneo baste para prosseguir:

```javascript
while (response.stop_reason === "tool_use") {
  if (turns >= MAX_TURNS) {
    return { stopped: "max_turns", turns, last: response };   // parada rígida: terminal
  }

  const block = response.content.find((b) => b.type === "tool_use");
  if (needsHumanApproval(block)) {
    // parada suave / suspensão: não é um fim, uma pausa. Entregue a cena inteira para poder retomar aqui
    return { paused: "awaiting_human", pending: block, messages, turns };
  }

  // ...caso contrário, rode a ferramenta, anexe ao histórico e envie a próxima requisição como de costume
}
```

O caso clássico de parada suave é o próximo passo do modelo ser algo irreversível — apagar um banco de dados, disparar um e-mail, submeter um pedido — e você querer que uma pessoa olhe antes de ir adiante; ou o modelo reportar por conta própria que empacou e precisa de mais informação. Traçar a linha parada rígida / parada suave já basta por ora. Como o `needsHumanApproval` de fato decide, e como o loop retoma daquele instantâneo uma vez que uma pessoa responde, é o assunto principal da Lição 5, sobre manter um humano no loop.

## Um framework: comece perguntando "sob que condições isto deve parar?"

Com paradas rígidas e paradas suaves em mãos, projetar um agente ganha uma jogada de abertura conveniente. Antes de escrever qualquer loop, tenha uma pergunta respondida: **sob que condições esta coisa deve parar?** Liste as respostas e elas normalmente se resumem a estas quatro:

1. **A tarefa terminou** — o modelo devolve `end_turn`. Esta é a mais suave das quatro, julgada pelo modelo, e você ainda tem que confirmar que ela de fato terminou em vez de ter desistido pelo caminho.
2. **O teto de turnos** — uma parada rígida. É a trava `MAX_TURNS` acima, pegando o pior caso em que o loop deslancha e não consegue se conter.
3. **Um bloqueio que precisa de decisão humana** — uma parada suave / suspensão, pausando para feedback humano.[^S1] Disparada por operações irreversíveis, ou pelo modelo reportando explicitamente que está bloqueado.
4. **Orçamento esgotado** — uma parada rígida. Tokens, gasto ou tempo decorrido: o que bater no seu teto primeiro para o loop. Os detalhes (como contar, onde instrumentar) esperam a Lição 4.

Enfileire essas quatro e algo fica visível: a decisão de parar não fica toda com o modelo. A número 1 pertence ao modelo, as números 2 e 4 pertencem ao host (elas param na marca independentemente do que o modelo pensa), e a número 3 é compartilhada. Aquele loop esqueleto da Lição 2 implementou só a número 1 e deixou de fora as outras três — esta lição adiciona a número 2, a trava rígida mais básica, enquanto as números 3 e 4 chegam na Lição 5 e na Lição 4, respectivamente.

O valor do framework não é memorizar quatro itens. É construir um hábito: antes de você escrever o loop, conte as condições de "deve parar" explicitamente, em vez de deixá-las enterradas sob a suposição-padrão de que o modelo vai parar de qualquer forma.

## Condições de parada são seguro barato, não excesso de engenharia

Alguém pode resmungar que essas travas transformam um loop simples em um complicado. O que traz à tona um princípio ao qual a Anthropic sempre volta: "you should consider adding complexity only when it demonstrably improves outcomes."[^S1] (você deveria considerar adicionar complexidade só quando ela comprovadamente melhora os resultados.) Essa linha costuma ser citada para dissuadir as pessoas de empilhar maquinaria elaborada, mas para condições de parada ela aponta para o outro lado — ela as deixa passar.

Faça a conta e fica óbvio. Um contador de turno máximo é uma declaração fora do loop e uma comparação dentro dele, algumas linhas de código. O que ele barra — um loop que não para de girar, custos escalando fora de controle, uma ação irreversível tomada sobre uma saída manipulada ou malformada — custa muito mais. A autonomia de agentes já carrega custos maiores e o potencial de erros que se acumulam,[^S1] e uma condição de parada é o freio mais barato mirado exatamente nesse risco.

Então uma condição de parada não é o tipo de complexidade que você deveria adicionar só quando ela comprovadamente melhora os resultados[^S1] — ela ultrapassa essa barra de saída. Ela comprime a fronteira do pior caso de "ilimitado" para "limitado", o que em si é uma melhora verificável nos resultados. É o controle mais básico que faz de um loop autônomo algo que você se atreve a deixar rodar, não um extra decorativo.

<!-- exercises -->
## 💻 Exercícios

### Nível 1: Enumere as condições de parada de um agente

Você está projetando um agente de "corrigir CI automaticamente". Ele pega um pipeline que falhou e tem estas ferramentas: `read_logs` (ler os logs), `edit_file` (mudar código), `run_tests` (rodar os testes) e `push` (enviar para o remoto, disparando uma nova execução de CI). O objetivo é deixar os testes verdes. Responda para ele:

1. Liste ao menos quatro condições sob as quais este agente deve parar.
2. Para cada uma, marque-a como uma **parada rígida** ou uma **parada suave / suspensão**, e diga se a decisão de parar pertence ao modelo, ao host, ou aos dois.
3. Você projetaria o `push` (que envia para o remoto e dispara uma execução de CI que outras pessoas veem) como uma parada suave esperando um humano aprovar? Dê uma linha de raciocínio.

<!-- rubric -->
- Ao menos quatro condições de parada dadas, cobrindo a maior parte das quatro categorias: tarefa terminada / teto de turnos / bloqueio precisando de decisão humana / orçamento esgotado
- Cada condição classificada corretamente como rígida ou suave, com um julgamento razoável sobre quem decide (tarefa terminada → o modelo, turnos e orçamento → o host, tipo bloqueio → compartilhada)
- Uma posição clara sobre o `push` com uma razão: reconhece-o como uma ação externamente visível e relativamente cara, bem adequada a uma parada suave aguardando aprovação

<!-- answer -->
1. Quatro (ou mais) condições de parada:
   - **Testes verdes / a tarefa terminou** — o modelo julga que corrigiu e devolve `end_turn`.
   - **O teto de turnos** — por exemplo, várias rodadas de "editar código → rodar testes" sem ficar verde, batendo em `MAX_TURNS` e sendo forçado a parar.
   - **Logo antes de enviar para o remoto (`push`)** — interrompa e espere aprovação, porque este passo é externamente visível e dispara uma execução de CI que outras pessoas veem.
   - **Orçamento esgotado** — tokens / gasto / tempo decorrido acumulados batem num teto e ele para (detalhes na Lição 4).
   - (Opcional) **O modelo reporta um bloqueio** — por exemplo, ele decide que precisa de uma permissão ou credencial que não consegue obter, e suspende para um humano.
2. Classificação e quem decide:
   - Tarefa terminada: **conclusão suave**, decidida pelo **modelo** (ele devolve `end_turn`).
   - Teto de turnos: **parada rígida**, decidida pelo **host** (para na marca, independentemente do que o modelo quer).
   - Orçamento esgotado: **parada rígida**, decidida pelo **host**.
   - Aprovação antes do `push`, e o modelo reportando um bloqueio: **parada suave / suspensão**, **compartilhada** (o host define o ponto de verificação, uma pessoa decide se continua).
3. Sim. O `push` envia mudanças para o remoto e dispara uma execução de CI que outras pessoas veem — uma ação externamente visível que custa algo para reverter, o que combina com uma parada suave: o loop interrompe antes do push, uma pessoa olha as mudanças e decide se as deixa passar, em vez de deixar o modelo empurrar tudo até o fim por conta própria.

<!-- hint -->
Volte às quatro do texto principal: tarefa terminada, teto de turnos, bloqueio precisando de decisão humana, orçamento esgotado. Aplique cada uma a este cenário de correção de CI e veja a que passo concreto ela mapeia.

<!-- hint -->
Para distinguir uma parada rígida de uma suave, faça uma única pergunta: depois que ela para, dá para retomar de onde parou? Se não dá e aquilo é o fim, é uma parada rígida. Se dá para retomar uma vez que uma pessoa responde, é uma parada suave.

### Nível 2: Por que esta trava de turnos máximos não pegou nada

Um colega quis uma salvaguarda de turno máximo no loop e escreveu a versão abaixo. Ele a testou em tarefas que precisavam de uma ou duas chamadas de ferramenta e ela "pareceu bem". Mas quando o modelo caiu em chamar a mesma ferramenta repetidamente sem devolver `end_turn`, esta trava não pegou nada e o loop seguiu desgovernado. Encontre a causa raiz e corrija.

```javascript
async function runAgent(userInput, tools) {
  const MAX_TURNS = 10;
  const messages = [{ role: "user", content: userInput }];
  let response = await callModel({ tools, messages });

  while (response.stop_reason === "tool_use") {
    let turns = 0;                       // deveria pegar um loop desgovernado
    if (turns >= MAX_TURNS) {
      return { stopped: "max_turns", response };
    }
    turns += 1;

    const block = response.content.find((b) => b.type === "tool_use");
    const result = await executeTool(block.name, block.input);
    messages.push({ role: "assistant", content: response.content });
    messages.push({
      role: "user",
      content: [{ type: "tool_result", tool_use_id: block.id, content: result }],
    });

    response = await callModel({ tools, messages });
  }
  return response;
}
```

<!-- rubric -->
- Nomeia a causa raiz exatamente: `let turns = 0` é declarado dentro do corpo do loop, é resetado para 0 a cada rodada, `turns >= MAX_TURNS` nunca é verdadeiro, e a trava é código morto
- Explica como isso difere do loop infinito da Lição 2: aqui `response` de fato é reatribuído e o loop ainda pode parar no próprio `end_turn` do modelo, e é por isso que "tarefas curtas parecem bem"; mas o freio de turno máximo que deveria ter pegado o desgoverno nunca engatou
- Dá a correção: mova `let turns = 0;` para cima do `while` (o estado do contador tem que acumular entre rodadas), mantendo `turns += 1` dentro do corpo do loop

<!-- answer -->
Causa raiz: **o contador `turns` é declarado dentro do corpo do loop.** `let turns = 0` roda de novo no topo de cada rodada, então `turns` é resetado para 0 a cada volta; `turns += 1` o sobe para 1, a próxima rodada o derruba de volta para 0, e o teste `turns >= MAX_TURNS` (10) nunca consegue dar verdadeiro. A trava é código morto do início ao fim — uma condição de parada funciona porque seu estado acumula entre rodadas, e o escopo de uma declaração `let` termina naquele par de chaves, então ela não consegue transportar nada adiante.

Por que "tarefas curtas parecem bem": este código não é o mesmo que o loop infinito da Lição 2. O bug lá era esquecer de reatribuir `response`, então o loop nunca conseguia sair. Aqui `response` de fato é reatribuído, e o loop consegue parar normalmente sempre que o modelo devolve `end_turn` em alguma rodada. Então, enquanto o modelo se comporta e desiste dentro de uma rodada ou duas, você nunca percebe que a trava está inerte — ela simplesmente nunca foi acionada. Mas no momento em que o modelo se recusa a devolver `end_turn` e começa a girar, a salvaguarda que você achava que tinha revela-se nunca ter sido ligada, e o loop desgoverna do mesmo jeito.

A correção — mova o contador para fora do loop para ele acumular entre rodadas:

```javascript
async function runAgent(userInput, tools) {
  const MAX_TURNS = 10;
  const messages = [{ role: "user", content: userInput }];
  let turns = 0;                         // movido para fora: o estado tem que viver entre rodadas para parar qualquer coisa
  let response = await callModel({ tools, messages });

  while (response.stop_reason === "tool_use") {
    if (turns >= MAX_TURNS) {
      return { stopped: "max_turns", response };
    }
    turns += 1;

    const block = response.content.find((b) => b.type === "tool_use");
    const result = await executeTool(block.name, block.input);
    messages.push({ role: "assistant", content: response.content });
    messages.push({
      role: "user",
      content: [{ type: "tool_result", tool_use_id: block.id, content: result }],
    });

    response = await callModel({ tools, messages });
  }
  return response;
}
```

<!-- hint -->
Uma condição de parada só consegue conter um loop se o seu estado acumula entre rodadas. Olhe qual linha declara `turns`: no topo da segunda rodada, ela ainda lembra o que a primeira rodada somou?

<!-- hint -->
Uma variável declarada com `let` tem escopo do par de chaves em que ela fica. Agora mesmo `turns` vive dentro do corpo do `while`, então cada rodada executa um `let turns = 0` novinho.

<!-- /exercises -->

## Recapitulação

- O loop termina naturalmente no `end_turn`, mas esse é o julgamento do próprio modelo; você só consegue depositar algum nível de confiança na tomada de decisão dele, e ele pode operar por muitos turnos, então confiar só na autoterminação do modelo não basta[^S1]
- A trava rígida mais básica é uma contagem máxima de turnos: incluir uma condição de parada explícita, como um número máximo de iterações, para manter o controle é uma prática comum[^S1]; o contador tem que ficar **fora** do loop para acumular entre rodadas, e movê-lo para o corpo o transforma em código morto que não para nada
- Além das paradas rígidas há as paradas suaves / suspensões: pausar para feedback humano em checkpoints ou ao encontrar bloqueios[^S1] — não um estado terminal, mas uma pausa retomável que prossegue a partir de um instantâneo da cena
- Ao projetar um agente, pergunte primeiro sob que condições ele deve parar: tarefa terminada (`end_turn`, a decisão do modelo), teto de turnos (parada rígida, a decisão do host), um bloqueio precisando de decisão humana (parada suave, compartilhada), orçamento esgotado (parada rígida, coberta na Lição 4)
- Condições de parada são controle barato com grande retorno: a autonomia já traz custos maiores e erros que se acumulam,[^S1] e uma trava de turnos máximos pega exatamente o pior caso; contra o princípio de adicionar complexidade só quando ela comprovadamente melhora os resultados,[^S1] ela ultrapassa a barra de saída — comprimir o ilimitado em limitado é uma melhora verificável

[>> Lição 4: Descontrole e fallback: loops mortos, giro em falso, esgotamento de orçamento](./04-loop-failure-modes.md)
