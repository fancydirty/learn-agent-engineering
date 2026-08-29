# Lição 5: Conjuntos de avaliação: comece com 20 tarefas reais

> Objetivos de aprendizado:
> - Explicar por que “esperar até termos centenas de casos” está errado, e por que as mudanças da fase inicial têm efeitos grandes o bastante para que poucos casos distingam versões
> - Projetar um lote de casos de eval seguindo estes princípios: ancorados no uso real, complementados com casos extremos, correção automatizada sempre que possível, volume acima da qualidade caso a caso, e inclusão deliberada de casos ambíguos — cada um emparelhado com um resultado verificável
> - Usar conjuntos held-out para impedir o overfitting de prompts em “modelos que só passam nestas perguntas específicas”, e identificar quais problemas os evals automatizados não conseguem ver e precisam ser pegos por teste manual
>
> Pré-requisitos: Lições 1–4 (“parece pronto” ≠ pronto, alvos de verificação com estado final primeiro, verificadores determinísticos, juízes LLM) | Anterior: [<< Lição 4](./04-llm-as-judge.md) | Próxima: [Lição 6 >>](./06-build-eval-harness.md)

## Um motivo de adiamento especialmente comum

Você provavelmente já viu esta cena. Alguém levanta a ideia: “deveríamos construir um conjunto de avaliação para o nosso agente”. Outra pessoa responde: “um conjunto de avaliação precisa de centenas de casos para ter significância estatística, não é? Rodar dez ou vinte casos produz notas sem sentido, que mais confundem do que informam. Vamos primeiro coletar casos reais de usuários e construir o conjunto quando tivermos o suficiente”.

Soa profissional. Disciplinado. Aí passam seis meses, os casos continuam num documento compartilhado, o prompt já foi revisado trinta vezes, e ninguém sabe dizer se alguma dessas revisões foi melhora ou regressão.

O postmortem de engenharia da Anthropic sobre seu sistema de pesquisa multiagente aponta essa desculpa diretamente: eles ouvem com frequência que times de desenvolvimento de IA adiam a criação de evals porque acreditam que só evals grandes, com centenas de casos de teste, são úteis, quando na verdade o melhor é começar imediatamente com testes de pequena escala e alguns poucos exemplos, em vez de adiar[^S2].

Esta lição esclarece exatamente isso: por que conjuntos pequenos genuinamente funcionam no começo, como um caso deve ser, como selecionar esses casos, e como impedir que você “afine o agente até virar especialista nestas perguntas específicas e em nada mais”.

## Tamanho de efeito: por que poucos casos bastam para enxergar diferenças no começo

Comece por um termo. **Tamanho de efeito** se refere ao tamanho da distância produzida por uma mudança — é um deslocamento de 71,2% para 72,4%, ou um salto de 30% para 80%? Distâncias maiores exigem menos amostras; distâncias menores exigem mais. Isso não tem nada de místico, é o mesmo bom senso que você usa ao julgar qual de dois copos d'água está mais quente: uma diferença de 30 graus é óbvia ao toque, uma diferença de meio grau exige termômetro.

O começo do desenvolvimento de um agente pertence à primeira categoria. O postmortem oficial diz isso sem rodeios: no início do desenvolvimento de agentes, as mudanças tendem a ter impactos dramáticos porque há fruta madura em abundância ao alcance da mão; um ajuste de prompt pode elevar taxas de sucesso de 30% para 80%, e com efeitos desse tamanho você consegue enxergar mudanças com apenas alguns casos de teste[^S2].

Imagine este cenário: você tem 6 casos, 2 passam antes da mudança, 5 passam depois. Você precisa de um valor-p? Não. O que você precisa é congelar esta versão do prompt e ir procurar a próxima melhora de 30% para 80%.

A escala com que eles começaram também não tem mistério — um conjunto de cerca de 20 consultas representando padrões reais de uso[^S2]. Vinte não é um limiar mágico, é só uma quantidade que você termina numa tarde e começa a usar no mesmo dia.

O inverso também vale: quando o seu agente já está em 80% e as mudanças restantes movem o ponteiro em um ou dois pontos, poucos casos genuinamente não conseguem distingui-las. Nesse ponto você precisa de mais casos — mas aí você já tem um conjunto de avaliação em funcionamento, e expandi-lo é muito mais fácil do que construí-lo do zero. **Consiga a régua primeiro, depois converse sobre precisão; não espere a régua ficar precisa para começar a medir.**

## Composição mínima de um caso de eval

Um conjunto de avaliação não é “uma pilha de prompts”. Uma pilha de prompts só permite olhar as saídas no olho, o que fica tedioso depois de duas leituras e autoenganoso depois de três.

O artigo de engenharia de ferramentas é direto: cada prompt de avaliação deve vir emparelhado com uma resposta ou resultado verificável; o seu verificador pode ser tão simples quanto uma comparação exata de strings entre a verdade de referência e as respostas amostradas, ou tão avançado quanto recrutar o Claude para julgar a resposta[^S3]. Isso conecta diretamente com os critérios de sucesso da Lição 2, os verificadores determinísticos da Lição 3 e os juízes LLM da Lição 4 — aquelas lições ensinaram você a verificar, esta lição ensina o que verificar.

Então um caso utilizável precisa de pelo menos três componentes escritos com clareza:

```text
prompt   : Entrada para o agente (escreva do jeito que um usuário falaria)
expected : Um resultado verificável (estado final, string, mudança de estado ou rubrica)
verifier : Quem julga — verificador determinístico ou juiz LLM
```

Estruturado como dado, fica assim:

```json
{
  "id": "cs-003-address-change-after-ship",
  "prompt": "Dá para mudar o endereço do meu pedido? Pedido SO-88213, eu me mudei.",
  "expected": {
    "mustCallTools": ["getOrder"],
    "mustContain": ["já foi enviado"],
    "mustNotContain": ["alterei para você"]
  },
  "verifier": "deterministic"
}
```

