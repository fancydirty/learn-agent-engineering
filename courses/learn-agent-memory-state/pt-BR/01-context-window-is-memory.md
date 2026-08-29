# Lição 1: A janela de contexto é toda a memória que um agente tem

> Objetivos de aprendizado:
> - Explicar por que "o agente lembra da nossa conversa anterior" é uma ilusão
> - Nomear o que conta para a janela de contexto de uma única requisição e o que não conta
> - Explicar o que é context rot, e por que uma janela maior não é automaticamente melhor de usar
> - Julgar se uma chamada de API é sem estado, e o que isso significa para a memória
>
> Pré-requisitos: os quatro primeiros cursos desta série, incluindo o protocolo de ida e volta das chamadas de ferramenta de Tool calling de agentes: fazendo agentes agirem de verdade | Próxima: [Lição 2 >>](./02-managing-conversation-history.md)

## Uma conversa que parece lembrar

Você está conversando com um agente de suporte ao cliente:

```text
Usuário: Meu nome é Sarah, número do pedido ORD-2026-8842.
Agente: Entendido, Sarah. Deixe-me verificar o ORD-2026-8842 ... ele saiu para entrega, previsto para amanhã.
Usuário: E aquele que comprei da última vez?
Agente: Você quer dizer o ORD-2026-8842? Aquele chega amanhã — se está perguntando sobre um pedido diferente, poderia me passar o número do pedido?
```

No segundo turno o agente claramente "lembra" que seu nome é Sarah e lembra que você perguntou sobre o ORD-2026-8842. Parece que ele arquivou esses detalhes em algum lugar e consegue recuperá-los na próxima vez.

A verdade é bem mais simples. A cada requisição, o seu código reempacota **cada mensagem desde o início da conversa até agora** e envia ao modelo como está.[^S6] O modelo não está vendo "eu lembro que seu nome é Sarah" — ele está relendo "o usuário disse: meu nome é Sarah" do zero, toda e cada vez. Cada frase do turno anterior, cada chamada de ferramenta, tem de ser colocada na requisição deste turno pelo seu próprio código. O modelo não armazena nada por conta própria.

## A chamada de API é sem estado

Colocando de forma ainda mais direta: entre uma chamada e a próxima, nada é discretamente guardado para você no servidor. Uma vez que esta requisição é processada, esses tokens somem da visão do modelo. Se a próxima requisição não carregar nada, o modelo vê uma folha em branco — ele nem sabe o seu nome.

A razão de parecer memória é que o aplicativo host faz o trabalho braçal por você: ele reenvia o array completo de mensagens do histórico. Isso não é uma capacidade do modelo; é um array no seu código que continua crescendo. Essa propriedade tem um nome — **sem estado** (stateless). Nas palavras da documentação oficial: "The Messages API is stateless, which means that you always send the full conversational history to the API."[^S6] (A Messages API é sem estado, o que significa que você sempre envia todo o histórico da conversa para a API.) O servidor não mantém nenhum estado privado por sessão entre requisições; toda "memória" tem de ser carregada e reenviada pelo próprio cliente.

## O que de fato está na janela de contexto

Tudo o que o modelo consegue ver mora em um contêiner chamado **janela de contexto**. A documentação é explícita de que tudo em uma requisição conta: "Everything in the request counts toward the context window: the system prompt, every message in messages (including tool results, images, and documents), and your tool definitions. The output Claude generates for the turn, including its extended thinking, counts too."[^S1] (Tudo na requisição conta para a janela de contexto: o system prompt, cada mensagem em messages (incluindo resultados de ferramentas, imagens e documentos) e as suas definições de ferramentas. A saída que o Claude gera no turno, incluindo o raciocínio estendido, também conta.)

```json
{
  "model": "claude-sonnet-5",
  "system": "Você é um assistente de suporte ao cliente ...",
  "tools": [ { "name": "get_order_status", "...": "..." } ],
  "messages": [
    { "role": "user", "content": "Meu nome é Sarah, número do pedido ORD-2026-8842." },
    { "role": "assistant", "content": "Entendido, Sarah ..." },
    { "role": "user", "content": "E aquele que comprei da última vez?" }
  ]
}
```

