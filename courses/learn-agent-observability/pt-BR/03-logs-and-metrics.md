# Lição 3: Logs estruturados e métricas: transformando cada etapa em dado

> Objetivos de aprendizado:
> - Explicar as quatro perguntas que a observabilidade em produção precisa responder, e reconhecer que são os mesmos números das métricas de avaliação, apenas usados de outro jeito
> - Projetar logs estruturados para o seu harness: um registro por requisição ao modelo, um por chamada de ferramenta, com campos cobrindo duração, tokens, nome da ferramenta e erros
> - Mapear padrões de métricas para correções específicas usando leituras diagnósticas, e perceber quando sinais como “zero erros” estão distorcidos pela forma como são registrados
>
> Pré-requisitos: lições 1 e 2 concluídas, e um loop de harness funcionando (curso 7 desta série) | Anterior: [<< Lição 2](./02-transcripts-as-evidence.md) | Próxima: [Lição 4 >>](./04-tracing.md)

## Uma execução você lê, duzentas você não

No fim da lição 2 você fez algo que vale a pena: leu uma transcrição bruta do começo ao fim e pegou três problemas que o agente nunca mencionou. O método funciona, e a evidência é sólida. O problema é que aquilo era **uma** execução.

Agora coloque o mesmo agente em produção: duzentas execuções por dia, cada uma com uma dúzia de iterações do loop, somando duas ou três mil idas e voltas de chamada de ferramenta. Segunda de manhã alguém diz “o lote de sexta à tarde pareceu especialmente lento”, e como você responde? Ler duzentas transcrições obviamente não é realista. E mesmo que lesse, você ainda não conseguiria responder onde estava lento — esse julgamento exige olhar a distribuição entre execuções, não ler uma amostra. Olhos humanos respondem “por que ele fez isso nesta execução específica”, mas não “como este lote diferiu do lote anterior”.

Então o trabalho desta lição cabe em uma frase: **transformar perguntas que exigem ler transcrições em perguntas que uma única consulta responde.** A primeira é “por que ele buscou a mesma palavra repetidamente desta vez”; a segunda é “qual ferramenta foi mais chamada nos últimos sete dias, e os erros estão todos no mesmo parâmetro”. A regra da lição 2 continua de pé — transcrições brutas são evidência de primeira mão, o autorrelato do agente não vale. Esta lição só guarda a mesma evidência em outro formato, para que ela possa ser lida por pessoas E também filtrada, agregada e analisada por distribuição.

## Quatro perguntas que ambientes de produção precisam responder

A documentação oficial lista quatro coisas que você precisa enxergar com clareza na observabilidade em produção: **quais ferramentas foram chamadas, quanto tempo cada requisição ao modelo levou, quantos tokens foram gastos e onde as falhas ocorreram**[^S6]. Ao tomar decisões de design, você vai voltar a essas quatro perguntas repetidamente: este campo ajuda a responder uma delas? Se não, é ruído.

Isso pode parecer familiar. O curso 10 desta série usou o mesmo conjunto de números ao falar de avaliação: além da acurácia do estado final, ele recomendava coletar o tempo de execução de chamadas de ferramenta individuais e de tarefas inteiras, a contagem total de chamadas de ferramenta, o consumo total de tokens e os erros de ferramenta[^S3]. Mesmas métricas, duas aparições, usos diferentes:

| Este número | Curso 10: na trilha de avaliação | Esta lição: no monitoramento diário |
| --- | --- | --- |
| Tempo de execução de chamadas de ferramenta e de tarefas inteiras | A mudança deixou a tarefa mais lenta | Qual janela de tempo ficou lenta hoje, e é o modelo ou são as ferramentas |
| Contagem total de chamadas de ferramenta | Qual versão do prompt dá menos voltas | Detectar novos padrões de chamada repetitiva que apareceram em produção |
| Consumo total de tokens | Calcular o custo de rodar a avaliação inteira | Acompanhar o gasto diário, achar as sessões que comem tokens |
| Erros de ferramenta | A mudança introduziu novas falhas | Ver qual ferramenta está instável, e em qual parâmetro ela está falhando |

A diferença não está nos números — está em **contra o que você os compara**. Na avaliação, você compara “antes da mudança contra depois da mudança” sobre um conjunto de teste fixo, então os números precisam ser reproduzíveis. No monitoramento, você compara “hoje contra os últimos sete dias” ou “esta sessão contra outras sessões”, então a referência é o histórico das próprias execuções, o que significa que os números precisam ser contínuos, marcados no tempo e fatiáveis por dimensão. Esta lição cobre o segundo caso.

## Logs estruturados: um registro por etapa

> Esta seção descreve uma prática de engenharia. Não há orientação autoritativa sobre como nomear campos de log ou em qual formato gravar em disco — o que segue é um ponto de partida padrão que funciona, não uma especificação oficial. Os nomes de campo tomam emprestado termos que de fato aparecem em materiais oficiais (session id, prompt id, tool name, `tool_input`, `tool_response`, `duration_ms`, contagens de token, `error`), de modo que, quando você depois integrar com telemetria oficial, não precisará remapear o vocabulário.

### Unidade de registro: um para requisição ao modelo, um para chamada de ferramenta

O loop do agente tem naturalmente dois tipos de “etapa”: uma requisição ao modelo e uma execução de ferramenta. Elas têm atributos bem diferentes — requisições ao modelo têm contagens de token mas não têm nome de ferramenta; execuções de ferramenta são o inverso — mas compartilham o mesmo lote de campos de contexto (qual sessão, qual prompt, quanto tempo).

Então: **grave um registro por requisição ao modelo, um por chamada de ferramenta** e use um campo `type` para distingui-los. Não comprima uma iteração inteira do loop em um registro só — assim você nunca consegue calcular a divisão entre tempo de modelo e tempo de ferramenta. Também não grave apenas um registro-resumo quando a tarefa terminar — se a tarefa travar no meio, você nem vai saber em qual etapa ela travou.

### Formato: JSON Lines, um objeto por linha

JSON Lines (comumente escrito JSONL) é exatamente o que o nome diz: um arquivo, cada linha é um objeto JSON completo, sem vírgulas entre linhas e sem array externo envolvendo tudo.

```json
{"ts":"2026-08-26T09:12:03.118Z","type":"model_call","session_id":"s-4f1","prompt_id":"p-01","duration_ms":1840,"input_tokens":2310,"output_tokens":180}
{"ts":"2026-08-26T09:12:05.002Z","type":"tool_call","session_id":"s-4f1","prompt_id":"p-01","tool":"search_docs","duration_ms":412}
```

