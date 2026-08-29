# Lição 5: Falha e coordenação

> Objetivos de aprendizado:
> - Explicar por que um subagente que afirma estar “pronto” não pode ser tomado ao pé da letra, e por que você precisa de uma forma independente de verificar
> - Reconhecer as duas falhas comuns na colaboração multiagente: trabalho duplicado e resultados conflitantes
> - Na etapa de integração de resultados, saber como remover duplicatas e como lidar com saídas contraditórias
>
> Pré-requisitos: concluir a Lição 4, capaz de diferenciar os três padrões de colaboração e o handoff | Anterior: [Lição 4 <<](./04-collaboration-patterns.md) | Próxima: [Lição 6 >>](./06-build-a-review-pipeline.md)

Dois subagentes pesquisam cada um o plano inicial do mesmo provedor de nuvem. Um relata que começa em \$20 por mês, o outro diz \$25 — e ambas as saídas confiantemente se marcam como “verificado, sem erros”. As lições anteriores todas cobriram como montar a colaboração multiagente; esta cobre onde ela falha depois de você tê-la construído — o status autorrelatado de um subagente não pode ser confiado, trabalho duplicado, resultados conflitantes — e o que o orquestrador deveria fazer sobre cada um.

## Um subagente dizendo “pronto” não significa que ele acertou

Quando um subagente devolve um resultado, ele geralmente adiciona uma linha como “concluído” ou “verificado, sem erros”. Essa afirmação não é evidência — é apenas o resumo que o próprio subagente faz da própria saída, e esse resumo pode estar errado. A observação oficial do comportamento de agentes é exatamente esta: "Claude stops when the work looks done. Without a check it can run, "looks done" is the only signal available, and you become the verification loop: every mistake waits for you to notice it."[^S6] É por isso que o conselho oficial é "Have Claude show evidence rather than asserting success."[^S6]

A documentação oficial chama isso de trust-then-verify gap (lacuna do confiar-e-depois-verificar): "The trust-then-verify gap. Claude produces a plausible-looking implementation that doesn't handle edge cases. Fix: Always provide verification (tests, scripts, screenshots). If you can't verify it, don't ship it."[^S6] Esse conselho foi escrito sobre escrever código, mas a mesma lógica se aplica a qualquer delegação: o que um subagente devolve se lê de forma fluida, tem o formato certo, parece ter sido feito com cuidado — e tudo isso é só “plausível na aparência”, o que não é o mesmo que de fato correto. Se o orquestrador toma um subagente pela palavra de que está “pronto” e emenda a saída direto no resultado final, ele pulou a verificação por completo.

## Como verificar: defina um padrão verificável para a saída de um subagente

“Não tome pela palavra” é fácil de dizer; a parte difícil é como verificar. Ler uma vez e decidir que “parece bom” não é verificação — isso ainda está preso na primeira metade da trust-then-verify gap. A abordagem confiável é definir primeiro um padrão concreto e verificável e depois medir a saída do subagente em relação a ele.

Um padrão usado em um sistema de produção se parece com isto: "We used an LLM judge that evaluated each output against criteria in a rubric: factual accuracy (do claims match sources?), citation accuracy (do the cited sources match the claims?), completeness (are all requested aspects covered?), source quality (did it use primary sources over lower-quality secondary sources?), and tool efficiency (did it use the right tools a reasonable number of times?)."[^S1] O que esses cinco critérios têm em comum é que cada um pode ser verificado concretamente, não pontuado por impressão. A precisão factual pode ser verificada linha a linha em relação às fontes que o subagente citou; a completude pode ser verificada em relação a cada requisito listado na descrição da tarefa, para ver se todos foram cobertos; a eficiência de ferramentas pode ser lida direto do log de chamadas, para julgar se houve chamadas obviamente redundantes ou duplicadas.

Trazendo isso para a sua própria configuração de colaboração, o primeiro passo para verificar a saída de um subagente não é perguntar “isso parece certo”, mas perguntar “para esta tarefa, quais critérios eu posso verificar concretamente” — liste-os e depois meça a saída em relação a cada um.

