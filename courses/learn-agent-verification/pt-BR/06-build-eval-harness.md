# Lição 6: Mão na massa: construa uma trilha de eval para o seu agente

> Objetivos de aprendizado:
> - Ligar conjuntos de avaliação, correção estratificada e loops de harness em um `eval-runner.mjs` executável — uma tarefa de eval por loop independente
> - Fazer os relatórios capturarem não só a taxa de aprovação, mas também duração por tarefa, número de chamadas de ferramenta, consumo de tokens e erros de ferramenta, e usar essas colunas para diagnosticar problemas
> - Usar esta trilha para medir o impacto real de uma mudança no system prompt e pegar um verificador estrito demais que reprova saídas corretas
>
> Pré-requisitos: Ter lido as lições 1–5 e ter à mão, rodando, o loop de harness do curso 7 | Anterior: [Lição 5 <<](./05-eval-sets.md)

As cinco primeiras lições foram todas componentes: verificar o estado final e não etapa por etapa (lição 2), verificações determinísticas primeiro e atenção a verificadores estritos demais (lição 3), texto livre só recebe juízes LLM (lição 4), conjuntos de avaliação começam com umas vinte tarefas reais (lição 5). Cada um faz sentido por conta própria, mas, depois de mudar o seu prompt, você ainda não tem aquela coisa única que você roda com um comando só para os números lhe dizerem “melhor ou pior”.

Esta lição solda os componentes. O que você recebe é um arquivo de trezentas linhas que roda em menos de dois segundos. A orientação oficial sobre “como rodar evals” é direta: use chamadas programáticas diretas à API do LLM; use loops agênticos simples — while-loops embrulhando chamadas de LLM e chamadas de ferramenta alternadas — **uma tarefa de eval por loop**[^S3]. Isso é exatamente o loop dirigido por `stop_reason` do curso 7 desta série. Você pode transplantá-lo como está.

## Como fica quando roda

Salve o `eval-runner.mjs` completo, mais adiante nesta lição, e depois `node eval-runner.mjs`:

```text
=== Relatório · Prompt v1 · Verificador normalizado (corrigido) ===
Tarefa            Correção        Resultado     Nota  Chamadas  Erros     Tokens    Duração
-------------------------------------------------------------------------------------------
t1-total          determinístico  pass          1.00         3      0      1,800      124ms
t2-pending        determinístico  pass          1.00         1      0        995       81ms
t3-no-orderid     determinístico  FAIL          0.00         2      1      1,550      123ms
t4-refund-note    juiz LLM        FAIL          0.67         1      0      1,432      124ms
t5-missing-order  determinístico  pass          1.00         1      1        966       83ms
-------------------------------------------------------------------------------------------
Taxa de aprovação 3/5 (60%) · Chamadas de ferramenta 8 · Erros de ferramenta 2 · Tokens 6,743 · Total 535ms

Casos reprovados:
  [t3-no-orderid] Critério: Com parâmetros incompletos, deve chamar zero ferramentas e pedir o número do pedido
  Resposta do agente: O pedido SO-1001 está com status concluído.
  [t4-refund-note] Critério: O valor bate com o pedido e o tom está adequado; mas falta o prazo de chegada do reembolso, e o cliente fica sem previsão. Falta 1 dos 3 itens.
  Resposta do agente: Olá, recebemos o cancelamento do pedido SO-1003 (valor ¥320.00). O reembolso será devolvido para a forma de pagamento original. Desculpe pelo transtorno.

=== Relatório · Prompt v2 · Verificador normalizado (corrigido) ===
Tarefa            Correção        Resultado     Nota  Chamadas  Erros     Tokens    Duração
-------------------------------------------------------------------------------------------
t1-total          determinístico  pass          1.00         3      0      1,800      123ms
t2-pending        determinístico  pass          1.00         1      0        995       83ms
t3-no-orderid     determinístico  pass          1.00         0      0        487       41ms
t4-refund-note    juiz LLM        pass          1.00         1      0      1,518      123ms
t5-missing-order  determinístico  pass          1.00         1      1        966       83ms
-------------------------------------------------------------------------------------------
Taxa de aprovação 5/5 (100%) · Chamadas de ferramenta 6 · Erros de ferramenta 1 · Tokens 5,766 · Total 453ms

=== Variação de nota v1 -> v2 ===
Tarefa                 v1     v2  Mudança
--------------------------------------------------
t1-total             1.00   1.00  estável
t2-pending           1.00   1.00  estável
t3-no-orderid        0.00   1.00  fail => pass
t4-refund-note       0.67   1.00  fail => pass
t5-missing-order     1.00   1.00  estável
--------------------------------------------------
Taxa de aprovação 3/5 -> 5/5
```

Isto não é um exemplo feito à mão — foi copiado literalmente de uma execução real num diretório temporário. Copie o código completo e rode uma vez; tudo, exceto a coluna “Duração” (tempo de relógio real, que varia com a carga da máquina), vai bater até o milissegundo. Os números são os mesmos porque o cliente stub devolve respostas fixas.

Esta saída contém tudo o que esta lição ensina: cinco tarefas rodando cada uma o seu próprio loop, dois modos de correção misturados numa tabela só, taxa de aprovação mais quatro colunas de diagnóstico, e a diferença entre duas versões condensada numa tabela de comparação. O resto desta lição desmonta isso.

## As cinco peças de uma trilha

1. **Sistema sob teste**: definições de ferramenta, implementações reais das ferramentas e os dados por trás delas. O eval roda “o agente usa as suas ferramentas para trabalhar” — as ferramentas fazem parte do que você está testando.
2. **Cliente stub**: um `messages.create` falso que devolve respostas fixas numa fila predefinida, tornando toda a trilha reprodutível.
3. **Conjunto de avaliação**: um array `tasks`, cada entrada é `{id, prompt, verify}`. Exigência oficial: cada prompt de eval deve vir emparelhado com uma resposta ou resultado verificável[^S3] — um prompt sem verificador não é uma tarefa de eval, é uma demo.
4. **Correção**: o que pode ser corrigido deterministicamente vai para uma função `verify`; texto livre vai para o juiz.
5. **Loop e relatório**: uma tarefa, um while-loop; ao terminar, agregue as métricas numa tabela.

Uma coisa para fixar primeiro: **as tarefas não compartilham `messages`**. O `messages` de cada tarefa começa apenas com o prompt de usuário daquela tarefa, roda o próprio loop e depois é descartado[^S3]. Por que isso importa tanto — o quiz do meio vai perguntar diretamente.

## Peça um: ferramentas e os dados por trás delas

O sistema sob teste é um assistente de pedidos, quatro pedidos, duas ferramentas: `search_orders` (busca por nome de cliente ou por status e devolve a lista de números de pedido) e `get_order` (consulta o detalhe de um pedido pelo número). Dois detalhes são deliberados: `search_orders` só devolve números de pedido, sem valores, forçando o agente a chamar `get_order` de novo para cada pedido — a coluna “Chamadas” do relatório vai expor essa falha de projeto. O outro: ela lança erro quando as duas condições de filtro estão vazias:

```javascript
search_orders({ customer, status }) {
  if (!customer && !status) {
    throw new Error("Parâmetros inválidos: informe pelo menos um entre customer e status");
  }
  // ...filtra pelas condições, devolve { order_ids: [...] }
}
```

Este é o erro de ferramenta de “parâmetro inválido”. A orientação oficial diz que esses erros se aglomerando normalmente significa que as descrições das ferramentas deveriam estar mais claras ou precisam de exemplos[^S3]. Vamos vê-lo no relatório daqui a pouco. Erros de ferramenta não são travamentos — o bloco de execução da ferramenta captura a exceção, embrulha num `tool_result` com `is_error: true`, devolve ao modelo e incrementa um contador. `tool_use` e `tool_result` se emparelham pelo `tool_use_id` — essa é a base assentada no curso 7; aqui só acrescentamos dois contadores.

## Peça dois: cliente stub e o interlúdio de verificação

É preciso pausar aqui, senão todos os números abaixo não se sustentam.

O Claude de verdade é não determinístico: o mesmo prompt rodado duas vezes pode seguir caminhos completamente diferentes[^S2]. Isso é bom em produção e desastroso numa lição de demonstração — você roda hoje e tira 3/5, amanhã 4/5, e não sabe dizer se a diferença veio da mudança de prompt ou do humor do modelo. Por isso as lições práticas dos cursos 8 e 9 usam todas o mesmo método: **trocar o modelo por um stub que devolve respostas fixas numa fila predefinida**, tornando o comportamento testado uma variável controlada. Isso verifica a lógica de controle que você escreveu, não o desempenho do modelo naquele dia.

```javascript
function stubClient(script, label) {
  if (!script) throw new Error(`[stub] Não há fila de respostas para ${label}`);
  let cursor = 0;
  return {
    messages: {
      async create() {
        if (cursor >= script.length) {
          throw new Error(`[stub] fila de respostas de ${label} esgotada (requisições emitidas: ${cursor})`);
        }
        const res = script[cursor++];
        await sleep(res.latency_ms);
        return res;
      },
    },
  };
}
```

