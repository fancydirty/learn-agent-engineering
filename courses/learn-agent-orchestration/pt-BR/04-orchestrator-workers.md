# Lição 4: Orquestrador-workers: tornar a própria decomposição dinâmica

> Objetivos de aprendizado:
> - Definir orquestrador-workers e articular a diferença essencial em relação à paralelização: topograficamente parecidos, mas as subtarefas não são predefinidas — o orquestrador as decide com base na entrada específica
> - Equipar todo despacho com os quatro elementos (objetivo, formato de saída, orientação sobre ferramentas e fontes, limites da tarefa) e escrever no prompt as regras de escala (“quantos disparar, quanto cada um pode gastar”)
> - Ler o balanço completo de um sistema real em produção: onde aparece a melhoria de 90,2%, por que a conta 15× é a outra metade do mesmo mecanismo, o que a execução síncrona bloqueia e quais três novos custos a assincronia obriga você a carregar
>
> Pré-requisitos: Lições 1–3 concluídas (esta lição retoma a pergunta deixada em aberto no fim da Lição 3) | Anterior: [<< Lição 3](./03-parallelization.md) | Próxima: [Lição 5 >>](./05-evaluator-and-graphs.md)

## O buraco que a Lição 3 deixou aberto

Na Lição 3 você escreveu seccionamento: dividir uma tarefa em subtarefas independentes, executá-las simultaneamente e depois agregar os resultados com código. Volte àquele código — onde mora a lógica da divisão? Está no array que você fixou no código: `SECTIONS = ['security', 'performance', 'readability']`. Os três ramos foram decididos quando você escreveu o código; o tempo de execução apenas os executa.

Essa abordagem funciona sob uma suposição rígida: **você já sabe, no momento de escrever, como dividir a tarefa**. Revisão de código se encaixa nessa suposição porque as dimensões de revisão são estáveis — troque o repositório e você ainda revisa os mesmos aspectos.

Agora considere uma tarefa diferente:

> “Investigue os problemas de desempenho nesta base de código.”

Quantas partes? Quais partes? Você não consegue fixar isso no código. Talvez o gargalo esteja nas consultas ao banco de dados, então você despacharia alguém para varrer os pontos de chamada do ORM. Talvez esteja num laço de caminho quente, então você mandaria alguém ler a saída do profiler. Talvez seja o tamanho do artefato de build, sem relação com o tempo de execução. Quais arquivos mudar, quais direções investigar — você tem de olhar este repositório específico, esta descrição específica do problema, antes de saber.

Em outras palavras: **a própria decomposição precisa ser calculada em tempo de execução**. Seu código não guarda mais a decisão de “dividir em quais partes”; guarda apenas o mecanismo de “como despachar, como coletar, como sintetizar”. Quem toma essa decisão? Um LLM.

Esse é o quarto padrão.

## Definição, e como ela difere da paralelização

A fonte oficial dá uma definição de uma frase: no fluxo de trabalho orquestrador-workers, um LLM central decompõe tarefas dinamicamente, delega-as a LLMs workers e sintetiza seus resultados[^S1].

Três ações: **decompor, delegar, sintetizar**. Você já escreveu a do meio — a delegação — na Lição 3; o código de fan-out é quase idêntico. O que é de fato novo é a primeira ação: a decomposição sai do código e vai para as mãos do modelo.

O enunciado de uso é mais preciso: este fluxo de trabalho serve bem a tarefas complexas nas quais você não consegue prever as subtarefas necessárias; o exemplo oficial é programação — o número de arquivos que precisam mudar e a natureza de cada mudança provavelmente dependem da própria tarefa[^S1].

Depois vem a comparação que você precisa memorizar. A fonte diz: embora seja topograficamente parecido com a paralelização, a diferença essencial é a flexibilidade — as subtarefas não são predefinidas, mas determinadas pelo orquestrador com base na entrada específica[^S1].

O termo usado é "topographically similar" (parecido topograficamente, isto é, parecido em forma). Vale parar um instante nessa formulação. Se você desenhar o seccionamento da Lição 3 e o orquestrador-workers desta lição, vai traçar formas quase idênticas: um nó se abre em três, que depois se dobram de volta em um. A forma engana. A diferença não está no diagrama; está em **quando aquela decisão é tomada**:

| | Seccionamento (Lição 3) | Orquestrador-workers (esta lição) |
|---|---|---|
| Quem decide a divisão | Você, na hora de escrever o código | O LLM orquestrador, em tempo de execução |
| Conteúdo das subtarefas | Fixo no código | Pode diferir a cada execução |
| Número de subtarefas | Fixo | Determinado pela entrada |
| Dá para escrever de antemão o prompt de cada ramo | Sim | Não — você só consegue fornecer modelos |

Essa última linha é onde mora a dor de engenharia. Com seccionamento, o prompt de cada ramo é feito à mão; você pode iterar e ajustar, acrescentar exemplos para cada dimensão. Orquestrador-workers não permite isso — os prompts de despacho são gerados na hora pelo orquestrador, e você só controla **as regras que ele segue ao gerá-los**. As duas próximas seções explicam o que essas regras devem conter.

Primeiro, vamos escrever o mecanismo como um esqueleto. O código abaixo é ilustração própria desta lição; não existe script de orquestração oficial nos materiais primários, então não trate isto como implementação padrão:

```javascript
// Ilustração própria desta lição, não é código oficial
async function orchestrate(userTask) {
  // 1) O orquestrador lê a tarefa e calcula quantos despachos, o que cada um faz
  const plan = await runOrchestrator({
    system: ORCHESTRATOR_PROMPT,   // as regras de escala entram aqui
    input: userTask,
    outputSchema: DispatchList,    // { dispatches: [{ objective, outputFormat, tools, boundaries, budget }] }
  });

  // 2) Cada despacho roda como um laço de worker completo (o loop do Curso 7).
  //    dispatches.length é calculado pelo modelo, então o teto de concorrência
  //    precisa ser imposto pelo código — use o pool da Lição 3, nunca Promise.all puro
  const results = await pool(plan.dispatches, LIMIT, (d) =>
    runWorker({
      system: buildWorkerPrompt(d),  // os quatro elementos aterrissam aqui
      tools: d.tools,
      maxToolCalls: d.budget,
    })
  );

  // 3) O orquestrador sintetiza
  return runOrchestrator({ system: SYNTHESIS_PROMPT, input: results });
}
```

