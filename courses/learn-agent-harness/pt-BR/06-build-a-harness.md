# Lição 6: Mão na massa: escrevendo à mão um harness de agente com controles

> Objetivos de aprendizado:
> - Transformar o loop de `stop_reason` das lições anteriores num loop `while` funcional em cima do `@anthropic-ai/sdk`, decidindo por conta própria se continua chamando ferramentas ou retorna texto e encerra
> - Construir os blocos de conteúdo `tool_use` e `tool_result` exatamente conforme a spec, e enviar os vários resultados de um único turno de volta dentro de uma só mensagem `user`
> - Equipar esse loop com quatro válvulas de controle — máximo de turnos, teto de orçamento, detecção de não-progresso e aprovação para ações de alto impacto — e dizer com precisão a que passo do loop cada uma pertence
>
> Pré-requisitos: Ler as Lições 2 a 5; entender o loop dirigido por `stop_reason`, condições de parada, redes de segurança contra descontrole, e a intervenção humana no loop | Anterior: [Lição 5 <<](./05-intervention-and-steering.md)

## Primeiro, como fica rodando

As primeiras cinco lições desmontaram a máquina peça por peça: como o loop gira, quando ele deve parar, como o descontrole se parece, como uma pessoa entra. Esta lição solda essas peças no menor harness funcional. Antes de qualquer código, veja o que ele faz num terminal — um agente ligado a duas ferramentas de brinquedo (`get_time` reporta a hora, `read_file` lê um arquivo dentro do projeto), recebendo uma frase: "leia a primeira linha do README.md, e então me diga que horas são".

```text
$ node agent.js "Leia a primeira linha do README.md, e então me diga que horas são"

[turn 1] modelo requisita ferramenta: read_file({"path":"README.md"})
[turn 1] ferramenta retornou: "# Agent Harness Fundamentals\n..."
[turn 2] modelo requisita ferramenta: get_time({})
[turn 2] ferramenta retornou: "2026-08-26T10:42:07+08:00"
[turn 3] modelo encerra (end_turn)

A primeira linha do README.md é "# Agent Harness Fundamentals", e são 10:42 de 26 de agosto de 2026.
Isso levou 2 turnos de chamadas de ferramenta ao longo de 3 requisições ao modelo.
```

Olhe de perto o que aconteceu: **o usuário disse uma frase, e quantas ferramentas foram chamadas, qual foi primeiro, e quando parar foram todos decididos pelo modelo dentro do loop.** Essa é a linha entre um agente e um workflow — o caminho de um workflow é fixo em código, enquanto um agente é o modelo dirigindo dinamicamente seu próprio processo e decidindo quais ferramentas usar[^S1]. O código host (o harness que estamos escrevendo nesta lição) nunca especificou "leia o arquivo primeiro, depois cheque a hora". Ele só girou o loop fielmente, rodou a ferramenta que o modelo nomeou, e devolveu o resultado. As duas ferramentas aqui são inofensivas, então nada interrompeu a execução — mas este harness também tem uma válvula de aprovação soldada, e se o modelo se estende para algo de alto impacto como apagar um arquivo ou disparar uma requisição, ele para e espera um aval humano antes de agir (escrevemos isso mais adiante na lição). O resto desta lição constrói, linha por linha, o código por trás daquela saída de terminal.

## O loop central: traga o esqueleto, troque pelo SDK de verdade

O `callModel` da Lição 2: O loop central: de uma ida e volta à operação contínua era pseudocódigo. Agora ele vira o `@anthropic-ai/sdk` de verdade. O esqueleto do loop é idêntico: envie uma requisição carregando `messages`, olhe `response.stop_reason` — se for `"tool_use"`, rode as ferramentas, costure os resultados de volta e envie de novo; se não for (digamos, `end_turn`), retorne o texto e saia do loop[^S2].

Aqui está a versão mínima sem nenhuma válvula, para o próprio loop ficar visível:

```javascript
import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic(); // lê a chave da variável de ambiente ANTHROPIC_API_KEY

// Troque por um id de modelo que sua conta de fato consiga usar
const MODEL = "claude-sonnet-5";

async function runAgent(userInput, tools, toolImpls) {
  const messages = [{ role: "user", content: userInput }];

  let response = await client.messages.create({
    model: MODEL,
    max_tokens: 1024,
    tools,
    messages,
  });

  while (response.stop_reason === "tool_use") {
    // Anexa a resposta completa do modelo deste turno (papel assistant) ao histórico
    messages.push({ role: "assistant", content: response.content });

    // Roda todo bloco tool_use deste turno, empacotando cada um num tool_result
    const toolResults = await runToolUses(response.content, toolImpls);

    // Todos os blocos tool_result de um turno vão na única mensagem user que segue
    messages.push({ role: "user", content: toolResults });

    // Envia de novo com o histórico agora mais longo; o controle volta à checagem do while
    response = await client.messages.create({
      model: MODEL,
      max_tokens: 1024,
      tools,
      messages,
    });
  }

  // stop_reason não é mais tool_use — extrai o texto final e o retorna
  return response.content.find((b) => b.type === "text")?.text ?? "";
}
```

Ponha isto ao lado do esqueleto da Lição 2 e a estrutura não se moveu: a linha do `while` ainda diz "repita enquanto `stop_reason` for `tool_use`", e o corpo ainda são os mesmos quatro passos — empurra assistant, roda ferramentas, empurra tool_result, reatribui `response`. A única mudança substantiva é `callModel` virando `client.messages.create(...)`, mais aquela reatribuição no fim do corpo. Essa reatribuição é o que torna a parada possível; tire-a e `stop_reason` fica no valor antigo para sempre, que é exatamente o loop morto da Lição 4: Descontrole e fallback: loops mortos, giro em falso, esgotamento de orçamento.

## Campos de tool_use / tool_result, nenhum deles faltando

`runToolUses` é onde a ferramenta que o modelo nomeou de fato roda. A coisa mais fácil de errar aqui são os campos do bloco de conteúdo, então siga a spec: um bloco `tool_use` carrega `id` / `name` / `input`, um bloco `tool_result` carrega `tool_use_id` (declarando qual chamada ele responde) e `content`, e quando a execução da ferramenta falha você adiciona `is_error: true`[^S6]. Há mais uma regra rígida: por mais blocos `tool_use` que uma resposta contenha, essa mesma quantidade de blocos `tool_result` tem de voltar, todos empacotados na única mensagem `user` que segue imediatamente[^S6] — a linha `messages.push({ role: "user", content: toolResults })` no corpo do loop acima é o que mantém essa regra.

```javascript
async function runToolUses(content, toolImpls) {
  const toolUseBlocks = content.filter((b) => b.type === "tool_use");

  // Roda em paralelo, mas os resultados ainda se reúnem numa só mensagem user
  return Promise.all(
    toolUseBlocks.map(async (block) => {
      const impl = toolImpls[block.name];
      try {
        const output = await impl(block.input);
        return {
          type: "tool_result",
          tool_use_id: block.id, // a declaração: isto responde à chamada com id block.id
          content: output,
        };
      } catch (err) {
        return {
          type: "tool_result",
          tool_use_id: block.id,
          content: `Tool execution failed: ${err.message}`,
          is_error: true, // marcado na falha, para o modelo saber que a chamada não teve sucesso
        };
      }
    })
  );
}
```

Note o `try/catch`: uma ferramenta explodindo não deveria derrubar o harness inteiro junto. Embrulhe o erro num `tool_result` marcado `is_error: true` e devolva-o, e o modelo ganha a chance de tentar de novo com argumentos diferentes ou tomar outra rota. Isso é muito mais estável do que lançar e matar o processo.

## Parafusando quatro válvulas de controle

O loop gira agora, mas é o loop pelado da Lição 2 — aquele que confia no modelo e não deixa saída para si mesmo. Ele para no turno em que o modelo retorna `end_turn`, sem fronteira nenhuma no meio do caminho. E a autonomia de um agente significa custos mais altos mais o potencial de erros se acumulando volta após volta do loop, com o modelo potencialmente operando por muitos turnos[^S1] — um loop pelado aposta a decisão inteira de parar-ou-continuar no modelo, o que é arriscado demais. Agora soldamos as quatro válvulas das lições anteriores, uma de cada vez.