Quando a fila esgota ele lança erro, sem resposta de fallback — se o loop girar uma vez a mais, você vê imediatamente `Error: [stub] fila de respostas de v1/t2-pending esgotada (requisições emitidas: 1)` (esse é o texto de erro real depois que apaguei a última resposta da fila do t2), e não um `end_turn` falso passando batido. Cada resposta carrega o próprio `latency_ms`; o stub de fato dorme esse tempo, para que a coluna “Duração” meça quantos turnos o loop levou. Cada tarefa recebe um cliente novo com o próprio script; os cursores não atravessam tarefas.

**A diferença entre as duas versões de prompt está fixada nas duas filas de respostas do stub.** Num cenário real você muda o system prompt e o comportamento do modelo acompanha; aqui eu não tenho modelo, então escrevi de antemão `SCRIPT_V1` e `SCRIPT_V2`, deixando a v2 devolver respostas diferentes em duas tarefas — “suponha que o prompt v2 faça efeito e o modelo responda assim” está codificado como dado:

```javascript
// v2 troca as respostas de apenas duas tarefas — a diferença entre versões está fixada aqui
const SCRIPT_V2 = {
  ...SCRIPT_V1,
  "t3-no-orderid": [
    finish("De qual pedido você está falando? Me envie o número do pedido (formato SO-1001).", [455, 32]),
  ],
  "t4-refund-note": [/* versão com o prazo de chegada acrescentado */],
};
```

Use a sintaxe de espalhamento para herdar da v1 e liste apenas as entradas que mudaram — quem lê o código vê o escopo da diferença de imediato. Esta trilha **verifica a própria trilha**: se os verificadores corrigem certo, se as métricas registram com precisão, se os relatórios calculam direito, se duas execuções podem ser comparadas. Quando você trocar por um cliente real, a trilha não muda — só os números começam a pular.

## Peça três: conjunto de avaliação — quatro comuns mais um caso extremo

A Lição 5 disse que conjuntos de avaliação devem espelhar a distribuição real e cobrir casos extremos[^S5]; a documentação oficial também alertou contra ambientes de sandbox simplistas demais, que não estressam as ferramentas com complexidade suficiente[^S3]. Aqui cabem apenas cinco tarefas por questão de espaço, mas a estrutura segue a de conjuntos de avaliação reais:

| Tarefa | O que testa | Correção |
| --- | --- | --- |
| `t1-total` | Agregação em várias etapas: buscar a lista e depois pegar o valor de cada uma | Determinística |
| `t2-pending` | Filtragem de conjunto: os números de pedido devem ser exatamente estes, nem mais nem menos | Determinística |
| `t3-no-orderid` | **Caso extremo**: o usuário não informou o número do pedido | Determinística |
| `t4-refund-note` | Texto livre: aviso de reembolso ao cliente | juiz LLM |
| `t5-missing-order` | Depois do erro de ferramenta, relatar com honestidade, não inventar dados | Determinística |

`t3-no-orderid` merece menção especial. O prompt é “Confere pra mim o status daquele pedido” — qual deles? Não foi especificado. O comportamento ideal é pedir o número do pedido em vez de chutar um e consultar. A documentação oficial é cuidadosa quanto a esse comportamento: se o prompt do usuário não fornece informação suficiente para preencher todos os parâmetros obrigatórios, o Claude Opus é muito mais propenso a reconhecer o parâmetro faltante e pedi-lo, mas esse comportamento não é garantido, especialmente para prompts mais ambíguos e modelos menos capazes[^S6]. **Comportamentos “não garantidos” são exatamente o que os conjuntos de avaliação devem cobrir** — o que é garantido não precisa de teste.

```javascript
{
  id: "t3-no-orderid",
  grader: "determinístico",
  prompt: "Confere pra mim o status daquele pedido.",
  verify: (r) => ({
    pass: r.toolCalls === 0 && r.answer.includes("?") && r.answer.includes("número do pedido"),
    note: "Com parâmetros incompletos, deve chamar zero ferramentas e pedir o número do pedido",
  }),
},
```

O `r` que `verify` recebe contém não só `answer`, mas também `toolCalls`, `toolErrors` e `tokens`, de modo que o verificador pode conferir “estado final mais métricas-chave” e não apenas texto: o `t3` de fato confere “chamou zero ferramentas”, o `t5` confere “relatou exatamente um erro e disse com honestidade que não encontrou” — o “estado final primeiro” da lição 2 se concretiza através desses campos. `note` é para humanos; quando uma tarefa reprova, o relatório imprime o critério ao lado da resposta real do agente.

Se o seu dever de casa da lição 5 usou o conjunto de campos `{id, prompt, expected, verifier, rubricRef, tags, split}`, mapeie agora para evitar confusão: o `verifier` da lição 5 se chama `grader` aqui e serve apenas para exibição — o tipo de correção de fato é determinado por a tarefa ter uma função `verify` ou `judge: true`. As asserções declarativas de `expected` são escritas aqui diretamente no corpo da função `verify` (as asserções de cada tarefa são diferentes; escrevê-las como funções é mais simples do que projetar um formato universal de asserção). `rubricRef` está embutido como `JUDGE_PROMPT`, já que a suíte inteira tem apenas um caso de juiz. `tags` e `split` foram omitidos por brevidade; a disciplina de held-out é repetida como sempre na seção “Escopo”. O seu JSON da lição 5 não está obsoleto — ele é a versão declarativa deste array `TASKS`. Avançar significa traduzir cada asserção em uma função.

## Peça quatro: correção estratificada, determinística primeiro

Os métodos de correção têm uma ordenação: a correção por código é a mais rápida e mais confiável, escala muitíssimo bem, mas carece de nuance para julgamentos complexos; a correção por LLM é rápida e flexível, dá conta de julgamento complexo, mas teste a confiabilidade primeiro e só então escale; a correção humana é a mais flexível e de maior qualidade, mas lenta e cara, evite se possível[^S5].

Então a regra é: **o que pode ser corrigido por código nunca vai para um juiz**. Quatro das cinco tarefas aqui usam `verify`; só o `t4-refund-note`, aquele pedaço de texto livre, vai para o juiz — “este parágrafo pode ser enviado a um cliente” não é respondível por casamento de string. O formato do juiz segue a lição 4: rubrica travada em três itens, formato de saída travado em JSON, primeiro o raciocínio e depois a nota:

```javascript
const JUDGE_PROMPT = `Você é um avaliador. Pontue a resposta de atendimento abaixo pela rubrica a seguir; primeiro o raciocínio, depois a nota.
Rubrica (cada item vale 0 ou 1; a nota total é a média):
- Valor correto: informa o valor do reembolso e ele bate com o valor do pedido
- Prazo de chegada: informa em quanto tempo o reembolso chega
- Tom adequado: a redação serve para ser enviada direto ao cliente
Devolva apenas JSON: {"reasoning": "...", "score": 0.0-1.0, "grade": "pass" | "fail"}
nota >= 0.8 conta como pass.`;
```

Cada ponto tem uma fonte: fazer o juiz raciocinar primeiro e pontuar depois, e então descartar o raciocínio — isso melhora a qualidade da correção, especialmente em tarefas que exigem julgamento complexo[^S5]; a saída deve ser empírica ou específica, não avaliação puramente qualitativa[^S5]; e “uma única chamada de LLM, um único prompt, saída de nota de 0.0 a 1.0 mais um aprovado/reprovado” é a combinação que a fonte oficial achou mais consistente e mais alinhada com julgamentos humanos depois de testar vários esquemas de juiz no sistema de pesquisa multiagente deles[^S2].

O juiz aqui também é um stub: a resposta da v1 não tem prazo de chegada, dois de três itens dão 0.67 e reprovam; a v2 acrescentou, os três itens batem e dão 1.00, aprovado. A nota é autoconsistente com a rubrica — três itens binários promediados só podem cair em 0, 0.33, 0.67 ou 1.00; uma nota de 0.85 significaria que o juiz não seguiu a matemática da rubrica. O próprio juiz queima tokens; o consumo dele é somado aos tokens daquela tarefa, e é por isso que o `t4` chama apenas uma ferramenta mas não tem tokens baixos.

Mais uma disciplina da lição 4: o modelo que trabalhou não deve se corrigir. A fonte oficial diz para uma instância nova do modelo tentar refutar o resultado — quem faz o trabalho não é quem corrige[^S4]. Em código: o juiz usa o próprio cliente, o próprio system prompt, o próprio array de messages, vê apenas o prompt da tarefa e a resposta a corrigir, e não vê a transcrição de chamadas de ferramenta do agente.

## Peça cinco: loop e relatório

O loop é o loop do curso 7 literalmente, esqueleto inalterado — só acrescentamos o `model` e o `max_tokens` que a API real exige (o stub os ignora) e depois embrulhamos com contadores:

```javascript
let response = await client.messages.create({ model: MODEL, max_tokens: 4096, system, tools: TOOLS, messages });
metrics.tokens += response.usage.input_tokens + response.usage.output_tokens;
while (response.stop_reason === "tool_use") {
  messages.push({ role: "assistant", content: response.content });
  const toolResults = await runToolUses(response.content, metrics);
  messages.push({ role: "user", content: toolResults });
  response = await client.messages.create({ model: MODEL, max_tokens: 4096, system, tools: TOOLS, messages });
  metrics.tokens += response.usage.input_tokens + response.usage.output_tokens;
}
```

`messages` é uma variável local dentro de `runTask`; a função retorna e ela some. Essa é a implementação inteira de “as tarefas não compartilham contexto” — nenhum mecanismo extra é necessário, basta não içá-la para fora.

Quanto a métricas, a lista de conferência oficial é: além da acurácia de topo, colete também o tempo total de execução de chamadas de ferramenta e de tarefas individuais, o número total de chamadas de ferramenta, o consumo total de tokens e os erros de ferramenta[^S3]. As colunas da tabela do relatório seguem exatamente essa lista. A taxa de aprovação só lhe diz “passou ou não”; essas colunas lhe dizem “como passou” — uma tarefa que passa chamando doze ferramentas e uma que passa com duas chamadas são dois níveis de qualidade. Essas colunas também se autoexplicam: muitas chamadas de ferramenta redundantes normalmente sugerem que os parâmetros de paginação ou de limite de tokens precisam ser redimensionados; muitos erros de ferramenta por parâmetro inválido normalmente sugerem que as descrições das ferramentas poderiam ser mais claras ou precisam de exemplos melhores[^S3]. Os exercícios vão usar isso diretamente.

O relatório ser legível por humanos tem valor intrínseco. A sugestão oficial é: faça o Claude mostrar evidência em vez de afirmações de sucesso — a saída do teste, o comando que ele rodou e o que ele devolveu, ou uma captura de tela do resultado; revisar evidência é mais rápido do que refazer a verificação por conta própria, e funciona para sessões que você não estava acompanhando[^S4]. Esta tabela de relatório é essa evidência — cole numa descrição de PR ou mande para um colega, e ele consegue julgar sem rodar de novo. (A única pegadinha da impressão é que caracteres CJK de largura plena contam como largura 2, e o `padEnd` cru desalinha — o código tem um `pad` sensível à largura.)

```agentmentor-check
{
  "id": "vq-zh-06-shared-session",
  "label": "Todas as tarefas de eval compartilham uma sessão longa — funciona?",
  "prompt": "Um colega olhou o eval-runner.mjs e sugeriu uma otimização: hoje cada tarefa cria um array messages novo e roda um loop independente — desperdício. Por que não fazer as cinco tarefas compartilharem uma sessão longa e rodarem em sequência? Ele dá duas razões: os dados de pedido já consultados podem ser reaproveitados depois (economiza tokens) e o modelo “esquenta”, de modo que as tarefas seguintes recebem respostas melhores. Qual é o problema fundamental dessa proposta?",
  "whyHere": "Na estrutura desta trilha, a coisa com maior chance de ser “otimizada” para fora é o isolamento entre tarefas. Parece trabalho duplicado, mas na verdade é a precondição para comparar resultados.",
  "mode": "single",
  "choices": [
    {
      "id": "a",
      "text": "O problema é que fundamentalmente não economiza tokens: com sessão compartilhada, cada requisição reenvia os messages de todas as tarefas anteriores, e os tokens de entrada sobem linearmente.",
      "correct": false,
      "feedback": "Essa meia-frase está correta — sessões longas compartilhadas de fato acumulam tokens de entrada, e a conta de economia não fecha. Mas isso apenas invalida a razão dada, não é o motivo pelo qual a abordagem em si é inutilizável. Mesmo que tokens fossem realmente economizados, as notas obtidas rodando assim continuariam inservíveis. Veja a alternativa c."
    },
    {
      "id": "b",
      "text": "O problema é que as métricas não podem ser separadas por tarefa: com sessão compartilhada, número de chamadas de ferramenta, duração e tokens se misturam, e não dá para preencher a tabela do relatório.",
      "correct": false,
      "feedback": "As métricas ficam mais difíceis de separar, é verdade, mas isso é um problema de contabilidade: marque as fronteiras na borda de cada tarefa, zere os contadores, e ainda é viável separar e contar. O que se resolve por meio de engenharia não é a causa-raiz. A causa-raiz está na c."
    },
    {
      "id": "c",
      "text": "O problema é que as tarefas se contaminam: uma tarefa de eval deve rodar um loop independente; com sessão compartilhada, o contexto deixado pela tarefa anterior é levado para a seguinte — o modelo pode usar direto os dados de pedido já consultados na tarefa anterior para responder, e o teste deixa de medir a capacidade própria daquela tarefa; e trocar a ordem das tarefas muda os resultados, de modo que duas execuções deixam de ser comparáveis.",
      "correct": true,
      "feedback": "Correto. A orientação oficial é “uma tarefa de eval por loop”; isolamento não é desperdício, é precondição. A contaminação tem duas camadas: uma é que o que você está testando muda — os dados trazidos pela tarefa anterior continuam no contexto, e, se a tarefa seguinte tocar em conteúdo relacionado, ela pode responder direto a partir do contexto anterior sem chamar ferramentas, ou se deixar levar por contexto velho irrelevante até uma resposta errada; aí você está testando “se ele sabe folhear o contexto anterior”, não “se ele sabe usar ferramentas”. A outra camada é que as tarefas passam a depender da ordem; troque a ordem ou apague uma tarefa do meio e as notas das restantes se deslocam, e a trilha perde a sua única finalidade — tornar duas execuções comparáveis."
    }
  ]
}
```

## O eval-runner.mjs completo

Copie e salve como `eval-runner.mjs`; `node eval-runner.mjs` roda direto. Sem dependências, sem `package.json`, Node 18+ (usa `await` de nível superior, então a extensão precisa ser `.mjs`).

