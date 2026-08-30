# Lição 3: Paralelização: seccionamento e votação

> Objetivos de aprendizado:
> - Distinguir as duas variantes da paralelização — seccionamento e votação —, entender o que cada uma resolve e respeitar a fronteira traçada por “saídas agregadas programaticamente”
> - Usar `Promise.all` e um pool de concorrência próprio para implementar seccionamento, garantindo que a agregação passe referências em vez de cargas
> - Calcular os três custos do fan-out (resultados inundando o contexto, tetos reais de concorrência nos produtos, o multiplicador de N× tokens da votação) e usá-los para decidir se uma proposta deve ser paralelizada
>
> Pré-requisitos: Concluir as Lições 1 e 2, ter o wrapper `runAgent()` da Lição 2 | Anterior: [<< Lição 2: Encadeie, roteie: encadeamento e roteamento](./02-chaining-and-routing.md) | Próxima: [Lição 4 >>](./04-orchestrator-workers.md)

## Doze documentos, uma cadeia, uma hora na fila

A cadeia da Lição 2 agora funciona: esboço → gate → rascunho → gate → conferir terminologia. Troque por prompts voltados à revisão — extrair pontos-chave, sugerir mudanças, verificar termos — e a forma da cadeia não muda. Rode em um documento: seis ou sete minutos.

Aí o time de produto larga um diretório na sua mesa: 12 documentos, cada um precisando da mesma passada de revisão.

Você escreve um `for`, dá o start e vai fazer café. Uma hora depois você volta. O log parou no documento 9. O documento 10 está extraindo pontos-chave.

Durante aquela hora, a máquina passou a maior parte do tempo esperando. Esperando a resposta da API do documento 1 antes de mandar a requisição do documento 2. Esperando o documento 2 terminar os quatro estágios antes de o documento 3 ter a sua vez. Faça uma pergunta prática: a conclusão da revisão do documento 3 depende de uma única palavra do resultado do documento 2?

Não. São 12 documentos independentes. Os relatórios de revisão deles não se importam com quem termina primeiro. No encadeamento, a espera tem um motivo — a entrada da etapa seguinte é a saída da anterior. Aqui não existe esse motivo. Essas 12 execuções só estão enfileiradas porque um `for` as colocou na fila.

O curso 6 desta série já cobriu os padrões de colaboração de fan-out e agregação e como funciona a votação de múltiplas perspectivas[^S1]. Esta lição transforma isso em código e acerta as contas: fan-out não é de graça. A velocidade é real, e o custo também.

## Definição: dá para rodar ao mesmo tempo, com as saídas agregadas programaticamente

Comece pela formulação original. LLMs às vezes conseguem trabalhar em uma tarefa simultaneamente e ter suas saídas agregadas programaticamente. Este fluxo de trabalho é a paralelização, com duas variações principais[^S1]:

- **Seccionamento**: quebrar uma tarefa em subtarefas independentes rodadas em paralelo[^S1]. Revisar 12 documentos é seccionamento.
- **Votação**: rodar a mesma tarefa várias vezes para obter saídas diversas[^S1]. Ter três perspectivas avaliando o mesmo texto é votação.

Quando usar: quando as subtarefas divididas puderem ser paralelizadas por velocidade, ou quando múltiplas perspectivas ou tentativas forem necessárias para resultados de maior confiança[^S1]. Há um acréscimo fácil de pular, mas valioso — para tarefas complexas com múltiplas considerações, LLMs geralmente têm desempenho melhor quando cada consideração é tratada por uma chamada de LLM separada, permitindo atenção focada em cada aspecto específico[^S1]. Traduzindo: seccionamento e votação não são só economizadores de tempo. Enfiar “jurídico, segurança, marca” em um prompt só, versus ter três chamadas cada uma cuidando de uma coisa, produz qualidades diferentes.

Mais uma meia-frase a fixar: **saídas agregadas programaticamente**. Depois que os resultados abertos em fan-out voltam, é o seu código que julga, filtra e resume — não outra chamada de modelo para ler os 12 relatórios e escrever um resumo. Deixar o modelo agregar é um padrão diferente. O orquestrador da Lição 4 faz exatamente esse trabalho. Trace a linha com clareza aqui. A documentação atual da plataforma Claude lista Parallelization sob orquestração multiagente: abrir subtarefas independentes em fan-out simultaneamente (buscar em múltiplas fontes, analisar arquivos separados) e ter o coordenador sintetizando os resultados[^S6] — note que naquela versão é o coordenador que faz a agregação, enquanto esta lição escreve a versão de agregação programática[^S1]. Mesma palavra, mas quem agrega são duas coisas diferentes.

## Seccionamento: troque o for loop por Promise.all

A versão serial fica assim, com o tempo total sendo a soma dos 12:

```javascript
const reports = [];
for (const doc of docs) {
  reports.push(await runAgent(client, reviewTask(doc)));
}
```

A versão com seccionamento muda uma linha, e o tempo total se aproxima do mais lento:

```javascript
const reports = await Promise.all(
  docs.map((doc) => runAgent(client, reviewTask(doc))),
);
```

O `runAgent()` continua na mesma posição de wrapper da Lição 2 — um loop de harness completo, ramificando internamente pelo `stop_reason`. As respostas do stub desta lição se completam todas em um turno (`end_turn`), então a versão do script final omite o ramo de ferramenta como simplificação. Ao conectar em um cliente de verdade ou ao precisar de ferramentas, traga de volta, sem mudanças, a versão da Lição 2 que despacha ferramentas. A paralelização não altera nenhuma linha desse loop em si. Ela só para de fazer esses loops ficarem na fila.

A agregação acontece na linha seguinte, feita por este código:

```javascript
const blockers = reports.filter((r) => r.level === "alto");
const total = reports.reduce((n, r) => n + r.issues, 0);
console.log(`${docs.length} documentos, ${total} problemas, ${blockers.length} de risco alto`);
```

Estas três linhas não contêm uma segunda chamada de modelo. `filter`, `reduce`, uma conferência de limiar — tudo código determinístico. Os mesmos 12 relatórios entram, a mesma conclusão de uma linha sai, toda vez. Esse é o benefício de manter a agregação em código: as 12 chamadas do fan-out são não determinísticas, a etapa de junção é determinística. Quando algo quebra, você sabe de qual lado suspeitar.

