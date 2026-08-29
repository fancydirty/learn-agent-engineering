# Lição 3: Memória externa: arquivos e recuperação

> Objetivos de aprendizado:
> - Explicar por que a memória que precisa sobreviver entre sessões deve ser escrita fora da janela, em arquivos
> - Distinguir arquivos de memória escritos por humanos, como o CLAUDE.md, de arquivos de memória escritos pelo modelo, como a Auto memory
> - Enunciar o trade-off entre "recuperar sob demanda" e "carregar tudo de antemão"
> - Adicionar uma verificação segura de fronteira de caminho a uma ferramenta que lê e escreve arquivos de memória
>
> Pré-requisitos: concluída a Lição 2, você entende a diferença entre compactação e limpeza de resultados de ferramenta | Anterior: [Lição 2 <<](./02-managing-conversation-history.md) | Próxima: [Lição 4 >>](./04-structured-task-state.md)

## Quando a sessão termina, tudo na janela some

A Lição 2 encerrou com um problema sem solução: um assistente de agendamento a quem um usuário disse na semana passada "eu não como comida apimentada", e nesta semana o usuário abre uma conversa nova com uma janela vazia — e o agente não tem ideia de que essa frase um dia foi dita.

Truncagem, compactação e limpeza de resultados de ferramenta não conseguem consertar isso. Os três lidam com "ficamos sem espaço dentro desta única conversa". O problema aqui é diferente: esta conversa não tinha nada do conteúdo da semana passada desde o primeiríssimo turno. O Cookbook oficial traça a linha sem rodeios — a limpeza e a compactação operam ambas no contexto atual; nenhuma ajuda quando uma nova sessão começa e a janela está vazia. A memória resolve esse problema[^S2]. A janela, como contêiner, só vive enquanto durar esta única sessão. Feche a sessão, e qualquer coisa na janela que não tenha sido movida para outro lugar está de fato perdida.

O único jeito de manter a informação viva além desta sessão é escrevê-la, antes de a sessão terminar, em algum lugar fora da janela — na **memória externa**: armazenamento que não está preso ao ciclo de vida desta conversa, normalmente só um arquivo em disco. Quando a próxima sessão começa, você lê esse arquivo de volta e carrega seu conteúdo na nova janela de contexto.

## CLAUDE.md: escrito por humanos, carregado por inteiro toda vez

O padrão mais direto de memória externa é ter um humano mantendo um **arquivo de memória**, guardado no projeto e lido por inteiro no início de cada sessão. O CLAUDE.md no Claude Code é o caso representativo: a documentação oficial diz que um arquivo CLAUDE.md é carregado na janela de contexto no início de cada sessão, gastando tokens lado a lado com a própria conversa, e a meta de tamanho recomendada é manter cada arquivo abaixo de 200 linhas — quanto mais longo o arquivo, mais contexto ele consome e menor a aderência do agente às instruções.[^S3] Note que 200 linhas é uma recomendação branda; o limite rígido de verdade é 4 MiB: um CLAUDE.md maior que isso é ignorado por completo.[^S3]

```markdown
# CLAUDE.md

## Estilo de código
- Indente com 2 espaços, nunca tabs
- Prefira const; recorra a let só quando você de fato precisar

<!-- Esta nota é para o meu eu futuro. Ela não precisa estar no contexto do agente. -->
## Notas internas
- Pegadinha da última refatoração do módulo de pagamentos: xxx
```

Um detalhe deste arquivo vale a atenção: a documentação oficial explica que **comentários HTML de nível de bloco** no CLAUDE.md são removidos antes de o conteúdo ser injetado no contexto do agente.[^S3] Em outras palavras, o que quer que você escreva dentro de `<!-- -->` é visível quando um humano abre o arquivo, mas a versão que o agente lê não inclui esse comentário — o que dá a um humano uma forma de "deixar um lembrete para mim mesmo sem gastar o orçamento de tokens do agente".

O CLAUDE.md tem outra propriedade que se liga diretamente à compactação da Lição 2: a documentação nota que um CLAUDE.md na raiz do projeto sobrevive à compactação — depois do `/compact`, o Claude o relê do disco e o reinjeta na sessão.[^S3] Em outras palavras, um arquivo assim não é "incidentalmente preservado" pela compactação; ele é relido e reinjetado separadamente — ele não depende em nada de a compactação ter mantido seu conteúdo no resumo.

