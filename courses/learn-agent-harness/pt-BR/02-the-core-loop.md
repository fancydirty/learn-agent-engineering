# Lição 2: O loop central: de uma ida e volta à operação contínua

> Objetivos de aprendizado:
> - Recitar os quatro passos do loop de múltiplos turnos que o stop_reason dirige, e conectar uma ida e volta de chamada de ferramenta em um while loop que segue rodando
> - Usar o valor de stop_reason (tool_use / end_turn) para decidir se o loop continua ou para, e explicar por que esse campo é a condição do while do loop
> - Apontar quais fronteiras faltam a este loop esqueleto, e explicar por que o histórico cresce a cada turno e por que você não pode confiar só no modelo dizendo "terminei"
>
> Pré-requisitos: Você leu a Lição 1 e sabe que um harness é a camada de código de controle ao redor do modelo; você consegue ler o tool_use / tool_result de uma única ida e volta de chamada de ferramenta | Anterior: [Lição 1 <<](./01-what-is-a-harness.md) | Próxima: [Lição 3 >>](./03-stop-conditions.md)

## Uma ida e volta deixa de bastar

A Lição 1 já desmontou uma ida e volta completa de chamada de ferramenta: o modelo devolve `stop_reason: "tool_use"` junto com um bloco `tool_use`, o seu código do host lê o `name` e o `input`, de fato roda a coisa, empacota a saída em um `tool_result` e a envia de volta, e só então o modelo dá a resposta final. Três pedaços de JSON, uma viagem, pronto.

Tarefas reais raramente são tão educadas. Mude o cenário: você está escrevendo um bot de plantão, e um usuário diz "reinicie o serviço api para mim, depois cheque se os logs ainda têm erros, e cole-os se tiverem". Essa única frase embute dois trabalhos, e o segundo depende do primeiro — checar os logs não significa nada até o reinício ter terminado. O modelo não consegue fazer os dois no primeiro turno. Tudo o que ele pode fazer é isto:

1. O turno um devolve `tool_use`, chamando `restart_service`. Você o roda e envia "reinício bem-sucedido" de volta.
2. O turno dois devolve `tool_use` de novo, desta vez chamando `read_logs`. Você o roda e envia o conteúdo dos logs de volta.
3. O turno três finalmente devolve `stop_reason: "end_turn"`, com uma linha do tipo "Reinício concluído; os logs têm dois erros de timeout, colados abaixo".

Uma requisição do usuário, três idas e voltas. O que o modelo consegue ver em cada passo, e o que ele faz em seguida, depende do que voltou no `tool_result` anterior — que é exatamente a definição de agente da Anthropic: um LLM usando ferramentas com base em feedback do ambiente, em um loop.[^S1] A ida e volta única da Lição 1 é só o caso especial em que esse loop por acaso girou uma vez só. O que esta lição faz é conectar "uma ida e volta" em "idas e voltas que seguem indo", e dar uma olhada clara em o que é o loop no meio, o que o dirige, e onde ele precisa de um freio.

## Os quatro passos do loop

Transformar uma única ida e volta em um loop não exige inventar nada novo. Você só repete os movimentos que já conhece. A documentação da API Claude escreve esse processo de múltiplos turnos como uma sequência fixa:[^S2]

1. Você envia uma requisição carregando `messages` e o manifesto `tools` (`tools` tem que ir junto em cada turno).
2. O modelo devolve uma resposta. Se ele ainda precisa de uma ferramenta, `stop_reason` é `"tool_use"` e `content` carrega um ou mais blocos `tool_use`.
3. Você executa cada bloco `tool_use` e transforma cada saída em um bloco `tool_result`. A palavra-chave desse passo é *cada*: quantos blocos `tool_use` tenham voltado em uma resposta, a próxima mensagem `user` precisa desse tanto de blocos `tool_result` correspondentes, cada um reivindicado pelo seu `tool_use_id`, todos empacotados naquela única mensagem `user` imediatamente seguinte. A documentação põe a regra assim: "Whichever strategy you use, return one tool_result for each tool_use block, all together in the next user message. Match each result to its call with tool_use_id, and put every tool_result block before any text content in that message."[^S6] (Qualquer que seja a estratégia usada, devolva um tool_result para cada bloco tool_use, todos juntos na próxima mensagem do usuário. Case cada resultado com a sua chamada usando o tool_use_id, e ponha todo bloco tool_result antes de qualquer conteúdo de texto naquela mensagem.)
4. Você anexa a `messages` tanto a resposta completa do modelo daquele turno (papel `assistant`) quanto o lote de `tool_result` que você montou (papel `user`), e então envia outra requisição.

