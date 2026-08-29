# Lição 5: Intervenção e direção: interromper, redirecionar, humano no loop

> Objetivos de aprendizado:
> - Dizer por que um loop autônomo precisa de um humano dentro dele, e deixar clara a ligação causal: agência excessiva é por que um loop mais autônomo precisa de mais uma comporta manual
> - Distinguir interromper, redirecionar e aprovar — onde cada um corta o loop, e o que cada um muda
> - Decidir se um ponto de aprovação humana para uma ação de alto impacto fica antes ou depois da execução, e enunciar a regra "antes de se tornar irreversível"
>
> Pré-requisitos: Terminar as Lições 3 e 4, saber que um loop tem condições de parada e que loops mortos e giro em falso precisam de fallbacks, e entender o harness como o código de controle em torno do modelo | Anterior: [Lição 4 <<](./04-loop-failure-modes.md) | Próxima: [Lição 6 >>](./06-build-a-harness.md)

## As primeiras quatro lições gerenciaram o loop em si; esta coloca uma pessoa dentro

A esta altura o loop nas suas mãos roda, para e tem fallbacks por baixo. A Lição 3 deu a ele condições de parada explícitas. A Lição 4 ensinou-o a reconhecer loops mortos e giro em falso para não queimar o orçamento até o chão. Todos esses controles compartilham uma coisa: são o harness lutando com o loop por conta própria, do começo ao fim, sem ninguém entrando.

Agentes de verdade raramente rodam até o fim sem supervisão. No meio de uma tarefa você pode querer cancelar a coisa toda — a direção está totalmente errada, pare de gastar. Você pode querer mudar o objetivo sem parar o processo: "largue a refatoração, vá achar e corrigir aquele bug de produção primeiro". Ou um passo em particular é perigoso o bastante para você querer olhá-lo e dar o aval antes de ele acontecer. O modelo não consegue decidir nenhuma dessas coisas sozinho, e a parada automática e os fallbacks das Lições 3 e 4 também não as alcançam — essas são coisas que uma **pessoa** estende a mão de fora do loop para fazer. Esta lição é essa camada: como um humano intervém no meio do loop, e onde o código dessa intervenção mora.

## Quanto mais autônomo o loop, mais ele precisa de uma comporta humana

Acerte uma questão primeiro: depois de todo esse trabalho para fazer o loop rodar sozinho, por que colocar uma pessoa de volta?

A resposta se esconde do outro lado da palavra "autônomo". Um agente é um sistema em que o modelo decide por si, dentro de um loop, o que fazer em seguida e qual ferramenta usar. Essa autonomia é exatamente o que o torna útil — e exatamente o que o torna perigoso. A comunidade de segurança tem um nome para o risco: agência excessiva. A OWASP coloca assim: "Excessive Agency is the vulnerability that enables damaging actions to be performed in response to unexpected, ambiguous, or manipulated outputs from an LLM, regardless of what is causing the LLM to malfunction."[^S4] (Agência excessiva é a vulnerabilidade que permite que ações danosas sejam realizadas em resposta a saídas inesperadas, ambíguas ou manipuladas de um LLM, independentemente do que está causando o mau funcionamento do LLM.)

Sobreponha essa frase ao loop e ela fica concreta. Em qualquer turno o modelo pode interpretar errado o que uma ferramenta retornou, pode tomar do jeito errado uma frase vaga do usuário, pode ser arrastado para fora do curso por uma instrução maliciosa enterrada numa página web que ele lê. Os modos de descontrole da Lição 4 quebravam o *ritmo* do loop — ele não parava, girava no lugar. O que quebra aqui é a *ação* do loop: ele foi e de fato fez algo que não deveria. E quanto mais permissão e autonomia o loop carrega, mais dano um único mau julgamento causa. Então, ao lado das comportas automáticas do próprio harness — condições de parada, fallbacks — o punhado de pontos onde um engano não pode ser desfeito precisa de mais uma comporta, uma **humana**, dando a uma pessoa a chance de dizer "espere aí" antes de a ação aterrissar.

