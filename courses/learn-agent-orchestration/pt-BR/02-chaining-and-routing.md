# Lição 2: Encadeie, roteie: encadeamento e roteamento

> Objetivos de aprendizado:
> - Quebrar um prompt que faz quatro tarefas em uma cadeia e enunciar o que você está trocando e o que está ganhando
> - Instalar gates programáticos entre os estágios da cadeia para que resultados intermediários fora do padrão parem onde deveriam
> - Decidir quando uma tarefa precisa de encadeamento, de roteamento, dos dois ou de nenhum, e escrever a chamada de roteamento como uma chamada barata com a saída apertada
>
> Pré-requisitos: Ler a Lição 1, saber escrever à mão um loop de harness dirigido por `stop_reason` (curso 7 desta série), entender verificadores determinísticos (curso 10 desta série) | Anterior: [<< Lição 1](./01-when-one-loop-isnt-enough.md) | Próxima: [Lição 3 >>](./03-parallelization.md)

## Um prompt fazendo quatro coisas — uma vai cair

Você precisa escrever a documentação de ajuda de um recurso novo: ler os requisitos do produto → rascunhar um esboço → escrever o texto completo com base no esboço → conferir o documento em busca de terminologia descontinuada.

Sua primeira versão provavelmente enfia as quatro etapas em um prompt só e entrega isso a um loop de harness. A primeira execução parece boa. O problema aparece na segunda, e na terceira: desta vez o esboço está bom, mas falta uma seção no texto; da próxima o texto está completo, mas vem misturado com “grupos de usuários”, que foi descontinuado na versão passada; depois ele reescreve o esboço no meio do caminho e entrega um esboço que não bate com o texto.

Essas falhas parecem diferentes na superfície, mas têm a mesma raiz: em uma chamada só, o modelo tem que fazer malabarismo simultâneo com entender requisitos, projetar estrutura, gerar texto e fazer conferências de consistência. Você não controla qual delas vai ser espremida para fora, e não consegue ver isso acontecendo. Pior, você não tem onde intervir — quando a saída chega às suas mãos, as quatro coisas já foram feitas, e “o esboço não atendeu à especificação” está enterrado dentro da versão final.

A Lição 1 discutiu o eixo de “quem detém o plano”. Este prompt de uma tacada só entrega o plano inteiro ao modelo. A primeira coisa que esta lição faz é retomá-lo.

## Encadeamento: trocar latência por acurácia

A definição oficial deste padrão tem só duas frases, e cada palavra carrega peso.

O encadeamento de prompts decompõe uma tarefa em uma sequência de etapas, em que cada chamada de LLM processa a saída da anterior. Você pode acrescentar verificações programáticas (veja “gate” no diagrama abaixo) em quaisquer etapas intermediárias para garantir que o processo continua nos trilhos[^S1]. Quando usar este fluxo de trabalho: ele é ideal para situações em que a tarefa pode ser decomposta de forma fácil e limpa em subtarefas fixas. O objetivo principal é trocar latência por mais acurácia, tornando cada chamada de LLM uma tarefa mais fácil[^S1].

“Tornar cada chamada de LLM uma tarefa mais fácil” — essa meia-frase dá o diagnóstico e a cura. Uma chamada fazendo quatro coisas é uma tarefa difícil; uma chamada que só rascunha um esboço e não escreve nada é uma tarefa fácil. O encadeamento não reduz o trabalho — ele torna mais simples o trabalho que o modelo precisa concluir em cada chamada.

O custo está impresso bem na etiqueta de preço: latência. Cada estágio a mais acrescenta uma ida e volta completa. A Anthropic apresentou essa contabilidade logo no começo do mesmo artigo — sistemas agênticos com frequência trocam latência e custo por melhor desempenho na tarefa, e você deveria considerar quando essa troca faz sentido[^S1]. “Lento e caro” não é um efeito colateral acidental do encadeamento.

```text
Requisitos ──▶ Rascunhar esboço ──▶ Escrever o texto ──▶ Conferir termos ──▶ Entregar
```

A entrada de cada trecho é a saída do trecho anterior. Se um elo sai torto, tudo o que vem depois vai atrás.

## Cada estágio é um loop de harness completo

Um estágio da cadeia não é “uma chamada de API” — é **um loop de harness completo**. O mesmo while que você escreveu à mão no curso 7 desta série: manda messages, confere o `stop_reason`, se for `tool_use` executa a ferramenta e devolve o resultado, senão retorna o texto.

Esse uso tem fonte. Quando a Anthropic descreveu como avaliar agentes, a montagem recomendada tinha exatamente esta forma: chamadas diretas à API do LLM, loops agênticos simples (loops while envolvendo chamadas alternadas de API do LLM e de ferramentas), um loop por tarefa de avaliação, cada agente de avaliação recebendo um único prompt de tarefa e as suas ferramentas[^S3]. Aquele artigo era sobre avaliação, mas o bloco de construção em si é de uso geral: uma tarefa, um loop, dirigido por código. Encadear é enfileirar esses blocos com o código decidindo a ordem.

O resto das lições usa a mesma notação:

```javascript
// runAgent é o loop de harness do curso 7 embrulhado em uma função
// Entrada: um prompt de tarefa autocontido + as ferramentas disponíveis nesta etapa; saída: o texto final depois de rodar até o fim
const answer = await runAgent(client, task, tools);
```

