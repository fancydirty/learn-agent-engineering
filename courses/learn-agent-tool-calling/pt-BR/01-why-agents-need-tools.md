# Lição 1: De “só conversar” a “agir de verdade”: por que agentes precisam de ferramentas

> Objetivos de aprendizado:
> - Dizer o que uma “ferramenta” realmente é dentro de um agente, e como ela difere de um bloco comum de texto de resposta
> - Reconhecer as três coisas que uma definição de ferramenta precisa incluir no mínimo
> - Decidir se uma determinada tarefa de fato precisa de uma ferramenta
>
> Pré-requisitos: Você sabe escrever um prompt básico e já usou algo como o Claude Code | Próxima: [Lição 2 >>](./02-one-tool-call-round-trip.md)

## A mesma frase, perguntada duas vezes

Você está em um projeto com algumas dezenas de arquivos e diz isto a um agente:

> “Encontre todos os console.log do projeto.”

**Na primeira vez, esse agente é só uma caixa de chat ligada a uma API, sem nenhuma ferramenta conectada.** A resposta dele sai assim:

> Não consigo acessar seu sistema de arquivos diretamente, mas você pode rodar o seguinte comando no seu terminal para encontrá-los:
>
> ```
> grep -rn "console.log" src/
> ```
>
> Isso busca recursivamente, em todos os arquivos dentro de `src/`, as linhas que contêm `console.log` e imprime o nome do arquivo e o número da linha. Se o seu projeto usa TypeScript, lembre-se de incluir `.ts`/`.tsx` no escopo da busca.

Nada de errado com isso — até é atencioso. Mas você não pediu instruções de como buscar, você pediu os resultados. Quando esse turno termina, você ainda não sabe quais arquivos do seu projeto de fato contêm `console.log`. Você tem que ir abrir um terminal e digitar aquele comando por conta própria.

**Na segunda vez, a mesma frase, entregue a um agente com uma ferramenta de busca conectada.** A resposta dele sai assim:

> Busquei no projeto e encontrei 7 ocorrências de `console.log`:
>
> - `src/api/client.ts:42`
> - `src/api/client.ts:88`
> - `src/utils/logger.ts:12`
> - `src/components/Cart.tsx:156`
> - `src/components/Checkout.tsx:23`
> - `src/hooks/useAuth.ts:67`
> - `scripts/seed-db.js:5`
>
> A de `src/utils/logger.ts:12` parece ser um wrapper de logging intencional; as outras 6 parecem sobras de depuração. Quer que eu limpe essas?

Nas duas vezes a pergunta foi exatamente a mesma, palavra por palavra. Mesmo modelo, mesmo prompt. Uma coisa era diferente: na segunda vez, esse agente tinha uma coisa a mais em mãos — uma **ferramenta**. Na primeira vez ele só podia chutar, a partir do conhecimento que viu no treinamento, um comando que “provavelmente resolve” e descrevê-lo para você. Na segunda vez ele de fato rodou uma busca, viu o que existe no seu projeto agora, e só então falou.

O que esta lição deixa claro é exatamente isso: o que é uma ferramenta, o que faz um agente sair de “falar sobre uma abordagem” para “de fato rodar a busca”, e quais tarefas não precisam de ferramenta nenhuma.

## Uma ferramenta é um cardápio que o host entrega ao modelo

Primeiro, corrija um instinto: aquilo que encontrou os 7 arquivos não foi o modelo. O modelo não tem sistema de arquivos; ele não consegue abrir um diretório nem rodar uma correspondência de regex por conta própria. O que de fato executou aquela busca foi o **programa host** que roda o agente — talvez o Claude Code, talvez um script de algumas dezenas de linhas que você escreveu chamando a API do Claude.

**Uma ferramenta é a lista com que o programa host diz ao modelo “aqui estão as coisas que eu posso fazer por você”.** Cada item especifica três coisas: como a capacidade se chama, quando usá-la e quais parâmetros passar. [^S3]

Pegue aquela busca. A lista de ferramentas que o host enfia na requisição fica mais ou menos assim:

```json
{
  "name": "search_files",
  "description": "Busca no diretório de código-fonte do projeto todos os arquivos que correspondem a uma string ou expressão regular, retornando o caminho do arquivo e o número da linha de cada correspondência. Use isto para encontrar chamadas de função específicas, nomes de variáveis, comentários TODO e coisas do tipo.",
  "input_schema": {
    "type": "object",
    "properties": {
      "pattern": {
        "type": "string",
        "description": "A string ou expressão regular a buscar, por exemplo console\\.log"
      },
      "path": {
        "type": "string",
        "description": "O diretório a partir do qual começar a busca; o padrão é a raiz do projeto"
      }
    },
    "required": ["pattern"]
  }
}
```