```agentmentor-check
{
  "id": "mac-zh-05-trust-subagent",
  "label": "Um subagente diz que a tarefa está pronta — dá para tomar ao pé da letra?",
  "prompt": "Um subagente devolve seu resultado e diz: “Pesquisa concluída, os dados estão precisos, sem erros.” A saída está bem formatada e se lê de forma fluida. Como o orquestrador deveria lidar com essa afirmação de “dados precisos, sem erros”?",
  "whyHere": "O autorrelato de um subagente se lê com real confiança, e é fácil se deixar levar por esse tom confiante e supor que um certo tom significa que de fato foi verificado — este é o ponto de furar imediatamente essa concepção errada com a trust-then-verify gap oficial",
  "mode": "single",
  "choices": [
    {
      "id": "a",
      "text": "Tomar ao pé da letra — se o subagente disse explicitamente “preciso, sem erros”, normalmente não diria isso sem motivo",
      "correct": false,
      "feedback": "O autorrelato de um subagente não é evidência. A orientação oficial é explícita de que uma lacuna surge onde a saída parece plausível mas não lida com casos extremos, e se você não consegue verificá-la não deveria tomá-la direto — “dito com confiança” e “de fato verificado” são duas coisas diferentes, e o tom não pode substituir a verificação."
    },
    {
      "id": "b",
      "text": "Não tomar ao pé da letra — definir um padrão concreto e verificável para esta tarefa (como se os fatos batem com as fontes, se as citações são precisas) e percorrê-lo ponto a ponto antes de decidir se usa",
      "correct": true,
      "feedback": "Correto. A lição oficial é que uma saída que parece plausível não é igual a uma saída que de fato acertou, e se você não consegue verificá-la não pode tomá-la direto; a forma confiável de verificar é como os critérios que o LLM juiz oficial usou — definir itens concretos e verificáveis (precisão factual, precisão de citação, completude e assim por diante) e medir a saída do subagente em relação a cada um, em vez de julgar pelo relato do próprio subagente ou por se ela se lê de forma fluida."
    },
    {
      "id": "c",
      "text": "Não tomar ao pé da letra, mas contanto que o formato esteja arrumado e o conteúdo se leia de forma fluida, dá basicamente para julgar que a saída está bem",
      "correct": false,
      "feedback": "“Bem formatada, se lê de forma fluida” é exatamente o que a orientação oficial chama de parecer plausível, e é precisamente onde é mais fácil se deixar enganar — a qualidade superficial da saída e se o conteúdo é de fato preciso ou deixa passar casos extremos são coisas não relacionadas. A verificação real precisa pousar em critérios concretos e verificáveis; ela não pode parar em “se lê bem”."
    }
  ]
}
```

## Trabalho duplicado: vários subagentes fazendo a mesma coisa

A Lição 3 cobriu como uma descrição de tarefa que não é detalhada o suficiente leva a subagentes que "misinterpreted the task or performed the exact same searches as other agents."[^S1] Essa é a causa raiz, mas a falha normalmente só vem à tona no momento em que os resultados são agregados — o orquestrador recebe várias saídas de subagentes e descobre que duas delas se sobrepõem fortemente, cobrindo a mesma coisa com palavras diferentes.

Trabalho duplicado não é um erro catastrófico em si — o conteúdo não está errado, ele só desperdiça os tokens e as chamadas que deveriam ter coberto um ângulo diferente. Mas é um sinal: os limites de tarefa de alguns subagentes não foram desenhados com clareza suficiente, e vale voltar para verificar as descrições de tarefa da etapa de despacho, em vez de apenas remover manualmente as duplicatas deste lote de resultados e dar por encerrado. Quando você detecta trabalho duplicado, em vez de apenas apagar o conteúdo repetido, é mais valioso descobrir por que ele se repetiu — se as duas descrições de tarefa se sobrepuseram em escopo, ou se os subagentes derivaram cada um para a mesma direção, a mais óbvia.

## Resultados conflitantes: dois subagentes chegam a conclusões contraditórias

Mais complicado que trabalho duplicado é um conflito de resultados — como a cena que abriu esta lição: dois subagentes fazem cada um sua própria pesquisa e devolvem conclusões que se contradizem, um dizendo que o plano inicial começa em \$20 por mês, o outro dizendo \$25. Você não pode lidar com isso “só escolhendo um” ou “rachando a diferença” — ambas as abordagens correm o risco de servir um número errado como a conclusão final.

