# Lição 6: Mão na massa: conectando três ferramentas a um agente

> Objetivos de aprendizado:
> - Escrever um laço de execução de ferramentas completo que realmente põe um agente para rodar
> - Registrar a definição de interface e a implementação de uma ferramenta numa única tabela, para que os dois lados nunca se separem
> - Equipar o laço com válvulas de segurança e ler os logs para identificar quando uma ferramenta está mal conectada

> Pré-requisitos: Conclua as Lições 1-5 e saiba ler JavaScript / Node.js básico | Anterior: [Lição 5 <<](./05-permissions-and-safety.md)

## Primeiro o resultado: uma execução completa

É isto que esta lição constrói. Você digita uma frase no terminal, e o agente decide por conta própria quais ferramentas chamar e quantas vezes:

```
$ node agent.js "Este projeto usa lodash? Veja como ele está no GitHub"

[turno 1] chama search_files { pattern: 'lodash', dir: '.' }
[turno 2] chama read_file { path: 'package.json' }
[turno 3] chama github_repo_info { owner: 'lodash', repo: 'lodash' }

Resposta final:
Sim, o projeto usa lodash. O package.json fixa a versão em ^4.17.21, e
src/utils/format.js faz require dele diretamente. No GitHub, lodash/lodash
tem hoje mais de 60 mil estrelas, e o último push foi há algumas
semanas — o repositório segue mantido. Para confirmar se ^4.17.21 é a
release mais recente, seria preciso mais uma consulta à lista de releases.
```

Três turnos, três ferramentas, e os argumentos de cada turno se apoiam no resultado do turno anterior: primeiro descobrir em quais arquivos lodash aparece, depois ler o package.json para confirmar a versão, depois pegar esse nome e perguntar ao GitHub sobre ele. Isto não é um script com valores fixos — o próprio modelo decide qual ferramenta chamar em seguida e quais argumentos passar.

Esta lição constrói tudo do zero: três ferramentas, um registro, um laço de execução, algumas válvulas de segurança.

## O que está acontecendo por baixo: uma ida e volta de API atrás da outra

Cada "turno" que você viu acima é, por baixo, uma requisição HTTP completa. A Lição 2, "A ida e volta completa de uma chamada de ferramenta", mostrou como é a ida e volta de uma única chamada de ferramenta; aqui apenas a ligamos num laço — o modelo retorna `stop_reason: "tool_use"`, seu código roda a ferramenta, costura o resultado de volta na conversa e envia outra requisição, até que o modelo pare de pedir chamadas de ferramenta.[^S4]

Três turnos de chamada de ferramenta são, na verdade, quatro chamadas a `messages.create`: nas três primeiras o modelo segue pedindo ferramentas, e na quarta ele já tem os dados do GitHub, decide que tem o suficiente e dá uma resposta em texto diretamente, encerrando o laço. O julgamento sobre continuar pedindo ferramentas ou não vive inteiramente do lado do modelo; seu código apenas executa e devolve resultados.

## Passo 1: escreva o contrato de cada ferramenta

A Lição 4, "Projetando interfaces de ferramentas: nome, descrição, parâmetros, valor de retorno", cobriu os três campos centrais de uma interface de ferramenta: `name`, `description` e `input_schema`.[^S3] Aqui nós os transformamos direto em código. As três ferramentas mapeiam para três dos cinco tipos da Lição 3, "Cinco tipos comuns de ferramenta: ler, escrever, executar, buscar, chamar": buscar, ler e chamar — escrever e executar ficam para você conectar nos exercícios.

