# Lição 6: Mão na massa: construindo um pipeline de revisão de dois agentes

> Objetivos de aprendizado:
> - Escrever um pipeline de dois agentes produtor-revisor genuinamente executável com a API do Claude
> - Fazer o revisor devolver um resultado de revisão estruturado e verificável em vez de um genérico “parece bom”
> - Colocar uma válvula de segurança no loop para que o produtor e o revisor não fiquem polindo um para o outro para sempre
>
> Pré-requisitos: concluir as Lições 1 a 5, ser capaz de ler JavaScript/Node.js básico e ter uma chave da API do Claude funcionando | Anterior: [Lição 5 <<](./05-failure-and-coordination.md)

## Primeiro, o resultado: uma execução completa

Isto é o que você terá rodando ao final da lição. Você entrega uma tarefa ao terminal, e dois agentes se revezam até a revisão passar ou você atingir o limite de rodadas:

```
$ node review-pipeline.js "Write an API change announcement for developers: the v2 endpoint changes the user_id field from a number to a string"

[Producer v1]
The v2 endpoint is here! Hugely improved experience — please switch to the new version soon.

[Reviewer round 1] Rejected. Issues:
- Doesn't spell out the specific field this change affects (never mentions that user_id goes from number to string)
- Gives no migration advice; developers don't know how to update their code
- "Hugely improved experience" is an unverifiable, exaggerated claim with no concrete basis

[Producer v2]
v2 API change notice: the user_id field type changes from number to string.
Check every piece of code that parses this field and switch the read logic from numeric to string,
to avoid parse failures caused by the type mismatch. This change takes effect in v2.1.0.

[Reviewer round 2] Approved

Final draft (approved in round 2):
v2 API change notice: the user_id field type changes from number to string.
Check every piece of code that parses this field and switch the read logic from numeric to string,
to avoid parse failures caused by the type mismatch. This change takes effect in v2.1.0.
```

A primeira versão é rejeitada pelo revisor, com razões atreladas a cada critério específico; o produtor revisa em uma segunda versão, o revisor olha de novo e, desta vez, ela passa. Este é o padrão **produtor-revisor** da Lição 4 transformado em código: "one LLM call generates a response while another provides evaluation and feedback in a loop."[^S2]

## A forma geral: o mesmo esqueleto de um loop de execução

Se você fez o curso Tool calling de agentes: fazendo agentes agirem de verdade desta série, o esqueleto deste pipeline vai parecer familiar: um loop, um julgamento por rodada, um resultado que decide se continua, mais uma válvula de segurança contra o loop infinito. A única diferença é o que o julgamento julga — o loop de execução de ferramentas daquele curso julga “o modelo ainda quer chamar uma ferramenta” (a semântica do loop está na lição A ida e volta completa de uma chamada de ferramenta daquele curso e em suas fontes oficiais), enquanto aqui ele julga “o revisor disse que passou”. Mesmo esqueleto, conteúdos diferentes no corpo do loop.

O pipeline inteiro são três funções costuradas juntas: `runProducer` gera ou revisa o texto, `runReviewer` o pontua em relação a critérios e dá notas específicas, e `runPipeline` liga as duas em um loop com um teto de rodadas como válvula de segurança.

## Passo 1: O produtor — receber a tarefa, produzir o texto

Na primeira execução, o produtor tem apenas a própria tarefa; em uma segunda execução após uma rejeição, ele também carrega a **versão anterior completa** e as notas de revisão, de modo que o produtor revisa em cima da última versão de acordo com as notas em vez de improvisar do zero:

```js
import Anthropic from "@anthropic-ai/sdk";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const MODEL = "claude-sonnet-5"; // troque por um modelo que sua conta consiga chamar
const MAX_ROUNDS = 3; // válvula de segurança: produtor-revisor pole no máximo 3 rodadas, para evitar um loop infinito

async function runProducer(task, feedback, prevDraft) {
  const prompt = feedback
    ? `Task: ${task}\n\nYour previous version was:\n"""\n${prevDraft}\n"""\n\nThe reviewer rejected it with these notes:\n${feedback}\n\nRevise your previous version according to these notes. Return the full revised text only, with no extra explanation.`
    : `Task: ${task}\n\nReturn the text only, with no extra explanation.`;

  const response = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 512,
    messages: [{ role: "user", content: prompt }],
  });
  const block = response.content.find((b) => b.type === "text");
  return block ? block.text.trim() : "";
}
```