Cada um dos três campos tem sua própria função: `name` é o identificador que o modelo escreve quando escolhe esta ferramenta; `description` é um bloco de texto que diz ao modelo o que a ferramenta faz, quando ela deve ser usada e como ela se comporta; `input_schema` é um JSON Schema que especifica quais parâmetros passar numa chamada e qual é o tipo de cada um. [^S3]

O modelo nunca viu o seu sistema de arquivos, mas viu esta lista. Ele lê na `description` que esta ferramenta “busca no diretório de código-fonte do projeto ... retorna o caminho do arquivo e o número da linha”, vê o seu pedido “encontre todos os console.log do projeto”, alinha os dois e decide escolher esta ferramenta e passar `pattern` igual a `console\.log`. Este passo é o trabalho do modelo — escolher a ferramenta, preencher os parâmetros —, que é justamente aquilo em que um modelo de linguagem é melhor: ler a intenção e casá-la com a opção certa.

Mas depois de escolhida? Quem de fato vai lá e lê os arquivos?

## O modelo apenas propõe; o host faz o trabalho

Aqui vai uma frase, a mais importante desta lição: **o modelo nunca executa nada por conta própria. Ele apenas empacota “qual ferramenta eu quero chamar e quais parâmetros passar” num pedaço de dados estruturados e devolve isso ao programa host; o código que de fato abre arquivos, roda comandos e envia requisições é do próprio programa host.** [^S4]

Para aquela busca, a sequência completa é assim:

1. O modelo vê a sua pergunta e a lista de ferramentas com `search_files`, e decide chamá-la com `{"pattern": "console\\.log"}`. Ele embrulha essa decisão como o conteúdo da resposta deste turno — repare que não há nenhum resultado de busca na resposta, porque o modelo não tem resultado de busca nenhum; ele só fez um pedido.
2. O programa host (o Claude Code, ou o script que você escreveu) recebe esses dados, vê que “isto é uma chamada de ferramenta” e vai executá-la ele mesmo — roda de fato a busca em disco e obtém aquelas 7 correspondências.
3. O programa host coloca os resultados da busca de volta no histórico da conversa e pergunta ao modelo mais uma vez: “aqui está o resultado daquela chamada, pode continuar”.
4. Só agora o modelo vê os resultados reais da busca pela primeira vez, e a partir deles escreve a resposta que você viu.

A documentação da OpenAI chama isso de "a multi-step conversation between your application and a model" (uma conversa de múltiplos passos entre a sua aplicação e um modelo): quando o modelo chama uma função, a responsabilidade de executá-la e retornar o resultado fica do lado da sua aplicação, não do modelo. [^S1] A Anthropic é ainda mais direta: "The model never executes anything on its own. It emits a structured request, your code (or Anthropic's servers) runs the operation, and the result flows back into the conversation." [^S4]

Vale acrescentar: o “quem executa” se divide mais uma camada. A documentação chama as ferramentas que o seu próprio programa precisa rodar de “client tools”, e aquelas que os servidores da própria Anthropic rodam por você (busca na web, por exemplo) de “server tools”. [^S2] De um jeito ou de outro, o comportamento do lado do modelo não muda — ele continua apenas propondo, nunca agindo; a única diferença é quem transforma a proposta em ação real.

O Claude Code, que você está usando, torna isso concreto: ele é exatamente esse tipo de programa host, com um conjunto embutido de ferramentas — ler um arquivo, escrever um arquivo, rodar um comando no terminal, buscar código e assim por diante. Toda vez que o modelo decide qual delas usar, ele está escolhendo desta lista fixa, não inventando uma capacidade nova do nada. [^S6] De onde vem essa lista e como é cada item dela, vamos ver um a um na Lição 3.