O `Promise.all` tem um temperamento que convém conhecer de antemão: se uma promise qualquer rejeitar, o `await` inteiro rejeita, e mesmo que as outras 11 tenham terminado, você não consegue os resultados delas. Revise 12 documentos, o documento 7 pega um 500 e o lote inteiro é desperdiçado — os outros 11 rodaram à toa. Esse custo é desarrazoado. Ou troque para `Promise.allSettled`, ou, como no exercício desta lição, embrulhe cada worker em `try/catch` para coletar as falhas como registros — todo caminho de fan-out deveria conseguir falhar de forma independente.

## Por que paralelização não é só sobre velocidade

Se paralelização fosse só “a mesma coisa feita mais cedo”, seria um truque de desempenho, não valeria uma lição própria. O motivo de verdade está do lado do contexto.

A retrospectiva da Anthropic sobre o sistema multiagente de pesquisa deles é direta: a essência da busca é compressão — destilar percepções de um corpus vasto. Subagentes facilitam a compressão ao operar em paralelo com **as suas próprias janelas de contexto**, explorando aspectos diferentes da pergunta simultaneamente antes de condensar os tokens mais importantes para o agente líder de pesquisa. Cada subagente também fornece separação de responsabilidades — ferramentas, prompts e trajetórias de exploração distintas —, o que reduz a dependência do caminho e permite investigações minuciosas e independentes[^S2].

Abra essas duas frases. O fan-out compra pelo menos três coisas:

1. **Capacidade de janela**. Eles escreveram esse julgamento arquitetural como conclusão: distribuir trabalho entre agentes com janelas de contexto separadas acrescenta capacidade para raciocínio paralelo[^S2]. A Lição 1 cobriu isso: o que realmente bate no teto não é o tamanho da janela, é “um loop só” como forma. O fan-out contorna os limites de janela única não esticando a janela, mas abrindo várias.
2. **Separação de responsabilidades**. Três subagentes carregando ferramentas e prompts diferentes naturalmente não vão poluir uns aos outros.
3. **Menos dependência do caminho**. Em um loop só, o julgamento da etapa 3 é enviesado pela formulação da etapa 2. Três trajetórias independentes não compartilham o mesmo viés.

A documentação atual da plataforma aponta na mesma direção: múltiplos agentes podem agir em paralelo com o próprio contexto isolado, o que ajuda a melhorar a qualidade da saída e também pode melhorar o tempo até a conclusão[^S6]. Note que a qualidade vem primeiro.

Do lado da velocidade eles deram um número, com um contexto que precisa ser copiado junto: os primeiros agentes deles executavam buscas sequenciais, o que era dolorosamente lento. Por velocidade, eles introduziram dois tipos de paralelização: (1) o agente líder sobe de 3 a 5 subagentes em paralelo em vez de em série; (2) os subagentes usam 3 ou mais ferramentas em paralelo. Essas mudanças **cortaram o tempo de pesquisa em até 90% para consultas complexas**[^S2].

Esse número precisa ser usado com os seus três qualificadores: é um número de **latência**, não de qualidade; está limitado a **consultas complexas** (consultas simples não têm muito o que paralelizar); e vem do **sistema deles**. Quanto você economiza trocando `for` por `Promise.all` depende de quanto das suas subtarefas são genuinamente independentes, de quão lento é cada caminho e de onde a concorrência encontra gargalo — o resto desta lição é sobre isso.

```agentmentor-check
{
  "id": "orc-zh-03-unbounded-fanout",
  "label": "Julgar o que acontece com um fan-out ilimitado de 200 vias",
  "prompt": "O time precisa revisar 200 documentos. Um colega leu a seção de paralelização, escreveu `const reports = await Promise.all(docs.map((d) => runAgent(client, reviewTask(d))))`, mandando os 200 de uma vez, com o raciocínio “são independentes de qualquer forma, mais paralelo é mais rápido”. O que acontece quando esse código vai para produção?",
  "whyHere": "Acabamos de cobrir os três benefícios do fan-out, exatamente quando é mais fácil ler “as subtarefas são independentes” diretamente como “paralelização ilimitada tudo bem”, então quem aprende precisa conferir se está levando em conta tetos de concorrência e custo de agregação",
  "mode": "single",
  "choices": [
    {
      "id": "a",
      "text": "A independência está certa, o “tudo de uma vez” é que está errado: produtos reais limitam a concorrência — isto precisa de um pool de concorrência. E 200 resultados detalhados inundando o lado da agregação também vão estourar o contexto; passe só referências",
      "correct": true,
      "feedback": "Duas coisas precisam de conserto. Lado da concorrência: o Claude Code falha com “Concurrent subagent limit reached” quando 20 subagentes estão rodando, e o erro diz explicitamente ao modelo para não tentar de novo; o runtime de fluxos de trabalho suporta até 16 agentes concorrentes (menos quando há pouca CPU), com teto de 1.000 agentes por execução; os Managed Agents suportam no máximo 25 threads concorrentes. Três times diferentes, três implementações diferentes, todos estabelecendo tetos — isso em si é a resposta: fan-out ilimitado não é mais rápido, ele estoura limites de taxa, memória e risco de falha em lote tudo de uma vez. Além disso, o `Promise.all` rejeita o await inteiro se um caminho qualquer rejeitar — mesmo que os outros 199 tenham terminado, você não consegue os resultados. Lado da agregação: os resultados dos subagentes voltam para a conversa principal, e muitos subagentes devolvendo, cada um, resultados detalhados consomem contexto significativo. 200 relatórios detalhados voltando vão queimar o tempo economizado pelo fan-out. Forma correta: pool de concorrência limitando o fluxo + cada caminho guardando a saída em um sistema externo, passando de volta ao coordenador apenas referências leves."
    },
    {
      "id": "b",
      "text": "Sem problema. Como os 200 documentos são independentes, os resultados não vão se poluir. Mais concorrência significa menos tempo total. 200 caminhos vs. 3 caminhos é só uma diferença de velocidade. As falhas você roda de novo uma a uma",
      "correct": false,
      "feedback": "Independência só garante que “os resultados são computados corretamente”, não que “200 requisições conseguem ser enviadas com sucesso”. 200 caminhos concorrentes vão bater juntos nos limites de taxa, ocupar memória juntos e falhar na sua cara juntos, e a semântica do `Promise.all` significa que uma rejeição rejeita o todo — mesmo que os outros 199 tenham terminado, os resultados deles se perdem. Veja os produtos reais: o Claude Code usa por padrão 20 subagentes concorrentes, o runtime de fluxos de trabalho vai até 16 agentes concorrentes com teto de 1.000 por execução, e os Managed Agents vão até 25 threads concorrentes. Esses tetos foram todos ensinados por tráfego real. Depois, a agregação: 200 relatórios detalhados voltando para o fluxo principal bastam para esgotar o contexto só nessa etapa."
    },
    {
      "id": "c",
      "text": "Paralelização não deveria ser usada de jeito nenhum. Na escala de 200, fique na velha fila serial. Lento mas firme, e pelo menos não quebram todos juntos. Estabilidade acima de tudo",
      "correct": false,
      "feedback": "Recuar para o serial força uma forma que deveria ser paralela a virar fila. Esses 200 documentos atendem às condições da paralelização — as subtarefas divididas podem ser paralelizadas por velocidade, e a independência se sustenta —, então serial só significa esperar à toa. O ponto correto de convergência está no meio: paralelização limitada. Use um pool de concorrência para limitar os caminhos simultâneos a um número que você aguenta (3, 8, 16 — depende de cotas e máquinas), embrulhe cada caminho em `try/catch`, guarde a saída em arquivos externos e passe de volta à agregação apenas referências e um resumo de uma linha. Assim você ganha a aceleração sem empurrar o sistema para a beira do precipício."
    }
  ]
}
```

