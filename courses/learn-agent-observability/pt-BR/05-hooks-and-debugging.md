# Lição 5: Sondas nas comportas: hooks e um fluxo de depuração

> Objetivos de aprendizado:
> - Explicar o que são hooks: handlers definidos por você que executam automaticamente em pontos fixos do ciclo de vida do agente, organizados em três cadências (uma vez por sessão / uma vez por turno / a cada chamada de ferramenta dentro do loop), e conseguir escolher o evento certo para uma necessidade de observabilidade, escrever o matcher correto e identificar quais campos do payload usar
> - Evitar duas armadilhas que mordem de verdade: subprocessos de hook não herdam a configuração de exportação OTel do harness, e os arquivos de transcrição são escritos de forma assíncrona, então podem não conter as mensagens recentes quando o hook dispara
> - Aplicar um fluxo de cinco etapas para localizar problemas sob não determinismo: estreitar pelo id do prompt, achar a primeira divergência, reexecutar com entradas idênticas, martelar repetidamente o mesmo componente e retomar do ponto de falha depois de corrigir
>
> Pré-requisitos: Lições 1–4 concluídas (não determinismo e o “não dá para dizer por quê”, registros brutos como evidência de primeira mão, logs estruturados e métricas, árvores de trace e armadilhas do pipeline de telemetria) | Anterior: [<< Lição 4](./04-tracing.md) | Próxima: [Lição 6 >>](./06-build-observability.md)

## Você quer registrar antes e depois de cada execução de ferramenta

A lição 3 ensinou você a escrever uma entrada de log estruturada para cada chamada de ferramenta no seu próprio harness. A lição 4 ensinou a costurar esses registros em uma árvore de trace. Aquele loop era seu, você tinha o código-fonte, podia enfiar uma chamada de `log()` onde quisesse. Mas agora você está rodando o Claude Code em produção — você não tem o `runToolUses` dele. O que você quer não é complicado: registrar uma vez antes da execução da ferramenta (com que parâmetros ela vai rodar) e uma vez depois (o que ela devolveu). Só que os pontos de inserção estão no processo de outra pessoa.

O produto previu isso. A resposta se chama hooks.

**Hooks são comandos de shell, endpoints HTTP ou prompts de LLM definidos por você que executam automaticamente em pontos específicos do ciclo de vida do Claude Code**[^S5]. Em bom português: você declara na configuração “em tal e tal momento, rode este script para mim”, e quando o Claude Code chega naquele momento ele roda. E não chega de mãos vazias — quando um evento dispara e um matcher casa, o Claude Code passa um contexto JSON sobre o evento para o seu handler[^S5].

No curso 7 desta série, você escreveu uma comporta de aprovação no loop do seu harness — quando ele encontrava uma ferramenta HIGH_IMPACT, parava e esperava a confirmação humana antes de executar. Aquilo era um ponto de interceptação feito à mão. Os hooks fazem a mesma coisa, mas organizaram “quais posições do loop valem uma pausa” numa lista nomeada em que cada posição tem um payload fixo e confiável. Para observabilidade, o valor dessa lista não é que você “consegue mudar o comportamento” — é que **você consegue enxergar sem mudar o comportamento**.

## Três cadências: sessão, turno, chamada de ferramenta

Os eventos se dividem em três cadências[^S5]:

- **Uma vez por sessão**: `SessionStart` e `SessionEnd`
- **Uma vez por turno**: `UserPromptSubmit`, `Stop` e `StopFailure` (pelos nomes, `StopFailure` corresponde à saída em que o turno não terminou normalmente — a citação oficial só deu a classificação por cadência; consulte a sua página de referência para a semântica precisa)
- **A cada chamada de ferramenta dentro do loop agêntico**: `PreToolUse` e `PostToolUse`

Alinhe isso com a anatomia do loop do curso 7 e as três camadas casam na hora:

```text
SessionStart                       ← a sessão começa (o runAgent inteiro começa)
  UserPromptSubmit                 ← o turno começa (o usuário envia o prompt)
    while (stop_reason === "tool_use") {
       ... requisição de modelo ...
       PreToolUse                  ← dentro do corpo do loop, parâmetros gerados, ainda não executados
       ... execução da ferramenta ...
       PostToolUse                 ← dentro do corpo do loop, a ferramenta terminou de executar
    }
  Stop / StopFailure               ← o turno termina
SessionEnd                         ← a sessão termina
```

Escolher a cadência errada dá números difíceis de explicar: se você quer contar “quantas chamadas de ferramenta esta tarefa usou” mas engancha na comporta por turno, vai receber só zero. Antes de escolher um evento, pergunte: quantas vezes por sessão acontece a coisa que estou contando?

Um detalhe que vale destacar: `SessionStart` dispara quando você abre uma sessão nova **e também quando você retoma uma existente**[^S5]. O curso 9 cobriu `--resume` — da perspectiva do loop aquilo não é “começar do zero”, mas ainda assim toca a campainha do `SessionStart`. Se você escrever “inicializar um log novo quando a sessão começa”, na primeira vez que usar resume vai sobrescrever o trecho anterior.

## Detalhes das comportas úteis para observabilidade

**`PreToolUse` roda depois que o Claude cria os parâmetros da ferramenta e antes de processar a chamada da ferramenta**[^S5]. Essa brecha importa: os parâmetros estão fechados (você vê exatamente o que o modelo pretende usar), mas a ferramenta ainda não rodou. A lição 2 cobriu um caso real — o time descobriu que o Claude acrescentava desnecessariamente `2025` ao parâmetro de consulta da ferramenta de busca, enviesando os resultados[^S3]. A evidência desse tipo de bug mora nos parâmetros que o `PreToolUse` consegue ver.

