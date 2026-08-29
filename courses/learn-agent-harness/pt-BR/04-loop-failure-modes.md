# Lição 4: Descontrole e fallback: loops mortos, giro em falso, esgotamento de orçamento

> Objetivos de aprendizado:
> - Reconhecer as quatro formas típicas de um loop descontrolado — erros que se acumulam, inchaço e apodrecimento do contexto, loops mortos e giro em falso, esgotamento de orçamento — e dizer qual propriedade do loop causa cada uma
> - Encaixar a comporta de fallback correspondente em cada uma: checkpoints mais parada antecipada, governança de contexto, um teto máximo de turnos mais detecção de não-progresso, um teto de orçamento — e explicar o que cada comporta de fato pega
> - Decidir qual comporta rígida um loop que está "girando em falso" precisa, em vez de tentar resgatar um loop sem fronteiras trocando de modelo ou reescrevendo o prompt
>
> Pré-requisitos: Você leu as Lições 2 e 3, e tem um esqueleto de loop dirigido por `stop_reason` com um teto máximo de turnos | Anterior: [Lição 3 <<](./03-stop-conditions.md) | Próxima: [Lição 5 >>](./05-intervention-and-steering.md)

## Um loop que roda também pode se descontrolar

As últimas duas lições colocaram o seu loop de pé: `stop_reason` como condição do while, e depois as condições de parada explícitas da Lição 3 para você segurá-lo quando o modelo se recusar a encerrar. Por ora isso soa como um loop razoavelmente estável. Mas "eu consigo segurá-lo" é só o fusível final, e ele pega exatamente uma doença: um loop que não para. Loops dão errado de mais maneiras que essa, e na maior parte do tempo nada dramático acontece — o processo não trava, a CPU não fica no talo. O loop apenas, silenciosamente, turno após turno, faz o trabalho errado.

Esta lição quebra a expressão vaga "loop descontrolado" em quatro formas que você consegue nomear de bate-pronto: **erros que se acumulam, inchaço e apodrecimento do contexto, loops mortos e giro em falso, esgotamento de orçamento**. Todas remontam à mesma raiz — um agente é um sistema que decide seu próprio próximo passo, e essa autonomia é ao mesmo tempo por que ele é útil e por que ele descarrilha. A Anthropic diz sem rodeios: "The autonomous nature of agents means higher costs, and the potential for compounding errors."[^S1] (A natureza autônoma dos agentes significa custos mais altos e o potencial de erros que se acumulam.) E "The LLM will potentially operate for many turns, and you must have some level of trust in its decision-making."[^S1] (O LLM potencialmente vai operar por muitos turnos, e você precisa ter algum nível de confiança na tomada de decisão dele.) Confiança não é o mesmo que carta branca. Esta lição é sobre o que você deve ao loop além da confiança: uma comporta de fallback para cada jeito de ele se descontrolar.

Uma coisa a acertar logo de cara, para você não ler o resto errado: esses quatro não são acidentes de baixa probabilidade. São tendências embutidas no loop enquanto estrutura. Deixe um loop em paz e ele desliza nessas direções por padrão. Então os fallbacks não são remendos que você aplica depois de um incidente — são corrimãos que você solda desde o começo. Um de cada vez.

## Descontrole 1: erros que se acumulam — um passo errado envenena todo passo seguinte

Comece pelo mais traiçoeiro, porque ele nunca lança um erro. Volte ao bot de plantão da Lição 2: reiniciar o serviço, ler os logs, reportar. Esses três passos estão encadeados — o passo dois depende do resultado do passo um, o passo três depende do passo dois. Agora suponha que o passo um dê errado em silêncio: o modelo lê o nome do serviço como `api-staging` e reinicia o ambiente de pré-produção no lugar. A ferramenta diz "reinício bem-sucedido" e o modelo aceita isso pelo valor de face. Ele então lê os logs, não vê erros novos e reporta contente "reinício completo, logs limpos". Toda chamada de ferramenta teve sucesso. Nenhuma exceção foi levantada. E ainda assim, do passo dois em diante, a coisa toda foi construída sobre uma base errada, derivando cada vez mais a cada passo.

Isso é **erros que se acumulam**: um agente rodando de forma autônoma significa que os enganos se acumulam e se amplificam ao redor do loop[^S1]. Não é o mesmo animal do caso "código com bug causa um loop infinito" da Lição 2 — aquilo é uma falha mecânica que você identifica de relance. Erros que se acumulam acontecem na camada de decisão, onde cada passo individual parece perfeitamente razoável e o engano cresce a juros compostos ao longo da cadeia. Quanto mais turnos o loop roda e mais longa a cadeia fica, mais difícil é prever até onde um empurrãozinho inicial terá carregado as coisas no fim.

