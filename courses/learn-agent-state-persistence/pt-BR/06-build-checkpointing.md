# Lição 6: Mão na massa: soldando checkpoint e retomada no harness

> Objetivos de aprendizado:
> - Soldar de fato o esquema de checkpoint “salvar a chamada órfã no ponto A, limpá-la no ponto B” dentro do loop `runAgent` do Curso 7 desta série, em vez de deixá-lo como diagrama conceitual
> - Anexar um livro-razão de efeitos colaterais ao `runToolUses`: no instante em que uma ferramenta tem sucesso, escrever um registro em disco para que a retomada consiga dizer se “esta ferramenta de fato rodou ou não”
> - Escrever a divisão em três vias do `reconcile` e usar uma execução controlada de “kill simulado + `--resume`” para ver, com os próprios olhos, a recuperação se comportar como deve
>
> Pré-requisitos: você leu as Lições 1-5 e sabe rodar o loop do harness do Curso 7 desta série, "Agent Harness Fundamentals: Loops and Control" | Anterior: [Lição 5 <<](./05-rewind-and-fork.md)

## Veja rodar primeiro

As cinco primeiras lições separaram checkpoints, retomada, idempotência e rebobinagem/bifurcação e explicaram cada um. Esta lição solda tudo em um harness que roda de verdade: o mesmo loop familiar — chamar o modelo com `messages` e, quando `stop_reason === "tool_use"`, executar a ferramenta e chamar de novo — exceto que desta vez cada turno escreve dois checkpoints em disco, mais um livro-razão registrando os resultados de execução das ferramentas. A tarefa é “transformar notas de vendas em um relatório”, chamando três ferramentas em sequência: `read_notes`, `count_words`, `write_report`. Eis como fica rodando normalmente até o terceiro turno e sendo morto de imediato:

```text
$ CRASH_AFTER=after-effect-write:3 node agent.js

[turn 1][save A] pending=read_notes
[turn 1][save B]
[turn 2][save A] pending=count_words
[turn 2][save B]
[turn 3][save A] pending=write_report
[kill] kill simulado em after-effect-write:3
EXIT=137
```

Os turnos 1 e 2 percorreram os três passos completos `save A` → executar → `save B`, tudo normal. O turno 3 salvou `save A` (registrando que a chamada órfã é `write_report`), a ferramenta de fato terminou de executar e seu resultado já tinha sido escrito no livro-razão — mas o `save B` do passo seguinte nunca chegou a ser salvo antes de o processo ser morto. Esta é exatamente a janela que esta lição quer cravar: neste momento, o `checkpoint.json` ainda guarda um `pendingToolUse` órfão. Carregando essa cena, retome com `--resume`:

```text
$ node agent.js --resume

[resume] li turn=3 pending=write_report
[resume][reconcile] tool_use_id=toolu_03 name=write_report acerto no livro-razão, reusando o resultado, sem reexecutar
[turn 3][save B] resultado da ferramenta deste turno preenchido após a retomada
[done] Relatório escrito em report.txt, tarefa concluída.
```

O fluxo de retomada lê `turn=3 pending=write_report`, consulta o livro-razão — e descobre que esta chamada de fato tinha terminado e sido registrada antes do kill, então reusa aquele registro diretamente e **não reexecuta `write_report`**, preenche o `save B` que faltava neste turno e segue para o fechamento do modelo como de costume. A tarefa inteira nunca recomeçou do zero, e o relatório nunca foi escrito duas vezes.

Estas duas saídas de terminal não são exemplos escritos à mão. São a saída real do script Node conduzido por uma fila fixa de respostas na seção “O aparato de verificação” mais abaixo, copiadas aqui linha por linha.

## Montando bloco a bloco

### Lendo e escrevendo checkpoints: `saveCheckpoint` / `loadCheckpoint`

Um checkpoint é só esta cena — `{version, task, turns, tokensUsed, messages, pendingToolUse}` — serializada em disco. A única coisa com que tomar cuidado é não corromper o arquivo: escreva primeiro em um arquivo temporário, depois troque-o de lugar atomicamente com `fs.renameSync` — `rename` é uma operação indivisível dentro do mesmo sistema de arquivos, então nunca há um estado intermediário “escrito pela metade”:

```javascript
function saveCheckpoint(cp) {
  const tmp = CHECKPOINT_PATH + ".tmp";
  fs.writeFileSync(tmp, JSON.stringify(cp, null, 2));
  fs.renameSync(tmp, CHECKPOINT_PATH);
}
```

A leitura tem de aguentar duas coisas: o arquivo não existir (nunca rodou antes, ou a intenção é começar do zero) e o arquivo falhar na análise. O segundo caso merece cuidado extra — uma falha de `JSON.parse` em geral significa que a escrita anterior foi ela própria interrompida (`saveCheckpoint` é atômico em tese, mas se o processo for morto antes mesmo de o arquivo `.tmp` estar completamente escrito, ou se o próprio disco tiver um problema, um arquivo inacabado de antes do `rename` pode acabar sendo lido por engano). Nesse ponto, você jamais pode zerar silenciosamente o estado e fingir que nada aconteceu — é aí que as tarefas de fato se perdem. A jogada certa é lançar o erro sem rodeios, dizendo à pessoa que este checkpoint não é mais confiável e deveria ser apagado para que ela possa começar de novo, em vez de deixar o programa adivinhar seu caminho de volta a um estado íntegro:

```javascript
function loadCheckpoint() {
  let raw;
  try {
    raw = fs.readFileSync(CHECKPOINT_PATH, "utf8");
  } catch {
    throw new Error(`Não encontrei ${CHECKPOINT_PATH}; não há de onde fazer --resume`);
  }
  let cp;
  try {
    cp = JSON.parse(raw);
  } catch {
    throw new Error(
      `Falha ao analisar ${CHECKPOINT_PATH}; o arquivo pode ter sido interrompido no meio da escrita. Apague-o e comece de novo sem --resume em vez de continuar usando-o — um checkpoint escrito pela metade não dá para adivinhar de volta.`,
    );
  }
  if (cp.version !== 1) {
    throw new Error(`${CHECKPOINT_PATH} tem version=${cp.version}; este programa só aceita version=1 e se recusa a carregá-lo.`);
  }
  return cp;
}
```

Já que está aqui, cheque o campo `version`: se a estrutura do checkpoint mudar mais adiante, um arquivo antigo não deveria ser analisado à força como o formato novo — melhor recusar carregar do que ler um estado meio certo e meio errado. Ambas as funções foram testadas com JSON truncado de verdade: alimente-as com um `{"version":1,"turns":3,"pendingT` escrito pela metade e `loadCheckpoint` lança exatamente o erro de “apague e comece de novo” acima, sem nunca devolver nenhum padrão de aparência plausível.

### Ponto A e ponto B: ligando-os ao loop `runAgent`

O esqueleto do loop do Curso 7 desta série não mudou — `while (response.stop_reason === "tool_use")`, `push assistant` → executar ferramenta → `push tool_result` → requisitar o modelo de novo. Esta lição insere dois checkpoints no corpo do loop, e onde eles vão é o ponto central da lição:

```javascript
while (response.stop_reason === "tool_use") {
  if (turns >= MAX_TURNS) return `Cheguei ao máximo de ${MAX_TURNS} turnos, parando por conta própria`;
  turns++;

  const toolUseBlock = response.content.find((b) => b.type === "tool_use");
  // —— Ponto A: logo depois de obter a resposta do modelo, registre a chamada de ferramenta órfã deste turno ——
  saveCheckpoint({
    version: 1, task, turns, tokensUsed, messages,
    pendingToolUse: { id: toolUseBlock.id, name: toolUseBlock.name, input: toolUseBlock.input },
  });

  messages.push({ role: "assistant", content: response.content });
  const toolResults = await runToolUses(response.content);
  messages.push({ role: "user", content: toolResults });

  // —— Ponto B: resultados da ferramenta estão em messages (o livro-razão também está em disco), chamada órfã limpa ——
  saveCheckpoint({ version: 1, task, turns, tokensUsed, messages, pendingToolUse: null });

  response = await client.messages.create({ tools, messages });
  tokensUsed += response.usage.input_tokens + response.usage.output_tokens;
}
```

O ponto A vai depois de `response` chegar e antes de `messages.push({ role: "assistant", ... })` — o momento em que o modelo “nomeou uma ferramenta mas não a executou de fato”, e `pendingToolUse` registra essa nomeação literalmente. O ponto B vai depois de `runToolUses` terminar e o `tool_result` ter sido empurrado para `messages` — nesse ponto este turno está inteiramente encerrado, e `pendingToolUse` é limpo para `null`. Ensanduichado entre os dois salvamentos está exatamente o trecho de código em que a ferramenta de fato executa; se o processo por acaso morrer durante esse trecho ou logo depois dele, o que fica em disco é a cena “ponto A salvo, ponto B não salvo” — `pendingToolUse` não vazio, que é precisamente o sinal que a lógica de recuperação foi feita para tratar.

Para que este protocolo de chamada órfã única (`pendingToolUse` é um objeto, não um array) se sustente, esta lição projeta a tarefa de modo que o modelo nomeie exatamente uma ferramenta por turno — uma simplificação deliberada cujos limites a seção “Proporção” detalha.

### O livro-razão de efeitos: ligando-o ao `runToolUses`

O problema que o livro-razão resolve é: se uma queda cair bem entre “a ferramenta de fato terminou de executar” e “o resultado caiu em messages”, como a retomada sabe se esta chamada já rodou e não pode rodar de novo. A abordagem é, no instante em que uma ferramenta tem sucesso, escrever o resultado dela separadamente em um livro-razão indexado por `tool_use_id` (de novo com a gravação atômica de arquivo temporário mais `rename`):

