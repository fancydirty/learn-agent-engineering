# Lição 1: “Parece pronto” não é “está pronto”

> Objetivos de aprendizado:
> - Explicar por que o Claude para quando o trabalho *parece* pronto, e quem acaba fazendo a verificação quando isso acontece
> - Usar o contraste entre sistemas determinísticos e não determinísticos para explicar por que as premissas de “entrada X, caminho Y, saída Z” dos testes tradicionais desmoronam com agentes
> - Diante de um relatório de conclusão, distinguir quais frases são afirmações e quais são evidências, e identificar o que ainda falta para a aprovação
>
> Pré-requisitos: concluir os 9 primeiros cursos desta série; escrever à mão loops de harness guiados por `stop_reason`; entender checkpoints e recuperação | Próxima: [Lição 2 >>](./02-what-to-verify.md)

## Publicado na terça, quebrado na sexta

Terça à tarde, você pede a um agente que adicione um recurso de “importação em massa de usuários” a um painel administrativo interno: subir um CSV, fazer o parse, validar os campos, gravar no banco de dados. Você detalha os requisitos com clareza e sai para uma reunião.

Quando você volta, a sessão parou. A última mensagem é assim:

```text
Pronto.

- Adicionado src/importer/parseCsv.js para parse e mapeamento de campos
- Adicionado src/importer/validate.js para checar formato de e-mail e campos obrigatórios
- Inserção em lote conectada em POST /api/users/import

A implementação segue o estilo de código dos módulos existentes. Nenhum erro durante a execução.
```

Você passa os olhos no diff. As funções estão bem separadas, a nomenclatura combina com a dos módulos vizinhos, os casos extremos parecem considerados — arquivos vazios retornam um erro explícito, o regex de e-mail não está obviamente quebrado. Você faz o merge. Você publica.

Sexta à tarde, o pessoal de operações posta no canal: “Por que a gente acabou de importar 400 usuários vazios?”

A causa é simples. Operações gerou aquele CSV com um “Salvar como” do Excel, o que adicionou um BOM — três bytes invisíveis `﻿` que o Excel gosta de colocar no início de arquivos UTF-8. Com isso, o nome da primeira coluna foi parseado como `﻿email` em vez de `email`, todo o mapeamento de campos desandou, e cada linha virou “todos os campos são undefined”. E aquela camada de validação? Ela checava “o formato do e-mail é válido”, mas undefined tomou outro ramo e foi tratado como “esta coluna não foi preenchida”, então passou.

Ninguém fez corpo mole aqui. O agente escreveu código que roda. Ele se testou com um CSV que ele mesmo gerou — e claro que o CSV dele não tem BOM. Quando você revisou o diff, você estava checando “este código está escrito corretamente”, não “o que acontece quando este código encontra entrada do mundo real”. Os dois lados fizeram o melhor que podiam. A lacuna aconteceu do mesmo jeito.

O problema está **no momento em que ele parou**. Quando o agente parou, o que ele tinha era “escrevi, li uma vez, parece bom”. Ele não parou em “confirmei que está pronto”. Ele parou em “parece pronto”. E, pelo histórico da conversa, você não consegue distinguir os dois.

## Ele para onde as coisas parecem prontas

A documentação do Claude Code diz isso de forma direta: o Claude para quando o trabalho parece pronto; sem uma verificação que ele possa rodar, “parece pronto” é o único sinal disponível, e você vira o loop de verificação — todo erro fica esperando você notar[^S4].

Vale ler essa frase duas vezes, palavra por palavra. Ela não está dizendo “o Claude às vezes faz corpo mole”, nem “o modelo ainda não é capaz”. Ela descreve um fato estrutural: **se nada no pipeline inteiro consegue produzir um resultado objetivo, então “parece pronto” é o único sinal que existe neste sistema.** O modelo só consegue decidir com esse sinal. Ele não tem mais nada.

A mesma documentação dá um nome a esse fenômeno: a trust-then-verify gap (lacuna do confiar-e-depois-verificar) — o Claude produz uma implementação de aparência plausível que não lida com casos extremos[^S4]. Em português claro: você confia primeiro (o código parece bom), e a verificação ou não acontece ou acontece tarde demais (sexta à tarde, no canal de operações). O exemplo do BOM acima é a forma padrão dessa lacuna: não é código errado, é que ninguém perguntou “e se o arquivo tiver sido exportado do Excel?”.

Há aqui uma segunda camada fácil de perder. A correção sugerida pela documentação termina assim: **se você não consegue verificar, não publique**[^S4]. A ênfase não está em “verificar” — está em “não publique”. Isso reconhece que existem coisas que você simplesmente não consegue verificar. Quando é o caso, o movimento correto não é “confiar no faro só desta vez”. É estreitar o escopo, mudar o requisito, ou segurar a publicação.

## Afirmação e evidência: qual é a diferença?

Volte àquela mensagem de conclusão. Quebre-a em frases individuais e faça a mesma pergunta para cada uma: **eu consigo confirmar esta frase sem ler código, usando apenas o que ela me mostrou?**

