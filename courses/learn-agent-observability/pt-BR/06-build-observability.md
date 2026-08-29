# Lição 6: Mão na massa: instalando uma camada de observabilidade no harness

> Objetivos de aprendizado:
> - Instalar uma camada de observabilidade funcional no seu próprio harness: logs estruturados em JSON Lines, árvore de trace reconstruída a partir dos logs, resumo de métricas em uma linha
> - Percorrer uma tarefa com erro real do sintoma → filtro → primeira divergência → correção → comparação por reexecução (lado do modelo pregado por stub para reexecuções completas; APIs reais voltam ao retomar-do-erro), e explicar quais absurdos são causa e quais são contágio
> - Traçar as fronteiras desta camada de observabilidade: cobre um processo, uma execução; conteúdo desligado por padrão; limiares não inventados
>
> Pré-requisitos: Lições 1–5 concluídas, com o loop do harness do curso 7 (Fundamentos do Harness de Agente: Laços e Controle) rodando ao alcance da mão | Anterior: [Lição 5 <<](./05-hooks-and-debugging.md)

## O sintoma: uma região a mais em summary.md que não existe

Vamos começar por um cenário concreto, daqueles que dá para sentir o cheiro na mesa.

Você escreveu um agentezinho para cuidar dos relatórios semanais: o diretório `data/` guarda três CSVs de vendas trimestrais, ele os lê, agrega por região e escreve `summary.md`. Três ferramentas: `list_files`, `read_file`, `write_file`. Rodou bem por semanas.

Segunda-feira de manhã, um colega pergunta no chat: “De onde saiu essa região ‘Centro da China’? A gente não tem região Centro da China.”

Você abre `summary.md` e, de fato:

```text
# Resumo de vendas por região — 2026 Q1

| Região | Total (¥) |
| --- | --- |
| Leste da China | 548550 |
| Centro da China | 208000 |
| Norte da China | 432600 |
| Total geral | 1189150 |

Fonte dos dados: arquivos CSV do diretório data/
```

Você abre `data/`, três arquivos dentro: `2026-q1-east.csv`, `2026-q1-south.csv`, `2026-q1-north.csv`, com os nomes de região Leste da China, Sul da China, Norte da China no conteúdo. Busca no diretório inteiro por “Centro da China” — zero ocorrências. Sul da China sumiu por completo, Centro da China apareceu do nada, e o número 208000 veio sabe-se lá de onde.

A pergunta agora é: **em que etapa isso deu errado?**

Sem uma camada de observabilidade, você tem duas coisas: um `summary.md` escrito errado e a frase “o modelo inventou”. Essa frase não resolve nada — você não sabe se ele não conseguiu ler o arquivo logo de cara, ou se leu mas calculou errado, ou se leu os três mas embaralhou as linhas na hora de escrever. E você não pode “só reproduzir com um breakpoint” para forçar o erro a aparecer: agentes são não determinísticos entre execuções, os mesmos prompts e as mesmas ferramentas podem tomar um caminho completamente diferente, porém igualmente válido[^S1]. Você roda de novo três vezes, as três podem dar certo, ou a quarta pode falhar de um jeito novo.

Pior: os erros se acumulam. Uma etapa falhando pode fazer o agente desviar para uma trajetória completamente diferente, e o resultado final parece não ter relação com a falhinha original[^S1]. Então você não pode ficar só encarando o ponto final — o absurdo no ponto final costuma ser só **contágio** (a lição 1 chamou isso de desvio de trajetória, é a mesma coisa), e a lesão de verdade está a montante, em alguma etapa.

O trabalho desta lição é transformar “não dá para dizer” em “dá para conferir”: soldar uma camada de observabilidade no harness e então percorrer este bug real uma vez para localizá-lo. Tudo das cinco lições anteriores aterrissa num único arquivo executável.

## O kit de observabilidade em três peças: o que registrar

Ao rodar agentes em produção, você precisa de visibilidade sobre quatro coisas: quais ferramentas eles chamaram, quanto tempo cada requisição de modelo levou, quantos tokens foram gastos, onde as falhas aconteceram[^S6]. A abordagem oficial é exportar isso como traces, métricas e eventos de log do OpenTelemetry; esta lição não puxa nenhuma biblioteca do OTel, nós fazemos uma versão mínima à mão, em três peças:

1. **Logs estruturados**: uma entrada JSON Lines por requisição de modelo, uma por chamada de ferramenta, escritas em `run.log.jsonl`.
2. **Árvore de trace**: depois que a execução termina, reconstruir as relações pai-filho a partir daquele JSONL e imprimir indentado.
3. **Resumo de métricas**: uma linha com o total de rodadas, contagem de chamadas de ferramenta, tokens, contagem de erros e duração total.

### Modelo de spans: quem é pai de quem

Com a telemetria aprimorada ligada oficialmente, cada etapa do loop do agente vira um span inspecionável: uma interação é o span raiz, e requisições de modelo e execuções de ferramenta são spans filhos dele[^S6]. Note que, na árvore oficial, requisições de modelo e chamadas de ferramenta são **irmãs de mesmo nível** sob a raiz — a árvore que você reconstruiu na lição 4 tem esse formato. Nossa versão mínima usa deliberadamente uma ligação diferente: penduramos as chamadas de ferramenta sob **a requisição de modelo que as disparou**, de modo que o formato da árvore mostra diretamente “o que o modelo quis fazer nesta rodada”, com as ferramentas paralelas sob o mesmo pai visíveis de bate-pronto. O mecanismo pai-filho é exatamente o mesmo, nós só escolhemos um pai diferente para as ferramentas — as duas ligações são válidas, e qual delas escolher depende de que pergunta você quer que a árvore responda primeiro. Nossas três camadas ficam assim:

```text
agent_run                 ← Uma execução, registro raiz
├─ model_call turn-1      ← Um messages.create
│  └─ tool_call ...       ← Chamada de ferramenta desta requisição de modelo
├─ model_call turn-2
│  ├─ tool_call ...       ← Várias ferramentas pedidas em paralelo na mesma rodada são irmãs
│  ├─ tool_call ...
│  └─ tool_call ...
└─ model_call turn-3
```

As relações pai-filho não dependem de uma pilha de chamadas em memória, elas dependem de dois campos nos logs: cada registro carrega um `span_id`, mais um `parent_id` apontando para o pai dele. A árvore é **reconstruída a partir do JSONL em disco depois que a execução termina**, não impressa conforme se avança. Este ponto importa: qualquer coisa visível na árvore precisa antes ter sido gravada nos logs. Se você achar que falta algo na árvore, não é problema do código de impressão, é problema do código de gravação.

### Tabela de campos

O desenho de campos abaixo é a abordagem de engenharia desta lição, não uma especificação oficial — oficialmente são nomes de atributo de span do OTel; quando você escreve o seu próprio harness, os nomes dos campos são escolha sua. Quatro nomes diferem das lições 3 e 4, então vamos mapeá-los primeiro para você não achar que são erros de digitação: o `type` da lição 3 se chama `kind` aqui (naquela época havia só dois tipos de registro, agora temos `agent_run`, e um termo semanticamente mais amplo cai melhor); `input_tokens`/`output_tokens` foram dobrados em um objeto `tokens:{input,output}` (as coisas específicas de chamada de modelo empacotadas juntas); `tool_response` se chama `tool_result` aqui (o payload do hook chama de response, o valor de retorno aqui vem direto da implementação da ferramenta, seguindo a nomenclatura do bloco de conteúdo da API); o `parent_span_id` da lição 4 foi encurtado para `parent_id`. O custo também está declarado: o `stats.mjs` da lição 3 precisa de duas mudanças de nome de campo para ler este log — esta é uma demonstração ao vivo de “alinhamento de vocabulário importa mais do que nomes bonitos”. O **vocabulário** dos campos ainda vale a pena alinhar com o material oficial, para que, quando você enfim conectar um backend, não precise trocar de conceito, só de grafia:

| Campo | Contém | Por que você precisa dele |
| --- | --- | --- |
| `ts` | Marca de tempo ISO | Ordenação, alinhamento temporal, a única coisa que consegue alinhar entre processos |
| `trace_id` | Um por execução | Amarra linhas espalhadas de volta à mesma execução |
| `span_id` / `parent_id` | id deste registro / do registro pai | Reconstrói a árvore, é dele que depende reconhecer “quem está sob quem” |
| `kind` | `model_call` / `tool_call` / `agent_run` | Primeiro campo que você usa ao filtrar |
| `name` | `turn-2` / `read_file` | Primeira coisa que o olho humano procura |
| `duration_ms` | Tempo gasto nesta etapa | Achar gargalos de desempenho, também serve para ver “está travado?” |
| `tokens` | in / out da chamada de modelo | O uso de tokens sozinho é a variável explicativa isolada mais forte nos dados oficiais[^S1] |
| `tool_input` / `tool_result` | Formato + comprimento + trecho truncado | Julgar “os parâmetros estão certos?” “o retorno está vazio?” |
| `error` | Trecho da mensagem de erro, `null` se não houver | Primeiro campo a filtrar na hora de localizar |

O truque do `trace_id` foi aprendido do oficial: um prompt de usuário dispara várias chamadas de API e várias ferramentas, e o oficial usa um atributo `prompt.id` para amarrar todas de volta ao prompt disparador; a abordagem oficial de tracing também é direta — para rastrear toda a atividade disparada por um único prompt, filtre os eventos por um valor específico de `prompt.id`[^S4]. Aqui usamos `trace_id`; uma execução é uma tarefa, então use `trace_id`, faz exatamente a mesma coisa. A propósito, não há `session_id` aqui: uma execução deste script é uma sessão, manter esse campo seria sem sentido; cenários de várias rodadas e várias sessões o trazem de volta, e a referência de vocabulário está na lição 3.

A linha de métricas também não foi escolhida a esmo. Além da acurácia de topo, o oficial recomenda coletar: tempo total de execução de chamadas de ferramenta individuais e de tarefas, número total de chamadas de ferramenta, consumo total de tokens, erros de ferramenta[^S3] — essas quatro coisas têm onde aterrissar na linha de resumo e no `duration_ms` de cada registro. `rounds` é o quinto número que eu acrescentei, prático para ver de relance quantas iterações do loop houve. Você já usou o conjunto oficial no curso 10 (Verificação e garantia de qualidade: não deixe passar o que só “parece certo”) — lá para avaliar, aqui para diagnosticar com a mesma régua.

### Quanto conteúdo registrar: a única linha que esta lição pede que você trace sozinho

`tool_input` e `tool_result` podem ser um CSV inteiro, uma entrada de usuário inteira, um documento inteiro escrito. Registrar tudo é tecnicamente uma linha de código, mas por padrão você não deveria.

