# Lição 4: Projetando interfaces de ferramentas: nome, descrição, parâmetros, valor de retorno

> Objetivos de aprendizado:
> - Avaliar se a descrição de uma ferramenta dá ao modelo o suficiente para escolher a ferramenta certa e preencher os parâmetros certos
> - Usar enum e required do JSON Schema para fechar o espaço de uso indevido dos parâmetros, e saber quando usar o modo strict para transformar essas restrições em garantias firmes
> - Projetar valores de retorno e mensagens de erro sobre os quais o modelo consiga agir para se corrigir
>
> Pré-requisitos: Você concluiu a Lição 3 e conhece a diferença entre os cinco tipos de ferramenta — ler / escrever / executar / buscar / chamar | Anterior: [Lição 3 <<](./03-tool-types.md) | Próxima: [Lição 5 >>](./05-permissions-and-safety.md)

## Uma ferramenta, duas descrições, dois desfechos

Digamos que sua caixa de ferramentas tenha uma ferramenta de busca em código. Esta é a primeira versão de como ela está registrada:

```json
{
  "name": "search_files",
  "description": "Search files",
  "input_schema": {
    "type": "object",
    "properties": {
      "query": { "type": "string" }
    },
    "required": ["query"]
  }
}
```

O usuário pergunta: "Em qual diretório está o utils.ts?"

Tudo o que o modelo tem para trabalhar são aquelas duas linhas — o nome e a descrição. Ele não tem como saber se `search_files` procura arquivos pelo nome ou procura uma string dentro do conteúdo dos arquivos; a descrição não diz. O modelo escolhe essa ferramenta e passa `utils.ts` como query:

```json
{ "id": "call_1", "name": "search_files", "input": { "query": "utils.ts" } }
```

Se essa ferramenta for na verdade uma busca em texto completo (procurando a string `utils.ts` dentro do conteúdo de cada arquivo), e nenhum arquivo contiver literalmente esses caracteres, o resultado volta vazio. O modelo recebe um resultado vazio e não consegue distinguir se o arquivo não existe ou se a abordagem de busca estava errada, então ele chuta. O chute mais comum é tentar alguns sinônimos e buscar de novo, e seguir recebendo resultados vazios.

Agora troque pela seguinte descrição:

```json
{
  "name": "code_search_grep",
  "description": "Search the contents of source files for lines matching a regular expression, returning file paths and line numbers. Use this to answer 'where in the code does a given variable/function/string appear'. To find files by their name (rather than by content), use the code_search_glob tool instead.",
  "input_schema": {
    "type": "object",
    "properties": {
      "pattern": { "type": "string", "description": "The regular expression to match" },
      "path": { "type": "string", "description": "Directory to start the search from; defaults to the project root" }
    },
    "required": ["pattern"]
  }
}
```

Mesma pergunta, mas desta vez o modelo lê "to find files by their name, use code_search_glob" (para encontrar arquivos pelo nome, use code_search_glob) e muda direto para code_search_glob, que está registrada na mesma caixa de ferramentas, passando o parâmetro certo:

```json
{ "id": "call_1", "name": "code_search_glob", "input": { "pattern": "**/utils.ts" } }
```

Entre as duas chamadas, nada mudou: mesmo modelo, mesmo prompt, nenhuma alteração em qualquer código de implementação. A única diferença são aquelas poucas linhas que o modelo consegue ler na definição da ferramenta — um nome mais preciso, uma descrição que explicita a fronteira e nomeia a ferramenta alternativa, e parâmetros com suas próprias descrições. É disso que trata esta lição: cada campo de uma interface de ferramenta é a única coisa com que o modelo conta para raciocinar quando toma uma decisão.

## A descrição é tudo o que o modelo vê ao escolher uma ferramenta

Quem desenvolve tende a escrever ferramentas do jeito que escreve comentários de API: dê à função um nome significativo, ponha a lógica no corpo e deixe que quem precisar leia o código-fonte. Esse hábito desanda nas definições de ferramenta — **o modelo não lê o seu código de implementação**. Tudo o que ele consegue ver são os campos name, description e input_schema[^S3]; qual ferramenta escolher e quais parâmetros passar dependem inteiramente daquelas poucas linhas.