```javascript
const MAX_TURNS = 8;        // Válvula 1: máximo de turnos (Lição 3, condições de parada)
const TOKEN_BUDGET = 40000; // Válvula 2: orçamento de tokens acumulado (Lição 4, esgotamento de orçamento)

async function runAgent(userInput, tools, toolImpls, opts = {}) {
  const messages = [{ role: "user", content: userInput }];
  let turns = 0;
  let tokensUsed = 0;
  let lastSignature = null; // para a válvula 3: a assinatura de chamadas de ferramenta do turno anterior

  let response = await client.messages.create({
    model: MODEL, max_tokens: 1024, tools, messages,
  });
  tokensUsed += response.usage.input_tokens + response.usage.output_tokens;

  while (response.stop_reason === "tool_use") {
    // —— Válvula 1: máximo de turnos. Primeira coisa no corpo: antes desta volta, pergunte "ainda posso girar?" ——
    if (turns >= MAX_TURNS) {
      return `Atingi o limite máximo de ${MAX_TURNS} turnos, parando por conta própria (a tarefa pode ser difícil demais, ou o modelo pode estar travado)`;
    }
    // —— Válvula 2: teto de orçamento. Tokens acumulados atingiram o teto, pare; não queime a carteira ——
    if (tokensUsed >= TOKEN_BUDGET) {
      return `Atingi o orçamento de ${TOKEN_BUDGET} tokens, parando por conta própria`;
    }
    turns++;

    // —— Válvula 3: detecção de não-progresso. A assinatura de chamadas deste turno bate com a anterior: chame de giro em falso ——
    const signature = signatureOf(response.content);
    if (signature === lastSignature) {
      return `Dois turnos seguidos fizeram chamadas de ferramenta idênticas (${signature}); chamando de giro em falso e parando por conta própria`;
    }
    lastSignature = signature;

    messages.push({ role: "assistant", content: response.content });

    // —— Válvula 4: a válvula de aprovação. Ações de alto impacto são confirmadas antes da execução (detalhada abaixo) ——
    const toolResults = await runToolUses(response.content, toolImpls, opts);
    messages.push({ role: "user", content: toolResults });

    response = await client.messages.create({
      model: MODEL, max_tokens: 1024, tools, messages,
    });
    tokensUsed += response.usage.input_tokens + response.usage.output_tokens;
  }

  return response.content.find((b) => b.type === "text")?.text ?? "";
}
```

Cada válvula guarda uma coisa, e nenhuma das posições é arbitrária:

- **Válvula 1, máximo de turnos** (Lição 3: Condições de parada: quando um agente deve desistir): `turns >= MAX_TURNS` fica bem no topo do corpo, antes de `turns++`. Significa "antes desta volta, cheque se outra volta ainda é permitida". Esta condição de parada explícita existe para que, ao lado do próprio `end_turn` do modelo, você mantenha o controle nas suas próprias mãos[^S1].
- **Válvula 2, teto de orçamento** (Lição 4: Descontrole e fallback: loops mortos, giro em falso, esgotamento de orçamento): toda vez que uma resposta volta, some os tokens de `response.usage` e pare no teto. Quando os turnos são poucos mas o contexto de cada turno é enorme, a contagem de turnos sozinha não segura o gasto; você precisa de tokens como uma comporta separada e independente.
- **Válvula 3, detecção de não-progresso** (Lição 4): achate as chamadas de ferramenta deste turno numa assinatura e compare-a com a anterior; idênticas significam giro em falso. Isso pega o caso estagnado em que os turnos não passaram do limite e o orçamento não estourou, mas o modelo está andando no lugar, chamando a mesma ferramenta com os mesmos argumentos de novo e de novo.
- **Válvula 4, a válvula de aprovação** (Lição 5: Intervenção e direção: interromper, redirecionar, humano no loop): dentro de `runToolUses`, antes de de fato executar uma ferramenta, ações de alto impacto ganham uma confirmação humana primeiro. Aprovação humana no loop em ações de alto impacto é precisamente o jeito recomendado de segurar o risco de agência excessiva[^S4].

A função de assinatura da Válvula 3 é simples a ponto de ser sem graça — junte os nomes e argumentos de todo bloco `tool_use` do turno numa única string. Distinguir "o que foi chamado com quais argumentos" é tudo o que ela precisa fazer:

```javascript
function signatureOf(content) {
  return content
    .filter((b) => b.type === "tool_use")
    .map((b) => `${b.name}(${JSON.stringify(b.input)})`)
    .sort()
    .join(" | ");
}
```

## A válvula de aprovação: encaixada no momento antes da execução

Das quatro válvulas, a posição da válvula de aprovação é a que mais importa e a mais fácil de errar. Ela tem de se encaixar no momento em que o modelo nomeou uma ferramenta mas a ferramenta ainda não rodou — imprima a ação prestes a acontecer, espere por um humano, execute só depois da confirmação. Um passo mais tarde e o arquivo já está escrito, a requisição já enviada, e perguntar "confirma?" é inútil. Então ela vai dentro de `runToolUses`, antes da linha `impl(...)`:

```javascript
const HIGH_IMPACT = new Set(["write_file", "http_post", "delete_file"]);

async function runToolUses(content, toolImpls, opts = {}) {
  const toolUseBlocks = content.filter((b) => b.type === "tool_use");

  const results = [];
  for (const block of toolUseBlocks) {
    // A válvula de aprovação: ações de alto impacto são confirmadas antes da execução
    if (HIGH_IMPACT.has(block.name)) {
      const ok = await opts.approve?.(block.name, block.input);
      if (!ok) {
        results.push({
          type: "tool_result",
          tool_use_id: block.id,
          content: "The user declined this high-impact action; it was not executed.",
          is_error: true,
        });
        continue; // pula a execução, mas ainda retorna um tool_result — não deixe a chamada pendurada
      }
    }

    try {
      const output = await toolImpls[block.name](block.input);
      results.push({ type: "tool_result", tool_use_id: block.id, content: output });
    } catch (err) {
      results.push({
        type: "tool_result", tool_use_id: block.id,
        content: `Tool execution failed: ${err.message}`, is_error: true,
      });
    }
  }
  return results;
}
```

`approve` é uma função passada de fora; num terminal significa "imprima a ação, leia uma linha de entrada":

```javascript
import readline from "node:readline/promises";

async function approveInTerminal(name, input) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const answer = await rl.question(
    `[approve] About to run high-impact action ${name}(${JSON.stringify(input)}) — Enter to allow / type n to decline: `
  );
  rl.close();
  return answer.trim().toLowerCase() !== "n";
}
```

Um detalhe que importa: mesmo quando o usuário recusa, você ainda retorna um `tool_result` marcado `is_error: true` em vez de não retornar nada. A spec exige que todo `tool_use` tenha um `tool_result` correspondente devolvido[^S6]; pule-o e a próxima requisição dá erro porque uma chamada de ferramenta não tem resultado. Recusar não é o mesmo que ignorar — uma recusa é ela própria um resultado que o modelo merece ouvir, e um modelo que aprende que foi recusado muitas vezes muda para uma rota que não precisa da ação de alto impacto de jeito nenhum.

```agentmentor-check
{
  "id": "harness-zh-06-approval-before-exec",
  "label": "Posicionar a válvula de aprovação corretamente no fluxo de controle do loop",
  "prompt": "Um colega liga a válvula de aprovação assim: dentro de runToolUses, toda ferramenta roda como de costume e produz sua saída primeiro; então, logo antes de o resultado ser empurrado para results, ações de alto impacto abrem um prompt de “confirma?”, e se o usuário disser não, aquele tool_result é marcado is_error e descartado. Ele argumenta: “o resultado é jogado fora mesmo quando recusado, então dá na mesma”. Essa ligação está correta?",
  "whyHere": "Esta seção acabou de insistir que a válvula de aprovação precisa se encaixar no momento antes de a ferramenta de fato rodar. Segui-la imediatamente com um erro concreto de colocação de código — a confirmação movida para depois de impl executar — testa se o leitor realmente entende que a válvula intercepta a própria execução, não se o resultado é usado.",
  "mode": "single",
  "choices": [
    {
      "id": "a",
      "text": "Não. A aprovação tem de terminar antes de impl ser chamada; rodar primeiro e perguntar depois significa que o efeito colateral já aterrissou, então confirmar não intercepta nada",
      "correct": true,
      "feedback": "Correto. Aquilo sobre o que a válvula de aprovação age é realizar a ação em si, não se aceitar seu resultado. Então ela tem de ficar antes da linha impl(...) — chame impl só depois que a aprovação volta, e numa recusa apenas continue sem jamais tocar em impl. Esse é o ponto inteiro da aprovação humana no loop em ações de alto impacto: segure a comporta antes de uma ação irreversível de fato acontecer, em vez de registrar um aviso vazio depois que ela aconteceu."
    },
    {
      "id": "b",
      "text": "Sim. Já que um tool_result recusado é marcado como erro e nunca usado, executar ou não dá na mesma; rode primeiro, pergunte depois, mesmo desfecho",
      "correct": false,
      "feedback": "O problema é que a ferramenta genuinamente já rodou. Para ações de alto impacto como write_file, http_post e delete_file, o efeito colateral aterrissa no momento em que impl retorna — o arquivo é escrito, a requisição sai, o registro é apagado. Perguntar “confirma?” nesse ponto controla só se você usa este resultado; não pode controlar um efeito colateral que já aconteceu, o que deixa a válvula de aprovação sem fazer nada."
    }
  ]
}
```