A postura padrão da telemetria oficial é clara: **coisas estruturais sempre gravadas, conteúdo nunca gravado** — cada span tem duração, nome do modelo, nome da ferramenta e contagem de tokens gravada quando a API devolve o uso, enquanto o conteúdo lido e escrito pelo agente por padrão não é coletado[^S6]. Prompts de usuário, a mesma coisa: por padrão só o comprimento é gravado, e gravar o conteúdo exige uma variável de ambiente separada[^S4]. E o oficial emparelha esse tipo de chave com uma afirmação dura: a menos que seu pipeline de observabilidade esteja aprovado para armazenar os dados que seu agente manipula, deixe essas chaves desligadas[^S6].

Nossa camada deixa um meio-termo: por padrão grava `shape` (é string ou objeto, qual o comprimento, quais as chaves), `chars` (contagem de caracteres) mais um trecho dos primeiros 60 caracteres como resumo de cabeça. O trecho existe para você reconhecer de relance “qual arquivo ele leu desta vez” durante a sua própria depuração, sem precisar reexecutar repetidamente. O `HEAD_CHARS = 60` no código é onde essa linha fica; defina `0` e nenhuma palavra de conteúdo toca o disco. Onde você traça essa linha no seu próprio projeto depende de onde os logs aterrissam, de quem consegue vê-los, de se a aprovação de dados foi obtida — esta é uma pergunta de conformidade, não uma pergunta técnica.

## O arranjo de verificação: onde as diferenças das três versões ficam pregadas

Esta lição roda três vezes: uma normal, uma com bug, uma corrigida. As três saídas precisam ser comparáveis linha a linha, então **as respostas do modelo não podem ser reais** — respostas reais de modelo diferem toda vez, você não consegue usá-las para ensinar a localizar. Seguindo a abordagem antiga dos cursos 8 a 10 desta série: **cliente stub com fila de respostas fixa**. `client.messages.create()` não envia requisição de rede, devolve em sequência objetos de resposta pré-escritos de um array, cada objeto carregando `stop_reason`, `content` e `usage` completos. O loop do harness não muda uma palavra — o que ele recebe tem formato idêntico ao que um cliente real devolveria.

As diferenças de todas as três versões ficam pregadas na tabela `VERSIONS` do código; cada versão tem duas coisas:

| Versão | Fila de respostas | Mensagem de erro do `read_file` | Resultado |
| --- | --- | --- | --- |
| `v-good` | Os três CSVs lidos corretamente | Versão opaca | `summary.md` correto |
| `v-bug` | Nome do segundo arquivo digitado como `sourth` | Versão opaca | Inventou uma região Centro da China |
| `v-fixed` | O mesmo erro de digitação `sourth` | Versão com orientação acionável | Correto |

Fora desta tabela, **toda outra linha de código é compartilhada pelas três versões**. As ferramentas leem/escrevem disco de verdade: `list_files` faz `readdirSync` de verdade, `read_file` lê arquivos de verdade e lança exceção de verdade porque o arquivo não existe, `write_file` escreve `summary.md` no disco de verdade. Então aquele erro em `v-bug` não é um objeto de erro forjado, é o sistema de arquivos genuinamente não achando aquele arquivo.

Para deixar claro: stubs resolvem “o lado do modelo é reproduzível”, não “o agente é determinístico”. Rodando de verdade, o mesmo prompt duas vezes pode escolher ferramentas diferentes e tomar caminhos diferentes[^S1]. O valor desta camada de observabilidade está exatamente aqui — os caminhos diferem a cada vez, mas a cada vez há um registro para revisar.

O que precisa ser dito com clareza: os stubs pregam o lado do modelo para que reexecuções completas funcionem; APIs reais voltam ao retomar-do-erro. Esta lição se atreve a fazer reexecuções completas justamente porque o lado do modelo está pregado por stub — reexecutar não introduz variáveis novas, e a comparação linha a linha se sustenta. Quando você conectar APIs reais, os stubs somem, e você volta à abordagem da lição 5: retomar do erro.

## Código completo: observed-agent.mjs

Um arquivo inteiro, zero dependências, roda com `node` puro. Salve como `observed-agent.mjs` e depois `node observed-agent.mjs --version v-bug` executa.

```javascript
#!/usr/bin/env node
// observed-agent.mjs —— Instala uma camada de observabilidade no harness (logs estruturados + árvore de trace + resumo de métricas)
// Uso: node observed-agent.mjs --version v-good|v-bug|v-fixed
// Zero dependências, roda com node puro. As chamadas de modelo são movidas por um cliente stub com fila de respostas fixa; as diferenças entre as três versões estão na tabela VERSIONS abaixo.
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

const MODEL = "claude-sonnet-4-5";
const MAX_TOKENS = 4096;
const MAX_ROUNDS = 12;      // Teto do loop: ultrapassar significa descontrole, saída não-zero
const HEAD_CHARS = 60;      // Máximo de caracteres por trecho de conteúdo no log; defina 0 para não gravar palavra alguma

// ============ 1. Tarefa sob teste: ler os CSVs de vendas em data/, agregar por região, escrever summary.md ============

const CSV_FILES = {
  "2026-q1-east.csv":
    "regiao,mes,valor\nLeste da China,2026-01,182400\nLeste da China,2026-02,161250\nLeste da China,2026-03,204900\n",
  "2026-q1-south.csv":
    "regiao,mes,valor\nSul da China,2026-01,97300\nSul da China,2026-02,88600\nSul da China,2026-03,120450\n",
  "2026-q1-north.csv":
    "regiao,mes,valor\nNorte da China,2026-01,143000\nNorte da China,2026-02,150700\nNorte da China,2026-03,138900\n",
};

function setupWorkspace(root) {
  fs.rmSync(root, { recursive: true, force: true });
  fs.mkdirSync(path.join(root, "data"), { recursive: true });
  for (const [name, body] of Object.entries(CSV_FILES)) {
    fs.writeFileSync(path.join(root, "data", name), body);
  }
}

// ============ 2. Três ferramentas (leem/escrevem disco de verdade, os erros são erros de verdade) ============

const tools = [
  {
    name: "list_files",
    description: "Lista os nomes de arquivo de um diretório, em ordem alfabética, um por linha.",
    input_schema: {
      type: "object",
      properties: { dir: { type: "string", description: "Caminho relativo ao diretório de trabalho, por exemplo data" } },
      required: ["dir"],
    },
  },
  {
    name: "read_file",
    description: "Lê um arquivo de texto pelo caminho e devolve o texto completo. O caminho precisa usar o nome de arquivo original devolvido por list_files.",
    input_schema: {
      type: "object",
      properties: { path: { type: "string", description: "Caminho do arquivo relativo ao diretório de trabalho" } },
      required: ["path"],
    },
  },
  {
    name: "write_file",
    description: "Escreve texto no caminho indicado, sobrescrevendo um arquivo de mesmo nome.",
    input_schema: {
      type: "object",
      properties: {
        path: { type: "string", description: "Caminho do arquivo relativo ao diretório de trabalho" },
        content: { type: "string", description: "Texto completo a escrever" },
      },
      required: ["path", "content"],
    },
  },
];

function resolveInRoot(root, p) {
  const abs = path.resolve(root, p);
  if (abs !== root && !abs.startsWith(root + path.sep)) {
    throw new Error(`O caminho escapa da fronteira, acesso recusado: ${p}`);
  }
  return abs;
}

const impls = {
  list_files({ dir }, ctx) {
    const abs = resolveInRoot(ctx.root, dir);
    return fs.readdirSync(abs).sort().join("\n");
  },
  read_file({ path: p }, ctx) {
    const abs = resolveInRoot(ctx.root, p);
    if (fs.existsSync(abs)) return fs.readFileSync(abs, "utf8");
    // Mesmo "arquivo não encontrado", dois conjuntos de mensagem. v-fixed usa o conjunto com orientação acionável.
    if (ctx.errorStyle === "actionable") {
      const available = fs
        .readdirSync(path.join(ctx.root, "data"))
        .sort()
        .map((f) => `data/${f}`)
        .join(", ");
      throw new Error(
        `Arquivo ${p} não encontrado. Atualmente em data/: ${available}. ` +
          `Tente de novo com o nome original devolvido por list_files; se o dado de que você precisa realmente não estiver ali, ` +
          `pare e diga ao usuário qual arquivo está faltando, não estime você mesmo os números que faltam.`
      );
    }
    throw new Error(`ENOENT: no such file or directory, open '${p}'`);
  },
  write_file({ path: p, content }, ctx) {
    const abs = resolveInRoot(ctx.root, p);
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, content);
    return `Escreveu ${p} (${content.length} caracteres)`;
  },
};

// ============ 3. Cliente stub: fila de respostas fixa ============

const SUMMARY_CORRECT = `# Resumo de vendas por região — 2026 Q1

| Região | Total (¥) |
| --- | --- |
| Leste da China | 548550 |
| Sul da China | 306350 |
| Norte da China | 432600 |
| Total geral | 1287500 |

Fonte dos dados: data/2026-q1-east.csv, data/2026-q1-south.csv, data/2026-q1-north.csv
`;

const SUMMARY_FABRICATED = `# Resumo de vendas por região — 2026 Q1

| Região | Total (¥) |
| --- | --- |
| Leste da China | 548550 |
| Centro da China | 208000 |
| Norte da China | 432600 |
| Total geral | 1189150 |

