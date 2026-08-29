# Lição 3: Verificadores determinísticos: só valem verificações que produzem passa/falha

> Objetivos de aprendizado:
> - Ordenar verificadores candidatos por “mais rápido, mais confiável, mais escalável” e escolher o certo para uma saída específica
> - Escrever um script de verificação determinística que devolve passa/falha em uma forma que o agente consegue ler e sobre a qual consegue iterar
> - Reconhecer falsos negativos em que verificadores estritos demais rejeitam saídas corretas, corrigi-los com normalização, e entender onde as verificações determinísticas encontram seu teto
>
> Pré-requisitos: Lições 1 e 2 (sem uma verificação que rode, “parece pronto” é o único sinal; verifique o estado final primeiro, o processo como rede de segurança; critérios de sucesso precisam ser mensuráveis) | Anterior: [<< Lição 2](./02-what-to-verify.md) | Próxima: [Lição 4 >>](./04-llm-as-judge.md)

## De “o que verificar” para “como verificar”

Ao final da Lição 2, você já deveria ter um critério de sucesso concreto escrito. Pegue o exemplo que esta lição usa: o agente lê um lote de CSVs de vendas e os agrega em um `report.json` com um título, itens por canal e um total. A Lição 2 ensinou você a enquadrar o critério como estado final — o arquivo existe, os campos estão presentes, o total é igual à soma das contagens dos itens — em vez de verificações de processo turno a turno do tipo “ler arquivo, depois calcular a soma, depois escrever o arquivo”.

Você tem o critério. A próxima pergunta é prática: **o que você usa para conferir contra esse critério?**

Você poderia bater o olho. Poderia fazer outro modelo ler e dar um retorno. Ou poderia escrever uma dúzia de linhas de Node que carrega o JSON, soma as contagens e sai com código não zero se elas não baterem. As três chegam a uma conclusão, mas o custo e a confiabilidade variam radicalmente.

A documentação oficial oferece um princípio de ordenação: **escolha o método de correção mais rápido, mais confiável e mais escalável**[^S5]. Por essa régua, as três categorias caem em uma ordem clara:

- **Correção baseada em código** — a mais rápida e mais confiável, extremamente escalável; a fraqueza é que lhe falta nuance para julgamentos complexos que precisam de menos rigidez baseada em regras[^S5].
- **Correção baseada em LLM** — rápida e flexível, escalável e adequada a julgamento complexo, mas teste para garantir a confiabilidade antes de escalar[^S5]. (Isso é a Lição 4.)
- **Correção humana** — a mais flexível e de mais alta qualidade, mas lenta e cara; evite se possível[^S5].

“Confiável” aqui significa **mesma entrada, mesmo veredicto toda vez**. A correção baseada em código fica em primeiro não por ser inteligente, mas por ser previsivelmente burra — ela não vai te aprovar hoje no feeling e te reprovar amanhã por causa de uma formulação. Em computação, sistemas determinísticos produzem a mesma saída toda vez, dadas entradas idênticas, enquanto sistemas não determinísticos — como os agentes — podem gerar respostas variadas mesmo com as mesmas condições iniciais[^S3]. Os “verificadores determinísticos” desta lição são esse tipo de verificação previsivelmente burra: uma coisa determinística avaliando uma coisa não determinística.

Um princípio relacionado para desenhar tarefas de eval: **estruture as questões de modo a permitir correção automatizada** (por exemplo, múltipla escolha, correspondência de string, corrigida por código, corrigida por LLM)[^S5]. Onde você tem chance de automatizar, automatize.

## O cardápio de verificadores: qualquer coisa que retorne um sinal

“Verificador” soa como um framework especializado, mas a barra é bem mais baixa. A definição da documentação oficial é quase seca: **a verificação é qualquer coisa que retorne um sinal que o Claude consiga ler na conversa: uma suíte de testes, o código de saída de um build, um linter, um script que compara a saída com um fixture, ou uma captura de tela do navegador comparada com um design**[^S4].

Desmonte essa lista. Rodar `npm test` e ficar tudo verde é um passa, perfeito para entregas de código — soluções de código são verificáveis por testes automatizados[^S1]. Códigos de saída de build são os mais fáceis: a toolchain já escreveu as asserções para você. Um linter sozinho não basta, mas é ótimo como piso para “erros que não se deveria cometer”. Um script de comparação confronta a saída desta execução com um arquivo de fixture que você preparou (uma amostra sabidamente boa), adequado quando a saída é estável e o formato é fixo. Comparação de captura de tela serve para quando você está mexendo em estilos de frontend.