Aí vem a frase que mais importa: repita a partir do passo 2 enquanto `stop_reason` for `"tool_use"`.[^S2] Esse "repita enquanto" é o eixo que estica uma única ida e volta em um loop. O exemplo da Lição 1 parou no primeiro `end_turn` porque uma viagem era tudo o que aquela tarefa precisava; o bot de plantão roda os passos 2 a 4 três vezes, até o turno três voltar `end_turn`.

Vale lembrar: os campos dos blocos `tool_use` e `tool_result` não mudaram em nada. Um bloco `tool_use` carrega `id` / `name` / `input`; um bloco `tool_result` carrega `tool_use_id` / `content`, mais um `is_error` opcional quando a chamada falhou.[^S6] O loop não reescreve o que qualquer um desses campos significa. Ele só faz o mesmo conjunto de campos ser preenchido e enviado de volta, repetidamente.

## stop_reason é a condição do while do loop

Aquela linha acima — "repita enquanto `stop_reason` ainda for `tool_use`" — se traduz em código como o teste de um while loop. E a única frase que você deveria levar desta lição é esta: **decidir se o loop continua ou para se resume a esse único campo, `stop_reason`.** Ele tem muitos valores possíveis, mas para controle de loop, distinguir dois deles já basta para começar:

- `"tool_use"`: o modelo ainda quer uma ferramenta. Ele entrega a requisição a você e espera que você execute e envie o resultado de volta antes de continuar. O loop gira mais uma rodada.
- `"end_turn"`: o modelo não quer mais uma ferramenta; ele acha que disse o que tinha a dizer. O loop termina por conta própria e você entrega o texto final ao usuário.

Um roadmap de código aberto sobre engenharia de harness põe essa camada de controle de forma seca: o que dirige um harness é o while loop rodando modelo→ferramentas→modelo.[^S5] E o que fica na expressão de condição desse while é o `stop_reason`. Mesmo modelo, mesmo conjunto de ferramentas — quantas rodadas ele gira e quando para é decidido inteiramente por como o host lê aquele campo e como escreve aquela condição. É por isso que a Lição 1 disse "Same model, different harness, completely different result."[^S5] (Mesmo modelo, harness diferente, resultado completamente diferente.)

Uma coisa a acertar de saída, para você não ler o sinal ao contrário: `stop_reason: "tool_use"` significa que o modelo **quer** usar uma ferramenta, não que uma ferramenta **foi** usada. O modelo nunca executa nada por conta própria. Ele emite uma requisição estruturada; o que de fato roda a ferramenta é o seu código do host (ou os servidores da Anthropic), e o resultado só volta para a conversa depois.[^S2] Então, no instante em que `tool_use` aparece no loop, nada aconteceu ainda. A ação acontece nas poucas linhas do seu código que leem o `name` e o `input` e vão fazer o trabalho. Tratar "recebi um tool_use" como "a ferramenta terminou de rodar" é o tropeço mais fácil ao passar de uma única ida e volta para um loop — faz você errar em qual passo o loop de fato está agora.

