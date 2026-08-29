# Lição 1: Quando um loop só não basta

> Objetivos de aprendizado:
> - Usar uma tarefa real que quebra agentes de loop único para mostrar por que “arrume uma janela maior” não resolve o problema de forma
> - Enunciar a distinção arquitetural entre fluxos de trabalho e agentes, e usar “quem detém o plano” para situar qualquer sistema nesse eixo
> - Listar os gatilhos para subir de nível e as condições para ficar onde está, com latência e custo de tokens na mesa antes de tudo
>
> Pré-requisitos: Concluir os 11 primeiros cursos desta série, saber escrever à mão um loop de harness dirigido por `stop_reason` (curso 7, “Fundamentos do Harness de Agente: Laços e Controle”) | Próxima: [Lição 2 >>](./02-chaining-and-routing.md)

## No módulo 30, alguma coisa está errada

Você precisa migrar um repositório de backend do framework de RPC interno v1 para o v2. Antes de começar, precisa de um inventário: o repositório tem 40 módulos, e cada módulo precisa de uma avaliação de migração — listar os pontos de risco, estimar o tamanho das mudanças, anexar um manifesto de dependências. O trabalho não é difícil, é só numeroso. Você tem aquele harness do curso 7 desta série:

```javascript
while (response.stop_reason === "tool_use") {
  messages.push({ role: "assistant", content: response.content });
  const toolResults = await runToolUses(response.content);
  messages.push({ role: "user", content: toolResults });
  response = await client.messages.create({ model, max_tokens, tools, messages });
}
```

(Um harness é o código hospedeiro que envolve as chamadas ao modelo: manda a requisição, executa as ferramentas que o modelo quer usar, devolve os resultados, decide se continua.)

Você entrega a lista dos 40 módulos de uma vez, escreve “avalie cada um, um relatório por módulo” e vai fazer café.

Os 5 primeiros módulos ficam ótimos: ele faz grep dos pontos de chamada, lê configurações, confere arquivos de teste, e os relatórios saem mais detalhados do que você esperava.

No módulo 15, você volta e olha os logs. O array `messages` já está impressionante: saída de grep dos primeiros 14 módulos, pedaços inteiros de arquivos de configuração lidos, recibos de sucesso de escrita de arquivo, rastros de caminhos tomados e depois abandonados — tudo isso ainda ocupando aquela linha do tempo. Nada desse conteúdo estava errado — cada coisa foi necessária no seu momento. Mas a função atual delas ficou reduzida a uma só: ocupar espaço.

No módulo 30, a qualidade desaba. Ele copia a conclusão do módulo 27 para o módulo 30 porque os nomes são parecidos; pula caladinho a etapa “conferir se há interceptadores customizados” que tinha feito todas as vezes anteriores; no módulo 34, até o formato da saída começa a derivar.

Sua primeira reação provavelmente é: trocar para um modelo com uma janela de contexto maior.

Essa reação só leva você até a metade do caminho. Dobre a janela e o ponto de colapso provavelmente sai do módulo 30 para o módulo 55. O seu próximo repositório tem 120 módulos. Você não resolveu o problema, você comprou uma suspensão da execução.

O que se esgotou de verdade não é a janela, é **a forma de “um loop só”**: 40 itens independentes forçados a dividir uma linha do tempo, um orçamento de atenção. A qualidade da avaliação do módulo 30 depende de quanto resíduo os 29 primeiros módulos deixaram para trás — e essas duas coisas não têm nada a ver uma com a outra.

O que este curso faz é trocar essa forma.

## Primeiro, acerte o vocabulário oficial

**Agentes conseguem lidar com tarefas sofisticadas, mas a implementação deles costuma ser direta. Tipicamente são apenas LLMs usando ferramentas com base em feedback do ambiente, dentro de um loop**[^S1]. Aquele `while` que você escreveu no curso 7 desta série é exatamente isso, sem uma linha de diferença. Então se posicione: você já construiu um agente, este curso não começa do zero.

Uma camada acima. A Anthropic classifica todas essas variações como **sistemas agênticos** (em linguagem direta: sistemas montados a partir de modelos, ferramentas e alguma forma de fluxo de controle, capazes de percorrer várias etapas por conta própria), mas dentro dessa categoria ampla ela traça uma distinção arquitetural importante[^S1]:

- **Fluxos de trabalho são sistemas em que LLMs e ferramentas são orquestrados por caminhos de código predefinidos**[^S1]. “Caminhos de código predefinidos” é a expressão-chave — o que acontece em seguida está escrito no código.
- **Agentes, por outro lado, são sistemas em que os LLMs dirigem dinamicamente seus próprios processos e o uso de ferramentas, mantendo controle sobre como realizam as tarefas**[^S1]. O que acontece em seguida, o modelo decide na hora.

