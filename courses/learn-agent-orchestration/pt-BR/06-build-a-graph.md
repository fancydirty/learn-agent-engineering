# Lição 6: Mão na massa: elevando seu harness a um pequeno grafo

> Objetivos de aprendizado:
> - Soldar roteamento, fan-out, fusão, loop de revisão e relatório das cinco primeiras lições em um único `orchestrate.mjs`: o plano vive no código, cada nó ainda roda o loop de `stop_reason` do Curso 7 (Fundamentos do Harness de Agente: Laços e Controle), e os resultados intermediários permanecem em variáveis do script
> - Colocar o loop de revisão realmente para girar, e observar as duas maneiras pelas quais ele pode parar — um chamado corrigido conforme o relatório do gate e pronto, outro devolvendo relatórios idênticos duas rodadas seguidas, julgado sem progresso adicional e marcado needs_human
> - Persistir o rastro de execução do grafo inteiro em `run-state.json` e `run.jsonl`, e depois conciliá-lo com a tabela-resumo da execução real: qual nó gastou quanto tempo, quantas chamadas de modelo, quantos tokens, quantas rodadas de gate
>
> Pré-requisitos: Lições 1–5 concluídas, capaz de rodar o loop de harness do Curso 7 (Fundamentos do Harness de Agente: Laços e Controle) | Anterior: [<< Lição 5](./05-evaluator-and-graphs.md)

## Primeiro, veja rodando

As cinco primeiras lições separaram as peças: quem guarda o plano (Lição 1), encadeamento e roteamento (Lição 2), seccionamento e votação mais um pool de concorrência limitado (Lição 3), orquestrador-workers e os quatro elementos dos prompts de delegação (Lição 4), o loop de revisão e como compor esses padrões no que a Lição 5 chama de “grafo” (Lição 5). Esta lição solda tudo em um arquivo.

A tarefa é deliberadamente banal: `inbox/` contém seis chamados de suporte a clientes, e o trabalho é escrever para cada um uma resposta que possa ser enviada como está. Primeiro, como fica quando termina:

```text
\$ node orchestrate.mjs
inbox/ recebeu 6 chamados: T-1001, T-1002, T-1003, T-1004, T-1005, T-1006
[route] T-1001=billing  T-1002=bug  T-1003=other  T-1004=billing  T-1005=bug  T-1006=other
[fanout] teto de concorrência 2, 6 rascunhos produzidos
[merge] gravou 6 arquivos em out/, repassando adiante só referências e resumos de uma linha
[review] reescritas do gate: 2 rodadas no total

=== Resumo da execução do grafo ===
Nó       Tempo   Chamadas    Tokens   Rodadas     Status
route     62ms    1           720      -           ok
fanout    244ms   8           8903     -           ok
merge     2ms     0           0        -           ok
review    129ms   2           3033     2           ok

=== Detalhamento por chamado ===
Chamado  Categoria Tratador          Rodadas     Motivo parada   Status
T-1001   billing   worker:billing    0           gate_pass       pass
T-1002   bug       worker:bug        0           gate_pass       pass
T-1003   other     template          0           gate_pass       pass
T-1004   billing   worker:billing    1           no_progress     needs_human
T-1005   bug       worker:bug        1           gate_pass       pass
T-1006   other     template          0           gate_pass       pass

Diretório de saída out/: 6 respostas; precisam de repasse humano: 1 chamado
  - T-1004 (no_progress): Chamado T-1004: altera…
Rastro: run-state.json / run.jsonl (run_id=run-mtem9rmb)
\$ echo \$?
1
```

Toda saída de terminal desta lição vem de execuções reais deste script, copiadas linha a linha — nenhuma linha é um exemplo digitado à mão. Duas coisas mudam a cada execução: os tempos em milissegundos e o `run_id` (é um timestamp em base 36). Todo o resto — resultados de classificação, contagens de chamadas, números de tokens, contagens de rodadas de gate, qual chamado é `needs_human` — é constante fixada. O motivo é explicado adiante, na seção “Montagem da verificação”.

Vale encarar primeiro aquele `1` final. Isso não é um erro — é um veredito: seis chamados, um não conseguiu terminar automaticamente, então o código de saída não é 0. Cada execução deste grafo produz uma conclusão que a CI ou um cron job consegue parsear, não apenas uma pilha de logs.

## Como é o grafo: o plano é aquela dúzia de linhas em `main()`

Comece pelo esqueleto do script. Usar “grafo” e “nó” é o vocabulário que a Lição 5 introduziu — este é o nosso próprio sistema visual, não um conceito oficial, e ele se apoia em exatamente uma âncora primária: o próprio script do fluxo de trabalho guarda o loop, as ramificações e os resultados intermediários[^S5]. O trecho abaixo é a implementação literal dessa afirmação:

A Lição 5 desenhou um grafo composto primeiro; este grafo é uma **variante** dele, com três diferenças: a Lição 5 dividia por dificuldade em “simples / complexo”, aqui dividimos por assunto em `billing` / `bug` / `other`; o fan-out da Lição 5 era “um chamado complexo despachado a três workers e depois fundido”, aqui é seccionamento — “seis chamados, cada um atribuído a um tratador”; a aresta de retorno da Lição 5 voltava a um nó `[rascunho]` separado, aqui ela volta ao worker original. Por que essas mudanças, está tudo reunido na seção “Tabela de conciliação” no fim.

```javascript
async function main() {
  seedWorkspace();
  initLog();
  saveState();

  const tickets = loadInbox();
  console.log(`inbox/ recebeu ${tickets.length} chamados: ${tickets.map((t) => t.id).join(", ")}`);

  const { routed } = await node("route", () => routeNode(tickets));
  console.log(`[route] ${routed.map((t) => `${t.id}=${t.category}`).join("  ")}`);

  const { drafts } = await node("fanout", () => fanoutNode(routed));
  console.log(`[fanout] teto de concorrência ${POOL_SIZE}, ${drafts.length} rascunhos produzidos`);

  const { items } = await node("merge", async () => mergeNode(drafts));
  console.log(`[merge] gravou ${items.length} arquivos em out/, repassando adiante só referências e resumos de uma linha`);

  if (process.env.STOP_AFTER === "merge") {
    console.log("[stop] STOP_AFTER=merge: parando antes da revisão, sem veredito nesta execução");
    process.exit(2);
  }

  const byId = new Map(routed.map((t) => [t.id, t]));
  const reviewed = await node("review", () => reviewNode(items, byId));
  console.log(`[review] reescritas do gate: ${reviewed.totalRounds} rodadas no total`);

  const { needsHuman } = await node("report", async () => reportNode(items, reviewed.totalRounds));

  process.exit(needsHuman > 0 ? 1 : 0);
}
```

`routed`, `drafts`, `items` — essas três declarações `const` são todo o estado do grafo. São variáveis JavaScript comuns, não objetos de estado tipados, e não há estratégia de fusão — os resultados intermediários permanecem em variáveis do script[^S5], e os nós passam dados por valores de retorno de função. Nenhum modelo vê o quadro completo: o modelo de roteamento vê apenas os textos dos seis chamados, o worker de billing vê apenas o chamado que lhe foi atribuído, o gate de revisão vê apenas um arquivo de resposta.

É assim que a distinção arquitetural entre fluxo de trabalho e agente se parece no código: LLMs e ferramentas são orquestrados através de caminhos de código predefinidos[^S1], não o modelo dirigindo autonomamente os próprios processos[^S1].

Cinco nós, cada um cuidando de um trecho:

| Nó | O que faz | Quem faz |
| --- | --- | --- |
| `route` | Uma chamada barata divide seis chamados em três categorias | Um loop de modelo |
| `fanout` | Despacha por categoria a workers especializados, com concorrência limitada | Dois tipos de loop de modelo + um template de código puro |
| `merge` | A saída vai para o disco, adiante só referências e resumos de uma linha | Código puro |
| `review` | O gate determinístico filtra primeiro, e as falhas entram em verificar-corrigir-reverificar | Código puro + loops de modelo sob demanda |
| `report` | Imprime as tabelas-resumo, determina o código de saída | Código puro |

Apenas dois dos cinco nós de fato chamam modelos. **Nem todo nó precisa ser um modelo** — esta é a regra mais barata e mais facilmente ignorada da lição: `merge` e `report` são funções puras, a categoria `other` em `fanout` usa um template de string, e o primeiro filtro de `review` são algumas linhas de `includes`. Onde código determinístico consegue dar a mesma resposta, não há motivo para pagar o custo e a latência de uma chamada de modelo.

## Dentro dos nós: ainda o loop do Curso 7

Fixe primeiro a camada mais interna e o grafo passa a fazer sentido. Cada nó de modelo roda internamente o loop de `stop_reason` do Curso 7 (Fundamentos do Harness de Agente: Laços e Controle), sem alteração:

```javascript
async function runAgent(client, system, userInput, tools, toolImpls) {
  const messages = [{ role: "user", content: userInput }];
  let turns = 0;

  let response = await client.messages.create({
    model: MODEL,
    max_tokens: 1024,
    system,
    tools,
    messages,
  });

  while (response.stop_reason === "tool_use") {
    // —— Válvula 1: máximo de turnos. No início do corpo do loop, antes de turns++ ——
    if (turns >= MAX_TURNS) {
      return `Atingiu o máximo de turnos ${MAX_TURNS}, parando (a tarefa pode ser difícil demais ou o modelo travou)`;
    }
    turns++;

    // Anexa a resposta completa deste turno (papel assistant) ao histórico
    messages.push({ role: "assistant", content: response.content });

    // Executa todos os blocos tool_use deste turno, embrulhando cada um como tool_result
    const toolResults = await runToolUses(response.content, toolImpls);

    // Todos os blocos tool_result de um turno vão na mensagem user imediatamente seguinte
    messages.push({ role: "user", content: toolResults });

    // Envia de novo com o histórico alongado, e volta à condição do while
    response = await client.messages.create({
      model: MODEL,
      max_tokens: 1024,
      system,
      tools,
      messages,
    });
  }

  // stop_reason não é mais tool_use: extrai o texto final e retorna
  return response.content.find((b) => b.type === "text")?.text ?? "";
}
```

As quatro etapas no corpo do loop — empilhar assistant, executar ferramentas, empilhar tool_result, reatribuir `response` — são palavra por palavra idênticos aos da Lição 6 do Curso 7, até os comentários foram copiados. A Válvula 1 (máximo de turnos) está na posição original: no início do corpo do loop, antes do `turns++`. Deixar uma contagem máxima de iterações como condição de parada de loops é prática padrão para manter o controle[^S1].

Comparado ao Curso 7, duas mudanças, ambas fora do corpo do loop: `client` e `system` deixaram de ser constantes de módulo e viraram parâmetros (três papéis precisam de stubs diferentes e prompts de sistema diferentes, então precisam ser passados); a contagem de tokens e chamadas saiu de dentro do corpo do loop para uma camada envolvente fora do cliente, e o interior do loop não mudou:

```javascript
function metered(client) {
  const meter = { calls: 0, tokens: 0 };
  const wrapped = {
    messages: {
      async create(req) {
        const res = await client.messages.create(req);
        meter.calls += 1;
        meter.tokens += res.usage.input_tokens + res.usage.output_tokens;
        return res;
      },
    },
  };
  return { client: wrapped, meter };
}
```

Essa mudança tem um custo e ele precisa ser declarado: a Válvula 2 do Curso 7 (orçamento de tokens) originalmente dependia do valor acumulado dentro do corpo do loop; esse acumulador não está mais no loop, então a Válvula 2 também não fez a mudança. Neste grafo, a fila de respostas do stub de cada nó tem comprimento fixo, e esgotar a fila lança erro diretamente, sem possibilidade de descontrole; mas, quando você trocar os stubs por um cliente real, recoloque a Válvula 2 — ou faça `metered` lançar quando estourar o orçamento, ou mova a contagem de volta para o corpo do loop e restaure a forma original do Curso 7. A Válvula 3 (detecção de giro em falso) e a Válvula 4 (aprovação humana) igualmente não se mudaram; o motivo está listado adiante, na seção “Tabela de conciliação”.

A metade das ferramentas também é cópia: a resposta de um turno contém múltiplos blocos `tool_use`, devolvem-se outros tantos blocos `tool_result`, uma ferramenta lança e isso é embrulhado em `is_error: true` e devolvido ao modelo, em vez de derrubar o processo inteiro.

## Nó um: Roteamento — uma chamada barata e depois apertar a saída

O roteamento classifica uma entrada e a direciona para tarefas de acompanhamento especializadas[^S1]. É a chamada de modelo mais barata do grafo: uma requisição classifica os seis, sem ferramentas, sem escrever resposta.

```javascript
async function routeNode(tickets) {
  const { client, meter } = metered(makeStubClient(SCRIPTS.router));
  const input = tickets.map((t) => `${t.id}: ${t.text}`).join("\n");
  const text = await runAgent(client, ROUTER_PROMPT, input, [], {});

  // Aperto da saída: só reconhece linhas “id_do_chamado: categoria”, categoria fora da lista branca cai para other
  const parsed = new Map();
  for (const line of text.split("\n")) {
    const m = line.match(/^\s*(T-\d+)\s*:\s*(\S+)\s*$/);
    if (!m) continue;
    const [, id, raw] = m;
    const category = CATEGORIES.includes(raw) ? raw : "other";
    if (category !== raw) log({ node: "route", event: "clamped", ticket: id, raw, category });
    parsed.set(id, category);
  }

  const routed = tickets.map((t) => ({ ...t, category: parsed.get(t.id) ?? "other" }));
  for (const t of routed) log({ node: "route", event: "routed", ticket: t.id, category: t.category });
  return { routed, calls: meter.calls, tokens: meter.tokens };
}
```