A exigência oficial para uma descrição é direta: ela deve ser "A detailed plaintext description of what the tool does, when it should be used, and how it behaves."[^S3] (uma descrição detalhada, em texto simples, do que a ferramenta faz, quando deve ser usada e como se comporta). Deixe de fora qualquer um desses três e o modelo terá que adivinhar. Deixe de fora "o que ela faz" e o modelo pode pular a ferramenta por completo e tomar um caminho mais longo para forjar o resultado. Deixe de fora "quando usá-la" e, quando a caixa de ferramentas tiver várias ferramentas parecidas (digamos, um grep e um glob), o modelo não consegue distinguir onde está a fronteira, e as chances de escolher errado sobem junto com o número de ferramentas. Deixe de fora "como ela se comporta" e o modelo não sabe que formato de resultado vai receber de volta, então não consegue escrever a lógica seguinte correta para interpretar esse resultado.

Uma boa descrição deve "Avoid ambiguity by clearly describing (and enforcing with strict data models) expected inputs and outputs."[^S8] (evitar ambiguidade descrevendo claramente — e impondo com modelos de dados estritos — as entradas e saídas esperadas) em vez de buscar um fraseado elegante. A descrição de `code_search_grep` da seção anterior funciona porque faz duas coisas: deixa claro que ela busca conteúdo, não nomes de arquivo, e nomeia `code_search_glob` como a ferramenta para encontrar arquivos pelo nome. Essas duas frases permitem que o modelo escolha entre ferramentas parecidas sem tentativa e erro.

```agentmentor-check
{
  "id": "tool-zh-04-description-audience",
  "label": "Para quem a descrição é escrita",
  "prompt": "Um colega acha que escrever a descrição em detalhe é desnecessário, com o seguinte raciocínio: 'esse texto está aí na verdade para quem mantém o código entender a lógica, e o modelo por acaso também lê, então não há por que se preocupar com a redação.' Como você responde?",
  "whyHere": "O exemplo de abertura já mostrou duas descrições levando o modelo a escolher a ferramenta errada versus a certa; aqui verificamos se quem aprende entende quem é de fato o leitor do campo description e que papel ele cumpre no caminho da decisão, em vez de tratá-lo como um comentário de código comum",
  "mode": "single",
  "choices": [
    {
      "id": "a",
      "text": "A descrição é principalmente um comentário para quem mantiver esse código depois; o modelo só por acaso a lê no caminho",
      "correct": false,
      "feedback": "É o contrário. Quando o modelo escolhe uma ferramenta e preenche parâmetros, tudo o que ele consegue ver são os campos name, description e input_schema — ele não vê o código de implementação, muito menos os comentários dentro dele. A descrição não é uma narração que o modelo lê ‘por acaso’; ela é toda a base da decisão do modelo. Anotações para um colega pertencem aos comentários de código ou à documentação, que são coisa separada deste campo."
    },
    {
      "id": "b",
      "text": "A descrição é o único texto que o modelo lê ao decidir se chama essa ferramenta e o que passar; ele não consegue ver o código de implementação",
      "correct": true,
      "feedback": "Correto. É também por isso que, no exemplo de abertura, trocar uma descrição na mesma ferramenta virou o modelo de escolher a ferramenta errada para escolher a certa — sem mudar de modelo, sem mudar a implementação, apenas o texto que o modelo conseguia ler."
    },
    {
      "id": "c",
      "text": "A descrição serve principalmente para economizar tokens, então quanto mais curta melhor; deixe o modelo adivinhar como usá-la a partir do system prompt",
      "correct": false,
      "feedback": "Direção errada. Uma descrição vaga não economiza tokens — ela faz o modelo tentar e errar entre várias ferramentas parecidas, receber resultados vazios e repetir, e essas idas e voltas fracassadas custam muito mais tokens do que algumas frases claras. O custo em tokens realmente importa quando a contagem de ferramentas fica alta o bastante, mas isso se resolve enxugando a quantidade e a granularidade das ferramentas, e não escrevendo de forma vaga a explicação de cada uma."
    }
  ]
}
```

## Os nomes também devem sinalizar a origem: namespacing

O trabalho da descrição é explicitar o que a ferramenta faz; o trabalho do nome é outro — ele deve impedir que a ferramenta seja confundida com outra numa caixa de ferramentas lotada. Assim que você tem muitas ferramentas, especialmente depois de conectar vários serviços externos, nomes como `list_prs`, `send_message`, `create_issue` são nomes que qualquer um poderia escolher, e o nome sozinho não diz a qual serviço eles pertencem.

