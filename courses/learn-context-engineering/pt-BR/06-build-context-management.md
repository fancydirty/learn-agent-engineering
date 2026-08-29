# Lição 6: Prática: ligando a gestão de contexto ao harness

> Objetivos de aprendizado:
> - Ligar o rastreamento de uso de tokens a um loop de harness dirigido por stop_reason: acumular com `response.usage`, decidir se o contexto está se aproximando do limite da janela
> - Transformar o `compact()` da Lição 4 em um mecanismo disparado por limiar: definir a razão de disparo, pensar até o fim como `messages` e o contador de uso devem ser redefinidos depois do disparo
> - Ligar notas estruturadas a esse fluxo de compactação, de modo que o `NOTES.md` seja lido de volta sempre que uma janela nova reiniciar, e rodar uma tarefa que excede a capacidade de uma única janela
>
> Pré-requisitos: Você concluiu a Lição 4 sobre compactação e notas, a Lição 5 sobre isolamento de subagentes, e tem à mão o loop de harness do curso 7 desta série, “Fundamentos do Harness de Agente: Laços e Controle” | Anterior: [Lição 5 <<](./05-subagent-context-isolation.md)

## Primeiro, veja rodando

As primeiras cinco lições foram todas de princípios: por que o contexto é um recurso finito, como a compactação funciona, como as notas funcionam, como os subagentes isolam. Esta lição solda os dois primeiros — compactação e notas — ao loop de harness que você escreveu no curso 7 desta série. Primeiro veja como fica rodando, depois desembrulhamos o código.

Abaixo está um registro de execução real (usando um cliente stub para simular respostas de modelo em vários turnos, de modo que uma tarefa longa caiba em poucas linhas de log; a implementação do cliente stub aparece no fim desta lição). A tarefa é aquele cenário familiar da Lição 4: corrigir um bug de corrida por concorrência em um serviço de pedidos. Para disparar a compactação em poucos turnos, a demonstração define deliberadamente uma janela de contexto minúscula:

```text
[chamada 1] stop_reason=tool_use tokensUsed=400
[chamada 2] stop_reason=tool_use tokensUsed=1050
[chamada 3] stop_reason=tool_use tokensUsed=1850
[chamada 4] >>> compactação disparada (1ª vez), tokensUsed zerado
[chamada 5] stop_reason=tool_use tokensUsed=280
[chamada 6] stop_reason=end_turn tokensUsed=490

Resposta final: Adicionado o campo version à tabela orders e conectado o lock otimista; bug de corrida corrigido.
Total de chamadas ao modelo: 6 (incluindo 1 chamada de compactação)
Disparos de compactação: 1

Conteúdo final do NOTES.md:
## Decisões tomadas
- Abordagem de correção: lock otimista no banco de dados (adicionar campo version à tabela orders)
## Não resolvidos
- (nenhum -- corrida em updateStatus resolvida com o merge do lock otimista)
```

Leia linha a linha: as três primeiras chamadas empurram `tokensUsed` de 400 para 1050 e para 1850; depois que os resultados de ferramenta da terceira rodada são anexados ao histórico, o valor acumulado cruza o limiar definido, então o harness não espera a janela de fato estourar — ele dispara proativamente uma chamada de compactação (chamada 4; o `stop_reason` deixa de importar porque essa resposta nunca entra no loop principal, sua saída é usada diretamente para reiniciar `messages`); `tokensUsed` volta a zero; as duas rodadas seguintes contam do zero na janela nova até o modelo encerrar. O processo inteiro tem apenas um artefato visível ao usuário — aquela resposta final; compactação e notas acontecem nos bastidores. O resto desta lição é construir, linha por linha, o código por trás daquele log.

## I. Ligue o rastreamento de uso de tokens ao loop

