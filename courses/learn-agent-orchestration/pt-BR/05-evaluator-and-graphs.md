# Lição 5: O laço de revisão, e compor padrões em um grafo

> Objetivos de aprendizado:
> - Implementar um laço de revisar-e-refinar (gerar um rascunho, avaliá-lo, revisar com base no feedback) e usar dois critérios de decisão para determinar se vale a pena construir esse loop
> - Escrever condições de parada mais espertas do que “no máximo N rodadas”, e colocar verificações determinísticas antes do avaliador
> - Compor cinco padrões no que esta lição chama de “grafo”, e documentar nos seus próprios materiais que esse sistema visual é uma metáfora própria ancorada numa citação específica de fonte primária
>
> Pré-requisitos: Ler as Lições 1–4 (quem guarda o plano, encadeamento e roteamento, paralelização, orquestrador-workers), saber escrever à mão um laço de harness dirigido por `stop_reason` | Anterior: [<< Lição 4](./04-orchestrator-workers.md) | Próxima: [Lição 6 >>](./06-build-a-graph.md)

## O rascunho que está sempre a um etapa do fim

Você pede a um agente que escreva um plano de migração de banco de dados. O primeiro rascunho volta com aparência razoável: contexto, passos, janela de tempo, tudo presente. Mas você identifica dois buracos num relance — a seção de rollback só diz “reverta se necessário”, e não há classificação de risco em lugar nenhum. Você digita duas linhas de feedback apontando isso, o segundo rascunho volta, os dois buracos estão preenchidos, e o conjunto todo sobe um patamar de qualidade.

Você repetiu esse processo dezenas de vezes. Toda vez é a mesma coisa: a saída fica aquém, o humano fornece duas frases de feedback, a saída melhora perceptivelmente.

O problema não é que o modelo escreva mal. O problema é que **as suas duas frases de feedback não são difíceis de produzir**. “Os passos de rollback precisam incluir comandos específicos”, “Cada etapa precisa de uma classificação de risco” — são coisas que um checklist cobriria. Se você consegue articular isso com clareza, o modelo provavelmente também consegue. Então por que precisa ser você dizendo isso toda vez?

Essa forma merece ser escrita como um loop.

## Revisar-e-refinar: escrever “revise mais uma vez” no fluxo de controle

A fonte primária define isso em uma frase: uma chamada de LLM gera uma resposta enquanto outra fornece avaliação e feedback em um loop[^S1].

Os quatro padrões das primeiras quatro lições têm, cada um, sua própria topologia: o encadeamento decompõe uma tarefa em uma sequência de passos, com cada etapa processando a saída do anterior[^S1]; o roteamento classifica e depois despacha para tarefas de acompanhamento especializadas[^S1]; a paralelização roda coisas simultaneamente e agrega os resultados programaticamente[^S1]; o orquestrador-workers tem um LLM central decompondo tarefas dinamicamente, delegando a workers e sintetizando resultados[^S1]. Todos compartilham um traço: os dados fluem para a frente. O laço de revisão é o primeiro padrão **com uma aresta de retorno** — a saída volta para o nó de geração.

Como isso se parece em um produto? A documentação de fluxos de trabalho dinâmicos do Claude Code dá uma descrição em linguagem simples: rodar um verificador, corrigir o que falhou e repetir até passar ou parar de progredir[^S5]. Outra descrição cobre um uso diferente da mesma divisão de trabalho: ter agentes independentes revisando adversarialmente os achados uns dos outros antes de serem reportados[^S5]. Essa é uma revisão cruzada única antes do relatório, sem aresta de retorno e sem iteração — agrupá-la no laço de revisão é a categorização desta lição, não o texto original descrevendo a mesma topologia.

### Um conceito, três nomes

Precisamos construir uma ponte explícita aqui, ou você vai achar que está aprendendo três coisas diferentes.

O Curso 6 desta série, que ensina colaboração multiagente, chama essa divisão de “um faz o trabalho, outro critica” de **produtor-revisor**. Esse é o nosso vocabulário didático. Nos materiais primários, a documentação de fluxos de trabalho do Claude Code descreve seu uso no produto em uma frase: ter agentes independentes revisando adversarialmente os achados uns dos outros (o atalho desta lição para essa frase é “revisão cruzada adversarial”). A mesma forma tem dois nomes nas fontes primárias: a referência de padrões da Anthropic a chama de **evaluator-optimizer** (avaliador-otimizador)[^S1]; a documentação de fluxos de trabalho do Claude Code não lhe dá nome, apenas descreve o uso — aquela frase sobre revisar adversarialmente os achados uns dos outros[^S5].

Três nomes, uma forma. A diferença é o ângulo de onde você olha: ao discutir papéis de colaboração você vê dois atores, ao discutir padrões de orquestração você vê uma aresta de retorno, ao discutir capacidades de produto você vê uma técnica de qualidade reutilizável.

Há mais uma divisão de trabalho a esclarecer. O Curso 10 desta série gasta um curso inteiro ensinando você a **ser um bom avaliador**: como escrever rubricas, como restringir o formato de saída do avaliador, por que o avaliador precisa do próprio contexto independente, por que o worker não deveria ser também o avaliador. Aquele curso ensina a qualidade do avaliador em si. Esta lição não repete esses tópicos. Esta lição ensina **como ligar o avaliador ao fluxo de controle** — onde ele fica no loop, quando roda, quantas rodadas roda, quando para.

## Quando vale a pena construir este loop

Os critérios de aplicabilidade da fonte primária: este fluxo de trabalho é particularmente eficaz quando temos critérios de avaliação claros e quando o refinamento iterativo entrega valor mensurável; os dois sinais de bom encaixe são, primeiro, que as respostas do LLM podem ser comprovadamente melhoradas quando um humano articula seu feedback; e segundo, que o LLM consegue fornecer esse feedback[^S1].