## Duas ferramentas de brinquedo, para o loop de fato rodar

As válvulas estão no lugar; o que falta são ferramentas que o modelo possa chamar. Esta lição usa só dois brinquedos absolutamente seguros e mantém as operações perigosas fora da porta: `get_time` reporta a hora atual, e `read_file` lê um arquivo — com `path.resolve` fincando-o firmemente dentro do diretório do projeto, para que o modelo (ou um modelo tirado do curso pela saída de uma ferramenta) não consiga ler caminhos fora dos limites como `/etc/passwd`:

```javascript
import path from "node:path";
import fs from "node:fs/promises";

const ROOT = process.cwd();

const toolImpls = {
  get_time: async () => new Date().toISOString(),

  read_file: async ({ path: p }) => {
    const abs = path.resolve(ROOT, p);
    // Checagem de fronteira: o caminho absoluto resolvido ainda precisa estar dentro do diretório do projeto
    if (!abs.startsWith(ROOT + path.sep)) {
      throw new Error(`Refusing to read a path outside the project directory: ${p}`);
    }
    return (await fs.readFile(abs, "utf8")).slice(0, 2000);
  },
};

const tools = [
  {
    name: "get_time",
    description: "Return the current time as an ISO 8601 string",
    input_schema: { type: "object", properties: {} },
  },
  {
    name: "read_file",
    description: "Read the first 2000 characters of a text file inside the project directory",
    input_schema: {
      type: "object",
      properties: { path: { type: "string", description: "Path relative to the project root" } },
      required: ["path"],
    },
  },
];
```

Nenhuma das ferramentas está no conjunto `HIGH_IMPACT`, então nenhuma dispara aprovação — elas são inofensivas por construção. Para demonstrar a válvula de aprovação, adicione um `write_file` a `toolImpls` e a `HIGH_IMPACT`. Esta lição evita de propósito introduzir uma operação de escrita real para que rodar o exemplo não possa danificar seus arquivos.

## Juntando tudo: um ponto de entrada que você roda com node agent.js

Por último, reúna `runAgent`, `runToolUses`, as definições de ferramenta e a função de aprovação num ponto de entrada que você roda diretamente — a coisa por trás da saída de terminal no topo desta lição:

```javascript
async function main() {
  const userInput = process.argv[2] ?? "Leia a primeira linha do README.md, e então me diga que horas são";
  const answer = await runAgent(userInput, tools, toolImpls, {
    approve: approveInTerminal,
  });
  console.log("\n" + answer);
}

main().catch((err) => {
  console.error("harness crashed:", err);
  process.exit(1);
});
```

Jogue as peças anteriores (`import`, `client`, `MODEL`, `runAgent`, `runToolUses`, `signatureOf`, `approveInTerminal`, `toolImpls`, `tools`, `main`) num só `agent.js`, defina `ANTHROPIC_API_KEY`, rode `npm i @anthropic-ai/sdk`, e `node agent.js "sua tarefa"` vai rodar.