## Primeiro custo: a agregação come de volta o contexto que você economizou

Ao abrir em fan-out, todo mundo olha para “quantos caminhos rodam de uma vez”. As quebras normalmente acontecem no caminho de volta.

A documentação de subagentes do Claude Code coloca esse custo na mesa: quando os subagentes terminam, os resultados deles voltam para a sua conversa principal. Rodar muitos subagentes que devolvem, cada um, resultados detalhados pode consumir contexto significativo[^S4]. Subagentes existem para **proteger** o contexto da conversa principal — mantendo exploração e implementação fora da sua conversa principal[^S4] —, mas quando o que volta é pesado demais, a proteção se inverte.

A mesma retrospectiva deu um remédio, e deu de forma específica: em vez de exigir que os subagentes comuniquem tudo através do agente líder, implemente sistemas de artefatos em que agentes especializados possam criar saídas que persistem de forma independente. Os subagentes chamam ferramentas para guardar o trabalho deles em sistemas externos e depois passam **referências leves** de volta ao coordenador[^S2].

Traduza isso para um mantra na hora de escrever código: **passe referências, não cargas**.

```javascript
// O lado da agregação recebe não 12 relatórios, mas 12 registros assim
{ id: "api-auth", file: "out/api-auth.md", summary: "Conclusão: 3 problemas, nível de risco alto" }
```

Qual é o tamanho da diferença? O script de exercício desta lição dá um número real: 8 saídas em disco somam 2.120 bytes, e o que volta para a agregação são só 716 bytes; e essa proporção se abre rapidamente conforme os documentos crescem — relatórios dez vezes mais longos, e o que passa de volta continua sendo um resumo de uma linha mais um caminho. Quem precisar do texto inteiro que leia a partir do caminho.

Esse caminho compra outras coisas de quebra. A documentação de fluxos de trabalho menciona que o runtime rastreia o resultado de cada agente conforme a execução avança, e é isso que torna uma execução retomável dentro da mesma sessão. Um fluxo de trabalho que abre o trabalho em fan-out entre muitos agentes pequenos, portanto, preserva mais progresso do que um agente longo[^S5]. As saídas aterrissam fora, deixando registro linha a linha — a parte de manter registro é o mesmo princípio da observabilidade do curso 11 desta série. A parte de “interrompido no meio não recomeça do zero” é território do curso 9, “fazendo tarefas longas sobreviverem à interrupção”.

## Segundo custo: concorrência nunca é ilimitada

No momento em que você escreve `Promise.all(docs.map(...))`, você está de fato dizendo “concorrência = tamanho do array”. Array de 12, tudo bem. Array de 200, é outra história.

Olhe os tetos de três produtos reais:

- Claude Code: por padrão, quando 20 subagentes estão rodando em uma sessão, subir mais um com a ferramenta Agent falha com `Concurrent subagent limit reached`, e a mensagem de erro diz explicitamente ao Claude para não tentar de novo[^S4].
- Runtime de fluxos de trabalho do Claude Code: até 16 agentes concorrentes, menos quando o Claude Code tem menos CPUs disponíveis (inclusive dentro de um contêiner com CPU limitada)[^S5]; 1.000 agentes no total por execução[^S5].
- Managed Agents: no máximo 25 threads concorrentes são suportadas. O coordenador pode chamar várias cópias de um mesmo agente do elenco, criando várias threads associadas a um agente[^S6].

Três times diferentes, três implementações diferentes, todos estabeleceram tetos, e os números nem são grandes. Esse fato em si é material didático: **fan-out ilimitado é um acidente, não uma otimização**. (A Lição 4 vai cobrir um caso real de quebra — os primeiros agentes subiam 50 subagentes para uma consulta simples[^S2]. Lá você vai descobrir que “quem decide quantos subir” é mais espinhoso do que “qual é o teto”.)

A forma mais barata de limitar o fluxo é o lote:

```javascript
// Lote: 3 por lote, lotes em série
const reports = [];
for (let i = 0; i < docs.length; i += 3) {
  const batch = docs.slice(i, i + 3);
  reports.push(...(await Promise.all(batch.map((d) => runAgent(client, reviewTask(d))))));
}
```

Funciona, mas tem efeito de balde: cada lote espera o mais lento dele terminar antes de começar o próximo. De três documentos, um é especialmente longo, e os outros dois caminhos ficam só esperando.

Um pool de concorrência não tem esse problema — fixe N “faixas”, e cada faixa pega o próximo item de um cursor compartilhado assim que termina o trabalho atual, sempre com N em voo:

```javascript
async function pool(items, limit, worker) {
  const results = new Array(items.length);
  let cursor = 0;
  const lanes = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (true) {
      const i = cursor++;
      if (i >= items.length) return;
      results[i] = await worker(items[i], i);
    }
  });
  await Promise.all(lanes);
  return results;
}
```

Umas dez linhas, sem dependências. O `cursor++` é seguro no JavaScript de thread única — código síncrono entre dois `await` não pode ser interrompido. Não há risco de duas faixas pegarem o mesmo índice. No exercício você vai acrescentar `try/catch` para que a falha de um caminho não derrube o lote inteiro.

Quanto deve valer `limit`? Não há resposta universal. É a interseção entre a sua cota de API, a capacidade dos serviços a jusante e a duração de um caminho. Mas preencher um número específico versus não preencher nenhum são dois tipos de engenharia.

## Terceiro custo: votação paga N× tokens