As razões para escolhê-lo são todas prosaicas, mas todas válidas: escritas em modo append funcionam sem precisar voltar e acrescentar um `]` no fim do arquivo, então, mesmo que o processo seja morto, você não fica com um arquivo sintaticamente quebrado (a última linha pode estar pela metade, mas todas as anteriores continuam parseáveis — essa é também a origem no mundo real do requisito do exercício de que “linhas ruins são reportadas mas não interrompem o processamento”). Quando o arquivo cresce para centenas de megabytes, você consegue processá-lo em streaming, linha a linha. Cada linha é autocontida, então `grep` consegue filtrar, `jq` consegue processar e olhos humanos conseguem ler.

Compare isso com os logs em prosa que muitos harnesses já têm — `[09:12:05] search_docs retornou 3 resultados, levou 412ms`. Lê-se bem, mas só pode ser lido por humanos. Para responder “qual a duração média de `search_docs` nos últimos sete dias”, você precisaria escrever regex para extrair aquele `412ms`; se alguém trocar “levou” por “decorrido”, a regex silenciosamente começa a retornar zero. Logs em prosa codificam a estrutura dentro da linguagem natural, e linguagem natural é para humanos decodificarem. Logs estruturados invertem isso: a estrutura fica nos campos, e máquinas leem sem ambiguidade. **Podem ser filtrados, agregados e analisados por distribuição** — essas três habilidades são o que você de fato precisa ao passar de uma execução para duzentas.

### Vocabulário de campos

Contexto que vai em todo registro: `ts` (timestamp ISO 8601 com milissegundos e fuso), `type` (`model_call` ou `tool_call`), `session_id` (identificador de uma sessão, constante ao longo de vários turnos), `prompt_id` (identificador de um prompt do usuário; todas as requisições ao modelo e chamadas de ferramenta que ele dispara compartilham este valor), `duration_ms`. Requisições ao modelo acrescentam `model`, `stop_reason`, `input_tokens` / `output_tokens`. Chamadas de ferramenta acrescentam `tool`, `tool_use_id` (para parear com as respostas), `error` (presente apenas quando falha).

`prompt_id` é o campo menos vistoso aqui, mas o que se torna mais útil depois. Agora você só o está gravando em cada registro; a lição 4 vai usá-lo para circular registros espalhados em “eventos do mesmo prompt” e depois costurá-los numa árvore via relações pai-filho. Quanto ao input e ao valor de retorno da própria ferramenta (`tool_input` / `tool_response`) — **não grave o texto completo por padrão**; registre apenas o tamanho ou a contagem de bytes. A justificativa vem na penúltima seção.

### Integrando ao harness

O trecho abaixo se apoia no loop guiado por `stop_reason` do curso 7 desta série. Primeiro, o logger:

```javascript
// logger.mjs
import { appendFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';

const LOG_PATH = process.env.AGENT_LOG ?? './agent.jsonl';

export function createLogger({ sessionId = randomUUID() } = {}) {
  let promptId = null;
  return {
    startPrompt() {
      promptId = randomUUID();
      return promptId;
    },
    logRecord(fields) {
      const line = JSON.stringify({
        ts: new Date().toISOString(),
        session_id: sessionId,
        prompt_id: promptId,
        ...fields,
      });
      appendFileSync(LOG_PATH, line + '\n');
    },
  };
}
```

`logRecord()` faz uma coisa só: juntar o contexto comum com os campos de quem chamou em uma linha de JSON e anexá-la ao arquivo. Ele não julga, não formata, não faz nada “esperto” — quanto mais burro o logger, melhor, porque quando ele quebra você fica sem logs para consultar. Agora os dois pontos de instrumentação do loop:

```javascript
// loop.mjs
import { createLogger } from './logger.mjs';

// O ciclo de vida do logger é "uma sessão", não "um turno": crie-o uma vez
// quando a sessão começa e, para cada prompt, basta chamar startPrompt() para
// obter um novo prompt_id — o session_id permanece constante ao longo dos
// turnos, que é exatamente a origem dele. Não mova createLogger() para dentro
// de runTurn, ou cada turno vira uma nova sessão, tornando session_id uma
// duplicata de prompt_id.
const log = createLogger();

export async function runTurn({ client, model, tools, runTool, userInput }) {
  log.startPrompt();
  const messages = [{ role: 'user', content: userInput }];

  while (true) {
    // Ponto de instrumentação um: cada requisição ao modelo
    const t0 = Date.now();
    const response = await client.messages.create({ model, max_tokens: 2048, tools, messages });
    log.logRecord({
      type: 'model_call',
      model,
      stop_reason: response.stop_reason,
      duration_ms: Date.now() - t0,
      input_tokens: response.usage.input_tokens,
      output_tokens: response.usage.output_tokens,
    });

    if (response.stop_reason !== 'tool_use') return response;
    messages.push({ role: 'assistant', content: response.content });
    const results = [];

    for (const block of response.content.filter((b) => b.type === 'tool_use')) {
      // Ponto de instrumentação dois: cada chamada de ferramenta
      const t1 = Date.now();
      let output;
      let error = null;
      try {
        output = await runTool(block.name, block.input);
      } catch (e) {
        error = e.message;
        output = `Falha na execução da ferramenta: ${e.message}`;
      }
      log.logRecord({
        type: 'tool_call',
        tool: block.name,
        tool_use_id: block.id,
        duration_ms: Date.now() - t1,
        input_bytes: Buffer.byteLength(JSON.stringify(block.input), 'utf8'),
        output_bytes: Buffer.byteLength(String(output), 'utf8'),
        ...(error ? { error } : {}),
      });
      results.push({ type: 'tool_result', tool_use_id: block.id, content: String(output) });
    }

    messages.push({ role: 'user', content: results });
  }
}
```

Dois detalhes que valem ser destacados.

**Onde você inicia e para o cronômetro determina o que esse número significa.** O `t1` começa antes de `runTool` e para depois que ele retorna, então `duration_ms` inclui as retentativas da própria ferramenta, as esperas de backoff e as idas e voltas de rede, mas não a validação de parâmetros anterior à chamada. Você define essa fronteira; uma vez definida, escreva-a em algum lugar — daqui a seis meses, encarando um `duration_ms` de 30 segundos, você vai precisar saber se ele inclui retentativas.