```javascript
function saveEffect(toolUseId, entry) {
  const effects = loadEffects();
  effects[toolUseId] = entry;
  const tmp = EFFECTS_PATH + ".tmp";
  fs.writeFileSync(tmp, JSON.stringify(effects, null, 2));
  fs.renameSync(tmp, EFFECTS_PATH);
}

async function runToolUses(content) {
  const toolUseBlocks = content.filter((b) => b.type === "tool_use");
  const results = [];
  for (const block of toolUseBlocks) {
    let output;
    try {
      output = await toolImpls[block.name](block.input);
    } catch (err) {
      results.push({
        type: "tool_result", tool_use_id: block.id,
        content: `Erro na execução da ferramenta: ${err.message}`, is_error: true,
      });
      continue;
    }
    // O efeito colateral já aconteceu: mesmo que a gravação no livro-razão falhe, não podemos mentir
    // com is_error (isso faria o modelo tentar de novo com um tool_use_id novo e causaria um
    // efeito colateral duplicado) — apenas alerte separadamente para uma pessoa tratar
    try {
      saveEffect(block.id, { name: block.name, result: output, at: Date.now() });
    } catch (err) {
      console.error(`[falha ao gravar no livro-razão] tool_use_id=${block.id}: o efeito colateral já aconteceu, risco de execução duplicada na retomada, verifique à mão`);
    }
    results.push({ type: "tool_result", tool_use_id: block.id, content: output });
  }
  return results;
}
```

A ordem não pode ser trocada: **você tem de obter primeiro o resultado real de `toolImpls[block.name](block.input)` e só então `saveEffect` pode anotá-lo** — executar primeiro, registrar depois. O livro-razão registra “esta coisa realmente aconteceu, e este foi o resultado dela”. Se você invertesse e registrasse antes de executar, tudo o que poderia cair no livro-razão seria um marcador, e o livro-razão perderia todo o sentido da sua promessa de “já feito” (o exercício de Nível 2 faz você reproduzir este antipadrão com as próprias mãos).

Em uma execução normal única, `runToolUses` percorre os dois passos “executar → registrar”, porque cada `tool_use_id` aparece pela primeira vez, sem nada a consultar. A única chamada órfã que a retomada tem de tratar percorre os três passos mais completos “consultar o livro-razão → executar (se preciso) → registrar (se executou)” — o `reconcile` abaixo é a implementação desses três passos, e ambos seguem a mesma disciplina: nunca escreva “já feito” no livro-razão antes de ter um resultado real.

### `reconcile`: a divisão em três vias para uma chamada órfã depois de uma queda

O que a retomada tem de tratar é aquele único (se houver) `pendingToolUse` do checkpoint. Ele corresponde a três possibilidades:

```javascript
async function reconcile(cp) {
  const pending = cp.pendingToolUse;
  if (!pending) return null; // sem chamada órfã, é só seguir em frente

  const effects = loadEffects();
  const hit = effects[pending.id];

  if (hit) {
    console.log(`[resume][reconcile] tool_use_id=${pending.id} name=${pending.name} acerto no livro-razão, reusando o resultado, sem reexecutar`);
    return { type: "tool_result", tool_use_id: pending.id, content: hit.result };
  }

  if (READ_ONLY.has(pending.name)) {
    console.log(`[resume][reconcile] tool_use_id=${pending.id} name=${pending.name} falha no livro-razão, ferramenta somente leitura, reexecutando`);
    const output = await toolImpls[pending.name](pending.input);
    saveEffect(pending.id, { name: pending.name, result: output, at: Date.now() });
    return { type: "tool_result", tool_use_id: pending.id, content: output };
  }

  console.log(`[resume][reconcile] tool_use_id=${pending.id} name=${pending.name} falha no livro-razão com efeitos colaterais, indeterminável, anexando is_error`);
  return {
    type: "tool_result", tool_use_id: pending.id, is_error: true,
    content: `O estado de execução desta chamada ${pending.name} antes da retomada é desconhecido: não há entrada no livro-razão e, para evitar um efeito colateral duplicado, ela não foi reexecutada. Verifique você mesmo se ela se completou.`,
  };
}
```

Três ramos, para três cenários que foram todos realmente testados:

- **Acerto no livro-razão** — esta é a demonstração de queda do começo da lição: `write_report` de fato tinha terminado de executar e sido registrada, só o `save B` não conseguiu. Na retomada, reuse diretamente o resultado do livro-razão, não reexecute, evite escrever o relatório duas vezes.
- **Falha no livro-razão + ferramenta somente leitura** — algo como `read_notes`, uma ferramenta sem efeitos colaterais; cair antes de o registro entrar não importa, então é só reexecutá-la uma vez para obter o resultado e, já que está aqui, registrar esta execução no livro-razão:
  ```text
  [resume][reconcile] tool_use_id=toolu_ro name=read_notes falha no livro-razão, ferramenta somente leitura, reexecutando
  ```
- **Falha no livro-razão + efeitos colaterais** — algo como `write_report`, uma ferramenta que muda o estado externo, caindo antes de o registro entrar: você não sabe se ela de fato rodou (em um sistema de arquivos real, o efeito colateral de `write_report` bem pode já ter acontecido, só sem ter sido registrado no livro-razão). Aqui, em vez de adivinhar, use um `tool_result` com `is_error: true` para dizer honestamente ao modelo “o estado desta chamada é desconhecido”, devolvendo o julgamento a ele:
  ```text
  [resume][reconcile] tool_use_id=toolu_side name=write_report falha no livro-razão com efeitos colaterais, indeterminável, anexando is_error
  ```

