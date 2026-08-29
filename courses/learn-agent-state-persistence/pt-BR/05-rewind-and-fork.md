# Lição 5: Rebobinar e bifurcar: o segundo valor dos checkpoints

> Objetivos de aprendizado:
> - Explicar os dois usos proativos dos checkpoints para além da recuperação de desastre — rebobinar até uma cena anterior para tentar de novo e bifurcar uma segunda linha do tempo para explorar — e ver que ambos se apoiam na mesma sequência de checkpoints em que a retomada se apoia
> - Transformar o checkpoint de “guardar só o mais recente” em uma sequência retida por turno, implementar `rewindTo(turn)` e explicar que a rebobinagem reverte a cena da decisão, não os efeitos colaterais externos que já aconteceram
> - Implementar `forkFrom(turn, branchName)` para copiar uma linha do tempo independente a partir da mesma cena, e traçar as linhas divisórias entre o que cabe aos checkpoints, ao Git e ao livro-razão de efeitos
>
> Pré-requisitos: você concluiu as Lições 1-4 e conhece o layout de campos do `checkpoint.json` (`version`, `task`, `turns`, `tokensUsed`, `messages`, `pendingToolUse`), além das gravações atômicas, de como a retomada reconcilia uma chamada órfã e do livro-razão de efeitos e das chaves de idempotência da Lição 4 | Anterior: [Lição 4 <<](./04-side-effects-idempotency.md) | Próxima: [Lição 6 >>](./06-build-checkpointing.md)

## Checkpoints não são só um fusível

As primeiras lições trataram os checkpoints como seguro contra desastre — o processo cai e você retoma o loop a partir do checkpoint mais recente. Nada de errado em usá-los assim, mas se a única hora em que você recorre a eles for depois de uma queda, eles ficam ociosos a maior parte do tempo. Não houve queda, então o estado que você salvou foi desperdiçado?

Não foi. Um encadeamento de checkpoints acumulados é, na verdade, uma linha do tempo da tarefa — o que ela estava pensando a cada turno, o que estava prestes a fazer, quais efeitos já tinha consumado, tudo deixado como rastro. Para além da recuperação de desastre, essa linha do tempo sustenta mais dois usos proativos: rebobinar até um turno anterior para começar de novo, e bifurcar a partir de um turno para rodar uma segunda rota em paralelo à primeira. Um roteiro comunitário organizado em torno da engenharia de harness resume o componente de persistência amarrando exatamente esses três: fazer checkpoint do estado em cada nó para que você possa retomar, rebobinar, bifurcar[^S5]. Essa é uma afirmação de enquadramento do roteiro — ela não prescreve uma implementação —, mas aponta para uma coisa: a retomada é apenas um terço daquilo para que os checkpoints servem, e os outros dois são o assunto desta lição.

- **Rebobinagem**: a tarefa não caiu, mas saiu do rumo. Reverta a cena da decisão para um turno anterior ao ponto em que ela deu errado e comece de novo.
- **Bifurcação**: você não tem certeza de qual rota é melhor, então copia duas linhas do tempo independentes a partir da mesma cena, roda cada uma e escolhe o resultado.

Nenhuma das duas é “faxina depois de um desastre” — ambas podem aparecer com a tarefa correndo perfeitamente bem.

## Rebobinagem: reverter a cena da decisão, não o mundo externo

Imagine uma tarefa que roda uns 20 turnos de chamadas de ferramenta. No turno 15, o modelo toma uma decisão ruim — escolhe o arquivo errado para editar, ou faz uma suposição equivocada sobre um requisito vago. Pelos 10 turnos seguintes, ele segue construindo em cima daquele erro. O Curso 8 desta série, “Context Engineering: gastando a atenção finita onde ela conta”, mostrou que, conforme o contexto se acumula mais longo e mais bagunçado, a capacidade do modelo de recuperar informação dali com precisão despenca — e este trecho de histórico carrega uma decisão errada por cima disso. Em vez de deixar o modelo continuar se debatendo dentro de um contexto longo e fora do rumo, reverta a cena para o turno 14, o ponto anterior à decisão ruim, e comece de novo dali.