**Erros vão tanto para o log quanto para o contexto do modelo.** O bloco `catch` enfia a mensagem de erro de volta no `tool_result`, então o agente a vê no turno seguinte. A orientação oficial encaixa perfeitamente aqui: quando uma chamada de ferramenta levanta um erro, a resposta deveria passar por engenharia de prompt para comunicar com clareza melhorias específicas e acionáveis, não um código de erro opaco ou um traceback[^S3]. Você pode escrever `ETIMEDOUT` no log, mas o que volta para o modelo deveria ser “A requisição deu timeout (30 segundos). Este endpoint tende a dar timeout em consultas de intervalo amplo; tente estreitar `date_range` para 7 dias ou menos.”

## Lendo métricas de forma diagnóstica

O valor de uma métrica não está em “hoje fizemos 1,283 chamadas de ferramenta” como número — está em **certos padrões apontarem para certas correções**. As correlações oficiais são todas pistas que vale a pena verificar primeiro:

**Muitas chamadas redundantes → parâmetros de paginação ou de limite de tokens talvez precisem de ajuste.** Muitas chamadas redundantes de ferramenta podem sugerir que vale redimensionar os parâmetros de paginação ou de limite de tokens[^S3]. O modelo precisa achar uma passagem na documentação, seu `search_docs` retorna apenas 5 resultados por página, então ele tem que folhear 28 páginas. Cada uma dessas 28 chamadas é legítima, cada uma tem sucesso, as métricas não mostram nenhum “erro”, mas todas são desperdício. Suba os resultados por página para 25 e esse padrão desaparece.

**Muitos erros de parâmetro inválido → a descrição da ferramenta provavelmente precisa de clareza ou exemplos.** Muitos erros de ferramenta por parâmetros inválidos podem sugerir que as ferramentas se beneficiariam de descrições mais claras ou exemplos melhores[^S3]. Esta é poderosa quando os erros se agrupam **no mesmo parâmetro**: sete erros todos dizendo `invalid parameter: date_range` significam que você deveria primeiro verificar se sua descrição explica em que formato esse parâmetro é esperado. A direção da investigação é a descrição da ferramenta, não o modelo.

**Acompanhar chamadas de ferramenta revela outras coisas.** Acompanhar chamadas de ferramenta ajuda a revelar fluxos de trabalho comuns que os agentes perseguem e oferece oportunidades de consolidar ferramentas[^S3]. Por exemplo, se 90% das chamadas de `read_file` são seguidas de `parse_config`, talvez você devesse oferecer um `read_config` de um passo só. Esse tipo de descoberta nunca emerge de uma única execução — só de agregados. Outro conjunto de leituras úteis: analise suas métricas de chamada de ferramenta para identificar as ferramentas mais usadas, as taxas de sucesso das ferramentas, os tempos médios de execução e os padrões de erro por tipo de ferramenta[^S4].

Alguns problemas são inerentemente problemas de magnitude — você não consegue dizer “onde está o muito” sem olhar agregados. A Anthropic documentou problemas iniciais desse tipo: vasculhar a web sem fim atrás de fontes inexistentes[^S1] — olhar qualquer busca isolada não vai sinalizar erro nenhum; você precisa enfileirar dezenas de chamadas para ver que “ele está girando no lugar”.

Uma experiência geral (sem fonte autoritativa): a duração média quase sempre mente. 99 chamadas de 80ms mais 1 chamada de 30 segundos dão média de 379ms, o que parece um pouco lento mas aceitável; a realidade são 99 chamadas rápidas mais uma completamente travada. Ao ler duração, olhe no mínimo a mediana e os percentis altos, ou vá direto aos poucos registros mais lentos.

## A armadilha ao ler números: o que o seu sinal está de fato contando

O jeito mais fácil de uma métrica mentir não é contando errado — é quando **o que ela conta não é o que você acha que ela conta**.

Olhe um design real de produto. O Claude Code faz retentativas internas de requisições de API que falham e emite um único evento `api_error` só depois de desistir — esse evento é o **sinal terminal** daquela requisição; tentativas intermediárias de retentativa não são registradas como eventos separados[^S4]. Esse design faz sentido: se cada retentativa registrasse um erro, o gráfico de erros seria inundado por tropeços transitórios que a recuperação automática resolveu, obscurecendo quantas requisições de fato falharam. O custo é que você tem que lembrar dessa semântica — “3 eventos api_error hoje” significa “3 requisições falharam em definitivo”, não “3 tropeços de rede”, e não diz nada sobre quantas retentativas bem-sucedidas estão escondidas embaixo.

A mesma página de documentação oferece uma leitura bem prática: para distinguir se uma sessão **se recuperou de um erro** ou **travou por completo**, agrupe os eventos por session id e verifique se existe um evento de requisição de API posterior ao erro[^S4]. Se há continuação, ela seguiu; se não há, parou ali. Esse julgamento custa um agrupamento mais uma verificação de “varrer se há registros depois do erro”, com custo-benefício altíssimo — o exercício do nível 2 faz você escrever exatamente isso. (JSONL escrito em append é naturalmente ordenado no tempo, então você não precisa ordenar explicitamente dentro de um único arquivo; quando os logs vêm de vários processos, ordene por `ts` antes.)