Todas as três linhas de log são saída real, não inventada — o próprio `reconcile` não precisa saber qual é a tarefa; dê a ele um `pendingToolUse` e o estado correspondente do livro-razão e cada um dos três ramos é testável de forma independente.

```agentmentor-check
{
  "id": "sp-zh-06-a-point-necessity",
  "label": "Decidir se manter apenas o checkpoint do ponto B é seguro",
  "prompt": "Um colega olha as duas posições de checkpoint desta lição e propõe uma simplificação: “Todo turno termina mesmo com um instantâneo completo no ponto B, e o ponto B já guarda todos os campos que o ponto A guarda — então é só largar o ponto A e salvar um checkpoint no fim do loop, depois de o resultado da ferramenta estar em messages e o livro-razão escrito, economizando uma escrita em disco.” Essa simplificação se sustenta?",
  "whyHere": "A divisão em três vias do reconcile acabou de ser vista, então bem aqui uma proposta concreta de “largar o ponto A” testa se o leitor de fato entendeu o que o ponto A registra e por que o ponto B sozinho não consegue tapar esse buraco.",
  "mode": "single",
  "choices": [
    {
      "id": "a",
      "text": "Não se sustenta: se a queda cair entre “o modelo nomeou uma ferramenta” e “o resultado está registrado”, um checkpoint que só vive no ponto B não sabe nada da chamada, então na retomada não há tool_result correspondente a produzir nem entrada de livro-razão a consultar",
      "correct": true,
      "feedback": "Correto. O protocolo exige que todo tool_use volte emparelhado com um tool_result. Se o checkpoint só salva no ponto B e a queda cai na janela entre “o modelo deu uma chamada de ferramenta” e “o resultado está consumado”, não há nada em disco dizendo “este turno chegou a nomear uma ferramenta” — não é que falte uma entrada ao livro-razão, é que o próprio checkpoint não sabe que a chamada órfã algum dia existiu. O reconcile não tem o que consultar nem que ramo tomar. O ponto A registra a chamada no instante em que a resposta chega, justamente para que o que quer que aconteça dentro daquela janela fique registrado."
    },
    {
      "id": "b",
      "text": "Sustenta-se: o ponto B já guarda todos os campos que o ponto A guarda, então largar o ponto A custa apenas uma escrita em disco a mais, sem perda de funcionalidade, e dá para removê-lo do loop com segurança",
      "correct": false,
      "feedback": "Não exatamente. Tratar isso como “um arquivo a menos para escrever” deixa passar que o ponto A e o ponto B não guardam a mesma coisa — o ponto A registra “o modelo acabou de nomear esta ferramenta, e ela ainda está pendente”, o ponto B registra “este turno está feito e ficou para trás”. Largar o ponto A não perde uma escrita redundante, perde a capacidade de registrar toda a janela durante a qual a ferramenta está executando, e essa janela é exatamente onde o processo tem mais chance de ser morto."
    },
    {
      "id": "c",
      "text": "Não se sustenta, mas o motivo é que os checkpoints do ponto B não são escritos com frequência suficiente — você deveria salvar vários instantâneos extras do ponto B de tempos em tempos enquanto a ferramenta roda, como rede de proteção",
      "correct": false,
      "feedback": "O problema não é a frequência com que o ponto B é salvo — o conteúdo do ponto B só reflete um estado, “este turno está completo”. Não importa quantos instantâneos do ponto B você tire, todos registram a mesma informação “depois do fato” e jamais conseguem reconstruir o estado intermediário de “a ferramenta está rodando e não terminou”. O que falta não é frequência, é um ponto de gravação dedicado a registrar o próprio fato de “acabou de ser nomeada, ainda não terminou”."
    }
  ]
}
```

### O ponto de entrada: `--resume` no `main()`

Por último, o ponto de entrada. `main()` toma exatamente uma decisão: a linha de comando tem `--resume`. Se tiver, recupere via `loadCheckpoint()`; se não tiver, limpe os arquivos de checkpoint e livro-razão que sobraram da última vez e comece do zero — essa limpeza garante que “começar de novo sem `--resume`” seja sempre uma abertura limpa, nunca poluída por uma cena inacabada de uma execução anterior:

```javascript
async function main() {
  const resume = process.argv.includes("--resume");
  const task = "Transforme sales-notes.txt em um relatório curto e escreva-o em report.txt.";
  const tools = [];

  const client = resume ? makeStubClient([R4]) : makeStubClient([R1, R2, R3]);

  try {
    const result = await runAgent(client, task, tools, { resume });
    console.log(`[done] ${result}`);
  } catch (err) {
    if (err instanceof SimulatedCrash) {
      console.log(`[kill] ${err.message}`);
      process.exit(137);
    }
    throw err;
  }
}
```