Mais um termo fundamental que você vai usar repetidamente nas próximas lições. **Em computação, sistemas determinísticos produzem a mesma saída toda vez, dadas entradas idênticas, enquanto sistemas não determinísticos — como agentes — podem gerar respostas variadas mesmo com as mesmas condições iniciais**[^S3].

Aplique essa definição ao seu `while` e você verá que são duas coisas costuradas: como mandar a requisição, como executar as chamadas de ferramenta, quando parar — isso é determinístico, escrito por você em código; enquanto “o que dar grep em seguida, se este relatório está terminado” — isso é não determinístico, decidido pelo modelo na hora. A cirurgia que você está prestes a fazer é mover o poder de decisão entre essas duas metades.

## O eixo de “quem detém o plano”

A documentação do Claude Code pergunta isso de forma mais direta: **Subagentes, skills, times de agentes e fluxos de trabalho conseguem, todos, rodar uma tarefa de várias etapas. A diferença é quem detém o plano**[^S5].

(“Subagente” = um assistente que trabalha de forma independente na sua própria janela de contexto e devolve só um resumo; “fan-out” = despachar vários subagentes para trabalharem ao mesmo tempo. O curso 6 desta série cobriu os dois termos.)

Essa frase corta um monte de abordagens que parecem semelhantes. Pegue “rodar avaliações para 40 módulos”:

- Você deixa o modelo percorrer os 40 em uma única conversa — o plano está nas mãos do modelo, e é implícito, escondido no histórico da conversa. Você teria que garimpar logs para adivinhar o caminho que ele pretendia.
- Você faz do modelo um orquestrador, e ele decide a cada turno qual subagente despachar para qual módulo — o plano continua nas mãos do modelo, só um pouco mais explícito.
- Você escreve um script, e o próprio script percorre aqueles 40 módulos com um `for` — o plano está no código. Você pode abrir o arquivo e lê-lo de ponta a ponta, e rodá-lo de novo amanhã sem mudar nada.

A terceira abordagem tem uma descrição precisa: **Um fluxo de trabalho move o plano para dentro do código. O script do fluxo de trabalho detém ele mesmo o loop, a ramificação e os resultados intermediários, então o contexto do Claude guarda apenas a resposta final**[^S5]. E **os resultados intermediários ficam em variáveis do script em vez de aterrissarem no contexto do Claude**[^S5]. A saída do grep do módulo 27 fica em um array JavaScript, então a avaliação do módulo 30 naturalmente não consegue vê-la — não porque o modelo aprendeu a ignorá-la, mas porque ele nunca teve a chance de vê-la.

Para as duas pontas desse eixo, a orientação oficial dá a cada uma uma frase sobre adequação: **Quando mais complexidade se justifica, fluxos de trabalho oferecem previsibilidade e consistência para tarefas bem definidas, enquanto agentes são a melhor opção quando flexibilidade e tomada de decisão conduzida pelo modelo são necessárias em escala**[^S1].

**Uma coisa a esclarecer**: este curso chama esse eixo de “espectro de determinismo” e chama os padrões de composição da lição 5 de “grafos”, “nós”, “arestas”. Esses rótulos são **metáforas de engenharia do próprio curso e nunca aparecem nas fontes primárias** — os materiais primários só fornecem as definições das duas pontas (caminhos de código predefinidos vs. decisões conduzidas pelo modelo)[^S1] e o enquadramento de “quem detém o plano”[^S5]. Tomamos emprestadas as metáforas do espectro e do grafo porque são convenientes para arrumar padrões que existem de verdade; você não vai ler esses termos em nenhuma documentação oficial, então não os apresente como conceitos oficiais.

## Quando subir de nível

“Um loop só não basta” soa como intuição, mas há gatilhos que dá para enunciar.

**Gatilho um: a tarefa precisa de mais agentes do que uma conversa consegue coordenar, ou você quer a orquestração codificada como um script que dá para ler e rodar de novo**[^S5]. A primeira metade é uma questão de capacidade, a segunda é uma questão de engenharia — mesmo que uma conversa consiga coordenar aquilo no limite, “dá para rodar exatamente do mesmo jeito amanhã?” já se qualifica como motivo por si só.

**Gatilho dois: quando a tarefa é maior do que um agente consegue segurar no contexto, ou quando a mesma etapa precisa rodar sobre muitos itens**[^S5]. Essas duas frases juntas descrevem exatamente o cenário dos 40 módulos do começo. Note a segunda frase: a quantidade de itens é, por si só, um motivo, independentemente de cada item ser difícil ou não.

