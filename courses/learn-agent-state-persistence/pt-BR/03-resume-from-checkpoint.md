# Lição 3: Retomando de um checkpoint: reiniciando o loop

> Objetivos de aprendizado:
> - Dizer por que uma “chamada órfã” fatalmente aparece em um cenário de recuperação de queda, e como ela é coisa diferente de uma falha comum de execução de ferramenta
> - Escrever o caminho completo de retomada, do `loadCheckpoint()` de volta ao loop, incluindo checagem de versão e reconstrução do estado
> - Reconciliar uma chamada órfã pela natureza da ferramenta — ferramentas somente leitura reexecutam direto, ferramentas de alto impacto recorrem antes ao fallback — em vez de reexecutar às cegas ou apagar às cegas
>
> Pré-requisitos: Conclua a Lição 2 e entenda os campos do `checkpoint.json` e os dois pontos de gravação | Anterior: [Lição 2 <<](./02-checkpoint-anatomy.md) | Próxima: [Lição 4 >>](./04-side-effects-idempotency.md)

## Retome, não recomece

Um agente cai na metade do caminho, e o primeiro instinto costuma ser rodá-lo de novo. Mas para uma tarefa longa que já avançou uma dúzia de turnos e chamou ferramentas várias vezes, recomeçar é uma péssima troca: "restarts are expensive and frustrating for users"[^S1] (reinícios são caros e frustrantes para os usuários). A Lição 2 gravou a cena de execução em `checkpoint.json` — `version`, `task`, `turns`, `tokensUsed`, `messages`, `pendingToolUse` — salvando uma vez depois que o modelo responde (ponto de gravação A) e uma vez depois que o resultado da ferramenta é registrado (ponto de gravação B). O que esta lição faz é transformar essa cena salva de volta em um loop que consegue avançar: construir um sistema capaz de "resume from where the agent was when the errors occurred"[^S1] (retomar de onde o agente estava quando os erros aconteceram) em vez de recomeçar do topo toda vez.

## A espinha da retomada: uma metade é fácil

Comece pela metade fácil. A espinha da retomada são quatro etapas: ler o arquivo, passá-lo por `JSON.parse`, checar `version` e espalhar os campos de volta no estado de execução. Cumpridas essas quatro, o `runAgent` não precisa reconstruir um array `messages` inicial — o checkpoint já guarda um completo, então ele pula a inicialização e cai direto no loop.

```javascript
import { readFileSync, writeFileSync, renameSync, existsSync } from "node:fs";

const CHECKPOINT_PATH = "./checkpoint.json";
const CHECKPOINT_VERSION = 1;
const MAX_TURNS = 40;

function saveCheckpoint(state) {
  const tmpPath = `${CHECKPOINT_PATH}.tmp`;
  writeFileSync(tmpPath, JSON.stringify(state, null, 2));
  renameSync(tmpPath, CHECKPOINT_PATH); // .tmp + rename: uma gravação estragada não corrompe o último checkpoint utilizável
}

function loadCheckpoint() {
  if (!existsSync(CHECKPOINT_PATH)) return null;
  const raw = JSON.parse(readFileSync(CHECKPOINT_PATH, "utf8"));
  if (raw.version !== CHECKPOINT_VERSION) {
    throw new Error(`Versão de checkpoint incompatível: o arquivo é v${raw.version}, o código é v${CHECKPOINT_VERSION}`);
  }
  return raw; // { version, task, turns, tokensUsed, messages, pendingToolUse }
}
```

Com essas duas funções no lugar, o topo do `runAgent` vira um desvio simples:

```javascript
async function runAgent(task) {
  const cp = loadCheckpoint();

  let state;
  if (cp) {
    // Retomada: o estado vem do checkpoint; pendingToolUse será tratado daqui a pouco
    state = cp.pendingToolUse ? await reconcile(cp) : cp;
  } else {
    // Começo do zero: escreva à mão a primeira mensagem do usuário, zere o resto
    state = {
      version: CHECKPOINT_VERSION,
      task,
      turns: 0,
      tokensUsed: 0,
      messages: [{ role: "user", content: task }],
      pendingToolUse: null,
    };
  }

  while (state.turns < MAX_TURNS) {
    state.turns++;
    const response = await client.messages.create({ messages: state.messages });
    state.tokensUsed = response.usage.input_tokens + response.usage.output_tokens;
    state.messages.push({ role: "assistant", content: response.content });

    const toolUseBlock = response.content.find((b) => b.type === "tool_use");
    state.pendingToolUse = toolUseBlock
      ? { id: toolUseBlock.id, name: toolUseBlock.name, input: toolUseBlock.input }
      : null;
    saveCheckpoint(state); // Ponto de gravação A: depois da resposta do modelo

    if (response.stop_reason !== "tool_use") break;

    const output = await executeTool(toolUseBlock.name, toolUseBlock.input);
    state.messages.push({
      role: "user",
      content: [{ type: "tool_result", tool_use_id: toolUseBlock.id, content: output }],
    });
    state.pendingToolUse = null;
    saveCheckpoint(state); // Ponto de gravação B: depois que o resultado da ferramenta é registrado
  }

  return state;
}
```

Depois de retomar, a primeira coisa que o loop faz é exatamente o que ele sempre faz: pegar `state.messages` e disparar o próximo `client.messages.create()`. As `messages` que o modelo vê são idênticas ao que ele via antes da queda — ele não faz ideia de que houve um reinício de processo no meio. É por isso que a Lição 2 insistiu que `messages` entrasse no checkpoint intocado: enquanto esse array for restaurado fielmente, a retomada é invisível para o modelo.

## A metade difícil: reconciliar uma chamada órfã

O problema de verdade é o checkpoint em que `state.pendingToolUse` não é `null`. Lembre onde ficam os dois pontos de gravação: o ponto A vem depois da resposta do modelo, e nesse momento `pendingToolUse` guarda o `{id, name, input}` desta resposta; o ponto B vem depois que o resultado da ferramenta é registrado, e `pendingToolUse` é zerado de volta para `null`. Se o processo morre bem entre A e B — a ferramenta ainda não rodou, ou ela terminou mas o resultado nunca chegou a `messages` — o que o checkpoint guarda é um `pendingToolUse` que não é `null`.

Agora a cauda de `messages` é uma mensagem `assistant` carregando um bloco `tool_use`, sem nenhum `tool_result` correspondente. Este não é um estado no qual dê para ir empurrando: o protocolo exige que você "return one tool_result for each tool_use block, all together in the next user message"[^S4] (retorne um tool_result para cada bloco tool_use, todos juntos na próxima mensagem do usuário). Sem aquele único resultado, a retomada não consegue nem fazer a chamada seguinte — o que o modelo vê é uma troca pela metade, na qual ele disparou uma chamada de ferramenta e nunca vai receber resposta. Essa chamada órfã tem que ser resolvida antes de reentrar no loop.

## Três formas de lidar com isso, só uma se sustenta

Diante dessa mensagem `assistant` órfã, há três jogadas óbvias, mas só uma de fato se sustenta.

**Jogada um: apagar a mensagem `assistant` de `messages` e fingir que ela nunca aconteceu.** Parece a mais limpa — a conversa retomada não tem mais nenhuma lacuna. Mas o custo vem em duas camadas. Primeira: o modelo esquece uma decisão que já tinha tomado, então pode refazer a mesma exploração inteira e queimar um turno à toa. Segunda, e mais perigosa: se aquela chamada de ferramenta de fato já tinha rodado, e o processo simplesmente morreu antes de registrar o resultado, apagar a mensagem não desfaz o efeito colateral que já aconteceu — só faz o modelo, e toda entrada de log posterior, deixarem de saber que ele aconteceu. Apagar esconde o fato, não o risco.