```agentmentor-check
{
  "id": "harness-zh-02-tooluse-not-executed",
  "label": "Decidir se a ferramenta de fato rodou depois de chegar stop_reason tool_use",
  "prompt": "Seu loop envia sua terceira requisição. O modelo devolve stop_reason: “tool_use”, e content contém um bloco tool_use cujo name é run_migration (rodar uma migração de banco de dados contra o banco de produção). No momento em que seu código lê esta resposta, o script de migração já executou contra o banco de dados?",
  "whyHere": "Esta seção acabou de fazer do stop_reason a condição do while do loop e apontou que tool_use significa que o modelo quer uma ferramenta, não que uma foi usada. A checagem barra a crença de que um bloco tool_use devolvido significa que a ferramenta deste turno já terminou, porque essa crença faz você errar em qual passo o loop está agora.",
  "mode": "single",
  "choices": [
    {
      "id": "a",
      "text": "Já rodou. Como o modelo devolveu um bloco tool_use, a migração deste turno já foi feita no banco e o loop deveria encerrar.",
      "correct": false,
      "feedback": "Não exatamente. Isso trata um sinal como um comprovante de execução. Um bloco tool_use é apenas a nota de pedido que o modelo entrega, significando “quero chamar run_migration” — o modelo em si não tem como se conectar a um banco ou rodar um script. A migração só acontece depois que o seu código do host lê o bloco e de fato o executa; neste instante, nada no banco de dados se moveu."
    },
    {
      "id": "b",
      "text": "Ainda não. Isto é só o modelo pedindo uma chamada; a migração roda quando o host a executa e envia o tool_result de volta, e o próximo turno segue.",
      "correct": true,
      "feedback": "Correto. tool_use é o sinal para continuar o loop, não um comprovante dizendo que a ferramenta terminou. A execução sempre fica do lado do host: você lê o name e o input, chama a lógica real de migração, empacota a saída como um tool_result e a envia de volta, e só então o loop gira de novo e o modelo consegue ver o que a migração de fato fez."
    }
  ]
}
```

## Escrito por extenso, são só algumas linhas

Ponha aqueles quatro passos e a condição do while do `stop_reason` em JavaScript e o esqueleto é surpreendentemente curto:

```javascript
// tools é a lista de definições de ferramentas que tem que ir junto em cada turno
const messages = [{ role: "user", content: userInput }];

let response = await callModel({ tools, messages });

while (response.stop_reason === "tool_use") {
  // 1. Anexa ao histórico a resposta completa do modelo neste turno
  messages.push({ role: "assistant", content: response.content });

  // 2. Roda cada bloco tool_use deste turno, empacotando cada um em um tool_result
  const toolUseBlocks = response.content.filter((b) => b.type === "tool_use");
  const toolResults = await Promise.all(
    toolUseBlocks.map(async (block) => ({
      type: "tool_result",
      tool_use_id: block.id,
      content: await executeTool(block.name, block.input),
    }))
  );

  // 3. Anexa ao histórico este lote de blocos tool_result como uma mensagem user
  messages.push({ role: "user", content: toolResults });

  // 4. Envia outra requisição com o histórico agora mais longo; volta ao teste do while
  response = await callModel({ tools, messages });
}

// Saímos do loop, então stop_reason não é mais tool_use (end_turn, digamos),
// e response contém a resposta de texto final
```

Percorra os quatro passos mais uma vez contra o código: a linha `while` é "repita enquanto ainda for `tool_use`"; dentro do corpo, tanto a resposta `assistant` quanto a mensagem `user` de blocos `tool_result` levam `push` para dentro de `messages`, e então `response` é reatribuído. Essa última atribuição é o que torna possível parar — remova-a, e `response.stop_reason` mantém o valor antigo para sempre, então o while loop nunca sai (esse sabor de loop infinito é a estrela da Lição 4).

Este código roda, mas é um esqueleto — simples o bastante para tornar o próprio loop visível, e nem de longe seguro para entregar à produção. Ele assume que o modelo sempre voltará com `end_turn` em algum turno, assume que cada ferramenta executa sem falha, e assume que não importa quão longo o histórico fica. Essas três suposições são exatamente o que as próximas lições desmontam uma de cada vez.

## Cada turno a mais deixa o histórico mais longo

