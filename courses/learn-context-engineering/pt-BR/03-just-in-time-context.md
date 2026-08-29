# Lição 3: Recuperação just-in-time: deixando o agente buscar o próprio contexto

> Objetivos de aprendizado:
> - Usar o orçamento de atenção para precificar o custo oculto do pré-carregamento, e decidir se um determinado material pertence ao contexto inicial
> - Descrever como a recuperação just-in-time funciona: identificadores leves, metadados como sinal, contexto relevante descoberto progressivamente pela exploração
> - Desenhar a estratégia híbrida de um agente concreto — o que é pré-carregado, e o que fica para trás como identificador a ser buscado em tempo de execução
>
> Pré-requisitos: Você leu as Lições 1 e 2, e tem ao alcance da mão o loop do harness do curso 7 desta série, “Fundamentos do Harness de Agente: Laços e Controle” | Anterior: [Lição 2 <<](./02-anatomy-of-context.md) | Próxima: [Lição 4 >>](./04-compaction-and-notes.md)

## Primeiro, resista à vontade de enfiar tudo lá dentro

Digamos que você está construindo um agente de perguntas e respostas para uma base de código: 200 arquivos-fonte no repositório, e os usuários perguntam coisas como “onde esta função é definida” ou “o que quebra se eu mudar esta configuração”. O movimento óbvio é ler os 200 arquivos e colá-los no contexto inicial — as janelas de contexto hoje são grandes, vai caber.

Cabe. Isso não significa que seja o lugar. A Lição 1 cobriu o porquê: os modelos processam grandes volumes de contexto sacando de um “orçamento de atenção”, e "Every new token introduced depletes this budget by some amount."[^S1] (cada novo token introduzido esgota esse orçamento em alguma medida.) A aritmética só piora conforme você avança: "as the number of tokens in the context window increases, the model's ability to accurately recall information from that context decreases."[^S1] (conforme o número de tokens na janela de contexto aumenta, a capacidade do modelo de recuperar com precisão informações desse contexto diminui.) O consolo é que isso é uma ladeira, não um paredão — "some models exhibit more gentle degradation than others, this characteristic emerges across all models" (alguns modelos exibem degradação mais suave que outros, essa característica emerge em todos os modelos), e juntos esses fatores "create a performance gradient rather than a hard cliff."[^S1] (criam um gradiente de desempenho, não um penhasco abrupto.) O que traz de volta a conclusão da Lição 1, que vale repetir aqui: "context, therefore, must be treated as a finite resource with diminishing marginal returns."[^S1] (o contexto, portanto, precisa ser tratado como um recurso finito com retornos marginais decrescentes.)

De volta àqueles 200 arquivos. Um usuário faz uma pergunta específica, e talvez dois ou três arquivos sejam genuinamente relevantes; os cem e poucos mil tokens carregados pelos outros 197 não são cenário inofensivo. Eles competem por atenção com o conteúdo que importa, saindo do mesmo orçamento. Pior, o agente roda em loop, e "An agent running in a loop generates more and more data that could be relevant for the next turn of inference."[^S1] (um agente rodando em loop gera cada vez mais dados que poderiam ser relevantes para o próximo turno de inferência.) Se o contexto inicial já está sete oitavos cheio, o loop bate na parede depois de um punhado de turnos.

Então a pergunta vira: quando você põe o material diretamente diante do modelo, e quando você apenas diz a ele onde o material mora e o deixa ir buscar? É disso que trata esta lição inteira.

## As duas estratégias, lado a lado

Comece enunciando cada uma com clareza.

**Pré-carregamento**: antes de a inferência começar, tudo o que pode ser necessário vai para o contexto inicial. O modelo vê tudo no turno um e nunca precisa recuperar nada.

**Recuperação just-in-time**: o contexto inicial não guarda material-fonte nenhum, só identificadores leves — a abordagem é "maintain lightweight identifiers (file paths, stored queries, web links, etc.)"[^S1] (manter identificadores leves — caminhos de arquivo, consultas armazenadas, links da web etc.) e deixar o agente carregar o conteúdo por ferramentas em tempo de execução, conforme a necessidade.

