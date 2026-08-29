# Lição 4: Compactação e notas: gestão de contexto para tarefas longas

> Objetivos de aprendizado:
> - Dizer o que é a compactação e como ela é implementada: quando uma conversa se aproxima do limite da janela, entregar o histórico de mensagens ao modelo para resumir e então reiniciar uma janela nova a partir desse resumo
> - Escrever a instrução de resumo e a lista do que manter e do que descartar de uma compactação, seguindo a regra: preservar decisões arquiteturais e bugs não resolvidos, descartar saída de ferramenta redundante
> - Distinguir os papéis da compactação e das notas estruturadas, e projetar um esquema de notas escritas conforme se avança para um agente de tarefa longa
>
> Pré-requisitos: Você concluiu as Lições 1 a 3 deste curso e sabe escrever à mão o loop de harness do curso 7 desta série, “Fundamentos do Harness de Agente: Laços e Controle” | Anterior: [Lição 3 <<](./03-just-in-time-context.md) | Próxima: [Lição 5 >>](./05-subagent-context-isolation.md)

## Uma tarefa que uma janela não comporta

Comece por uma cena que você vai encontrar em breve. Você pega o harness que escreveu à mão no curso 7 desta série, “Fundamentos do Harness de Agente: Laços e Controle”, e o aponta para uma tarefa de depuração: corrigir uma condição de corrida que só aparece sob concorrência. O agente lê arquivos, roda testes, edita código, roda os testes de novo — quarenta e tantos turnos adentro, a tarefa ainda não terminou, mas o histórico de mensagens inchou para além de cem mil tokens e a janela está prestes a encher.

As quatro válvulas de controle do curso 7 (máximo de turnos, orçamento, detecção de giro em falso, válvula de aprovação) não ajudam aqui. Elas governam “não deixe o loop fugir do controle”, mas o loop está se comportando bem — a tarefa é que é longa. Isso não é um acidente; é a natureza do loop: "An agent running in a loop generates more and more data that could be relevant for the next turn of inference"[^S1] (um agente rodando em um loop gera cada vez mais dados que podem ser relevantes para o próximo turno de inferência) — saída de ferramenta, conclusões intermediárias, tentativas fracassadas, tudo se empilhando no histórico de mensagens.

E a janela não é de graça. Um modelo que analisa grandes volumes de contexto lança mão de um "attention budget" (orçamento de atenção), e "Every new token introduced depletes this budget by some amount."[^S1] (cada novo token introduzido esgota esse orçamento em alguma medida.) Quanto mais tokens se empilham, pior fica o modelo na recuperação precisa: "as the number of tokens in the context window increases, the model's ability to accurately recall information from that context decreases"[^S1] (conforme o número de tokens na janela de contexto cresce, a capacidade do modelo de recuperar informação com precisão desse contexto diminui) — uma ladeira suave em vez de um penhasco, mas ladeira abaixo do mesmo jeito, de modo que "context, therefore, must be treated as a finite resource with diminishing marginal returns."[^S1] (o contexto, portanto, deve ser tratado como um recurso finito com retornos marginais decrescentes.) A documentação de boas práticas do Claude Code é mais direta — "Claude's context window fills up fast, and performance degrades as it fills," (a janela de contexto do Claude enche rápido, e o desempenho se degrada conforme ela enche) e "The context window is the most important resource to manage."[^S4] (a janela de contexto é o recurso mais importante a gerenciar.)

Quando uma tarefa fica longa demais para uma janela só comportar, você tem duas armas: a compactação e as notas estruturadas. Esta lição trabalha as duas.

## Compactação: resuma, depois abra uma janela nova

A compactação é exatamente o que o nome diz: "taking a conversation nearing the context window limit, summarizing its contents, and reinitiating a new context window."[^S1] (pegar uma conversa que se aproxima do limite da janela de contexto, resumir seu conteúdo e reiniciar uma nova janela de contexto.) Repare na última parte — você não enfia o resumo de volta na conversa antiga e continua entulhando; você reinicia. A janela antiga é abandonada por inteiro, e a nova viaja leve, carregando apenas o system prompt e o resumo.

A implementação é mais simples do que parece: trata-se de "passing the message history to the model to summarize and compress the most critical details."[^S1] (passar o histórico de mensagens ao modelo para resumir e comprimir os detalhes mais críticos.) O que significa que a compactação é, ela mesma, uma chamada extra de modelo. Em código fica mais ou menos assim (`formatHistory` só junta o array de mensagens em texto legível; implementação omitida):

