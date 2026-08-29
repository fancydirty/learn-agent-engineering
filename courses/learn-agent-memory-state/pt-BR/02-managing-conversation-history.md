# Lição 2: Gerenciando o histórico da conversa: acrescentar, truncar, resumir

> Objetivos de aprendizado:
> - Explicar por que o histórico da conversa só cresce e nunca encolhe por padrão
> - Dizer o que a truncagem descarta, o que ela mantém e que estrutura ela pode quebrar
> - Distinguir os problemas que a compactação e a limpeza de resultados de ferramenta resolvem cada uma
> - Julgar qual mecanismo acionar com base no uso da janela e no tipo de conteúdo que a está inchando
>
> Pré-requisitos: concluir a Lição 1 e entender do que uma janela de contexto é feita | Anterior: [Lição 1 <<](./01-context-window-is-memory.md) | Próxima: [Lição 3 >>](./03-external-memory-files.md)

## Acrescentar é o padrão: por que o histórico continua crescendo

A Lição 1 destacou que o histórico que o modelo vê é aquilo que o aplicativo host reenvia a cada turno. Então como ele é de fato enviado? A implementação mais simples é **acrescentar** (append): quando um turno termina, você anexa as novas mensagens daquele turno (as palavras do usuário, a resposta do modelo, as chamadas de ferramenta e seus resultados) ao final do array `messages` existente, e no próximo turno você reenvia o array inteiro como está.

A documentação oficial coloca esse padrão de forma clara: conforme a conversa avança, cada mensagem do usuário e resposta do modelo se acumula na janela de contexto, e todo turno anterior é mantido por inteiro. "As the conversation advances through turns, each user message and assistant response accumulates within the context window, and previous turns are preserved completely."[^S1] (Conforme a conversa avança pelos turnos, cada mensagem do usuário e resposta do assistente se acumula dentro da janela de contexto, e os turnos anteriores são preservados por completo.) Ninguém está apagando nada ativamente, então o histórico só sobe — dez turnos adentro, a janela guarda o conteúdo de todos os dez turnos, não um resumo do último turno e não um conjunto de destaques filtrado automaticamente.

Numa conversa curta isso é um não-problema. Mas para um agente que roda por muito tempo, o problema faz bola de neve: os argumentos completos e o valor de retorno completo de cada chamada de ferramenta são enfiados no histórico, e uma tarefa que lê arquivos e roda comandos repetidamente pode facilmente empurrar o array `messages` para dezenas de milhares de tokens depois de algumas dezenas de turnos. A Lição 1 cobriu que a janela tem um teto de capacidade rígido, e quanto mais cheia ela fica, mais perto você está de atingi-lo. O custo mais sutil é o **context rot** — quanto mais longo e bagunçado o histórico, mais difícil para o modelo achar ali a única linha que de fato importa agora[^S1]. Deixe o histórico crescer sem controle e você acaba pagando as duas contas.

## Truncagem: a opção mais simples e mais grosseira

A resposta mais direta é a **truncagem** (truncation): quando a janela está quase cheia, corte de vez o lote mais antigo de mensagens e mantenha apenas os N turnos mais recentes. Isso é a coisa mais fácil de construir — nenhuma chamada de modelo extra, nenhum formato de resumo para projetar. Uma única linha de `messages.slice(-N)` resolve.

Mas o que a truncagem descarta se foi para sempre. Se o lote que você cortou continha uma restrição-chave que o usuário declarou lá no turno 3 ("o orçamento fica abaixo de \$5.000") e o agente está agora no turno 40 prestes a fazer um pedido, essa informação simplesmente some. O modelo não vai saber que um dia "viu" e depois "esqueceu" — ele só se comporta como se nunca tivesse sido informado.