Você já viu essa citação antes. O Curso 10 desta série citou exatamente essa frase ao responder a pergunta “vale a pena construir um laço de revisar-revisar”. Mesmos critérios, reenquadrados em contexto de orquestração — exceto que desta vez você está implementando a resposta como um loop no fluxo de controle.

Destrinchados, esses dois sinais protegem contra modos de falha diferentes:

**O primeiro sinal protege contra “revisar não ajuda”.** Algumas tarefas não vão melhorar num segundo rascunho por mais claramente que você formule o feedback — porque o problema é falta de dados de entrada ou uma tarefa definida de forma vaga, não a redação da saída. Nesse caso, construir um loop significa apenas que você está pagando duas vezes para obter duas versões igualmente inutilizáveis. O método de validação é rude mas eficaz: **faça você mesmo, manualmente, três vezes**. Em quantas dessas três a saída ficou “claramente melhor depois do feedback humano”? Se em duas de três o “feedback não ajudou”, não construa o loop.

**O segundo sinal protege contra “o avaliador não consegue dar esse tipo de feedback”.** Mesmo que o feedback humano funcione, você ainda tem de perguntar: o próprio modelo consegue fornecer o mesmo tipo de feedback? Se o seu feedback depende de coisas que só você sabe (do que este cliente reclamou no trimestre passado, o que o jurídico comunicou verbalmente semana passada), o modelo não tem essa informação, então o feedback que ele der será outra coisa completamente diferente. Nesse caso, ou você alimenta essa informação no prompt do avaliador — transformando-a em critérios que o modelo consegue avaliar — ou aceita que este etapa precisa de um humano.

**Há uma precondição que entra em vigor ainda antes desses dois sinais: os critérios de avaliação precisam ser claros.** Quando os critérios não são claros, o loop produz com confiabilidade um tipo específico de falha — o avaliador dá feedback apontando para direções diferentes ou até contraditórias a cada rodada, a saída fica em pingue-pongue entre duas versões, as rodadas se esgotam e o rascunho final é pior que o primeiro. Isso não é culpa do loop. É que os critérios ainda não foram definidos.

### Verificações determinísticas vêm antes do avaliador

A distinção definicional da fonte primária entre sistemas determinísticos e não determinísticos: sistemas determinísticos produzem a mesma saída toda vez, dadas entradas idênticas, enquanto sistemas não determinísticos — como agentes — podem gerar respostas variadas mesmo com as mesmas condições iniciais[^S3].

Avaliadores são não determinísticos. Toda regra que “o código consegue decidir definitivamente” entregue a um avaliador significa que você está usando algo que pode dar resultados diferentes a cada vez para avaliar algo que deveria dar o mesmo resultado sempre — e ainda pagando por uma chamada extra de modelo.

O Curso 10 desta série chama essa disciplina de pontuação em camadas: use código para o que o código consegue decidir, entregue ao modelo apenas o que o código não consegue. Esta lição copia isso direto para a ordenação dos nós do loop. A citação da Lição 2 continua valendo aqui — você pode adicionar verificações programáticas em qualquer etapa intermediário para garantir que o processo ainda está no rumo[^S1]. Todo rascunho no loop é um etapa intermediário.

Aplicado ao exemplo do plano de migração: “Cada etapa tem um comando de rollback correspondente?” pode ser decidido definitivamente com regex ou parsing estruturado — isso é um gate. “Os comandos de rollback estão escritos de forma crível?” precisa de um avaliador. A falha do primeiro nem sequer acorda o avaliador; basta informar ao redator quais passos estão faltando e seguir em frente.

## O esqueleto de código do loop

```javascript
const MAX_ROUNDS = 3;

async function reviewLoop(task) {
  let draft = null;
  let bestDraft = null;
  let feedback = null;
  let bestScore = -1;
  let rounds = 0;

  while (rounds < MAX_ROUNDS) {
    rounds++;

    // Nó A: gerar. Na primeira rodada o feedback é null, nas seguintes reescreve com o feedback anterior
    draft = await runAgent(writerPrompt(task, draft, feedback));

    // Gate determinístico antes do avaliador: não pague para perguntar ao modelo o que o código decide
    const gate = checkDeterministic(draft);
    if (!gate.pass) {
      feedback = gate.problems.join('\n');
      continue;
    }

    // Nó B: avaliador. Contexto independente, prompt independente, não vê o processo de escrita
    const verdict = await runVerdict(rubricPrompt(task, draft));
    if (verdict.pass) {
      return { draft, rounds, reason: 'passed' };
    }

    // Condição de parada: esta rodada não superou a anterior, não queime mais uma
    if (verdict.score <= bestScore) {
      return { draft: bestDraft ?? draft, rounds, reason: 'no-progress' };
    }

    bestScore = verdict.score;
    bestDraft = draft;
    feedback = verdict.notes;
  }

  return { draft: bestDraft ?? draft, rounds, reason: 'max-rounds' };
}
```

Alguns detalhes merecem menção individual.

**`runAgent` é um laço de harness completo.** Isso não mudou desde a Lição 2: todo `await runAgent(...)` neste script tem, por trás, o loop dirigido por `stop_reason` do Curso 7 desta série rodando. Isto é apenas mais uma camada de fluxo de controle escrito em código envolvendo o loop.