O primeiro passo é direto: saber quantos tokens você usou até agora, porque esse é o pré-requisito para decidir se compacta. Você já usou este campo quando escreveu a válvula de orçamento (válvula 2) no curso 7 desta série — `response.usage` carrega `input_tokens` e `output_tokens` desta chamada, e a cada resposta recebida você os soma a um acumulador:

```javascript
function trackUsage(tokensUsed, response) {
  return tokensUsed + response.usage.input_tokens + response.usage.output_tokens;
}
```

A válvula `TOKEN_BUDGET` do curso 7 usava esse valor acumulado para uma coisa só: parar ao bater no teto. Esta lição faz outra coisa: compactar proativamente a uma razão bem mais cedo e continuar trabalhando, em vez de parar. As duas usam o mesmo acumulador; o que acontece depois do disparo é completamente diferente — uma freia, a outra respira fundo.

Qual é o tamanho da janela em si? Isso é uma constante que você define com seu próprio julgamento de engenharia:

```javascript
const CONTEXT_WINDOW = 2000; // janela pequena de demonstração, para disparar em poucos turnos; em projetos reais use o limite real do seu modelo
const COMPACT_RATIO = 0.7;   // limiar: compactar quando o uso exceder 70% da janela

function shouldCompact(tokensUsed) {
  return tokensUsed >= CONTEXT_WINDOW * COMPACT_RATIO;
}
```

Não existe resposta padrão para quanto deve valer `COMPACT_RATIO` — é um julgamento de engenharia, não uma cláusula de especificação. Defina-o alto demais e, quando você perceber que “é hora de compactar”, a janela pode estar tão apertada que nem dá para enviar a próxima requisição; defina-o baixo demais e a compactação vai interromper a tarefa mais cedo e mais vezes do que deveria, desperdiçando chamadas de modelo. Como regra prática, deixar cerca de 30% de folga (ou seja, um limiar de 0,7) costuma funcionar; o número específico deve ser ajustado com base no tamanho real da janela do seu modelo e no volume das saídas de ferramenta de um turno.

## II. Compactação disparada por limiar: ligue o `compact()` da Lição 4 ao loop

Com o mecanismo definido, o passo seguinte é ligá-lo ao corpo do loop. Lembre da conclusão da Lição 4: a compactação não entulha um resumo de volta na conversa antiga e continua espremendo — ela **reinicia** uma janela nova com o resumo, abandonando o `messages` antigo por inteiro[^S1]. Ligado ao loop, isso significa substituir `messages` no momento certo:

```javascript
while (response.stop_reason === "tool_use") {
  messages = await appendToolResults(messages, response, toolImpls); // reaproveita o auxiliar da Lição 5

  if (shouldCompact(tokensUsed)) {
    messages = await compact(client, messages); // reinício: substitui por atacado
    tokensUsed = 0;                              // janela nova, conta do zero
  }

  response = await client.messages.create({ model: MODEL, max_tokens: 1024, tools, messages });
  tokensUsed = trackUsage(tokensUsed, response);
}
```

Três posições determinam se este código está correto:

- **Onde a verificação fica**: imediatamente depois que os resultados de ferramenta desta rodada são anexados a `messages`, antes do próximo `client.messages.create`. Cedo demais (verificar antes de anexar) perde as saídas de ferramenta recém-produzidas; tarde demais (anexar depois de verificar) envia conteúdo já acima do limiar em uma requisição extra.
- **Depois da compactação, `messages` é substituído por atacado, não acrescido**: o valor de retorno de `compact()` é atribuído diretamente a `messages`, e o array antigo com suas dezenas de idas e vindas de ferramenta é descartado — essa é a fronteira entre “reiniciar” e “continuar empilhando na conversa antiga”.
- **`tokensUsed` tem de voltar a zero**: a janela nova parte de um resumo, então o uso deve ser contado a partir desse resumo, e não continuar carregando o valor acumulado da janela antiga. Pular esse passo é uma armadilha comum; os exercícios desta lição vão diagnosticá-la especificamente.