O campo `expected` aqui descreve estados finais e evidência observável, não “a sequência que o agente deveria percorrer pensando”. A conclusão da Lição 2 continua valendo: para o mesmo objetivo, o agente pode tomar vários caminhos válidos, então não fixe o caminho no código. O artigo de engenharia de ferramentas também lembra que você pode opcionalmente especificar as ferramentas que espera que um agente chame, para medir se os agentes captam a finalidade de cada ferramenta, mas, como pode haver múltiplos caminhos válidos, evite superespecificar ou fazer overfitting em estratégias[^S3].

O campo `mustCallTools` pode lembrar você do `expectedTools` da Lição 2. A relação entre os dois vale ser fixada. **Asserções negativas** (`mustNotContain`, `mustNotCallTools` — não diga “alterei para você”, não chute um número de pedido e consulte) são essencialmente proteções de estado final, descrevendo “coisas que não deveriam acontecer não aconteceram”, e podem ser impostas com rigor. **Asserções positivas de ferramenta** (precisa ter chamado determinada ferramenta) são as asserções de trajetória da Lição 2, e aquelas três disciplinas se aplicam sem mudança: afirme apenas pertencimento a conjunto, liste apenas uma ou duas ferramentas com que você genuinamente se importa, e, se a asserção falhar mas o estado final passar, registre uma observação em vez de reprovar o caso imediatamente. Ela só endurece num cenário: **a informação-chave da resposta só pode vir do valor de retorno daquela ferramenta**. O caso cs-003 é exatamente desse tipo — o julgamento “já foi enviado” só pode vir do `getOrder`, então, se a ferramenta não foi chamada, essa afirmação é inventada, o que torna esta asserção positiva imponível. Na dúvida, trate como leve.

Mais uma observação: este caso tem `mustNotContain` listando “alterei para você” — isso protege contra o agente concordar verbalmente em mudar o endereço enquanto na prática não faz nada. Essa “conclusão verbal” é precisamente o tema da Lição 1.

## Cinco regras para projetar conjuntos de avaliação

As cinco regras abaixo combinam os princípios de projeto da documentação “Test and Evaluate” da plataforma Claude com as práticas do artigo de engenharia de ferramentas em uma única lista de conferência — as citações após cada regra indicam a fonte dela.

**Um: ancore no uso real.** Gere muitas tarefas de avaliação, ancoradas em usos do mundo real[^S3]; projete evals que espelhem a sua distribuição real de tarefas[^S5]. O critério é direto: se este prompt não foi copiado de logs reais, você consegue apontar para ele e dizer “três usuários perguntaram exatamente isso na semana passada”? Se não, provavelmente é algo que você imaginou sentado na sua mesa.

**Dois: não deixe passar os casos extremos.** A documentação oficial emenda no “espelhe a sua distribuição real de tarefas” um lembrete imediato: não esqueça de levar em conta os casos extremos[^S5]. A distribuição real é o corpo, os casos extremos são o seguro. Um conjunto de avaliação composto inteiramente de casos extremos vai enganar você — você vai passar um mês corrigindo um problema que aparece duas vezes por mês.

**Três: automatize a correção sempre que possível.** Estruture as perguntas de forma a permitir correção automatizada, por exemplo múltipla escolha, casamento de string, corrigida por código, corrigida por LLM[^S5]. Isso determina se o seu conjunto de avaliação pode ser rodado repetidamente. Casos que exigem cinco minutos de leitura para julgar aprovado/reprovado — depois de escrever dez desses, você nunca mais vai querer rodá-los uma segunda vez.

**Quatro: priorize volume sobre qualidade.** Nas palavras oficiais: mais perguntas com correção automatizada de sinal um pouco mais fraco é melhor do que menos perguntas com evals de alta qualidade corrigidos à mão por humanos[^S5]. Este é o mais contraintuitivo e também o que mais economiza tempo — gaste seu tempo escrevendo mais dez casos, não polindo até a perfeição os critérios de correção de um caso.

**Cinco: colete deliberadamente casos ambíguos.** A documentação lista explicitamente um tipo de caso de teste que vale a pena incluir: casos de teste ambíguos em que mesmo humanos teriam dificuldade de chegar a um consenso de avaliação[^S5]. Eles não servem para elevar notas, servem para trazer discordâncias à tona. Quando o seu agente fica em cima do muro nesses casos, é sinal de que as próprias regras de produto não estão resolvidas, o que é algo que produto precisa decidir, não algo que engenharia de prompt conserta.

Mais um ponto que não é “princípio de projeto” mas é igualmente crítico: não deixe o ambiente de eval simples demais. O artigo de engenharia de ferramentas recomenda evitar ambientes de “sandbox” simplistas ou superficiais demais, que não estressam as suas ferramentas com complexidade suficiente; tarefas de avaliação fortes podem exigir múltiplas chamadas de ferramenta, potencialmente dezenas[^S3]. Uma pergunta respondível com uma única consulta ao banco não vai revelar se o seu agente perde o contexto na sétima chamada de ferramenta.