Olhe de novo aquelas linhas `messages.push`: cada turno do loop enfia mais duas mensagens em `messages` — a resposta `assistant` do modelo e o lote de `tool_result` que você enviou de volta. E o próximo `callModel` tem que despachar todo o `messages` de novo, sem mudança. Então, quanto mais tempo esse loop roda, mais histórico cada requisição carrega, e ele só cresce.

Isso não é um descuido da implementação. É uma propriedade inerente do loop como estrutura: um agente rodando em loop gera cada vez mais dados que podem ser relevantes para o próximo turno de inferência.[^S3] Três turnos do bot de plantão só empilham um resultado de reinício mais um punhado de logs. Mas uma tarefa que precisa de dezenas de turnos rola o histórico em algo enorme.

Escondido aqui há um problema que só é aberto no curso "Memória e Estado de Agentes", mas que precisa ser plantado agora: modelos têm um "orçamento de atenção", e cada novo token introduzido esgota esse orçamento em alguma medida.[^S3] Histórico mais longo significa mais tokens, e conforme o número de tokens na janela de contexto aumenta, a capacidade do modelo de recuperar com precisão a informação daquele contexto diminui.[^S3] Note que isso é um gradiente de desempenho que desce suavemente com o comprimento, não um penhasco de que você despenca ao passar de algum limiar[^S3] — não leia como "passou do limite, virou inútil". Mas a direção é inequívoca: o contexto tem que ser tratado como um recurso finito com retornos marginais decrescentes.[^S3] Aquele `messages.push` sem cerimônia no loop esqueleto não faz nada a respeito disso. Ele assume que o histórico pode crescer para sempre — e "Memória e Estado de Agentes" é o curso que volta para acertar essa conta.

## Um loop sozinho não basta; fronteiras têm que ser adicionadas

Você agora tem um loop que gira. Mas "consegue girar" e "gira com segurança" são duas coisas diferentes. O loop esqueleto entrega a decisão de parar-ou-continuar inteiramente ao modelo: o turno em que ele devolve `end_turn` é o turno em que o loop para. Só que agentes são sistemas em que o modelo dirige dinamicamente seu próprio processo e uso de ferramentas.[^S1] Essa autonomia é precisamente de onde vem a utilidade, e precisamente onde mora o risco: autonomia significa custos maiores e o potencial de erros que se acumulam ao redor de turno após turno do loop.[^S1] O modelo vai potencialmente operar por muitos turnos, e você tem que ter algum nível de confiança na tomada de decisão dele antes de deixá-lo rodar.[^S1]

O detalhe é que confiança não é o mesmo que ausência de supervisão. Se o modelo empaca em algum passo, ou é puxado para fora do rumo pelo que uma ferramenta devolveu, e simplesmente nunca volta com `end_turn`, um loop que vigia nada além do `stop_reason` seguirá girando junto com ele indefinidamente. Então, além do próprio sinal de conclusão do modelo, você normalmente adiciona condições de parada explícitas também — um teto no número máximo de iterações, por exemplo, para manter o controle do seu lado.[^S1] O nu `while (response.stop_reason === "tool_use")` do esqueleto não tem tal fusível: ele confia no modelo sem deixar para si mesmo uma saída.

Isso planta os dois preparativos desta lição: **este loop precisa de fronteiras** (você não pode depender do modelo dizer `end_turn`; você precisa de condições de parada explícitas — Lição 3), e **o histórico que este loop produz precisa ser gerenciado** (tokens são um recurso finito, então você não pode simplesmente jogar coisas para dentro — deixado para o curso Memória e Estado de Agentes). Como um loop de fato parece quando sai dos trilhos, e como pegá-lo, é o assunto da Lição 4. Para esta lição basta acertar o eixo: como o loop gira, e que `stop_reason` é o que o dirige.

<!-- exercises -->
## 💻 Exercícios

### Nível 1: Conte quantas vezes este loop gira

Um agente assistente de agenda é montado com duas ferramentas, `search_calendar` (olhar a agenda) e `create_event` (marcar algo). O usuário diz "veja se estou livre na quinta à tarde, e se estiver, marque uma revisão de 30 minutos". O host o dirige com o loop esqueleto desta lição, e a sequência de `stop_reason` que de fato acontece é:

- 1º `callModel` retorna → `stop_reason: "tool_use"` (um bloco `tool_use`, chamando `search_calendar`)
- 2º `callModel` retorna → `stop_reason: "tool_use"` (um bloco `tool_use`, chamando `create_event`)
- 3º `callModel` retorna → `stop_reason: "end_turn"` (texto: "Marquei a revisão para quinta às 14:00")

Responda: (1) Quantas vezes `callModel` foi chamado no total? (2) Quantas vezes `executeTool` foi chamado no total? (3) Quantas vezes o corpo do while loop executou? (4) Ao ler qual `stop_reason` o loop saiu?

<!-- rubric -->
- A contagem de `callModel` está certa (3), com uma explicação clara de onde vem: "1 fora do loop + 1 por turno dentro do corpo"
- A contagem de `executeTool` está certa (2), casando com os dois blocos `tool_use`
- O número de execuções do corpo do while está certo (2), e a saída acontece ao ler `end_turn`
- Explica que o 3º `callModel` foi disparado de dentro do corpo do loop, mas seu retorno torna a condição do while falsa, então não houve uma 3ª passagem pelo corpo

<!-- answer -->
1. `callModel` foi chamado **3 vezes**: uma fora do loop (a requisição de abertura), mais a linha `response = await callModel(...)` no fim do corpo rodando duas vezes (uma em cada um dos dois primeiros turnos). O terceiro retorno é `end_turn`.
2. `executeTool` foi chamado **2 vezes**: os turnos 1 e 2 tinham cada um um bloco `tool_use`, executado uma vez cada; o turno `end_turn` não tem bloco `tool_use`, então nenhuma ferramenta roda.
3. O corpo do while executou **2 vezes**: a 1ª resposta é `tool_use`, então entramos na primeira passagem; a 2ª resposta ainda é `tool_use`, então entramos na segunda passagem; a 3ª resposta é `end_turn`, a condição do while é falsa, e não entramos de novo.
4. O loop sai ao ler **`end_turn`** — especificamente, o `callModel` no fim da segunda passagem retornou `end_turn`, então, quando o controle voltou ao teste do while, a condição era falsa e saímos.

<!-- hint -->
Marque as duas chamadas de `callModel` no código esqueleto: uma antes do while, uma na última linha do corpo. Toda vez que o corpo roda, a segunda é chamada uma vez.

<!-- hint -->
No turno em que `stop_reason` é `end_turn`, a resposta do modelo não tem bloco `tool_use`. Então "quantas vezes `executeTool` rodou" e "se entramos no corpo" são duas coisas separadas a contar.

### Nível 2: Por que este loop nunca para

Um colega tentou transformar uma única ida e volta em um loop de múltiplos turnos e escreveu o código abaixo. Ele "parece funcionar" em tarefas que precisam de apenas uma chamada de ferramenta, mas no momento em que uma tarefa precisa que o modelo chame ferramentas duas vezes seguidas, o processo trava, recursos são consumidos, e os logs mostram a mesma ferramenta sendo chamada repetidamente. Encontre a causa raiz e corrija.

```javascript
async function runAgent(userInput, tools) {
  const messages = [{ role: "user", content: userInput }];
  let response = await callModel({ tools, messages });

  while (response.stop_reason === "tool_use") {
    const block = response.content.find((b) => b.type === "tool_use");
    const result = await executeTool(block.name, block.input);

    messages.push({ role: "assistant", content: response.content });
    messages.push({
      role: "user",
      content: [{ type: "tool_result", tool_use_id: block.id, content: result }],
    });
    // fim do corpo do loop
  }

  return response;
}
```

