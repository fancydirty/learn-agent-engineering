# Lição 5: Subagentes e isolamento de contexto

> Objetivos de aprendizado:
> - Explicar por que um subagente conta como um movimento de gestão de contexto: uma janela limpa mais um resumo devolvido, mantendo o “processo” fora da janela principal
> - Usar a razão entre tokens de processo e tokens de conclusão, mais dados reais de custo, para julgar se vale a pena entregar uma tarefa a um subagente
> - Ligar o despacho de subagentes ao loop de harness que você escreveu no curso 7 desta série, de modo que cada despacho devolva exatamente um resumo à janela principal
>
> Pré-requisitos: Você concluiu a Lição 4 sobre compactação e notas, e consegue rodar o loop de harness que escreveu no curso 7 desta série, “Fundamentos do Harness de Agente: Laços e Controle” | Anterior: [Lição 4 <<](./04-compaction-and-notes.md) | Próxima: [Lição 6 >>](./06-build-context-management.md)

## Uma virada de perspectiva: não é divisão de trabalho, é só isolamento

Você já encontrou subagentes no curso 6 desta série, “Colaboração Multiagente”: como dividir uma tarefa, como reportar resultados, como vários agentes se coordenam. Aquele curso respondeu à pergunta de como múltiplos agentes trabalham juntos. Esta lição responde a outra: **o que faz de um subagente, antes de mais nada, uma técnica de gestão de contexto?**

Dito de outro jeito: mesmo que você tenha um único agente líder e não precise de coordenação de equipe nenhuma, ainda assim vai querer lançar mão de um subagente — não pela divisão de trabalho, mas pelo isolamento.

Volte à visão de orçamento da Lição 1. Quando um modelo analisa contexto, ele lança mão de um orçamento de atenção, e cada novo token que entra no contexto esgota um pouco desse orçamento[^S1]. Empilhe mais tokens e a capacidade do modelo de recuperar informação com precisão desse contexto declina[^S1]. Um agente é exatamente o cenário mais propenso a empilhar tokens: cada volta do loop produz dados novos que podem ser relevantes para o próximo turno de inferência — difíceis de jogar fora, difíceis de manter[^S1].

Tarefas de exploração são a versão mais aguda disso. Digamos que o agente principal tenha de rastrear todos os pontos de chamada de alguma API obsoleta em um repositório de algumas centenas de milhares de linhas: uma dúzia de greps, vinte arquivos abertos, alguns milhares de linhas lidas. Esse conteúdo intermediário chega a dezenas de milhares de tokens, enquanto a conclusão que vale manter talvez tenha cinco linhas: “os pontos de chamada se concentram nestes três módulos, e aqui está a ordem de migração sugerida”. Se tudo isso acontece na janela principal, o orçamento de atenção é devorado pelo processo, sobrando pouco para a conclusão e para o trabalho que vem depois.

O subagente é a faca apontada exatamente para esse problema.

## O mecanismo: janela limpa na entrada, resumo comprimido na saída

O mecanismo cabe em uma frase: um subagente especializado cuida de uma tarefa focada em uma **janela de contexto limpa**[^S1]; o grande volume de conteúdo intermediário que a exploração gera — resultados de busca, conteúdo bruto de arquivos, becos sem saída — **fica todo dentro do subagente**[^S1]; e o que volta ao agente principal é apenas um resumo condensado e destilado do trabalho dele, muitas vezes de 1.000 a 2.000 tokens[^S1].

A janela do agente principal, portanto, carrega só a conclusão, nunca o processo. É um projeto assimétrico: o subagente pode queimar dezenas de milhares de tokens explorando, mas só um trecho curto de texto chega a sair dele.

Em código, isso é apenas uma nova abertura para o harness que você escreveu no curso 7. Para manter as coisas compactas, duas ações que se repetiam ao longo do loop daquele curso aparecem aqui embrulhadas como auxiliares: `textOf` extrai o bloco de texto de uma resposta, e `appendToolResults` roda as ferramentas deste turno e anexa os blocos `tool_result` ao array de mensagens (internamente ele faz exatamente o que você escreveu à mão naquele curso — rodar cada `tool_use`, coletar os resultados, devolvê-los).

