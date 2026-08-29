# Lição 4: Tracing: costurando uma execução em uma árvore

> Objetivos de aprendizado:
> - Usar IDs de correlação para juntar registros espalhados em “tudo o que um prompt disparou”, e explicar como isso divide o trabalho com os IDs de sessão
> - Ler a hierarquia de spans e traces: span raiz, requisições de modelo, chamadas de ferramenta, as duas fases de uma ferramenta (espera de permissão e execução) e como subagentes se aninham sob o span de ferramenta do agente pai
> - Quando o painel está vazio, desconfiar do pipeline antes de desconfiar do agente: saber por que a exportação falha em silêncio, em que condições a exportação em lote perde dados e como verificar a própria instrumentação
>
> Pré-requisitos: Lições 1–3 (por que o não determinismo quebra a reprodução, por que os registros brutos são a evidência de primeira mão, como instrumentar um harness com logs estruturados e métricas) | [<< Lição 3](./03-logs-and-metrics.md) | [Lição 5 >>](./05-hooks-and-debugging.md)

## 400 registros — quais 12 são daquela execução?

No fim da lição anterior, seu harness estava gravando registros estruturados em `runs.jsonl`: um por requisição de modelo, um por chamada de ferramenta, com duração, tokens e erros. Os logs saíram de “um blocão de texto” para “um objeto JSON por linha”. Você estava satisfeito.

Aí um usuário relata um problema: “Ontem à tarde eu pedi para arrumar um texto na página de login e ele também mexeu num arquivo de teste. Eu não pedi isso.”

Você abre os logs, filtra por data com grep e 400 registros encaram você de volta. Duzentas chamadas de ferramenta, cem requisições de modelo e dezenas de registros de subagentes misturados no meio. O prompt de que o usuário está falando provavelmente corresponde a uns doze deles. Quais doze?

Você tem duas pistas, nenhuma suficiente:

- **ID de sessão**. Na lição anterior você chegou a gravar `session_id` em cada registro, mas ontem à tarde o usuário teve umas sete ou oito idas e vindas na mesma sessão. Filtrando por sessão, 400 vira 210. Faixa menor, mesma natureza.
- **Marca de tempo**. Você pode chutar uma janela de tempo e cortar por ali, mas os subagentes rodaram simultaneamente e os registros deles se intercalam com os do loop principal na linha do tempo; e a “tarde” do usuário tanto pode ser 14h quanto 16h, ele não lembra.

O problema não é falta de detalhe nos registros — é que **os registros não têm relações**. A lição 3 transformou cada etapa em dado, mas esse dado é uma pilha de linhas paralelas. Qual linha causou qual, quem é filho de quem — nem uma palavra sobre isso. Centenas de objetos JSON bem formatados, ainda assim uma pilha de areia — só que desta vez uma areia mais quadradinha.

Esta lição acrescenta essa camada que falta.

## ID de correlação: o crachá de um prompt

A etapa mais simples: dê um ID a “um evento disparador” e faça todo evento gerado por esse disparador copiar esse ID. Isso é um ID de correlação. Não precisa de infraestrutura nenhuma — é só um campo.

O desenho nativo do Claude Code faz exatamente isso. Depois que um usuário envia um prompt, o Claude Code pode fazer várias chamadas de API e rodar várias ferramentas; o atributo `prompt.id` permite amarrar todos esses eventos de volta ao único prompt que os disparou[^S4]. A receita de depuração que a documentação dá é igualmente direta: para rastrear toda a atividade disparada por um único prompt, filtre seus eventos por um valor específico de `prompt.id`[^S4].

Este ID e o ID de sessão são duas granularidades diferentes, cada uma com sua função:

| ID de correlação | Abrangência | Responde a que pergunta |
| --- | --- | --- |
| id de sessão | Uma conversa inteira | Quanto esta sessão custou no total? Ela mudou de modo de permissão? |
| id de prompt | Um prompt dentro de uma sessão | Quais requisições de modelo e chamadas de ferramenta a frase de que o usuário está reclamando disparou de fato? |

De volta aos 400 registros da abertura: se cada registro carregasse `prompt_id`, bastava achar na transcrição da sessão o id correspondente a “arrumar um texto na página de login”, filtrar uma vez, e 400 cai para 12. Pela primeira vez a areia tem uma borda.

Mas borda não é estrutura. Aqueles 12 registros continuam sendo 12 linhas planas. Você ainda não sabe se a edição errada no arquivo de teste veio direto do loop principal ou de um subagente que ele despachou; não sabe se aquela ferramenta de 40 segundos passou 40 segundos esperando você clicar em “aprovar”.

## Spans e traces: arrumar eventos em uma árvore

Deixe eu traduzir alguns termos primeiro, já que vamos usá-los daqui para a frente:

- **span**: O registro de “um pedaço de trabalho com começo e fim”. Tem um nome (como `llm_request`), um horário de início, um horário de fim e alguns atributos pendurados nele (nome do modelo, nome da ferramenta, contagem de tokens). Um span consegue identificar o span pai dele.
- **trace**: Uma árvore inteira de spans conectados por relações pai-filho. Tudo o que aconteceu durante uma requisição completa, do começo ao fim, lido como uma árvore.
- **exportador** (exporter): O código dentro do processo responsável por empacotar spans e mandá-los para fora.
- **coletor** (collector): A estação de retransmissão ou serviço de backend que recebe esses spans. O exportador manda os dados para ele; você vê a árvore no painel dele.

O tracing distribuído do Claude Code exporta spans que ligam cada prompt do usuário às requisições de API e execuções de ferramenta que ele dispara, de modo que você consegue ver uma requisição completa como um único trace no seu backend de tracing[^S4]. A hierarquia específica é esta: cada prompt do usuário inicia um span raiz `claude_code.interaction`; chamadas de API, chamadas de ferramenta e execuções de hook são gravadas como filhos dele; os spans de ferramenta têm dois spans filhos próprios — um para o tempo passado esperando por uma decisão de permissão e outro para a execução em si[^S4].