**Os hooks de `PostToolUse` disparam depois que uma ferramenta já executou com sucesso. A entrada inclui tanto `tool_input`, os argumentos enviados à ferramenta, quanto `tool_response`, o resultado que ela devolveu**[^S5]. Um disparo te dá um registro completo da chamada; você não precisa juntar por conta própria “qual requisição vai com qual resposta”. O princípio que a lição 2 enfatizou — a ida e volta completa é a evidência de primeira mão[^S3] — chega aqui entregue campo por campo. Note que a condição de disparo é “já executou com sucesso”[^S5]; se você quiser cobrir os casos em que os parâmetros foram gerados mas a execução não deu certo, precisa emparelhar com `PreToolUse` e comparar os dois lados.

**Como escrever matchers**: para rodar um hook depois que qualquer ferramenta terminar com sucesso, omita o `matcher` ou defina-o como `"*"`[^S5]. Cenários de observabilidade querem exatamente esse comportamento de um-hook-registra-tudo — você não sabe qual ferramenta vai quebrar, então registra todas.

**Como os handlers enviam e recebem dados**: hooks de comando recebem dados JSON via stdin e comunicam resultados por códigos de saída, stdout e stderr[^S5]. Ou seja, um handler mínimo de observabilidade é só “leia JSON da stdin, escolha alguns campos para acrescentar a um arquivo, saia com código 0” — nada de mágica envolvida.

```json
{
  "hooks": {
    "PostToolUse": [
      {
        "matcher": "*",
        "hooks": [
          { "type": "command", "command": "node ~/.claude/obs/record-tool-call.mjs" }
        ]
      }
    ]
  }
}
```

```javascript
#!/usr/bin/env node
// record-tool-call.mjs — handler de PostToolUse
// Lê JSON da stdin, escreve uma entrada JSON Lines, código de saída 0 significa tudo certo
import { appendFileSync, mkdirSync } from "node:fs";

let raw = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", (chunk) => { raw += chunk; });
process.stdin.on("end", () => {
  const evt = JSON.parse(raw);
  const line = {
    ts: new Date().toISOString(),
    session_id: evt.session_id,
    prompt_id: evt.prompt_id,
    tool: evt.tool_name,
    input: evt.tool_input,       // parâmetros enviados à ferramenta
    response: evt.tool_response, // resultado devolvido pela ferramenta
  };
  mkdirSync("/tmp/agent-obs", { recursive: true });
  appendFileSync("/tmp/agent-obs/tool-calls.jsonl", JSON.stringify(line) + "\n");
  process.exit(0);
});
```

Isto é o log JSON Lines da lição 3, só que quem escreve o log mudou de “o seu harness” para “um scriptzinho que você pendurou no loop de outra pessoa”. Consulte a página de referência da sua versão para a estrutura exata da configuração e os nomes dos campos.

**O payload inclui duração, mas confira a definição**: o payload carrega um campo opcional com o tempo de execução da ferramenta em milissegundos, que **exclui o tempo passado em prompts de permissão e em hooks PreToolUse**[^S5]. A segunda metade é a chave: o “quanto tempo esperei por esta etapa” percebido pelo usuário inclui o tempo em que ele ficou clicando em confirmar, mas esse número tira isso fora. Usá-lo para responder “a ferramenta está lenta” está correto; usá-lo para responder “quanto o usuário esperou” vai ficar sistematicamente baixo. A lição 4 mencionou a mesma coisa por outro caminho — o span da ferramenta tem dois spans filhos embaixo, um para a espera pela decisão de permissão e outro para a execução em si[^S4]. Eles são gravados separadamente justamente porque esses dois trechos não deveriam ser misturados.

**Os próprios hooks também estão no trace**: cada prompt do usuário inicia um span raiz `claude_code.interaction`. Chamadas de API, chamadas de ferramenta e execuções de hook são gravadas como filhos dele[^S4]. O mecanismo de observabilidade é ele mesmo um objeto observado.

## Dois avisos que mordem

**Primeiro: subprocessos de hook não herdam as variáveis de exportador OTEL_\*.** Um conjunto de variáveis não é herdado: o Claude Code remove as variáveis de exportador `OTEL_*` de todo subprocesso que ele gera, inclusive hooks[^S5].

Essa frase mata diretamente uma ideia muito natural: “O harness já tem endpoint, protocolo e cabeçalhos de autenticação configurados. Vou só importar um SDK do OTel no meu hook e as variáveis de ambiente vão funcionar de cara.” — Não vão. Quando o processo do handler inicia, essas variáveis já foram removidas. Os dados ou não vão ser exportados, ou vão bater no endpoint padrão e sumir. Não espere que alguém grite para te avisar: a lição 4 cobriu que a exportação da própria CLI falha em silêncio[^S6], e por padrão o exportador que você mesmo montar no hook não vai ser mais barulhento — quando nenhum dado chega ao backend, os dois lados ficam quietos.

Você tem dois caminhos à frente: ou o hook carrega a própria configuração completa de exportação (escreva o endpoint e a autenticação explicitamente no script, não conte com herança), ou não emita telemetria do hook de jeito nenhum — deixe-o escrever um log estruturado e alinhe com a telemetria no backend usando ids. O segundo caminho tem apoio oficial: o UUID que identifica o prompt de usuário sendo processado no payload do hook coincide com o atributo `prompt.id` dos eventos do OpenTelemetry, de modo que você pode correlacionar a saída do hook com a telemetria de um único prompt[^S5]. Cada lado escreve o seu, e no fim você faz a junção pelo mesmo id de prompt — o mesmo truque de “costurar numa árvore usando IDs de correlação” da lição 4, só que desta vez entre duas fontes de dados.