```js
const searchFilesSchema = {
  name: "search_files",
  description:
    "Search project files for text matching a regular expression. Returns the path, " +
    "line number, and line content of each hit. Use it to locate which files a string, " +
    "dependency name, or function name appears in. " +
    "When there are no matches it returns explicit text saying so, never an empty string.",
  input_schema: {
    type: "object",
    properties: {
      pattern: { type: "string", description: "A JavaScript regular expression, without the leading and trailing slashes" },
      dir: { type: "string", description: "The directory to start searching from, relative to the project root, defaults to \".\"" },
    },
    required: ["pattern"],
  },
};

const readFileSchema = {
  name: "read_file",
  description:
    "Read the text content of a file inside the project, returning at most the first 4000 characters. " +
    "path must be a path relative to the project root; the tool cannot access files outside the project directory.",
  input_schema: {
    type: "object",
    properties: {
      path: { type: "string", description: "A file path relative to the project root, for example \"package.json\"" },
    },
    required: ["path"],
  },
};

const githubRepoInfoSchema = {
  name: "github_repo_info",
  description:
    "Look up basic information about a public GitHub repository: star count, open issue count, default branch, and last push time. " +
    "owner and repo are two separate fields for the repository owner and the repository name; a full URL is not accepted.",
  input_schema: {
    type: "object",
    properties: {
      owner: { type: "string", description: "The repository owner, for example \"lodash\"" },
      repo: { type: "string", description: "The repository name, for example \"lodash\"" },
    },
    required: ["owner", "repo"],
  },
};
```

`github_repo_info` carrega um prefixo `github_` — a orientação oficial é dar namespacing aos nomes de ferramenta com o serviço quando a ferramenta toca um serviço externo, o que reduz bastante a chance de o modelo escolher a ferramenta errada.[^S10] `search_files` e `read_file` operam sobre o sistema de arquivos local, onde não há ambiguidade de "qual serviço", então não precisam de prefixo.

As três descrições explicitam que texto volta quando nada é encontrado, e isso não é enfeite. A Lição 4 defendeu que uma boa descrição elimina a ambiguidade em entradas e saídas;[^S8] a ambiguidade aqui não está nos parâmetros, e sim em como a ferramenta expressa "não encontrei nada" — uma armadilha que dispara na seção "Válvulas de segurança".

## Passo 2: registre o contrato e a implementação numa única tabela

Uma armadilha comum: se a lista de schemas e a tabela de busca de handlers usada em tempo de execução forem escritas como duas cópias separadas, elas vão se separar mais cedo ou mais tarde. Você renomeia `search_files` para `find_in_files` mas esquece de atualizar a chave na tabela de handlers; o modelo emite uma chamada conforme o novo schema, a tabela de handlers não tem nada sob aquela chave, e estoura.

A solução é manter uma única tabela em que `name`, `description`, `input_schema` e a função que de fato roda fiquem todos no mesmo objeto. A lista de schemas de que a API precisa e a tabela de busca de handlers de que a execução precisa são ambas derivadas dessa mesma tabela:

```js
const TOOLS = {
  search_files: { ...searchFilesSchema, handler: searchFiles },
  read_file: { ...readFileSchema, handler: readFile },
  github_repo_info: { ...githubRepoInfoSchema, handler: githubRepoInfo },
};

// O parâmetro tools enviado ao modelo, derivado de TOOLS
const toolSchemas = Object.values(TOOLS).map(({ handler, ...schema }) => schema);

// A tabela de busca de handlers usada em tempo de execução, também derivada de TOOLS
const toolHandlers = Object.fromEntries(
  Object.entries(TOOLS).map(([name, t]) => [name, t.handler])
);
```

`toolSchemas` e `toolHandlers` ficam em sincronia para sempre, porque são duas visões calculadas a partir do mesmo dado, e não duas cópias escritas à mão. Renomear uma ferramenta ou adicionar um parâmetro significa alterar `TOOLS` em exatamente um lugar.

## Passo 3: implemente as três ferramentas, com fronteiras

`searchFiles` percorre o diretório por conta própria em vez de invocar o `grep` no shell — isso evita emendar entrada de usuário numa linha de comando e convidar a injeção de comandos. A contagem de acertos tem teto, para que uma única busca não enfie milhares de linhas no contexto:

```js
import fs from "node:fs";
import path from "node:path";

const PROJECT_ROOT = process.cwd();
const IGNORE_DIRS = new Set(["node_modules", ".git", "dist", "coverage"]);

function walk(dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (IGNORE_DIRS.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(full));
    else out.push(full);
  }
  return out;
}

async function searchFiles({ pattern, dir = "." }) {
  const root = path.resolve(PROJECT_ROOT, dir);
  // Acrescente path.sep antes de comparar: um startsWith puro também deixaria passar
  // diretórios irmãos de mesmo prefixo, como /proj-backup
  const inRoot = root === PROJECT_ROOT || root.startsWith(PROJECT_ROOT + path.sep);
  if (!inRoot) {
    return "Execução recusada: o diretório de busca não pode sair da raiz do projeto.";
  }
  let regex;
  try {
    regex = new RegExp(pattern);
  } catch {
    return `Execução recusada: "${pattern}" não é uma expressão regular válida.`;
  }

  const hits = [];
  for (const file of walk(root)) {
    let lines;
    try {
      lines = fs.readFileSync(file, "utf8").split("\n");
    } catch {
      continue; // arquivos binários e afins não podem ser lidos como texto, pule-os
    }
    lines.forEach((line, i) => {
      if (regex.test(line)) {
        hits.push(`${path.relative(PROJECT_ROOT, file)}:${i + 1}:${line.trim()}`);
      }
    });
    if (hits.length >= 20) break; // válvula de segurança: trunque cedo quando há acertos demais
  }
  return hits.length ? hits.join("\n") : "Nenhum conteúdo correspondente encontrado.";
}
```

`readFile` faz uma coisa: confirmar que o caminho de destino não escapou da raiz do projeto. A ideia de fronteira da Lição 5 aparece aqui como uma única verificação de prefixo com separador. Note que não é um `startsWith(PROJECT_ROOT)` puro: digamos que a raiz do projeto seja `/Users/me/proj` e o modelo passe `../proj-backup/x`; depois do resolve você tem `/Users/me/proj-backup/x`, e uma comparação de prefixo pura ainda passaria — acrescente `path.sep` e a fronteira finalmente cai sobre o separador de diretórios:

```js
async function readFile({ path: relPath }) {
  const abs = path.resolve(PROJECT_ROOT, relPath);
  const inRoot = abs === PROJECT_ROOT || abs.startsWith(PROJECT_ROOT + path.sep);
  if (!inRoot) {
    return "Execução recusada: o caminho está fora da raiz do projeto, e esta ferramenta não pode ler arquivos fora do projeto.";
  }
  if (!fs.existsSync(abs)) {
    return `Arquivo não existe: ${relPath}`;
  }
  return fs.readFileSync(abs, "utf8").slice(0, 4000);
}
```

`githubRepoInfo` é a única ferramenta que envia dados para fora do projeto — conteúdo de arquivo local, destilado pelo modelo nas duas strings `owner` e `repo`, e então enviado para a internet pública. É exatamente o cenário em que duas condições de alto risco se encontram, "ler dados privados" mais "comunicar-se para fora",[^S19] então ela ganha uma regra de permissão explícita: os argumentos precisam corresponder ao formato de nome válido do GitHub, e nada mais:

```js
const SAFE_NAME = /^[\w.-]+$/;

async function githubRepoInfo({ owner, repo }) {
  // Regra de permissão: owner/repo só podem ser nomes de repositório válidos,
  // não uma string arbitrária enviada para a rede externa
  if (!SAFE_NAME.test(owner) || !SAFE_NAME.test(repo)) {
    return "Execução recusada: os argumentos owner/repo não estão em um formato válido; a requisição externa foi bloqueada.";
  }

  const headers = { Accept: "application/vnd.github+json" };
  if (process.env.GITHUB_TOKEN) {
    headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
  }

  const res = await fetch(`https://api.github.com/repos/${owner}/${repo}`, { headers });
  if (!res.ok) {
    return `A API do GitHub retornou um erro: ${res.status} ${res.statusText}`;
  }
  const data = await res.json();
  return JSON.stringify({
    stars: data.stargazers_count,
    open_issues: data.open_issues_count,
    default_branch: data.default_branch,
    pushed_at: data.pushed_at,
  });
}
```

`GITHUB_TOKEN` é lido de uma variável de ambiente e nunca aparece no código; funciona sem ele também, apenas com limites de taxa mais baixos para requisições anônimas. Esta é a mesma ideia das regras de permissão da Lição 5 em outra forma: aquela lição cobriu as regras declarativas `allow`/`deny`/`ask` no arquivo de configuração do Claude Code,[^S15] e esta é a versão imperativa escrita dentro do código da ferramenta — ambas traçam uma linha que uma operação de alto risco não pode cruzar.[^S18]

## Passo 4: escreva o laço de execução

Com `toolSchemas` e `toolHandlers` em mãos, o laço em si não é complicado. A lógica central tem quatro passos: enviar a requisição, olhar o `stop_reason`, retornar texto se não for `tool_use` e, se for, rodar cada bloco de chamada de ferramenta e costurar os resultados de volta.[^S4]

```js
import Anthropic from "@anthropic-ai/sdk";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const MAX_TURNS = 8;