O `compact()` em si reaproveita a implementação da Lição 4; a `COMPACT_INSTRUCTION` e os princípios de triagem (preservar decisões arquiteturais, bugs não resolvidos e detalhes de implementação importantes; descartar saídas de ferramenta redundantes) permanecem os mesmos[^S1]. A próxima seção acrescenta a ele uma capacidade nova: no reinício, ler não só o resumo, mas também o `NOTES.md`.

## III. Notas estruturadas como rede de segurança: o NOTES.md é lido de volta durante a compactação

A compactação é passiva e a posteriori — ela resume “o que sobrou na janela no momento do disparo”. A Lição 4 já explicou que as notas são um seguro ativo, escrito conforme se avança: o agente escreve decisões e problemas em um `NOTES.md` fora da janela no instante em que eles acontecem[^S1]. O jeito de ligar os dois é direto: **quando uma janela nova reinicia, além de ler o resumo, leia também o `NOTES.md` de volta** — assim, mesmo que a triagem do resumo desta rodada tenha errado, as notas ainda têm uma cópia de segurança independente.

Primeiro, dê ao agente uma ferramenta para escrever notas:

```javascript
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const NOTES_PATH = path.join(process.cwd(), "NOTES.md");

async function readNotes() {
  try {
    return await readFile(NOTES_PATH, "utf8");
  } catch {
    return "(NOTES.md ainda está vazio)";
  }
}

async function writeNotes(content) {
  await writeFile(NOTES_PATH, content, "utf8");
}

const NOTES_TOOL = {
  name: "update_notes",
  description: "Sobrescreve o NOTES.md com o conteúdo completo que você quer salvar, para registrar decisões arquiteturais, questões não resolvidas, planos de próximo passo",
  input_schema: {
    type: "object",
    properties: { content: { type: "string" } },
    required: ["content"],
  },
};

const toolImpls = {
  update_notes: async ({ content }) => {
    await writeNotes(content);
    return "NOTES.md atualizado";
  },
  // ...suas outras ferramentas
};
```

O `input` de `update_notes` é o conteúdo **completo** da nota a salvar, e a implementação o escreve por atacado — esta é a semântica mais simples: o agente mantém um corpo de notas completo e toda atualização significa “este é o estado atual”, sem nenhuma fusão incremental a resolver. Ligue um requisito ao system prompt: “Sempre que tomar uma decisão importante, descobrir um problema novo ou concluir uma fase, chame `update_notes` para atualizar as notas antes de continuar”, exatamente como na Lição 4.

Vem então o passo novo desta lição: depois que `compact()` gera o resumo, ele também lê o `NOTES.md` para dentro da mensagem de reinício:

```javascript
async function compact(client, messages) {
  const resp = await client.messages.create({
    model: MODEL,
    max_tokens: 2000,
    messages: [{
      role: "user",
      content: COMPACT_INSTRUCTION + "\n\n" + formatHistory(messages),
    }],
  });
  const summary = resp.content.find((b) => b.type === "text").text;
  const notes = await readNotes(); // novo: traz junto as notas de fora da janela
  return [{
    role: "user",
    content:
      "Abaixo está um resumo de repasse do trabalho anterior; continue a partir daqui:\n\n" + summary +
      "\n\nAbaixo está o conteúdo atual do NOTES.md:\n" + notes,
  }];
}
```

Quando a janela nova acorda, ela tem dois materiais: o resumo do próprio modelo e as notas que o agente escreveu à mão. O primeiro pode perder detalhe por causa da triagem do resumo; as segundas são sem perdas — isso é o “quanto mais diligentes as notas, mais leve a consequência de a compactação deixar algo cair” da Lição 4 em forma de código.

