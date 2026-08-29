# Lição 3: Escrevendo prompts para delegação

> Objetivos de aprendizado:
> - Escrever um prompt de delegação autocontido que não dependa de o subagente ver a conversa entre você e o orquestrador
> - Detalhar o escopo, os limites e quais fontes usar da tarefa dentro do próprio prompt de delegação
> - Explicar o princípio "um domínio de problema, um agente" e o que quebrá-lo custa a você
>
> Pré-requisitos: Concluir a Lição 2 e entender a arquitetura orquestrador-subagente e o isolamento de contexto | Anterior: [Lição 2 <<](./02-orchestrator-and-subagents.md) | Próxima: [Lição 4 >>](./04-collaboration-patterns.md)

## Recapitulação: tudo o que o subagente não consegue ver, você tem de escrever para ele

A Lição 2 cobriu um mecanismo que importa aqui: "Each subagent starts with a fresh, isolated context window. It doesn't see your conversation history, the skills you've already invoked, or the files Claude has already read. Claude composes a delegation message that summarizes the task, and the subagent works from there." (cada subagente começa com uma janela de contexto nova e isolada. Ele não vê seu histórico de conversa, as skills que você já invocou, nem os arquivos que o Claude já leu. O Claude compõe uma mensagem de delegação que resume a tarefa, e o subagente trabalha a partir daí)[^S3] Esta lição torna isso concreto. Significa que todo o contexto que você conversou com o usuário no nível do orquestrador, os trade-offs que você acertou em rodadas anteriores, a restrição solta que o usuário jogou de passagem — o subagente não sabe nada disso. A única coisa que o subagente sabe é qualquer palavra que você escreveu nesta única tarefa de delegação.

Isto não é um lembrete gentil, é uma restrição rígida: **o teto de qualidade do prompt de delegação define o teto de qualidade do que o subagente produz**. Qualquer coisa que o prompt não detalhar, o subagente vai adivinhar, pular ou inventar uma suposição e seguir em frente. Adivinhou certo, você teve sorte. Adivinhou errado, e aquela subtarefa inteira está basicamente desperdiçada.

## Autocontido: o prompt tem de dizer a coisa toda por conta própria

**Autocontido**: depois de ler um prompt de delegação, o subagente não precisa de nenhum contexto extra para descobrir com precisão o que deve fazer. Há um teste simples para saber se um prompt é autocontido. Tire-o do contexto, remova todo o contexto entre você e o orquestrador e leia-o a frio. Se você ainda tem de *adivinhar* para preencher os detalhes da tarefa, o prompt falha no teste.

Pegue o exemplo da Lição 1 de pesquisar preços em três provedores de nuvem. Se o orquestrador entrega ao subagente uma tarefa que diz só "consulte os preços da AWS", essa linha única carrega informação suficiente para o próprio orquestrador — porque o contexto do orquestrador ainda mantém o pano de fundo de "por que estamos consultando isto", "contra quem vamos comparar depois" e "em que dimensões estamos comparando". Mas o subagente não consegue ver nada disso. O que ele recebe é uma linha solitária, "consulte os preços da AWS", e fica adivinhando: preços de quais categorias de produto? Só os preços atuais, ou as mudanças ao longo do último ano? Como deve ser o entregável depois de encontrado? Cada suposição é uma aposta que pode dar errado.

## Detalhe escopo e restrições: o que fazer, o que não fazer, quais fontes usar

A orientação oficial lista o que uma boa descrição de tarefa de subagente deve conter: "Each subagent needs an objective, an output format, guidance on the tools and sources to use, and clear task boundaries. Without detailed task descriptions, agents duplicate work, leave gaps, or fail to find necessary information." (cada subagente precisa de um objetivo, um formato de saída, orientação sobre as ferramentas e fontes a usar e limites de tarefa claros. Sem descrições de tarefa detalhadas, os agentes duplicam trabalho, deixam lacunas ou falham em encontrar as informações necessárias)[^S1]

Abra essa lista. "Objetivo" e "formato de saída" são fáceis de pegar. Os dois que ficam de fora são o último par — **orientação de fontes** e **limites de tarefa**. A orientação de fontes diz ao subagente onde procurar a resposta: a página oficial de preços, um site terceiro de comparação de preços, ou ambos, com a página oficial tendo precedência. Os limites de tarefa dizem ao subagente que esta execução cobre apenas esta fatia, não vá além dela: só os preços atuais, sem mudanças históricas de preço; só as linhas principais de produto, não liste cada serviço obscuro. Deixe esses dois de fora e o subagente tende a derivar de uma de duas formas. Ou ele perde informação que você de fato queria, ou busca muito mais do que você queria e queima chamadas de ferramenta e tokens que você poderia ter poupado.