O fallback tem duas peças trabalhando juntas. Primeiro, **checkpoints**: pause nos elos da cadeia onde "se isto estiver errado, tudo depois disso é desperdício", e faça o loop expor seu estado intermediário para verificação. A Anthropic descreve esse tipo de pausa diretamente — "Agents can then pause for human feedback at checkpoints or when encountering blockers."[^S1] (Os agentes podem então pausar para feedback humano em checkpoints ou ao encontrar bloqueios.) A Lição 5 cobre como projetar esse ponto de pausa. Segundo, **parada antecipada**: em vez de deixar um loop que já está derivando queimar todo o seu orçamento, pare-o no momento em que algo parecer fora do lugar. É exatamente para isso que servem as condições de parada explícitas da Lição 3, e ecoa o conselho geral de que "it's also common to include stopping conditions (such as a maximum number of iterations) to maintain control."[^S1] (também é comum incluir condições de parada — como um número máximo de iterações — para manter o controle.) A ideia central: já que os erros se acumulam com a contagem de turnos, não deixe o loop rodar uma cadeia longa sem verificação.

## Descontrole 2: inchaço e apodrecimento do contexto — o histórico fica mais pesado a cada turno

A Lição 2 plantou uma dívida: a cada volta do loop, aquela linha `messages.push` enfia mais duas mensagens no histórico, só somando, nunca subtraindo. Naquele momento dissemos "acertamos as contas depois". Este é o depois.

Pegue primeiro o "inchaço". "An agent running in a loop generates more and more data that could be relevant for the next turn of inference,"[^S3] (um agente rodando em loop gera cada vez mais dados que poderiam ser relevantes para o próximo turno de inferência,) e a cada turno esses dados são carregados para a próxima requisição sem alteração. Para uma tarefa que roda três ou cinco turnos, tanto faz. Mas quando um loop precisa de dezenas de turnos, o histórico vira uma bola de neve — cada requisição arrasta um contexto cada vez mais longo, então as requisições ficam mais lentas e mais caras. Esse é o custo imediato e visível.

O "apodrecimento" é a metade mais desagradável, porque prejudica a qualidade e não só a conta. "LLMs have an 'attention budget' that they draw on when parsing large volumes of context," (LLMs têm um "orçamento de atenção" do qual eles sacam ao processar grandes volumes de contexto,) e "Every new token introduced depletes this budget by some amount."[^S3] (Cada novo token introduzido esgota esse orçamento em alguma medida.) A consequência é que "as the number of tokens in the context window increases, the model's ability to accurately recall information from that context decreases."[^S3] (conforme o número de tokens na janela de contexto aumenta, a capacidade do modelo de recuperar com precisão informações desse contexto diminui.) É isso que as pessoas costumam querer dizer com apodrecimento de contexto — nada foi apagado do histórico, mas os fatos-chave estão se afogando no ruído, então o modelo consegue vê-los sem conseguir agarrá-los. Quanto mais tempo o loop roda, mais frouxo fica seu domínio sobre aquela instrução ou restrição crítica do turno dois, e mais fácil é o comportamento derivar.

Há uma questão de escala que você precisa acertar aqui, senão vai se defender da coisa errada: essa degradação é uma curva de desempenho que desce suavemente com o comprimento, não um penhasco de onde você cai depois de um certo limiar — "These factors create a performance gradient rather than a hard cliff."[^S3] (Esses fatores criam um gradiente de desempenho, não um penhasco abrupto.) Não leia como "quando o contexto fica grande demais, tudo está arruinado". É mais como a água subindo e o casco assentando: você ainda consegue navegar em qualquer nível de água, só fica mais difícil. Aceitar isso é o que leva você à postura certa — "context, therefore, must be treated as a finite resource with diminishing marginal returns,"[^S3] (o contexto, portanto, precisa ser tratado como um recurso finito com retornos marginais decrescentes,) e cada pedaço de histórico que você acrescenta tem de responder "isto ainda vale a pena?".

O fallback é **governança de contexto**: gerencie ativamente o histórico que o loop produz em vez de empurrar cegamente para ele. As técnicas específicas — compactar turnos antigos, resumir resultados iniciais, descartar artefatos intermediários que já não importam — são o tema inteiro do Curso 5 desta série, "Memória e Estado de Agente", então não vamos reabri-las aqui. O que você precisa levar do ponto de vista do loop é isto: governar o contexto é como você freia o custo por turno do loop, para que um loop que roda por muito tempo não fique progressivamente mais burro conforme avança.