Vale parar nesses dois spans filhos de uma ferramenta. Na lição anterior você gravou `duration_ms`: uma ferramenta rodou por 40 segundos. Mas “40 segundos dos quais 38 foram esperando alguém clicar em aprovar” e “40 segundos dos quais 38 foram rodando o comando” são dois problemas completamente diferentes. O primeiro significa arrumar a configuração de permissões ou mudar o padrão de interação; o segundo significa arrumar a implementação da ferramenta. Os mesmos 40 segundos, partidos em dois trechos, dão duas correções diferentes. É isso que a estrutura em árvore dá além dos campos planos.

O Agent SDK diz de forma ainda mais direta: traces são a visão mais detalhada que você consegue de uma execução de agente; com `CLAUDE_CODE_ENHANCED_TELEMETRY_BETA=1` definido, cada etapa do loop do agente vira um span que você pode inspecionar no seu backend de tracing[^S6]. A CLI já traz instrumentação OpenTelemetry embutida: ela grava spans em torno de cada requisição de modelo e execução de ferramenta, emite métricas para contadores de token e custo e emite eventos de log estruturados para prompts e resultados de ferramenta[^S6].

Compare isso com o harness que você escreveu no curso 7 desta série (“Fundamentos do Harness de Agente: Laços e Controle”): seu loop já tem posições claras — “enviar requisição / receber `tool_use` / rodar ferramenta / devolver `tool_result`” — e cada posição mapeia naturalmente para um span. Não faltam posições, falta relação pai-filho.

## Propagação através de fronteiras: subagentes, sua aplicação, subprocessos Bash

Uma árvore fica bonita, mas uma execução real atravessa várias fronteiras de processo. A árvore consegue continuar conectada depois da travessia? Consegue, passando “quem é meu pai” para baixo o caminho todo.

**Uma camada para baixo: subagentes.** Quando o agente gera um subagente pela ferramenta Agent, os spans `llm_request` e `tool` do subagente se aninham sob o span `claude_code.tool` do agente pai, de modo que a cadeia de delegação completa aparece como um único trace[^S6]. Isso resolve uma pergunta que fica sem resposta sem a árvore — de quem são os tokens do subagente? Eles estão aninhados sob aquela chamada de ferramenta, que está aninhada sob aquele prompt, então pertencem àquele prompt. Você não precisa de costura extra.

**Uma camada para cima: sua aplicação.** O SDK propaga automaticamente o contexto de trace W3C para dentro do subprocesso da CLI. O contexto de trace W3C é só uma string padronizada contendo o id do trace e o id do span atual — quem a recebe sabe onde se pendurar. Quando você chama `query()` enquanto um span do OpenTelemetry está ativo na sua aplicação, o SDK injeta `TRACEPARENT` e `TRACESTATE` no ambiente do processo filho, a CLI os lê e o span `claude_code.interaction` dela vira filho do seu span — a execução do agente aparece dentro do trace da sua aplicação em vez de virar uma raiz desconectada[^S6].

Essa diferença é bem prática na hora de investigar produção: o usuário reclama “cliquei naquele botão e a página ficou girando por 20 segundos”. Você entra no trace da requisição HTTP e consegue seguir até a chamada de ferramenta dentro do agente que levou 14 segundos, sem trocar de sistema nem alinhar marcas de tempo.

**Mais para baixo ainda: os comandos que o próprio agente roda.** Quando o tracing está ativo, subprocessos Bash e PowerShell herdam automaticamente uma variável de ambiente `TRACEPARENT` contendo o contexto de trace W3C do span da execução de ferramenta ativa[^S4]. Se um comando lançado pela ferramenta Bash emite os próprios spans do OpenTelemetry, esses spans se aninham sob o span `claude_code.tool.execution` que envolve o comando[^S6].

Ligue os três trechos e uma árvore consegue partir da sua requisição web, passar pela CLI, passar por um subagente e crescer até um estágio de compilação dentro do `npm run build` que o agente rodou.

## Só estrutura, nada de conteúdo

Você deve estar se perguntando: se cada etapa que o agente dá é enviado para um backend externo, isso inclui o que o usuário disse a ele e o conteúdo dos arquivos que ele leu e escreveu?

O post-mortem da Anthropic sobre o sistema multiagente de pesquisa dá duas conclusões paralelas. Uma é o ganho: depois que colocaram o tracing completo no ar, eles conseguiram diagnosticar por que os agentes falhavam e corrigir os problemas sistematicamente[^S1]. A outra é o limite: eles monitoraram padrões de decisão e estruturas de interação dos agentes sem monitorar o conteúdo das conversas individuais, para preservar a privacidade dos usuários; mesmo essa observabilidade de alto nível ajudou a diagnosticar causas-raiz, descobrir comportamentos inesperados e corrigir falhas comuns[^S1].

A postura padrão das ferramentas nativas se alinha exatamente a esse princípio. A telemetria é estrutural por padrão: durações, nomes de modelo e nomes de ferramenta são gravados em cada span; contagens de token são gravadas quando a requisição de API subjacente devolve dados de uso, então spans de requisições que falharam ou foram abortadas podem omiti-las; o conteúdo que seu agente lê e escreve não é gravado por padrão[^S6]. O conteúdo dos prompts do usuário também não é coletado por padrão — só o comprimento do prompt é gravado; para incluir o conteúdo do prompt, você precisa definir explicitamente `OTEL_LOG_USER_PROMPTS=1`[^S4]. A página do Agent SDK coloca o mesmo lembrete ao lado das próprias chaves de coleta de conteúdo: deixe essas chaves desligadas a menos que seu pipeline de observabilidade esteja aprovado para armazenar os dados que seu agente manipula[^S6].

Para muitos times isso é uma boa notícia: você não precisa ganhar uma batalha de conformidade sobre “podemos mandar conteúdo do usuário para um backend de terceiros” antes de começar a enxergar o que seu agente faz. Muitos problemas são visíveis na camada de estrutura.