Reescrita como uma descrição de tarefa autocontida com escopo claro, a pesquisa de provedores de nuvem fica mais ou menos assim:

```json
{
  "objective": "Pesquisar a estrutura de preços atual do principal serviço de computação da AWS (EC2), com foco nos dois modelos de cobrança: instâncias sob demanda e instâncias reservadas",
  "scope": "Consultar apenas os preços em vigor agora, sem mudanças históricas de preço; cobrir apenas os tipos de instância de uso geral e otimizadas para computação, sem necessidade de cobrir toda família de instância",
  "sources": "Usar a página oficial de preços da AWS como fonte de verdade; se a página oficial não for clara o bastante, você pode complementar com a calculadora oficial de preços da AWS",
  "output_format": "Um resumo em texto com menos de 300 palavras cobrindo: a faixa de preço por hora das instâncias sob demanda, o desconto que as instâncias reservadas oferecem em relação às sob demanda, e uma conclusão de uma linha sobre qual modelo de cobrança serve a qual caso de uso"
}
```

Tirada do contexto por conta própria, essa descrição permite ao subagente julgar com precisão "o que consultar, até onde levar, o que entregar" sem saber nada do que o orquestrador discutiu internamente.

## O contraexemplo: instruções vagas deixam os subagentes improvisando

O que de fato dá errado quando você não detalha escopo e limites — a equipe oficial deu um exemplo real da prática: "We started by allowing the lead agent to give simple, short instructions like 'research the semiconductor shortage,' but found these instructions often were vague enough that subagents misinterpreted the task or performed the exact same searches as other agents." (começamos permitindo que o agente líder desse instruções simples e curtas como “pesquise a escassez de semicondutores”, mas descobrimos que essas instruções eram frequentemente vagas o bastante para que os subagentes interpretassem mal a tarefa ou realizassem exatamente as mesmas buscas que outros agentes)[^S1]

"pesquise a escassez de semicondutores" parece que entrega uma tarefa, mas não fixa nada — em que intervalo de tempo? Focado no lado da oferta, no lado da demanda, ou no impacto de políticas? Entregue em que forma? Três subagentes recebendo a mesma instrução vaga muito provavelmente vão todos buscar em direção a "as causas da escassez de semicondutores", o ângulo que vem à mente primeiro, e o resultado são três corpos de pesquisa com forte sobreposição, enquanto os ângulos que de fato precisavam de cobertura (digamos, o impacto nas indústrias a jusante, ou como diferentes países reagiram) ficam sem toque. Esta é a raiz, no nível do prompt, do problema de "trabalho duplicado" da Lição 2 — não é que os subagentes não escutem, é que a própria descrição de tarefa nunca traçou os limites.

```agentmentor-check
{
  "id": "mac-zh-03-vague-instruction",
  "label": "Esta instrução de delegação é boa o bastante",
  "prompt": "O orquestrador envia a mesma instrução a três subagentes: “Dê uma olhada na atividade recente de produto desta empresa.” Cada subagente busca por conta própria, e o que devolvem se sobrepõe fortemente ao mesmo tempo em que deixa de fora justamente o que o orquestrador mais se importava — “lançamentos de novos recursos nos últimos seis meses”. Onde está o problema?",
  "whyHere": "Acabamos de cobrir como instruções vagas fazem os subagentes interpretarem mal a tarefa ou rodarem buscas duplicadas uns contra os outros. Isto dá um caso concreto de trabalho duplicado para checar se o aprendiz consegue apontar a causa-raiz como “a descrição de tarefa carece de escopo e limites” em vez de culpar capacidade fraca do subagente ou má sorte.",
  "mode": "single",
  "choices": [
    {
      "id": "a",
      "text": "A capacidade de busca dos subagentes não é forte o bastante; você deveria trocar por um modelo mais capaz",
      "correct": false,
      "feedback": "O problema não é capacidade do modelo. O caso real oficial mostra que até o mesmo lote de subagentes, recebendo uma instrução vaga como “pesquise a escassez de semicondutores”, vai interpretar mal a tarefa e rodar buscas duplicadas uns contra os outros — porque a própria instrução não define escopo, o que não tem nada a ver com quão forte é o modelo. Um modelo mais forte não conserta uma instrução que carece de limites."
    },
    {
      "id": "b",
      "text": "Esta instrução nunca detalha o objetivo, o escopo e o formato de saída, então os subagentes só podem buscar pela própria leitura dela, naturalmente se amontoando no ângulo mais óbvio em duplicidade e deixando de fora o ângulo que o orquestrador de fato queria",
      "correct": true,
      "feedback": "Correto. “Dê uma olhada na atividade recente de produto” não diz em qual aspecto específico focar (como “lançamentos de novos recursos nos últimos seis meses”), e não traça escopo nem formato de saída, então os subagentes só podem buscar pela própria leitura e tendem a se agrupar no ângulo mais óbvio, produzindo forte sobreposição enquanto o ângulo específico que o orquestrador se importava fica sem cobertura. Isto é exatamente o que a orientação oficial quer dizer com “instruções vagas levam a interpretar mal a tarefa ou a buscas duplicadas”."
    },
    {
      "id": "c",
      "text": "Os três subagentes deveriam sincronizar o progresso de busca uns com os outros para evitar buscar o mesmo conteúdo",
      "correct": false,
      "feedback": "Isto equivale a pedir aos subagentes que compartilhem contexto, mas a Lição 2 já cobriu que o mecanismo padrão é cada subagente partir de um contexto isolado e receber apenas a descrição de tarefa que o orquestrador escreveu para ele, então ele também não consegue ver o trabalho dos outros. O sistema oficial esbarrou exatamente nesta armadilha logo no começo: múltiplos agentes “distracting each other with excessive updates” (distraindo uns aos outros com atualizações excessivas)[^S1], enchendo a atenção uns dos outros. A correção de verdade é escrever o escopo e os limites de cada subagente com clareza no momento da delegação, prevenindo a sobreposição na origem, em vez de contar com os subagentes se coordenando em tempo de execução depois do fato."
    }
  ]
}
```