Fonte dos dados: arquivos CSV do diretório data/
`;

const say = (text) => ({ type: "text", text });
const call = (id, name, input) => ({ type: "tool_use", id, name, input });
const turn = (stop_reason, content, input_tokens, output_tokens) => ({
  id: `msg_stub_${crypto.randomBytes(3).toString("hex")}`,
  model: MODEL,
  stop_reason,
  content,
  usage: { input_tokens, output_tokens },
});

const READ_EAST = call("toolu_e", "read_file", { path: "data/2026-q1-east.csv" });
const READ_NORTH = call("toolu_n", "read_file", { path: "data/2026-q1-north.csv" });
const READ_SOUTH = call("toolu_s", "read_file", { path: "data/2026-q1-south.csv" });
const READ_TYPO = call("toolu_x", "read_file", { path: "data/2026-q1-sourth.csv" });

const VERSIONS = {
  // Tudo às mil maravilhas: os três CSVs são lidos, a agregação sai certa.
  "v-good": {
    errorStyle: "opaque",
    queue: [
      turn("tool_use", [say("Primeiro vou ver quais arquivos existem em data/."), call("toolu_l", "list_files", { dir: "data" })], 812, 96),
      turn("tool_use", [say("Três CSVs regionais, vou ler os três juntos."), READ_EAST, READ_SOUTH, READ_NORTH], 946, 218),
      turn("tool_use", [say("Peguei as três regiões, vou escrever a agregação."), call("toolu_w", "write_file", { path: "summary.md", content: SUMMARY_CORRECT })], 1584, 342),
      turn("end_turn", [say("Escrevi summary.md: Leste da China 548550, Sul da China 306350, Norte da China 432600, total 1287500.")], 1961, 74),
    ],
  },
  // Versão com bug: o nome do segundo CSV sai com erro de digitação, a ferramenta devolve um erro opaco, o modelo não para, inventa uma região e segue escrevendo.
  "v-bug": {
    errorStyle: "opaque",
    queue: [
      turn("tool_use", [say("Primeiro vou ver quais arquivos existem em data/."), call("toolu_l", "list_files", { dir: "data" })], 812, 96),
      turn("tool_use", [say("Três CSVs regionais, vou ler os três juntos."), READ_EAST, READ_TYPO, READ_NORTH], 946, 218),
      turn("tool_use", [say("Os dados estão completos, vou escrever a agregação."), call("toolu_w", "write_file", { path: "summary.md", content: SUMMARY_FABRICATED })], 1602, 355),
      turn("end_turn", [say("Escrevi summary.md: Leste da China 548550, Centro da China 208000, Norte da China 432600, total 1189150.")], 1990, 81),
    ],
  },
  // Versão corrigida: o mesmo erro de digitação, mas a mensagem de erro foi trocada pela versão com orientação acionável, e o modelo passa a tentar de novo em vez de inventar.
  "v-fixed": {
    errorStyle: "actionable",
    queue: [
      turn("tool_use", [say("Primeiro vou ver quais arquivos existem em data/."), call("toolu_l", "list_files", { dir: "data" })], 812, 96),
      turn("tool_use", [say("Três CSVs regionais, vou ler os três juntos."), READ_EAST, READ_TYPO, READ_NORTH], 946, 218),
      turn("tool_use", [say("Digitei o nome errado, sourth, vou reler com o nome original que veio na mensagem de erro."), READ_SOUTH], 1688, 64),
      turn("tool_use", [say("Peguei as três regiões, vou escrever a agregação."), call("toolu_w", "write_file", { path: "summary.md", content: SUMMARY_CORRECT })], 1849, 342),
      turn("end_turn", [say("Escrevi summary.md: Leste da China 548550, Sul da China 306350, Norte da China 432600, total 1287500. Observação: no começo digitei o nome do arquivo como data/2026-q1-sourth.csv e refiz a leitura com o nome original vindo de list_files. Se houver dados de outras regiões fora de data/, me diga onde está o arquivo, eu não vou preencher os números por conta própria.")], 2226, 118),
    ],
  },
};

function makeStubClient(queue) {
  let i = 0;
  return {
    messages: {
      async create(req) {
        if (!req.model || !req.max_tokens) {
          throw new Error("Cliente stub: create precisa levar model e max_tokens");
        }
        if (i >= queue.length) {
          const err = new Error(`Fila do stub esgotada: a requisição ${i + 1} não tem resposta pré-definida`);
          err.code = "STUB_QUEUE_EXHAUSTED";
          throw err;
        }
        return queue[i++];
      },
    },
  };
}

// ============ 4. Camada de observabilidade, parte um: logs estruturados (JSON Lines) ============

const newId = (prefix) => `${prefix}-${crypto.randomBytes(4).toString("hex")}`;

function shapeOf(value) {
  if (value === null || value === undefined) return "null";
  if (Array.isArray(value)) return `array(${value.length})`;
  if (typeof value === "string") return `string(${value.length})`;
  if (typeof value === "object") return `object{${Object.keys(value).join(",")}}`;
  return typeof value;
}

// Por padrão só grava formato + comprimento + trecho dos primeiros HEAD_CHARS caracteres, nunca o texto completo.
function summarize(value) {
  const text = typeof value === "string" ? value : JSON.stringify(value ?? null);
  const out = { shape: shapeOf(value), chars: text.length };
  if (HEAD_CHARS > 0) {
    const flat = text.replace(/\s+/g, " ").trim();
    out.head = flat.length > HEAD_CHARS ? `${flat.slice(0, HEAD_CHARS)}…` : flat;
  }
  return out;
}

function createLogger(logPath, traceId) {
  fs.writeFileSync(logPath, "");
  return {
    record(fields) {
      const line = { ts: new Date().toISOString(), trace_id: traceId, ...fields };
      fs.appendFileSync(logPath, `${JSON.stringify(line)}\n`);
    },
  };
}

// ============ 5. Camada de observabilidade, parte dois: reconstruir a árvore de trace a partir do JSONL ============

function buildTree(records) {
  const byId = new Map(records.map((r) => [r.span_id, { ...r, children: [] }]));
  const roots = [];
  for (const node of byId.values()) {
    const parent = node.parent_id ? byId.get(node.parent_id) : null;
    if (parent) parent.children.push(node);
    else roots.push(node);
  }
  return roots;
}

const clip = (s, n) => (s.length > n ? `${s.slice(0, n)}…` : s);

function labelOf(n) {
  const name = n.name.padEnd(13);
  const dur = `${String(n.duration_ms).padStart(3)}ms`;
  if (n.kind === "agent_run") return `agent_run  ${name}${dur}  trace_id=${n.trace_id}`;
  if (n.kind === "model_call") {
    const t = n.tokens;
    return `model_call ${name}${dur}  in=${t.input} out=${t.output}  stop=${n.stop_reason}`;
  }
  if (n.kind === "harness_error") return `harness_err ${name}${dur}  ${n.error.head ?? n.error.shape}`;
  const inHead = clip(n.tool_input.head ?? n.tool_input.shape, 34);
  const out = n.error ? `ERROR ${clip(n.error.head ?? n.error.shape, 44)}` : `ok ${n.tool_result.shape}`;
  return `tool_call  ${name}${dur}  in=${inHead}  ${out}`;
}

function renderTree(nodes, prefix, lines) {
  nodes.forEach((node, idx) => {
    const last = idx === nodes.length - 1;
    lines.push(prefix === null ? labelOf(node) : `${prefix}${last ? "└─ " : "├─ "}${labelOf(node)}`);
    const childPrefix = prefix === null ? "" : `${prefix}${last ? "   " : "│  "}`;
    renderTree(node.children, childPrefix, lines);
  });
  return lines;
}

// ============ 6. Camada de observabilidade, parte três: resumo de métricas ============

function metricsOf(records) {
  const model = records.filter((r) => r.kind === "model_call");
  const tool = records.filter((r) => r.kind === "tool_call");
  const root = records.find((r) => r.kind === "agent_run");
  return {
    // Neste harness uma rodada equivale a uma requisição de modelo, então rounds pega direto os model_calls;
    // quando a fila do stub se esgota e lança harness_error, a última rodada não tem model_call correspondente — nessa execução os dois números diferem em 1
    rounds: model.length,
    model_calls: model.length,
    tool_calls: tool.length,
    errors: records.filter((r) => r.error).length,
    tokens_in: model.reduce((s, r) => s + r.tokens.input, 0),
    tokens_out: model.reduce((s, r) => s + r.tokens.output, 0),
    wall_ms: root ? root.duration_ms : 0,
  };
}

// ============ 7. O loop do harness sob observação ============

async function runToolUses(content, ctx) {
  const results = [];
  for (const block of content) {
    if (block.type !== "tool_use") continue;
    const spanId = newId("span");
    const startedAt = Date.now();
    const base = {
      span_id: spanId,
      parent_id: ctx.parentId,
      kind: "tool_call",
      name: block.name,
      tool_input: summarize(block.input),
    };
    try {
      const impl = impls[block.name];
      if (!impl) throw new Error(`Ferramenta desconhecida: ${block.name}`);
      const result = impl(block.input, ctx);
      ctx.log.record({ ...base, duration_ms: Date.now() - startedAt, tool_result: summarize(result), error: null });
      results.push({ type: "tool_result", tool_use_id: block.id, content: result });
    } catch (e) {
      ctx.log.record({ ...base, duration_ms: Date.now() - startedAt, tool_result: null, error: summarize(e.message) });
      results.push({ type: "tool_result", tool_use_id: block.id, content: e.message, is_error: true });
    }
  }
  return results;
}

async function main() {
  const argv = process.argv.slice(2);
  const version = argv[argv.indexOf("--version") + 1];
  if (!argv.includes("--version") || !VERSIONS[version]) {
    console.error("Uso: node observed-agent.mjs --version v-good|v-bug|v-fixed");
    process.exit(2);
  }

  const root = path.resolve(process.cwd(), "runs", version);
  setupWorkspace(root);

  const traceId = newId("tr");
  const log = createLogger(path.join(root, "run.log.jsonl"), traceId);
  const rootSpan = newId("span");
  const runStartedAt = Date.now();

  const { queue, errorStyle } = VERSIONS[version];
  const client = makeStubClient(queue);
  const ctx = { root, errorStyle, log, parentId: rootSpan };
  const messages = [
    {
      role: "user",
      content: "Agregue os CSVs de vendas do diretório data/ em totais por região e escreva em summary.md. Use apenas dados que existam de verdade nos arquivos.",
    },
  ];

  let rounds = 0;
  let exitCode = 0;
  const callModel = async () => {
    const spanId = newId("span");
    const startedAt = Date.now();
    rounds += 1;
    const response = await client.messages.create({ model: MODEL, max_tokens: MAX_TOKENS, tools, messages });
    log.record({
      span_id: spanId,
      parent_id: rootSpan,
      kind: "model_call",
      name: `turn-${rounds}`,
      duration_ms: Date.now() - startedAt,
      stop_reason: response.stop_reason,
      tokens: { input: response.usage.input_tokens, output: response.usage.output_tokens },
      error: null,
    });
    ctx.parentId = spanId;
    return response;
  };

  try {
    let response = await callModel();
    while (response.stop_reason === "tool_use") {
      if (rounds >= MAX_ROUNDS) throw new Error(`MAX_ROUNDS=${MAX_ROUNDS} excedido, considerado descontrole`);
      messages.push({ role: "assistant", content: response.content });
      const toolResults = await runToolUses(response.content, ctx);
      messages.push({ role: "user", content: toolResults });
      response = await callModel();
    }
  } catch (e) {
    log.record({
      span_id: newId("span"),
      parent_id: rootSpan,
      kind: "harness_error",
      name: e.code ?? "harness_error",
      duration_ms: 0,
      error: summarize(e.message),
    });
    console.error(`Harness interrompido: ${e.message}`);
    exitCode = 2;
  }

  log.record({
    span_id: rootSpan,
    parent_id: null,
    kind: "agent_run",
    name: "sales-summary",
    duration_ms: Date.now() - runStartedAt,
    error: null,
  });

  // Depois que a execução termina, as visões são reconstruídas só a partir do JSONL em disco — a cópia em memória não vale.
  const records = fs
    .readFileSync(path.join(root, "run.log.jsonl"), "utf8")
    .split("\n")
    .filter(Boolean)
    .map((l) => JSON.parse(l));

  const m = metricsOf(records);
  console.log(`\n=== Árvore de trace (${version}, reconstruída a partir de run.log.jsonl) ===`);
  console.log(renderTree(buildTree(records), null, []).join("\n"));
  console.log(
    `\n=== Resumo de métricas (${version}) ===\n` +
      `rounds=${m.rounds} model_calls=${m.model_calls} tool_calls=${m.tool_calls} ` +
      `errors=${m.errors} tokens_in=${m.tokens_in} tokens_out=${m.tokens_out} ` +
      `tokens_total=${m.tokens_in + m.tokens_out} wall=${m.wall_ms}ms`
  );
  console.log(`Log: runs/${version}/run.log.jsonl  Artefato: runs/${version}/summary.md`);
  process.exit(exitCode);
}

main();
```