A truncagem tem uma armadilha mais oculta também, uma que se liga diretamente ao protocolo de ida e volta do curso anterior, Tool calling de agentes: fazendo agentes agirem de verdade, Lição 2 "A ida e volta completa de uma chamada de ferramenta": se você trunca fatiando ingenuamente para "as últimas N mensagens", pode facilmente cortar no meio de um par `tool_use` / `tool_result` — mantendo a mensagem `assistant` que disparou a chamada mas fatiando fora a mensagem `tool_result` que veio logo depois dela. Envie esse histórico ao modelo e o próprio protocolo está quebrado. A documentação é explícita de que "Tool result blocks must immediately follow their corresponding tool use blocks in the message history."[^S7] (Os blocos de resultado de ferramenta devem seguir imediatamente os blocos de uso de ferramenta correspondentes no histórico de mensagens.) Um erro como "tool_use ids were found without tool_result blocks immediately after" é o sinal de que o pareamento está quebrado[^S7] — o modelo vê que "iniciou uma chamada" mas nunca recebe o resultado dela, e a próxima requisição falha de imediato.

```agentmentor-check
{
  "id": "mem-zh-02-truncation-tradeoff",
  "label": "Descubra o que a truncagem descartou",
  "prompt": "Um agente rodou 40 turnos, a janela está quase cheia, e você escreveu uma linha — messages.slice(-10) — para manter apenas as últimas 10 mensagens antes de enviá-las ao modelo. O usuário disse “o orçamento fica abaixo de $5.000” lá no turno 3. Essa restrição ainda vai aparecer no comportamento do modelo?",
  "whyHere": "Acabamos de cobrir que a truncagem descarta a informação dentro do lote que ela corta. Isto verifica se quem aprende pensa “o modelo tem boa memória, ele sempre vai guardar o que é importante” em vez de entender que “conteúdo que não foi enviado é conteúdo que o modelo nunca viu”.",
  "mode": "single",
  "choices": [
    {
      "id": "a",
      "text": "Ainda aparece — a linha importa o suficiente para o modelo tê-la guardado na memória em um turno anterior.",
      "correct": false,
      "feedback": "Não. A Lição 1 cobriu isto: o modelo não armazena nada entre requisições, então o quão importante uma linha é não faz diferença. Uma vez que a truncagem corta a mensagem do turno 3, ela não aparece mais no array messages que você envia, e para o modelo aquela linha é como se nunca tivesse sido dita."
    },
    {
      "id": "b",
      "text": "Não vai aparecer — a mensagem do turno 3 já foi descartada pela truncagem e não está nesta requisição.",
      "correct": true,
      "feedback": "Correto. Manter apenas as últimas 10 mensagens deixa o “o orçamento fica abaixo de $5.000” do turno 3 de fora do array messages desta requisição. O que não está na janela não existe no que diz respeito ao modelo, por mais importante que fosse originalmente."
    },
    {
      "id": "c",
      "text": "Ainda aparece — a truncagem só esconde mensagens temporariamente, ela não as apaga de verdade.",
      "correct": false,
      "feedback": "A truncagem aqui de fato remove essas mensagens do array que você está prestes a enviar — ela não as está “escondendo”. Se essa linha precisa chegar ao modelo de novo, algum outro mecanismo tem de levá-la de volta (escrevê-la em um resumo ou na memória externa); você não pode contar com a truncagem para mantê-la por conta própria."
    }
  ]
}
```

## Compactação: espreme a janela para um único resumo

O problema da truncagem é que ela descarta trechos inteiros. Existe uma forma de liberar espaço sem jogar informação fora por completo? É esse o problema que a **compactação** (compaction) resolve. O Cookbook oficial a define assim: "Compaction distills the contents of a context window into a high-fidelity summary, letting the agent continue with minimal performance degradation when the conversation gets long."[^S2] (A compactação destila o conteúdo de uma janela de contexto em um resumo de alta fidelidade, deixando o agente continuar com degradação mínima de desempenho quando a conversa fica longa.)

Diferente do "apague um trecho inteiro" da truncagem, a compactação é um "reescreva tudo": o histórico anterior da conversa é comprimido em um único **resumo de alta fidelidade** que substitui a longa sequência de mensagens brutas e permanece à frente da janela. O que o resumo mantém é "o que aconteceu e o que foi concluído"; o que ele descarta é o detalhe palavra-por-palavra do diálogo bruto.