## Um domínio de problema, um agente

Além de escrever um único prompt com clareza, como múltiplos subagentes dividem o trabalho também segue um princípio que você pode destilar da prática oficial — a equipe oficial nunca o nomeou, este nome é nosso: **um domínio de problema, um agente** — cada subagente deveria ser dono de apenas uma classe de problema claramente delimitada, em vez de ter um único subagente fazendo malabarismo com várias coisas não relacionadas ao mesmo tempo.

O sistema oficial tem um exemplo direto: eles montaram um CitationAgent dedicado, "a CitationAgent, which processes the documents and research report to identify specific locations for citations. This ensures all claims are properly attributed to their sources." (um CitationAgent, que processa os documentos e o relatório de pesquisa para identificar os locais específicos das citações. Isso garante que todas as afirmações sejam devidamente atribuídas às suas fontes)[^S1] Encontrar onde vão as citações é um tipo de trabalho completamente diferente de "pesquisar a estratégia de preços de alguma empresa" — o primeiro é verificar e localizar, o segundo é buscar e julgar. Entregue os dois ao mesmo subagente e ele tem de alternar entre dois modos de pensamento inteiramente diferentes, e sua descrição de tarefa fica longa e emaranhada por tentar servir a dois objetivos, fácil de fazer corpo mole em um em favor do outro. Divida em dois subagentes focados e a descrição de tarefa de cada um permanece simples e claramente delimitada — o que ecoa a régua da Lição 1: se pode ser dividido em subtarefas independentes, vale a pena dividir.

<!-- exercises -->
## 💻 Exercícios

### Nível 1: Criticar uma instrução vaga e reescrevê-la

A instrução de delegação do orquestrador a um subagente é: "Dê uma olhada nas issues recentes deste projeto de código aberto e encontre qualquer coisa que valha a atenção." Aponte quais elementos faltam a essa instrução, e reescreva-a como uma descrição de tarefa autocontida com escopo claro (você pode usar a estrutura JSON do exemplo da Lição 3, ou seu próprio formato, mas ela tem de cobrir os quatro tipos de elemento: objetivo, escopo, fontes e formato de saída).

<!-- rubric -->
- Aponta os elementos específicos que faltam na instrução original (em vez de dizer vagamente "não é claro o bastante")
- A descrição de tarefa reescrita cobre os quatro tipos de elemento: objetivo, escopo, fontes, formato de saída
- O escopo reflete limites concretos de "o que consultar, o que não" em vez de adjetivos vazios

<!-- answer -->
Elementos que faltam na instrução original: ela nunca diz que intervalo de tempo "recentes" significa; nunca define o critério de "valer a atenção" (por contagem de estrelas, por atividade de discussão, ou por ser um bug); nunca diz quais fontes usar (a própria lista de issues, ou também as discussões e PRs vinculados); nunca diz em que formato entregar.

Exemplo de reescrita:

```json
{
  "objective": "Entre as issues abertas neste projeto de código aberto nos últimos 30 dias, encontrar as rotuladas como bug com mais de 5 comentários",
  "scope": "Olhar apenas issues abertas nos últimos 30 dias, sem necessidade de cobrir issues históricas mais antigas; olhar apenas as com o rótulo bug, ignorar issues de pedido de recurso",
  "sources": "Usar a lista de issues do repositório GitHub do projeto e os comentários sob cada issue como fonte de verdade",
  "output_format": "Uma lista em que cada entrada contém o título da issue, o link e a contagem de comentários, ordenada por contagem de comentários do maior para o menor, no máximo 10 entradas"
}
```