Dentro de `runAgent` há dois caminhos correspondentes: quando `opts.resume` é verdadeiro, ele chama `loadCheckpoint()`, roda `reconcile`, empurra o resultado reconciliado (se houver) para `messages` e salva um checkpoint do ponto B, e então envia a requisição ao modelo como de costume; quando é falso, ele faz `fs.rmSync` do checkpoint e do livro-razão antigos e começa de um `messages` vazio. No `agent.js` real, o cliente do modelo é trocado pelo `client.messages.create({ model, max_tokens, tools, messages })` do `@anthropic-ai/sdk`, e nada mais na estrutura muda.

## Citando o protocolo

Nenhuma das duas decisões de projeto desta lição foi tomada arbitrariamente.

Quando o livro-razão está ausente e o `reconcile` não consegue ter certeza do estado, ele escolhe anexar um `tool_result` com `is_error: true` em vez de pular silenciosamente — apoiando-se na exigência dura do protocolo sobre emparelhamento de blocos de conteúdo: todo `tool_use` tem de voltar com um `tool_result` correspondente, todos devolvidos juntos, cada um reivindicado pelo seu `tool_use_id`[^S4]. Pular o salvamento do ponto A deixaria o fluxo de retomada sem saber que a chamada algum dia aconteceu, de modo que ele não conseguiria satisfazer aquela regra de emparelhamento de jeito nenhum; todo o sentido de o `reconcile` existir é garantir que, com acerto ou falha no livro-razão, a chamada órfã termine com um `tool_result` emparelhado.

Escolher “retomar e seguir” em vez de “dar erro e começar de novo” ecoa o que a equipe de engenharia da Anthropic descreveu na retrospectiva sobre seu sistema de pesquisa: quando ocorrem erros, você não pode simplesmente reiniciar, porque "restarts are expensive and frustrating for users" (reinícios são caros e frustrantes para os usuários), então em vez disso eles "built systems that can resume from where the agent was when the errors occurred"[^S1] (construíram sistemas capazes de retomar de onde o agente estava quando os erros ocorreram). A mesma retrospectiva observa que a adaptabilidade de um agente pode ser emparelhada com — em vez de posta contra — salvaguardas determinísticas, combinando "the adaptability of AI agents built on Claude with deterministic safeguards like retry logic and regular checkpoints"[^S1] (a adaptabilidade de agentes de IA construídos sobre o Claude com salvaguardas determinísticas como lógica de retentativa e checkpoints regulares). Checkpoints pegam a falha determinística — “o processo morreu” —, enquanto a adaptabilidade do modelo trata o tipo de caso que o código não consegue decidir de forma dura, como “o livro-razão é indeterminável”. O ramo `is_error` do `reconcile` é onde os dois se encontram: ele conta ao modelo a verdade sobre o estado desconhecido e o deixa decidir se verifica ou tenta de novo, e "letting the agent know when a tool is failing and letting it adapt works surprisingly well"[^S1] (deixar o agente saber quando uma ferramenta está falhando e deixá-lo se adaptar funciona surpreendentemente bem).

## O aparato de verificação

As duas demonstrações de terminal desta lição não dependem de matar de fato um processo para ver o que acontece — desse jeito o momento da queda seria diferente a cada execução, e você não conseguiria fazer uma afirmação dirigida como “a queda aconteceu depois da enésima chamada de ferramenta, e o comportamento de recuperação está correto”. A abordagem é trocar o cliente do modelo por um dublê que joga as cartas em uma ordem fixa: uma fila de respostas que, a cada chamada a `messages.create`, entrega em sequência a próxima resposta pré-escrita, e lança erro de imediato se você continuar chamando depois de a fila esvaziar — de modo que qual ferramenta a tarefa chama em qual turno, e quando o modelo fecha, são todas constantes fixas que não se deslocam por causa de uma chamada real.

“Matar o processo” é um `crashPoint(label)` controlado por uma variável de ambiente: toda vez que `runToolUses` termina uma gravação no livro-razão, ele costura “qual escrita é esta” em um rótulo de texto, compara-o com a variável de ambiente `CRASH_AFTER` e, em uma correspondência, lança uma exceção dedicada `SimulatedCrash`. Isso transforma “cair depois da enésima chamada de ferramenta” em um inteiro que você pode especificar com precisão, em vez de um evento fortuito à mercê do relógio. `main()` captura apenas esta única exceção na camada mais externa, imprime uma única linha de log `[kill]` e sai com `137` (o código de saída convencional para “morto por `SIGKILL`”), de modo que a demonstração se lê como um processo morto de verdade em vez de um stack trace feio.

Este método de “fixar o conteúdo com uma fila de respostas, fixar a contagem de quedas com um rótulo” é a mesma ideia que a Lição 6 do Curso 8 desta série, "Context Engineering: Spending Finite Attention Where It Counts", usou para verificar engenharia de contexto: fixe primeiro em quantidades determinadas as coisas que de outro modo seriam não determinísticas (o que o modelo diz desta vez, onde o processo morre desta vez), e só então o comportamento de recuperação pode ser afirmado linha por linha em vez de sair diferente a cada execução. Foi assim que esta lição verificou todos os três ramos — “acerto no livro-razão, não reexecutar”, “falha no livro-razão em ferramenta somente leitura, reexecutar direto”, “falha no livro-razão em ferramenta com efeitos colaterais, anexar `is_error`” — mais a tolerância do `loadCheckpoint` a um arquivo truncado, cada um conferido um a um com uma execução real de `node` em vez de raciocinado apenas no papel.