- “Adicionado `src/importer/parseCsv.js`” — você consegue confirmar. Se o arquivo existe dá para checar de relance. Isso é evidência (embora do tipo mais fraco).
- “A implementação segue o estilo de código dos módulos existentes” — você não consegue confirmar. Isso é o julgamento estético do modelo. Afirmação.
- “Nenhum erro durante a execução” — soa como evidência, mas na verdade é uma afirmação. Ela diz que as ferramentas chamadas não lançaram exceções, não que a saída está correta. Todas as ferramentas retornarem sucesso enquanto o resultado está completamente errado — perfeitamente possível.
- “Checar formato de e-mail e campos obrigatórios” — você não consegue confirmar. Isso descreve intenção, não comportamento. O que aquele regex de fato permite ou rejeita? Esta frase não diz nada a respeito.

Onde fica a linha? **Evidência é algo que uma segunda pessoa consegue re-executar exatamente da mesma forma**: um comando mais sua saída bruta, um código de saída, uma lista de nomes de testes que falharam, uma captura de tela, uma comparação numérica antes/depois. **Afirmações são coisas em que você só pode escolher acreditar ou não**: “a lógica está correta”, “deve estar tudo bem”, “já otimizado”, “não vai acontecer de novo”.

A documentação oficial traça exatamente essa linha: faça o Claude mostrar evidências em vez de afirmar sucesso — a saída dos testes, o comando que ele rodou e o que ele retornou, ou uma captura de tela do resultado. Revisar evidências é mais rápido do que refazer a verificação você mesmo, e funciona para sessões que você não estava acompanhando[^S4].

Essa última meia-frase é a chave. Se você estava olhando o tempo todo, a distinção “afirmação ou evidência” não rende muito — você viu com os próprios olhos. Mas no momento em que você desvia o olhar, tudo o que sobra no histórico da conversa é texto, e em texto as afirmações parecem tão confiantes quanto as evidências.

## Por que agentes esbarram especialmente neste problema

A gente também vê “parece certo mas está errado” em software tradicional. Por que isso merece uma lição dedicada no caso dos agentes?

Porque os testes tradicionais se apoiam em uma premissa que os agentes não satisfazem.

Comece pelas definições. Em computação, sistemas determinísticos produzem a mesma saída toda vez, dadas entradas idênticas, enquanto sistemas não determinísticos — como os agentes — podem gerar respostas variadas mesmo com as mesmas condições iniciais[^S3]. Isso não é “tem bugs, por isso é instável”. É assim que funciona. Mesmo que você não mude nada no seu prompt, não há garantia de que as decisões de duas execuções coincidam[^S2].

Assim, a premissa da avaliação tradicional desmorona. Avaliações tradicionais costumam assumir que a IA segue as mesmas etapas toda vez: dada a entrada X, o sistema deveria seguir o caminho Y para produzir a saída Z[^S2]. Sistemas multiagente não funcionam assim. **Mesmo com pontos de partida idênticos, agentes podem tomar caminhos válidos completamente diferentes para chegar ao objetivo** — um agente pode buscar em três fontes enquanto outro busca em dez, ou eles podem usar ferramentas diferentes para achar a mesma resposta[^S2].

Concretamente, é assim que isso aparece:

```text
Mesma tarefa, mesmo prompt, duas execuções

Execução 1: read_file(schema.sql) → grep("user_id") → edit(models/user.js)
            → run_tests → pronto

Execução 2: list_dir(src/) → read_file(models/user.js) → read_file(models/order.js)
            → edit(models/user.js) → edit(models/order.js) → run_tests
            → run_tests → pronto
```

Você não pode chamar nenhuma das duas trajetórias de “errada”. A segunda execução leu um arquivo a mais, modificou um lugar a mais e rodou os testes duas vezes — talvez ela tenha dado uma volta, ou talvez tenha pego um acoplamento que a primeira deixou passar. Se você escrever uma asserção dizendo “precisa ler schema.sql primeiro”, a segunda execução é reprovada — mas pode ser que a segunda tenha feito um trabalho melhor.

**Conferir a trajetória contra um roteiro prescrito não funciona aqui**: como nem sempre sabemos quais são as etapas certas, em geral não dá para simplesmente checar se os agentes seguiram as etapas “corretas” que prescrevemos de antemão[^S2].

Acrescente mais uma camada: erros em sistemas de agentes **se acumulam**. Um bug pequeno em software tradicional, quando atinge um agente, pode descarrilar a tarefa inteira — a falha de uma única etapa pode fazer os agentes explorarem trajetórias completamente diferentes, levando a resultados imprevisíveis[^S2]. Isso não é como um programa tradicional em que “uma função retorna um valor ruim e ele se propaga para cima”. Um agente pega um resultado ruim e **toma novas decisões com base nesse resultado ruim**: leu um arquivo errado, pode concluir “este módulo não existe” e criar um novo; depois segue trabalhando em torno desse módulo novo. Quando você vê a saída final, o erro já não está mais no lugar de origem. Ele virou outra coisa.

A própria conclusão da Anthropic aterrissa aqui: a natureza autônoma dos agentes significa custos mais altos e o potencial de erros que se acumulam. Eles recomendam testes extensivos em ambientes sandbox, junto com os guardrails apropriados[^S1]. E mais uma frase direta — o LLM potencialmente vai operar por muitos turnos, e você precisa ter algum nível de confiança na tomada de decisão dele[^S1].