```agentmentor-check
{
  "id": "vq-zh-05-wait-for-hundreds",
  "label": "Que tamanho um conjunto de avaliação precisa ter para valer a pena construir?",
  "prompt": "O time está discutindo se constrói um conjunto de avaliação agora. Alguém diz: “qualquer coisa abaixo de cem casos não tem significância estatística; as notas que a gente tiraria seriam ruído puro. Vamos esperar o produto estabilizar e termos coletado casos reais suficientes”. Você é a pessoa que mais entende de verificação. Como você deve responder?",
  "whyHere": "Este é o motivo mais comum e mais plausível para adiar evals. O postmortem oficial o refuta especificamente, com um raciocínio ligado diretamente ao conceito de tamanho de efeito — verificar isso depois das regras de projeto garante que você leve embora o critério de julgamento, não apenas um slogan.",
  "mode": "single",
  "choices": [
    {
      "id": "a",
      "text": "Construa agora, começando com cerca de 20 tarefas que representem o uso real. As mudanças da fase inicial têm tamanhos de efeito enormes — um único ajuste de prompt pode elevar taxas de sucesso de 30% para 80% — e diferenças dessa magnitude são visíveis com apenas alguns casos, sem precisar esperar centenas.",
      "correct": true,
      "feedback": "Correto. O postmortem oficial aponta diretamente essa desculpa de adiamento: times frequentemente adiam a criação de evals porque acreditam que só evals grandes, com centenas de casos, são úteis, quando na verdade o melhor é começar imediatamente com testes de pequena escala e alguns poucos exemplos; eles próprios começaram com um conjunto de cerca de 20 consultas representando o uso real. O raciocínio é o tamanho de efeito: mudanças iniciais podem elevar taxas de sucesso de 30% para 80%, e uma distância dessas é distinguível com apenas alguns casos."
    },
    {
      "id": "b",
      "text": "Eles têm razão — esperar o produto estabilizar é de fato mais eficiente. Construir um conjunto de avaliação enquanto o produto ainda muda significa que os casos ficam obsoletos rápido; esperar as interfaces e os fluxos travarem torna mais vantajoso construir tudo de uma vez.",
      "correct": false,
      "feedback": "Esse raciocínio inverte a sequência. A fase em que o produto está mudando é exatamente quando cada mudança tem o maior tamanho de efeito e mais vale a pena medir; esperar até estar “estável” significa que você já fez dezenas de revisões sem régua nenhuma, e não sabe dizer qual foi melhor. Casos ficarem obsoletos é real, mas o custo de reescrever alguns casos é muito menor do que o custo de seis meses sem medição."
    },
    {
      "id": "c",
      "text": "Meio-termo: construa 5 casos por gesto, coloque no repositório para mostrar que temos evals, mas não rode de verdade nem tome decisões com base nas notas — deixe o eval de verdade para depois.",
      "correct": false,
      "feedback": "Isso paga o custo de construir evals sem obter nenhum dos benefícios. O valor de um conjunto de avaliação vem de rodá-lo de fato depois de cada mudança e de olhar de fato para as notas. Casos que ficam parados sem uso não oferecem nem valor de lembrete. Ou você constrói um lote que vai rodar, julgar e deixar influenciar de fato as suas decisões, ou reconhece honestamente que não vai fazer isso agora — a pior opção é o estado intermediário."
    }
  ]
}
```

## Conjuntos held-out: não afine o seu prompt até ele ficar “bom só nestas perguntas específicas”

Suponha que você tenha construído com disciplina 20 casos e começado a afinar prompts. A primeira versão passa 8 casos, uma revisão passa 12, outra passa 16, outra passa 19. Ótimo.

O problema: quanto desses 19 vem do agente genuinamente ficando mais forte, e quanto vem de você embutir silenciosamente as características destas 20 perguntas dentro do prompt? Por exemplo, você percebe que o caso 7 vive falhando, então acrescenta uma linha ao system prompt: “para questões de devolução, priorize citar a política de 7 dias sem perguntas” — o caso 7 passa, mas o que você de fato fez foi escrever a resposta daquela pergunta.

Esse fenômeno se chama **overfitting**: o modelo (ou, neste contexto, toda a configuração de prompt mais ferramentas) aprende as características do material de treino em vez das regularidades da própria tarefa.

O remédio do artigo de engenharia de ferramentas cabe em uma frase, mas é crítico: eles se apoiaram em conjuntos de teste held-out para garantir que não estavam fazendo overfitting nas avaliações de “treino”[^S3].

Um **conjunto held-out** é um lote de casos separado desde o início, que você não olha, não roda, não toca durante o ajuste do dia a dia. Todo o valor dele vem de “não estar contaminado”. Algumas disciplinas que vale a pena codificar em acordos de time:

- **Rode apenas em marcos.** O ajuste diário de prompt roda só o conjunto de desenvolvimento (as avaliações de “treino” da citação anterior — esta lição o chama de conjunto dev, registrado como `dev` no campo JSON); rode o conjunto held-out apenas antes de um release ou depois de mudanças estruturais (troca de modelo, reescrita de descrições de ferramenta, alteração do loop do harness).
- **Olhe apenas os agregados.** Confira a taxa de aprovação geral e os IDs dos casos que falharam, não abra a transcrição completa de cada caso held-out reprovado para depurá-los um a um. No momento em que você modifica um prompt para consertar um caso held-out específico, aquele caso já virou parte do conjunto dev.
- **Aposente se contaminar.** Se você genuinamente rasgou alguns casos held-out enquanto depurava um problema, funda-os no conjunto dev e reponha com um lote novo de casos held-out. O conjunto held-out é consumível, não é herança de família.
- **Documente quem pode acessá-lo.** Times pequenos costumam pular isso. Combinar que “as rodadas do conjunto held-out são executadas por uma pessoa antes dos releases, e os resultados são postados no canal como uma única linha de nota” é muito mais eficaz do que promessas verbais de “todo mundo se comporte”.

Vale mencionar uma prática comum de engenharia: pendurar os evals na CI para que cada commit rode o conjunto dev automaticamente, compare as notas com a versão anterior e bloqueie se a nota cair. Isso é prática padrão de engenharia, a orquestração depende do seu pipeline, e este curso não vai se estender nisso — a Lição 6 vai construir “a trilha de eval que roda de verdade”, e se você a conecta à CI é escolha sua.

## O que os evals automatizados não veem, humanos pegam

Uma vez que o conjunto de avaliação está construído, rodando e com boas notas, dá para remover o teste humano?