A documentação detalha os parâmetros desse mecanismo. Há um **limiar de disparo** padrão — a compactação dispara automaticamente quando o uso da janela atinge 150K tokens; o limiar é configurável mas não pode ir abaixo de 50K tokens, um piso imposto pelo servidor[^S2][^S8]. Cada disparo é uma substituição discreta: o grande trecho de histórico é trocado pelo resumo, e novas mensagens continuam acrescentando normalmente depois dele. Isso não é um evento único — a documentação é explícita de que uma conversa longa pode compactar mais de uma vez, e "The last compaction block reflects the final state of the prompt, replacing content prior to it with the generated summary."[^S8] (O último bloco de compactação reflete o estado final do prompt, substituindo o conteúdo anterior a ele pelo resumo gerado.) Quando ela compacta de novo, o bloco de compactação anterior é dobrado no novo resumo junto com o resto do histórico; a compactação é uma operação de transcrição inteira em que "user messages, assistant messages, tool calls, tool results, even prior compaction blocks are all flattened into the summary."[^S2] (mensagens do usuário, mensagens do assistente, chamadas de ferramenta, resultados de ferramenta, e até blocos de compactação anteriores são todos achatados no resumo.)

A compactação não é de graça. O ato de compactar custa uma chamada de modelo extra (o modelo sumarizador roda)[^S2], e por mais cuidadoso que seja o texto, o resumo é uma versão com perdas do original — "The summary preserves key decisions and facts but may drop specific numbers or exact phrasing."[^S2] (O resumo preserva decisões e fatos-chave mas pode descartar números específicos ou o fraseado exato.) Se um passo posterior por acaso depende de um detalhe minúsculo que foi resumido para fora (a grafia exata de alguma variável, digamos), esse detalhe pode ter sumido. É também por isso que a compactação serve ao problema grosso de "o contexto geral ficou grande demais" em vez de servir como cura para todo tipo de inchaço de histórico.

## Limpeza de resultados de ferramenta: limpe só a parte que fica obsoleta

Um grande contribuinte para o inchaço do histórico são as próprias chamadas de ferramenta. Toda vez que um agente lê um arquivo ou roda um comando, o valor de retorno completo é enfiado no histórico — leia um arquivo de alguns milhares de linhas e essas milhares de linhas ficam no array `messages` como estão, mesmo dez turnos depois, quando ninguém precisa mais do detalhe. O Cookbook aponta isso diretamente: "Tool-result clearing addresses the bloat from tool use itself. As an agent pulls in tools and calls them, the results pile up, and deciding how much of that tool output to keep becomes an increasingly important part of managing context."[^S2] (A limpeza de resultados de ferramenta trata o inchaço do próprio uso de ferramenta. Conforme um agente puxa ferramentas e as chama, os resultados se empilham, e decidir quanto dessa saída de ferramenta manter se torna uma parte cada vez mais importante de gerenciar o contexto.)

A **limpeza de resultados de ferramenta** (tool-result clearing) é o mecanismo mirado diretamente nisso: ela "drops old, re-fetchable results while keeping the record that the call happened."[^S2] (descarta resultados antigos e rebuscáveis mantendo o registro de que a chamada aconteceu.) Essa é a distinção-chave — a limpeza descarta o conteúdo concreto que a ferramenta retornou (aquelas poucas milhares de linhas de conteúdo de arquivo), mas ela não apaga o registro de que "o agente chamou `read_file` com este caminho". Se esse conteúdo for necessário de novo mais tarde, o agente sabe qual ferramenta chamou e quais argumentos passou, e pode decidir se a chama de novo para buscar o conteúdo de volta.

Seu limiar de disparo e sua política de retenção também têm padrões claros: a limpeza dispara quando o uso da janela atinge 100K tokens, e por padrão mantém os resultados completos das 3 chamadas de ferramenta mais recentes, limpando os resultados de ferramenta mais antigos[^S2]. O disparo de 100K é menor que os 150K da compactação, o que combina com seu papel — lide primeiro com a saída de ferramenta, a parte que "incha mais fácil e é a mais fácil de rebuscar", e se isso não bastar, entregue a janela geral para a compactação.