**Jogada dois: simplesmente reexecutar a ferramenta e preencher o resultado em um `tool_result`.** Para uma ferramenta somente leitura (`read_file`, `grep` e afins) isso é exatamente o certo — ler duas vezes não é diferente de ler uma, o efeito colateral é zero. Para uma ferramenta de alto impacto (enviar e-mail, gravar em banco de dados) é perigoso: a ferramenta muito provavelmente já rodou uma vez, e reexecutá-la incondicionalmente significa rodá-la uma segunda vez. Este é justamente o problema de idempotência que a Lição 4 assume por inteiro; por ora esta lição fixa uma regra sobre a qual você já pode agir: **ferramentas somente leitura reexecutam direto; ferramentas de alto impacto precisam antes confirmar se já rodaram, para só então decidir se reexecutam.**

**Jogada três: acrescentar um `tool_result` com `is_error: true` dizendo “estado de execução desconhecido, por favor reavalie”, e devolver a decisão ao modelo.** Este é o fallback conservador para quando você não consegue dizer se ela rodou — o campo `is_error` existe justamente para "Set to true if the tool execution resulted in an error"[^S4] (defina como true se a execução da ferramenta resultou em erro). E acontece que "letting the agent know when a tool is failing and letting it adapt works surprisingly well"[^S1] (deixar o agente saber quando uma ferramenta está falhando e deixá-lo se adaptar funciona surpreendentemente bem): o modelo relê o contexto e decide se confirma o resultado por outro meio, em vez de se queimar com uma ação silenciosa e possivelmente repetida.

Enfileire as três e a jogada um está fora; as jogadas dois e três cobrem, respectivamente, os casos “dá para dizer” e “não dá para dizer”, e só juntas elas formam a regra completa de reconciliação.

```agentmentor-check
{
  "id": "sp-zh-03-dangling-tool-use",
  "label": "Como lidar com uma chamada órfã",
  "prompt": "Ao retomar, você descobre que pendingToolUse não é null no checkpoint — a última mensagem assistant tem um tool_use dentro, sem nenhum tool_result correspondente. Alguém argumenta que a jogada mais limpa é apagar essa mensagem assistant de messages e fingir que ela nunca aconteceu, para que a conversa retomada não tenha lacuna. Isso está certo?",
  "whyHere": "Esta verificação aparece logo depois de as três jogadas serem apresentadas — sendo apagar a tentadora — para checar se você percebe por que apagar a mensagem assistant órfã não é uma opção segura.",
  "mode": "single",
  "choices": [
    {
      "id": "a",
      "text": "Não. Apagar as duas faz o modelo esquecer uma decisão que ele já tomou e pode esconder um efeito colateral que realmente aconteceu; a jogada certa é reconciliar pela natureza da ferramenta e fornecer o tool_result correspondente, não apagar o tool_use",
      "correct": true,
      "feedback": "Correto. Apagar cobra em duas camadas: o modelo pode reexplorar algo que já fez e — mais perigoso — se a ferramenta de fato já tinha rodado, apagar apenas faz esse fato sumir da conversa e de todo julgamento posterior. O protocolo exige um tool_result correspondente para cada tool_use, e reconciliar em vez de apagar é como você volta a um estado do qual dá para continuar."
    },
    {
      "id": "b",
      "text": "Sim — uma vez que messages não guarde mais um tool_use sem resultado correspondente, a conversa retomada fica ao mesmo tempo limpa e segura para continuar",
      "correct": false,
      "feedback": "Não exatamente. “Sem lacuna” é limpeza só de superfície. Se aquela chamada de ferramenta de fato já tinha rodado (o e-mail já saiu, digamos), apagar a mensagem não desfaz o que aconteceu — só faz o modelo e os logs deixarem de saber que aconteceu. O risco é mascarado, não removido."
    },
    {
      "id": "c",
      "text": "Sim — ferramentas somente leitura e de alto impacto acabam, no fim das contas, consultando o modelo de novo, então descartar o tool_use velho não vai ter efeito real nenhum",
      "correct": false,
      "feedback": "Não exatamente. Os dois tipos de ferramenta não são tratados da mesma forma: uma ferramenta somente leitura deve reexecutar direto para obter o resultado real, e uma ferramenta de alto impacto cujo estado de já-executada você não consegue determinar deve recorrer ao fallback is_error. Os dois caminhos fornecem ao tool_use órfão um tool_result correspondente — nenhum deles apaga, e nenhum deles simplesmente pergunta ao modelo de novo em todos os casos."
    }
  ]
}
```