Não. O postmortem oficial é explícito: mesmo num mundo de avaliações automatizadas, o teste manual continua essencial[^S2]. A razão é que pessoas testando agentes encontram casos extremos que os evals deixam passar — incluindo respostas alucinadas em consultas incomuns, falhas de sistema ou vieses sutis de seleção de fontes[^S2].

A terceira categoria merece menção especial por ser tão típica. Os testadores humanos deles notaram: os primeiros agentes escolhiam consistentemente fazendas de conteúdo otimizadas para SEO em vez de fontes autoritativas porém pior ranqueadas, como PDFs acadêmicos ou blogs pessoais[^S2].

Pare e considere como esse viés se parece. Cada instância individual parece bem — o agente dá uma resposta citada, com fontes, de aparência plausível. A checagem de fatos passa, o formato de citação passa, a completude passa, e nenhuma das suas dimensões de pontuação pega problema algum (a menos que a sua rubrica por acaso inclua a dimensão “qualidade das fontes” da Lição 4 e os critérios dela sejam afiados o bastante). Mas olhar cem saídas juntas revela o padrão: ele está sistematicamente escolhendo o tipo de conteúdo mais fácil de achar.

O seu conjunto de avaliação não consegue ver essa classe de padrão de antemão, porque o conjunto de avaliação é escrito com base nos modos de falha que você **já conhece** — modos em que você não pensou naturalmente não têm casos protegendo contra eles. O teste manual não substitui os evals, ele **abastece com entradas novas** o conjunto de avaliação: toda vez que você descobre um padrão desses, codifique-o num caso para que ele seja conferido automaticamente da próxima vez.

Outra classe pertence naturalmente ao conjunto de avaliação: **comportamentos que a documentação diz explicitamente que “não são garantidos”.** A documentação de uso de ferramentas oferece um bom exemplo — se o prompt do usuário não inclui informação suficiente para preencher todos os parâmetros obrigatórios de uma ferramenta, o Claude Opus é muito mais propenso a reconhecer que um parâmetro está faltando e pedi-lo; mas a documentação esclarece logo em seguida que esse comportamento não é garantido, especialmente para prompts mais ambíguos e para modelos menos capazes[^S6].

“Muito mais propenso” e “não é garantido” são sinais: se isso se sustenta no seu cenário, você tem que testar por conta própria. Qualquer comportamento de que a sua lógica de produto dependa, mas que a documentação descreve apenas de forma probabilística, merece ser monitorado continuamente com alguns casos.

## O conjunto de avaliação é uma régua: consiga a régua primeiro, aí as mudanças importam

Juntando esta lição de novo.

A sequência do artigo de engenharia de ferramentas é: comece levantando um protótipo rápido das suas ferramentas e testando-as localmente, depois rode uma avaliação abrangente para medir as mudanças subsequentes[^S3]. Repare em “mudanças subsequentes” — o eval não serve para dar uma nota ao estado atual e dar o assunto por encerrado, o valor dele é **tornar mensuráveis todas as mudanças subsequentes**. Com ele, “esta versão do prompt é melhor” deixa de ser sensação e vira conclusão.

O artigo sobre construção de agentes vai além: como em qualquer funcionalidade com LLM, a chave para o sucesso é medir o desempenho e iterar sobre as implementações; repetindo — você só deve considerar acrescentar complexidade quando ela melhora os resultados de forma demonstrável[^S1].

Essa afirmação ganha peso quando lida com contexto. As técnicas que você aprendeu nos nove cursos anteriores — divisão de trabalho multiagente, sistemas de memória, compactação de contexto, recuperação por checkpoint — cada uma delas acrescenta complexidade. Sem um conjunto de avaliação, você não consegue responder “acrescentar isso realmente melhorou as coisas”, então só consegue acrescentar por instinto, e acrescentar por instinto significa que você continua acrescentando. O conjunto de avaliação é a evidência que permite **remover** um design sofisticado.

## Qual tamanho é grande o bastante: não existe resposta numérica

Por fim, uma palavra sobre proporções.

Vasculhei todas as fontes primárias que este curso cita, e nenhuma delas dá um limiar para “quantos casos tornam um conjunto de avaliação suficiente”. O que existe é uma escala de partida (cerca de 20 consultas reais) e uma diretriz de direção (priorize volume sobre qualidade caso a caso). Então não saia atrás desse número, e não confie em quem cita casualmente “no mínimo 50”.

O critério de verdade é o que esta lição abriu: **dado o tamanho de efeito das suas mudanças atuais, os seus casos existentes ainda conseguem distinguir entre elas?**

- Muda uma versão, a contagem de aprovados salta de 6 para 15 — suficiente, siga em frente.
- Muda uma versão, a contagem de aprovados oscila entre 17 e 18, e rodar duas vezes dá resultados diferentes — insuficiente agora, hora de acrescentar casos ou reduzir o ruído do método de correção (revisite a consistência do juiz na Lição 4).
- As duas abordagens que você quer comparar diferem em apenas um caso — isso não é uma pergunta de “qual é melhor”, é uma pergunta de “a sua régua não resolve essa diferença”.

A contagem de casos segue a necessidade de resolução, não algum número psicológico.

Quanto a como de fato rodar esse lote de casos — um loop por tarefa, como estratificar a correção, o que acompanhar além da taxa de aprovação — isso é a Lição 6. O que você precisa levar desta lição é o próprio lote de casos.

## 💻 Exercícios

<!-- exercises -->

### Nível 1: Rascunhar 10 casos de eval para um assistente de tickets de atendimento

Fixe um agente concreto: **assistente de tickets de atendimento**. O fluxo dele é — ler a mensagem do usuário → chamar ferramentas de consulta de pedido (`getOrder` devolve status do pedido, código de rastreio e se já foi enviado; `cancelOrder` cancela pedidos não enviados; `createEscalation` escala para um atendente humano) → redigir uma resposta.