Compare isto linha a linha com o código de fan-out da Lição 3; você vai ver que só o etapa 1 foi acrescentado. Esse etapa acrescentado substitui a previsibilidade do sistema inteiro — que é também por que a contabilidade das seções seguintes precisa ser detalhada item por item.

## Como é um sistema real em produção

Dá para decorar definições de padrões sem saber como eles se parecem em produção. Esta lição tem uma vantagem: a Anthropic publicou uma retrospectiva de engenharia sobre seu recurso de Pesquisa, que é um sistema orquestrador-worker rodando em produção. Esta seção e as próximas se baseiam nesse balanço.

Citação sobre a arquitetura: o sistema de Pesquisa deles usa uma arquitetura multiagente com um padrão orquestrador-worker, no qual um agente líder coordena o processo enquanto delega a subagentes especializados que operam em paralelo[^S2].

Como isso se parece em execução: quando um usuário envia uma consulta, o agente líder a analisa, desenvolve uma estratégia e dispara subagentes para explorar aspectos diferentes simultaneamente[^S2].

Note o “analisa, desenvolve uma estratégia” — essa é a decisão em tempo de execução mencionada na seção anterior. O usuário pergunta algo; o agente líder descobre na hora quantas direções perseguir e o que cada uma deve investigar.

Vale extrair mais uma citação definicional: um sistema multiagente consiste em múltiplos agentes (LLMs usando ferramentas autonomamente em um loop) trabalhando juntos[^S2].

Esse parêntese deve soar familiar. **Um worker não é nada de novo — é o loop do harness que você escreveu no Curso 7 desta série.** Orquestrador-workers não introduz uma nova unidade de execução; introduz “um loop iniciando outra leva de laços”. Você já sabe escrever esse loop. Esta lição ensina a conectá-los.

A mesma retrospectiva explica por que o fan-out ajuda: a essência da busca é compressão — destilar percepções de um corpus vasto. Subagentes facilitam a compressão operando em paralelo com suas próprias janelas de contexto, explorando aspectos diferentes da questão simultaneamente antes de condensar os tokens mais importantes para o agente líder de pesquisa. Cada subagente também fornece separação de responsabilidades — ferramentas, prompts e trajetórias de exploração distintas — o que reduz a dependência de caminho e permite investigações completas e independentes[^S2].

“Janelas de contexto independentes” — você já fez essas contas na Lição 3. Aqui elas reaparecem em outro papel: não apenas capacidade, mas **isolamento**. Três investigações não conseguem ver os passos intermediários umas das outras, então não serão desviadas pelos erros umas das outras.

## A frente do balanço: 90,2% e aqueles 80%

O número mais famoso dessa retrospectiva é também o mais citado errado. Eis a citação completa: as avaliações internas deles mostram que sistemas multiagente de pesquisa se destacam especialmente em consultas em largura (breadth-first) que envolvem perseguir múltiplas direções independentes simultaneamente. Eles descobriram que um sistema multiagente com Claude Opus 4 como agente líder e subagentes Claude Sonnet 4 superou o Claude Opus 4 de agente único em 90,2% na avaliação interna de pesquisa deles[^S2].

**Você não pode citar esse número sem cada uma destas condições**:

- **Na avaliação interna de pesquisa deles** — não é um benchmark público, você não consegue reproduzi-lo e não sabe se ele se parece com a sua distribuição de tarefas.
- **Opus 4 como líder + subagentes Sonnet 4** — é o resultado daquele pareamento específico. Uma combinação diferente de modelos não promete nada.
- **Destaca-se especialmente em consultas em largura** — aquelas que exigem múltiplas direções independentes simultaneamente. Tarefas com dependências profundas (cada etapa espera a conclusão do anterior) não estão no escopo dessa afirmação.

Mais uma disciplina crítica: **esse número compara multiagente contra agente único, não “orquestração estruturada contra laços”.** Você não pode usá-lo para argumentar “mover o fluxo de controle para o código é melhor do que deixar o modelo rodar um loop” — essa é outra afirmação, e nenhum dos materiais primários desta lição os compara. Esta lição usa repetidamente o eixo “quem guarda o plano”, mas não há dado de benchmark primário nesse eixo, apenas compromissos de engenharia.

Por que multiagente é eficaz em geral? A retrospectiva oferece uma explicação menos romântica — note que a análise de apoio vem de outra avaliação, não daquela que produziu os 90,2%: sistemas multiagente funcionam principalmente porque ajudam a gastar tokens suficientes para resolver o problema. Na análise deles da avaliação BrowseComp (que testa a capacidade de agentes de navegação de localizar informações difíceis de achar), três fatores explicaram 95% da variância de desempenho, e o uso de tokens sozinho explica 80%, com o número de chamadas de ferramenta e a escolha do modelo como os outros dois fatores explicativos[^S2]. Eles dizem que essa descoberta valida a arquitetura deles, que distribui trabalho entre agentes com janelas de contexto separadas para adicionar mais capacidade de raciocínio paralelo[^S2].

Os números de 95% e 80% valem apenas para a análise do BrowseComp; não os transporte para outro lugar como conclusões gerais.

Mas essa explicação de mecanismo tem uso prático: **se a sua tarefa não exige tantos tokens para ser resolvida, a base dos ganhos do orquestrador-workers desaparece.** (Este é um juízo de engenharia inferido da afirmação sobre o mecanismo, não uma consequência direta dos números 95%/80%.) Uma pergunta respondível com uma consulta a um documento não vai ficar mais correta despachando três workers; vai só ficar mais cara.

## O verso do balanço: 4× e 15×

Estes dois números apareceram na Lição 1; eis a citação completa. A mesma retrospectiva segue imediatamente: há uma desvantagem — na prática, essas arquiteturas queimam tokens rapidamente. Nos dados deles, agentes usam tipicamente cerca de 4× mais tokens do que interações de chat, e sistemas multiagente usam cerca de 15× mais tokens do que chats. Para viabilidade econômica, sistemas multiagente exigem tarefas em que o valor da tarefa seja alto o bastante para pagar pelo desempenho adicional[^S2].