Olhe de novo estas cem e tantas linhas e você vai notar que nenhuma delas é um conceito novo: o loop `while` e o `stop_reason` vieram da Lição 2, `MAX_TURNS` da Lição 3, o orçamento e a detecção de giro em falso da Lição 4, e a válvula de aprovação da Lição 5. **Um harness não é algum framework profundo; é esta camada de loop-mais-válvulas que você mesmo escreve e controla.** Mesmo modelo, mesmas duas ferramentas — mas um harness com essas quatro válvulas e o loop pelado da Lição 2 podem diferir enormemente em quão estável rodam a mesma tarefa, porque o que decide se um agente é confiável é em grande parte essa camada externa de código de controle, não só o modelo dentro dela[^S5].

Mantenha o senso de proporção sobre complexidade também: nem todo agente precisa das quatro válvulas, e uma linha que vale a pena lembrar é que você deveria considerar adicionar complexidade apenas quando ela comprovadamente melhora os resultados[^S1]. Uma ferramenta pequena que roda três a cinco turnos num ambiente controlado pode ficar bem só com `MAX_TURNS`; quatro válvulas são para os casos que rodam muitos turnos seguidos e podem se estender a ações de alto impacto.

<!-- exercises -->
## 💻 Exercícios

### Nível 1: Adicione uma válvula de controle escalonada por ferramenta ao harness

Neste momento a válvula de aprovação tem duas configurações: pergunte se for de alto impacto, permita todo o resto. Um colega de produto levanta um requisito mais fino — controle por nome de ferramenta em três níveis: `allow` (passagem direta, como `get_time`), `ask` (confirmação humana exigida antes da execução, como `write_file`) e `deny` (sempre recusado, jamais chamável, como um `send_email` aposentado). Adicione essa válvula de política ao harness: projete sua estrutura de dados, diga a que passo do loop ela pertence e como se relaciona com a válvula de aprovação existente, e escreva o que deve voltar ao modelo quando `deny` bate.

<!-- rubric -->
- Dá uma estrutura de política capaz de expressar três níveis (por exemplo `{ get_time: "allow", write_file: "ask", send_email: "deny" }`), e enuncia o nível padrão (em que nível ferramentas não listadas caem)
- Coloca a válvula de política dentro de `runToolUses`, avaliada por bloco `tool_use`, antes de impl executar — a mesma posição da válvula de aprovação, com o nível `ask` reaproveitando a lógica de confirmação existente
- Num acerto de `deny`, não executa a ferramenta mas ainda retorna um `tool_result` com `is_error: true` dizendo ao modelo que a ferramenta é proibida por política, em vez de descartá-la em silêncio

<!-- answer -->
Estrutura de dados: um mapa de nome de ferramenta para nível, mais um nível padrão em que ferramentas não listadas caem (de forma conservadora, o padrão pode ser `ask` ou `deny` de forma razoável — só não use `allow` como padrão):

```javascript
const POLICY = { get_time: "allow", read_file: "allow", write_file: "ask", send_email: "deny" };
const DEFAULT_POLICY = "ask"; // ferramentas não listadas exigem confirmação de forma conservadora
```

Posição: exatamente onde a válvula de aprovação fica — dentro de `runToolUses`, enquanto percorre cada bloco `tool_use`, antes de `impl` ser chamada. Dois dos três níveis, `ask` e `deny`, ambos têm de interceptar antes de a ferramenta de fato rodar, que é o mesmo momento em que a válvula de aprovação intercepta. É de fato uma generalização da válvula de aprovação: a original equivalia a dois níveis, alto impacto = ask e todo o resto = allow, e agora há também um nível `deny`.

```javascript
for (const block of toolUseBlocks) {
  const policy = POLICY[block.name] ?? DEFAULT_POLICY;

  if (policy === "deny") {
    results.push({
      type: "tool_result", tool_use_id: block.id,
      content: `Tool ${block.name} is forbidden by policy; it was not executed.`, is_error: true,
    });
    continue; // nunca toca em impl
  }
  if (policy === "ask") {
    const ok = await opts.approve?.(block.name, block.input);
    if (!ok) {
      results.push({
        type: "tool_result", tool_use_id: block.id,
        content: "The user declined this action; it was not executed.", is_error: true,
      });
      continue;
    }
  }
  // allow, ou ask que foi aprovado: execute
  const output = await toolImpls[block.name](block.input);
  results.push({ type: "tool_result", tool_use_id: block.id, content: output });
}
```