Isto não é desconfiança da automação. É uma admissão. O modelo pode rodar por um longo trecho de turnos, e como diz a orientação da Anthropic, "The LLM will potentially operate for many turns, and you must have some level of trust in its decision-making."[^S1] (O LLM potencialmente vai operar por muitos turnos, e você precisa ter algum nível de confiança na tomada de decisão dele.) Confiança não é o mesmo que carta branca o caminho todo, porém. Confiança é o que deixa ele andar a maioria dos passos sozinho; a comporta humana guarda os poucos cruzamentos onde a curva errada não pode ser desfeita.

## Três tipos de intervenção: interromper, redirecionar, aprovar

Estender a mão para dentro de um loop nem sempre é só "faça parar". Ordenados pelo que o loop faz depois, há três movimentos, cada um cortando num ponto diferente e mudando algo diferente.

**Interromper — cancelar o loop inteiro.** O mais direto dos três: seja lá o que o modelo queira fazer neste turno, o loop termina e nenhuma outra requisição sai. Parece com as condições de parada da Lição 3; a diferença é quem puxa o gatilho. Uma condição de parada é o harness recuando por conta própria por uma regra pré-definida. Uma interrupção é uma pessoa fora do loop apertando o stop na mão. Você a usa quando já consegue ver que a direção está inteiramente errada e continuar só queima tokens. Depois de uma interrupção o loop acabou — não há "e então".

**Redirecionar — mudar o objetivo ou passar novas instruções, e então deixar continuar.** Este não termina nada. Ele empurra uma mensagem humana nova para dentro da conversa, mudando para o que o modelo se inclina em seguida, e o loop carrega essa instrução adiante. Digamos que o agente esteja moendo a refatoração de algum módulo e você repare num bug de produção mais urgente. Sem reiniciar o processo, você consegue soltar: "pause a refatoração, primeiro rastreie e corrija aquele 500 no endpoint de login". Redirecionar muda o *objetivo* do loop, não se o loop vive.

**Aprovar — dar sinal verde a um único passo; sem aval, sem ação.** Os dois primeiros agem sobre o loop inteiro. A aprovação age sobre uma ação específica: o loop chega a uma operação de alto impacto, para, expõe "aqui está o que estou prestes a fazer", e executa só se uma pessoa disser sim — pulando ou cancelando se disser não. É na verdade só um tipo muito disciplinado de pausa: "Agents can then pause for human feedback at checkpoints or when encountering blockers."[^S1] (Os agentes podem então pausar para feedback humano em checkpoints ou ao encontrar bloqueios.) A aprovação é esse checkpoint, fincado com precisão bem na frente das ações perigosas. Uma vez que a aprovação passa, o loop volta ao seu ritmo normal. É também o mais rotineiro dos três, e o mais adequado a ficar ligado em permanência.

Uma linha para não confundi-los: uma interrupção decide se o loop **vive**, redirecionar decide para onde o loop **aponta**, a aprovação decide se **uma ação** passa. O harness mínimo da Lição 6 é onde a aprovação de fato vira código.

## Escrevendo a válvula de aprovação no loop: pare antes de a ação aterrissar

Dos três, a aprovação é a que mais precisa morar no código do harness. Interromper e redirecionar geralmente podem ser disparados por uma pessoa digitando algo num terminal; a aprovação tem de ser o harness parando ativamente no ponto certo e esperando. Deixe-a de fora e o loop simplesmente faz a coisa perigosa.

Uma das mitigações da OWASP para agência excessiva diz: "Utilise human-in-the-loop control to require a human to approve high-impact actions before they are taken."[^S4] (Utilize controle humano no loop para exigir que um humano aprove ações de alto impacto antes de elas serem realizadas.) Observe a ordem nessa frase — aprovar **antes** de serem realizadas. Aprovar primeiro, executar depois; não executar primeiro e coletar uma assinatura depois. Onde a válvula fica fisicamente, o padrão deixa em aberto: "This may be implemented in a downstream system (outside the scope of the LLM application) or within the LLM extension itself."[^S4] (Isto pode ser implementado num sistema a jusante — fora do escopo da aplicação do LLM — ou dentro da própria extensão do LLM.) Jogado sobre o nosso loop, o lar natural é o dispatch de ferramentas — uma pausa inserida bem antes de qualquer ferramenta marcada como de alto impacto ser de fato chamada.

Em código, é uma bifurcação colocada na frente da linha que roda a ferramenta:

```javascript
// Dentro do corpo do loop, depois de você ter os blocos tool_use deste turno e antes de qualquer execução
for (const block of toolUseBlocks) {
  if (isHighImpact(block.name)) {
    // Exponha o que ele pretende fazer: nome da ferramenta + argumentos
    const decision = await askHuman(block.name, block.input);
    if (decision !== "approve") {
      // Sem aval: não execute. Devolva "negado" como um tool_result para o modelo repensar
      results.push({
        type: "tool_result",
        tool_use_id: block.id,
        content: "A human denied this operation. Do not retry it; find another way.",
        is_error: true,
      });
      continue; // A linha-chave: pula a execução real abaixo
    }
  }
  // Baixo impacto, ou já aprovado: rode como de costume
  const output = await executeTool(block.name, block.input);
  results.push({ type: "tool_result", tool_use_id: block.id, content: output });
}
```

Três pontos merecem uma olhada. Primeiro, a checagem fica **antes** de `executeTool` — a pausa tem de acontecer antes de a ação aterrissar, para que, enquanto você espera por um humano, a operação perigosa ainda não tenha rodado. Segundo, uma negação não é um pulo silencioso; ela retorna um `tool_result` com `is_error` marcado (lembra daquele campo da Lição 2?), então o modelo aprende que esse caminho está bloqueado e vai procurar outra abordagem em vez de propor a ação idêntica de novo no turno seguinte. Terceiro, `isHighImpact` só para as operações de alto impacto — ler um arquivo, checar um log e outros movimentos inofensivos passam intocados. Do contrário todo passo precisa de um aval humano e o agente decai a uma ferramenta manual cara.

```agentmentor-check
{
  "id": "harness-zh-05-approve-before-not-after",
  "label": "Decidir de que lado de uma operação destrutiva o ponto de aprovação humana fica",
  "prompt": "Seu agente de operações tem uma ferramenta drop_table que apaga tabelas no banco de dados de produção. Um colega sugere: deixe o loop executar automaticamente como de costume, e apenas registre qual tabela foi apagada num log de auditoria depois de cada execução, mais dispare uma notificação para um humano poder revisar. Assim você tem um registro e não desacelera o loop. Esse desenho de “registrar e notificar depois” cumpre o trabalho que a aprovação humana no loop deveria cumprir?",
  "whyHere": "A seção acabou de estabelecer que a válvula de aprovação precisa parar antes de a ação aterrissar (aprovar antes de ela ser realizada), e “registrar e notificar após o fato também conta como colocar um humano no loop” é o sósia mais próximo e o autoengano mais fácil de cair — tem de ser pego bem aqui, porque confunde rastreabilidade com interceptação.",
  "mode": "single",
  "choices": [
    {
      "id": "a",
      "text": "Sim. Com um log de auditoria e uma notificação, uma pessoa sempre consegue ver o que o agente fez — o humano está no loop, então a aprovação cumpriu seu papel.",
      "correct": false,
      "feedback": "Isso confunde rastreabilidade após o fato com interceptação antes do fato. A aprovação existe para impedir que uma ação destrutiva aconteça, e quando essa notificação sai, drop_table já rodou contra produção — a tabela sumiu, e revisar só confirma a perda. Logs e notificações valem a pena ter, mas resolvem “conseguimos descobrir o que aconteceu”, não “conseguimos impedir que aconteça”."
    },
    {
      "id": "b",
      "text": "Não. A aprovação tem de ficar antes de drop_table rodar, com o aval vindo primeiro; um registro após o fato dá rastreabilidade, não interceptação.",
      "correct": true,
      "feedback": "Certo. A ordem é o que faz a aprovação humana no loop funcionar: aprovar primeiro, executar depois, com a pausa aterrissando no momento em que a ação ainda pode ser cancelada. Uma operação irreversível como drop_table não pode ser desfeita depois de concluída, então uma comporta colocada após a execução é uma comporta só no nome. A versão que funciona para antes de drop_table ser chamada, mostra ao humano qual tabela está prestes a ir, só continua com uma aprovação explícita, e numa negação pula a execução e devolve a recusa ao modelo para ele achar outra rota."
    },
    {
      "id": "c",
      "text": "Sim, desde que a notificação seja rápida o bastante — uma pessoa pode restaurar manualmente a tabela logo depois do apagamento, então o efeito dá na mesma.",
      "correct": false,
      "feedback": "Isso se apoia na sorte e num botão de desfazer que pode não existir. Se drop_table é reversível depende de haver um backup utilizável e de ele poder ser restaurado a tempo, e muitas operações irreversíveis não têm caminho algum de “apagar e depois restaurar”. O ponto inteiro da aprovação é não apostar nisso — segure a ação irreversível antes de ela executar e você não precisa torcer para uma correção estar disponível depois."
    }
  ]
}
```