O prompt do produtor é autocontido. Como a Lição 3 cobriu, um subagente não consegue ver o que aconteceu do lado do orquestrador, e também não consegue ver como foi revisado da última vez[^S3]. Então cada chamada escreve “qual é a tarefa”, “o que a versão anterior dizia” e “(se houver) quais foram os problemas da última rodada” no prompt desta chamada, literalmente. Note que até o próprio rascunho anterior do produtor precisa ser repassado explicitamente — esta é a metade do princípio do autocontido que é mais fácil de esquecer: a Messages API é sem estado, cada requisição precisa carregar todo o histórico de que precisa, e o servidor não guarda nada entre requisições[^S8]. “Revise sua versão anterior” só significa algo quando a versão anterior foi de fato escrita neste prompt.

## Passo 2: O revisor — pontuar em relação a critérios concretos, sem veredictos vagos

O revisor não apenas pergunta ao modelo “isso é bom”. Como a Lição 5 cobriu, a verificação precisa pousar em critérios concretos e verificáveis em vez de uma nota baseada em impressão[^S1]. Aqui o revisor recebe uma lista de verificação explícita e é obrigado a responder em um formato JSON fixo:

```js
const REVIEW_CRITERIA = [
  "Does it clearly state the specific field or endpoint this change affects (not just 'something changed' or 'better experience')?",
  "Does it give concrete migration advice, telling developers how to update their code?",
  "Is the whole announcement kept under 150 words?",
  "Are there any unverifiable, exaggerated claims (like 'hugely improved' with no concrete basis)?",
];

async function runReviewer(task, draft) {
  const prompt = `You are the reviewer. You only find problems; you do not rewrite. Task requirements: ${task}

Review criteria (check each one; do not give a vague verdict):
${REVIEW_CRITERIA.map((c, i) => `${i + 1}. ${c}`).join("\n")}

Text to review:
"""
${draft}
"""

Reply strictly in the JSON format below, with no text outside the JSON:
{"approved": true or false, "issues": ["list each criterion that failed, with the specific problem for each; if all pass, give an empty array"]}`;

  const response = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 512,
    messages: [{ role: "user", content: prompt }],
  });
  const block = response.content.find((b) => b.type === "text");
  return block ? block.text.trim() : "{}";
}
```

Juntos, os campos `approved` e `issues` formam um **resultado de revisão estruturado**: não um único “está ok”, mas “passou ou falhou” mais “o problema específico por trás de cada critério que falhou”. Uma vez que o produtor tem `issues`, ele revisa esses problemas específicos em vez de adivinhar para onde ir a partir de um veredicto vago.

## Passo 3: Não confie cegamente no resultado da revisão — trate uma falha de parse como uma rejeição

`runReviewer` devolve uma string, não um objeto JSON de verdade, então ainda precisa ser feito o parse. Mesmo que o revisor seja instruído a “responder estritamente em JSON”, sem uma restrição de saída estruturada o modelo ainda pode produzir JSON sintaticamente inválido, omitir campos ou embrulhar o JSON em um bloco de código com algumas linhas de explicação ao redor[^S9]. A armadilha aqui é: o que acontece quando o parse falha? Tomar o caminho preguiçoso — deixar passar por padrão numa falha de parse — silenciosamente transforma uma falha de “o revisor não fez seu trabalho” em “revisão passou”. Esse é exatamente o ponto que a Lição 5 fez: uma saída que “parece” pronta não é o mesmo que uma saída que de fato está correta, e o que você não consegue verificar não deveria entregar[^S6]. Aqui fazemos o oposto: uma falha de parse sempre conta como uma **rejeição**, nunca como um passe:

```js
function extractJson(raw) {
  // O modelo às vezes embrulha o JSON em um bloco de código; tente primeiro remover a cerca
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
  return fenced ? fenced[1].trim() : raw.trim();
}

function parseReview(raw) {
  try {
    const parsed = JSON.parse(extractJson(raw));
    if (typeof parsed.approved !== "boolean" || !Array.isArray(parsed.issues)) {
      throw new Error("field shape is wrong");
    }
    return parsed;
  } catch (err) {
    return {
      approved: false,
      issues: [`Reviewer did not reply in the agreed format. Raw content: ${raw.slice(0, 200)}`],
    };
  }
}
```

As linhas `typeof parsed.approved !== "boolean"` e `!Array.isArray(parsed.issues)` estendem a mesma ideia — mesmo quando `JSON.parse` tem sucesso, você ainda confirma que os campos parseados têm a forma certa, e um tipo de campo errado também conta como uma rejeição. Não baixe a guarda só porque é “pelo menos JSON válido”.