A chave são as dez linhas do meio, não a chamada de modelo. O modelo devolve texto livre, cada ramo a jusante depende desse valor, então ele precisa ser apertado em um de três rótulos legais antes de entrar a jusante: linhas que não batem com o formato são descartadas; categorias fora da lista branca caem para `other`; chamados sem nem uma linha correspondente são capturados por `parsed.get(t.id) ?? "other"`.

Fiz o stub devolver deliberadamente “reclamação” para o último chamado — que não está na lista branca. O log da execução real mostra esse aperto:

```text
{"ts":"2026-08-29T16:48:31.297Z","run_id":"run-mtem76rl","node":"route","event":"clamped","ticket":"T-1006","raw":"reclamação","category":"other"}
```

O modelo deu um rótulo que ele mesmo inventou, o código o grampeou de volta para `other` e deixou registro dizendo o que foi grampeado. **Ramos a jusante só reconhecem valores que o código examinou** — esta é a diferença prática entre um nó de roteamento e “deixar o modelo decidir diretamente para onde saltar em seguida”, e é por isso que roteamento pode ser testado por unidade.

## Nó dois: Fan-out — três workers e um pool de concorrência limitado

O fan-out segue o seccionamento: quebrar a tarefa em subtarefas mutuamente independentes e rodá-las em paralelo[^S1]. Aqui “independentes” é natural — os seis chamados têm zero dependências entre si, e a ordem não importa.

Três categorias, três tratadores, apenas dois são modelos:

```javascript
const drafts = await runPool(routed, POOL_SIZE, async (ticket) => {
  if (ticket.category === "other") {
    const text = otherTemplate(ticket.id);
    log({ node: "fanout", event: "template_done", ticket: ticket.id });
    return { ticket, handler: "template", text };
  }
  const r = await callWorker(ticket, 1);
  calls += r.calls;
  tokens += r.tokens;
  return { ticket, handler: `worker:${ticket.category}`, text: r.text };
});
```

O pool de concorrência é o pool da Lição 3 (chamado `pool` lá, `runPool` aqui): as tarefas ficam atrás de um cursor, criam-se `limit` consumidores para pegá-las, e termina quando se esgotam. O teto funciona de verdade, não é decorativo. Ajuste-o para 1 e rode de novo: o tempo da linha `fanout` se alonga perceptivelmente (contagem de chamadas e tokens idênticos, milissegundos oscilam como sempre):

```text
\$ POOL_SIZE=1 node orchestrate.mjs
...
=== Resumo da execução do grafo ===
Nó       Tempo   Chamadas    Tokens   Rodadas     Status
route     61ms    1           720      -           ok
fanout    490ms   8           8903     -           ok
merge     3ms     0           0        -           ok
review    128ms   2           3033     2           ok
```

490ms contra 244ms, contagem de chamadas e tokens idênticos. Concorrência compra tempo de relógio, não menos trabalho — isso continua verdadeiro depois de trocar por uma API real, exceto que aí você também precisa considerar os limites de taxa do provedor, o que torna o teto ainda mais essencial.

### Prompts de delegação: os quatro elementos presentes

Os prompts dos três papéis de modelo seguem os quatro elementos da Lição 4: objetivo, formato de saída, orientação de ferramentas, limites da tarefa. Subagentes precisam de um objetivo, um formato de saída, orientação sobre ferramentas e fontes e limites claros da tarefa; sem descrição adequada, os workers duplicam trabalho, deixam lacunas ou não encontram o que deveriam[^S2]. O worker de billing:

```javascript
billing: [
  "Você é especialista em chamados de cobrança, tratando um chamado por vez.",
  "Objetivo: Investigar os fatos de cobrança deste chamado e produzir uma resposta completa em português.",
  "Formato de saída: Parágrafo em texto puro, começando com “Chamado <id_do_chamado>:”, informando os fatos encontrados, as ações já tomadas e o que o usuário pode esperar em seguida; sem listas com marcadores, sem amenidades.",
  "Orientação de ferramentas: Fatos de cobrança precisam usar lookup_order, passando o id do pedido do chamado literalmente; se não encontrar, diga isso, não infira valores ou número de cobranças a partir da descrição do chamado.",
  "Limites da tarefa: Trate apenas a parte de cobrança deste chamado, não modifique pedidos, não prometa compensações extras, não responda perguntas fora de cobrança; não escreva enrolação como “aguarde um momento”, “agradecemos a paciência” ou “resolveremos em breve”.",
].join("\n"),
```

Quatro linhas, cada uma fazendo seu serviço: o objetivo determina o que ele escreve; o formato de saída dá ao gate a jusante algo para verificar (a exigência de “começar com o id do chamado” mapeia diretamente para a primeira regra do gate); a orientação de ferramentas prega “de onde vêm os valores” em `lookup_order`, bloqueando o caminho de inventar números a partir da descrição do chamado; os limites da tarefa tanto bloqueiam ações fora de escopo quanto proíbem preventivamente palavras de enrolação.

A versão do worker de bug troca o conteúdo por consultar a base de problemas conhecidos, citar números de problema e proibir números inventados; a “orientação de ferramentas” do roteador diz “este passo não lhe dá ferramentas, julgue apenas pelo texto do chamado”, casando com o array de ferramentas vazio passado no código. As diferenças entre esses três prompts são, elas próprias, o retorno do roteamento: depois da classificação, cada um escreve o seu, sem precisar enfiar as exigências de três tipos de trabalho em um único prompt — isso é precisamente a separação de responsabilidades e os prompts mais especializados que o roteamento permite[^S1].

## Nó três: Fusão — repassar referências, não cargas

`merge` é código puro, zero chamadas de modelo. Faz duas coisas: gravar cada rascunho em `out/` e depois coletar um manifesto leve para a jusante — `{id, category, handler, file, oneLine}`, um caminho de arquivo mais um resumo de uma linha, não seis respostas completas. (Simultaneamente também cria um registro para cada chamado em `run-state.json`, com os campos mostrados na Seção 9 do código completo.)

Isso traz para um script de processo único o conselho de engenharia de sistemas multiagente: fazer agentes especializados armazenarem saídas em sistemas externos e repassarem apenas referências leves de volta ao coordenador[^S2]. Naquela retrospectiva, esse conselho resolvia o inchaço de contexto de “tudo retransmitido via agente líder”; aqui ele resolve a versão em pequena escala da mesma coisa — o nó de revisão precisa de “qual arquivo deve ser verificado”, não dos seis textos completos empilhados numa variável passada adiante.

Por isso a primeira ação do nó de revisão é reler o conteúdo do arquivo:

```javascript
let reply = fs.readFileSync(full, "utf8").trim(); // Carrega a carga do arquivo, não vem carregada do nó anterior
```

Essa etapa parece redundante — está tudo no mesmo processo mesmo, é só passar a string direto. Mas ele compra duas coisas: o arquivo em `out/` vira a única fonte de verdade daquele chamado, e quem quer que o edite é o que a revisão verifica; e, no momento em que essa aresta precisar cruzar processos ou máquinas, só essa linha de `readFileSync` muda, e o contrato entre nós não se mexe.

## Um teste rápido

A esta altura, três dos cinco nós do grafo estão completos: o roteamento é apertado por código, a fusão é código puro, e o gate que vem a seguir também será código puro. A pergunta mais frequente neste ponto pode ser colocada diretamente.

```agentmentor-check
{
  "id": "orc-zh-06-llm-as-glue",
  "label": "Julgar se a lógica de cola deve ficar a cargo de um modelo líder decidindo na hora",
  "prompt": "Um colega termina de ler orchestrate.mjs e pergunta: “Por que fixar no código a lógica de cola de roteamento, fusão e gate? Não seria mais flexível ter um modelo líder observando os resultados intermediários e decidindo a próxima etapa na hora?” Para esta leva de tarefas de chamados, como você deve responder?",
  "whyHere": "Três dos cinco nós são código puro, e o leitor acabou de ver três camadas determinísticas de cola em sequência. Este é o momento certo para verificar se ele consegue articular o que o “plano no código” compra, e quando vale a pena devolver a autoridade de decisão ao modelo.",
  "mode": "single",
  "choices": [
    {
      "id": "a",
      "text": "As etapas destas tarefas já eram decomponíveis de antemão; fixá-los no código compra previsibilidade e consistência, os resultados intermediários permanecem em variáveis do script e não ocupam o contexto do modelo; trabalho verdadeiramente não decomponível é o que justifica devolver a autoridade de decisão ao modelo",
      "correct": true,
      "feedback": "Correto, e esta é precisamente a aplicação prática da distinção arquitetural entre fluxo de trabalho e agente: fluxo de trabalho é LLMs e ferramentas orquestrados através de caminhos de código predefinidos, agente é o modelo dirigindo autonomamente os próprios processos. Quando a tarefa é bem definida, o fluxo de trabalho fornece previsibilidade e consistência; quando são necessárias flexibilidade em escala e decisão dirigida pelo modelo, o agente é a escolha certa. As cinco etapas “chegam chamados → classificar → tratar por categoria → verificar → reportar” já estavam determinados antes da primeira linha de código; fazer o modelo redecidir a cada rodada se paga com imprevisibilidade e chamadas extras repetidas, comprando uma flexibilidade de que esta tarefa não precisa. Um benefício colateral é que os resultados intermediários não entram no contexto do modelo: o próprio script guarda o loop, as ramificações e os resultados intermediários, e o contexto do modelo guarda apenas o que ele precisa para esta etapa."
    },
    {
      "id": "b",
      "text": "Conduzir pelo modelo é obviamente mais inteligente: ter um modelo líder observando os resultados intermediários de cada etapa e se adaptando na hora, com roteamento, fusão e gate todos podendo ajustar-se às condições ao vivo, é mais forte do que lógica fixada no código",
      "correct": false,
      "feedback": "“Mais inteligente” não tem onde ser convertido em valor aqui. A resposta da classificação tem apenas três valores legais, e o gate verifica “a resposta contém o id do chamado, contém palavras de enrolação” — são fatos conhecíveis que você confere numa passada; entregando-os a um modelo, você recebe uma resposta que pode diferir a cada vez, e ainda precisaria escrever código para apertá-la. E o custo real não é só esse: para um modelo conduzir, ele precisa ver os resultados intermediários, os seis textos completos de resposta precisam entrar no contexto dele, e esse conteúdo nunca mais será referenciado. Flexibilidade tem preço, compre-a apenas quando você genuinamente precisar."
    },
    {
      "id": "c",
      "text": "As duas abordagens dão mais ou menos no mesmo, a saída final é idêntica, e o resto é preferência pessoal e hábito de equipe, escolha qualquer uma",
      "correct": false,
      "feedback": "Esta não é uma questão de estilo, é uma decisão com critério: as etapas podem ser decompostas de antemão? Pode decompor → escreva no código, compre previsibilidade e consistência; não pode decompor — questões em aberto, etapas imprevisíveis de antemão, sem caminho fixo para fixar no código — aí sim deve voltar para um loop autônomo. (Quando a contagem e o conteúdo das subtarefas não podem ser fixados no código mas as etapas gerais continuam nas suas mãos, o orquestrador-workers da Lição 4 é a camada intermediária; o trabalho deste grafo nem precisa dessa etapa, pois classificação e despacho foram travados antes do código.) Tratar isso como questão de gosto tem como consequência mais comum criar um sistema que, sobre um fluxo de cinco etapas, repensa a cada turno como prosseguir: caro, lento, e, quando algo dá errado, você não sabe qual linha corrigir."
    }
  ]
}
```

## Nó quatro: Loop de revisão — o gate filtra primeiro, as falhas voltam para a fornalha

O nó de revisão faz verificar-corrigir-reverificar: rodar um verificador, corrigir o que falhou, repetir até passar ou parar de progredir[^S5]. É o único lugar deste grafo onde “a saída de um modelo é devolvida para reescrita”.

O primeiro filtro é determinístico, algumas linhas de `includes` e pronto:

```javascript
function gateCheck(ticketId, reply) {
  const problems = [];
  if (!reply.includes(ticketId)) problems.push("missing_ticket_id");
  for (const w of FILLER_WORDS) {
    if (reply.includes(w)) problems.push(`filler_word:${w}`);
  }
  return { pass: problems.length === 0, report: problems.join(" | ") };
}
```

Duas regras, ambas do tipo que o Curso 10 (Verificação e garantia de qualidade: não deixe passar o que só “parece certo”) disse “se pode ser determinado deterministicamente, não pergunte a um avaliador”: a resposta precisa conter o id do chamado (os sistemas de suporte se indexam por ele) e não pode conter enrolação como “aguarde um momento”, “agradecemos a paciência” ou “resolveremos em breve”, sem conteúdo informativo. Nenhuma das duas exige compreensão semântica, inclusão de string basta, o resultado é o mesmo toda vez, e convenientemente produz uma string de relatório que pode ser realimentada direto ao worker.

O avaliador LLM aqui poderia fazer “o tom da resposta é apropriado”, “os fatos excedem o que as ferramentas devolveram” — coisas realmente não julgáveis via `includes`. Mas ele precisa vir depois do gate: o gate é grátis e determinístico, deixe-o filtrar primeiro os problemas evidentes, e o que sobra vale gastar uma chamada para consultar um avaliador. Este grafo instalou apenas a camada de gate, porque os critérios de aceitação desta leva de chamados por acaso são expressáveis como regras; quando os critérios de aceitação incluírem palavras como “adequação de tom”, acrescente a camada de avaliador conforme a alocação de julgamento em camadas do Curso 10.