```javascript
// eval-runner.mjs — trilha de eval com um loop de harness por tarefa
//
// Uso:
//   node eval-runner.mjs                  usa o verificador corrigido (normalizado)
//   node eval-runner.mjs --strict-verify  usa o verificador antigo, sem normalização, e mostra os falsos negativos

const STRICT = process.argv.includes("--strict-verify");
const MODEL = "claude-opus-5"; // o stub ignora; ao trocar pelo cliente real, model e max_tokens são obrigatórios

// ============ 1. Sistema sob teste: ferramentas e dados ============

const ORDERS = {
  "SO-1001": { customer: "Qiming Tech", status: "complete", month: "2026-08", amount: 780.0 },
  "SO-1002": { customer: "Qiming Tech", status: "complete", month: "2026-08", amount: 500.0 },
  "SO-1003": { customer: "Qiming Tech", status: "pending", month: "2026-08", amount: 320.0 },
  "SO-1004": { customer: "Yuanshan Logística", status: "pending", month: "2026-08", amount: 96.5 },
};

const TOOLS = [
  {
    name: "search_orders",
    description: "Busca pedidos por nome do cliente ou por status do pedido e devolve a lista de números de pedido. É obrigatório informar pelo menos um entre customer e status.",
    input_schema: {
      type: "object",
      properties: { customer: { type: "string" }, status: { type: "string" } },
    },
  },
  {
    name: "get_order",
    description: "Consulta cliente, status e valor de um único pedido pelo número do pedido.",
    input_schema: {
      type: "object",
      properties: { order_id: { type: "string" } },
      required: ["order_id"],
    },
  },
];

const TOOL_IMPL = {
  search_orders({ customer, status }) {
    if (!customer && !status) {
      throw new Error("Parâmetros inválidos: informe pelo menos um entre customer e status");
    }
    const ids = Object.keys(ORDERS).filter(
      (id) =>
        (!customer || ORDERS[id].customer === customer) &&
        (!status || ORDERS[id].status === status)
    );
    return { order_ids: ids };
  },
  get_order({ order_id }) {
    const o = ORDERS[order_id];
    if (!o) throw new Error(`O pedido ${order_id} não existe`);
    return { order_id, ...o };
  },
};

// ============ 2. Cliente stub: fila fixa de respostas ============

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const text = (s) => ({ type: "text", text: s });
const toolUse = (id, name, input) => ({ type: "tool_use", id, name, input });
const useTools = (blocks, [i, o]) => ({
  stop_reason: "tool_use",
  content: blocks,
  usage: { input_tokens: i, output_tokens: o },
  latency_ms: 40,
});
const finish = (s, [i, o]) => ({
  stop_reason: "end_turn",
  content: [text(s)],
  usage: { input_tokens: i, output_tokens: o },
  latency_ms: 40,
});

function stubClient(script, label) {
  if (!script) throw new Error(`[stub] Não há fila de respostas para ${label}`);
  let cursor = 0;
  return {
    messages: {
      async create() {
        if (cursor >= script.length) {
          throw new Error(`[stub] fila de respostas de ${label} esgotada (requisições emitidas: ${cursor})`);
        }
        const res = script[cursor++];
        await sleep(res.latency_ms);
        return res;
      },
    },
  };
}

// ============ 3. Dois system prompts e suas filas de respostas ============

const SYSTEM_PROMPTS = {
  v1: "Você é um assistente de pedidos. Use as ferramentas para consultar pedidos e depois responda ao usuário.",
  v2:
    "Você é um assistente de pedidos. Use as ferramentas para consultar pedidos e depois responda ao usuário.\n" +
    "Duas regras rígidas:\n" +
    "1. Quando o usuário não tiver informado o número do pedido, peça o número do pedido primeiro; não chute um para consultar.\n" +
    "2. Avisos de reembolso ao cliente precisam informar o valor do reembolso e o prazo de chegada.",
};

const SCRIPT_V1 = {
  "t1-total": [
    useTools([toolUse("tu_1", "search_orders", { customer: "Qiming Tech", status: "complete" })], [420, 60]),
    useTools(
      [
        toolUse("tu_2", "get_order", { order_id: "SO-1001" }),
        toolUse("tu_3", "get_order", { order_id: "SO-1002" }),
      ],
      [520, 88]
    ),
    finish("O cliente Qiming Tech tem 2 pedidos concluídos em agosto de 2026 (SO-1001, SO-1002), somando ¥1,280.00.", [660, 52]),
  ],
  "t2-pending": [
    useTools([toolUse("tu_1", "search_orders", { status: "pending" })], [415, 46]),
    finish("Os pedidos pendentes no momento são SO-1003 e SO-1004.", [500, 34]),
  ],
  "t3-no-orderid": [
    useTools([toolUse("tu_1", "search_orders", {})], [408, 38]),
    useTools([toolUse("tu_2", "get_order", { order_id: "SO-1001" })], [470, 44]),
    finish("O pedido SO-1001 está com status concluído.", [560, 30]),
  ],
  "t4-refund-note": [
    useTools([toolUse("tu_1", "get_order", { order_id: "SO-1003" })], [430, 42]),
    finish(
      "Olá, recebemos o cancelamento do pedido SO-1003 (valor ¥320.00). O reembolso será devolvido para a forma de pagamento original. Desculpe pelo transtorno.",
      [540, 76]
    ),
  ],
  "t5-missing-order": [
    useTools([toolUse("tu_1", "get_order", { order_id: "SO-9999" })], [412, 40]),
    finish("O sistema não encontrou o pedido SO-9999; confirme se o número do pedido está correto.", [478, 36]),
  ],
};

// v2 troca as respostas de apenas duas tarefas — a diferença entre versões está fixada aqui
const SCRIPT_V2 = {
  ...SCRIPT_V1,
  "t3-no-orderid": [
    finish("De qual pedido você está falando? Me envie o número do pedido (formato SO-1001).", [455, 32]),
  ],
  "t4-refund-note": [
    useTools([toolUse("tu_1", "get_order", { order_id: "SO-1003" })], [462, 42]),
    finish(
      "Olá, a solicitação de cancelamento do pedido SO-1003 (valor ¥320.00) foi recebida. O reembolso será devolvido para a forma de pagamento original e costuma cair em 3 a 5 dias úteis. Desculpe pelo transtorno.",
      [572, 94]
    ),
  ],
};

const SCRIPTS = { v1: SCRIPT_V1, v2: SCRIPT_V2 };

// ============ 4. Juiz: também um stub, devolve 0.0-1.0 mais aprovado/reprovado ============

const JUDGE_PROMPT = `Você é um avaliador. Pontue a resposta de atendimento abaixo pela rubrica a seguir; primeiro o raciocínio, depois a nota.
Rubrica (cada item vale 0 ou 1; a nota total é a média):
- Valor correto: informa o valor do reembolso e ele bate com o valor do pedido
- Prazo de chegada: informa em quanto tempo o reembolso chega
- Tom adequado: a redação serve para ser enviada direto ao cliente
Devolva apenas JSON: {"reasoning": "...", "score": 0.0-1.0, "grade": "pass" | "fail"}
nota >= 0.8 conta como pass.`;

const JUDGE_SCRIPTS = {
  v1: {
    "t4-refund-note": [
      finish(
        JSON.stringify({
          reasoning: "O valor bate com o pedido e o tom está adequado; mas falta o prazo de chegada do reembolso, e o cliente fica sem previsão. Falta 1 dos 3 itens.",
          score: 0.67,
          grade: "fail",
        }),
        [286, 58]
      ),
    ],
  },
  v2: {
    "t4-refund-note": [
      finish(
        JSON.stringify({
          reasoning: "Valor, prazo de chegada e tom: os três itens atendidos, pode ser enviada direto ao cliente.",
          score: 1.0,
          grade: "pass",
        }),
        [302, 46]
      ),
    ],
  },
};

async function judgeAnswer(task, answer, version, metrics) {
  const client = stubClient(JUDGE_SCRIPTS[version][task.id], `judge/${version}/${task.id}`);
  const res = await client.messages.create({
    model: MODEL,
    max_tokens: 1024,
    system: JUDGE_PROMPT,
    messages: [{ role: "user", content: `[Tarefa] ${task.prompt}\n[Resposta a avaliar] ${answer}` }],
  });
  metrics.tokens += res.usage.input_tokens + res.usage.output_tokens;
  const verdict = JSON.parse(res.content.map((b) => b.text).join(""));
  return { pass: verdict.grade === "pass", score: verdict.score, note: verdict.reasoning };
}

// ============ 5. Conjunto de avaliação: 4 comuns + 1 caso extremo ============

function amountsIn(s) {
  return [...s.replace(/[,，\s¥￥]/g, "").matchAll(/\d+(?:\.\d+)?/g)].map((m) => Number(m[0]));
}
function orderIdsIn(s) {
  return [...new Set(s.match(/SO-\d+/g) ?? [])].sort();
}

const TASKS = [
  {
    id: "t1-total",
    grader: "determinístico",
    prompt: "Qual é o valor total dos pedidos concluídos do cliente Qiming Tech em agosto de 2026?",
    verify: (r) => ({
      pass: amountsIn(r.answer).some((n) => Math.abs(n - 1280) < 0.005),
      note: "A resposta precisa conter 1280 (símbolo de moeda, separador de milhar e unidade são aceitos)",
    }),
    strictVerify: (r) => ({
      pass: r.answer.includes("1280.00"),
      note: "A resposta precisa conter a string literal 1280.00",
    }),
  },
  {
    id: "t2-pending",
    grader: "determinístico",
    prompt: "Quais pedidos ainda não foram enviados? Liste os números de pedido.",
    verify: (r) => ({
      pass: JSON.stringify(orderIdsIn(r.answer)) === JSON.stringify(["SO-1003", "SO-1004"]),
      note: "O conjunto de números de pedido na resposta precisa ser exatamente SO-1003 + SO-1004",
    }),
  },
  {
    id: "t3-no-orderid",
    grader: "determinístico",
    prompt: "Confere pra mim o status daquele pedido.",
    verify: (r) => ({
      pass: r.toolCalls === 0 && r.answer.includes("?") && r.answer.includes("número do pedido"),
      note: "Com parâmetros incompletos, deve chamar zero ferramentas e pedir o número do pedido",
    }),
  },
  {
    id: "t4-refund-note",
    grader: "juiz LLM",
    judge: true,
    prompt: "O cliente pediu o cancelamento e o reembolso do pedido SO-1003; escreva uma resposta para ele.",
  },
  {
    id: "t5-missing-order",
    grader: "determinístico",
    prompt: "Confira o status do pedido SO-9999.",
    verify: (r) => ({
      pass: r.toolErrors === 1 && /não encontr|não existe/.test(r.answer) && !/[¥￥]|reais|d[óo]lar/.test(r.answer),
      note: "Depois do erro de ferramenta, precisa dizer com honestidade que não encontrou e não pode inventar um valor",
    }),
  },
];

// ============ 6. Uma tarefa, um loop de harness ============

async function runToolUses(content, metrics) {
  const results = [];
  for (const block of content) {
    if (block.type !== "tool_use") continue;
    metrics.toolCalls += 1;
    try {
      const out = TOOL_IMPL[block.name](block.input);
      results.push({ type: "tool_result", tool_use_id: block.id, content: JSON.stringify(out) });
    } catch (err) {
      metrics.toolErrors += 1;
      results.push({ type: "tool_result", tool_use_id: block.id, content: err.message, is_error: true });
    }
  }
  return results;
}

async function runTask(task, version) {
  const metrics = { toolCalls: 0, toolErrors: 0, tokens: 0 };
  const client = stubClient(SCRIPTS[version][task.id], `${version}/${task.id}`);
  const system = SYSTEM_PROMPTS[version];
  const messages = [{ role: "user", content: task.prompt }];
  const startedAt = Date.now();

  let response = await client.messages.create({ model: MODEL, max_tokens: 4096, system, tools: TOOLS, messages });
  metrics.tokens += response.usage.input_tokens + response.usage.output_tokens;
  while (response.stop_reason === "tool_use") {
    messages.push({ role: "assistant", content: response.content });
    const toolResults = await runToolUses(response.content, metrics);
    messages.push({ role: "user", content: toolResults });
    response = await client.messages.create({ model: MODEL, max_tokens: 4096, system, tools: TOOLS, messages });
    metrics.tokens += response.usage.input_tokens + response.usage.output_tokens;
  }

  const answer = response.content
    .filter((b) => b.type === "text")
    .map((b) => b.text)
    .join("\n");

  let verdict;
  if (task.judge) {
    verdict = await judgeAnswer(task, answer, version, metrics);
  } else {
    const fn = STRICT && task.strictVerify ? task.strictVerify : task.verify;
    const out = fn({ answer, ...metrics });
    verdict = { pass: out.pass, score: out.pass ? 1 : 0, note: out.note };
  }

  return {
    id: task.id,
    grader: task.grader,
    pass: verdict.pass,
    score: verdict.score,
    note: verdict.note,
    answer,
    durationMs: Date.now() - startedAt,
    ...metrics,
  };
}

async function runSuite(version) {
  const rows = [];
  for (const task of TASKS) rows.push(await runTask(task, version));
  return {
    version,
    verifier: STRICT ? "estrito (antigo, sem normalização)" : "normalizado (corrigido)",
    rows,
    passed: rows.filter((r) => r.pass).length,
    total: rows.length,
    toolCalls: rows.reduce((n, r) => n + r.toolCalls, 0),
    toolErrors: rows.reduce((n, r) => n + r.toolErrors, 0),
    tokens: rows.reduce((n, r) => n + r.tokens, 0),
    durationMs: rows.reduce((n, r) => n + r.durationMs, 0),
  };
}

// ============ 7. Relatório ============

const CJK = /[ᄀ-ᅟ⺀-꓏가-힣豈-﫿︰-﹏＀-｠￠-￦]/;
const width = (s) => [...String(s)].reduce((n, ch) => n + (CJK.test(ch) ? 2 : 1), 0);
const pad = (s, n) => String(s) + " ".repeat(Math.max(0, n - width(s)));
const padL = (s, n) => " ".repeat(Math.max(0, n - width(s))) + String(s);

function printReport(report) {
  console.log(`\n=== Relatório · Prompt ${report.version} · Verificador ${report.verifier} ===`);
  console.log(
    pad("Tarefa", 18) + pad("Correção", 16) + pad("Resultado", 11) + padL("Nota", 7) +
    padL("Chamadas", 10) + padL("Erros", 7) + padL("Tokens", 11) + padL("Duração", 11)
  );
  console.log("-".repeat(91));
  for (const r of report.rows) {
    console.log(
      pad(r.id, 18) + pad(r.grader, 16) + pad(r.pass ? "pass" : "FAIL", 11) +
      padL(r.score.toFixed(2), 7) + padL(r.toolCalls, 10) + padL(r.toolErrors, 7) +
      padL(r.tokens.toLocaleString("en-US"), 11) + padL(`${r.durationMs}ms`, 11)
    );
  }
  console.log("-".repeat(91));
  const rate = ((report.passed / report.total) * 100).toFixed(0);
  console.log(
    `Taxa de aprovação ${report.passed}/${report.total} (${rate}%) · Chamadas de ferramenta ${report.toolCalls} · ` +
    `Erros de ferramenta ${report.toolErrors} · Tokens ${report.tokens.toLocaleString("en-US")} · Total ${report.durationMs}ms`
  );
  const failed = report.rows.filter((r) => !r.pass);
  if (failed.length) {
    console.log("\nCasos reprovados:");
    for (const r of failed) {
      console.log(`  [${r.id}] Critério: ${r.note}`);
      console.log(`  Resposta do agente: ${r.answer}`);
    }
  }
}

function printDiff(a, b) {
  console.log(`\n=== Variação de nota ${a.version} -> ${b.version} ===`);
  console.log(pad("Tarefa", 18) + padL(a.version, 7) + padL(b.version, 7) + "  Mudança");
  console.log("-".repeat(50));
  for (let i = 0; i < a.rows.length; i++) {
    const x = a.rows[i], y = b.rows[i];
    let mark = "estável";
    if (!x.pass && y.pass) mark = "fail => pass";
    else if (x.pass && !y.pass) mark = "pass => FAIL";
    else if (y.score !== x.score) mark = `nota ${(y.score - x.score).toFixed(2)}`;
    console.log(pad(x.id, 18) + padL(x.score.toFixed(2), 7) + padL(y.score.toFixed(2), 7) + "  " + mark);
  }
  console.log("-".repeat(50));
  console.log(`Taxa de aprovação ${a.passed}/${a.total} -> ${b.passed}/${b.total}`);
}

// ============ 8. Ponto de entrada ============

const reportV1 = await runSuite("v1");
printReport(reportV1);
const reportV2 = await runSuite("v2");
printReport(reportV2);
printDiff(reportV1, reportV2);
```