Uma nota de prática de engenharia: compiladores e verificadores estáticos de tipo (como `tsc --noEmit`) são muitas vezes usados assim em projetos reais, porque eles também emitem códigos de saída e localizações de erro legíveis. Isso é acréscimo meu, não está na lista oficial — não trate como endossado oficialmente.

Esses métodos não são mutuamente exclusivos. Verificadores formam **um espectro** — uma ponta é “correspondência exata de string com um fixture”, a outra ponta é “pedir ao Claude que julgue”[^S3]. Esta lição cobre a metade da esquerda; a Lição 4 vai para a direita.

## Forma mínima: `output == golden_answer`

A ponta esquerda do espectro é assim[^S5]:

```text
output == golden_answer
```

Só uma checagem de igualdade. Isso se chama correspondência exata. Ela mede se a saída do modelo bate com uma resposta correta predefinida, **normalmente depois de normalizar espaços em branco e caixa**; é uma métrica simples e sem ambiguidade, perfeita para tarefas com respostas categóricas e bem delimitadas, como análise de sentimento (positivo, negativo, neutro)[^S5].

“Normalização” aqui é simples: antes de comparar, apague as diferenças que não carregam significado. Em código:

```javascript
// Classificação de sentimento em três vias: a resposta precisa ser positive / negative / neutral
function grade(output, goldenAnswer) {
  const normalize = (s) => s.trim().toLowerCase();
  return normalize(output) === normalize(goldenAnswer);
}

grade("Positive\n", "positive"); // true — caixa e quebra de linha apagadas
grade("positive.", "positive");  // false — mas um ponto final ainda reprova
```

O resultado da segunda chamada merece um olhar demorado. `trim()` e `toLowerCase()` resgatam quebras de linha e caixa, mas não aquele ponto final. Até onde a normalização deveria ir depende de quais diferenças são irrelevantes **para a sua tarefa** — um julgamento que nenhuma biblioteca faz por você. A seção de armadilhas mais adiante nesta lição é sobre o que acontece quando você erra esse julgamento.

## Deixe a saída do verificador legível

Aquela definição tinha uma cláusula que costuma ser pulada: o sinal precisa ser **algo que o Claude consiga ler na conversa**[^S4]. Essa cláusula determina como o seu script de verificação deveria escrever a saída dele. Compare duas mensagens de falha:

```text
FAIL: a validação não passou
```

```text
FAIL  report.json
  - total não bate: declarado 48, a soma dos count dos itens é 50
```

A primeira diz ao agente “você está errado” e depois o deixa adivinhando. A segunda diz qual campo falhou, o que era esperado, o que veio de fato — no turno seguinte ele consegue ir direto corrigir aquele número. O mesmo passa/falha, uma diferença de ordem de grandeza em informação. Outra parte da orientação oficial diz a mesma coisa: **faça o Claude mostrar evidências em vez de afirmar sucesso** — a saída dos testes, o comando que ele rodou e o que ele retornou, ou uma captura de tela do resultado; revisar evidências é mais rápido do que refazer a verificação você mesmo, e funciona para sessões que você não estava acompanhando[^S4]. O seu script de verificação é o produtor dessa evidência. Se ele for vago, a evidência é vaga.

Duas regras práticas: use o código de saída `0` para passa e não zero para falha (CI e o `&&` do shell conseguem usar isso direto). No stdout, uma falha por linha, informando “qual campo, o que era esperado, o que veio”.

## Com passa/falha, o comportamento do agente muda

Durante a execução, agentes precisam de **“ground truth” do ambiente a cada etapa (como resultados de chamadas de ferramenta ou execução de código) para avaliar o progresso**[^S1]. Sem um verificador, o único sinal de progresso que ele consegue obter é o parágrafo que ele acabou de escrever — se ele acha que terminou, terminou. Com um verificador, o ambiente contém uma fonte de fato independente do julgamento dele.

Então a cadeia de comportamento muda: **dê ao Claude algo que produza um passa ou falha, e o loop se fecha sozinho; o Claude faz o trabalho, roda a verificação, lê o resultado e itera até a verificação passar**[^S4]. Dito de outro jeito: agentes conseguem iterar sobre soluções usando resultados de testes como feedback[^S1].

No tipo de loop de harness que você escreveu à mão no curso 7 desta série, a implementação é expor a verificação como uma ferramenta:

```javascript
const tools = [
  { name: "write_file", /* ... */ },
  {
    name: "run_check",
    description: "Roda verify.mjs para checar report.json, retorna PASS/FAIL e os motivos de falha item a item",
    input_schema: { type: "object", properties: {}, required: [] },
  },
];

import { execFile } from "node:child_process";

// Utilitário: roda verify.mjs, coleta tanto o código de saída quanto a saída
// (Não use promisify(exec) — ele lança exceção em saída não zero, mas não zero é justamente o sinal que queremos)
function runVerify() {
  return new Promise((resolve) => {
    execFile("node", ["verify.mjs", "report.json"], (err, stdout, stderr) => {
      resolve({ code: err?.code ?? 0, stdout: stdout + stderr });
    });
  });
}

async function runTool(name, input) {
  if (name !== "run_check") return runOtherTool(name, input);
  const { code, stdout } = await runVerify();
  // Ponto-chave: repasse o código de saída e o stdout como estão, não comprima para "falhou"
  return `exit code: ${code}\n${stdout}`;
}

while (response.stop_reason === "tool_use") {
  const toolUse = response.content.find((block) => block.type === "tool_use");
  const output = await runTool(toolUse.name, toolUse.input);
  messages.push({ role: "assistant", content: response.content });
  messages.push({
    role: "user",
    content: [{ type: "tool_result", tool_use_id: toolUse.id, content: output }],
  });
  response = await client.messages.create({ model, tools, messages });
}
```

A saída do verificador volta para a conversa via `tool_result`. O modelo lê `total não bate: declarado 48, a soma dos count dos itens é 50`, e no turno seguinte vai corrigir. Você participou de zero etapas.

Duas extensões convenientes. **Primeira, verificações não precisam ficar só no fim.** A Lição 2 cobriu como fluxos complexos podem ser quebrados em checkpoints discretos onde mudanças de estado específicas deveriam ter ocorrido, em vez de validar cada etapa intermediária[^S2]. Esses checkpoints de verificação são pontos de pouso naturais para verificações determinísticas — algo como “depois que todos os CSVs forem lidos, a contagem de linhas deveria ser igual à soma das contagens de linhas dos arquivos individuais”. O mesmo retrospecto também menciona combinar a adaptabilidade dos agentes com salvaguardas determinísticas, como lógica de retentativa e checkpoints regulares[^S2] (note que “checkpoints” ali se refere ao tipo de checkpoint de recuperação, de salvar estado, do curso 9 desta série).

**Segunda, uma classe de verificação pode subir para a camada da API.** Adicione `strict: true` às suas definições de ferramenta para garantir que as chamadas de ferramenta do Claude sempre batam exatamente com o seu schema[^S6]. O schema é a sua declaração da estrutura dos parâmetros.

```json
{
  "name": "write_report",
  "description": "Grava os resultados agregados em report.json",
  "strict": true,
  "input_schema": {
    "type": "object",
    "properties": {
      "title": { "type": "string" },
      "items": {
        "type": "array",
        "items": {
          "type": "object",
          "properties": { "name": { "type": "string" }, "count": { "type": "integer" } },
          "required": ["name", "count"]
        }
      },
      "total": { "type": "integer" }
    },
    "required": ["title", "items", "total"]
  }
}
```

Com essa única linha, questões estruturais como “typo no nome do campo” ou “count passado como string” saem de “algo para o qual você escreve código de verificação” e viram uma garantia da plataforma. Ferramentas são um contrato entre sistemas determinísticos e agentes não determinísticos[^S3], e `strict` é como você escreve esse contrato dentro da interface.

Mas ele policia estrutura, não semântica. Se `total` de fato é igual à soma de todos os valores de `count`, o schema não tem nada a dizer — essa parte você continua verificando por conta própria.

```agentmentor-check
{
  "id": "vq-zh-03-strict-verifier",
  "label": "Mais estrito é mais seguro?",
  "prompt": "Um colega escreveu um verificador: a saída do agente precisa bater byte a byte com o arquivo de fixture, cada espaço e cada sinal de pontuação idênticos, ou é reprovada. O raciocínio dele é “mais estrito é mais seguro, melhor rejeitar demais do que rejeitar de menos”. Esse raciocínio se sustenta?",
  "whyHere": "Você acabou de ver os benefícios das verificações determinísticas; a seguir você precisa ver o jeito mais fácil de elas tropeçarem. Antes de escrever um verificador, deixe claro para si mesmo o que “estrito” deveria significar.",
  "mode": "single",
  "choices": [
    {
      "id": "a",
      "text": "Não se sustenta. Verificadores estritos demais rejeitam saídas corretas por diferenças espúrias como formatação, pontuação ou formulações alternativas válidas; o rigor deveria recair sobre a semântica (como se total é igual à soma dos count), e a formatação irrelevante deveria ser normalizada antes.",
      "correct": true,
      "feedback": "Correto. O rigor pertence às partes que carregam significado, não a espaços em branco e pontuação. A prática padrão para correspondência exata é normalizar espaços em branco e caixa antes de comparar."
    },
    {
      "id": "b",
      "text": "Se sustenta em boa parte. Ser mais estrito só significa alguns alarmes falsos a mais; humanos podem revisá-los, e é melhor do que deixar passar erros reais.",
      "correct": false,
      "feedback": "Alarmes falsos não são de graça. Falsos negativos poluem a sua taxa de aprovação, fazendo uma melhora real parecer que não teve efeito nenhum; pior, quando os resultados da verificação voltam para o agente como feedback, ele vai gastar vários turnos “corrigindo” algo que nunca esteve quebrado."
    },
    {
      "id": "c",
      "text": "Está invertido, deveria ser o mais frouxo possível — desde que a saída não esteja vazia, aprove, e deixe o resto para a revisão humana.",
      "correct": false,
      "feedback": "Isso é recuar para o estado de não ter verificação nenhuma que rode. Uma verificação que sempre passa é o mesmo que nenhuma verificação, “parece pronto” volta a ser o único sinal, e você vira o loop de verificação. Frouxo contra estrito não é um único controle deslizante: seja estrito na semântica, seja frouxo na formatação irrelevante."
    }
  ]
}
```

