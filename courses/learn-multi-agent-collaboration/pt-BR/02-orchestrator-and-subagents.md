# Lição 2: Orquestrador e subagentes: distribuir e agregar

> Objetivos de aprendizado:
> - Dizer de que o orquestrador e os subagentes são responsáveis cada um em uma arquitetura orquestrador-subagente
> - Explicar o que o "isolamento de contexto" de fato isola, e por que ele alivia a poluição de contexto e a diluição de atenção da lição anterior
> - Explicar por que um subagente deveria devolver apenas sua conclusão ao orquestrador, em vez de empurrar de volta todo o seu fluxo de raciocínio acumulado
>
> Pré-requisitos: Concluir a Lição 1 e entender a definição de "sistema multiagente" e onde ele se encaixa | Anterior: [Lição 1 <<](./01-why-multiple-agents.md) | Próxima: [Lição 3 >>](./03-writing-prompts-for-delegation.md)

## O orquestrador: dividir a tarefa, distribuí-la, esperar os resultados

Na lição passada decidimos que uma tarefa como "pesquisar os preços de três provedores de nuvem" é um bom encaixe para dividir entre múltiplos agentes, mas nunca detalhamos como essa divisão de fato funciona. Uma estrutura comum para isso é a arquitetura **orquestrador-subagente**. A definição oficial é "a central LLM dynamically breaks down tasks, delegates them to worker LLMs, and synthesizes their results." (um LLM central quebra tarefas dinamicamente, delega-as a LLMs trabalhadores e sintetiza seus resultados)[^S2]

Essa definição nomeia três ações, e elas mapeiam nas três coisas que o orquestrador faz: **quebrar** — olhar uma tarefa grande e descobrir em quais pedaços ela se divide; **delegar** — entregar cada pedaço, junto com o contexto de que ele precisa, a um subagente para executar; **sintetizar** — uma vez que os subagentes tenham devolvido seus resultados, combiná-los na resposta final. O próprio orquestrador nunca desce e lê a página de preços de um provedor. Seu trabalho é decidir como dividir o trabalho, quem recebe o quê e como costurar vários resultados em uma resposta que se sustente como um todo.

## O subagente: pegar uma tarefa, terminá-la dentro do seu próprio contexto

Do lado do subagente, as coisas funcionam de forma bem diferente. A documentação é explícita: "Each subagent starts with a fresh, isolated context window. It doesn't see your conversation history, the skills you've already invoked, or the files Claude has already read. Claude composes a delegation message that summarizes the task, and the subagent works from there." (cada subagente começa com uma janela de contexto nova e isolada. Ele não vê seu histórico de conversa, as skills que você já invocou, nem os arquivos que o Claude já leu. O Claude compõe uma mensagem de delegação que resume a tarefa, e o subagente trabalha a partir daí)[^S3] Em outras palavras, um subagente não tem ideia do que você disse primeiro ao orquestrador, nem de como o orquestrador ponderou internamente "devemos dividir isto" e "em quantos pedaços". Tudo o que ele consegue ver é o único resumo de tarefa que o orquestrador lhe entregou.

Isso parece uma limitação, mas na verdade é a cura para os dois problemas da lição passada. O contexto do subagente não carrega o histórico completo de conversa do orquestrador, então também não carrega os becos sem saída que o orquestrador enfrentou em outros pontos nem o material irrelevante que ele viu. Isso é o **isolamento de contexto**: confinar o escopo de trabalho de cada agente à sua própria janela de contexto, de modo que a poluição de contexto dentro de um agente não se espalhe para outro. O subagente mantém apenas o material do seu próprio fatia da tarefa, e não precisa administrar todo o conteúdo de três empresas ao mesmo tempo, então a pressão da diluição de atenção também cai. Quanto a escrever um resumo de tarefa claro o bastante para que um subagente faça um bom trabalho por conta própria sem nunca ver o histórico de conversa, isso é a próxima lição.

