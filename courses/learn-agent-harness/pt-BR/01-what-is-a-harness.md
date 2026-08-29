# Lição 1: O que é um harness: o código de controle ao redor do modelo

> Objetivos de aprendizado:
> - Traçar a linha entre o harness e o modelo, e dizer de que lado cai "propor uma ação" e de que lado cai "executar e controlar"
> - Usar a diferença entre agentes e workflows para explicar o que faz um sistema merecer o nome de "agente"
> - Decidir se um problema do tipo "nosso agente não é confiável o bastante" deve ser resolvido na camada do modelo ou na camada do harness
>
> Pré-requisitos: Você concluiu os seis primeiros cursos desta série e entende uma única ida e volta de chamada de ferramenta (`stop_reason: "tool_use"` / `tool_result`) | Próxima: [Lição 2 >>](./02-the-core-loop.md)

## Você já viu um harness naquela única ida e volta

Em "Tool calling de agentes: fazendo agentes agirem de verdade" você desmontou uma ida e volta completa de chamada de ferramenta: o modelo vê a sua pergunta mais um manifesto de ferramentas, e volta com `stop_reason: "tool_use"` e um bloco `tool_use` que diz "chame esta ferramenta, com estes parâmetros". A documentação é direta sobre o que acontece em seguida: "The model never executes anything on its own. It emits a structured request, your code (or Anthropic's servers) runs the operation, and the result flows back into the conversation."[^S2] (O modelo nunca executa nada por conta própria. Ele emite uma requisição estruturada, o seu código — ou os servidores da Anthropic — executa a operação, e o resultado volta para a conversa.) Abrir o arquivo, rodar o comando, fazer a chamada de rede — tudo isso é o código do host executando o agente. Quando o host termina, ele embrulha a saída em um `tool_result`, anexa à conversa e dispara outra requisição.

Esse pedaço de código do host — a parte que roda ferramentas e depois decide o que fazer em seguida — é o assunto desta lição. Ele tem um nome: o **harness**, a camada de código de controle envolta ao redor do modelo.

Aquele curso anterior, porém, parou depois de uma única ida e volta. Agentes de verdade raramente vão e voltam só uma vez. Uma chamada de ferramenta retorna, o modelo olha o resultado e, quase sempre, quer chamar outra ferramenta, e outra, girando repetidamente. Quem roda esse girar-e-girar? Quem decide quando é hora de parar? Quem o puxa de volta quando ele se desvia? Tudo isso é trabalho do harness. Esta lição traça a linha entre harness e modelo; as lições seguintes desmontam o harness peça por peça.

## O que é um agente: um LLM usando ferramentas em um loop

A equipe de engenharia da Anthropic tem uma definição simples de agentes: "They are typically just LLMs using tools based on environmental feedback in a loop."[^S1] (Eles são tipicamente apenas LLMs usando ferramentas com base em feedback do ambiente, em um loop.) Três palavras dessa frase carregam o peso — **ferramentas**, **feedback do ambiente** e **loop**. O modelo chama uma ferramenta (ferramentas), o host a executa e devolve o resultado (feedback do ambiente), o modelo lê o resultado e decide o que fazer em seguida, possivelmente chamando outra ferramenta, e assim vai (loop). A ida e volta que você aprendeu antes foi o primeiro giro exatamente desse loop.

Esse mesmo artigo separa dois tipos de sistema que as pessoas vivem confundindo. O primeiro é o **workflow**: "Workflows are systems where LLMs and tools are orchestrated through predefined code paths."[^S1] (Workflows são sistemas em que LLMs e ferramentas são orquestrados por caminhos de código predefinidos.) Faça isto, depois aquilo, e neste galho vá para a esquerda — uma pessoa resolveu tudo de antemão. O segundo é o **agente**: "Agents, on the other hand, are systems where LLMs dynamically direct their own processes and tool usage"[^S1] (Agentes, por outro lado, são sistemas em que os LLMs dirigem dinamicamente seus próprios processos e o uso de ferramentas).

Ponha as duas definições lado a lado e a diferença não está em quão forte é o modelo. Está em **quem toma as decisões de controle de fluxo**. Em um workflow, o próximo passo é fixado no código. Em um agente, o próximo passo é o que o modelo decidir no momento, dentro do loop. É isso que merece o nome, na formulação do roadmap: "An agent makes its own control-flow decisions inside a loop."[^S5] (Um agente toma suas próprias decisões de controle de fluxo dentro de um loop.) E o que carrega esse loop, o que transforma as decisões do modelo em efeitos reais, é o harness.