```javascript
const SUBAGENT_SYSTEM = `Você é um subagente de pesquisa.
Quando a tarefa terminar, produza uma conclusão de no máximo 1500 tokens:
achados principais, os caminhos de arquivo envolvidos e ações recomendadas para o agente principal.
Não repita o texto bruto que você leu.`;

async function runSubagent(client, task, maxTurns = 15) {
  // O truque inteiro é esta linha: um array de mensagens novo em folha, nada do histórico do agente principal
  let messages = [{ role: "user", content: task }];
  for (let turn = 0; turn < maxTurns; turn++) {
    const response = await client.messages.create({
      model: "claude-sonnet-5",
      max_tokens: 4096,
      system: SUBAGENT_SYSTEM, // o system prompt do próprio subagente
      tools: SEARCH_TOOLS,     // só as ferramentas de que a exploração precisa
      messages,
    });
    if (response.stop_reason === "end_turn") {
      return textOf(response); // só este texto sai do subagente
    }
    // roda as ferramentas, anexa os resultados a messages, tudo isso fica dentro do subagente
    messages = await appendToolResults(messages, response);
  }
  return "A pesquisa não terminou dentro do orçamento de turnos";
}
```

Repare em três detalhes. Primeiro, `messages` parte de uma única e solitária descrição de tarefa, sem carregar uma palavra do histórico do agente principal — esse é o significado inteiro de “janela limpa”. Segundo, a função retorna `textOf(response)`, uma string simples; as dezenas de idas e vindas de ferramenta que se empilharam dentro do loop desaparecem junto com a variável local `messages`. Terceiro, o system prompt do subagente exige explicitamente “não repita o texto bruto” — a qualidade de compressão do resumo é definida bem aqui.

Do lado do agente principal, a ação de despacho é apenas uma ferramenta comum que se encaixa no loop de stop_reason que você já tem:

```javascript
const DISPATCH_TOOL = {
  name: "dispatch_research",
  description:
    "Entrega uma tarefa de pesquisa focada a um subagente e devolve o resumo dos achados dele. " +
    "Use para tarefas que exigem exploração pesada mas cuja conclusão pode ser dita brevemente.",
  input_schema: {
    type: "object",
    properties: {
      task: {
        type: "string",
        description: "Uma descrição de tarefa autocontida; o subagente não enxerga o histórico desta conversa",
      },
    },
    required: ["task"],
  },
};

async function handleDispatch(mainMessages, toolCall) {
  const summary = await runSubagent(client, toolCall.input.task);
  mainMessages.push({
    role: "user",
    content: [{
      type: "tool_result",
      tool_use_id: toolCall.id,
      content: summary, // a janela principal ganha só esta entrada
    }],
  });
}
```

Olhe a descrição do campo `task`: “Uma descrição de tarefa autocontida; o subagente não enxerga o histórico desta conversa”. Essa linha foi escrita para o agente principal — ele tem de enunciar a tarefa por inteiro, porque do outro lado está uma janela nova e amnésica. Explicitar propósito e fronteiras com essa precisão na descrição de uma ferramenta é exatamente a ideia de “ferramentas como contexto” da Lição 2: as ferramentas devem ser autocontidas, robustas a erro e extremamente claras a respeito do uso a que se destinam[^S1].

```agentmentor-check
{
  "id": "ctx-zh-05-clean-window",
  "label": "Quanto do histórico do agente principal um subagente deve receber no início",
  "prompt": "Você está escrevendo a lógica de despacho de um subagente de pesquisa, e um colega sugere: “Passe ao subagente todo o histórico de mensagens do agente principal até aqui — ele vai entender o quadro geral e fazer um trabalho melhor.” Do ponto de vista da economia de contexto, como você avalia isso?",
  "whyHere": "A seção anterior acabou de estabelecer o mecanismo de “janela limpa na entrada, resumo comprimido na saída”, e “mais contexto não faz mal” é a intuição com mais chance de aparecer exatamente aqui. Isto verifica na hora se quem aprende percebe que é do próprio isolamento que vem o valor.",
  "mode": "single",
  "choices": [
    {
      "id": "a",
      "text": "Está de cabeça para baixo: é no isolamento que mora o valor. Uma janela limpa gasta o orçamento de atenção inteiro na tarefa, e compartilhar o histórico completo faz as duas janelas guardarem a mesma pilha, então o benefício cai a zero.",
      "correct": true,
      "feedback": "A chave é ver de onde vem o benefício: uma janela limpa mantém o orçamento de atenção do subagente inteiramente na tarefa, e o retorno em resumo mantém a janela principal carregando só a conclusão. Assim que as duas janelas guardam o mesmo conteúdo, você está pagando duas contas de token para manter um contexto, e o isolamento acabou."
    },
    {
      "id": "b",
      "text": "O único problema é o custo de transferência: o histórico completo é tokens demais, então comprima primeiro e passe depois, e você tem o melhor dos dois mundos.",
      "correct": false,
      "feedback": "Isso só enxerga a superfície. Mesmo comprimido, o subagente começa carregando histórico sem relação com sua tarefa focada, então sua janela não está limpa desde o primeiro turno e sua atenção se divide — a perda cai sobre a qualidade de raciocínio do subagente, não sobre a conta de transferência."
    },
    {
      "id": "c",
      "text": "A sugestão está boa: mais contexto significa que o modelo entende mais do todo, então o resultado só pode melhorar.",
      "correct": false,
      "feedback": "“Mais contexto é sempre melhor” é exatamente a intuição que este curso vem desmontando desde a Lição 1: mais tokens pioram a recuperação precisa do modelo a partir do contexto, e o orçamento de atenção é um recurso finito. Alimentar um subagente com histórico sem relação com a tarefa dele gasta o orçamento dele, não o ajuda."
    }
  ]
}
```