Alguns pontos que valem destaque separado:

- **O loop em si não mudou.** Aquele `while (response.stop_reason === "tool_use")` do curso 7 (Fundamentos do Harness de Agente: Laços e Controle) não moveu uma palavra; a observabilidade envolve por fora: `callModel()` grava uma marca de tempo antes e depois da requisição, `runToolUses()` envolveu cada bloco de ferramenta em um try/catch mais um cronômetro. Tire esses dois envoltórios e o que sobra é o loop original.
- **`MAX_ROUNDS` é uma comporta dura.** Agentes precisam de condições de parada, como um número máximo de iterações; isso faz parte do controle[^S2]. Ultrapassar lança um erro, grava um `harness_error` e sai com código 2.
- **Divisão de trabalho dos códigos de saída.** Este script só cuida de executar e registrar: execução terminada significa 0; parâmetros errados ou descontrole significam não-zero. “A saída está correta?” é trabalho da suíte de verificadores do curso 10 (Verificação e garantia de qualidade: não deixe passar o que só “parece certo”) — note que `v-bug` também sai com 0, o harness acha que terminou tudo tranquilo. A verificação te diz se quebrou, esta camada te diz por quê.
- **Erros de ferramenta não quebram o loop.** Os erros são embrulhados em um `tool_result` com `is_error: true` e devolvidos ao modelo, e o loop continua. Isso está correto — agentes precisam obter verdade fundamental do ambiente a cada etapa para avaliar o progresso[^S2], e erros também são feedback. O bug inteiro desta lição acontece na segunda metade dessa frase: o feedback foi dado, mas dado mal demais.

## Primeira execução, tudo às mil maravilhas: v-good

Veja primeiro como é o normal. A saída de terminal abaixo e todas as saídas de terminal seguintes **são genuinamente executadas, não exemplos escritos à mão**.

```text
$ node observed-agent.mjs --version v-good

=== Árvore de trace (v-good, reconstruída a partir de run.log.jsonl) ===
agent_run  sales-summary  2ms  trace_id=tr-93d34d25
├─ model_call turn-1         0ms  in=812 out=96  stop=tool_use
│  └─ tool_call  list_files     0ms  in={"dir":"data"}  ok string(52)
├─ model_call turn-2         0ms  in=946 out=218  stop=tool_use
│  ├─ tool_call  read_file      1ms  in={"path":"data/2026-q1-east.csv"}  ok string(107)
│  ├─ tool_call  read_file      0ms  in={"path":"data/2026-q1-south.csv"}  ok string(99)
│  └─ tool_call  read_file      0ms  in={"path":"data/2026-q1-north.csv"}  ok string(107)
├─ model_call turn-3         0ms  in=1584 out=342  stop=tool_use
│  └─ tool_call  write_file     0ms  in={"path":"summary.md","content":"# …  ok string(36)
└─ model_call turn-4         0ms  in=1961 out=74  stop=end_turn

=== Resumo de métricas (v-good) ===
rounds=4 model_calls=4 tool_calls=5 errors=0 tokens_in=5303 tokens_out=730 tokens_total=6033 wall=2ms
Log: runs/v-good/run.log.jsonl  Artefato: runs/v-good/summary.md
```

Seus `trace_id`, `span_id`, `ts` e contagens de milissegundos vão diferir dos meus — os ids são gerados aleatoriamente a cada execução, os milissegundos são duração genuína. Fora isso, cada linha deve bater palavra por palavra.

Ler esta árvore de cima a baixo é uma frase completa: primeiro lista o diretório (`turn-1`), depois **numa única rodada lê três arquivos em paralelo** (`turn-2`, com três nós irmãos abaixo), depois escreve o arquivo (`turn-3`) e por fim encerra (`turn-4`, `stop=end_turn`). Aquelas três linhas paralelas são três blocos `tool_use` na mesma resposta do modelo, então o `parent_id` delas aponta para o mesmo `model_call` — o formato da árvore mostra diretamente “o que o modelo quis fazer nesta rodada”.

Não leve a sério aquela coluna de `0ms` nos `model_call`: o cliente stub não tem ida e volta de rede, então a duração da requisição de modelo é toda 0. Depois de conectar APIs reais, esta coluna ganha valor diagnóstico — acompanhar durações de requisição de API e tempos de execução de ferramenta serve exatamente para achar gargalos de desempenho[^S4].

O arquivo de log fica assim, um JSON completo por linha, dá para usar `grep` direto:

```text
$ head -3 runs/v-good/run.log.jsonl
{"ts":"2026-08-29T16:34:19.021Z","trace_id":"tr-93d34d25","span_id":"span-e44e408c","parent_id":"span-c6dcb927","kind":"model_call","name":"turn-1","duration_ms":0,"stop_reason":"tool_use","tokens":{"input":812,"output":96},"error":null}
{"ts":"2026-08-29T16:34:19.022Z","trace_id":"tr-93d34d25","span_id":"span-3f619517","parent_id":"span-e44e408c","kind":"tool_call","name":"list_files","tool_input":{"shape":"object{dir}","chars":14,"head":"{\"dir\":\"data\"}"},"duration_ms":0,"tool_result":{"shape":"string(52)","chars":52,"head":"2026-q1-east.csv 2026-q1-north.csv 2026-q1-south.csv"},"error":null}
{"ts":"2026-08-29T16:34:19.022Z","trace_id":"tr-93d34d25","span_id":"span-b298365f","parent_id":"span-c6dcb927","kind":"model_call","name":"turn-2","duration_ms":0,"stop_reason":"tool_use","tokens":{"input":946,"output":218},"error":null}
```

A linha dois é aquele `list_files`: o `parent_id` aponta para o `span_id` da linha um (então ele fica pendurado sob `turn-1`), dentro de `tool_input` só há formato, comprimento e um trechinho, e `tool_result` o mesmo — `shape` é `string(52)`, e `head` traz os três nomes de arquivo. Nem um byte desta linha é “conteúdo de arquivo”, mas você já consegue responder “o que esta etapa chamou, que formato de coisa ele recebeu, deu erro?”.

Olhe de novo a linha de resumo de métricas: 4 rodadas, 5 chamadas de ferramenta, 0 erros, 6033 tokens, e no fim da linha também a duração total. Esta linha de números vale uma olhada toda vez que uma execução termina — a contagem de chamadas de ferramenta pode expor rotinas fixas que o agente percorre repetidamente, e um monte de chamadas redundantes muitas vezes sugere que os parâmetros de paginação ou de limite de tokens deveriam ser ajustados; enquanto um monte de erros de parâmetro inválido pode dizer que as descrições de ferramenta deveriam ser mais claras e os exemplos mais completos[^S3]. Tokens merecem atenção especial: ao analisar desempenho de eval, o oficial descobriu que o uso de tokens sozinho explica 80% da variância, e os outros dois fatores explicativos são a contagem de chamadas de ferramenta e a escolha do modelo[^S1].

```agentmentor-check
{
  "id": "obs-zh-06-log-everything",
  "label": "Quanto da entrada/saída das ferramentas deve ser registrado",
  "prompt": "Você acabou de instalar esta camada de observabilidade no seu projeto. Um colega olha o log e diz que tool_input e tool_result com só os primeiros 60 caracteres é mesquinho demais, e sugere mudar para gravar entrada/saída completas de cada chamada de ferramenta: “disco é barato mesmo, gravar tudo não faz mal, e quando algo quebrar de verdade está tudo ali”. Como você responde?",
  "whyHere": "O leitor acabou de ver um run.log.jsonl real, em que o campo head está de fato truncado — esta é a única decisão de projeto desta camada de observabilidade em que a linha é traçada por você, e também o lugar mais fácil de se deixar levar pela intuição do “gravar tudo não faz mal”, um bom ponto para checar se ele entendeu a postura padrão e as pré-condições para ligar o texto completo",
  "mode": "single",
  "choices": [
    {
      "id": "a",
      "text": "Concordar: disco é barato mesmo, gravar o texto completo é o mais seguro, e quando algo quebrar você não precisa reexecutar para restaurar a cena",
      "correct": false,
      "feedback": "“Gravar tudo não faz mal” só se sustenta na dimensão do disco. O que fica parado nos logs é conteúdo de negócio que o agente leu e escreveu — entrada de usuário, conteúdo de arquivos, documentos escritos; assim que isso aterrissa num lugar aprovado apenas como “logs operacionais”, vira uma cópia não gerenciada de dados sensíveis. E os arquivos incham rápido: uma execução gera dezenas de registros, cada um enfiando alguns KB de texto completo, e depois de milhares de execuções até um grep demora uma eternidade — na prática fica mais difícil de buscar. Quando você genuinamente precisa do texto completo, o certo é ler a própria transcrição da sessão, não guardar uma cópia nos logs de telemetria."
    },
    {
      "id": "b",
      "text": "Por padrão continuar gravando estrutura e trecho — formato, comprimento, primeiras dezenas de caracteres; isso basta para localizar “qual etapa, qual parâmetro, o retorno está vazio?”; para gravar texto completo, primeiro confirme que o destino do log está aprovado para armazenar esse tipo de dado, e quando uma inspeção pontual precisar do texto completo, vá ler a transcrição da sessão",
      "correct": true,
      "feedback": "Isso. A postura padrão da telemetria oficial é exatamente essa: coisas estruturais como duração, nome do modelo e nome da ferramenta gravadas em cada span, contagem de tokens gravada quando a API devolve o uso, enquanto o conteúdo lido e escrito pelo agente por padrão não é coletado; prompts de usuário idem, por padrão só o comprimento é gravado, e gravar o conteúdo exige acionar uma chave separada. E a afirmação oficial para esse tipo de chave é “a menos que seu pipeline de observabilidade esteja aprovado para armazenar os dados que seu agente manipula, deixe essas chaves desligadas” — isso é uma restrição de conformidade, não uma sugestão de desempenho. O que de fato sustenta a localização é a estrutura: qual etapa, quais parâmetros, que formato de retorno, deu erro? Texto completo é coisa de que só se precisa em inspeções pontuais; para isso, vá ler a transcrição."
    },
    {
      "id": "c",
      "text": "Inverter tudo: não gravar uma palavra de conteúdo, só contar quantas vezes cada ferramenta foi chamada basta, e o resto se resolve reexecutando para reproduzir",
      "correct": false,
      "feedback": "Correção exagerada, e “reexecutar para reproduzir” é um caminho que não funciona com agentes — o mesmo prompt em duas execuções toma caminhos diferentes, porém igualmente válidos; você pode reexecutar dez vezes e obter dez resultados corretos. Com apenas estatísticas de contagem de chamadas, você não consegue nem responder “por qual caminho passou aquele read_file que deu erro”, e o processo de localização inteiro desta lição quebra na primeira etapa. A verdadeira linha divisória não é “gravar ou não”, é “gravar estrutura ou gravar conteúdo”: formato, comprimento, nomes de parâmetro e mensagens de erro pertencem à estrutura e permitem localizar; conteúdo de arquivo e as palavras originais do usuário pertencem ao conteúdo e, por padrão, não vão para o disco."
    }
  ]
}
```

