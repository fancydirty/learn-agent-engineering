# Lição 3: Cinco tipos comuns de ferramenta: ler, escrever, executar, buscar, chamar

> Objetivos de aprendizado:
> - Classificar as ferramentas comuns em cinco categorias pelo tanto de estrago que podem causar, e nomear a assinatura típica de cada uma
> - Explicar por que ferramentas de execução de comando ficam numa classe de risco diferente das outras quatro
> - Explicar por que ferramentas de busca retornam trechos correspondentes em vez de arquivos inteiros

Pré-requisitos: concluiu a Lição 2, você entende o formato de ida e volta de uma chamada de ferramenta | Anterior: [Lição 2 <<](./02-one-tool-call-round-trip.md) | Próxima: [Lição 4 >>](./04-designing-tool-interfaces.md)

## Comece com uma tabela

| Ferramenta | Entrada típica | O que retorna | Pior caso quando dá errado |
|---|---|---|---|
| Ler arquivo | `path` | Conteúdo do arquivo (string) | Lê um arquivo que não deveria, vaza informação |
| Escrever arquivo | `path`, `content` | Status de sucesso/falha | Sobrescreve um trabalho que alguém ainda não salvou |
| Executar comando | `command` | stdout/stderr/código de saída | Apaga um banco de dados, envia requisições, instala um pacote envenenado — irreversível |
| Buscar | `query`, `path` | Lista de locais de correspondência + trechos | Retorna tanto que estoura o contexto, ou perde o resultado principal |
| Chamar API externa | Parâmetros estruturados (variam por serviço) | Objeto JSON/de erro | Gasta o dinheiro de alguém, envia a mensagem errada, obtém dados desatualizados |

O que ordena esta tabela? Não é o alfabeto. É “que amplitude de dano uma única chamada consegue causar” — o **raio de impacto** dessa chamada. Uma ferramenta somente de leitura tem raio de impacto próximo de zero: ler o arquivo errado só descarrila este turno da conversa. Escrever um arquivo pode sobrescrever conteúdo existente. Executar um comando pode fazer absolutamente qualquer coisa com o sistema inteiro. Ao percorrermos cada categoria, você vai ver que, além do “o que ela consegue fazer”, cada uma carrega uma armadilha em que só aquela categoria tropeça.

## Ler: a mais segura, mas não de risco zero

Uma ferramenta de leitura de arquivo costuma ter uma assinatura assim:

```json
{
  "name": "read_file",
  "input_schema": {
    "type": "object",
    "properties": {
      "path": { "type": "string", "description": "Caminho absoluto do arquivo" },
      "offset": { "type": "integer", "description": "Linha a partir da qual começar a leitura (opcional)" },
      "limit": { "type": "integer", "description": "Número máximo de linhas a ler (opcional)" }
    },
    "required": ["path"]
  }
}
```

O valor de retorno é o próprio conteúdo do arquivo, normalmente com números de linha para que o modelo consiga referenciá-las depois:

```
1  export function add(a, b) {
2    return a + b;
3  }
```

Ler um arquivo não muda estado nenhum. Se o modelo ler a coisa errada, ou ler demais, o pior desfecho é algum conteúdo irrelevante neste único turno — e o modelo tende a perceber que leu errado e ler de novo. É por isso que ela é chamada de a categoria “mais segura”: não que não tenha risco, mas que o risco não consegue escapar dos limites desta conversa.

O risco de verdade é **ler um arquivo em que jamais se deveria ter tocado**. Se o agente tem permissão para ler `~/.ssh/id_rsa` ou o `.env` do projeto, um inocente “me mostre o que tem neste diretório” pode erguer uma chave secreta na íntegra para dentro do contexto da conversa. Daí em diante, o vazamento já aconteceu no momento em que esse contexto é emitido pelo modelo, escrito num log, ou levado para fora por alguma ferramenta posterior de “chamar API externa”. É por isso que ferramentas de leitura de arquivo quase sempre vêm acompanhadas de uma lista de permissões de caminhos ou de um sandbox, em vez de “é só leitura, pode entregar as chaves”. A Lição 5 cobre em detalhe como estabelecer esse tipo de fronteira.

## Escrever: onde as consequências deixam de ser simétricas

Uma ferramenta de escrita de arquivo tem um parâmetro a mais que a de leitura, e um tanto a menos de segurança:

```json
{
  "name": "write_file",
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

O valor de retorno costuma ser simples, apenas um status:

```json
{ "success": true, "bytesWritten": 842 }
```

O problema não é o valor de retorno, é a chamada em si. Se uma leitura dá errado, você lê de novo e nada mudou. Se uma escrita dá errado — digamos que o modelo preencha o `path` errado, ou que o `content` esteja faltando metade do que deveria —, o conteúdo original do arquivo já foi sobrescrito e não pode ser recuperado, a não ser que haja controle de versão ou backup. Esta é a “assimetria entre ferramentas de leitura e ferramentas de escrita”: os dois formatos de chamada parecem quase idênticos (um `path` mais um par de parâmetros), mas uma pode ser repetida à vontade e a outra aposta a cada chamada.

Por isso uma ferramenta de escrita responsável acrescenta uma camada de proteção — por exemplo, exigir que o arquivo tenha sido lido antes de poder ser editado (para impedir o modelo de editar de memória), ou retornar um diff entre o conteúdo antigo e o novo em vez de um mero “sucesso”, para que quem chama (o aplicativo host) tenha a chance de mostrar a mudança antes que ela de fato chegue ao disco. Isso não é o foco aqui; a Lição 4 abre esses pontos quando trata de projeto de interface.

## Executar: uma classe de risco só dela

A ferramenta de execução de comando tem a assinatura de aparência mais simples das cinco:

```json
{
  "name": "bash",
  "input_schema": {
    "type": "object",
    "properties": {
      "command": { "type": "string", "description": "O comando de shell a executar" }
    },
    "required": ["command"]
  }
}
```

Entra uma string; saem stdout, stderr e um código de saída:

```json
{
  "stdout": "3 files changed, 12 insertions(+)\n",
  "stderr": "",
  "exit_code": 0
}
```

O detalhe é que esse campo `command` é essencialmente um ponto de entrada aberto — ele não é uma operação específica e delimitada por um schema como “apague este arquivo” ou “leia esta linha”, é um script de shell arbitrário. `rm -rf`, um `curl` que despacha dados para um servidor externo, um `npm install` que puxa um pacote envenenado — tudo isso cabe dentro daquela única string. As outras quatro categorias (ler, escrever, buscar, chamar API), por mais que você projete as assinaturas delas, são limitadas no que podem fazer pela sua estrutura de parâmetros. A fronteira de capacidade de uma ferramenta de execução de comando é a fronteira de capacidade do sistema operacional inteiro. É por isso que ela fica numa classe só dela: não “um pouco mais arriscada”, mas uma ordem de magnitude diferente de risco.

Exatamente por essa razão, a documentação oficial projeta isolamento em nível de sistema operacional especificamente para esta categoria: acesso ao sistema de arquivos e acesso à rede são duas camadas separadas de sandbox, e mesmo que o modelo seja conduzido por uma injeção de prompt e insista em rodar um comando perigoso, a fronteira do SO se sustenta de qualquer forma — ela não depende de o modelo “querer” cooperar[^S16]. A motivação declarada é direta: a meta é que mesmo uma injeção de prompt bem-sucedida fique inteiramente contida e não consiga escapar do sandbox[^S17]. A Lição 5 cobre como configurar esse isolamento; por ora, guarde uma coisa: onde quer que a assinatura de “executar comando” apareça, trate-a por padrão como a categoria, entre as cinco, que mais precisa de restrição extra.

```agentmentor-check
{
  "id": "tool-zh-03-blast-radius",
  "label": "Decidir qual categoria de ferramenta tem o maior raio de impacto",
  "prompt": "Um agente está ligado a duas ferramentas ao mesmo tempo: read_file (lê qualquer arquivo por caminho) e bash (roda qualquer comando de shell, recebendo uma única string command). Se as duas ferramentas estão expostas à mesma fonte de entrada não confiável (digamos, texto oculto em uma página web), qual ferramenta tem o maior potencial de dano, e por quê?",
  "whyHere": "Acabamos de cobrir as assinaturas e os riscos das categorias de leitura e de execução, então isto verifica se o aprendiz de fato entendeu que o raio de impacto não se julga pelo quanto o nome de uma ferramenta soa perigoso, mas por a entrada dela estar ou não delimitada por um schema",
  "mode": "single",
  "choices": [
    {
      "id": "a",
      "text": "Mais ou menos o mesmo, porque ler o conteúdo de um arquivo sensível já conta como vazar um segredo, e um vazamento é tão danoso quanto qualquer coisa que o bash consiga fazer",
      "correct": false,
      "feedback": "Um vazamento é um risco real, mas o caminho dele tem um passo a mais — o conteúdo precisa primeiro ser lido, e depois levado embora por algum outro canal. O parâmetro command do bash é ele próprio um script executável: um único comando consegue ler um arquivo, fazer uma requisição de rede e apagar dados de uma vez, sem precisar de uma segunda ferramenta. Os dois níveis de risco não estão na mesma ordem de magnitude."
    },
    {
      "id": "b",
      "text": "O bash é maior, porque command é uma string aberta, não delimitada por nenhum schema, então o alcance dele é igual ao do sistema operacional inteiro",
      "correct": true,
      "feedback": "Correto. O parâmetro path do read_file só permite ao modelo escolher qual arquivo ler; o que ele consegue fazer está fixado pela estrutura de parâmetros. O parâmetro command do bash não tem esse limite — ele é um script de shell arbitrário, e apagar, curl e instalação de pacotes cabem todos dentro dele. É por isso que ferramentas de execução de comando normalmente precisam de um sandbox em nível de SO como último recurso, e não só de regras de permissão[^S16]."
    }
  ]
}
```

## Buscar: retorna localizações, não o mundo inteiro

Uma ferramenta de busca (digamos, uma que encontra uma palavra-chave ou regex em uma base de código) costuma carregar na assinatura um parâmetro de “limite quanto volta”:

```json
{
  "name": "search_code",
  "input_schema": {
    "type": "object",
    "properties": {
      "pattern": { "type": "string" },
      "path": { "type": "string", "description": "Restringe a busca a um diretório (opcional)" },
      "max_results": { "type": "integer", "default": 20 }
    },
    "required": ["pattern"]
  }
}
```

O valor de retorno não são os arquivos em si, é “onde está a correspondência e como é o contexto ao redor”:

```json
{
  "matches": [
    { "file": "src/auth/login.ts", "line": 42, "snippet": "  if (!user.verified) {" },
    { "file": "src/auth/session.ts", "line": 17, "snippet": "export function verifyToken(token) {" }
  ],
  "total_matches": 2
}
```

Se essa ferramenta simplesmente enfiasse de volta o conteúdo completo de cada arquivo correspondente, dois problemas apareceriam. O primeiro é um problema de tokens: uma busca atinge 50 arquivos, cada um com algumas centenas de linhas, tudo despejado no contexto — e essa única chamada de ferramenta comeu o orçamento de entrada do turno inteiro, sem deixar nada com que o modelo continue trabalhando[^S9]. Escrever descrições de ferramenta e controlar os limites de entrada e saída é, por si só, um requisito básico para tornar uma ferramenta utilizável[^S8]. O segundo problema importa mais: o objetivo da busca não é “ler tudo o que possa ser relevante”, é “ajudar o modelo a descobrir onde olhar em seguida”. Retorne os locais das correspondências mais um trecho curto de contexto, e o modelo lê esses trechos e julga por conta própria — “destes resultados, o segundo parece ser o que eu procuro, deixa eu ler o conteúdo completo daquele arquivo separadamente”. É assim que uma ferramenta de busca e uma de leitura trabalham juntas: a busca estreita o alcance, a leitura traz o detalhe. Retornar “locais de correspondência” em vez de “arquivos inteiros” é exatamente a pista de continuidade de que o modelo precisa, em vez de um despejo único de tudo o que possa ser útil.

## Chamar API externa: a falha é a norma, não a exceção

As quatro primeiras categorias em geral ficam dentro do sistema local. Chamar uma API externa é diferente — atravessa a rede, até um serviço que você não controla:

```json
{
  "name": "send_slack_message",
  "input_schema": {
    "type": "object",
    "properties": {
      "channel": { "type": "string" },
      "text": { "type": "string" }
    },
    "required": ["channel", "text"]
  }
}
```

Um retorno normal fica assim:

```json
{ "ok": true, "ts": "1735689600.000200" }
```

Mas um serviço externo vai te limitar por rate limit, dar timeout, rejeitar uma requisição por falta de permissão e mudar a própria interface no intervalo entre as suas chamadas. Isso não são “situações inesperadas”, são as condições normais de operação desta categoria. O que de fato decide se a ferramenta presta não é “o que ela retorna quando está tudo bem”, é “o que ela retorna quando as coisas falham”:

```json
{ "ok": false, "error": "rate_limited", "retry_after": 30 }
```

Essa mensagem de erro não é para você, é para o modelo — se ele deve tentar de novo ou trocar de estratégia em seguida depende de ele conseguir ler aquele campo `error`. A especificação do MCP escreve isso direto no protocolo: os clientes devem fornecer os erros de execução de ferramenta aos modelos de linguagem para que o modelo tenha a chance de se autocorrigir e tentar de novo[^S11]. Em outras palavras, uma ferramenta que engole silenciosamente um 429 e não retorna nada além de “a chamada falhou” está roubando do modelo a chance de se corrigir; uma ferramenta que traz de volta um detalhe concreto como `retry_after` é a que projeta a “falha” como parte normal do fluxo de trabalho.

A categoria de chamar API externa também arrasta consigo mais uma camada de risco: se este agente consegue ler dados privados ao mesmo tempo em que está exposto a conteúdo não confiável (um trecho de texto da web que um usuário colou, digamos) e também consegue enviar mensagens ou requisições para fora, esses três juntos são o que a pesquisa de segurança chama de “lethal trifecta” (a trinca letal) — o atacante não precisa invadir o seu sistema, ele só esconde uma instrução em um conteúdo que o agente vai ler e deixa o próprio agente carregar os dados privados para fora[^S19]. A Lição 5 abre este tema separadamente; por ora, saiba disto: chamar uma API externa é o último e mais crítico elo dessa corrente, porque é a saída pela qual os dados de fato deixam o seu sistema.

<!-- exercises -->
## 💻 Exercícios

### Nível 1: Escolher o valor de retorno de uma ferramenta

Abaixo estão três rascunhos de resultados de chamadas de ferramenta, cada um com um problema. Diga a que categoria de ferramenta o problema pertence (ler/escrever/executar/buscar/chamar API), explique por que o projeto não se encaixa bem, e apresente a mudança que você faria.

1. `search_code` retorna: `{ "content": "<o código-fonte completo de 50 arquivos costurados, 8000 linhas no total>" }`
2. `write_file` retorna: `{ "success": true }` (sem diff, sem informação do conteúdo antigo)
3. `send_email` em caso de falha retorna: `{ "error": "failed" }`

<!-- rubric -->
- Os três problemas mapeiam para uma armadilha coberta nesta lição (a busca não economiza tokens, a ferramenta de escrita não dá como revisar a mudança, a chamada de API não dá detalhe acionável na falha)
- A correção é específica até o nível de campo, não um vago “melhore isso”
- Você consegue dizer “por que o modelo precisa desta informação”, e não apenas “assim é mais adequado”

<!-- answer -->
1. Este é um problema de ferramenta de busca. Enfiar de volta de uma só vez o conteúdo completo de cada arquivo correspondente funde “estreitar o alcance” e “ler o detalhe” em um único passo, e 8000 linhas vão estourar o contexto deste turno. Ela deveria retornar apenas os locais das correspondências e um trecho curto, como `{ "matches": [{ "file": "...", "line": 42, "snippet": "..." }] }`, e, quando o conteúdo completo for necessário, deixar o modelo chamar `read_file` por conta própria.
2. Este é um problema de ferramenta de escrita. Retornar um único booleano não dá a quem chama nenhuma forma de saber o quanto essa sobrescrita mudou nem como era antes, então, se algo der errado, não há nada com que revisar ou reverter. Ela deveria carregar o diff entre o conteúdo antigo e o novo, ou ao menos a contagem de bytes/o hash anterior à mudança, para que os dois possam ser comparados.
3. Este é um problema de chamada de API externa. `"failed"` não diz nada ao modelo sobre o que fazer em seguida — tentar de novo, trocar de destinatário ou reportar ao usuário. Deveria ser algo como `{ "ok": false, "error": "invalid_recipient", "detail": "formato do endereço está errado" }`, um tipo de erro específico que o modelo consiga usar para julgar seu próximo passo.

<!-- hint -->
Volte à tabela desta lição. A coluna “pior caso quando dá errado” de cada categoria é exatamente a armadilha mais típica daquela categoria — case primeiro o problema com uma categoria, e só então pense na correção.

<!-- hint -->
Imagine que você é o modelo que recebeu este valor de retorno, sem nenhum plano de fundo, só este JSON. Você consegue decidir o que fazer em seguida? Se não consegue, falta informação-chave no valor de retorno.

### Nível 2: Escolher os tipos de ferramenta para um cenário novo e projetar uma assinatura

Você precisa montar uma ferramenta para um agente: ele verifica periodicamente o status de remessa de uma API de logística de terceiros e, se o status virar “anômalo”, escreve o código de rastreio e o motivo em um arquivo local `alerts.log`.

Esta tarefa na verdade envolve mais de uma categoria de ferramenta. Escreva:

1. De quais das cinco categorias desta lição ela precisa? Pelo que cada uma é responsável?
2. Escreva um `input_schema` em JSON para a ferramenta de “chamar API externa para consultar o status da remessa”, com ao menos um parâmetro de código de rastreio (a abordagem sistemática de projeto de interface é a próxima lição; aqui só imite o formato de assinatura que apareceu nesta lição)
3. Quando a consulta desta ferramenta falhar (código de rastreio não existe, requisição dá timeout), como deveria ser o valor de retorno?

<!-- rubric -->
- Identifica corretamente ao menos duas categorias (chamar API externa para consultar o status + escrever arquivo para registrar a anomalia; ler arquivo também pode contar, dependendo de como você enquadrar)
- O input_schema inclui os campos básicos `type: object`, `properties`, `required`, com nomenclatura de parâmetros sensata
- O retorno de falha distingue “código de rastreio não existe” de “requisição deu timeout” como dois tipos diferentes de falha, e não um `error` genérico

<!-- answer -->
1. Ao menos duas categorias: chamar API externa (consultar o status logístico) é responsável por obter o status mais recente; escrever arquivo (registrar em alerts.log) é responsável por gravar em disco quando o status for anômalo. Se você também quiser desduplicar (evitar registrar a mesma anomalia duas vezes), pode precisar ainda de ler arquivo para primeiro verificar se o alerts.log já tem um registro para esse código de rastreio.
2. Uma assinatura de referência:

```json
{
  "name": "check_shipment_status",
  "input_schema": {
    "type": "object",
    "properties": {
      "tracking_number": { "type": "string", "description": "Código de rastreio" }
    },
    "required": ["tracking_number"]
  }
}
```

3. Retornos de falha de referência: `{ "ok": false, "error": "not_found", "detail": "código de rastreio não existe" }` e `{ "ok": false, "error": "timeout", "retry_after": 10 }` devem ser dois valores diferentes de `error`. Quando o modelo vê `not_found`, ele deve parar de tentar de novo e reportar ao usuário; só quando vê `timeout` é que deve tentar de novo depois do tempo que o `retry_after` sugere.

<!-- hint -->
Divida primeiro a tarefa nas duas ações “consultar o status” e “registrar a anomalia”, e então confira cada uma contra a tabela desta lição para decidir a que categoria ela pertence.

<!-- hint -->
“Código de rastreio não existe” e “requisição deu timeout” são sinais completamente diferentes para o modelo: um significa desistir de tentar de novo, o outro significa tentar de novo mais tarde. Se o valor de retorno funde os dois no mesmo valor do mesmo campo `error`, o modelo não tem como saber qual movimento fazer.

<!-- /exercises -->

## Recapitulação

- O risco entre as cinco categorias não é distribuído por igual: ler arquivo tem as consequências mais leves, escrever arquivo é onde as coisas começam a ser irreversíveis, o raio de impacto de executar comando é igual ao do sistema operacional inteiro, e buscar e chamar API externa têm cada uma as suas próprias armadilhas
- A diferença central entre ferramentas de leitura e de escrita é **poder ou não repetir com segurança** — leu errado, você lê de novo; escreveu errado, o conteúdo original pode ter ido embora de vez
- Ferramentas de execução de comando precisam de um sandbox em nível de SO como último recurso porque o parâmetro `command` delas é uma string aberta, não delimitada por uma estrutura de schema como acontece com as outras quatro[^S16][^S17]
- Ferramentas de busca retornam locais de correspondência mais trechos em vez de arquivos inteiros, primeiro para economizar tokens, e segundo para separar “localizar” de “ler o detalhe”, entregando ao modelo uma pista que ele pode seguir[^S9]
- Ferramentas de chamada de API externa devem levar a informação de falha (tipo de erro, se pode ser repetida) de volta ao modelo tal como está, em vez de engoli-la — nesta categoria, a falha é a norma, não a exceção[^S11]

Na próxima lição, desmontamos as “assinaturas” dessas cinco categorias: como escrever um bom nome de ferramenta, descrição, schema de parâmetros e valor de retorno, para que o modelo a chame certo já na primeira vez.

[>> Lição 4: Projetando interfaces de ferramentas: nome, descrição, parâmetros, valor de retorno](./04-designing-tool-interfaces.md)