```javascript
const COMPACT_INSTRUCTION = `Abaixo está o registro de trabalho completo de um agente até agora.
Comprima-o em um resumo de repasse a partir do qual uma sessão totalmente nova possa continuar
esta tarefa. O resumo tem de manter:
1. As decisões arquiteturais já tomadas, e o raciocínio por trás delas
2. Os problemas ainda não resolvidos (bugs, erros, pontos de travamento), e até onde a
   investigação chegou
3. Os detalhes de implementação importantes das mudanças já feitas (quais arquivos e funções
   mudaram, e por quê)
O seguinte pode ser descartado, ou reduzido a uma conclusão de uma linha:
- Saída de ferramenta redundante (retornos brutos de ler o mesmo arquivo repetidas vezes, ou de
  rodar os mesmos testes de novo)
- O relato lance a lance completo de tentativas intermediárias que foram descartadas depois
`;

async function compact(client, messages) {
  const resp = await client.messages.create({
    model: "claude-sonnet-5",
    max_tokens: 2000,
    messages: [{
      role: "user",
      content: COMPACT_INSTRUCTION + "\n\n" + formatHistory(messages),
    }],
  });
  const summary = resp.content[0].text;
  // Reiniciar: o histórico da nova janela é só este resumo (o harness mantém o system prompt como está)
  return [{
    role: "user",
    content: "Aqui está um resumo de repasse do trabalho anterior; continue a partir daqui:\n\n" + summary,
  }];
}
```

Emendar isso naquele loop do curso 7 exige só mais uma ideia: no início de cada turno, verifique o uso de tokens do histórico de mensagens e, assim que ele se aproximar do limite, chame `compact()` e substitua o array `messages` inteiro pelo valor de retorno. Construir isso de fato dentro do harness — como definir o limiar de disparo, o que fazer quando a compactação falha — é o material prático da Lição 6; por ora, basta entender o mecanismo.

## A arte da compactação: o que manter, o que descartar

A parte difícil da compactação não é “como resumir” — é “o que manter, o que descartar”. A direção, na verdade, é clara: "preserves architectural decisions, unresolved bugs, and implementation details while discarding redundant tool outputs."[^S1] (preserva decisões arquiteturais, bugs não resolvidos e detalhes de implementação, enquanto descarta saídas de ferramenta redundantes.)

Por que esse trade-off? Imagine o agente “acordando” na janela nova; aquele resumo é toda a memória que ele tem. O custo de comprimir na direção errada é concreto: digamos que sua instrução de resumo diga apenas “resuma brevemente o conteúdo da conversa”, e o modelo descarte sem cerimônia o “há uma condição de corrida não terminada em `orders/service.js`” — o agente acorda vendo só registros marcados como “concluído”, então ou declara o trabalho pronto ou fuça em coisas que você já corrigiu. Uma compactação, e quarenta turnos de trabalho acabaram de sair dos trilhos.

Inverta a situação: saída de ferramenta redundante é o alvo mais gordo. Um grep retorna 200 linhas correspondentes; o sinal útil já foi capturado na conclusão do passo seguinte, “estreitado para a função `updateStatus`”. As 200 linhas brutas que ficam por ali só queimam orçamento de atenção, sem acrescentar quase nenhum valor de decisão para o próximo movimento.[^S1]

Uma autoverificação prática: depois de escrever a instrução de resumo, pegue uma conversa longa real e compacte-a uma vez; depois responda três perguntas usando só o resumo — “o que deve acontecer em seguida”, “quais decisões estão travadas”, “quais buracos continuam abertos”. Se as três saírem limpas, as regras do que manter e do que descartar da sua instrução passaram; se alguma vier em branco, volte e remende aquela regra de manutenção.