**Segundo: o arquivo de transcrição é escrito de forma assíncrona.** O payload te dá um caminho para o JSON da conversa, mas esse arquivo é escrito de forma assíncrona e pode ficar atrasado em relação à conversa em memória, então pode ainda não incluir as mensagens mais recentes do turno atual quando o hook dispara[^S5].

A armadilha é que isso não dá erro, só entrega dado velho. Alguém pode pensar “os campos do payload não bastam, vou ler a transcrição direto, ela tem tudo”, e acabar com registros que perdem metade do conteúdo de forma intermitente. **Se você quer `tool_input` e `tool_response`, use os campos do payload** — eles são o que o `PostToolUse` garante explicitamente fornecer[^S5]. Transcrições servem para olhar para trás depois, não para usar como fonte de dados em tempo real no instante em que o hook dispara.

Um lembrete ligado à sua máquina: hooks de comando executam comandos de shell com todas as suas permissões de usuário. Eles podem modificar, apagar ou acessar qualquer arquivo que a sua conta de usuário consiga acessar. Revise e teste todos os comandos de hook antes de adicioná-los à sua configuração[^S5].

```agentmentor-check
{
  "id": "obs-zh-05-hook-otel-shortcut",
  "label": "Dá para reaproveitar a configuração OTel do harness num hook",
  "prompt": "Um colega te mostra a abordagem dele: no handler do hook PostToolUse, importar direto o SDK do OTel e emitir um span para cada chamada de ferramenta. O raciocínio dele é “o harness já configurou o endpoint OTLP e os cabeçalhos de autenticação como variáveis de ambiente, o hook é um subprocesso que ele gerou, então o ambiente é herdado naturalmente — não precisa de configuração extra”. Como essa abordagem vai terminar?",
  "whyHere": "É aqui que as linhas de “hooks são pontos de inserção” e “pipelines de telemetria mentem para você” se encontram — uma abordagem que parece à prova de balas é explicitamente negada pela documentação nativa, e a falha é silenciosa.",
  "mode": "single",
  "choices": [
    {
      "id": "a",
      "text": "Não vai funcionar: o Claude Code remove as variáveis de exportador OTEL_* de todo subprocesso que ele gera, inclusive hooks, então a configuração não passa. Ou o handler carrega a própria configuração de exportação, ou o hook só escreve logs estruturados e você alinha com a telemetria pelo id do prompt.",
      "correct": true,
      "feedback": "Correto. Essa é uma conclusão negativa explícita na documentação, e a falha costuma ser silenciosa — os dados não vão ser exportados mas também não vão dar erro, então você vai achar que eles estão esperando no backend. Cada caminho alternativo tem um custo: carregar a configuração significa manter uma segunda autenticação; escrever logs e juntar depois exige uma etapa extra de correlação, mas o id do prompt no payload do hook e o prompt.id dos eventos de telemetria são o mesmo valor, então a junção é garantida."
    },
    {
      "id": "b",
      "text": "Vai funcionar, mas cuidado com duplicação: a mesma chamada de ferramenta é gravada uma vez pelo span de ferramenta embutido na CLI e uma vez pelo span emitido pelo hook, exigindo deduplicação por nome de ferramenta no backend.",
      "correct": false,
      "feedback": "Contagem duplicada é de fato um problema comum de instrumentação, mas ela nem chega a entrar em cena aqui — a abordagem morre uma etapa antes. As variáveis de ambiente não passam para o subprocesso do hook, então aquele span nunca é exportado. Não há colisão nenhuma com o span embutido."
    },
    {
      "id": "c",
      "text": "Vai funcionar, o único problema é o momento: o PostToolUse dispara depois que a execução da ferramenta termina, então o horário de início do span só pode ser calculado para trás, deixando a duração imprecisa.",
      "correct": false,
      "feedback": "A semântica de duração importa mesmo — aquele campo de milissegundos de execução no payload exclui o tempo de espera de permissão e o PreToolUse. Mas não é essa a causa da morte desta abordagem. A causa da morte é que as variáveis do exportador são removidas, então os dados nunca saem."
    }
  ]
}
```

## Quando os hooks não fazem o trabalho

Você pendurou um hook, o arquivo de log está vazio. Ele não disparou? O matcher não casou? Ou o próprio script quebrou? Neste momento o objeto que você precisa observar é o próprio mecanismo de observabilidade. O princípio da lição 4 vale de novo aqui: verifique a sonda primeiro.

**Os detalhes de execução dos hooks — quais hooks casaram, seus códigos de saída e a stdout e a stderr completas — são escritos no arquivo de log de depuração**[^S5]. Obtenha-o de dois jeitos: use `claude --debug-file <caminho>` para escrever num local que você escolhe, ou rode `claude --debug` e depois leia `~/.claude/debug/<session-id>.txt`[^S5]. Para detalhes mais granulares de casamento de hooks, defina `CLAUDE_CODE_DEBUG_LOG_LEVEL=verbose` para ver linhas de log adicionais, como as contagens de matcher de hook[^S5].

```text
Sequência de investigação: o arquivo de log está vazio
 └─ O log de depuração tem um registro de casamento para este hook?
      Não  → o matcher está errado; confirme primeiro que ele dispara com o matcher omitido
      Sim  → O código de saída é 0?
               Não → leia a stderr, provavelmente caminho do script, permissões ou parse de JSON
               Sim → rodou mas não escreveu no lugar certo; verifique o caminho de escrita e a existência do diretório
```

## Um fluxo de depuração: como caçar um problema sob não determinismo

A primeira metade da lição cobriu onde colocar as sondas. A segunda metade cobre como de fato usar esses dados para caçar um problema real.