## Dados de primeira mão: subagentes como filtros inteligentes

O mecanismo está assentado; agora as medições. A Anthropic escreveu publicamente sobre seu sistema multiagente de pesquisa — a arquitetura por trás do recurso Research do Claude — que é um raro material de engenharia de primeira mão[^S3].

Três de seus achados falam diretamente a esta lição:

- **Os subagentes viabilizam a compressão ao operarem em paralelo com suas próprias janelas de contexto**[^S3]. Cada subagente explora em uma janela só dele, sem apertar as demais.
- Eles chamam os subagentes de "intelligent filters" (filtros inteligentes): condensando os tokens mais importantes para o agente de pesquisa líder[^S3]. A palavra “filtro” é certeira — entra corpus, saem os pontos essenciais.
- Uma frase que vale mastigar: "The essence of search is compression: distilling insights from a vast corpus."[^S3] (a essência da busca é a compressão: destilar insights de um corpus vasto.) Lida no contexto desta lição: toda exploração que um subagente roda existe para produzir aquele destilado de mil tokens.

Como observação lateral, o paralelismo também compra velocidade — várias linhas de pesquisa avançando ao mesmo tempo. Mas isso é assunto de orquestração, já coberto no curso 6 desta série; esta lição mantém o olho apenas no lado da compressão.

## O outro lado do balanço: isolamento não é economia de custo

Com a vantagem exposta, a conta também precisa ser exposta. O mesmo texto traz os números medidos — note que são medições do sistema de pesquisa da Anthropic, não leis universais:

- Os agentes normalmente usam cerca de 4× mais tokens do que interações de chat[^S3];
- Os sistemas multiagente usam cerca de 15× mais tokens do que os chats[^S3];
- Quando analisaram de onde vinha o desempenho, o uso de tokens sozinho explicou 80% da variância, com o número de chamadas de ferramenta e a escolha do modelo respondendo pela maior parte do resto[^S3].

A conclusão deles é franca: "Multi-agent systems work mainly because they help spend enough tokens to solve the problem."[^S3] (os sistemas multiagente funcionam principalmente porque ajudam a gastar tokens suficientes para resolver o problema.)

Então vamos ser diretos: **um subagente não é uma economia de custo.** O total de tokens só sobe — a tarefa tem de ser reenunciada, o pano de fundo reassentado, várias janelas queimando ao mesmo tempo. O que ele compra é outra coisa: cada janela permanece em uma faixa que não se degradou, então a densidade de atenção se mantém alta o tempo todo. É uma troca de atenção — gaste mais tokens no total, ganhe uma janela limpa para cada um.

Quando essa troca vale a pena? De volta à visão de orçamento da Lição 1: o contexto é um recurso finito com retornos marginais decrescentes[^S1]. Duas perguntas para julgar:

1. **Razão entre processo e conclusão.** Quão grande é o conteúdo intermediário desta tarefa, e quão pequena é sua conclusão final? Quanto mais desequilibrada a razão, maior o retorno do isolamento. Na direção contrária, uma tarefa cujo processo já é curto vira puro custo de repasse se você a despachar.
2. **Se a complexidade melhora comprovadamente o resultado.** A orientação da Anthropic é considerar adicionar complexidade apenas quando isso melhorar comprovadamente os resultados — a palavra no original é "consider" (considerar), uma questão de proporção, não uma regra de ferro[^S2]. Se os tokens extras não compram uma saída melhor, volte para uma janela só.