O loop em si é assim:

```javascript
while (!gate.pass) {
  reports.push(gate.report);
  if (rounds >= MAX_REVIEW_ROUNDS) {
    verdict = "max_rounds";
    break;
  }
  if (gate.report === lastReport) {
    verdict = "no_progress"; // Duas rodadas seguidas com relatório idêntico, o loop não avança mais
    break;
  }
  if (item.handler === "template") {
    verdict = "no_rewriter"; // Template de código puro não tem worker para devolver, repassa direto
    break;
  }
  lastReport = gate.report;
  rounds += 1;
  totalRounds += 1;
  const r = await callWorker(byId.get(item.id), rounds + 1, { prev: reply, report: gate.report });
  calls += r.calls;
  tokens += r.tokens;
  reply = r.text;
  fs.writeFileSync(full, `${reply}\n`);
  gate = gateCheck(item.id, reply);
  log({ node: "review", event: "gate", ticket: item.id, round: rounds, pass: gate.pass, report: gate.report });
}
```

Três instruções `break` correspondem a três maneiras de parar, casando com o que a Lição 5 declarou: passou (a condição do `while` fica naturalmente falsa), nenhum progresso adicional, atingiu o máximo de rodadas. O terceiro `if` é um remendo — as respostas da categoria `other` são geradas por template de código puro, não há worker para devolver, e, se o próprio template estiver quebrado, a única opção é o repasse direto. Esta execução não caiu nele (o template é constante e obrigatoriamente passa no gate); ele é mantido porque, se alguém corromper a string do template, prefiro ver um registro `no_rewriter` a um loop girando.

O que é realimentado ao worker na reciclagem é direto: texto completo da versão anterior + relatório do gate + uma frase “corrija apenas os problemas nomeados no relatório e reescreva a resposta completa” (montada em `callWorker`).

### As duas maneiras de parar aconteceram de fato nesta execução

Plantei dois roteiros nos stubs, fazendo cada saída do loop ser executada uma vez.

**T-1005: Corrigido corretamente, pronto.** A primeira versão do worker de bug esqueceu o id do chamado (a primeira regra falha), o gate devolve `missing_ticket_id`, o worker acrescenta a linha de abertura conforme o relatório, e a segunda versão passa:

```text
{"ts":"2026-08-29T16:48:48.316Z","run_id":"run-mtem7jnm","node":"review","event":"gate","ticket":"T-1005","round":0,"pass":false,"report":"missing_ticket_id"}
{"ts":"2026-08-29T16:48:48.377Z","run_id":"run-mtem7jnm","node":"review","event":"worker_done","ticket":"T-1005","round":2,"calls":1,"tokens":1638}
{"ts":"2026-08-29T16:48:48.377Z","run_id":"run-mtem7jnm","node":"review","event":"gate","ticket":"T-1005","round":1,"pass":true,"report":""}
```

**T-1004: Revisado, mas não corrigido, e o loop parou sozinho.** A primeira versão do worker de billing escreveu “aguarde um momento”, e o gate devolve `filler_word:aguarde um momento`; o worker reescreveu uma versão, com a frase inteiramente diferente, mais longa, com uma explicação a mais, mas aquela expressão permanece. O relatório da segunda rodada é idêntico ao da primeira:

```text
{"ts":"2026-08-29T16:48:48.253Z","run_id":"run-mtem7jnm","node":"review","event":"gate","ticket":"T-1004","round":0,"pass":false,"report":"filler_word:aguarde um momento"}
{"ts":"2026-08-29T16:48:48.315Z","run_id":"run-mtem7jnm","node":"review","event":"worker_done","ticket":"T-1004","round":2,"calls":1,"tokens":1395}
{"ts":"2026-08-29T16:48:48.315Z","run_id":"run-mtem7jnm","node":"review","event":"gate","ticket":"T-1004","round":1,"pass":false,"report":"filler_word:aguarde um momento"}
```

Neste momento `gate.report === lastReport` se sustenta, o loop julga que não há progresso adicional, para e marca este chamado como `needs_human`. Ele ainda tinha mais duas rodadas de orçamento (`MAX_REVIEW_ROUNDS` é 3), mas gastá-las seria desperdício — realimentando o mesmo relatório, o mais provável é voltar a mesma resposta. O valor da saída por “nenhum progresso adicional” está aqui: ela corta as perdas mais cedo do que o máximo de rodadas, e dá uma conclusão informativa — não “tentei três vezes e ainda falha”, mas “ele não entende este feedback”, que é precisamente o sinal para escalar a um humano.

A diferença entre as duas saídas nos dados é imediatamente visível:

```json
"T-1004": {
  "gate_rounds": 1,
  "gate_reports": [
    "filler_word:aguarde um momento",
    "filler_word:aguarde um momento"
  ],
  "stop": "no_progress",
  "status": "needs_human"
},
"T-1005": {
  "gate_rounds": 1,
  "gate_reports": [
    "missing_ticket_id"
  ],
  "stop": "gate_pass",
  "status": "pass"
}
```

Os `gate_rounds` dos dois chamados são 1, e a contagem de rodadas sozinha não distingue sucesso de fracasso; a linha divisória é o comprimento de `gate_reports` — ele registra cada relatório reprovado, incluindo o último, que causou a parada. T-1005 deixa apenas uma entrada (a segunda versão passou, sem segundo relatório), T-1004 deixa duas com conteúdo idêntico, e o campo `stop` escreve a conclusão diretamente como `no_progress`.

## Nó cinco: Relatório e rastro

O nó final também é código puro: imprime `state.nodes` e o detalhamento por chamado como duas tabelas, conta os `needs_human` e determina o código de saída. Todos passaram é 0, um precisa de humano é 1.

O rastro se divide em dois arquivos, cada um com sua finalidade. `run.jsonl` é o log estruturado do Curso 11 (Observabilidade e depuração: enxergando cada passo do seu agente), um evento JSON por linha, cada um carregando `ts` e `run_id`, grepável depois — esta execução totalizou 39 linhas, e os trechos das seções anteriores foram todos extraídos dela literalmente.

`run-state.json` registra o rastro de execução (distinto de “o estado do grafo = aquelas poucas variáveis de script”), escrito no estilo do Curso 9 (Gerenciamento e persistência de estado: fazendo tarefas longas sobreviverem à interrupção): grava `.tmp` primeiro, depois troca atomicamente com `rename`; morto em qualquer momento, no disco está ou o estado completo anterior ou o novo estado completo, nunca meio JSON:

```javascript
function saveState() {
  state.updated_at = new Date().toISOString();
  const tmp = `${STATE_PATH}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(state, null, 2));
  fs.renameSync(tmp, STATE_PATH);
}
```

O momento da escrita é “persistir após cada etapa pequena”: após cada nó concluir, persiste uma vez; dentro do nó de revisão, após o julgamento de cada chamado, persiste de novo. O motivo que a Lição 5 citou — rastrear incrementalmente o resultado de cada agente é precisamente a premissa para recuperar uma execução dentro da mesma sessão[^S5]; um fluxo de trabalho que distribui o trabalho entre muitos agentes pequenos preserva mais progresso do que um agente longo[^S5]. Este grafo não é um runtime multiagente, mas a mesma afirmação vale aqui: seis chamados são seis unidades independentes de progresso, e morrer no meio da revisão não deveria fazer desaparecer junto o que já foi persistido (a fase de fan-out ainda não alcançou isso — veja o item 3 da Tabela de conciliação).

Para ver o efeito prático dessa afirmação, use `STOP_AFTER=merge` para parar o processo depois do fan-out e antes da revisão:

```text
\$ STOP_AFTER=merge node orchestrate.mjs
inbox/ recebeu 6 chamados: T-1001, T-1002, T-1003, T-1004, T-1005, T-1006
[route] T-1001=billing  T-1002=bug  T-1003=other  T-1004=billing  T-1005=bug  T-1006=other
[fanout] teto de concorrência 2, 6 rascunhos produzidos
[merge] gravou 6 arquivos em out/, repassando adiante só referências e resumos de uma linha
[stop] STOP_AFTER=merge: parando antes da revisão, sem veredito nesta execução
\$ echo \$?
2
```

`run-state.json` neste momento (trecho):

```json
{
  "version": 1,
  "run_id": "run-mtem7k26",
  "nodes": {
    "route": { "ms": 62, "calls": 1, "tokens": 720, "status": "ok" },
    "fanout": { "ms": 246, "calls": 8, "tokens": 8903, "status": "ok" },
    "merge": { "ms": 2, "calls": 0, "tokens": 0, "status": "ok" }
  },
  "tickets": {
    "T-1004": {
      "category": "billing",
      "handler": "worker:billing",
      "file": "out/T-1004.txt",
      "one_line": "Chamado T-1004: a alte…",
      "gate_rounds": 0,
      "gate_reports": [],
      "stop": null,
      "status": "drafted"
    },
    "T-1005": {
      "category": "bug",
      "handler": "worker:bug",
      "file": "out/T-1005.txt",
      "one_line": "Esse é o problema conh…",
      "gate_rounds": 0,
      "gate_reports": [],
      "stop": null,
      "status": "drafted"
    }
  }
}
```

As contas de três nós estão registradas, a categoria, o tratador e os caminhos dos arquivos de saída dos seis chamados estão registrados, e os seis arquivos de rascunho já estão persistidos em `out/`. Perdeu-se apenas o trecho de revisão: todos os chamados param em `status: "drafted"`, `stop: null`. Esse estado é suficiente para sustentar uma retomada — ler os rascunhos de volta de `out/` e começar direto pelo nó de revisão. Note que o `one_line` de T-1005 por acaso expõe o defeito do rascunho: a abertura não tem o id do chamado. A revisão ainda não rodou, então esse defeito ainda não foi capturado.

(`STOP_AFTER` só reconhece `merge` como valor único; é a versão simplificada do ponto de queda controlada do Curso 9: código de saída 0 todos passaram, 1 há chamados para humano, 2 parou cedo sem veredito, 3 o próprio script quebrou — quatro códigos sem sobreposição, e a CI distingue num relance “rodou mas alguns precisam de repasse” de “quebrou”.)

## `orchestrate.mjs` completo

Abaixo está o texto completo, um bloco contínuo; copie e cole em `orchestrate.mjs` num diretório vazio e depois `node orchestrate.mjs`. Zero dependências, sem necessidade de `npm i`, sem necessidade de `package.json` (o sufixo `.mjs` já declara que é um módulo ES) e sem necessidade de chave de API — o cliente de modelo é um stub. A primeira execução cria `inbox/`, `kb/`, `out/` e grava aqueles seis chamados.

```javascript
// orchestrate.mjs —— pequeno grafo de processamento em lote de chamados: roteamento → fan-out → fusão → loop de revisão → relatório
// Zero dependências, node orchestrate.mjs roda direto. O cliente de modelo é um stub que reproduz uma fila fixa.
import fs from "node:fs";
import path from "node:path";

// ============ 0. Constantes e diretórios ============

const MODEL = "claude-sonnet-5";
const MAX_TURNS = 6;          // Teto do loop interno de um nó (Válvula 1 do Curso 7)
const POOL_SIZE = Math.max(1, Number(process.env.POOL_SIZE) || 2); // Teto de concorrência do fan-out (Lição 3); 0/inválido cai para 1
const STUB_LATENCY_MS = 60;   // Latência fixa do stub, substitui a ida e volta de rede real, para a coluna de tempo ter o que mostrar
const MAX_REVIEW_ROUNDS = 3;  // Máximo de rodadas de reescrita do loop de revisão (Lição 5)
const FILLER_WORDS = ["aguarde um momento", "agradecemos a paciência", "resolveremos em breve"];
const CATEGORIES = ["billing", "bug", "other"];

const ROOT = process.cwd();
const INBOX = path.join(ROOT, "inbox");
const OUT = path.join(ROOT, "out");
const KB = path.join(ROOT, "kb");
const STATE_PATH = path.join(ROOT, "run-state.json");
const LOG_PATH = path.join(ROOT, "run.jsonl");

// ============ 1. Entrada: 6 chamados em inbox/ e uma base de problemas conhecidos ============

const TICKET_TEXT = {
  "T-1001": "O pedido A-77301 foi cobrado duas vezes neste mês. Verifiquem, por favor, e devolvam a cobrança extra.",
  "T-1002": "Na página de relatórios eu clico em “Exportar CSV” e o botão fica girando; esperei cinco minutos e nada. Chrome, rede da empresa.",
  "T-1003": "Qual é o telefone do atendimento humano? Quero ligar e perguntar direto.",
  "T-1004": "A nota fiscal do pedido A-77420 saiu com o destinatário errado, emitida no meu nome pessoal; precisa ser alterada para o nome da empresa.",
  "T-1005": "No aplicativo do celular, depois que faço login o avatar não aparece. Na versão web funciona normalmente.",
  "T-1006": "Uso há três meses, relatei problemas várias vezes e nunca tive retorno. Esse produto ainda tem alguém dando manutenção?",
};

const KNOWN_ISSUES = [
  "## KI-88 Exportação de CSV sem resposta na página de relatórios",
  "Impacto: ao clicar em exportar, o botão fica girando; a fila de exportação do backend está acumulada. Estado: corrigido no 3.4.2, aguardando publicação.",
  "Contorno: use “Exportar XLSX” na mesma página; as colunas de dados são idênticas.",
  "",
  "## KI-91 Avatar não aparece no aplicativo móvel",
  "Impacto: a URL do avatar no App ainda aponta para o domínio antigo do CDN; a versão web não é afetada. Estado: em correção, previsto para a publicação desta sexta-feira.",
  "Contorno: saia da conta e entre novamente; o avatar costuma voltar a aparecer.",
].join("\n");

