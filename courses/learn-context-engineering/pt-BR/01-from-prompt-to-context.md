# Lição 1: De prompt engineering a context engineering

> Objetivos de aprendizado:
> - Reenunciar as definições de prompt engineering e de context engineering, e dizer por que as duas são uma “evolução” e não uma “substituição”
> - Usar as duas ideias de “orçamento de atenção” e “apodrecimento do contexto” para explicar a um colega o que está errado em “a janela é grande o bastante, então enfie tudo lá dentro”
> - Apontar, no loop do harness que você construiu no curso “Fundamentos do Harness de Agente: Laços e Controle” desta série, os lugares em que o contexto só cresce e nunca encolhe
>
> Pré-requisitos: Você concluiu o curso “Fundamentos do Harness de Agente: Laços e Controle” desta série e tem à mão um loop funcional dirigido por stop_reason | Próxima: [Lição 2 >>](./02-anatomy-of-context.md)

## Uma cena familiar: a cada volta do loop, a janela fica mais pesada

No curso “Fundamentos do Harness de Agente: Laços e Controle” desta série, você escreveu à mão um loop assim (simplificado; as quatro válvulas de controle — teto máximo de turnos, orçamento e as demais — ficam de fora por ora):

```javascript
let response = await client.messages.create({
  model: MODEL, max_tokens: 1024, tools, messages, // fique de olho no array messages
});

while (response.stop_reason === "tool_use") {
  messages.push({ role: "assistant", content: response.content });

  const toolResults = await runToolUses(response.content, toolImpls);
  messages.push({ role: "user", content: toolResults }); // os resultados de ferramenta também entram

  response = await client.messages.create({
    model: MODEL, max_tokens: 1024, tools, messages,
  });
}
```

Naquela época toda a nossa atenção estava no fluxo de controle: como ler o `stop_reason`, como instalar as válvulas de controle. Agora mude o ângulo e encare o array `messages` — ele só recebe `push`, nunca é podado. A cada turno, pelo menos duas coisas entram: a resposta do modelo naquele turno (com seus blocos tool_use) e os resultados que as ferramentas devolvem. O segundo tipo costuma ser o grosso: imagine um único `list_files` trazendo de volta algumas centenas de nomes de arquivo, ou uma busca em logs trazendo dezenas de KB de texto cru. Dali em diante eles ficam na janela para sempre, relidos do zero a cada rodada de raciocínio.

Isso não é um deslize da sua implementação; é a natureza de um agente. "An agent running in a loop generates more and more data that could be relevant for the next turn of inference"[^S1] (um agente rodando em loop gera cada vez mais dados que poderiam ser relevantes para o próximo turno de inferência), e, como ele detém a autonomia, pode seguir por um bom número de turnos[^S2]. No curso “Fundamentos de prompt engineering: como escrever instruções eficazes” desta série você aprendeu a escrever uma única instrução com clareza — mas, por melhor que uma instrução seja escrita, ela ainda é só um bloco pequeno dentro da janela. O que de fato decide como o agente se sai no turno 40 é tudo aquilo que estiver na janela inteira naquele momento.

## Duas definições: de “escrever uma boa frase” a “gerenciar a janela inteira”

Formalize essa observação e você chega a duas definições.

**Prompt engineering**: "Prompt engineering refers to methods for writing and organizing LLM instructions for optimal outcomes"[^S1] (prompt engineering se refere a métodos para escrever e organizar instruções de LLM visando resultados ótimos). A pergunta que ele responde é: “como devo escrever e arranjar esta instrução para obter o melhor efeito?”

**Context engineering**: "the set of strategies for curating and maintaining the optimal set of tokens (information) during LLM inference"[^S1] (o conjunto de estratégias para curar e manter o conjunto ótimo de tokens (informação) durante a inferência de um LLM). A pergunta que ele responde é: “para esta rodada de raciocínio, quais tokens devem estar na janela, e quais não devem?”

Repare no salto de perspectiva. A primeira é um problema de escrita pontual — escreveu uma vez, está resolvido. A segunda é um trade-off que você tem de responder de novo a cada volta do loop. A Anthropic enquadra explicitamente context engineering como a progressão natural de prompt engineering — "we view context engineering as the natural progression of prompt engineering"[^S1] (vemos context engineering como a progressão natural de prompt engineering) —, então a habilidade que você construiu no curso “Fundamentos de prompt engineering: como escrever instruções eficazes” desta série não se perde em nada. Ela vira um subconjunto de um problema maior: o system prompt ainda precisa ser bem escrito, mas é só um dos muitos ingredientes de contexto que você agora tem de gerenciar.