Coloque os números das duas seções lado a lado: de um lado, 90,2% (sob condições específicas); do outro, 15×. A seção anterior deixou claro que o ganho de desempenho vem principalmente de gastar tokens, então a conta mais alta não é um efeito colateral — é **a outra metade do mesmo mecanismo**.

Como você operacionaliza “o valor da tarefa precisa corresponder”? Na verdade, isso pede que você responda uma pergunta de negócio antes de uma técnica: se esta investigação der certo, quanto ela vale? Se a resposta for “economiza meia hora de um engenheiro”, a conta 15× provavelmente não se paga. Se a resposta for “evita um incidente em produção”, aí é outra história.

A retrospectiva também traça uma fronteira mais dura: alguns domínios que exigem que todos os agentes compartilhem o mesmo contexto, ou que envolvem muitas dependências entre agentes, não são um bom encaixe para sistemas multiagente hoje. Por exemplo, a maioria das tarefas de programação envolve menos tarefas verdadeiramente paralelizáveis do que pesquisa, e agentes LLM ainda não são muito bons em coordenar e delegar a outros agentes em tempo real[^S2]. Por outro lado, eles descobriram que sistemas multiagente se destacam em tarefas valiosas que envolvem paralelização pesada, informação que excede janelas de contexto individuais e interação com numerosas ferramentas complexas[^S2].

Duas frases aqui precisam ser lidas juntas, ou você vai entendê-las errado: a fonte oficial dos padrões usa programação como exemplo de “subtarefas não podem ser previstas”[^S1], enquanto a retrospectiva multiagente diz que a maioria das tarefas de programação envolve menos tarefas verdadeiramente paralelizáveis do que pesquisa[^S2]. Elas não se contradizem — estão falando de duas coisas diferentes. A primeira diz que **a decomposição precisa ser calculada dinamicamente**; a segunda diz que **as subtarefas calculadas podem não rodar todas simultaneamente**. Decomposição dinâmica não implica paralelismo inevitável. Um orquestrador pode perfeitamente calcular cinco subtarefas e depois rodar três em sequência e duas em paralelo.

## Os quatro elementos dos prompts de delegação

Esta é a disciplina de engenharia que você deve guardar desta lição acima de tudo; a citação original é breve:

> "Teach the orchestrator how to delegate. In our system, the lead agent decomposes queries into subtasks and describes them to subagents. **Each subagent needs an objective, an output format, guidance on the tools and sources to use, and clear task boundaries.** Without detailed task descriptions, agents duplicate work, leave gaps, or fail to find necessary information"[^S2].

(Ensine o orquestrador a delegar. No sistema deles, o agente líder decompõe consultas em subtarefas e as descreve aos subagentes. Cada subagente precisa de um objetivo, um formato de saída, orientação sobre as ferramentas e fontes a usar e limites claros da tarefa. Sem descrições detalhadas de tarefa, agentes duplicam trabalho, deixam lacunas ou não encontram a informação necessária.)

Quatro elementos, nenhum opcional:

**Objetivo** — que conclusão este worker deve produzir. Não “investigue desempenho”, mas “encontre os 3 pontos quentes de CPU em tempo de execução com maior tempo próprio”. O objetivo precisa ser estreito o bastante para se julgar se foi alcançado.

**Formato de saída** — como é o artefato retornado. Campos, teto de quantidade de itens, ordenação. Este item determina diretamente quão fácil é escrever o estágio de síntese do orquestrador: se três workers devolvem três parágrafos de prosa, a síntese só pode contar com o modelo lendo tudo de novo. Se devolverem JSON conforme o mesmo schema, metade da síntese pode ser feita em código.

**Orientação sobre ferramentas e fontes** — quais ferramentas ele pode usar, onde olhar. Este item é ao mesmo tempo controle de custo e prevenção de desvio: se você não der uma ferramenta de busca na web, ele não pode sair buscando algo que não existe.

**Limites da tarefa** — explicitamente o que ele **não** deve fazer. Este item é o mais fácil de omitir e o que mais diretamente determina se os workers vão colidir. “Não olhe em `src/server/`; esse é o território de outro worker” — uma única frase assim é mais eficaz do que qualquer desduplicação posterior.

O caso de falha da retrospectiva é quase de manual: por exemplo, um subagente explorou a crise automotiva de chips de 2021 enquanto outros 2 duplicaram trabalho investigando as cadeias de suprimentos atuais de 2025, sem uma divisão de trabalho eficaz[^S2].

Três workers, dois duplicando e um correndo para um ano irrelevante — é exatamente assim que “duplicam trabalho, deixam lacunas” se parece em termos concretos.

Fazendo a ponte com o que você já aprendeu: **o Curso 6 desta série, ao ensinar colaboração multiagente, já separou esses quatro itens (chamando-os de objetivo, escopo, fontes e formato de saída); a Lição 2 também os mencionou.** Esta lição faz o que aqueles dois lugares não fizeram: recolocar os quatro elementos na posição de **despachos gerados na hora pelo orquestrador** — você não controla mais o conteúdo de cada despacho, apenas as regras que o orquestrador segue ao gerá-los. Os quatro elementos continuam funcionando como checklist: depois de escrever um despacho, conte-os um a um para confirmar que os quatro estão presentes.