**Gatilho três: quando uma tarefa lateral inundaria a sua conversa principal**. A descrição de cenário da documentação de subagentes: quando uma tarefa lateral inundaria a sua conversa principal com resultados de busca, logs ou conteúdos de arquivo que você não vai consultar de novo, despache um subagente — ele faz esse trabalho no próprio contexto e devolve apenas o resumo[^S4], **preservando contexto ao manter exploração e implementação fora da sua conversa principal**[^S4]. Repare que esse gatilho prescreve “despache um subagente” — o plano continua nas mãos do modelo; isso e “mover o plano para dentro do código” são duas coisas diferentes. As colunas B e C do exercício do Nível 2 vão colocar essa distinção lado a lado.

Olhe este código para pegar o jeito de como fica a forma depois de trocada:

```javascript
// Ilustração do próprio curso, só para comparar formas; os materiais primários
// não contêm exemplos de código de script de orquestração.
const findings = [];
for (const mod of modules) {
  // Cada módulo ganha um loop de harness novinho: messages limpo, guardando só o trabalho deste módulo
  const messages = [{ role: "user", content: assessPrompt(mod) }];
  findings.push(await runHarnessLoop(messages)); // Os resultados intermediários aterrissam neste array
}
const report = await summarize(findings);        // Só a etapa de resumo volta ao modelo
```

O loop continua sendo aquele loop — dentro de `runHarnessLoop` está o `while` que você escreveu no curso 7 desta série. Só uma coisa mudou: **quem conta até 40**. Antes, o modelo estava contando. Agora, o `for` é que conta.

```agentmentor-check
{
  "id": "orc-zh-01-bigger-window",
  "label": "Janela insuficiente, ou forma errada?",
  "prompt": "A sua avaliação de migração de 40 módulos quebrou: depois do módulo 30, ela começa a contaminar conclusões umas com as outras e a pular itens de checagem. Um colega dá uma olhada e diz: “É só trocar para um modelo com contexto maior. Não precisa mudar a arquitetura.” Qual julgamento se sustenta melhor?",
  "whyHere": "Você acabou de ler os gatilhos para subir de nível. O erro de julgamento mais comum não é desconhecer que orquestração existe, e sim tratar um problema de forma como um problema de capacidade — esta questão separa os dois.",
  "mode": "single",
  "choices": [
    {
      "id": "a",
      "text": "O colega tem razão: a causa imediata do colapso é o contexto ficando entupido. Dobre a janela e este repositório chega ao fim. Não precisa mexer na arquitetura.",
      "correct": false,
      "feedback": "Uma janela maior de fato empurra o ponto de colapso para a frente, e este repositório pode realmente chegar ao fim; mas quanto é suficiente depende da quantidade de itens, e a quantidade de itens é dada pela tarefa, não pela sua escolha. Cada resto de leitura e escrita deixado pelos 29 primeiros módulos era legítimo no seu momento, mas ainda assim consome o orçamento de atenção dos módulos posteriores (o curso 8 desta série cobriu como esse consumo acontece). Quando o próximo repositório tiver 120 módulos, você vai refazer essa conta."
    },
    {
      "id": "b",
      "text": "Trocar de janela só adia o ponto de colapso: a causa raiz é a mesma etapa rodando sobre muitos itens, com o resíduo anterior consumindo a atenção posterior — mova o plano para dentro do código.",
      "correct": true,
      "feedback": "Correto. Esta tarefa aciona dois gatilhos ao mesmo tempo: “maior do que um agente consegue segurar no contexto” e “a mesma etapa precisa rodar sobre muitos itens” — os dois são sinais no nível da forma. Depois de mover o plano para dentro do código, cada um dos 40 módulos roda um loop de harness limpo, a qualidade da avaliação do módulo 30 deixa de ser determinada pelo resíduo dos 29 anteriores, e os resultados intermediários ficam em variáveis do script."
    },
    {
      "id": "c",
      "text": "Mostra que a abordagem de loop único está obsoleta: daqui para a frente, qualquer tarefa deveria começar com orquestração. A era de começar por um loop só deveria ser virada.",
      "correct": false,
      "feedback": "Passou do ponto. A linha oficial é achar primeiro a solução mais simples e só acrescentar complexidade quando necessário — o que pode significar não construir sistemas agênticos de jeito nenhum. Para muitas aplicações, otimizar chamadas únicas de LLM com recuperação e exemplos no contexto costuma bastar. E problemas em aberto, com contagem de etapas imprevisível e que não dá para fixar em um caminho rígido, devem ficar com loops autônomos."
    }
  ]
}
```

## Quando ficar onde está

Atrás dos sinais de gatilho existe uma lista de conferência do lado oposto, igualmente longa, e essa é mais fácil de pular.

**Ache a solução mais simples possível, e só aumente a complexidade quando necessário. Isso pode significar não construir sistemas agênticos de jeito nenhum**[^S1]. **Para muitas aplicações, no entanto, otimizar chamadas únicas de LLM com recuperação e exemplos no contexto costuma bastar**[^S1]. Aquele trabalho de renomear uma função em 12 lugares não precisa de harness, não precisa de orquestração — uma chamada mais um `grep` e está feito.