```agentmentor-check
{
  "id": "ctx-zh-06-notes-every-turn",
  "label": "Avaliar uma proposta de enfiar o NOTES.md no system prompt de todo turno",
  "prompt": "Depois de ver o código em que compact() “lê o NOTES.md uma vez no reinício”, um colega propõe ir além: basta colocar o texto completo do NOTES.md no system prompt para que ele saia em toda requisição, e assim o modelo sempre enxerga as notas mais recentes sem esperar a compactação disparar. O que você acha dessa proposta?",
  "whyHere": "O bloco de código anterior acabou de demonstrar “ler as notas uma vez no momento do reinício da compactação”; se quem aprende não perceber que isso é deliberado, é fácil pensar “não seria mais seguro levar as notas junto em todo turno” — aqui é preciso testar se quem aprende entende que externalizar notas significa não ocupar a janela, e não deixar o conteúdo sempre visível.",
  "mode": "single",
  "choices": [
    {
      "id": "a",
      "text": "Mais completo e mais seguro: as notas não são tão grandes assim, e levá-las junto em todo turno garante nenhuma perda de informação, sem contrapartida",
      "correct": false,
      "feedback": "“Não tão grandes assim” é relativo: as notas vão crescer conforme a tarefa avança, e o system prompt é conteúdo enviado de novo a cada turno. Enfiá-lo no system prompt de todo turno significa que o volume inteiro das notas consome orçamento de atenção repetidamente ao longo da tarefa — e externalizar notas significa precisamente mover esse estado para fora da janela, buscando-o apenas quando necessário."
    },
    {
      "id": "b",
      "text": "Não recomendado: cada novo token esgota parte do orçamento de atenção, e externalizar as notas significa que elas não ocupam a janela; ler uma vez no momento genuíno de reinício é mais econômico do que carregá-las em todo turno",
      "correct": true,
      "feedback": "Pegou o ponto central. As notas são escritas fora da janela precisamente para não ocuparem o orçamento de atenção de cada turno; cada novo token esgota parte desse orçamento. O reinício da compactação é o momento em que a janela genuinamente “trocou por um lote novo de memória”, e nesse ponto ler as notas uma vez é um custo razoável; enfiar o mesmo conteúdo repetidamente em todo turno é como mover o “externo” de volta para “interno” — conforme as notas ficam mais longas, o custo vira bola de neve."
    },
    {
      "id": "c",
      "text": "Tanto faz: as notas e o resumo vão ser resumidos de novo pela próxima compactação de qualquer jeito, então quantas vezes você as lê não afeta o resultado final",
      "correct": false,
      "feedback": "O custo aqui não é “o resultado final está certo”, e sim “quanto orçamento de atenção você gasta para chegar a esse resultado”. Carregar o texto completo das notas em todo turno é um custo real de tokens e de orçamento por turno, separado de alguma compactação futura vir a resumi-las — antes de a compactação acontecer, as cópias redundantes das notas já vinham derrubando de forma constante a densidade de atenção."
    }
  ]
}
```

## IV. Junte tudo: uma tarefa que excede a capacidade de uma única janela

Três componentes — rastreamento de uso, compactação disparada por limiar, leitura e escrita do `NOTES.md` — ligados ao mesmo `runAgent` produzem o código completo por trás do log de abertura:

```javascript
import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic();
const MODEL = "claude-sonnet-5";

async function runAgent(userInput, tools, toolImpls, opts = {}) {
  let messages = [{ role: "user", content: userInput }];
  let tokensUsed = 0;

  let response = await client.messages.create({
    model: MODEL, max_tokens: 1024, tools, messages,
  });
  tokensUsed = trackUsage(tokensUsed, response);

  while (response.stop_reason === "tool_use") {
    messages = await appendToolResults(messages, response, toolImpls);

    if (shouldCompact(tokensUsed)) {
      messages = await compact(client, messages);
      tokensUsed = 0;
      opts.onCompact?.();
    }

    response = await client.messages.create({
      model: MODEL, max_tokens: 1024, tools, messages,
    });
    tokensUsed = trackUsage(tokensUsed, response);
  }

  return response.content.find((b) => b.type === "text")?.text ?? "";
}
```