<!-- rubric -->
- Nomeia a causa raiz com precisão: o corpo nunca reatribui `response`, então `response.stop_reason` fica no `tool_use` do primeiro turno para sempre e a condição do while é permanentemente verdadeira
- Explica por que isso aparece como "ok em uma ida e volta, trava em tarefas de múltiplos turnos": uma vez que uma resposta de fato entra no corpo, é um loop infinito sem saída; a razão de às vezes "parecer funcionar" é que a resposta não era `tool_use` de jeito nenhum e nunca entrou no loop — não que ela "parou normalmente depois do primeiro tool_use"
- A correção adiciona `response = await callModel({ tools, messages })` no fim do corpo

<!-- answer -->
Causa raiz: **o fim do corpo do loop nunca reatribui `response`.** `response` é atribuído exatamente uma vez, fora do loop; o corpo só anexa mensagens a `messages` e nunca envia uma nova requisição nem atualiza `response`. Então `response.stop_reason` fica naquele primeiro `"tool_use"` para sempre, a condição do while é permanentemente verdadeira, e o loop nunca consegue sair — `messages` cresce sem limite, o mesmo bloco `tool_use` é executado repetidas vezes, e o processo trava.

Quanto ao "ok em uma ida e volta": é uma ilusão. Mesmo quando uma tarefa precisa de só uma chamada de ferramenta, este código não sai depois de entrar no corpo. Quando alguém acha que funciona, geralmente é porque rodou em outro lugar, ou a resposta por acaso não era `tool_use` e nunca entrou no loop. Uma vez que você está de fato no corpo, é um loop infinito.

A correção — adicione a linha da nova requisição no fim do corpo:

```javascript
  while (response.stop_reason === "tool_use") {
    const block = response.content.find((b) => b.type === "tool_use");
    const result = await executeTool(block.name, block.input);

    messages.push({ role: "assistant", content: response.content });
    messages.push({
      role: "user",
      content: [{ type: "tool_result", tool_use_id: block.id, content: result }],
    });

    response = await callModel({ tools, messages }); // adicione esta linha para o loop poder ler um novo stop_reason
  }
```

<!-- hint -->
A condição do while lê `response.stop_reason`. Busque no corpo inteiro a variável `response` e verifique se ela é reatribuída em alguma passagem.

<!-- hint -->
Um loop só consegue parar porque cada turno produz um `stop_reason` novo para testar de novo. Se o `response` que você segura no fim de uma passagem ainda é o da passagem anterior, a condição do while calcula a mesma resposta para sempre.

<!-- /exercises -->

## Recapitulação

- Conectar uma ida e volta de chamada de ferramenta em um loop não precisa de mecanismo novo, só de quatro passos repetidos: envie a requisição → leia `stop_reason` e os blocos `tool_use` → rode as ferramentas e empacote os blocos `tool_result` → anexe ao histórico e envie de novo; repita enquanto `stop_reason` ainda for `tool_use`[^S2]
- `stop_reason` é a condição do while deste loop: `tool_use` significa que o modelo ainda quer uma ferramenta e o loop continua, `end_turn` significa que o modelo está encerrando e o loop termina por conta própria — o eixo modelo→ferramentas→modelo é dirigido por aquele campo[^S5]
- `tool_use` é o sinal de que o modelo quer uma ferramenta, não um comprovante dizendo que uma rodou; o modelo nunca executa nada por si só, e a ação acontece onde o host lê o `name` e o `input` e vai trabalhar[^S2]
- Cada turno do loop deixa o histórico mais longo e nunca mais curto, já que um agente em loop segue gerando mais dados que podem ser relevantes[^S3]; e com um orçamento de atenção finito, a recuperação piora conforme o contexto cresce, então tokens têm que ser tratados como um recurso finito com retornos marginais decrescentes[^S3]
- Um loop sozinho não basta: autonomia traz custos maiores e erros que se acumulam, e o modelo pode operar por muitos turnos[^S1], então, além do próprio `end_turn` do modelo, você normalmente adiciona condições de parada explícitas (um número máximo de iterações, digamos) para manter o controle do seu lado[^S1] — como configurá-las é o assunto da Lição 3

[>> Lição 3: Condições de parada: quando um agente deve desistir](./03-stop-conditions.md)