Para fazer isso, um checkpoint não pode mais ser “só o mais recente”. O `saveCheckpoint` das lições anteriores sobrescrevia o mesmo `checkpoint.json` toda vez, então na recuperação você só conseguia obter o último estado escrito — suficiente para recuperação de desastre, mas inútil para rebobinar, porque a cena do turno 14 havia sido sobrescrita pelo turno 15 muito antes. Para sustentar a rebobinagem, os checkpoints têm de ser retidos como uma sequência por turno, com o número do turno e o ponto de gravação no nome do arquivo: `checkpoints/turn-014-A.json`, `checkpoints/turn-014-B.json` e assim por diante. Dentro de cada turno, o ponto de gravação A cai quando o modelo propôs seu plano mas a ferramenta ainda não rodou; o ponto de gravação B cai quando o resultado da ferramenta daquele turno é escrito de volta em `messages` e o turno de fato terminou. Por padrão, “volte ao turno N” significa a cena depois que aquele turno terminou — ou seja, o último ponto de gravação escrito naquele turno:

```javascript
import fs from "node:fs/promises";
import path from "node:path";

function turnFileName(turn, point) {
  return `turn-${String(turn).padStart(3, "0")}-${point}.json`;
}

// Pega o último ponto de gravação escrito em um turno: A e B ordenam lexicograficamente, B depois de A,
// o que bate exatamente com a ordem "antes da execução da ferramenta" -> "depois de registrado o resultado"
async function pickLatestPoint(turn, dir) {
  const files = await fs.readdir(dir);
  const prefix = `turn-${String(turn).padStart(3, "0")}-`;
  const points = files
    .filter((f) => f.startsWith(prefix))
    .map((f) => f.slice(prefix.length, prefix.length + 1))
    .sort();
  if (points.length === 0) throw new Error(`No checkpoint for turn ${turn}`);
  return points[points.length - 1];
}

async function rewindTo(turn, { point, dir = "checkpoints" } = {}) {
  const wanted = point ?? (await pickLatestPoint(turn, dir));
  const raw = await fs.readFile(path.join(dir, turnFileName(turn, wanted)), "utf8");
  return JSON.parse(raw); // { version, task, turns, tokensUsed, messages, pendingToolUse }
}
```

Com a cena que `rewindTo(14)` devolve, o que vem em seguida é o mesmo fluxo da retomada: use este `messages` para reconstruir o histórico e continue o loop a partir desta contagem de `turns`. A única diferença é que desta vez o modelo encara uma cena limpa, anterior à decisão tomada, e não o contexto que o turno 15 poluiu.

Mas uma coisa merece ser dita em voz alta: a rebobinagem reverte a **cena da decisão**, não o **mundo externo**. Se a decisão ruim do turno 16 já chamou uma ferramenta de alto impacto — enviou de fato um e-mail, digamos —, rebobinar para o turno 14 não traz aquele e-mail de volta. Um checkpoint guarda `messages`, `turns`, `pendingToolUse` e quaisquer outros campos de estado que você tenha definido no instantâneo; ele nunca foi feito para desfazer uma ação externa que já caiu, e não consegue fazê-lo. O livro-razão de efeitos da Lição 4 (`effects.json`) segue cumprindo sua regra de somente acréscimo: depois de você rebobinar e reexecutar a partir do turno 15, mesmo que o modelo escolha desta vez uma ação completamente diferente, o livro-razão apenas ganha um registro novo — ele não apaga o antigo. O que quer que tenha acontecido nos dez turnos descartados continua deixando seu rastro no livro-razão, que é exatamente a visão de idempotência da Lição 4 levada para o cenário da rebobinagem.