Comece enunciando a dificuldade com clareza. A lição 1 disse: agentes tomam decisões dinâmicas e são não determinísticos entre execuções, mesmo com prompts idênticos. Isso torna a depuração mais difícil[^S1]. A etapa um da depuração tradicional é “reproduzir”, e essa etapa não se sustenta aqui — você roda de novo e ele pode seguir um caminho completamente diferente, porém igualmente válido.

As cinco etapas abaixo são **arranjo próprio deste curso**, não a metodologia oficial de ninguém; mas cada etapa se apoia em uma fonte.

### Etapa um: estreitar

Nos registros que você acumulou ao longo das lições 1–4, primeiro estreite o escopo para “este único prompt problemático”. A lição 4 te deu o método: **para rastrear toda a atividade disparada por um único prompt, filtre seus eventos por um valor específico de `prompt.id`**[^S4].

O significado desta etapa não é técnico, é psicológico. “O agente quebrou” é uma proposição que você não consegue depurar; “um destes 11 eventos sob este id de prompt está errado” é uma proposição que você consegue depurar.

### Etapa dois: achar a primeira divergência

Leia do começo para a frente e ache **a primeira etapa em que o comportamento começa a se desviar das expectativas**. Por que insistir no “primeiro”? Porque uma etapa falhando pode fazer os agentes explorarem trajetórias completamente diferentes, levando a resultados imprevisíveis[^S1]. Os absurdos que você vê no fim (referenciar arquivos inexistentes, errar repetidamente, dar voltas enormes) são em geral ruído a jusante. Você conserta o evento #8 e provavelmente está só limpando a bagunça do erro do evento #4.

Julgar “desvio” tem alguns formatos úteis[^S3]: chamou uma ferramenta que não deveria ter chamado, chamou a ferramenta certa com parâmetros errados, chamou a ferramenta certa poucas vezes demais ou processou a resposta da ferramenta incorretamente. O último tipo é o mais difícil de perceber, porque a própria ferramenta devolveu sucesso, está tudo verde nos logs — o que está errado é a interpretação que o agente fez daquele resultado bem-sucedido.

### Etapa três: reexecutar e observar

A abordagem oficial: para entender os efeitos dos prompts, eles **construíram simulações usando exatamente os prompts e as ferramentas do sistema e então observaram os agentes trabalhando etapa por etapa**; isso revelou imediatamente modos de falha como agentes que continuavam mesmo já tendo resultados suficientes, que usavam consultas de busca prolixas demais ou que selecionavam ferramentas incorretas[^S1].

O “revelou imediatamente” merece reflexão. Esses mesmos bugs são invisíveis em métricas agregadas (a taxa de sucesso está bem alta), exigem leitura linha a linha para serem notados em logs post-mortem, mas quando você assiste à execução etapa por etapa, o olho humano identifica em segundos que “ele já tem o suficiente e continua buscando”. Duas coisas a controlar durante a reexecução: a entrada precisa ser idêntica (prompts e definições de ferramenta inalterados) e a observação precisa ser etapa por etapa.

### Etapa quatro: martelar repetidamente o mesmo componente

Se a suspeita recai sobre uma ferramenta específica, rodá-la algumas vezes provavelmente não vai mostrar nada — o não determinismo faz os bugs aparecerem e sumirem.

O time construiu um agente de teste de ferramentas: dê a ele uma ferramenta MCP defeituosa, ele tenta usá-la e então reescreve a descrição da ferramenta para evitar as falhas. **Testando a ferramenta dezenas de vezes, esse agente encontrou nuances e bugs importantes**[^S1].

“Dezenas de vezes” é o ponto. Um bug que uma execução consegue esconder, dezenas de execuções vão forçar para fora: um formato de retorno esquisito sob entradas de fronteira, uma descrição ambígua, uma mensagem de erro que faz o modelo julgar mal como “é só tentar de novo”. As leituras diagnósticas da lição 3 se conectam aqui — muitas chamadas de ferramenta redundantes podem sugerir que os parâmetros de paginação ou de limite de tokens precisam ser redimensionados; muitos erros de ferramenta por parâmetros inválidos podem sugerir que as ferramentas ganhariam com descrições mais claras ou exemplos melhores[^S3]. Uma coisa que poupa muitas idas e vindas: quando uma chamada de ferramenta levanta um erro, você pode escrever as respostas de erro como prompts, comunicando com clareza melhorias específicas e acionáveis, em vez de códigos de erro opacos ou tracebacks[^S3].

### Etapa cinco: retomar do ponto de falha depois de corrigir

Depois de corrigir, não aperte “começar de novo” por reflexo. A fala oficial é direta: quando erros acontecem, não podemos simplesmente reiniciar do começo: reinícios são caros e frustrantes para os usuários. Em vez disso, construímos sistemas capazes de retomar de onde o agente estava quando os erros aconteceram[^S1].

O curso 9 cobriu como construir mecanismos de retomada. O cenário daquela lição era “como continuar depois de uma tarefa ser interrompida”. Na depuração o uso é outro: as dezenas de chamadas de ferramenta antes do ponto de falha eram válidas, custaram dinheiro, deram resultados corretos. Rodá-las de novo não te dá nada além de tokens queimados, e introduz um monte de novo não determinismo, de modo que você não consegue dizer se “funcionou desta vez” é porque você corrigiu certo ou porque teve sorte.

## Sobre “reprodução”, uma palavra honesta

Você já deve ter visto por aí um conjunto de técnicas para tornar agentes reproduzíveis: fixar a semente aleatória, definir temperature como 0, gravar retornos reais de ferramenta e usá-los como stubs de reexecução.

Essas práticas existem na engenharia. Os laboratórios práticos dos cursos 8 a 10 usam justamente essa abordagem de cliente stub — salve o `tool_result` de uma execução real, devolva os mesmos dados sempre depois disso, e o lado da ferramenta vira determinístico. Bom para verificar “aquela linha de código que mudei quebrou a lógica de parsing?”.