Ao projetar traces para o seu próprio harness, trate isso como o padrão: grave nos spans nomes, durações, nomes de ferramenta, contagens de token e tipos de erro; deixe o conteúdo de parâmetros e retornos nos registros brutos locais (da lição 2) e busque-os por id quando precisar.

## O próprio pipeline de observabilidade pode mentir para você

Tudo até aqui foi sobre “o que você consegue ver depois que a árvore está montada”. Esta seção é sobre algo que acontece antes e é mais fácil de queimar você: **você acha que está olhando para dados, mas na verdade está olhando para um painel vazio**.

A primeira coisa a lembrar: **falha de exportação é silenciosa por padrão**. Se o endpoint está inacessível ou o backend rejeita os dados, o agente continua rodando normalmente e a CLI descarta a telemetria sem levantar erro nenhum na sua aplicação[^S6]. Esse desenho está correto — o pipeline de observabilidade não deveria derrubar o fluxo principal — mas o custo é que um pipeline quebrado e tudo funcionando ficam idênticos do seu lado.

A segunda coisa: **a exportação em lote perde dados sob condições específicas**. A CLI agrupa a telemetria em lotes e exporta em intervalos. Numa saída limpa do processo ela tenta descarregar os dados pendentes, mas esse descarregamento é limitado por um timeout curto, então spans ainda podem ser perdidos se o coletor demorar a responder; se o seu processo for morto antes de a CLI desligar, tudo o que ainda estiver no buffer do lote é perdido[^S6]. Por padrão, métricas são exportadas a cada 60 segundos e traces e logs a cada 5 segundos[^S6]. Junte essas frases: uma execução curta de agente em CI que termina em três a cinco segundos depende de “o descarregamento completar dentro do timeout E o processo não ser morto antes” para preservar a telemetria da ponta final — e o intervalo de exportação amplia a quantidade parada no buffer. Cenários assim precisam de intervalos de exportação bem mais curtos que a duração da execução, e você precisa garantir que o processo saia de forma limpa.

A terceira coisa, e o que você deve fazer primeiro ao investigar: **verifique a própria instrumentação** (instrumentação é só outra palavra para as sondas que você instalou). Para verificar uma configuração que exporta métricas, procure no seu backend pela métrica `claude_code.session.count` — o Claude Code a emite quando uma sessão começa[^S4]; se nada chegar, rode `claude --debug` e procure erros de exportação OTel no log de depuração[^S4]. O valor dessas duas etapas é que eles separam “o agente tem um problema” e “o pipeline está funcionando” em duas perguntas que se respondem separadamente.

Mais duas armadilhas de configuração em que é fácil pisar:

- Por padrão, a CLI reporta `service.name` como `claude-code`. Se você roda vários agentes, ou roda o SDK ao lado de outros serviços que exportam para o mesmo coletor, sobrescreva o nome do serviço e adicione atributos de recurso para conseguir filtrar por agente no seu backend[^S6]. Do contrário os spans de três agentes se misturam sob o mesmo nome de serviço e você fica olhando para uma sopa.
- Ao rodar pelo SDK, não defina `console` como valor de exportador[^S6]. A documentação não diz por quê; pelo jeito como o SDK e a CLI se comunicam, o SDK fala com a CLI pela stdout, e imprimir spans ali embaralharia esse canal.

```agentmentor-check
{
  "id": "obs-zh-04-silent-telemetry",
  "label": "Uma semana, zero dados: nada está errado ou nada está conectado?",
  "prompt": "Você ligou a exportação OpenTelemetry para o agente do seu time, commitou a configuração, subiu para produção e passou uma semana. Você abre o painel — nenhum ponto de dado. Nenhum span, nenhuma métrica, nenhum evento. O agente atendeu usuários a semana inteira; ninguém reclamou. Como você deve interpretar a situação?",
  "whyHere": "Esta seção acabou de explicar que a falha de exportação é silenciosa por padrão. Zero dado é o sinal que iniciantes leem errado com mais facilidade, e esta é a aplicação mais direta do conhecimento de mecanismo desta lição: primeiro distinguir “o agente está bem” de “o pipeline não está conectado”, depois decidir o que checar.",
  "mode": "single",
  "choices": [
    {
      "id": "a",
      "text": "Seu colega tem razão. “Sem notícias, boas notícias” — zero dado significa que as execuções desta semana saíram todas limpas. Espere alguém relatar um problema e só então olhe o painel.",
      "correct": false,
      "feedback": "Tem uma suposição escondida aqui: a de que telemetria só é produzida quando alguma coisa dá errado. Mas execuções normais emitem spans e métricas continuamente; o início de uma sessão já gera registros na hora. Uma semana com zero dado significa que até os traces “normais” estão faltando — e isso, por si só, é anormal."
    },
    {
      "id": "b",
      "text": "Se a telemetria quebrasse, a aplicação teria dado erro; como o app não errou a semana toda, o problema deve estar nas consultas do painel ou na configuração dos gráficos. Vá ajustar os painéis.",
      "correct": false,
      "feedback": "A primeira metade está invertida. Quando o endpoint está inacessível ou o backend rejeita os dados, o agente continua rodando normalmente, a CLI descarta a telemetria e nenhum erro aparece na sua aplicação. Consultas e painéis podem de fato estar mal configurados, mas esse é o segundo suspeito, depois do pipeline."
    },
    {
      "id": "c",
      "text": "Desconfie primeiro do pipeline: falha de exportação é silenciosa por padrão; o agente roda normalmente e a telemetria simplesmente é descartada. Procure session.count no backend; se não estiver lá, rode --debug para ver os erros de exportação.",
      "correct": true,
      "feedback": "Correto. A métrica de contagem emitida no início da sessão é a sonda mais barata para verificar a própria instrumentação: se você consegue consultá-la, o caminho dos dados está vivo e aí sim você desconfia de consultas e painéis; se não consegue, use o log de depuração para trazer o erro de exportação à tona."
    }
  ]
}
```