**Alguns domínios hoje não são uma boa escolha para sistemas multiagente**: aqueles que exigem que todos os agentes compartilhem o mesmo contexto, ou em que há muitas dependências entre agentes. O texto nomeia um exemplo — **a maior parte das tarefas de programação envolve menos tarefas genuinamente paralelizáveis do que pesquisa, e agentes LLM ainda não são muito bons em coordenar e delegar a outros agentes em tempo real**[^S2]. Você está refatorando um módulo de pedidos fortemente acoplado, e as mudanças se propagam por uma cadeia de chamadores — abrir isso em fan-out para cinco subagentes só deixa tudo mais lento e mais bagunçado, porque todos precisam olhar para a mesma coisa, e quem se mexer primeiro invalida a informação de todos os outros.

Na direção contrária, as condições positivas de adequação são declaradas com a mesma clareza: eles descobriram que sistemas multiagente se destacam em tarefas que **envolvem paralelização pesada, informação que excede janelas de contexto únicas, e interação com numerosas ferramentas complexas**[^S2], e **tarefas em que o valor da tarefa é alto o bastante para pagar pelo desempenho adicional**[^S2]. Quanto mais dessas três condições você acertar, mais vale a pena subir de nível.

Há também uma categoria de tarefas que **deve ficar com loops autônomos**, sem ser forçada para dentro de orquestração: **problemas em aberto, em que é difícil ou impossível prever o número de etapas necessárias, e em que você não consegue fixar um caminho rígido no código** — esses podem ser entregues a agentes, eles vão potencialmente operar por muitos turnos, e você precisa ter algum nível de confiança na tomada de decisão deles[^S1]. O próprio sistema de pesquisa da Anthropic é desse tipo: **trabalho de pesquisa envolve problemas em aberto em que é muito difícil prever de antemão as etapas necessárias. Você não consegue fixar um caminho rígido para explorar temas complexos, porque o processo é inerentemente dinâmico e dependente do caminho**[^S2].

Então “devo migrar para orquestração?” não é uma barra de progresso de mão única. A avaliação dos 40 módulos deve caminhar para orquestração porque as etapas são fixas, só numerosas; “devemos trocar a fila de mensagens de A para B?” não deve caminhar para orquestração porque você nem sabe quantos artigos vai precisar ler.

## Ponha o custo na mesa antes de tudo

Antes de começar a aprender os cinco padrões, abra a contabilidade.

**Sistemas agênticos com frequência trocam latência e custo por melhor desempenho na tarefa, e você deveria considerar quando essa troca faz sentido**[^S1]. Nem uma palavra aqui é retórica: está descrevendo uma **troca**.

Quão caro? A Anthropic fornece um conjunto de observações dos próprios dados: **agentes tipicamente usam cerca de 4× mais tokens do que interações de chat, e sistemas multiagente usam cerca de 15× mais tokens do que chats**[^S2]. Daí a conclusão deles — **para viabilidade econômica, sistemas multiagente exigem tarefas em que o valor da tarefa seja alto o bastante para pagar pelo desempenho adicional**[^S2].

Note o contexto desse número: ele vem dos dados deles, não de um benchmark universal, e não é “toda abordagem de orquestração custa 15× mais”. Mas a direção é clara: a cada passo que você dá rumo a “mais agentes, mais paralelismo”, a conta sobe um degrau. Delimitando rápido: esse multiplicador mede sistemas multiagente em relação a chat, não a etiqueta de preço de “mover o plano para dentro do código” em si — os materiais primários nunca deram um número de custo isolado para scripts de orquestração. É também por isso que aqueles 40 módulos valem a subida enquanto as 12 renomeações não — não porque uma é “complexa” e a outra é “simples”, mas porque uma avaliação de migração que economiza duas semanas de retrabalho consegue bancar esse custo.

## As próximas cinco lições

O resto deste curso começa pela forma mais leve e constrói rumo à composição:

- **Lição 2: Encadeamento e roteamento**: quebrar uma tarefa em etapas fixas com gates programáticos entre elas; classificar e então despachar para prompts especializados. A forma mais leve de “plano no código”.
- **Lição 3: Paralelização**: seccionamento (dividir em subtarefas independentes rodadas em paralelo) e votação (rodar a mesma tarefa várias vezes para obter saídas diversas), mais como agregar resultados em código.
- **Lição 4: Orquestrador-workers**: um LLM central decompõe tarefas dinamicamente, delega-as a LLMs workers e sintetiza seus resultados. A diferença-chave: as subtarefas não são predefinidas.
- **Lição 5: Loops de avaliação, e composição de padrões em grafos**: checar-corrigir-rechecar até passar ou parar de progredir, e então costurar os padrões anteriores. Aquela lição vai repetir: “grafo” é visualização do próprio curso.
- **Lição 6: Mão na massa**: elevar aquele harness de loop único do curso 7 desta série a um script de orquestração determinístico.