```agentmentor-check
{
  "id": "tool-zh-01-who-runs-it",
  "label": "Quem de fato executou aquela busca",
  "prompt": "De volta ao exemplo do console.log do começo. Na segunda resposta, o agente diz “Busquei no projeto e encontrei 7 ocorrências.” Por trás dessa frase, quem executou a “busca”?",
  "whyHere": "Você acabou de traçar a linha entre “o modelo apenas propõe, o host executa”, e a resposta do agente está escrita em primeira pessoa, o que facilita supor que o próprio modelo leu os arquivos. Este é o momento de quebrar esse equívoco com exatamente o mesmo exemplo.",
  "mode": "single",
  "choices": [
    {
      "id": "a",
      "text": "O próprio modelo leu os arquivos do projeto e executou a busca",
      "correct": false,
      "feedback": "O modelo não tem sistema de arquivos; ele não consegue abrir um diretório nem rodar uma correspondência de regex por conta própria. Tudo o que ele fez foi decidir chamar a ferramenta search_files e preencher pattern como console\\.log, e essa decisão foi empacotada em dados estruturados e devolvida ao programa host. “Busquei” é a formulação que o modelo produziu depois de ver os resultados — não significa que foi o modelo que buscou."
    },
    {
      "id": "b",
      "text": "O programa host executou a busca, devolveu os resultados ao modelo, e só então o modelo escreveu aquela resposta",
      "correct": true,
      "feedback": "Correto. O modelo apenas fez o pedido “chame search_files, pattern é console\\.log”; o programa host (o Claude Code, ou o script que chama a API) é que de fato abriu o sistema de arquivos e rodou a correspondência. Depois que o host colocou as 7 ocorrências de volta na conversa, o modelo as viu pela primeira vez e escreveu a resposta final a partir delas."
    },
    {
      "id": "c",
      "text": "Nas duas vezes foi o próprio modelo; na segunda ele só respondeu de um jeito mais inteligente",
      "correct": false,
      "feedback": "Os dois turnos usaram o mesmo modelo, e a capacidade dele não mudou. A diferença é que na segunda vez ele tinha uma ferramenta, o que permitiu ao programa host ir tocar no conteúdo real do seu projeto por ele. Isso não é o modelo ficando mais inteligente — é o modelo ganhando um canal para buscar informação de fora e agir do lado de fora."
    }
  ]
}
```

## Nem toda tarefa precisa de ferramenta

Depois de ver esse processo, é fácil pular para o outro extremo: já que ferramentas são tão úteis, por que não dar uma ferramenta ao agente para tudo? Não faça isso. O teste é simples — faça a si mesmo uma pergunta: **o modelo já tem em mãos a informação ou a ação que esta tarefa exige?**

Algumas tarefas o modelo dá conta sozinho, sem nenhum contato com o mundo externo:

- Reescrever um trecho de modo mais conciso
- Resumir um conjunto de anotações de reunião
- Traduzir um pedaço de Python para JavaScript com a mesma lógica
- Escrever um trecho de código novo direto de um requisito que você descreveu (antes de tocar em qualquer arquivo existente do seu projeto)

Essas tarefas dependem de um conhecimento de que o modelo viu bastante exemplo parecido durante o treinamento; só a habilidade de linguagem já as conclui. Force uma ferramenta nesse tipo de tarefa e o modelo ainda vai ter que decidir, a cada vez, “chamo ou não chamo nesta rodada” — uma decisão a mais é uma chance a mais de errar. Desperdício puro.

Outras tarefas o modelo não consegue fazer por mais esperto que seja, porque o que falta não é habilidade — é **informação**:

- “Quantos console.log tem no meu projeto agora” — o conhecimento do modelo para no momento do treinamento; ele não sabe nada sobre o conteúdo dos arquivos no seu disco neste instante
- “O que aquele comando acabou de imprimir” — o comando não rodou, a saída ainda não existe, e o modelo não tem como saber isso de antemão
- “O que este endpoint retorna agora” — essa é a resposta que o servidor dá neste momento, sem relação com qualquer exemplo que o modelo tenha visto no treinamento

Para esse tipo de tarefa, por mais detalhado ou indutivo que você faça o prompt, o modelo não consegue conjurar uma resposta real, porque ele simplesmente não tem os dados em mãos. O único caminho é dar a ele um canal para que o programa host vá buscá-los — e essa é a razão de as ferramentas existirem.

Esses cinco tipos de ferramenta — ler, escrever, rodar comandos, buscar, chamar serviços externos — vamos desmontar um a um na Lição 3; para esta lição, tudo o que você precisa guardar é como fazer a pergunta “isto precisa de ferramenta?”.

<!-- exercises -->
## 💻 Exercícios

### Nível 1: Classificar seis tarefas

Abaixo estão seis tarefas. Para cada uma, decida se o agente precisa de uma ferramenta para de fato concluí-la, e explique por quê (dica: pergunte-se “o modelo tem esta informação em mãos?”).

1. “Traduza este e-mail em inglês para o português, e mantenha o tom cordial.”
2. “Verifique se os logs do deploy das 3h da manhã de ontem têm algum erro.”
3. “Escreva uma expressão regular que valide o formato de e-mail.”
4. “Verifique de qual versão do React este repositório depende no `package.json`.”
5. “Quebre este documento de requisitos em 5 critérios de aceite.”
6. “Chame a API de clima e veja se vai chover amanhã em Pequim.”

<!-- rubric -->
- As seis tarefas recebem um veredito claro de “precisa” ou “não precisa”
- Todo veredito vem com uma razão, não só com a decisão
- Nos casos de “precisa”, fica claro qual informação ou capacidade de ação falta ao modelo