Repare na expressão “algum nível de confiança”. Ela não diz “você tem que confiar”. Ela diz que essa confiança precisa vir de algum lugar. E a confiança só tem duas fontes: você mesmo acompanhou (e então o agente não te economizou tempo nenhum), ou alguma coisa acompanhou por você. Este curso inteiro é sobre a segunda.

```agentmentor-check
{
  "id": "vq-zh-01-plausible-not-correct",
  "label": "Confiar neste relatório de conclusão?",
  "prompt": "Você pede a um agente que adicione uma função de “dividir valor por moeda” ao módulo de cobrança. Ele passa por umas vinte chamadas de ferramenta e por fim relata: “Pronto. A implementação atende aos requisitos. Nenhum erro durante a execução.” Você passa os olhos no diff: a estrutura é razoável, a nomenclatura segue as convenções, nenhum problema óbvio. O projeto tem uma suíte de testes, mas o agente não a rodou e você também não. O que você deveria fazer em seguida?",
  "whyHere": "A primeira metade da lição acabou de explicar por que agentes param em “parece pronto”; a segunda metade vai mostrar como dar a eles uma verificação que possam rodar. Esta pergunta fica no meio, forçando você a fazer um julgamento concreto antes de chegarmos aos princípios por trás dele — primeiro o julgamento, depois os princípios grudam.",
  "mode": "single",
  "choices": [
    {
      "id": "a",
      "text": "Nenhum erro no processo, e o diff parece bom — faça o merge. Se houver um problema real, alguém lá na frente vai encontrar.",
      "correct": false,
      "feedback": "“Nenhum erro” significa que as ferramentas chamadas não lançaram exceções, não que a saída está correta — todas as ferramentas retornarem sucesso enquanto o resultado está completamente errado são duas coisas que podem ser verdadeiras ao mesmo tempo. Quanto ao “alguém lá na frente vai encontrar”: é exatamente assim que se parece você virar o loop de verificação, só que o momento da verificação foi adiado para depois de uma falha. Em valores de cobrança, quando alguém lá na frente encontra, o financeiro normalmente já está fazendo perguntas."
    },
    {
      "id": "b",
      "text": "Rodar primeiro a suíte de testes, deixar esta mudança receber um resultado de passa/falha, e aí decidir se confia nela.",
      "correct": true,
      "feedback": "Correto. O valor desta etapa não é “rodei um teste”. É que você transformou uma situação que só dava para julgar no feeling em uma situação com um resultado objetivo. E esta etapa pode ser antecipada: já que a verificação existe e você conhece o comando, da próxima vez você pode dizer ao agente logo de cara “depois da mudança, rode npm test; me avise quando estiver tudo verde”. Aí não é você quem lê o resultado."
    },
    {
      "id": "c",
      "text": "Mandar mais uma rodada pedindo ao agente que confira o próprio trabalho; se ele disser que não há problema, fazer o merge.",
      "correct": false,
      "feedback": "Essa intuição é comum, mas está invertida. O modelo que fez o trabalho não deveria ser também o árbitro — o conselho da documentação oficial é fazer um novo modelo, com contexto limpo, tentar refutar o resultado. Quando ele se autoconfere, ele continua olhando para o raciocínio que acabou de escrever, que já era autoconsistente — senão ele não teria escrito daquele jeito em primeiro lugar. Pedir que ele “olhe de novo” na maior parte das vezes só repete o mesmo julgamento em um tom mais confiante."
    }
  ]
}
```

## A saída: dê a ele uma verificação que ele possa rodar

Toda essa preparação aterrissa em uma frase: **dê ao Claude uma verificação que ele possa rodar** — testes, um build, uma captura de tela para comparar. É a diferença entre uma sessão que você acompanha e uma da qual você pode se afastar[^S4].

De onde vem a diferença? Dê ao Claude algo que produza um passa ou falha, e o loop se fecha sozinho. O Claude faz o trabalho, roda a verificação, lê o resultado e itera até a verificação passar[^S4].

Dá para mapear essa frase de volta para o loop de harness do curso 7 desta série. Primeiro veja onde o seu loop atual para:

```javascript
let response = await client.messages.create({ tools, messages });
while (response.stop_reason === "tool_use") {
  messages.push({ role: "assistant", content: response.content });
  const toolResults = await runToolUses(response.content);
  messages.push({ role: "user", content: toolResults });
  response = await client.messages.create({ tools, messages });
}
// O loop para aqui: stop_reason mudou de "tool_use" para "end_turn"
```

O que `end_turn` significa? Significa que o modelo acha que terminou de falar neste turno. **Só isso.** Não significa que o trabalho está correto, e nem sequer garante que a resposta está completa — este loop só reconhece `tool_use`; se `stop_reason` virar qualquer outra coisa ele sai, inclusive quando a saída foi cortada no meio da frase por `max_tokens`. Nada na condição de saída tem a ver com “qualidade da saída”.

Então, como é ligar uma verificação? Duas posições funcionam.

Posição um: transforme a verificação em uma ferramenta que ele possa chamar, deixe rodar dentro do loop:

```javascript
const tools = [
  ...editTools,
  {
    name: "run_checks",
    description:
      "Roda a suíte de testes do módulo importer. Retorna o código de saída e os nomes dos testes que falharam. " +
      "Precisa ser chamada uma vez depois de modificar qualquer arquivo em src/importer/.",
    input_schema: { type: "object", properties: {}, required: [] },
  },
];
```