## A combinação para tarefas longas: notas como base, repasses para o fôlego

Por mais limpa que seja a janela de um subagente, ela ainda é finita. Para tarefas genuinamente de horizonte longo, o texto descreve uma combinação: os agentes resumem fases de trabalho concluídas e guardam informação essencial em memória externa[^S3]; depois geram subagentes novos com contextos limpos para seguir adiante, mantendo continuidade por meio de repasses cuidadosos[^S3].

Isso costura a Lição 4 e esta em uma única sequência de movimentos:

- As notas estruturadas da Lição 4 cuidam de “colocar o estado-chave fora da janela” — um NOTES.md, uma lista de tarefas — elas vivem no sistema de arquivos e não ocupam a atenção de janela nenhuma;
- O isolamento desta lição cuida de “manter cada trecho de trabalho dentro de uma janela limpa” — a primeira coisa que um subagente novo faz é ler as notas; ele não precisa herdar o histórico completo de seu antecessor, apenas os pontos essenciais destilados dele.

O que entra em um documento de repasse? Reutilize o mesmo padrão de trade-off da compactação da Lição 4: manter decisões arquiteturais, bugs não resolvidos e detalhes de implementação, e descartar saídas de ferramenta redundantes[^S1]. Escrever um repasse e escrever um resumo de compactação são o mesmo ofício; só muda o leitor, de “você mesmo no futuro” para “o próximo subagente”.

## Como isso aparece no Claude Code

Por fim, confronte tudo isso com uma implementação que você usa todo dia. As boas práticas oficiais do Claude Code colocam a coisa sem rodeios: a janela de contexto enche rápido, e o desempenho se degrada conforme ela enche; "The context window is the most important resource to manage."[^S4] (a janela de contexto é o recurso mais importante a gerenciar.) Como o contexto é a restrição fundamental, os subagentes estão entre as ferramentas mais poderosas disponíveis[^S4].

A implementação dele corresponde ao mecanismo que esta lição descreve: os subagentes rodam em janelas de contexto separadas e reportam de volta resumos[^S4]. Peça ao Claude Code para “encontrar a causa-raiz deste bug” e o subagente que ele despacha vai fazer grep, ler arquivos e seguir a cadeia de chamadas — toda essa exploração acontecendo na janela do próprio subagente, com a conversa principal recebendo apenas um resumo da investigação no final. Delimite investigações de forma estreita ou entregue-as a subagentes, e a exploração não consome seu contexto principal[^S4].

Quando você vê uma subtarefa rodando em segundo plano na interface e a conversa principal ganha apenas um relatório curto quando ela termina, isso é a “janela limpa na entrada, resumo comprimido na saída” que esta lição vem descrevendo desde o começo.

A esta altura você já viu as três peças do kit de tarefas longas: compactação (Lição 4), notas estruturadas (Lição 4) e arquiteturas multiagente (esta lição). O objetivo comum delas é permitir que um agente mantenha coerência, contexto e comportamento orientado a objetivos ao longo de sequências de ações[^S1]. Na Lição 6 nós ligamos as três ao seu próprio harness.

<!-- exercises -->
## 💻 Exercícios

### Nível 1: Decida sobre isolamento para três tarefas

Seu agente principal assume três tarefas:

- **Tarefa A**: Em um repositório de algumas centenas de milhares de linhas, encontre todos os pontos de chamada que ainda usam a API obsoleta `LegacyLedgerReader` e sugira uma ordem de migração.
- **Tarefa B**: O agente principal acabou de ler uma função de 80 linhas para o contexto; o usuário aponta um bug de off-by-one nela e pede uma correção.
- **Tarefa C**: Para uma decisão de escolha de biblioteca, pesquise três bibliotecas de parsing candidatas — leia a documentação de cada uma, vasculhe seu rastreador de issues e faça uma comparação lado a lado.

Para cada tarefa, anote sua decisão — isolar (despachar um subagente) ou não (fazer na janela principal) — apontando o paralelismo onde ele se aplica, e dê uma ou duas frases de justificativa usando os critérios desta lição.