Um detalhe de formulação merece cuidado aqui. Dizer que "o modelo decide o próximo passo" significa que o modelo propõe uma ação a cada turno. Se o loop chega a girar, se o modelo volta a ser consultado — isso ainda cabe ao código do harness. O modelo propõe, o harness decide. Essa linha é o alicerce de tudo o que vem depois.

## Mesmo modelo, harness diferente, resultado radicalmente diferente

Agora, a frase que esta lição mais quer que você guarde. Um roadmap comunitário a coloca de forma seca: **"Same model, different harness, completely different result."**[^S5] (Mesmo modelo, harness diferente, resultado completamente diferente.)

À primeira vista soa invertido. Estamos acostumados a debitar a confiabilidade de um agente na conta do modelo — este é forte, aquele é fraco. Mas pense no que o modelo de fato fez naquela ida e volta: ele olhou a conversa atual e propôs a próxima ação. Se essa ação realmente roda, se o loop continua depois, se dá para chamar um basta após vinte turnos improdutivos, se convém consultar uma pessoa antes quando a ação proposta apagaria uma tabela de banco de dados — nenhuma dessas é decisão do modelo. Cada uma delas pertence ao harness.

Aqui vai uma comparação concreta. Mesmo modelo, mesmo conjunto de ferramentas, mesma tarefa: limpar as dependências não usadas de um projeto.

- **Harness A** executa toda ação que o modelo propõe, incondicionalmente. Sem limite de turnos, sem verificar se o agente está girando em falso. O modelo erra o julgamento em algum turno e propõe uma remoção equivocada; o harness remove. O modelo então raciocina para frente a partir de um estado que já quebrou, e um passo errado vira dez. O problema de sistemas assim vem direto da autonomia do agente: "The autonomous nature of agents means higher costs, and the potential for compounding errors."[^S1] (A natureza autônoma dos agentes significa custos maiores e o potencial de erros que se acumulam.)
- **Harness B** roda o mesmo modelo e aceita as mesmas propostas, mas essa camada de controle limita o número de turnos, vigia vários turnos seguidos sem progresso real, e para para consultar uma pessoa antes de executar uma ação de alto impacto como uma remoção. A mesma proposta ruim aqui bate em uma válvula de aprovação em vez de bater no disco.

Modelo idêntico. Possivelmente propostas idênticas nas duas vezes. Uma execução destrói o projeto, a outra permanece nos trilhos. Toda a diferença vem do código de controle do lado de fora. Então, quando o seu agente for pouco confiável, não corra primeiro atrás de um modelo mais forte — boa parte das vezes o problema mora na camada do harness, não na camada do modelo.

```agentmentor-check
{
  "id": "harness-zh-01-swap-model-vs-harness",
  "label": "Localizar de que camada vem a falta de confiabilidade de um agente",
  "prompt": "Seu agente, ao limpar dependências não usadas, ocasionalmente remove um pacote que ainda está em uso, e o projeto deixa de compilar. Alguém propõe trocar o modelo de base por uma versão mais forte, o que deveria resolver a coisa. Esse julgamento é sólido?",
  "whyHere": "Acabamos de estabelecer que o mesmo modelo em um harness diferente produz um resultado completamente diferente, e “é só usar um modelo mais forte” é exatamente o instinto que o leitor tem neste momento. O modelo mental de qual camada realmente traz a confiabilidade precisa ser corrigido bem aqui.",
  "mode": "single",
  "choices": [
    {
      "id": "a",
      "text": "É sólido. Um modelo mais forte propõe ações mais precisas, então as remoções ruins devem em grande parte cessar.",
      "correct": false,
      "feedback": "Não exatamente. Um modelo mais forte pode reduzir a chance de um erro de julgamento, mas não consegue zerá-la. Enquanto o modelo ainda puder propor uma remoção errada, e o harness ainda executar incondicionalmente sem pausar para confirmar, aquela ação ainda cai no disco. Apostar a confiabilidade inteira no modelo nunca errar debita o trabalho do harness na conta do modelo."
    },
    {
      "id": "b",
      "text": "Não faz diferença. O comportamento de um agente é essencialmente aleatório, então não há como controlá-lo de um jeito ou de outro.",
      "correct": false,
      "feedback": "Não exatamente. Isso leva a conclusão longe demais. O comportamento de um agente é justamente o que pode ser controlado, e esse é o ponto inteiro de um harness: limites de turnos, detecção de falta de progresso e aprovação humana antes de ações perigosas mudam o resultado de formas mensuráveis. Chamá-lo de incontrolável joga fora tudo o que esta lição está ensinando."
    },
    {
      "id": "c",
      "text": "Não é sólido. Barrar uma remoção ruim depende de o harness dar passagem controlada a ações de alto impacto, não da força do modelo.",
      "correct": true,
      "feedback": "Correto. O modelo só propõe ações. Se uma remoção realmente roda, e se uma pessoa a confirma antes, é decidido pela lógica de controle no harness. O mesmo modelo não consegue remover nada dentro de um harness com válvula de aprovação, e destrói um projeto dentro de um que executa às cegas. A confiabilidade vem em grande parte do código de controle fora do modelo; o modelo é uma peça disso. Adicionar aprovação e detecção de progresso ao loop resolve mais do que uma troca de modelo."
    }
  ]
}
```