## Proporção: nem toda tarefa precisa disto

A maquinaria soldada nesta lição — dois checkpoints, um livro-razão, um `reconcile` de três vias — é feita para tarefas longas que rodam muitos turnos seguidos e têm efeitos colaterais pelo caminho. Uma tarefa pequena que termina em alguns segundos e pode simplesmente ser reexecutada em caso de falha talvez não valha carregar todo este aparato de I/O de disco e máquina de estados; aqui você pode tomar emprestada a mesma proporção que o Curso 7 desta série, "Agent Harness Fundamentals: Loops and Control", citou: o que vale considerar é que "you should consider adding complexity only when it demonstrably improves outcomes"[^S3] (você deveria considerar acrescentar complexidade apenas quando isso comprovadamente melhorar os resultados). Isto não é uma regra dura de “você tem de fazer assim”, e sim uma pergunta a se fazer antes de começar: esta tarefa é mesmo longa o bastante, mesmo importante o bastante, para valer manter um checkpoint?

A implementação desta lição também traça dois limites explícitos, que vale dizer em voz alta para você não a tratar como “aprendi e já jogo direto em produção”:

- Cada turno trata exatamente um `pendingToolUse` órfão, condizente com a tarefa de demonstração em que o modelo nomeia uma ferramenta por turno. Em um cenário real, uma única resposta do modelo bem pode carregar vários blocos `tool_use` concorrentes (o `runToolUses` do Curso 7 desta série os roda concorrentemente com `Promise.all`); estender o protocolo de chamada órfã única desta lição para um conjunto de chamadas órfãs significa transformar `pendingToolUse` de objeto em array e rodar `reconcile` sobre cada um. Esta lição deixou de fora essa camada de complexidade de propósito, para primeiro deixar clara a lógica de reconciliação de uma única chamada órfã.
- O checkpoint e o livro-razão desta lição governam uma coisa: “um processo, rodando uma tarefa”. Como várias sessões compartilham estado, se vários processos tocando o mesmo checkpoint ao mesmo tempo conflitam, como a consistência entre máquinas é garantida — isso pertence a concorrência multissessão e consistência distribuída, e não está nesta lição, nem no escopo deste curso.

<!-- exercises -->
## 💻 Exercícios

### Nível 1: Um manual de simulação dos momentos de queda

Dentro de um turno, os checkpoints desta lição podem ser pegos por, no máximo, três “momentos de queda”: ① ponto A recém-salvo, ferramenta ainda não começou a executar; ② a função de implementação da ferramenta já terminou, mas o livro-razão ainda não foi escrito; ③ ponto B recém-salvo. Diante do `saveCheckpoint` / `saveEffect` / `reconcile` que esta lição implementa, escreva cada um desses momentos com clareza: depois da queda, em que estado estão o `checkpoint.json` e o `effects.json`; no `--resume`, em que ramo o `reconcile` cai; e, se o que foi interrompido tiver sido uma ferramenta com efeitos colaterais, não somente leitura (digamos `write_report`), os estados observáveis em disco de ① e ② são os mesmos, e o comportamento de recuperação é o mesmo — e, se forem os mesmos, o que isso lhe diz.

<!-- rubric -->
- Momento ① (ponto A salvo, ferramenta não executada): o `pendingToolUse` do `checkpoint.json` é a chamada deste turno; o `effects.json` não tem registro para este `tool_use_id`; na retomada, o `reconcile` toma o ramo “falha no livro-razão” — uma ferramenta somente leitura reexecuta direto, uma não somente leitura recebe `is_error`
- Momento ② (ferramenta terminou de executar, livro-razão não escrito): o estado do `checkpoint.json` é exatamente o mesmo de ① (`pendingToolUse` ainda é o salvo no ponto A), e o `effects.json` também não tem registro, igual a ①, de modo que na retomada o `reconcile` toma exatamente o mesmo ramo de ①; tem de apontar que “o código não consegue distinguir ① de ②” — em ② a ferramenta de fato terminou de executar (digamos que `report.txt` já está escrito), mas, como o livro-razão não foi escrito, a retomada trata isso como estado desconhecido, e uma ferramenta não somente leitura recebe `is_error` em vez de ser reusada diretamente, que é exatamente o motivo de o livro-razão ser escrito no instante em que uma ferramenta tem sucesso, para encolher ao máximo essa janela de incerteza
- Momento ③ (ponto B salvo): o `pendingToolUse` do `checkpoint.json` é `null`, o `messages` já contém o `tool_result` deste turno; o `effects.json` tem o registro correspondente; na retomada, `reconcile(cp)` devolve `null` de imediato porque `pending` está vazio, o `runAgent` não faz a etapa de “preencher” e requisita o modelo de novo direto com o `messages` completo