<!-- rubric -->
- Os três julgamentos giram em torno da razão entre tokens de processo e tokens de conclusão: quanto mais pesado o processo e menor a conclusão, mais vale isolar
- A Tarefa B é julgada como não-isolar, com um raciocínio que inclui o lado do custo: a função já está na janela principal, então um subagente novo teria de retransferir a função e o pano de fundo da tarefa, fazendo o custo do isolamento exceder o benefício
- A Tarefa C observa que as três linhas de pesquisa não dependem umas das outras, então podem ocupar janelas separadas em paralelo, cada uma devolvendo apenas os pontos de que a comparação precisa

<!-- answer -->
- **Tarefa A: isolar.** O processo significa uma dúzia de greps e dezenas de arquivos lidos, com conteúdo intermediário possivelmente chegando a dezenas de milhares de tokens; a conclusão é só uma lista de pontos de chamada mais uma ordem de migração, algumas centenas de tokens no máximo. A razão entre processo e conclusão é muito desequilibrada — o caso de manual de “o processo fica dentro do subagente, a conclusão volta para a janela principal”.
- **Tarefa B: não isolar.** A função já está na janela principal e a correção é uma mudança de um passo só, com quase nenhum processo intermediário; um subagente novo significaria apenas retransferir a função bruta e o pano de fundo da tarefa. O isolamento tem um custo próprio, e uma tarefa cujo benefício é menor que esse custo não vale o despacho.
- **Tarefa C: isolar, e rodar as três em paralelo.** A pesquisa sobre as três bibliotecas não tem dependência cruzada, então cada uma toma uma janela separada avançando ao mesmo tempo, e cada uma devolve apenas os pontos de que a comparação precisa (estilo de interface, estado de manutenção, características de desempenho). O agente principal então faz sua comparação lado a lado sobre três resumos, e não sobre três conjuntos de documentação bruta.

<!-- hint -->
Estime primeiro quão grande é o “conteúdo intermediário” de cada tarefa — quantos arquivos ler, quantas buscas rodar — depois estime se a conclusão final cabe em algumas frases, e ponha os dois números lado a lado.

<!-- hint -->
Não esqueça a seção de custo: o isolamento em si gasta tokens (a descrição da tarefa, o pano de fundo reenunciado). Existe alguma tarefa cujo contexto necessário já está sentado na janela principal?

### Nível 2: Corrija uma função de despacho com “isolamento de fachada”

Você ligou um subagente ao harness do curso 7 desta série, com esta lógica de despacho:

```javascript
async function runSubagent(client, task, maxTurns = 15) {
  let messages = [{ role: "user", content: task }];
  for (let turn = 0; turn < maxTurns; turn++) {
    const response = await client.messages.create({
      model: "claude-sonnet-5",
      max_tokens: 4096,
      system: SUBAGENT_SYSTEM,
      tools: SEARCH_TOOLS,
      messages,
    });
    if (response.stop_reason === "end_turn") {
      // acrescenta também a resposta final, devolve o histórico completo
      return [
        ...messages,
        { role: "assistant", content: textOf(response) },
      ];
    }
    messages = await appendToolResults(messages, response);
  }
  return messages;
}

async function handleDispatch(mainMessages, toolCall) {
  const subHistory = await runSubagent(client, toolCall.input.task);
  mainMessages.push({
    role: "user",
    content: [{
      type: "tool_result",
      tool_use_id: toolCall.id,
      // renderiza o histórico inteiro como texto e enfia de volta na janela principal
      content: renderAsText(subHistory),
    }],
  });
}
```

Sintoma: depois de três despachos de pesquisa, o uso de contexto do agente principal está se aproximando do limite da janela, e a lógica de compactação que você instalou na Lição 4 é forçada a disparar cedo. Inspecione o array de mensagens do agente principal e você vai descobrir que a esmagadora maioria dos tokens são os retornos de ferramenta originais do subagente.

Aponte a causa-raiz e edite o código para que cada despacho acrescente apenas um resumo à janela principal.

<!-- rubric -->
- Identifica a causa-raiz no valor de retorno de `runSubagent` e na escrita de volta de `handleDispatch`: o histórico de mensagens completo do subagente (com todos os seus retornos de ferramenta) é renderizado por atacado em texto e enfiado na janela principal, então o isolamento é uma casca oca
- Depois da correção, `runSubagent` devolve apenas o texto do resumo final, o `content` do `tool_result` é esse resumo, e cada despacho acrescenta uma mensagem à janela principal
- Explica a ligação com a Lição 4: a janela principal deixa de ser inundada com o conteúdo de processo do subagente, então a lógica de compactação dispara menos vezes

