# Lição 4: Efeitos colaterais e idempotência: quais ferramentas são seguras de reexecutar na retomada

> Objetivos de aprendizado:
> - Explicar por que repetir a execução na retomada entrega, por padrão, semântica de execução **at-least-once**, nunca exactly-once
> - Julgar se uma operação de ferramenta é idempotente e identificar os efeitos colaterais que causam dano de verdade no instante em que rodam duas vezes
> - Projetar e implementar um **livro-razão de efeitos** indexado por `tool_use_id`, para que uma chamada órfã na retomada consulte o livro-razão antes de decidir se de fato executa
>
> Pré-requisitos: você leu as Lições 2 e 3 e entende as regras de reconciliação para um `pendingToolUse` órfão no `checkpoint.json` (Lição 3); você conhece o conjunto de ferramentas `HIGH_IMPACT` e a válvula de aprovação pré-execução do Curso 7 desta série, "Agent Harness Fundamentals: Loops and Control" | Anterior: [Lição 3 <<](./03-resume-from-checkpoint.md) | Próxima: [Lição 5 >>](./05-rewind-and-fork.md)

## A retomada entrega at-least-once: a Lição 3 deixou as ferramentas de alto impacto sem solução

A Lição 3 ensinou você a ler o `pendingToolUse` do `checkpoint.json` e usá-lo para trazer de volta ao loop uma chamada órfã — aquela em que a queda caiu entre a execução da ferramenta e a gravação no livro-razão. A regra de reconciliação de então era: ferramentas somente leitura simplesmente reexecutam e, para ferramentas de alto impacto sobre as quais você não consegue concluir nada, anexe um `tool_result` com `is_error` para que o loop deixe de ficar travado e a pergunta volte para uma pessoa. É um fallback honesto e é também um problema não resolvido. “Não dá para concluir” significa que a tarefa não consegue seguir sozinha, então toda queda em uma ferramenta de alto impacto precisa de alguém de olho.

A raiz disso é a seguinte: a retomada, por natureza, entrega semântica de execução **at-least-once** (pelo menos uma vez). O processo pode morrer depois que uma ferramenta de fato teve sucesso, mas antes de o resultado ser escrito de volta em `messages` ou confirmado em um checkpoint — e, nesse ponto, “esta ferramenta rodou ou não” é uma pergunta que o `checkpoint.json` sozinho não consegue responder. Para uma ferramenta somente leitura como `read_file`, não saber não custa nada; leia uma vez a mais e o resultado é o mesmo. Para `send_email`, `create_ticket` ou uma transferência de fundos, não saber é um incidente: reexecutar significa que o destinatário pode receber dois e-mails idênticos e um chamado duplicado pode aparecer no sistema do nada.

Isso não é um problema novo. Antes neste curso estabelecemos que agentes têm estado e que os erros se acumulam[^S1] — e executar um efeito colateral duas vezes quando ele deveria acontecer uma é uma forma concreta que esse acúmulo assume. O erro não para em “rodamos uma vez a mais”; ele rola ladeira abaixo em cima daquele efeito colateral extra. Esta lição fecha a lacuna que a Lição 3 deixou aberta: apresentar a **idempotência** como conceito e depois parafusar um **livro-razão de efeitos** no loop de retomada, para que “não dá para concluir” vire “dá para concluir”.

## O que idempotente significa: uma execução ou dez, mesmo efeito

**Idempotente** designa uma operação que produz o mesmo efeito final quer você a rode uma vez, quer a rode muitas. Repare que isso diz respeito ao *efeito* — o estado final que a operação deixa no mundo externo (arquivos, bancos de dados, caixas de entrada) —, não ao valor literal que cada chamada retorna.

Para julgar se uma ferramenta é idempotente, uma pergunta basta: “Se esta operação rodasse silenciosamente uma vez a mais, o mundo externo terminaria com alguma coisa a mais, ou em um estado diferente?” Passe estes pequenos exemplos por essa pergunta e a diferença aparece na hora.