| | Pré-carregamento | Recuperação just-in-time |
| --- | --- | --- |
| Contexto inicial | Grande | Pequeno |
| Quando o material chega | Diante do modelo no turno 1 | Custa antes um a vários turnos de chamada de ferramenta |
| Para onde vão os tokens | Em grande parte para “pode ser útil” | Para “é preciso agora, com certeza” |
| Modo de falha típico | A atenção se dilui; o conteúdo-chave se afoga | A recuperação vagueia e gira em falso, queimando turnos e orçamento |

Pense em como você de fato trabalha: você não decorou a base de código. O que você carrega por aí é “a lógica de autenticação mora no diretório auth”, “o parsing de configuração provavelmente está no config.js” — um índice que aponta para o conteúdo, e você abre o arquivo quando precisa do detalhe. A recuperação just-in-time entrega esse jeito de trabalhar ao agente.

Mas olhe de novo a última célula daquela tabela: recuperar não é de graça. Cada busca just-in-time é uma ida e volta completa de chamada de ferramenta — o modelo emite a chamada, o harness a executa, o resultado volta, o modelo raciocina de novo. No curso 7 desta série, “Fundamentos do Harness de Agente: Laços e Controle”, você equipou seu harness com duas válvulas, teto máximo de turnos e teto de orçamento; a recuperação gasta exatamente aquilo que essas duas válvulas governam. Então “sempre just-in-time” também não é a resposta. É uma conta a ser calculada, e o framework de trade-off mais adiante nesta lição faz a matemática.

## Como a recuperação just-in-time funciona de fato

Três coisas a fazem rodar: um conjunto de identificadores (para o modelo saber o que existe e mais ou menos onde), algumas ferramentas de recuperação, e um loop que permita vários turnos de exploração. Juntas, essa combinação "allows agents to incrementally discover relevant context through exploration."[^S1] (permite que agentes descubram incrementalmente o contexto relevante pela exploração.)

Aqui está a parte subestimada: **os metadados dos identificadores já são sinal por si só**. Nomes de arquivo e estrutura de diretórios anunciam ao mesmo tempo para que serve um conteúdo e quão relevante ele provavelmente é.[^S1] Você não precisa abrir `tests/refund.test.js` para saber o que tem lá dentro; um diretório `legacy/` intocado há dois anos provavelmente não é o lugar por onde começar. O relato da Anthropic sobre seu sistema multiagente de pesquisa põe o movimento de fundo de forma afiada: "The essence of search is compression: distilling insights from a vast corpus."[^S3] (a essência da busca é compressão: destilar insights de um corpus vasto.) Cada passo da recuperação just-in-time — listar um diretório, buscar uma palavra-chave, escolher um arquivo — executa essa compressão, estreitando “uma faixa ampla de talvez-relevante” até “o pedacinho que eu de fato tenho de ler”.

Ao código. Dê àquele agente de perguntas e respostas sobre a base de código três ferramentas; as três implementações são curtas:

```javascript
import fs from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

const REPO_ROOT = "/path/to/your/repo"; // troque pelo seu próprio repositório

function list_files({ path = "." } = {}) {
  const full = join(REPO_ROOT, path);
  const entries = [];
  for (const name of fs.readdirSync(full).sort()) {
    if (fs.statSync(join(full, name)).isDirectory()) {
      entries.push(name + "/");
    } else {
      entries.push(name);
    }
  }
  return entries.join("\n");
}

function grep({ pattern, path = "." }) {
  const result = spawnSync("grep", ["-rn", pattern, path], {
    cwd: REPO_ROOT,
    encoding: "utf8",
  });
  const lines = result.stdout.split("\n").filter((line) => line !== "");
  if (lines.length > 50) {
    return lines.slice(0, 50).join("\n") + `\n(${lines.length} linhas correspondentes no total, truncado)`;
  }
  return lines.join("\n") || "(sem correspondências)";
}

function read_file({ path }) {
  const text = fs.readFileSync(join(REPO_ROOT, path), "utf8");
  const lines = text.replace(/\n$/, "").split("\n");
  if (lines.length > 400) {
    return lines.slice(0, 400).join("\n") + `\n(${lines.length} linhas no total, truncado)`;
  }
  return lines.join("\n");
}
```

Depois escreva as definições de ferramenta no padrão da Lição 2 — "self-contained," "extremely clear with respect to their intended use," com "minimal overlap in functionality"[^S1] (autocontidas, extremamente claras quanto ao uso pretendido, com sobreposição mínima de funcionalidade):