```agentmentor-check
{
  "id": "obs-zh-03-error-count-lies",
  "label": "O que “zero erros” de fato te diz",
  "prompt": "O painel mostra zero erros de ferramenta hoje. Um colega bate o olho e diz: 'Todas as execuções estão saudáveis hoje.' Seu harness faz retentativas silenciosas de falhas de chamada de ferramenta até três vezes, e só grava um registro de erro quando as três tentativas falham. Qual é o principal problema dessa conclusão?",
  "whyHere": "Você acabou de aprender a transformar cada etapa em registro; a próxima habilidade a praticar é perguntar o inverso: o que este número de fato registrou, e o que ele deixou de fora. Métricas normalmente mentem não porque a conta está errada, mas porque o método de registro define uma semântica que ninguém escreveu em lugar nenhum.",
  "mode": "single",
  "choices": [
    {
      "id": "a",
      "text": "Sem problema — zero erros realmente significa que a camada de ferramentas está saudável. Retentativas são detalhe interno que a ferramenta absorve; se nenhum erro foi registrado, é porque tudo teve sucesso no fim. Se algo deu errado hoje, só pode estar no julgamento do modelo.",
      "correct": false,
      "feedback": "“Não está no registro” não significa “não aconteceu” — esta é a versão em métricas da regra da lição 2. Sua lógica de retentativa determina quais condições uma falha precisa cumprir para ser escrita; a camada de ferramentas pode muito bem ter passado o dia instável, com cada tropeço silenciosamente capturado pela segunda ou terceira retentativa."
    },
    {
      "id": "b",
      "text": "Essa métrica conta 'as três retentativas falharam', não 'a chamada falhou'. Hoje pode ter tido muitas chamadas que falharam uma ou duas vezes e tiveram sucesso na retentativa, e a contagem de erros continua zero. A pista de verdade está na duração — retentativas empurram o duration_ms dessas chamadas para o dobro ou o triplo do normal.",
      "correct": true,
      "feedback": "Correto. A semântica de um sinal é definida pela forma como ele é registrado, independentemente de como a métrica se chama. Esse design em si está ok — o Claude Code faz a mesma coisa: retenta internamente requisições de API que falham e só emite um evento api_error quando desiste, sem registrar as retentativas intermediárias separadamente. A chave é saber o que o seu número conta e então procurar a pista que esse sinal não cobre — neste caso, a elevação geral na distribuição de duração."
    },
    {
      "id": "c",
      "text": "O problema é usar um número absoluto. Troque o painel para taxa de erro (erros ÷ contagem de chamadas) com média móvel de sete dias como referência — proporção mais tendência é o que reflete a saúde real.",
      "correct": false,
      "feedback": "Mudar o denominador não conserta um numerador que semanticamente exclui retentativas — 0 dividido por qualquer coisa continua 0. Taxa de erro é em si uma métrica útil, mas ela não salva um sinal cuja semântica nunca cobriu retentativas em primeiro lugar. O que precisa mudar aqui é o método de registro (registrar cada tentativa de retentativa com um número de sequência), não a fórmula."
    }
  ]
}
```

Dessa armadilha você extrai uma prática geral: **escreva uma frase para cada métrica dizendo “ela conta o quê”.** Escreva em comentários de código ou na documentação dos campos. “Contagem de erros de ferramenta = uma contagem depois que todas as retentativas falham” e “= uma contagem por exceção lançada” são duas métricas completamente diferentes, mas o nome pode ser idêntico, e quem for ler o painel daqui a seis meses não consegue diferenciar só pelo número.

## Custo e tokens: o número que mais vale acompanhar

Se você só pudesse acompanhar um número, acompanhe tokens.

Primeiro, a magnitude. Nos dados da Anthropic, agentes normalmente usam cerca de 4× mais tokens do que interações de chat, e sistemas multiagentes usam cerca de 15× mais tokens do que chats[^S1]. Essa é a observação deles sobre os próprios sistemas, não uma constante universal, mas ela ajusta uma expectativa: quando você converte um recurso de chat em um agente, a conta não sobe “um pouquinho”. Eles têm outra observação estatística: o uso de tokens sozinho explica 80% da variância, com o número de chamadas de ferramenta e a escolha do modelo como os outros dois fatores explicativos[^S1] — isso vem do parágrafo em que analisam o desempenho da avaliação, ou seja, “quais quantidades melhor explicam as diferenças entre execuções”, e tokens ficam em primeiro. Leia os dois juntos: tokens são ao mesmo tempo a maior parte da conta e o principal fator explicativo da variância entre execuções, então, entre as métricas candidatas, é a que mais vale acompanhar primeiro.

Duas notas práticas. **Números de custo são aproximações**: a documentação oficial diz que métricas de custo são aproximações; para dados oficiais de faturamento, consulte seu provedor de API[^S4]. Então o uso delas é “detectar anomalias, comparar tendências”, não “conciliar com o financeiro”. **Atribuição exige fatiar por dimensão**: métricas de uso podem ser usadas para acompanhar tendências entre times ou indivíduos, identificar sessões de alto consumo e também atribuir gasto a coisas específicas, como nome da Skill, nome do plugin ou tipo de subagente[^S4]. A implicação para harnesses próprios é direta — escreva essas dimensões nos registros de log desde o começo, não tente fazer a junção depois; juntar dimensões após o fato é basicamente refazer a execução. Além disso, copie as contagens de token diretamente do campo `usage` da resposta do modelo; não estime usando contagem de caracteres dividida por 4 ou métodos parecidos — esses erram bastante em cenários multilíngues, com muito código ou com imagens.

## Contenção: não invente limiares, não registre conteúdo completo

Depois de ter métricas, o impulso natural seguinte é configurar alertas: taxa de erro passa de 5%, alerta; duração no percentil alto passa de 10 segundos, alerta.

Pare. **Esta lição não dá nenhum número de limiar, porque não há nenhum nos materiais autoritativos.** A documentação oficial menciona que alertar é algo que alguém deveria fazer, mas nunca deu valores específicos — orçamentos de erro, metas de SLO, limiares de alerta, nenhum número. Se eu escrevesse aqui “recomendo 5%”, isso seria invenção minha, e você usaria. Limiares só podem crescer a partir da sua própria linha de base: registre duas semanas de dados primeiro, veja a faixa de flutuação normal, e então defina o que conta como anormal. Inverta a ordem e você acaba com uma regra que dá falso alarme três vezes por dia e é silenciada por todo mundo depois de duas semanas.

A divisão de responsabilidade também vale copiar dos produtos oficiais: o Claude Code emite apenas o fluxo bruto de eventos; detecção de anomalias, definição de linha de base, correlação entre sessões e alertas são responsabilidade do seu SIEM ou backend de observabilidade[^S4]. Para harnesses próprios isso significa: **o sistema observado não faz julgamentos por conta própria.** Não escreva “depois de 3 erros de ferramenta consecutivos, enviar e-mail” dentro do harness — essa lógica é publicada junto com o agente, reiniciada junto com o agente e quebra junto com o agente, e ela não tem dado histórico contra o que comparar.

Uma última coisa, também a mais fácil de virar incidente três meses depois do lançamento: **não registre conteúdo por padrão.** O Claude Code não coleta o conteúdo dos prompts do usuário por padrão — apenas o comprimento do prompt; para incluir conteúdo você precisa definir explicitamente uma variável de ambiente[^S4]. A telemetria do Agent SDK é igualmente estrutural por padrão — cada span registra duração, nome do modelo, nome da ferramenta; contagens de token são registradas quando a API retorna dados de uso, mas o conteúdo que seu agente lê e escreve não é registrado por padrão[^S6].