function seedWorkspace() {
  fs.mkdirSync(INBOX, { recursive: true });
  fs.mkdirSync(OUT, { recursive: true });
  fs.mkdirSync(KB, { recursive: true });
  for (const [id, text] of Object.entries(TICKET_TEXT)) {
    fs.writeFileSync(path.join(INBOX, `${id}.txt`), `${text}\n`);
  }
  fs.writeFileSync(path.join(KB, "known-issues.md"), `${KNOWN_ISSUES}\n`);
}

function loadInbox() {
  return fs
    .readdirSync(INBOX)
    .filter((f) => f.endsWith(".txt"))
    .sort()
    .map((f) => ({
      id: path.basename(f, ".txt"),
      text: fs.readFileSync(path.join(INBOX, f), "utf8").trim(),
    }));
}

// ============ 2. Cliente stub: SCRIPTS fixa cada resposta por id de chamado ============

const say = (text) => ({ type: "text", text });
const call = (id, name, input) => ({ type: "tool_use", id, name, input });
const turn = (stop_reason, content, inTok, outTok) => ({
  stop_reason,
  content,
  usage: { input_tokens: inTok, output_tokens: outTok },
});

const SCRIPTS = {
  // Nó de roteamento: uma chamada classifica os seis. Note que a última linha deliberadamente não é um rótulo legal, e o código a aparará.
  router: [
    turn(
      "end_turn",
      [
        say(
          [
            "T-1001: billing",
            "T-1002: bug",
            "T-1003: other",
            "T-1004: billing",
            "T-1005: bug",
            "T-1006: reclamação",
          ].join("\n")
        ),
      ],
      624,
      96
    ),
  ],

  // worker de billing: consulta o pedido e escreve com clareza, a primeira versão passa no gate.
  "T-1001#1": [
    turn(
      "tool_use",
      [say("Primeiro consultar o histórico do pedido."), call("toolu_a1", "lookup_order", { order_id: "A-77301" })],
      781,
      92
    ),
    turn(
      "end_turn",
      [
        say(
          "Chamado T-1001: o pedido A-77301 foi de fato cobrado duas vezes neste mês, 399,00 reais em cada cobrança, e o sistema marcou como cobrança duplicada. " +
            "A cobrança extra já foi enviada para estorno e será devolvida pelo mesmo meio de pagamento; o prazo depende do emissor do cartão, normalmente de 3 a 5 dias úteis. " +
            "Se no quinto dia útil ainda não tiver chegado, responda neste chamado que levaremos o ID da transação para verificar com o canal de pagamento."
        ),
      ],
      1124,
      168
    ),
  ],

  // worker de bug: consulta a base de problemas conhecidos e responde, a primeira versão passa no gate.
  "T-1002#1": [
    turn(
      "tool_use",
      [say("Primeiro consultar a base de problemas conhecidos."), call("toolu_b1", "read_file", { path: "kb/known-issues.md" })],
      763,
      88
    ),
    turn(
      "end_turn",
      [
        say(
          "Chamado T-1002: você encontrou o problema conhecido KI-88 — a exportação de CSV da página de relatórios está com a fila do backend acumulada e o botão fica girando. " +
            "A correção entrou na versão 3.4.2 e será aplicada automaticamente após a próxima publicação. Enquanto isso, use “Exportar XLSX” na mesma página, com colunas de dados idênticas. " +
            "Avisaremos neste chamado no dia da publicação."
        ),
      ],
      1312,
      176
    ),
  ],

  // worker de billing: a primeira versão tem palavra de enrolação, a segunda mantém a mesma palavra — dois relatórios de gate idênticos.
  "T-1004#1": [
    turn(
      "tool_use",
      [say("Primeiro confirmar o destinatário desta nota fiscal."), call("toolu_c1", "lookup_order", { order_id: "A-77420" })],
      786,
      90
    ),
    turn(
      "end_turn",
      [
        say(
          "Chamado T-1004: a alteração do destinatário da nota fiscal exige análise do financeiro; a solicitação do pedido A-77420 já foi registrada, aguarde um momento."
        ),
      ],
      1133,
      96
    ),
  ],
  "T-1004#2": [
    turn(
      "end_turn",
      [
        say(
          "Chamado T-1004: alterar o destinatário de pessoa física para empresa exige que o financeiro cancele e reemita a nota no sistema, e a solicitação segue na fila de análise, aguarde um momento; assim que a análise terminar, envio a nova nota neste chamado."
        ),
      ],
      1291,
      104
    ),
  ],

  // worker de bug: a primeira versão esquece o id do chamado, a segunda o acrescenta conforme o relatório do gate.
  "T-1005#1": [
    turn(
      "tool_use",
      [say("Verificar se é um problema conhecido."), call("toolu_d1", "read_file", { path: "kb/known-issues.md" })],
      752,
      86
    ),
    turn(
      "end_turn",
      [
        say(
          "Esse é o problema conhecido KI-91 — a URL do avatar no App ainda aponta para o domínio antigo do CDN, e a versão web não é afetada; a correção sai na publicação desta sexta-feira. " +
            "Enquanto isso, saia da conta e entre novamente, que o avatar costuma voltar a aparecer."
        ),
      ],
      1298,
      158
    ),
  ],
  "T-1005#2": [
    turn(
      "end_turn",
      [
        say(
          "Chamado T-1005: esse é o problema conhecido KI-91 — a URL do avatar no App ainda aponta para o domínio antigo do CDN, e a versão web não é afetada; a correção sai na publicação desta sexta-feira. " +
            "Enquanto isso, saia da conta e entre novamente, que o avatar costuma voltar a aparecer. Se continuar em branco depois da publicação, anexe uma captura de tela neste chamado que verificamos sua conta."
        ),
      ],
      1466,
      172
    ),
  ],
};

function makeStubClient(queue) {
  let i = 0;
  return {
    messages: {
      async create(req) {
        if (!req.model || !req.max_tokens) {
          throw new Error("Cliente stub: create precisa carregar model e max_tokens");
        }
        if (i >= queue.length) {
          throw new Error(`Fila do stub esgotada: a requisição ${i + 1} não tem resposta pré-definida`);
        }
        await new Promise((r) => setTimeout(r, STUB_LATENCY_MS));
        return queue[i++];
      },
    },
  };
}

// Camada de medição por fora do cliente, o interior do loop permanece inalterado.
function metered(client) {
  const meter = { calls: 0, tokens: 0 };
  const wrapped = {
    messages: {
      async create(req) {
        const res = await client.messages.create(req);
        meter.calls += 1;
        meter.tokens += res.usage.input_tokens + res.usage.output_tokens;
        return res;
      },
    },
  };
  return { client: wrapped, meter };
}

// ============ 3. Interior do nó: o loop do Curso 7, trazido literalmente ============

async function runAgent(client, system, userInput, tools, toolImpls) {
  const messages = [{ role: "user", content: userInput }];
  let turns = 0;

  let response = await client.messages.create({
    model: MODEL,
    max_tokens: 1024,
    system,
    tools,
    messages,
  });

  while (response.stop_reason === "tool_use") {
    // —— Válvula 1: máximo de turnos. No início do corpo do loop, antes de turns++ ——
    if (turns >= MAX_TURNS) {
      return `Atingiu o máximo de turnos ${MAX_TURNS}, parando (a tarefa pode ser difícil demais ou o modelo travou)`;
    }
    turns++;

    // Anexa a resposta completa deste turno (papel assistant) ao histórico
    messages.push({ role: "assistant", content: response.content });

    // Executa todos os blocos tool_use deste turno, embrulhando cada um como tool_result
    const toolResults = await runToolUses(response.content, toolImpls);

    // Todos os blocos tool_result de um turno vão na mensagem user imediatamente seguinte
    messages.push({ role: "user", content: toolResults });

    // Envia de novo com o histórico alongado, e volta à condição do while
    response = await client.messages.create({
      model: MODEL,
      max_tokens: 1024,
      system,
      tools,
      messages,
    });
  }

  // stop_reason não é mais tool_use: extrai o texto final e retorna
  return response.content.find((b) => b.type === "text")?.text ?? "";
}

async function runToolUses(content, toolImpls) {
  const toolUseBlocks = content.filter((b) => b.type === "tool_use");

  return Promise.all(
    toolUseBlocks.map(async (block) => {
      const impl = toolImpls[block.name];
      try {
        const output = await impl(block.input);
        return {
          type: "tool_result",
          tool_use_id: block.id,
          content: output,
        };
      } catch (err) {
        return {
          type: "tool_result",
          tool_use_id: block.id,
          content: `Erro de execução da ferramenta: ${err.message}`,
          is_error: true,
        };
      }
    })
  );
}

// ============ 4. Duas ferramentas ============

const ORDERS = {
  "A-77301": { order_id: "A-77301", amount_cents: 39900, charged_times: 2, status: "duplicate_charge", invoice_title: "Ana Ribeiro (pessoa física)" },
  "A-77420": { order_id: "A-77420", amount_cents: 128000, charged_times: 1, status: "paid", invoice_title: "Ana Ribeiro (pessoa física)" },
};

const TOOLS = [
  {
    name: "read_file",
    description: "Lê um arquivo de texto sob o diretório de trabalho, para consultar a base de problemas conhecidos ou o texto original do chamado.",
    input_schema: {
      type: "object",
      properties: { path: { type: "string", description: "Caminho relativo ao diretório de trabalho" } },
      required: ["path"],
    },
  },
  {
    name: "lookup_order",
    description: "Consulta fatos de cobrança pelo id do pedido: valor, número de cobranças, status, destinatário da nota fiscal.",
    input_schema: {
      type: "object",
      properties: { order_id: { type: "string", description: "Id de pedido como A-77301" } },
      required: ["order_id"],
    },
  },
];

const toolImpls = {
  read_file({ path: rel }) {
    const full = path.resolve(ROOT, rel);
    if (!full.startsWith(ROOT)) throw new Error("Caminho fora dos limites");
    return fs.readFileSync(full, "utf8");
  },
  lookup_order({ order_id }) {
    const row = ORDERS[order_id];
    if (!row) throw new Error(`Pedido não encontrado: ${order_id}`);
    return JSON.stringify(row);
  },
};

// ============ 5. Três prompts de delegação: objetivo / formato de saída / orientação de ferramentas / limites da tarefa ============

const ROUTER_PROMPT = [
  "Você é o roteador de chamados de clientes.",
  "Objetivo: Classificar cada chamado abaixo em billing (cobrança, faturas, notas fiscais, estornos), bug (falha de funcionalidade), other (todo o resto).",
  "Formato de saída: Uma linha por chamado, no formato estrito “id_do_chamado: categoria”, a categoria precisa ser billing / bug / other, não escreva motivos, não produza outro conteúdo.",
  "Orientação de ferramentas: Este passo não lhe dá ferramentas, julgue apenas pelo texto do chamado, não afirme ter consultado sistemas.",
  "Limites da tarefa: Apenas classifique, não escreva respostas, não tire conclusões, não funda chamados; se estiver em dúvida, use other.",
].join("\n");

const WORKER_PROMPTS = {
  billing: [
    "Você é especialista em chamados de cobrança, tratando um chamado por vez.",
    "Objetivo: Investigar os fatos de cobrança deste chamado e produzir uma resposta completa em português.",
    "Formato de saída: Parágrafo em texto puro, começando com “Chamado <id_do_chamado>:”, informando os fatos encontrados, as ações já tomadas e o que o usuário pode esperar em seguida; sem listas com marcadores, sem amenidades.",
    "Orientação de ferramentas: Fatos de cobrança precisam usar lookup_order, passando o id do pedido do chamado literalmente; se não encontrar, diga isso, não infira valores ou número de cobranças a partir da descrição do chamado.",
    "Limites da tarefa: Trate apenas a parte de cobrança deste chamado, não modifique pedidos, não prometa compensações extras, não responda perguntas fora de cobrança; não escreva enrolação como “aguarde um momento”, “agradecemos a paciência” ou “resolveremos em breve”.",
  ].join("\n"),
  bug: [
    "Você é especialista em chamados de defeito, tratando um chamado por vez.",
    "Objetivo: Determinar se este chamado é um problema conhecido e produzir uma resposta completa em português.",
    "Formato de saída: Parágrafo em texto puro, começando com “Chamado <id_do_chamado>:”, informando o número do problema conhecido correspondente e a conclusão, o contorno e quando a correção chega; sem listas com marcadores, sem amenidades.",
    "Orientação de ferramentas: Use read_file para ler kb/known-issues.md como referência cruzada; se houver correspondência, cite o número dentro dela; se não houver, diga isso, não invente um número de problema.",
    "Limites da tarefa: Faça apenas a identificação do problema e a resposta, não desative funcionalidades, não prometa prazos de correção com precisão de minutos, não peça senhas da conta; não escreva enrolação como “aguarde um momento”, “agradecemos a paciência” ou “resolveremos em breve”.",
  ].join("\n"),
};

// A categoria other não entra no modelo: é um template de código puro. Nem todo nó precisa ser um modelo.
const otherTemplate = (id) =>
  `Chamado ${id} recebido. Este chamado não envolve cobrança nem é falha de funcionalidade, e foi encaminhado à equipe de atendimento para acompanhamento manual: ` +
  `em dias úteis, das 9h às 18h, você pode ligar para 0800 000 1234 e falar diretamente conosco, ou acrescentar informações neste chamado, com todas as respostas registradas aqui.`;