async function runAgent(question) {
  const messages = [{ role: "user", content: question }];

  for (let turn = 1; turn <= MAX_TURNS; turn++) {
    const response = await anthropic.messages.create({
      model: "claude-sonnet-5", // troque por um modelo que sua conta possa chamar
      max_tokens: 1024,
      tools: toolSchemas,
      messages,
    });

    messages.push({ role: "assistant", content: response.content });

    if (response.stop_reason !== "tool_use") {
      const textBlock = response.content.find((b) => b.type === "text");
      return textBlock ? textBlock.text : "(o modelo não deu resposta em texto)";
    }

    const toolResults = [];
    for (const block of response.content) {
      if (block.type !== "tool_use") continue;
      console.log(`[turno ${turn}] chama ${block.name}`, block.input);
      const handler = toolHandlers[block.name];
      const content = await handler(block.input);
      toolResults.push({ type: "tool_result", tool_use_id: block.id, content: String(content) });
    }
    messages.push({ role: "user", content: toolResults });
  }

  throw new Error(`Número máximo de turnos excedido (${MAX_TURNS})`);
}

const question = process.argv[2] ?? "Este projeto usa lodash? Veja como ele está no GitHub";
runAgent(question).then((answer) => console.log("\nResposta final:\n" + answer));
```

Há aqui um detalhe fácil de deixar passar: `for (const block of response.content)` itera sobre **todos os blocos de conteúdo retornados neste turno**, não apenas sobre o primeiro. O modelo frequentemente pede duas ou três ferramentas em paralelo num mesmo turno; cada uma precisa ser executada e produzir seu próprio `tool_result`, com `tool_use_id` casado um a um, e nenhuma pode faltar.[^S5] O exercício de Nível 2 vai levar você pela armadilha de deixar uma faltando na prática.

## Válvulas de segurança, e como identificar quando uma ferramenta está mal conectada

O laço acima roda, mas faltam duas salvaguardas. Vamos acrescentá-las:

**Salvaguarda um: uma falha de ferramenta tem que ser devolvida como retorno, não derrubar o laço.** Embrulhe a chamada crua num `try/catch` e, em caso de falha, ainda produza um `tool_result`, apenas marcado com `is_error: true` — quando o modelo vê essa marca, normalmente ajusta os argumentos e tenta de novo, em vez de repetir o mesmo erro.[^S11][^S5]

```js
let content, isError = false;
try {
  if (!handler) throw new Error(`Nenhuma ferramenta registrada com o nome ${block.name}`);
  content = await handler(block.input);
} catch (err) {
  content = `Erro na execução da ferramenta: ${err.message}`;
  isError = true;
}
toolResults.push({
  type: "tool_result",
  tool_use_id: block.id,
  content: String(content),
  ...(isError ? { is_error: true } : {}),
});
```

**Salvaguarda dois: a mesma ferramenta com os mesmos argumentos, chamada três vezes seguidas, deve parar.** Isto não é chute — baseia-se em registrar as assinaturas das últimas chamadas:

```js
// Coloque isto no topo do corpo da função runAgent, não no topo do módulo — assim cada
// execução começa a registrar do zero, e uma segunda tarefa no mesmo processo não é
// encerrada por engano pelos registros da execução anterior
const recentCalls = [];