## Bifurcação: rodar duas linhas do tempo a partir de uma cena

A rebobinagem resolve “esta rota estava errada, volte e refaça”. Mas às vezes a pergunta não é “estava errada”, é “não tenho certeza de qual é melhor” — dois planos de refatoração ambos fazem sentido, e você quer rodar cada um e comparar antes de escolher. Nesse caso, não escolha um destrutivamente; copie duas linhas do tempo independentes a partir do mesmo checkpoint e rode cada uma:

```javascript
async function forkFrom(turn, branchName, { point, baseDir = "checkpoints" } = {}) {
  const startPoint = point ?? (await pickLatestPoint(turn, baseDir));
  const state = await rewindTo(turn, { point: startPoint, dir: baseDir });

  const branchDir = `${baseDir}-${branchName}`;
  await fs.mkdir(branchDir, { recursive: true });
  await fs.writeFile(
    path.join(branchDir, turnFileName(turn, startPoint)),
    JSON.stringify(state, null, 2)
  );

  // Livro-razão de efeitos independente: esta linha do tempo roda por conta própria, cada uma
  // registra os seus efeitos, e ela não herda os registros da linha principal
  await fs.writeFile(path.join(branchDir, "effects.json"), "[]\n");
  return branchDir;
}
```

Depois de `forkFrom(14, "plan-b")`, `checkpoints-plan-b/` tem a própria sequência de checkpoints e um livro-razão de efeitos em branco. Do turno 14 em diante, para onde esta linha do tempo vai, quantos turnos ela roda, quantos checkpoints ela deixa — nada disso interfere na linha principal.

O fato de as duas linhas do tempo bifurcadas serem independentes é um alerta para ferramentas de alto impacto: se ambas as linhas fossem chamar a mesma ação genuinamente externa — ambas precisam enviar o mesmo e-mail, digamos —, deixar cada uma correr até o fim sem aprovação significa que cada linha o envia uma vez, o que vira um efeito colateral dobrado. Ligar uma válvula de aprovação em ferramentas assim, ou passar para um modo de dry-run durante a bifurcação, vale a pena antes de bifurcar. É o mesmo raciocínio do livro-razão não ser revertido na rebobinagem: um checkpoint pode ser copiado em dois, mas um efeito externo que já caiu não pode ser copiado em “um por mundo paralelo”.

## Comparação com produto: o Claude Code entregou isto como funcionalidade

A rebobinagem e a bifurcação acima são algo que o Claude Code já entrega como funcionalidade de nível de produto — isto é só para comparação, não a ferramenta que está sendo ensinada. O mecanismo de checkpointing dele captura automaticamente o estado do seu código antes de cada prompt do usuário[^S2]: cada prompt do usuário cria um novo checkpoint[^S2], e o Claude Code salva os checkpoints junto com a conversa, de modo que você ainda pode rodar `/rewind` depois de retomar uma sessão[^S2].

O menu `/rewind` dele divide “o que restaurar” em três opções: "Restore conversation: rewind to that message while keeping current code", "Restore code: revert file changes while keeping the conversation", ou "Restore code and conversation: revert both code and conversation to that point"[^S2] (na ordem: rebobinar a conversa até aquela mensagem mantendo o código atual; reverter as mudanças de arquivo mantendo a conversa; reverter código e conversa até aquele ponto) — que é justamente a versão produtizada da frase desta lição, “a rebobinagem reverte a cena da decisão”. Você pode escolher reverter só a cena da decisão (a conversa), ou reverter o código junto. A documentação oficial também lista alguns casos de uso comuns do checkpointing, como "Exploring alternatives: try different implementation approaches without losing your starting point" (explorar alternativas: experimentar abordagens de implementação diferentes sem perder o seu ponto de partida) e "Recovering from mistakes: quickly undo changes that introduced bugs or broke functionality"[^S2] (recuperar-se de erros: desfazer rapidamente mudanças que introduziram bugs ou quebraram funcionalidades). Vale notar: esses documentos de casos de uso estão listados genericamente sob checkpointing (`/rewind`), não separados entre “rebobinagem” e “bifurcação”. Mas, confrontados com os dois usos desta lição — “deu errado, volte e refaça” e “não tenho certeza, bifurque e experimente” —, a direção coincide.