// ============ 6. Observabilidade: log estruturado JSONL + rastro incremental em run-state.json ============

const RUN_ID = `run-${Date.now().toString(36)}`;

function initLog() {
  fs.writeFileSync(LOG_PATH, "");
}

function log(fields) {
  const line = { ts: new Date().toISOString(), run_id: RUN_ID, ...fields };
  fs.appendFileSync(LOG_PATH, `${JSON.stringify(line)}\n`);
}

const state = {
  version: 1,
  run_id: RUN_ID,
  started_at: new Date().toISOString(),
  updated_at: null,
  nodes: {},
  tickets: {},
};

// Escrita atômica: grava .tmp primeiro e depois rename (a prática do Curso 9)
function saveState() {
  state.updated_at = new Date().toISOString();
  const tmp = `${STATE_PATH}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(state, null, 2));
  fs.renameSync(tmp, STATE_PATH);
}

async function node(name, fn) {
  const t0 = Date.now();
  log({ node: name, event: "node_start" });
  const result = await fn();
  const ms = Date.now() - t0;
  state.nodes[name] = {
    ms,
    calls: result.calls ?? 0,
    tokens: result.tokens ?? 0,
    status: result.status ?? "ok",
  };
  saveState(); // Persiste uma vez após cada nó concluir
  log({ node: name, event: "node_end", ms, calls: result.calls ?? 0, tokens: result.tokens ?? 0 });
  return result;
}

// ============ 7. Nó um: Roteamento ============

async function routeNode(tickets) {
  const { client, meter } = metered(makeStubClient(SCRIPTS.router));
  const input = tickets.map((t) => `${t.id}: ${t.text}`).join("\n");
  const text = await runAgent(client, ROUTER_PROMPT, input, [], {});

  // Aperto da saída: só reconhece linhas “id_do_chamado: categoria”, categoria fora da lista branca cai para other
  const parsed = new Map();
  for (const line of text.split("\n")) {
    const m = line.match(/^\s*(T-\d+)\s*:\s*(\S+)\s*$/);
    if (!m) continue;
    const [, id, raw] = m;
    const category = CATEGORIES.includes(raw) ? raw : "other";
    if (category !== raw) log({ node: "route", event: "clamped", ticket: id, raw, category });
    parsed.set(id, category);
  }

  const routed = tickets.map((t) => ({ ...t, category: parsed.get(t.id) ?? "other" }));
  for (const t of routed) log({ node: "route", event: "routed", ticket: t.id, category: t.category });
  return { routed, calls: meter.calls, tokens: meter.tokens };
}

// ============ 8. Nó dois: Fan-out (seccionamento + teto do pool de concorrência) ============

async function runPool(items, limit, worker) {
  const results = new Array(items.length);
  let next = 0;
  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const i = next;
      next += 1;
      results[i] = await worker(items[i]);
    }
  });
  await Promise.all(runners);
  return results;
}

async function callWorker(ticket, round, extra) {
  const key = `${ticket.id}#${round}`;
  const queue = SCRIPTS[key];
  if (!queue) throw new Error(`Roteiro de stub ausente: ${key}`);
  const { client, meter } = metered(makeStubClient(queue));
  const input = extra
    ? [
        `Abaixo está sua versão anterior para o chamado ${ticket.id}:`,
        "---",
        extra.prev,
        "---",
        `A verificação determinística não passou, relatório: ${extra.report}`,
        "Corrija apenas os problemas nomeados no relatório e reescreva a resposta completa.",
      ].join("\n")
    : `Id do chamado ${ticket.id}\nTexto original do usuário: ${ticket.text}`;
  const text = await runAgent(client, WORKER_PROMPTS[ticket.category], input, TOOLS, toolImpls);
  log({ node: extra ? "review" : "fanout", event: "worker_done", ticket: ticket.id, round, calls: meter.calls, tokens: meter.tokens });
  return { text, calls: meter.calls, tokens: meter.tokens };
}

async function fanoutNode(routed) {
  let calls = 0;
  let tokens = 0;

  const drafts = await runPool(routed, POOL_SIZE, async (ticket) => {
    if (ticket.category === "other") {
      const text = otherTemplate(ticket.id);
      log({ node: "fanout", event: "template_done", ticket: ticket.id });
      return { ticket, handler: "template", text };
    }
    const r = await callWorker(ticket, 1);
    calls += r.calls;
    tokens += r.tokens;
    return { ticket, handler: `worker:${ticket.category}`, text: r.text };
  });

  return { drafts, calls, tokens };
}

// ============ 9. Nó três: Fusão (código puro, repassa referências e não cargas) ============

function oneLineOf(text) {
  const head = text.split(".")[0];
  return head.length > 22 ? `${head.slice(0, 22)}…` : head;
}

function mergeNode(drafts) {
  const items = drafts.map((d) => {
    const rel = path.join("out", `${d.ticket.id}.txt`);
    fs.writeFileSync(path.join(ROOT, rel), `${d.text}\n`);
    const item = {
      id: d.ticket.id,
      category: d.ticket.category,
      handler: d.handler,
      file: rel,
      oneLine: oneLineOf(d.text),
    };
    state.tickets[item.id] = {
      category: item.category,
      handler: item.handler,
      file: item.file,
      one_line: item.oneLine,
      gate_rounds: 0,
      gate_reports: [],
      stop: null,
      status: "drafted",
    };
    log({ node: "merge", event: "collected", ticket: item.id, file: item.file, chars: d.text.length });
    return item;
  });
  return { items };
}

// ============ 10. Nó quatro: Loop de revisão (gate determinístico primeiro, verificar-corrigir-reverificar) ============

function gateCheck(ticketId, reply) {
  const problems = [];
  if (!reply.includes(ticketId)) problems.push("missing_ticket_id");
  for (const w of FILLER_WORDS) {
    if (reply.includes(w)) problems.push(`filler_word:${w}`);
  }
  return { pass: problems.length === 0, report: problems.join(" | ") };
}

async function reviewNode(items, byId) {
  let calls = 0;
  let tokens = 0;
  let totalRounds = 0;

  for (const item of items) {
    const full = path.join(ROOT, item.file);
    let reply = fs.readFileSync(full, "utf8").trim(); // Carrega a carga do arquivo, não vem carregada do nó anterior
    let rounds = 0;
    let lastReport = null;
    const reports = [];
    let verdict = null;
    let gate = gateCheck(item.id, reply);
    log({ node: "review", event: "gate", ticket: item.id, round: 0, pass: gate.pass, report: gate.report });

    while (!gate.pass) {
      reports.push(gate.report);
      if (rounds >= MAX_REVIEW_ROUNDS) {
        verdict = "max_rounds";
        break;
      }
      if (gate.report === lastReport) {
        verdict = "no_progress"; // Duas rodadas seguidas com relatório idêntico, o loop não avança mais
        break;
      }
      if (item.handler === "template") {
        verdict = "no_rewriter"; // Template de código puro não tem worker para devolver, repassa direto
        break;
      }
      lastReport = gate.report;
      rounds += 1;
      totalRounds += 1;
      const r = await callWorker(byId.get(item.id), rounds + 1, { prev: reply, report: gate.report });
      calls += r.calls;
      tokens += r.tokens;
      reply = r.text;
      fs.writeFileSync(full, `${reply}\n`);
      gate = gateCheck(item.id, reply);
      log({ node: "review", event: "gate", ticket: item.id, round: rounds, pass: gate.pass, report: gate.report });
    }

    const rec = state.tickets[item.id];
    rec.gate_rounds = rounds;
    rec.gate_reports = reports;
    rec.stop = gate.pass ? "gate_pass" : verdict;
    rec.status = gate.pass ? "pass" : "needs_human";
    rec.one_line = oneLineOf(reply);
    item.oneLine = rec.one_line;
    item.status = rec.status;
    item.rounds = rounds;
    item.stop = rec.stop;
    saveState(); // Persiste uma vez após o julgamento de cada chamado
  }

  return { items, calls, tokens, totalRounds };
}

// ============ 11. Nó cinco: Relatório (código puro) ============

const pad = (s, n) => {
  const w = [...String(s)].reduce((a, c) => a + (c.charCodeAt(0) > 127 ? 2 : 1), 0);
  return String(s) + " ".repeat(Math.max(1, n - w));
};

function reportNode(items, totalRounds) {
  console.log("\n=== Resumo da execução do grafo ===");
  console.log(pad("Nó", 10) + pad("Tempo", 8) + pad("Chamadas", 12) + pad("Tokens", 9) + pad("Rodadas", 12) + "Status");
  // O nó de relatório não entra nesta tabela: ele é esta tabela; seu tempo é registrado pelo node() externo em run-state.json
  const order = ["route", "fanout", "merge", "review"];
  for (const name of order) {
    const n = state.nodes[name];
    if (!n) continue;
    const rounds = name === "review" ? String(totalRounds) : "-";
    console.log(pad(name, 10) + pad(`${n.ms}ms`, 8) + pad(n.calls, 12) + pad(n.tokens, 9) + pad(rounds, 12) + n.status);
  }

  console.log("\n=== Detalhamento por chamado ===");
  console.log(pad("Chamado", 9) + pad("Categoria", 10) + pad("Tratador", 18) + pad("Rodadas", 12) + pad("Motivo parada", 16) + "Status");
  for (const it of items) {
    console.log(
      pad(it.id, 9) + pad(it.category, 10) + pad(it.handler, 18) + pad(it.rounds, 12) + pad(it.stop, 16) + it.status
    );
  }

  const needsHuman = items.filter((it) => it.status === "needs_human");
  console.log(`\nDiretório de saída out/: ${items.length} respostas; precisam de repasse humano: ${needsHuman.length} chamado${needsHuman.length === 1 ? "" : "s"}`);
  for (const it of needsHuman) {
    console.log(`  - ${it.id} (${it.stop}): ${it.oneLine}`);
  }
  console.log(`Rastro: run-state.json / run.jsonl (run_id=${RUN_ID})`);
  return { needsHuman: needsHuman.length };
}

// ============ 12. Fluxo principal: o plano é esta dúzia de linhas abaixo ============

async function main() {
  seedWorkspace();
  initLog();
  saveState();

  const tickets = loadInbox();
  console.log(`inbox/ recebeu ${tickets.length} chamados: ${tickets.map((t) => t.id).join(", ")}`);

  const { routed } = await node("route", () => routeNode(tickets));
  console.log(`[route] ${routed.map((t) => `${t.id}=${t.category}`).join("  ")}`);

  const { drafts } = await node("fanout", () => fanoutNode(routed));
  console.log(`[fanout] teto de concorrência ${POOL_SIZE}, ${drafts.length} rascunhos produzidos`);

  const { items } = await node("merge", async () => mergeNode(drafts));
  console.log(`[merge] gravou ${items.length} arquivos em out/, repassando adiante só referências e resumos de uma linha`);

  if (process.env.STOP_AFTER === "merge") {
    console.log("[stop] STOP_AFTER=merge: parando antes da revisão, sem veredito nesta execução");
    process.exit(2);
  }

  const byId = new Map(routed.map((t) => [t.id, t]));
  const reviewed = await node("review", () => reviewNode(items, byId));
  console.log(`[review] reescritas do gate: ${reviewed.totalRounds} rodadas no total`);

  const { needsHuman } = await node("report", async () => reportNode(items, reviewed.totalRounds));

  process.exit(needsHuman > 0 ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(3); }); // Falha grave sai com 3, distinto do 1 de needs_human
```

Seiscentas e setenta e nove linhas no total, das quais cerca de cento e noventa são dados alimentados aos stubs (a tabela `SCRIPTS`, os textos originais dos seis chamados, a base de problemas conhecidos, o cliente stub); a lógica de orquestração propriamente dita — cinco nós, pool de concorrência, gate e ponto de entrada — são cerca de duzentas e cinquenta linhas, mais umas quarenta para observabilidade e rastro de estado. Essa escala é deliberada: um loop mais alguns padrões é genuinamente algo implementável em poucas linhas de código[^S1].

## Montagem da verificação

Toda saída de terminal desta lição veio de execuções reais deste script, não de “rodar várias vezes e escolher a mais bonita”, mas de fixar de antemão duas fontes de não determinismo.

**Troque o modelo por um stub que reproduz uma fila fixa.** `SCRIPTS` é uma tabela, a chave é “id do chamado + qual versão”, o valor é uma sequência de respostas pré-escrita; cada chamada de `messages.create` cospe a próxima em ordem, e continuar chamando com a fila esgotada lança erro direto. Assim, “qual chamado chama qual ferramenta em qual rodada, quando o modelo termina” são todos constantes. O stub também deixou uma asserção: `create` precisa carregar `model` e `max_tokens`, e faltando um lança — o cliente real exige esses dois parâmetros, o stub não cobre por você, então você não descobre a lacuna no dia em que trocar pelo cliente real. Esse método é usado desde a prática do Curso 8 até aqui, de modo que o objeto verificado é a sua lógica de controle, não o desempenho do modelo naquele dia (modelos reais são não determinísticos, e a mesma entrada ainda pode dar respostas diferentes[^S3]).

O stub também acrescenta um atraso fixo de 60ms, substituindo a ida e volta de rede real. Sem ele, todo nó daria 0ms e o efeito do pool de concorrência não apareceria na tabela-resumo — a comparação com `POOL_SIZE=1` acima (490ms contra 244ms) depende disso.

**Dois roteiros de loop plantados nos stubs.** O loop de revisão precisa girar de verdade, o que exige algo genuinamente reprovando no gate. Então:

- `T-1005#1` (primeira versão do worker de bug) omite deliberadamente o id do chamado, disparando `missing_ticket_id`; `T-1005#2` acrescenta a linha de abertura e a segunda versão passa — isso demonstra a saída de conclusão normal do “verificar-corrigir-reverificar”.
- `T-1004#1` e `T-1004#2` (as duas versões do worker de billing) carregam ambas “aguarde um momento”. As frases das duas versões são inteiramente diferentes, os comprimentos diferem, mas o gate procura se aquela expressão está presente, então as strings de relatório das duas rodadas são idênticas, disparando “nenhum progresso adicional” — isso demonstra a saída de corte de perdas.