A cadeia inteira é código sequencial que você lê de bate-pronto:

```javascript
const outline = await runAgent(client, outlineTask(req));
const g1 = gateOutline(outline);        // Gate 1: a estrutura do esboço está correta?
if (!g1.ok) fail(g1.why);               // Se não estiver, pare aqui — não mande adiante

const doc = await runAgent(client, writingTask(outline));
const g2 = gateTerms(doc);              // Gate 2: contém termos descontinuados proibidos?
if (!g2.ok) fail(g2.why);

const report = await runAgent(client, checkTask(doc), { read_glossary });
```

Repare no que **não** está nestas linhas: não há espaço para “o modelo decide o que fazer em seguida”. A sequência está fixada no código, e os resultados intermediários `outline` e `doc` são variáveis comuns do script. O modelo continua autônomo dentro de cada estágio (pode chamar ferramentas quantas vezes quiser), mas o controle entre estágios está nas mãos do código. Um benefício lateral: o prompt de cada estágio pode ser rigoroso a respeito de uma coisa só. O prompt do esboço exige apenas títulos e proíbe qualquer corpo de texto; o prompt de escrita foca em estilo e termos proibidos — essas duas listas de exigências brigariam se fossem empacotadas em um prompt só.

Essa forma aparece também em produtos. A documentação oficial do Claude Code recomenda, para fluxos de trabalho de várias etapas: peça ao Claude que use subagentes em sequência, cada um concluindo sua tarefa e devolvendo resultados ao Claude, que então passa o contexto relevante ao subagente seguinte[^S4]. A diferença aterrissa no eixo da Lição 1 — na forma de produto, o Claude decide “o que passar”; quando você escreve o script, isso é o seu código.

## Gates: mover os verificadores do curso 10 para entre os estágios

A última meia-frase da definição é o que o encadeamento realmente acrescenta para além de “um prompt grande”: você pode acrescentar verificações programáticas em quaisquer etapas intermediárias para garantir que o processo continua nos trilhos[^S1]. O texto original chama essas verificações de “gate”, e com aspas: `(see "gate" in the diagram below)` — uma aspa reta, outra curva, exatamente como na fonte; não é erro de digitação aqui.

“Programáticas” é a palavra-chave: é código, não outra chamada de modelo, só uns `if`.

O curso 10 desta série ensinou verificadores determinísticos: quando algo pode ser julgado certo ou errado por código, não gaste dinheiro perguntando ao modelo. Aquele curso instalava verificadores no **estado terminal** — depois que tudo roda, confira se a saída é aceitável. O encadeamento oferece um novo local para a mesma verificação: **entre os estágios**.

```javascript
function gateTerms(doc) {
  const hits = BANNED.filter((w) => doc.includes(w));
  if (hits.length > 0) {
    return { ok: false, why: `O documento contém termos descontinuados proibidos: ${hits.join(', ')}` };
  }
  return { ok: true };
}
```

Sete linhas, nenhuma chamada de modelo, e a mesma entrada sempre produz o mesmo julgamento. Isso barra exatamente aquela falha de “texto misturado com termos descontinuados”; um gate que conta quantos títulos de capítulo há no esboço é igualmente simples.

O que fazer quando um gate reprova é uma decisão de projeto: **parar e reportar o erro** (melhor quando você ainda está ajustando esta cadeia, mas a mensagem de falha precisa dizer qual estágio falhou, senão você só sabe “não funcionou”, e não qual prompt de estágio consertar), **devolver o motivo da falha ao prompt do mesmo estágio e tentar de novo** (com um teto de tentativas), ou **registrar e continuar com um valor de fallback** (só quando esse estágio não é estrutural). O exercício do Nível 2 usa a primeira abordagem.

Isso também acerta as contas do curso 6 desta série: o trabalho que você delega precisa ter prompts autocontidos — objetivo, formato de saída, ferramentas disponíveis, fronteiras, os quatro escritos. A tarefa de cada estágio é um prompt de delegação exatamente com essa forma. Esses quatro elementos têm uma fonte primária precisa, que a Lição 4 vai desdobrar item a item ao cobrir como orquestradores delegam.

## Roteamento: classificar primeiro, despachar depois

O encadeamento cuida de “uma tarefa quebrada em etapas”. Outra classe de tarefas tem forma completamente diferente: o que entra não é uma coisa, são vários tipos de coisa, cada um com seu próprio tratamento.

A definição oficial: o roteamento classifica uma entrada e a direciona a uma tarefa de continuação especializada. Este fluxo de trabalho permite separação de responsabilidades e a construção de prompts mais especializados. Sem ele, otimizar para um tipo de entrada pode prejudicar o desempenho em outras entradas[^S1].

A última frase é o motivo de o roteamento existir. Suponha que os e-mails de clientes caiam em três categorias: reembolso, incidente, cobrança. Você usa um prompt para tratar de tudo. Para tratar bem os reembolsos, você acrescenta uma linha “primeiro confirme o número do pedido e o meio de pagamento”; essa regra é puro ruído para e-mails de incidente, e o modelo vai usá-la para pedir o meio de pagamento a quem está relatando uma página em branco. Você acrescenta outra linha, “se for incidente, não peça número do pedido”, e o prompt começa a criar remendo sobre remendo.