A recomendação oficial é prefixar os nomes das ferramentas com o serviço: "When your tools span multiple services or resources, prefix names with the service (e.g., github_list_prs, slack_send_message). This makes tool selection unambiguous as your library grows, and is especially important when using tool search."[^S10] (quando suas ferramentas abrangem vários serviços ou recursos, prefixe os nomes com o serviço; isso torna a seleção de ferramentas inequívoca conforme sua biblioteca cresce, e é especialmente importante quando se usa busca de ferramentas). Quando o modelo precisa escolher uma ferramenta entre dezenas, um nome prefixado estreita o campo logo de cara, de modo que ele pode descartar a maior parte das opções sem abrir cada descrição para compará-las linha a linha. Os cinco tipos de ferramenta da Lição 3 (ler, escrever, executar, buscar, chamar) se beneficiam do mesmo jeito se cada um for sustentado por um serviço diferente: `fs_read_file` e `db_read_row` obviamente não são a mesma coisa à primeira vista, ao passo que um `read` solto embaralha os dois.

## input_schema: fixe o formato dos parâmetros

A descrição decide se o modelo vai escolher esta ferramenta; o input_schema decide se ele consegue preencher os parâmetros corretamente[^S3]. Eis algo fácil de deixar passar: no JSON Schema, nem todo campo está "restringindo" um parâmetro — alguns campos apenas o "descrevem".

Adicionar uma description a um parâmetro apenas declara a intenção; isso não vai rejeitar nenhuma entrada que não corresponda ao que a frase diz[^S14]:

```json
{
  "file_type": {
    "type": "string",
    "description": "Limits the search to a file type, e.g. typescript"
  }
}
```

O modelo pode passar `"typescript"`, pode passar `"ts"`, pode passar `"TypeScript files"` — a description é só uma sugestão, e nada o impede de passar algo arbitrário. O que de fato barra valores arbitrários é o enum:

```json
{
  "file_type": {
    "type": "string",
    "enum": ["js", "ts", "py", "all"],
    "description": "Limits the search to a file type"
  }
}
```

Com o enum no lugar, os valores válidos estão listados explicitamente, o modelo quase sempre preenche um deles, e as chances de um valor arbitrário caem bruscamente. Mas atenção: isso é uma orientação forte para o modelo, não uma garantia firme da plataforma. No modo padrão, a API não valida os parâmetros contra o schema por você, e o modelo ainda vai ocasionalmente produzir entradas com tipos errados ou faltando campos obrigatórios[^S20], então as verificações de valores inválidos na implementação da sua ferramenta continuam necessárias. O mesmo vale para required: se uma ferramenta de "escrever arquivo" não marcar `path` como required, o modelo vai ocasionalmente omiti-lo, e a implementação então tem que ou lançar erro ou adivinhar um caminho padrão, e nenhum dos dois é bom. Marcar `path` como required derruba bastante as chances desse tipo de uso indevido — e ter o "required" de fato imposto pela plataforma depende do modo strict da próxima seção.

**Guarde essa distinção**: type, enum e required são restrições de verdade em termos de validação, ao passo que title e description são apenas anotações para o modelo — por mais detalhadas que sejam, não constituem uma regra de validação[^S14]. Quando você projeta um input_schema, pergunte primeiro: as "entradas que não deveriam aparecer" neste parâmetro podem ser bloqueadas de saída com enum ou required, em vez de apenas escrever "por favor, passe xxx" na description? Como elevar essas restrições de "escritas no schema" para "impostas pela plataforma" é o assunto da próxima seção.

## Transformando restrições brandas em garantias firmes: additionalProperties: false e o modo strict

A seção anterior insistiu na diferença entre "restringir" e "descrever", mas há outra camada a manter clara: escrever uma restrição no schema e os parâmetros produzidos pelo modelo de fato passarem na validação ainda são duas coisas diferentes. No modo padrão, a API não vai interceptar por você uma chamada que não corresponda ao schema — o modelo vai ocasionalmente escrever um número como a string `"2"`, ou simplesmente deixar de fora um campo obrigatório[^S20].

Há também uma direção mais sutil: o modelo pode inventar campos do nada. Digamos que o schema de uma ferramenta de criação de tíquetes declare apenas dois parâmetros, `title` e `priority`, mas uma das chamadas volte com:

```json
{ "title": "Login page returns 500", "priority": "high", "skip_review": true }
```