Mas duas coisas precisam ser ditas. Primeiro, **essas técnicas não têm respaldo em nenhuma fonte nativa**. Eu dei citações para cada etapa do fluxo de cinco etapas acima. Para este parágrafo não estou dando nenhuma, porque genuinamente não existem. Se você vir alguém afirmar “a recomendação oficial é temperature 0 para reproduzir problemas de agente”, peça o link.

Segundo, elas travam menos do que parecem travar. Usar stubs nos retornos das ferramentas trava o ambiente; o lado do modelo continua não determinístico[^S1]. Então isso transforma “duas variáveis se mexendo” em “uma variável se mexendo” — o que é valioso, mas não é o tipo de reprodução em que “a mesma entrada tem de dar a mesma saída”. Não trate como garantia, trate como redução de ruído.

## Que problemas valem esse fluxo

Percorrer as cinco etapas tem um custo: estreitar exige ler logs, reexecutar exige montar uma simulação, martelar um componente significa dezenas de execuções. Uma divisão grosseira, mas que funciona:

- **Tremidas de baixa frequência e inofensivas** — tipo aquela vez em que ele chamou a busca uma vez a mais, mas o resultado saiu certo assim mesmo. Registre e acumule. Cada ocorrência isolada não vale investigação; depois que você juntar uma dúzia, muitas vezes dá para ver um padrão comum, e investigar uma vez nesse ponto é bem mais eficiente.
- **Alto impacto** — deu uma resposta factualmente errada, modificou um arquivo em que não deveria ter tocado, travou sem retornar. Não importa quão baixa seja a frequência, abra um caso. Uma ocorrência já é cara o bastante.
- **Recorrente** — o mesmo formato de falha aparece pela terceira vez, o que significa que não é sorte, é estrutural. Abra um caso.

A frase da lição 1 é o critério de decisão aqui: por exemplo, usuários relatavam que os agentes “não encontravam informação óbvia”, mas não conseguíamos ver por quê. Os agentes estavam usando consultas de busca ruins? Escolhendo fontes ruins? Batendo em falhas de ferramenta?[^S1] Ao decidir não investigar um problema, você está aceitando “não sei qual das causas é” — para tremidas inofensivas tudo bem, para problemas de alto impacto você está apostando.

Esta lição ficou no papel até aqui. A lição 6 junta as duas metades na prática: instale uma camada de observabilidade completa no harness do curso 7 e depois pegue um sintoma do tipo “não dá para dizer por quê” e persiga-o até o fim.

## Recapitulação

- Hooks são comandos, endpoints HTTP ou prompts de LLM definidos por você que executam automaticamente em pontos específicos do ciclo de vida do Claude Code; quando um evento dispara e um matcher casa, o Claude Code passa um contexto JSON sobre o evento para o seu handler[^S5].
- Os eventos se dividem em três cadências — uma vez por sessão (`SessionStart`/`SessionEnd`), uma vez por turno (`UserPromptSubmit`/`Stop`/`StopFailure`), a cada chamada de ferramenta dentro do loop (`PreToolUse`/`PostToolUse`)[^S5]. Fixe a cadência antes de escolher o evento. `SessionStart` também dispara ao retomar uma sessão[^S5].
- `PreToolUse` roda depois que o Claude cria os parâmetros da ferramenta e antes de processar a chamada; `PostToolUse` dispara depois da execução bem-sucedida da ferramenta, com a entrada carregando tanto `tool_input` quanto `tool_response`, o que te dá um registro completo da chamada em um único disparo[^S5]. Omita o matcher ou defina-o como `"*"` para o um-hook-registra-tudo[^S5].
- Hooks de comando recebem JSON via stdin e respondem por códigos de saída, stdout e stderr[^S5]; aquele campo de milissegundos de execução exclui o tempo passado em prompts de permissão e no `PreToolUse`[^S5], então não o use como tempo de espera do usuário.
- Duas conclusões negativas: o Claude Code remove as variáveis de exportador `OTEL_*` de todo subprocesso que ele gera (inclusive hooks)[^S5], então se você quiser emitir telemetria de um hook precisa carregar a sua própria configuração de exportação; o arquivo de transcrição fornecido no payload é escrito de forma assíncrona e pode ainda não incluir as mensagens mais recentes do turno atual quando o hook dispara[^S5]. Hooks de comando executam com todas as suas permissões de usuário, então revise antes de instalar[^S5].
- Quando os hooks não funcionam, verifique no log de depuração quais hooks casaram, os códigos de saída e a stdout/stderr completas usando `--debug-file`[^S5]; para contagens de matcher, coloque o nível de log em verbose[^S5]. O id do prompt no payload do hook e o `prompt.id` dos eventos de telemetria são o mesmo valor, então as duas fontes de dados podem ser alinhadas[^S5].
- Fluxo de depuração em cinco etapas (arranjo deste curso): filtre eventos por `prompt.id` para estreitar até este prompt[^S4] → ache a primeira divergência, porque uma etapa falhando muda a trajetória inteira[^S1] → reexecute usando prompts e ferramentas idênticos, observando etapa por etapa[^S1] → martele o componente suspeito dezenas de vezes para forçar o bug para fora[^S1] → depois de corrigir, retome do ponto de falha em vez de reiniciar do começo[^S1].
- Técnicas como semente fixa, temperature 0 e reexecução com retornos de ferramenta gravados não têm respaldo em fontes nativas; este curso as apresenta na voz da prática de engenharia: elas travam o lado do ambiente, mas o modelo continua não determinístico[^S1], então são redução de ruído, não garantia de reprodução.
- Nem todo problema merece o fluxo completo: registre as tremidas inofensivas de baixa frequência, acumule para achar padrões e investigue depois; abra casos imediatamente para questões de alto impacto ou recorrentes.