```agentmentor-check
{
  "id": "mem-zh-02-compaction-vs-clearing",
  "label": "Escolha o melhor mecanismo de gerenciamento de histórico",
  "prompt": "Um agente chamou a ferramenta read_file uma dúzia de vezes seguidas, cada vez lendo de volta alguns milhares de linhas de código, e o histórico agora está lotado desses conteúdos de arquivo brutos. O uso da janela está disparando rumo ao teto. Isto combina melhor com compactação ou com limpeza de resultados de ferramenta?",
  "whyHere": "Acabamos de cobrir a compactação e a limpeza de resultados de ferramenta separadamente. Isto verifica se quem aprende consegue escolher com base em “qual é a fonte específica do inchaço” em vez de tratar os dois mecanismos como sinônimos intercambiáveis.",
  "mode": "single",
  "choices": [
    {
      "id": "a",
      "text": "Limpeza de resultados de ferramenta — o inchaço vem principalmente de saída de ferramenta rebuscável, que é exatamente para o que a limpeza foi feita.",
      "correct": true,
      "feedback": "Correto. Quase todo o inchaço aqui é conteúdo de retorno do read_file — o tipo de conteúdo que você pode simplesmente ler de novo quando fica obsoleto, o que combina com o papel da limpeza de “descartar resultados obsoletos e rebuscáveis, manter o registro da chamada”. Seu disparo padrão (100K) também é menor que o da compactação (150K), então ela pode entrar mais cedo."
    },
    {
      "id": "b",
      "text": "Compactação — ela pode destilar tudo em um único resumo, o que dá menos trabalho no geral.",
      "correct": false,
      "feedback": "A compactação consegue lidar com o inchaço geral da janela, mas seu papel é uma “reescrita completa” e o que ela produz é um resumo com perdas. A fonte do inchaço aqui é específica — aquelas poucas milhares de linhas de conteúdo de arquivo relegível — então descartar os resultados obsoletos e manter o registro da chamada combina melhor do que dobrar tudo em um resumo, e evita a chamada de modelo extra da compactação."
    },
    {
      "id": "c",
      "text": "Não faz diferença — escolha qualquer uma, no fim as duas só liberam espaço da janela.",
      "correct": false,
      "feedback": "Elas resolvem problemas diferentes: a compactação reescreve o histórico da janela inteira em um resumo de alta fidelidade, enquanto a limpeza de resultados de ferramenta só descarta saída de ferramenta obsoleta e rebuscável e mantém o registro da chamada. A fonte específica do inchaço aqui (resultados de ferramenta rebuscáveis) é o que faz a limpeza ser o encaixe mais próximo."
    }
  ]
}
```

## Escolhendo entre os três: um modelo mental

Agora temos dois mecanismos, e adicionar a memória externa que a Lição 3 cobre faz três. O Cookbook dá um modelo mental compacto que organiza a divisão de trabalho deles: "compaction compresses the whole window when it grows too large, clearing drops stale re-fetchable data inside the window, and memory moves information out of the window so it survives across sessions."[^S2] (a compactação comprime a janela inteira quando ela cresce demais, a limpeza descarta dados obsoletos e rebuscáveis dentro da janela, e a memória move informação para fora da janela para que ela sobreviva entre sessões.)

As prioridades e os casos de uso deles não competem — eles são em camadas:

- A **limpeza** de resultados de ferramenta lida com "este conteúdo ainda está na janela mas ficou obsoleto, e descartá-lo é aceitável porque ele pode ser rebuscado" — o mais direcionado, o menos custoso.
- A **compactação** lida com "a janela inteira ficou grande demais", independentemente de onde o conteúdo veio, reescrevendo tudo em um resumo — alcance mais amplo, mas com perdas e custa uma chamada de modelo extra.
- A **memória** (tema da próxima lição) lida com "esta informação não deveria viver só nesta conversa, ela precisa durar até a próxima sessão" — ela não está resolvendo "a janela não cabe tudo" de forma alguma, mas "assim que esta conversa termina, tudo na janela desaparece".