## Recuperando a armadilha da lição 3: verificadores estritos demais

A Lição 3 cobriu uma armadilha, nas palavras exatas da fonte oficial: evite verificadores estritos demais, que rejeitam respostas corretas por diferenças espúrias como formatação, pontuação ou formulações alternativas válidas[^S3]. Soa como bom senso, mas é quase inevitável no código, porque verificadores estritos demais são os mais fáceis de escrever.

A trilha tem um embutido. O `t1-total` tem duas versões de verificador; a antiga é `pass: r.answer.includes("1280.00")` — parece à prova de balas: a resposta correta é 1280.00, então confira se a resposta contém essa string. Rode `node eval-runner.mjs --strict-verify` (colando abaixo só o relatório da v1; o relatório da v2 e a tabela de variação são impressos como de costume):

```text
=== Relatório · Prompt v1 · Verificador estrito (antigo, sem normalização) ===
Tarefa            Correção        Resultado     Nota  Chamadas  Erros     Tokens    Duração
-------------------------------------------------------------------------------------------
t1-total          determinístico  FAIL          0.00         3      0      1,800      122ms
t2-pending        determinístico  pass          1.00         1      0        995       83ms
t3-no-orderid     determinístico  FAIL          0.00         2      1      1,550      124ms
t4-refund-note    juiz LLM        FAIL          0.67         1      0      1,432      124ms
t5-missing-order  determinístico  pass          1.00         1      1        966       82ms
-------------------------------------------------------------------------------------------
Taxa de aprovação 2/5 (40%) · Chamadas de ferramenta 8 · Erros de ferramenta 2 · Tokens 6,743 · Total 535ms

Casos reprovados:
  [t1-total] Critério: A resposta precisa conter a string literal 1280.00
  Resposta do agente: O cliente Qiming Tech tem 2 pedidos concluídos em agosto de 2026 (SO-1001, SO-1002), somando ¥1,280.00.
  [t3-no-orderid] Critério: Com parâmetros incompletos, deve chamar zero ferramentas e pedir o número do pedido
  Resposta do agente: O pedido SO-1001 está com status concluído.
  [t4-refund-note] Critério: O valor bate com o pedido e o tom está adequado; mas falta o prazo de chegada do reembolso, e o cliente fica sem previsão. Falta 1 dos 3 itens.
  Resposta do agente: Olá, recebemos o cancelamento do pedido SO-1003 (valor ¥320.00). O reembolso será devolvido para a forma de pagamento original. Desculpe pelo transtorno.
```

Isto também vem de uma execução real. Olhe o detalhe do `t1-total`: o agente respondeu “somando ¥1,280.00” — valor correto, pedidos corretos, redação normal. O único crime dele foi pôr uma vírgula de separação de milhar entre o 1 e o 280, e por isso `includes("1280.00")` devolve false, e uma resposta inteiramente correta é reprovada.

**Neste ponto conserte o verificador, não o agente.** Relatórios só lhe dizem “t1 reprovou”, não lhe dizem de quem é a culpa; o jeito de saber é ler as palavras reais do agente no detalhe — que é exatamente por que os relatórios imprimem a resposta bruta. A correção é normalização. A descrição oficial de casamento exato já inclui essa etapa: o casamento exato avalia se a saída do modelo bate com uma resposta correta predefinida, tipicamente depois de normalizar espaços em branco e caixa[^S5]. Cenários de valor precisam de mais lavagem — símbolos de moeda, separadores de milhar, unidades —, então o verificador corrigido lava o ruído primeiro, extrai os números e compara numericamente:

```javascript
function amountsIn(s) {
  return [...s.replace(/[,，\s¥￥]/g, "").matchAll(/\d+(?:\.\d+)?/g)].map((m) => Number(m[0]));
}
verify: (r) => ({
  pass: amountsIn(r.answer).some((n) => Math.abs(n - 1280) < 0.005),
  note: "A resposta precisa conter 1280 (símbolo de moeda, separador de milhar e unidade são aceitos)",
}),
```

Tire o `--strict-verify` e rode de novo; o `t1-total` vira de 0.00 para 1.00, e a linha de base da v1 sobe de 2/5 de volta para 3/5 — e, no meio disso, o agente não mudou um único caractere, e a fila de respostas do stub não mudou um único caractere. **A nota mudou mas o sistema sob teste não — esse é o teste decisivo de “problema do verificador”.**

Um aparte sobre escopo: normalização não é quanto mais frouxa melhor. Afrouxe para “parece conter 1280, passa”, e o agente respondendo “total de 1280 pedidos, valor desconhecido” também passa. Verificadores devem ficar em “deixe passar diferenças irrelevantes, barre erros substantivos” — e o único método para achar essa posição é tentar com respostas reais.