## Descontrole 3: loops mortos e giro em falso — sem sair do lugar, sem nunca parar

Nos dois primeiros modos de falha o loop ao menos avança, só que torto ou lento. Este é mais direto: o loop não avança de jeito nenhum, e também não para. Ele tem duas caras.

Uma é o **loop morto**, que você já conheceu no exercício de Nível 2 da Lição 2 — o fim do corpo do loop esqueceu de reatribuir `response`, então `stop_reason` fica congelado no valor antigo, a condição do while é permanentemente verdadeira, o processo trava, e a mesma ferramenta é chamada de novo e de novo. Isto é uma falha mecânica pura no código: o código host está errado, as decisões do modelo não têm nada a ver com isso, e adicionar a linha de nova requisição que faltava resolve.

A outra cara é mais traiçoeira e se chama **giro em falso** (também conhecido como livelock): o código está inteiramente correto, cada turno legitimamente envia uma requisição, roda uma ferramenta e lê um `stop_reason` novo — e ainda assim nada de novo jamais é realizado. A forma clássica: o modelo chama a mesma ferramenta de busca de novo e de novo, recebe de volta resultados quase idênticos e vazios toda vez, não muda de abordagem e busca a mesma coisa no turno seguinte. Julgado pelo `stop_reason`, esse loop parece perfeitamente saudável — sempre `tool_use`, sempre girando normalmente. Julgado pela tarefa, ele está marchando no lugar, queimando turnos e tokens em círculos e sem avançar nada.

Um loop morto se conserta consertando o código. Giro em falso não — o código está bom, e não há bug para você resolver. Giro em falso exige duas comportas rígidas:

- **Teto máximo de turnos** (a comporta da Lição 3): dê ao loop um teto absoluto de iterações, e pare no teto por mais "saudáveis" que os turnos pareçam. Este é o fusível final, garantindo que por mais forte que o loop gire no lugar, ele não pode girar além de N turnos.
- **Detecção de não-progresso**: a comporta feita especificamente para o giro em falso. A ideia é fazer o host observar se algo de novo está de fato acontecendo — registrar os nomes e resultados das últimas chamadas de ferramenta, e se N turnos seguidos usarem a mesma ferramenta e voltarem com saída quase idêntica, chamar isso de "sem progresso" e sair do loop. Ela morde mais cedo que o teto máximo de turnos: você não precisa queimar todos os 50 turnos; consegue pegar a repetição já no turno três.

A divisão de trabalho entre as duas comportas: a detecção de não-progresso é responsável por *notar o giro cedo*, e o teto máximo de turnos é responsável por *segurar um teto absoluto mesmo quando nada foi notado*. Nenhuma das duas espera o modelo cair em si — a razão inteira de o giro em falso existir é que o modelo não vai cair em si, então a fronteira tem de ser traçada pelo código host, fora do loop.

```agentmentor-check
{
  "id": "harness-zh-04-runaway-search",
  "label": "Escolher o fallback certo para um loop de busca girando em falso",
  "prompt": "Seu agente chamou a mesma ferramenta de busca 15 turnos seguidos. A cada turno a consulta é quase idêntica, e os resultados também — que estão basicamente vazios. O loop ainda está rodando, a contagem de turnos ainda sobe, e a conta também. Qual fallback você deve adicionar primeiro a este harness?",
  "whyHere": "Esta seção acabou de traçar a linha entre loops mortos e giro em falso — em especial o giro em falso, em que o código está correto e o loop parece saudável enquanto não sai do lugar. A verificação fica aqui para que, na primeira vez que você encontrar um loop de fato descontrolado, você recorra a uma comporta rígida que o pare em vez de, por reflexo, trocar o modelo ou reescrever o prompt.",
  "mode": "single",
  "choices": [
    {
      "id": "a",
      "text": "Adicionar detecção de não-progresso — parar quando N turnos não produzem resultado novo — mantendo o teto máximo de turnos como rede de segurança",
      "correct": true,
      "feedback": "Certo. Giro em falso é, por definição, 'muitos turnos, nenhum progresso novo', então a comporta mais direta observa a grandeza chamada progresso: pare quando os resultados não mudam por N turnos, com um teto máximo de turnos por baixo. Assim, mesmo quando o modelo não percebe que marcha no lugar, o harness pode encerrar em seu lugar e cortar o custo — e o erro em potencial — que continua se empilhando."
    },
    {
      "id": "b",
      "text": "Trocar para um modelo maior e mais forte, para ele parar de rodar a mesma busca de novo e de novo",
      "correct": false,
      "feedback": "Trocar de modelo não cura isto. A causa-raiz é que o loop não tem fronteira: por mais forte que seja o modelo, se o harness deixa ele tentar de novo para sempre, ele vai girar no lugar. Cada turno extra continua acumulando custo e possivelmente erro, e um modelo maior só deixa cada turno mais caro. Este é um problema da camada de controle, não da capacidade do modelo."
    },
    {
      "id": "c",
      "text": "Escrever um system prompt mais longo e detalhado, que repetidamente diz para ele não rodar buscas duplicadas",
      "correct": false,
      "feedback": "Alongar o prompt aposta que o modelo vai ler e obedecer aquela instrução todo turno — e ele já demonstrou que está ignorando-a. Pior: um prompt mais longo come parte do orçamento de atenção, tornando um contexto que já está inchando mais difícil de processar com precisão. O que de fato segura é uma comporta rígida que não depende da autoconsciência do modelo, não mais uma frase que ele talvez nem absorva."
    }
  ]
}
```