A definição de votação é uma frase: rodar a mesma tarefa várias vezes para obter saídas diversas[^S1]. O código é curto:

```javascript
const angles = ["perspectiva jurídica", "perspectiva de segurança", "perspectiva de marca"];
const opinions = await Promise.all(
  angles.map((angle) => runAgent(client, reviewTask(doc, angle))),
);

// Limiar escrito em código: se 2 de 3 votos apontarem problemas, reprove
const flagged = opinions.filter((o) => o.verdict === "tem problemas").length;
const decision = flagged >= 2 ? "reprovar" : "aprovar";
```

A agregação aqui continua sendo feita por código — `filter` mais um limiar. Quantos votos definem o limiar é uma decisão de produto, fixada no código, alterável a qualquer momento, auditável. Isso não deveria ficar por conta da improvisação do modelo. Cenários de alto risco podem ajustar o limiar para “um veto basta”; cenários de baixo risco podem exigir os três votos para barrar.

A contabilidade é direta: **vote N vezes, pague N× tokens**. Coloque esse dinheiro ao lado do multiplicador da Lição 1 — pelos dados deles, agentes usam cerca de 4× os tokens de interações de chat, e sistemas multiagente cerca de 15×. Sistemas multiagente, portanto, precisam de tarefas valiosas o bastante para cobrir o custo desse ganho de desempenho[^S2]. A etiqueta de preço da votação de três perspectivas é aquele 4× de agente único vezes mais 3. Não multiplique o 15× por 3 — aquele 15× já inclui a contabilidade do fan-out.

Então votação não é “rodar mais algumas vezes para dormir tranquilo”. Ela precisa comprar algo concreto. A documentação de fluxos de trabalho é mais clara: mover o plano para dentro do código também permite que um fluxo de trabalho aplique um padrão de qualidade repetível, e não apenas rode mais agentes — ele pode fazer agentes independentes **revisarem adversarialmente** os achados uns dos outros antes de serem reportados, ou rascunhar um plano a partir de vários ângulos e pesá-los uns contra os outros, de modo que você obtenha um resultado mais confiável do que o de uma passada única[^S5].

“Agentes independentes revisando uns aos outros” é a mesma regra do curso 10 desta série: quem executa não julga o próprio trabalho. Ao fazer o modelo se autoconferir no mesmo contexto, na maior parte das vezes ele vai defender o que acabou de produzir. Troque para um caminho de contexto independente, troque os prompts, e aí talvez ele realmente pegue problemas. O que a votação e a revisão por pares compram não é “maioria”, é **independência**.

Note uma fronteira: três chamadas a um mesmo modelo não são três juízes independentes. Elas compartilham os mesmos vieses de treinamento. A votação consegue filtrar ruído de amostragem e lacunas de atenção de uma passada única. Ela não consegue filtrar vieses sistemáticos. Não a trate como um mecanismo que produz verdade só por votar.

## A régua: independência é pré-requisito, não opcional

Todos os benefícios desta lição repousam sobre um pré-requisito que já apareceu repetidamente e vale destacar: as subtarefas precisam realmente não depender umas das outras.

A documentação do Claude Code, ao discutir vários subagentes investigando ao mesmo tempo, acrescenta uma frase específica: cada subagente explora a sua área de forma independente, e depois o Claude sintetiza os achados. **Isso funciona melhor quando os caminhos de pesquisa não dependem uns dos outros**[^S4]. A condição inversa está escrita na retrospectiva multiagente: alguns domínios exigem que todos os agentes compartilhem o mesmo contexto ou envolvem muitas dependências entre agentes, e esses domínios hoje não são uma boa escolha para sistemas multiagente. Por exemplo, a maior parte das tarefas de programação envolve menos tarefas genuinamente paralelizáveis do que pesquisa, e agentes LLM ainda não são muito bons em coordenar e delegar a outros agentes em tempo real[^S2].

Para julgar se uma proposta deve ser paralelizada, faça uma pergunta: **o caminho 2 precisa esperar a conclusão do caminho 1 para saber o que fazer?**

- Precisa esperar → esta não é a forma da paralelização. A saída da etapa anterior é a entrada da seguinte — isso é o encadeamento da Lição 2.
- Não precisa esperar → seccionamento.
- Mesma coisa, mas você quer vários julgamentos independentes → votação.

O primeiro caso é o mais fácil de embaçar: existe uma dependência, mas você força o fan-out porque “provavelmente vai dar certo”. O resultado são vários caminhos de agente escrevendo cada um a sua conclusão, sem saber dos outros. Na agregação, você suaviza as contradições na mão — o tempo economizado vai todo para a suavização, e ainda por cima você pagou tokens a mais.

## Fronteira: a decomposição desta lição é predefinida

Fixe uma palavra — ela é a entrada da Lição 4.

Em todos os exemplos desta lição, **quem definiu as subtarefas**? Você. Doze documentos, você os leu do diretório. Três perspectivas, você as fixou em um array. Antes de o código rodar, quantos caminhos abrem em fan-out e o que cada um faz já está tudo resolvido. Isso se chama decomposição **predefinida**.

O oposto: o modelo decide em quantas partes e o que cada uma faz. A fonte original trata essa diferença como o divisor de águas entre dois padrões — no fluxo de trabalho orquestrador-workers, um LLM central decompõe tarefas dinamicamente, delega-as a LLMs workers e sintetiza seus resultados[^S1]. Embora seja topograficamente semelhante à paralelização, a **diferença-chave é a flexibilidade dele — as subtarefas não são predefinidas, e sim determinadas pelo orquestrador com base na entrada específica**[^S1].

Então a fronteira entre os dois não é “quantos caminhos rodam de uma vez”, e sim “quem escreveu aquele array”. O array é seu, é esta lição. O array é gerado pelo modelo na hora, é a lição seguinte. O roteamento da lição passada já entregou uma decisão ao modelo (qual ramo). A lição seguinte entrega um pedaço maior: a própria decomposição.

## 💻 Exercícios

<!-- exercises -->

### Nível 1: Cinco propostas de fan-out, julgue a forma e ache as armadilhas

Cinco propostas estão na sua mesa. Dê a cada uma uma categoria — **seccionamento** / **votação** / **não deve ser paralelizada** — e explique por quê. Para as julgadas como seccionamento ou votação, acrescente duas notas de tratamento: como configurar a concorrência e como agregar.