// ...dentro do laço for (const block of response.content), antes de rodar o handler:
const signature = `${block.name}:${JSON.stringify(block.input)}`;
recentCalls.push(signature);
const last3 = recentCalls.slice(-3);
if (last3.length === 3 && last3.every((s) => s === signature)) {
  return "Detectada a mesma ferramenta chamada 3 vezes seguidas com argumentos idênticos; execução encerrada.";
}
```

Junto com `MAX_TURNS` como chave geral, as três válvulas de segurança têm funções distintas: `MAX_TURNS` protege contra "o modelo segue pedindo ferramentas em novas variações e nunca para"; a detecção de chamadas repetidas protege contra "o modelo fica preso girando nos mesmos argumentos"; e as verificações internas de caminho e formato das ferramentas (aquelas escritas no Passo 3) protegem contra "o modelo inventou um argumento fora dos limites e a ferramenta obedientemente o executou assim mesmo". Tire qualquer uma das três camadas e o laço corre o risco de disparar sem controle ou de ultrapassar seus limites.[^S18]

**Como você identifica pelos logs que uma ferramenta está mal conectada?** Dois dos sinais mais comuns:

- **O modelo chama a mesma ferramenta repetidamente**, com argumentos variando apenas dentro de uma faixa estreita (mudanças de caixa, acrescentar ou tirar uma palavra). Em nove de cada dez casos o modelo não está sendo burro — o conteúdo do `tool_result` é vago demais. O "não encontrado" retorna uma string vazia, o modelo não consegue distinguir "realmente não há nada lá" de "a ferramenta está quebrada", e só lhe resta chutar e tentar de novo.
- **O modelo preenche argumentos no chute**, por exemplo passando ao `read_file` um caminho que não existe. Rastrear para trás normalmente revela uma de duas causas: a `description` não explicitou de onde o argumento deveria vir (ecoando a Lição 4), ou a saída da ferramenta anterior não deu um caminho preciso, deixando o modelo inventar um.

```agentmentor-check
{
  "id": "tool-zh-06-diagnose-loop",
  "label": "Diagnosticar por que um agente chama sempre a mesma ferramenta",
  "prompt": "Suponha que um colega tenha mudado o valor de retorno de searchFiles em caso de nenhum acerto para uma string vazia (em vez do “Nenhum conteúdo correspondente encontrado.” desta lição). Ao tratar “verifique se o projeto usa moment.js”, esse agente modificado chama search_files por 5 turnos seguidos, mudando a expressão regular apenas de “moment” para “Moment” e para “MOMENT”, e por fim bate no MAX_TURNS e é encerrado. O projeto de fato não usa moment.js. Qual é a causa-raiz mais provável desse laço?",
  "whyHere": "Logo depois de cobrir o laço de execução e as válvulas de segurança, é preciso verificar se quem aprende consegue mapear o sintoma ‘o modelo chama sempre a mesma ferramenta’ para a causa-raiz ‘se o conteúdo do tool_result declara o estado com clareza’, em vez de culpar a capacidade do modelo ou o limite de turnos",
  "mode": "single",
  "choices": [
    {
      "id": "a",
      "text": "O modelo não é capaz o bastante e não consegue distinguir os casos; troque por um modelo mais forte",
      "correct": false,
      "feedback": "Trocar de modelo trata o sintoma, não a causa. O problema real está no tool_result — uma string vazia mal se distingue de ‘a ferramenta está quebrada’, então o modelo não consegue diferenciar ‘realmente não encontrado’ de ‘a chamada falhou’ e só lhe resta reformular e tentar de novo."
    },
    {
      "id": "b",
      "text": "searchFiles retorna uma string vazia quando não há acerto, o que o modelo lê como resultado incerto e repete a tentativa",
      "correct": true,
      "feedback": "Correto. O conteúdo do tool_result é a única base do modelo para julgar ‘este passo está concluído ou não’. Uma string vazia é um sinal ambíguo — o modelo não tem como ter certeza se não encontrou nada ou se a chamada falhou, então tenta outra expressão regular. Mude o valor de retorno para um texto explícito como ‘Nenhum conteúdo correspondente encontrado’ e, assim que o modelo o vir, ele para de tentar e conclui diretamente que o projeto não usa essa biblioteca."
    },
    {
      "id": "c",
      "text": "O MAX_TURNS está baixo demais; aumente-o e veja se o laço para sozinho",
      "correct": false,
      "feedback": "Aumentar o MAX_TURNS apenas deixa o laço girar mais alguns turnos antes de bater na parede; isso não resolve por que o modelo repete a tentativa. A causa-raiz é o sinal pouco claro retornado por searchFiles, não o limite de turnos."
    }
  ]
}
```

<!-- exercises -->
## 💻 Exercícios

### Nível 1: Colocar para rodar e depois conectar uma quarta ferramenta

Copie o código desta lição para um diretório local vazio, rode `npm install @anthropic-ai/sdk`, depois `npm pkg set type=module` (todo o código desta lição usa a sintaxe ESM `import`; em versões do Node abaixo da 22.7, pular esse passo lança "Cannot use import statement outside a module" de cara), configure sua `ANTHROPIC_API_KEY` (`GITHUB_TOKEN` opcional) e rode `node agent.js "Este projeto usa lodash? Veja como ele está no GitHub"` uma vez. Confirme que você vê ao menos dois turnos distintos de chamada de ferramenta e uma resposta final em texto.

Depois que estiver rodando, conecte uma quarta ferramenta, `write_report(path, content)`: escrever os resultados da verificação num arquivo Markdown, permitido apenas dentro do diretório `reports/` do projeto, e recusar escritas em qualquer outro lugar. Mude um prompt, por exemplo "escreva num reports/lodash-check.md os resultados da verificação que você acabou de reunir", e confirme que o modelo chama essa nova ferramenta por conta própria.

<!-- rubric -->
- As três ferramentas existentes rodam, os logs mostram ao menos dois turnos de chamada de ferramenta, e os argumentos do turno posterior usam o resultado do turno anterior
- A restrição de caminho de `write_report` de fato entra em vigor: tentar escrever um caminho como `reports/../secret.txt` ou `reports-evil/x.md` é recusado
- `write_report` está corretamente registrada na tabela `TOOLS`: seu schema aparece em `toolSchemas`, e `toolHandlers` consegue localizar a função correspondente

<!-- answer -->
O cerne é copiar a ideia de verificação de fronteira de `readFile`, apenas trocando "ler" por "escrever" e estreitando o intervalo permitido da raiz inteira do projeto para o único subdiretório `reports/`:

```js
const REPORTS_DIR = path.join(PROJECT_ROOT, "reports");