## Três sinais, você liga só os que precisa

Você não precisa ligar o pacote completo de uma vez. A CLI exporta três sinais OpenTelemetry independentes — métricas, eventos de log e traces — cada um com sua própria chave de ativação e seu próprio exportador, então você pode ligar só os que precisa[^S6].

Isso dá uma sequência natural de adoção:

1. **Ligue as métricas primeiro**. Custo e uso de tokens são as primeiras perguntas que as pessoas fazem, métricas são o mais barato e o intervalo padrão de exportação de 60 segundos serve bem para serviços de longa duração.
2. **Depois ligue os eventos de log**. Resultados de ferramenta e decisões de permissão — esses eventos estruturados são a matéria-prima dos padrões de leitura diagnóstica da lição 3.
3. **Ligue os traces quando bater num problema que você não consegue explicar**. Eles são o mais caro e o mais detalhado — você precisa deles quando de fato tem que “ver o formato de uma execução”.

O destino da exportação é qualquer backend que aceite o OpenTelemetry Protocol (OTLP); a documentação cita alguns: Honeycomb, Datadog, Grafana, Langfuse ou um coletor auto-hospedado[^S6]. Qual escolher está fora do escopo deste curso — vou dizer só o seguinte: o fato de os três sinais serem independentes significa que você pode testar as águas com a menor peça primeiro, sem esperar a infraestrutura completa ficar pronta.

## De passagem: o mesmo lote de eventos também é trilha de auditoria

Os eventos estruturados têm mais um uso, sem relação com depuração; só saiba que ele existe.

Com a identidade do usuário final anexada, os eventos `tool_decision`, `tool_result`, `mcp_server_connection` e `permission_mode_changed`, que são exportados como registros de log nomeados com o prefixo `claude_code.`, viram uma trilha de auditoria por usuário que você pode encaminhar para uma plataforma de Security Information and Event Management (SIEM)[^S6]. Cada evento carrega atributos de identidade que amarram chamadas de ferramenta, atividade MCP e decisões de permissão de volta ao usuário que as disparou[^S4].

O mesmo lote de dados, lido de outro jeito, é a matéria-prima de outro trabalho: ao depurar você fatia horizontalmente por `prompt.id`, ao auditar você fatia verticalmente por usuário. Temas de segurança não serão expandidos neste curso.

## Respostas que este curso não vai dar

Algumas coisas precisam de limites claros para você não ficar procurando receitas prontas em outro lugar:

- **Taxas de amostragem e janelas de retenção**: guardar traces em volume total fica caro, e quanto amostrar e por quanto tempo guardar são perguntas reais, mas não há orientação no material primário, então este curso não vai inventar números. Quando o seu volume de dados virar um problema de verdade, isso fica entre você e a conta do seu backend.
- **Limiares de alerta**: mesma coisa — nenhum número é dado.
- **Hooks**: como instalar sondas nos pontos de controle do ciclo de vida, o que `PreToolUse` e `PostToolUse` conseguem acessar cada um — isso é a lição 5. Uma interface para fincar aqui antes: a entrada do hook carrega o UUID do prompt de usuário sendo processado no momento, e é o mesmo valor do atributo `prompt.id` nos eventos de telemetria, de modo que a saída do hook e a telemetria do mesmo prompt podem ser correlacionadas[^S5]. O ID de correlação estabelecido nesta lição fica diretamente utilizável na próxima.
- **Seu próprio harness não precisa de OTel completo**. Esta lição usa o desenho nativo como ferramenta de ensino porque ele expõe toda a estrutura que deveria existir. Mas o que você quer de fato é só a árvore: a lição 6 vai gerar um `trace_id` para cada execução, adicionar `span_id` e um campo de ponteiro para o pai em cada registro e então escrever uma dúzia de linhas de código para imprimir isso indentado — você vai obter uma árvore construída com o mesmo mecanismo pai-filho (a lição 6 vai explicar que ela escolheu um pai diferente para as ferramentas), sem coletor, sem backend, sem dependências. Se um dia você precisar mesmo conectar OTLP, os campos já estarão lá.

## 💻 Exercícios

<!-- exercises -->

### Nível 1: Desenhe 14 registros planos como uma árvore

Abaixo estão 14 registros de span de uma execução de agente, um objeto JSON por linha. Eles estão escritos **em ordem de horário de fim** (um span só sabe sua duração quando termina), então os filhos aparecem muitas vezes antes dos pais.

Para o problema ficar curto, dobrei o registro filho de “espera de permissão” de cada ferramenta em um campo `wait_ms` no registro da ferramenta e mantive só o registro filho de execução; `end_ms` está em milissegundos relativos ao início desta execução.