Do lado da bifurcação, o Claude Code oferece `/branch` ou `claude --continue --fork-session`: "To branch off and try a different approach while preserving the original session intact, use /branch or claude --continue --fork-session"[^S2] (para ramificar e experimentar uma abordagem diferente preservando intacta a sessão original, use /branch ou claude --continue --fork-session).

## Fronteiras e divisão de trabalho: o que cabe a checkpoints, ao Git e ao livro-razão de efeitos

A documentação do Claude Code também traça uma fronteira própria: o checkpointing dele "does not track files modified by bash commands"[^S2] (não rastreia arquivos modificados por comandos bash), e "Only direct file edits made through Claude's file editing tools are tracked"[^S2] (apenas edições diretas de arquivo feitas pelas ferramentas de edição do Claude são rastreadas). Pela mesma lógica, os checkpoints do seu próprio harness cobrem apenas os campos de estado que você definiu explicitamente no instantâneo — `messages`, `turns`, `tokensUsed`, `pendingToolUse`. Mudanças que uma ferramenta fez no mundo externo — escrever em um banco de dados, chamar outro serviço, enviar um e-mail — não são da conta de um checkpoint. Esse é o trabalho do livro-razão de efeitos.

A documentação oficial enuncia o papel do mecanismo sem rodeios: checkpoints são projetados para recuperação rápida em nível de sessão e, para histórico de longo prazo e colaboração, você deveria "continue using version control, such as Git, for commits, branches, and long-term history."[^S2] (seguir usando controle de versão, como o Git, para commits, ramificações e histórico de longo prazo). Aos três cabem trechos separados, e fica mais claro lado a lado:

| Mecanismo | O que lhe cabe | Escala de tempo |
| --- | --- | --- |
| Checkpoint | A cena corrente — `messages`, contagem de turnos, a chamada de ferramenta ainda não executada | Minutos, nível de sessão |
| Git | O histórico do próprio código — commits, ramificações, colaboração | Permanente, colaborativo |
| Livro-razão de efeitos | Efeitos colaterais externos que já aconteceram — e-mails enviados, registros escritos | Somente acréscimo, guardado permanentemente |