De volta à pergunta com que esta lição abriu: o histórico só cresce porque ninguém o limpa ativamente. Truncagem, compactação e limpeza de resultados de ferramenta são três formas de limpá-lo a custos diferentes e para situações diferentes — qual você escolhe depende do que você quer manter e de quanto está disposto a pagar para mantê-lo.

<!-- exercises -->
## 💻 Exercícios

### Nível 1: Escolha o mecanismo certo para três cenários

Para cada um dos três cenários abaixo, julgue se a truncagem, a compactação ou a limpeza de resultados de ferramenta encaixa melhor, e explique por quê (a razão tem de recair sobre "a fonte específica do inchaço" ou "se você pode se dar ao luxo de perder detalhe" — não apenas "este parece mais adequado").

1. Um agente de revisão de código chama `grep_code` repetidamente para buscar na base de código, cada chamada retornando algumas dezenas de linhas de correspondências. O uso da janela está perto do teto, mas a tarefa de revisão não terminou.
2. Um agente de suporte vem conversando com um usuário por 60 turnos. A janela cresceu no geral, guardando tanto chamadas de ferramenta quanto longos trechos de diálogo entre usuário e agente — o conteúdo vem de todo lado.
3. Um agente assistente de anotações precisa saber, no início de cada nova sessão diária, uma preferência de longo prazo que o usuário mencionou na semana passada ("nada apimentado"). Esta sessão em si mal começou, e a janela não está nem perto de cheia.

<!-- rubric -->
- O Cenário 1 escolhe limpeza de resultados de ferramenta, com uma razão que nomeia o inchaço vindo de conteúdo de retorno de ferramenta rebuscável
- O Cenário 2 escolhe compactação, com uma razão de que o conteúdo vem de todo lado e precisa de uma reescrita completa em vez de limpar uma única fonte
- O Cenário 3 escolhe memória (não truncagem/compactação/limpeza), com uma razão de que o problema de raiz é "sobreviver entre sessões", não "esta janela não cabe tudo"

<!-- answer -->
Resposta de referência: O Cenário 1 deve usar **limpeza de resultados de ferramenta** — quase todo o inchaço vem dos resultados de retorno obsoletos e rebuscáveis do `grep_code`, então limpar os resultados antigos mantendo o registro da chamada deixa você buscar de novo quando precisar, sem nada do custo extra da compactação. O Cenário 2 deve usar **compactação** — o conteúdo vem de todo lado, tanto chamadas de ferramenta quanto diálogo longo, então não é um problema de fonte única; você precisa reescrever a janela inteira em um resumo de alta fidelidade para liberar espaço mantendo o fio geral. O Cenário 3 não é algo que truncagem, compactação ou limpeza de resultados de ferramenta consigam resolver — a janela desta sessão não está nem perto de cheia, e o problema real é que "a preferência mencionada na semana passada é simplesmente invisível para esta sessão". Esse é o problema de "sobreviver entre sessões" que a **memória** resolve, não um problema de "esta janela não cabe tudo", e é assunto para a próxima lição cobrir em detalhe.

<!-- hint -->
Comece se perguntando: neste cenário, o problema é "a janela desta conversa está prestes a ficar sem espaço" ou "a informação não consegue passar da conversa anterior para esta"? Esses dois tipos de problema pedem soluções completamente diferentes.

<!-- hint -->
Relembre o modelo mental da seção "Escolhendo entre os três" — a limpeza mira dados obsoletos e rebuscáveis dentro da janela, a compactação mira uma janela geral grande demais, a memória mira sobreviver entre sessões. Os trabalhos deles não se sobrepõem.

### Nível 2: Diagnostique código que trunca virando bug