```json
{"span_id":"a1b2c3d4e5f60002","parent_span_id":"a1b2c3d4e5f60001","trace_id":"4bf92f3577b34da6a3ce929d0e0e4736","name":"llm_request","prompt_id":"p-9c41","end_ms":1180,"dur_ms":1140,"model":"sonnet","tokens_in":3120,"tokens_out":186}
{"span_id":"a1b2c3d4e5f60004","parent_span_id":"a1b2c3d4e5f60003","trace_id":"4bf92f3577b34da6a3ce929d0e0e4736","name":"tool.execution","prompt_id":"p-9c41","end_ms":1455,"dur_ms":215}
{"span_id":"a1b2c3d4e5f60003","parent_span_id":"a1b2c3d4e5f60001","trace_id":"4bf92f3577b34da6a3ce929d0e0e4736","name":"tool","prompt_id":"p-9c41","end_ms":1460,"dur_ms":260,"tool":"Read","wait_ms":40}
{"span_id":"a1b2c3d4e5f60005","parent_span_id":"a1b2c3d4e5f60001","trace_id":"4bf92f3577b34da6a3ce929d0e0e4736","name":"llm_request","prompt_id":"p-9c41","end_ms":3050,"dur_ms":1570,"model":"sonnet","tokens_in":4980,"tokens_out":312}
{"span_id":"9f8e7d6c5b4a0001","traceparent":"00-4bf92f3577b34da6a3ce929d0e0e4736-a1b2c3d4e5f60007-01","name":"build.compile","service":"repo-build-script","end_ms":5100,"dur_ms":1500}
{"span_id":"a1b2c3d4e5f60007","parent_span_id":"a1b2c3d4e5f60006","trace_id":"4bf92f3577b34da6a3ce929d0e0e4736","name":"tool.execution","prompt_id":"p-9c41","end_ms":5210,"dur_ms":1810}
{"span_id":"a1b2c3d4e5f60006","parent_span_id":"a1b2c3d4e5f60001","trace_id":"4bf92f3577b34da6a3ce929d0e0e4736","name":"tool","prompt_id":"p-9c41","end_ms":5220,"dur_ms":2140,"tool":"Bash","wait_ms":320}
{"span_id":"a1b2c3d4e5f6000d","parent_span_id":"a1b2c3d4e5f60001","trace_id":"4bf92f3577b34da6a3ce929d0e0e4736","name":"hook","prompt_id":"p-9c41","end_ms":5310,"dur_ms":70,"hook_event":"PostToolUse"}
{"span_id":"a1b2c3d4e5f6000a","parent_span_id":"a1b2c3d4e5f60009","trace_id":"4bf92f3577b34da6a3ce929d0e0e4736","name":"llm_request","prompt_id":"p-9c41","end_ms":6900,"dur_ms":1500,"model":"sonnet","tokens_in":11240,"tokens_out":840}
{"span_id":"a1b2c3d4e5f6000c","parent_span_id":"a1b2c3d4e5f6000b","trace_id":"4bf92f3577b34da6a3ce929d0e0e4736","name":"tool.execution","prompt_id":"p-9c41","end_ms":7470,"dur_ms":520}
{"span_id":"a1b2c3d4e5f6000b","parent_span_id":"a1b2c3d4e5f60009","trace_id":"4bf92f3577b34da6a3ce929d0e0e4736","name":"tool","prompt_id":"p-9c41","end_ms":7480,"dur_ms":528,"tool":"Grep","wait_ms":0}
{"span_id":"a1b2c3d4e5f60009","parent_span_id":"a1b2c3d4e5f60008","trace_id":"4bf92f3577b34da6a3ce929d0e0e4736","name":"tool.execution","prompt_id":"p-9c41","end_ms":8355,"dur_ms":3015}
{"span_id":"a1b2c3d4e5f60008","parent_span_id":"a1b2c3d4e5f60001","trace_id":"4bf92f3577b34da6a3ce929d0e0e4736","name":"tool","prompt_id":"p-9c41","end_ms":8360,"dur_ms":3030,"tool":"Agent","wait_ms":10,"agent":"code-searcher"}
{"span_id":"a1b2c3d4e5f60001","trace_id":"4bf92f3577b34da6a3ce929d0e0e4736","name":"interaction","prompt_id":"p-9c41","end_ms":8420,"dur_ms":8420}
```

Sem escrever código, use papel e caneta ou um editor de texto para completar:

1. Reconstrua esses 14 registros como uma árvore de trace indentada. Irmãos no mesmo nível devem ser ordenados por **horário de início**, de cima para baixo (horário de início = `end_ms - dur_ms`). Cada linha deve mostrar nome e duração; marque o nome da ferramenta nas ferramentas.
2. Responda: nesta execução, os tokens consumidos pelo subagente contam para qual prompt? Por quê? Calcule o total de tokens desse prompt.
3. Responda: qual **único** registro consegue provar que `build.compile` foi disparado pela **segunda** chamada de ferramenta? Especifique qual campo e qual parte do valor dele.

<!-- rubric -->

Lista de autoavaliação:

- [ ] A raiz da árvore é o único registro que não tem nem `parent_span_id` nem `traceparent` — não identifica pai nenhum (`interaction`, 8420ms) — note que `build.compile` também não tem `parent_span_id`, mas usa `traceparent` para identificar um pai, então não é a raiz
- [ ] A raiz tem exatamente 6 filhos diretos: dois `llm_request`, três `tool`, um `hook`, ordenados por horário de início como llm → Read → llm → Bash → hook → Agent
- [ ] Cada uma das três chamadas de ferramenta tem um filho `tool.execution` na posição correta
- [ ] `build.compile` fica pendurado sob o `tool.execution` do Bash (`...60007`), não sob o span `tool` do Bash nem sob a raiz
- [ ] Os três registros do subagente (`llm_request`, `tool` Grep, `tool.execution` do Grep) estão aninhados dentro da subárvore do `tool.execution` da ferramenta Agent (`...60009`), não colocados como filhos da raiz
- [ ] A questão 2 responde “conta para o prompt `p-9c41`” e dá como motivo que os spans do subagente se aninham sob o span de ferramenta do agente pai, e a cadeia de delegação completa é um único trace
- [ ] O total de tokens está correto: entrada 19340, saída 1338, e nota que a execução do subagente responde por mais da metade da entrada
- [ ] A questão 3 aponta o registro `build.compile` e explica que a base é que o segmento de id do span pai no `traceparent` dele é igual ao id do span de execução do Bash
- [ ] Não coloca por engano o registro `hook` como filho de alguma ferramenta (ele é filho direto da raiz)

<!-- answer -->

**1. Árvore reconstruída**