## Reproduza o sintoma: v-bug

Agora rode a versão com bug. A fila do stub tem enterrada dentro dela a divergência real da abertura da lição; não espie primeiro, ache você mesmo a partir da saída.

```text
$ node observed-agent.mjs --version v-bug

=== Árvore de trace (v-bug, reconstruída a partir de run.log.jsonl) ===
agent_run  sales-summary  1ms  trace_id=tr-6e45c8c4
├─ model_call turn-1         0ms  in=812 out=96  stop=tool_use
│  └─ tool_call  list_files     0ms  in={"dir":"data"}  ok string(52)
├─ model_call turn-2         0ms  in=946 out=218  stop=tool_use
│  ├─ tool_call  read_file      0ms  in={"path":"data/2026-q1-east.csv"}  ok string(107)
│  ├─ tool_call  read_file      0ms  in={"path":"data/2026-q1-sourth.csv"}  ERROR ENOENT: no such file or directory, open 'dat…
│  └─ tool_call  read_file      0ms  in={"path":"data/2026-q1-north.csv"}  ok string(107)
├─ model_call turn-3         0ms  in=1602 out=355  stop=tool_use
│  └─ tool_call  write_file     0ms  in={"path":"summary.md","content":"# …  ok string(36)
└─ model_call turn-4         0ms  in=1990 out=81  stop=end_turn

=== Resumo de métricas (v-bug) ===
rounds=4 model_calls=4 tool_calls=5 errors=1 tokens_in=5350 tokens_out=750 tokens_total=6100 wall=1ms
Log: runs/v-bug/run.log.jsonl  Artefato: runs/v-bug/summary.md
```

O artefato está de fato errado:

```text
$ cat runs/v-bug/summary.md
# Resumo de vendas por região — 2026 Q1

| Região | Total (¥) |
| --- | --- |
| Leste da China | 548550 |
| Centro da China | 208000 |
| Norte da China | 432600 |
| Total geral | 1189150 |

Fonte dos dados: arquivos CSV do diretório data/
```

Note primeiro algumas coisas invisíveis de fora:

- Contagem de rodadas e contagem de chamadas de ferramenta idênticas às de `v-good`: 4 rodadas, 5 chamadas. Olhando só para esses dois números, as duas execuções parecem idênticas.
- Tokens subiram só 67 (6100 contra 6033). Se o seu alerta é “tokens acima do limiar”, este aqui nem tocaria a campainha.
- Só `errors=1`, este único número mudou. É por isso que erros de ferramenta precisam ser cidadãos de primeira classe nas métricas[^S3] — é o único sinal, no nível do resumo, de que esta execução tem algo errado.
- Aquele último `model_call` é `stop=end_turn`, o agente acha que **completou a tarefa com sucesso**. Ele não deu erro, não pediu ajuda, não mencionou que faltava um pedaço de dado. O que ele omite no feedback muitas vezes pode ser mais importante do que o que ele inclui[^S3].

## Localização em cinco etapas: do rastreamento do sintoma à primeira divergência

A localização em cinco etapas da lição 5 é a orquestração geral; os materiais desta rodada são especiais — três logs comparáveis linha a linha na mão — então três das cinco etapas mudaram de forma, escritos lado a lado:

| Etapas gerais da lição 5 | Forma nesta rodada | Por que muda |
| --- | --- | --- |
| 1 Estreitar | Fixar esta única execução | Igual, filtrar por id |
| 2 Achar a primeira divergência | Identificar na árvore | Igual, só que a evidência virou árvore |
| 3 Reexecutar e observar | Reconhecer a jusante como contágio | Os stubs já são uma reexecução pregada, e a vaga desta etapa vai para a análise de contágio |
| 4 Martelar repetidamente o mesmo componente | Determinar a causa | Três logs podem ser comparados linha a linha, não é preciso martelar para forçar falhas probabilísticas |
| 5 Depois de corrigir, retomar do erro | Comparação por reexecução | Veja abaixo — os dois não conflitam, as condições de aplicação é que diferem |

A etapa cinco precisa de explicação à parte. A lição 5 defende “depois de corrigir, retome do erro, não reexecute do zero”, com o motivo de que reexecuções completas reintroduzem não determinismo e você não consegue distinguir “corrigi certo” de “tive sorte desta vez”. Esta lição se atreve a fazer reexecuções completas justamente porque o lado do modelo está pregado por stub — reexecutar não introduz variáveis novas, e a comparação linha a linha se sustenta. Quando você conectar APIs reais, os stubs somem, e você volta à abordagem da lição 5: retomar do erro.

Aterrissando nos materiais desta rodada, as cinco etapas são as de baixo. Finja que você ainda não sabe a resposta e percorra uma vez.

### Etapa um: fixe esta única execução

Em ambiente de produção, os logs de todas as execuções se misturam num único fluxo. Simule primeiro essa situação, juntando os logs das três execuções:

```text
$ cat runs/v-good/run.log.jsonl runs/v-bug/run.log.jsonl runs/v-fixed/run.log.jsonl > all-runs.log.jsonl
$ wc -l < all-runs.log.jsonl
      32
$ grep -c 'tr-6e45c8c4' all-runs.log.jsonl
10
```

Das 32 linhas, só 10 pertencem à execução com bug. Esta etapa usa a abordagem de tracing dada pelo oficial: para rastrear toda a atividade disparada por um prompt, filtre os eventos por aquele id específico[^S4]. Se ele se chama `prompt.id` ou `trace_id` não importa; o que importa é que este id exista e que todo registro o carregue.

Já que estamos aqui, dá para conferir quantos erros há no fluxo inteiro:

```text
$ grep -c '"error":{"shape"' all-runs.log.jsonl
2
```

Dois: um de `v-bug`, um de `v-fixed`. `v-good` limpinho.

### Etapa dois: identifique a primeira divergência na árvore

A árvore já está impressa; percorra de cima para baixo e ache **o primeiro registro que não bate com a expectativa**:

```text
│  ├─ tool_call  read_file      0ms  in={"path":"data/2026-q1-sourth.csv"}  ERROR ENOENT: no such file or directory, open 'dat…
```

Sob `turn-2`, três leituras paralelas, e a do meio quebrou. O motivo de ter quebrado está escrito em `tool_input`: o caminho é `data/2026-q1-sourth.csv` — `south` digitado como `sourth`. Aquela linha de `list_files` na árvore só mostra `ok string(52)`; os nomes corretos precisam ser escavados no log: puxe aquele registro (você já o viu no `head -3` acima) e o `tool_result.head` diz `2026-q1-east.csv 2026-q1-north.csv 2026-q1-south.csv` — o modelo de fato recebeu o nome correto. A árvore cuida de localizar, os logs cuidam dos detalhes; as duas camadas cooperam exatamente assim.

Para ver aquele registro completo, pesque-o do fluxo:

```text
$ node -e '
const fs = require("node:fs");
const TRACE = "tr-6e45c8c4";
for (const line of fs.readFileSync("all-runs.log.jsonl", "utf8").split("\n").filter(Boolean)) {
  const r = JSON.parse(line);
  if (r.trace_id === TRACE && r.error) console.log(r.kind, r.name, r.tool_input.head, "->", r.error.head);
}'
tool_call read_file {"path":"data/2026-q1-sourth.csv"} -> ENOENT: no such file or directory, open 'data/2026-q1-sourth…
```

Esta é a divergência. Note **como ela foi reconhecida**: não por adivinhação, por três campos — `trace_id` tranca o escopo nesta única execução, `error` não nulo a separa dos dez registros, e `tool_input.head` te diz onde os parâmetros saíram errados. Três campos, nenhum dispensável.

### Etapa três: reconheça os absurdos a jusante como contágio, não corrija cada um

Depois da divergência, no `turn-3` o modelo escreve uma agregação com uma região Centro da China e no `turn-4` reporta “tarefa concluída”. As duas etapas parecem bem absurdas, mas os dois são a jusante:

| Registro | Comportamento | Causa ou contágio |
| --- | --- | --- |
| Erro de `read_file` no `turn-2` | Parâmetro digitado errado, a ferramenta devolve uma linha de ENOENT | **Causa** |
| `write_file` do `turn-3` | Escreveu uma região Centro da China inexistente | Contágio |
| `end_turn` do `turn-4` | Afirma conclusão bem-sucedida | Contágio |

Em sistemas de agente, uma etapa falhando basta para fazê-lo desviar para uma trajetória completamente diferente, com resultado final imprevisível[^S1] — este é o exemplo mais limpo disso. Se você só tivesse o `summary.md` final, onde iria corrigir? Provavelmente iria mudar o prompt: “não invente dados”, “sempre cite as fontes dos dados”. Todas essas mudanças acertam o contágio, não acertam a lesão. Da próxima vez, troque o método do erro de digitação e ele vai inventar de novo.