## Um harness não é uma coisa só, é um conjunto de peças

A esta altura você talvez imagine o harness como "aquele loop" — não é bem isso. O loop é a sua peça central, mas um harness é um conjunto de componentes trabalhando juntos. O roadmap o descreve como uma união: "the harness is the union of:"[^S5] (o harness é a união de:) controle de loop, despacho de ferramentas, gerenciamento de contexto, e mais. Conheça-lhes as caras agora; as lições seguintes desmontam uma de cada vez:

- **Controle de loop**, descrito no roadmap como "loop control. The while-loop driving model→tools→model."[^S5] (controle de loop. O while-loop que dirige modelo→ferramentas→modelo.) Ele lê o `stop_reason` que o modelo devolve e decide se este turno é seguido por outro ou por uma parada. Esse é o coração do harness, e a Lição 2 é dedicada a ele.
- **Despacho de ferramentas**: uma vez que o modelo propõe "chame esta ferramenta com estes parâmetros", o código que roteia a requisição para a função de verdade, a executa e empacota a saída de volta em um `tool_result`. Você conheceu a versão de passo único disso antes; o que um harness faz é ligá-la ao loop e usá-la repetidamente.
- **Gerenciamento de contexto**: cada turno do loop empilha mais dados na conversa, porque "An agent running in a loop generates more and more data that could be relevant for the next turn of inference"[^S3] (Um agente rodando em loop gera cada vez mais dados que podem ser relevantes para o próximo turno de inferência). E a atenção do modelo não é grátis: "LLMs have an "attention budget" that they draw on when parsing large volumes of context"[^S3] (LLMs têm um "orçamento de atenção" do qual sacam ao processar grandes volumes de contexto), e "Every new token introduced depletes this budget by some amount"[^S3] (Cada novo token introduzido esgota esse orçamento em alguma medida). Então o harness tem que decidir para onde vai esse histórico e quanto dele permanece, em vez de deixá-lo inchar.

Mais duas peças recebem tratamento completo depois neste curso. Elas são nomeadas aqui para que você saiba que também pertencem ao harness:

- **Condições de parada**: além de seguir o `stop_reason`, "it's also common to include stopping conditions (such as a maximum number of iterations) to maintain control."[^S1] (também é comum incluir condições de parada — como um número máximo de iterações — para manter o controle.) Quando dar o assunto por encerrado é o tema da Lição 3.
- **Freios de emergência para descontrole e intervenção humana**: o loop pode rodar por um bom trecho, e "The LLM will potentially operate for many turns, and you must have some level of trust in its decision-making."[^S1] (O LLM vai potencialmente operar por muitos turnos, e você precisa ter algum nível de confiança na tomada de decisão dele.) Confiança não é o mesmo que rédea solta, porém — "Agents can then pause for human feedback at checkpoints or when encountering blockers."[^S1] (Agentes podem então pausar para feedback humano em checkpoints ou ao encontrar bloqueios.) Como pegar loops mortos, giro em falso e orçamentos estourados (Lição 4), e como uma pessoa interrompe e redireciona no meio da execução (Lição 5), ambos vivem nesta camada.

Você não precisa memorizar os detalhes de cada peça agora. Basta guardar o formato geral: **um harness é o nome coletivo do código de controle ao redor do modelo, montado a partir de várias peças que juntas determinam com que firmeza este agente roda.** Isso também explica por que trocar de harness muda tanto o resultado — o que você trocou não é uma linha de código, é uma estratégia inteira de controle do loop.

## Quando você realmente precisa desta camada de controle

Vendo o quanto um harness pode gerenciar, é fácil deslizar para o extremo oposto: será que todo uso de um modelo precisa de um arranjo completo com controle de loop, válvulas de aprovação e detecção de giro em falso? Não.