Um à parte: existe um recurso oficial de saídas estruturadas que garante, no nível da amostragem, que a resposta corresponde estritamente a um schema[^S9]. Esta lição usa deliberadamente o estilo “chamada crua mais seu próprio parse defensivo” para você sentir na pele que a saída do modelo não pode ser confiada cegamente; em produção, você pode usar saídas estruturadas para remover essa cova por completo.

## Passo 4: Ligue tudo em um loop, adicione a válvula de segurança

Com `runProducer`, `runReviewer` e `parseReview` em mãos, `runPipeline` liga os três, e `MAX_ROUNDS` é a única válvula de segurança aqui — o produtor e o revisor poderiam, em teoria, polir para sempre, então precisa haver um teto:

```js
async function runPipeline(task) {
  let draft = await runProducer(task);
  console.log(`[Producer v1]\n${draft}\n`);

  for (let round = 1; round <= MAX_ROUNDS; round++) {
    const review = parseReview(await runReviewer(task, draft));

    if (review.approved) {
      console.log(`[Reviewer round ${round}] Approved`);
      return { draft, rounds: round, approved: true };
    }

    console.log(`[Reviewer round ${round}] Rejected. Issues:\n- ${review.issues.join("\n- ")}\n`);

    if (round === MAX_ROUNDS) {
      return { draft, rounds: round, approved: false, issues: review.issues };
    }

    draft = await runProducer(task, review.issues.join("\n"), draft);
    console.log(`[Producer v${round + 1}]\n${draft}\n`);
  }
}

const task =
  process.argv[2] ??
  "Write an API change announcement for developers: the v2 endpoint changes the user_id field from a number to a string";

runPipeline(task)
  .then((result) => {
    if (result.approved) {
      console.log(`Final draft (approved in round ${result.rounds}):\n${result.draft}`);
    } else {
      console.log(
        `Hit the max round count (${MAX_ROUNDS}) without passing review. Emitting the last version for human review:\n${result.draft}\n\n` +
          `Issues left unresolved in the last round:\n- ${result.issues.join("\n- ")}`
      );
    }
  })
  .catch((err) => {
    // A própria chamada da API também pode falhar (rede, autenticação, limite de taxa); não engula isso em silêncio tampouco
    console.error(`Pipeline run failed: ${err.message}`);
    process.exitCode = 1;
  });
```

Quando atinge `MAX_ROUNDS` ainda sem passar, `runPipeline` não força um veredicto de “passou”. Ele honestamente entrega o último rascunho e os problemas ainda não resolvidos para revisão humana — este também é o ponto da Lição 5 aplicado na etapa de fechamento: quando a etapa de integração de resultados esbarra em algo que não consegue julgar, ela não deveria disfarçar isso decidindo por si mesma no código.

```agentmentor-check
{
  "id": "mac-zh-06-invalid-review-json",
  "label": "O revisor não respondeu no formato combinado — o que fazer",
  "prompt": "Enquanto roda este pipeline, o revisor uma vez não responde em JSON estrito e em vez disso adiciona uma linha, “Dei uma olhada rápida, o conteúdo está basicamente bom”, o que faz `JSON.parse` lançar um erro. Para manter o pipeline rodando, você deveria tratar essa falha de parse como uma revisão aprovada?",
  "whyHere": "“Só trate como um passe para o programa continuar rodando” é uma jogada tentadora e de baixo esforço exatamente quando o parse falha; este é o ponto de usar o princípio da Lição 5 — “uma saída que parece razoável não é o mesmo que uma saída que de fato está correta” — para empurrar essa ideia de volta, e para testar se você consegue aplicar esse princípio a código que você mesmo escreve",
  "mode": "single",
  "choices": [
    {
      "id": "a",
      "text": "Sim — o revisor de fato disse “basicamente bom”, então deixe passar e evite que o pipeline empaque",
      "correct": false,
      "feedback": "Isso é exatamente a trust-then-verify gap contra a qual a Lição 5 alertou. O revisor não responder no formato JSON combinado significa que ele não verificou cada critério em relação ao padrão desta vez, e um “basicamente bom” em linguagem natural não pode substituir um resultado de revisão estruturado. Tratar uma falha de parse como um passe silenciosamente reembala uma falha de “o revisor não fez seu trabalho” como “revisão passou” e a serve."
    },
    {
      "id": "b",
      "text": "Sim — contanto que o próprio texto do produtor pareça bom, o formato em que o revisor responde não importa",
      "correct": false,
      "feedback": "O formato de resposta do revisor é precisamente o único sinal que o pipeline usa para decidir “passou ou falhou” automaticamente. Se o formato pode ser ignorado à vontade e ainda contar como um passe, a etapa de revisão é uma casca oca, e os critérios de revisão estruturados que você projetou perdem o sentido."
    },
    {
      "id": "c",
      "text": "Não — uma falha de parse deveria contar como uma rejeição; registre a resposta bruta como um problema e tente de novo, ou escale para um humano",
      "correct": true,
      "feedback": "Correto. Um formato errado de resultado de revisão é em si uma situação de “não dá para verificar isso”, e pelo princípio da Lição 5, o que você não consegue verificar não deveria entregar. É assim que `parseReview` lida com isso nesta lição: uma falha de parse sempre devolve `approved: false` e registra o conteúdo bruto como um problema, então o fluxo continua como uma rejeição em vez de silenciosamente deixar passar."
    }
  ]
}
```