## Descontrole 4: esgotamento de orçamento — mais turnos vezes contexto maior, e a conta se descontrola

O último é o mais fácil de entender e o mais doloroso.

Os três modos de falha anteriores tendem a aparecer, cedo ou tarde, como dinheiro. A autonomia de um agente significa custos mais altos[^S1], o modelo pode rodar por muitos turnos seguidos[^S1], e o contexto em cada um desses turnos não para de crescer — contagem de turnos vezes tokens por turno, ambos subindo, então a conta sobe de forma multiplicativa. Um agente preso em giro em falso pode queimar uma pilha séria de gasto de API durante a noite, enquanto você não está olhando, e não terminar nada.

O risco aqui não é só dinheiro. Rodar por muitos turnos significa que você precisa depositar algum nível de confiança na tomada de decisão do modelo[^S1] — e você provavelmente não quer estender essa confiança sem um teto.

**Fallback: um teto de orçamento.** Dê ao loop um teto de orçamento explícito, medido de uma de duas formas:

- **Por turnos.** A versão mais simples, que é justamente o teto máximo de turnos da Lição 3 — esse teto também é um orçamento.
- **Por tokens (ou por dinheiro).** Mais próximo do custo real: assim que os tokens acumulados consumidos (ou o gasto estimado) atinge o teto, pare imediatamente.

O ponto não é só parar, é **reportar com honestidade**. Pare no teto e diga com todas as letras: parei porque o orçamento acabou, a tarefa não está terminada, e foi até aqui que cheguei. O pior desfecho é queimar todo o orçamento e depois fingir que entregou um resultado completo — o que devolve você direto ao problema de erro do modo de falha um. Parar com honestidade é o que permite a um humano saber como retomar as coisas.

## As quatro comportas, juntas

Olhe de novo para os quatro modos de falha e você vai notar que compartilham uma origem: **o loop não tem fronteira, e o modelo ou não percebe a fronteira ou não consegue se ater a ela.**

- Erros que se acumulam → checkpoints mais parada antecipada, cortando o engano enquanto ele ainda é pequeno
- Inchaço e apodrecimento do contexto → governança de contexto, aliviando a carga que o loop carrega a cada turno
- Loops mortos → conserte o código (adicione a reatribuição que faltava); giro em falso → detecção de não-progresso mais um teto máximo de turnos, encerrando em nome do modelo
- Esgotamento de orçamento → um teto de orçamento mais reporte honesto, colocando um teto no custo

Essas quatro comportas não são enfeite opcional. São as condições sob as quais "autônomo" não significa "fora de controle". Um loop sem fallback fica lindo enquanto roda bem, mas no momento em que um turno sai dos trilhos ele não tem mecanismo para se puxar de volta — só vai rolar um problema pequeno até virar um incidente grande.

Cuidado também com o extremo oposto: esses mecanismos são eles próprios complexidade, e "you should consider adding complexity only when it demonstrably improves outcomes."[^S1] (você deveria considerar adicionar complexidade apenas quando ela comprovadamente melhora os resultados.) Não parafuse uma pilha de comportas em todo loop de brinquedo. O teste é sempre o mesmo: quão caro é quando este loop se descontrola? Quanto maior o custo, mais completo deve ser o conjunto de comportas.