```javascript
const TOOLS = [
  {
    name: "list_files",
    description:
      "Lista os arquivos e subdiretórios de um diretório do repositório; " +
      "subdiretórios terminam com /. Use para entender a estrutura do código " +
      "e decidir onde olhar em seguida.",
    input_schema: {
      type: "object",
      properties: {
        path: {
          type: "string",
          description: "Caminho relativo à raiz do repositório; omita para listar a raiz",
        },
      },
    },
  },
  {
    name: "grep",
    description:
      "Busca texto recursivamente sob um diretório e retorna as linhas correspondentes como " +
      "arquivo:linha:conteúdo, até 50 linhas. Use para estreitar a busca antes de " +
      "ler qualquer arquivo.",
    input_schema: {
      type: "object",
      properties: {
        pattern: { type: "string", description: "String ou regex a buscar" },
        path: { type: "string", description: "Escopo da busca, relativo à raiz do repositório" },
      },
      required: ["pattern"],
    },
  },
  {
    name: "read_file",
    description:
      "Lê o conteúdo de um único arquivo; tudo além de 400 linhas é truncado. " +
      "Use apenas depois que list_files ou grep tiver confirmado que o arquivo é relevante.",
    input_schema: {
      type: "object",
      properties: {
        path: { type: "string", description: "Caminho do arquivo relativo à raiz do repositório" },
      },
      required: ["path"],
    },
  },
];
```

O system prompt carrega apenas as partes estáveis: o trabalho, a exigência de citação, as convenções de comportamento para a recuperação. Note que nem uma linha de conteúdo de arquivo aparece nele:

```javascript
const SYSTEM_PROMPT = `Você é o assistente de perguntas e respostas deste repositório de código.
Toda resposta deve citar caminhos de arquivo e números de linha específicos.
Convenção de recuperação: estreite o escopo com list_files ou grep primeiro, depois
use read_file; leia apenas os arquivos de que você realmente precisa, um de cada vez.`;
```

Ligue isso a um pequeno repositório de e-commerce, pergunte “onde o valor de reembolso do pedido é calculado?”, e uma execução típica fica assim. (O conteúdo do repositório é ilustrativo; o formato de cada chamada e o formato de cada retorno são fixados pelas implementações acima. O corpo do arquivo do turno 3 é longo demais para imprimir, então um parêntese de uma linha faz as vezes dele.)

```
Turno 1  list_files({ path: "." })
      →  README.md
         src/
         tests/
Turno 2  grep({ pattern: "Refund", path: "src" })
      →  src/payments/refund.js:12:export function calculateRefundAmount(order, policy) {
         src/orders/service.js:6:import { calculateRefundAmount } from "../payments/refund.js";
         src/orders/service.js:88:  const amount = calculateRefundAmount(order, policy);
Turno 3  read_file({ path: "src/payments/refund.js" })
      →  (60 linhas neste arquivo; retornado por inteiro)
Turno 4  O modelo para de chamar ferramentas e responde diretamente:
         "O valor do reembolso é calculado em calculateRefundAmount em
         src/payments/refund.js:12; o módulo de pedidos o chama a partir de
         src/orders/service.js:88."
```

Veja o que aconteceu entre os turnos 2 e 3. O grep retornou três linhas correspondentes, e o modelo não leu os dois arquivos. Pelo conteúdo das linhas ele deduziu que a definição está em `refund.js`, enquanto `service.js` é meramente quem importa e chama, então abriu exatamente um arquivo. Isso é metadado fazendo a primeira triagem pelo modelo: "the metadata of these references provides a mechanism to efficiently refine behavior."[^S1] (os metadados dessas referências fornecem um mecanismo para refinar o comportamento com eficiência.) Ao longo de toda a trajetória, o que entrou no contexto foi uma listagem de diretório, três linhas de saída de grep e um arquivo de 60 linhas — não 200 arquivos.

Mais dois detalhes recompensam uma segunda olhada. O primeiro é a truncagem embutida em duas das implementações: o grep retorna no máximo 50 linhas, o read_file no máximo 400. A Lição 2 defendeu que as ferramentas devem estar "returning information that is token efficient"[^S1] (retornando informação eficiente em tokens) — ferramentas de recuperação são as fornecedoras do contexto, e o loop só sobrevive se as fornecedoras limitarem suas remessas. O segundo é o caso de falha: se o grep continuar voltando vazio, o modelo pode buscar repetidas vezes com palavras-chave diferentes. É exatamente esse o cenário que a detecção de giro em falso e a válvula de orçamento do curso de harness existem para pegar — explorar é bom, explorar sem limite não é.