## A armadilha: verificadores estritos demais rejeitam saídas corretas

Esta é a forma mais comum de as verificações determinísticas falharem, e muitas vezes você não percebe quando acontece.

A orientação oficial para evals de ferramentas é afiada: **evite verificadores excessivamente estritos que rejeitam respostas corretas por diferenças espúrias como formatação, pontuação ou formulações alternativas válidas**[^S3].

“Diferenças espúrias” é a expressão-chave. A mesma resposta correta pode carregar um espaço no fim, pode escrever `positive` como `Positive`, pode ter dois espaços entre palavras em vez de um. Essas diferenças não significam nada **para a tarefa**, mas para um verificador de comparação byte a byte são catastróficas. A direção da falha também é insidiosa: ela não deixa erros passarem, ela **pune saídas corretas** — isso é um falso negativo.

Aqui vai uma quebra concreta com sua correção. O título do fixture é `Resumo de canais Q1 2026`. O `report.json` do agente tem todos os dados corretos, só com espaço em branco antes e depois do título e dois espaços a mais entre palavras. O verificador estrito ingênuo é assim:

```javascript
// strict.mjs — versão estrita ingênua
import { readFileSync } from "node:fs";

const GOLDEN_TITLE = "Resumo de canais Q1 2026";
const data = JSON.parse(readFileSync(process.argv[2], "utf8"));

if (data.title === GOLDEN_TITLE) {
  console.log("PASS");
  process.exit(0);
} else {
  console.log(`FAIL: title não bate, obtido ${JSON.stringify(data.title)}`);
  process.exit(1);
}
```

Rode; a saída real:

```text
$ node strict.mjs spacey.json
FAIL: title não bate, obtido "  Resumo de canais   Q1 2026\n"
```

Um relatório com conteúdo inteiramente correto, reprovado por uma quebra de linha no fim. Se esse resultado voltar para o agente, ele vai ficar mexendo nos espaços do título — uma direção sem relação com a tarefa.

A correção é uma função:

```javascript
function normalize(text) {
  return text.replace(/\s+/g, " ").trim().toLowerCase();
}

if (normalize(data.title) === normalize(GOLDEN_TITLE)) { /* PASS */ }
```

`replace(/\s+/g, " ")` funde espaços em branco consecutivos em um só, `trim()` remove os das pontas, `toLowerCase()` uniformiza a caixa. Depois da mudança, o mesmo arquivo passa — o script completo e os resultados reais de execução estão no Nível 2 dos exercícios, mais abaixo.

Lembrete do outro lado: normalização não é uma coisa de “quanto mais melhor”. Se você também remover a pontuação, pode acabar suavizando erros reais, como `total: 48` contra `total: 4.8`. O padrão de julgamento é sempre o mesmo — **esta diferença carrega significado?** Se sim, seja estrito. Se não, normalize.

## Onde as verificações determinísticas encontram seu teto

Verificadores determinísticos têm uma fronteira de aplicabilidade bem definida.

**A primeira fronteira é texto livre.** Saídas de pesquisa são difíceis de avaliar programaticamente, já que são texto de forma livre e raramente têm uma única resposta correta[^S2]. Você não consegue escrever `output == golden_answer` para um resumo — dado o mesmo material, dois resumos bem escritos podem usar formulações completamente diferentes. Esse tipo de julgamento vai para o domínio da Lição 4.