```javascript
// Idempotente: ler um arquivo não tem efeito colateral — chame quantas vezes quiser,
// o que está no disco é o mesmo
async function readFileContent(path) {
  return fs.readFile(path, "utf8");
}

// Não idempotente: cada chamada de fato acrescenta mais uma linha ao array
function appendRow(sheet, row) {
  sheet.rows.push(row);
}

// Idempotente: não importa quantas chamadas, a linha 42 converge para o mesmo valor
function setLine(doc, lineNo, text) {
  doc.lines[lineNo] = text;
}

// Não idempotente: cada chamada de fato acrescenta mais uma mensagem à caixa de entrada do destinatário
async function sendEmail(to, subject, body) {
  return mailer.send({ to, subject, body });
}
```

`readFileContent` é idempotente por natureza porque não tem efeito colateral nenhum — não há nada “deixado para trás” de que se possa falar. `setLine` também é idempotente e de fato muda estado, mas o jeito como muda é por **sobrescrita**: chame uma vez e a linha 42 é X, chame dez vezes e a linha 42 continua sendo X. O estado final não varia com a contagem de chamadas. `appendRow` e `sendEmail` não são idempotentes, pelo mesmo motivo nos dois casos: o efeito deles é **cumulativo** — cada chamada de fato acrescenta mais uma coisa ao mundo externo, então a contagem de chamadas aparece diretamente no estado final.

Guarde essa linha divisória: escritas por sobrescrita costumam ser idempotentes, escritas por acréscimo costumam não ser; leituras e operações do tipo “confira primeiro, depois decida se age” costumam ser idempotentes, enquanto inserções incondicionais simples costumam não ser. O livro-razão de efeitos da próxima seção existe justamente para pegar as operações que não são idempotentes e que não dá para redesenhar até deixarem de ser.

## O livro-razão de efeitos: anotar quais efeitos colaterais já aconteceram

A Lição 2 ensinou você a guardar a cena corrente do loop — `messages`, os contadores, a chamada de ferramenta ainda não gravada no livro-razão — em um checkpoint, para que uma queda possa ser retomada no mesmo lugar. Mas um checkpoint responde “a que etapa do loop chegamos”, não “o efeito colateral daquela etapa de fato aconteceu”. Durante a operação normal os dois andam quase em sincronia, mas no instante em que uma queda cai na fresta entre eles, eles discordam — que é exatamente por que a Lição 3 teve de deixar sem solução a reconciliação de alto impacto.

Fechar essa lacuna exige um **livro-razão de efeitos**: anotar quais efeitos colaterais já aconteceram, em disco, separado do checkpoint. A estrutura é simples — um mapa indexado por `tool_use_id`:

```javascript
// O formato do effects.json
{
  "toolu_01abc": {
    "name": "create_ticket",
    "result": { "id": "T-1", "title": "Relato de indisponibilidade do cliente" },
    "at": "2026-08-26T09:12:03.000Z"
  }
}
```

O momento da gravação no livro-razão importa muitíssimo: escreva no instante em que a função da ferramenta de fato tem sucesso e retorna um resultado, e escreva um tempo *antes* do checkpoint do “ponto B” da Lição 2 (a escrita de rotina que acontece depois que o resultado da ferramenta cai em `messages`). O motivo é direto. Se a queda cair dentro da janela estreita entre “a ferramenta teve sucesso” e “o checkpoint do ponto B terminou de escrever”, o checkpoint do ponto B nunca teve a chance de registrar que isso aconteceu, e na retomada a única coisa capaz de lhe contar a verdade é o livro-razão que terminou de escrever antes. A gravação no livro-razão, ela própria, também tem de ser atômica — `.tmp` + `rename`, como nas Lições 2 e 3 —, pelo mesmo motivo — um arquivo de livro-razão escrito pela metade é mais perigoso do que livro-razão nenhum, porque faz você acreditar em um efeito colateral que nunca chegou a se completar.