1. Doze documentos de produto independentes, cada um precisando do mesmo processo de revisão.
2. Um texto de alto risco prestes a ir para a página inicial, que precisa de avaliação nas perspectivas jurídica, de segurança e de marca.
3. Um script de migração de banco de dados exigindo backup → alterar o schema → preencher os dados, três etapas em ordem estrita.
4. Quarenta módulos precisam de avaliação de dívida técnica, mas as regras de avaliação exigem que cada módulo referencie as conclusões do módulo anterior, convergindo gradualmente para um padrão unificado.
5. Uma entrada de usuário precisa ser classificada como conteúdo violador ou não, o custo de classificar errado é alto, e você quer confiança maior do que a de uma chamada única.

<!-- rubric -->

- As cinco recebem categorias claras, com a base do julgamento aterrissando na pergunta “o caminho 2 precisa esperar a conclusão do caminho 1?”, não em escala ou intuição
- Os itens 3 e 4 são ambos julgados como não deve ser paralelizada, e a justificativa do item 4 precisa apontar que se trata de **dependência de conclusão** (não “itens demais” ou “medo de erros”)
- Todo item julgado como seccionamento ou votação (itens 1, 2, 5) escreve o tratamento de concorrência (definir teto / lote ou pool) e o tratamento de agregação (passar referências ou devolver apenas conclusões estruturadas), os dois obrigatórios
- O item 5 precisa mencionar limiar definido por código e explicar que cenários de alto risco devem ter limiares mais rigorosos
- Aponta que o custo da votação é N× tokens, e que não se pode votar indiscriminadamente em todas as entradas

<!-- answer -->

Resposta de referência:

**Item 1 — Seccionamento.** Doze documentos não se referenciam, e a conclusão do documento 3 não precisa de nada do documento 2 — subtarefas independentes em paralelo, o caso típico[^S1]. Tratamento de concorrência: não escreva `Promise.all(docs.map(...))` mandando os 12 de uma vez; use um pool de concorrência com teto de 3 a 5 caminhos. Doze parece administrável, mas o mesmo código amanhã vai rodar sobre 200, e o teto deveria estar lá desde o primeiro dia. Tratamento de agregação: cada relatório de revisão aterrissa em `out/<id>.md`, e o que volta é apenas o caminho do arquivo mais um resumo de conclusão de uma linha — muitos subagentes devolvendo, cada um, resultados detalhados consomem contexto significativo[^S4], e a abordagem correta é guardar a saída em sistemas externos, passando de volta ao coordenador apenas referências leves[^S2]. Armadilha: no `Promise.all`, uma rejeição perde todos os outros resultados; cada caminho precisa do seu `try/catch`, com as falhas registradas para uma nova execução em separado.

**Item 2 — Votação.** O mesmo texto rodado três vezes, cada uma com uma perspectiva diferente, exatamente “rodar a mesma tarefa várias vezes para obter saídas diversas”[^S1]. E, para tarefas complexas com múltiplas considerações, cada uma tratada por uma chamada separada com atenção focada geralmente tem desempenho melhor[^S1], mais forte do que enfiar três perspectivas em um prompt só. Tratamento de concorrência: os três caminhos podem ser enviados juntos direto, a escala é pequena o bastante para dispensar o pool. Se for processar muitos textos em lote, é “seccionamento por fora × votação por dentro”, e a camada externa precisa limitar o fluxo, senão a concorrência é a quantidade de textos vezes 3. Tratamento de agregação: as três opiniões voltam e o código julga — por exemplo, se 2 de 3 votos apontarem problemas, reprove, com o limiar fixado no código. Armadilha: três chamadas de um mesmo modelo compartilham os mesmos vieses, e a votação suprime ruído de amostragem, mas não viés sistemático. Além disso, isso paga 3× tokens por execução; habilite apenas para textos de alto risco, não habilite na escala inteira.

**Item 3 — Não deve ser paralelizada.** Backup → alterar → preencher: o pré-requisito da etapa seguinte é o sucesso da anterior, dependência puramente sequencial, pertence à forma de cadeia da Lição 2. Devem ser acrescentados gates programáticos entre os estágios (não prossiga se o backup falhar). Forçar o fan-out tem consequências piores do que lentidão: corrupção de dados.

**Item 4 — Não deve ser paralelizada.** Esta é a armadilha mais espinhosa: quarenta módulos soam como seccionamento, mas as regras de avaliação exigem que cada módulo referencie a conclusão do módulo anterior, construindo dependência entre as subtarefas. A formulação é explícita: vários subagentes investigando ao mesmo tempo funciona melhor quando os caminhos de pesquisa não dependem uns dos outros[^S4]. Domínios que exigem contexto compartilhado ou muitas dependências entre agentes hoje não são uma boa escolha para multiagente[^S2]. A correção viável é primeiro corrigir os requisitos: se o “padrão unificado” puder ser estabelecido antes por uma chamada e então passado como entrada fixa aos 40 caminhos, a dependência é quebrada e a segunda etapa pode ser paralelizada. Se o padrão precisa evoluir um a um, só resta o serial.

**Item 5 — Votação, com limiar.** É preciso um julgamento de maior confiança, exatamente o segundo caso de uso da paralelização: múltiplas perspectivas ou tentativas são necessárias para resultados de maior confiança[^S1]. Tratamento de concorrência: de 3 a 5 caminhos enviados juntos, não mais — além disso os retornos diminuem, enquanto os tokens crescem linearmente. Tratamento de agregação: o código apura os votos, cenários de alto risco usam “um veto basta” em vez de maioria simples, e as amostras de fronteira vão para revisão humana. Armadilha: calcule o custo antes de ir para produção — agentes usam cerca de 4× os tokens de chat, sistemas multiagente cerca de 15×, e esses sistemas precisam de valor de tarefa alto o bastante para cobrir o custo[^S2]. O julgamento de violação só vota nas amostras de zona cinzenta; entradas obviamente em conformidade recebem uma chamada única.

<!-- hint -->

Faça uma pergunta a cada item: o caminho 2 precisa esperar a conclusão do caminho 1 para saber o que fazer? Se a espera é necessária, não é a forma da paralelização, e ter dezenas ou centenas de itens não muda isso. Os “40 módulos” do item 4 são um chamariz; o que realmente decide a resposta é a meia-frase “referenciar a conclusão do módulo anterior”.

<!-- hint -->

“Rodar a mesma tarefa muitas vezes” e “rodar muitas tarefas diferentes uma vez cada” são duas variantes diferentes, não misture. Além disso, os dois itens julgados como votação devem mais uma coisa: quantos votos contam? Esse limiar precisa estar escrito em código, e quanto maior o custo de classificar errado, mais rigoroso ele deve ser em relação à maioria simples.