Volte à linha entre agente e workflow. Se a sua tarefa segue um caminho fixo — um chamado chega, é classificado, é roteado por categoria — e todo galho pode ser resolvido de antemão, isso é um workflow, e orquestrá-lo "through predefined code paths"[^S1] (por caminhos de código predefinidos) já basta. Não há motivo para deixar um modelo tomar decisões de controle de fluxo dentro de um loop. Amarrar um loop autônomo nisso só acrescenta chances de sair do rumo.

O que genuinamente precisa de um harness completo são tarefas em que **o número de passos e o caminho não podem ser declarados de antemão**: quantos arquivos precisam mudar, qual ler primeiro, se o resultado de um passo o manda de volta a refazer um anterior. Só o modelo, olhando o estado atual, consegue resolver isso. É aí que você quer um harness que o deixe decidir por conta própria dentro de um loop, mantendo-o firmemente sob controle. Vale guardar um princípio geral de contenção: "you should consider adding complexity only when it demonstrably improves outcomes."[^S1] (você deveria considerar adicionar complexidade só quando ela comprovadamente melhora os resultados.) Cada peça de lógica de controle no seu harness deveria estar ali porque você bateu num problema real de perda de controle, não porque todo mundo constrói dessa forma.

O restante deste curso foca na parte que mais importa naquele segundo tipo de tarefa, e que quebra com mais frequência — o próprio loop. Como o harness decide se um agente é confiável, e o controle de loop é o coração do harness, a próxima lição começa por como esse loop cresce de uma única ida e volta para algo que segue rodando.

<!-- exercises -->
## 💻 Exercícios

### Nível 1: Separe quem é dono de cada passo

Abaixo está um cenário em que um agente corrige automaticamente testes unitários que falham. Cinco coisas acontecem ao longo do caminho. Para cada uma, decida se é o **modelo** fazendo ou o **harness** (o código de controle ao redor do modelo), e dê uma razão curta.

1. O modelo lê a falha do teste, responde com uma mensagem dizendo que quer chamar `read_file` no arquivo que falhou, e `stop_reason` é `"tool_use"`.
2. O programa de fato vai ao disco e lê aquele arquivo.
3. O programa embrulha o conteúdo do arquivo em um `tool_result`, anexa à conversa e envia outra requisição.
4. O loop passou por vinte turnos sem uma correção, e o programa decide não continuar, parando e reportando "limite de turnos atingido".
5. Em algum turno o modelo propõe chamar `delete_file` no diretório de testes inteiro. O programa bloqueia e exibe "esta operação apaga arquivos, confirmar?" para esperar uma pessoa dizer sim.

<!-- rubric -->
- Todos os cinco itens são rotulados explicitamente como "modelo" ou "harness"
- Cada julgamento vem com uma razão, não apenas um rótulo
- O raciocínio identifica de que lado da linha "propor uma ação" versus "executar e controlar" cada item cai

<!-- answer -->
1. Modelo. Ele está olhando a conversa atual e propondo a próxima ação, empacotando "chamar read_file" em uma requisição estruturada — uma proposta, não uma execução.
2. Harness. O código do host é quem de fato abre o sistema de arquivos e lê o arquivo. O modelo não tem sistema de arquivos e não consegue fazer isso.
3. Harness. Embrulhar o resultado em um `tool_result`, anexá-lo à conversa e enviar outra requisição é tudo orquestração feita pelo código de controle de loop.
4. Harness. "Parar depois de vinte turnos" é uma condição de parada explícita (um limite de turnos), que é lógica de controle do harness e não tem nada a ver com o que o modelo propôs.
5. Propor a remoção do diretório é o modelo (ainda apenas propondo uma ação); bloqueá-la para esperar confirmação é o harness. É exatamente o que uma válvula de aprovação é: o modelo ainda pode propor uma ação de alto impacto, mas o harness a barra antes que ela execute.

<!-- hint -->
Fique perguntando onde cai a linha: essa coisa é "decidir o que fazer em seguida" (o modelo propondo), ou "de fato realizar uma ação, ou decidir se o loop continua" (o harness controlando)?

<!-- hint -->
Note que o item 5 pisa nos dois lados: o modelo propõe, o harness decide se ela realmente roda. Um único evento pode ter uma parte do modelo e uma parte do harness, então não se apresse em preencher só uma.

### Nível 2: Decida em qual camada corrigir