<!-- exercises -->
## 💻 Exercícios

### Nível 1: Coloque para rodar, depois adicione um critério de revisão

Monte o código desta lição em um `review-pipeline.js`, rode `npm install @anthropic-ai/sdk`, `npm pkg set type=module`, defina `ANTHROPIC_API_KEY` e rode a tarefa de exemplo desta lição uma vez. Confirme que você vê pelo menos uma rodada “Rejected” antes de ver “Approved”. (Se a primeira versão do produtor passar direto, troque por uma tarefa mais fácil de tropeçar — por exemplo, peça deliberadamente “um anúncio bem curto” sem dizer quão curto.)

Uma vez que rode, adicione um novo critério a `REVIEW_CRITERIA`: “Does the text mention the specific version number where the change takes effect?” Rode de novo e confirme que os `issues` do revisor agora incluem uma nota atrelada a esse novo critério.

<!-- rubric -->
- O pipeline de fato roda, e o log mostra a primeira versão do produtor mais pelo menos uma rodada de notas de revisão
- O critério de revisão adicionado de fato muda o resultado da revisão — um rascunho sem aquele pedaço de informação é sinalizado
- Você consegue explicar o que o pipeline acaba produzindo se nunca passar e atingir `MAX_ROUNDS` (não um crash, mas entregar a última versão e os problemas não resolvidos)

<!-- answer -->
Adicione mais um item ao array `REVIEW_CRITERIA`:

```js
const REVIEW_CRITERIA = [
  "Does it clearly state the specific field or endpoint this change affects (not just 'something changed' or 'better experience')?",
  "Does it give concrete migration advice, telling developers how to update their code?",
  "Is the whole announcement kept under 150 words?",
  "Are there any unverifiable, exaggerated claims (like 'hugely improved' with no concrete basis)?",
  "Does the text mention the specific version number where the change takes effect?",
];
```

Você não precisa mexer em nenhum código de `runReviewer` ou `runPipeline` — os critérios de revisão são emendados ao prompt do revisor via uma template string, então adicionar um elemento ao array significa que o revisor verifica a nova lista completa, item a item, na próxima chamada. Se o rascunho do produtor continuar deixando de mencionar um número de versão, `issues` vai carregar uma nota específica para este critério, e o produtor revisa de acordo com essa nota na rodada seguinte.

<!-- hint -->
Se você descobrir que a primeira versão do produtor passa direto e você nunca vê uma linha de log “Rejected”, a tarefa é fácil demais de satisfazer para o produtor — tente deixar os critérios de revisão mais rígidos, ou adicionar à tarefa um requisito específico que o produtor tende a deixar passar na primeira passada.

<!-- hint -->
Quando atinge `MAX_ROUNDS` ainda sem passar, olhe de novo o trecho final de `runPipeline` — ele não lança um erro e derruba o programa. Ele retorna normalmente com `approved: false` mais o último rascunho e a lista de problemas, deixando para o código chamador decidir o que fazer.

### Nível 2: Quebre algo de propósito, depois conserte

A versão de `parseReview` abaixo tem um problema. Primeiro explique a situação em que ela deixaria passar como “approved” um rascunho que nunca foi de fato revisado, depois dê o código corrigido.

```js
// A versão quebrada
function parseReview(raw) {
  try {
    return JSON.parse(raw);
  } catch (err) {
    return { approved: true, issues: [] };
  }
}
```