```agentmentor-check
{
  "id": "orc-zh-04-vague-dispatch",
  "label": "Três despachos de uma frase, fracassados",
  "prompt": "Seu orquestrador dividiu uma investigação de cadeia de suprimentos entre três workers, enviando a cada um a mesma frase única: “Investigue os problemas da cadeia de suprimentos.” Terminada a execução, você descobre: o worker A e o worker B devolveram relatórios com conteúdo altamente sobreposto, e o worker C foi investigar uma crise antiga de anos atrás, sem relação com a situação atual sobre a qual você perguntou. A conta de tokens saiu três vezes maior, mas você obteve uma conclusão aproveitável. O que você deve fazer em seguida?",
  "whyHere": "Os quatro elementos acabaram de ser ensinados; as regras de escala ainda não foram cobertas. Pratique reconhecer a causa raiz numa cena em que você só consegue ver sintomas.",
  "mode": "single",
  "choices": [
    {
      "id": "a",
      "text": "Adicionar uma etapa de desduplicação no estágio de síntese para fundir os dois relatórios sobrepostos em um, e fazer o orquestrador anexar uma nota dizendo que “o resultado de C é irrelevante, ignore-o”.",
      "correct": false,
      "feedback": "Isso é colocar band-aid em sintoma. A desduplicação pode deixar o relatório final com aparência limpa, mas as três cobranças de tokens já foram gastas, e o trabalho em que A e B se sobrepuseram — a direção que alguém deveria ter coberto — continua faltando. Pós-processamento não conserta divisão de trabalho que falhou."
    },
    {
      "id": "b",
      "text": "Equipar cada um dos três despachos com os quatro elementos: objetivo próprio, formato de saída, orientação sobre ferramentas e fontes, e limites da tarefa.",
      "correct": true,
      "feedback": "Correto. Despachos de uma frase são exatamente como se parece a ausência dos quatro elementos. A falha do protótipo na retrospectiva oficial é quase idêntica: um subagente explorou uma crise antiga de anos atrás enquanto dois outros duplicaram trabalho sobre cadeias de suprimentos atuais, sem uma divisão de trabalho eficaz. A causa raiz é descrição de tarefa insuficiente, então os agentes duplicam trabalho e deixam lacunas. A correção está na mesma citação: objetivo, formato de saída, orientação sobre ferramentas e fontes, limites claros da tarefa — equipe os quatro, e o item de limites deve dizer explicitamente “não toque no território dos outros dois workers”."
    },
    {
      "id": "c",
      "text": "Trocar os três workers por um modelo mais capaz, para que julguem por conta própria quais direções diferentes perseguir.",
      "correct": false,
      "feedback": "Trocar de modelo não conserta o fato de que os três workers receberam a mesma frase única — eles não se veem, então, por mais fortes que sejam, cada um só pode fazer seu próprio palpite razoável sobre a mesma entrada, e a probabilidade de colisão não cai. Uma seção adiante vai mostrar que a retrospectiva também diz que agentes têm dificuldade de julgar o esforço apropriado para tarefas diferentes, e por isso eles embutiram regras nos prompts. O que falta aqui é descrição de tarefa, não capacidade do modelo."
    }
  ]
}
```

## Escalar o esforço conforme a complexidade: escrever regras de alocação no prompt

Os quatro elementos resolvem “o que cada worker faz”; resta uma pergunta: **quantos disparar, quanto cada um pode gastar**.

Esse conjunto de números apareceu na abertura do Curso 6; aqui ele é usado de outro jeito — não para julgar se vale usar multiagente, mas para escrevê-lo no prompt do orquestrador de modo que ele mesmo aloque as cotas. O diagnóstico da retrospectiva é direto: agentes têm dificuldade de julgar o esforço apropriado para tarefas diferentes, então eles embutiram regras de escala nos prompts. Levantamento simples de fatos exige apenas 1 agente com 3-10 chamadas de ferramenta, comparações diretas podem precisar de 2-4 subagentes com 10-15 chamadas cada, e pesquisa complexa pode usar mais de 10 subagentes com responsabilidades claramente divididas[^S2].

Uma disciplina de citação sobre esses números: **a identidade deles é “regras que eles embutiram nos próprios prompts”, não padrões da indústria, e não escalas que você deva copiar literalmente.** Sua distribuição de tarefas, a velocidade das suas ferramentas e seus modelos são todos diferentes dos deles. O que é de fato transportável é a prática em si — **escrever regras de alocação explicitamente no prompt do orquestrador, em vez de esperar que o orquestrador se autorregule**.

O que acontece se você não as escrever? A retrospectiva fornece a cena: sistemas multiagente têm diferenças-chave em relação a sistemas de agente único, incluindo um crescimento rápido da complexidade de coordenação. Agentes iniciais cometeram erros como disparar 50 subagentes para consultas simples, vasculhar a web sem fim atrás de fontes inexistentes e distrair uns aos outros com atualizações excessivas[^S2].

“Disparar 50 subagentes para consultas simples” — converta isso usando o balanço da seção anterior e você entende: pelos dados deles, multiagente é cerca de 15× os tokens de um chat[^S2], então esse tipo de fan-out descontrolado empurra esse multiplicador muito mais alto. Regras de cota não são mesquinharia; são **o meio de manter custo e valor da tarefa na mesma ordem de grandeza**.

Como você escreve essa regra no seu próprio prompt de orquestrador? Siga a forma deles e preencha com a sua escala: separe suas tarefas em alguns níveis, especifique para cada nível o teto de número de subagentes e o teto de chamadas de ferramenta por subagente, e depois acrescente uma cláusula como “se ultrapassar o teto, devolva os achados atuais; não continue”. Isso pode reduzir a probabilidade de descontrole, mas ainda é só um prompt — para modelos não determinísticos, um teto escrito no prompt é sempre apenas conselho. O portão de verdade fica do lado do código: o `LIMIT` no `pool` do esqueleto. A camada de prompt cuida da “autoconsciência do modelo”; a camada de código cuida do “fallback”. Você precisa das duas.

## Gargalos síncronos, e o preço da assincronia

Esta seção discute problemas que a arquitetura não resolveu até hoje. O texto original vem em dois parágrafos.

Primeiro parágrafo, estado atual: a execução síncrona cria gargalos. Atualmente, os agentes líderes deles executam subagentes de forma síncrona, esperando cada conjunto de subagentes concluir antes de prosseguir. Isso simplifica a coordenação, mas cria gargalos no fluxo de informação entre agentes. Por exemplo, o agente líder não consegue guiar os subagentes, os subagentes não conseguem se coordenar, e o sistema inteiro pode ficar bloqueado esperando um único subagente terminar de buscar[^S2].

Três itens de “não consegue”, cada um correspondendo a uma perda real:

- **O agente líder não consegue redirecionar em pleno voo** — no minuto 2 ele já percebe que a direção do worker C está errada, mas tem de esperar o lote terminar para fazer qualquer coisa.
- **Subagentes não conseguem se coordenar** — o worker A já achou algo, o worker B não sabe e pode estar rebuscando isso agora mesmo.
- **O lote inteiro é bloqueado pelo mais lento** — dois workers que terminam em 3 minutos vão esperar junto com um que estoura o tempo aos 25 minutos, até o minuto 25.

Segundo parágrafo, o custo do outro caminho: a execução assíncrona permitiria paralelismo adicional — agentes trabalhando concorrentemente e criando novos subagentes quando necessário. Mas essa assincronia acrescenta desafios em coordenação de resultados, consistência de estado e propagação de erros entre os subagentes[^S2].

Note o tom dessa frase: o material primário **lista esses três itens como desafios**, não como problemas resolvidos. Então esta lição não vai lhe dar “o esquema de orquestração assíncrona oficialmente recomendado” — ele não existe. Se você for para o assíncrono por conta própria, esses três itens são seus para carregar:

- **Coordenação de resultados**: os workers voltam aos poucos; “quando já terminamos o suficiente para começar a síntese” é um juízo que você precisa definir.
- **Consistência de estado**: o agente líder mudou o escopo da investigação em pleno voo; os workers em execução ainda usam o escopo antigo; as premissas dos dois lados se bifurcaram.
- **Propagação de erros**: um worker falhou, mas a saída intermediária dele já tinha sido usada para disparar novos workers. Quem nessa cadeia deve reexecutar, quais resultados ficam anulados — isso exige regras explícitas.

O exercício de Nível 2 desta lição vai pedir que você dê uma instância concreta de cada um numa linha do tempo específica.

## Comportamento emergente, e a última milha

Mais algumas lições de engenharia da mesma retrospectiva; cada uma é curta, mas cada uma vale um incidente em produção.

**Sistemas multiagente têm comportamentos emergentes, que surgem sem programação específica. Por exemplo, pequenas mudanças no agente líder podem mudar de forma imprevisível como os subagentes se comportam. O sucesso exige entender padrões de interação, não apenas o comportamento de agentes individuais**[^S2]. A mesma retrospectiva acrescenta uma frase mais dura: em software tradicional, um bug pode quebrar uma funcionalidade, degradar desempenho ou causar indisponibilidade. Em sistemas agênticos, mudanças pequenas cascateiam em grandes mudanças de comportamento, o que torna notavelmente difícil escrever código para agentes complexos que precisam manter estado em um processo de longa duração[^S2].

Impacto no seu dia a dia: **mude o prompt do orquestrador e você precisa rodar a suíte de avaliações inteira de novo; não dá para conferir só a saída do próprio orquestrador**. A pista de avaliação do Curso 10 entra em cena aqui — é o único instrumento que você tem para ver se uma mudança pequena tirou os subagentes do rumo.

**A última milha frequentemente vira a maior parte da jornada**: ao construir agentes de IA, a última milha frequentemente vira a maior parte da jornada. Bases de código que funcionam na máquina do desenvolvedor exigem engenharia significativa para virar sistemas confiáveis em produção. A natureza composta dos erros em sistemas agênticos significa que problemas menores para software tradicional podem descarrilar agentes por completo[^S2].

Duas práticas que acompanham: eles combinam a adaptabilidade de agentes de IA construídos sobre o Claude com salvaguardas determinísticas como lógica de retentativa e checkpoints regulares[^S2]; eles usam rainbow deployments para evitar perturbar agentes em execução, deslocando gradualmente o tráfego das versões antigas para as novas enquanto mantêm ambas rodando simultaneamente[^S2].

Rainbow deployments — isso se liga a um problema mencionado na abertura do Curso 9 ao usar atualizações de implantação como cenário de queda: um serviço web normal reinicia, os usuários tentam de novo uma vez e está tudo bem. Um agente que vinha rodando há 20 minutos é interrompido por um reinício, e você perdeu 20 minutos de trabalho mais os tokens já gastos. **Implantar tarefas de longa duração não é o mesmo que implantar serviços sem estado.**

## Calibragem: este é o mais caro dos cinco padrões

A esta altura você viu quatro dos cinco padrões. Classificado por custo, orquestrador-workers é o mais caro até aqui: além da sobrecarga da paralelização, ele acrescenta mais uma invocação de “fazer o modelo calcular a divisão”, mais o risco de “a divisão pode ser calculada errado”.

Então, antes de começar, faça três perguntas nesta ordem:

**Primeira: a divisão pode ser fixada no código?** Se sim, volte à Lição 3 e use seccionamento. No seccionamento, o prompt de cada ramo é polido à mão; no orquestrador-workers, os despachos são gerados na hora pelo modelo — o primeiro tem teto de qualidade mais alto e é mais fácil de depurar. **Se você consegue predefinir, não torne dinâmico.**

**Segunda: esta tarefa vale todo esse dinheiro?** Pelos dados deles, multiagente é cerca de 15× os tokens de um chat[^S2], e, para viabilidade econômica, o valor da tarefa precisa ser alto o bastante para pagar pelo aumento[^S2]. Este é um juízo de negócio, não técnico, mas precisa ser feito antes de escrever código.

**Terceira: se estiver incerto, meça primeiro.** A posição de encerramento da fonte oficial sobre todo o conjunto de padrões é: estes blocos de construção não são prescritivos. A chave para o sucesso é medir desempenho e iterar sobre as implementações; você deveria considerar adicionar complexidade apenas quando isso comprovadamente melhorar os resultados[^S1]. O Curso 10 lhe deu essa pista — primeiro rode seu conjunto real de tarefas com um único loop, obtenha uma linha de base, e só então julgue se orquestrador-workers a eleva. Sem linha de base, “parece melhor” e “gastei 15× para obter o mesmo resultado” são indistinguíveis para você.

Esta lição cobriu apenas “despachar para fora, coletar de volta”. E se o trabalho devolvido for de baixa qualidade — outro agente deveria revisá-lo, e como você combina esses quatro padrões — isso é conteúdo da Lição 5.

## 💻 Exercícios