```agentmentor-check
{
  "id": "sp-zh-05-checkpoint-vs-git",
  "label": "Julgar se checkpoints podem substituir o controle de versão",
  "prompt": "Alguém do time propõe: agora que os checkpoints conseguem rebobinar por turno, eles funcionam bem parecido com o histórico de commits do Git, então daqui em diante vamos gerenciar as mudanças de código com checkpoints e largar o Git de vez. A proposta se sustenta?",
  "whyHere": "Você acabou de ver a divisão de trabalho entre checkpoints, Git e o livro-razão de efeitos. “Checkpoints já rebobinam, então o Git não ficou redundante?” é a extrapolação mais provável de aparecer justamente aqui, e essa fronteira tem de ser fixada na hora — senão o leitor funde recuperação de sessão em escala de minutos e histórico permanente de código em uma coisa só.",
  "mode": "single",
  "choices": [
    {
      "id": "a",
      "text": "Sustenta-se. Checkpoints já guardam a cena de cada etapa por turno — version, turns, messages estão todos lá —, então fazem o mesmo trabalho dos registros de commit do Git, e dá para rebobinar e ler histórico com checkpoints.",
      "correct": false,
      "feedback": "Não exatamente. Os campos que um checkpoint guarda existem para reconstruir a cena corrente de uma sessão, o que não é a mesma coisa que um commit do Git registra — os próprios arquivos de código, sob controle de versão completo. Checkpoints foram projetados para recuperação rápida em nível de sessão, enquanto histórico de longo prazo e colaboração continuam apoiados em controle de versão como o Git[^S2]. A eles não cabe a mesma coisa, então não se coloca a questão de um substituir o outro."
    },
    {
      "id": "b",
      "text": "Não se sustenta. Checkpoints são recuperação da cena corrente em escala de minutos, em nível de sessão; o Git é o histórico permanente e colaborativo do próprio código. A eles cabem duas coisas inteiramente diferentes e um não faz as vezes do outro.",
      "correct": true,
      "feedback": "Correto. A documentação enuncia a fronteira sem rodeios: checkpoints são projetados para recuperação rápida em nível de sessão, e histórico de longo prazo e colaboração continuam pedindo controle de versão como o Git[^S2]. Checkpoints nem sequer rastreiam arquivos modificados por comandos bash — apenas edições feitas pelas próprias ferramentas de edição de arquivo do Claude[^S2] —, de modo que o registro que eles têm do que de fato mudou no código já é bem mais estreito que o do Git. Aos checkpoints, ao Git e ao livro-razão de efeitos cabe um trecho a cada um; nenhum substitui o outro."
    },
    {
      "id": "c",
      "text": "Sustenta-se em parte. Checkpoints já rebobinam, então, desde que você registre cada rebobinagem, é essencialmente um gerenciamento de ramificações simplificado — só um jeito diferente de operar — e substituir o Git aos poucos não está fora de cogitação.",
      "correct": false,
      "feedback": "Rebobinagem de checkpoint e gerenciamento de ramificações do Git não são duas grafias da mesma coisa. Checkpoints nem sequer rastreiam arquivos modificados por comandos bash, apenas edições feitas pelas próprias ferramentas de edição de arquivo do Claude[^S2], de modo que a cobertura que eles têm das mudanças de código é bem mais estreita que a do Git, e não têm nada da maquinaria de commit, merge e colaboração do Git. O papel deles é recuperação rápida em nível de sessão, não um substituto para controle de versão[^S2]."
    }
  ]
}
```

## Custo de retenção: escolha seu trade-off

Reter uma sequência de checkpoints por turno não é de graça — dois pontos de gravação por turno e, quanto mais tempo a tarefa roda, mais arquivos se acumulam no disco. O princípio da Anthropic de que "you should consider adding complexity only when it demonstrably improves outcomes"[^S3] (você deveria considerar acrescentar complexidade apenas quando isso comprovadamente melhorar os resultados) se aplica igualmente aqui. Se a tarefa roda só alguns turnos e raramente precisa de uma rebobinagem, guardar a sequência inteira pode custar mais do que vale — como nas lições anteriores, guardar só o mais recente basta. Do outro lado, se a tarefa roda dezenas de turnos e rotineiramente precisa rebobinar ou bifurcar para experimentar algumas abordagens, a sequência que você guarda justifica seu lugar: quando algo dá errado você não precisa começar do zero, e o custo de tentativa e erro cai. Isto é, no fim das contas, um julgamento proporcional ao tamanho da tarefa, não uma questão de qual abordagem é intrinsecamente certa.

<!-- exercises -->
## 💻 Exercícios

### Nível 1: Quatro cenários, escolha a ferramenta certa

Para cada um dos quatro cenários abaixo, o que você deveria usar — rebobinagem, retomada, bifurcação ou Git? Responda cada um e dê seu raciocínio.

1. Uma tarefa rodou uns 20 turnos e você percebe que o modelo escolheu o plano de refatoração errado no turno 12. Os turnos seguintes todos construíram em cima daquele plano errado, mas o próprio processo continua rodando bem, sem queda.
2. A mesma tarefa chegou ao turno 18, a máquina hospedeira foi reiniciada, o processo foi morto por inteiro e nada terminou.
3. Você não tem certeza se divide um módulo em dois serviços ou em três, e quer que o agente rode cada plano uma vez para você comparar os resultados.
4. Você quer saber como este código estava três dias atrás, e quem o mudou e quando.