A comunidade tem opiniões mais agressivas. Um roteiro de engenharia de agentes de 2026 afirma que "Prompt engineering is dead as a standalone skill in 2026."[^S5] (prompt engineering está morto como habilidade autônoma em 2026.) Note que esse é o veredito opinativo daquele roteiro, e esta lição não o trata como consenso — a formulação da Anthropic é bem mais comedida: evolução, não substituição[^S1]. Dito isso, vale guardar a definição de uma linha que o mesmo roteiro dá para context engineering: "deciding what tokens are in front of the model at every step of the loop"[^S5] (decidir quais tokens estão diante do modelo em cada etapa do loop). E o mesmo roteiro põe o dedo no quanto o harness importa: "Same model, different harness, completely different result."[^S5] (mesmo modelo, harness diferente, resultado completamente diferente.) — algo que você já deveria sentir na pele depois dos experimentos do curso “Fundamentos do Harness de Agente: Laços e Controle” desta série.

## Orçamento de atenção: cada novo token entra na conta

Por que isto é algo que você tem de gerenciar? Uma janela maior não é simplesmente rédea solta? Aí entra o primeiro fato físico.

"LLMs have an "attention budget" that they draw on when parsing large volumes of context"[^S1] (LLMs têm um “orçamento de atenção” do qual sacam ao processar grandes volumes de contexto). O detalhe é que esse orçamento é finito: "Every new token introduced depletes this budget by some amount"[^S1] (cada novo token introduzido esgota esse orçamento em alguma medida).

Uma analogia. A capacidade da janela é a área de piso de um galpão; o orçamento de atenção é a equipe que você manda lá dentro achar a mercadoria. Amplie o galpão dez vezes e a equipe não cresce junto — quanto mais cheias as prateleiras, mais difícil desencavar o único item que você de fato quer. Enfiar mais um documento “por via das dúvidas” na janela não é um backup grátis; é uma cobrança real contra o orçamento, paga para cobrir o custo de lê-lo e descartá-lo.

Vire para esse ponto de vista e muitos hábitos merecem uma segunda olhada. “A janela aguenta, então vamos colar a documentação inteira da API” — aguentar é uma questão de galpão, ler bem é uma questão de orçamento, e as duas coisas não são a mesma.

## Apodrecimento do contexto: uma ladeira suave, não um penhasco

A consequência macro de um orçamento sendo drenado continuamente tem um nome vívido: **apodrecimento do contexto** (context rot) — "as the number of tokens in the context window increases, the model's ability to accurately recall information from that context decreases"[^S1] (conforme o número de tokens na janela de contexto aumenta, a capacidade do modelo de recuperar com precisão informações desse contexto diminui).

Dois detalhes fáceis de errar, fixados aqui:

**Primeiro, é gradual, não uma queda súbita.** Essa degradação aparece como uma ladeira de desempenho — "These factors create a performance gradient rather than a hard cliff"[^S1] (esses fatores criam um gradiente de desempenho, não um penhasco abrupto) — e não como um penhasco em que tudo para de funcionar de repente passada certa contagem de tokens. Ou seja, você nunca vai receber um erro; o agente só vai ficando devagarinho mais burro. Em termos do dia a dia (esta é a forma típica que isso assume na experiência de engenharia, não uma enumeração da fonte): convenções confirmadas antes começam a ser esquecidas, arquivos já lidos são lidos de novo, bugs já corrigidos são revertidos. Degradação sem alarme é mais difícil de rastrear do que um erro.

**Segundo, é uma regra geral, não a mania de um modelo.** Alguns modelos degradam de forma mais suave que outros, mas "some models exhibit more gentle degradation than others, this characteristic emerges across all models"[^S1] (alguns modelos exibem degradação mais suave que outros, essa característica emerge em todos os modelos). Trocar para um modelo mais forte pode adiar o problema; não pode cancelá-lo.