```javascript
import { promises as fs } from "node:fs";

async function loadEffects(path) {
  try {
    return JSON.parse(await fs.readFile(path, "utf8"));
  } catch {
    return {}; // Arquivo ausente ou corrompido: trate como livro-razão vazio, não bloqueie a retomada
  }
}

async function saveEffects(path, effects) {
  const tmp = `${path}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(effects, null, 2));
  await fs.rename(tmp, path); // Troca atômica, nenhum arquivo escrito pela metade fica para trás
}
```

Com um livro-razão em mãos, a regra de reconciliação na retomada sobe do “não dá para concluir” da Lição 3 para “dá para concluir”. Pegue o `pendingToolUse` do `checkpoint.json` e procure o `id` dele no livro-razão. **Acerto**: o efeito colateral realmente aconteceu, então tire o `result` guardado do livro-razão, use-o para preencher um `tool_result` e nunca mais execute. **Falha**: esta chamada ou nunca começou, ou morreu no meio do caminho sem ter sucesso, então executar é seguro. A regra vale para toda ferramenta; acontece apenas que, para ferramentas idempotentes, a consulta dá no mesmo de qualquer jeito. O que de fato depende dela são as operações que causam dano quando se repetem.

Há aqui uma percepção que merece ser dita à parte: **o `tool_use_id` já é uma chave de idempotência.** Toda vez que o modelo nomeia uma ferramenta, ele carrega "A unique identifier for this particular tool use block"[^S4] (um identificador único para este bloco de uso de ferramenta em particular) — essa é a definição literal do campo `id` na especificação oficial. Se essa mesma nomeação for vista uma segunda vez por causa de uma repetição na retomada, o `id` não muda. É precisamente isso que permite ao livro-razão reconhecer “esta chamada” e “aquela chamada anterior” como um único e mesmo evento, sem que você tenha de inventar um esquema de desduplicação próprio.

```agentmentor-check
{
  "id": "sp-zh-04-blind-retry",
  "label": "Uma chamada send_email órfã — o modelo se corrige sozinho depois de uma reexecução?",
  "prompt": "Na retomada, seu harness encontra uma chamada send_email órfã no checkpoint.json — a queda caiu logo depois de o e-mail sair e antes de o resultado ser escrito no livro-razão. Um colega diz: “É só reexecutar às cegas. O modelo vai ver o resultado voltar e se corrigir sozinho.” Isso se sustenta?",
  "whyHere": "Você acabou de aprender a regra de reconciliação do livro-razão. Isto verifica se você de fato entendeu que “reexecutar” e “o modelo se corrigir sozinho” são duas coisas diferentes — que é a razão de o livro-razão existir, em vez de ser uma etapa extra opcional que dá para pular.",
  "mode": "single",
  "choices": [
    {
      "id": "a",
      "text": "Sustenta-se: assim que o modelo vir o resultado “e-mail enviado” voltar e notar que ele não bate com o que lembra ter feito, vai sinalizar a duplicata e cuidar dela",
      "correct": false,
      "feedback": "Não exatamente. Tudo o que o modelo consegue ver é o que voltou neste único tool_result. Ele não tem canal independente para perceber se este e-mail já foi enviado uma vez antes, nem meio de alcançar a caixa de entrada do destinatário e puxar a segunda cópia de volta. Efeitos colaterais acontecem no mundo externo, e a saída do modelo não muda o que já aconteceu lá — o máximo que ele consegue é pedir desculpas na frase seguinte. Dois e-mails saíram assim mesmo."
    },
    {
      "id": "b",
      "text": "Não se sustenta, mas a correção certa é o harness pular toda chamada de ferramenta órfã na retomada e entregar cada uma a uma pessoa para resolver",
      "correct": false,
      "feedback": "Isso é o inverso. Pular tudo trata todas as ferramentas como perigosas, quando a maioria das chamadas órfãs ou é somente leitura (risco zero em reexecutar) ou de fato nunca teve sucesso (reexecutar é a única jogada correta). Degrada a retomada para “toda queda precisa de uma pessoa”, jogando fora todo o sentido de continuar automaticamente — resolvendo por evitação em bloco um problema que a evidência deveria resolver."
    },
    {
      "id": "c",
      "text": "Não se sustenta: o modelo só vê o resultado devolvido por esta chamada e não consegue perceber a duplicata que já caiu no mundo externo; o harness tem de consultar o livro-razão de efeitos por tool_use_id antes de executar",
      "correct": true,
      "feedback": "Correto. O mundo do modelo são os tool_results que ele vê, e ele não tem outros olhos com que enxergar quantas mensagens estão na caixa de entrada do destinatário agora. A única coisa capaz de ver isso — e a única capaz de barrar a duplicata — é o harness: antes de de fato chamar a ferramenta, procurar o tool_use_id desta chamada no livro-razão de efeitos. Em um acerto, reusar o resultado guardado e nunca reexecutar; só em uma falha executar é seguro. Essa válvula não se apoia no julgamento do modelo; apoia-se na evidência definitiva que o livro-razão deixou em disco."
    }
  ]
}
```

## Duas válvulas em camadas: a aprovação pergunta “devemos?”, o livro-razão pergunta “já fizemos?”

O Curso 7 desta série, "Agent Harness Fundamentals: Loops and Control", equipou o `runToolUses` com uma válvula de aprovação: antes de uma ferramenta de alto impacto de fato rodar, imprima o que está prestes a acontecer, espere uma pessoa confirmar e só então deixe passar[^S3]. Essa válvula barra a pergunta “isto deve ser feito”. O livro-razão de efeitos desta lição barra outra pergunta: “isto já foi feito”. As duas válvulas perguntam coisas diferentes, mas ficam no mesmo lugar — ambas encaixadas no momento depois de o modelo ter nomeado uma ferramenta e antes de a ferramenta ter de fato rodado. Nenhuma das duas deixa a função da ferramenta executar antes de ter sido verificada.

Empilhe as duas e o `runToolUses` fica assim:

```javascript
const HIGH_IMPACT = new Set(["send_email", "create_ticket", "delete_file"]);