```text
interaction  p-9c41  8420ms                                   a1b2c3d4e5f60001
├─ llm_request  1140ms  in 3120 / out 186                     a1b2c3d4e5f60002
├─ tool Read  260ms (wait 40ms)                               a1b2c3d4e5f60003
│  └─ tool.execution  215ms                                   a1b2c3d4e5f60004
├─ llm_request  1570ms  in 4980 / out 312                     a1b2c3d4e5f60005
├─ tool Bash  2140ms (wait 320ms)                             a1b2c3d4e5f60006
│  └─ tool.execution  1810ms                                  a1b2c3d4e5f60007
│     └─ build.compile  1500ms (emitido pelo script de build) 9f8e7d6c5b4a0001
├─ hook PostToolUse  70ms                                     a1b2c3d4e5f6000d
└─ tool Agent(code-searcher)  3030ms (wait 10ms)              a1b2c3d4e5f60008
   └─ tool.execution  3015ms                                  a1b2c3d4e5f60009
      ├─ llm_request  1500ms  in 11240 / out 840              a1b2c3d4e5f6000a
      └─ tool Grep  528ms                                     a1b2c3d4e5f6000b
         └─ tool.execution  520ms                             a1b2c3d4e5f6000c
```

Método de reconstrução: primeiro separe os registros sem pai — você vai encontrar **dois** registros sem `parent_span_id`: `interaction` e `build.compile`. Entre eles, `build.compile` usa `traceparent` para identificar um pai (essa é exatamente a porta de entrada da questão 3), então a raiz verdadeira é o `interaction` que sobrou. Os demais reconhecem seus pais pelo `parent_span_id`. O arquivo está escrito em ordem de horário de fim, então lendo de cima para baixo você vai ver os filhos aparecerem primeiro — isso é normal e não atrapalha a reconstrução. A ordenação no mesmo nível usa o horário de início: `llm_request` começa em 40, Read em 1200, o segundo `llm_request` em 1480, Bash em 3080, hook em 5240, Agent em 5330.

**2. Para qual prompt contam os tokens do subagente**

Contam para o prompt `p-9c41`. Depois que o subagente é gerado pela ferramenta Agent, os spans `llm_request` e `tool` dele se aninham sob o span de ferramenta do agente pai, e a cadeia de delegação completa é um único trace[^S6] — a requisição de modelo do subagente é filha da “execução da ferramenta Agent”, que é neta deste prompt. Nenhum registro escapa para fora da árvore.

Total de tokens deste prompt:

- Entrada 3120 + 4980 + 11240 = **19340**
- Saída 186 + 312 + 840 = **1338**

Só a única execução do subagente responde por 11240 da entrada, cerca de 58%. Se você contabilizasse “só as requisições de modelo emitidas pelo loop principal”, o custo deste prompt seria subnotificado em mais da metade — esse tipo de omissão é a norma em sistemas multiagente, porque a parte delegada costuma ser o grosso.

**3. O registro que prova que `build.compile` pertence à segunda chamada de ferramenta**

É o próprio registro `build.compile` (`span_id` é `9f8e7d6c5b4a0001`). Ele parece diferente dos outros registros: sem `prompt_id`, sem `parent_span_id`, porque foi emitido pelo script de build em **outro processo**, que não faz ideia do que é um prompt. O que ele tem é um `traceparent`:

```text
00-4bf92f3577b34da6a3ce929d0e0e4736-a1b2c3d4e5f60007-01
   └─ trace id ─────────────────────┘└  id do span pai ┘
```

O terceiro segmento, `a1b2c3d4e5f60007`, é o id do span pai dele, e esse é exatamente o span filho `tool.execution` da ferramenta Bash. Ordenadas por horário de início, as três chamadas de ferramenta são Read (1200), Bash (3080), Agent (5330) — Bash é a segunda. Então o span deste comando pertence à segunda chamada de ferramenta, com base no contexto de trace e não em marcas de tempo ou chutes.

Isso também é a cara real da propagação entre processos: a CLI coloca o contexto de trace do span da execução de ferramenta ativa na variável de ambiente `TRACEPARENT` do subprocesso[^S4], e os spans emitidos pelo subprocesso se aninham automaticamente sob aquela execução de ferramenta[^S6].

<!-- hint -->

Faça só a etapa mecânica primeiro: copie os 14 registros em duas colunas (`span_id`, `parent_span_id`) e você vai encontrar **duas** linhas sem pai — você não copiou errado; uma delas esconde a porta de entrada da questão 3. O resto é um jogo de “ache o seu pai”. Não deixe a ordem do arquivo te enganar — os registros estão escritos em ordem de horário de fim, então filhos aparecerem antes dos pais é normal.

<!-- hint -->

Os campos de um dos registros parecem diferentes dos demais: ele não tem `prompt_id`, mas tem um `traceparent`. Quebre essa string em quatro segmentos pelo `-`, e o terceiro segmento é o id do span pai dele. Pegue esse id e procure-o nos campos `span_id` dos outros registros, e a questão 3 está resolvida.

### Nível 2: Três painéis vazios, dê um caminho de investigação para cada um

Sem código. Os três cenários abaixo vestem a mesma aparência de “o painel parece errado”, mas por baixo são três mecanismos diferentes. Para cada um, escreva: **causa mais provável**, **em que ordem você verificaria** e **como lidar depois que a verificação passar**. Todo julgamento precisa apontar de volta para um mecanismo específico coberto nesta lição — não atribua tudo a “a configuração estava errada”.

- **Cenário A**: Exportação de telemetria ligada, subida para produção, passou uma semana, o painel não tem dado nenhum. Nenhum span, nenhuma métrica, nenhum evento. O agente atendeu usuários normalmente a semana toda; ninguém reclamou.
- **Cenário B**: O painel de métricas está completamente normal — as contagens de token estão subindo, as curvas de custo estão se mexendo, as contagens de sessão batem. Mas você abre o backend de tracing, busca pela faixa de tempo de hoje e não há um único trace.
- **Cenário C**: Um script curto que roda em CI — toda vez que ele termina, o trace está “sem o rabo”: o span raiz está lá, as primeiras etapas estão lá, os dois ou três últimos spans de ferramenta sumiram. A mesma configuração numa máquina de desenvolvimento local, com execuções longas, mostra tudo certinho.

<!-- rubric -->

Lista de autoavaliação:

- [ ] Os três cenários recebem três mecanismos **diferentes**; você não juntou todos na mesma causa
- [ ] O cenário A captura “falha de exportação é silenciosa por padrão”: o agente roda normalmente, a telemetria é descartada, a aplicação não erra, então zero dado não pode ser lido como “sem problemas”
- [ ] A etapa 1 de verificação do cenário A é procurar no backend aquela métrica de contagem de início de sessão, e a etapa 2 é ligar o modo de depuração para ver os erros de exportação
- [ ] O cenário B captura “os três sinais têm cada um sua própria chave de ativação e seu próprio exportador”, apontando explicitamente que métricas funcionarem não significa que traces funcionem
- [ ] O cenário B menciona que a chave de telemetria aprimorada para traces precisa de confirmação separada
- [ ] O cenário C captura “exportação em lote + processo de vida curta”: o descarregamento tem um teto de timeout, processo morto significa buffer inteiramente perdido
- [ ] O cenário C cita os intervalos padrão de exportação (traces e logs, 5 segundos) e os relaciona ao tempo de vida do script
- [ ] O tratamento do cenário C inclui “encurtar o intervalo de exportação” ou “garantir que o processo saia de forma limpa, não deixar a CI matá-lo antes da hora”, e não aumentar o tamanho do lote
- [ ] Em pelo menos um lugar considera a possibilidade de “os dados chegaram de verdade, mas estão misturados sob o mesmo `service.name` e não dá para achar”, do tipo “procurar no lugar errado”, e a coloca depois do pipeline em vez de antes
  
<!-- answer -->

**Cenário A: uma semana, zero dado**

Causa mais provável: o pipeline nunca conectou. Falha de exportação é silenciosa por padrão — quando o endpoint está inacessível ou o backend rejeita os dados, o agente continua rodando normalmente e a CLI descarta a telemetria sem levantar erro na sua aplicação[^S6]. Então “uma semana sem dados” e “uma semana sem problemas” ficam idênticos do seu lado; você não pode usar isso para inferir a saúde do agente.

Sequência de verificação:

1. Procure no backend a métrica `claude_code.session.count` — o Claude Code a emite quando uma sessão começa[^S4]. Se você conseguir consultá-la, o caminho dos dados está vivo e o problema está na camada de consulta ou de painel; se não conseguir, siga para a próxima etapa.
2. Rode `claude --debug` e procure erros de exportação OTel no log de depuração[^S4]. Endpoint errado, certificado ruim, rejeição do backend — tudo isso vai aparecer aqui.
3. Se as duas etapas parecerem normais e você ainda não vir nada, aí sim desconfie de “estar procurando no lugar errado”: por padrão a CLI reporta `service.name` como `claude-code`, e se vários agentes ou outros serviços exportam para o mesmo coletor, seus dados podem estar misturados sob o nome de serviço de outra pessoa; sobrescreva o nome do serviço e adicione atributos de recurso, e você consegue filtrar por agente[^S6].

Tratamento: depois de corrigir, não espere “a próxima vez que algo quebrar” para confirmar — rode uma sessão na hora e veja se aquela métrica de contagem aparece no backend. Use uma ação que garantidamente produz dados para verificar o caminho; é mais confiável do que esperar por um erro incerto.

**Cenário B: tem métricas, não tem traces**

Causa mais provável: o sinal de trace não está ligado, ou o exportador dele não está configurado. A CLI exporta três sinais independentes, cada um com sua própria chave de ativação e seu próprio exportador, então você pode ligar só os que precisa[^S6] — invertendo isso, métricas funcionarem não implica que traces também funcionem; são duas configurações separadas.

Sequência de verificação:

1. Verifique separadamente a chave de ativação e o endpoint do exportador do caminho de trace; não reaproveite a conclusão de que “as métricas conseguem sair”.
2. Confirme se `CLAUDE_CODE_ENHANCED_TELEMETRY_BETA=1` está definido — cada etapa do loop do agente virar um span inspecionável acontece quando essa chave está ligada[^S6]. Sem a chave, você vai ver uma visão de trace magra ou completamente vazia.
3. Se as duas chaves estiverem ligadas, aí rode `--debug` e veja se o exportador de traces tem erros próprios no log de depuração[^S4]. O exportador de métricas e o de traces podem apontar para endpoints diferentes; um mal configurado enquanto o outro funciona normalmente é uma situação muito comum.

Tratamento: depois de preencher a chave e o endpoint do trace, rode uma sessão com chamadas de ferramenta, vá ao backend de tracing e ache aquela árvore por trace id ou faixa de tempo, e confirme que o span raiz e os filhos estão todos lá.

**Cenário C: o trace do script curto está sem o rabo**

Causa mais provável: a exportação em lote colidiu com um processo de vida curta. A CLI agrupa a telemetria em lotes e exporta em intervalos; numa saída limpa ela tenta descarregar os dados pendentes, mas o descarregamento é limitado por um timeout curto, então spans ainda podem ser perdidos se o coletor demorar a responder; se o processo for morto antes de a CLI desligar, tudo o que ainda estiver no buffer do lote é perdido[^S6]. Por padrão, traces e logs são exportados a cada 5 segundos[^S6] — um script de CI que termina em poucos segundos aposta toda a telemetria da ponta final no descarregamento de saída, e se o descarregamento for cortado pelo timeout (ou se a CI simplesmente matar o processo), ela some; quanto maior o intervalo de exportação, mais coisa se acumula no buffer esperando o descarregamento. Isso também explica por que execuções longas locais não mostram problema: quando você roda tempo suficiente, todo lote tem chance de ser enviado no intervalo regular.

Sequência de verificação:

1. Numa execução que está “sem o rabo”, verifique se os spans perdidos são justamente os **últimos no tempo**. Se a perda estiver distribuída aleatoriamente pela árvore inteira, não é este mecanismo — precisa voltar e desconfiar de outra coisa.
2. Encolha o intervalo de exportação para bem menos que a duração total do script, rode de novo e veja se o rabo volta.
3. Verifique se a CI está esperando o processo sair por conta própria. Se a tarefa usa um kill por timeout, ou se o contêiner é reciclado logo depois que o processo principal sai, a CLI não tem chance de fazer aquele descarregamento.
4. Tente de novo com um coletor local, de resposta rápida, para reproduzir. Se trocar resolver, isso significa que o backend lento comeu o timeout do descarregamento.

