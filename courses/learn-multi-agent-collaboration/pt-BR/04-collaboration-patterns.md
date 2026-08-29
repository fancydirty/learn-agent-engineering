# Lição 4: Padrões de colaboração: pipeline, revisão, votação

> Objetivos de aprendizado:
> - Diferenciar como pipeline, produtor-revisor e votação multiperspectiva realmente funcionam
> - Avaliar qual padrão se encaixa em uma tarefa e nomear o perfil de custo de cada um
> - Entender a diferença central de quem detém o controle entre a colaboração no estilo handoff e a colaboração orquestrador-subagente
>
> Pré-requisitos: concluiu a Lição 3, à vontade para escrever prompts de delegação autocontidos e com escopo bem definido | Anterior: [Lição 3 <<](./03-writing-prompts-for-delegation.md) | Próxima: [Lição 5 >>](./05-failure-and-coordination.md)

A estrutura orquestrador-subagente das duas últimas lições é uma forma: um nó central divide a tarefa, vários subagentes trabalham em paralelo e os resultados deles são mesclados de volta. Mas essa não é a única maneira de conectar vários agentes. Esta lição cobre três padrões de colaboração mais específicos — pipeline, produtor-revisor e votação multiperspectiva —, onde cada um se encaixa e para onde vai seu custo, e depois uma quarta forma de colaborar que funciona a partir de uma ideia completamente diferente do orquestrador-subagente: passar o controle adiante por completo.

## Pipeline: uma etapa após a outra, cada uma se alimentando da anterior

**Pipeline** (encadeamento de prompts): "Prompt chaining decomposes a task into a sequence of steps, where each LLM call processes the output of the previous one."[^S2] A maior diferença entre um pipeline e o orquestrador-subagente é esta: o orquestrador-subagente é uma estrutura paralela — "a central LLM dynamically breaks down tasks, delegates them to worker LLMs, and synthesizes their results."[^S2] Um pipeline é estritamente uma etapa após a outra — a próxima etapa não pode começar até a anterior terminar, e toma a saída dessa etapa anterior diretamente como sua própria entrada.

Tome um post de blog de lançamento de produto. Você pode dividi-lo em três etapas: rascunhar uma primeira versão, traduzir o rascunho para outro idioma e depois verificar a versão traduzida em busca de terminologia inconsistente. A entrada da etapa dois é a saída da etapa um; a entrada da etapa três é a saída da etapa dois; nenhuma delas pode pular à frente e começar por conta própria. Essa forma se encaixa em tarefas que carregam uma ordem natural, em que a próxima etapa genuinamente não consegue prosseguir sem o resultado da etapa anterior. Diferentemente de pesquisar os preços de três empresas, que de fato se divide em blocos independentes, cada etapa de um pipeline depende da que vem antes dela.

## Produtor-revisor: um escreve, o outro disseca, repete

**Produtor-revisor** (avaliador-otimizador): "one LLM call generates a response while another provides evaluation and feedback in a loop."[^S2] A diferença central em relação a um pipeline é esse loop. Um pipeline percorre um conjunto fixo de etapas e para; o produtor-revisor vai do rascunho, o revisor dá feedback, revisa-se de acordo com o feedback, revisa de novo, e não para até o revisor ficar satisfeito (ou até atingir um número máximo de rodadas pré-definido). Quantas rodadas serão necessárias normalmente não se sabe de antemão.

Por exemplo, coloque um agente para escrever código que lida com a lógica de pagamento e outro agente cujo único trabalho é verificar se esse código deixa passar casos extremos — um valor negativo, um envio duplicado sob concorrência. Se o agente revisor encontrar um problema, o código volta ao agente produtor para mais uma passada e depois retorna ao revisor, até o revisor não ver problemas óbvios. Essa forma se encaixa em tarefas em que “ele fez um bom trabalho” não pode ser julgado com precisão de uma só vez e precisa de polimento repetido para convergir. A primeira versão raramente é a final; a etapa de revisão existe para pegar problemas óbvios antes da entrega e empurrar o produtor a revisar mais uma vez.

## Votação multiperspectiva: vários julgamentos independentes sobre uma mesma coisa

**Votação multiperspectiva**: vários agentes julgam o mesmo conteúdo de forma independente, em vez de processá-lo passo a passo em um revezamento. O exemplo oficial é uma revisão de segurança de código: "Reviewing a piece of code for vulnerabilities, where several different prompts review and flag the code if they find a problem."[^S2] Aqui, os “vários prompts diferentes” olham cada um para o mesmo código de forma independente, nenhum dependendo do julgamento de outro; basta um prompt sinalizar um problema para o código ser sinalizado e valer uma análise mais atenta.