Esta é a origem completa do log de abertura: três chamadas de ferramenta empurram `tokensUsed` de 400 para 1050 e para 1850, cruzando a linha de limiar `2000 * 0.7 = 1400`; `compact()` é chamado, `messages` é substituído por atacado, o contador volta a zero; então mais duas rodadas na janela nova, e o modelo encerra. Só uma compactação aconteceu na execução inteira, mas se a tarefa continuasse e batesse no limiar de novo, a mesma lógica dispararia uma segunda, uma terceira vez — `shouldCompact` não se importa com qual janela é esta, ele só olha o uso da janela atual. É isso que “rodar uma tarefa que excede a capacidade de uma única janela” significa: o comprimento total da tarefa não é limitado pela capacidade de nenhuma janela isolada, apenas limitado por “uma inferência contínua e ininterrupta”.

Para rodar uma verificação completa, conecte um cliente stub que simula respostas de modelo em vários turnos (troque-o por `new Anthropic()` em chamadas reais; o código de `runAgent` não muda um caractere):

```javascript
let callIndex = 0;
const queue = [ /* ...respostas na ordem das chamadas, onde a 4ª é a resposta da própria compactação... */ ];

const stubClient = {
  messages: {
    create: async () => queue[callIndex++],
  },
};
```

O valor de verificar com um cliente stub assim é que ele fixa “o modelo vai chamar ferramentas neste turno, quantos tokens ele usou” como quantidades conhecidas, de modo que se a compactação dispara e em qual turno, se `tokensUsed` volta a zero, se o `NOTES.md` é escrito e depois lido de volta — tudo pode ser checado com asserções em vez de apertar os olhos para a saída de chamadas reais e adivinhar.

## Senso de proporção: nem toda tarefa precisa desse maquinário

Depois de ligar tudo isso, é fácil desenvolver uma impressão falsa: de agora em diante, escrever agentes deveria incluir por padrão o pacote de rastreamento de uso, compactação por limiar e notas estruturadas. Volte ao senso de proporção estabelecido na Lição 2: considere adicionar complexidade apenas quando isso puder melhorar comprovadamente os resultados[^S2]. Para tarefas que terminam em uma dúzia de turnos, compactação e notas são ambas peças supérfluas — comece pelo loop pelado mais as válvulas de controle básicas do curso 7 desta série, e só acrescente esta camada quando você de fato bater no limite da janela ou vir sintomas de amnésia do tipo “a janela nova não sabe o que a janela antiga fez”.

Neste ponto, tudo o que este curso ensinou da Lição 1 à Lição 6 — orçamento de atenção, altitude dos system prompts, recuperação sob demanda, compactação e notas, isolamento de subagentes — converge para a mesma lição: o que o modelo deve ver a cada turno é sempre um julgamento de engenharia que você revisita continuamente, não uma configuração única que você define e esquece.

<!-- exercises -->
## 💻 Exercícios

### Nível 1: Rastreie quando a compactação dispara

Um harness está configurado com `CONTEXT_WINDOW = 6000` e `COMPACT_RATIO = 0.75`. Depois que a tarefa roda, o uso por turno (soma de `input_tokens + output_tokens`) de quatro turnos consecutivos é: 1200, 1500, 900, 1100. Responda:

1. Depois de qual turno a compactação será disparada? Qual é o `tokensUsed` acumulado no momento do disparo?
2. Depois que a compactação dispara e se completa, quanto deve valer `tokensUsed`?
3. Se a chamada de modelo imediatamente seguinte à compactação retorna `usage = { input_tokens: 300, output_tokens: 100 }`, quanto passa a valer `tokensUsed`?