Quando usar este fluxo de trabalho: o roteamento funciona bem para tarefas complexas em que existem categorias distintas que são mais bem tratadas em separado, e em que a classificação pode ser feita com acurácia, seja por um LLM, seja por um modelo ou algoritmo de classificação mais tradicional[^S1]. Essa última precondição não é enfeite de bolo: se a classificação erra, ela erra de um jeito furtivo — um e-mail de reembolso roteado para o fluxo de incidentes recebe uma resposta conscienciosa de diagnóstico de problema.

Em código, o roteamento é mais simples que o encadeamento:

```javascript
const HANDLERS = {
  refund: handleRefund,
  incident: handleIncident,
  billing: handleBilling,
  other: handleFallback,
};
const LABELS = Object.keys(HANDLERS);

async function classify(client, letter) {
  const raw = await runAgent(client, [
    'Objetivo: Classificar o e-mail de cliente abaixo.',
    `Formato de saída: Escreva apenas uma palavra, escolhida entre: ${LABELS.join(', ')}. Sem explicação, sem pontuação.`,
    `E-mail: ${letter}`,
  ].join('\n'));

  const label = raw.trim();
  return LABELS.includes(label) ? label : 'other';   // Se não bater com a tabela, vá para o fallback
}

const category = await classify(client, letter);
const reply = await HANDLERS[category](client, letter);
```

Três coisas que valem atenção.

**Aperte a saída da chamada de classificação até uma palavra** — o curso 10 desta série usou o mesmo truque ao discutir juízes LLM: liste os valores permitidos, diga que não quer explicação; apertar a saída torna determinística a etapa de parsing. **Se não bater com a tabela, vá para o fallback** — aquela linha `LABELS.includes(label) ? label : 'other'` não é pedantismo defensivo. O modelo às vezes devolve “acho que pode ser incidente, ou talvez outra coisa”, e aí `HANDLERS[essa string toda]` é `undefined` e a linha seguinte quebra. Deixe um ramo de fallback e a incerteza da classificação fica contida nesta única linha.

**O classificador não precisa ser um modelo** — a definição diz explicitamente que modelos ou algoritmos de classificação tradicionais também valem[^S1]. Se o e-mail carrega um formato fixo de número de pedido ou vem de um ponto de entrada de formulário dedicado, uma regex basta e é muito mais rápida.

Depois do despacho, cada handler pode ser qualquer coisa: um loop de harness, uma cadeia, até um trecho de código completamente sem modelo.

```agentmentor-check
{
  "id": "orc-zh-02-chain-vs-one-prompt",
  "label": "Três chamadas vs. um prompt grande",
  "prompt": "Você quebrou a cadeia de escrita do documento em três estágios. Um colega lê e diz: “Quebrar em três estágios significa chamar o modelo três vezes — lento e caro. Um prompt grande, deixando o modelo seguir as três etapas sozinho, não resolveria?” Como você responde?",
  "whyHere": "Cadeia, gates e roteamento já foram cobertos — este é o lugar certo para alinhar tanto a contabilidade de custo quanto as precondições para dividir. Os dois lados só têm metade da razão.",
  "mode": "single",
  "choices": [
    {
      "id": "a",
      "text": "Ele tem razão. Os modelos de hoje são fortes o bastante — se você escrever as etapas com clareza em um prompt só, o modelo vai segui-las em ordem, mesmo efeito da divisão, mas economizando duas idas e voltas de tempo e dinheiro.",
      "correct": false,
      "feedback": "Esta é exatamente a forma da falha do cenário de abertura. O posicionamento oficial do encadeamento é tornar cada chamada de LLM uma tarefa mais fácil; em uma chamada só, o modelo ainda tem que fazer malabarismo simultâneo com entender requisitos, projetar estrutura, gerar texto e conferir terminologia — e você não controla qual delas vai ser espremida para fora."
    },
    {
      "id": "b",
      "text": "Dividir é sempre melhor. Mais chamadas de modelo significam mais oportunidades de pensar. Se a tarefa pode ou não ser decomposta de forma limpa não importa — divida o máximo que der, que a acurácia sobe naturalmente.",
      "correct": false,
      "feedback": "Absoluto demais. A precondição oficial do encadeamento é que a tarefa possa ser decomposta de forma fácil e limpa em subtarefas fixas; tarefas que não se dividem de forma limpa vão perder informação presa entre os estágios. E o custo que o seu colega teme também é dinheiro de verdade."
    },
    {
      "id": "c",
      "text": "Lento e caro é real — o posicionamento do encadeamento é exatamente trocar latência por acurácia; mas um prompt grande não tem onde colocar verificações programáticas, então um esboço fora do padrão segue adiante até o fim.",
      "correct": true,
      "feedback": "Correto. As duas coisas são reconhecidas: o custo é o que o encadeamento coloca explicitamente na conta, e o que a divisão ganha não é só tarefas mais fáceis por chamada, mas também as posições em que dá para instalar verificações programáticas — um prompt de uma tacada só nem lugar para intervir oferece. A precondição também importa: se não dá para dividir de forma limpa, não force."
    }
  ]
}
```