Esses dois padrões refletem o mesmo julgamento: informação estrutural (quem, quando, quanto tempo, qual ferramenta, quantos tokens) basta para responder à imensa maioria das perguntas de operação; conteúdo não. Uma vez que o conteúdo entra nos logs, ele segue os logs para os backups, para o armazenamento de longo prazo, para a vista de qualquer pessoa com permissão de leitura. Então seu harness deveria registrar por padrão `input_bytes: 137` em vez de `tool_input: {...}`; quando você realmente precisar investigar os parâmetros exatos de uma chamada específica, ligue o registro completo para aquele caso pontual. Isso não conflita com o “transcrições brutas são evidência de primeira mão” da lição 2: ao depurar você absolutamente deve ver a ida e volta completa, em um ambiente que você controla, para uma execução específica, e você termina assim que lê. Logs de produção têm por padrão retenção de longo prazo e visibilidade para várias pessoas — isso é outra coisa.

## Limites: onde esta lição para

A esta altura você tem uma pilha de registros estruturados e um conjunto de métricas legíveis. Três coisas que esta lição não faz: costurar relações pai-filho entre registros (quais requisições ao modelo um prompt disparou, qual chamada de ferramenta aninha sob qual subagente) exige identificadores de correlação para montar uma árvore — isso é a lição 4. Pendurar sondas nos pontos de verificação do ciclo de vida sem modificar o código do harness são os hooks da lição 5. Montar essa camada inteira sobre o seu harness do curso 7 e percorrer um exercício completo de depuração é a lição 6.

## 💻 Exercícios

<!-- exercises -->

### Nível 1: Leia três tipos de problema em uma tabela de métricas

Sem código. Abaixo está um resumo de métricas de cinco tarefas que seu agente rodou ontem:

| Tarefa | Tempo total | Chamadas de ferramenta | Tokens totais | Erros de ferramenta |
| --- | --- | --- | --- | --- |
| T1 Corrigir um teste que falha | 42s | 9 | 38,400 | 0 |
| T2 Achar o uso de uma API na documentação | 186s | 41 | 214,000 | 0 |
| T3 Gerar um relatório semanal | 71s | 12 | 44,900 | 7 |
| T4 Refatorar um módulo | 402s | 16 | 806,000 | 1 |
| T5 Responder uma pergunta de configuração | 55s | 8 | 31,200 | 0 |

Contexto adicional puxado dos logs:

- As 41 chamadas de T2 incluem 28 chamadas a `search_docs`, com apenas o parâmetro `offset` mudando: 0, 20, 40, 60…
- Os 7 erros de T3 vieram todos de `search_issues`, com texto de erro idêntico: `invalid parameter: date_range`
- As 16 chamadas de T4 incluem 4 chamadas de `read_file` lendo o mesmo arquivo de 3.000 linhas; o 1 erro é um timeout de `run_tests`
- T1 e T5 não mostram chamadas repetidas à mesma ferramenta

Responda três perguntas, declarando em qual número (ou detalhe de contexto) você se apoiou em cada uma: qual padrão aponta para “parâmetros de paginação ou de limite de tokens precisam de ajuste”? Qual aponta para “a descrição da ferramenta precisa de clareza ou exemplos”? Qual valor de tokens vale investigar primeiro, e por que é esse e não o segundo maior total? Mais um verdadeiro/falso: o 1 erro de T4 constitui um sinal de que “a descrição da ferramenta precisa ser corrigida”?

<!-- rubric -->

**Critérios de avaliação**

- A pergunta 1 responde T2, com base em “mesma ferramenta chamada 28 vezes com apenas o offset mudando” como padrão de chamada redundante, correspondendo a parâmetros de tamanho de página / limite de tokens precisando de ajuste. Responder apenas “maior contagem de chamadas” não basta — contagem alta em si não é o problema, a repetição é.
- A pergunta 2 responde T3, com base nos 7 erros se agrupando todos na mesma ferramenta e no mesmo parâmetro, o que caracteriza erros de parâmetro inválido, correspondendo a descrição da ferramenta precisando de clareza ou exemplos.
- A pergunta 3 responde T4, e o raciocínio precisa ser **tokens por chamada** (806,000 ÷ 16 = 50,375), não tokens totais. Precisa explicar que, embora T2 tenha o segundo maior total, por chamada ela fica em cerca de 5,200, na mesma faixa das outras; T4 está uma ordem de grandeza acima.
- O verdadeiro/falso responde “falso”: um erro isolado não é padrão; a orientação oficial fala em “**muitos** erros de parâmetro inválido” apontando para a descrição da ferramenta; além disso, este é timeout de execução, não parâmetro inválido.
- Do começo ao fim, não trata 5 amostras como conclusões estatísticas: sem percentuais, sem afirmações sobre “a produção como um todo”. Detectar um padrão e provar uma distribuição são duas coisas diferentes.

<!-- answer -->

**Resposta de referência**

**1. Parâmetros de paginação / limite de tokens: T2.** A base não é “41 chamadas é o maior número”, e sim que 28 dessas 41 são a mesma ferramenta com apenas o `offset` incrementando. O agente está folheando página por página porque uma página não lhe dá o suficiente para decidir. A leitura oficial desse padrão — muitas chamadas redundantes de ferramenta podem sugerir que vale redimensionar os parâmetros de paginação ou de limite de tokens[^S3]. Correção: suba os resultados por página de `search_docs` de 20 para 60 ou 100, ou acrescente um parâmetro `max_results` deixando o agente pedir o suficiente de uma vez; rode a mesma tarefa de novo depois da mudança e veja quantas dessas 28 chamadas se comprimem. Vale notar que boa parte daqueles 214,000 tokens veio desses 28 resultados paginados entrando repetidamente no contexto — chamadas redundantes e consumo de tokens são muitas vezes duas faces do mesmo problema.