Esse padrão difere do produtor-revisor. A votação não é um loop de rascunhar-e-revisar; os agentes julgam um conteúdo já existente em paralelo e de forma independente. O objetivo é reduzir as chances de um deslize verificando de vários ângulos diferentes, não tornar o conteúdo melhor por meio de edições repetidas. Ele se encaixa em situações em que você prefere gastar algumas chamadas a mais a deixar um problema escapar — em revisões de segurança e verificações de conformidade, deixar passar um problema real costuma custar muito mais do que alguns tokens a mais.

## Escolhendo entre os três e para onde vai o custo

Os três padrões têm estruturas de custo diferentes, então escolha fazendo as contas em relação à sua situação real:

- **Pipeline**: o custo total é aproximadamente a soma das chamadas ao longo das etapas. A contagem de etapas é fixa e previsível, mas, como a execução é estritamente sequencial, a latência total é o tempo de cada etapa somado, então não será rápido. Bom para tarefas com dependências claras de etapa a etapa, em que o escopo de cada etapa é bem pequeno.
- **Produtor-revisor**: o custo depende de quantas rodadas leva para convergir, e a contagem de rodadas é incerta. Quando o produtor e o revisor entram em um vai e vem, o custo pode ir muito além do que você esperava — por isso esse padrão normalmente precisa de um limite máximo de rodadas no loop, para não ficar girando para sempre. Bom para tarefas em que a primeira versão provavelmente não é boa o suficiente e precisa de polimento repetido.
- **Votação multiperspectiva**: o custo é aproximadamente o custo de uma única revisão vezes o número de agentes votando — uma multiplicação direta, então N agentes significam N vezes o custo. Bom para tarefas em que um deslize é caro e você prefere pagar mais por uma cobertura mais ampla; uma má escolha para situações sensíveis a custo em que o conteúdo em si não é muito arriscado.

Para escolher, volte à forma da própria tarefa. Ela tem uma ordem natural de etapas? Se sim, considere um pipeline. A qualidade da saída precisa de polimento repetido para ser boa o suficiente? Se sim, considere o produtor-revisor. Deixar passar um problema é caro o bastante para valer verificar de vários ângulos? Se sim, considere a votação multiperspectiva. Os três também não são mutuamente exclusivos — um fluxo de trabalho completo pode percorrer um pipeline fixo e aninhar um loop produtor-revisor dentro de uma de suas etapas. A Lição 6 constrói exatamente esse tipo de combinação na prática.

```agentmentor-check
{
  "id": "mac-zh-04-pipeline-vs-reviewer",
  "label": "Pipeline ou produtor-revisor?",
  "prompt": "A tarefa: colocar um agente para escrever um rascunho de alguma documentação de API e depois colocar outro agente para verificar se o rascunho está sem alguma descrição de parâmetro; se estiver faltando algo, devolver ao agente de documentação para preencher, e repetir até a verificação passar. Isso é um padrão pipeline ou um padrão produtor-revisor?",
  "whyHere": "Pipeline e produtor-revisor ambos entregam a saída de um agente ao próximo, então na superfície parecem iguais, e é fácil se deixar levar por essa estrutura superficial e perder a diferença central — se há ou não um retorno ao início. Os três padrões e como escolher entre eles acabaram de ser cobertos, então um cenário concreto aqui fixa os critérios de julgamento em algo prático.",
  "mode": "single",
  "choices": [
    {
      "id": "a",
      "text": "Produtor-revisor — um loop de escrever-revisar-corrigir que só termina quando a verificação passa.",
      "correct": true,
      "feedback": "Correto. A definição oficial de produtor-revisor é uma chamada gerando uma resposta enquanto outra fornece avaliação e feedback em um loop; o loop aqui só converge quando a verificação passa. “Devolver para reescrever se a verificação falhar” é exatamente esse loop, diferente da execução fixa e unidirecional de um pipeline — um pipeline não devolve a saída de uma etapa para refazer uma etapa anterior só porque ela não ficou boa o suficiente."
    },
    {
      "id": "b",
      "text": "Pipeline — há duas etapas, e a primeira alimenta sua saída para a segunda.",
      "correct": false,
      "feedback": "Olhar apenas para “há uma ordem de etapas, e a etapa posterior processa a saída da anterior” não basta. Um pipeline percorre um conjunto fixo de etapas e para; ele não devolve trabalho. Aqui uma verificação que falha volta ao agente de documentação para adicionar mais, repetidamente até passar, então a contagem de rodadas não é fixa. Esse é o loop produtor-revisor, não a execução sequencial de uma só passada de um pipeline."
    },
    {
      "id": "c",
      "text": "Nenhum — isso é votação multiperspectiva, já que dois agentes fazem cada um um julgamento.",
      "correct": false,
      "feedback": "A votação multiperspectiva exige que vários agentes julguem o mesmo conteúdo já existente de forma independente, em paralelo e sem depender uns dos outros, para ampliar a cobertura contra problemas deixados passar. Aqui os dois agentes estão em um revezamento — escrever, verificar, corrigir — e o feedback do agente verificador muda o que o agente produtor faz em seguida. Isso não é julgamento independente em paralelo, então não se encaixa na definição de votação."
    }
  ]
}
```