## Duas variantes de roteamento no vocabulário atual da API

A definição de roteamento acima vem do artigo de padrões do fim de 2024, que carrega um aviso dizendo que suas descrições do ecossistema de ferramentas estão desatualizadas. Então vale conferir: este padrão continua vivo no vocabulário atual de primeira mão? Sim, e é nomeado explicitamente. A documentação de orquestração multiagente da plataforma Claude tem duas entradas que são roteamento:

- **Specialization**: rotear para agentes com prompts de sistema e ferramentas focados em domínio, como um agente de segurança ou um agente de documentação, em vez de carregar um único agente com todas as capacidades[^S6]. Esta é a formulação oficial para a tabela `HANDLERS`.
- **Escalation**: consultar um agente ou modelo mais capaz para um subconjunto de subtarefas complexas[^S6].

A segunda merece menção à parte: ela despacha por **dificuldade**, não por **assunto**. O classificador não julga “isto é reembolso ou incidente?”, e sim “este e-mail pode ser tratado pelo meu nível barato?”. Isso é mais difícil de julgar com acurácia do que classificação por assunto, então o caminho de escalonamento tem uma escrita mais estável: rode primeiro o nível barato, e se a saída não passar no gate, escale — trocando um problema de classificação difícil de julgar por um problema de verificação conferível.

## Saber quando não dividir

**Cada elo da cadeia acrescenta latência.** Isso não é implementação mal otimizada, é o preço que a definição oficial estabelece: trocar latência por mais acurácia[^S1]. O usuário espera a soma de todos os trechos. Se o usuário está esperando o resultado de forma síncrona em uma interface, antes de acrescentar mais um elo à cadeia, considere se a pessoa ainda está lá.

**Quando há uma categoria só, roteamento é puro custo extra.** O benefício do roteamento vem da separação de responsabilidades[^S1]. Se a entrada realmente só tem um tipo, você pagou o custo e a latência de uma chamada de classificação e não recebeu nada em troca, mais uma chance a mais de classificar errado.

**Quando a tarefa não se divide de forma limpa, não force.** A condição “decomposta de forma fácil e limpa em subtarefas fixas” tem dentes[^S1]. Um rascunho que precisa olhar o quadro inteiro, indo e voltando, para ser bem revisado, se você o dividir em “primeiro revise a estrutura, depois revise o texto”, o segundo estágio não tem acesso às razões que o primeiro estágio não escreveu, e vai revisar apenas com base no texto literal. Neste caso, um loop, um contexto é de fato melhor — este é exatamente o uso das condições inversas da Lição 1.

**Na dúvida, meça primeiro.** A Anthropic disse isso duas vezes: considere acrescentar complexidade só quando ela comprovadamente melhora os resultados[^S1]. A trilha de avaliação do curso 10 desta série foi feita para isto: rode a versão de prompt único e obtenha uma nota, rode a versão dividida e obtenha outra, veja a diferença e se ela vale aqueles segundos a mais de latência — essa é a evidência que você leva para uma discussão com um colega.

Por fim, marque a fronteira. Encadeamento e roteamento são ambos orquestração de **forma fixa**: quantos estágios a cadeia tem, quais categorias o roteador tem, tudo é decidido quando você escreve o código. Rodar vários estágios ao mesmo tempo e depois agregar é a paralelização da Lição 3; nem saber quantas subtarefas existem antes de ver a entrada é o orquestrador-workers da Lição 4.

## 💻 Exercícios

<!-- exercises -->

### Nível 1: Decida encadeamento, roteamento ou nenhum dos dois (sem código)

Para cada uma das quatro tarefas abaixo, decida se usar encadeamento, roteamento, os dois ou nenhum. Além da conclusão, escreva com clareza: se você julgou encadeamento, o que o gate programático entre os estágios confere? Se julgou roteamento, onde fica o classificador, quantas categorias, é modelo ou código?

1. A caixa de entrada de atendimento recebe centenas de e-mails por dia; reembolso/incidente/cobrança são três categorias com tratamentos completamente diferentes, hoje compartilhando um prompt, e mudar a redação para uma categoria afeta outra.
2. Um contrato em inglês precisa primeiro ser revisado para um parecer de risco estruturado (cada item contendo a localização da cláusula, o nível de risco e a explicação), e depois esse parecer precisa ser traduzido para versões em chinês e japonês, para times diferentes.
3. Uma fila mista de tíquetes: tanto “redefinir senha”, que se responde em uma etapa, quanto “falha na migração de dados”, que exige conferir logs, diagnosticar, propor uma solução e escrever uma resposta — tarefas de várias etapas.
4. O usuário digita uma frase em uma caixa de entrada, e você precisa corrigir os erros de digitação e devolver a frase corrigida.

<!-- rubric -->

- As quatro conclusões são: roteamento / encadeamento / os dois / nenhum.
- A justificativa da tarefa 1 precisa aterrissar em “otimizar para um tipo de entrada pode prejudicar o desempenho em outras entradas”, e fornecer o conjunto de categorias, que precisa incluir uma categoria de fallback.
- A tarefa 2 precisa apontar que as duas versões de tradução não têm dependência sequencial (a paralelização fica para a Lição 3, reconhecê-la já basta), e fornecer pelo menos um gate específico.
- A tarefa 3 precisa explicar a estrutura de duas camadas: a camada externa roteia por complexidade, e o ramo julgado complexo vira uma cadeia internamente.
- A tarefa 4 precisa dizer explicitamente “uma chamada basta”, com a justificativa aterrissando em que a latência da divisão não é proporcional ao benefício.
- Todo gate precisa ser conferível por código puro, não pode ser “deixe o modelo ver se está aceitável”.