A escrita dos dois roteiros tem ofício: não fazer a segunda versão repetir literalmente a primeira (assim até um humano veria que é um loop morto), mas fazê-la “revisada, porém não corrigida corretamente”. Esse é o modo de falha mais comum em loops reais, e precisamente o que o critério “duas rodadas seguidas com relatório idêntico” captura.

**Parada antecipada controlada.** `STOP_AFTER=merge` para o processo depois do fan-out e antes da revisão, com código de saída 2. É a versão simplificada do `CRASH_AFTER` do Curso 9: tornar “interromper em qual etapa” um parâmetro precisamente especificável, em vez de depender da sorte para acertá-lo. O `run-state.json` em estado `drafted` acima veio dessa execução.

## Tabela de conciliação: este grafo deve dívidas às lições anteriores, quitadas linha a linha

Num curso que chega à sua prática final, o erro mais fácil é derrubar em silêncio regras estabelecidas antes. Então conciliamos linha a linha aqui, com as discrepâncias escritas explicitamente.

**1. O corpo do loop bate com o Curso 7.** As quatro etapas no corpo do loop — empilhar assistant, executar ferramentas, empilhar tool_result, reatribuir `response` — são palavra por palavra idênticos aos da Lição 6 do Curso 7, e até os comentários não mudaram. A Válvula 1 também está na posição original. **Diferenças declaradas**: a assinatura de `runAgent` ganhou dois parâmetros, `client` e `system` (três papéis precisam de stubs diferentes e prompts de sistema diferentes), e a chamada de `create` ganhou um campo `system`; a medição de tokens saiu do corpo do loop para a camada envolvente `metered`, de modo que a Válvula 2 do Curso 7 (orçamento de tokens) não veio junto, e a Válvula 3 (detecção de giro em falso) e a Válvula 4 (aprovação humana) também não se mudaram — as ferramentas deste grafo são apenas leitura de arquivo e consulta de pedido, ambas operações somente leitura, sem ações de alto impacto que exijam aprovação; e a fila do stub é finita, sem como girar indefinidamente. Antes de conectar a API real, essas três válvulas precisam ser reinstaladas.

**2. Prompts de delegação com os quatro elementos completos (Lição 4).** Os três prompts — roteador, worker de billing, worker de bug — escreveram cada um as quatro seções completas de objetivo, formato de saída, orientação de ferramentas e limites da tarefa, uma linha cada, e podem ser comparados linha a linha[^S2].

**3. O pool de concorrência tem teto, e a fusão repassa referências e não cargas (Lição 3).** O `limit` de `runPool` é teto rígido, e a diferença de tempo entre `POOL_SIZE=1` e `POOL_SIZE=2` já foi verificada. De `merge` em diante repassa-se adiante `{id, category, handler, file, oneLine}`, o texto completo fica em `out/`, e o nó de revisão o lê de volta do arquivo por conta própria[^S2]. **Diferença declarada**: o pool da Lição 3 era “a mesma leva de subtarefas rodando em paralelo”, aqui o pool abrange três tipos de tratador — dois workers de modelo mais um template de código puro, cuja entrada no pool custa quase nenhum tempo. A semântica do pool não mudou (a contagem de tarefas em voo não excede o teto), apenas as tarefas em si são heterogêneas. Também uma coisa que a Lição 3 estabeleceu e aqui foi omitida por brevidade do script: a Lição 3 exigia `try/catch` separado por pista, para que a falha de uma pista não derrubasse o lote inteiro, e `runPool` não tem esse envoltório — o custo é que, na fase de fan-out, se qualquer pista lançar, a leva inteira de rascunhos não será persistida. Antes de conectar a API real isso precisa ser acrescentado, pois timeout de pista única em rede real é normal.

**4. Gate antes do avaliador, e condições de parada do loop batem com a Lição 5.** O primeiro filtro é código determinístico, não modelo; esta lição não instalou a camada de avaliador LLM, porque os critérios de aceitação desta leva de chamados por acaso são expressáveis como regras, e instalá-la seria dinheiro desperdiçado — o julgamento em camadas do Curso 10 segue esta ordem: o que é julgável deterministicamente primeiro, e o que sobra consulta o avaliador. As condições de parada do loop são três: passou, nenhum progresso adicional, atingiu o máximo de rodadas[^S5][^S1], e os conceitos correspondem um a um aos da Lição 5. **Mas nomes de campo e de valores mudaram**: a Lição 5 aterrissava no campo `reason`, com valores `passed`/`no-progress`/`max-rounds`; aqui aterrissa no campo `stop`, com valores `gate_pass`/`no_progress`/`max_rounds` (o critério trocou de avaliador para gate, e o hífen também virou sublinhado conforme a convenção snake_case desta lição); além disso, o `rounds` da Lição 5 conta vezes de geração, com o rascunho contando como rodada 1, enquanto o `gate_rounds` desta lição conta vezes de reescrita, com o rascunho sendo rodada 0 — então, para o mesmo chamado, os pontos de partida da contagem de rodadas das duas lições diferem em um. **Diferença declarada**: o código tem uma quarta saída, `no_rewriter` (template de código puro não tem worker para devolver). Isso não é um padrão que a Lição 5 omitiu, é a situação específica deste grafo — o loop da Lição 5 pressupunha “o produtor é um modelo”, e aqui uma categoria de produtores é template. Esta execução não caiu nesse ramo.

**5. A expressão “grafo” bate com a declaração da Lição 5.** “Grafo” e “nó” no texto inteiro são metáfora de engenharia própria desta lição, a Lição 5 já declarou isso explicitamente ao introduzir o sistema visual, e não é conceito oficial de nenhum material primário; a âncora primária em que pode se apoiar é apenas aquela: o próprio script do fluxo de trabalho guarda o loop, as ramificações e os resultados intermediários[^S5]. Esta lição não acrescentou terminologia nova — “máquina de estados” e “objeto de estado passado entre nós” não foram usados; a “aresta” definida pela Lição 5 (de quem a saída alimenta quem) apareceu apenas uma vez, ao explicar o fluxo de dados `merge → review`, e não é vocabulário novo. `routed` / `drafts` / `items` são apenas três variáveis locais comuns.

**6. A escrita atômica de `run-state.json` bate com o Curso 9.** Grava `.tmp` primeiro, depois troca com `renameSync`, sem faltar uma etapa. O momento da escrita também segue o calibre daquele curso: persistir uma vez após cada etapa pequena concluir, não uma vez após a execução inteira concluir.

**7. O calibre de observabilidade tem a mesma forma do Curso 11, mas granularidade mais grossa.** Um evento JSON por linha, cada um carregando `ts` e `run_id`, grepável depois. **Quatro diferenças**: (a) o logger do Curso 11 registra resumo de conteúdo (forma, comprimento, primeiros caracteres), e esta lição registra apenas id, categoria, nome de arquivo, string de relatório e contagens, sem registrar o texto completo da resposta — o texto completo já está em `out/`; (b) o campo de associação que o Curso 11 chama de `trace_id` aqui se chama `run_id`; (c) o núcleo daquele curso é usar `span_id`/`parent_id` para encadear uma árvore de rastro, e este grafo, embora tenha aninhamento de três camadas nó→worker→ferramenta, não implementou o vínculo pai-filho, então não há árvore de rastro; (d) `initLog()` limpa `run.jsonl` a cada execução, mantendo apenas a mais recente, e para fazer a comparação entre execuções do Curso 11 (`v-good` contra `v-bug`) é preciso mudar para anexar em arquivos separados por `run_id`. Para conectar este grafo a um sistema de rastro real, os campos de span do Curso 11 precisam ser acrescentados seguindo aquele padrão.

**8. O padrão orquestrador-workers, esta lição intencionalmente não implementou (Lição 4).** No orquestrador-workers da Lição 4, a chave é “quantos despachar, o que cada um faz” ser decidido pelo modelo observando a entrada na hora; este grafo não é assim — como os seis chamados se classificam e para qual worker cada categoria vai foram travados em `CATEGORIES` e em três prompts constantes antes de escrever a primeira linha de código. Esta é precisamente a aplicação direta do “se pode predefinir, não torne dinâmico” da Lição 4: a forma deste trabalho é conhecida, e a autoridade de decisão não deveria voltar ao modelo. Então, estritamente falando, foram soldados neste arquivo quatro padrões (encadeamento, roteamento, paralelização-seccionamento, loop de revisão), a votação complementa o quinto no exercício de Nível 2, e o orquestrador-workers é o que a natureza desta leva de tarefas barra.

## Limites

Este grafo administra algo pequeno: um processo, uma leva de chamados, roda e sai. Vale a pena construí-lo porque as cinco etapas “chegam chamados → classificar → tratar por categoria → verificar → reportar” foram travados antes de escrever a primeira linha de código. Se a tarefa virar “descubra o que este cliente de fato enfrentou nos últimos seis meses, e quantas etapas são necessárias você mesmo julga”, então este grafo é a arquitetura errada — esse tipo de problema em aberto, em que você não consegue prever as etapas de antemão nem fixar um caminho no código, pertence intrinsecamente a um loop autônomo[^S1].

Vários limites, declarados explicitamente:

**O fan-out é síncrono, e vai doer em escala.** O pool em `fanoutNode` precisa esperar o lote inteiro concluir antes de entrar em `merge`. Esse é precisamente o gargalo que aquele sistema real em produção reconheceu: a execução síncrona simplifica a coordenação, mas cria gargalos no fluxo de informação — um subagente demorando demais e o sistema inteiro fica travado esperando[^S2]. Seis chamados, cada um com no máximo duas chamadas, e esse gargalo não dói nada; seiscentos chamados, cada um com dez chamadas, e ele vira “o mais lento determina o tempo de relógio do lote inteiro”. Se mudar para assíncrono, é preciso calcular o custo: o assíncrono deixa os agentes trabalharem concorrentemente e criarem novos sob demanda, mas acrescenta dificuldade em coordenação de resultados, consistência de estado e propagação de erros entre subagentes[^S2] — esses três não existem na versão síncrona, porque a ordem é determinada pelo código.

**As duas regras do loop de revisão são rasas e frágeis.** `includes("aguarde um momento")` vai marcar erradamente frases como “não é preciso aguarde um momento algum, já resolvemos” como enrolação. Esse é o velho problema advertido pelo Curso 10: validadores determinísticos rígidos demais julgam o correto como incorreto. Para produção real, essas duas regras precisam ser calibradas contra uma pequena leva de respostas reais, ou rebaixadas para “sinalizar para rerrevisão do avaliador” em vez de devolver diretamente para reescrita.

**Ao trocar para a API real, troque apenas o stub, a estrutura não se mexe.** `makeStubClient(queue)` vira `new Anthropic()`, apaga-se a tabela `SCRIPTS` inteira, e o resto não muda uma linha — `runAgent` sempre foi escrito para a forma `stop_reason` / `tool_use` / `tool_result` da API real, e `model` e `max_tokens` sempre foram carregados. Depois da troca, três coisas vão mudar: o resultado da classificação vai oscilar (os mesmos chamados, duas execuções podem cair em categorias diferentes), as rodadas de gate vão oscilar, a contagem de tokens vai oscilar; uma execução custa dinheiro e tempo; e as três válvulas não mudadas do Curso 7 precisam ser reinstaladas.

**Cada camada de complexidade acrescentada precisa passar pelo portão do “melhora mensurável”.** Cada padrão deste grafo pode ser removido individualmente: sem roteamento, um prompt genérico também responde chamados; sem fan-out, rodar os seis em série também termina; sem loop de revisão, conferência manual por amostragem também é um método. Se as métricas caem após a remoção, e quanto caem, só testando para saber. Só quando a complexidade genuinamente melhora os resultados é que vale a pena acrescentá-la[^S1].

## 💻 Exercícios

<!-- exercises -->

### Nível 1: Ler o diagrama — o que de fato aconteceu no loop

Abaixo está a tabela-resumo de uma execução completa deste grafo, mais os registros de dois chamados em `run-state.json` (resultados de execução real; os milissegundos e o `run_id` mudam a cada vez):

```text
=== Resumo da execução do grafo ===
Nó       Tempo   Chamadas    Tokens   Rodadas     Status
route     62ms    1           720      -           ok
fanout    244ms   8           8903     -           ok
merge     2ms     0           0        -           ok
review    129ms   2           3033     2           ok

=== Detalhamento por chamado ===
Chamado  Categoria Tratador          Rodadas     Motivo parada   Status
T-1001   billing   worker:billing    0           gate_pass       pass
T-1002   bug       worker:bug        0           gate_pass       pass
T-1003   other     template          0           gate_pass       pass
T-1004   billing   worker:billing    1           no_progress     needs_human
T-1005   bug       worker:bug        1           gate_pass       pass
T-1006   other     template          0           gate_pass       pass
```