Sua tarefa: rascunhe 10 casos de eval. Não precisa de código, uma tabela ou lista serve. Exigências de composição:

- Cerca de 7 casos cobrindo a distribuição real (o tipo de mensagem que o atendimento de fato recebe todo dia)
- 2 casos extremos
- 1 caso ambíguo “em que mesmo atendentes humanos teriam dificuldade de chegar a um consenso”

Para cada um, escreva com clareza os três componentes: resumo do prompt, resultado verificável, e qual tipo de verificador (determinístico / juiz / ambos).

<!-- hint -->
Dica 1: Não pense primeiro nos casos extremos, preencha primeiro os 7 casos de “distribuição real”. O método é se perguntar: se você puxasse os tickets de atendimento de um dia, quais seriam os sete tipos de pergunta mais frequentes? Rastrear entrega, política de devolução, mudar endereço, cancelar pedido, pedir nota fiscal… esse tipo de coisa. Depois de terminar, volte e veja quais podem ser julgados puramente com casamento de string.

<!-- hint -->
Dica 2: Para decidir de que tipo de verificador um caso precisa, olhe como é o resultado verificável dele. Se o resultado é “chamou determinada ferramenta / a resposta contém ou não contém determinada string / o status do pedido mudou para cancelado”, use um verificador determinístico; se o resultado é “o tom está adequado”, “os três pedidos foram atendidos”, “não prometeu descontos inexistentes”, você precisa de um juiz. Os dois não são mutuamente exclusivos — um caso pode passar por uma verificação determinística rígida e depois ir para um juiz dar uma nota leve.

<!-- rubric -->
Critérios de aprovação:

1. Exatamente 10 casos, composição atende às exigências: cerca de 7 de distribuição real, 2 extremos, 1 ambíguo; cada caso está claramente etiquetado com a categoria a que pertence.
2. Cada caso tem os três componentes: resumo do prompt, resultado verificável, tipo de verificador — nenhum pode faltar.
3. O “resultado verificável” declara um estado final ou evidência observável (chamadas de ferramenta, presença/ausência de string, mudança de estado do pedido, dimensões de rubrica), não uma descrição de processo do tipo “o agente deve pensar antes de responder”.
4. Pelo menos 5 casos podem ser julgados com verificadores determinísticos — demonstrando “automatize a correção sempre que possível”.
5. Os 2 casos extremos são situações genuinamente de baixa frequência mas realisticamente possíveis (como informação faltando, vários pedidos misturados), não pegadinhas puramente fabricadas.
6. O 1 caso ambíguo explica “onde está o ponto de discordância humana”, não apenas rotula “este é difícil”.
7. Entre os 7 casos de distribuição real, pelo menos um exige múltiplas chamadas de ferramenta, não só pergunta-e-resposta única.

<!-- answer -->
Resposta de referência (10 exemplos completos):

**Distribuição real (7 casos)**

| # | Resumo do prompt | Resultado verificável | Verificador |
|---|---|---|---|
| 1 | “Cadê o pedido SO-88101?” | Chamou `getOrder`; a resposta contém o código de rastreio daquele pedido e o texto do status atual | Determinístico (asserção de chamada de ferramenta + contenção de string) |
| 2 | “Como faço para devolver uma coisa?” (sem número de pedido) | A resposta contém os pontos-chave da política de devolução (prazo, embalagem original, responsabilidade pelo frete); **não** chamou `getOrder` | Determinístico (casamento de palavra-chave + asserção de ferramenta não chamada) |
| 3 | “Pedido SO-88213, eu me mudei, dá para mudar o endereço?” (pedido já enviado) | Chamou `getOrder`; a resposta declara o julgamento “já foi enviado” e oferece alternativas (recusar a entrega / falar com a transportadora para redirecionar); não pode conter “alterei para você” | Determinístico (verificações rígidas) + Juiz (adequação do tom) |
| 4 | “Aparece como entregue mas eu não recebi nada” | Chamou `getOrder` para confirmar o registro de entrega; chamou `createEscalation` para escalar ao humano; a resposta informa o escalonamento e o prazo aproximado | Determinístico (duas chamadas de ferramenta + mudança de estado) |
| 5 | “Onde eu pego a nota fiscal?” | A resposta contém com precisão o endereço do portal de notas e os itens de informação exigidos | Determinístico (contenção de string, a URL precisa bater byte a byte) |
| 6 | “Quero cancelar o SO-88190 que eu fiz semana passada” (pedido ainda não enviado) | Chamou `cancelOrder`; o estado final do pedido é cancelado; a resposta confirma o cancelamento e explica o prazo do estorno | Determinístico (chamada de ferramenta + asserção de estado final) |
| 7 | “Levando dois eu ganho desconto? Tem cupom?” | A resposta não pode prometer nenhum desconto ou cupom inexistente; deve encaminhar para a página de promoções vigentes | Juiz (se inventa ofertas, julgamento binário) |

O caso 4 exige pelo menos duas chamadas de ferramenta, satisfazendo “não teste só pergunta-e-resposta única”.

**Casos extremos (2 casos)**

| # | Resumo do prompt | Resultado verificável | Verificador |
|---|---|---|---|
| 8 | “Por que meu pedido não saiu do lugar ainda” (a mensagem inteira não tem número de pedido, data nem nome de produto) | A resposta contém uma frase interrogativa pedindo o número do pedido; **não** chamou `getOrder` (não pode chutar um número de pedido e consultar) | Determinístico (asserção de ferramenta não chamada + detecção de interrogativa) |
| 9 | Uma mensagem empacota três coisas: quer devolver um item + mudar o endereço de outro pedido + reclamar da atitude do atendente anterior | Os três pedidos são atendidos, nenhum é esquecido; devolução e mudança de endereço chegam cada um ao seu respectivo ramo de julgamento | Juiz (rubrica de completude: 3 itens pontuados um a um) + Determinístico (chamadas de ferramenta cobrem os dois pedidos) |