**A segunda fronteira é “se encaixa nos requisitos mais amplos do sistema”.** Soluções de código são verificáveis por testes automatizados, mas para garantir que as soluções se alinhem com requisitos mais amplos do sistema, a revisão humana continua sendo crucial[^S1]. Um patch pode passar em todos os testes e ainda assim ser um desenho ruim que torna o módulo inteiro impossível de manter. O retrospecto multiagente ecoa isso: mesmo em um mundo de avaliações automatizadas, o teste manual continua essencial[^S2].

As verificações determinísticas são donas do piso de “o que não deveria estar errado não está errado”. Acima desse piso, você precisa de ferramentas diferentes.

## Proporção: nem tudo merece um verificador

O erro oposto também é comum: construir uma suíte completa de verificação para um script de uso único.

O agente escreve um script de migração de dados que roda uma vez e depois é apagado, e você monta validação de estrutura, comparação com fixture, amostras de regressão — o tempo gasto escrevendo o verificador ultrapassa o tempo de simplesmente bater o olho na saída.

A régua de julgamento continua sendo aquela velha frase: **você deveria considerar adicionar complexidade apenas quando ela comprovadamente melhora os resultados**[^S1]. Especificamente para verificadores, faça a si mesmo uma pergunta:

- Quantas vezes esta verificação vai rodar? Se for uma só e você estiver ali olhando, os seus olhos podem ser mais rápidos.
- Sem ela, quanto tempo até os erros serem descobertos? “Na hora, estou olhando bem para a saída” contra “quando algo lá na frente quebrar, dois dias depois” levam a conclusões totalmente diferentes.
- Quantas iterações de prompt você planeja para esta tarefa? Assim que passa de uma, você precisa de uma régua estável para comparar antes e depois, ou “isso melhorou?” será sempre um chute.

Quanto a quando você tem obrigação de escrever um, a orientação oficial é dura — **sempre forneça verificação (testes, scripts, capturas de tela); se você não consegue verificar, não publique**[^S4].

## 💻 Exercícios

<!-- exercises -->

### Nível 1: escolha um verificador para 6 saídas (sem código)

Abaixo estão 6 saídas comuns de agentes. Para cada uma, responda: que verificador você usaria? Por que aquele?

1. Um arquivo de configuração JSON (nome do serviço, porta, timeout)
2. Um CSV ordenado por “valor decrescente”
3. Um resumo em texto livre (300 palavras destiladas de um relatório longo)
4. Um patch de código (corrigindo um bug conhecido)
5. Uma lista de nomes de arquivo (o agente alega ter processado esses arquivos)
6. Um rótulo de sentimento (produz positive / negative / neutral para um comentário)

Depois de responder às seis, responda a mais uma pergunta: **quais dessas seis não dá para julgar puramente por verificações determinísticas?** Para essas, que piso as verificações determinísticas ainda conseguem segurar? O que sobra para os métodos da Lição 4?

<!-- hint -->
Comece cada uma com esta pergunta: “Para esta saída, quais diferenças carregam significado e quais são espúrias?” As partes que carregam significado determinam o que você afirma; as espúrias determinam o que você normaliza. Por exemplo, no item 2 a ordem das linhas carrega significado (a tarefa é ordenar), mas se a quebra de linha é `\n` ou `\r\n` não carrega.

<!-- hint -->
Não assuma por padrão que “comparar byte a byte com um arquivo de fixture” é a resposta universal. Uma abordagem mais robusta costuma ser **calcular uma propriedade a partir da saída e afirmar sobre ela**, em vez de comparar com uma amostra fixa. Para o item 2, em vez de comparar com um CSV de fixture, afirme que “linhas adjacentes têm valores monotonicamente não crescentes” — assim o script continua funcionando quando você troca os dados de entrada.

<!-- rubric -->
- Os 6 itens têm um verificador concreto, em uma forma que produz passa/falha (dizer “verifique a qualidade” não vale)
- O raciocínio de ao menos 4 itens toca em “quais diferenças são espúrias e precisam de normalização ou de ser evitadas”, e não apenas “use um script para checar”
- Identifica explicitamente o item 3 (resumo em texto livre) como não totalmente julgável por verificações determinísticas, e diz qual piso o determinístico consegue segurar (tamanho, entidades obrigatórias precisam aparecer, nenhum número vindo de fora da fonte), deixando o julgamento de qualidade para a Lição 4
- Para o item 4 (patch de código), nota que suíte de testes, código de saída de build e linter conseguem verificar a funcionalidade automaticamente, mas que “se encaixa nos requisitos mais amplos do sistema” ainda precisa de revisão humana ou dos métodos da Lição 4
- Para o item 5 (lista de nomes de arquivo), reconhece que “a ordem normalmente não carrega significado”, e que se deveria fazer comparação de conjuntos e não comparação ordenada
- Para o item 6 (rótulo de sentimento), reconhece que este é o cenário clássico de correspondência exata, e menciona normalizar espaços em branco e caixa primeiro