O ponto-chave num acerto de `deny` é o mesmo que numa aprovação recusada: não execute, mas ainda retorne um `tool_result` com `is_error: true`, porque todo `tool_use` precisa ter um resultado correspondente devolvido[^S6]. Um modelo avisado de que "esta ferramenta é proibida" geralmente muda para uma ferramenta diferente ou diz ao usuário com todas as letras que não dá para fazer, em vez de travar.

<!-- hint -->
Pergunte-se primeiro: quais dos três níveis precisam interceptar antes de a ferramenta executar? Tanto `deny` quanto `ask` precisam; `allow` não — então esta válvula só pode ficar onde a válvula de aprovação fica, antes da linha `impl(...)`.

<!-- hint -->
Não deixe chamadas negadas ou recusadas penduradas. A spec exige que todo `tool_use` de um turno tenha um `tool_result` na próxima mensagem user; recusar executar ainda significa devolver um (marcado `is_error`), ou a próxima requisição dá erro por resultado faltando.

### Nível 2: Que comportas faltam a este loop, e como ele se descontrola

Um colega diz que o loop de harness abaixo "funciona", mas no momento em que o modelo para de retornar `end_turn` por conta própria, ou cai em andar no lugar, ele quebra. Aponte: (1) quais controles lhe faltam e que comportamento de descontrole cada ausência produz; (2) a correção mínima — ao menos uma fronteira rígida que garanta que o loop vai parar, com uma declaração clara de a que passo ela vai.

```javascript
async function runAgent(userInput, tools, toolImpls) {
  const messages = [{ role: "user", content: userInput }];
  let response = await client.messages.create({ model: MODEL, max_tokens: 1024, tools, messages });

  while (response.stop_reason === "tool_use") {
    messages.push({ role: "assistant", content: response.content });
    const toolResults = await runToolUses(response.content, toolImpls);
    messages.push({ role: "user", content: toolResults });
    response = await client.messages.create({ model: MODEL, max_tokens: 1024, tools, messages });
  }
  return response.content.find((b) => b.type === "text")?.text ?? "";
}
```

<!-- rubric -->
- Aponta que ele entrega a decisão de parar-ou-continuar inteiramente ao `stop_reason` do modelo, sem condição de parada explícita — enquanto o modelo continuar retornando `tool_use`, ele gira para sempre, que é exatamente onde um loop autônomo precisa que você segure o controle separadamente
- Nomeia ao menos duas classes de descontrole: o modelo nunca encerrando, então os turnos queimam sem limite (descontrole de turno/orçamento), e chamadas idênticas repetidas à mesma ferramenta com os mesmos argumentos (sem progresso) nunca sendo detectadas
- Correção mínima: adicione um contador e checagem de `MAX_TURNS`, com a checagem no topo do corpo do loop antes de `turns++`, garantindo que o loop vai parar

<!-- answer -->
(1) Controles faltando: além do próprio `end_turn` do modelo, este código não tem condição de parada explícita, nem teto de orçamento, nem detecção de não-progresso, nem aprovação para ações de alto impacto. As consequências, uma a uma:

- **Sem condição de parada explícita**: enquanto o modelo retornar `tool_use` todo turno, a condição do `while` permanece verdadeira e o loop gira para sempre. A autonomia de um agente já significa que ele pode operar por muitos turnos, com custos subindo e erros se acumulando[^S1], e aqui não há sequer uma fronteira rígida — ele depende puramente de o modelo se comportar bem o bastante para encerrar.
- **Sem teto de orçamento**: o histórico cresce a cada volta (Lição 2), os tokens só sobem, e uma execução longa vai queimar o orçamento sem ninguém parando.
- **Sem detecção de não-progresso**: se o modelo continua chamando a mesma ferramenta com os mesmos argumentos, andando no lugar, este código aceita tudo e nunca nota o giro em falso.
- **Sem válvula de aprovação**: se `toolImpls` contém algo de alto impacto como `write_file`, ele é executado incondicionalmente, e um único mau julgamento pode produzir um desfecho irreversível.