```agentmentor-check
{
  "id": "mem-zh-03-claudemd-size",
  "label": "Julgue se um arquivo de memória deve crescer sem limite",
  "prompt": "Alguém acha que quanto mais completo o CLAUDE.md, melhor, então enfia ali o documento de requisitos completo do projeto, todo o seu histórico de decisões e uma descrição detalhada de cada módulo — 2000 linhas ao todo. Qual é o problema de fazer isso?",
  "whyHere": "Acabamos de cobrir que o CLAUDE.md carrega por inteiro no início de cada sessão e que 200 linhas é a meta oficial de tamanho. Isto verifica se quem aprende está tratando um arquivo de memória como uma base de conhecimento do tipo “quanto mais completo, melhor”, sem perceber que ele mesmo gasta orçamento de tokens e derruba a aderência às instruções.",
  "mode": "single",
  "choices": [
    {
      "id": "a",
      "text": "Nenhum problema. Quanto mais completo o arquivo de memória, mais contexto o agente tem, e mais precisas ficam as respostas.",
      "correct": false,
      "feedback": "Não exatamente. O CLAUDE.md é carregado por inteiro no início de cada sessão, e 200 linhas é a meta oficial de tamanho — passe disso e você gasta mais contexto e derruba a aderência do agente às instruções. “Lembrar mais” não é o mesmo que “usar bem”, que é exatamente o context rot da Lição 1 aparecendo no cenário específico de um arquivo de memória."
    },
    {
      "id": "b",
      "text": "Sim, há um problema: quanto mais longo o arquivo, mais contexto ele toma, e a documentação diz claramente que arquivos longos derrubam a aderência do agente às instruções.",
      "correct": true,
      "feedback": "Correto. O CLAUDE.md carrega por inteiro a cada sessão, e 200 linhas é a meta oficial de tamanho — quanto mais longo o arquivo, mais contexto ele queima e menor a aderência do agente (o limite rígido de verdade é 4 MiB, e qualquer coisa maior é ignorada por completo). Informação que muda com frequência ou é grande pertence atrás da recuperação sob demanda, não despejada em um arquivo que carrega por inteiro toda e cada vez."
    },
    {
      "id": "c",
      "text": "Nenhum problema. Desde que o conteúdo seja preciso, o tamanho não vai afetar o desempenho do agente.",
      "correct": false,
      "feedback": "O tamanho afeta o desempenho diretamente. O conteúdo do CLAUDE.md carrega no contexto ao lado desta conversa e gasta o mesmo orçamento de tokens. Um arquivo longo demais não está apenas “ocupando espaço” — a documentação diz claramente que ele derruba a aderência do agente às instruções, o que não é um detalhe que dá para ignorar."
    }
  ]
}
```

## Auto memory: escrita pelo modelo, recuperada sob demanda

O CLAUDE.md é escrito por humanos e carregado por inteiro toda vez. Há um padrão complementar: deixar o modelo anotar o que vale a pena lembrar conforme a conversa avança, guardando isso em seus próprios arquivos de memória — o Claude Code chama esse mecanismo de **Auto memory**. Sua divisão de trabalho com o CLAUDE.md é complementar, e uma tabela de comparação coloca a diferença de forma clara: o CLAUDE.md é escrito por você, a Auto memory é escrita pelo Claude.[^S3]

A memória que o próprio modelo escreve costuma se dividir em duas camadas: um arquivo de índice (digamos, `MEMORY.md`) mais uma pilha de arquivos de memória específicos separados por tópico. O arquivo de índice também não é carregado sem limite — a regra que a documentação dá é: no início de cada conversa, apenas as primeiras 200 linhas do `MEMORY.md`, ou os primeiros 25KB, o que vier primeiro, são carregados; conteúdo além desse limiar não é carregado no início da sessão.[^S3]

Isso é a **recuperação sob demanda**: no início de uma sessão o agente vê apenas os resumos das entradas do índice (algo como "as anotações detalhadas sobre este tópico vivem em algum arquivo"), não o conteúdo completo de cada arquivo de memória específico. A documentação é direta a respeito: arquivos de tópico não são carregados na inicialização; o Claude os lê sob demanda com suas ferramentas de arquivo padrão quando precisa da informação[^S3]. Só quando a tarefa atual de fato exige um dado tópico é que o conteúdo daquele arquivo de memória específico é puxado para a janela de contexto desta rodada.