O caso 8 corresponde à afirmação da documentação oficial de que “o modelo vai pedir os parâmetros que faltam, mas isso não é garantido” — precisamente por não ser garantido, ele merece monitoramento contínuo.

**Caso ambíguo (1 caso)**

| # | Resumo do prompt | Resultado verificável | Verificador |
|---|---|---|---|
| 10 | O usuário está exaltado, o produto tem um defeito pequeno que não afeta o uso, a política não prevê indenização, o usuário é comprador recorrente de alta frequência e exige “indenização imediata” | Imponha apenas uma regra rígida: **não** pode prometer unilateralmente um valor específico de indenização nem qualquer indenização acima da alçada; todo o resto (emitir ou não um cupom pequeno de cortesia, escalar ou não direto para o humano, tom suave ou firme) vai para o juiz pontuar por rubrica, aceitando volatilidade na nota | Juiz principalmente + uma linha vermelha determinística |

Ponto de discordância humana: alguns atendentes vão emitir imediatamente um cupom pequeno de cortesia para esfriar a situação, outros vão seguir a política à risca, recusar e escalar a um supervisor. As duas abordagens têm praticantes e detratores em times reais. O valor deste caso não é melhorar a nota geral, é lembrar você de que a regra de produto “fronteira de alçada para indenização” ainda não está fechada — notas oscilando neste caso significam que você deveria ir pedir a produto que defina a regra, não continuar afinando o prompt.

### Nível 2: Projetar o formato de armazenamento e o esquema de divisão

Transforme os 10 casos do nível 1 em uma forma que um programa consiga ler, e planeje como dividi-los por finalidade. Não precisa rodá-los de fato (isso é a Lição 6).

Entregue três itens:

1. **Estrutura JSON**: defina os campos de cada caso — `id`, `prompt`, `expected` (ou uma referência a uma rubrica), tipo de verificador, `tags`. Forneça pelo menos 3 instâncias completamente preenchidas.
2. **Esquema de divisão**: divida os 10 casos entre uso no ajuste diário e conjunto held-out, e escreva as disciplinas de uso do conjunto held-out (com que frequência rodar, o que olhar, quem roda, sob que condições aposentar).
3. **Dois sinais de overfitting**: liste dois sinais específicos e observáveis indicando “já fizemos overfitting”.

<!-- hint -->
Dica 1: O campo `expected` esbarra num problema estrutural — casos determinísticos esperam “um conjunto de asserções verificáveis”, casos de juiz esperam “uma rubrica”, e os dois têm formatos diferentes. Não force os dois num campo só. Uma abordagem viável é deixar `expected` carregar apenas asserções determinísticas e abrir outro campo `rubricRef` apontando para um arquivo de rubrica; o campo `verifier` então passa a permitir `both`, significando que os dois portões precisam passar.

<!-- hint -->
Dica 2: Ao pensar nos sinais de overfitting, não pare em descrições como “as notas não são reais”, pergunte “o que especificamente eu veria num painel de monitoramento?”. Duas direções para cavar: uma é as trajetórias de nota dos dois conjuntos divergindo; a outra é o próprio prompt começando a conter conteúdo que só faz sentido para alguns casos específicos (palavras-chave fixas no código, números de pedido fixos, formulações fixas).

<!-- rubric -->
Critérios de aprovação:

1. A estrutura JSON inclui todos os campos exigidos: `id`, `prompt`, `expected` ou referência a rubrica, tipo de verificador, `tags`; fornece pelo menos 3 instâncias completamente preenchidas, e as instâncias correspondem aos casos do nível 1.
2. Trata adequadamente o problema de “expectativas determinísticas” e “expectativas de rubrica” terem formatos diferentes (campos separados, ou uma estrutura de união com `type`), sem forçar rubricas dentro de `expected`.
3. As `tags` têm uso prático, conseguem sustentar pelo menos um tipo de recorte de visualização (como ver taxas de aprovação pelas categorias `distribution` / `edge` / `ambiguous`, ou pelas ferramentas envolvidas).
4. O esquema de divisão especifica quais casos vão para o conjunto held-out e dá a justificativa da seleção; o conjunto held-out cobre casos de distribuição real, não é composto apenas de casos extremos/ambíguos (casos ambíguos já aceitam volatilidade de nota, não devem ocupar sinal de portão).
5. As disciplinas do conjunto held-out cobrem pelo menos quatro pontos: quando rodar, em que granularidade olhar os resultados, quem executa, como tratar a contaminação depois que ela acontece.
6. Os dois sinais de overfitting são **observáveis**, declarando “qual número acompanhar / qual texto ler”, não descrições abstratas.
7. Observa explicitamente que os seus números de divisão são apenas o arranjo deste exemplo, não um limiar universal.

<!-- answer -->
Resposta de referência:

**1. Estrutura JSON**

```json
{
  "version": 1,
  "agent": "cs-ticket-assistant",
  "cases": [
    {
      "id": "cs-001-track-order",
      "prompt": "Cadê o pedido SO-88101? Me ajuda a verificar, por favor.",
      "verifier": "deterministic",
      "expected": {
        "mustCallTools": ["getOrder"],
        "mustContain": ["SO-88101", "código de rastreio"],
        "mustNotContain": ["não foi possível consultar"]
      },
      "rubricRef": null,
      "tags": ["distribution", "logistics", "tool:getOrder", "single-turn"],
      "split": "dev"
    },
    {
      "id": "cs-008-missing-order-id",
      "prompt": "Por que meu pedido não saiu do lugar ainda, já faz vários dias esperando.",
      "verifier": "deterministic",
      "expected": {
        "mustNotCallTools": ["getOrder"],
        "mustMatch": ["(número do pedido|ID do pedido)", "[?？]"],
        "mustNotContain": ["consultei para você"]
      },
      "rubricRef": null,
      "tags": ["edge", "missing-parameter", "not-guaranteed-behavior"],
      "split": "holdout"
    },
    {
      "id": "cs-010-goodwill-compensation",
      "prompt": "O produto veio com o canto amassado, faz três anos que compro de vocês, isso aqui exige uma explicação, quero indenização agora!",
      "verifier": "both",
      "expected": {
        "mustNotMatch": ["(indeniz|reembols|ressarc)\\w*\\s*(você)?\\s*(em)?\\s*(R\\$)?\\s*\\d+([.,]\\d+)?\\s*(reais)?"]
      },
      "rubricRef": "rubrics/cs-tone-and-authority.md",
      "tags": ["ambiguous", "policy-boundary", "human-disagreement"],
      "split": "monitor"
    }
  ]
}
```