<!-- rubric -->
- O cenário 1 escolhe rebobinagem, com raciocínio que aponta para “não caiu, mas a decisão saiu errada e os turnos seguintes todos construíram em cima daquele erro”, não retomada nem bifurcação
- O cenário 2 escolhe retomada, com raciocínio que aponta para “o processo inteiro foi interrompido, não um erro de decisão”, usando retomada por checkpoint e não rebobinagem
- O cenário 3 escolhe bifurcação, com raciocínio que aponta para “ambos os planos precisam de fato rodar para gerar resultados comparáveis”, não apostar em um primeiro
- O cenário 4 escolhe Git, com raciocínio que aponta para “a pergunta é sobre o histórico versionado do próprio código, escala de tempo em dias e não em minutos”, o que não está no alcance de nível de sessão do checkpoint

<!-- answer -->
1. **Rebobinagem**. O processo não caiu; o problema é a própria decisão do turno 12, e a dúzia de turnos seguintes construiu toda em cima daquele erro. Em vez de empurrar adiante dentro de um trecho de histórico que já está fora do rumo, reverta a cena para o turno 11 (antes da decisão ruim) e comece de novo, trocando por uma cena de decisão que ainda não deu errado.
2. **Retomada**. Isto não é um problema de decisão; o próprio processo foi morto por inteiro, sem relação com o que o turno 12 estava pensando. O que é preciso é retomar o loop a partir do checkpoint mais recente, continuando a cena de execução original, sem nenhuma decisão trocada.
3. **Bifurcação**. Isto não é “um estava errado, volte” — ambos os planos fazem sentido, e você precisa de fato rodar cada um para saber qual é melhor. Copie duas linhas do tempo independentes a partir do checkpoint atual, cada uma com o seu livro-razão de efeitos, e rode cada uma separadamente. Mais direto do que apostar em um, achar que ficou aquém e então rebobinar para tentar de novo.
4. **Git**. A pergunta aqui é sobre o código em si — “como estava três dias atrás, quem o mudou” —, que é o que os sistemas de controle de versão gerenciam: histórico permanente, abrangendo dias e não minutos. Checkpoints são retidos por turno para recuperação rápida de sessão e em geral não são guardados tanto tempo, muito menos registram dados de colaboração como “quem o mudou”.

<!-- hint -->
Pergunte-se primeiro: o processo foi morto por inteiro? Se sim, é retomada; se não, mas saiu do rumo, é aí que a rebobinagem entra.

<!-- hint -->
“Não tenho certeza de qual escolher” e “já escolhi o errado” não são a mesma coisa. O primeiro pede bifurcação para comparar; o segundo pede rebobinagem para refazer. E se aparecer “o histórico do próprio código”, pense em Git, não em checkpoints.

### Nível 2: Transforme saveCheckpoint em uma sequência por turno

O código abaixo é a versão antiga das lições anteriores: ela sobrescreve o mesmo `checkpoint.json` toda vez, então sustenta retomada mas não rebobinagem. Reescreva-o do jeito que esta lição exige: nomes de arquivo seguindo a regra de retenção por turno `turn-NNN-A.json` / `turn-NNN-B.json`; forneça um `loadLatest()` para a retomada que assume por padrão o último ponto de gravação escrito no turno mais recente; e forneça um `rewindTo(turn)` que pega a cena de um turno específico. Depois de terminar, escreva a verificação: salve 5 turnos em sequência, chame `rewindTo(3)` e confirme que o `turns` da cena devolvida é 3 e que o comprimento do livro-razão de efeitos `effects.json` não foi revertido.