<!-- answer -->
1. Não precisa. Tradução e ajuste de tom são pura habilidade de linguagem; o modelo já tem tudo o que é necessário para fazer isso.
2. Precisa. O conteúdo do arquivo de log é um dado real deste momento, que o modelo não teria como ter visto no treinamento; ele tem que lê-lo com uma ferramenta.
3. Não precisa. Escrever uma regex é uma tarefa de linguagem / geração de código da qual o modelo viu bastante exemplo; nenhum estado externo atual está envolvido.
4. Precisa. O número exato de versão escrito no `package.json` agora é o conteúdo real do seu projeto neste instante; o modelo tem que ler o arquivo com uma ferramenta para saber.
5. Não precisa. Isto é uma reescrita estruturada de um conteúdo já fornecido; a informação nas mãos do modelo já é suficiente.
6. Precisa. Dado de clima é um estado do mundo real neste momento, e buscá-lo exige uma requisição de rede de verdade; o modelo não consegue gerá-lo do nada.

<!-- hint -->
Quando uma pergunta contém palavras que apontam para um momento específico — “agora”, “acabou de”, “desta vez”, “ontem à noite” —, isso normalmente significa que o que se quer é o estado real de agora, e não o conhecimento geral que o modelo viu no treinamento.

<!-- hint -->
Ao contrário, se a tarefa é só “transformar A em B” (reescrever, traduzir, resumir, gerar conteúdo novo a partir de uma descrição) e A já está inteiramente escrito no que você disse, normalmente não é preciso ferramenta — a matéria-prima nas mãos do modelo basta para ele concluir sozinho.

### Nível 2: Rascunhar uma definição de ferramenta

A tarefa é: “deixar o agente consultar no npmjs.com o número da última versão publicada de um pacote npm”. Seguindo o jeito como a definição da ferramenta `search_files` está escrita nesta lição, rascunhe uma definição de ferramenta para essa capacidade, com pelo menos os três campos `name`, `description` e `input_schema`. Você não precisa produzir um JSON Schema válido e executável — basta pensar bem nos três campos e acertar o formato geral.

<!-- rubric -->
- `name` é um identificador cujo propósito é legível (não algo sem sentido como “tool1”)
- `description` deixa claro o que a ferramenta faz e quando ela deve ser usada
- `input_schema` define ao menos um parâmetro obrigatório (o nome do pacote, digamos), com o tipo e o propósito do parâmetro explicitados

<!-- answer -->
Exemplo de resposta:

```json
{
  "name": "get_npm_package_version",
  "description": "Consulta o número da última versão atualmente publicada no npmjs.com para um dado pacote npm. Use isto para confirmar se há uma versão mais nova de uma dependência disponível, ou para verificar se um dado número de versão de fato existe.",
  "input_schema": {
    "type": "object",
    "properties": {
      "package_name": {
        "type": "string",
        "description": "O nome do pacote npm a consultar, por exemplo react ou lodash"
      }
    },
    "required": ["package_name"]
  }
}
```

<!-- hint -->
A meia-frase que mais facilmente some da `description` é o “quando usar” — só “consulta um número de versão” é vago demais; melhor acrescentar um caso de uso típico para que o modelo consiga julgar se escolhe essa ferramenta desta vez.

<!-- hint -->
No `input_schema`, o nome do pacote tem que ser um parâmetro obrigatório (coloque-o no array `required`), porque sem o nome do pacote a ferramenta nem tem como rodar; se você quiser também um parâmetro opcional (um endereço de registry, digamos), lembre-se de não enfiá-lo no `required` junto.

<!-- /exercises -->

## Recapitulação

- **Uma ferramenta é uma lista de capacidades chamáveis que o programa host expõe ao modelo**, cada uma especificando ao menos `name`, `description` e `input_schema`, que o modelo usa para julgar se deve chamá-la e o que passar. [^S3]
- **O modelo apenas propõe; ele nunca executa por conta própria.** Ele empacota “qual ferramenta chamar, quais parâmetros passar” em dados estruturados e devolve isso ao programa host; o código que de fato abre arquivos, roda comandos e envia requisições é do próprio programa host. [^S1][^S4]
- O resultado exige uma ida e volta: depois que o host termina de executar, ele coloca o resultado de volta na conversa, e só então o modelo vê o resultado real e escreve a resposta final — a ida e volta completa desse passo é o tema da próxima lição.
- Para decidir se uma tarefa precisa de ferramenta, uma pergunta basta: **o modelo já tem em mãos a informação ou a ação que esta tarefa exige?** Se não, você precisa de uma ferramenta; se sim, acrescentar uma é desperdício.
- A mesma pergunta, com ou sem ferramenta, pode produzir resultados radicalmente diferentes — sem ferramenta o agente só consegue se apoiar no conhecimento geral do treinamento para conversar sobre uma abordagem; com ela, consegue de fato tocar em como o seu projeto está agora.

[Lição 2: A ida e volta completa de uma chamada de ferramenta >>](./02-one-tool-call-round-trip.md)