Com as comportas instaladas, a próxima pergunta surge sozinha: quando uma comporta para o loop, ou o loop chega a uma bifurcação que não consegue julgar sozinho, como um humano entra para interromper, corrigir o curso ou assumir? Isso é a Lição 5.

<!-- exercises -->
## 💻 Exercícios

### Nível 1: Case cada descontrole com sua comporta

Abaixo estão três loops de agente que se descontrolaram, cada um descrevendo um modo de falha. Para cada um: (1) decida qual dos modos de falha desta lição ele é; (2) nomeie a comporta de fallback de que ele mais precisa; (3) diga em uma frase qual passo do loop essa comporta bloqueia.

- **Caso A:** Um agente de relatório semanal interpreta "esta semana" como "semana passada" no turno 2, depois passa a dúzia-e-tanto de turnos seguintes resumindo os dados da semana passada, e por fim entrega um relatório que parece completo mas tem todas as datas erradas.
- **Caso B:** Um agente de pesquisa chama uma API e recebe de volta um erro de "chave inválida". Ele decide tentar de novo, recebe o mesmo erro, e repete — já está no turno 12.
- **Caso C:** Um agente está trabalhando numa tarefa de fato complexa e rodando normalmente, mas como há muitos turnos e cada turno carrega um contexto grande, a conta de API da madrugada vem muito acima do esperado.

<!-- rubric -->
- Os três modos de falha identificados corretamente (A erros que se acumulam, B giro em falso / chamar repetidamente uma ferramenta que falha e que tentar de novo não conserta, C esgotamento de orçamento)
- Cada um recebe o fallback correspondente (A checkpoints mais parada antecipada, B detecção de não-progresso mais um teto máximo de turnos, C teto de orçamento mais reporte honesto)
- Explica qual passo do loop a comporta bloqueia, não só o nome da comporta

<!-- answer -->
O Caso A é erros que se acumulam: uma interpretação errada no início é carregada adiante e amplificada por todo turno subsequente. O fallback é checkpoints mais parada antecipada — ponha um checkpoint logo depois do passo "fixar a definição da métrica e o intervalo de tempo", exponha o artefato intermediário para uma olhada rápida, e se as datas estiverem erradas, pare cedo em vez de esperar mais uma dúzia de turnos passar. A comporta bloqueia o passo *antes de o erro ser alimentado no próximo turno*. O Caso B é giro em falso: o código em si está bom, cada turno legitimamente emite uma requisição, e é o modelo chamando repetidamente a mesma ferramenta que não consegue ter sucesso — uma chave inválida não é um problema que tentar de novo conserta, e ainda assim o modelo continua tentando sem mudar de abordagem. É exatamente o giro em falso (livelock) que esta lição definiu, não um loop morto, que é uma falha mecânica no código host. O fallback é detecção de não-progresso (vários turnos seguidos retornando o mesmo erro sem resultado novo significam que ele está travado, então pare) somado a um teto máximo de turnos como fusível. A comporta bloqueia o passo *antes de a mesma falha ser repetida sem limite*. O Caso C é esgotamento de orçamento: contagem de turnos vezes contexto por turno, então o custo sobe de forma multiplicativa. O fallback é um teto de orçamento (contado em tokens ou em dinheiro, parando no momento em que é atingido) mais um reporte honesto de onde as coisas estão. A comporta bloqueia *o momento em que o custo acumulado toca o teto*.

<!-- hint -->
Pergunte-se primeiro: este loop está "continuando em cima de um engano", "repetindo uma ação que não pode ter sucesso" ou "trabalhando normalmente mas caro demais"? Esses são três modos de falha diferentes.

<!-- hint -->
Um fallback não é sobre "deixar o modelo mais esperto", é sobre "o harness segurar a fronteira quando o modelo não consegue segurá-la sozinho". Pense em qual grandeza cada comporta observa: o artefato intermediário? o sinal de progresso? o gasto acumulado?

### Nível 2: Por que a detecção de não-progresso merece seu lugar ao lado de um teto máximo de turnos

Alguém argumenta: "Eu já defini um teto máximo de 50 turnos. Isso basta — por mais desvairado que o loop fique, ele roda 50 turnos e para. Não precisa de nenhuma detecção de não-progresso por cima."

Refute ou estenda essa afirmação. Requisitos: (1) explique o que um loop só-com-teto desperdiça quando começa a girar em falso no turno 5; (2) explique por que a detecção de não-progresso e o teto máximo de turnos são complementares em vez de substitutos; (3) amarre os argumentos desta lição sobre custo multiplicativo e erros que se acumulam para defender a parada antecipada.