```javascript
// Versão antiga: sobrescreve o mesmo arquivo toda vez, só consegue pegar o "mais recente", não o "turno N"
import fs from "node:fs/promises";

async function saveCheckpoint(state) {
  const tmp = "checkpoint.json.tmp";
  await fs.writeFile(tmp, JSON.stringify(state, null, 2));
  await fs.rename(tmp, "checkpoint.json");
}

async function loadCheckpoint() {
  const raw = await fs.readFile("checkpoint.json", "utf8");
  return JSON.parse(raw);
}
```

<!-- rubric -->
- `saveCheckpoint` é reescrito para nomear os arquivos em disco como `turn-NNN-A.json` / `turn-NNN-B.json` e mantém a gravação atômica (escreve `.tmp` primeiro, depois renomeia)
- Fornece a lógica para achar “o último ponto de gravação escrito em um turno”, e `loadLatest()` pega corretamente o ponto de gravação mais recente do maior turno que rodou
- `rewindTo(turn)` pega a cena do turno especificado e não toca no `effects.json`
- O script de verificação roda até o fim: depois de salvar 5 turnos, `rewindTo(3).turns === 3`, e o comprimento de `effects.json` continua 5 (a ação de rebobinar não o alterou)

<!-- answer -->
```javascript
import fs from "node:fs/promises";
import path from "node:path";

function turnFileName(turn, point) {
  return `turn-${String(turn).padStart(3, "0")}-${point}.json`;
}

async function saveCheckpoint(state, turn, point, dir = "checkpoints") {
  const file = path.join(dir, turnFileName(turn, point));
  const tmp = `${file}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(state, null, 2));
  await fs.rename(tmp, file); // Gravação atômica: tmp primeiro, depois rename como um todo
}

async function pickLatestPoint(turn, dir) {
  const files = await fs.readdir(dir);
  const prefix = `turn-${String(turn).padStart(3, "0")}-`;
  const points = files
    .filter((f) => f.startsWith(prefix))
    .map((f) => f.slice(prefix.length, prefix.length + 1))
    .sort();
  if (points.length === 0) throw new Error(`No checkpoint for turn ${turn}`);
  return points[points.length - 1];
}

async function rewindTo(turn, { point, dir = "checkpoints" } = {}) {
  const wanted = point ?? (await pickLatestPoint(turn, dir));
  const raw = await fs.readFile(path.join(dir, turnFileName(turn, wanted)), "utf8");
  return JSON.parse(raw);
}

async function loadLatest(dir = "checkpoints") {
  const files = await fs.readdir(dir);
  const maxTurn = Math.max(
    ...files.filter((f) => f.startsWith("turn-")).map((f) => Number(f.slice(5, 8)))
  );
  return rewindTo(maxTurn, { dir });
}

export { saveCheckpoint, rewindTo, loadLatest };
```

Script de verificação (`effects.json` usa a mesma gravação atômica para acrescentar, representando o livro-razão em que a retomada e a rebobinagem nunca tocam):

```javascript
import fs from "node:fs/promises";
import assert from "node:assert/strict";
import { saveCheckpoint, rewindTo, loadLatest } from "./checkpoint.mjs";

async function appendEffect(entry, file = "effects.json") {
  let ledger = [];
  try {
    ledger = JSON.parse(await fs.readFile(file, "utf8"));
  } catch {}
  ledger.push(entry);
  await fs.writeFile(file, JSON.stringify(ledger, null, 2));
}

await fs.mkdir("checkpoints", { recursive: true });

for (let turn = 1; turn <= 5; turn++) {
  const stateA = {
    version: 1,
    task: "demo",
    turns: turn,
    tokensUsed: turn * 100,
    messages: [{ role: "user", content: `turn ${turn} A` }],
    pendingToolUse: { name: "send_email" },
  };
  await saveCheckpoint(stateA, turn, "A");

  const stateB = {
    ...stateA,
    messages: [...stateA.messages, { role: "user", content: `turn ${turn} B` }],
    pendingToolUse: null,
  };
  await saveCheckpoint(stateB, turn, "B");

  await appendEffect({ turn, action: "send_email" });
}