```agentmentor-check
{
  "id": "ctx-zh-04-compaction-tradeoff",
  "label": "Julgar qual informação tem de ser preservada ao compactar uma conversa longa",
  "prompt": "Um agente de depuração rodou por 50 turnos, e a janela de contexto está se aproximando do limite. O harness está prestes a disparar a compactação. Você está escrevendo a instrução de resumo — qual classe de informação você tem de exigir explicitamente que ela mantenha?",
  "whyHere": "A seção anterior acabou de estabelecer o princípio do que manter e do que descartar: preservar decisões arquiteturais e bugs não resolvidos, descartar saída de ferramenta redundante. Isto verifica se quem aprende consegue aplicar essa regra a um cenário concreto, em vez de tratar a compactação como um indiferenciado ‘guarde tudo’ ou ‘apague tudo’.",
  "mode": "single",
  "choices": [
    {
      "id": "a",
      "text": "Preservar o original literal de toda a saída de ferramenta dos 50 turnos, garantindo perda zero de informação",
      "correct": false,
      "feedback": "O sentido inteiro da compactação é liberar espaço de janela; manter o original completo significa não compactar nada. Saída de ferramenta redundante (como os retornos brutos de ler o mesmo arquivo repetidas vezes) é exatamente o que o princípio do que manter e do que descartar manda jogar fora — ela queima orçamento de atenção, e qualquer conclusão útil já se depositou nos registros de decisão posteriores."
    },
    {
      "id": "b",
      "text": "Não é preciso separar por classe — basta manter o original literal dos últimos 10 turnos e apagar fisicamente tudo o que vem antes; é mais rápido e economiza uma chamada de resumo",
      "correct": false,
      "feedback": "Isso é truncagem, não compactação. Um corte por tempo remove fisicamente as decisões arquiteturais tomadas cedo e os registros de problemas ainda não resolvidos — eles podem não aparecer nos últimos 10 turnos. A definição de compactação é ‘resumir e então reiniciar’: deixar o modelo julgar o que fica, permitindo que a informação-chave sobreviva em forma de resumo, e não descartá-la por posição."
    },
    {
      "id": "c",
      "text": "Bugs ainda não corrigidos e decisões arquiteturais já tomadas",
      "correct": true,
      "feedback": "A compactação tem perdas; a questão é fazer a perda cair sobre a redundância, não sobre o que importa. Problemas não resolvidos e decisões travadas são o mínimo de chão que o agente precisa para continuar trabalhando na janela nova: perca os primeiros e ele vai achar que a tarefa acabou; perca as segundas e ele vai rediscutir do zero escolhas já assentadas."
    }
  ]
}
```

## Compactação em produção: compactação automática e /clear

A ferramenta que você usa todo dia tem uma referência pronta. O Claude Code "automatically compacts conversation history when you approach context limits, which preserves important code and decisions while freeing space"[^S4] (compacta automaticamente o histórico da conversa quando você se aproxima dos limites de contexto, o que preserva código e decisões importantes enquanto libera espaço) — o mesmo mecanismo do `compact()` escrito à mão acima, só que produtizado, com o disparo e as regras do que manter e do que descartar já resolvidos para você.

Mas a compactação não é a única opção. Se você está mudando para uma tarefa nova e **sem relação** com a anterior, o contexto antigo não é só inútil — é nocivo, porque "Long sessions with irrelevant context can reduce performance."[^S4] (sessões longas com contexto irrelevante podem reduzir o desempenho.) Nesse ponto a documentação manda "Run /clear between unrelated tasks to reset the context window entirely"[^S4] (rode /clear entre tarefas sem relação para redefinir inteiramente a janela de contexto) — sem resumir, sem preservar, apenas um reset completo. O raciocínio é simples: a compactação custa uma chamada de modelo e carrega o risco de errar o julgamento do que manter e do que descartar; para uma tarefa sem relação, limpar de vez é mais barato e mais limpo. A compactação serve ao “a mesma tarefa ainda não acabou”, enquanto o `/clear` serve ao “agora estou fazendo outra coisa”.

Essa documentação tem também uma frase que vale manter à mão: "A clean session with a better prompt almost always outperforms a long session with accumulated corrections."[^S4] (uma sessão limpa com um prompt melhor quase sempre supera uma sessão longa com correções acumuladas.) Em tradução livre: quando o histórico de uma sessão é feito principalmente de “não, tente de novo” e “ainda está errado”, o valor histórico para o próximo passo é provavelmente negativo — reabrir uma sessão e embutir a lição direto em um prompt novo costuma bater arrastar toda aquela bagagem adiante.

## Notas estruturadas: escreva o estado-chave fora da janela

A compactação tem uma fraqueza embutida: ela é reativa. Você espera a janela quase encher para só então olhar para trás e resumir, de modo que o que sobrevive depende inteiramente do julgamento daquele momento — e julgamento pode falhar. Existe um jeito de preservar a informação enquanto ela está fresca?