Tratamento: encurte o intervalo de exportação e garanta que o script deixe a CLI sair de forma limpa (não coloque na etapa de CI um timeout que justamente corte o processo de desligamento). A direção é “fazer os dados serem enviados com mais frequência, deixar o processo viver o suficiente”, e não aumentar o tamanho do lote — quanto maior o lote, pior a perda quando o último lote é descartado.

<!-- hint -->

Dê um rótulo a cada cenário antes de escrever: A é “faltou tudo”, B é “faltou um tipo”, C é “faltou um trecho”. O **formato** da perda difere, o que significa que o mecanismo difere — na seção “o pipeline pode mentir para você” desta lição há três formatos, cada um com sua explicação correspondente.

<!-- hint -->

Pergunte-se primeiro, para cada cenário: “Este fenômeno pode ser explicado por ‘a telemetria é descartada em silêncio mas ninguém erra’?” Se sim, vá investigar na direção do pipeline; se não, então pergunte “faltou tudo, faltou um tipo de sinal ou faltou o último trechinho de tempo?” A resposta da terceira pergunta vai te mandar direto para “os sinais são independentes” ou para “exportação em lote + timeout do descarregamento”.

<!-- /exercises -->

## Recapitulação

- Logs estruturados resolveram “os registros são detalhados o bastante”, mas não resolveram “que relação os registros têm”. IDs de correlação são a primeira etapa para adicionar relações: um prompt pode disparar várias chamadas de API e várias ferramentas, e `prompt.id` amarra todos esses eventos de volta ao único prompt que os disparou; a jogada inicial de depuração é filtrar por esse valor[^S4].
- Um span é o registro de um pedaço de trabalho com começo e fim; um trace é a árvore costurada pelas relações pai-filho. O tracing distribuído liga cada prompt do usuário às requisições de API e execuções de ferramenta que ele dispara como spans, de modo que a requisição completa se lê como um único trace no seu backend de tracing[^S4].
- A hierarquia é fixa: cada prompt abre um span raiz `claude_code.interaction`, e chamadas de API, chamadas de ferramenta e execuções de hook são filhos dele; os spans de ferramenta têm dois spans filhos que gravam separadamente o tempo de espera por permissão e o tempo de execução propriamente dita[^S4]. Com a telemetria aprimorada ligada, cada etapa do loop do agente vira um span inspecionável; traces são a visão mais detalhada de uma execução[^S6].
- Árvores conseguem continuar conectadas através de fronteiras de processo: os spans do subagente se aninham sob o span de ferramenta do agente pai, e a cadeia de delegação completa se lê como um único trace; o SDK injeta `TRACEPARENT` e `TRACESTATE` no subprocesso da CLI, então a execução do agente aparece dentro do trace da sua aplicação em vez de virar uma raiz desconectada[^S6]; descendo mais, subprocessos Bash herdam `TRACEPARENT`[^S4], e os spans emitidos por comandos se aninham sob o span daquela execução de ferramenta[^S6].
- Colocar o tracing completo no ar habilita o diagnóstico sistemático de falhas[^S1]; e monitorar apenas padrões de decisão e estruturas de interação, sem olhar o conteúdo das conversas, é suficiente para diagnosticar causas-raiz e descobrir comportamentos inesperados[^S1]. O mecanismo se alinha exatamente: a telemetria é estrutural por padrão — durações, nomes de modelo e nomes de ferramenta são gravados em cada span; conteúdo não é gravado por padrão[^S6]; o conteúdo dos prompts também é, por padrão, só comprimento; para incluir conteúdo é preciso definir uma chave explicitamente[^S4].
- Métricas, eventos de log e traces são três sinais independentes, cada um com sua própria chave de ativação e seu próprio exportador, então você pode ligar só os que precisa[^S6] — adoção incremental, sem precisar apostar tudo de uma vez.
- O próprio pipeline de observabilidade pode mentir para você: falha de exportação é silenciosa por padrão, o agente roda normalmente enquanto a telemetria é descartada e nenhum erro é levantado[^S6]; a exportação em lote tenta descarregar numa saída limpa, mas é limitada por um timeout curto, e se o processo for morto o buffer é perdido por inteiro[^S6]; por padrão métricas a cada 60 segundos, traces e logs a cada 5 segundos[^S6], então execuções curtas precisam de intervalos menores. A primeira coisa ao investigar é verificar a própria instrumentação: procure no backend aquela métrica de contagem de sessão[^S4] e, se não estiver lá, ligue `--debug` para ver os erros de exportação[^S4].
- Duas armadilhas de configuração: vários agentes compartilhando um backend precisam sobrescrever `service.name` e adicionar atributos de recurso para ficarem distinguíveis[^S6]; ao rodar pelo SDK, não defina `console` como exportador[^S6].
- O mesmo lote de eventos estruturados, lido de outro jeito, é material de auditoria: com atributos de identidade anexados, decisões de ferramenta, resultados de ferramenta, conexões MCP e mudanças de modo de permissão viram uma trilha de auditoria por usuário que você pode encaminhar para um SIEM[^S6], e os atributos de identidade de cada evento amarram as chamadas de ferramenta de volta a quem as disparou[^S4].
- Não há orientação primária sobre taxas de amostragem e janelas de retenção, então este curso não dá números. Seu próprio harness também não precisa de OTel completo — a lição 6 usa um `trace_id` mais campos de ponteiro para o pai mais impressão indentada para obter uma árvore construída com o mesmo mecanismo pai-filho.

[>> Lição 5: Sondas nas comportas: hooks e um fluxo de depuração](./05-hooks-and-debugging.md)