Explicação dos campos:

- `verifier` aceita `deterministic` / `judge` / `both`. Quando for `both`, rode primeiro as asserções determinísticas; se alguma falhar, reprove imediatamente sem desperdiçar uma chamada de juiz (como escrever essa orquestração em código, veja a trilha da Lição 6).
- `expected` carrega apenas asserções determinísticas; rubricas ficam em arquivos separados, apontadas por `rubricRef`. Assim as rubricas podem ser reusadas por vários casos, e mudar uma rubrica não exige mudar casos.
- `mustMatch` com múltiplos padrões de regex significa “todos precisam bater, mas a ordem entre eles não está travada” — os dois padrões do cs-008 só exigem que a resposta contenha “número do pedido/ID do pedido” e uma frase interrogativa, não importa qual palavra vem primeiro. Fixar a ordem das palavras no código (como exigir que “número do pedido” apareça antes de “por favor informe”) faria a resposta correta mais natural, “Você poderia me informar o número do pedido?”, ser reprovada, que é exatamente a armadilha do “verificador estrito demais” da Lição 3.
- A regex de linha vermelha `mustNotMatch` é escrita pelo **custo de deixar passar uma violação**: prefere-se escrever a classe larga (indenizar/indenização/reembolsar/ressarcir, todos os radicais contam), reportando a mais de vez em quando para revisão humana, a escrevê-la estreita e deixar passar um “indenizo você em 200 reais” de verdade. A direção de falha de uma linha vermelha é oposta à das asserções normais — ela prefere o falso positivo a deixar violações escaparem.
- `rubricRef` escreve explicitamente `null` para casos puramente determinísticos, distinguindo ausência de “não precisa de uma”.
- `split` aceita `dev` / `holdout` / `monitor`: `monitor` é para casos ambíguos — não conta para nenhuma taxa de aprovação, serve apenas para observar divergência (detalhado no “Esquema de divisão” abaixo).
- `tags` carregam pelo menos uma etiqueta de composição (`distribution` / `edge` / `ambiguous`) para ver taxas de aprovação por categoria; carregam também etiquetas de negócio e etiquetas com prefixo `tool:` para localizar “se todos os casos que envolvem getOrder falharam juntos”.

**2. Esquema de divisão**

Este exemplo divide os 10 casos em três porções: 6 para ajuste, 3 held-out, 1 para monitoramento de divergência. **Esta divisão é o arranjo deste exemplo, não um limiar universal**; os materiais públicos não dão resposta padrão para tamanho de conjunto de avaliação nem para proporções de divisão.

- **Conjunto dev (dev, 6 casos)**: #1, #2, #3, #5, #7, #9. O ajuste diário de prompt roda só este lote, quanto mais frequentemente melhor.
- **Conjunto held-out (holdout, 3 casos)**: #4, #6, #8 — dois casos de distribuição real (incluindo o #4, único caso com múltiplas chamadas de ferramenta) mais um caso extremo.
- **Monitoramento de divergência (monitor, 1 caso)**: #10. Este é o caso ambíguo “em que mesmo humanos têm dificuldade de chegar a consenso”, que já aceita volatilidade de nota e não conta para nenhuma taxa de aprovação; observe de forma independente como o julgamento dele oscila entre versões e, se oscilar muito, vá pedir a produto que resolva a regra.

Por que o conjunto held-out precisa atravessar a composição e precisa ter casos de distribuição real: o alvo número um do conjunto held-out é pegar “overfitting na distribuição real” — como escrever no system prompt “priorize citar a política de 7 dias sem perguntas” para fazer um certo caso de devolução passar. Um conjunto held-out composto inteiramente de casos extremos e ambíguos não pega isso, porque contém zero casos de distribuição real do tipo devolução/logística; e casos ambíguos não convergem por si só, então ocupar um terço do sinal de portão só distorce a leitura. Por outro lado, colocar o #4, um caso pesado de múltiplas chamadas de ferramenta, no conjunto held-out também protege contra regressões de “tarefas complexas sendo tratadas de forma simplista”.

Disciplinas de uso:

- **Quando rodar**: apenas em três situações — antes de um release, depois de trocar de modelo ou de versão de modelo, depois de mudanças estruturais no loop do harness ou nas descrições de ferramenta. O ajuste diário de prompt nunca o roda.
- **O que olhar**: olhe apenas a taxa de aprovação e os IDs dos casos reprovados. Não abra a transcrição completa dos casos reprovados, não analise as causas de falha caso a caso.
- **Quem roda**: executado pela pessoa responsável pelo release, com o resultado postado no canal do time, postando apenas uma linha do tipo “3 casos, 2 aprovados, reprovou cs-008”.
- **Tratamento pós-contaminação**: se depurar um problema de produção genuinamente exigiu abrir a transcrição de um caso held-out e modificar o prompt com base nela, mova aquele caso permanentemente para o conjunto dev (mude o campo `split`) e, ao mesmo tempo, reponha o conjunto held-out com um caso novo do mesmo tipo, vindo de tickets reais recentes. O conjunto held-out é consumível.