<!-- rubric -->
- Calcula corretamente o limiar como `6000 * 0.75 = 4500`, e acumula corretamente o uso dos quatro turnos: 1200, 2700, 3600, 4700, apontando que depois do turno 4 o valor acumulado 4700 alcança/excede o limiar pela primeira vez, então a compactação dispara nesse ponto
- Afirma claramente que, depois de a compactação se completar, `tokensUsed` deve voltar a 0, porque o uso da janela nova deve ser contado a partir deste resumo, e não carregar o valor acumulado da janela antiga
- Calcula corretamente a primeira chamada depois do reset como `tokensUsed = 0 + 300 + 100 = 400`

<!-- answer -->
1. Acumulando turno a turno: depois do turno 1: 1200, depois do turno 2: 2700, depois do turno 3: 3600, depois do turno 4: 4700. O limiar é `6000 * 0.75 = 4500`, e 4700 é o primeiro valor acumulado entre os quatro que alcança/excede o limiar, então a compactação dispara **depois do turno 4**, com `tokensUsed` acumulado em **4700**.
2. A compactação substitui `messages` por atacado pela mensagem de reinício que `compact()` devolve; a janela nova parte do zero a partir desse resumo (mais o `NOTES.md`), então `tokensUsed` deve voltar a **0** — ele não deveria continuar carregando os 4700 da janela antiga, senão a verificação do turno seguinte vai sempre achar por engano que “a janela já está muito cheia”.
3. A primeira chamada depois do reset retorna `usage = { input_tokens: 300, output_tokens: 100 }`, então `tokensUsed = 0 + 300 + 100 = 400`.

<!-- hint -->
Acumule honestamente o uso dos quatro turnos em uma sequência de somas parciais, depois compare cada uma com o limiar `6000 * 0.75` para achar a primeira posição que cruza a linha.

<!-- hint -->
O “reinício” da compactação não significa apenas trocar o array de mensagens; o contador de uso também deveria ganhar um novo ponto de partida — pense no que ele de fato conta: “uso histórico total” ou “uso da janela atual”.

### Nível 2: Diagnostique uma “tempestade de compactação”

Alguém ligou a compactação disparada por limiar ao loop, mas esqueceu uma linha:

```javascript
while (response.stop_reason === "tool_use") {
  messages = await appendToolResults(messages, response, toolImpls);

  if (shouldCompact(tokensUsed)) {
    messages = await compact(client, messages);
    // falta tokensUsed = 0
  }

  response = await client.messages.create({ model: MODEL, max_tokens: 1024, tools, messages });
  tokensUsed = trackUsage(tokensUsed, response);
}
```

Depois de ligar isso, a tarefa rodou até algum turno em que a compactação disparou pela primeira vez; mas daí em diante, todo turno dispara a compactação de novo, mesmo que a janela nova tenha passado por apenas um ou dois turnos e acumulado muito pouco conteúdo. Explique por que isso acontece e forneça a correção.

<!-- rubric -->
- Aponta a causa-raiz: `tokensUsed` é um acumulador sempre crescente; no primeiro disparo da compactação ele já tinha alcançado ou excedido o limiar; sem o reset, todo `trackUsage` seguinte apenas continua somando por cima, então `shouldCompact(tokensUsed)` é verdadeiro do primeiro disparo em diante
- Explica a consequência: todo turno dispara outro `compact()` (desperdiçando uma chamada de modelo), enquanto o uso real da janela nova está longe do limiar; a compactação fica mais frequente do que deveria, desperdiçando chamadas e potencialmente atrasando a tarefa
- Correção: acrescentar uma linha `tokensUsed = 0` depois de `compact()` ter sucesso, de modo que a semântica do contador permaneça “uso da janela atual” em vez de “uso histórico total”