Essa taxonomia de padrões não é relíquia de 2024: a documentação atual de orquestração multiagente da plataforma Claude ainda nomeia, de forma independente, **Parallelization (fan-out de subtarefas independentes ao mesmo tempo, com o coordenador sintetizando os resultados), Specialization (rotear para agentes com prompts de sistema e ferramentas focados em domínio), Escalation (consultar um agente ou modelo mais capaz para um subconjunto de subtarefas complexas)**[^S6]. A pele mudou, o esqueleto é o mesmo.

Mais uma coisa sobre como este curso se divide em relação aos dois anteriores: o **curso 2** desta série ensinou o conceito de fluxos de trabalho — etapas, estado, ramificação, entendimento em nível de diagrama; o **curso 6** desta série ensinou divisão de trabalho e comunicação em colaboração multiagente — fan-out, prompts de delegação autocontidos, produtor-revisor. Este curso não reensina nenhum dos dois. O que ele cobre é **o próprio fluxo de controle**: quem conta, quem ramifica, para onde vão os resultados intermediários, o que acontece quando quebra. Ponte rápida de vocabulário: o que o curso 6 desta série chamou de “produtor-revisor”, os materiais primários chamam de **evaluator-optimizer**[^S1], e a documentação de fluxos de trabalho do Claude Code chama de **fazer agentes independentes revisarem adversarialmente os achados uns dos outros**[^S5].

## Proporcionalidade: tudo tem que passar pela “melhora mensurável”

Este curso vai ensinar cinco padrões e um monte de métodos de composição. Todos compartilham a mesma linha de reconhecimento, e o texto original é inequívoco: **Estes blocos de construção não são prescritivos. São padrões comuns que desenvolvedores podem moldar e combinar para atender a diferentes casos de uso. A chave do sucesso, como em qualquer funcionalidade com LLM, é medir desempenho e iterar nas implementações. Repetindo: você só deveria considerar acrescentar complexidade quando ela comprovadamente melhora os resultados**[^S1].

“Comprovadamente melhora os resultados” exige sustentação concreta, e ela vem das avaliações do curso 10 e da observabilidade do curso 11 desta série: sem um conjunto de avaliação, você não consegue dizer com clareza “acrescentar roteamento melhorou mesmo as coisas?”. O fecho do texto canônico segue esta ordem: **comece com prompts simples, otimize-os com avaliação abrangente, e acrescente sistemas agênticos de várias etapas só quando as soluções mais simples ficarem aquém**[^S1].

Então, depois de aprender cada padrão, pergunte a si mesmo: **consigo produzir um número mostrando que os resultados melhoraram depois de acrescentá-lo?** Se não consegue, ainda não acrescente.

## 💻 Exercícios

<!-- exercises -->

### Nível 1: Coloque cinco tarefas em três faixas

Não precisa de código. Para cada uma destas 5 tarefas, julgue em qual faixa ela cai:

- **Um loop só basta** (ou até uma chamada só basta, não acrescente complexidade)
- **Migrar para orquestração** (mover o plano para dentro do código)
- **Manter com loop autônomo** (deixar o modelo decidir a contagem de etapas)

A primeira e a terceira faixas rodam ambas como um loop só; elas estão listadas separadamente porque **o motivo para não migrar para orquestração é diferente** — em um, o trabalho é simples demais para justificar; no outro, o trabalho é aberto demais para decompor. Julgar faixas é julgar motivos. Cada julgamento precisa de uma frase de justificativa que nomeie uma **condição específica desta lição** (mesma etapa rodando sobre muitos itens / maior do que um contexto / numerosos demais para coordenar em uma conversa / contagem de etapas imprevisível que não dá para fixar em caminho rígido / tarefas simples não precisam de complexidade / domínios que exigem contexto compartilhado e muitas dependências não são boa escolha para multiagente). Não escreva só “a tarefa é grande” ou “a tarefa é complexa”.

1. Escrever uma avaliação de migração por módulo para 40 módulos de um repositório, cada uma incluindo pontos de risco, estimativa de tamanho e manifesto de dependências.
2. Renomear `getUserProfile` para `fetchUserProfile`, 12 pontos de chamada pelo repositório.
3. Pesquisar “devemos trocar nossa fila de mensagens de A para B?”, sem lista predeterminada de fontes de informação, lendo conforme avança.
4. Marcar cada um de 200 tíquetes de suporte pendentes com um rótulo de categoria (8 categorias no total), com as regras de rotulagem escritas em um documento.
5. Refatorar um módulo de pedidos fortemente acoplado: separar 3 classes, mover 2 interfaces, com mudanças se propagando por uma cadeia de chamadores.

<!-- rubric -->