[>> Lição 6: Mão na massa: instalando uma camada de observabilidade no harness](./06-build-observability.md)

## 💻 Exercícios

<!-- exercises -->

### Nível 1: Case três necessidades de observabilidade a hooks

Você tem três necessidades de observabilidade. Para cada uma, escreva: **qual evento escolher**, **como escrever o matcher**, **quais campos do payload usar** e **qual armadilha é específica desta necessidade**. Você não precisa de código completo; trechos de configuração e uma ou duas frases de explicação bastam.

1. Registrar parâmetros e resultados completos de cada chamada de ferramenta, escritos como JSON Lines.
2. Medir o tempo decorrido de cada turno (do envio do prompt pelo usuário até o fim do turno).
3. Ao retomar uma sessão, lembrar o usuário de que “você deixou uma tarefa incompleta da última vez”.

<!-- rubric -->

**Critérios de avaliação**

- A necessidade 1 escolhe `PostToolUse`, matcher omitido ou `"*"`, campos usando `tool_input` e `tool_response` do payload; a armadilha menciona “não leia o arquivo de transcrição” e explica que o motivo é a escrita assíncrona, que pode ficar atrasada.
- A necessidade 1 ganha pontos extras se também notar “`PostToolUse` só dispara após execução bem-sucedida; para cobrir os casos de falha, emparelhe com `PreToolUse`”.
- A necessidade 2 escolhe eventos emparelhados da cadência por turno: `UserPromptSubmit` registra o início, `Stop` registra o fim, e considera `StopFailure` como a saída de exceção; a armadilha menciona “não dá para somar os milissegundos de execução dos payloads de `PostToolUse` como tempo decorrido do turno” e explica que esse número exclui a espera de permissão e o tempo de `PreToolUse`.
- A necessidade 3 escolhe `SessionStart`; a armadilha menciona “`SessionStart` dispara tanto para sessões novas quanto para sessões retomadas” e apresenta um método concreto para distinguir as duas.
- As três questões precisam responder todas as partes (evento + campos + armadilha) para contar como completas; necessidades ligadas a ferramentas (necessidade 1) exigem mais uma parte: o matcher. Nomear só o evento não conta.

<!-- answer -->

**Necessidade 1**

- Evento `PostToolUse`: dispara depois que a ferramenta executa com sucesso, a entrada carrega tanto `tool_input` quanto `tool_response`, e um disparo te dá um registro completo de ida e volta sem emparelhamento manual.
- Matcher omitido ou `"*"` — observabilidade quer um-hook-registra-tudo, porque você não sabe de antemão qual ferramenta vai quebrar.
- Campos: `tool_name`, `tool_input`, `tool_response`, mais o identificador da sessão e o id do prompt. Inclua o id do prompt porque ele coincide com o `prompt.id` dos eventos de telemetria, o que permite fazer a junção depois.
- Armadilha: **não leia o caminho do arquivo de transcrição do payload tentando “pegar um contexto mais completo”.** A transcrição é escrita de forma assíncrona e pode ficar atrasada em relação à conversa em memória, então no instante em que o hook dispara ela pode ainda não conter as mensagens mais recentes do turno atual. Você vai obter registros incompletos de forma intermitente, sem nenhum sinal de erro.
- Complemento: a pré-condição do `PostToolUse` é “execução bem-sucedida”. Se você também se importa com “parâmetros gerados mas que não rodaram”, acrescente um `PreToolUse` com curinga para registrar os parâmetros e depois compare os dois lados para pegar as chamadas que nunca chegaram ao `PostToolUse`.

**Necessidade 2**

- Os eventos são um par, ambos na cadência “uma vez por turno”: `UserPromptSubmit` grava a marca de tempo de início, `Stop` grava a marca de fim e calcula a diferença. `StopFailure` deve pendurar o mesmo handler, senão turnos encerrados de forma anormal nunca ganham marca de fim e o registro de início fica pendurado para sempre.
- Esses eventos não têm escopo de ferramenta, não precisam de curinga de ferramenta.
- Campos: escreva o início num arquivo temporário indexado pelo id do prompt; o fim usa o mesmo id do prompt para recuperar e calcular a diferença. Use o id do prompt e não o identificador de sessão, porque uma sessão tem muitos turnos.
- Armadilha: **não some o campo de milissegundos de execução dos payloads de `PostToolUse` como tempo decorrido do turno.** A definição daquele campo é tempo de execução da ferramenta, exclui explicitamente o tempo passado em prompts de permissão e em hooks `PreToolUse`, e o tempo de requisição do modelo nem entra ali. Calcular assim vai ficar sistematicamente baixo; quanto mais o fluxo exigir confirmação humana, maior a diferença.

**Necessidade 3**

- Eventos `SessionStart` (momento do lembrete) mais `SessionEnd` (momento de registrar o estado deixado para trás), ambos na cadência “uma vez por sessão”. Os campos usam o identificador de sessão para casar “quem deixou o quê”.
- Armadilha: **`SessionStart` dispara tanto ao abrir uma sessão nova quanto ao retomar uma existente.** Lembre incondicionalmente e toda sessão novinha vai ouvir “você tem tarefas incompletas”; as pessoas vão parar de ler rapidinho.
- Método de distinção (versão robusta, não amarrada a nenhum nome de campo específico): faça o `SessionEnd` julgar se o encerramento deixou trabalho incompleto e, em caso positivo, escrever um arquivo de snapshot nomeado com o identificador da sessão; o `SessionStart` faz uma coisa só — verificar se existe um snapshot correspondente, lembrar apenas se encontrar e apagar depois de ler. Sessões novas não encontram snapshot e naturalmente não disparam. Isso também resolve outro problema: a informação necessária para julgar “incompleto” está mais completa no fim da sessão.
- Armadilha relacionada: um handler escrito como “`SessionStart` inicializa um log novo e vazio” vai apagar o trecho anterior na primeira vez que encontrar um resume.