Nesta requisição, `system`, `tools` e todas as três mensagens no array `messages` contam para a janela de contexto. Uma vez que a resposta do modelo é gerada, esses tokens de saída também contam para o uso da janela deste mesmo turno. A resposta traz um **campo `usage`** que informa quantos tokens de entrada e de saída o turno de fato consumiu: "Every response reports what the request consumed in its `usage` field."[^S1] (Toda resposta relata o que a requisição consumiu no seu campo `usage`.)

Qualquer coisa não empacotada nesta requisição — digamos, um registro de pedido parado em um banco de dados que nenhuma ferramenta consultou ainda — não faz parte da janela de contexto. O modelo não consegue vê-la e não pode saber que ela existe do nada. É por isso que "memória" tem de ser ativamente carregada para dentro desta requisição por algum mecanismo; ela não é automaticamente alcançável.

```agentmentor-check
{
  "id": "mem-zh-01-stateless-check",
  "label": "Descubra o que o modelo consegue ver na próxima requisição",
  "prompt": "No primeiro turno o usuário disse ao agente “meu nome é Sarah”, e o agente respondeu normalmente. Se o array messages da segunda requisição contém apenas o que o usuário acabou de dizer neste turno, e não as duas mensagens do primeiro turno, o modelo ainda vai lembrar que o nome do usuário é Sarah?",
  "whyHere": "Você acabou de aprender que a chamada de API é sem estado e que o histórico tem de ser reenviado pelo cliente. Isto verifica se quem aprende ainda carrega o instinto residual de que “o modelo armazenou a conversa por conta própria”, em vez de captar que, se o histórico não for empacotado nesta requisição, o modelo simplesmente não consegue vê-lo.",
  "mode": "single",
  "choices": [
    {
      "id": "a",
      "text": "Sim, porque o modelo já armazenou esse detalhe na própria memória enquanto tratava o primeiro turno",
      "correct": false,
      "feedback": "Não. A chamada de API é sem estado — nenhum estado do lado do servidor é compartilhado entre uma chamada e a próxima. Uma vez que o primeiro turno é processado, esses tokens deixam de ser visíveis ao modelo. Não existe isso de “o modelo lembrar por conta própria”."
    },
    {
      "id": "b",
      "text": "Não, porque a janela de contexto só guarda o que é de fato enviado nesta requisição, então o histórico que não foi empacotado não existe para o modelo",
      "correct": true,
      "feedback": "Correto. A janela de contexto guarda o que esta requisição de fato carrega — o system prompt, o array messages, as definições de ferramentas. Se as duas mensagens do primeiro turno não foram colocadas nas messages do segundo turno, o modelo vê uma folha em branco, e o nome “Sarah” nunca apareceu para ele."
    },
    {
      "id": "c",
      "text": "Sim, porque as mensagens de histórico sob o mesmo ID de usuário são vinculadas automaticamente pelo servidor",
      "correct": false,
      "feedback": "Não existe essa vinculação automática. Se o contexto atravessa ou não requisições depende inteiramente de o cliente ter colocado as mensagens de histórico de volta no array messages e as enviado de novo — não tem nada a ver com um ID de usuário."
    }
  ]
}
```

## A janela apodrece — maior não é melhor

Há um teto para quanto a janela guarda — a capacidade varia por modelo, e o número oficial chega até 1 milhão de tokens: "The context window (up to 1M tokens, depending on the model) holds the conversation history plus the new output Claude generates."[^S1] (A janela de contexto (até 1M de tokens, dependendo do modelo) guarda o histórico da conversa mais a nova saída que o Claude gera.) Mas isso não significa que você deva enchê-la o máximo possível. A documentação nomeia um fenômeno específico, **context rot**: "As token count grows, accuracy and recall degrade, a phenomenon known as *context rot*. This makes curating what's in context just as important as how much space is available."[^S1] (Conforme a contagem de tokens cresce, a acurácia e a recuperação se degradam, um fenômeno conhecido como *context rot*. Isso torna curar o que está no contexto tão importante quanto o espaço que há disponível.) Em outras palavras, quanto mais conteúdo a janela guarda e mais desorganizada ela fica, pior o modelo se torna em extrair dela a resposta certa — o que faz *o que* você coloca no contexto importar tanto quanto o espaço que sobra.[^S1]