**2. Descrição da ferramenta / acrescentar exemplos: T3.** A base é a distribuição dos erros: não espalhados por várias ferramentas, mas todos aterrissando no parâmetro `date_range` de `search_issues`, com texto de erro idêntico. Esse é o formato clássico de erros de parâmetro inválido; a orientação oficial dá como correção correspondente tornar as descrições de ferramenta mais claras e acrescentar exemplos[^S3]. Correção em dois passos: na descrição do parâmetro, especifique em que formato `date_range` é esperado e dê um exemplo copiável; ao mesmo tempo, reescreva a própria resposta de erro — não retorne `invalid parameter: date_range`, retorne “`date_range` exige o formato `YYYY-MM-DD/YYYY-MM-DD`, por exemplo `2026-08-01/2026-08-26`; você passou `last week`.”. Quando uma chamada de ferramenta levanta um erro, a resposta deveria comunicar com clareza melhorias específicas e acionáveis, não um código de erro opaco[^S3].

**3. Investigar tokens primeiro: T4.** Não porque tem o maior total (embora tenha), mas porque **tokens por chamada** está absurdamente fora de faixa: T1 cerca de 4,300, T2 cerca de 5,200, T3 cerca de 3,700, T5 fica em 3,900 — quatro tarefas agrupadas em um mesmo patamar; T4 é 806,000 ÷ 16 = 50,375, uma ordem de grandeza acima. Tarefas mais difíceis normalmente aparecem como mais chamadas (como T2), não como cada chamada custando dez vezes mais. O suspeito é óbvio: 4 chamadas de `read_file` lendo o mesmo arquivo de 3.000 linhas — cada leitura traz uma cópia completa, e cada cópia fica no contexto participando de toda requisição ao modelo subsequente. A verificação é simples: veja se os `input_tokens` dos registros `model_call` de T4 saltam em degraus depois de certos turnos.

Por que investigar **primeiro**: quatro tarefas têm tokens por chamada agrupados entre 3,700 e 5,200, T4 é 50,375 — fora por uma ordem de grandeza. Isso sozinho já basta para abrir um caso. A magnitude do outlier não precisa de outra justificativa.

**Verdadeiro/falso: falso.** Um erro não é um padrão. A orientação oficial fala em “**muitos** erros de parâmetro inválido” apontando para a descrição da ferramenta[^S3] — uma ocorrência só significa que aconteceu uma vez. E esta nem é um problema de parâmetro — `run_tests` dando timeout é uma questão da camada de execução (os testes de fato demoram, ou o timeout está apertado demais), sem relação com a descrição da ferramenta ser clara ou não. Anote e siga em frente; espere virar padrão.

**Sobre esta tabela em si**: cinco pontos de dado permitem detectar um padrão, não calcular proporções. “20% das tarefas de hoje tiveram erros” não significa nada quando dito a partir de 5 amostras — troque por cinco tarefas diferentes e esse número pode ser 0% ou 60%. Para provar uma distribuição, aumente a amostra; estas cinco te dizem onde cavar.

<!-- hint -->

**Dica 1**: as três perguntas correspondem a três leituras diferentes; não fixe em “qual número é o maior”. A pergunta 1 procura “a mesma coisa está sendo repetida”, a pergunta 2 procura “os erros estão espalhados ou agrupados”, a pergunta 3 procura “este número dividido por outro número continua parecendo normal”. As quatro colunas podem ser combinadas duas a duas — teste quais razões são interessantes.

<!-- hint -->

**Dica 2**: a armadilha da pergunta 3 está na expressão “e não o segundo maior total”. Divida os tokens de cada tarefa pela contagem de chamadas dela, enfileire as cinco razões, e você verá quatro agrupadas e uma disparando — essa é sua resposta. E não esqueça o verdadeiro/falso: “7 erros idênticos” e “1 erro” não têm a mesma força probatória.

### Nível 2: Escreva um script de agregação de logs

Este exige código que rode de verdade. Abaixo está um trecho de log JSONL do seu harness (20 registros, 4 prompts, 2 sessões). Salve como `agent.jsonl`:

```json
{"ts":"2026-08-26T09:12:03.118Z","type":"model_call","session_id":"s-4f1","prompt_id":"p-01","duration_ms":1840,"input_tokens":2310,"output_tokens":180}
{"ts":"2026-08-26T09:12:05.002Z","type":"tool_call","session_id":"s-4f1","prompt_id":"p-01","tool":"search_docs","duration_ms":412}
{"ts":"2026-08-26T09:12:05.460Z","type":"model_call","session_id":"s-4f1","prompt_id":"p-01","duration_ms":2260,"input_tokens":3480,"output_tokens":210}
{"ts":"2026-08-26T09:12:07.780Z","type":"tool_call","session_id":"s-4f1","prompt_id":"p-01","tool":"read_file","duration_ms":86}
{"ts":"2026-08-26T09:12:07.900Z","type":"model_call","session_id":"s-4f1","prompt_id":"p-01","duration_ms":1970,"input_tokens":4120,"output_tokens":330}
{"ts":"2026-08-26T09:18:41.004Z","type":"model_call","session_id":"s-4f1","prompt_id":"p-02","duration_ms":2010,"input_tokens":2280,"output_tokens":160}
{"ts":"2026-08-26T09:18:43.060Z","type":"tool_call","session_id":"s-4f1","prompt_id":"p-02","tool":"search_docs","duration_ms":455}
{"ts":"2026-08-26T09:18:43.560Z","type":"tool_call","session_id":"s-4f1","prompt_id":"p-02","tool":"search_docs","duration_ms":448}
{"ts":"2026-08-26T09:18:44.050Z","type":"tool_call","session_id":"s-4f1","prompt_id":"p-02","tool":"search_docs","duration_ms":437}
{"ts":"2026-08-26T09:18:44.530Z","type":"model_call","session_id":"s-4f1","prompt_id":"p-02","duration_ms":3120,"input_tokens":9640,"output_tokens":240}
{"ts":"2026-08-26T09:18:47.700Z","type":"tool_call","session_id":"s-4f1","prompt_id":"p-02","tool":"read_file","duration_ms":91}
{"ts":"2026-08-26T09:18:47.840Z","type":"model_call","session_id":"s-4f1","prompt_id":"p-02","duration_ms":2450,"input_tokens":11200,"output_tokens":420}
{"ts":"2026-08-26T10:02:11.220Z","type":"model_call","session_id":"s-9c7","prompt_id":"p-03","duration_ms":1760,"input_tokens":2260,"output_tokens":140}
{"ts":"2026-08-26T10:02:13.030Z","type":"tool_call","session_id":"s-9c7","prompt_id":"p-03","tool":"fetch_url","duration_ms":30150,"error":"ETIMEDOUT"}
{"ts":"2026-08-26T11:31:52.410Z","type":"model_call","session_id":"s-9c7","prompt_id":"p-04","duration_ms":2130,"input_tokens":2340,"output_tokens":170}
{"ts":"2026-08-26T11:31:54.600Z","type":"tool_call","session_id":"s-9c7","prompt_id":"p-04","tool":"run_tests","duration_ms":8420}
{"ts":"2026-08-26T11:32:03.080Z","type":"model_call","session_id":"s-9c7","prompt_id":"p-04","duration_ms":2890,"input_tokens":6180,"output_tokens":520}
{"ts":"2026-08-26T11:32:06.030Z","type":"tool_call","session_id":"s-9c7","prompt_id":"p-04","tool":"write_file","duration_ms":74}
{"ts":"2026-08-26T11:32:06.150Z","type":"tool_call","session_id":"s-9c7","prompt_id":"p-04","tool":"run_tests","duration_ms":7960}
{"ts":"2026-08-26T11:32:14.170Z","type":"model_call","session_id":"s-9c7","prompt_id":"p-04","duration_ms":2040,"input_tokens":7050,"output_tokens":260}
```