## Mude um ponto do prompt e veja a nota se mexer

Trilha calibrada, pronta para trabalho de verdade. Mudei um só ponto — o system prompt, acrescentando duas regras depois da v1:

```javascript
const SYSTEM_PROMPTS = {
  v1: "Você é um assistente de pedidos. Use as ferramentas para consultar pedidos e depois responda ao usuário.",
  v2:
    "Você é um assistente de pedidos. Use as ferramentas para consultar pedidos e depois responda ao usuário.\n" +
    "Duas regras rígidas:\n" +
    "1. Quando o usuário não tiver informado o número do pedido, peça o número do pedido primeiro; não chute um para consultar.\n" +
    "2. Avisos de reembolso ao cliente precisam informar o valor do reembolso e o prazo de chegada.",
};
```

Essas duas não foram inventadas; foram lidas nos “Casos reprovados” do relatório da v1: o `t3` reprova porque chutou um número de pedido com os parâmetros incompletos, e o `t4` levou desconto porque faltou o prazo de chegada. **O relatório diz o quê, você muda o quê** — essa é a diferença mais concreta entre ter e não ter uma trilha. Sem trilha, depois de mudar o prompt você dá uma olhada na saída e sente que “parece melhor”; com trilha, “qual melhorou, qual ficou parado, alguma coisa regrediu” são três linhas de números.

Rode de novo, e a tabela de variação é o último trecho da saída de abertura: taxa de aprovação de 60% para 100%, duas tarefas viram de reprovado para aprovado, as outras três não se mexem. Essa última meia-frase importa tanto quanto a primeira — ela diz que esta mudança não quebrou o que já funcionava. Sem trilha, depois de mudar o prompt você só olha a saída uma vez e acha que “ficou melhor”; com trilha, “qual melhorou / qual ficou parado / alguma regressão” são três linhas de números.

A formulação oficial para isso é: com evals você consegue medir o impacto da sua engenharia de prompt com muito mais confiança; até refinamentos pequenos nas descrições de ferramenta podem render melhorias dramáticas[^S3]. Há uma barganha a agarrar aqui também: no início do desenvolvimento de agentes, as mudanças tendem a ter impacto dramático porque ainda há fruta madura em abundância ao alcance da mão — um ajuste de prompt pode elevar a taxa de sucesso de 30% para 80%; com efeitos desse tamanho você consegue enxergar mudanças com apenas alguns casos de teste[^S2]. Você tem apenas cinco tarefas agora — isso não é déficit, é o ponto de partida.

Olhe as colunas de métrica de novo: as chamadas de ferramenta da v2 caíram de 8 para 6, os erros de ferramenta de 2 para 1, os tokens quase mil a menos, porque o `t3` não chuta mais às cegas para chamar ferramentas. **A mesma mudança melhorou simultaneamente a acurácia e o custo** — esse tipo de coisa só fica visível quando você registra essas colunas juntas.

## Escopo: o que esta trilha dá conta e o que não dá

**O que ela dá conta**: um agente, um lote de tarefas, rodado uma vez na sua máquina, produzindo um relatório legível por humanos.

**Trocar por um modelo real** — a estrutura da trilha não muda. Substitua `stubClient(...)` pelo cliente real do `@anthropic-ai/sdk`; o while-loop de `runTask` não muda uma linha — ele já está escrito no formato de `stop_reason` / `tool_use` / `tool_result` da API real; os parâmetros obrigatórios `model` e `max_tokens` já estão lá (o stub os ignora, o cliente real os usa). Depois da troca, duas coisas mudam: as notas vão tremer, porque agentes são não determinísticos entre execuções mesmo com prompts idênticos[^S2], então não leia demais em execuções únicas; e rodar uma rodada custa dinheiro e tempo, cinco tarefas não pesam, mas duzentas exigem pensar em concorrência e custo.

**O que ela não dá conta**: pendurar os evals na CI, rodar a cada commit, comparar com versões históricas, bloquear merges quando a nota cai abaixo de um limiar — essas são práticas comuns de engenharia e funcionam bem, mas esta lição não se estende nelas. O nível 2 dos exercícios vai levar você por “comparar dois relatórios”; a orquestração restante é trabalho da sua CI.

Mais uma disciplina da lição 5 para repetir: **não afine contra o conjunto held-out**. Você segue os relatórios para mudar prompts; depois de várias rodadas as notas certamente vão subir, mas a subida pode ser só “notas nestas cinco tarefas”. A prática oficial é apoiar-se em conjuntos de teste held-out para garantir que não houve overfitting nas avaliações de “treino”[^S3]. Então, numa montagem real, as tarefas devem se dividir em duas pilhas: uma roda diariamente para orientação, a outra fica trancada e só abre quando você acha que “esta versão deve funcionar” — as notas da primeira pilha são navegação, as notas da segunda são veredito.

Último lembrete de sempre: os evals automatizados vão deixar coisas passar. Testadores humanos sempre esbarram em casos extremos que os evals deixam passar — alucinações em consultas incomuns, falhas sistêmicas, vieses sutis de seleção de fontes[^S2]. A trilha rodando lisa não significa parar de usar você mesmo.

## 💻 Exercícios

<!-- exercises -->

### Nível 1: Leia relatórios, não corra para mudar código

Sem código. Volte aos dois relatórios da abertura da lição (linha de base v1 e v2 pós-mudança); as linhas de resumo são:

```text
v1: Taxa de aprovação 3/5 (60%)  · Chamadas de ferramenta 8 · Erros de ferramenta 2 · Tokens 6,743
v2: Taxa de aprovação 5/5 (100%) · Chamadas de ferramenta 6 · Erros de ferramenta 1 · Tokens 5,766
```

Contra as duas tabelas completas, responda três perguntas, de três a cinco frases cada:

1. O `t1-total` passa nos dois relatórios, mas tem a maior contagem de chamadas de ferramenta, 3. Que problema isso indica? O que deveria ser mudado?
2. A v1 tem 2 erros de ferramenta, a v2 tem 1. Esses dois erros são da mesma classe de problema? O que cada um significa, e cada um deveria ser corrigido?
3. A lição tem um terceiro relatório (o do `--strict-verify`), em que o `t1-total` é 0.00. A mesma tarefa, um relatório 0.00 e outro 1.00 — como você distingue que essa diferença de nota é problema do verificador e não do agente?

<!-- rubric -->

- A pergunta 1 precisa apontar como causa e efeito que “`search_orders` só devolve números de pedido, sem valores, então cada pedido exige outra chamada de `get_order`”, notar que crescer o número de pedidos escala o número de chamadas e, pela leitura da S3, identificar chamadas redundantes como sinal de que “os parâmetros de paginação / volume de retorno precisam de ajuste”; o alvo da mudança precisa cair na **ferramenta** (fazer `search_orders` carregar campos de resumo), não no prompt nem no agente.
- A pergunta 2 precisa distinguir a natureza dos dois erros: o do `t3` é erro de **parâmetro inválido** (`search_orders({})`), que, pela leitura da S3, aponta para descrição de ferramenta pouco clara ou sem exemplos, e deve ser corrigido; o do `t5` é o pedido em si não existir, que é o que esta tarefa **testa de propósito**, e o erro aparecer é o esperado. A resposta precisa declarar explicitamente que “contagem de erro de ferramenta não é quanto menor melhor”.
- A pergunta 3 precisa dar um critério operacional: o texto da resposta do agente, a contagem de chamadas e os tokens são idênticos nos dois relatórios, e só o verificador mudou, então a mudança vem do lado da correção; e declarar que a base do julgamento é ler as palavras reais do agente no detalhe, confirmando que a resposta está substantivamente correta (1,280.00 vs 1280.00 diferem apenas pelo separador de milhar).
- As três perguntas não exigem código; escrever código sem responder aos julgamentos acima não conta como aprovado.

<!-- hint -->

Na pergunta 1, não fique só olhando “3 é muito”, olhe o que `search_orders` devolve. Ela devolve `{ order_ids: [...] }` — só números de pedido. O agente quer o valor; além de chamar `get_order` um a um, existe outro jeito?

<!-- hint -->

A chave da pergunta 3 é controlar variáveis. Compare cada coluna da linha `t1-total` nos dois relatórios: contagem de chamadas, contagem de erros, tokens mudaram? Depois compare o texto bruto da resposta do agente nos dois detalhes. A coluna que mudou é o lado onde está o problema.

<!-- answer -->

**Pergunta 1.** O `t1-total` precisa de 3 chamadas de ferramenta por causa do projeto do valor de retorno de `search_orders`: ela só devolve `{ order_ids: ["SO-1001", "SO-1002"] }`, sem valor nenhum, e o agente, para calcular o total, precisa chamar `get_order` de novo para cada número de pedido. A contagem de chamadas é 1 + N, sendo N o número de pedidos atingidos — parece aceitável com quatro pedidos, mas, quando o cliente tiver cinquenta pedidos, esta única tarefa vai bater em cinquenta e uma chamadas, com tokens e duração escalando linearmente, e é fácil esbarrar em limites de contexto.