Existe, e é simples: "the agent regularly writes notes persisted to memory outside of the context window."[^S1] (o agente escreve regularmente notas persistidas em memória fora da janela de contexto.) "Like Claude Code creating a to-do list, or your custom agent maintaining a NOTES.md file."[^S1] (como o Claude Code criando uma lista de tarefas, ou o seu agente customizado mantendo um arquivo NOTES.md.) Tome de novo aquela tarefa inicial da condição de corrida; um conjunto de notas com nota de aprovação fica mais ou menos assim:

```markdown
# NOTES.md — Corrigir condição de corrida do serviço de pedidos

## Decisões tomadas
- Framework de teste: migramos para vitest (decidido no turno 3, motivo: as fixtures de teste existentes dependem dele)

## Não resolvidos
- orders/service.js updateStatus tem uma condição de corrida:
  duas requisições concorrentes modificando o mesmo pedido, a última escrita atropela a primeira
- Já tentado: mutex em processo -> funciona em instância única, falha em deploy multi-instância

## Próximo passo
- Tentar lock otimista no nível do banco de dados (adicionar campo version a orders)
```

A ligação é algo que você aprendeu no curso 7: dê ao agente uma ferramenta de escrita de arquivo e depois acrescente um requisito ao system prompt — “sempre que tomar uma decisão importante, descobrir um problema novo ou concluir uma etapa, atualize o `NOTES.md` primeiro, depois continue”. Daí em diante, o estado-chave da janela tem uma cópia de segurança fora da janela. Não importa como a janela compacte ou reinicie, as notas ficam no disco; a primeira coisa que a janela nova faz é lê-las de volta.

Esse truque não é específico de tarefas de programação. "Claude playing Pokémon demonstrates how memory transforms agent capabilities in non-coding domains."[^S1] (o Claude jogando Pokémon demonstra como a memória transforma as capacidades de um agente em domínios fora da programação.) O sistema multiagente de pesquisa da Anthropic faz o mesmo em tarefas longas: "agents summarize completed work phases and store essential information in external memory."[^S3] (os agentes resumem fases de trabalho concluídas e guardam informação essencial em memória externa.)

## Divisão de trabalho: a compactação é a rede de segurança, as notas são a rotina

Ponha as duas armas lado a lado e a divisão de trabalho fica clara. A compactação é passiva: dispara quando a janela se aproxima do limite, com um momento que não é escolha sua, e tem perdas — o que sobrevive depende do julgamento daquele instante sobre o que manter e o que descartar. As notas são ativas: você escreve o estado-chave no instante em que ele nasce, o conteúdo é sem perdas, e o custo é só algumas linhas de escrita em arquivo a cada vez. Em uma frase: as notas são a rotina diária, a compactação é a rede de segurança.

As duas não brigam; elas se reforçam. Quanto mais diligentes as suas notas, mais leve a consequência de a compactação deixar algo cair — se o resumo perder um detalhe, as notas ainda o têm. Na direção contrária, ter a compactação como rede de segurança significa que as notas não precisam ser exaustivas, apenas cobrir as poucas categorias que “o agente tem de saber ao acordar”.

A proporção também importa. Nem toda tarefa merece esse maquinário: a orientação da Anthropic é "you should consider adding complexity only when it demonstrably improves outcomes."[^S2] (você deveria considerar adicionar complexidade apenas quando isso melhorar comprovadamente os resultados.) Repare no verbo — *considerar*. É uma postura de ponderação, não uma proibição. Para uma tarefa que termina em dez turnos, compactação e notas são peças sobressalentes; comece pelo loop mais simples e acrescente-as quando você de fato bater no teto.

Duas fronteiras finais, para você não perder tempo caçando respostas que esta lição não cobre:

- A persistência **entre sessões** dos arquivos de nota — como organizá-los, como recuperá-los em uma sessão nova, a manutenção de longo prazo — é o assunto do curso 5 desta série, “Memória e Estado de Agente”. Esta lição se importa apenas com como as notas aliviam a carga da janela dentro de uma única tarefa longa.
- Lidar com tarefas de horizonte longo tem, na verdade, três movimentos: "compaction, structured note-taking, and multi-agent architectures,"[^S1] (compactação, anotação estruturada e arquiteturas multiagente) todos voltados a permitir que os agentes "maintain coherence, context, and goal-directed behavior over sequences of actions."[^S1] (mantenham coerência, contexto e comportamento orientado a objetivos ao longo de sequências de ações.) Os dois primeiros estão feitos; o terceiro — dividir a tarefa entre subagentes que carregam janelas limpas — é a Lição 5.