### Nível 2: Escreva um fan-out limitado e rode você mesmo

Escreva um `fanout.mjs` que rode (Node 18+, sem dependências), com os requisitos:

- `client` stub embutido, fingindo `messages.create`, offline, com a duração e a conclusão de cada item fixas no código, para que duas execuções se comparem caractere a caractere
- 8 itens, cada item tratado por uma chamada de `runAgent()` (reaproveite a forma do wrapper da Lição 2)
- Implemente o seu próprio pool de concorrência, com teto 3; os workers rodando ao mesmo tempo não podem passar de 3; a falha de um caminho não pode derrubar o lote inteiro
- Cada worker escreve a saída em um arquivo no diretório `out/`; a agregação só coleta caminhos de arquivo e resumos de uma linha, sem trazer de volta os corpos dos relatórios
- No fim, imprima uma tabela de resumo (item / duração / conclusão / arquivo de resultado) e imprima a comparação entre bytes em disco e bytes devolvidos
- Caminho de julgamento com códigos de saída: tudo com sucesso `exit 0`, qualquer falha ou arquivo de resultado vazio `exit 1`
- Depois de rodar, mude o teto de concorrência de 3 para 8 e rode de novo (editando o código ou usando variável de ambiente), e verifique que a ordem de conclusão mudou mas o conjunto de resultados não. Para que a ordem realmente mude, as durações fixas **não podem crescer na ordem do array nem ser todas iguais** (algo como 120/40/200/60/30/150/80/45), senão a ordem de conclusão nos dois níveis de concorrência coincide

<!-- rubric -->

- O pool de concorrência é escrito por você (N faixas fixas + cursor compartilhado, ou equivalente), sem introduzir dependências de terceiros, e os workers rodando ao mesmo tempo de fato não passam de `limit`
- Cada worker tem `try/catch` interno (ou tratamento equivalente); quando um caminho falha, os outros ainda se completam e entram na tabela de resumo
- A saída é de fato escrita em arquivos dentro de `out/`, e o objeto devolvido só tem campos leves como caminho e resumo, sem o corpo do relatório
- Os dois ramos do julgamento se sustentam: tudo com sucesso `process.exit(0)`, qualquer falha ou arquivo vazio `process.exit(1)` e impressão de qual falhou
- As saídas das duas execuções vêm de execução real, as ordens de conclusão diferem (pré-requisito: o arranjo de durações satisfaz a condição acima), as impressões digitais do conjunto de resultados batem, e você consegue explicar por que a ordem muda e os resultados não

<!-- answer -->

Resposta de referência: script completo abaixo; quem escreveu esta lição rodou no Node, e os dois blocos de saída seguintes são resultados de execução colados diretamente.

```javascript
// fanout.mjs — fan-out de seccionamento: 8 itens, teto de concorrência 3, agregação só passa referências
// Uso: node fanout.mjs          concorrência padrão 3
//      LIMIT=8 node fanout.mjs  concorrência 8
import { mkdir, writeFile, rm, stat } from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";

const OUT_DIR = "out"; // Caminho relativo: as referências devolvidas ficam mais leves e não dependem do diretório de execução
const LIMIT = Number(process.env.LIMIT ?? 3);

// ---------- 1. Entrada: 8 itens independentes ----------
const DOCS = [
  { id: "api-auth", title: "Guia de autenticação da API" },
  { id: "billing-faq", title: "Perguntas frequentes de cobrança" },
  { id: "onboarding", title: "Guia de primeiros passos" },
  { id: "webhook-guide", title: "Guia de integração de webhooks" },
  { id: "rate-limit", title: "Política de limite de taxa" },
  { id: "sdk-migration", title: "Guia de migração do SDK" },
  { id: "error-codes", title: "Referência de códigos de erro" },
  { id: "security-notes", title: "Boas práticas de segurança" },
];

// ---------- 2. Cliente stub: finge messages.create, offline ----------
// A duração e a conclusão de cada id são fixas, para que duas execuções se comparem caractere a caractere
const FAKE = {
  "api-auth": { ms: 120, issues: 3, level: "alto" },
  "billing-faq": { ms: 40, issues: 1, level: "baixo" },
  onboarding: { ms: 200, issues: 4, level: "médio" },
  "webhook-guide": { ms: 60, issues: 2, level: "médio" },
  "rate-limit": { ms: 30, issues: 0, level: "baixo" },
  "sdk-migration": { ms: 150, issues: 5, level: "alto" },
  "error-codes": { ms: 80, issues: 2, level: "baixo" },
  "security-notes": { ms: 45, issues: 1, level: "médio" },
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function createStubClient() {
  return {
    messages: {
      async create({ messages }) {
        const last = messages[messages.length - 1].content;
        const id = /<doc id="([^"]+)">/.exec(last)?.[1];
        const f = FAKE[id];
        if (!f) throw new Error(`O cliente stub não reconhece o item: ${id}`);
        await sleep(f.ms); // Finge a ida e volta de rede
        const findings = Array.from(
          { length: f.issues },
          (_, i) => `- Seção ${i + 1}: Redação inconsistente com a API atual, precisa de revisão`,
        ).join("\n");
        return {
          stop_reason: "end_turn",
          content: [
            {
              type: "text",
              text: `# Relatório de revisão: ${id}\n\n## Achados\n${findings || "- Nenhum"}\n\nConclusão: ${f.issues} problemas, nível de risco ${f.level}`,
            },
          ],
        };
      },
    },
  };
}

// ---------- 3. runAgent: o wrapper da Lição 2 simplificado (o stub só faz end_turn, o ramo de ferramenta foi omitido) ----------
async function runAgent(client, task) {
  const messages = [{ role: "user", content: task.prompt }];
  for (let turn = 0; turn < 8; turn++) {
    const res = await client.messages.create({
      model: "claude-sonnet-4-5",
      max_tokens: 2048,
      messages,
    });
    const text = res.content
      .filter((b) => b.type === "text")
      .map((b) => b.text)
      .join("\n");
    if (res.stop_reason === "end_turn") return text;
    messages.push({ role: "assistant", content: res.content });
    messages.push({ role: "user", content: "continue" });
  }
  throw new Error(`${task.id}: excedeu o teto de turnos sem convergir`);
}

// ---------- 4. Pool de concorrência: teto LIMIT, sem dependências ----------
async function pool(items, limit, worker) {
  const results = new Array(items.length);
  let cursor = 0;
  const lanes = Array.from(
    { length: Math.min(limit, items.length) },
    async () => {
      while (true) {
        const i = cursor++;
        if (i >= items.length) return;
        try {
          results[i] = { ok: true, value: await worker(items[i], i) };
        } catch (err) {
          results[i] = { ok: false, id: items[i].id, error: String(err) };
        }
      }
    },
  );
  await Promise.all(lanes);
  return results;
}