## reconcile(cp): transformando a reconciliação em código

Transforme essa regra em uma função: decida pelo nome da ferramenta se ela é somente leitura e, se for, reexecute-a; se não for, vá consultar o “livro-razão de efeitos” para confirmar se esta chamada já rodou — ainda não existe livro-razão de efeitos nesta lição, então um comentário faz as vezes dele, e a Lição 4 dá a implementação de verdade. Quando não dá para dizer, caia no fallback do `is_error`.

```javascript
const READ_ONLY_TOOLS = new Set(["read_file", "grep", "list_dir", "web_search"]);

async function reconcile(cp) {
  const { pendingToolUse, messages } = cp;
  const { id, name, input } = pendingToolUse;

  let toolResult;
  if (READ_ONLY_TOOLS.has(name)) {
    // Ferramenta somente leitura: zero efeito colateral, reexecute direto para obter o resultado real
    const output = await executeTool(name, input);
    toolResult = { type: "tool_result", tool_use_id: id, content: output };
  } else {
    // Ferramenta de alto impacto: consulte antes o livro-razão de efeitos para ver se ela já rodou (a Lição 4 apresenta o livro-razão; aqui vai um espaço reservado)
    // const record = await ledger.checkExecuted(id);
    // if (record) toolResult = { type: "tool_result", tool_use_id: id, content: record.result };
    // else toolResult = { type: "tool_result", tool_use_id: id, content: await executeTool(name, input) };
    //
    // Nenhum registro conectado nesta lição; quando não dá para dizer, use o fallback conservador:
    toolResult = {
      type: "tool_result",
      tool_use_id: id,
      content: "Estado de execução desconhecido: o processo caiu antes de esta chamada terminar, então não há como confirmar se ela teve efeito. Por favor, reavalie a situação atual.",
      is_error: true,
    };
  }

  messages.push({ role: "user", content: [toolResult] });
  cp.pendingToolUse = null;
  return cp;
}
```

Depois que `reconcile()` termina, a cauda de `cp.messages` tem o `tool_result` correspondente preenchido e `cp.pendingToolUse` está de volta em `null`. Este `cp` é agora indistinguível de um checkpoint que caiu normalmente no ponto de gravação B, e pode ir direto para o laço `while` para continuar.

## Depois de retomar: contando turns e tokensUsed

Dois contadores são fáceis de o caminho de retomada bagunçar, e vale explicitá-los à parte.

`turns` não zera na retomada. Ele conta o total de turnos da tarefa desde o começo até agora, não “quantos turnos esta instância do processo rodou” — o `turns` do checkpoint deve continuar sendo incrementado de onde parou, que é a única forma de o teto `MAX_TURNS` definido na Lição 2 seguir fazendo seu trabalho. Zere `turns` na retomada e uma tarefa que vive caindo e se recuperando pode driblar o teto de turnos e rodar para sempre.

`tokensUsed` funciona da mesma forma — carregado adiante a partir do checkpoint, não recalculado. Quando "Context Engineering: Spending Finite Attention Where It Counts" cobre compactação de contexto, `tokensUsed` significa “o uso da janela atual”, e o que o checkpoint armazenou é exatamente o uso dessa janela no instante da queda. Os dois carregam o mesmo sentido, então na retomada você o pega e segue, sem conversão extra nenhuma.

<!-- exercises -->
## 💻 Exercícios

### Nível 1: Três checkpoints, três ações de retomada

Abaixo estão três checkpoints lidos no momento da retomada (o conteúdo de `messages` foi elidido para facilitar a leitura). Para cada um, escreva o que o `runAgent` deveria fazer na retomada, e por quê.