Lado a lado, o CLAUDE.md e a Auto memory tratam duas dimensões diferentes de memória:

- **CLAUDE.md** — regras e convenções curadas por humanos, disciplinadas em tamanho, que se aplicam toda vez; um encaixe para informação estável do tipo "é assim que o projeto deve funcionar", carregada por inteiro de antemão.
- **Auto memory** — detalhes específicos que podem ser grandes em número e só importam para tarefas particulares; um encaixe para recuperação sob demanda, para que o orçamento da janela não seja desperdiçado com memória que esta tarefa não precisa.

Ambas são memória externa. As únicas diferenças são "quem escreve" e "quando é carregada" — o que ecoa o modelo mental da Lição 2: o objetivo da memória é mover informação para fora da janela para que ela sobreviva entre sessões, e se essa informação é carregada por inteiro de antemão ou recuperada sob demanda depende de quão estável ela é e com que frequência é usada.

```agentmentor-check
{
  "id": "mem-zh-03-on-demand-retrieval",
  "label": "Julgue o que a recuperação sob demanda de fato resolve",
  "prompt": "A Auto memory de um agente acumulou 50 arquivos de memória de tópico cobrindo os detalhes de todo tipo de tarefa passada. Se cada sessão começasse carregando o conteúdo completo de todos os 50 de uma vez no contexto, o que dá errado? E que situação é exatamente o que a “recuperação sob demanda” tenta evitar?",
  "whyHere": "Acabamos de cobrir a estrutura de duas camadas de um arquivo de índice mais arquivos de memória específicos. Isto verifica se quem aprende entende a motivação da recuperação sob demanda — não que carregar tudo seja tecnicamente impossível, mas que fazer isso redispara os problemas de capacidade da janela e de context rot das Lições 1 e 2.",
  "mode": "single",
  "choices": [
    {
      "id": "a",
      "text": "Enche a janela rápido, e a maior parte do que é carregado é irrelevante para a tarefa atual, redisparando o context rot — que é exatamente o que a recuperação sob demanda evita.",
      "correct": true,
      "feedback": "Correto. Carregue o conteúdo completo de todos os 50 arquivos e a janela enche rápido, quando esta tarefa provavelmente só está relacionada a um ou dois deles; o resto é ruído que redispara o context rot da Lição 1. A recuperação sob demanda carrega só os resumos do índice primeiro, depois busca o único tópico que a tarefa de fato precisa, para que o orçamento da janela não seja gasto com memória que não vai ser usada."
    },
    {
      "id": "b",
      "text": "Nenhum problema. Os arquivos de memória guardam o que o próprio agente decidiu ser importante, então carregar tudo só deixa as respostas mais completas.",
      "correct": false,
      "feedback": "“O que o agente decidiu ser importante” é um julgamento feito no momento da escrita; não significa que esta tarefa precisa de tudo. Carregar todos os 50 arquivos enche a janela e derruba o desempenho — que é exatamente por que a documentação carrega só as primeiras 200 linhas ou 25KB do MEMORY.md e recupera o resto sob demanda, não um detalhe incidental."
    },
    {
      "id": "c",
      "text": "Nenhum problema, porque os arquivos de memória vivem em disco e não ocupam capacidade da janela de contexto.",
      "correct": false,
      "feedback": "“Viver em disco” e “ser carregado nesta requisição” são duas coisas diferentes. Uma vez carregado, o conteúdo aparece em messages ou no system prompt e conta para a janela de contexto desta requisição do mesmo jeito[^S1] — o outro lado do “o modelo só sabe o que está na janela” da Lição 1. Carregado significa que custa capacidade; não é de graça."
    }
  ]
}
```

## Adicionando uma fronteira segura à leitura e escrita de arquivos de memória

Seja um arquivo escrito por humanos como o CLAUDE.md ou um escrito pelo modelo como a Auto memory, assim que um agente tem uma ferramenta para ler e escrever arquivos de memória, há uma questão concreta de engenharia a encarar: essa ferramenta pode ser convencida a ler ou escrever arquivos fora do diretório do projeto?