<!-- answer -->
**1. Arquivo de configuração JSON → validação de schema + algumas asserções semânticas.**
O schema policia a estrutura (campos presentes, tipos corretos, campos obrigatórios preenchidos); depois acrescente algumas asserções que o schema não consegue expressar, como porta na faixa de 1–65535, timeout positivo. Não compare byte a byte com uma configuração de fixture — ordem das chaves, indentação, vírgulas finais são todas diferenças espúrias que vão causar alarmes falsos diários. Se a configuração é produzida pelo agente via chamada de ferramenta, a metade estrutural pode até subir para a camada da API com `strict: true`[^S6].

**2. CSV ordenado → um script carrega e afirma propriedades.**
Afirme que os nomes das colunas estão certos, que a contagem de linhas está certa, que linhas adjacentes têm valores monotonicamente não crescentes. A terceira é o núcleo da tarefa; as duas primeiras impedem “a ordenação está certa mas metade dos dados sumiu”. Este caso especialmente não deveria usar comparação com arquivo de fixture: quebra de linha, formato numérico (`1000` contra `1000.00`), espaço em branco no fim são todos espúrios, e trocar os dados de entrada invalida o fixture.

**3. Resumo em texto livre → verificações determinísticas seguram o piso, o julgamento de qualidade vai para a Lição 4.**
Saídas de pesquisa são difíceis de avaliar programaticamente, já que são texto de forma livre e raramente têm uma única resposta correta[^S2]. O piso continua sendo segurável: contagem de palavras dentro da faixa exigida, entidades especificadas (nomes de pessoas, nomes de produtos, trimestres) precisam aparecer, nenhum número vindo de fora do relatório de origem. Mas “ele captou os pontos-chave?” ou “ele interpretou a intenção de forma errada?” precisa de pontuação por juiz LLM sobre uma rubrica — isso é conteúdo da Lição 4.

**4. Patch de código → suíte de testes + código de saída de build + linter, com revisão humana como rede de segurança.**
Soluções de código são verificáveis por testes automatizados[^S1], e esses três estão bem no cardápio oficial de verificações[^S4]. Mas **os testes automatizados ajudam a verificar a funcionalidade; para garantir que as soluções se alinhem com requisitos mais amplos do sistema, a revisão humana continua sendo crucial**[^S1] — o patch pode passar em todos os testes e ainda ser um desenho que mata a manutenibilidade.

**5. Lista de nomes de arquivo → comparação de conjuntos (ordenar primeiro e depois comparar, ou usar `Set`).**
A **ordem** dos nomes de arquivo normalmente não carrega significado; se `a.csv` foi processado antes ou depois de `b.csv` não afeta se a tarefa está completa. Uma comparação linha a linha ordenada vai dar alarme falso com ordem diferente. Acrescente mais uma verificação: esses arquivos de fato existem em disco — o agente relatar arquivos processados que não batem com o que está lá é um modo de falha clássico.

**6. Rótulo de sentimento → correspondência exata, depois de normalizar.**
`output == golden_answer`[^S5], normalize espaços em branco e caixa antes de comparar. Isso é exatamente aquilo em que a correspondência exata brilha: tarefas com respostas categóricas e bem delimitadas, com apenas três valores válidos[^S5]. Fique atento ao modelo produzir `Positive.` ou `Sentiment: positive` — a normalização precisa tolerar esse tipo de invólucro espúrio, ou então trave bem o formato da saída no prompt.

**Quais não dá para julgar puramente por verificações determinísticas:** o item 3 inteiro, e a camada de “se encaixa nos requisitos mais amplos do sistema” do item 4. Esses dois vão para o juiz LLM da Lição 4, ou para humanos.

### Nível 2: escreva um `verify.mjs` de verdade

**Montagem da tarefa.** O agente precisa produzir um `report.json` com estes requisitos:

- Tem `title`, do tipo string
- Tem `items`, um array em que cada item tem `name` (string) e `count` (inteiro)
- Tem `total` (inteiro), e `total` é igual à soma de todos os valores de `count`
- `title` deveria bater com o título do fixture `Resumo de canais Q1 2026`

Escreva um script Node `verify.mjs` que faz três camadas de verificação: **validação de estrutura**, **verificação de consistência de `total`**, **comparação de título depois de normalizar espaços em branco**. O uso é `node verify.mjs report.json`, sai com 0 ao passar, sai com 1 ao falhar e imprime os motivos, um por linha.