Escreva um `stats.mjs` que rode com `node stats.mjs agent.jsonl` e faça quatro coisas: ler o JSONL (um objeto por linha, pular linhas vazias, capturar e reportar linhas ruins sem interromper); agregar por `type` produzindo contagem, duração total, tokens totais e contagem de erros; agrupar por `prompt_id` para achar execuções em que “existe erro e não há registros posteriores” e imprimir o `prompt_id`, o `session_id` e a mensagem de erro delas; código de saída 1 significa suspeita de travamento detectada, 0 significa nenhuma (para poder plugar em CI ou cron). Use apenas a biblioteca padrão do Node, sem dependências.

<!-- rubric -->

**Critérios de avaliação**

- O script roda de verdade, `node stats.mjs agent.jsonl` produz saída sem lançar exceção; linhas vazias são puladas, falhas de parse de uma linha são capturadas, reportadas, e o processamento continua nas linhas restantes.
- Agrega por `type` em dois grupos, com os quatro números todos corretos: `model_call` 10 registros, duração total 22,470ms, tokens totais 53,490, erros 0; `tool_call` 10 registros, duração total 48,533ms, tokens totais 0, erros 1. Campos ausentes (registros de ferramenta não têm campos de token) são tratados como 0, não como `NaN`.
- A lógica de detecção de travamento é “o último registro daquele grupo de `prompt_id` tem `error`”, não “o grupo contém erro”. Só encontra `p-03`.
- Quando a suspeita de travamento é detectada, `process.exit(1)` (ou equivalente) tem efeito; rodar sobre estes dados seguido de `echo $?` precisa retornar 1.
- Agrupa por `prompt_id`, não por `session_id`: a sessão `s-9c7` contém dois prompts, p-03 e p-04; agrupar por sessão faria os registros de p-04 parecerem “continuação” após o erro de p-03, deixando o travamento passar.

<!-- answer -->

**Resposta de referência**

```javascript
// stats.mjs
import { readFileSync } from 'node:fs';

const file = process.argv[2] ?? 'agent.jsonl';

// Um JSON por linha, pula linhas vazias, reporta linhas ruins sem interromper
const records = readFileSync(file, 'utf8')
  .split('\n')
  .filter((line) => line.trim() !== '')
  .map((line, i) => {
    try {
      return JSON.parse(line);
    } catch {
      console.error(`Registro ${i + 1} não é JSON válido, ignorado`);
      return null;
    }
  })
  .filter((r) => r !== null);

// 1. Agrega por tipo de registro: contagem / duração total / tokens totais / contagem de erros
const byType = new Map();
for (const r of records) {
  const acc = byType.get(r.type) ?? { count: 0, ms: 0, tokens: 0, errors: 0 };
  acc.count += 1;
  acc.ms += r.duration_ms ?? 0;
  acc.tokens += (r.input_tokens ?? 0) + (r.output_tokens ?? 0);
  if (r.error) acc.errors += 1;
  byType.set(r.type, acc);
}

console.log('=== Por tipo ===');
for (const [type, acc] of byType) {
  console.log(
    `${type.padEnd(11)} count=${String(acc.count).padStart(3)}` +
      ` total_ms=${String(acc.ms).padStart(7)}ms` +
      ` total_tokens=${String(acc.tokens).padStart(7)}` +
      ` errors=${acc.errors}`,
  );
}

// 2. Agrupa por prompt_id, acha "existe erro e não há registros posteriores"
const byPrompt = new Map();
records.forEach((r, i) => {
  if (!byPrompt.has(r.prompt_id)) byPrompt.set(r.prompt_id, []);
  byPrompt.get(r.prompt_id).push({ ...r, seq: i + 1 });
});

const stalled = [];
for (const [promptId, group] of byPrompt) {
  const lastErrorAt = group.findLastIndex((r) => r.error);
  if (lastErrorAt === -1) continue; // Este prompt não teve erro nenhum
  if (lastErrorAt === group.length - 1) {
    // O erro é o último registro deste prompt: sem ação posterior, suspeita de travamento
    const last = group[lastErrorAt];
    stalled.push({ promptId, sessionId: last.session_id, error: last.error, seq: last.seq });
  }
}

console.log('\n=== Suspeitas de travamento (erro sem registros posteriores) ===');
if (stalled.length === 0) {
  console.log('Nenhuma');
} else {
  for (const s of stalled) {
    console.log(`prompt_id=${s.promptId} session_id=${s.sessionId} error=${s.error} (registro ${s.seq})`);
  }
}

console.log(`\nTotal de ${records.length} registros, ${byPrompt.size} prompts, suspeitas de travamento ${stalled.length}`);
process.exit(stalled.length > 0 ? 1 : 0);
```

Rodando no Node v26, isso produz o seguinte (saída real):

```text
$ node stats.mjs agent.jsonl
=== Por tipo ===
model_call  count= 10 total_ms=  22470ms total_tokens=  53490 errors=0
tool_call   count= 10 total_ms=  48533ms total_tokens=      0 errors=1

=== Suspeitas de travamento (erro sem registros posteriores) ===
prompt_id=p-03 session_id=s-9c7 error=ETIMEDOUT (registro 14)

Total de 20 registros, 4 prompts, suspeitas de travamento 1

$ echo $?
1
```