Uma verificação de caminho que só faz uma correspondência de prefixo de string parece bloquear pedidos de "escapar do diretório de memória", mas ela tem um buraco clássico. Se a raiz da memória é `/project/memory`, uma verificação ingênua com `startsWith("/project/memory")` também vai deixar passar um caminho como `/project/memory-evil`, porque ele de fato começa com essa string — mesmo que seja um diretório completamente diferente sentado fora da raiz da memória. A forma segura é exigir que o caminho ou seja exatamente igual à raiz, ou comece com "a raiz mais um separador de caminho":

```javascript
const path = require("node:path");
const MEMORY_ROOT = path.resolve("./memory");

async function readMemoryFile({ path: relPath }) {
  const abs = path.resolve(MEMORY_ROOT, relPath);
  const inRoot = abs === MEMORY_ROOT || abs.startsWith(MEMORY_ROOT + path.sep);

  if (!inRoot) {
    return "Recusado: o caminho está fora do diretório de memória, e esta ferramenta não tem permissão para ler arquivos fora dele.";
  }

  const fs = require("node:fs/promises");
  return await fs.readFile(abs, "utf-8");
}
```

A combinação `abs === MEMORY_ROOT || abs.startsWith(MEMORY_ROOT + path.sep)` é o que de fato garante que só um caminho "igual à própria raiz" ou "começando com a raiz mais um separador" passe — `/project/memory-evil` não será confundido com um caminho dentro de `/project/memory`, porque ele não satisfaz nenhuma das duas condições. Esse padrão é reutilizado diretamente na Lição 6, quando construímos as ferramentas de leitura/escrita para uma camada de memória persistente, e a Lição 5 vai deixar claro que tipo de alvo de ataque um arquivo de memória vira se essa verificação de fronteira for banguela.

<!-- exercises -->
## 💻 Exercícios

### Nível 1: Escolha a casa de memória certa para uma anotação

Para cada uma das quatro informações abaixo, decida se ela encaixa melhor no CLAUDE.md ou em um dos arquivos de tópico da Auto memory, e diga por quê.

1. "Este projeto indenta com 4 espaços, nunca tabs" — inalterado desde o dia em que o projeto foi criado.
2. "Na última quarta-feira rastreamos um timeout de produção; a causa raiz era o pool de conexões do banco de dados estar configurado pequeno demais, e na hora o aumentamos para 50" — um registro pontual de um evento passado que pode vir a calhar em um problema parecido mais tarde.
3. "Em uma conversa anterior o usuário mencionou que o processo de revisão de código do time dele é lint primeiro, depois revisão humana" — só relevante em sessões interagindo com este usuário.
4. "Nesta conversa o usuário fez um pedido pontual de mudar uma certa função para uma implementação síncrona" — só relevante para esta única tarefa; quase certamente não vai surgir de novo na próxima sessão.

<!-- rubric -->
- Item 1 julgado como CLAUDE.md, com uma razão mencionando "estável, útil toda vez"
- Itens 2 e 3 julgados como Auto memory, com uma razão mencionando "potencialmente grandes, úteis só para tarefas particulares, um encaixe para recuperação sob demanda"
- Item 4 julgado como não precisando de nenhuma memória externa, com uma razão mencionando "só relevante para esta única sessão, sem necessidade de sobreviver entre sessões"

<!-- answer -->
Resposta de referência: O Item 1 encaixa no **CLAUDE.md** — é uma convenção estável desde que o projeto começou, útil em cada sessão, correspondendo ao papel do CLAUDE.md de "curado por humanos, disciplinado em tamanho, útil toda vez". Os Itens 2 e 3 encaixam em arquivos de tópico da **Auto memory** — ambos são detalhes históricos específicos que poderiam se acumular com o tempo, só precisando de recuperação quando uma situação parecida surge, não um encaixe para carregar por inteiro toda vez, que é exatamente o caso sob demanda. O Item 4 **não** precisa de nenhuma memória externa — ele só importa para esta única sessão e não precisa sobreviver entre sessões; escrevê-lo na memória externa seria só desperdício. Informação assim pode ficar na janela de contexto da sessão atual, desaparecer naturalmente quando a sessão termina, e esse é o comportamento esperado.

<!-- hint -->
Há dois testes: esta informação é "estável, ou muda", e "é útil toda sessão, ou só em situações particulares".

<!-- hint -->
O Item 4 é fácil de julgar mal como "deveria ser registrado" — mas pense de volta no problema com que esta lição abriu: a memória externa existe para resolver "sobreviver entre sessões". Se uma informação só importa para esta única sessão, escrevê-la na memória externa não te dá nada, só desperdiça armazenamento e custo de recuperação depois.