(2) Correção mínima: adicione ao menos uma fronteira rígida que garanta que o loop vai parar — `MAX_TURNS`. O contador é inicializado fora do loop, e a checagem vai bem no topo do corpo, antes de `turns++`:

```javascript
const MAX_TURNS = 8;
async function runAgent(userInput, tools, toolImpls) {
  const messages = [{ role: "user", content: userInput }];
  let turns = 0;
  let response = await client.messages.create({ model: MODEL, max_tokens: 1024, tools, messages });

  while (response.stop_reason === "tool_use") {
    if (turns >= MAX_TURNS) return `Atingi o limite máximo de ${MAX_TURNS} turnos, parando por conta própria`; // fronteira rígida, bem no topo
    turns++;

    messages.push({ role: "assistant", content: response.content });
    const toolResults = await runToolUses(response.content, toolImpls);
    messages.push({ role: "user", content: toolResults });
    response = await client.messages.create({ model: MODEL, max_tokens: 1024, tools, messages });
  }
  return response.content.find((b) => b.type === "text")?.text ?? "";
}
```

Com essa única adição, quer o modelo encerre ou não e quer ele gire em falso ou não, o loop gira no máximo `MAX_TURNS` voltas e então certamente sai — o passo mais básico de tomar o controle de volta do modelo para as mãos do host[^S1]. Orçamento, não-progresso e aprovação podem ser sobrepostos conforme a necessidade.

<!-- hint -->
Encare a linha `while (response.stop_reason === "tool_use")`: além de o modelo escolher retornar `end_turn`, há qualquer coisa que possa torná-la `false`? Se não, então se o loop para é inteiramente a decisão do modelo.

<!-- hint -->
Uma fronteira que "vai com certeza parar" depende de um contador que o host mantém por si, independente da saída do modelo. Descubra onde esse contador deve ser inicializado, onde incrementado e onde checado — a checagem vem antes do incremento, para você não deixar passar uma volta a mais.

<!-- /exercises -->

## Recapitulação

- O núcleo de um harness funcional ainda é o loop da Lição 2: envie uma requisição carregando `messages` → cheque `stop_reason`, e se for `tool_use`, rode as ferramentas, costure um `tool_result` de volta e envie de novo; se não for, retorne texto e encerre[^S2]. Trocar para o SDK de verdade só transforma `callModel` em `client.messages.create(...)`
- Os campos do bloco de conteúdo seguem a spec sem nenhum faltando: `tool_use` carrega `id` / `name` / `input`, `tool_result` carrega `tool_use_id` / `content` mais `is_error` na falha; por mais blocos `tool_use` que um turno tenha, essa mesma quantidade de blocos `tool_result` volta, todos empacotados na única mensagem `user` que segue imediatamente[^S6]
- Cada uma das quatro válvulas de controle guarda um ponto, e suas posições não podem ser embaralhadas: máximo de turnos (Lição 3) e o teto de orçamento (Lição 4) são as fronteiras rígidas que tornam o loop certo de parar, a detecção de não-progresso (Lição 4) pega o andar no lugar, e a válvula de aprovação (Lição 5) tem de se encaixar antes da execução da ferramenta — porque a autonomia de um agente traz custos mais altos e erros que se acumulam, e o modelo pode operar por muitos turnos[^S1], então o próprio `end_turn` do modelo não consegue segurá-lo
- A válvula de aprovação exigindo confirmação humana em ações de alto impacto é o jeito recomendado de segurar o risco de agência excessiva[^S4]; mesmo numa recusa, retorne um `tool_result` com `is_error` e não deixe a chamada pendurada[^S6]
- Um harness não é um framework profundo; é esta camada de loop-mais-válvulas que você mesmo escreve e controla — mesmo modelo, código de controle diferente, e a confiabilidade pode diferir enormemente[^S5]. Mas não empilhe válvulas por empilhar tampouco: adicione complexidade apenas quando ela comprovadamente melhora os resultados[^S1]

Você terminou este curso. De "o que é um harness" a escrever à mão um loop com quatro válvulas de controle, o que você tem agora nas mãos não é só um conjunto de conceitos — é código de verdade que roda, que você pode editar, e ao qual você pode continuar adicionando controle. Ligue-o às suas próprias ferramentas e deixe-o fazer algum trabalho para você.