Depois de escrevê-lo, crie três arquivos de amostra para validá-lo: um inteiramente correto, um em que `total` está genuinamente calculado errado, e um “todo o conteúdo correto, mas o título tem espaço em branco a mais”. O terceiro precisa passar — ele é a sua prova de que a normalização resgatou um falso negativo.

<!-- hint -->
As três camadas têm uma ordem de dependência: quando a estrutura não passa, não tenha pressa de calcular `total`. Se `items` nem array é, chamar `.reduce()` nele vai lançar exceção, transformando um claro “items não é um array” em um stack trace difícil de ler. O padrão é: a camada de estrutura coleta os erros e faz `return` cedo; as duas camadas seguintes só rodam se a estrutura passou.

<!-- hint -->
Ao normalizar o título, `trim()` só remove o espaço em branco das pontas, não remove o espaço extra entre palavras. Para lidar com os dois, use `text.replace(/\s+/g, " ")`: primeiro funda todo espaço em branco consecutivo (incluindo quebras de linha e tabulações) em um único espaço normal, depois apare as pontas. Para checar inteiros, não use `typeof x === "number"` — `3.5` também é number. Use `Number.isInteger(x)`.

<!-- rubric -->
- Usa o código de saída para expressar o veredicto: passa `process.exit(0)`, falha `process.exit(1)`
- A validação de estrutura cobre `title` ser string, `items` ser array, cada item ter `name` string e `count` inteiro, `total` ser inteiro
- A falha ao fazer parse do JSON é capturada em separado e reportada como um erro legível, sem deixar a exceção derrubar o processo
- Quando a validação de estrutura falha, retorna cedo sem executar a soma e a comparação
- A consistência de `total` usa a “soma de todos os valores de `count`” calculada na hora, e não uma comparação com um número fixo no código
- A comparação de `title` normaliza antes de comparar, no mínimo fundindo espaços em branco consecutivos e aparando as pontas
- As mensagens de falha de `total` e de `title` incluem tanto o valor esperado quanto o valor obtido
- Os veredictos dos três arquivos de amostra são PASS, FAIL (`total` não bate) e PASS, e a aprovação do terceiro é demonstravelmente graças à normalização

<!-- answer -->
Script completo:

```javascript
// verify.mjs
import { readFileSync } from "node:fs";

const GOLDEN_TITLE = "Resumo de canais Q1 2026";

// Normalizar: funde espaços em branco consecutivos, apara as pontas, uniformiza a caixa
function normalize(text) {
  return text.replace(/\s+/g, " ").trim().toLowerCase();
}

export function verify(raw) {
  const errors = [];

  let data;
  try {
    data = JSON.parse(raw);
  } catch (err) {
    return { pass: false, errors: [`falha ao fazer parse do JSON: ${err.message}`] };
  }

  if (data === null || typeof data !== "object" || Array.isArray(data)) {
    return { pass: false, errors: ["o nível superior não é um objeto JSON"] };
  }

  // Primeira camada: validação de estrutura
  if (typeof data.title !== "string") {
    errors.push("title ausente ou não é string");
  }
  if (!Array.isArray(data.items)) {
    errors.push("items ausente ou não é array");
  } else {
    data.items.forEach((item, i) => {
      if (item === null || typeof item !== "object") {
        errors.push(`items[${i}] não é um objeto`);
        return;
      }
      if (typeof item.name !== "string") {
        errors.push(`items[${i}].name ausente ou não é string`);
      }
      if (!Number.isInteger(item.count)) {
        errors.push(`items[${i}].count ausente ou não é inteiro`);
      }
    });
  }
  if (!Number.isInteger(data.total)) {
    errors.push("total ausente ou não é inteiro");
  }

  // A estrutura falhou, não siga adiante, senão os erros cascateiam
  if (errors.length > 0) {
    return { pass: false, errors };
  }

  // Segunda camada: consistência de total
  const sum = data.items.reduce((acc, item) => acc + item.count, 0);
  if (sum !== data.total) {
    errors.push(`total não bate: declarado ${data.total}, a soma dos count dos itens é ${sum}`);
  }

  // Terceira camada: comparação de title, normalizando primeiro
  if (normalize(data.title) !== normalize(GOLDEN_TITLE)) {
    errors.push(
      `title não bate: normalizado para "${normalize(data.title)}", esperado "${normalize(GOLDEN_TITLE)}"`
    );
  }

  return { pass: errors.length === 0, errors };
}

const path = process.argv[2];
if (!path) {
  console.error("Uso: node verify.mjs <report.json>");
  process.exit(2);
}

const result = verify(readFileSync(path, "utf8"));
if (result.pass) {
  console.log(`PASS  ${path}`);
  process.exit(0);
}
console.log(`FAIL  ${path}`);
for (const e of result.errors) {
  console.log(`  - ${e}`);
}
process.exit(1);
```