Isso molda o design de memória diretamente: despejar todo o histórico no contexto não é de graça (enche a capacidade da janela), e também não é sem custo (faz o modelo trabalhar mais para achar a única frase que de fato é relevante agora, enterrada em uma pilha de informação obsoleta). A Lição 2 cobre como lidar com esse **acúmulo** na prática — como truncar o histórico, como resumi-lo, em vez de deixá-lo crescer sem limite.

## A palavra "memória" é, na verdade, uma metáfora

De volta àquela conversa de suporte do início. Quando dizemos "o agente lembra que seu nome é Sarah", a forma precisa de colocar é: o seu código reenviou o histórico completo — aquele contendo "meu nome é Sarah" — ao modelo como está, mais uma vez, e o modelo o releu dentro desta requisição. Sem armazenamento, sem recuperação, apenas um **reenvio**.

Isso não é implicância com detalhes. Entender que "memória é uma ilusão produzida pelo reenvio" molda diretamente como você projeta um agente que de fato "lembra":

- Se o array de histórico cresce sem limite, a janela enche cedo ou tarde, e você ainda pega context rot por cima — o problema que a Lição 2 resolve.
- Se alguma informação precisa persistir por **múltiplas sessões** (não só dentro desta conversa), você não pode contar com enfiá-la no array messages; ela tem de ser escrita em algum lugar externo — a memória externa que a Lição 3 cobre.
- Se o agente precisa saber "quão longe eu já cheguei" no meio de uma tarefa, esse progresso também tem de ser **estado estruturado** visível na janela de contexto, não algo que o modelo adivinha — o assunto da Lição 4.

Os três fios são corolários diferentes do mesmo fato: o modelo sabe apenas o que está na janela; o que não está na janela não existe no que diz respeito ao modelo.

<!-- exercises -->
## 💻 Exercícios

### Nível 1: Marque o que conta para a janela de contexto

Abaixo está uma requisição real enviada ao modelo (simplificada), mais três coisas que "também existem" mas **não** aparecem nesta requisição:

```json
{
  "model": "claude-sonnet-5",
  "system": "Você é um assistente de pedidos.",
  "tools": [ { "name": "get_order_status", "input_schema": { "...": "..." } } ],
  "messages": [
    { "role": "user", "content": "Consulte o ORD-2026-8842 para mim" }
  ]
}
```

As três coisas extras que existem:

1. O conteúdo real do registro do pedido ORD-2026-8842 no banco de dados (nunca consultado por nenhuma ferramenta ainda)
2. Um endereço de entrega que o mesmo usuário mencionou na semana passada, em uma sessão com um agente diferente
3. O texto de resposta que o modelo gera depois que esta requisição é processada

Para cada um, decida: destes quatro tipos de conteúdo (`system` / `tools` / a mensagem do usuário em `messages` / os três itens extras acima), quais contam para a janela de contexto desta requisição e quais não, com uma frase de justificativa em cada.

<!-- rubric -->
- Identifica corretamente que `system`, `tools` e a mensagem do usuário em `messages` todos contam para a janela de contexto
- Identifica corretamente que o registro do pedido e o endereço de entrega da semana passada não contam agora, porque não foram colocados nesta requisição
- Identifica corretamente que o texto de resposta gerado pelo modelo conta para o uso da janela **deste turno**, mesmo sendo produzido depois que a requisição é processada