// ---------- 5. Um worker = um runAgent + uma escrita em disco ----------
const completionOrder = [];

async function reviewOne(client, doc) {
  const t0 = Date.now();
  const report = await runAgent(client, {
    id: doc.id,
    prompt: `Revise o documento a seguir, liste os pontos inconsistentes com a API atual e, na última linha, começando com "Conclusão:", dê a contagem de problemas e o nível de risco.\n\n<doc id="${doc.id}">${doc.title}</doc>`,
  });
  const file = path.join(OUT_DIR, `${doc.id}.md`);
  await writeFile(file, report, "utf8");
  const summary = report.split("\n").find((l) => l.startsWith("Conclusão:")) ?? "Sem conclusão";
  completionOrder.push(doc.id);
  // O que volta para o coordenador é só este pedacinho: referência + resumo de uma linha
  return { id: doc.id, file, summary, ms: Date.now() - t0, bytes: Buffer.byteLength(report) };
}

// ---------- 6. Fluxo principal ----------
const client = createStubClient();
await rm(OUT_DIR, { recursive: true, force: true });
await mkdir(OUT_DIR, { recursive: true });

const wallStart = Date.now();
const settled = await pool(DOCS, LIMIT, (doc) => reviewOne(client, doc));
const wallMs = Date.now() - wallStart;

const failed = settled.filter((r) => !r.ok);
const done = settled.filter((r) => r.ok).map((r) => r.value);

console.log(`Teto de concorrência: ${LIMIT}  Itens: ${DOCS.length}  Tempo de relógio: ${wallMs}ms`);
console.log(`Ordem de conclusão: ${completionOrder.join(" → ")}`);
console.log("");
console.log("Item             Duração  Conclusão                  Arquivo de resultado");
console.log("-".repeat(78));
for (const d of DOCS) {
  const r = done.find((x) => x.id === d.id);
  if (!r) {
    console.log(`${d.id.padEnd(16)} ${"—".padEnd(8)} Falhou                     —`);
    continue;
  }
  console.log(
    `${r.id.padEnd(16)} ${String(r.ms + "ms").padEnd(8)} ${r.summary.padEnd(26)} ${r.file}`,
  );
}
console.log("-".repeat(78));

const payload = done.reduce((n, r) => n + r.bytes, 0);
const carried = Buffer.byteLength(
  JSON.stringify(done.map((r) => ({ file: r.file, summary: r.summary }))),
);
console.log(`Saída em disco: ${payload} bytes   Agregação trouxe de volta: ${carried} bytes`);

// Impressão digital do conjunto de resultados: independe da concorrência, tem que bater entre execuções
const digest = createHash("sha256")
  .update(done.map((r) => `${r.id}:${r.bytes}:${r.summary}`).sort().join("|"))
  .digest("hex")
  .slice(0, 12);
console.log(`Impressão digital do conjunto de resultados: ${digest}`);

// ---------- 7. Julgamento ----------
for (const r of done) {
  const s = await stat(r.file);
  if (s.size === 0) failed.push({ id: r.id, error: "Arquivo de resultado vazio" });
}
if (failed.length > 0 || done.length !== DOCS.length) {
  console.error(`Julgamento: ${failed.length} de ${DOCS.length} falharam`);
  for (const f of failed) console.error(`  ${f.id}: ${f.error}`);
  process.exit(1);
}
console.log("Julgamento: aprovado");
process.exit(0);
```

Primeira execução, concorrência 3:

```text
$ node fanout.mjs; echo "exit=$?"
Teto de concorrência: 3  Itens: 8  Tempo de relógio: 271ms
Ordem de conclusão: billing-faq → webhook-guide → api-auth → rate-limit → onboarding → error-codes → security-notes → sdk-migration

Item             Duração  Conclusão                  Arquivo de resultado
------------------------------------------------------------------------------
api-auth         121ms    Conclusão: 3 problemas, nível de risco alto out/api-auth.md
billing-faq      42ms     Conclusão: 1 problemas, nível de risco baixo out/billing-faq.md
onboarding       201ms    Conclusão: 4 problemas, nível de risco médio out/onboarding.md
webhook-guide    61ms     Conclusão: 2 problemas, nível de risco médio out/webhook-guide.md
rate-limit       32ms     Conclusão: 0 problemas, nível de risco baixo out/rate-limit.md
sdk-migration    150ms    Conclusão: 5 problemas, nível de risco alto out/sdk-migration.md
error-codes      81ms     Conclusão: 2 problemas, nível de risco baixo out/error-codes.md
security-notes   46ms     Conclusão: 1 problemas, nível de risco médio out/security-notes.md
------------------------------------------------------------------------------
Saída em disco: 2120 bytes   Agregação trouxe de volta: 716 bytes
Impressão digital do conjunto de resultados: 7b76d0bc799c
Julgamento: aprovado
exit=0
```

Segunda execução, concorrência mudada para 8:

```text
$ LIMIT=8 node fanout.mjs; echo "exit=$?"
Teto de concorrência: 8  Itens: 8  Tempo de relógio: 201ms
Ordem de conclusão: rate-limit → billing-faq → security-notes → webhook-guide → error-codes → api-auth → sdk-migration → onboarding