```agentmentor-check
{
  "id": "mac-zh-02-subagent-visibility",
  "label": "Um subagente deve ver todo o histórico de conversa do orquestrador",
  "prompt": "Três subagentes estão pesquisando em paralelo os preços de três provedores de nuvem. Alguém sugere: “Vamos deixar cada subagente ver todo o histórico de conversa do orquestrador até aqui, incluindo o que os outros dois subagentes já encontraram. Assim eles podem se cruzar referências e evitar buscas duplicadas.” É uma boa ideia?",
  "whyHere": "Acabamos de cobrir que um subagente parte de um contexto novo e isolado por padrão, o que facilita ser seduzido pela alegação plausível de que “compartilhar o histórico evita trabalho duplicado”. Este é o momento de traçar a linha: o isolamento de contexto é o mecanismo padrão, e evitar trabalho duplicado vem do orquestrador traçar limites claros de tarefa ao delegar, não de os subagentes espiarem uns aos outros.",
  "mode": "single",
  "choices": [
    {
      "id": "a",
      "text": "Razoável — quanto mais um subagente consegue ver, menos provável é que ele duplique trabalho ou perca informação.",
      "correct": false,
      "feedback": "Isso põe um sinal de igual entre “evitar trabalho duplicado” e “compartilhar todo o histórico”, mas o mecanismo oficial é explícito ao dizer que cada subagente parte de um contexto novo e isolado por padrão e não consegue ver o histórico de conversa. Deixar os subagentes verem o processo completo uns dos outros move a poluição de contexto e a diluição de atenção da Lição 1 de “dentro de um agente” para “entre vários subagentes”, a um custo real. A ferramenta de fato para evitar trabalho duplicado é o orquestrador traçar limites de tarefa claros e sem sobreposição ao delegar."
    },
    {
      "id": "b",
      "text": "Não é razoável — um subagente não vê nem o histórico de conversa nem os outros por padrão; evitar trabalho duplicado é função do orquestrador quando ele traça os limites de tarefa.",
      "correct": true,
      "feedback": "Correto. A documentação diz com clareza que um subagente parte de uma janela de contexto nova e isolada e não consegue ver o histórico de conversa. Dar a cada subagente apenas o único resumo de tarefa de que ele precisa é exatamente como o isolamento de contexto alivia a poluição de contexto e a diluição de atenção. O trabalho duplicado deve ser resolvido quando o orquestrador quebra a tarefa e divide os limites, não remendado fazendo os subagentes compartilharem grandes volumes de contexto."
    },
    {
      "id": "c",
      "text": "Não faz diferença — o orquestrador agrega no final de qualquer forma, então se os subagentes veem o trabalho uns dos outros não muda o resultado final.",
      "correct": false,
      "feedback": "Faz diferença. A independência de contexto de cada subagente decide diretamente se ele é desviado do rumo por informação irrelevante ou errada que outro subagente levantou, e se ele queima atenção administrando material extra. A agregação acontece depois que os subagentes terminam seu trabalho; ela não consegue desfazer a qualidade perdida durante esse trabalho porque um subagente recebeu contexto de que nunca precisou."
    }
  ]
}
```

## Distribuição: dividir a tarefa e entregá-la a vários subagentes de uma vez

De volta ao exemplo de preços dos três provedores. Uma vez que o orquestrador quebrou o trabalho em "verificar o primeiro", "verificar o segundo", "verificar o terceiro", ele não os enfileira um de cada vez. Ele distribui os três ao mesmo tempo — que é exatamente o que o sistema em produção faz: o agente líder aciona de 3 a 5 subagentes em paralelo, em vez de em série[^S1]. Essa jogada de "distribuir tudo ao mesmo tempo" é a **distribuição** (fan-out): o orquestrador reparte as subtarefas divididas em paralelo para um número equivalente de subagentes, deixando cada um começar a trabalhar de forma independente e simultânea, em vez de esperar o primeiro subagente terminar para despachar o segundo.

O retorno da distribuição é direto: três subagentes trabalhando em paralelo significa que o tempo total fica perto de fazer uma única pesquisa, não a soma de três. Depois que o sistema em produção introduziu esse tipo de paralelização, o tempo de pesquisa em consultas complexas caiu em até 90%[^S1]. Mas a distribuição não é só picar a tarefa em pedaços e dar por encerrado — como você recorta importa. Três empresas são naturalmente independentes, então recortar em três é um encaixe limpo. Troque para "revisar um contrato de 20 páginas" e as cláusulas podem se referenciar e se restringir mutuamente; um recorte ruim deixa cada subagente sem contexto-chave e chegando a conclusões que se contradizem. Decidir como e com que granularidade recortar remete ao teste da lição passada: cada pedaço que você recorta é de fato algo que pode ser tratado por conta própria, sem depender dos resultados intermediários de outro pedaço?