Junte os dois e você tem a primeira pedra angular desta lição: "context, therefore, must be treated as a finite resource with diminishing marginal returns"[^S1] (o contexto, portanto, precisa ser tratado como um recurso finito com retornos marginais decrescentes). O milésimo token que você enfia na janela e o centésimo milésimo ocupam o mesmo espaço, mas estão a mundos de distância no valor que agregam. O instinto de “mais é mais seguro” aponta exatamente para o lado errado — cada pedacinho extra de “garantia” que você espreme lá dentro dilui a atenção do modelo sobre a informação que de fato importa.

```agentmentor-check
{
  "id": "ctx-zh-01-finite-attention",
  "label": "Testar o instinto de “enfiar tudo por segurança” com o orçamento de atenção",
  "prompt": "Um colega vê você pesando o que colocar na janela a cada turno e diz: “A janela do modelo tem 200K tokens. É só enfiar os documentos do projeto, o histórico completo da conversa e todas as descrições de ferramentas — ter toda a informação é mais seguro do que deixar faltar alguma.” Qual julgamento está certo?",
  "whyHere": "A seção anterior acabou de cobrir orçamento de atenção e apodrecimento do contexto, então isto verifica se você de fato largou o instinto de “mais é mais seguro” — é o equívoco central que esta lição precisa quebrar, e as cinco lições seguintes se apoiam nessa base.",
  "mode": "single",
  "choices": [
    {
      "id": "a",
      "text": "O colega está certo: enquanto a janela não estiver cheia, a informação extra fica ali parada sem ser usada e não custa nada.",
      "correct": false,
      "feedback": "Não exatamente. “Não estar cheia significa custo zero” é um equívoco: processar grandes volumes de contexto já consome o orçamento de atenção, cada novo token o esgota em alguma medida, e conteúdo irrelevante dilui a recuperação de informação-chave pelo modelo — tudo isso independe de a janela estar ou não na capacidade máxima."
    },
    {
      "id": "b",
      "text": "Cada novo token consome o orçamento finito de atenção, e quanto mais tokens houver, pior fica a recuperação precisa — o contexto é um recurso finito com retornos marginais decrescentes, então “caber” não significa “estar seguro”.",
      "correct": true,
      "feedback": "Correto. Capacidade da janela e orçamento de atenção são duas coisas diferentes: a primeira decide quanto cabe, o segundo decide quão bem dá para usar. Embora a degradação seja uma ladeira e não um penhasco, a tendência aparece em todos os modelos, então os trade-offs não são opcionais."
    },
    {
      "id": "c",
      "text": "O problema é só o custo: mais tokens custam mais dinheiro, mas, desde que dê para pagar a conta, encher a janela não afeta a qualidade das respostas.",
      "correct": false,
      "feedback": "Não exatamente. O custo de fato sobe, mas essa não é a questão de fundo: quanto mais tokens houver, pior a capacidade do modelo de recuperar com precisão informações do contexto — é uma regra de desempenho sem relação com a cobrança, e nenhum dinheiro compra de volta a atenção diluída."
    }
  ]
}
```

## De volta aos agentes: por que isto é o alicerce, não o acabamento

Numa pergunta e resposta de turno único, você talvez nem note o apodrecimento do contexto — a janela é usada uma vez e descartada, e a contagem de tokens normalmente não chega à zona de perigo. Agentes transformam esse problema de “encontrado de vez em quando” em “piorando a cada turno”: os dados no loop só crescem e nunca encolhem[^S1], e agentes podem rodar autonomamente por muitos turnos[^S2]. Volte ao código de abertura — aquele array `messages` que só aceita `push` e nunca devolve nada é esse processo tornado concreto.

A experiência de engenharia no campo bate perfeitamente. A documentação oficial do Claude Code afirma que "Claude's context window fills up fast, and performance degrades as it fills."[^S4] (a janela de contexto do Claude enche rápido, e o desempenho se degrada conforme ela enche.) Ela chama a janela de contexto de "the most important resource to manage."[^S4] (o recurso mais importante a gerenciar.) A mesma documentação ainda traz uma observação que vale copiar: "A clean session with a better prompt almost always outperforms a long session with accumulated corrections."[^S4] (uma sessão limpa com um prompt melhor quase sempre supera uma sessão longa com correções acumuladas.) — “conversou mais tempo” não quer dizer “conversou melhor”, e cada correção empilhada, cada desvio percorrido, continua na janela participando da próxima rodada de raciocínio.