<!-- answer -->
Os momentos ① e ② deixam exatamente o mesmo estado em disco: o `pendingToolUse` do `checkpoint.json` continua sendo, nos dois, a descrição da chamada salva no ponto A, e o `effects.json` não tem registro para este `tool_use_id` nos dois (a única diferença é que em ② a ferramenta de fato terminou de rodar, só que esse fato ainda não foi escrito em lugar nenhum persistente). Como o `reconcile` só olha o estado em disco e não sabe o que aconteceu em memória, ① e ② disparam exatamente o mesmo ramo: ele não consegue ler a ferramenta no livro-razão, então, se for julgada somente leitura, é só reexecutar uma vez; se for julgada com efeitos colaterais, ele não ousa adivinhar e anexa um `tool_result` com `is_error: true` de volta ao modelo — melhor entregar informação incompleta do que adivinhar uma resposta que pode causar um efeito colateral duplicado.

O momento ③ é um caminho completamente diferente: `pendingToolUse` já é `null`, `reconcile` devolve `null` no instante em que entra na função, a checagem `if (reconciled)` do `runAgent` é falsa, ele pula o bloco inteiro de “anexar um resultado de ferramenta, salvar outro ponto B” e vai direto para a próxima requisição ao modelo com o `messages` já completo — no que diz respeito ao fluxo de recuperação, este turno foi encerrado há muito tempo.

<!-- hint -->
Pense primeiro em “o que o código consegue ver” e “o que de fato aconteceu no mundo” separadamente: no momento ② a ferramenta claramente terminou de executar, mas, enquanto esse fato não tiver sido escrito no `checkpoint.json` ou no `effects.json`, o `reconcile` não tem como saber que aconteceu.

<!-- hint -->
Decidir em que ramo cai só precisa de dois valores dos dois arquivos em disco: se `cp.pendingToolUse` é `null` e se o `effects.json` tem este `tool_use_id`. Escreva esses dois valores para cada um de ①②③ primeiro e o ramo se resolve sozinho.

### Nível 2: Ache o erro de ordem em que o livro-razão foi escrito ao contrário

O relato do incidente diz: “A pessoa interrompeu uma tarefa e, depois do `--resume`, uma ferramenta foi pulada — o log a mostrava como ‘já feita’, mas esta ferramenta nunca foi de fato executada, e o arquivo que ela deveria escrever simplesmente não existe.” Você desenterra o `runToolUses` que estava rodando em produção na época e acha uma diferença em relação à versão desta lição:

```javascript
async function runToolUses_prod(content) {
  const toolUseBlocks = content.filter((b) => b.type === "tool_use");
  const results = [];
  for (const block of toolUseBlocks) {
    saveEffect(block.id, { name: block.name, result: null, at: Date.now() });
    const output = await toolImpls[block.name](block.input);
    results.push({ type: "tool_result", tool_use_id: block.id, content: output });
  }
  return results;
}
```

Ache este erro de ordem, explique com clareza por que ele causa “uma ferramenta que claramente nunca rodou é tratada como feita” e corrija a ordem. Depois, seguindo o método da seção “O aparato de verificação” desta lição, escreva um pequeno script para reproduzi-lo: insira um ponto de queda simulada controlado por variável de ambiente entre `saveEffect` e `toolImpls[block.name](...)`, e rode-o de verdade com `node` — sob a ordem errada, o livro-razão já guarda um registro `result: null` antes da queda; com a ordem corrigida, o mesmo ponto de queda não deixa entrada nenhuma para este `tool_use_id` no livro-razão.

<!-- rubric -->
- Aponta o bug: `saveEffect` está colocado antes de `toolImpls(...)`, ponto em que a ferramenta ainda não executou, então não pode haver um `output` real — só dá para enfiar um marcador (como `result: null`)
- Explica a consequência: se a queda por acaso cair depois da gravação no livro-razão mas antes de a ferramenta de fato terminar de executar, na retomada o `reconcile` consulta o livro-razão, acerta este registro-marcador e julga “acerto no livro-razão, reusar resultado, não reexecutar” — tratando como feita uma chamada que nunca realmente executou, usando um resultado `null` para satisfazer a exigência de emparelhamento do `tool_result`, em vez de deixar o livro-razão refletir honestamente “ainda não executada”
- Dá a ordem correta: você tem de fazer `await toolImpls[block.name](block.input)` para obter o resultado real primeiro e, só depois de ele ter sucesso, chamar `saveEffect` para escrever esse resultado real no livro-razão, e então empurrar o `tool_result` — a ordem de executar e registrar não pode ser trocada
- Verifica com um script: insere um ponto de queda controlado entre `saveEffect` e `toolImpls`, roda a ordem errada e a ordem corrigida com `node` e observa se o `effects.json` já tem este `tool_use_id` escrito antes da queda — sob a ordem errada tem (com `result` sendo um marcador), depois da correção não tem