A propósito, por que este sintoma cresceu até virar “Centro da China” em vez de “faltou Sul da China”: ele de fato recebeu o nome do arquivo (`2026-q1-south.csv` está ali no retorno de `list_files`), e as correspondências east→Leste da China e north→Norte da China já estão nos conteúdos das duas leituras bem-sucedidas anteriores — o que falta a ele são só os números específicos daqueles três meses. Mas aquele ENOENT opaco não lhe disse nem “tente de novo com o nome correto” nem “pare e explique direito”, então ele pegou o caminho mais fácil: disfarçar a lacuna de completude, preenchendo nome de região e números. A invenção não acontece porque ele não sabe nada, acontece porque o erro não lhe deu saída melhor.

### Etapa quatro: determine a causa — o feedback que ele recebeu era péssimo

Nesta etapa, não tenha pressa de culpar o modelo. Olhe o que aquele erro de fato lhe deu:

```text
ENOENT: no such file or directory, open 'data/2026-q1-sourth.csv'
```

Esta linha tem informação suficiente para uma pessoa que é engenheira; para um agente decidindo “o que fazer em seguida”, ela é quase vazia. Ele não consegue ler ali “quais arquivos deste diretório são legíveis”, não consegue ler “eu digitei errado ou este dado genuinamente não existe” e muito menos consegue ler “ao encontrar esta situação eu deveria parar e perguntar, não preencher sozinho”. Agentes precisam contar com feedback de verdade fundamental do ambiente a cada etapa para julgar o progresso[^S2]; este ENOENT foi todo o feedback que ele recebeu.

A sugestão oficial sobre engenharia de ferramentas é exatamente para essa lacuna: quando chamadas de ferramenta levantam erros, as próprias respostas de erro devem ser bem escritas, explicando com clareza melhorias específicas e acionáveis, em vez de jogar um código de erro opaco ou um stack trace[^S3]. Então o que precisa mudar desta vez não é o prompt, é a mensagem de erro do `read_file`.

### Etapa cinco: comparação por reexecução (os stubs pregaram o lado do modelo, aqui dá para reexecutar por inteiro)

O método de correção está na próxima seção; depois de rodar, volte para ver se os números mudaram. Localizar não termina em “eu sei a causa”, termina em “depois de corrigir, aquela etapa no mesmo trace realmente está diferente”.

## Corrija e reexecute: v-fixed

O que mudou foi a parte do `read_file` no código, só a mensagem de erro:

```javascript
if (ctx.errorStyle === "actionable") {
  const available = fs
    .readdirSync(path.join(ctx.root, "data"))
    .sort()
    .map((f) => `data/${f}`)
    .join(", ");
  throw new Error(
    `Arquivo ${p} não encontrado. Atualmente em data/: ${available}. ` +
      `Tente de novo com o nome original devolvido por list_files; se o dado de que você precisa realmente não estiver ali, ` +
      `pare e diga ao usuário qual arquivo está faltando, não estime você mesmo os números que faltam.`
  );
}
```

Esta mensagem enfia três coisas dentro: **estado atual** (o que de fato há no diretório), **o que fazer em seguida** (tentar de novo com o nome original), **quando parar** (se o dado genuinamente não estiver ali, pergunte a uma pessoa, não estime). As duas primeiras dão ao modelo um caminho a percorrer, a terceira bloqueia o caminho da invenção.

A fila de respostas de `v-fixed` demonstra a reação do modelo depois de receber esse erro: em vez de continuar inventando para a frente, ele volta a buscar verificação no ambiente — relê uma vez com o nome original listado na mensagem de erro e, por fim, na frase de encerramento, ainda devolve a pergunta ao usuário: “se houver dados de outras regiões fora de data/, me diga onde está o arquivo, eu não vou preencher os números por conta própria”.

```text
$ node observed-agent.mjs --version v-fixed

=== Árvore de trace (v-fixed, reconstruída a partir de run.log.jsonl) ===
agent_run  sales-summary  2ms  trace_id=tr-5d8babb1
├─ model_call turn-1         0ms  in=812 out=96  stop=tool_use
│  └─ tool_call  list_files     0ms  in={"dir":"data"}  ok string(52)
├─ model_call turn-2         0ms  in=946 out=218  stop=tool_use
│  ├─ tool_call  read_file      0ms  in={"path":"data/2026-q1-east.csv"}  ok string(107)
│  ├─ tool_call  read_file      0ms  in={"path":"data/2026-q1-sourth.csv"}  ERROR Arquivo data/2026-q1-sourth.csv não encontra…
│  └─ tool_call  read_file      0ms  in={"path":"data/2026-q1-north.csv"}  ok string(107)
├─ model_call turn-3         0ms  in=1688 out=64  stop=tool_use
│  └─ tool_call  read_file      0ms  in={"path":"data/2026-q1-south.csv"}  ok string(99)
├─ model_call turn-4         0ms  in=1849 out=342  stop=tool_use
│  └─ tool_call  write_file     1ms  in={"path":"summary.md","content":"# …  ok string(36)
└─ model_call turn-5         0ms  in=2226 out=118  stop=end_turn

=== Resumo de métricas (v-fixed) ===
rounds=5 model_calls=5 tool_calls=6 errors=1 tokens_in=7521 tokens_out=838 tokens_total=8359 wall=2ms
Log: runs/v-fixed/run.log.jsonl  Artefato: runs/v-fixed/summary.md
```

O formato da árvore mudou: aquele ERROR no `turn-2` continua no lugar original, mas abaixo dele nasceu um `turn-3`, dentro do qual há uma releitura com o nome de arquivo correto. O artefato está correto:

```text
$ diff runs/v-good/summary.md runs/v-fixed/summary.md
$ echo $?
0
```

Os dois `summary.md` são idênticos byte a byte, e a região Centro da China sumiu.

As três execuções lado a lado:

| | `v-good` | `v-bug` | `v-fixed` |
| --- | --- | --- | --- |
| rounds | 4 | 4 | 5 |
| tool_calls | 5 | 5 | 6 |
| errors | 0 | 1 | 1 |
| tokens_total | 6033 | 6100 | 8359 |
| `summary.md` | Correto | Tem região Centro da China | Correto |

Duas coisas precisam ser ditas com clareza, senão esta correção é fácil de entender errado:

**Primeiro, `errors` não voltou a zero, e nem deveria.** Aquela leitura com o nome digitado errado continuou dando erro; nós só trocamos a mensagem de erro, deixando o modelo escalar para fora do erro. A correção que genuinamente devolve `errors` a zero está em outra direção — escrever descrições de ferramenta mais explícitas, dar exemplos, para que o modelo não digite errado logo de saída. A leitura diagnóstica oficial corresponde exatamente a isso: grandes quantidades de erros de parâmetro inválido dizem que as descrições de ferramenta deveriam ser mais claras e os exemplos mais completos[^S3]. A descrição de `read_file` neste script já diz “O caminho precisa usar o nome de arquivo original devolvido por list_files”; claramente ainda não basta, e na próxima rodada deveríamos dar a ele um exemplo positivo.

**Segundo, a correção não é de graça.** Os tokens foram de 6033 para 8359, subiram 2326, um aumento de 38%, e o extra veio daquela rodada de ida e volta da releitura. Não é uma explosão, mas também não é custo zero. O custo de uma correção precisa ser posto na mesa e calculado; não dá para só olhar “o resultado está correto” e dar por encerrado.

## Onde ficam as fronteiras desta camada de observabilidade

Esta coisa é pequena, e as fronteiras precisam ser ditas com clareza, para você não achar que instalá-la significa ter observabilidade de produção.

**Ela cobre um processo, uma execução.** Os logs são `appendFileSync` escrevendo direto num arquivo local, e o processo ser morto também não perde nada — isso é deliberado. Conecte um backend real e o tratamento não é este: na estrada do OTLP, a falha de exportação é silenciosa por padrão, endpoint inacessível ou rejeitando, o agente continua rodando, a telemetria é diretamente descartada e nem um erro aparece na sua aplicação; e a telemetria é agrupada em lotes antes de ser exportada em intervalos, e se o processo for morto antes da exportação, o que estiver no buffer do lote já era[^S6]. O “o pipeline de observabilidade vai mentir para você em silêncio” da lição 4 fala deste trecho. O arquivo local desvia dessa cova, e o custo é que ele fica só na máquina local.

**Conectar backends reais e agregação entre processos não estão nesta lição.** Para ligar esta camada a Honeycomb, Datadog, Grafana, Langfuse ou a um coletor auto-hospedado, é preciso o pacote do protocolo OTLP[^S6], os campos precisam ser remapeados, e isso é outro assunto. Como agregar os logs de vários processos de agente, como distinguir por nome de serviço, a mesma coisa.

**Limiares de alerta esta lição não dá em números.** “Taxa de erro de ferramenta acima de quanto deveria alertar?” “Uma execução acima de quantos tokens conta como anomalia?” — a documentação oficial só mencionou que alertas devem ser feitos pelo seu backend, não deu número nenhum[^S4]. Eu também não vou inventar. Seus próprios limiares só podem crescer da sua própria linha de base: primeiro rode por um tempo, veja como é a distribuição das execuções normais, e só então trace a linha.

**A gravação de conteúdo é desligada por padrão.** Aquele `HEAD_CHARS = 60` acima deixou só um trecho bem curto. Para genuinamente ligar o texto completo, a pré-condição é que o seu pipeline de observabilidade esteja aprovado para armazenar os dados que o seu agente manipula[^S6] — passe primeiro pela aprovação de dados e só então mude o código, não o contrário.

**Taxa de amostragem e janela de retenção de log também não serão expandidas.** Uma execução são dezenas de linhas de JSONL; localmente, rodar algumas centenas de vezes não precisa de gestão; quando você precisar considerar isso, já é um problema de backend.

Palavra final: o valor desta camada de observabilidade não está em quanto ela registrou, está em **ela permitir que você faça uma pergunta específica**. “Por que ele inventou uma região Centro da China?” é uma pergunta sem resposta; “nesta execução com `trace_id=tr-6e45c8c4`, qual é o primeiro registro com `error` não nulo, e quais são os parâmetros?” é uma pergunta com resposta. Depois de colocar no ar um tracing de produção completo, só então dá para diagnosticar sistematicamente por que os agentes falharam e corrigir sistematicamente[^S1].

## 💻 Exercícios

<!-- exercises -->

### Nível 1: Leia esta árvore sozinho, sem a explicação

A árvore de trace abaixo foi genuinamente executada a partir de `v-bug` (a mesma do texto principal; `trace_id` e contagens de milissegundos variam por execução). Finja que você a está vendo pela primeira vez e que o colega só te jogou uma linha: “o summary.md tem uma região Centro da China que a nossa empresa não tem”.