async function writeReport({ path: relPath, content }) {
  fs.mkdirSync(REPORTS_DIR, { recursive: true });
  const abs = path.resolve(PROJECT_ROOT, relPath);
  const inReports = abs === REPORTS_DIR || abs.startsWith(REPORTS_DIR + path.sep);
  if (!inReports) {
    return "Execução recusada: só é permitido escrever arquivos dentro do diretório reports/.";
  }
  fs.writeFileSync(abs, content, "utf8");
  return `Escrito ${path.relative(PROJECT_ROOT, abs)}`;
}

const writeReportSchema = {
  name: "write_report",
  description: "Write text content into a Markdown file. Can only write under the reports/ directory, not anywhere else in the project.",
  input_schema: {
    type: "object",
    properties: {
      path: { type: "string", description: "A path relative to the project root, must start with \"reports/\"" },
      content: { type: "string", description: "The full text content to write" },
    },
    required: ["path", "content"],
  },
};

TOOLS.write_report = { ...writeReportSchema, handler: writeReport };
```

<!-- hint -->
A verificação de caminho é escrita do mesmo jeito que em `readFile`: depois do `path.resolve`, acrescente `path.sep` e faça uma comparação de prefixo, trocando apenas a base de `PROJECT_ROOT` para `REPORTS_DIR` — sem acrescentar o separador, um diretório de mesmo prefixo como `reports-evil/` passaria despercebido pela verificação.

<!-- hint -->
Antes de escrever o arquivo, lembre-se do `fs.mkdirSync(REPORTS_DIR, { recursive: true })`, senão o `writeFileSync` estoura de cara na primeira vez, quando o diretório `reports/` ainda não existe.

### Nível 2: Fabricar uma falha e depois consertá-la

O código de laço abaixo tem um bug. Primeiro explique sob qual condição ele faz a próxima requisição de API dar erro, depois entregue o código corrigido.

```js
// versão com bug
const block = response.content.find((b) => b.type === "tool_use");
if (block) {
  const result = await toolHandlers[block.name](block.input);
  messages.push({
    role: "user",
    content: [{ type: "tool_result", tool_use_id: block.id, content: String(result) }],
  });
}
```

<!-- rubric -->
- Identifica o bug com precisão: usar `.find()` para pegar apenas o primeiro bloco `tool_use` significa que, quando o modelo pede várias ferramentas em paralelo num mesmo turno, as chamadas posteriores são inteiramente ignoradas
- Explica o sintoma concreto: quantos blocos `tool_use` havia na mensagem assistant anterior, tantos blocos `tool_result` correspondentes precisa haver no turno seguinte; faltar algum dá erro direto
- A correção passa a iterar sobre todos os blocos em que `type === "tool_use"`, produzir um `tool_result` correspondente para cada um e colocar todos numa única mensagem `user`

<!-- answer -->
O bug é supor que há no máximo uma chamada de ferramenta por turno, quando na verdade o modelo pode perfeitamente pedir duas ou três em paralelo de uma vez. A correção é exatamente a forma mostrada no Passo 4 desta lição — substituir o `.find()` por um laço sobre todos os blocos:

```js
const toolResults = [];
for (const block of response.content) {
  if (block.type !== "tool_use") continue;
  const result = await toolHandlers[block.name](block.input);
  toolResults.push({ type: "tool_result", tool_use_id: block.id, content: String(result) });
}
messages.push({ role: "user", content: toolResults });
```

<!-- hint -->
Conte quantos elementos de `response.content` podem ter `type` igual a `"tool_use"` — o modelo pode perfeitamente pedir duas ferramentas em paralelo de uma vez, nem sempre apenas uma.

<!-- hint -->
A regra da API é: quantos blocos `tool_use` havia na mensagem assistant anterior, tantos blocos `tool_result` correspondentes a próxima mensagem `user` precisa ter, sem faltar nenhum.

<!-- /exercises -->

## Recapitulação

- Registre o schema e o handler de uma ferramenta na mesma tabela (`TOOLS`), com `toolSchemas` e `toolHandlers` ambos derivados dela, para que alterar um lugar nunca deixe o outro sem alteração
- O cerne do laço de execução é: enviar a requisição → verificar se `stop_reason` é `tool_use` → se for, iterar sobre **cada** bloco de chamada de ferramenta, executar e costurar de volta o `tool_result` → se não for, retornar texto e encerrar o laço
- Um turno pode ter várias chamadas de ferramenta em paralelo; cada `tool_use` precisa de um `tool_result` correspondente e único, e faltar um faz a requisição seguinte dar erro
- As três válvulas de segurança guardam cada uma sua camada: `MAX_TURNS` impede que o modelo peça ferramentas indefinidamente, a detecção de chamadas repetidas impede que o modelo fique girando no mesmo conjunto de argumentos, e as verificações internas de caminho e formato das ferramentas barram argumentos fora dos limites
- O conteúdo do `tool_result` tem que declarar com clareza "não encontrado" versus "ocorreu um erro"; um retorno vazio e vago é a causa número um de o modelo repetir a tentativa sem parar e de os logs parecerem indicar uma ferramenta mal conectada

Você concluiu agora todas as seis lições deste curso, de "por que agentes precisam de ferramentas" até escrever você mesmo um laço de execução de ferramentas que funciona. A coisa mais valiosa a fazer em seguida não é ler mais uma lição — é pegar uma tarefa pequena e real do seu próprio projeto, quebrá-la em duas ou três ferramentas e levar este esqueleto de laço com alguns ajustes. Colocar para rodar uma vez vale mais do que ler outras dez explicações. Ao depurar, se ficar em dúvida sobre algum campo específico, volte ao `sources.md` e consulte S4 e S5, os dois documentos oficiais; são o texto normativo mais primário para este laço de múltiplos turnos.