<!-- answer -->
O bug é que `saveEffect(block.id, { ..., result: null, ... })` está escrito antes de `const output = await toolImpls[block.name](block.input)`. Nesse ponto a ferramenta ainda não foi chamada, a função não faz a menor ideia de qual é o resultado real e só pode enfiar um marcador (aqui `null`) para segurar o `tool_use_id`. Se o processo por acaso for morto depois da gravação no livro-razão mas antes de `toolImpls` de fato terminar, o livro-razão em disco mostra “este `tool_use_id` já tem um registro”, mas a ferramenta correspondente nunca rodou de verdade. Na retomada, o `reconcile` só verifica se o livro-razão tem este id, encontra-o, julga “acerto no livro-razão” e reusa aquele registro — de modo que uma chamada que nunca executou é tratada como chamada feita com um resultado `null`, que é exatamente a causa por trás do “ferramenta pulada, log mostra feita, mas o arquivo simplesmente não existe” do relato do incidente.

A correção é trocar a ordem de volta para “executar primeiro, registrar depois”:

```javascript
async function runToolUses(content) {
  const toolUseBlocks = content.filter((b) => b.type === "tool_use");
  const results = [];
  for (const block of toolUseBlocks) {
    const output = await toolImpls[block.name](block.input); // executa primeiro, obtém o resultado real
    saveEffect(block.id, { name: block.name, result: output, at: Date.now() }); // depois registra
    results.push({ type: "tool_result", tool_use_id: block.id, content: output });
  }
  return results;
}
```

Você pode escrever a verificação nos moldes de “O aparato de verificação” desta lição: escreva um script mínimo que trate um único `block`, insira um `crashPoint` que lê a variável de ambiente depois de `saveEffect` (a versão errada) ou depois de `toolImpls` (a versão correta), rode `node` duas vezes e compare se o `effects.json` tem este `tool_use_id` depois da queda — sob a ordem errada um registro `result: null` já está escrito antes da queda, sob a ordem correta não há nada no livro-razão antes da queda.

<!-- hint -->
A existência de um registro no livro-razão deveria equivaler a “esta ferramenta realmente terminou de rodar, e este é o resultado real dela”. Pense ao contrário: se a etapa de registrar acontece antes da execução, esse registro ainda consegue garantir isso?

<!-- hint -->
Montar o script de verificação não exige reconstruir o `runAgent` inteiro; você só precisa isolar a execução deste único `block`, inserir um `throw` controlado por variável de ambiente e, depois de rodar, apenas ler o arquivo do livro-razão para conferir se este id está lá.

<!-- /exercises -->

## Recapitulação

- O checkpoint salva duas vezes por turno: o ponto A registra o `pendingToolUse` órfão depois que a resposta do modelo chega, o ponto B o limpa para null depois que o resultado da ferramenta cai em `messages`; salvar só o ponto B torna a janela entre “o modelo nomeia uma ferramenta” e “o resultado está registrado” completamente invisível no checkpoint e, como todo `tool_use` tem de voltar emparelhado com um `tool_result`[^S4], o ponto A é exatamente o que torna rastreável a chamada órfã dentro daquela janela
- O livro-razão de efeitos colaterais registra por `tool_use_id`, e a disciplina dele é “executar primeiro, registrar depois” — registrar tem como premissa já se ter um resultado real; inverta e você registra erroneamente “ainda não rodou” como “já feito”
- A divisão em três vias do `reconcile` trata a chamada órfã na retomada: acerto no livro-razão, reusar e não reexecutar; falha no livro-razão mas somente leitura, reexecutar direto; falha no livro-razão com efeitos colaterais, não adivinhar, anexar um `tool_result` com `is_error` devolvendo o estado honestamente ao modelo — isso ecoa as duas lições de engenharia de “você não pode reiniciar do zero em caso de erro, tem de retomar de onde parou” e “deixe o modelo saber que uma ferramenta falhou, deixe que ele se adapte, e funciona surpreendentemente bem”[^S1], e se alinha à ideia de “salvaguardas determinísticas emparelhadas com a adaptabilidade do modelo”[^S1]
- A maquinaria de checkpoint e livro-razão não é de graça; acrescente-a apenas quando a complexidade comprovadamente melhorar os resultados[^S3]; a implementação desta lição governa somente “um processo rodando uma tarefa”, e concorrência multissessão e consistência distribuída não estão entre suas preocupações, nem no escopo deste curso

Você concluiu este curso. Partindo do julgamento de que “agentes têm estado e os erros se acumulam”, você trabalhou todo o caminho — o que um checkpoint deve salvar, quando escrevê-lo em disco, como tratar uma chamada órfã na retomada, como a idempotência dá rede de proteção à recuperação e como um checkpoint pode ainda servir à rebobinagem e à bifurcação — até esta lição, em que você os soldou à mão em um harness que roda de verdade, é morto de verdade e de verdade retoma e termina. O que você tem agora não é só um conjunto de conceitos, mas um trecho de código verificado por execução real de `node`. Ligue-o ao seu próprio harness e, da próxima vez que ele de fato for morto, vai retomar exatamente de onde parou.