<!-- answer -->
A causa-raiz é que `shouldCompact` verifica `tokensUsed`, um acumulador sempre crescente. No momento em que a primeira compactação dispara, `tokensUsed` já tinha alcançado ou excedido o limiar; `compact()` troca `messages` por uma janela nova e limpa, mas o código esqueceu de trazer `tokensUsed` de volta a um ponto de partida compatível com a janela nova. Assim, o `trackUsage(tokensUsed, response)` seguinte apenas soma mais a esse número já acima do limiar — não importa quantos tokens o turno da janela nova de fato acrescentou, `shouldCompact(tokensUsed)` é permanentemente verdadeiro do primeiro disparo em diante. O resultado é: mesmo quando a janela nova passou por apenas um ou dois turnos com muito pouco conteúdo, a verificação seguinte no topo do loop ainda acerta, então ela chama `compact()` de novo, e de novo. Toda compactação redundante é uma chamada de modelo extra; a tarefa deveria estar progredindo, mas em vez disso fica girando no lugar, “resume, reinicia, resume de novo”.

A correção é só recolocar a linha do reset:

```javascript
if (shouldCompact(tokensUsed)) {
  messages = await compact(client, messages);
  tokensUsed = 0; // janela nova, conta do zero
}
```

Uma vez acrescentada, a semântica de `tokensUsed` passa a ser “quanto a janela atual já usou”, e a compactação só dispara de novo quando a própria janela nova também acumula o uso do limiar, sem ser arrastada pelo número histórico da janela antiga.

<!-- hint -->
`shouldCompact` apenas compara `tokensUsed` com um limiar fixo. No momento em que a compactação dispara, `tokensUsed` está maior ou menor em relação ao limiar? Se ele nunca for reduzido depois disso, qual será o resultado de toda comparação seguinte?

<!-- hint -->
Consulte o Nível 1: depois que a compactação se completa, o que `tokensUsed` deveria representar? É “uso total do início da tarefa até agora” ou “uso da janela atual”? Este bug é exatamente a mistura dessas duas semânticas.

<!-- /exercises -->

## Recapitulação

- Ligar o rastreamento de uso ao harness precisa só de um acumulador: a cada resposta recebida, some `response.usage.input_tokens + response.usage.output_tokens`; ele compartilha os mesmos dados com a válvula `TOKEN_BUDGET` do curso 7, mas a ação depois do disparo difere — a válvula de orçamento para ao encher; o limiar desta lição compacta e continua trabalhando.
- A compactação disparada por limiar liga o `compact()` da Lição 4 ao corpo do loop: a verificação fica em “resultados de ferramenta desta rodada totalmente anexados, antes de a próxima requisição sair”; depois do disparo, `messages` é substituído por atacado pelo resultado da compactação — é um reinício, não um acréscimo[^S1]; `tokensUsed` tem de ser redefinido em sincronia, senão você cai em uma tempestade de compactações repetidas.
- Notas e compactação se ligam nesta lição: a ferramenta `update_notes` escreve conforme se avança — isso é persistir notas fora da janela de contexto[^S1] — e `compact()` lê o `NOTES.md` de volta para a mensagem de reinício além de gerar o resumo; o resumo pode perder conteúdo por causa da triagem, as notas são lidas de volta como uma cópia sem perdas. “Ler uma vez só em momentos críticos como o reinício da janela, não enfiar no system prompt de todo turno” é o trade-off de engenharia desta lição, baseado no princípio do orçamento de atenção (cada novo token esgota esse orçamento[^S1]).
- Uma verificação real de ponta a ponta mostra: três chamadas de ferramenta empurram o uso de 400 para 1850, cruzam o limiar e disparam uma compactação, o contador volta a zero, e então mais duas rodadas encerram — o comprimento total da tarefa deixa de ser limitado pela capacidade de uma única janela, ficando limitado apenas por “uma inferência contínua e ininterrupta”.
- Não trate este maquinário como configuração padrão: só o acrescente quando a complexidade extra puder melhorar comprovadamente os resultados[^S2]; para tarefas que terminam em poucos turnos, o loop pelado mais as válvulas de controle básicas do curso 7 desta série bastam.