<!-- exercises -->

### Nível 1: Reescrever despachos de uma frase em três despachos qualificados

Uma equipe precisa investigar problemas de desempenho em uma biblioteca. O orquestrador enviou a três workers a mesma frase única:

> “Esta biblioteca parece mais lenta ultimamente; vá investigar.”

Voltaram três relatórios: dois com conteúdo altamente sobreposto, o terceiro sobre velocidade de build — ninguém tocou no tempo de execução.

Ambiente dado (sem código, só prompts):

- Estrutura do repositório: `src/core/` (algoritmos e estruturas de dados), `src/server/` (caminhos de tratamento de requisição), `profiles/latest.cpuprofile` (um perfil de CPU já gerado)
- Os workers têm apenas três ferramentas disponíveis: `read_file`, `grep`, `read_profile`
- Nenhum dos três workers pode modificar código

Sua tarefa:

1. Reescreva aquela frase em **três** despachos, cada um com os quatro elementos: objetivo, formato de saída, orientação sobre ferramentas e fontes, limites da tarefa. Os três territórios não podem se sobrepor — você deve conseguir explicar em uma frase “por que o worker B não pode devolver a mesma coisa que o worker A”.
2. Acrescente **uma linha** de justificativa de cota para o lote inteiro: quantos workers disparar, teto de chamadas de ferramenta por worker, com qual nível você está comparando, e explique a identidade daquele nível.

<!-- rubric -->

- [ ] Três despachos, cada um apontando onde aparecem os quatro elementos; qualquer despacho a que falte qualquer elemento é desqualificado
- [ ] Os três **objetivos** não se sobrepõem, e cada um é estreito o bastante para se julgar se foi alcançado (não na escala “olhe o desempenho”)
- [ ] **Formato de saída** é fundível programaticamente: nomes de campo fixos, teto de quantidade de itens; idealmente os três usam o mesmo schema para que a síntese faça metade do trabalho em código
- [ ] **Orientação sobre ferramentas e fontes** especifica caminhos ou arquivos concretos, não “use as ferramentas que precisar”
- [ ] **Limites da tarefa** incluem ao menos um item “não faça X”, e ao menos um bloqueia explicitamente o território de outro worker
- [ ] A linha de cota informa: número de workers, teto de chamadas de ferramenta por worker, com qual nível compara, e declara que essa escala são regras que uma equipe embutiu nos próprios prompts, não padrões universais
- [ ] A linha de cota inclui uma cláusula de encerramento como “se ultrapassar o teto, devolva os achados atuais”
- [ ] Sinais desqualificantes: os três despachos são na verdade a mesma frase reformulada; ou depender de “adicionar uma etapa final de desduplicação” para cobrir a divisão de trabalho

<!-- answer -->

**Despacho A (pontos quentes do profile)**

- Objetivo: A partir do perfil de CPU existente, encontrar as 3 funções com maior percentual de tempo próprio e fornecer suas localizações no código-fonte.
- Formato de saída: Array JSON, máximo de 3 itens, cada um `{ "file": string, "line": number, "self_time_pct": number, "reason": string }`, ordenado por `self_time_pct` decrescente.
- Ferramentas e fontes: Use apenas `read_profile` para ler `profiles/latest.cpuprofile`; use `read_file` para abrir os arquivos-fonte correspondentes e confirmar números de linha. Não use `grep` para varreduras do repositório inteiro.
- Limites: Não modifique nenhum código; não entre em `src/server/` para análise de caminho de requisição (essa é a tarefa de B); não avalie complexidade algorítmica (essa é a tarefa de C); se notar um bug suspeito, apenas registre em `reason`, não expanda.

**Despacho B (E/S repetida nos caminhos de requisição)**

- Objetivo: Nos caminhos de tratamento de requisição em `src/server/`, encontrar chamadas a fontes de dados que são lidas repetidamente dentro de uma única requisição (a mesma chave/consulta lida múltiplas vezes).
- Formato de saída: Mesmo schema JSON, máximo de 5 itens; preencha `self_time_pct` com `null` se não se aplicar; `reason` deve informar o objeto lido repetidamente e quantas vezes dentro de uma requisição.
- Ferramentas e fontes: `grep` e `read_file`, caminhos restritos a `src/server/`. Não leia o profile (A está lendo).
- Limites: Não modifique nenhum código; não entre em `src/core/`; não julgue complexidade algorítmica; não proponha correções, apenas reporte fenômenos e localizações.

**Despacho C (estruturas algorítmicas super-lineares)**

- Objetivo: Em `src/core/`, encontrar estruturas que degradam de forma super-linear conforme o tamanho da entrada cresce — travessias aninhadas, buscas lineares dentro de laços, objetos grandes construídos repetidamente em corpos de loop.
- Formato de saída: Mesmo schema JSON, máximo de 5 itens; preencha `self_time_pct` com `null`; `reason` deve informar a estrutura de aninhamento e a expressão da taxa de crescimento (ex.: “loop externo sobre n, `indexOf` interno também é n, juntos n²”).
- Ferramentas e fontes: `read_file` e `grep`, caminhos restritos a `src/core/`. Não leia o profile — evite chegar à mesma leva de conclusões que A.
- Limites: Não modifique nenhum código; não entre em `src/server/`; não dê propostas de reescrita; não rode benchmarks.

**Justificativa de cota (uma linha)**

> Esta é uma investigação de “comparação em múltiplas direções”, mais pesada do que levantamento simples de fatos mas muito aquém de precisar de mais de 10 subagentes com responsabilidades explicitamente divididas, então dispare 3 workers com teto de 12 chamadas cada; se um worker ultrapassar o teto, devolva os achados atuais e pare. O nível de comparação é o “comparações diretas podem precisar de 2-4 subagentes com 10-15 chamadas cada” da retrospectiva pública — são regras que eles embutiram nos próprios prompts, não um padrão da indústria; estou apenas tomando emprestada a ordem de grandeza.