**Esses valores de `reason` são desfechos diferentes, não os colapse num booleano (sistemas reais frequentemente precisam subdividir mais — por exemplo, falha repetida no gate ganha seu próprio balde).** `passed` pode ser entregue diretamente; `max-rounds` significa que as rodadas se esgotaram sem passar, provavelmente precisa de repasse a humano; `no-progress` significa que o modelo travou, queimar mais dinheiro não vai melhorar. Esses três desfechos devem ser três linhas separadas nos seus dados de observabilidade — a abordagem de logging que o Curso 11 desta série ensina deve aterrissar neste campo `reason` aqui.

**Falha no gate também conta como rodada.** Antes do `continue`, `rounds` já foi incrementado. Isso é intencional: falhar repetidamente no gate significa que o prompt do redator tem um problema, deixá-lo tentar indefinidamente só queima dinheiro no mesmo buraco.

**Você precisa dos dois tipos de condição de parada.** A fonte primária, ao discutir laços de agente, diz: a tarefa frequentemente termina ao ser concluída, mas também é comum incluir condições de parada (como um número máximo de iterações) para manter o controle[^S1]. É daí que vem o “no máximo N rodadas” — é um fusível, garantindo que este código pare em qualquer circunstância. O mecanismo de parada por “nenhum progresso adicional” vem de outro lugar: rodar um verificador, corrigir o que falhou e repetir até passar ou parar de progredir[^S5]. Ele é mais esperto que o fusível porque observa **se esta rodada superou a anterior**, não quantas rodadas já rodaram.

Nota não subir significa sair — essa é a implementação mais fácil, mas não a única. Se o seu avaliador não emite nota, você pode passar a observar **se a contagem de itens reprovados diminuiu**; se a tarefa em si tem alta variância, você pode trocar por “só sair depois de duas rodadas consecutivas sem melhora” com um contador `stalled`. Qual você escolhe depende de quão estável é o seu avaliador, não de qual soa mais sofisticado. (Note o `bestDraft` no esqueleto: sair quando a nota não sobe pressupõe que você está sempre segurando o rascunho de maior nota; rastrear apenas `bestScore` sem `bestDraft` faz com que as saídas `no-progress` e `max-rounds` entreguem a versão atual, que é pior.)

## Compondo padrões: esta lição chama isso de “grafo”

Cinco padrões, todos contabilizados. A próxima questão é como arranjá-los juntos.

Posição oficial primeiro: estes blocos de construção não são prescritivos, são padrões comuns que desenvolvedores podem moldar e combinar para se ajustar a casos de uso diferentes; a chave para o sucesso, como em qualquer funcionalidade com LLM, é medir desempenho e iterar sobre as implementações[^S1].

Em outras palavras, para o “como compor”, a fonte primária dá permissão, não receita. A receita você escreve.

### Uma declaração honesta sobre a terminologia de grafo

**O uso de “grafo / nós / arestas” ao longo desta lição é uma metáfora de engenharia própria desta lição, não terminologia oficial (as seções anteriores já usaram “nó” e “aresta de retorno” com esse sentido).**

Copie esta frase para a sua própria documentação de arquitetura. As palavras "graph", "node", "edge", "DAG", "state machine" aparecem zero vezes em todas as fontes primárias que esta lição cita. O vocabulário das fontes primárias é workflows, patterns, orchestrator-workers, fan out — está discutindo um catálogo de padrões, não estrutura topológica.

Ainda assim precisamos usar a palavra “grafo”, porque, quando cinco padrões ficam lado a lado, você precisa de uma linguagem para falar deles com clareza, e “grafo” é a opção de menor esforço. Mas essa metáfora precisa ter um ponto de ancoragem, ou é só jargão inventado. A âncora é esta frase que de fato existe nos materiais primários: o próprio script do fluxo de trabalho guarda o loop, as ramificações e os resultados intermediários, enquanto o contexto do modelo guarda apenas a resposta final[^S5].

Essa frase já nomeia os três elementos de um grafo: loop (aresta de retorno), ramificação (ponto de bifurcação), resultados intermediários (estado). Tudo o que estamos fazendo é dar um nome a cada um.

### Convenções de desenho

No sistema visual desta lição:

- **Nó (node)** = um loop `runAgent`, ou um pedaço de código puro (gate, classificação, agregação, loteamento). Rotular o tipo de cada nó é a ação mais valiosa ao desenhar — ela obriga você a responder “este etapa precisa mesmo do modelo?”.
- **Aresta (edge)** = “de quem a saída alimenta quem”. Uma aresta não é uma estrutura de dados, é apenas a próxima linha de código lendo a variável da linha anterior.
- **Estado (state)** = variáveis do script. A âncora primária tem uma frase aqui também: os resultados intermediários permanecem em variáveis do script em vez de aterrissar no contexto do modelo[^S5]. **Não existe conceito oficial de “um objeto de estado passado entre nós”** — essa é uma expressão que tomamos emprestada de outros domínios; esta lição não constrói essa abstração, apenas passa as variáveis de que você precisar.