## O híbrido é o caso normal

Você talvez espere que a conclusão seja “a recuperação just-in-time vence”. Não é. Sistemas reais raramente ficam em um dos polos; o formato comum é um híbrido — "retrieving some data up front for speed, and pursuing further autonomous exploration at its discretion."[^S1] (recuperar alguns dados de antemão em nome da velocidade, e prosseguir com exploração autônoma adicional a seu critério.)

O Claude Code, que você usa todo dia, é um exemplo vivo: "CLAUDE.md files are naively dropped into context up front, while primitives like glob and grep" (arquivos CLAUDE.md são jogados ingenuamente no contexto de antemão, enquanto primitivas como glob e grep) dão suporte à exploração just-in-time em tempo de execução.[^S1] A documentação oficial descreve isso de forma direta — "CLAUDE.md is a special file that Claude reads at the start of every conversation."[^S4] (o CLAUDE.md é um arquivo especial que o Claude lê no início de cada conversa.) Como ele é carregado em todas as vezes, a documentação aconselha manter nele apenas material amplamente aplicável e perguntar de cada linha, uma a uma: "Would removing this cause Claude to make mistakes?"[^S4] (remover isto faria o Claude cometer erros?) Se a resposta for não, aquela linha deve sair. A documentação enuncia a consequência sem rodeios: "Bloated CLAUDE.md files cause Claude to ignore your actual instructions!"[^S4] (arquivos CLAUDE.md inchados fazem o Claude ignorar as suas instruções de verdade!)

As Skills seguem um terceiro caminho — "Claude loads them on demand without bloating every conversation."[^S4] (o Claude as carrega sob demanda sem inchar cada conversa.) Enfileire esses três e você tem um retrato em camadas de uma estratégia híbrida:

- **CLAUDE.md**: estável, obrigatório a cada turno → pré-carregado no início;
- **Skills**: capacidade especializada empacotada, usada só para tarefas específicas → carregadas sob demanda;
- **A própria base de código**: enorme, e só uma lasca é necessária a cada vez → explorada just-in-time via glob e grep.

Quando você projeta o seu próprio agente, está desenhando uma versão desse mesmo retrato: qual material fica na “vaga do CLAUDE.md”, e qual fica na “vaga da base de código”.

```agentmentor-check
{
  "id": "ctx-zh-03-strategy-tradeoff",
  "label": "Escolher uma estratégia de contexto para um agente de perguntas e respostas sobre base de código usando o orçamento de atenção e a descoberta progressiva",
  "prompt": "Você está construindo um agente de perguntas e respostas sobre uma base de código com 200 arquivos-fonte. O colega A diz: “A janela de contexto comporta, então leia os 200 arquivos para o contexto inicial — o que o modelo precisar está bem ali.” O colega B diz: “Não coloque um arquivo sequer. Dê a ele a árvore de arquivos e uma ferramenta grep e deixe que ele ache tudo na hora.” Pelo raciocínio desta lição, qual julgamento se sustenta melhor?",
  "whyHere": "A seção da estratégia híbrida acabou de chegar, e quem aprende precisa segurar as duas pontas ao mesmo tempo — refutar o pré-carregamento total com o orçamento de atenção, e refutar o just-in-time puro com o custo da recuperação — em vez de trocar um extremo pelo outro.",
  "mode": "single",
  "choices": [
    {
      "id": "a",
      "text": "A está certo: com tudo já diante do modelo, ele nunca precisa sair procurando, então a qualidade das respostas fica mais bem protegida.",
      "correct": false,
      "feedback": "Não exatamente. “Cabe” não é o mesmo que “é o lugar”. Cada novo token esgota o orçamento de atenção, e quanto mais longo o contexto, pior fica a recuperação precisa do modelo a partir dele. De 200 arquivos, normalmente só alguns poucos têm a ver com uma pergunta específica; o resto desses tokens dilui a atenção em vez de proteger o que quer que seja."
    },
    {
      "id": "b",
      "text": "B está certo: quanto menor o contexto inicial, melhor, e toda informação deveria esperar até ser necessária para então ser recuperada.",
      "correct": false,
      "feedback": "Não exatamente. Metade da direção está certa, mas isso trata a recuperação como se fosse de graça. Cada busca é uma ida e volta de chamada de ferramenta que custa latência, tokens e o orçamento de turnos do harness. Material pequeno e usado a cada turno, como convenções de comportamento ou o formato do diretório de nível superior, fica mais caro, não mais barato, se o modelo tiver de redescobri-lo a cada sessão."
    },
    {
      "id": "c",
      "text": "Os dois foram a um extremo: pré-carregue o material pequeno e estável necessário a cada turno, e deixe identificadores para o resto, de modo que o modelo recupere sob demanda.",
      "correct": true,
      "feedback": "Correto. É exatamente esse o trade-off híbrido: o pré-carregamento compra velocidade, a recuperação economiza orçamento. Convenções de comportamento e o mapa de diretórios de nível superior são pequenos e estáveis o bastante para ficar no contexto inicial; os 200 arquivos deixam apenas seus caminhos como identificadores, e o modelo estreita a busca usando nomes de arquivo e resultados de grep. Os dois custos ficam limitados."
    }
  ]
}
```