<!-- rubric -->
- Nomeia o problema com precisão: em uma falha de parse ela retorna `approved: true`, o que trata uma falha de “o revisor não respondeu no formato combinado” como “revisão passou”
- Explica a consequência concreta que isso traz (atrelando ao princípio da Lição 5 de “você não pode confiar nisso cegamente”)
- A correção muda o fallback de falha de parse para `approved: false` e registra o conteúdo bruto em `issues`, para triagem ou para uma nova tentativa do produtor

<!-- answer -->
O problema é que o ramo `catch` define o fallback como `{ approved: true, issues: [] }`. Sempre que o revisor não responder em JSON desta vez (mesmo que só tenha adicionado uma linha de conversa fiada), `JSON.parse` lança um erro, e o ramo `catch` imediatamente marca como “approved” e deixa passar um rascunho que “nunca foi efetivamente revisado”. Isso é exatamente o que a Lição 5 alertou: uma saída que “parece” pronta não é o mesmo que uma saída que de fato está correta, e uma situação que você não consegue verificar não deveria ser tomada como um resultado aprovado e entregue.

A correção é fazer com que uma falha de parse sempre conte como uma rejeição:

```js
function parseReview(raw) {
  try {
    const parsed = JSON.parse(extractJson(raw));
    if (typeof parsed.approved !== "boolean" || !Array.isArray(parsed.issues)) {
      throw new Error("field shape is wrong");
    }
    return parsed;
  } catch (err) {
    return {
      approved: false,
      issues: [`Reviewer did not reply in the agreed format. Raw content: ${raw.slice(0, 200)}`],
    };
  }
}
```

<!-- hint -->
Coloque-se no caso específico em que o revisor “não respondeu no formato combinado” — se o fallback é “approved”, aquele rascunho foi servido sem nenhuma verificação efetiva, nada diferente do revisor nunca ter rodado.

<!-- hint -->
Para decidir qual deveria ser o fallback, inverta a pergunta: uma falha de parse está mais perto de “confirmado sem problemas”, ou de “não dá para confirmar se há um problema”? A resposta da Lição 5: se você não consegue confirmar, não trate como sem-problema.

<!-- /exercises -->

## Recapitulação

- O esqueleto do pipeline produtor-revisor é a mesma coisa que um loop de execução: um loop, um julgamento por rodada, um resultado que decide se continua, mais uma válvula de segurança contra o loop infinito. A definição oficial deste padrão é exatamente "one LLM call generates a response while another provides evaluation and feedback in a loop"[^S2] — aqui o julgamento muda de “uma ferramenta deveria ser chamada” para “o revisor disse que passou”.
- O prompt do produtor é autocontido: cada chamada escreve a tarefa, a versão anterior completa e (se houver) os problemas específicos da última rodada no prompt, literalmente — a Messages API é sem estado, cada requisição precisa carregar todo o histórico, e nada é guardado entre requisições[^S8], então você não pode contar com o modelo lembrando por conta própria o que aconteceu na última rodada[^S3].
- O revisor pontua em relação a critérios concretos e verificáveis, item a item, e devolve um `{approved, issues}` estruturado em vez de um veredicto genérico[^S1].
- O que o revisor devolve também não pode ser confiado cegamente — uma falha de parse ou uma forma de campo errada deveria contar como uma rejeição, não um passe silencioso[^S6]; esse princípio se aplica não só a “confiar no que um subagente diz”, mas também a “confiar no formato de dados que um subagente devolve”.
- Quando atinge a contagem máxima de rodadas ainda sem passar, o pipeline deveria honestamente entregar o último rascunho e os problemas não resolvidos para revisão humana, em vez de decidir um passe por si mesmo no código.

E é isso, as seis lições deste curso: de “por que vários agentes”, passando por como o orquestrador e os subagentes dividem o trabalho, como escrever prompts de delegação, qual padrão de colaboração se encaixa em qual cenário e como lidar com falhas, terminando com a construção à mão de um pipeline produtor-revisor funcionando. A coisa mais valiosa a fazer em seguida não é reler as explicações — é pegar uma tarefa pequena e real que você tem em mãos, jogá-la neste esqueleto de pipeline, ajustar os critérios de revisão e rodá-lo para ver se ele rejeita o rascunho e quantas vezes. Ajustar você mesmo os critérios de revisão uma vez vale mais que reler a teoria dez vezes.