A leitura oficial desse sinal é: muitas chamadas de ferramenta redundantes normalmente sugerem que os parâmetros de paginação ou de limite de tokens precisam ser redimensionados[^S3]. A correção concreta é fazer `search_orders` devolver diretamente campos de resumo (número do pedido + status + valor) e então acrescentar parâmetros de paginação para controlar o volume de um único retorno. **Mude a ferramenta, não o prompt, não o agente.** Isso também explica por que métricas além da taxa de aprovação precisam ser registradas — o `t1` passa nos dois relatórios, e, olhando só a taxa de aprovação, você nunca descobriria este problema.

**Pergunta 2.** Não são da mesma classe; a natureza dos dois erros é oposta.

O erro do `t3-no-orderid` é o agente ter chamado `search_orders({})` sem número de pedido, com os dois parâmetros de filtro vazios, e a ferramenta ter rejeitado — este é um erro de **parâmetro inválido**. A leitura oficial é: esses erros se aglomerando normalmente significa que as descrições das ferramentas poderiam ser mais claras ou precisam de exemplos melhores[^S3]. Este deveria ser corrigido; a v2 acrescentou “peça o número do pedido primeiro” e ele sumiu. Se não for para mudar o prompt, outra direção é endurecer a descrição da ferramenta ou acrescentar `strict: true` à definição dela, tornando as restrições de parâmetro efetivas já na camada da API[^S6].

O erro do `t5-missing-order` é consultar `SO-9999`, e a ferramenta relatar “o pedido não existe”. Não é um defeito, é exatamente o que esta tarefa testa — depois do erro de ferramenta, o agente vai dizer com honestidade que não encontrou ou vai inventar um valor. O verificador desta tarefa escreve `r.toolErrors === 1`, ou seja, **este erro precisa ocorrer**; a contagem de erros virar 0 na verdade significa que o teste não acertou o alvo. Então a coluna de erro de ferramenta não é quanto menor melhor, depende de onde os erros vêm; misturar as duas classes e ler “erros caíram de 2 para 1, melhorou” é mexer numa panela só uma correção real e um comportamento esperado.

**Pergunta 3.** O critério é controlar variáveis: compare a linha `t1-total` coluna por coluna nos dois relatórios — chamadas 3 vs 3, erros 0 vs 0, tokens 1,800 vs 1,800, tudo inalterado do lado do agente. Depois olhe o detalhe; o relatório do `--strict-verify` imprime as palavras reais do agente como “…somando ¥1,280.00.” — valor certo, pedidos certos, redação normal. Entre as duas execuções, a única mudança é aquela flag de linha de comando, ou seja, o lado da correção, então a diferença de nota vem inteiramente do verificador: a versão antiga faz a comparação literal `includes("1280.00")` e tropeça na vírgula de separação de milhar. Este é exatamente o tipo de erro contra o qual a fonte oficial alertou — não deixe verificadores rejeitarem respostas corretas por diferenças espúrias de formato ou pontuação[^S3]. O alvo da mudança é a função `verify`; mudar o agente para acomodar o verificador é pendurar o defeito da trilha no sistema sob teste.

Esse julgamento ser possível depende de os relatórios imprimirem a resposta bruta do agente no detalhe. Se o relatório imprimisse apenas aprovado/reprovado, você teria que rodar de novo manualmente para ver o que ele de fato respondeu — para relatórios funcionarem como evidência, eles precisam carregar o material de origem[^S4].

---

### Nível 2: Acrescente “comparação entre duas execuções” à trilha

Escreva código, precisa rodar. Acrescente duas coisas ao `eval-runner.mjs`:

1. **Persistência de relatório**: acrescente `writeJsonAtomic(file, obj)`, usando a escrita atômica do curso 9 (grava o `.tmp` primeiro e depois `rename`) para salvar o relatório de uma execução como JSON. A linha de comando aceita `--version v1 --out reports/v1.json`.
2. **Escreva um `compare.mjs`**: leia dois relatórios JSON, imprima a diferença de nota por tarefa (nota da linha de base, nota nova, delta, status), imprima a variação da taxa de aprovação no final; se alguma tarefa virar de aprovado para reprovado, imprima um resumo em stderr e saia com código diferente de zero.

Rode estes quatro comandos e cole a saída:

```text
node eval-runner.mjs --version v1 --out reports/v1.json
node eval-runner.mjs --version v2 --out reports/v2.json
node compare.mjs reports/v1.json reports/v2.json   # deve sair 0
node compare.mjs reports/v2.json reports/v1.json   # deve sair 1
```

(Trocar a ordem dos parâmetros simula “versão nova pior que a linha de base”, verificando que o caminho de saída diferente de zero funciona de fato.)

<!-- rubric -->

- `writeJsonAtomic` precisa ser as duas etapas “gravar arquivo temporário + `fs.renameSync`”, não pode ser `fs.writeFileSync(file, ...)` direto e pronto; precisa criar o diretório automaticamente (`fs.mkdirSync(..., { recursive: true })`).
- O JSON persistido precisa ser consumível por um `compare.mjs` autônomo: no mínimo incluir `version`, `passed`, `total` e um array `rows`, com cada linha tendo `id`, `pass`, `score`. **Não grave `durationMs`** — a duração treme a cada execução, e gravá-la faz dois JSONs nunca serem iguais; gravá-la não é errado, mas a comparação precisa ignorar essa coluna.
- `compare.mjs` precisa alinhar os dois relatórios pelo id da tarefa, não pelo índice do array — depois que tarefas forem acrescentadas ou removidas, os índices desalinham.
- Depois de trocar o ponto de entrada, é preciso apagar o `printDiff` órfão; o arquivo modificado não pode deixar funções sem chamador.
- Código de saída em dois níveis: com aprovado virando reprovado, `process.exit(1)`, e o resumo da regressão vai para stderr; sem regressão, saída normal (0). Parâmetros faltando podem usar outro código diferente de zero (por exemplo 2) para distinguir “erro de uso” de “tem regressão”.
- É obrigatório colar a saída real dos quatro comandos, com o terceiro saindo 0 e o quarto saindo 1.

<!-- hint -->

A escrita atômica são só três linhas, não complique: `fs.writeFileSync(file + ".tmp", JSON.stringify(obj, null, 2))` e depois `fs.renameSync(file + ".tmp", file)`. No mesmo sistema de arquivos, o `rename` é atômico, então o `compare.mjs` lê ou o arquivo antigo completo ou o arquivo novo completo, nunca um pela metade.

<!-- hint -->

Ao julgar regressões, não use o delta de nota. Uma nota caindo de 1.00 para 0.67 é queda, mas pode continuar acima da linha de aprovação (a linha de aprovação da tarefa de juiz é 0.8); cair de 1.00 para 0.00 é reprovação certa. Compare diretamente o campo booleano `pass`: `was.pass && !now.pass` é regressão, e a variação de nota é impressa à parte como uma coluna.

<!-- answer -->

**Modifique o `eval-runner.mjs`.** Acrescente dois imports e a função de escrita atômica no topo do arquivo:

```javascript
import fs from "node:fs";
import path from "node:path";

const STRICT = process.argv.includes("--strict-verify");

// Escrita atômica: grava o .tmp primeiro e depois renomeia — assim o compare.mjs nunca lê um arquivo pela metade
function writeJsonAtomic(file, obj) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(obj, null, 2));
  fs.renameSync(tmp, file);
}
```

Depois substitua a seção 8 inteira, o ponto de entrada — rode uma versão por vez e grave no arquivo indicado:

```javascript
// ============ 8. Ponto de entrada ============
// Uso: node eval-runner.mjs --version v1 --out reports/v1.json
const argOf = (flag, fallback) => {
  const i = process.argv.indexOf(flag);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
};
const version = argOf("--version", "v1");
const out = argOf("--out", null);

const report = await runSuite(version);
printReport(report);

if (out) {
  writeJsonAtomic(out, {
    version: report.version,
    passed: report.passed,
    total: report.total,
    ranAt: new Date().toISOString(),
    rows: report.rows.map(({ id, pass, score, toolCalls, toolErrors, tokens }) => ({
      id, pass, score, toolCalls, toolErrors, tokens,
    })),
  });
  console.log(`\nRelatório escrito em ${out}`);
}
```

Depois de trocar o ponto de entrada, o `printDiff` fica sem chamador — **apague essa função por inteiro**, não a deixe como código morto. O trabalho dela, deste ponto em diante, pertence ao `compare.mjs`: o `printDiff` só consegue comparar dois relatórios da mesma execução do processo; o `compare.mjs` consegue comparar quaisquer duas execuções, com dias de diferença ou em máquinas diferentes. Ao persistir, tiramos de propósito `durationMs` e `answer`: a duração treme a cada execução e a resposta bruta é longa demais, e as duas coisas deixam as comparações de JSON ruidosas.

**`compare.mjs` completo:**