<!-- answer -->

**1. E-mails de clientes despachados por assunto — roteamento.**

Os critérios batem exatamente com o caso de uso: categorias distintas que são mais bem tratadas em separado, e a classificação em si pode ser feita com acurácia[^S1]. A frase do enunciado “mudar a redação para uma categoria afeta outra” é a versão ao vivo da declaração oficial “sem este fluxo de trabalho, otimizar para um tipo de entrada pode prejudicar o desempenho em outras entradas”[^S1]. O classificador vai na frente, o conjunto de categorias é `refund / incident / billing / other`, com “other” pegando os e-mails que não se encaixam nos três primeiros e os casos em que o modelo não responde no formato esperado. Uma chamada de modelo barato, com a saída apertada até uma palavra. Se a maior parte dos e-mails de reembolso vem de um ponto de entrada fixo de formulário de pós-venda, esse caminho pode ser encurtado antes por uma regra de código puro.

**2. Revisão de contrato produzindo parecer estruturado e depois tradução — encadeamento.**

A tarefa se divide de forma limpa em subtarefas fixas: revisar, traduzir; a entrada da segunda etapa é a saída da primeira, que é exatamente a forma da definição do encadeamento[^S1]. Os dois idiomas não têm dependência sequencial — essa forma de “mesma etapa repetida sobre vários itens” é território da paralelização da Lição 3; basta reconhecê-la e não escrevê-la como dois estágios em série.

O gate vai entre revisão e tradução, conferindo estrutura e não conteúdo, tudo em código puro: a saída pode ser lida por `JSON.parse` como um array; cada item tem os três campos `clause`, `level`, `note`; `level` cai no conjunto `high / medium / low`; o tamanho do array é maior que 0 (um contrato revisado com zero pareceres é mais provavelmente a etapa anterior saindo dos trilhos do que um contrato perfeito). O estágio de tradução não tem como descobrir que a sua entrada está ruim, ele vai simplesmente traduzir fielmente a coisa ruim para dois idiomas, então este gate tem que barrar antes.

**3. Tíquetes mistos — os dois.**

Roteamento por fora, encadeamento por dentro. O classificador vai na entrada da fila, julgando não o assunto, mas a complexidade; as categorias podem ser `respondível-em-uma-etapa / precisa-de-diagnóstico / other`. “Respondível em uma etapa” vai direto para uma chamada, ou até para um modelo de resposta; “precisa de diagnóstico” se expande em uma cadeia: conferir logs → diagnosticar a causa → propor solução → escrever resposta. Isto é despacho por dificuldade, mesma categoria do escalation do vocabulário oficial — aquela entrada diz consultar um agente ou modelo mais capaz para um subconjunto de subtarefas complexas[^S6], aqui trocando o “agente mais capaz” pela expansão de uma cadeia.

O interior da cadeia tem pelo menos dois gates de código puro: a saída do estágio de diagnóstico precisa carregar pelo menos uma referência a uma linha de log (regex conferindo o formato de timestamp), e a saída do estágio de escrever a resposta precisa conter o número do tíquete dado pelo estágio da solução (conferência de inclusão de string). Se o próprio classificador de complexidade for difícil de acertar, troque para “trate primeiro como respondível em uma etapa, e se a saída não passar no gate, escale”.

**4. Correção de erros de digitação em uma frase — nenhum dos dois.**

Uma chamada basta. Não há subtarefas fixas que se separem de forma limpa (“achar os erros” e “corrigir os erros” feitos em separado: o segundo estágio ainda tem que reler a frase inteira, o que equivale a rodar à toa), e não há categorias que precisem de tratamento separado. O custo de dividir é concreto: uma ida e volta a mais de latência, e o usuário está encarando a caixa de entrada esperando o resultado. O posicionamento do encadeamento é trocar latência por acurácia[^S1], com a precondição de que a acurácia possa de fato ser ganha — esta tarefa não tem como ganhá-la. Para realmente melhorar a qualidade, acrescente antes alguns exemplos ao prompt; a Anthropic também deixou este caminho antes dos padrões: para muitas aplicações, otimizar chamadas únicas de LLM com recuperação e exemplos no contexto costuma bastar[^S1].

<!-- hint -->

Antes de correr para julgar padrões, faça duas perguntas a cada tarefa: o que entra é “uma coisa” ou “vários tipos de coisa”? Se é uma coisa, dá para dividir em etapas que sejam cada uma mais simples e em ordem fixa? Se a primeira pergunta responde “vários tipos de coisa”, pense em roteamento; se a segunda responde “dá”, pense em encadeamento.

<!-- hint -->

Ao escrever gates, autoconfira: você consegue escrever esta verificação com `if` e funções de string, e a mesma entrada sempre chega à mesma conclusão? Se, enquanto escreve, aquilo vira “deixe o modelo julgar se este esboço está bom o bastante”, então não é a verificação programática de que esta lição fala — isso é um loop de revisão, que fica para a Lição 5.