<!-- answer -->
Causa-raiz: `runSubagent` devolve não a conclusão, mas o **histórico de mensagens completo** do subagente — `messages` vai sendo engordado turno após turno por `appendToolResults`, enchendo-se de resultados de busca e conteúdo bruto de arquivos; então `handleDispatch` renderiza essa pilha inteira como texto com `renderAsText` e a enfia na janela principal. Quanto mais tempo o subagente roda, mais a janela principal é inundada — o processo inteiro reflui, e o isolamento fica reduzido a uma moldura vazia. É exatamente o sintoma: três despachos enchem a janela principal até perto do limite, e o recheio são aqueles retornos de ferramenta brutos.

Correção: deixe apenas o resumo sair do subagente.

```javascript
async function runSubagent(client, task, maxTurns = 15) {
  let messages = [{ role: "user", content: task }];
  for (let turn = 0; turn < maxTurns; turn++) {
    const response = await client.messages.create({
      model: "claude-sonnet-5",
      max_tokens: 4096,
      system: SUBAGENT_SYSTEM,
      tools: SEARCH_TOOLS,
      messages,
    });
    if (response.stop_reason === "end_turn") {
      // devolve só o resumo; o histórico completo morre com a variável local
      return textOf(response);
    }
    messages = await appendToolResults(messages, response);
  }
  return "A pesquisa não terminou dentro do orçamento de turnos";
}

async function handleDispatch(mainMessages, toolCall) {
  const summary = await runSubagent(client, toolCall.input.task);
  mainMessages.push({
    role: "user",
    content: [{
      type: "tool_result",
      tool_use_id: toolCall.id,
      content: summary, // cada despacho acrescenta só esta entrada
    }],
  });
}
```

Depois da correção, a janela principal ganha apenas uma mensagem de resumo por despacho, e o processo de exploração do subagente desaparece junto com a variável local. O efeito em cascata: a janela principal deixa de ser inundada com conteúdo de processo, e a lógica de compactação da Lição 4 não é empurrada para um disparo precoce por três despachos — a compactação fica reservada para as conversas que de fato ficam longas, em vez de limpar a sujeira de uma função de despacho furada.

<!-- hint -->
Rastreie o que está de fato dentro de `renderAsText(subHistory)`: `messages` fica cada vez mais grosso no loop via `appendToolResults` — onde essa pilha inteira vai parar?

<!-- hint -->
Confronte com a seção do mecanismo: o que deveria ter permissão para sair do subagente? Entre “um resumo destilado, muitas vezes de 1.000 a 2.000 tokens” e “o histórico de mensagens completo”, qual deles a janela principal deveria receber?

<!-- /exercises -->

## Recapitulação

- Um subagente é uma técnica de gestão de contexto: a tarefa focada roda em uma janela de contexto limpa, o conteúdo intermediário da exploração fica isolado dentro do subagente, e o que volta é muitas vezes apenas um resumo destilado de 1.000 a 2.000 tokens — a janela principal carrega a conclusão, não o processo[^S1].
- No sistema multiagente de pesquisa da Anthropic, os subagentes rodam em janelas de contexto separadas em paralelo e alcançam compressão por meio disso, atuando como "intelligent filters" (filtros inteligentes) que condensam os tokens mais importantes para o agente líder; "The essence of search is compression"[^S3].
- Números medidos do mesmo sistema: os agentes usam cerca de 4× mais tokens do que os chats, os sistemas multiagente cerca de 15×, e o uso de tokens sozinho explica 80% da variância de desempenho — o isolamento é uma troca de atenção, “gaste mais tokens no total por uma janela que não se degrada”, não uma economia de custo[^S3].
- Se o isolamento vale a pena depende da razão entre processo e conclusão, e de se a complexidade acrescentada melhora comprovadamente o resultado — a palavra da Anthropic é "consider" (considerar), uma questão de proporção e não uma regra de ferro[^S2].
- A combinação para tarefas longas: resuma assim que uma fase se completa, guarde o essencial em memória externa, depois gere um subagente novo com contexto limpo e mantenha a continuidade por meio de repasses cuidadosos — as notas da Lição 4 e o isolamento desta lição formam um par casado[^S3].
- No Claude Code, a janela de contexto é o recurso mais importante a gerenciar, o que faz dos subagentes uma das ferramentas mais poderosas disponíveis: eles rodam em janelas de contexto separadas e reportam de volta apenas resumos[^S4].

[>> Lição 6: Prática: ligando a gestão de contexto ao harness](./06-build-context-management.md)