## Outra maneira de colaborar: passar o controle adiante por completo

Os padrões vistos até aqui compartilham uma coisa: o orquestrador (ou o nó de ligação em um pipeline) permanece no comando de tudo, e os subagentes devolvem resultados quando terminam, em vez de manter o volante e dirigir o que vem a seguir. Mas há uma ideia completamente diferente de colaboração — **handoff**: "Handoffs: Peer agents hand off control to a specialized agent that takes over the conversation. This is decentralized."[^S4]

A diferença central entre handoff e orquestrador-subagente não é apenas quem detém o controle — é também que o agente que assume vê uma quantidade de informação completamente diferente. A documentação é explícita: "When a handoff occurs, it's as though the new agent takes over the conversation, and gets to see the entire previous conversation history."[^S5] Esse é o comportamento padrão, e há opções de configuração como filtros de entrada para mudar quanto do histórico o novo agente vê. Isso é o exato oposto do mecanismo de subagente das Lições 2 e 3: subagentes partem de um contexto novo e isolado e não veem a conversa anterior[^S3], enquanto o agente que recebe um handoff vê o histórico completo por padrão, porque ele não é despachado para fazer uma tarefa isolada e devolver um resultado — ele genuinamente assume a conversa e segue dali com o usuário ou com a próxima etapa.

Essa diferença decide quais situações cada estilo atende. O orquestrador-subagente se encaixa em separar um lote de subtarefas independentes em que cada uma devolve uma conclusão e o nó central permanece no comando de tudo. O handoff se encaixa no caso em que, à medida que a conversa avança, você percebe que um agente mais especializado deveria assumir dali, e você entrega a conversa inteira intacta — digamos, no suporte ao cliente, um agente de suporte geral julga que o problema do usuário envolve um reembolso e entrega a conversa inteira a um agente especializado em reembolsos, para que o usuário não precise descrever o problema tudo de novo. Essa transferência de controle ainda acontece dentro de uma única execução, porém: "Handoffs stay within a single run."[^S5]

<!-- exercises -->
## 💻 Exercícios

### Nível 1: Associe três tarefas a padrões de colaboração

Para cada uma das três tarefas abaixo, decida se ela se encaixa melhor em pipeline, produtor-revisor ou votação multiperspectiva, e explique por quê.

1. “Traduza um documento técnico para outro idioma, depois verifique se a terminologia especializada é usada de forma consistente na tradução e, por fim, formate-o no modelo de documento da empresa.”
2. “Revise um rascunho de contrato e encontre toda cláusula que possa carregar risco jurídico, esforçando-se ao máximo para não deixar passar um único risco.”
3. “Escreva o código central de um algoritmo de recomendação, buscando otimizar seu desempenho ao máximo, com várias rodadas de polimento permitidas até ficar satisfatório.”

<!-- rubric -->
- As três tarefas recebem uma definição clara de padrão
- O raciocínio mostra a característica central de cada padrão (etapas fixas / retorno ao início / julgamento independente em paralelo), não só uma conclusão
- Não trata “vários agentes estão envolvidos” como significando automaticamente um padrão específico

<!-- answer -->
1. Pipeline. Tradução, consistência de terminologia e formatação são três etapas fixas com uma ordem clara de dependências; cada etapa processa a saída da etapa anterior, não há devolução de trabalho para refazer com base em uma verificação, e termina uma vez que as três etapas estão prontas.
2. Votação multiperspectiva. “Esforçar-se ao máximo para não deixar passar um único risco” significa que um deslize é caro, então se encaixa em usar vários ângulos de revisão independentes (digamos, um focado em termos de pagamento, um em responsabilidade por descumprimento, um em propriedade intelectual), cada um verificando o mesmo contrato; basta um ângulo sinalizar um risco para valer atenção, trocando múltiplas perspectivas por uma cobertura mais ampla.
3. Produtor-revisor. “Várias rodadas de polimento permitidas até ficar satisfatório” é exatamente o loop de escrever um rascunho, obter feedback, revisar, revisar de novo; a contagem de rodadas não é fixa, e ele só para quando converge para uma versão satisfatória.