## Agregar: puxar os resultados juntos, não apenas colá-los

Depois que os três subagentes terminam cada um de verificar o preço da sua própria empresa e devolvem os resultados, o que o orquestrador faz não é colar três blocos de texto em sequência. O que os subagentes devolvem são conclusões de pesquisa a partir de seus próprios pontos de vista, e o trabalho do orquestrador é **agregar**: pôr vários resultados produzidos de forma independente lado a lado, compará-los, resolver qualquer duplicação ou contradição que apareça e reorganizá-los no formato do entregável final — escrevendo um documento que se lê como um todo, não como três pedaços obviamente costurados.

A documentação, ao descrever subagentes que se sucedem em sequência, nota que "Each subagent completes its task and returns results to Claude, which then passes relevant context to the next subagent." (cada subagente conclui sua tarefa e devolve resultados ao Claude, que então passa o contexto relevante para o próximo subagente)[^S3] Então a agregação não é necessariamente tão simples quanto "esperar cada subagente entregar seu trabalho, e então o orquestrador recolhe tudo de uma vez e processa". Em alguns casos, o resultado do subagente anterior é ele próprio parte do resumo de tarefa do próximo subagente, e o orquestrador vai e volta entre distribuir e agregar até que cada subtarefa tenha um resultado.

O caminho que um resultado percorre também nem sempre precisa passar pelo orquestrador. Quando o conteúdo que um subagente produz é grande e precisa ser mantido intacto, a documentação menciona uma abordagem: "Subagent output to a filesystem to minimize the 'game of telephone.' Direct subagent outputs can bypass the main coordinator for certain types of results, improving both fidelity and performance." (saída do subagente para um sistema de arquivos para minimizar o “telefone sem fio”. Saídas diretas de subagente podem contornar o coordenador principal para certos tipos de resultado, melhorando tanto a fidelidade quanto o desempenho)[^S1] Escrever direto no sistema de arquivos é, no fundo, uma forma de evitar que um resultado seja parafraseado, comprimido e perca detalhe ao longo da cadeia "subagente → orquestrador → saída final".

## Devolver apenas a conclusão, não todo o fluxo de raciocínio do subagente

Para concluir sua tarefa, um subagente pode ler muitas páginas de material irrelevante pelo caminho, tentar alguns caminhos que não levam a lugar nenhum, até cometer pequenos erros e se corrigir. Esse processo não precisa — e não deveria — ser enfiado de volta no contexto do orquestrador do jeito que está. O que o orquestrador precisa é da conclusão final e defensável do subagente e da evidência-chave por trás dela, não de toda a trilha de raciocínio com seus desvios.

A razão remete ao ponto da Lição 1: o orquestrador tem uma janela de contexto própria, e ele também passa por poluição de contexto e diluição de atenção. A documentação é direta sobre isso: quando os subagentes concluem, seus resultados retornam à conversa principal, e rodar muitos subagentes que cada um devolve resultados detalhados pode consumir contexto significativo[^S3]. Se três subagentes empurram de volta, cada um, vários milhares de palavras de raciocínio completo do jeito que está, o orquestrador acaba encontrando, na sua própria camada, o exato problema que múltiplos agentes deveriam aliviar. A **devolução** deve carregar apenas a conclusão em si, e deixar o detalhe do "como cheguei aqui" no próprio contexto do subagente, que ele já gastou e está prestes a descartar.

Isso não significa que toda delegação começa do zero. A documentação menciona um tipo especial de subagente — um **fork**: "A fork is a subagent that inherits the entire conversation so far instead of starting fresh... The fork's own tool calls still stay out of your conversation and only its final result comes back, so your main context window stays clean." (um fork é um subagente que herda toda a conversa até então em vez de começar do zero... As próprias chamadas de ferramenta do fork continuam fora da sua conversa e só seu resultado final volta, então sua janela de contexto principal permanece limpa)[^S3] Então, mesmo quando um subagente de fato raramente precisa ver o histórico completo (digamos, ele tem de produzir um resumo profundo fundamentado em toda a discussão anterior), seu pensamento intermediário ainda assim não entra no contexto do orquestrador do jeito que está. O princípio "devolver apenas a conclusão" é estável; o que muda é apenas se o subagente começa com o histórico em mãos.