Posição dois: coloque uma comporta depois que o loop sai; não confie no autorrelato dele, rode você mesmo:

```javascript
// o while terminou, mas ainda não trate como concluído
messages.push({ role: "assistant", content: response.content }); // a resposta de encerramento do modelo também entra no histórico
let verdict = await runChecks(); // { exitCode, failed: ["parse do cabeçalho com BOM", ...] }

while (verdict.exitCode !== 0) {
  messages.push({
    role: "user",
    content: `As verificações não passaram. Testes que falharam: ${verdict.failed.join(", ")}. Corrija e me avise.`,
  });
  response = await client.messages.create({ tools, messages });
  // …de volta ao loop de tool_use acima, até ele encerrar de novo…
  messages.push({ role: "assistant", content: response.content }); // cada resposta de encerramento entra no histórico
  verdict = await runChecks();
}
```

O código em si não tem truque. O ponto é que **a condição de saída mudou de dono**: de “o modelo diz que não quer chamar mais ferramentas” para “um pedaço de código determinístico retornou 0”. A primeira é a autoavaliação do modelo. A segunda não é.

Então, o que pode ser uma “verificação”? A documentação oficial dá uma faixa mais ampla do que você imaginaria: a verificação é qualquer coisa que retorne um sinal que o Claude consiga ler na conversa — uma suíte de testes, o código de saída de um build, um linter, um script que compara a saída com um fixture, ou uma captura de tela do navegador comparada com um design[^S4].

Explicando “fixture”: é um “arquivo de resposta padrão-ouro” que você salvou de antemão; depois de rodar, você compara a saída com ele, e não pode diferir nem em um caractere. Parece grosseiro, mas para tarefas do tipo “o formato da saída precisa ser estável”, é a forma de verificação mais simples e mais confiável.

Essa linha de raciocínio se alinha com a recomendação da Anthropic para a execução de agentes: durante a execução, é crucial que os agentes obtenham “ground truth” do ambiente a cada etapa (como resultados de chamadas de ferramenta ou execução de código) para avaliar o próprio progresso[^S1]. Repare em “do ambiente” — não do próprio raciocínio dele. O raciocínio do modelo é autogerado. Os valores de retorno do ambiente não são.

## O que as próximas cinco lições resolvem

Com “dê a ele uma verificação que rode” como fio condutor, as perguntas restantes ficam concretas.

**Lição 2: o que verificar.** Já que conferir a trajetória contra um roteiro prescrito não funciona, o que você confere? Resposta: o estado final primeiro — avalie se ele alcançou o estado final correto, não se ele seguiu algum processo específico; para fluxos complexos, quebre a avaliação em checkpoints discretos onde mudanças de estado específicas deveriam ter ocorrido[^S2]. Essa lição também vai cobrir como transformar um requisito difuso em um critério de sucesso mensurável.

**Lição 3: verificadores determinísticos.** Como escolher e escrever verificações capazes de produzir passa/falha. Correspondência exata, comparação por script, suítes de testes — o que serve para quê, e uma armadilha contraintuitiva: um verificador estrito demais vai rejeitar respostas corretas. O catálogo concreto de verificadores e a ordem de prioridade ficam naquela lição; não vamos expandir aqui.

**Lição 4: juiz LLM.** Texto livre não dá para comparar por string; você tem que pedir a um modelo que pontue. Como escrever rubricas, como restringir o formato da saída, se é melhor raciocinar antes ou pontuar antes, e por que o modelo que faz o trabalho não deveria corrigir a si mesmo — já tocamos nisso no quiz mais acima. O desenho específico de rubricas está na lição 4.

**Lição 5: conjuntos de avaliação.** Uma verificação dá conta de uma tarefa; um conjunto de tarefas forma um conjunto de avaliação. Como coletar casos do uso real, como preencher os casos extremos, para que serve um conjunto de holdout, e “quantos são suficientes” — tudo respondido na lição 5; a resposta pode ser menor do que você imagina.

**Lição 6: construa você mesmo.** Junte as cinco primeiras lições: uma tarefa de avaliação recebe um loop de harness, rode e produza um relatório; troque uma versão do prompt e veja se a pontuação se mexeu.

## Proporcionalidade: não embrulhe cada coisinha em um processo de aprovação

A esta altura, é fácil pender para o outro extremo: supor que toda tarefa precisa de testes, de um juiz e de um conjunto de avaliação. Não é assim.

A frase original da Anthropic é: **a chave para o sucesso, como em qualquer funcionalidade com LLM, é medir o desempenho e iterar sobre as implementações. Repetindo: você deveria considerar adicionar complexidade apenas quando ela comprovadamente melhora os resultados**[^S1]. O mesmo artigo traz uma recomendação de rota mais específica — comece com prompts simples, otimize-os com avaliação abrangente, e só adicione sistemas agênticos de múltiplas etapas quando as soluções mais simples não derem conta[^S1].

Aplicado à verificação, os critérios de decisão se resumem a poucas linhas:

- **Esta tarefa vai rodar repetidamente?** Um script pontual, um processamento de dados ad hoc, um trabalho de três minutos que você pretende acompanhar — montar um mecanismo de aprovação é prejuízo líquido. Coisas que rodam repetidamente, que outras pessoas modificam, ou que rodam enquanto você não está por perto — aí vale.
- **Quem arca com o custo de um erro?** Você corrige um typo errado, você mesmo reverte e pronto. Você quebra a lógica de cobrança, o financeiro arca com o custo. Quanto mais lá na frente estiver o custo e mais difícil for reverter, mais você deveria colocar uma comporta logo na entrada.
- **Quanto tempo você gasta verificando isso hoje?** Se toda vez você tem que abrir três páginas na mão e compará-las, transformar essa comparação de três páginas em script é o que mais merece automação — você já está pagando esse custo; só não percebeu.

Mais um caso que vale destacar em separado: **algumas verificações você já tem, só não as ligou ao agente.** Aquela suíte de testes no projeto, aquele comando de lint, aquele script de build — provavelmente já existiam. Escrevê-los na descrição da tarefa ou transformá-los em ferramenta custa quase nada, mas a natureza da sessão muda. Esta é a etapa de maior ROI, e é o ponto de partida das próximas lições deste curso.

## 💻 Exercícios

<!-- exercises -->

### Nível 1: distinguir afirmações de evidências

Abaixo estão três relatórios de conclusão de agentes, de três sessões diferentes. Para cada um, julgue: quais partes são afirmações e quais são evidências? Depois escreva **quais evidências específicas ainda faltam** em cada relatório antes de você tratá-lo como “aprovação concedida”.

Respostas em texto, não precisa de código.

**Relatório A**

```text
Pronto. Refatorei src/importer.js, extraí o mapeamento de campos para uma função
autônoma mapFields(), a lógica ficou bem mais clara do que antes. As mudanças não
afetaram o comportamento existente.
```

**Relatório B**

```text
Pronto. Depois de rodar npm test -- importer, a saída foi:

  PASS  test/importer.test.js
  Tests: 14 passed, 14 total
  Time:  1.842 s

Os 3 novos casos de teste são "handles BOM in header", "rejects duplicate email"
e "errors on missing column". Não rodei a suíte de testes completa, apenas este
grupo do importer.
```

**Relatório C**

```text
Pronto. Corrigi o problema em que o BOM no cabeçalho fazia o mapeamento de campos
falhar. Conferi o código duas vezes, a lógica está correta, não deveríamos ver
problemas parecidos de novo. Já aproveitei e otimizei um pouco a performance do
parse.
```

<!-- rubric -->

- Os três recebem um julgamento “majoritariamente afirmações / majoritariamente evidências”, e os resultados são: B é majoritariamente evidência (o único dos três perto de estar pronto para aprovação), A e C são majoritariamente afirmações
- Para cada relatório, ao menos uma evidência faltante **concreta** é identificada — na forma de um comando mais sua saída bruta, uma comparação de falhou-para-passou, números antes/depois etc. —, não um vago “precisa de testes”
- Aponta que o “conferi o código duas vezes” em C é o modelo que fez o trabalho corrigindo a si mesmo, o que não conta como verificação independente; e nota que “otimizei um pouco a performance” é uma mudança fora de escopo com zero dados de baseline antes/depois para sustentá-la
- Identifica a frase mais perigosa do relatório A: “as mudanças não afetaram o comportamento existente” — essa é uma alegação completamente verificável (a definição de refatoração é comportamento inalterado), mas o relatório traz zero verificação, e uma alegação verificável apresentada como afirmação passa mais fácil do que pura enrolação, porque soa como conclusão

<!-- answer -->

**Relatório A: quase inteiramente afirmações.**

- “Extraí o mapeamento de campos para uma função autônoma `mapFields()`” — evidência fraca. Se a função existe e como ela se chama dá para confirmar pelo diff, mas isso só prova que a mudança aconteceu, não que a mudança está correta.
- “A lógica ficou bem mais clara do que antes” — afirmação. Isso é um julgamento estético; não é verificável e não é com isso que a aprovação deveria se importar.
- “As mudanças não afetaram o comportamento existente” — **esta é a frase mais perigosa**. É uma alegação completamente verificável (a definição de refatoração é comportamento inalterado), mas o relatório traz zero verificação. Uma alegação verificável dita como afirmação escapa das pessoas mais facilmente do que pura enrolação, porque soa como conclusão.

O que ainda falta para a aprovação:

1. Saída dos testes de antes e depois da refatoração, as duas cópias, mostrando que a contagem de testes e a contagem de aprovados continuaram as mesmas (essa é a evidência mínima para “comportamento inalterado”)
2. Se `importer.js` não tinha cobertura de testes desde o início, isso precisa ser dito logo de cara — “não há testes, então não dá para provar comportamento inalterado” é um estado honesto, muito mais útil do que “as mudanças não afetaram o comportamento existente”
3. Escopo da mudança: `git diff --stat`, confirmando que só `src/importer.js` foi tocado e que nada mais foi modificado de carona

**Relatório B: majoritariamente evidência.**

- Comando `npm test -- importer` mais a saída bruta — você consegue re-executar exatamente isso. Essa é a forma padrão de evidência.
- Os três nomes de teste novos estão listados; você consegue ver que direções eles cobrem (BOM, e-mail duplicado, coluna faltando).
- “Não rodei a suíte de testes completa, apenas este grupo do importer” — essa frase é valiosa. Ela diz por conta própria o que não foi feito. Quando um relatório inclui “não fiz X”, isso normalmente significa que ele tem noção dos próprios limites.