## Um framework de trade-off que você pode aplicar agora

Para cada material candidato, faça duas perguntas:

1. **Ele é estável?** O conteúdo permanece o mesmo ao longo do tempo, independente de qualquer pergunta específica?
2. **Ele é usado a cada turno — ou em quase todos?**

Dois sins → **pré-carregue**. Casos típicos: padrões de codificação, restrições centrais do negócio, as regras de conduta do agente, a estrutura de diretórios de nível superior. Material desse tipo normalmente também é pequeno — se algo vendido como “necessário a cada turno” se revelar enorme, comece duvidando de que ele seja mesmo necessário a cada turno.

Qualquer não → **deixe um identificador e recupere just-in-time**. Casos típicos: o código-fonte completo de um módulo (necessário só para perguntas sobre aquele módulo), tíquetes históricos (consultados só quando se persegue uma falha específica), um documento de design longo (aberto só quando se está alinhando uma abordagem).

Depois ponha o custo da recuperação na balança e confira o resultado mais uma vez: cada busca acrescenta uma ida e volta, acrescenta latência, gasta orçamento. Então não empurre teimosamente material pequeno e usado com frequência para a recuperação — trocar 600 palavras de espaço de pré-carregamento por um turno extra de `list_files` em cada sessão é um negócio ruim. Na direção contrária, pré-carregar um script de 2.000 linhas que provavelmente não vai aparecer é queimar orçamento de atenção puro e simples.[^S1]

A documentação do Claude Code enuncia o que está em jogo em uma linha: "The context window is the most important resource to manage."[^S4] (a janela de contexto é o recurso mais importante a gerenciar.) Pré-carregamento e recuperação just-in-time não são doutrinas rivais. São as duas mãos com que você gerencia esse recurso.

## Esta lição pula RAG, de propósito

Diga “recuperação” e muita gente pula direto para bancos vetoriais, embeddings, pipelines de RAG. Esta lição deliberadamente não toca em nada disso — o README do curso traça a fronteira, e “recuperação just-in-time” aqui significa algo mais simples: um agente com ferramentas de sistema de arquivos e de busca, puxando conteúdo sob demanda.

Isso não é preguiça pedagógica. Caminhos de arquivo já vêm de graça com hierarquia e semântica de nomes, resultados de grep são precisos e explicáveis, e essa dupla já basta para sustentar um loop completo de descobrir incrementalmente o contexto relevante pela exploração.[^S1] A orientação da Anthropic sobre construir agentes oferece um senso de proporção correspondente: "you should consider adding complexity only when it demonstrably improves outcomes."[^S2] (você deveria considerar adicionar complexidade apenas quando ela comprovadamente melhora os resultados.) Note o verbo — *considerar*. É uma postura de ponderação, não uma proibição. Para um agente de perguntas e respostas sobre base de código, percorrer o caminho mais simples (sistema de arquivos mais grep) até você conseguir medir onde ele fica devendo se encaixa melhor nessa postura do que levantar recuperação vetorial no primeiro dia.

Um fio a deixar solto: por mais disciplinada que seja a sua recuperação just-in-time, um agente moendo uma tarefa longa segue acumulando resultados de ferramenta turno após turno,[^S1] e a janela de contexto se aproxima do teto de qualquer jeito. Nesse ponto, ser bom em “pegar menos” deixa de bastar — você também precisa ser bom em jogar coisas fora e anotar coisas. Isso é a Lição 4.