```json
"T-1004": {
  "category": "billing",
  "handler": "worker:billing",
  "file": "out/T-1004.txt",
  "one_line": "Chamado T-1004: altera…",
  "gate_rounds": 1,
  "gate_reports": ["filler_word:aguarde um momento", "filler_word:aguarde um momento"],
  "stop": "no_progress",
  "status": "needs_human"
},
"T-1005": {
  "category": "bug",
  "handler": "worker:bug",
  "file": "out/T-1005.txt",
  "one_line": "Chamado T-1005: esse é…",
  "gate_rounds": 1,
  "gate_reports": ["missing_ticket_id"],
  "stop": "gate_pass",
  "status": "pass"
}
```

Sem escrever código, responda três perguntas: (1) Quais dos seis chamados entraram no loop de revisão, cada um girou quantas rodadas, e de qual campo você leu isso? (2) Os `gate_rounds` de T-1004 e T-1005 são ambos 1; por que um dá `pass` e o outro `needs_human`? A evidência está em qual campo, e como se lê? (3) Suponha que o processo seja morto logo depois de o fan-out concluir e antes de a revisão começar: o que `run-state.json` consegue preservar, o que se perde? Depois de reiniciar, de qual etapa dá para retomar?

<!-- rubric -->
- (1) T-1004 e T-1005 entraram no loop, cada um girou 1 rodada; a base é a coluna `Rodadas` da tabela por chamado ser diferente de zero, ou o `gate_rounds` de `run-state.json` ser maior que 0; os outros quatro são 0, o que significa que o rascunho passou no gate de primeira. As 2 rodadas da linha `review` da tabela-resumo são a soma de 1 rodada de cada um desses dois
- (2) A linha divisória é `gate_reports`, não `gate_rounds`: T-1005 tem apenas um relatório, `missing_ticket_id`, o que significa que, após a reescrita, a segunda versão passou na verificação e não produziu um segundo relatório, então `stop` é `gate_pass`; T-1004 tem duas entradas de conteúdo idêntico, `filler_word:aguarde um momento`, o que significa que, após a reescrita, o relatório do gate não mudou nada, disparando “duas rodadas seguidas com relatório idêntico julgado sem progresso adicional”, então `stop` é `no_progress` e `status` é `needs_human`. É preciso apontar que `gate_rounds` conta vezes de reescrita e `gate_reports` registra cada relatório reprovado (incluindo o último), e que os dois não são equivalentes
- (3) Preservado: `nodes` tem o tempo e o uso dos três nós `route` / `fanout` / `merge`; a `category`, o `handler`, o `file` e a `one_line` dos seis chamados; e os seis arquivos de rascunho já persistidos em `out/`. Perdido: o veredito da revisão, com todos os chamados parados em `status: "drafted"`, `stop: null`, `gate_reports: []`. Depois de reiniciar dá para ler os rascunhos de volta de `out/` e começar direto pelo nó de revisão, sem precisar reexecutar route e fan-out — porque o estado é persistido uma vez após cada nó concluir, não uma vez após a execução inteira concluir
- Explicar o significado desse “rastro incremental”: registrar incrementalmente o resultado de cada etapa durante a execução é precisamente a premissa para uma execução ser recuperável; e isso se combina com a escrita atômica “grava .tmp e depois rename” do Curso 9 — morto naquele instante, no disco está ou o estado completo anterior ou o novo estado completo

<!-- answer -->
(1) Entraram no loop T-1004 e T-1005, cada um girando 1 rodada. O campo mais direto é a coluna `Rodadas` da tabela por chamado (em `run-state.json` corresponde a `gate_rounds`): esses dois são 1, os outros quatro são 0. O 0 significa que o rascunho passou no gate na primeira verificação, sem o worker ser chamado de volta nenhuma vez. Aquele 2 na linha `review` da tabela-resumo é a soma de 1 rodada de cada um desses dois, não algum deles tendo girado duas rodadas.

(2) Olhando só para `gate_rounds` de fato não dá para distinguir sucesso de fracasso — ele conta “quantas vezes o worker foi chamado de volta para reescrever”, e se o resultado da reescrita foi bom ou ruim, não lhe interessa. A evidência real é `gate_reports`, que registra cada relatório reprovado, incluindo o último, que fez o loop parar. O array de T-1005 tem apenas uma entrada, `missing_ticket_id`: o rascunho estava sem o id do chamado e foi devolvido; a segunda versão reescrita o acrescentou, o gate passou, e não se produziu outro relatório, então `stop` é registrado como `gate_pass` e `status` é `pass`. O array de T-1004 tem duas entradas, e as strings são idênticas, ambas `filler_word:aguarde um momento`: o rascunho escreveu “aguarde um momento” e foi devolvido; o worker reescreveu uma versão — a frase mudou, ficou mais longa, explicou mais — mas aquela expressão continuou lá, e o relatório devolvido pelo gate ficou caractere por caractere igual ao da rodada anterior. O critério do loop é “o relatório desta rodada igual ao da anterior significa nenhum progresso adicional”, então ele não gastou as duas rodadas restantes de orçamento, parou direto, marcou `needs_human` e registrou `no_progress` em `stop`. Numa frase: `gate_rounds` conta vezes de reescrita, `gate_reports` reflete se cada reescrita produziu um resultado diferente.

(3) A parte preservada não é pouca. `nodes` já tem as três contas completas de `route`, `fanout` e `merge` (tempo, contagem de chamadas de modelo, tokens); os seis chamados têm cada um `category`, `handler`, `file` e `one_line`; e os seis arquivos de rascunho do diretório `out/` estão todos gravados e persistidos. Perde-se apenas o trecho de revisão — todos os chamados param em `status: "drafted"`, `stop: null`, `gate_reports` como array vazio, e quem deve reescrever e quem deve ser repassado ainda não foi julgado. Por isso, depois de reiniciar dá para pular completamente route e fan-out (os produtos dessas duas etapas estão todos no disco), ler os seis rascunhos de volta de `out/` e entrar direto no nó de revisão. Isso é possível graças ao momento da escrita do estado: persistir uma vez após cada nó concluir e, dentro da revisão, persistir de novo após cada chamado julgado, em vez de esperar a execução inteira concluir para gravar. Registrar incrementalmente o resultado de cada etapa é precisamente a premissa para uma execução ser retomável dentro da mesma sessão; estender o estado até o disco, nesta lição, é uma elevação de um degrau acrescentada por nós; combine isso com a troca atômica “grava `.tmp` e depois `rename`” e, morto em qualquer momento, no disco estará um ou outro estado completo, sem deixar meio JSON que você nem consegue ler de volta.

<!-- hint -->
Primeiro distinga o que cada um dos dois campos conta: um conta “quantas vezes o worker foi chamado de volta”, o outro registra “o que cada relatório de verificação disse”. O primeiro número dos dois chamados é igual, e o comprimento e o conteúdo do segundo campo são diferentes — a diferença se esconde aí.

<!-- hint -->
Na terceira pergunta não raciocine: olhe diretamente para o `run-state.json` colado daquela execução com `STOP_AFTER=merge` — quais chaves têm valores, quais campos de chamado ainda estão com valores iniciais (`stop` em `null`, `gate_reports` em `[]`, `status` em `drafted`); os que têm valores foram preservados, os que ainda estão com valores iniciais foram perdidos.

### Nível 2: Acrescentar um nó de votação ao grafo

A categoria `other` tem um chamado de tom difícil de calibrar — T-1006: “Uso há três meses, relatei problemas várias vezes e nunca tive retorno. Esse produto ainda tem alguém dando manutenção?” Um template fixo respondendo a isso é, muito provavelmente, inadequado: frio demais parece descaso, caloroso demais arrisca prometer demais.

Acrescente um nó de votação a este grafo: mesmo chamado, mesma tarefa, rodada uma vez a partir de dois ângulos[^S1], e depois use código puro para comparar as duas versões e levar a superior para a fusão. As regras de comparação são apenas duas, e nenhuma pode perguntar ao modelo: primeiro use as regras determinísticas do gate para eliminar (tem palavra proibida ou está sem o id do chamado, sai direto), e entre as sobreviventes escolha a mais curta (respostas a clientes não devem se estender).

Requisitos: os prompts dos dois ângulos precisam ter todos os quatro elementos; as duas chamadas precisam passar honestamente por `runAgent` (ou seja, passar pelo loop completo), com os stubs dando a cada uma sua fila de respostas; o processo de seleção precisa deixar rastro no terminal e em `run.jsonl`, para as pessoas saberem por que aquela versão foi escolhida. Depois de escrever, rode de verdade uma vez e cole a saída. Responda também uma pergunta: por que usar comparação em código puro aqui, em vez de chamar um modelo para julgar qual versão é melhor?

<!-- rubric -->
- Os dois ângulos são pontos de entrada diferentes para a mesma tarefa (por exemplo, “acolher a emoção primeiro” contra “apenas os fatos”), não a divisão da tarefa ao meio — isto é votação, não seccionamento
- As duas chamadas passam pelo loop completo de `runAgent`, cada uma com uma fila de respostas de stub; a contagem de chamadas de modelo e os tokens mostram o aumento correspondente na tabela-resumo (2 chamadas a mais em relação à versão base)
- Os prompts dos dois ângulos escrevem os quatro elementos completos: objetivo, formato de saída, orientação de ferramentas, limites da tarefa
- A seleção é código puro: primeiro roda `gateCheck` para eliminar, depois escolhe a mais curta por comprimento entre as candidatas aprovadas; a ordem das duas regras está escrita com clareza, e é possível dizer qual regra foi decisiva desta vez
- Rastro: o terminal tem uma linha mostrando o veredito e o comprimento de cada candidata, mais quem foi escolhida ao final; `run.jsonl` tem o evento estruturado correspondente
- Os dois ângulos rodam em série, ou se declara explicitamente por que rodar concorrente também não quebra o teto do pool — não se pode abrir escondido outra camada de concorrência dentro do pool, fazendo a concorrência total virar `POOL_SIZE × 2`
- Declara com clareza o motivo de código puro em vez de avaliador: essas duas regras (palavra proibida, comprimento) são intrinsecamente julgáveis de forma determinística, a mesma entrada dá sempre o mesmo resultado, não custa uma chamada, não introduz nova não determinação; o avaliador LLM deve ser reservado para “o tom é apropriado”, esse tipo de julgamento que não se escreve como regra, e deve vir depois da verificação determinística

<!-- answer -->
As mudanças se concentram em quatro lugares: uma constante, duas filas de respostas de stub, dois prompts de ângulo, mais um ramo acrescentado em `fanoutNode` e duas funções. O resto do código não se move uma linha.

Primeiro lugar, marcar quais chamados precisam de votação:

```javascript
const CATEGORIES = ["billing", "bug", "other"];
const VOTE_TICKETS = new Set(["T-1006"]); // Chamados de tom difícil de calibrar, que valem rodar dois ângulos
```

Segundo lugar, os stubs ganham duas filas de respostas (em `SCRIPTS`, depois de `T-1005#2`):

```javascript
  // Votação: mesmo chamado, dois ângulos rodados uma vez cada.
  "T-1006@warm#1": [
    turn(
      "end_turn",
      [
        say(
          "Chamado T-1006: primeiro, peço desculpas — seus relatos anteriores não tiveram um retorno claro, e isso é falha do nosso acompanhamento. " +
            "Reuni novamente os chamados que você abriu nesses três meses e os encaminhei aos colegas responsáveis; resolveremos em breve, e o andamento fica registrado neste chamado. " +
            "O produto continua recebendo manutenção, e as atualizações da versão mais recente podem ser conferidas no “Registro de Atualizações” da central de ajuda."
        ),
      ],
      812,
      164
    ),
  ],
  "T-1006@plain#1": [
    turn(
      "end_turn",
      [
        say(
          "Chamado T-1006: o produto continua recebendo manutenção, e as atualizações da versão mais recente estão no “Registro de Atualizações” da central de ajuda. " +
            "Seus relatos anteriores não tiveram retorno, o que é falha do nosso acompanhamento; já os reuni e encaminhei aos colegas responsáveis, e o andamento fica registrado neste chamado."
        ),
      ],
      806,
      142
    ),
  ],
```

Terceiro lugar, os dois prompts de ângulo (antes de `otherTemplate`), com os quatro elementos completos:

```javascript
// Dois ângulos para a votação: tarefa igual, ponto de entrada diferente (Votação, Lição 3)
const ANGLE_PROMPTS = {
  warm: [
    "Você é especialista em chamados de clientes, tratando um chamado por vez; esta versão adota o ângulo de “acolher a emoção primeiro”.",
    "Objetivo: Primeiro reconhecer a falha de acompanhamento e depois responder com clareza à pergunta real do usuário, se ainda há manutenção.",
    "Formato de saída: Parágrafo em texto puro, começando com “Chamado <id_do_chamado>:”, primeiro o pedido de desculpas e o que já foi feito, depois o estado do produto; sem listas com marcadores.",
    "Orientação de ferramentas: Este passo não lhe dá ferramentas de sistema, use apenas fatos do texto original do chamado, não afirme ter conferido a contagem exata do histórico de chamados.",
    "Limites da tarefa: Não prometa datas específicas de correção, não conceda compensações, não avalie colegas; não escreva enrolação como “aguarde um momento”, “agradecemos a paciência” ou “resolveremos em breve”.",
  ].join("\n"),
  plain: [
    "Você é especialista em chamados de clientes, tratando um chamado por vez; esta versão adota o ângulo de “apenas os fatos”.",
    "Objetivo: Responder diretamente se o produto ainda recebe manutenção e depois informar quem dá seguimento a esses relatos.",
    "Formato de saída: Parágrafo em texto puro, começando com “Chamado <id_do_chamado>:”, a primeira frase dá a conclusão e em seguida vem o próximo passo; sem listas com marcadores, sem texto padrão de desculpas.",
    "Orientação de ferramentas: Este passo não lhe dá ferramentas de sistema, use apenas fatos do texto original do chamado, não invente números de versão.",
    "Limites da tarefa: Não prometa datas específicas de correção, não conceda compensações, não avalie colegas; não escreva enrolação como “aguarde um momento”, “agradecemos a paciência” ou “resolveremos em breve”.",
  ].join("\n"),
};
```