```agentmentor-check
{
  "id": "orc-zh-05-graph-is-ours",
  "label": "Um colega diz que não encontra “node” nem “edge” na documentação oficial",
  "prompt": "A documentação de arquitetura da sua equipe usa “nós” e “arestas” para organizar os cinco padrões de orquestração. Durante a revisão, um colega deixa um comentário: “Procurei ‘nodes’ e ‘edges’ na documentação da Anthropic e não achei nada. Vocês estão inventando citações?” Ele tem razão — esse sistema visual é mesmo de vocês. Como você responde, e o que a documentação deve dizer?",
  "whyHere": "A lição acabou de introduzir o sistema visual de “grafo / nós / arestas”, e ele aparece zero vezes nas fontes primárias. Esta questão pratica honestidade de citação: metáforas organizacionais próprias podem ser usadas, mas você precisa marcá-las como próprias na documentação e declarar a qual citação real elas se ancoram. Os princípios de verificação do Curso 10 se completam aqui.",
  "mode": "single",
  "choices": [
    {
      "id": "a",
      "text": "Se não é pesquisável, é problema. Apague toda a terminologia de grafo da documentação e reescreva usando só palavras oficiais, mesmo que fique prolixo — melhor prevenir do que enganar.",
      "correct": false,
      "feedback": "Isso é reagir em excesso. Metáforas próprias não são o mesmo que fabricação — fabricação é disfarçar terminologia própria de oficial. Apagar o sistema visual perde a linguagem que organiza os cinco padrões, tornando tudo mais difícil para o leitor. O problema é apenas a origem não rotulada; conserte o rótulo, mantenha o vocabulário."
    },
    {
      "id": "b",
      "text": "Responda: grafo, nó e aresta são termos gerais de engenharia de software, usados em compiladores e fluxo de dados há décadas — são conhecimento comum e não precisam de explicação de origem na documentação.",
      "correct": false,
      "feedback": "Esse é exatamente o problema. Os termos são de fato gerais, mas você os está usando na documentação como se fossem a classificação oficial deste conjunto de padrões de orquestração de agentes — os leitores vão naturalmente supor que “laço de revisão é um tipo de nó oficial dentro dos cinco padrões”. O que está sendo mal lido não é a palavra “grafo” em si, mas a relação dela com as fontes primárias."
    },
    {
      "id": "c",
      "text": "Acrescente um parágrafo no início da documentação: marque que grafo / nós / arestas é o sistema visual da sua equipe, não vocabulário oficial, e aponte a qual citação de fonte ele se ancora; depois verifique as citações ao longo de todo o texto.",
      "correct": true,
      "feedback": "Correto. O custo de vocabulário próprio não é “não pode usar”, é “tem de precificar”. Marque “este é o nosso sistema visual”, aponte a qual citação real ele se ancora, e os leitores ganham as duas coisas: uma linguagem organizacional útil e uma cadeia de citações verificável. A questão da busca frustrada do colega também se resolve sozinha — ele estava procurando vocabulário oficial, e você nunca afirmou que era oficial."
    }
  ]
}
```

## Os cinco padrões nas formas deste sistema visual

```text
Encadeamento   A ──> B ──> C                    Uma linha reta

Roteamento        ┌──> B1
               A ─┼──> B2                       Um ponto de bifurcação
                  └──> B3

Paralelização     ┌──> W1 ──┐
               A ─┼──> W2 ──┼──> fusão          Um leque: abre e depois funde
                  └──> W3 ──┘

Orquestrador-     ┌──> W? ──┐                   A bifurcação é dinâmica: quantas
  workers      A ─┼──> W? ──┼──> fusão          arestas e o que cada uma faz, A
                  └──> W? ──┘                   decide depois de ver a entrada

Laço de        A ──> J ──┐                      Um loop com uma aresta de retorno
  revisão      ^         │
               └──não────┘
```

A anotação daquela quarta forma merece releitura. Paralelização e orquestrador-workers são topograficamente parecidos em forma, sendo a diferença essencial que as subtarefas não são predefinidas, mas determinadas pelo orquestrador com base na entrada específica[^S1]. Desenhada no papel, a diferença é “eu desenhei três arestas” versus “A desenhou três arestas” — indistinguível no papel, mas muito diferente no código.

### Um exemplo de composição

Emendando roteamento, fan-out, fusão e laço de revisão:

```text
[classifica] ─┬─ simples ──> [resposta direta] ─────────────────> entrega
  código puro │
 (palavra-    └─ complexo ──┬─> [worker1] ─┐
  chave +                   ├─> [worker2] ─┼─> {fusão} ─> [rascunho] <───┐
  regras)                   └─> [worker3] ─┘               runAgent │      │
                                                              v      │      │
                                                           {gate} ─não──────┤
                                                              │ passa │      │
                                                              v      │      │
                                                          [revisão] ─não─────┘
                                                              │ sim   runAgent
                                                              v
                                                           entrega

Tipos de nó: [ ] = loop runAgent    { } = código puro
Aresta = de quem a saída alimenta quem. {gate} é verificação determinística, vem antes de [revisão]; falha no gate ou “não” na revisão devolvem ambos para [rascunho].
[classifica] é desenhado como laço de modelo em vez de {código puro} porque a fronteira reembolso/técnico/reclamação é difusa — quando as fronteiras são claras, troque por um classificador tradicional (isto é pontuação em camadas: use código primeiro quando o código consegue decidir).
```

A Lição 6 implementa **uma variante deste grafo**: aquela leva de chamados por acaso tem critérios de aceitação que podem ser todos escritos como regras, então a camada [revisão] degrada para um {gate}, e o fan-out muda de “um item complexo para três workers” para “uma leva de chamados, cada um despachado a um tratador”. Quais partes mudaram e por quê — a abertura da Lição 6 lista ponto a ponto. Olhe a forma aqui primeiro, o código espera até a próxima lição.

## Benefícios de engenharia da composição

Mover o fluxo de controle para o código entrega mais do que apenas “compreensível”. Alguns benefícios têm respaldo primário:

**O rastreamento passo a etapa traz recuperabilidade.** O runtime rastreia o resultado de cada agente conforme a execução avança, e é isso que torna uma execução retomável dentro da mesma sessão[^S5]. Traduzido para o sistema visual desta lição: todo nó do grafo é naturalmente um local de checkpoint — o nó termina, o resultado aterrissa numa variável do script, e essa variável é o registro de “até onde chegamos”. O projeto de checkpoints ensinado no Curso 9 desta série não precisa de fundação separada aqui; as fronteiras de nó são pontos de pouso naturais.