Três amostras. `good.json` — tudo correto:

```json
{
  "title": "Resumo de canais Q1 2026",
  "items": [
    { "name": "Cliente direto", "count": 12 },
    { "name": "Revendedor", "count": 30 },
    { "name": "Autoatendimento online", "count": 8 }
  ],
  "total": 50
}
```

`broken.json` — `items` e `title` idênticos aos de `good.json`, só mudou a última linha, com `total` genuinamente calculado errado (12 + 30 + 8 = 50, mas escreveu 48):

```json
  "total": 48
```

`spacey.json` — `items` e `total` idênticos aos de `good.json`, só trocou o título por uma versão com espaço em branco nas pontas, dois espaços a mais no meio e uma quebra de linha no fim. Este é o caso do falso negativo:

```json
  "title": "  Resumo de canais   Q1 2026\n",
```

Rodando (`node --version` é v26.3.0; o script não usa sintaxe nova, versões mais antigas também funcionam):

```text
$ for f in good.json broken.json spacey.json; do node verify.mjs "$f"; echo "  exit code: $?"; done
PASS  good.json
  exit code: 0
FAIL  broken.json
  - total não bate: declarado 48, a soma dos count dos itens é 50
  exit code: 1
PASS  spacey.json
  exit code: 0
```

Os três veredictos correspondem a três pontos-chave desta lição. `good.json` passa, e isso é o baseline. `broken.json` é pego, e a mensagem de falha traz tanto o esperado quanto o obtido (`declarado 48, a soma dos count dos itens é 50`); o agente lê essa linha e sabe qual número corrigir. `spacey.json` passa — se a comparação de `title` estivesse escrita byte a byte, este daria uma reprovação falsa, e o agente gastaria o turno seguinte mexendo em uma quebra de linha sem relação com a tarefa; a normalização foi o que resgatou esse falso negativo. Pegue o `strict.mjs` da seção da armadilha e rode no mesmo arquivo para ver como fica sem normalização:

```text
$ node strict.mjs spacey.json
FAIL: title não bate, obtido "  Resumo de canais   Q1 2026\n"
```

<!-- /exercises -->

## Recapitulação

- O princípio de ordenação dos métodos de correção é “mais rápido, mais confiável, mais escalável”; a correção baseada em código fica em primeiro nos três, e o custo é lhe faltar nuance para julgamentos complexos que precisam de menos rigidez baseada em regras[^S5].
- Uma verificação pode ser qualquer coisa que retorne um sinal que o Claude consiga ler na conversa: uma suíte de testes, o código de saída de um build, um linter, um script que compara a saída com um fixture, ou uma captura de tela comparada com um design[^S4].
- Verificadores formam um espectro; a ponta esquerda é a correspondência exata de string com um fixture, a ponta direita é pedir ao Claude que julgue[^S3]; a forma mínima é só `output == golden_answer`, normalmente depois de normalizar espaços em branco e caixa, perfeita para tarefas com respostas categóricas e bem delimitadas[^S5].
- Com passa/falha, o loop se fecha sozinho: faça o trabalho, rode a verificação, leia o resultado, itere até passar[^S4]; isso porque agentes precisam de ground truth do ambiente a cada etapa para avaliar o progresso[^S1], e é por isso que eles conseguem iterar usando resultados de testes como feedback[^S1].
- Fluxos complexos podem ser quebrados em checkpoints de verificação discretos onde mudanças de estado específicas deveriam ter ocorrido, em vez de validar cada etapa intermediária[^S2]; uma classe de validação de estrutura pode até subir para a camada da API com `strict: true`, para fazer as chamadas de ferramenta obedecerem estritamente ao schema[^S6].
- A maior armadilha são os verificadores estritos demais: eles rejeitam respostas corretas por diferenças espúrias como formatação, pontuação ou formulações alternativas válidas[^S3]. A correção é normalizar primeiro e depois comparar, guardando o rigor para as partes que de fato carregam significado.
- As verificações determinísticas têm um teto: saídas de pesquisa são difíceis de avaliar programaticamente[^S2]; os testes automatizados verificam a funcionalidade, mas para garantir que as soluções se alinhem com requisitos mais amplos do sistema a revisão humana continua sendo crucial[^S1], e mesmo com evals automatizados maduros o teste manual continua essencial[^S2].
- Não construa um verificador completo para um script de uso único — você deveria considerar adicionar complexidade apenas quando ela comprovadamente melhora os resultados[^S1]; mas na outra direção, se você não consegue verificar, não publique[^S4].

[>> Lição 4: LLM como juiz: rubricas, formatos e o que não deixar ele julgar](./04-llm-as-judge.md)