<!-- rubric -->
- Aponta que só o teto queima todos os turnos restantes (travado no turno 5 mas ainda rodando até o 50), desperdiçando tokens, tempo e dinheiro
- Explica a complementaridade: a detecção de não-progresso cuida da parada antecipada inteligente, o teto máximo de turnos ampara tudo que escapa
- Usa custo multiplicativo e erros que se acumulam para argumentar que quanto mais cedo você para, menor a perda

<!-- answer -->
O problema de só o teto é que ele só garante "não vai rodar além de 50 turnos", não "não vai fazer trabalho inútil". Se o loop cai em giro em falso no turno 5 — o mesmo resultado vazio voltando de novo e de novo — o teto máximo de turnos vai ficar ali assistindo ele moer os 45 turnos restantes antes de parar. Cada um desses 45 turnos gasta tokens, tempo e dinheiro, e como o custo é a contagem de turnos vezes o contexto por turno multiplicados, os turnos posteriores são individualmente mais caros que os iniciais. A detecção de não-progresso consegue notar pouco depois do turno 5 que o sinal de progresso ficou reto e parar cedo, poupando todos os 45 turnos de desperdício. As duas são complementares: a detecção de não-progresso cuida de "parar de forma inteligente assim que fica claro que está travado", mas depende de você conseguir definir um sinal de progresso confiável, e se algum modo de falha escapa dela, o teto máximo de turnos é o fusível final que segura aconteça o que acontecer. Traga os erros que se acumulam para dentro também: se esses turnos não estão girando em falso, mas empurrando adiante em cima de um engano, parar cedo não só poupa dinheiro, impede o erro de crescer — quanto mais cedo você para, menor a bagunça para limpar. Então o movimento certo é instalar as duas comportas, não usar uma como substituta da outra.

<!-- hint -->
Um teto máximo de turnos responde "no máximo quanto isto pode rodar?" A detecção de não-progresso responde "ainda está avançando?" São duas perguntas diferentes.

<!-- hint -->
Encaixe os números concretos — travado no turno 5, teto de 50 — e faça a aritmética: quantos turnos são desperdiçados? O custo desses turnos é constante, ou fica mais caro conforme avança?

<!-- /exercises -->

## Recapitulação

- Um loop não vai encerrar sozinho: o `while` só conhece a sua condição, e o modelo vai simplesmente continuar disparando mais uma requisição. A fronteira tem de ser segurada pelo harness.
- Erros que se acumulam — a maior parte da entrada do modelo neste turno é a própria saída dele do turno passado, então um passo errado é carregado adiante e amplificado por todo turno depois dele; combine isso com o fato de que ele pode rodar por muitos turnos, e a autonomia vem empacotada com custos mais altos e o potencial de erros que se acumulam[^S1]. A comporta é checkpoints mais parada antecipada.
- Inchaço e apodrecimento do contexto — os dados no loop só se acumulam[^S3], cada novo token esgota o orçamento de atenção[^S3], a recuperação piora conforme os tokens se empilham, e o contexto é um recurso finito com retornos marginais decrescentes[^S3]; a degradação é um gradiente, não um penhasco. A comporta é governança de contexto (o kit de gerenciamento de histórico de "Memória e Estado de Agente").
- Loops mortos e giro em falso são duas coisas diferentes: um loop morto é um bug no código host (esquecer de reatribuir `response`, digamos) e se conserta consertando o código; giro em falso tem código correto e um modelo chamando repetidamente a mesma ferramenta inviável enquanto não sai do lugar, e é tratado por detecção de não-progresso (parar depois de N turnos sem resultado novo) somada a um teto máximo de turnos como fusível. Não aponte a detecção de não-progresso para um loop morto, e não espere que um conserto de código cure o giro em falso.
- Esgotamento de orçamento — a contagem de turnos e o contexto por turno se multiplicam para empurrar o custo para cima[^S1]; a comporta é um teto de orçamento contado em tokens ou em turnos, parando no teto e reportando o progresso com honestidade.
- As quatro comportas compartilham uma origem: o loop carece de fronteira e o modelo não consegue se ater a uma. Elas não são enfeite, são o que impede a autonomia de escorregar para o descontrole — mas adicione-as apenas quando elas comprovadamente melhoram os resultados[^S1].

[>> Lição 5: Intervenção e direção: interromper, redirecionar, humano no loop](./05-intervention-and-steering.md)