<!-- exercises -->
## 💻 Exercícios

### Nível 1: Escreva a instrução de resumo de uma compactação

Seu agente de depuração rodou por quarenta e tantos turnos, e o histórico de mensagens mistura várias categorias: uma escolha inicial de migrar para vitest, um bug de corrida descoberto no meio do caminho mas ainda não corrigido, dezenas de saídas repetidas da ferramenta de leitura de arquivo, mais os detalhes de implementação importantes das duas funções que você corrigiu no final. A janela está quase cheia; o harness está prestes a disparar a compactação. Escreva a instrução de resumo que você entregaria ao modelo (pode escrever em inglês) e, à parte, liste a “lista do que manter” e a “lista do que descartar” correspondentes, fora da própria instrução.

<!-- rubric -->
- A instrução de resumo exige explicitamente manter: o bug de corrida não resolvido e o progresso da investigação, a decisão arquitetural (migrar para vitest) e seu raciocínio, os detalhes de implementação importantes das funções já alteradas
- A instrução de resumo exige explicitamente descartar ou reduzir a uma conclusão de uma linha: saídas redundantes de leitura de arquivo e outros retornos de ferramenta repetidos
- A instrução explica que a finalidade do resumo é reiniciar uma janela nova (como contexto de abertura de uma conversa nova), não anexar de volta à conversa antiga

<!-- answer -->
Uma instrução de resumo com nota de aprovação:

“Abaixo está o registro de trabalho completo de um agente de depuração. Comprima-o em um resumo de repasse a partir do qual uma sessão totalmente nova possa continuar esta tarefa. O resumo tem de manter: primeiro, as decisões arquiteturais tomadas e seu raciocínio (por exemplo, a escolha do framework de teste); segundo, os bugs ainda não resolvidos e as pistas atuais da investigação; terceiro, os detalhes de implementação importantes das mudanças já feitas (quais funções mudaram, por que você as mudou daquele jeito). Descarte ou reduza a uma conclusão de uma linha: os retornos brutos redundantes de leitura de arquivo, o relato lance a lance completo de tentativas intermediárias que foram descartadas depois.”

Lista do que manter: o bug de corrida não corrigido e o ponto em que a investigação parou; a decisão de “migrar para vitest” e seu raciocínio; os nomes, o conteúdo das mudanças e a motivação das duas funções alteradas.  
Lista do que descartar: dezenas de saídas repetidas de leitura de arquivo (a conclusão útil já está refletida nas decisões); o vaivém completo das tentativas abandonadas.

Nota de uso: este resumo não é enfiado de volta na conversa antiga; ele serve para reiniciar uma janela nova — a janela nova carrega apenas o system prompt mais este resumo, e o agente continua a partir do resumo.[^S1]

<!-- hint -->
Pergunte-se primeiro: “Qual é o mínimo que o agente tem de saber ao acordar na janela nova para continuar trabalhando?” Faça a engenharia reversa da resposta para chegar à lista do que manter.

<!-- hint -->
Redundante não é o mesmo que inútil — aquelas saídas de ferramenta foram úteis na hora, mas se a conclusão delas já se depositou em registros de decisão posteriores, os originais podem ir embora.

### Nível 2: Diagnostique a “amnésia depois da compactação”

Alguém escreveu esta função de “compactação” para o harness, chamando-a quando a janela está quase cheia:

```javascript
function compact(messages, keepLast = 10) {
  // Janela quase cheia: mantém a primeira mensagem e as últimas 10, descarta o resto
  return [messages[0], ...messages.slice(-keepLast)];
}
```

Depois de ligá-la, o agente disparou a compactação no turno 45. Você então observou dois sintomas: primeiro, no turno 47 ele reabriu o debate sobre “o framework de teste deveria ser node:test ou vitest”, uma questão já decidida no turno 3 como vitest; segundo, ele nunca mencionou o bug de corrida não resolvido registrado no turno 5, e declarou a tarefa concluída alguns turnos depois. Explique a causa dos dois sintomas e proponha uma correção em duas camadas.