<!-- hint -->

Dica: primeiro localize cada necessidade numa cadência. Pergunte-se “quantas vezes por sessão essa coisa acontece?” — uma vez por chamada de ferramenta? uma vez por turno? uma vez por sessão? Cadência fixada, o evento está quase todo fixado.

<!-- hint -->

Dica: as três armadilhas estão enterradas em três detalhes — a primeira tem a ver com “quando o arquivo de transcrição é escrito”; a segunda tem a ver com “o que aquele campo de milissegundos exclui”; a terceira tem a ver com “em que outro momento, além de sessão nova, esse evento dispara”. As três foram ditas explicitamente na primeira metade desta lição.

### Nível 2: Um estudo de caso, percorra as cinco etapas

**Sintoma**: o usuário relata que “o relatório de resumo que ele me deu referencia arquivos que não existem”.

Você filtra pelo id de prompt deste prompt e obtém este resumo de eventos (o prompt original era “leia o diretório reports/, resuma as conclusões dos três relatórios semanais deste trimestre”):

```text
prompt.id = 8f2c1a94-...   (Resumo de eventos disparados por um prompt do usuário, ordenado por tempo;
                            input/response são tool_input/tool_response do payload do hook, abreviados por questão de layout;
                            tool_decision tem uma entrada por chamada, o resumo mantém só a #3 a título de ilustração)

#1   user_prompt     prompt_length=27
#2   llm_request     dur=1840ms  stop_reason=tool_use
#3   tool_decision   tool=list_files   decision=allow (na lista de permissões, sem espera humana)
#4   tool_result     tool=list_files   input={"path":"reports/"}
                     response={"entries":[]}   success=true   dur=12ms
#5   llm_request     dur=2210ms  stop_reason=tool_use
#6   tool_result     tool=read_file    input={"path":"reports/2026-Q2-week03.md"}
                     success=false   error="ENOENT: no such file or directory"
#7   llm_request     dur=1990ms  stop_reason=tool_use
#8   tool_result     tool=read_file    input={"path":"reports/q2-summary.md"}
                     success=false   error="ENOENT: no such file or directory"
#9   llm_request     dur=2400ms  stop_reason=tool_use
#10  tool_result     tool=search_notes input={"query":"Q2 relatórios semanais conclusões 2026"}
                     response={"hits":[3 notas antigas sem relação com este projeto]}   success=true
#11  llm_request     dur=5100ms  stop_reason=end_turn
#12  final response  "De acordo com reports/2026-Q2-week03.md e reports/q2-summary.md,
                     dois relatórios semanais, neste trimestre..."
```

Não precisa escrever código. Responda quatro perguntas seguindo o fluxo de cinco etapas:

1. **Qual evento é a primeira divergência?** Aponte o número específico e explique por que os anteriores não contam e os posteriores são a jusante.
2. **Como reexecutar e observar?** Qual entrada usar, o que observar.
3. **O que “martelar repetidamente o mesmo componente” martela aqui?** Especifique o objeto e o fenômeno a observar.
4. **De onde retomar depois de corrigir?** Especifique o ponto de retomada e por que não reexecutar a partir do #1.

<!-- rubric -->

**Critérios de avaliação**

- A primeira divergência aponta para o **#5** (depois de o agente receber o diretório vazio ele ainda gera uma chamada `read_file`), ou aponta para “a decisão entre #4 e #5” e nota que a evidência observável mais antiga aterrissa no `tool_input` do #6. Apontar só para #6 ou #12 é julgado como “apontou para a jusante”.
- Precisa explicar que **o #4 não conta como divergência**: `list_files` devolveu `success=true`, 12ms, a ferramenta em si funcionou bem, o que está errado é o processamento que o agente fez do resultado vazio.
- Precisa explicar que **#6/#8/#10 são a jusante**: uma etapa falhando muda a trajetória inteira, e essas etapas estão limpando a bagunça do julgamento errado do #5.
- A resposta sobre reexecução precisa incluir duas restrições: a entrada usa prompts e definições de ferramenta idênticos; a observação é etapa por etapa, focando na primeira reação do modelo depois de receber `entries` vazio.
- “Martelar repetidamente o mesmo componente” precisa apontar para `list_files` (formato de retorno de resultado vazio e descrição da ferramenta), e não dizer vagamente “rode mais algumas vezes”; precisa apresentar as dimensões do martelo (formatos diferentes de caminho) e o fenômeno a observar (como o modelo interpreta o resultado vazio a cada vez).
- O ponto de retomada responde **depois do #4, antes do #5**, e dá o raciocínio para não reexecutar a partir do #1: os resultados de #1–#4 estão corretos, reexecutar só queima tokens e introduz novo não determinismo, sem dar para dizer se “funcionou desta vez” é porque você corrigiu certo ou porque teve sorte.
- As quatro questões precisam ser respondidas para contar como completo. Resposta que contradiga a sequência de eventos (por exemplo, dizer que `list_files` deu erro) é julgada como reprovada.

<!-- answer -->

**1. Primeira divergência: #5.**

O `list_files` do #4 devolveu `{"entries": []}`, `success=true`, 12ms — nesta etapa a ferramenta fez o trabalho dela, ela reportou honestamente “não há entradas neste caminho”. O que começa a se desviar é o #5: depois que o agente recebe um diretório vazio, o comportamento correto é parar e dizer ao usuário “não há nada em reports/, por favor confirme o caminho”, mas ele gerou uma chamada `read_file` com o parâmetro `reports/2026-Q2-week03.md`.