async function runToolUses(content, toolImpls, opts = {}) {
  const toolUseBlocks = content.filter((b) => b.type === "tool_use");
  const effects = await loadEffects(opts.effectsPath);
  const results = [];

  for (const block of toolUseBlocks) {
    // Válvula de idempotência: esta chamada já aconteceu de fato?
    const recorded = effects[block.id];
    if (recorded) {
      results.push({ type: "tool_result", tool_use_id: block.id, content: recorded.result });
      continue; // Acerto no livro-razão: reusa o resultado guardado, nunca reexecuta
    }

    // Válvula de aprovação: operações de alto impacto são confirmadas antes da execução (Curso 7)
    if (HIGH_IMPACT.has(block.name)) {
      const ok = await opts.approve?.(block.name, block.input);
      if (!ok) {
        results.push({
          type: "tool_result", tool_use_id: block.id,
          content: "O usuário recusou esta operação de alto impacto; ela não foi executada.", is_error: true,
        });
        continue; // Pula a execução, mas ainda devolve um tool_result para a chamada não ficar órfã
      }
    }

    let output;
    try {
      output = await toolImpls[block.name](block.input);
    } catch (err) {
      // A própria ferramenta falhou: nenhum efeito colateral aconteceu, então reporte is_error honestamente
      results.push({
        type: "tool_result", tool_use_id: block.id,
        content: `Falha na execução da ferramenta: ${err.message}`, is_error: true,
      });
      continue;
    }

    // Se chegamos aqui, o efeito colateral realmente aconteceu. Mesmo que a gravação no livro-razão
    // abaixo falhe, jamais podemos reportá-lo erroneamente como falha de execução — assim que
    // devolvemos is_error, o modelo assume que isto nunca rodou, tenta de novo com um tool_use_id
    // novo, e o livro-razão não consegue mais reconhecê-lo como a mesma chamada. É assim que um
    // efeito colateral duplicado passa despercebido.
    effects[block.id] = { name: block.name, result: output, at: new Date().toISOString() };
    try {
      await saveEffects(opts.effectsPath, effects); // Escreva na hora, ao ter sucesso, não em lote
    } catch (err) {
      // Uma escrita falha é problema de operação, não de ferramenta: devolva o resultado real ao
      // modelo e levante um alerta separado
      console.error(
        `[falha ao gravar no livro-razão] tool_use_id=${block.id} name=${block.name}: ` +
        `o efeito colateral aconteceu mas não foi registrado; a retomada corre o risco de reexecutá-lo. Precisa de revisão manual. Causa: ${err.message}`,
      );
    }
    results.push({ type: "tool_result", tool_use_id: block.id, content: output });
  }
  return results;
}
```

A ordem não é negociável: a válvula de idempotência tem de vir primeiro. O motivo é evidente — se esta chamada já está no livro-razão, perguntar “devemos fazer isto” depois não significa nada, porque já está feito, e perguntar de novo só confunde quem responde: o sistema claramente concluiu isto, então por que está me pedindo para confirmar? Para uma chamada órfã na retomada, a primeira pergunta é sempre “isto aconteceu” e só depois de resolvida essa é que “isto deve acontecer” tem a sua vez.

## Idempotência na camada de projeto da ferramenta: corrija a causa, não fique só aparando as consequências

O livro-razão de efeitos é uma rede de proteção do lado do harness — tenha a ferramenta em si sido projetada para ser idempotente ou não, o livro-razão consegue barrar uma execução duplicada usando o `tool_use_id`. Mas uma rede de proteção continua sendo uma rede de proteção, e o investimento melhor é corrigir a causa: onde você puder mudar a ferramenta, projete-a para ser idempotente por natureza, para que o livro-razão nunca precise entrar em cena.

A versão mais comum dessa mudança é transformar “criar” em “garantir que existe”:

```javascript
// Corrigindo a causa: idempotente por natureza — confira primeiro, devolva o que existe, não crie de novo
async function ensureTicket(input) {
  const existing = await findTicketByTitle(input.title);
  if (existing) return existing;
  return createTicketRecord(input);
}
```

Chame `ensureTicket` uma vez ou dez e o sistema termina com exatamente um chamado correspondente àquele título — o estado final não varia com a contagem de chamadas, que é a definição de idempotente. O mesmo raciocínio vale para escrever arquivos: um `write_file` de arquivo inteiro é idempotente por natureza, e chamadas repetidas deixam para trás o mesmo conteúdo; um `append_file` de acréscimo não é, e o arquivo cresce uma seção por chamada. Quando você puder escolher sobrescrever, não escolha acrescentar.

Corrigir a causa e aparar as consequências não são uma escolha entre duas opções — são uma divisão de trabalho. Ferramentas que você consegue projetar para serem idempotentes deveriam ser resolvidas na camada da ferramenta, poupando toda chamada de um desvio pelo livro-razão. E para operações que genuinamente não podem ser “desduplicadas e fundidas” como questão de regra de negócio — duas transferências que realmente aconteceram em momentos diferentes, digamos, que devem ser reconhecidas como dois eventos distintos e não podem ser colapsadas em um por engenhosidade de projeto —, o livro-razão é a única rede de proteção que existe.

## Voltando ao ponto de partida: mais uma proteção, e saber quando ela vale a pena

Este curso partiu do ponto de que a confiabilidade vem de emparelhar a adaptabilidade do modelo com salvaguardas determinísticas, como lógica de retentativa e checkpoints regulares[^S1]. O livro-razão de efeitos é uma dessas proteções. Ele não pede ao modelo que julgue “já fiz isto” — isso sempre esteve além do que o modelo consegue perceber. Ele faz o harness emitir esse julgamento em nome do modelo, usando evidência definitiva escrita em disco.

Mantenha também um senso de proporção. Se toda ferramenta que seu agente tem em mãos for somente leitura, o livro-razão desta lição provavelmente não vai justificar o seu lugar — um livro-razão de efeitos é, ele próprio, uma camada de complexidade, e o que torna sua adição válida é ele barrar de fato um risco real de efeitos colaterais duplicados; acrescente complexidade apenas quando isso comprovadamente melhorar os resultados[^S3]. O teste é o mesmo da lição anterior: olhe primeiro para o seu conjunto de ferramentas em busca de operações não idempotentes e de alto impacto. Se elas estiverem lá, vale instalar a válvula. Se não estiverem, não corra para escrevê-la.

<!-- exercises -->
## 💻 Exercícios

### Nível 1: Classifique seis ferramentas quanto a idempotência e risco de reexecução

Para cada uma das seis ferramentas abaixo, decida: (1) ela é idempotente; (2) se uma chamada órfã a ela for reexecutada na retomada, o risco é alto, médio ou baixo — e por quê.

- `read_file(path)` — lê o conteúdo de um arquivo
- `send_email(to, subject, body)` — envia um e-mail
- `ensure_ticket(title, body)` — procura pelo título, devolve o chamado existente se houver um, cria um novo só se não houver
- `append_log(line)` — acrescenta uma linha ao fim de um arquivo de log
- `set_config(key, value)` — define uma chave de configuração com um valor dado (por sobrescrita)
- `delete_file(path)` — apaga um arquivo

<!-- rubric -->
- Os seis julgamentos de idempotência corretos (idempotentes: read_file, ensure_ticket, set_config, delete_file; não idempotentes: send_email, append_log)
- Níveis de risco razoáveis e acompanhados de um motivo, não de um rótulo solto (alto/médio/baixo tem de estar sustentado por um “porquê”)
- Menção a pelo menos um caso em que a idempotência depende do cuidado com que a ferramenta foi implementada (a lógica de busca do ensure_ticket, ou como o delete_file trata “arquivo não encontrado”)

<!-- answer -->
`read_file` é idempotente, não tem efeito colateral por natureza, e reexecutar carrega risco zero (baixo). `send_email` não é idempotente — cada chamada de fato coloca mais uma mensagem na caixa de entrada do destinatário —, então reexecutar uma chamada órfã na retomada causa um envio duplicado. O risco é alto e só é seguro repetir depois de consultar o livro-razão. `ensure_ticket` é idempotente por projeto: quando um chamado com o mesmo título já existe, ele pula a criação, então o estado final do sistema não varia com a contagem de chamadas. Mas essa idempotência se apoia em a lógica de “procurar pelo título” ser sólida — se o título carregar algo que difere a cada vez, como um carimbo de tempo, a busca deixa de casar e a idempotência é idempotente só no nome. Considere o risco baixo a médio e sustente-o com o livro-razão de qualquer forma. `append_log` não é idempotente — cada chamada de fato acrescenta uma linha —, então uma reexecução na retomada deixa entradas duplicadas no log. O risco é médio: não é um incidente de negócio como um e-mail duplicado, mas polui o log e pode desregular lógica a jusante que conta linhas ou casa conteúdo. `set_config` é idempotente, uma escrita por sobrescrita; definir a mesma chave com o mesmo valor produz o mesmo estado final por mais vezes que você chame, então o risco é baixo e reexecutar não tem problema. `delete_file` é idempotente — apagar um arquivo que já sumiu deixa o mesmo estado final que o arquivo simplesmente não existir —, então o risco é baixo. Mas fique de olho no detalhe de implementação: se `delete_file` lançar erro em um arquivo ausente e o chamador tratar isso como falha de execução, uma reexecução é lida erroneamente como uma falha nova. “Arquivo não encontrado” deveria ser tratado como sucesso no sentido idempotente.

<!-- hint -->
Deixe o risco de lado por um momento e separe as seis em dois grupos: efeitos que sobrescrevem e efeitos que se acumulam. Essa linha divisória está no corpo da lição e, uma vez que o agrupamento esteja certo, os julgamentos de idempotência em geral se resolvem sozinhos.

<!-- hint -->
Nível de risco não é uma cópia direta de “idempotente significa baixo, não idempotente significa alto” — pense em se a consequência de `append_log` ou de `send_email` é mais séria, depois pense em que premissa a idempotência do `ensure_ticket` se apoia e no que acontece quando essa premissa falha.

### Nível 2: Acrescente um livro-razão de efeitos a um runToolUses que não tem nenhum

Semana passada, seu harness estava trabalhando na tarefa “cliente relata uma indisponibilidade, abra um chamado”. Ele rodou `create_ticket`, obteve um resultado de sucesso — e o contêiner acabou sendo reiniciado e morto bem nessa hora, antes de o resultado voltar para um `tool_result`. Depois que o processo voltou, o harness leu o `pendingToolUse` do `checkpoint.json` e encontrou exatamente aquela chamada `create_ticket`. Com o `runToolUses` sem livro-razão abaixo, a única opção dele era reexecutar — então um relato de indisponibilidade de um cliente virou um chamado duplicado no sistema, do nada.

```javascript
// A cena do acidente: este runToolUses não tem livro-razão de efeitos
async function runToolUses(content, toolImpls) {
  const toolUseBlocks = content.filter((b) => b.type === "tool_use");
  const results = [];
  for (const block of toolUseBlocks) {
    const output = await toolImpls[block.name](block.input);
    results.push({ type: "tool_result", tool_use_id: block.id, content: output });
  }
  return results;
}
```

Sua tarefa: (1) escrever as funções de leitura e escrita `loadEffects`/`saveEffects` para o `effects.json`, usando uma gravação atômica (`.tmp` primeiro, depois `rename`); (2) reescrever o `runToolUses` para acrescentar a lógica “consulte o livro-razão antes de executar, execute só em uma falha, registre no livro-razão no instante em que a execução tiver sucesso”; (3) escrever um script Node que prove isso: chame o seu `runToolUses` reescrito duas vezes com o mesmo `tool_use_id` (simulando uma repetição na retomada) e mostre que a segunda chamada não roda de novo a implementação real do `create_ticket`.

<!-- rubric -->
- `loadEffects`/`saveEffects` usam a gravação atômica com `.tmp` + `rename` em vez de escrever direto no arquivo alvo; `loadEffects` trata um arquivo ausente (devolve um objeto vazio) para que a própria retomada não quebre
- O `runToolUses` reescrito consulta o livro-razão por `block.id` antes de executar e, em um acerto, reusa o `result` guardado sem chamar `toolImpls`; escreve no livro-razão só depois de a execução de fato ter sucesso, e escreve o resultado real desta chamada, não um marcador
- O script de verificação usa um `create_ticket` falso que conta chamadas, provando que “a segunda chamada com o mesmo tool_use_id não incrementa o contador” — evidência concreta de que a consulta ao livro-razão impediu a execução, não apenas de que nada lançou erro

<!-- answer -->
```javascript
import { promises as fs } from "node:fs";