## Onde a comporta fica: antes de a ação se tornar irreversível, não depois

Aquela válvula de aprovação funciona inteiramente porque está no lugar certo. Esta seção puxa essa colocação para fora por conta própria, porque é a coisa desta lição que mais facilmente se lembra ao contrário — e a mais cara de acertar ao contrário.

A regra em uma frase: **a pausa de aprovação fica antes de a ação se tornar irreversível, não depois.** Você já encontrou essa ideia no curso anterior "Tool calling de agentes: fazendo agentes agirem de verdade" — quanto maior o raio de impacto de uma ação e menos ela pode ser desfeita, mais cedo o ponto de confirmação dela tem de ficar. Eis como isso aterrissa no loop: a checagem fica na linha acima de `executeTool`, então durante a espera por um humano a ação destrutiva ainda não aconteceu. Mova-a para baixo, e quando você reage a tabela está apagada, o e-mail saiu para todo mundo, a configuração de produção já mudou — e por mais preciso que o log seja, tudo o que ele fez foi tirar uma foto dos destroços.

Como você identifica "irreversível"? Dê a si mesmo um teste contrafactual: se esta ação rodar e estiver errada, consigo desfazê-la em um passo? Coisas que revertem barato — escrever um arquivo de rascunho, salvar um rascunho interno — não precisam de comporta, ou de uma bem frouxa. Coisas que você não pode desfazer, ou só pode desfazer a um custo enorme — apagar um banco de dados, mover dinheiro, publicar para fora, mudar a configuração de produção — precisam da comporta cedo, e precisam que ela seja "aprovar primeiro, depois fazer". Isso também se junta bem com a Lição 4: aquela lição era sobre impedir o loop de queimar recursos, esta é sobre impedir o loop de fazer algo que não pode ser chamado de volta. A primeira é um ritmo saindo de controle, a segunda é uma ação saindo de controle, e ambas precisam de sua comporta posta antes de o "tarde demais" chegar.

Um detalhe que as pessoas rotineiramente ignoram: a comporta pertence ao passo mais próximo de onde a ação de fato aterrissa. Suponha que apagar a tabela passe por várias mãos — o modelo propõe, o harness despacha, `drop_table` é chamada. Não basta pôr a aprovação no passo "o modelo propõe", porque a proposta em si não causa dano nenhum. Como disse a Lição 1, "The model never executes anything on its own."[^S2] (O modelo nunca executa nada por conta própria.) O dano mora naquela chamada final de `executeTool`. Empurre a comporta o mais para o lado da execução que você conseguir, e o modelo pode mudar de ideia e refazer seus argumentos quantas vezes quiser — tudo isso ainda deste lado da comporta, onde ninguém se machuca.

## Como a Lição 6 dobra os três em um só loop

Alinhe esta lição com as anteriores e o conjunto de controles do harness fica completo: as **condições de parada** da Lição 3 (recuar automaticamente quando é hora), os **fallbacks de descontrole** da Lição 4 (identificar loops mortos e giro em falso, não queimar o orçamento), e a **aprovação humana no loop** desta lição (uma comporta manual antes de ações perigosas aterrissarem). Não são um escolha-um-dos-três. São três camadas empilhadas sobre o mesmo loop — as condições de parada governam por quanto tempo ele roda, os fallbacks governam o que acontece quando ele sai do curso, a aprovação governa se este movimento em particular pode acontecer.

A Lição 6 solda os três em um só harness mínimo executável: um loop while com um teto de turnos, detecção de giro em falso e uma válvula de aprovação em operações de alto impacto. Você vai ver lá como a bifurcação `isHighImpact` desta lição, o contador da Lição 3 e a checagem de progresso da Lição 4 cada um toma sua posição dentro de um único corpo de loop sem brigar entre si. Para esta lição, segurar duas coisas basta: o que cada uma das três intervenções muda, e que a comporta de aprovação tem de ficar antes do ponto sem retorno.