- Cada uma das cinco tarefas recebe um julgamento de faixa e as faixas estão corretas: tarefas 1 e 4 “migrar para orquestração”, tarefa 2 “um loop só basta”, tarefas 3 e 5 “manter com loop autônomo”
- Cada motivo nomeia uma condição específica desta lição, não um vago “a tarefa é grande” ou “a tarefa é complexa”; o motivo da tarefa 4 precisa aterrissar na quantidade de itens e notar que os itens individuais são, na verdade, simples
- A tarefa 5 nota ainda “não abrir em fan-out para multiagente”, com a justificativa aterrissando em “domínios que exigem contexto compartilhado e muitas dependências entre agentes não são boa escolha” e “a maior parte das tarefas de programação envolve menos tarefas genuinamente paralelizáveis do que pesquisa”

<!-- answer -->

**1. Avaliações de migração para 40 módulos — migrar para orquestração.**
Aciona dois gatilhos ao mesmo tempo: maior do que um agente consegue segurar no contexto, e a mesma etapa precisa rodar sobre muitos itens[^S5]. As etapas de avaliação de cada módulo são fixas (ler código, achar pontos de chamada, estimar tamanho, escrever relatório), só os itens variam. Depois de mover o plano para dentro do código, o `for` conta até 40, cada módulo abre um loop de harness limpo, e os resultados intermediários ficam em variáveis do script[^S5].

**2. 12 renomeações de função — um loop só basta, ou até uma chamada mais um `grep` bastam.**
Isto testa a condição inversa: ache a solução mais simples possível, acrescente complexidade só quando necessário, o que pode significar não construir sistemas agênticos de jeito nenhum[^S1]. As etapas estão completamente determinadas, são só 12 itens, cada mudança é mecânica e independente das outras. Embrulhar isso em orquestração significa pagar em latência e custo e receber zero de volta[^S1].

**3. Pesquisa de escolha de fila de mensagens — manter com loop autônomo.**
Problemas em aberto, difíceis de prever a contagem de etapas necessária, sem como fixar um caminho rígido — esta é exatamente a adequação dos agentes[^S1]. Trabalho do tipo pesquisa foi nomeado explicitamente: o processo é inerentemente dinâmico e dependente do caminho, você não sabe de antemão quais artigos ler[^S2]. Forçar isso para dentro de orquestração de etapas fixas só trava tudo no único caminho que você chutou lá no começo.

**4. Rotular 200 tíquetes — migrar para orquestração.**
Aciona “a mesma etapa precisa rodar sobre muitos itens”[^S5]. Note a diferença em relação à tarefa 1: cada item individual é **extremamente simples** — regras escritas em um documento, uma chamada de LLM mais alguns exemplos consegue julgar um tíquete; este é exatamente o caso típico de “otimizar chamadas únicas com recuperação e exemplos costuma bastar”[^S1]. O que precisa migrar para o código não é “como julgar um tíquete”, e sim “como contar até 200”: deixe o script contar, para que o tíquete 150 e o tíquete 1 recebam o mesmo contexto inicial limpo.

**5. Refatorar módulo de pedidos fortemente acoplado — manter com loop autônomo, e explicitamente não abrir em fan-out para multiagente.**
Duas camadas de justificativa. Primeira camada, contagem de etapas imprevisível: só depois de separar a primeira classe você sabe como mover a segunda interface, não dá para fixar um caminho rígido[^S1]. A segunda camada é a chave — este domínio hoje não é uma boa escolha para multiagente: todos os agentes precisam compartilhar o mesmo contexto, há muitas interdependências, e o texto nomeia diretamente que a maior parte das tarefas de programação envolve menos tarefas genuinamente paralelizáveis do que pesquisa, e que agentes LLM ainda não são muito bons em coordenar e delegar em tempo real[^S2]. O que se deve fazer é um loop só concluindo o trabalho, acrescentando verificações determinísticas em pontos-chave quando necessário, não acrescentando quantidade de agentes.

<!-- hint -->

Antes de correr para o julgamento, separe primeiro as **etapas** de cada tarefa dos seus **itens**: as etapas desta tarefa são fixas ou determinadas conforme se avança? Quantos itens precisam de repetição? “Etapas fixas + muitos itens” e “etapas não fixas” vão levar você a faixas completamente diferentes.

<!-- hint -->

A tarefa 5 é a única em que **os dois motivos precisam ser escritos** — ela pisa simultaneamente em duas condições inversas diferentes. Escrever só um deixa de fora a condição inversa em que mais se pisa na lista de conferência desta lição.

### Nível 2: Mesma tarefa, três versões de “quem detém o plano”

Não precisa de código. Ainda aquela avaliação de migração de 40 módulos, três abordagens:

- **A: Um loop grande** — Entregue a lista dos 40 módulos de uma vez a um loop de harness, e deixe ele percorrer os módulos sozinho.
- **B: Modelo como orquestrador despachando subagentes um a um** — O modelo decide a cada turno, na conversa principal, qual subagente despachar para qual módulo, e o subagente devolve resultados à conversa principal.
- **C: Plano escrito no script** — Um script percorre aqueles 40 módulos com um `for`, e cada módulo inicia um loop de harness limpo.

Complete esta tabela (os pontos de interrogação são o que você preenche). A terceira linha é a chave: quando o processo é morto / a sessão cai no módulo 25, o que cada abordagem perde?

| | A: Um loop grande | B: Modelo como orquestrador | C: Plano escrito no script |
| --- | --- | --- | --- |
| Quem detém o plano | ? | ? | ? |
| Onde aterrissam os resultados intermediários | ? | ? | ? |
| Quando quebra no módulo 25, o que se perde | ? | ? | ? |

<!-- rubric -->

- As três células de “quem detém o plano” estão corretas: em A e B o modelo detém, e a diferença entre as duas está clara (A implícito, escondido em um histórico de conversa; B é o modelo decidindo explicitamente, turno a turno, quem despachar); em C o script detém o loop, a ramificação e os resultados intermediários
- “Onde aterrissam os resultados intermediários” distingue com clareza: A e B acabam aterrissando na janela de contexto (B tem uma camada a mais — os resultados dos subagentes voltam para a conversa principal, e vários subagentes devolvendo resultados detalhados consomem contexto significativo); C fica em variáveis do script, e o contexto do modelo guarda apenas a resposta final
- “O que se perde” responde a recuperabilidade de C **condicionada à persistência incremental** (correspondendo a: o runtime rastreia o resultado de cada agente conforme a execução avança, o que torna uma execução retomável dentro da mesma sessão), e aponta que A e B perdem o progresso inteiro, enquanto C, depois da persistência, perde basicamente só o item atual

<!-- answer -->

| | A: Um loop grande | B: Modelo como orquestrador | C: Plano escrito no script |
| --- | --- | --- | --- |
| Quem detém o plano | O modelo, de forma **implícita**. O plano nunca foi escrito, está escondido no histórico da conversa, e você precisa garimpar logs para adivinhar o caminho pretendido — esta é exatamente a definição de “LLMs dirigem dinamicamente seus próprios processos e mantêm controle sobre como realizam as tarefas”[^S1] | O modelo, um pouco mais **explícito**. Ele diz a cada turno “agora despacho alguém para olhar o módulo de pedidos”, mas ainda está decidindo turno a turno[^S5] | **O script**. O próprio script detém o loop, a ramificação e os resultados intermediários, então o contexto do Claude guarda apenas a resposta final[^S5] |
| Onde aterrissam os resultados intermediários | Tudo no mesmo array `messages`: saída de grep dos 40 módulos, arquivos lidos, rastros de caminhos errados e volta atrás, dividindo uma linha do tempo | De volta à conversa principal. Quando os subagentes terminam, os resultados deles voltam para a sua conversa principal; rodar muitos subagentes que devolvem, cada um, resultados detalhados pode consumir contexto significativo[^S4] | Fica em variáveis do script, não aterrissa no contexto do modelo[^S5] |
| Quando quebra no módulo 25, o que se perde | Quase tudo. O progresso é o próprio histórico da conversa; quando a sessão se vai, o progresso se vai; mesmo que os 24 primeiros tenham caído em disco, você não tem um ponto de entrada limpo para “continuar do módulo 25” | A mesma perda de todo o estado de orquestração da conversa principal. Pior ainda, depois do reinício o modelo tem que repensar o plano — o plano anterior dele nunca foi escrito em lugar nenhum | **Condicionado a você persistir cada resultado conforme avança** (escrever variáveis do script em arquivos é uma linha de código): perde-se só o módulo 25 em si, e o ponto de entrada para continuar do módulo 26 está pronto; se ficar só em memória, o processo morre e você perde tanto quanto em A. Correspondendo a: o runtime de fluxos de trabalho rastreia o resultado de cada agente conforme a execução avança, o que torna uma execução retomável **dentro da mesma sessão**[^S5] — recuperação entre processos ainda exige que você persista por conta própria |

**Processo de raciocínio:**

As três linhas são, na verdade, três facetas da mesma coisa. **Quem detém o plano, é no contêiner desse detentor que os resultados intermediários vão aterrissar, e quando o processo quebra você perde o que está nesse contêiner.**

Em A e em B, o plano está nas mãos do modelo, então o contêiner é a janela de contexto, e a janela de contexto é uma coisa em nível de sessão que zera quando a sessão termina — então o “progresso” e o “contexto” de A e B são a mesma coisa: perca um e você perde o outro. B parece mais forte do que A porque a avaliação de cada módulo é feita de forma limpa na janela própria do subagente; mas os resumos ainda se empilham na conversa principal um a um, e no vigésimo quinto resumo a conversa principal está igualmente espremida. Isso só adiou o problema de A, não trocou o contêiner.