Sua equipe tem um agente cujo trabalho é fazer os inserts, updates e deletes correspondentes em um banco de dados a partir de uma descrição em linguagem natural do usuário. Dois problemas apareceram depois do lançamento. Para cada um, decida se deve ser corrigido principalmente na **camada do modelo** (trocar o modelo, mudar o prompt) ou na **camada do harness** (mudar o código de controle do lado de fora), e explique por quê.

- Problema A: O agente ocasionalmente transforma um vago "limpe aqueles registros antigos" em um comando que apaga milhares de linhas, e o roda de imediato, o que causou um incidente real de perda de dados.
- Problema B: O SQL que o agente gera muitas vezes tem erros de sintaxe e nomes de coluna escritos errados, então muitas chamadas falham de cara.

<!-- rubric -->
- Ambos os problemas recebem um veredito explícito de "principalmente camada do modelo" ou "principalmente camada do harness"
- O raciocínio gira em torno de o problema ser fundamentalmente sobre qualidade da proposta ou sobre falta de controle
- Para o Problema A, a resposta aponta que mesmo um modelo mais preciso deixa o risco de perda de dados de pé sem uma etapa de interceptação antes da execução

<!-- answer -->
- Problema A: principalmente a camada do harness. A questão central não é se o modelo deveria ter proposto um delete; é que uma ação de alto impacto e irreversível foi executada de imediato e incondicionalmente. O que falta é uma válvula de aprovação humana antes da execução. Mesmo um modelo mais forte que corte a taxa de erro de julgamento deixa o risco intacto — sem essa interceptação, uma instrução vaga ainda pode disparar uma perda de dados real. Adicionar uma etapa de confirmação antes de operações da classe delete é a correção de verdade. (Isso ecoa a ideia de aprovação com humano no loop para operações de alto impacto, que a Lição 5 desenvolve.)
- Problema B: principalmente a camada do modelo. Erros de sintaxe e nomes de coluna escritos errados são problemas de qualidade no passo de proposta do modelo, e melhoram com um modelo mais bom de SQL, ou com estrutura de tabela e nomes de coluna precisos fornecidos no prompt ou nas descrições das ferramentas. Há um limite para o que o harness pode fazer aqui (no máximo marcar o `tool_result` que falhou com `is_error` para que o modelo tente de novo) — a causa raiz é a qualidade da proposta.

<!-- hint -->
Classifique cada problema primeiro: é "o modelo propôs mal" ou "a proposta não estava especialmente errada, mas nada controlou a execução"? O primeiro aponta para a camada do modelo, o segundo para a camada do harness.

<!-- hint -->
Para o Problema A, rode um contrafactual: se o modelo tivesse proposto perfeitamente desta vez, o problema definitivamente nunca voltaria a ocorrer? Se o risco sobrevive até a uma proposta correta, o ponto fraco está na camada de controle, não na camada de proposta.

<!-- /exercises -->

## Recapitulação

- **Um harness é o nome coletivo do código de controle ao redor do modelo** — rodando ferramentas, dirigindo o loop, decidindo quando parar e quando esperar uma pessoa. O modelo só propõe a próxima ação; o harness decide se essa ação executa e se o loop continua.[^S2]
- **Um agente é um LLM usando ferramentas em um loop com base em feedback do ambiente.**[^S1] O que o separa de um workflow não é a força do modelo, mas quem toma as decisões de controle de fluxo: um workflow segue caminhos de código predefinidos, enquanto o próximo passo de um agente é fixado pelo modelo dentro do loop,[^S1] e o que carrega esse loop é o harness — um agente toma suas próprias decisões de controle de fluxo dentro de um loop.[^S5]
- **Mesmo modelo, harness diferente, resultado completamente diferente.**[^S5] Então, quando um agente é pouco confiável, cheque a camada do harness primeiro: limites de turnos, detecção de falta de progresso e aprovação para ações de alto impacto costumam resolver mais do que um modelo mais forte.
- **Um harness é um conjunto de peças, não um objeto único**: controle de loop, despacho de ferramentas e gerenciamento de contexto têm cada um o seu trabalho.[^S5] O contexto em particular precisa ser gerenciado, porque cada turno do loop empilha mais dados na conversa e saca de um orçamento de atenção finito.[^S3]
- **Nem toda situação precisa de um harness completo.** Tarefas com caminho fixo ficam bem como workflows;[^S1] recorra a um harness só quando os passos e o caminho não puderem ser declarados de antemão e o modelo genuinamente tiver que decidir por conta própria, e adicione complexidade só quando ela comprovadamente melhora os resultados.[^S1]

[>> Lição 2: O loop central: de uma ida e volta à operação contínua](./02-the-core-loop.md)