Quando você bate em um conflito de resultados, a ordem sensata é: primeiro olhar em que cada lado baseou sua resposta — eles consultaram fontes diferentes, um usando a página ao vivo atual do provedor e o outro usando por acidente uma página antiga em cache; se a base pode ser rastreada, você normalmente consegue dizer qual é mais confiável e substituir a não confiável; se a própria base não consegue resolver quem está certo, não decida você mesmo durante a integração — sinalize a contradição como está para revisão humana, ou suba um novo subagente especificamente para verificar aquele ponto de discordância. O problema que um conflito de resultados expõe normalmente é mais digno de preocupação do que trabalho duplicado — significa que pelo menos uma saída de subagente está errada, e se você a joga no resultado final sem tratamento, você empacotou um erro não verificado como uma conclusão “pronta”.

## Integração de resultados e remoção de duplicatas: o que o orquestrador faz para fechar

Costurar várias saídas de subagentes em um resultado final não é uma questão de concatená-las uma após a outra — significa percorrer de novo as categorias de problema acima: há conteúdo duplicado que precisa ser mesclado, há conclusões contraditórias que precisam ser verificadas ou sinalizadas, cada afirmação remonta a uma base correspondente. Esse último ponto é especialmente fácil de esquecer — a Lição 3, “Escrevendo prompts para delegação”, mencionou que o sistema de produção montou um agente dedicado, descrito como "a CitationAgent, which processes the documents and research report to identify specific locations for citations. This ensures all claims are properly attributed to their sources."[^S1] A mesma lógica vale na etapa de integração: uma vez que várias saídas de subagentes são reunidas, é fácil ter atribuição errada — escrever como uma conclusão sobre a empresa pela qual o subagente B era responsável dados que o subagente A encontrou. Verificar a atribuição de fonte de cada afirmação na etapa de integração importa tanto quanto verificar se os próprios fatos são precisos.

Remover duplicatas, verificar conflitos e checar a atribuição de fonte — esses três juntos são o trabalho real da etapa de “agregar”, e não, como a Lição 2 alertou, apenas concatenar as respostas brutas dos subagentes e dar por encerrado.

<!-- exercises -->
## 💻 Exercícios

### Nível 1: Lidando com um conflito de resultados

Dois subagentes pesquisam cada um o valor da rodada de captação mais recente de uma empresa. O subagente A diz que é \$30 milhões, com base em uma reportagem de um veículo de mídia de tecnologia; o subagente B diz que é \$35 milhões, com base em um comunicado de imprensa que a própria empresa publicou. Explique como você trataria esse conflito e como o resultado final deveria ser apresentado.

<!-- rubric -->
- Não apenas “escolhe um” ou “racha a diferença” e segue em frente
- Menciona formas concretas de verificar a base de cada lado e julgar a credibilidade das fontes
- Explica como o resultado final deveria ser apresentado (incluindo o que fazer quando a base não consegue resolver quem está certo)

<!-- answer -->
Você não deveria simplesmente escolher um número ou tirar a média dos dois. Comece comparando a credibilidade das fontes de cada lado — um comunicado de imprensa oficial normalmente é mais autoritativo e mais próximo de uma fonte primária do que a cobertura de mídia de terceiros, então, neste caso, os \$35 milhões do subagente B são mais confiáveis. Você pode verificar a data de publicação e a redação exata do comunicado, confirmar que não há leitura equivocada, e então usar \$35 milhões como resultado final, anotando na saída “difere dos \$30 milhões em algumas reportagens de mídia; o número do comunicado de imprensa oficial é o autoritativo”, em vez de silenciosamente descartar o conflito e fingir que ele não existe. Se as duas fontes forem mais ou menos igualmente críveis e você não conseguir dizer qual é mais confiável, você não deveria decidir você mesmo na etapa de integração — sinalize a discordância como está para revisão humana, ou despache um subagente separado para verificá-la.

<!-- hint -->
Pergunte primeiro: em que cada subagente baseou sua resposta? As próprias fontes diferem em autoridade, e isso muitas vezes é suficiente para dizer em qual confiar — sem precisar adivinhar ou rachar a diferença como atalho.

<!-- hint -->
Se as fontes forem mesmo igualmente críveis, sinalizar honestamente o conflito é mais seguro do que forçar uma escolha e arriscar servir informação errada.