O que ainda falta para a aprovação:

1. Resultado da suíte de testes completa. Passar localmente não descarta que esta mudança quebrou outro módulo — é exatamente onde os erros que se acumulam adoram se esconder
2. Nomes de teste são só nomes. O que `"handles BOM in header"` de fato afirma por dentro, você precisa dar uma olhada no fonte ou em uma saída mais detalhada; um teste com nome certo e sem asserção nenhuma continua ficando verde
3. A rigor, também deveria haver um registro de “vi vermelho primeiro”: reverta a correção, confirme que esses três testes falham. Um teste que nunca ficou vermelho não consegue provar o que ele testa

**Relatório C: afirmações, mais uma mudança fora de escopo não verificada.**

- “Corrigi o problema em que o BOM no cabeçalho fazia o mapeamento de campos falhar” — afirmação. Diz o que foi feito, não diz como o resultado ficou.
- “Conferi o código duas vezes, a lógica está correta” — o modelo que fez o trabalho corrigindo a si mesmo. Quando ele reconfere, ele está lendo o raciocínio que acabou de gerar, e esse raciocínio já era autoconsistente. Esta frase não conta como verificação independente.
- “Não deveríamos ver problemas parecidos de novo” — afirmação, e do tipo menos informativo. Formulações como “não deveria”, “não vai acontecer de novo” contêm zero conteúdo verificável.
- “Já aproveitei e otimizei um pouco a performance do parse” — mudança fora de escopo. Sem números antes/depois, sem nem dizer onde mudou ou que técnica usou. O risco aqui é maior do que o do bug corrigido: corrigir um bug pelo menos tem um alvo claro; “otimizar de carona” não tem.

O que ainda falta para a aprovação:

1. Um caso de teste que reproduz o problema do BOM, mais sua saída de comparação falhou-para-passou (a única coisa capaz de provar “corrigido”)
2. Dados de baseline para a alegação de performance: tempo de antes e depois rodando a mesma entrada, mais o método de medição. Se não conseguir produzir isso, o movimento correto é reverter esta mudança e submetê-la em separado, não deixá-la entrar no merge junto com a correção do bug
3. Resultado da suíte de testes completa — correções de BOM normalmente tocam o ponto de entrada do parse, o lugar mais fácil de afetar outros ramos sem querer

**Resumo dos três em uma frase**: o padrão de julgamento é sempre o mesmo — **eu consigo confirmar esta frase sem ler código, usando apenas o que ela me mostrou?** Confirmável é evidência; só dá para escolher acreditar ou não é afirmação. O motivo de B ser o melhor não é ele ser o mais longo; é que o que ele colou você consegue re-executar exatamente.

<!-- hint -->

Faça a mesma pergunta para cada frase: **eu consigo confirmar isso sem abrir o código, usando apenas o que ele colou aqui?** Se sim, é evidência; se eu só posso escolher acreditar ou não, é afirmação. Não se deixe levar pelo tom da frase — “as mudanças não afetaram o comportamento existente” soa muito seguro, mas não te deu nada que você possa verificar.

<!-- hint -->

“Nenhum erro”, “a lógica está correta”, “não deveria acontecer”, “já otimizado” — essas formulações têm uma coisa em comum: o sujeito é sempre a avaliação que o modelo faz do próprio trabalho. Inverta: como é algo de fato verificável? Normalmente carrega linhas de comando, códigos de saída, nomes de testes, tempos, contagens de linhas — coisas concretas, e uma segunda pessoa consegue re-executar de forma idêntica. Preste atenção especial às frases do relatório A que “poderiam ser verificadas, mas não são” — elas passam pelas defesas mais facilmente do que pura conversa fiada.

### Nível 2: projetar um checklist de evidências para uma tarefa pequena

A tarefa é esta:

> Escreva um script que remove linhas duplicadas de `data/contacts.csv` com base na coluna `email`, mantendo apenas a **primeira ocorrência** de cada e-mail, e grave o resultado de volta no mesmo arquivo.

Suponha que você entregue essa tarefa a um agente, ele rode e relate “Pronto, duplicatas removidas”.

Projete um **checklist de evidências**: quais coisas você precisa ver para aprovar esta tarefa? Para cada item, escreva com clareza que forma ele tem (um comando mais sua saída? Uma comparação antes/depois? Um arquivo?). Depois responda à segunda pergunta: **qual desses consegue fechar o loop sozinho** — ou seja, o agente consegue rodá-lo, ler o resultado e iterar até passar, sem você estar presente?

Pseudocódigo ou exemplos de comando servem, não precisa de código completo.

<!-- rubric -->