```javascript
// Checkpoint A
const cpA = {
  version: 1,
  task: "Me ajude a juntar as anotações de reunião desta semana",
  turns: 6,
  tokensUsed: 18420,
  messages: [/* … a última é uma resposta assistant em texto puro … */],
  pendingToolUse: null,
};

// Checkpoint B
const cpB = {
  version: 1,
  task: "Me ajude a juntar as anotações de reunião desta semana",
  turns: 7,
  tokensUsed: 19310,
  messages: [/* … a última é uma mensagem assistant contendo um tool_use … */],
  pendingToolUse: { id: "toolu_01A", name: "read_file", input: { path: "./notes/meeting-08-25.md" } },
};

// Checkpoint C
const cpC = {
  version: 1,
  task: "Mande um e-mail para o time avisando das conclusões",
  turns: 9,
  tokensUsed: 24003,
  messages: [/* … a última é uma mensagem assistant contendo um tool_use … */],
  pendingToolUse: { id: "toolu_01B", name: "send_email", input: { to: "team@example.com", subject: "Conclusões desta semana" } },
};
```

<!-- rubric -->
- cpA: `pendingToolUse` é `null`, o que significa que a queda caiu depois do ponto de gravação B e antes do `create()` seguinte; na retomada, basta pegar `messages` e disparar a próxima chamada — nenhuma reconciliação é necessária
- cpB: `pendingToolUse` aponta para `read_file`, uma ferramenta somente leitura com zero efeito colateral; na retomada, reexecute-a direto para obter o resultado, preencha um `tool_result` e continue
- cpC: `pendingToolUse` aponta para `send_email`, uma ferramenta de alto impacto que não pode ser reexecutada incondicionalmente; ainda não há livro-razão de efeitos nesta lição, então recorra ao fallback `is_error` e diga a verdade ao modelo (“estado de execução desconhecido”) em vez de reenviar um e-mail

<!-- hint -->
1. Primeiro cheque se `pendingToolUse` é `null` — se for, não há reconciliação envolvida nenhuma, e a questão é mesmo sobre os outros dois. 2. Depois olhe o nome da ferramenta: ele está em `READ_ONLY_TOOLS`? 3. Só uma ferramenta de alto impacto cujo estado de “já rodou?” você não consegue determinar pede o fallback em vez de uma reexecução.

<!-- answer -->
O cpA não precisa de reconciliação: `pendingToolUse` é `null`, o que significa que a queda caiu depois do ponto de gravação B, `messages` está completo, e na retomada você o usa para disparar direto o próximo `client.messages.create()`. O cpB precisa de reexecução: `read_file` é uma ferramenta somente leitura, repeti-la não produz efeito colateral, e na retomada chamar `reconcile()` cai naturalmente no ramo `READ_ONLY_TOOLS`, obtém o conteúdo real do arquivo e o preenche em um `tool_result`. O cpC não pode ser reexecutado: `send_email` é uma ferramenta de alto impacto que muito provavelmente já rodou uma vez, e reexecutá-la incondicionalmente deixaria o time com um e-mail duplicado; ainda não há livro-razão de efeitos nesta lição para confirmar se ela rodou, então `reconcile()` deveria cair no ramo de fallback `is_error` e entregar ao modelo um honesto “estado de execução desconhecido, por favor reavalie” em vez de enviar de novo.

### Nível 2: Encontre a causa raiz do e-mail duplicado

Um relatório de incidente de operação: “O processo foi morto e reiniciado pelo OOM killer depois da chamada da ferramenta `send_email` mas antes de o resultado ser registrado. No reinício, o harness fez `--resume` automaticamente e, alguns minutos depois, um usuário relatou ter recebido dois e-mails idênticos.”

O `reconcile()` que rodava em produção na época era assim:

```javascript
// A versão que estava em produção quando o incidente aconteceu
async function reconcile(cp) {
  const { pendingToolUse, messages } = cp;
  const { id, name, input } = pendingToolUse;

  const output = await executeTool(name, input);
  messages.push({
    role: "user",
    content: [{ type: "tool_result", tool_use_id: id, content: output }],
  });
  cp.pendingToolUse = null;
  return cp;
}
```

Determine a causa raiz e então reescreva este `reconcile()` em uma versão que roteia pela natureza da ferramenta (dica: a regra que esta lição fixou é “somente leitura reexecuta direto; ferramenta de alto impacto sem registro recorre ao `is_error`”). Depois de reescrever, rode-o sob o `node` e verifique que uma ferramenta de alto impacto como `send_email` não dispara mais o `executeTool()`.