Aquela chave `skip_review` nunca esteve em properties no schema; o modelo a inventou por conta própria. O comportamento padrão do JSON Schema é justamente permitir que um objeto carregue chaves extras não declaradas — e se a implementação da sua ferramenta por acaso repassar toda a entrada para um sistema a jusante, e o código lá adiante realmente tiver um ramo verificando esse nome de campo, uma única alucinação do modelo contorna em silêncio uma etapa de revisão que deveria ter acontecido. Adicionar `"additionalProperties": false` no topo do input_schema escreve "somente chaves declaradas são permitidas" também nas regras de validação.

Para que a plataforma de fato imponha tudo isso, adicione o campo de nível superior `"strict": true` à definição da ferramenta. O modo strict funciona restringindo a própria amostragem do modelo: "Setting strict: true on a tool definition guarantees Claude's tool inputs match your JSON Schema by constraining the model's token sampling to schema-valid outputs (a technique called grammar-constrained sampling)."[^S20] (definir strict: true garante que as entradas de ferramenta do Claude correspondam ao seu JSON Schema, restringindo a amostragem de tokens do modelo a saídas válidas segundo o schema — técnica chamada amostragem restrita por gramática). Type, enum, required e additionalProperties passam todos a ser honrados, e parâmetros inválidos simplesmente nunca chegam a ser gerados. Na documentação oficial, os schemas de exemplo do modo strict também trazem todos `additionalProperties: false` — os dois foram feitos para serem usados juntos. Só a partir desse ponto é que "valores inválidos são descartados antes mesmo de a requisição ser enviada" vale de verdade; para uma ferramenta sem o modo strict ligado, você não pode dispensar uma única linha de validação de parâmetros no lado da implementação.

## Valores de retorno: entregue ao modelo o que ele pode usar em seguida, não um log para humanos

Quando uma ferramenta termina, seu resultado é embrulhado num bloco tool_result e devolvido ao modelo. Os campos centrais são `tool_use_id` (a qual chamada isto se refere), `content` (o resultado) e `is_error` (se falhou)[^S5]. Desses três, o que mais costuma ser mal escrito é o content em caso de falha.

Digamos que uma ferramenta de "escrever arquivo" falhe porque o diretório não existe. Duas formas de escrever isso:

```json
{
  "tool_use_id": "call_1",
  "content": "Error: ENOENT: no such file or directory, open '/reports/q3.csv'",
  "is_error": true
}
```

Isso joga o log do sistema de volta cru. O modelo consegue perceber que falhou, mas não consegue perceber o que fazer em seguida — o resultado comum é o modelo repetir exatamente a mesma chamada, bater no mesmo erro pela segunda vez e cair num laço.

```json
{
  "tool_use_id": "call_1",
  "content": "Write failed: the directory /reports does not exist. Create it first with fs_create_dir, or switch to a path under a directory that already exists.",
  "is_error": true
}
```

Mesma falha, mas esta versão diz três coisas ao modelo: qual foi a falha, qual ferramenta ele pode chamar para corrigi-la e qual outro caminho está disponível. A especificação do MCP é explícita: "Clients SHOULD provide tool execution errors to language models to enable self-correction."[^S11] (os clientes DEVERIAM fornecer erros de execução de ferramentas aos modelos de linguagem para permitir a autocorreção) — com a condição de que essa mensagem em si carregue as pistas necessárias para corrigir, e não um rastro de pilha que só quem está depurando o código consegue ler.

## Quantidade e granularidade de ferramentas: mais não é melhor

Uma caixa de ferramentas maior não é uma caixa melhor. Toda definição de ferramenta (name, description e input_schema somados) tem que ser empacotada no contexto antes de a conversa começar, e quando você tem muitas ferramentas, essa sobrecarga cresce rápido. A equipe de engenharia da Anthropic deu um número: "That's 58 tools consuming approximately 55K tokens before the conversation even starts." — isto é, tanto contexto queimado antes de a conversa realmente começar. Internamente eles também já viram casos mais extremos: "At Anthropic, we've seen tool definitions consume 134K tokens before optimization."[^S9] (na Anthropic, já vimos definições de ferramentas consumirem 134 mil tokens antes da otimização). Quanto mais lotado o contexto, menos espaço sobra para o modelo raciocinar sobre a tarefa de verdade.

O segundo problema que vem junto com uma contagem alta de ferramentas nada tem a ver com tokens: escolher fica mais difícil. Empilhe várias ferramentas com funções parecidas e o modelo terá que gastar um passo a mais só com "qual delas eu uso", com as chances de errar subindo junto com a quantidade de ferramentas — "More tools don't always lead to better outcomes."[^S8] (mais ferramentas nem sempre levam a melhores resultados). É também por isso que as seções anteriores insistiram que uma descrição precisa explicitar a fronteira.