- O checklist tem ao menos um item na forma “comando mais sua saída bruta”, e escreve com clareza o que olhar **antes e depois** da mudança, não só o resultado do depois
- Identifica explicitamente qual verificação consegue produzir passa/falha para fechar o loop, com o raciocínio pousando em “não precisa de humano para interpretar, tem um valor esperado claro”, e não em “esta é a mais importante”; e percebe que uma métrica isolada é burlável — indicadores como “contagem de duplicatas é 0” podem ser atingidos truncando o arquivo até ele ficar vazio, então uma verificação que de fato fecha o loop tem que juntar “sem duplicatas, manteve a primeira ocorrência, contagem de linhas bate com a expectativa” em um único código de saída, sem depender de nenhum item isolado
- Percebe que “não há mais duplicatas” ≠ “fez certo”; o checklist tem ao menos um item que protege contra exclusão acidental (por exemplo, verificar que a linha mantida é a primeira ocorrência, que as linhas não duplicadas ficaram intactas, ou que há um backup/`git diff` para reverter)

<!-- answer -->

**Checklist de evidências**

**1. Contagem de linhas antes e depois**

```text
Antes da mudança: wc -l data/contacts.csv   →  1204
Depois da mudança: wc -l data/contacts.csv  →  1187
```

Os dois números são necessários. Só o número do depois não significa nada — você não sabe de quanto ele mudou. Repare também se a linha de cabeçalho está sendo contada; esse desvio de uma linha é o mais fácil de deixar passar na aprovação.

**2. Contagem de e-mails duplicados (valor esperado: 0)**

```text
cut -d, -f2 data/contacts.csv | tail -n +2 | sort | uniq -d | wc -l
Antes da mudança  → 17
Depois da mudança → 0
```

O ponto é que este comando **independe do script que o agente escreveu**. Se você re-executa o script dele para provar a correção dele mesmo, você não provou nada — bugs no script de deduplicação vão aparecer igualzinho na verificação. Um 0 calculado por um conjunto diferente de ferramentas — isso é evidência.

**3. A linha mantida é mesmo a primeira ocorrência**

Escolha um e-mail que estava duplicado no arquivo original, cole todas as suas ocorrências (com números de linha) e depois cole a única linha que sobrou no arquivo de resultado:

```text
Antes da mudança:
  grep -n "ana.souza@example.com" data/contacts.csv
  42:1042,ana.souza@example.com,Ana Souza,2024-03-11
  877:1877,ana.souza@example.com,Ana Souza (importação duplicada),2025-01-20

Depois da mudança:
  grep -n "ana.souza@example.com" data/contacts.csv
  42:1042,ana.souza@example.com,Ana Souza,2024-03-11
```

O que sobrou é a linha 42, não a linha 877. Esta verificação isolada não é capturável por “contagem de duplicatas é 0” — apagar qualquer uma das duas linhas faz a contagem de duplicatas virar 0.

**4. Linhas não duplicadas não foram tocadas**

```text
git diff --stat data/contacts.csv
 data/contacts.csv | 17 -----------------
 1 file changed, 17 deletions(-)
```

Só remoções, nenhuma adição, e nenhuma “modificação” (que aparece no diff como uma remoção mais uma adição). Isso protege contra “já aproveitei e uniformizei os formatos de data” ou “tirei os espaços em branco” — mudanças fora de escopo.

**5. Trilha de reversão**

Gravar de volta no arquivo original é uma operação destrutiva. Ou existe um caminho de arquivo de backup (`data/contacts.csv.bak`), ou este arquivo já estava no git e `git checkout` consegue revertê-lo em um comando. Isso não é “provar que está certo”; é “se estiver errado, dá para desfazer” — mas pertence igualmente à aprovação.

**Qual consegue fechar o loop sozinho**

O item 2 é o que chega mais perto, mas **sozinho ele não basta**.

Primeiro, por que ele chega perto: é a única verificação da lista que precisa de zero interpretação humana — um comando, um número, um valor esperado claro de 0. O valor de retorno se traduz diretamente em passa/falha; o agente sabe, depois de rodar, se passou. O item 1 exige um humano para julgar “17 linhas a menos é razoável”, o item 3 precisa de um humano para bater o olho em dois blocos de texto, o item 4 precisa de um humano para entender a forma do diff, e o item 5 nem verificação é. Só o item 2 consegue julgar sozinho.

Agora por que ele não basta: ele protege apenas contra “não deduplicou direito”, não contra “apagou demais”. `truncate -s 0 data/contacts.csv` esvazia o arquivo; a contagem de duplicatas continua 0; esta verificação continua ficando verde. **Bateu a métrica, quebrou a tarefa** — é este o cenário.

Então a abordagem correta é fundir os itens 2, 3 e 4 em um único script de validação, no qual as três asserções precisam passar para sair com 0:

```javascript
// scripts/check-dedupe.js
// Uso: node scripts/check-dedupe.js <backup-do-arquivo-original> <arquivo-de-resultado>
// Código de saída 0 = passou, 1 = falhou

const before = readRows(process.argv[2]);
const after = readRows(process.argv[3]);
const failures = [];

// Asserção um: o resultado não tem e-mails duplicados
const emails = after.map((r) => r.email);
if (new Set(emails).size !== emails.length) {
  failures.push("O arquivo de resultado ainda contém e-mails duplicados");
}

// Asserção dois: as linhas mantidas são a primeira ocorrência de cada e-mail (protege contra apagar a errada)
const expected = [];
const seen = new Set();
for (const row of before) {
  if (seen.has(row.email)) continue;
  seen.add(row.email);
  expected.push(row);
}
if (JSON.stringify(expected) !== JSON.stringify(after)) {
  failures.push("As linhas mantidas não batem com a expectativa de 'primeira ocorrência'");
}

// Asserção três: a contagem de linhas é exatamente a esperada após a deduplicação (protege contra apagar demais ou de menos)
if (after.length !== expected.length) {
  failures.push(`Contagem de linhas não bate: esperado ${expected.length}, obtido ${after.length}`);
}

if (failures.length > 0) {
  console.error(failures.join("\n"));
  process.exit(1);
}
console.log("check-dedupe: passou");
```