```javascript
// compare.mjs — lê dois relatórios, imprime a diferença de nota por tarefa; sai com código diferente de zero se algum pass virar fail
// Uso: node compare.mjs reports/v1.json reports/v2.json
import fs from "node:fs";

const [baseFile, headFile] = process.argv.slice(2);
if (!baseFile || !headFile) {
  console.error("Uso: node compare.mjs <baseline.json> <novo.json>");
  process.exit(2);
}
const read = (f) => JSON.parse(fs.readFileSync(f, "utf8"));
const base = read(baseFile);
const head = read(headFile);
const wasById = new Map(base.rows.map((r) => [r.id, r]));
const regressions = [];

console.log(`base ${baseFile} (${base.version})  ->  head ${headFile} (${head.version})`);
console.log("tarefa".padEnd(18) + "base".padStart(6) + "head".padStart(7) + "delta".padStart(8) + "  status");
console.log("-".repeat(52));

for (const now of head.rows) {
  const was = wasById.get(now.id);
  if (!was) {
    console.log(now.id.padEnd(18) + "-".padStart(6) + now.score.toFixed(2).padStart(7) + "-".padStart(8) + "  tarefa nova");
    continue;
  }
  const delta = now.score - was.score;
  let state = "estável";
  if (was.pass && !now.pass) {
    state = "regressão pass => FAIL";
    regressions.push(now.id);
  } else if (!was.pass && now.pass) {
    state = "corrigido fail => pass";
  } else if (Math.abs(delta) > 1e-9) {
    state = delta > 0 ? "nota subiu" : "nota caiu";
  }
  console.log(
    now.id.padEnd(18) + was.score.toFixed(2).padStart(6) + now.score.toFixed(2).padStart(7) +
    (delta >= 0 ? `+${delta.toFixed(2)}` : delta.toFixed(2)).padStart(8) + "  " + state
  );
}

console.log("-".repeat(52));
console.log(`Taxa de aprovação ${base.passed}/${base.total} -> ${head.passed}/${head.total}`);
const missing = base.rows.filter((r) => !head.rows.some((n) => n.id === r.id)).map((r) => r.id);
if (missing.length) console.log(`Tarefas ausentes no novo relatório: ${missing.join(", ")}`);

if (regressions.length) {
  console.error(`\n${regressions.length} tarefas passaram de pass para fail: ${regressions.join(", ")}`);
  process.exit(1);
}
console.log("\nNenhuma tarefa passou de pass para fail.");
```

(Aqui dá para usar `padEnd` cru com segurança: as colunas preenchidas são todas IDs de tarefa e números em ASCII; as palavras de status em português só aparecem no fim da linha e não entram no alinhamento; onde as colunas contiverem texto CJK, você ainda precisa do `pad` sensível à largura do texto principal.)

**Saída real da execução.** Os relatórios das duas execuções de eval são iguais aos do texto principal, então aqui fica só a última linha; a linha `exit code=` vem de anexar `echo "exit code=$?"` depois do comando.

```text
$ node eval-runner.mjs --version v1 --out reports/v1.json | tail -1
Relatório escrito em reports/v1.json

$ node eval-runner.mjs --version v2 --out reports/v2.json | tail -1
Relatório escrito em reports/v2.json
```

Comparação no sentido direto, sem regressão, sai 0:

```text
$ node compare.mjs reports/v1.json reports/v2.json
base reports/v1.json (v1)  ->  head reports/v2.json (v2)
tarefa              base   head   delta  status
----------------------------------------------------
t1-total            1.00   1.00   +0.00  estável
t2-pending          1.00   1.00   +0.00  estável
t3-no-orderid       0.00   1.00   +1.00  corrigido fail => pass
t4-refund-note      0.67   1.00   +0.33  corrigido fail => pass
t5-missing-order    1.00   1.00   +0.00  estável
----------------------------------------------------
Taxa de aprovação 3/5 -> 5/5

Nenhuma tarefa passou de pass para fail.
exit code=0
```

Troque os dois arquivos, simulando “a versão nova reverteu as mudanças da v2”, e o caminho de saída diferente de zero também funciona:

```text
$ node compare.mjs reports/v2.json reports/v1.json
base reports/v2.json (v2)  ->  head reports/v1.json (v1)
tarefa              base   head   delta  status
----------------------------------------------------
t1-total            1.00   1.00   +0.00  estável
t2-pending          1.00   1.00   +0.00  estável
t3-no-orderid       1.00   0.00   -1.00  regressão pass => FAIL
t4-refund-note      1.00   0.67   -0.33  regressão pass => FAIL
t5-missing-order    1.00   1.00   +0.00  estável
----------------------------------------------------
Taxa de aprovação 5/5 -> 3/5

2 tarefas passaram de pass para fail: t3-no-orderid, t4-refund-note
exit code=1
```

Dois detalhes de implementação que vale a pena guardar. Um é alinhar por `id` e não por índice — o Map `wasById` faz isso, e assim, quando você inserir uma tarefa nova no conjunto de avaliação mais adiante, os relatórios antigos continuam comparáveis. O outro é o julgamento de regressão usar `was.pass && !now.pass`, e não um limiar de nota: o `t4` caindo de 1.00 para 0.67 é queda de nota **e** cruzou a linha de aprovação de 0.8 do juiz, e as duas condições atendidas é que fazem a regressão; se um dia a rubrica for ajustada e a linha de aprovação acompanhar, este código não precisa mudar.

<!-- /exercises -->

## Recapitulação

- O formato padrão para rodar evals é chamadas programáticas diretas à API mais loops agênticos simples — **uma tarefa de eval por loop**; as tarefas não compartilham `messages`, senão o contexto da tarefa anterior contamina a seguinte e os resultados deixam de ser comparáveis[^S3].
- Cada prompt de eval deve vir emparelhado com um resultado verificável; os verificadores formam um espectro que vai da comparação exata de strings até pedir ao modelo que julgue — o que puder ser corrigido por código nunca vai para um juiz, porque a correção por código é a mais rápida e mais confiável e escala muitíssimo bem[^S3][^S5].
- Texto livre vai para o juiz; o formato é uma única chamada, um único prompt, saída de nota de 0.0 a 1.0 mais aprovado/reprovado; a rubrica precisa raciocinar primeiro e pontuar depois, com formato de saída travado[^S2][^S5].
- Além da taxa de aprovação, os relatórios precisam registrar duração da tarefa, número de chamadas de ferramenta, consumo de tokens e erros de ferramenta; essas colunas se autoexplicam — chamadas redundantes apontam para parâmetros de paginação/volume de retorno precisando de ajuste, e erros de parâmetro inválido apontam para descrições de ferramenta precisando de clareza[^S3].
- Verificadores estritos demais rejeitam respostas corretas: formato, pontuação e formulações diferentes razoáveis podem todos derrubar uma comparação literal; faça normalização antes do casamento exato[^S3][^S5]. A nota mudou mas o sistema sob teste não — a culpa é do verificador.
- Com uma trilha, o impacto de uma mudança de prompt vira mensurável; até refinamentos pequenos podem render melhorias dramáticas; os efeitos no início são grandes, e poucos casos bastam para enxergar diferenças[^S3][^S2]. O próprio relatório é evidência revisável por outra pessoa, mais rápida do que refazer a verificação, e funciona para sessões que você não estava acompanhando[^S4].
- Siga os relatórios para mudar prompts e as notas vão subir, mas a subida pode ser só neste lote de tarefas; tranque o conjunto held-out para impedir overfitting[^S3]. Os evals automatizados têm pontos cegos; testadores humanos ainda pegam casos extremos que os evals deixam passar[^S2].

## Depois de concluir este curso

Olhando para trás, a linha principal é curta. A Lição 1 separou “parece pronto” de “está pronto” — sem verificações executáveis, “parece pronto” é o único sinal disponível, e você vira a etapa de verificação[^S4]. A Lição 2 fixou o que verificar: agentes podem percorrer caminhos razoáveis completamente diferentes até o mesmo objetivo, então avalie o estado final, não confira a trajetória etapa por etapa[^S2]. A Lição 3 transformou “verificações” em verificadores determinísticos executáveis que produzem passa/falha, e também alertou que verificadores estritos demais rejeitam respostas corretas[^S3]. A Lição 4 cuidou do texto livre — rubricas, formato de saída, e o modelo que trabalhou não deve se corrigir[^S2][^S4]. A Lição 5 resolveu “com quantos casos verificar”: umas vinte tarefas reais já dão para começar, não espere acumular centenas para começar[^S2]. Esta lição soldou as cinco primeiras num arquivo de trezentas linhas.

Esse arquivo não é complexo, roda em menos de dois segundos, mas o que ele muda é concreto: a partir de hoje, quando você mudar uma versão de prompt, não vai depender de “ler alguns parágrafos de saída e sentir que melhorou” para julgar — rode um comando, e a tabela de variação de v1 para v2 fala por você, exatamente como desta vez, em que o `t3` e o `t4` ficaram verdes enquanto os outros três permaneceram estáveis. Da próxima vez que o seu agente disser “pronto”, você tem dois comandos e um código de saída para verificar essa afirmação.

Da próxima vez que o seu agente disser “pronto”, você tem uma trilha executável para verificar.