O pseudocódigo abaixo tenta limpar o histórico quando o uso da janela fica alto demais, mantendo apenas as mensagens mais recentes:

```javascript
function trimHistory(messages, maxKeep) {
  if (messages.length <= maxKeep) return messages;
  return messages.slice(-maxKeep);
}
```

Suponha que o array `messages` em certo momento está exatamente nesta ordem: `[..., { role: "assistant", content: [bloco tool_use] }, { role: "user", content: [bloco tool_result] }, ...]`, e `maxKeep` por acaso separa essas duas mensagens, mantendo apenas a `tool_result` e cortando a `tool_use`.

Explique que problema isso causa quando enviado ao modelo, e dê uma correção que o evite (não precisa de código completo — só deixe a ideia clara).

<!-- rubric -->
- Aponta que o modelo vê uma mensagem tool_result sem nenhum tool_use correspondente, então a estrutura do protocolo está quebrada
- Declara a consequência: o modelo pode dar erro ou se comportar de forma confusa, não meramente "ter informação incompleta"
- A correção proposta deve garantir que o ponto de corte nunca caia no meio de um par tool_use / tool_result (por exemplo, cortar tendo as "idas e voltas" completas como unidade, não a contagem de mensagens)

<!-- answer -->
Resposta de referência: Cortar assim deixa o modelo com uma mensagem `tool_result` cujo bloco `tool_use` correspondente não é encontrado em lugar nenhum do histórico — o protocolo exige que o `tool_use_id` de todo `tool_result` corresponda a um `tool_use` anterior no histórico, e essa correspondência agora está quebrada, então o modelo dá erro na anomalia estrutural (o erro da documentação é da família "tool_use ids were found without tool_result blocks immediately after")[^S7]. A correção: não corte contando mensagens — corte tendo "uma ida e volta completa" como a menor unidade. Se uma mensagem `assistant` contém um bloco `tool_use`, ela tem de ser mantida ou descartada junto com a mensagem `user` logo depois que carrega o `tool_result` correspondente; você não pode fatiar uma ida e volta ao meio.

<!-- hint -->
Relembre "a ida e volta completa de uma chamada de ferramenta" do curso anterior — `tool_use` e `tool_result` são um par vinculado por `tool_use_id`, e o protocolo espera que eles sempre apareçam juntos.

<!-- hint -->
Em vez de contar "mantenha as últimas N mensagens", inverta a abordagem: primeiro agrupe o histórico em unidades de "uma ida e volta completa", depois decida quantos grupos recentes manter, em vez de fatiar o array de mensagens diretamente.

<!-- /exercises -->

## Recapitulação

- O histórico da conversa só cresce por padrão: as mensagens de cada turno se empilham na janela, os turnos anteriores são mantidos por inteiro, e sem ninguém limpando ativamente, ele sobe sem limite
- A truncagem é a mais simples, mas o que ela descarta é irreversível, e se o ponto de corte cai no meio de um par `tool_use` / `tool_result`, ela quebra a estrutura do protocolo da chamada de ferramenta
- A compactação reescreve o histórico da janela inteira em um resumo de alta fidelidade, disparando por padrão em 150K tokens (o limiar não pode ir abaixo de 50K, imposto pelo servidor), ao custo de ser com perdas e de uma chamada de modelo extra; uma conversa longa pode compactar mais de uma vez, com os blocos de resumo anteriores dobrados no novo resumo[^S2][^S8]
- A limpeza de resultados de ferramenta só descarta saída de ferramenta obsoleta e rebuscável mantendo o registro da chamada, disparando por padrão em 100K tokens e mantendo os resultados das últimas 3 chamadas — mais direcionada que a compactação
- Os três têm trabalhos diferentes: a limpeza lida com dados obsoletos e rebuscáveis, a compactação lida com uma janela geral grande demais, a memória lida com sobreviver entre sessões — qual você escolhe depende da fonte específica do inchaço e de se você pode se dar ao luxo de perder detalhe

[>> Lição 3: Memória externa: arquivos e recuperação](./03-external-memory-files.md)