<!-- rubric -->
- Aponta que este `compact()` é truncagem pura, não resumo: mantém apenas a primeira mensagem e as últimas 10, apagando fisicamente a decisão do turno 3 e o registro do bug do turno 5. Depois da compactação essas informações não existem mais no contexto, então o agente rediscute decisões já assentadas e não tem como se lembrar de bugs não terminados
- Correção da primeira camada: substituir a truncagem por resumo pelo modelo — entregar o histórico de mensagens ao modelo para compressão, com instrução que preserve explicitamente decisões arquiteturais, bugs não resolvidos e detalhes de implementação importantes, descartando saída de ferramenta redundante, e então reiniciar uma janela nova a partir do resumo
- Correção da segunda camada: acrescentar notas estruturadas — dar ao agente uma ferramenta de escrita de arquivo, exigir que ele atualize um `NOTES.md` fora da janela ao tomar decisões ou descobrir problemas, ler as notas depois da compactação ou do reinício para recuperar o estado, de modo que o estado-chave deixe de depender do julgamento do momento da compactação

<!-- answer -->
Causa: este `compact()` não “resume” coisa nenhuma — é truncagem. Ele mantém a primeira mensagem (normalmente a descrição da tarefa) e as últimas 10, jogando fora os trinta e tantos turnos do meio em bloco maciço — a mensagem do turno 3 que trava o vitest e a mensagem do turno 5 que registra o bug de corrida caem ambas na zona descartada. A informação foi apagada fisicamente, não comprimida, então na inferência seguinte do agente essas mensagens é como se nunca tivessem acontecido: sem registro da decisão, ele naturalmente rediscute a escolha do framework de teste; sem registro do bug, ele não vê nenhuma evidência de que “há trabalho não terminado”, então declarar a conclusão alguns turnos depois é perfeitamente razoável.

A correção vem em duas camadas. Primeira camada, substituir a truncagem por compactação de verdade: entregar ao modelo o histórico de mensagens prestes a ser descartado para resumo, com instrução que exija explicitamente manter as decisões arquiteturais já tomadas, os bugs ainda não resolvidos e os detalhes de implementação importantes, descartar saída de ferramenta repetida, e então reiniciar uma janela nova a partir desse resumo.[^S1] Assim a informação dos turnos 3 e 5 sobrevive em forma de resumo. Segunda camada, acrescentar notas estruturadas como seguro: dar ao agente uma ferramenta de escrita de arquivo, exigir que ele atualize um `NOTES.md` fora da janela ao travar decisões ou descobrir problemas;[^S1] ler as notas primeiro depois da compactação ou do reinício. Assim, mesmo que o julgamento de um resumo falhe, o estado-chave ainda tem uma cópia de segurança sem perdas no disco.

<!-- hint -->
Contraste “truncagem” e “resumo”: a truncagem descarta mensagens inteiras, o resumo descarta detalhe mas mantém conclusões. Pergunte-se — depois desta compactação, aquelas duas mensagens dos turnos 3 e 5 ainda estão no contexto?

<!-- hint -->
Se o estado-chave já tivesse sido escrito fora da janela antes de ser descartado, a compactação deixar algo cair ainda seria fatal? Pense a partir daqui em direção à correção da segunda camada.

<!-- /exercises -->

## Recapitulação

- Compactação = quando uma conversa se aproxima do limite da janela, "passing the message history to the model to summarize and compress the most critical details,"[^S1] e então "reinitiating a new context window"[^S1] a partir desse resumo — reiniciar, não anexar de volta à conversa antiga
- A arte da compactação está na escolha do que manter e do que descartar: "preserves architectural decisions, unresolved bugs, and implementation details while discarding redundant tool outputs";[^S1] comprima na direção errada e o agente acorda esquecido do que estava fazendo
- O Claude Code "automatically compacts conversation history when you approach context limits, which preserves important code and decisions"[^S4]; entre tarefas sem relação, use `/clear` para um reset completo — "A clean session with a better prompt almost always outperforms a long session with accumulated corrections"[^S4]
- Notas estruturadas: "the agent regularly writes notes persisted to memory outside of the context window" (lista de tarefas, `NOTES.md`);[^S1] a compactação é rede de segurança passiva e com perdas, as notas são externalização ativa escrita conforme se avança
- Os três movimentos para tarefas de horizonte longo são "compaction, structured note-taking, and multi-agent architectures";[^S1] os dois primeiros estão na mão, o terceiro é a Lição 5. A persistência das notas entre sessões é o assunto do curso 5 desta série, “Memória e Estado de Agente”

[>> Lição 5: Subagentes e isolamento de contexto](./05-subagent-context-isolation.md)