O lugar mais antigo em que você consegue ver essa divergência nos registros é **o `tool_input` do #6** — aquele caminho nunca apareceu em nenhum `tool_response` anterior. Este é um critério que você pode conferir mecanicamente: os nomes de arquivo que aparecem em chamadas ou relatórios posteriores podem ser rastreados até respostas de ferramenta anteriores? Se não podem, eles vieram do nada.

Por que os anteriores não contam: o #2 julgando que era o caso de listar o diretório, razoável; o #3 é a permissão liberada, sem espera humana; o #4, ferramenta normal. Por que os posteriores são a jusante: os dois ENOENT do #6 e do #8, o #9 mudando para `search_notes`, o #10 trazendo de volta três notas antigas sem relação, o #12 escrevendo os nomes de arquivo inventados no relatório — tudo isso continua empurrando para a frente sobre a premissa errada do #5. Corrigir o #6 (por exemplo, deixando a mensagem de ENOENT mais amigável) não resolve o problema, porque o #5 não deveria ter acontecido de jeito nenhum.

Que categoria de divergência: não é “chamou a ferramenta errada”, também não é “a ferramenta deu erro”, mas **processou a resposta da ferramenta incorretamente** — esse tipo é o mais difícil de perceber no monitoramento, porque a etapa que quebrou está verde nos logs.

**2. Reexecutar e observar.**

Monte uma simulação usando prompts idênticos e definições de ferramenta idênticas, observando o trabalho etapa por etapa. Duas restrições não podem afrouxar: a entrada copiada como está, sem suavizar “para ficar mais claro”, senão você está observando outro sistema; a observação precisa ser etapa por etapa, não dá para rodar até o fim e só conferir o relatório final — a informação da etapa da divergência está toda no meio.

O que observar: **a primeira ação do modelo depois de receber `entries` vazio**. Fixe a resposta do #4 como `{"entries": []}`, devolva isso a ele e observe se ele para e reporta diretório vazio ou se continua inventando. Se o comportamento variar entre várias reexecuções, é probabilístico e você precisa da etapa quatro para quantificar a frequência. Esta etapa provavelmente também vai trazer outras questões à tona — o `2026` na consulta do #10 esbarra no caso real das fontes nativas (acrescentar desnecessariamente o ano aos termos de busca, enviesando os resultados), e a consulta inteira é prolixa demais.

**3. Martelar repetidamente o `list_files`.**

O objeto martelado não é o agente inteiro, é o comportamento desta única ferramenta na fronteira dos resultados vazios. Especificamente duas coisas:

- **Formato de retorno**: `{"entries": []}` carrega informação de menos para o modelo. O mesmo vazio pode retornar de forma mais explícita, distinguindo por exemplo “o caminho existe mas não tem entradas” de “o caminho não existe”, para que o modelo saiba qual dos dois reportar.
- **Descrição da ferramenta**: ela explica o que significa um resultado vazio, o que fazer depois de receber um resultado vazio?

O método é usar esta ferramenta dezenas de vezes repetidamente, cobrindo formatos diferentes de caminho: inexistente, existente-mas-vazio, com-conteúdo, sem-permissão-suficiente, rodando muitas vezes para cada tipo, observando como o modelo interpreta o valor de retorno a cada vez, que percentual das vezes ele inventa nomes de arquivo. O sentido do “dezenas de vezes” está justamente aqui — rode três a cinco vezes e o bug do “às vezes ele inventa” pode não aparecer nenhuma vez. É assim que o agente oficial de teste de ferramentas foi usado.

Se o teste de estresse mostrar que o modelo tende a tentar um nome diferente depois de um ENOENT, então a mensagem de erro do `read_file` também deve ser mudada junto — respostas de erro podem ser escritas como prompts, dizendo explicitamente “este caminho não existe, por favor liste o diretório primeiro para confirmar, não chute nomes de arquivo”, mais útil do que jogar um `ENOENT`.

**4. Retomar depois do #4.**

O ponto de retomada é **a posição em que o `tool_result` do #4 já entrou no contexto mas o #5 ainda não aconteceu**. Troque pelo formato de retorno e pela descrição corrigidos, dê mais uma etapa a partir daqui e veja se desta vez ele para e reporta diretório vazio.

Dois motivos para não reexecutar a partir do #1. Um é desperdício: os resultados de #1–#4 estão completamente corretos, reexecutar só lista o mesmo diretório de novo. O outro é mais crítico — reexecutar coloca o não determinismo de volta. O modelo pode nem chamar `list_files` desta vez, e aí você não consegue julgar se “não inventou nomes de arquivo desta vez” é porque você corrigiu certo ou porque ele acabou seguindo outro caminho. Retomar depois do #4 trava a variável na única etapa que você quer verificar.

<!-- hint -->

Dica: leia este trecho de eventos de trás para frente e a primeira coisa que você vai ver são dois ENOENT, fácil parar por ali. Mas ENOENT significa “este arquivo não existe” — a pergunta é: de onde vieram esses dois nomes de arquivo? Procure a origem deles para trás na sequência de eventos; o lugar em que você não acha origem é a divergência.

<!-- hint -->

Dica: repare no `success=true` do #4. A ferramenta não falhou, ela devolveu um resultado vazio correto. Então o tipo de divergência deste estudo de caso não é “a ferramenta deu erro”, e sim “o agente entendeu errado um resultado correto” — pense nisso e a terceira questão, sobre o que martelar, ganha direção: martele a coisa que devolve resultados vazios, não a coisa que dá erro.

<!-- /exercises -->