<!-- exercises -->
## 💻 Exercícios

### Nível 1: Classifique um inventário de contexto

Você está projetando o contexto de um agente interno de perguntas e respostas para operações de plantão, e cinco materiais candidatos estão na mesa:

1. O manual de plantão (cerca de 500 palavras — as linhas duras que toda resposta precisa respeitar, como nunca entregar senhas do banco de dados de produção);
2. Todos os 800 tíquetes históricos de incidentes (cada um com algumas centenas a alguns milhares de palavras);
3. A estrutura de nível superior do catálogo de serviços (40 nomes de serviço mais uma linha de responsabilidade para cada, cerca de 600 palavras);
4. O script de deploy completo de um serviço (cerca de 2.000 linhas, relevante apenas para perguntas sobre deploy);
5. Uma tabela de mapeamento de palavras-chave comuns de alerta para consultas de busca de tíquetes (cerca de 30 linhas).

Usando o framework desta lição, classifique cada item em “pré-carregar” ou “deixar um identificador, recuperar just-in-time”, e dê uma razão de uma linha para cada.

<!-- rubric -->
- Coloca os materiais pequenos e que vale manter residentes (1, 3, 5) em pré-carregar, com razões que caem em “pequeno, reutilizado com frequência, ou ele próprio uma porta de entrada para a recuperação”
- Coloca os materiais grandes e específicos de ramo (2, 4) em recuperação just-in-time, e nota que pré-carregá-los gasta orçamento de atenção com conteúdo que em grande parte fica sem uso
- Ao menos em um ponto menciona a pré-condição da recuperação just-in-time: o agente precisa de uma porta de entrada utilizável — uma ferramenta de busca, um mapeamento de consultas, ou caminhos de arquivo como identificadores

<!-- answer -->
1. **Manual de plantão → pré-carregar**. As linhas duras obrigam toda resposta, sem exceção, e 500 palavras é minúsculo. As duas perguntas voltam com sim.
2. **800 tíquetes → deixar um identificador**. Grande demais, e só um punhado importa quando se persegue uma falha específica; pré-carregar todos gasta orçamento de atenção com conteúdo que provavelmente nunca aparece. Dê ao agente uma ferramenta de “buscar tíquetes por palavra-chave” como porta de entrada e deixe que ele puxe os de que precisar.
3. **Estrutura de nível superior do catálogo de serviços → pré-carregar**. Um mapa de nível superior de 600 palavras em que quase toda pergunta se apoia para descobrir qual serviço investigar — o clássico caso pequeno e frequente.
4. **Script de deploy de 2.000 linhas → deixar um identificador**. Só perguntas de deploy precisam dele; mantenha por perto o caminho do script e puxe-o com uma ferramenta de leitura de arquivo quando uma pergunta relevante aparecer.
5. **Tabela de mapeamento de alertas → pré-carregar**. Trinta linhas é ínfimo, e a tabela é ela própria o metadado de entrada da recuperação just-in-time — é ela que diz ao modelo com qual consulta buscar tíquetes para uma dada classe de alerta. Pré-carregá-la é o que faz a recuperação do item 2 funcionar.

<!-- hint -->
Faça as duas perguntas a cada material primeiro: ele é estável, e é usado a cada turno? Só dois sins colocam o pré-carregamento na mesa.

<!-- hint -->
Materiais grandes não são jogados fora — o trabalho é decidir que “porta de entrada” você deixa para o agente. Caminhos, consultas e tabelas de mapeamento contam todos como identificadores leves.

### Nível 2: Acrescente ferramentas de recuperação ao seu harness

Puxe o loop do harness que você escreveu no curso 7 desta série, “Fundamentos do Harness de Agente: Laços e Controle”, registre as três ferramentas desta lição (list_files, grep, read_file), aponte-as para um repositório real seu, e transforme isso em um agente de perguntas e respostas. Requisitos:

- O system prompt pré-carrega apenas informação estável — trabalho, exigência de citação, convenções de recuperação — e nenhum conteúdo de arquivo;
- As três descrições de ferramenta são autocontidas e não se sobrepõem, e os retornos delas são truncados;
- Rode uma pergunta real, registre a trajetória de chamadas de ferramenta, e verifique se ela mostra descoberta progressiva do grosso para o fino.