## Em outras palavras: a mesma divisão de trabalho aparece em outros frameworks

"Orquestrador-subagente" não é a formulação privada de um único fornecedor. A documentação do Agents SDK da OpenAI chama a mesma estrutura de **padrão Manager**: "A central manager/orchestrator invokes specialized sub‑agents as tools and retains control of the conversation." (um gerente/orquestrador central invoca subagentes especializados como ferramentas e mantém o controle da conversa)[^S4] Troque as palavras — gerente por orquestrador, agentes-como-ferramentas por subagentes — e está descrevendo a mesma coisa: um nó central quebra a tarefa, distribui o trabalho e mantém o controle do todo, enquanto a execução de fato vai para subordinados especializados que devolvem seus resultados, e o nó central segue conduzindo o que vem a seguir. Reconhecer o formato dessa divisão de trabalho importa mais do que decorar a terminologia de um framework — você verá alguma variante dessa lógica na documentação de quase todo framework multiagente.

<!-- exercises -->
## 💻 Exercícios

### Nível 1: Desenhar a divisão orquestrador/subagente para uma tarefa de revisão de código

A tarefa é: "Revise os últimos 10 PRs de um projeto de código aberto, encontre os PRs que tocaram na lógica central de permissões e escreva uma nota de risco para cada um desses PRs." Responda:

1. O que o orquestrador deve fazer?
2. Como essa tarefa deve ser distribuída — em quantos pedaços, e mais ou menos qual é cada pedaço?
3. Quando um subagente termina, o que ele deve devolver? E, uma vez que o orquestrador tem as devoluções, o que exatamente é a etapa de "agregar"?

<!-- rubric -->
- As responsabilidades do orquestrador refletem "quebrar, delegar, sintetizar", em vez de o orquestrador ler os PRs ele mesmo
- O plano de distribuição dá uma base concreta para a divisão (por exemplo, agrupar por PR), não um vago "divida em alguns pedaços"
- Deixa claro se o subagente devolve uma conclusão ou todo o seu fluxo de raciocínio, e o que a agregação de fato está fazendo

<!-- answer -->
1. O orquestrador primeiro pega a lista de 10 PRs e decide que essa tarefa se divide em uma camada paralelizável de subtarefas — "verificar um a um se cada PR tocou na lógica de permissões". Ele entrega cada PR (ou um grupo de alguns PRs) a um subagente para verificar. Uma vez que os subagentes devolvem, ele organiza as notas de risco dos PRs que de fato tocaram na lógica de permissões em um relatório de revisão unificado.
2. Você pode dividir por PR — digamos, cada subagente cuida de 2-3 PRs, dando 4-5 subagentes verificando em paralelo; ou mais fino, um subagente por PR nos 10. A granularidade exata depende de quão grandes são as mudanças de cada PR e de quanto contexto a verificação precisa.
3. Um subagente deve devolver apenas a conclusão: se este PR tocou na lógica central de permissões e, em caso positivo, a nota de risco mais os locais-chave de código que embasam o julgamento — não todo o diff que ele leu e seu raciocínio de tentativa e erro pelo caminho. Uma vez que o orquestrador tem as devoluções, "agregar" significa selecionar cada PR que os subagentes marcaram como arriscado e organizá-los em um relatório num formato de nota de risco consistente, em vez de colar 10 respostas brutas de subagente em sequência.

<!-- hint -->
Entre as três ações do orquestrador — quebrar, delegar, sintetizar — a que é fácil de esquecer é que ele não vai ler o conteúdo real de um PR. No momento em que o orquestrador lê um diff completo ele mesmo, está fazendo o trabalho do subagente, e a linha de divisão se borra.

<!-- hint -->
Para o que um subagente deve devolver, raciocine de trás para frente: se o orquestrador recebesse todo o fluxo de raciocínio de cada subagente, o próprio contexto dele ficaria longo e desordenado de novo? Se sim, então o que deve ser devolvido é apenas a conclusão.