**Fan-out de granularidade fina preserva mais progresso.** Nas palavras da fonte primária: um fluxo de trabalho que distribui o trabalho entre muitos agentes pequenos preserva mais progresso do que um agente longo[^S5]. Um agente longo de quarenta minutos quebra, quarenta minutos perdidos; quarenta nós pequenos de um minuto e um quebra, você perde um minuto e sabe qual minuto.

**Técnicas de qualidade repetíveis tornam-se reutilizáveis.** Mover o plano para o código também permite que um fluxo de trabalho aplique um padrão de qualidade repetível, não apenas rode mais agentes: ele pode ter agentes independentes revisando adversarialmente os achados uns dos outros antes de serem reportados, ou esboçar um plano a partir de vários ângulos e pesá-los entre si, de modo que você obtenha um resultado mais confiável do que uma passada única[^S5]. A palavra-chave aqui é “repetível” — fazer uma revisão cruzada manualmente é uma operação, escrevê-la em um script é uma capacidade.

**Salvaguardas determinísticas envolvem agentes não determinísticos.** A retrospectiva do sistema multiagente de pesquisa da Anthropic afirma: eles combinam a adaptabilidade de agentes de IA construídos sobre o Claude com salvaguardas determinísticas como lógica de retentativa e checkpoints regulares[^S2]. Traduzido para o sistema visual desta lição: o esqueleto do grafo é determinístico (quem chama quem, quando parar, qual aresta tomar em caso de falha), o interior dos nós é não determinístico. Essa estratificação não é preferência estética, é pré-requisito para tornar o sistema operável.

## Disciplina de composição: toda camada acrescentada precisa passar por um portão

Benefícios declarados, agora as restrições.

**Toda camada acrescentada precisa passar pelo portão da “melhoria mensurável”.** A fonte primária diz a mesma coisa em dois lugares, com o segundo explicitamente marcado como reiteração: você deveria considerar adicionar complexidade apenas quando isso comprovadamente melhorar os resultados[^S1]. Isso é especialmente crítico nesta lição — cinco padrões dispostos na sua frente, e o erro mais fácil é usar todos. Acrescentar um nó significa mais uma chamada de modelo, mais um lugar que pode falhar, mais uma coisa a diagnosticar. Antes de acrescentar, pergunte: se eu remover, as métricas caem? Não conseguir responder significa que você ainda não mediu.

**Retentativa e timeout no nível do nó são prática de engenharia, não projeto oficial.** As fontes primárias mencionam isso apenas como oração subordinada (salvaguardas determinísticas como lógica de retentativa e checkpoints regulares[^S2]). Então o que segue está escrito como prática de engenharia; você não vai encontrar endosso disso em nenhuma documentação primária: envolva todo nó `runAgent` em um timeout, e depois do timeout ou retente ou marque este nó como falho e prossiga; a contagem de retentativas depende da natureza do nó (nós de recuperação somente-leitura podem retentar várias vezes, nós com efeitos colaterais idealmente não retentam automaticamente nem uma vez); quando um nó falha, distinga “esta aresta pode ser pulada” de “o grafo inteiro precisa parar”, não deixe a falha de um nó opcional derrubar a execução toda. Isso é senso comum ordinário de sistemas distribuídos, apenas aplicado a agentes — não trate como novidade.

**A profundidade é limitada.** A referência em nível de produto está bem ali: por padrão, um subagente pode disparar subagentes próprios, até três camadas abaixo da conversa principal[^S4]. Três camadas não é um limiar inventado por esta lição, mas a mensagem é clara — a profundidade de aninhamento em produtos reais não é ilimitada, alguém pensou seriamente sobre onde parar. Seu grafo deveria ter uma resposta parecida. Se o grafo que você desenhou tem cinco camadas de aninhamento, suspeite primeiro que a tarefa foi decomposta finamente demais, não saia pensando em como suportar mais profundidade.

## O grafo não é o objetivo, é uma descrição da forma da tarefa

Um modo de falha merece prevenção especial no fim deste curso: **escolher primeiro uma topologia bacana e depois procurar tarefas para enfiar nela.**

A ordem deveria ser inversa. Desenhe primeiro a forma de dependência da própria tarefa — quais passos precisam entrar em fila (a saída do etapa anterior é a entrada do próximo), quais passos não se afetam (tanto faz quem roda primeiro), qual etapa precisa ver a entrada antes de saber em quantas partes dividir, qual etapa tem saída que precisa de alguém para criticar antes de ser confiável. Terminado esse desenho, quais padrões usar está basicamente decidido: os lugares de fila são encadeamentos, os lugares mutuamente independentes são leques, os lugares de ver-então-decidir são orquestradores, os lugares que precisam de crítica são laços.

Padrões são nomes para formas de tarefa, não um cardápio do qual você pode escolher arbitrariamente.

E acima dessa disciplina há outra que entra em vigor ainda antes: encontre a solução mais simples possível e só aumente a complexidade quando necessário[^S1]. Essa frase apareceu na Lição 1 e, no fim desta lição, continua sendo a mesma frase. Depois de aprender cinco padrões, “uma chamada de LLM basta” continua sendo uma resposta completamente válida — as próprias fontes primárias dizem que, para muitas aplicações, otimizar chamadas individuais de LLM com recuperação e exemplos em contexto costuma ser suficiente[^S1].

O código completo e executável de composição está na Lição 6. Esta lição para aqui. O que você tem agora: cinco padrões, um sistema visual e uma lista de quando não usá-los.

## 💻 Exercícios

<!-- exercises -->

### Nível 1: Desenhar dois grafos e projetar condições de parada para os laços