<!-- rubric -->
- O system prompt permanece um conjunto estável pequeno (trabalho + exigência de citação + convenção de recuperação), sem conteúdo de arquivo pré-carregado
- As três descrições de ferramenta são autocontidas, com propósito claro e sem sobreposição; grep e read_file truncam seus retornos por contagem de linhas
- A trajetória entregue mostra a ordem “estreite primeiro com list_files/grep, depois read_file em um pequeno número de arquivos”, e identifica qual passo se apoiou em metadados como nome de arquivo ou estrutura de diretórios

<!-- answer -->
Uma abordagem de referência (pontos-chave mais esqueleto):

1. Pegue as funções de ferramenta e a definição `TOOLS` direto da seção “Como a recuperação just-in-time funciona de fato” desta lição e mude `REPO_ROOT` para o caminho do seu repositório; deixe as truncagens de 50 linhas do grep e de 400 linhas do read_file como estão.
2. Copie o `SYSTEM_PROMPT` do texto principal como está — ele guarda só três coisas, o trabalho, a exigência de citação e a convenção de recuperação, sem conteúdo de arquivo.
3. Registre-as no harness: no ponto de despacho de ferramentas do seu loop do curso 7, roteie cada chamada para a função correspondente pelo nome da ferramenta:

```javascript
const HANDLERS = { list_files, grep, read_file };

// no ponto em que o loop do harness trata tool_use:
const result = HANDLERS[toolName](toolInput);
```

4. Uma trajetória que passa (tome “de onde a configuração é carregada” como pergunta) deve ficar assim: `list_files({ path: "." })` revela `config/` ou `src/` → `grep({ pattern: "loadConfig", path: "src" })` encontra a definição e os pontos de chamada → `read_file` abre apenas o arquivo que contém a definição → resposta, com caminho e número de linha. Dois autotestes: o estreitamento aconteceu antes de qualquer arquivo ser lido, e ao menos um passo foi guiado por um nome de diretório ou de arquivo (metadado) em vez de pela leitura de arquivos candidatos um atrás do outro.

<!-- hint -->
As três implementações estão no texto principal. Mude `REPO_ROOT` e elas se conectam ao seu harness — sem necessidade de reescrever nada.

<!-- hint -->
Se o agente abrir com um read_file em um arquivo grande, volte e aperte a convenção de recuperação no system prompt, ou enuncie na descrição da ferramenta read_file que ela só deve ser usada depois que grep ou list_files tiver confirmado a relevância.

<!-- /exercises -->

## Recapitulação

- “Cabe” não é razão para pré-carregar: cada novo token esgota o orçamento de atenção, e conforme a contagem de tokens cresce a recuperação precisa do modelo a partir do contexto declina — um gradiente de desempenho, não um penhasco abrupto; o contexto tem de ser gerenciado como um recurso finito com retornos marginais decrescentes[^S1]
- Como a recuperação just-in-time funciona: o contexto guarda apenas identificadores leves (caminhos de arquivo, consultas armazenadas, links da web), e as ferramentas carregam o conteúdo sob demanda em tempo de execução; os metadados dos identificadores — nomes de arquivo, estrutura de diretórios — sinalizam relevância por si sós, o que permite aos agentes descobrir incrementalmente o contexto relevante pela exploração[^S1]
- Recuperar não é de graça: cada busca é uma ida e volta de chamada de ferramenta, gastando latência mais os turnos e o orçamento governados pelas válvulas de controle do curso de harness
- O híbrido é o caso normal: recupere alguns dados de antemão em nome da velocidade, e deixe o modelo prosseguir com exploração autônoma adicional a seu critério[^S1]. O Claude Code é a referência pronta — CLAUDE.md jogado inteiro no início, Skills carregadas sob demanda, a base de código explorada na hora via glob e grep[^S1][^S4]
- O framework são duas perguntas: estável? necessário a cada turno? Dois sins significam pré-carregar, caso contrário deixe um identificador; não force material pequeno e frequente para a recuperação, e não force material grande e raro para o pré-carregamento
- “Recuperação just-in-time” nesta lição significa puxadas sob demanda por ferramentas de sistema de arquivos e de busca, sem banco vetorial envolvido; antes de trazer maquinário de recuperação mais pesado, tenha em mente aquele senso de proporção — considere adicionar complexidade apenas quando ela comprovadamente melhora os resultados[^S2]

[>> Lição 4: Compactação e notas: gestão de contexto para tarefas longas](./04-compaction-and-notes.md)