Quarto lugar, duas funções novas (antes de `fanoutNode`):

```javascript
async function callAngle(ticket, angle) {
  const key = `${ticket.id}@${angle}#1`;
  const queue = SCRIPTS[key];
  if (!queue) throw new Error(`Roteiro de stub ausente: ${key}`);
  const { client, meter } = metered(makeStubClient(queue));
  const input = `Id do chamado ${ticket.id}\nTexto original do usuário: ${ticket.text}`;
  const text = await runAgent(client, ANGLE_PROMPTS[angle], input, [], {}); // Os dois prompts de ângulo dizem “sem ferramentas de sistema”, então aqui é obrigatório passar tools vazio, na mesma forma do routeNode
  log({ node: "fanout", event: "vote_candidate", ticket: ticket.id, angle, chars: text.length, calls: meter.calls, tokens: meter.tokens });
  return { angle, text, calls: meter.calls, tokens: meter.tokens };
}

// Seleção em código puro: primeiro elimina com as regras determinísticas do gate, depois escolhe a mais curta entre as sobreviventes
function pickBest(ticketId, candidates) {
  const scored = candidates.map((c) => ({ ...c, gate: gateCheck(ticketId, c.text) }));
  const alive = scored.filter((c) => c.gate.pass);
  const pool = alive.length > 0 ? alive : scored; // Se todas forem eliminadas, mantém todas e deixa o nó de revisão julgar
  const winner = pool.reduce((a, b) => (b.text.length < a.text.length ? b : a));
  return { winner, scored, allFailed: alive.length === 0 };
}
```

E o callback do pool de `fanoutNode` ganha um ramo na frente (o ramo do template `other` fica como estava, e T-1003 continua indo por ele):

```javascript
  const drafts = await runPool(routed, POOL_SIZE, async (ticket) => {
    if (VOTE_TICKETS.has(ticket.id)) {
      // Os dois ângulos rodam em série: o teto de concorrência é unificado pelo pool, não abra concorrência escondida dentro do pool
      const candidates = [];
      for (const angle of ["warm", "plain"]) {
        const c = await callAngle(ticket, angle);
        calls += c.calls;
        tokens += c.tokens;
        candidates.push(c);
      }
      const { winner, scored } = pickBest(ticket.id, candidates);
      log({
        node: "fanout",
        event: "vote_pick",
        ticket: ticket.id,
        winner: winner.angle,
        detail: scored.map((c) => `${c.angle}/${c.gate.pass ? "ok" : c.gate.report}/${c.text.length}chars`).join(" | "),
      });
      console.log(
        `[vote] ${ticket.id} ` +
          scored.map((c) => `${c.angle}=${c.gate.pass ? "ok" : c.gate.report}(${c.text.length}chars)`).join("  ") +
          `  → escolhe ${winner.angle}`
      );
      return { ticket, handler: `vote:${winner.angle}`, text: winner.text };
    }
```

Resultado da execução real:

```text
\$ node orchestrate.mjs
inbox/ recebeu 6 chamados: T-1001, T-1002, T-1003, T-1004, T-1005, T-1006
[route] T-1001=billing  T-1002=bug  T-1003=other  T-1004=billing  T-1005=bug  T-1006=other
[vote] T-1006 warm=filler_word:resolveremos em breve(461chars)  plain=ok(334chars)  → escolhe plain
[fanout] teto de concorrência 2, 6 rascunhos produzidos
[merge] gravou 6 arquivos em out/, repassando adiante só referências e resumos de uma linha
[review] reescritas do gate: 2 rodadas no total

=== Resumo da execução do grafo ===
Nó       Tempo   Chamadas    Tokens   Rodadas     Status
route     61ms    1           720      -           ok
fanout    370ms   10          10827    -           ok
merge     1ms     0           0        -           ok
review    130ms   2           3033     2           ok

=== Detalhamento por chamado ===
Chamado  Categoria Tratador          Rodadas     Motivo parada   Status
T-1001   billing   worker:billing    0           gate_pass       pass
T-1002   bug       worker:bug        0           gate_pass       pass
T-1003   other     template          0           gate_pass       pass
T-1004   billing   worker:billing    1           no_progress     needs_human
T-1005   bug       worker:bug        1           gate_pass       pass
T-1006   other     vote:plain        0           gate_pass       pass

Diretório de saída out/: 6 respostas; precisam de repasse humano: 1 chamado
  - T-1004 (no_progress): Chamado T-1004: altera…
Rastro: run-state.json / run.jsonl (run_id=run-mtem8ys3)
```

Comparando com a versão base: as chamadas de modelo de `fanout` subiram de 8 para 10, os tokens subiram de 8903 para 10827, o tempo subiu de 244ms para 370ms — este é o preço da votação, o trabalho do mesmo chamado feito duas vezes. Na tabela por chamado, o tratador de T-1006 passou de `template` para `vote:plain`.

Desta vez a primeira regra decidiu a vitória: a versão `warm` tem “resolveremos em breve”, bateu na palavra proibida e saiu direto, e a regra de comprimento nem chegou a ter a vez. Para ver a regra de comprimento funcionar, mude no stub, em `T-1006@warm#1`, o trecho “os encaminhei aos colegas responsáveis; resolveremos em breve, e o andamento fica registrado neste chamado” para “os encaminhei aos colegas responsáveis, e o andamento fica registrado neste chamado” e rode de novo; a saída real é:

```text
[vote] T-1006 warm=ok(438chars)  plain=ok(334chars)  → escolhe plain
```

As duas versões passaram na verificação determinística, então pela segunda regra escolhe-se a versão mais curta, e `plain` vence com 334 caracteres contra 438.

**Por que usar comparação em código puro, em vez de chamar um modelo para julgar?** Porque essas duas regras são intrinsecamente julgáveis de forma determinística. “Tem ou não palavra proibida”, “qual versão é mais curta” — para essas perguntas, uma linha de operação de string dá a resposta, o mesmo resultado sempre para a mesma entrada, sem custar uma chamada, sem acrescentar uma espera de rede, e também sem introduzir nova não determinação; o julgamento em camadas do Curso 10 diz exatamente esta ordem: o que é julgável deterministicamente primeiro, e o que sobra é a vez do avaliador. Inversamente, se o critério de comparação virar “qual versão tem o tom que deixa a pessoa mais disposta a continuar a conversa”, isso de fato não se escreve como regra e deveria consultar um avaliador; mas, mesmo então, o avaliador deveria vir depois dessas duas regras determinísticas — primeiro elimine as candidatas obviamente desqualificadas, e depois gaste dinheiro para julgar o que sobrou.

A propósito, uma armadilha fácil de pisar: os dois ângulos rodam em série. Se, por comodidade, você escrever como `Promise.all`, as chamadas de modelo simultaneamente em voo no pool viram `POOL_SIZE × 2`, e o teto de 2 que você imaginava na verdade é 4. Ou em série como aqui, ou trate as candidatas da votação também como tarefas do pool e entregue ao mesmo escalonamento — de todo modo, o teto só pode ter um lugar dando as cartas.

<!-- hint -->
Primeiro pense com clareza na diferença entre votação e seccionamento: seccionamento é dividir uma coisa em pedaços, com cada pedaço fazendo só uma parte; votação é a mesma coisa inteira feita duas vezes, apenas com pontos de entrada diferentes, e no fim é obrigatório escolher uma. Então, nos prompts dos dois ângulos, a linha de “objetivo” deve dizer a mesma coisa, e a diferença está em como entrar, no que se diz primeiro.

<!-- hint -->
Para a seleção não escreva outro conjunto de regras — `gateCheck` já está lá, tome-o diretamente como primeira peneira, rode uma vez em cada uma das duas candidatas e veja de quem o `pass` é `true`. O trabalho restante é só aquela frase de “entre as sobreviventes escolha a mais curta”, um `reduce`. Rode de verdade uma vez e veja, naquela linha `[vote]` do terminal, o estado de cada candidata; aí você sabe qual regra atuou desta vez.

<!-- /exercises -->

## Recapitulação

- Quatro padrões soldados em um arquivo (a votação complementa o quinto no exercício, e o orquestrador-workers está intencionalmente ausente porque o despacho pode ser predefinido), e a afirmação “plano no código” ganha forma concreta: a dúzia de linhas de `main()` é todo o fluxo de controle, e as três variáveis comuns `routed` / `drafts` / `items` são todo o estado. LLMs e ferramentas são orquestrados através de caminhos de código predefinidos[^S1], e o próprio script guarda o loop, as ramificações e os resultados intermediários, enquanto o contexto do modelo guarda apenas o que ele precisa para esta etapa[^S5]
- Nem todo nó precisa ser um modelo: dos cinco nós, dois chamam modelos, enquanto `merge`, `report` e o primeiro filtro do gate são todos código puro, e a categoria `other` vai por template de string. Onde código determinístico consegue dar a mesma resposta, não há motivo para pagar o dinheiro e a latência de uma chamada
- O valor do roteamento não está naquela chamada, mas nas dez linhas de código de aperto depois dela: o texto livre do modelo é prensado em um de três rótulos legais, e os ramos a jusante só reconhecem valores que o código examinou; prompts especializados são o dividendo que a classificação comprou[^S1]
- A concorrência do fan-out precisa ter teto, e a fusão precisa repassar referências e não cargas — a saída vai para o disco, e adiante seguem apenas referências leves[^S2], com o nó de revisão lendo de volta do arquivo por conta própria. O fan-out síncrono não dói nesta escala, mas em escala grande vira gargalo[^S2], e mudar para assíncrono exige pagar três custos: coordenação de resultados, consistência de estado, propagação de erros entre subagentes[^S2]
- O loop de revisão é verificar-corrigir-reverificar, até passar ou não haver progresso adicional[^S5], mais uma rede de segurança de máximo de rodadas[^S1]. O gate determinístico vem antes do avaliador; o critério “duas rodadas seguidas com relatório idêntico” corta as perdas mais cedo do que o máximo de rodadas, e a conclusão que dá é mais informativa: não “tentei três vezes e falha”, mas “ele não entende este feedback”
- O rastro incremental traz recuperabilidade: persistir uma vez após cada nó concluir é precisamente a premissa para uma execução ser continuável dentro da mesma sessão[^S5] (continuar entre processos ou entre máquinas é uma elevação de um degrau própria desta lição, depois de persistir o estado em disco); combine com a troca atômica de gravar `.tmp` e depois `rename` e, morto em qualquer momento, o disco tem um estado completo legível de volta
- Este grafo administra um processo, uma leva de chamados, trabalho de etapas travadas. Problemas em aberto com etapas imprevisíveis devem voltar a loops autônomos[^S1]; cada camada de complexidade acrescentada precisa passar pelo portão do “melhora mensurável”[^S1]

Doze lições completas aqui.

Olhando para trás, o que você tem agora veio peça por peça: no Curso 1 (Claude Code Skills: crie seus próprios fluxos de trabalho com IA) você escreveu seu primeiro prompt e aprendeu a enunciar requisitos com clareza; depois vieram chamada de ferramentas, fluxos de trabalho, skills, colaboração multiagente, até o Curso 7 — aquele curso fez você escrever um loop por conta própria, `while (response.stop_reason === "tool_use")`, e a partir daquele dia agentes deixaram de ser uma caixa-preta para você e viraram um pedaço de código que você consegue ler. O Curso 8 (Context Engineering: gastando a atenção finita onde ela conta) ensinou você a administrar o contexto dele, para o loop não girar até a janela estourar. O Curso 9 ensinou você a fazê-lo sobreviver a interrupções, retomando de onde parou quando morto. O Curso 10 ensinou você a verificar a saída dele, separando “parece pronto” de “pronto”. O Curso 11 ensinou você a enxergar o processo dele, para que, quando as coisas quebram, haja logs e rastros para consultar. Este curso ensinou você a compor múltiplos loops em um grafo que guarda o próprio plano.

Essas seis coisas são seis facetas de uma só: **em código que você escreveu, você está controlando uma coisa não determinística.** O loop é a sua escrita, o contexto é a sua administração, os checkpoints são os seus salvamentos, os critérios de aceitação são a sua definição, os logs são o seu print, o plano é o seu arranjo. O modelo é muito forte, mas ele trabalha dentro deste código de controle que você construiu.

A etapa final aterrissa em ação concreta: troque o `makeStubClient(queue)` de `orchestrate.mjs` por `new Anthropic()`, apague a tabela `SCRIPTS`, reinstale as três válvulas não mudadas do Curso 7, e então despeje em `inbox/` a leva real de tarefas empilhadas do seu trabalho — chamados reais, logs reais, pendências reais — e rode pela primeira vez. Provavelmente algumas vão cair em `needs_human`; é exatamente essa a cara que este grafo deve ter.