Sem código. Use o sistema visual desta lição para desenhar um diagrama ASCII para cada uma das duas tarefas abaixo (em blocos ```text), **rotulando cada nó como loop `runAgent` ou código puro**.

**Tarefa um · Chamados de clientes**: Chega um chamado, classifique primeiro (reembolso / técnico / reclamação), roteie por categoria para fluxos de tratamento diferentes; depois do tratamento, faça pontuação de risco, os de alto risco precisam passar por um laço de revisão antes do envio, os de baixo risco vão direto.

**Tarefa dois · Avaliação de 40 módulos de código**: Uma execução avalia 40 módulos, agrupe-os em lotes e abra em leque para avaliação paralela, termine e funda, e então tenha um nó escrevendo o relatório-resumo; o relatório precisa passar por um gate (os 40 módulos têm conclusões? notas na faixa válida? referências parseáveis?), falhar significa devolver para reescrita.

Depois de desenhar, projete condições de parada para o laço de cada grafo (o laço de revisão da tarefa um, o loop do gate de relatório da tarefa dois): o máximo de rodadas é fusível obrigatório e não participa da escolha; entre “passou” e “nenhum progresso adicional”, decida qual é o mecanismo de parada principal e explique por que manteve ou descartou o outro.

<!-- rubric -->

- Ambos os grafos rotulam cada nó como `runAgent` ou código puro, e classificam classificar, pontuar risco, lotear, fundir e gate como código puro (classificar usando LLM também vale se você explicar por que não um classificador tradicional)
- O grafo da tarefa um tem um ponto de bifurcação real (três ou mais arestas mutuamente exclusivas), o grafo da tarefa dois mostra tanto a ação de abrir em leque quanto a de fundir
- Ambos os laços desenham a aresta de retorno (falha → volta ao nó de geração), não desenhada como linha reta
- Cada loop mantém o fusível de máximo de rodadas e esclarece principal/secundário entre “passou” e “nenhum progresso adicional”, com raciocínio amarrado à natureza da tarefa
- “Nenhum progresso adicional” é definido como quantidade decidível (a nota não subiu, a contagem de itens reprovados não diminuiu), não apenas “o modelo parece não ter melhorado”
- Declara o que acontece depois de cada desfecho de parada (entregar / repassar a humano / escalar), não colapsa os três desfechos num booleano

<!-- answer -->

**Grafo de referência da tarefa um**

```text
[classifica] ──┬── reembolso ──> [tratador reembolso] ──┐
  código puro  │                                         │
 (palavra-     ├── técnico ──> [tratador técnico] ───────┤
  chave +      │   runAgent                              │
  regras)      └── reclamação ──> [tratador reclamação]
                    runAgent   │  runAgent
                               v
                       {pontuação de risco}  código puro (limite de valor / palavras sensíveis / marca VIP)
                               │
              risco baixo ─────┴───── risco alto
                  │                       │
                  │               [rascunho resposta] <──────┐  runAgent
                  │                       │                  │
                  │               {gate de conformidade}  código puro
                  │                       │                  │
                  │                  [revisão] ──── não ─────┘  runAgent
                  │                       │ sim
                  v                       v
               [envia] ──────────────> [envia]   código puro
```

Marcar classificar como código puro é intencional: classificação de chamados é território típico de “um modelo ou algoritmo de classificação tradicional dá conta com precisão” — não use um modelo se não for preciso. Se as fronteiras das suas categorias forem difusas e não der para escrever regras, mudar para `runAgent` também é correto, mas anote o motivo no grafo.

**Condições de parada da tarefa um: passou + máximo de rodadas.**

Descarte “nenhum progresso adicional”. Motivo: este loop avalia **conformidade** — “não passou” significa que esta resposta não pode sair, não é uma nota de qualidade sobre a qual você possa transigir. Se você sair porque a nota não subiu e enviar mesmo assim, está usando uma regra de economia de dinheiro para liberar conteúdo não conforme. O máximo de rodadas aqui age como fusível: as rodadas se esgotam sem passar, o desfecho é **repasse a humano**, não envio. Três desfechos: `passed` → envia direto, `max-rounds` → entra na fila humana com o feedback da última rodada do avaliador anexado, gate falhando repetidamente → alerta (significa que o prompt de rascunho está quebrado).

**Grafo de referência da tarefa dois**

```text
[lê lista de 40 módulos]   código puro
          │
      {lotes: 5 lotes × 8 cada}   código puro (teto de concorrência fixo no código)
          │
   ┌──────┼──────┬──────┬──────┐
   v      v      v      v      v
[avalia] [avalia] [avalia] [avalia] [avalia]   runAgent × 5, por módulo dentro do lote
   │      │      │      │      │
   └──────┴──fusão─┴──────┴──────┘   código puro (coleta resultados, registra falhas, repõe se preciso)
          │
   [escreve resumo] <──────────┐   runAgent
          │                    │
   {gate do relatório} ─ falha ┘   código puro: os 40 módulos têm conclusões?
          │                        notas 0–100? referências parseáveis?
          │ passa
          v
        entrega
```

**Condições de parada da tarefa dois: passou + nenhum progresso adicional.**

Este gate verifica **lacunas enumeráveis** (quais módulos carecem de conclusão, quais referências não parseiam), então “houve progresso” pode ser definido de forma bem rígida: a contagem de itens reprovados desta rodada caiu em relação à anterior? Caiu, continue; não caiu, pare — uma rodada passar com a contagem de lacunas inalterada geralmente significa que a causa raiz está a montante (os resultados de avaliação daqueles módulos já vieram vazios), e reescrever o nó de relatório cem vezes não vai materializá-los. Parar neste ponto e entregar a lista de lacunas mais o log de falhas a montante a um humano é mais útil do que continuar queimando dinheiro.

Descarte “máximo de rodadas” como mecanismo principal (você pode sobrepor um valor grande como rede de segurança, digamos 10, mas ele não deveria disparar normalmente). Motivo: “nenhum progresso adicional” decide mais cedo e com mais precisão para esta tarefa; o teto de rodadas só entra em cena quando ele falha.

<!-- hint -->

Ao rotular tipos de nó, se você empacar em “este etapa conta como código puro?”, pergunte: **Dada a mesma entrada rodada duas vezes, a saída deste etapa vai diferir?** Vai diferir = `runAgent`, não vai = código puro. Os nós do seu grafo que fazem agregação, filtragem e decisões provavelmente caem todos no segundo caso.

<!-- hint -->

Ao projetar condições de parada, pense primeiro com clareza **qual é a ação seguinte para cada mecanismo de parada**. Se “nenhum progresso adicional” e “passou” disparam a mesma ação (ambos entregam), este loop provavelmente não precisa de “nenhum progresso adicional”; se três desfechos mapeiam para três tratadores diferentes a jusante, você provavelmente precisa manter os três.

### Nível 2: Três cenários, julgue se cada loop vale a pena

Sem código. Use os dois sinais de decisão desta lição — (1) quando um humano articula o feedback com clareza, a saída de fato melhora comprovadamente; (2) o LLM também consegue fornecer esse feedback — para julgar cada um dos três cenários abaixo, e dê sua recomendação de tratamento.

**Cenário um · Polimento de texto**: Um gerador de manchetes para landing page de marketing. A gerente de produto diz que o texto gerado atualmente é “utilizável mas sem graça”, ela fornece dois ou três pontos específicos toda vez (o diferencial não aparece na primeira frase, a chamada para ação é fraca demais, o comprimento excede o limite de duas linhas no celular), e a versão depois do feedback dela é perceptivelmente melhor. A equipe pergunta se deve acrescentar um laço de revisão.

**Cenário dois · Verificação de totais financeiros**: Um agente que gera resumos financeiros mensais a partir de recibos brutos. Vários totais no resumo frequentemente não fecham; alguém propõe acrescentar um “agente auditor” para ler o resumo, apontar as partes mal calculadas, devolver para recálculo, repetir até o agente auditor aprovar.

**Cenário três · Estilo de nomenclatura de componentes**: Um agente que nomeia novos componentes e escreve documentação. As avaliações de três colegas de frontend sobre a saída são cronicamente inconsistentes: A diz que os nomes são prolixos demais, B diz que não são descritivos o bastante, C acha que qualquer um serve mas que o tom da documentação é formal demais. Alguém propõe acrescentar um laço de revisão com um “agente revisor de estilo” como guardião.

<!-- rubric -->

- Os três cenários são conferidos contra os dois sinais um a um, cada sinal recebe um julgamento claro de “atende / não atende” e o raciocínio, não apenas uma nota de impressão geral
- Cenário um julgado como “vale a pena construir”, com projeto de condição de parada fornecido, não para na palavra “vale”
- Cenário dois julgado como “não deve construir agente auditor”, aponta explicitamente que o substituto é um verificador determinístico (código recalcula os totais e compara), explica que o motivo é que coisas que o código decide definitivamente não devem ir para um avaliador não determinístico
- Cenário três julgado como “o problema está na precondição”, aponta que os critérios de avaliação não são claros e que os julgamentos dos próprios humanos são inconsistentes, com conclusão de definir critérios primeiro em vez de construir o loop primeiro
- Ao menos um cenário nomeia “o que acontece se você construir o loop errado” com consequências específicas (dinheiro extra gasto, saída em pingue-pongue, erros passando)
- Não equipara “vale a pena construir” a “mais rodadas é melhor”

<!-- answer -->

**Cenário um: Vale a pena construir.**

O sinal um é atendido, e a evidência está pronta — o feedback da gerente de produto leva a versões perceptivelmente melhores, esse ciclo de “feedback humano funciona” já rodou muitas vezes manualmente, não precisa validar de novo. O sinal dois também é atendido: os três pontos dela (posição do diferencial, força da chamada para ação, comprimento) podem todos ser escritos numa rubrica, o modelo com certeza consegue dar o mesmo tipo de feedback. Os critérios de avaliação também são razoavelmente claros.

Recomendação: Solidifique os três pontos dela na rubrica do avaliador, mas **não entregue “excede o limite de duas linhas no celular” ao avaliador** — use contagem de caracteres para decidir definitivamente, coloque num gate. As condições de parada usam “passou + máximo de rodadas”, com rodadas em 2–3; texto publicitário tende a ficar mais sem graça com revisões demais, então o máximo de rodadas aqui não é só fusível, é ele próprio um controle de qualidade. Rodadas esgotadas sem passar, entregue a versão final mais o feedback do avaliador à gerente de produto para o corte final.

**Cenário dois: Não deve construir esse agente auditor.**

Os dois sinais não são o ponto principal aqui — há um julgamento que entra em vigor ainda antes: o código consegue decidir isso definitivamente. Se um total está correto é um problema determinístico: pegue os números dos recibos brutos e some de novo, não bate significa que não bate, resultado idêntico toda vez. Ter um avaliador não determinístico avaliando algo que deveria ser determinístico custa duas coisas (uma chamada extra de modelo) mais um risco (o próprio avaliador pode marcar erradamente o correto como errado ou deixar o errado passar).

Recomendação: Escreva um verificador, use código para recalcular cada total e cada relação cruzada, falha significa jogar “qual item, valor calculado, valor devido” direto de volta ao nó de geração. Isso ainda é um loop, forma igual à do laço de revisão, mas o nó dentro do loop é código puro, não um agente — esta é a disciplina de pontuação em camadas do Curso 10: use código para o que o código consegue decidir, entregue ao modelo apenas o que o código não consegue. Se você realmente quiser deixar um lugar para o modelo, deixe para partes que o código não decide, como “a narrativa textual do resumo condiz com os números?”.

**Cenário três: Não construa o loop primeiro, defina os critérios primeiro.**

O sinal um já não é atendido: o feedback dos três colegas se contradiz, o que significa que não há feedback consensual do tipo “melhora quando o humano fornece” — implemente o feedback de A e B fica mais insatisfeito. O sinal dois menos ainda, o modelo não consegue dar um feedback sobre o qual nem os humanos chegaram a consenso. A precondição “critérios de avaliação claros” simplesmente não se sustenta aqui.

Se você forçar a construção, vai obter com confiabilidade aquela falha previsível: o feedback do avaliador aponta direções diferentes a cada rodada, os nomes ficam em pingue-pongue entre prolixo e conciso, as rodadas se esgotam, o rascunho final não é melhor que o primeiro, e os três colegas continuam cada um com suas queixas — você apenas automatizou uma discussão inconclusiva enquanto pagava por cada rodada.

Recomendação: Faça as três pessoas primeiro sentarem e escreverem as regras de nomenclatura num checklist decidível (usar abreviações ou não, verbo primeiro ou substantivo primeiro, no máximo quantas palavras, a documentação usa qual pessoa). Uma vez que o checklist exista, o sinal um e o sinal dois vão ambos se sustentar, aí volte para construir o loop, e a maior parte das condições já poderá ser decidida definitivamente num gate. **A lição real deste cenário: laços de revisão não produzem critérios, apenas executam critérios.**

<!-- hint -->

Antes de julgar, faça uma coisa primeiro: escreva literalmente “o feedback que um humano daria”. Olhe com o que ele se parece depois de escrito — se parece uma afirmação que pode ser verdadeira/falsa na hora (“esta seção está sem o número do chamado”), provavelmente deveria ir para o código; se parece um julgamento que exige gosto (“o tom está brando demais”), então é a vez do avaliador.

<!-- hint -->

Se algum cenário travar você, tente interpretar o papel do avaliador: disponha a entrada que você tem, veja se você mesmo consegue escrever uma declaração de feedback clara e específica para o redator. Se você não consegue escrever, o modelo provavelmente também não — isso não é problema do modelo, é problema dos critérios.

<!-- /exercises -->

## Recapitulação

- Revisar-e-refinar é uma chamada de LLM gerando uma resposta enquanto outra fornece avaliação e feedback em um loop[^S1]; sua forma de produto é “rodar um verificador, corrigir o que falhou, repetir até passar ou parar de progredir”[^S5], e a revisão cruzada adversarial é outro uso da mesma divisão de trabalho (revisão cruzada única, sem aresta de retorno), sendo a categorização desta lição agrupá-la no laço de revisão[^S5]. O Curso 6 desta série a chama de produtor-revisor, que é nosso vocabulário didático, e o vocabulário primário é evaluator-optimizer[^S1].
- Valer a pena construir depende de dois sinais: as respostas do LLM podem ser comprovadamente melhoradas quando um humano articula seu feedback, e o LLM também consegue fornecer esse feedback; é particularmente eficaz quando os critérios de avaliação são claros e o refinamento iterativo entrega valor mensurável[^S1]. Quando os critérios não são claros, defina os critérios primeiro, não construa o loop primeiro.
- Condições de parada não são de um tipo só: condições de parada como número máximo de iterações são usadas para manter o controle[^S1], e “nenhum progresso adicional” é outro mecanismo de parada mais econômico[^S5]; três desfechos (passou / rodadas esgotadas / sem progresso) mapeiam para três ações distintas a jusante, não colapse num booleano. Gates determinísticos vêm antes dos avaliadores.
- Cinco padrões podem ser compostos: estes blocos de construção não são prescritivos, são padrões comuns que desenvolvedores podem moldar e combinar para se ajustar a casos de uso diferentes, e a chave para o sucesso é medir desempenho e iterar sobre as implementações[^S1].
- “Grafo / nós / arestas” é o sistema visual próprio desta lição, não terminologia oficial; sua âncora primária é apenas uma frase — o próprio script do fluxo de trabalho guarda o loop, as ramificações e os resultados intermediários, enquanto o contexto do modelo guarda apenas a resposta final[^S5], mais os resultados intermediários permanecem em variáveis do script[^S5]. Ao usar esse vocabulário na sua própria documentação, inclua esta declaração junto.
- Os benefícios da composição estão documentados: o runtime rastreia o resultado de cada agente conforme a execução avança, e é isso que torna uma execução retomável dentro da mesma sessão[^S5]; um fluxo de trabalho que distribui o trabalho entre muitos agentes pequenos preserva mais progresso do que um agente longo[^S5]; mover o plano para o código também permite que um fluxo de trabalho aplique técnicas de qualidade repetíveis (revisão cruzada adversarial, esboçar de múltiplos ângulos e então pesar)[^S5]; salvaguardas determinísticas (lógica de retentativa e checkpoints regulares) envolvem agentes não determinísticos[^S2].
- As restrições são igualmente claras: você deveria considerar adicionar complexidade apenas quando isso comprovadamente melhorar os resultados[^S1]; retentativa e timeout no nível do nó são prática ordinária de engenharia, e as fontes primárias oferecem apenas uma oração subordinada[^S2]; a profundidade também é limitada, e a referência em nível de produto é que subagentes aninham até três camadas abaixo da conversa principal[^S4]; solução mais simples primeiro[^S1].

[>> Lição 6: Mão na massa: elevando seu harness a um pequeno grafo](./06-build-a-graph.md)