C trocou o contêiner: os resultados intermediários estão em variáveis do script, e variáveis de script podem ser escritas em arquivos ou bancos com uma linha. Esta é a ideia de que **rastreamento incremental traz recuperabilidade** — a versão do runtime é rastrear o resultado de cada agente conforme a execução avança, retomável dentro da mesma sessão[^S5]; a versão em script é você mesmo escrevendo cada resultado em um arquivo. É também aqui que o pensamento de “fazendo tarefas longas sobreviverem à interrupção” do curso 9 desta série aterrissa na camada de orquestração — o progresso precisa existir em um lugar que **viva mais do que o contexto do modelo**. Benefício de bônus: o módulo 25 e o módulo 1 de C recebem exatamente o mesmo contexto inicial, então rerodar o módulo 25 é uma nova tentativa de verdade, não um “tentar de novo numa cena suja pelos 24 anteriores”.

<!-- hint -->

Preencha primeiro a linha do meio. Pense com clareza sobre onde os resultados intermediários de cada abordagem **existem fisicamente, em qual contêiner** (um array `messages`? A janela de contexto da conversa principal? Uma variável JavaScript?), e a resposta da terceira linha vai emergir sozinha — o que se perde quando quebra é o que está naquele contêiner.

<!-- hint -->

B é facilmente julgada como “mais ou menos igual a C” porque ela também isola o trabalho sujo de cada módulo no contexto independente do subagente. Pense: depois que o subagente termina, para onde **vai** aquele resultado? No módulo 25, quantos resumos estão sentados na conversa principal?

<!-- /exercises -->

## Recapitulação

- Aquele `while` que você escreveu no curso 7 desta série é um agente — agentes conseguem lidar com tarefas sofisticadas, mas a implementação deles costuma ser direta; tipicamente são apenas LLMs usando ferramentas com base em feedback do ambiente, dentro de um loop[^S1].
- Essas variações são chamadas coletivamente de sistemas agênticos, e dentro delas se traça uma distinção arquitetural: fluxos de trabalho são sistemas em que LLMs e ferramentas são orquestrados por caminhos de código predefinidos; agentes são sistemas em que os LLMs dirigem dinamicamente seus próprios processos e o uso de ferramentas, mantendo controle sobre como realizam as tarefas[^S1].
- O eixo que distingue os dois é “quem detém o plano”: um fluxo de trabalho move o plano para dentro do código, o próprio script detém o loop, a ramificação e os resultados intermediários, então o contexto do Claude guarda apenas a resposta final[^S5]. Este curso chama esse eixo de “espectro de determinismo” e chama a visualização de composição da lição 5 de “grafos” — os dois termos são metáforas do próprio curso e não aparecem nos materiais primários.
- Gatilhos para subir de nível: a tarefa precisa de mais agentes do que uma conversa consegue coordenar, ou você quer a orquestração codificada como um script que dá para ler e rodar de novo[^S5]; quando a tarefa é maior do que um agente consegue segurar no contexto, ou quando a mesma etapa precisa rodar sobre muitos itens[^S5]; quando uma tarefa lateral inundaria a sua conversa principal com conteúdo que você não vai consultar de novo[^S4].
- Condições para ficar onde está: ache a solução mais simples possível, acrescente complexidade só quando necessário, o que pode significar não construir sistemas agênticos de jeito nenhum[^S1]; para muitas aplicações, otimizar chamadas únicas de LLM com recuperação e exemplos no contexto costuma bastar[^S1]; domínios que exigem contexto compartilhado ou muitas dependências entre agentes hoje não são boa escolha para multiagente, e a maior parte das tarefas de programação envolve menos tarefas genuinamente paralelizáveis do que pesquisa[^S2].
- Manter com loops autônomos: problemas em aberto, difíceis de prever a contagem de etapas, sem como fixar um caminho rígido[^S1] — trabalho do tipo pesquisa é o caso típico, o processo é inerentemente dinâmico e dependente do caminho[^S2].
- Pegue a conta primeiro: sistemas agênticos com frequência trocam latência e custo por melhor desempenho na tarefa[^S1]; nos dados deles, agentes usam cerca de 4× mais tokens do que chat, multiagente cerca de 15×, e a viabilidade econômica exige que o valor da tarefa sustente essa melhora[^S2].
- Tudo o que este curso ensina tem que passar pelo mesmo portão: acrescentar complexidade só quando ela comprovadamente melhora os resultados[^S1]; comece com prompts simples, otimize-os com avaliação abrangente, e acrescente sistemas agênticos de várias etapas só quando as soluções mais simples ficarem aquém[^S1].

[>> Lição 2: Encadeie, roteie: encadeamento e roteamento](./02-chaining-and-routing.md)