**3. Dois sinais de overfitting**

**Sinal um: as trajetórias de nota dos dois conjuntos divergem.** Toda vez que você rodar o conjunto held-out, registre também a nota do conjunto dev daquele dia. O estado saudável é os dois melhorando juntos; ver “o conjunto dev subiu de 4/6 para 6/6, o conjunto held-out caiu de 2/3 para 1/3 (ou ficou parado)” indica que as versões recentes do prompt aprenderam as características daquelas 6 perguntas, não a tarefa em si. O que acompanhar: as contagens de aprovados dos dois lados, registradas a cada release, com a direção divergindo continuamente sendo o alarme. Um ponto a esclarecer: um conjunto held-out de 3 casos só tem quatro leituras possíveis, 0/1/2/3, não consegue mostrar tendências finas do tipo “caiu alguns pontos percentuais”, e só é suficiente para responder “os últimos releases vêm regredindo de forma consistente” — para plotar uma curva percentual, primeiro expanda o conjunto held-out para dezenas de casos, e o quanto expandir continua seguindo a necessidade de resolução, não algum limiar numérico.

**Sinal dois: o prompt ganha conteúdo que só faz sentido para casos específicos.** A manifestação concreta é o system prompt ou as descrições de ferramenta começarem a conter coisas fixas no código — um número de pedido específico, a formulação exata do usuário em um caso, um ramo customizado do tipo “ao encontrar X responda Y”. Método de inspeção: leia o system prompt inteiro e, linha a linha, pergunte “se eu removesse esta linha, apenas um caso de eval falharia enquanto usuários reais não perceberiam nada?”. Toda linha cuja resposta for “sim” cresceu de overfitting. Complemente com uma versão quantificável: pegue um ticket real novo em folha, que nunca esteve em nenhum conjunto, e rode-o; se ele tiver desempenho significativamente abaixo da média do conjunto dev, a nota do conjunto dev não representa mais a capacidade real.

<!-- /exercises -->

## Recapitulação

- “Esperar até termos centenas de casos para construir um conjunto de avaliação” é a desculpa de adiamento mais comum, e o postmortem oficial a refuta diretamente: times frequentemente adiam a criação de evals porque acreditam que só evals grandes, com centenas de casos, são úteis, quando a abordagem certa é começar imediatamente com testes de pequena escala e alguns poucos exemplos[^S2].
- Conjuntos pequenos genuinamente funcionam no começo, e a base é o tamanho de efeito — um único ajuste de prompt pode elevar taxas de sucesso de 30% para 80%, e uma distância dessas é distinguível com apenas alguns casos; eles próprios começaram com um conjunto de cerca de 20 consultas representando padrões reais de uso[^S2].
- As tarefas de avaliação devem estar ancoradas em usos do mundo real[^S3], espelhar a sua distribuição real de tarefas e levar em conta os casos extremos[^S5]; ao mesmo tempo, evite ambientes de sandbox simplistas demais, já que tarefas de avaliação fortes podem exigir múltiplas chamadas de ferramenta, potencialmente dezenas[^S3].
- Estruture as perguntas de forma a permitir correção automatizada (múltipla escolha, casamento de string, corrigida por código, corrigida por LLM)[^S5], e priorize volume sobre qualidade — mais perguntas com correção automatizada de sinal um pouco mais fraco é melhor do que menos perguntas com evals de alta qualidade corrigidos à mão por humanos[^S5].
- Colete deliberadamente uma categoria de casos de teste ambíguos, em que mesmo humanos teriam dificuldade de chegar a um consenso de avaliação[^S5]: eles não servem para elevar notas, servem para trazer à tona discordâncias nas próprias regras de produto.
- Cada prompt de avaliação deve vir emparelhado com um resultado verificável, com verificadores que vão da comparação exata de strings até recrutar o Claude como juiz[^S3] — isso conecta diretamente com as lições 2, 3 e 4.
- Conjuntos de teste held-out impedem o overfitting, e apoiar-se neles garante que você não fez overfitting nas avaliações de “treino”[^S3]; as disciplinas centrais são não olhá-los diariamente, olhar apenas os agregados, e aposentá-los se contaminados.
- Os evals automatizados têm pontos cegos inerentes: pessoas testando agentes encontram casos extremos que os evals deixam passar, incluindo respostas alucinadas em consultas incomuns, falhas de sistema e vieses sutis de seleção de fontes[^S2]; o exemplo real é que os primeiros agentes escolhiam consistentemente fazendas de conteúdo otimizadas para SEO em vez de fontes autoritativas porém pior ranqueadas, como PDFs acadêmicos ou blogs pessoais[^S2]. Mesmo com evals automatizados, o teste manual continua essencial[^S2].
- Comportamentos que a documentação diz explicitamente que “não são garantidos” pertencem naturalmente ao conjunto de avaliação, como o modelo pedir espontaneamente os parâmetros obrigatórios que faltam — a documentação afirma que esse comportamento não é garantido, especialmente para prompts mais ambíguos e para modelos menos capazes[^S6].
- O valor do conjunto de avaliação é tornar mensuráveis todas as mudanças subsequentes: rode uma avaliação abrangente para medir as mudanças subsequentes[^S3]; o sucesso depende de medir o desempenho e iterar, e a complexidade só vale a pena ser acrescentada quando melhora os resultados de forma demonstrável[^S1].
- Nenhuma fonte primária dá um limiar numérico para “qual tamanho é grande o bastante”. O critério é: dado o tamanho de efeito das suas mudanças atuais, os seus casos existentes ainda conseguem distinguir entre elas? Quando você não consegue distinguir, é hora de expandir.

[>> Lição 6: Mão na massa: construa uma trilha de eval para o seu agente](./06-build-eval-harness.md)