**Por que esta divisão**: os três despachos são divididos por **fonte de evidência** (profile / pontos de chamada do lado servidor / estrutura algorítmica do core), não por dimensões vagas como “três aspectos do desempenho”. Fontes que não se sobrepõem produzem naturalmente conclusões que não se sobrepõem. Os três usam o mesmo schema, então o estágio de síntese do orquestrador pode primeiro usar código para fundir por `file` e depois fazer o modelo julgar apenas os conflitos fundidos.

<!-- hint -->

Não corra para escrever objetivos. Pergunte-se primeiro: **depois que esses três relatórios voltarem, como vou combiná-los em uma conclusão?** Os campos e o teto de quantidade de itens do formato de saída devem ser derivados de trás para frente a partir desse plano de combinação. Se você não consegue imaginar como combiná-los, seus objetivos estão divididos errado.

<!-- hint -->

A metade dos limites mais fácil de omitir é o “não faça X”. Confira aos pares: entre A e B, entre B e C, entre A e C — cada par tem uma frase bloqueando explicitamente o território do outro? Algum par consegue ler o mesmo arquivo e chegar à mesma conclusão?

### Nível 2: Calcular os custos numa linha do tempo de orquestração síncrona

Uma orquestração rodou assim (o tempo começa quando o agente líder envia os despachos):

- Minuto 0: o agente líder despacha os workers A, B, C simultaneamente.
- Minuto 3: A devolve resultados.
- Minuto 4: B devolve resultados.
- Minuto 25: C nunca devolveu; o timeout de 25 minutos do lado do worker é atingido, C é julgado como estourado e não devolve nada.
- Minuto 25: este lote finalmente termina; o agente líder começa a síntese.

O agente líder executa subagentes de forma **síncrona**: ele espera o lote inteiro concluir antes de continuar.

Responda três coisas (sem código):

1. **Calcule o desperdício de espera deste lote**. Dê ao menos três perspectivas com suas fórmulas.
2. **Aponte três coisas que o agente líder não consegue fazer no modelo síncrono**, e ancore cada uma a um momento específico desta linha do tempo.
3. **Se trocar para assíncrono, quais três novos custos você precisa carregar**, e dê uma manifestação concreta de cada um nesta linha do tempo.

<!-- rubric -->

- [ ] A questão 1 dá ao menos três perspectivas com fórmulas autoconsistentes: perspectiva de latência (lote inteiro 25 min vs. 4 min sem C; C sozinho acrescentou 21 min), perspectiva de saída ociosa (A ocioso 22 min + B ocioso 21 min = 43 min), perspectiva de consumo (3 + 4 + 25 = 32 worker-minutos, os 25 de C não produziram nada, ~78%)
- [ ] Declara explicitamente que o próprio agente líder ficou bloqueado pela barreira síncrona do minuto 4 ao minuto 25, por 21 minutos: segurando dois resultados completos sem poder agir
- [ ] Os três itens da questão 2 batem: **não consegue redirecionar subagentes em pleno voo**, **subagentes não conseguem se coordenar entre si**, **sistema inteiro bloqueado pelo mais lento**; cada um ancorado a um momento específico da linha do tempo, não apenas repetindo definições
- [ ] Os três custos da questão 3 batem: **coordenação de resultados**, **consistência de estado**, **propagação de erros entre subagentes**; cada um pareado com uma manifestação concreta nesta linha do tempo
- [ ] Não escreve o assíncrono como “tem solução oficial, é só seguir” — os materiais primários listam esses três como desafios
- [ ] Sinais desqualificantes: responder apenas “síncrono é lento, vá para assíncrono”; ou números calculados que se contradizem (ex.: dizer que o lote inteiro termina aos 4 min e também que A ficou ocioso 22 min)

<!-- answer -->

**1. Desperdício de espera, três perspectivas**

- **Perspectiva de latência**: tempo de parede do lote inteiro = 25 minutos, determinado pelo worker mais lento, C. Se C não existisse, este lote poderia terminar no minuto 4. Então C sozinho acrescentou `25 − 4 = 21` minutos de latência.
- **Perspectiva de saída ociosa**: o resultado de A está parado sem uso desde o minuto 3, parado por `25 − 3 = 22` minutos; o resultado de B ficou parado por `25 − 4 = 21` minutos. Total de `22 + 21 = 43` minutos de “concluído mas inutilizável”. O próprio agente líder também fica bloqueado nessa janela: do minuto 4 ao minuto 25, 21 minutos no total, segurando dois resultados completos sem poder começar a síntese, sem poder redirecionar, sem poder reportar antecipadamente.
- **Perspectiva de consumo**: os três workers de fato rodaram `3 + 4 + 25 = 32` worker-minutos, dos quais os 25 minutos de C não produziram nada por causa do timeout, respondendo por `25 ÷ 32 ≈ 78%`. Em outras palavras, mais de três quartos do tempo de execução deste lote não produziram saída aproveitável — e os tokens correspondentes continuam sendo cobrados.

**2. Três coisas que o agente líder não consegue fazer no modelo síncrono**

- **Não consegue redirecionar subagentes em pleno voo**. Suponha que o agente líder já veja, pelos resultados de A e B no minuto 6, que a direção de C provavelmente é um beco sem saída; ainda assim ele não consegue mandar nenhuma instrução a C, não consegue pará-lo, não consegue mudar seu tema. Só pode esperar até o minuto 25.
- **Subagentes não conseguem se coordenar entre si**. A devolveu no minuto 3 uma pista essencial de que C precisa desesperadamente — mas C não consegue vê-la. Durante os 25 minutos de C, ele pode estar rebuscando o que A já investigou, sem nenhum mecanismo para saber.
- **Sistema inteiro bloqueado pelo mais lento**. Nesta linha do tempo, dois workers que terminam em 4 minutos esperam ao lado de um worker que estoura o tempo até o minuto 25. A latência do lote é igual à latência do membro mais lento, independentemente de quão rápido os outros dois rodaram.

**3. Trocando para assíncrono, três novos custos a carregar**