<!-- answer -->
Resposta de referência: `system`, `tools` e a mensagem do usuário em `messages` estão todos nesta requisição, então os três contam para a janela de contexto. O registro do pedido no banco de dados e o endereço de entrega mencionado na semana passada não aparecem em nenhum campo desta requisição, então agora eles não existem para o modelo e não contam para a janela — a menos que alguma ferramenta mais tarde consulte o registro do pedido e o empacote em `messages` como um `tool_result`, momento em que ele conta para a janela de algum turno posterior. O texto de resposta que o modelo gera neste turno também conta para o uso da janela deste turno, porque a saída do modelo é, ela mesma, parte da janela.

<!-- hint -->
Só há um teste: a coisa de fato apareceu na requisição JSON enviada ao modelo? Se não apareceu, ela não conta, por mais "objetivamente real" que seja no banco de dados.

<!-- hint -->
A saída do modelo é fácil de esquecer — ela é "gerada", mas o ato de gerar consome capacidade da janela também, e o campo `usage` da resposta contabiliza isso.

### Nível 2: Encontre a suposição errada nesta descrição

Um colega descreve um agente que está projetando assim: "Nossa conversa já está com 20 turnos, e o banco de dados armazena o histórico completo, então mesmo que a requisição deste turno só envie a última frase do usuário, o modelo consegue tocar a conversa, porque o servidor sabe que é a mesma sessão."

Aponte a suposição errada nesta descrição e explique em que cenário ela quebra se de fato fosse construída assim.

<!-- rubric -->
- Identifica claramente que o erro é supor que o servidor vincula automaticamente as mensagens de histórico da mesma sessão
- Explica que a chamada de API é sem estado, e o modelo só vê o conteúdo de `messages` que esta requisição de fato carrega
- Dá um cenário concreto de "quebra aqui", como o modelo de repente "esquecer", responder fora do assunto ou dar erro

<!-- answer -->
Resposta de referência: a suposição errada é "o servidor sabe que é a mesma sessão" — acreditar que, se o banco de dados armazena o histórico, o modelo consegue vê-lo automaticamente. Na realidade a chamada de API é sem estado, e o modelo só consegue ver o que o array `messages` carrega nesta única requisição. Se o banco de dados armazena o histórico e se o modelo consegue vê-lo neste turno são duas coisas separadas; no meio, o cliente tem de colocar ativamente as mensagens de histórico de volta na requisição. Construído assim, a 21ª requisição envia apenas "e aquele que comprei da última vez", e o modelo vê uma pergunta isolada sem contexto algum — ele muito provavelmente vai responder fora do assunto ou perguntar de volta "qual pedido você quer dizer", parecendo que o agente de repente "perdeu a memória". Mas ele nunca "esqueceu"; ele simplesmente nunca "viu".

<!-- hint -->
Pergunte a si mesmo: o histórico "armazenado" no banco de dados é a mesma coisa que o histórico "incluído" na requisição JSON enviada ao modelo desta vez?

<!-- hint -->
Relembre a seção "A chamada de API é sem estado" desta lição — o servidor não mantém nenhum estado privado por sessão entre requisições, o que é um golpe fatal na suposição errada deste problema.

<!-- /exercises -->

## Recapitulação

- "O agente lembra da nossa conversa anterior" é uma ilusão: a verdade é que o aplicativo host reempacota o histórico completo em cada requisição, e o modelo não armazena nada por conta própria[^S6]
- A chamada de API é sem estado; o servidor não mantém nenhum estado privado por sessão entre requisições, então toda "memória" tem de ser ativamente carregada pelo cliente[^S6]
- A janela de contexto guarda tudo o que esta requisição de fato carrega: o system prompt, cada mensagem em `messages` (incluindo resultados de ferramentas, imagens, documentos), as definições de ferramentas e a própria saída do modelo no turno[^S1]
- A janela tem um teto de tamanho, e maior não é automaticamente melhor de usar — context rot significa que quanto mais tokens você empilha, mais a acurácia e a recuperação se degradam[^S1]
- Captar que "o modelo sabe apenas o que está na janela" leva direto aos problemas que as próximas três lições resolvem: como gerenciar o histórico, como externalizar a memória, como estruturar o estado

[Lição 2: Gerenciando o histórico da conversa: acrescentar, truncar, resumir >>](./02-managing-conversation-history.md)