**Por que agrupar por `prompt_id` e não por `session_id`.** A orientação oficial diz para agrupar por session id e verificar se há um evento de requisição posterior ao erro[^S4], porque naquele contexto a sessão é a unidade de correlação. Aplicado a estes dados, a sessão `s-9c7` contém dois prompts: p-03 deu erro e travou às 10:02, p-04 é um prompt completamente novo lançado uma hora e meia depois. Agrupar por sessão faria os registros de p-04 parecerem “ação posterior” ao erro de p-03, deixando o travamento passar. Por qual id você agrupa depende da fronteira da pergunta que está fazendo — aqui a pergunta é “este prompt terminou”, então a fronteira é o prompt.

**`findLastIndex` é a chave.** A condição precisa ser “o último registro tem erro”, não “existe erro”. Escrever `group.some(r => r.error)` sinalizaria execuções que deram erro, se recuperaram e continuaram — exatamente os dois casos que esta leitura existe para distinguir. Trate também os campos ausentes com `?? 0` em todo lugar: registros de ferramenta não têm campos de token, registros de modelo não têm `error`; sem capturá-los, `undefined + number` produz `NaN`, que contamina a coluna inteira da agregação sem lançar exceção.

**Construa um contraexemplo para confirmar que a detecção de fato separa os dois casos.** Copie os dados, insira um registro `model_call` de p-03 depois da linha 14 (simulando “o agente continuou após o erro”), rode de novo — a saída vira “Nenhuma / Total de 21 registros, 4 prompts, suspeitas de travamento 0”, código de saída 0. Não pule esta etapa — um script de verificação que sempre retorna 0 é o mesmo que nenhum script de verificação. Com 0/1 funcionando, o script pode plugar em cron, CI ou qualquer sistema do tipo “diferente de zero dispara alerta”; note que ele só emite o sinal bruto — o sistema observado só emite sinais brutos; detecção de anomalias e alertas são trabalho do backend[^S4].

<!-- hint -->

**Dica 1**: construa em quatro etapas, rodando depois de cada uma para conferir a saída. Primeiro só “ler, `JSON.parse`, imprimir a contagem” — confirme que dá 20. Depois acrescente a agregação por tipo usando um `Map` para guardar os acumuladores, com `?? 0` em todo campo ausente. Depois faça o agrupamento e a detecção de travamento. Só adicione o `process.exit` por último. Escrever o script inteiro de uma vez significa que, quando algo quebrar, você não vai saber se falhou o parse ou a agregação.

<!-- hint -->

**Dica 2**: o núcleo da detecção de travamento é uma frase — **o último registro deste prompt é o que tem `error`**. `findLastIndex` retorna o índice da última correspondência; compare com `group.length - 1` e você tem a resposta. Repare especialmente que o agrupamento usa `prompt_id`: a sessão `s-9c7` contém dois prompts; agrupar por `session_id` deixaria os registros do segundo prompt “encobrirem” o travamento do primeiro. Depois de escrever, lembre-se de rodar `echo $?` para conferir o código de saída — saída na tela sozinha não conta como verificação.

<!-- /exercises -->

## Recapitulação

- A observabilidade em produção precisa responder quatro perguntas: quais ferramentas foram chamadas, quanto tempo cada requisição ao modelo levou, quantos tokens foram gastos e onde as falhas ocorreram[^S6]. Essas quatro e as métricas de avaliação do curso 10 desta série (tempo de execução de chamadas de ferramenta individuais e de tarefas inteiras, contagem total de chamadas de ferramenta, consumo total de tokens, erros de ferramenta)[^S3] são o mesmo conjunto de números — na avaliação você os usa para julgar se uma mudança melhorou as coisas; no monitoramento você os usa para acompanhar a saúde das execuções.
- O design dos campos de log e a escolha do JSONL não têm especificação autoritativa — é decisão de engenharia sua. Ponto de partida padrão: um registro por requisição ao modelo, um por chamada de ferramenta, um objeto JSON por linha, com session id, prompt id, duração, contagens de token, nome da ferramenta e erros. Logs em prosa só podem ser lidos por humanos; os estruturados podem ser filtrados, agregados e analisados por distribuição.
- O valor das métricas está em padrões que mapeiam diretamente para correções: muitas chamadas redundantes significam que parâmetros de paginação ou de limite de tokens precisam de ajuste; muitos erros de parâmetro inválido significam que descrições de ferramenta precisam de clareza ou exemplos[^S3]. Acompanhar chamadas de ferramenta também revela fluxos de trabalho comuns dos agentes e oportunidades de consolidar ferramentas[^S3]. Quando uma chamada de ferramenta levanta um erro, a própria resposta deveria ser escrita como orientação específica e acionável, não um código de erro opaco[^S3].
- A semântica de um sinal é definida pela forma como ele é registrado. O Claude Code faz retentativas internas de requisições de API que falham e emite um único evento `api_error` só depois de desistir — é o sinal terminal daquela requisição; retentativas intermediárias não são registradas separadamente[^S4] — então uma “contagem de erros” pode esconder muitas retentativas invisíveis embaixo. Para distinguir se uma sessão se recuperou ou travou, agrupe os eventos por session id e verifique se existe um evento de requisição posterior ao erro[^S4].
- Tokens são a métrica isolada que mais vale acompanhar: nos dados da Anthropic, agentes usam cerca de 4× os tokens do chat, sistemas multiagentes cerca de 15×[^S1]. Ao analisar o desempenho da avaliação, eles descobriram que o uso de tokens sozinho explica 80% da variância, com a contagem de chamadas de ferramenta e a escolha do modelo como os outros dois fatores explicativos[^S1]. Métricas de custo são aproximações; o faturamento oficial vem do seu provedor de API[^S4]. O gasto pode ser atribuído a coisas específicas, como nome da Skill, nome do plugin ou tipo de subagente[^S4].
- Dois princípios de contenção: o sistema observado só emite o fluxo bruto de eventos; detecção de anomalias, definição de linha de base e alertas são responsabilidade do backend[^S4]. Logs não deveriam registrar conteúdo por padrão — produtos oficiais têm como padrão não coletar o conteúdo dos prompts, apenas o comprimento[^S4]; a telemetria tem como padrão registrar apenas informação estrutural, não o que o agente lê e escreve[^S6]. Limiares de alerta e SLOs não têm números nos materiais autoritativos — não os invente; registre primeiro uma linha de base de duas semanas.

[>> Lição 4: Tracing: costurando uma execução em uma árvore](./04-tracing.md)