async function loadEffects(path) {
  try {
    return JSON.parse(await fs.readFile(path, "utf8"));
  } catch {
    return {};
  }
}

async function saveEffects(path, effects) {
  const tmp = `${path}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(effects, null, 2));
  await fs.rename(tmp, path);
}

async function runToolUses(content, toolImpls, opts) {
  const toolUseBlocks = content.filter((b) => b.type === "tool_use");
  const effects = await loadEffects(opts.effectsPath);
  const results = [];
  for (const block of toolUseBlocks) {
    const recorded = effects[block.id];
    if (recorded) {
      results.push({ type: "tool_result", tool_use_id: block.id, content: recorded.result });
      continue;
    }
    const output = await toolImpls[block.name](block.input);
    effects[block.id] = { name: block.name, result: output, at: new Date().toISOString() };
    await saveEffects(opts.effectsPath, effects);
    results.push({ type: "tool_result", tool_use_id: block.id, content: output });
  }
  return results;
}

// Verificação: em uma repetição com o mesmo tool_use_id, a segunda passada não abre um chamado
let calls = 0;
async function createTicket(input) {
  calls += 1;
  return { id: "T-1", title: input.title };
}

const block = {
  type: "tool_use",
  id: "toolu_01abc",
  name: "create_ticket",
  input: { title: "Relato de indisponibilidade do cliente" },
};
const effectsPath = "./effects.json";

await runToolUses([block], { create_ticket: createTicket }, { effectsPath });
console.assert(calls === 1, "a primeira chamada deveria de fato executar");

// Simula a retomada: o mesmo tool_use_id aparece de novo em pendingToolUse
await runToolUses([block], { create_ticket: createTicket }, { effectsPath });
console.assert(calls === 1, "a segunda chamada acerta o livro-razão e não deveria executar");

console.log("calls =", calls); // imprime calls = 1, provando que a repetição não abriu um segundo chamado
```

Este código foi rodado sob Node para verificá-lo: na primeira chamada a `runToolUses` o livro-razão está vazio, `create_ticket` de fato executa uma vez, `calls` vira 1, e o arquivo do livro-razão registra o resultado daquela chamada. A segunda chamada simula uma repetição na retomada com o mesmo `tool_use_id`; `runToolUses` encontra esse id no livro-razão, joga o `result` guardado direto em um `tool_result`, e `toolImpls.create_ticket` nunca mais é chamado — `calls` continua 1. É exatamente isso que o livro-razão de efeitos existe para provar: uma repetição na retomada não faz um efeito colateral já concluído acontecer uma segunda vez.

<!-- hint -->
Se o livro-razão vai ser escrito depende de a ferramenta ter de fato tido sucesso, não de o loop `for` ter chegado a este ponto — `saveEffects` tem de ficar **depois** da chamada a `toolImpls[...]` e **depois** de você ter o resultado.

<!-- hint -->
O ponto da verificação não é “a segunda chamada não lançou erro”, é “a segunda chamada não rodou de novo a implementação real do `create_ticket`”. Uma implementação falsa que conta chamadas, comparada antes e depois, é a única evidência crível.

<!-- /exercises -->

## Recapitulação

- A retomada entrega semântica de execução at-least-once: o processo pode morrer depois que uma ferramenta de fato teve sucesso, mas antes de o resultado ser escrito no livro-razão, e o checkpoint sozinho não consegue dizer se aquela chamada órfã rodou. Essa é a raiz do porquê de a Lição 3 ter tido de deixar sem solução a reconciliação de alto impacto.
- A definição de idempotente: uma operação que produz o mesmo efeito final quer rode uma vez, quer rode muitas. Escritas por sobrescrita (`set_config`, `write_file`) costumam ser idempotentes; escritas por acréscimo (`append_log`, `send_email`) costumam não ser.
- O livro-razão de efeitos registra quais efeitos colaterais já aconteceram, em disco, indexados por `tool_use_id` — o identificador único que o modelo carrega ao nomear uma ferramenta[^S4], que não muda quando a mesma nomeação é repetida na retomada, o que faz dele uma chave de idempotência por natureza. Escreva-o com a gravação atômica `.tmp` + `rename`, no instante em que a ferramenta tiver sucesso.
- A regra de reconciliação na retomada sobe para: se `pendingToolUse.id` acertar no livro-razão, reuse o resultado guardado e nunca reexecute; se falhar, execute com segurança.
- A válvula de aprovação pergunta “isto deve ser feito”, o livro-razão de efeitos pergunta “isto já foi feito”. Elas se complementam, ambas ficam diante da execução de fato, e a válvula de idempotência vem primeiro.
- Corrigir a causa é melhor do que aparar as consequências: projete ferramentas para serem idempotentes por natureza (“garantir que existe” em vez de “criar”, sobrescrever em vez de acrescentar) e você não vai precisar do livro-razão para tudo. A confiabilidade vem da adaptabilidade do modelo emparelhada com salvaguardas determinísticas[^S1] — mas uma salvaguarda também é complexidade, e ela só deveria ser acrescentada quando comprovadamente melhorar os resultados[^S3].

[>> Lição 5: Rebobinar e bifurcar: o segundo valor dos checkpoints](./05-rewind-and-fork.md)