<!-- rubric -->
- Causa raiz: `reconcile()` chama `executeTool()` para reexecutar todo `pendingToolUse` sem distinguir ferramentas somente leitura de ferramentas de alto impacto; `send_email` muito provavelmente já tinha rodado uma vez antes da queda, então uma reexecução incondicional a roda uma segunda vez e envia o e-mail duas vezes
- Correção: trazer um conjunto `READ_ONLY_TOOLS` para rotear pelo nome da ferramenta — só ferramentas somente leitura têm permissão de chamar `executeTool()` e reexecutar; uma ferramenta de alto impacto (como `send_email`) deixa de ser reexecutada incondicionalmente e recebe um `tool_result` com `is_error: true` que devolve ao modelo o julgamento de “estado de execução desconhecido”
- No código reescrito, uma chamada como `read_file` e uma como `send_email` têm que tomar dois caminhos diferentes, mas ambos os caminhos têm que terminar fornecendo a `messages` um `tool_result` correspondente — caso contrário a retomada não consegue continuar a conversa normalmente

<!-- answer -->
A causa raiz é que `reconcile()` trata todo `pendingToolUse` como “seguro para reexecutar”, sem distinguir as ferramentas por seus efeitos colaterais. O `send_email` muito provavelmente já tinha enviado o e-mail antes da queda; o processo apenas não chegou a registrar o resultado em `messages`. Chamar `executeTool("send_email", …)` mais uma vez na retomada envia genuinamente o mesmo e-mail uma segunda vez. A versão corrigida tem que rotear pelo nome da ferramenta:

```javascript
const READ_ONLY_TOOLS = new Set(["read_file", "grep", "list_dir", "web_search"]);

async function reconcile(cp) {
  const { pendingToolUse, messages } = cp;
  const { id, name, input } = pendingToolUse;

  let toolResult;
  if (READ_ONLY_TOOLS.has(name)) {
    const output = await executeTool(name, input);
    toolResult = { type: "tool_result", tool_use_id: id, content: output };
  } else {
    toolResult = {
      type: "tool_result",
      tool_use_id: id,
      content: "Estado de execução desconhecido: o processo caiu antes de esta chamada terminar, então não há como confirmar se ela teve efeito. Por favor, reavalie a situação atual.",
      is_error: true,
    };
  }

  messages.push({ role: "user", content: [toolResult] });
  cp.pendingToolUse = null;
  return cp;
}
```

Depois da correção, uma ferramenta como `send_email`, que não está em `READ_ONLY_TOOLS`, nunca mais dispara o `executeTool()` — `reconcile()` só lhe fornece um `tool_result` com `is_error`; apenas uma ferramenta somente leitura como `read_file` de fato reexecuta. Rode sob o `node`, chamando `reconcile()` uma vez com um nome de ferramenta somente leitura e uma vez com `send_email`, e confira o log de chamadas de `executeTool`: ele deve aparecer na execução somente leitura e não aparecer na execução de `send_email`.
<!-- /exercises -->

## Recapitulação

A espinha da retomada não é difícil: ler o checkpoint, checar a versão, espalhar os campos de volta no estado de execução, pular a inicialização e cair direto no loop — o modelo não consegue nem sentir que houve uma queda no meio. O que de fato exige projeto é reconciliar a chamada órfã: apagar perde uma decisão e mascara um efeito colateral que já aconteceu; uma ferramenta somente leitura pode ser reexecutada sem preocupação; e para uma ferramenta de alto impacto cujo estado de já-executada você não consegue determinar, um fallback `is_error` é uma escolha mais segura que uma reexecução às cegas. Mas essa regra ainda deixa um problema sem solução: como você de fato verifica se uma ferramenta de alto impacto já rodou? Esta lição só recorreu ao “não dá para dizer”; conseguir dizer de verdade exige um livro-razão de efeitos — e é exatamente isso que a próxima lição resolve.

[>> Lição 4: Efeitos colaterais e idempotência: quais ferramentas são seguras de reexecutar na retomada](./04-side-effects-idempotency.md)