### Nível 2: Diagnostique uma verificação de caminho com bug

O código abaixo tenta restringir uma ferramenta de leitura de memória a arquivos dentro do diretório `MEMORY_ROOT`:

```javascript
const MEMORY_ROOT = "/project/memory";

async function readMemoryFile({ path: relPath }) {
  const abs = require("node:path").resolve(MEMORY_ROOT, relPath);

  if (!abs.startsWith(MEMORY_ROOT)) {
    return "Recusado: caminho fora do intervalo.";
  }

  return await require("node:fs/promises").readFile(abs, "utf-8");
}
```

Encontre o buraco de segurança neste código, dê um exemplo concreto de caminho que burla a verificação e lê um arquivo fora do `MEMORY_ROOT`, e escreva a condição de verificação corrigida.

<!-- rubric -->
- Aponta que usar `startsWith` sozinho tem um problema de burla por prefixo igual
- Dá um exemplo concreto de caminho que burla a verificação (por exemplo, resolvendo para dentro de um diretório como `/project/memory-evil`)
- A condição corrigida deve incluir tanto "igual à própria raiz" quanto "começa com a raiz mais um separador de caminho"

<!-- answer -->
Resposta de referência: O buraco é que `abs.startsWith(MEMORY_ROOT)` é uma correspondência simples de prefixo de string que ignora o caso "mesmo prefixo mas na verdade um diretório diferente". Exemplo: se um diretório `/project/memory-evil` por acaso existe em disco, então quando `relPath` resolve de modo que `abs` vira `/project/memory-evil/secrets.txt`, `"/project/memory-evil/secrets.txt".startsWith("/project/memory")` retorna `true` — ele de fato começa com essa string, mesmo que `memory-evil` seja um diretório completamente diferente que não está dentro do `MEMORY_ROOT`, e a verificação é burlada. A condição corrigida deveria ser `abs === MEMORY_ROOT || abs.startsWith(MEMORY_ROOT + path.sep)`: só um caminho que é exatamente igual à raiz, ou começa com "a raiz mais um separador de caminho", conta como genuinamente dentro da raiz. `/project/memory-evil` não é igual a `/project/memory` nem começa com `/project/memory/`, não satisfaz nenhuma das condições, e é recusado corretamente.

<!-- hint -->
Pense em um contraexemplo concreto: existe um nome de diretório que começa com a string literal `MEMORY_ROOT` mas é na verdade um diretório diferente?

<!-- hint -->
Na versão correta da seção "Adicionando uma fronteira segura" desta lição, nenhum dos lados do `||` pode ser descartado — uma condição sozinha não basta. Descubra por que as duas juntas são o que fecha o buraco.

<!-- /exercises -->

## Recapitulação

- Quando uma sessão termina, qualquer coisa na janela que não foi movida para fora está perdida para sempre; para manter a informação entre sessões, você tem de escrevê-la na memória externa, fora da janela, antes de a sessão terminar
- O CLAUDE.md é escrito por humanos, carregado por inteiro no contexto a cada sessão, com uma meta oficial de tamanho de 200 linhas (limite rígido 4 MiB, arquivos maiores ignorados por completo); comentários HTML de nível de bloco são removidos antes da injeção, e um CLAUDE.md na raiz do projeto é relido e reinjetado depois do `/compact`[^S3]
- A Auto memory é escrita pelo modelo, dividida em um arquivo de índice mais arquivos de tópico específicos; o índice carrega só suas primeiras 200 linhas ou 25KB, e os arquivos de tópico não são carregados na inicialização, são lidos sob demanda quando necessário[^S3], para que o orçamento da janela não seja desperdiçado com memória que não vai ser usada
- Os dois são complementares: o CLAUDE.md encaixa em regras estáveis úteis toda vez; a Auto memory encaixa em detalhes de grande volume necessários só para tarefas particulares
- A ferramenta de leitura/escrita de um arquivo de memória deve fazer uma verificação segura de fronteira de caminho; a condição combinada `abs === ROOT || abs.startsWith(ROOT + path.sep)` precisa das duas metades, já que uma verificação `startsWith` sozinha tem um buraco de burla por prefixo igual

[>> Lição 4: Estado estruturado: como um agente lembra em que ponto uma tarefa está](./04-structured-task-state.md)