```text
agent_run  sales-summary  1ms  trace_id=tr-6e45c8c4
├─ model_call turn-1         0ms  in=812 out=96  stop=tool_use
│  └─ tool_call  list_files     0ms  in={"dir":"data"}  ok string(52)
├─ model_call turn-2         0ms  in=946 out=218  stop=tool_use
│  ├─ tool_call  read_file      0ms  in={"path":"data/2026-q1-east.csv"}  ok string(107)
│  ├─ tool_call  read_file      0ms  in={"path":"data/2026-q1-sourth.csv"}  ERROR ENOENT: no such file or directory, open 'dat…
│  └─ tool_call  read_file      0ms  in={"path":"data/2026-q1-north.csv"}  ok string(107)
├─ model_call turn-3         0ms  in=1602 out=355  stop=tool_use
│  └─ tool_call  write_file     0ms  in={"path":"summary.md","content":"# …  ok string(36)
└─ model_call turn-4         0ms  in=1990 out=81  stop=end_turn
```

O colega também puxou para você aquele registro de log do `list_files` — na árvore ele só mostra `ok string(52)`, os detalhes estão no log (id e milissegundos, como de praxe, variam por execução):

```json
{"trace_id":"tr-6e45c8c4","span_id":"span-8761ea4c","parent_id":"span-e391a987","kind":"tool_call","name":"list_files","tool_input":{"shape":"object{dir}","chars":14,"head":"{\"dir\":\"data\"}"},"duration_ms":0,"tool_result":{"shape":"string(52)","chars":52,"head":"2026-q1-east.csv 2026-q1-north.csv 2026-q1-south.csv"},"error":null}
```

Sem escrever código, responda quatro perguntas por escrito:

1. A primeira divergência é **qual linha**?
2. Sua **base** para julgá-la como a divergência são quais campos na árvore e neste registro de log? Nomeie os campos e o que cada um descarta.
3. Depois da divergência, quais linhas são **contágio**, e não falhas independentes? Diga linha a linha.
4. Se você só tivesse aquele `summary.md` final, sem esta árvore, provavelmente **culparia quem, erradamente**? Por que essa direção não corrige este bug?

<!-- rubric -->

- A Q1 aponta para aquele `read_file` com ERROR sob o `turn-2`, e declara que o parâmetro é `data/2026-q1-sourth.csv` (o digitado errado)
- A Q2 nomeia pelo menos três campos e o papel de cada um: `error` (não nulo, separa este dos outros registros), `tool_input` (expõe o erro de digitação do parâmetro, descarta “o arquivo genuinamente não existe”), o `tool_result.head` daquele registro de log do `list_files` (prova que o modelo de fato recebeu o nome de arquivo correto, descarta “ele não sabe quais arquivos existem”)
- A Q3 julga o `write_file` do `turn-3` e o `end_turn` do `turn-4` ambos como contágio, e explica que os absurdos dos dois nascem daquela leitura falha a montante
- A Q4 aponta que culparia erradamente a “alucinação” do modelo ou o prompt, e explica por que acrescentar “não invente” ao prompt não corrige — porque a lesão é o feedback da ferramenta ser ruim demais, não a instrução ser pouco rígida

<!-- answer -->

1. A primeira divergência é a **do meio entre os três `read_file` paralelos** sob o `turn-2`: `in={"path":"data/2026-q1-sourth.csv"}`, com resultado ERROR. As duas linhas acima e a de baixo são todas `ok`, só ela quebrou.

2. Três campos reconhecem isso em conjunto:

   - Campo `error` não nulo — este é o único registro com ERROR na árvore inteira, os outros nove todos normais. Ele comprime a faixa de candidatos de dez para um.
   - O trecho de `tool_input` — o caminho diz `sourth`, não `south`. Isso descarta “aquele dado genuinamente não existe”: o que está errado é o parâmetro, não o dado.
   - O `tool_result.head` daquele registro de log do `list_files` tem `2026-q1-south.csv` — o modelo claramente recebeu o nome de arquivo correto. Isso descarta “ele não sabe o que há no diretório”.

   Faltando qualquer um dos três campos, a conclusão não se sustenta: só com `error` você sabe que algo aconteceu mas não sabe onde deu errado; só com `tool_input` você não consegue dizer se esta chamada teve sucesso ou falhou; sem aquele retorno de `list_files`, você não consegue julgar se o modelo sequer teve chance de saber o nome correto.

3. As duas linhas depois da divergência são contágio:

   - `write_file` do `turn-3`: a região Centro da China que ele escreveu é inventada, mas quando o modelo a inventou faltava-lhe genuinamente um pedaço de dado, e o erro que ele recebeu não lhe disse o que estava faltando. Esta etapa é uma decisão tomada sobre os destroços da etapa anterior.
   - `end_turn` do `turn-4`: ele reporta tarefa concluída, sem mencionar de forma alguma que faltava um pedaço de dado. Isto igualmente é a continuação dos destroços — ele acha que o que devia ser feito foi feito.

   Uma etapa falhando basta para fazer o agente desviar para uma trajetória completamente diferente; estas duas linhas são dois pontos naquela trajetória, não dois bugs independentes. Corrija qualquer um deles isoladamente, troque o método da falha e novos continuam nascendo.

4. Olhando só para o `summary.md`, o mais fácil é culpar **o modelo**: dizer que ele produziu alucinações, inventou dados, e então acrescentar “não invente dados”, “sempre cite de onde vem cada número” ao prompt. Essa direção não corrige, e o motivo tem duas camadas:

   - A lesão não está nas instruções, está no feedback. Naquela etapa, toda a informação que o modelo recebeu foi uma linha `ENOENT: no such file or directory`, dentro da qual não há nem “quais arquivos estão no diretório” nem “você deveria tentar de novo ou parar e perguntar a uma pessoa”. Você grita mais alto no prompt, e naquela etapa o material na mão dele continua sendo aquela linha.
   - O prompt é global, a divergência é local. Acrescentar uma linha “não invente” afeta o comportamento dele em todas as rodadas, enquanto o ponto que genuinamente precisa de mudança de comportamento é só “a etapa seguinte a um erro de ferramenta”, esse único ponto. Mudar a mensagem de erro acerta o ponto; mudar o prompt salpica na superfície.

   Observação: se você nem `trace_id` tivesse, com os logs misturados num só fluxo, você não conseguiria nem circular “quais dez linhas pertencem a esta execução”, e nenhuma destas quatro perguntas poderia sequer ser iniciada.

<!-- hint -->

Percorra de cima para baixo, não infira de trás para frente a partir do `summary.md`. Em qual camada aparece o primeiro registro que viola a expectativa? “Violar a expectativa” tem um marcador visual bem óbvio nesta árvore.

<!-- hint -->

A Q2 não quer “porque está escrito ERROR”, quer **três** campos, cada um descartando uma possibilidade. Tente perguntar separadamente: esta chamada teve sucesso ou falhou (qual campo)? O que está errado é o parâmetro ou o dado em si (qual campo)? O modelo sabia o nome de arquivo correto naquele momento (qual campo — na árvore ou naquele registro de log)?

### Nível 2: Acrescente uma “comparação de execuções” à camada de observabilidade

Olhar só para as métricas de uma execução isolada torna difícil julgar se uma mudança é boa ou ruim. Escreva um `compare-runs.mjs` que leia dois `run.log.jsonl`, agregue por `kind` e compare lado a lado. Requisitos:

- A linha de comando recebe dois caminhos de arquivo de log: `node compare-runs.mjs <A> <B>`; com parâmetros faltando, imprima o uso e termine com código de saída 2.
- Compare pelo menos isto: contagem de chamadas de modelo, contagem de chamadas de ferramenta, contagem de erros, `tokens_in` / `tokens_out` / `tokens_total`, duração total; as linhas de token também dão a variação percentual.
- Depois agrupe por nome de ferramenta, comparando quantas vezes cada ferramenta foi chamada.
- **Contagem de erros maior que zero em qualquer um dos lados significa saída não-zero**, e imprima qual lado, quantas vezes.
- Depois de escrever, use-o para comparar `v-good` com `v-fixed` e responda: a correção introduziu erros novos? Quanto os tokens aumentaram?

<!-- rubric -->

- Script com zero dependências, roda com `node` puro; com os dois parâmetros faltando, imprime o uso e faz `process.exit(2)`
- O método de agregação é filtrar por `kind` (`model_call` / `tool_call` / `agent_run`) e depois contar, não números de linha fixos no código
- As três linhas de token têm variação percentual, e as linhas de contagem dão os números de aumento/redução
- A comparação agrupada por nome de ferramenta cobre todos os nomes de ferramenta que aparecem nos dois lados (quando um lado tem e o outro não, preencha com 0)
- A comporta de erro funciona de verdade: os dois lados com 0 significa código de saída 0, qualquer lado maior que 0 significa código de saída não-zero, e imprime a contagem de erros de cada lado
- A seção de conclusão declara com clareza que a contagem de erros de `v-fixed` continua sendo 1 (aquela leitura com o nome digitado errado continua ali) e o número específico do aumento de tokens

<!-- answer -->

Abaixo está a implementação completa; coloque no mesmo diretório de `observed-agent.mjs`:

```javascript
#!/usr/bin/env node
// compare-runs.mjs —— Compara o run.log.jsonl de duas execuções
// Uso: node compare-runs.mjs <run.log.jsonl de A> <run.log.jsonl de B>
// Erro de ferramenta em qualquer um dos lados significa saída não-zero.
import fs from "node:fs";

function load(file) {
  const records = fs
    .readFileSync(file, "utf8")
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line));
  const model = records.filter((r) => r.kind === "model_call");
  const tool = records.filter((r) => r.kind === "tool_call");
  const root = records.find((r) => r.kind === "agent_run");
  const byTool = new Map();
  for (const r of tool) byTool.set(r.name, (byTool.get(r.name) ?? 0) + 1);
  return {
    file,
    trace_id: records[0]?.trace_id ?? "(log vazio)",
    model_calls: model.length,
    tool_calls: tool.length,
    errors: records.filter((r) => r.error).length,
    tokens_in: model.reduce((s, r) => s + r.tokens.input, 0),
    tokens_out: model.reduce((s, r) => s + r.tokens.output, 0),
    wall_ms: root?.duration_ms ?? 0,
    byTool,
  };
}

const pad = (v, w) => String(v).padStart(w);

function deltaOf(a, b, asPercent) {
  const d = b - a;
  const sign = d > 0 ? "+" : d < 0 ? "" : "±";
  if (!asPercent || a === 0) return `${sign}${d === 0 ? 0 : d}`;
  return `${sign}${d} (${sign}${((d / a) * 100).toFixed(1)}%)`;
}

function main() {
  const [fileA, fileB] = process.argv.slice(2);
  if (!fileA || !fileB) {
    console.error("Uso: node compare-runs.mjs <run.log.jsonl de A> <run.log.jsonl de B>");
    process.exit(2);
  }
  const a = load(fileA);
  const b = load(fileB);

  console.log(`A: ${a.file}  trace_id=${a.trace_id}`);
  console.log(`B: ${b.file}  trace_id=${b.trace_id}`);
  console.log(`\n${"Métrica".padEnd(13)}${pad("A", 7)}${pad("B", 8)}   Variação`);
  const rows = [
    ["model_calls", a.model_calls, b.model_calls, false],
    ["tool_calls", a.tool_calls, b.tool_calls, false],
    ["errors", a.errors, b.errors, false],
    ["tokens_in", a.tokens_in, b.tokens_in, true],
    ["tokens_out", a.tokens_out, b.tokens_out, true],
    ["tokens_total", a.tokens_in + a.tokens_out, b.tokens_in + b.tokens_out, true],
    ["wall_ms", a.wall_ms, b.wall_ms, false],
  ];
  for (const [name, va, vb, pct] of rows) {
    console.log(`${name.padEnd(13)}${pad(va, 7)}${pad(vb, 8)}   ${deltaOf(va, vb, pct)}`);
  }

  console.log("\nPor nome de ferramenta:");
  for (const name of [...new Set([...a.byTool.keys(), ...b.byTool.keys()])].sort()) {
    const va = a.byTool.get(name) ?? 0;
    const vb = b.byTool.get(name) ?? 0;
    console.log(`${name.padEnd(13)}${pad(va, 7)}${pad(vb, 8)}   ${deltaOf(va, vb, false)}`);
  }

  if (a.errors > 0 || b.errors > 0) {
    console.log(`\nComporta REPROVA: lado A com ${a.errors} erro(s), lado B com ${b.errors} erro(s).`);
    process.exit(1);
  }
  console.log("\nComporta aprova: nenhum dos lados tem registro de erro.");
  process.exit(0);
}

main();
```

**Primeiro verifique a própria comporta.** Esta é a aplicação direta da regra da lição 4: detector recém-instalado, primeiro confirme que ele genuinamente deixa passar nas situações em que “deveria passar”, senão todo código de saída que você ler depois é indigno de confiança. Pegue `v-good` e compare com ele mesmo:

```text
$ node compare-runs.mjs runs/v-good/run.log.jsonl runs/v-good/run.log.jsonl
A: runs/v-good/run.log.jsonl  trace_id=tr-93d34d25
B: runs/v-good/run.log.jsonl  trace_id=tr-93d34d25

Métrica            A       B   Variação
model_calls        4       4   ±0
tool_calls         5       5   ±0
errors             0       0   ±0
tokens_in       5303    5303   ±0 (±0.0%)
tokens_out       730     730   ±0 (±0.0%)
tokens_total    6033    6033   ±0 (±0.0%)
wall_ms            2       2   ±0

Por nome de ferramenta:
list_files         1       1   ±0
read_file          3       3   ±0
write_file         1       1   ±0

Comporta aprova: nenhum dos lados tem registro de erro.
$ echo $?
0
```

Tudo `±0`, código de saída 0. A comporta consegue deixar passar, está pronta para uso.

**Depois compare `v-good` com `v-fixed`:**

```text
$ node compare-runs.mjs runs/v-good/run.log.jsonl runs/v-fixed/run.log.jsonl
A: runs/v-good/run.log.jsonl  trace_id=tr-93d34d25
B: runs/v-fixed/run.log.jsonl  trace_id=tr-5d8babb1

Métrica            A       B   Variação
model_calls        4       5   +1
tool_calls         5       6   +1
errors             0       1   +1
tokens_in       5303    7521   +2218 (+41.8%)
tokens_out       730     838   +108 (+14.8%)
tokens_total    6033    8359   +2326 (+38.6%)
wall_ms            2       2   ±0

Por nome de ferramenta:
list_files         1       1   ±0
read_file          3       4   +1
write_file         1       1   ±0

Comporta REPROVA: lado A com 0 erro(s), lado B com 1 erro(s).
$ echo $?
1
```

Respondendo àquelas duas perguntas:

- **Introduziu erros novos?** Nenhum novo, mas o antigo continua ali. O `errors=1` de `v-fixed` é exatamente aquela leitura que digitou `south` como `sourth` — mudar a mensagem de erro mudou “o que o modelo faz depois do erro”, não mudou “se o modelo vai digitar errado”. Então a comporta julga reprovado, código de saída 1, e este resultado está correto: esta comporta pergunta “esta execução ainda tem erros de ferramenta?”, não “o artefato final está correto?”. Se o artefato está correto precisa de verificação separada (`diff runs/v-good/summary.md runs/v-fixed/summary.md` sai vazio). Para genuinamente devolver `errors` a zero, a próxima etapa deveria mexer na descrição do `read_file`, dando a ele um exemplo positivo, para que o modelo não digite errado logo de saída.
- **Quanto os tokens aumentaram?** O total foi de 6033 para 8359, subiu 2326, um aumento de 38,6%; o extra está todo naquela rodada de ida e volta da releitura (`read_file` foi de 3 para 4 vezes, as chamadas de modelo foram de 4 para 5). 38% não é uma explosão, mas também não é de graça — o custo de uma correção precisa ser reconhecido nesta tabela; não dá para só ver que o resultado está correto e dar por encerrado.

E aquele `±0` na linha `wall_ms` também não leve a sério: o cliente stub não envia requisições de rede, então o tempo de relógio das duas execuções é basicamente ruído de I/O de arquivo, diferente a cada execução — nesta aqui os dois calharam de cair no mesmo número. Depois de conectar APIs reais, esta linha ganha sentido.

<!-- hint -->

`load()` precisa só de um `readFileSync` mais `split("\n")`, e daí todas as estatísticas são `filter` e `reduce` sobre o mesmo array. `byTool` acumulando com `Map` é o mais fácil; ao achar a união dos nomes de ferramenta dos dois lados, lembre-se de usar `new Set([...a.keys(), ...b.keys()])`, senão as ferramentas exclusivas de um lado vazam.

<!-- hint -->

O código de saída precisa de um `process.exit()` explícito; não espere que o script terminando normalmente vire 0 automaticamente — depois de um `console.log` o código de saída padrão do processo de fato é 0, mas o caminho de comporta-reprovada exige que você escreva `process.exit(1)` você mesmo. Ao verificar, use `echo $?` no shell para ver o código de saída do comando anterior.

<!-- /exercises -->

## Recapitulação

- O trio da observabilidade cuida de um trecho cada: os logs JSON Lines cuidam de “registrar isso”, a árvore de trace cuida de “enxergar ordem e pertencimento”, o resumo de métricas cuida de “ver de relance se esta execução parece normal”; árvore e resumo são ambos reconstruídos a partir do JSONL em disco, e o que não estiver gravado nos logs nunca vai aparecer na árvore
- Todo registro precisa carregar `trace_id` e `parent_id`: o primeiro circula registros espalhados de volta à mesma execução, o segundo permite reconstruí-los em árvore — esta é exatamente a mesma técnica que o oficial usa para amarrar todos os eventos disparados por um prompt com `prompt.id`, filtrando por ele para localizar[^S4]
- Conteúdo por padrão não é gravado em texto completo: a postura padrão da telemetria oficial é gravar tudo o que é estrutural, não coletar o conteúdo lido e escrito pelo agente, gravar só o comprimento dos prompts de usuário; para habilitar a gravação de conteúdo, a pré-condição é que o seu pipeline de observabilidade esteja aprovado para armazenar esse tipo de dado[^S6]
- Aqueles cinco números de métricas (duração, contagem de chamadas, tokens, contagem de erros, duração total) são o mesmo conjunto usado para avaliar no curso 10 (Verificação e garantia de qualidade: não deixe passar o que só “parece certo”)[^S3], aqui trocado para uso diagnóstico; na comparação desta rodada, a contagem de rodadas, a contagem de chamadas e os tokens de `v-good` e `v-bug` são quase idênticos, e a única coisa que mudou é a contagem de erros
- A ação-chave da localização é identificar a **primeira** divergência na árvore e então tratar uniformemente todos os absurdos a jusante como contágio: uma etapa falhando basta para fazer o agente desviar para uma trajetória completamente diferente[^S1], e ir corrigir naquela camada do artefato final equivale a corrigir uma sombra
- Corrigir a mensagem de erro da ferramenta é uma correção que acerta a lesão: respostas de erro devem explicar com clareza melhorias específicas e acionáveis, em vez de jogar um código de erro opaco ou um stack trace[^S3]; depois desta correção o modelo mudou de “inventar uma região Centro da China” para “reler uma vez com o nome de arquivo original e devolver a pergunta ao usuário sobre se há outros dados”
- Depois de corrigir é obrigatório reexecutar e comparar, e é obrigatório reconhecer a conta: `errors` não voltou a zero (o erro de digitação continua ali), os tokens subiram 38% (uma ida e volta a mais); “resultado correto” não equivale a “custo zero”

A linha principal das seis lições termina aqui. A lição 1 explicou por que você não consegue dizer — o agente toma caminhos diferentes em duas execuções, e sob um sintoma se comprimem várias causas que, vistas de fora, parecem idênticas. A lição 2 fincou a evidência de primeira mão na transcrição bruta, não no autorrelato dele. A lição 3 transformou cada etapa em dado com campos. A lição 4 costurou os dados espalhados numa árvore e, de passagem, te contou que esse pipeline em si vai mentir em silêncio. A lição 5 instalou sondas nas comportas do loop e deu o método de caminhada da localização. Esta lição soldou as cinco lições anteriores num arquivo de umas 400 linhas, com zero dependências, e o usou para genuinamente rastrear “de onde saiu a região Centro da China” até aquela leitura de caminho digitado errado no `turn-2`.

Este é também o curso 11 desta série. Da próxima vez que o seu agente não conseguir dizer onde errou, você não vai mais ter na mão só a frase “o modelo inventou” — você tem um log em que dá para dar grep, uma árvore em que dá para apontar para uma certa linha e falar, uma tabela de resumo com que dá para calcular custo e um conjunto de métodos de caminhada que vai do rastreamento do sintoma até a primeira divergência. O que resta é mover por inteiro os três trechos de observabilidade de `observed-agent.mjs` (logger, árvore de trace, resumo de métricas) para dentro do seu próprio harness, seguindo o padrão da seção 7 para envolver aquelas duas camadas em torno do seu loop — fixtures e stubs são andaime didático desta lição, não os leve — e então rodar a primeira tarefa real e ver o que há naquele primeiro `run.log.jsonl` de que você originalmente não fazia a menor ideia.