<!-- hint -->
Palavras-chave ajudam a classificar uma tarefa rápido: uma descrição clara de “primeiro… depois… por fim…” de etapas fixas costuma apontar para pipeline; “tente não deixar passar nada” e “vários ângulos” apontam para votação; “polir repetidamente” e “loop até ficar satisfeito” apontam para produtor-revisor.

<!-- hint -->
A armadilha fácil é a tarefa 1 — ela também é “uma etapa após a outra”, mas note que não envolve “devolver para reescrever se a verificação falhar”. As três etapas são estritamente unidirecionais, e é isso que a torna um pipeline em vez de produtor-revisor.

### Nível 2: Escolha uma abordagem para uma revisão de segurança com orçamento limitado

A tarefa: antes do envio, revisar um trecho de código em busca de vulnerabilidades de segurança, com um orçamento de no máximo 3 chamadas de LLM, buscando maximizar as chances de encontrar vulnerabilidades reais. Decida qual padrão de colaboração usar e explique exatamente como configurar essas 3 chamadas.

<!-- rubric -->
- A abordagem escolhida é votação multiperspectiva, não produtor-revisor ou pipeline
- Explica por que, sob essa restrição de orçamento, a votação supera o loop e o polimento repetidos
- Dá uma divisão concreta das 3 chamadas (digamos, focando em tipos diferentes de vulnerabilidade)

<!-- answer -->
A votação multiperspectiva se encaixa. A necessidade central da tarefa é “maximizar as chances de encontrar vulnerabilidades reais” — um deslize é caro e você quer uma cobertura mais ampla, de vários ângulos, que é exatamente a força da votação. A contagem de rodadas do produtor-revisor é incerta e, sob um orçamento rígido de apenas 3 chamadas, você provavelmente esgotaria as chamadas antes de o loop terminar de polir; gastar as 3 chamadas diretamente em revisões independentes em paralelo é mais previsível. Configuração concreta: use as 3 chamadas para revisar o mesmo código de forma independente, cada uma focada em um tipo diferente de vulnerabilidade — a primeira em falhas de injeção (injeção de SQL, injeção de comando), a segunda em problemas de permissão e escalada de privilégios, a terceira em vazamentos de informação sensível (chaves, dados privados em logs). Basta uma chamada sinalizar um problema para valer uma revisão humana, trocando três ângulos diferentes por uma cobertura mais ampla do que uma única revisão.

<!-- hint -->
Descarte o produtor-revisor primeiro — sua contagem de chamadas não é fixada de antemão; depende de quantas rodadas leva para convergir, o que não combina bem com o orçamento rígido de “no máximo 3 chamadas” da tarefa.

<!-- hint -->
Se as 3 chamadas usarem o mesmo prompt para revisar o mesmo código, o retorno é limitado; fazer cada chamada focar em uma categoria diferente de problema é o que de fato amplia a cobertura — que é o ponto dos “vários prompts diferentes” do exemplo oficial, cada um revisando.

<!-- /exercises -->

## Recapitulação

- **Pipeline** divide uma tarefa em uma cadeia de etapas fixas dependentes de ordem, cada uma processando a saída da etapa anterior[^S2]; bom para tarefas com uma ordem natural que não precisam de trabalho devolvido.
- **Produtor-revisor** é um loop de escrever um rascunho, obter feedback, revisar, revisar de novo, que roda até convergir[^S2]; bom para tarefas cuja qualidade de saída precisa de polimento repetido, com o custo determinado pela contagem de rodadas, então normalmente precisa de um limite máximo de rodadas.
- **Votação multiperspectiva** tem vários agentes julgando o mesmo conteúdo em paralelo e de forma independente, sinalizando-o assim que qualquer ângulo encontra um problema[^S2]; bom para situações em que um deslize é caro e você pagará várias vezes o custo por uma cobertura mais ampla, com o custo sendo aproximadamente o custo de uma única execução vezes o número de agentes julgando.
- Para escolher entre os três, olhe a forma da tarefa: ela tem uma ordem natural de etapas, precisa de polimento repetido e um deslize é caro — as três perguntas apontam respectivamente para pipeline, produtor-revisor e votação multiperspectiva.
- **Handoff** é uma ideia de colaboração diferente: os agentes passam o controle adiante por completo uns aos outros, o agente que recebe assume a conversa e por padrão vê todo o histórico anterior da conversa[^S5], o oposto do mecanismo do orquestrador-subagente em que os subagentes partem de um contexto novo e isolado e só devolvem uma conclusão[^S3] — um handoff permanece dentro de uma única execução e se encaixa no caso em que um agente mais especializado deveria assumir a conversa dali[^S4].

[>> Lição 5: Falha e coordenação](./05-failure-and-coordination.md)