<!-- exercises -->
## 💻 Exercícios

### Nível 1: Rotular três movimentos de intervenção

Um agente de deploy está rodando automaticamente um pipeline "build → testar → liberar para produção". Abaixo estão três coisas que o engenheiro de plantão faz em momentos diferentes. Para cada uma, decida se é uma **interrupção**, um **redirecionamento** ou uma **aprovação**, e diga por quê (ela terminou o loop, mudou o objetivo do loop, ou deu sinal verde a uma ação?).

1. O agente para logo antes do passo "liberar para produção". Um prompt aparece na tela: "Prestes a liberar a v2.3.1 para produção. Confirmar?" O engenheiro dá uma olhada no número da versão, clica em "Confirmar", e o agente prossegue com a liberação.
2. O agente fica tentando de novo um teste que falha toda vez. O engenheiro decide que esse caminho não leva a lugar nenhum, aperta o stop, e o pipeline inteiro termina e o processo encerra.
3. O agente ainda está rodando testes quando o engenheiro solta uma mensagem: "Não envie a 2.3.1 — o cliente quer a 2.3.0, mude para essa versão e continue." O agente segue em frente com o novo número de versão.

<!-- rubric -->
- Os três são corretamente rotulados aprovação, interrupção e redirecionamento
- Cada julgamento aterrissa na linha divisória: ele muda uma ação, a sobrevivência do loop, ou a direção do loop
- Identifica que a chave do item 1 é "a pausa acontece antes de a ação de alto impacto de liberação executar, e ela espera um aval humano antes de continuar"

<!-- answer -->
1. **Aprovação.** O loop não terminou e o objetivo não mudou; o engenheiro só deu sinal verde a uma ação de alto impacto, "liberar para produção". A ordem é o que importa: a pausa acontece antes de a liberação de fato executar, e ela só continua depois que "Confirmar" volta — é exatamente o que o "aprovar primeiro, executar depois" da aprovação humana no loop parece.
2. **Interrupção.** No que o engenheiro agiu foi se o loop vive: o pipeline inteiro é cancelado e o processo encerra, sem "e então". Parece com uma condição de parada, mas o gatilho é uma pessoa fora do loop apertando o stop na mão, não o harness recuando automaticamente por uma regra pré-definida.
3. **Redirecionamento.** O loop nunca parou. O engenheiro empurrou uma instrução nova para dentro da conversa, mudando para o que o loop se inclina em seguida (um número de versão diferente), e o agente carregou o novo objetivo adiante. Isso é direção, não sobrevivência, e não é dar sinal verde a um único passo.

<!-- hint -->
Faça uma pergunta primeiro: depois de isto acontecer, o loop ainda está rodando? Se parou de vez, é uma interrupção. Se ainda está rodando, olhe se o que mudou foi "o objetivo geral do loop" ou "se uma ação específica deve acontecer".

<!-- hint -->
Os itens 1 e 2 se agrupam ambos em torno de liberação e testes, o que os torna fáceis de confundir. A diferença é o desfecho: um deixa o loop continuar depois de dar sinal verde a um passo (aprovação), o outro encerra o loop de vez (interrupção).

### Nível 2: Colocar a válvula de aprovação no lugar certo

O corpo de loop abaixo tenta adicionar aprovação humana a um agente que consegue enviar e-mail externo, mas o jeito como está escrito tem um problema: o e-mail já foi enviado quando o humano é consultado. Aponte o que está errado na colocação, ao que isso leva, e mova a válvula de aprovação para a posição correta.

```javascript
for (const block of toolUseBlocks) {
  const output = await executeTool(block.name, block.input);
  results.push({ type: "tool_result", tool_use_id: block.id, content: output });

  if (block.name === "send_external_email") {
    const decision = await askHuman(block.name, block.input);
    if (decision !== "approve") {
      console.log("A human did not approve this email"); // mas o e-mail já saiu
    }
  }
}
```

<!-- rubric -->
- Localiza o problema-raiz: `askHuman` aparece depois de `executeTool`, então o e-mail sai antes de o humano ser consultado, transformando a aprovação num registro após o fato que não para nada
- Explica a consequência: `send_external_email` é uma ação externa irreversível, então mesmo um "não" depois não pode desfazê-la e a comporta é uma comporta só no nome
- A correção move o bloco inteiro de "isto é alto impacto + esperar aprovação" para antes de `executeTool`, pula a execução quando não aprovado, e devolve a negação ao modelo (por exemplo como um tool_result com `is_error`)