- **Coordenação de resultados**. Depois de ir para o assíncrono, A volta no minuto 3, B no minuto 4, C talvez nunca volte. “Quando já terminamos o suficiente para começar a síntese” deixa de ter resposta natural — você precisa defini-la: esperar um timeout fixo? Prosseguir depois de coletar 2? Ou atualizar as conclusões incrementalmente a cada chegada? Manifestação concreta nesta linha do tempo: no minuto 4 você está segurando dois resultados; a síntese deve começar agora? O código precisa ter um critério explícito.
- **Consistência de estado**. O benefício do assíncrono é que o agente líder pode estreitar o escopo da investigação no minuto 6 com base nos resultados de A e B. Mas C continua rodando sob o escopo antigo, do minuto 0. Se C de fato devolver um resultado no minuto 20, esse resultado está construído sobre uma premissa que já foi derrubada — você precisa de um jeito de identificá-lo e marcá-lo, ou ele entrará na síntese como “um resultado legítimo”.
- **Propagação de erros entre subagentes**. Assíncrono significa que o agente líder pode despachar D e E no minuto 8 com base na saída intermediária de C. Depois que C estoura o tempo no minuto 25, os resultados de D e E ainda valem? Eles estão construídos sobre uma investigação que nunca terminou. Quem deve reexecutar, quais resultados ficam anulados, até onde a falha se propaga ao longo dessa cadeia de disparos — o modelo síncrono não tem esse problema (a falha de C é apenas um resultado vazio); o assíncrono exige um conjunto explícito de regras.

Os materiais primários listam esses três como **desafios não resolvidos**, não como receitas. Então, se você de fato for para o assíncrono, trate esses três como tarefas de projeto suas, não como cópia de lição de casa.

<!-- hint -->

Não calcule só um número para a questão 1. “Desperdício” sob três perspectivas diferentes são três quantidades diferentes: **quanto tempo a mais o relógio de parede levou**, **por quanto tempo saída concluída ficou ociosa**, **quanto do tempo de execução não produziu nada**. Calcule os três; é assim que você vê exatamente onde o custo do síncrono aterrissa.

<!-- hint -->

As questões 2 e 3 são pareadas: cada coisa que o agente líder **não consegue fazer** no síncrono vira algo que ele **consegue fazer, mas a um custo** no assíncrono. Tente pareá-las — qual item de custo corresponde a “não consegue redirecionar em pleno voo”? Depois de parear, você vai ver que o assíncrono não consertou essas três coisas; ele as trocou por três coisas mais difíceis.

<!-- /exercises -->

## Recapitulação

- Orquestrador-workers é um fluxo de trabalho no qual um LLM central decompõe tarefas dinamicamente, delega-as a LLMs workers e sintetiza seus resultados; serve bem a tarefas complexas nas quais você não consegue prever as subtarefas necessárias[^S1]
- Embora topograficamente parecido com a paralelização, a diferença essencial é a flexibilidade: as subtarefas não são predefinidas, mas determinadas pelo orquestrador com base na entrada específica[^S1] — mesma forma, momento diferente da decisão
- Um worker não é nada de novo: um sistema multiagente é a reunião de múltiplos “LLMs usando ferramentas autonomamente em um loop”, com um agente líder coordenando o processo e delegando a subagentes especializados que operam em paralelo[^S2]
- Os 90,2% só valem em seu contexto completo: a avaliação interna de pesquisa deles, Claude Opus 4 como líder + subagentes Claude Sonnet 4, destacando-se especialmente em consultas em largura[^S2]; a explicação do mecanismo é que multiagente ajuda principalmente a gastar tokens suficientes — na análise do BrowseComp, três fatores explicam 95% da variância, com o uso de tokens sozinho respondendo por 80%[^S2]
- A conta é o outro lado do mesmo balanço: pelos dados deles, agentes são cerca de 4× os tokens de um chat, multiagente cerca de 15×, e, para viabilidade econômica, o valor da tarefa precisa ser alto o bastante para pagar por isso[^S2]
- Cada subagente precisa de um objetivo, um formato de saída, orientação sobre as ferramentas e fontes a usar e limites claros da tarefa; sem descrições detalhadas de tarefa, agentes duplicam trabalho, deixam lacunas ou não encontram a informação necessária[^S2] — os “prompts de delegação autossuficientes” do Curso 6 se expandem nesses quatro itens
- Agentes têm dificuldade de julgar o esforço apropriado, então escreva regras de alocação no prompt: a escala deles é levantamento simples de fatos 1 agente 3-10 chamadas, comparações diretas 2-4 subagentes 10-15 chamadas cada, pesquisa complexa mais de 10 subagentes com divisão clara[^S2]; sem regras escritas eles já viram as consequências — disparar 50 subagentes para consultas simples, vasculhar a web sem fim atrás de fontes inexistentes, distrair uns aos outros com atualizações excessivas[^S2]
- A execução síncrona simplifica a coordenação mas bloqueia o fluxo de informação: o agente líder não consegue redirecionar em pleno voo, os subagentes não conseguem se coordenar, o sistema inteiro pode ser bloqueado por um subagente[^S2]; o assíncrono permite mais paralelismo, ao custo de coordenação de resultados, consistência de estado e propagação de erros entre subagentes — esses três são desafios nos materiais primários, não soluções resolvidas[^S2]
- Sistemas multiagente têm comportamentos emergentes; pequenas mudanças no agente líder podem mudar de forma imprevisível o comportamento dos subagentes; entender padrões de interação importa, não apenas agentes individuais[^S2]; a última milha frequentemente vira a maior parte da jornada; bases de código que funcionam na máquina do desenvolvedor exigem engenharia significativa para virar sistemas confiáveis em produção[^S2]; as práticas que acompanham são salvaguardas determinísticas (lógica de retentativa, checkpoints regulares)[^S2] e rainbow deployments — deslocar tráfego gradualmente mantendo as duas versões rodando, evitando perturbar agentes em execução[^S2]
- Este é o mais caro dos quatro padrões aprendidos até agora: antes de começar, confirme que a decomposição de fato não pode ser predefinida (se puder, volte ao seccionamento da Lição 3), depois confirme que o valor da tarefa suporta 15×; se estiver incerto, use a pista do Curso 10 para medir uma linha de base primeiro — só adicione complexidade quando isso comprovadamente melhorar os resultados[^S1]

[>> Lição 5: O laço de revisão, e compor padrões em um grafo](./05-evaluator-and-graphs.md)