Então, uma posição precisa para context engineering: não é o acabamento que você dá na fase de ajuste fino; é o alicerce da confiabilidade de um agente. As quatro válvulas de controle do curso “Fundamentos do Harness de Agente: Laços e Controle” desta série gerenciam “não deixe o loop escapar”; este curso instala outro conjunto de mecanismos — “não deixe a janela apodrecer”. Junte os dois conjuntos e o seu harness fica de fato pronto para você confiar tarefas longas a ele.

## O roteiro deste curso

Para tarefas de horizonte longo, a Anthropic resume três classes de técnicas — "compaction, structured note-taking, and multi-agent architectures" (compactação, anotação estruturada e arquiteturas multiagente), voltadas a ajudar agentes a "maintain coherence, context, and goal-directed behavior over sequences of actions"[^S1] (manter coerência, contexto e comportamento orientado a objetivos ao longo de sequências de ações). Este curso segue esse caminho:

- **Lição 2** disseca a janela: system prompt, definições de ferramentas, exemplos — quanto espaço cada um ocupa, e como escrevê-los sem desperdício.
- **Lição 3** cobre a recuperação just-in-time: em vez de enfiar todo o material de antemão, dê ao agente identificadores leves e deixe que ele vá buscar as coisas sob demanda.
- **Lição 4** cobre compactação e notas: quando a janela se aproxima do limite, como resumir e reiniciar, e como registrar informação-chave fora da janela.
- **Lição 5** cobre subagentes e isolamento de contexto: mande o trabalho exploratório bagunçado para um subagente com janela limpa, e traga de volta só a conclusão destilada.
- **Lição 6** volta ao seu próprio harness e instala esses mecanismos um a um.

Um último lembrete sobre proporção. Cada um desses mecanismos acrescenta complexidade, e a orientação de engenharia da Anthropic diz que "you should consider adding complexity only when it demonstrably improves outcomes."[^S2] (você deveria considerar adicionar complexidade apenas quando ela comprovadamente melhora os resultados.) Por isso toda lição adiante explica “quando vale a pena” antes de explicar “como fazer” — nem todo agente precisa de subagentes, e nem toda tarefa vale uma compactação.

<!-- exercises -->
## 💻 Exercícios

### Nível 1: Separe seis práticas em duas gavetas

Abaixo estão seis práticas. Quais pertencem principalmente a prompt engineering (com foco em “como escrever e organizar a própria instrução”), e quais pertencem principalmente a context engineering (com foco em “quais tokens manter na janela a cada rodada de raciocínio”)? Classifique cada uma e escreva uma justificativa de uma frase para cada.

1. Reescrever o system prompt de “você é um assistente” para uma descrição específica de responsabilidades e fronteiras
2. A cada turno do harness, substituir os resultados de ferramenta de três turnos atrás por um resumo de uma linha
3. Acrescentar à instrução da tarefa um exemplo do tipo “a entrada tem esta cara, a saída tem aquela”
4. Dado um manual de produto de 500 páginas, dar ao modelo só o sumário e os caminhos de arquivo, e deixá-lo consultar quando precisar
5. Trocar “seja conciso” na instrução por “responda em no máximo três frases”
6. Quando a sessão chegar ao turno 40, comprimir o histórico completo em um resumo e usá-lo para reiniciar com uma janela nova

<!-- rubric -->
- Fornece um critério claro para o julgamento: esta prática muda “a qualidade de algum texto de instrução” ou “a entrada, a saída e a permanência do conjunto de tokens na janela” — em vez de colar rótulos no chute
- A classificação bate com a resposta de referência (1, 3, 5 são prompt engineering; 2, 4, 6 são context engineering) ou, para itens em disputa, apresenta um argumento autoconsistente com base no critério enunciado
- Consegue usar as ideias de orçamento de atenção ou de recurso finito para explicar por que a categoria de context engineering não é opcional em cenários de agente com vários turnos

<!-- answer -->
Critério: olhe o objeto sobre o qual a prática age. Se ela modifica **como um trecho de texto de instrução é escrito** (redação, estrutura, exemplos), e uma vez escrito ele fica fixo, isso é prompt engineering. Se ela decide **qual conteúdo entra na janela, em que forma ele permanece e quando ele sai**, e precisa ser executada repetidamente no loop em execução, isso é context engineering.