Repare que a asserção dois na prática implica as asserções um e três — mas separá-las em três relatos distintos significa que o agente recebe informação de falha mais específica e uma direção mais clara para corrigir. Dar às verificações a capacidade de “dizer com clareza o que está errado” é tão importante quanto a verificação em si.

Com esse script, a descrição da tarefa pode virar: “Antes de deduplicar, faça backup do arquivo original como `data/contacts.csv.bak`; depois de deduplicar, rode `node scripts/check-dedupe.js data/contacts.csv.bak data/contacts.csv`; se o código de saída não for 0, siga corrigindo até passar.” Nesse ponto o agente faz o trabalho, roda a verificação, lê o resultado e itera até passar — o processo inteiro não precisa de você[^S4].

O item 5 que sobrou (trilha de reversão) fica melhor fora do script, com o seu código de harness fazendo um backup incondicional antes de rodar a tarefa — backup não deveria depender de o modelo lembrar de fazer.

<!-- hint -->

A gravação destrutiva de volta é o recife escondido deste problema. “As duplicatas sumiram” como resultado também pode ser alcançado com `truncate -s 0` esvaziando o arquivo. O seu checklist bloqueia esse caso de “métrica atingida, tarefa quebrada”? Pense primeiro nessa direção — o que ainda falta?

<!-- hint -->

Ao escolher “qual consegue fechar o loop sozinho”, existe um único padrão: **depois que o agente roda esta verificação, ele consegue saber se passou sem perguntar a um humano?** Qualquer coisa que exija que você bata o olho em dois blocos de texto ou julgue “este número é razoável” não conta. Pense também se, caso nenhum item isolado sirva, você consegue fundir alguns em um script que juntos produzem um único código de saída.

<!-- /exercises -->

## Recapitulação

- O Claude para quando o trabalho **parece** pronto. Sem uma verificação que ele possa rodar, “parece pronto” é o único sinal disponível, e você vira o loop de verificação: todo erro fica esperando você notar[^S4].
- A documentação oficial dá nome a essa lacuna: a trust-then-verify gap — o Claude produz uma implementação de aparência plausível que não lida com casos extremos. A segunda metade da correção que vem junto é igualmente importante: **se você não consegue verificar, não publique**[^S4].
- A linha entre afirmação e evidência é “uma segunda pessoa consegue re-executar isso exatamente da mesma forma”. Faça o Claude mostrar evidências — saída dos testes, o comando que ele rodou e o que ele retornou, uma captura de tela do resultado — e não afirmações de sucesso. Revisar evidências é mais rápido do que refazer a verificação você mesmo, e funciona para sessões que você não estava acompanhando[^S4].
- Agentes são sistemas não determinísticos: mesmo com as mesmas condições iniciais, eles podem gerar respostas variadas[^S3]; mesmo com prompts idênticos, não há garantia de que as decisões de execuções diferentes coincidam[^S2]. Por isso a premissa da avaliação tradicional, “dada a entrada X, siga o caminho Y, produza a saída Z”, falha[^S2] — pontos de partida idênticos podem produzir caminhos completamente diferentes, mas válidos[^S2].
- Erros em sistemas de agentes se acumulam: a falha de uma única etapa pode fazer os agentes explorarem trajetórias completamente diferentes, levando a resultados imprevisíveis[^S2]. A autonomia traz custos mais altos e potencial de erros que se acumulam, então recomendam-se testes extensivos em ambientes sandbox com guardrails[^S1].
- A saída é dar a ele uma verificação que rode. Com algo que produza passa ou falha, o loop se fecha sozinho: faça o trabalho, rode a verificação, leia o resultado, itere até passar[^S4]. A verificação pode ser uma suíte de testes, o código de saída de um build, um linter, um script que compara a saída com um fixture, ou uma captura de tela do navegador comparada com um design[^S4].
- Durante a execução, deixe o agente obter “ground truth” do ambiente a cada etapa (resultados de ferramentas, resultados de execução de código) para avaliar o progresso, e não do próprio raciocínio dele[^S1].
- O LLM potencialmente vai operar por muitos turnos, e você precisa ter algum nível de confiança na tomada de decisão dele[^S1] — mas essa confiança precisa vir de algum lugar.
- Não embrulhe cada coisinha em um mecanismo completo de aprovação. Você deveria considerar adicionar complexidade apenas quando ela comprovadamente melhora os resultados[^S1]; verifique primeiro se esta tarefa roda repetidamente, quem arca com o custo dos erros, e quanto tempo você gasta verificando na mão hoje.
- A etapa de maior ROI costuma ser esta: aquela suíte de testes, aquele comando de lint, aquele script de build já existem no seu projeto — você só ainda não os ligou ao agente.

[>> Lição 2: O que verificar: estado final primeiro, processo como rede de segurança](./02-what-to-verify.md)