### Nível 2: Achar o problema neste design de orquestração

Alguém desenhou um fluxo orquestrador-subagente assim: "Logo no começo, o orquestrador empacota todo o seu histórico de conversa com o usuário — incluindo algumas rodadas de conversa fiada não relacionadas a esta tarefa — e o envia como contexto para cada subagente, com a lógica de que 'caso um subagente precise de algum contexto, dar de antemão é melhor do que deixar de fora'." Encontre o problema neste design e dê uma abordagem melhor.

<!-- rubric -->
- Nomeia o problema e cita um princípio específico desta lição (não um vago "é ruim")
- Explica a consequência concreta que essa prática causa
- A melhoria reflete o princípio de "fornecer sob demanda, traçar limites claros"

<!-- answer -->
O problema é que ele derruba todo o sentido de um subagente partir de um contexto novo e isolado por padrão. Empacotar a conversa fiada não relacionada em cada subagente reintroduz artificialmente o material irrelevante do próprio contexto do orquestrador no contexto de cada subagente — isto é exatamente a poluição de contexto da Lição 1, só que com a fonte trocada de "informação errada que o agente encontrou sozinho" para "histórico irrelevante que o orquestrador prestativamente enfiou". A consequência é que um subagente gasta atenção extra separando contexto real e útil de tagarelice irrelevante, então a diluição de atenção também aparece, e a preocupação do "caso falte algo" nem sequer é resolvida — o contexto que de fato é necessário deveria ser escrito explicitamente no resumo de tarefa, não amparado despejando todo o histórico. A abordagem melhor: o orquestrador seleciona apenas o contexto de que esta tarefa genuinamente precisa, escreve-o explicitamente no resumo do subagente e não passa nada do histórico não usado.

<!-- hint -->
Lembre da questão "um subagente deve ver todo o histórico de conversa" — "caso seja necessário" e "claramente necessário" são duas coisas diferentes. O primeiro escorrega fácil para enfiar tudo; o segundo pede a quem delega que primeiro pense qual contexto esta tarefa de fato precisa.

<!-- hint -->
Compare: se esse "histórico completo de conversa" tem, ele próprio, vários milhares de palavras, alimentá-lo em três subagentes significa que o orquestrador, antes mesmo de ter distribuído, já passou o custo da poluição de contexto e da diluição de atenção para cada subagente.

<!-- /exercises -->

## Recapitulação

- Na arquitetura **orquestrador-subagente**, um LLM central quebra a tarefa, delega subtarefas a múltiplos LLMs trabalhadores e sintetiza seus resultados[^S2]; o próprio orquestrador não desce e trata o conteúdo detalhado de uma subtarefa.
- Cada subagente parte por padrão de uma janela de contexto nova e isolada e não consegue ver o histórico de conversa do orquestrador[^S3] — isto é o **isolamento de contexto**, o mecanismo-chave para aliviar a poluição de contexto e a diluição de atenção da lição passada.
- A **distribuição** reparte as subtarefas divididas em paralelo para múltiplos subagentes trabalharem ao mesmo tempo; **agregar** não é uma simples colagem das respostas dos subagentes, mas uma etapa de comparar, resolver contradições e reorganizar em um único formato; e a passagem de resultados também pode contornar o orquestrador e escrever direto no sistema de arquivos, para reduzir informação perdida na paráfrase[^S1].
- Depois que um subagente termina, seu resultado retorna ao orquestrador[^S3]; o que se devolve deve ser apenas a **conclusão**, não os desvios que ele enfrentou nem todo o seu fluxo de raciocínio — a documentação é explícita ao dizer que muitos subagentes devolvendo cada um resultados detalhados podem consumir contexto significativo[^S3], e o orquestrador voltaria a encontrar poluição de contexto e diluição de atenção na sua própria camada.
- "Orquestrador-subagente" não é a formulação privada de um framework — o Agents SDK da OpenAI chama a mesma estrutura de padrão Manager, um gerente central invocando subagentes como ferramentas enquanto mantém o controle da conversa[^S4]. Reconhecer a lógica compartilhada por trás dessa divisão de trabalho importa mais do que decorar qualquer termo isolado.

[>> Lição 3: Escrevendo prompts para delegação](./03-writing-prompts-for-delegation.md)