O caminho inverso — granularidade grossa demais — também não funciona. Uma ferramenta de "operações com arquivos" que enfia ler, escrever, excluir e editar num único input_schema e distingue o comportamento com um parâmetro `action` obriga o modelo a primeiro adivinhar o valor certo de `action` e depois adivinhar quais parâmetros preencher — mais propenso a erro do que dividir em ferramentas de responsabilidade única como `fs_read_file` e `fs_write_file`. O meio-termo prático: primeiro divida as ferramentas seguindo os cinco tipos da Lição 3 e depois, conforme a quantidade cresce, controle as chances de escolha errada com namespacing e descrições precisas — em vez de empilhar uma ferramenta faz-tudo para manter a contagem baixa.

<!-- exercises -->
## 💻 Exercícios

### Nível 1: Reescrever uma definição de ferramenta vaga

Um projeto tem uma ferramenta de "escrever arquivo", atualmente definida assim:

```json
{
  "name": "write_file",
  "description": "Write a file",
  "input_schema": {
    "type": "object",
    "properties": {
      "path": { "type": "string" },
      "content": { "type": "string" }
    },
    "required": ["path", "content"]
  }
}
```

A caixa de ferramentas também tem uma ferramenta `edit_file` que faz uma coisa só: fazer substituições locais dentro de um arquivo existente. O modelo frequentemente chama `write_file` quando deveria chamar `edit_file` para uma pequena alteração, sobrescrevendo o arquivo inteiro.

Reescreva a description e o input_schema de `write_file` de modo que:

1. A description deixe claro que essa ferramenta **sobrescreve todo** o conteúdo do arquivo, e aponte `edit_file` para alterações locais
2. O input_schema acrescente um parâmetro restrito por enum que distinga "criar quando o arquivo não existe" de "sobrescrever quando o arquivo já existe", para que o modelo não sobrescreva por acidente um arquivo em que não deveria mexer
3. Verificação: se o modelo receber "mude o número da porta no config.json para 8080", ele ainda recorreria a `write_file`?

<!-- rubric -->
- A description declara explicitamente o comportamento de "sobrescrever o arquivo inteiro" e nomeia edit_file como alternativa para alterações locais
- O input_schema tem um parâmetro restrito por enum que distingue criar de sobrescrever
- Você consegue explicar por que essa mudança reduz as chances de "chamar write_file quando edit_file era a escolha certa"

<!-- answer -->
Uma versão de referência:

```json
{
  "name": "write_file",
  "description": "Create a new file, or overwrite the entire contents of an existing file. If you only need to change a small part of a file (e.g. one config value, one line of code), use edit_file to make a local replacement instead — don't use this tool to overwrite the whole file.",
  "input_schema": {
    "type": "object",
    "properties": {
      "path": { "type": "string", "description": "Path of the target file" },
      "content": { "type": "string", "description": "The complete file contents to write" },
      "mode": {
        "type": "string",
        "enum": ["create_new", "overwrite_existing"],
        "description": "create_new: the file must not exist, otherwise error; overwrite_existing: allow overwriting a file that already exists"
      }
    },
    "required": ["path", "content", "mode"]
  }
}
```

Mudanças-chave: a description explicita "sobrescrever o arquivo inteiro" e "use edit_file no lugar", de modo que, quando o modelo vir um pedido de alteração local como "mude o número da porta", ele vai considerar edit_file primeiro. O enum de mode força o modelo a declarar de antemão se isto é uma criação ou uma sobrescrita, então, mesmo que ele ainda escolha write_file, não vai sobrescrever um arquivo existente sem se dar conta.

<!-- hint -->
Volte ao exemplo de abertura: ele resolve o "escolheu a ferramenta errada" nomeando a ferramenta alternativa diretamente na descrição. Este exercício é o mesmo padrão, apenas trocado para write_file e edit_file.

<!-- hint -->
Em qual parâmetro o enum entra depende do que você quer que o modelo pense antes de chamar. Aqui é "esta operação é mesmo para sobrescrever um arquivo existente", então o enum deve restringir isso, e não um parâmetro sem relação como tipo de arquivo.

### Nível 2: Diagnosticar uma chamada que falhou por causa de um valor de retorno ruim