Item             Duração  Conclusão                  Arquivo de resultado
------------------------------------------------------------------------------
api-auth         122ms    Conclusão: 3 problemas, nível de risco alto out/api-auth.md
billing-faq      45ms     Conclusão: 1 problemas, nível de risco baixo out/billing-faq.md
onboarding       200ms    Conclusão: 4 problemas, nível de risco médio out/onboarding.md
webhook-guide    61ms     Conclusão: 2 problemas, nível de risco médio out/webhook-guide.md
rate-limit       31ms     Conclusão: 0 problemas, nível de risco baixo out/rate-limit.md
sdk-migration    151ms    Conclusão: 5 problemas, nível de risco alto out/sdk-migration.md
error-codes      81ms     Conclusão: 2 problemas, nível de risco baixo out/error-codes.md
security-notes   45ms     Conclusão: 1 problemas, nível de risco médio out/security-notes.md
------------------------------------------------------------------------------
Saída em disco: 2120 bytes   Agregação trouxe de volta: 716 bytes
Impressão digital do conjunto de resultados: 7b76d0bc799c
Julgamento: aprovado
exit=0
```

Três pontos que valem comparar entre as execuções:

1. **A ordem de conclusão mudou.** Com concorrência 3, os três primeiros itens começaram primeiro, e quem terminou primeiro liberou uma faixa para o item 4, com a ordem determinada por “hora de início + duração individual”. Com concorrência 8, os oito começaram juntos, e a ordem de conclusão é simplesmente a duração da menor para a maior (30 → 40 → 45 → 60 → 80 → 120 → 150 → 200 milissegundos). A ordem de conclusão do fan-out é não determinística. Qualquer lógica que dependa de “processar primeiro o que voltar primeiro” quebra aqui.
2. **O conjunto de resultados não mudou.** A tabela de resumo imprime na ordem fixa de `DOCS`, e a impressão digital é `7b76d0bc799c` nas duas vezes. Isso é por projeto: a tabela de resumo percorre o array de entrada, não a ordem de conclusão, e a impressão digital faz `sort()` antes de calcular. **O número de concorrência é um parâmetro de desempenho, não deveria afetar resultados** — transforme isso em uma asserção verificável e você vai mudar a concorrência com confiança.
3. **A agregação trouxe de volta menos de 35%.** 2.120 bytes em disco, 716 bytes devolvidos. Com 8 itens já é essa diferença. Escale para 200 itens, com cada relatório dez vezes mais longo, e o lado do disco incha para centenas de KB, enquanto o lado devolvido continua sendo um resumo de uma linha mais um caminho.

Erre de propósito o id de um item (escreva `rate-limitX`, por exemplo) e rode de novo: o caminho de julgamento pega o outro ramo:

```text
$ node fanout.mjs; echo "exit=$?"
…(linhas item a item e tabela de resumo omitidas: a linha de rate-limitX aparece como Falhou, os outros 7 caíram em disco)
Julgamento: 1 de 8 falharam
  rate-limitX: Error: O cliente stub não reconhece o item: rate-limitX
exit=1
```

Note que os outros 7 se completaram e caíram em disco — foi isso que o `try/catch` do pool comprou. Troque para `Promise.all(DOCS.map(reviewOne))` e uma rejeição faz o `await` inteiro rejeitar, sem conseguir nenhum dos resultados já concluídos dos outros 7.

<!-- hint -->

Separe “teto de concorrência” e “lote” em duas coisas. Lote é “cada lote espera o mais lento terminar antes do próximo lote”; pool de concorrência é “fixe N faixas, e cada uma pega a próxima assim que termina a atual”. Ao escrever o pool, use uma variável `cursor` compartilhada como distribuidor de senhas e abra N funções assíncronas, cada uma com um `while` puxando senhas — o JavaScript é de thread única, e o `cursor++` não é interrompido.

<!-- hint -->

Como provar a si mesmo que “o conjunto de resultados não muda”? Não compare duas telas de saída a olho nu. Comprima cada resultado em uma string curta (`id:bytes:resumo`), ordene, junte, calcule um sha256 e imprima os 12 primeiros caracteres. Impressão digital independente de ordem que bate, isso sim é realmente não ter mudado. E lembre também que a tabela de resumo deve percorrer o array de entrada, não a ordem de conclusão, senão a própria tabela treme junto com o número de concorrência.

<!-- /exercises -->

## Recapitulação

- A definição de paralelização é “LLMs às vezes conseguem trabalhar em uma tarefa simultaneamente e ter suas saídas agregadas programaticamente”, e as duas variantes são seccionamento (quebrar uma tarefa em subtarefas independentes rodadas em paralelo) e votação (rodar a mesma tarefa várias vezes para obter saídas diversas)[^S1]
- As condições dela são: as subtarefas podem ser paralelizadas por velocidade, ou são necessárias múltiplas perspectivas e tentativas para maior confiança. Para tarefas complexas com múltiplas considerações, tratar cada uma com uma chamada separada, com atenção focada, geralmente tem desempenho melhor[^S1]
- O fan-out compra mais do que velocidade: subagentes operando em paralelo com as próprias janelas de contexto exploram e comprimem de volta os tokens mais importantes, trazendo também separação de responsabilidades (ferramentas, prompts e trajetórias de exploração distintas) e menos dependência do caminho[^S2]. Distribuir trabalho entre agentes com janelas de contexto separadas acrescenta capacidade para raciocínio paralelo[^S2]
- O número da aceleração vem com contexto: o sistema de pesquisa deles introduziu paralelização em dois níveis (o líder sobe de 3 a 5 subagentes em paralelo, e os subagentes usam 3 ou mais ferramentas em paralelo), cortando o tempo de pesquisa em até 90% para consultas complexas[^S2] — este é um número de latência do sistema deles, não um número de qualidade
- A agregação é o primeiro custo: os resultados dos subagentes voltam para a conversa principal, e muitos subagentes devolvendo, cada um, resultados detalhados consomem contexto significativo[^S4]. A solução são sistemas de artefatos — os subagentes guardam a saída em sistemas externos e passam de volta ao coordenador apenas referências leves[^S2]
- Concorrência nunca é ilimitada: o Claude Code usa por padrão 20 subagentes concorrentes e falha com um explícito “não tente de novo” quando excedido[^S4]. O runtime de fluxos de trabalho suporta até 16 agentes concorrentes (menos quando a CPU é limitada), com teto de 1.000 por execução[^S5]. Os Managed Agents vão até 25 threads concorrentes[^S6]
- O custo da votação é N× tokens, e precisa ser colocado junto naquele multiplicador — pelos dados deles, agentes ficam em cerca de 4× o chat, e sistemas multiagente em cerca de 15× o chat. O valor da tarefa precisa ser alto o bastante para cobrir isso[^S2]. O que ela deve comprar é um padrão de qualidade repetível, como agentes independentes revisando adversarialmente, ou rascunhar a partir de vários ângulos e depois pesar[^S5]
- Independência é pré-requisito: vários subagentes investigando ao mesmo tempo funciona melhor quando os caminhos de pesquisa não dependem uns dos outros[^S4]. Domínios que exigem contexto compartilhado ou muitas dependências hoje não são uma boa escolha[^S2] — havendo dependência, volte à forma do encadeamento
- A decomposição desta lição é toda predefinida (você escreveu o array). Subtarefas não predefinidas, e sim determinadas pelo orquestrador com base na entrada específica, são a diferença-chave entre orquestrador-workers e paralelização[^S1], e também o tema da próxima lição

[>> Lição 4: Orquestrador-workers: tornar a própria decomposição dinâmica](./04-orchestrator-workers.md)