<!-- hint -->
Comece circulando cada palavra vaga na instrução original — "recentes", "valha a atenção". Atrás de cada palavra vaga há um critério de julgamento que você tem de decidir no lugar do subagente. Escreva esses critérios com clareza, e só então a instrução é autocontida.

<!-- hint -->
"Formato de saída" é fácil de deixar de fora, mas decide se o orquestrador consegue usar o resultado diretamente quando ele volta. Imagine o que o orquestrador faz em seguida depois de receber a resposta do subagente, e trabalhe de trás para frente até o que o subagente deve entregar.

### Nível 2: Julgar se uma delegação quebra "um domínio de problema, um agente"

O orquestrador projetou este subagente: "Responsável por consultar as notícias recentes de captação desta empresa e, ao mesmo tempo, resumir o estilo do texto da página inicial da empresa, para que a equipe tenha uma referência ao escrever textos depois." Julgue se este design é sólido e explique por quê; se não for, dê uma forma mais razoável de dividi-lo.

<!-- rubric -->
- Julga se o design se encaixa em "um domínio de problema, um agente" e explica por quê
- O raciocínio reflete como essas duas tarefas diferem em natureza (em vez de só dizer "parece errado")
- A divisão proposta (se julgada não sólida) separa claramente em subagentes independentes

<!-- answer -->
Não é sólido; quebra "um domínio de problema, um agente". Consultar notícias de captação cai na classe de trabalho "buscar e verificar dados factuais", que precisa julgar se as fontes são autoritativas e se os números estão corretos; resumir o estilo do texto da página inicial cai na classe de trabalho "ler e destilar o tom da escrita", que precisa de sensibilidade ao estilo de linguagem e quase nada tem a ver com verificar a exatidão numérica. Enfie os dois na mesma descrição de tarefa e o subagente tem de alternar entre dois modos de trabalho diferentes, e a própria descrição de tarefa fica mais longa e mais emaranhada por cobrir dois objetivos, fácil de ficar aquém em um deles. A divisão mais razoável monta dois subagentes: um dedicado a verificar as notícias de captação, com um formato de saída de dados estruturados como rodada de captação, valor e data; o outro dedicado a ler o texto da página inicial e resumir seus traços de estilo, com um formato de saída de algumas descrições de estilo mais frases de exemplo.

<!-- hint -->
Para julgar se duas coisas são o mesmo "domínio de problema", pergunte: as duas tarefas pedem o mesmo tipo de julgamento? Verificar a exatidão numérica e resumir o estilo de escrita claramente pedem critérios diferentes.

<!-- hint -->
Compare com o exemplo do CitationAgent desta lição — encontrar locais de citação e pesquisar a estratégia de preços de uma empresa são divididos em dois subagentes diferentes precisamente porque pedem tipos de trabalho diferentes, mesmo que ambos, no fim, sirvam ao mesmo relatório de pesquisa.

<!-- /exercises -->

## Recapitulação

- O subagente não consegue ver o histórico de conversa do orquestrador,[^S3] o que significa que um prompt de delegação tem de ser **autocontido**: legível por conta própria, à parte de qualquer pano de fundo conversacional, e ainda assim suficiente para o subagente julgar com precisão o que deve fazer.
- Uma boa descrição de tarefa tem de conter um objetivo, um formato de saída, orientação de fontes e limites de tarefa claros; sem isso, os subagentes duplicam trabalho, deixam lacunas ou falham em encontrar as informações necessárias.[^S1]
- O contraexemplo real oficial prova que instruções vagas como "pesquise a escassez de semicondutores" levam os subagentes a interpretar mal a tarefa ou a rodar exatamente as mesmas buscas que outros subagentes[^S1] — escopo e limites não são opcionais, são a chave para evitar trabalho duplicado.
- **Um domínio de problema, um agente** (esta é a destilação da prática oficial feita por esta lição): cada subagente deveria ser dono de apenas uma classe de problema claramente delimitada, como montar um CitationAgent dedicado para tratar dos locais de citação, dividindo trabalhos de naturezas diferentes entre subagentes diferentes[^S1] para que cada descrição de tarefa permaneça simples e focada.
- Para julgar se um prompt de delegação é bom o bastante, o teste é simples: tire-o do contexto e leia-o uma vez, e veja se o subagente tem de adivinhar para preencher os detalhes da tarefa.

[>> Lição 4: Padrões de colaboração: pipeline, revisão, votação](./04-collaboration-patterns.md)