Item a item:

- **1 → Prompt engineering.** Muda a qualidade do texto do system prompt, escrito uma vez e pronto; não envolve entrada e saída de conteúdo da janela.
- **2 → Context engineering.** Decide a permanência e a remoção de resultados de ferramenta antigos na janela — trocar o original por um resumo é uma ação de manutenção da janela executada a cada turno.
- **3 → Prompt engineering.** Acrescentar exemplos é organizar os componentes da instrução para transmitir melhor a intenção.
- **4 → Context engineering.** Escolher entre “texto completo na janela” e “só os caminhos, consulta sob demanda” é exatamente decidir quais tokens vão para a janela.
- **5 → Prompt engineering.** Trocar uma redação vaga por uma restrição testável é reescrita clássica de instrução.
- **6 → Context engineering.** Resumir e reiniciar muda o conjunto de tokens da janela inteira e não tem nada a ver com como uma instrução isolada é escrita.

Por que a segunda categoria não é opcional em cenários de agente com vários turnos: os dados no loop só crescem e nunca encolhem, enquanto o orçamento de atenção é finito e cada novo token consome uma parte dele; o contexto é um recurso finito com retornos marginais decrescentes[^S1]. Por melhor que a instrução seja escrita, ela não impede a janela de ser preenchida turno a turno com resultados de ferramenta e histórico de mensagens — alguém (ou seja, o seu harness) tem de fazer os trade-offs.

<!-- hint -->
Volte às duas definições: uma trata de “como escrever e organizar instruções”, a outra de “manter qual conjunto ótimo de tokens na janela no momento do raciocínio”. Para cada prática, pergunte: ela muda a redação de um trecho de texto, ou a entrada, a saída e a permanência do conteúdo da janela?

<!-- hint -->
Outro teste de tornassol: esta prática é escrita uma vez e pronto, ou é uma ação que precisa ser executada a cada turno (ou em turnos específicos) do loop? A segunda quase sempre é gerenciamento da janela.

### Nível 2: Instale um medidor mínimo de observação no loop

Sem chamar um modelo de verdade, escreva um script autônomo que simule o loop do curso “Fundamentos do Harness de Agente: Laços e Controle” desta série rodando por 20 turnos: a cada turno, anexe a `messages` uma mensagem simulada do assistente (suponha 200 caracteres) e um resultado de ferramenta simulado (suponha 3000 caracteres), e imprima a contagem acumulada de caracteres turno a turno. Depois adicione uma chave: manter apenas os resultados de ferramenta dos 5 turnos mais recentes (movendo os mais antigos para fora da lista) e rode de novo. Responda a duas perguntas: que tendência a contagem acumulada mostra em cada um dos dois modos? O que a diferença diz?

<!-- rubric -->
- O script roda de forma independente e imprime a contagem acumulada turno a turno; o modo “manter tudo” mostra crescimento linear, confirmando que “os dados no loop só crescem e nunca encolhem”
- O modo “manter apenas os resultados de ferramenta dos 5 turnos mais recentes” desacelera nitidamente sua taxa de crescimento a partir do turno 6 (os resultados de ferramenta atingem um teto, sobrando só as mensagens do assistente se acumulando devagar), e consegue apontar que a diferença vem inteiramente da poda dos resultados de ferramenta
- Consegue conectar a observação às ideias desta lição: crescimento linear não gerenciado drena continuamente o orçamento finito de atenção, então o conteúdo a podar primeiro é o “maior em tamanho e mais curto em utilidade”

<!-- answer -->
Implementação de referência:

```javascript
const ASSISTANT_LEN = 200;    // comprimento simulado (caracteres) da mensagem do assistente a cada turno
const TOOL_LEN = 3000;        // comprimento simulado (caracteres) do resultado de ferramenta a cada turno
const TURNS = 20;
const KEEP_RECENT_TOOL = 5;   // manter só os resultados de ferramenta dos 5 turnos mais recentes; use null para manter todos

let messages = [];
for (let turn = 1; turn <= TURNS; turn++) {
  messages.push({ role: "assistant", size: ASSISTANT_LEN });
  messages.push({ role: "tool", size: TOOL_LEN });

  if (KEEP_RECENT_TOOL !== null) {
    const toolIndexes = messages
      .map((m, i) => (m.role === "tool" ? i : -1))
      .filter((i) => i >= 0);
    const stale = new Set(toolIndexes.slice(0, -KEEP_RECENT_TOOL));
    messages = messages.filter((_, i) => !stale.has(i));
  }

  const total = messages.reduce((sum, m) => sum + m.size, 0);
  console.log(`turn=${String(turn).padStart(2)} total_chars=${total}`);
}
```

Tendências nos dois modos:

- **Manter tudo** (`KEEP_RECENT_TOOL = null`): ganho líquido de 3200 caracteres a cada turno, uma reta rigorosa, total acumulado de 64000 no turno 20. É essa a cara de “os dados só crescem e nunca encolhem” — sem intervenção, o crescimento nunca para.
- **Manter apenas os 5 turnos mais recentes**: idêntico a “manter tudo” nos primeiros 5 turnos; a partir do turno 6, cada novo resultado de ferramenta que entra desloca o mais antigo para fora, e um cancela o outro, de modo que o ganho líquido por turno cai para apenas 200 caracteres (a mensagem do assistente), com total acumulado no turno 20 de 200 × 20 + 3000 × 5 = 19000. A curva achata visivelmente depois do turno 5.

O que a diferença diz: o vão entre as duas curvas vem inteiramente da poda dos resultados de ferramenta — o conteúdo maior em tamanho e mais curto em utilidade na janela (listagens de arquivos antigas, texto cru de buscas antigas, tipicamente não mais referenciado depois de alguns turnos). Sem gerenciamento, o crescimento linear drena continuamente o orçamento finito de atenção, e o contexto é um recurso finito com retornos marginais decrescentes[^S1]. Essa chave de “manter apenas os resultados de ferramenta dos N turnos mais recentes” é a forma mais simples da estratégia de compactação que a Lição 4 vai expandir sistematicamente.

<!-- hint -->
Você não precisa chamar uma API de verdade — o alvo da observação é o tamanho de `messages`, não o conteúdo que o modelo produz. Use mensagens de preenchimento com comprimento fixo para simular o que é acrescentado a cada turno.

<!-- hint -->
“Manter apenas os 5 turnos mais recentes” significa que, a partir do turno 6, cada novo resultado de ferramenta que entra tem um mais antigo que sai. Faça a conta: nesse ponto, o que sobra do ganho líquido por turno?

<!-- /exercises -->

## Recapitulação

- Context engineering é a progressão natural de prompt engineering: o primeiro gerencia “manter qual conjunto ótimo de tokens na janela no momento do raciocínio”, o segundo gerencia “como escrever e organizar instruções”, e a perspectiva sobe de uma frase para a janela inteira[^S1].
- “Prompt engineering está morto como habilidade autônoma” é uma afirmação opinativa de um roteiro da comunidade[^S5]; esta lição usa a formulação mais comedida — evolução, não substituição[^S1].
- LLMs processam o contexto usando um orçamento de atenção finito, e cada novo token consome uma parte dele[^S1] — “a janela aguenta” e “o modelo consegue usar bem” são duas coisas diferentes.
- O apodrecimento do contexto é uma ladeira gradual de desempenho e não um penhasco, mais íngreme em alguns modelos e mais suave em outros, mas a tendência aparece em todos os modelos[^S1], então ele não dá erro; só vai deixando o agente mais burro em silêncio.
- O contexto é um recurso finito com retornos marginais decrescentes[^S1]; os dados no loop de um agente só crescem e nunca encolhem[^S1], e é por isso que a documentação oficial do Claude Code chama a janela de contexto de "the most important resource to manage."[^S4] (o recurso mais importante a gerenciar.)
- As três classes de técnicas para tarefas de horizonte longo — compactação, anotação estruturada e arquiteturas multiagente[^S1] — correspondem às linhas principais das Lições 4 e 5; a Lição 6 as instala no seu harness. Antes de introduzir qualquer complexidade, confirme que ela de fato melhora os resultados[^S2].

[>> Lição 2: Anatomia do contexto: system prompt, ferramentas e exemplos](./02-anatomy-of-context.md)