### Nível 2: Escrevendo critérios de verificação para a tarefa de um subagente

A tarefa de um subagente é: “Ler o último mês de feedback de clientes e extrair os 3 problemas mencionados com mais frequência.” Seguindo a abordagem da rubrica oficial de LLM desta lição (precisão factual, completude e assim por diante), escreva de 3 a 4 critérios de verificação verificáveis para esta tarefa específica. Cada critério deve declarar o que exatamente verificar e como verificar.

<!-- rubric -->
- Escreve de 3 a 4 critérios, cada um concretamente verificável em vez de um padrão vago de “se lê de forma razoável”
- Os critérios refletem esta tarefa específica (extrair problemas de feedback), não uma cópia dos critérios de relatório de pesquisa do exemplo oficial
- Cada critério explica como verificar, não só um nome de critério

<!-- answer -->
Resposta de exemplo:

1. **Precisão de extração**: Faça uma verificação por amostragem contra o feedback original para confirmar que os 3 problemas listados foram de fato mencionados explicitamente no feedback bruto, e não resumidos ou extrapolados pelo próprio subagente.
2. **Precisão de ranqueamento**: Verifique se esses 3 problemas realmente são os três primeiros por contagem de menções — você pode pedir ao subagente que forneça também a contagem específica de menções de cada problema, ou uma lista de citações de fonte, para checar se o ranqueamento se sustenta.
3. **Completude de cobertura**: Confirme que o subagente de fato leu todo o feedback do último mês em vez de concluir a partir de apenas uma parte — note que você não pode simplesmente checar a contagem que o subagente relata ter tratado, já que isso ainda depende de status autorrelatado; em vez disso, amostre aleatoriamente vários itens do feedback do mês (incluindo alguns dos mais antigos e dos mais recentes) e verifique se o conteúdo deles aparece na categorização ou nas contagens do subagente.
4. **Precisão de atribuição**: Cheque se o trecho de feedback original citado sob cada problema de fato sustenta a descrição daquele problema, evitando atribuir erroneamente um pedaço de feedback a um problema diferente.

<!-- hint -->
“Precisão factual” nesta tarefa mapeia para: os problemas listados são realmente mencionados no texto original, em vez de inventados pelo subagente — descobrir como fazer a verificação por amostragem contra a fonte é o método concreto de verificação para este critério.

<!-- hint -->
“Completude” nesta tarefa não é “todos os aspectos solicitados foram cobertos”, é “ele de fato leu todo o feedback solicitado” — pense em como verificar que o subagente não correu para uma conclusão depois de ler só uma parte dele.

<!-- /exercises -->

## Recapitulação

- “Pronto” ou “verificado, sem erros” quando um subagente devolve é apenas um autorrelato, não evidência. Sem uma verificação que ele possa rodar, “parece pronto” é o único sinal disponível[^S6]; a documentação oficial é explícita de que o Claude "produces a plausible-looking implementation that doesn't handle edge cases", e se você não consegue verificá-la, não a entregue.[^S6]
- A verificação não pode parar em “se lê bem” — defina critérios verificáveis para a tarefa específica, como a rubrica com que o LLM juiz oficial trabalhou, onde precisão factual, precisão de citação, completude, qualidade de fonte e eficiência de ferramentas podem cada um ser verificados linha a linha.[^S1]
- **Trabalho duplicado** é uma consequência comum de limites de tarefa que não foram desenhados com clareza[^S1], normalmente vindo à tona só quando os resultados são agregados; detectar uma duplicata não é apenas apagar o conteúdo extra, vale voltar para verificar as descrições de tarefa da etapa de despacho.
- **Resultados conflitantes** — dois subagentes chegando a conclusões contraditórias — não podem ser tratados escolhendo um ao acaso ou rachando a diferença; verifique primeiro a credibilidade da base de cada lado e, quando você não conseguir ranqueá-las, sinalize o conflito como está para revisão humana.
- A etapa de integração faz três coisas ao mesmo tempo: remover duplicatas, verificar conflitos e checar se a atribuição de fonte de cada afirmação está errada[^S1] — esse é o trabalho real da etapa de “agregar”, não apenas concatenar as respostas brutas dos subagentes.

[>> Lição 6: Mão na massa: construindo um pipeline de revisão de dois agentes](./06-build-a-review-pipeline.md)