### Nível 2: Escreva a cadeia de três estágios e faça rodar (com código)

Escreva um `chain.mjs` que implemente a tarefa de escrita de documento da abertura como uma cadeia de três estágios: **rascunhar esboço → escrever o texto com base no esboço → conferir consistência terminológica**, com dois gates no meio. Requisitos:

1. Use um cliente stub (a abordagem usada nos cursos 8 a 11 desta série): uma fila fixa de respostas, sem rede, sem custo, a mesma entrada sempre produzindo o mesmo resultado.
2. `runAgent(client, task, tools)` é um loop de harness de verdade — julgando pelo `stop_reason`, se for `tool_use` executa a ferramenta e devolve o resultado. O estágio três deve efetivamente passar por uma chamada de ferramenta (ler o glossário).
3. Gate 1: o esboço precisa conter exatamente 3 títulos de capítulo começando com `## `. Gate 2: o texto não pode conter termos descontinuados proibidos (defina a sua própria tabela de duas ou três palavras). Os dois são código puro, sem mais chamadas de modelo.
4. Quando um gate reprova, imprima em qual **etapa** ele reprovou e por quê, e saia com código diferente de zero; se as três etapas passarem, saia com 0.
5. Prepare dois conjuntos de respostas fixas e rode duas vezes: uma passando por tudo, outra barrada pelo segundo gate. Cole a saída real e os códigos de saída das duas execuções.

<!-- rubric -->

- O cliente stub é uma fila FIFO de respostas e, quando a fila está vazia, precisa dar erro em vez de devolver `undefined` em silêncio (senão você acha que a cadeia rodou inteira quando na verdade ela girou no vazio).
- `runAgent` tem um `while` de verdade e ramos de `stop_reason`, não retorna depois de um `await` só; a sequência de respostas do estágio três contém um `tool_use`, de modo que o ramo de ferramenta é de fato executado.
- As duas funções de gate não chamam o client, o valor de retorno carrega o motivo da falha, e a mesma entrada sempre dá a mesma saída.
- A mensagem de falha escreve entre quais duas etapas ela está e especificamente qual palavra foi acertada — imprimir só “reprovado” não conta.
- Código de saída: tudo aprovado 0, gate reprovado diferente de zero (erros de parâmetro etc. podem dar outro código diferente de zero).
- O segundo conjunto de respostas dispara o gate 2, e o estágio três realmente não roda (a saída não mostra nenhuma impressão dele).
- A saída colada é de execução real: números de etapa, palavras acertadas e códigos de saída batem com o script.

<!-- answer -->

Script completo:

```javascript
// chain.mjs — cadeia de três etapas: rascunhar esboço → escrever documento → conferir termos
// Script ilustrativo desta própria lição — não há exemplos de código de script de orquestração nas fontes primárias
// Uso: node chain.mjs pass    (as três etapas passam)
//      node chain.mjs stale   (barrado pelo segundo gate)

const BANNED = ['grupos de usuários', 'subcontas'];

// ---------- Cliente stub: fila fixa de respostas, sem rede ----------
const say = (t) => ({ stop_reason: 'end_turn', content: [{ type: 'text', text: t }] });
const useTool = (id, name, input = {}) => ({
  stop_reason: 'tool_use',
  content: [{ type: 'tool_use', id, name, input }],
});

function makeStubClient(script) {
  const queue = [...script];
  return {
    messages: {
      async create() {
        if (queue.length === 0) throw new Error('Fila do stub vazia: o script chamou o modelo mais vezes do que o previsto');
        return queue.shift();
      },
    },
  };
}

// ---------- Uma etapa = um loop de harness completo ----------
async function runAgent(client, task, tools = {}) {
  const messages = [{ role: 'user', content: task }];
  while (true) {
    const res = await client.messages.create({
      model: 'claude-sonnet-4-5',
      max_tokens: 2048,
      messages,
      tools: Object.values(tools).map((t) => t.schema),
    });
    messages.push({ role: 'assistant', content: res.content });

    if (res.stop_reason !== 'tool_use') {
      return res.content
        .filter((b) => b.type === 'text')
        .map((b) => b.text)
        .join('\n')
        .trim();
    }

    const results = [];
    for (const block of res.content) {
      if (block.type !== 'tool_use') continue;
      const tool = tools[block.name];
      results.push({
        type: 'tool_result',
        tool_use_id: block.id,
        content: tool ? await tool.run(block.input) : `Ferramenta desconhecida: ${block.name}`,
      });
    }
    messages.push({ role: 'user', content: results });
  }
}

// ---------- Dois gates: código puro, não perguntam ao modelo ----------
function gateOutline(outline) {
  const headings = outline.split('\n').filter((l) => l.startsWith('## '));
  if (headings.length !== 3) {
    return { ok: false, why: `O esboço exige exatamente 3 títulos de capítulo, contei ${headings.length}` };
  }
  return { ok: true, detail: `Capítulos: ${headings.map((h) => h.slice(3)).join(' / ')}` };
}

function gateTerms(doc) {
  const hits = BANNED.filter((w) => doc.includes(w));
  if (hits.length > 0) {
    return { ok: false, why: `O documento contém termos descontinuados proibidos: ${hits.join(', ')}` };
  }
  return { ok: true, detail: `Lista de termos proibidos com ${BANNED.length} itens, 0 acertos` };
}

function fail(where, why) {
  console.error(`\n✗ gate reprovado @ ${where}`);
  console.error(`  Motivo: ${why}`);
  console.error('  A cadeia para aqui; as etapas seguintes não vão rodar.');
  process.exit(1);
}

// ---------- Ferramentas ----------
const glossary = {
  schema: {
    name: 'read_glossary',
    description: 'Lê o glossário de termos do produto, devolve o mapeamento “termo antigo → termo novo”',
    input_schema: { type: 'object', properties: {}, required: [] },
  },
  run: async () => 'grupos de usuários → espaços de equipe\nsubcontas → contas de membro\nfluxo de aprovação → fluxo de trabalho',
};

// ---------- Três conjuntos de respostas fixas ----------
const OUTLINE = ['## Modelo de permissões', '## Criação de espaços de equipe e gestão de membros', '## Perguntas frequentes'].join('\n');

const CLEAN_DOC = [
  '## Modelo de permissões',
  'Cada conta de membro pertence a um espaço de equipe, e as permissões são determinadas pelo papel no espaço de equipe.',
  '## Criação de espaços de equipe e gestão de membros',
  'Depois de criar um espaço de equipe no console, o administrador pode convidar contas de membro para entrar.',
  '## Perguntas frequentes',
  'Contas de membro podem pertencer a vários espaços de equipe ao mesmo tempo, e as permissões são somadas.',
].join('\n');

const STALE_DOC = CLEAN_DOC.replace('convidar contas de membro para entrar', 'convidar subcontas para entrar');

const REPORT = 'Conferência de consistência terminológica aprovada: o texto inteiro usa uniformemente “espaços de equipe” e “contas de membro”, sem termos descontinuados misturados.';

const SCRIPTS = {
  pass: [say(OUTLINE), say(CLEAN_DOC), useTool('t1', 'read_glossary'), say(REPORT)],
  stale: [say(OUTLINE), say(STALE_DOC)],
};

// ---------- Corpo da cadeia ----------
const mode = process.argv[2] ?? 'pass';
if (!SCRIPTS[mode]) {
  console.error(`Modo desconhecido: ${mode} (disponíveis: ${Object.keys(SCRIPTS).join(', ')})`);
  process.exit(2);
}
const client = makeStubClient(SCRIPTS[mode]);
const req = 'Escrever a documentação de ajuda do recurso “Espaços de equipe”, para leitores que são administradores configurando permissões pela primeira vez.';

console.log(`Modo: ${mode}`);

console.log('[1/3] Rascunhar o esboço');
const outline = await runAgent(client, [
  'Objetivo: Rascunhar um esboço de documentação de ajuda para os requisitos abaixo.',
  'Formato de saída: Escreva apenas os títulos dos capítulos, um por linha, começando com "## ", exatamente 3.',
  'Orientação de ferramentas: Esta etapa não precisa de ferramentas.',
  'Fronteiras: Apenas liste os títulos, não escreva o corpo do texto.',
  `Requisitos: ${req}`,
].join('\n'));
const g1 = gateOutline(outline);
console.log(g1.ok ? `      gate 1 aprovado — ${g1.detail}` : '      gate 1 reprovado');
if (!g1.ok) fail('etapa 1 → etapa 2 (estrutura do esboço)', g1.why);

console.log('[2/3] Escrever o documento com base no esboço');
const doc = await runAgent(client, [
  'Objetivo: Escrever o corpo da documentação de ajuda com base no esboço abaixo.',
  'Formato de saída: Mantenha os títulos "## " do esboço e escreva 1-2 frases por seção.',
  'Orientação de ferramentas: Esta etapa não precisa de ferramentas.',
  `Fronteiras: Use apenas os termos novos; proibidos: ${BANNED.join(', ')}.`,
  `Esboço:\n${outline}`,
].join('\n'));
const g2 = gateTerms(doc);
console.log(g2.ok ? `      gate 2 aprovado — ${g2.detail}` : '      gate 2 reprovado');
if (!g2.ok) fail('etapa 2 → etapa 3 (termos descontinuados proibidos)', g2.why);

console.log('[3/3] Conferir a consistência terminológica');
const report = await runAgent(
  client,
  [
    'Objetivo: Conferir se a terminologia do documento abaixo está consistente.',
    'Formato de saída: Uma conclusão em uma frase.',
    'Orientação de ferramentas: Primeiro chame read_glossary para obter a tabela de termos, depois confira o texto inteiro.',
    'Fronteiras: Relate apenas problemas de terminologia, não reescreva o documento.',
    `Documento:\n${doc}`,
  ].join('\n'),
  { read_glossary: glossary },
);

console.log(`\n--- Conclusão da conferência ---\n${report}`);
console.log('\n✓ Três etapas, dois gates, tudo aprovado.');
process.exit(0);
```

Primeira execução, as três etapas passam (Node v26.3.0):