<!-- answer -->
O problema-raiz: **a válvula de aprovação está depois de `executeTool`.** O código roda a ferramenta incondicionalmente — momento em que o e-mail já saiu — e só então pergunta a um humano. Então tudo o que `askHuman` faz é registrar a opinião de alguém após o fato. `send_external_email` é uma ação externa irreversível; uma vez que o correio se foi ele não pode ser chamado de volta, e um "não" só confirma um incidente que já aconteceu. Uma comporta colocada depois de a ação aterrissar é o mesmo que nenhuma comporta.

Corrigindo: mova o bloco inteiro de "checar alto impacto + esperar aprovação" para antes da execução, pule a execução quando não aprovado, e devolva a negação ao modelo para ele tomar outra rota.

```javascript
for (const block of toolUseBlocks) {
  if (block.name === "send_external_email") {
    const decision = await askHuman(block.name, block.input); // pergunte antes de enviar
    if (decision !== "approve") {
      results.push({
        type: "tool_result",
        tool_use_id: block.id,
        content: "A human denied this email; it was not sent. Do not retry; handle it another way.",
        is_error: true,
      });
      continue; // A linha-chave: pula a execução real abaixo, para o e-mail nunca sair
    }
  }
  const output = await executeTool(block.name, block.input); // só chamadas de baixo impacto ou aprovadas chegam aqui
  results.push({ type: "tool_result", tool_use_id: block.id, content: output });
}
```

Agora a pausa acontece antes de o e-mail de fato sair: ele envia com um aval, e numa recusa não envia de jeito nenhum, enquanto o modelo aprende que esse caminho está bloqueado.

<!-- hint -->
Observe a ordem de duas linhas: `executeTool` (de fato envia o correio) e `askHuman` (pergunta a uma pessoa). Qual roda primeiro agora? A aprovação humana no loop exige "aprovar primeiro, executar depois" — verifique se a ordem está invertida.

<!-- hint -->
Inverter a ordem não basta sozinho — quando a aprovação não passa, a ferramenta precisa genuinamente **não rodar** (use `continue` para pulá-la), e é melhor devolver a negação ao modelo como um `tool_result` com `is_error`, ou ele bem pode propor o mesmo e-mail de novo no turno seguinte.

<!-- /exercises -->

## Recapitulação

- Quanto mais autônomo o loop, mais ele precisa de uma comporta humana nos pontos críticos: agência excessiva significa que uma saída inesperada, ambígua ou manipulada do modelo pode disparar ações danosas que não podem ser desfeitas[^S4]; confiar num modelo que pode operar por muitos turnos[^S1] não é o mesmo que carta branca, e a comporta humana guarda os poucos cruzamentos onde uma curva errada não pode ser desfeita
- As três intervenções governam cada uma uma camada diferente: **interromper** age sobre se o loop vive (uma pessoa cancela o loop inteiro de fora), **redirecionar** age sobre para onde ele aponta (empurra uma instrução nova, muda o objetivo, continua rodando), **aprovar** age sobre se uma ação passa (pausa antes de uma operação perigosa e espera um aval); a última é exatamente a ideia de "pause for human feedback at checkpoints"[^S1] (pausar para feedback humano em checkpoints) fincada na frente de ações de alto impacto
- A regra rígida da aprovação humana no loop é aprovar primeiro, executar depois: ações de alto impacto exigem que um humano as aprove antes de elas serem realizadas[^S4], e a válvula pode morar num sistema a jusante ou dentro da própria extensão do agente[^S4]
- A comporta fica antes de a ação se tornar irreversível, não depois: fincada acima de `executeTool`, a ação destrutiva ainda não aconteceu enquanto você espera por um humano; movida para baixo da execução, até o log mais preciso é rastreamento após o fato e não para nada que já aterrissou. Use o teste contrafactual para identificar "irreversível" — se rodar errado, consigo desfazer em um passo?
- A aprovação desta lição, as condições de parada da Lição 3 e os fallbacks de descontrole da Lição 4 são três camadas empilhadas sobre o mesmo loop, e a Lição 6 as solda juntas num harness mínimo executável

[Lição 6 >>](./06-build-a-harness.md)