const rewound = await rewindTo(3);
assert.equal(rewound.turns, 3);
console.log("rewindTo(3).turns =", rewound.turns); // rewindTo(3).turns = 3

const effects = JSON.parse(await fs.readFile("effects.json", "utf8"));
assert.equal(effects.length, 5);
console.log("effects.json length =", effects.length); // effects.json length = 5

console.log("PASSED");
```

Rodar `node verify.mjs` localmente imprime:

```
rewindTo(3).turns = 3
effects.json length = 5
PASSED
```

A primeira linha prova que `rewindTo(3)` de fato reverteu a cena para o turno 3, e não retomou até o turno 5, o mais recente. A segunda linha prova que a ação de rebobinar apenas reconstruiu a cena da decisão — o livro-razão de efeitos nunca foi tocado, e os 5 registros do que genuinamente aconteceu naqueles turnos continuam todos lá.

<!-- hint -->
Como você julga “o último ponto de gravação escrito em um turno”? A e B ordenam lexicograficamente, batendo exatamente com a ordem temporal “antes da execução da ferramenta” → “depois de registrado o resultado da ferramenta”, então é só pegar o último depois de ordenar. Sem necessidade de carimbos de tempo extras.

<!-- hint -->
O livro-razão de efeitos é um arquivo separado (`effects.json`), totalmente independente da sequência de checkpoints. Desde que `rewindTo` não tenha nenhuma linha de código tocando nele, esta verificação passa naturalmente. Sem necessidade de “protegê-lo” de forma especial.

<!-- /exercises -->

## Recapitulação

- Checkpoints não são apenas seguro contra desastre: um encadeamento retido de checkpoints é a linha do tempo da tarefa e, para além da retomada, eles sustentam rebobinagem e bifurcação — um roteiro comunitário enquadra esses três juntos como aquilo que cabe ao componente de persistência[^S5]
- A rebobinagem reverte a **cena da decisão**, não o **mundo externo**: ações externas que realmente aconteceram não são desfeitas pela rebobinagem, e o livro-razão de efeitos segue somente acréscimo — a visão de idempotência da Lição 4 levada para o cenário da rebobinagem
- Sustentar a rebobinagem exige que os checkpoints sejam retidos como uma sequência por turno (como `turn-014-A/B.json`) em vez de sobrescritos para guardar só o mais recente; `rewindTo(turn)` assume por padrão o último ponto de gravação escrito naquele turno
- A bifurcação copia linhas do tempo independentes a partir da mesma cena, cada uma com a própria sequência de checkpoints e o próprio livro-razão de efeitos. Se ambas as linhas fossem acionar a mesma ferramenta de alto impacto, lembre-se de ligar uma válvula de aprovação ou passar para o modo dry-run — do contrário são efeitos colaterais dobrados
- O Claude Code já entrega rebobinagem e bifurcação como funcionalidades de produto: checkpoints criados automaticamente por prompt, `/rewind` capaz de restaurar conversa ou código separadamente, `/branch` e `--fork-session` para bifurcar[^S2]. Mas ele traça a própria fronteira — rastreia apenas edições vindas das ferramentas de edição de arquivo do próprio Claude, não mudanças por comando bash[^S2], e se posiciona como recuperação rápida em nível de sessão, com o Git continuando a responder por histórico de longo prazo e colaboração[^S2]
- Três trabalhos diferentes: aos checkpoints cabe a cena corrente em escala de minutos, ao Git cabe o histórico permanente e colaborativo do código, ao livro-razão de efeitos cabem os efeitos colaterais externos que já aconteceram. Reter uma sequência completa de checkpoints por turno tem custo de disco; se vale a pena depende da escala da tarefa, não de qual abordagem é intrinsecamente certa[^S3]

[>> Lição 6: Mão na massa: soldando checkpoint e retomada no harness](./06-build-checkpointing.md)