```text
$ node chain.mjs pass
Modo: pass
[1/3] Rascunhar o esboço
      gate 1 aprovado — Capítulos: Modelo de permissões / Criação de espaços de equipe e gestão de membros / Perguntas frequentes
[2/3] Escrever o documento com base no esboço
      gate 2 aprovado — Lista de termos proibidos com 2 itens, 0 acertos
[3/3] Conferir a consistência terminológica

--- Conclusão da conferência ---
Conferência de consistência terminológica aprovada: o texto inteiro usa uniformemente “espaços de equipe” e “contas de membro”, sem termos descontinuados misturados.

✓ Três etapas, dois gates, tudo aprovado.
$ echo $?
0
```

Segunda execução, o estágio de escrita produziu texto com termos descontinuados e foi barrado pelo gate 2:

```text
$ node chain.mjs stale
Modo: stale
[1/3] Rascunhar o esboço
      gate 1 aprovado — Capítulos: Modelo de permissões / Criação de espaços de equipe e gestão de membros / Perguntas frequentes
[2/3] Escrever o documento com base no esboço
      gate 2 reprovado

✗ gate reprovado @ etapa 2 → etapa 3 (termos descontinuados proibidos)
  Motivo: O documento contém termos descontinuados proibidos: subcontas
  A cadeia para aqui; as etapas seguintes não vão rodar.
$ echo $?
1
```

Três coisas que valem ser olhadas contra a saída: a segunda execução não tem linha `[3/3]`, o estágio três realmente não rodou, e a coisa ruim não fluiu para baixo; a mensagem de falha aponta com precisão “etapa 2 → etapa 3” e a palavra específica “subcontas”, então você sabe que precisa ir consertar o prompt do estágio de escrita; a fila `stale` só tem duas respostas — se um dia o gate 2 for apagado por engano, o script vai entrar no estágio três, não vai conseguir uma resposta, e o cliente stub vai lançar “Fila do stub vazia” — o modo de falha é barulhento, não silencioso. Já aproveite para fazer a conta: a execução `pass` chamou o modelo quatro vezes — o estágio três, ao conferir termos, passou por uma ida e volta de ferramenta; a contagem de etapas é três, a contagem de idas e voltas é quatro, e o custo deve ser calculado pela contagem de idas e voltas.

<!-- hint -->

Faça o cliente stub e o `runAgent` funcionarem separadamente antes de conectar a cadeia. Use uma fila contendo só um `say(...)` para rodar uma etapa e confirme que ela devolve texto, não `undefined`; verifique o ramo de ferramenta em separado: deixe a primeira resposta da fila parar em `tool_use` e a segunda ser o texto de fechamento, e o loop deve girar exatamente duas vezes.

<!-- hint -->

“Qual etapa reprovou” deve ser passado como parâmetro para `fail()` na hora em que você escreve, não espere enxergar isso na pilha depois. Dê a cada gate uma redação fixa de “etapa X → etapa Y” e imprima isso junto com a palavra específica acertada quando reprovar. Use `process.exit(1)` para o código de saída, não apenas `throw` — o que o `throw` produz é de fato o código de saída 1, mas a informação da pilha vai cobrir as poucas linhas que você imprimiu com tanto cuidado.

<!-- /exercises -->

## Recapitulação

- O encadeamento decompõe uma tarefa em uma sequência de etapas em que cada chamada processa a saída anterior, tornando cada chamada uma tarefa mais fácil[^S1]; ele é precificado explicitamente: o objetivo principal é trocar latência por mais acurácia[^S1].
- Um estágio da cadeia é um loop de harness completo, não uma chamada de API — a montagem que a Anthropic recomendou para avaliação é exatamente este bloco de construção: uma tarefa, um loop while, código chamando a API diretamente[^S3].
- As posições acrescentadas depois da divisão são a chave: você pode acrescentar verificações programáticas em quaisquer etapas intermediárias para garantir que o processo continua nos trilhos[^S1]. Este é o verificador determinístico do curso 10 mudado de local de instalação — do estado terminal para entre os estágios; na forma de produto, parece subagentes executando em sequência, cada um concluindo e a camada acima passando o contexto relevante ao seguinte[^S4].
- O roteamento classifica a entrada e despacha para tarefas de continuação especializadas, ganhando separação de responsabilidades e prompts mais especializados; sem ele, otimizar para um tipo de entrada pode prejudicar o desempenho em outras entradas[^S1]. Precondição: categorias claras e classificação que em si pode ser feita com acurácia, seja por LLM, seja por algoritmos de classificação tradicionais[^S1].
- Aperte a saída da chamada de classificação até um rótulo, e deixe um ramo de fallback para pegar respostas que não batem com a tabela.
- Este padrão está vivo no vocabulário atual de primeira mão: despachar por domínio para agentes com prompts e ferramentas dedicados chama-se specialization, e consultar um agente ou modelo mais capaz para um subconjunto de subtarefas complexas chama-se escalation[^S6] — o segundo é roteamento despachando por dificuldade.
- Não force: quando há uma categoria só, roteamento é puro custo extra; quando a tarefa não se divide de forma limpa, forçar vai perder informação entre os estágios[^S1]. Na dúvida, meça primeiro — a complexidade tem que passar pelo limiar de “comprovadamente melhora os resultados”[^S1].

[>> Lição 3: Paralelização: seccionamento e votação](./03-parallelization.md)