Abaixo está um registro de ida e volta simplificado, mas real. Uma ferramenta de "rodar testes" foi chamada 3 vezes seguidas, com entradas idênticas a cada vez:

```
Chamada 1: { "name": "run_tests", "input": { "suite": "unit" } }
Retorna: { "content": "Error: connect ECONNREFUSED 127.0.0.1:5432", "is_error": true }

Chamada 2: { "name": "run_tests", "input": { "suite": "unit" } }
Retorna: { "content": "Error: connect ECONNREFUSED 127.0.0.1:5432", "is_error": true }

Chamada 3: { "name": "run_tests", "input": { "suite": "unit" } }
Retorna: { "content": "Error: connect ECONNREFUSED 127.0.0.1:5432", "is_error": true }
```

Responda:

1. Por que o modelo repete a chamada 3 vezes com parâmetros idênticos em vez de tentar algo diferente?
2. O que o modelo precisa fazer para resolver a causa real (a conexão com o banco de dados foi recusada; nada está escutando na porta 5432)? Suponha que a caixa de ferramentas também tenha uma ferramenta `start_service`.
3. Reescreva o campo `content` em uma mensagem de erro que faria o modelo mudar para a abordagem certa antes da segunda chamada.

<!-- rubric -->
- Aponta que a mensagem de erro original é apenas um log cru sem nenhuma pista sobre "o que fazer em seguida", então o modelo só consegue repetir a tentativa
- Conecta corretamente a causa raiz (um serviço do qual se depende não está rodando) à ferramenta disponível (start_service)
- A mensagem reescrita inclui o motivo da falha, a ação sugerida e o nome específico da ferramenta a chamar

<!-- answer -->
1. O valor de retorno original apenas repassa cru o log subjacente (`ECONNREFUSED 127.0.0.1:5432`), e `is_error: true` só diz ao modelo "isto falhou" — não por que falhou nem o que fazer em seguida. O modelo só pode supor que é um problema transitório e tentar de novo com os mesmos parâmetros. É exatamente isso que o "fornecer mensagens de erro acionáveis ao modelo" da especificação do MCP pretende evitar: sem informação acionável não há autocorreção, apenas repetição.

2. A porta 5432 é a porta padrão do PostgreSQL, e `ECONNREFUSED` significa que o serviço de banco de dados do qual os testes dependem não está rodando. O modelo precisa primeiro chamar `start_service` (suponha que ela aceite um nome de serviço, por exemplo `postgres`), confirmar que subiu e então chamar `run_tests` de novo.

3. Uma versão de referência:

```json
{
  "content": "Test run failed: can't connect to the local database service (nothing responding on port 5432); the postgres service the tests depend on is not currently running. Call start_service to start the postgres service first, confirm it started, then call run_tests again.",
  "is_error": true
}
```

<!-- hint -->
Escreva primeiro em separado "o que o modelo viu" e "o que o modelo deveria fazer" — o log cru só responde à primeira metade.

<!-- hint -->
Uma boa mensagem de erro deve ler-se como uma resposta a "qual ferramenta eu chamo em seguida, e o que eu passo", e não como uma anotação de depuração para uma pessoa engenheira.

<!-- /exercises -->

## Recapitulação

- A description é o único texto que o modelo vê ao escolher uma ferramenta e preencher parâmetros; explicitar "o que ela faz, quando usá-la, quando não usá-la" importa mais do que escrevê-la com elegância
- Acrescentar um prefixo de serviço (namespacing) ao nome ajuda o modelo a descartar de saída um grande lote de opções irrelevantes, quando há muitas ferramentas
- No input_schema, type, enum e required são restrições de verdade em termos de validação, enquanto title e description são apenas anotações; enum somado a required derruba bastante as chances de valores arbitrários, e transformar "entradas inválidas simplesmente nunca são geradas" em garantia firme exige additionalProperties: false somado ao modo strict[^S20]
- Valores de retorno — especialmente em caso de falha — precisam explicitar "por que falhou" e "o que fazer em seguida", para que o modelo se autocorrija em vez de repetir a chamada tal e qual
- Mais ferramentas não é melhor: as definições consomem tokens de contexto, e quanto mais parecidas as ferramentas, mais fácil é o modelo escolher errado; a granularidade também não é "quanto mais fina, melhor" — divida por função primeiro e depois controle as chances de escolha errada com nomes e descrições claros

[>> Lição 5: Permissões e segurança: os limites do que um agente pode fazer](./05-permissions-and-safety.md)
