# Lição 4: LLM como juiz: rubricas, formatos e o que não deixar ele julgar

> Objetivos de aprendizado:
> - Escrever uma rubrica multidimensional para saídas em texto livre, deixar clara a pergunta de cada dimensão e entender que um único critério de sucesso muitas vezes precisa de várias rubricas para ser avaliado por inteiro
> - Apertar a saída do juiz até um formato que programas consigam tratar: primeiro o raciocínio, depois a nota, de 0.0 a 1.0 mais aprovado/reprovado, e explicar por que uma única chamada costuma ser mais estável do que vários juízes avaliando aspectos separados
> - Reconhecer três modos de falha dos juízes — corrigir o próprio trabalho, receber a ordem de achar problemas e por isso sempre achar, confiar apenas no autorrelato do agente — e apresentar mitigações acionáveis para cada um
>
> Pré-requisitos: Lições 1–3, com o entendimento da avaliação “estado final primeiro” e da prioridade dos verificadores determinísticos | Anterior: [<< Lição 3](./03-deterministic-checks.md) | Próxima: [Lição 5 >>](./05-eval-sets.md)

## Onde a Lição 3 encontra seu teto, e onde os juízes LLM se encaixam

Você passou uma tarefa ao seu agente de pesquisa: resumir como os subsídios domésticos para recarga de veículos elétricos mudaram nos últimos três anos e produzir um relatório de duas páginas. Ele rodou por quinze minutos, chamou ferramentas de busca, baixou PDFs, escreveu 1.800 palavras. A leitura é plausível.

Agora você quer verificar. Nenhuma das verificações determinísticas da Lição 3 se aplica aqui: não há suíte de testes para rodar, não há código de saída de build para ler, não há `golden_answer` para `output == golden_answer` porque você não consegue escrever um — coloque dois analistas humanos no mesmo relatório e eles não vão produzir textos idênticos.

Isso não é falta de imaginação. É assim que essas saídas são. Quando a Anthropic refletiu sobre seu sistema de pesquisa multiagente, foi direta: saídas de pesquisa são texto livre, raramente têm uma única resposta correta e por isso são difíceis de avaliar programaticamente — LLMs são um encaixe natural para corrigir saídas desse tipo[^S2].

Mas antes de jogar o relatório despreocupadamente para outro modelo e perguntar “o que achou disso”, entenda onde os juízes LLM ficam na ordenação oficial. O princípio para escolher um método de correção é "fastest, most reliable, most scalable" (o mais rápido, mais confiável e mais escalável)[^S5]: a correção por código é a mais rápida e mais confiável, escala muitíssimo bem, mas carece de nuance para julgamentos complexos que exigem menos rigidez baseada em regras[^S5]; a correção por LLM é rápida, flexível, escalável e adequada a julgamentos complexos — e a orientação oficial emparelha isso com um pré-requisito na mesma frase: teste primeiro para garantir a confiabilidade e só então escale[^S5]; a correção humana é a mais flexível e de maior qualidade, mas lenta e cara, então evite se possível[^S5].

Trate o pré-requisito daquela opção do meio como exigência rígida, não como ressalva. Um juiz LLM não é “uma verificação mais inteligente”, é uma chamada de modelo: ele pode errar, custa dinheiro e pode pontuar a mesma entrada de formas diferentes em execuções sucessivas. Seu valor é singular — ele alcança coisas que verificações determinísticas não alcançam.

Então esta lição não é sobre “como fazer um modelo pontuar sua saída”. Isso é trivial — qualquer prompt devolve um número. É sobre tornar esse número digno de confiança: como estruturar rubricas, como restringir a saída, quem roda o juiz, como ele quebra e quando você não deveria nem perguntar.

## Rubricas: quebrar “bom” em perguntas respondíveis separadamente

Rubrica soa formal. Em termos simples, é um boletim: quebre o vago “isto está bom” em perguntas específicas, responda cada uma separadamente, pontue cada uma separadamente.

Por que quebrar? Pergunte “este relatório está bom” e o modelo devolve elogio vago ou crítica vaga. Pergunte “toda afirmação do relatório aparece nas fontes citadas” e o modelo consegue conferir afirmação por afirmação. A maioria dos casos de uso precisa de avaliação multidimensional ao longo de vários critérios de sucesso[^S5].

O agente de pesquisa da Anthropic usou uma rubrica de cinco dimensões[^S2], cada dimensão atrás de um modo de falha real:

- **Precisão factual — as afirmações batem com as fontes?** O modelo diz “os subsídios caíram 30% em 2023”; o documento citado realmente contém esse número? Esta dimensão pega alucinação.
- **Precisão de citação — as fontes citadas batem com as afirmações?** Direção oposta à dimensão anterior; muita gente confunde as duas. A primeira pergunta “esta afirmação tem respaldo”, esta pergunta “o link anexado a esta frase realmente discute este assunto?”. Uma falha comum de agente: a afirmação está certa, mas vem etiquetada com uma fonte cujo título apenas pareceu relevante.
- **Completude — todos os aspectos pedidos foram cobertos?** Você disse “últimos três anos” e ele só escreveu sobre o ano passado; você disse “mudanças” e ele só escreveu o estado atual. Confira cada requisito, não avalie o quanto a prosa ficou bonita.
- **Qualidade das fontes — fontes primárias ou secundárias de baixa qualidade?** Esta dimensão pega os problemas mais sorrateiros. Os testadores humanos da Anthropic descobriram: os primeiros agentes escolhiam consistentemente fazendas de conteúdo otimizadas para SEO em vez de fontes autoritativas porém pior ranqueadas, como PDFs acadêmicos ou blogs pessoais[^S2]. A saída lê como perfeitamente normal, mas o alicerce está podre.
- **Eficiência de ferramentas — as ferramentas certas, um número razoável de chamadas?** Chegar à mesma resposta com três buscas ou com trinta difere em uma ordem de grandeza de custo. Esta dimensão avalia a economia do processo, não “ele seguiu as etapas que prescrevi” — isso não funciona, como a Lição 2 explicou.

Essas cinco dimensões são para tarefas de pesquisa. Tarefas diferentes precisam de conjuntos diferentes. O que dá para levar é o método de decomposição: comece de “se esta saída quebrar, como ela quebra”, derive as dimensões disso, um modo de falha por dimensão. E não deixe passar: um dado caso de uso, ou mesmo um critério de sucesso específico desse caso, pode exigir várias rubricas para uma avaliação holística[^S5]. Não espere que um único boletim cubra tudo.

## Formato de saída: uma chamada, uma nota, um aprovado/reprovado

**Primeiro, o formato do veredito.** A Anthropic testou vários juízes avaliando componentes diferentes — um juiz por componente. O resultado: uma única chamada de LLM com um único prompt, devolvendo notas de 0.0 a 1.0 e uma nota de aprovado/reprovado, foi o mais consistente e mais alinhado com julgamentos humanos[^S2].

Vale a ressalva justa: quebrar a avaliação em várias chamadas de LLM, cada chamada avaliando um aspecto, é em si um padrão de automação de evals que a orientação oficial já descreveu[^S1]. Nenhuma das duas abordagens está errada. A diferença é que “uma única chamada é melhor” vem da comparação que a Anthropic fez no próprio sistema real[^S2]. Abordagem recomendada: comece com uma única chamada e só divida se você tiver evidência de que dividir melhora a precisão.

**Em seguida, o quanto restringir a saída.** A orientação oficial para prompts de juiz é "empirical or specific" (empírica ou específica): por exemplo, instrua o LLM a devolver apenas 'correct' ou 'incorrect', ou a julgar numa escala de 1–5; avaliações puramente qualitativas são difíceis de apurar rapidamente e em escala[^S5]. Em termos simples: se o juiz devolve “qualidade geral aceitável, mas alguns detalhes tratados de forma um pouco tosca”, você não tem nada — não dá para tirar média de 200 respostas dessas, não dá para dizer se hoje está melhor que ontem, e você ainda tem que ler uma por uma. Então para que perguntar ao juiz?

**A técnica crítica: primeiro o raciocínio, depois a nota, e então descarte o raciocínio.** A orientação oficial afirma isso explicitamente: peça ao LLM que raciocine antes de produzir uma nota de avaliação e depois descarte o raciocínio — isso aumenta o desempenho da avaliação, particularmente em tarefas que exigem julgamento complexo[^S5]. “Descartar” não quer dizer não olhar. O raciocínio é o andaime do juiz — ele precisa escrever “a afirmação do parágrafo 3 mapeia para qual trecho da transcrição” antes de conseguir julgar com precisão. Mas esse texto não deve entrar nas suas estatísticas rio abaixo. O relatório quer notas e aprovado/reprovado; o raciocínio vai para os logs, esperando por você quando uma nota parecer suspeita.

**E as dimensões subjetivas?** Algumas dimensões não podem ser binárias, como “o tom deste relatório é apropriado para enviar a clientes?”. A orientação oficial oferece uma ferramenta: a escala Likert baseada em LLM, que usa um LLM para julgar atitudes ou percepções subjetivas[^S5] — uma escala Likert são aqueles formatos de questionário com incrementos fixos, do tipo “discordo totalmente / discordo / neutro / concordo / concordo totalmente” (a quantidade de pontos é convenção de desenho de pesquisa, não exigência oficial). O princípio central continua valendo: dê incrementos fixos, não deixe o juiz escrever livremente.

Juntando tudo, a saída do juiz fica mais ou menos assim (o exemplo mostra só as três primeiras dimensões; `source_quality` e `tool_efficiency` têm o mesmo formato e foram omitidas por brevidade). Os programas leem `score` e `verdict`; `reasoning` é persistido para revisão:

```json
{
  "factual_accuracy": { "reasoning": "A '30% reduction' do parágrafo 2 aparece literalmente na página 4 da fonte A; a 'suspensão de pagamentos em várias regiões' do parágrafo 4 não tem respaldo em nenhuma das três fontes.", "score": 0.5 },
  "citation_accuracy": { "reasoning": "4 das 5 citações batem com suas afirmações; o link da citação 3 leva a outro artigo do mesmo site.", "score": 0.8 },
  "completeness": { "reasoning": "A tarefa pedia os últimos três anos, o relatório cobre apenas 2024 e 2025.", "score": 0.6 },
  "verdict": "fail"
}
```

## Quem faz o trabalho não pode ser o juiz

Neste ponto aparece um atalho tentador: fazer o agente se corrigir no final. Ele é quem melhor sabe o que acabou de fazer.

Reprima essa tentação. Duas razões. **Primeiro, a experiência oficial**: implementar guardrails em que uma instância do modelo processa as consultas do usuário enquanto outra as filtra em busca de conteúdo ou pedidos inapropriados tende a funcionar melhor do que deixar a mesma chamada de LLM cuidar tanto dos guardrails quanto da resposta principal[^S1] — essa experiência descrevia originalmente moderação de conteúdo (uma instância responde, outra filtra), mas o princípio “não deixe a mesma chamada usar os dois chapéus” se aplica aqui. Repare que diz “mesma chamada” — o problema é contexto compartilhado, não inteligência insuficiente. **Segundo, o mecanismo**: a documentação oficial do Claude Code descreve uma prática em que um revisor rodando em um contexto novo de subagente vê apenas o diff e os critérios que você deu, não o raciocínio que produziu a mudança, e por isso avalia o resultado nos termos dele mesmo[^S4].

Leia de trás para frente para ver por que a autocorreção falha: a cadeia de raciocínio que produziu a saída ainda está pendurada no contexto. O modelo acabou de se convencer de que “escrever assim está correto”, você emenda logo em seguida com “isto está correto”, e ele provavelmente vai repetir o mesmo raciocínio. O que você recebe não é um julgamento independente, é autorrepetição.

**Se você está preocupado que o juiz seja brando ou rígido demais**, a orientação oficial oferece um botão de ajuste: avaliar se um dado conteúdo é inapropriado, com vários prompts avaliando aspectos diferentes ou exigindo limiares de voto diferentes para equilibrar falsos positivos e falsos negativos[^S1]. Num cenário de verificação, um falso positivo é “marcar como quebrado algo que está bem” — você vai ser torturado por alarmes falsos; um falso negativo é “deixar passar algo quebrado” — trabalho ruim vai para produção. Três juízes em que dois precisam dizer reprovado para valer como reprovado é mais brando do que um juiz cujo reprovado já vale — qual configuração você escolhe depende de qual tipo de erro custa mais no seu cenário.

```agentmentor-check
{
  "id": "vq-zh-04-self-grading",
  "label": "Pense bem",
  "prompt": "Um colega propõe: fazer o agente se corrigir no final e incluir a nota no relatório final. O raciocínio dele é que o agente entende melhor o contexto da tarefa e por isso vai julgar com mais precisão, além de economizar uma chamada de modelo. Como você responde?",
  "whyHere": "Esta seção acabou de cobrir “separar quem faz de quem guarda o portão”. Aqui se verifica se você trata “economizar uma chamada” como justificativa aceitável, e se rejeitar a autocorreção te faz saltar até “só se pode usar revisão humana”.",
  "mode": "single",
  "choices": [
    {
      "id": "a",
      "text": "Economizar a chamada faz sentido, deixe ele se corrigir. Basta acrescentar uma linha no prompt do tipo “por favor seja honesto, não proteja o próprio trabalho”, escrever os critérios com clareza, e o problema está resolvido.",
      "correct": false,
      "feedback": "“Por favor seja honesto” não muda a posição dele. A cadeia de raciocínio que produziu essa saída continua no mesmo contexto. O modelo acabou de se convencer de que “isto está correto”; perguntar logo em seguida “está correto” provavelmente devolve uma repetição da mesma justificativa, não um julgamento independente. A prática oficial é separar os papéis: uma instância do modelo faz o trabalho, outra filtra — isso tende a funcionar melhor do que a mesma chamada usando os dois chapéus."
    },
    {
      "id": "b",
      "text": "A autocorreção está errada. Entregue a avaliação a um revisor em contexto novo — ele só vê a saída e os critérios que você deu, não consegue ver o raciocínio que produziu a saída, e por isso julga o resultado em si. A chamada economizada não vale tanto quanto um julgamento independente.",
      "correct": true,
      "feedback": "Correto. A diferença decisiva não é capacidade do modelo, é contexto: um revisor em contexto novo não tem acesso à justificativa de “por que escrevemos assim”, ele só consegue falar do resultado contra os critérios. Isso também explica por que prompts de juiz precisam dos requisitos completos da tarefa e da rubrica colados dentro — ele não tem o pano de fundo que você imagina que ele tem."
    },
    {
      "id": "c",
      "text": "A autocorreção definitivamente não funciona, então esse tipo de saída em texto livre só pode usar revisão humana. Juízes LLM não são confiáveis nesse cenário.",
      "correct": false,
      "feedback": "A primeira metade está correta, a segunda salta longe demais. A correção humana é a mais flexível e de maior qualidade, mas lenta e cara; a orientação oficial é evitá-la se possível. O problema dos juízes LLM não é “não dá para usar”, é que você precisa de uma instância diferente com contexto limpo para rodá-lo, e precisa validar que ele é confiável antes de escalar. A autocorreção falha especificamente por causa do contexto compartilhado, não porque juízes LLM sejam intrinsecamente pouco confiáveis."
    }
  ]
}
```

## Como os juízes quebram

Você já trocou para uma instância diferente, já escreveu uma rubrica, e o juiz ainda quebra. Ele quebra de maneiras previsíveis.

**Um: revisores mandados achar problemas sempre vão achar problemas.** O mais contraintuitivo, o mais caro. A documentação oficial é clara: um revisor instruído a encontrar lacunas normalmente vai reportar algumas, mesmo quando o trabalho está sólido, porque foi isso que se pediu a ele[^S4]. A consequência não é só “algumas sugestões inúteis”: a mesma passagem observa que perseguir cada achado leva a superengenharia — camadas extras de abstração, código defensivo e testes para casos que não podem acontecer[^S4]. Seu agente entra num loop de autoescalada: o revisor sugere três coisas, você corrige, a nova revisão sugere mais três, o código engorda, os problemas reais continuam sem solução.

Você provavelmente já viu esses relatórios: “sugiro acrescentar defesa contra string vazia em `parseDate`” — mas o passo anterior já garante que não é vazia; “sugiro extrair estas três constantes para configuração” — mas elas não mudam há três anos; “sugiro acrescentar testes de retry para timeout de rede” — mas este caminho não faz chamadas de rede. Nenhuma das três está errada, nenhuma das três vale a pena, mas misturadas num relatório de revisão elas parecem idênticas a problemas reais.

A orientação oficial fornece a mitigação: diga ao revisor para sinalizar apenas lacunas que afetam a correção ou os requisitos declarados, e trate o resto como opcional[^S4]. Escreva isso literalmente no prompt do juiz e dê às “outras sugestões” um lugar para ir — acrescente um campo `optional_notes` e declare explicitamente que ele não participa da pontuação. Ter onde escrever significa não precisar espremer preferências de estilo dentro de justificativas de desconto.

**Dois: o autorrelato do agente não é evidência.** Muita gente toma um atalho e alimenta o juiz só com o resumo final do agente: “recuperei três fontes autoritativas e fiz verificação cruzada antes de confirmar a taxa do subsídio”. O juiz lê, acha que o processo soa sólido, dá nota alta. Mas essa afirmação não é evidência. A orientação oficial sobre avaliação de ferramentas faz o ponto: o que os agentes omitem em seus retornos e respostas costuma ser mais importante do que o que eles incluem — LLMs nem sempre dizem o que querem dizer[^S3]. Ele diz “verifiquei três fontes de forma cruzada”, mas talvez tenha chamado a busca só uma vez; o retry que falhou e ele não menciona, o momento em que recebeu resultados vazios e continuou inventando, é justamente o que você mais precisa ver. A solução também é direta: revise as transcrições brutas (incluindo chamadas de ferramenta e respostas de ferramenta) para pegar qualquer comportamento não descrito explicitamente na cadeia de raciocínio do agente[^S3]. Traduzindo para uma solução: **a entrada do juiz precisa incluir logs brutos, não só o autorrelato.** A dimensão “eficiência de ferramentas” precisa disso em especial — ela avalia o número real de chamadas e se as chamadas estavam corretas; essa informação só existe nos logs.

**Três: a própria pergunta é ambígua.** A rigor isso não é o juiz quebrando, é você tendo dado a ele uma pergunta quebrada. A orientação oficial sobre desenho de eval nomeia uma categoria a evitar: casos de teste ambíguos em que mesmo humanos teriam dificuldade de chegar a um consenso de avaliação[^S5]. Você vai reconhecê-los ao validar o juiz: você e um colega julgam a mesma saída e chegam a resultados opostos. Não corra para consertar o prompt do juiz — o juiz é “impreciso” porque esta pergunta não tem resposta precisa. Ou você refina os critérios até humanos conseguirem concordar, ou remove o caso. Usá-lo para calcular a taxa de consistência do juiz só produz um número autoenganoso.

## Quando construir um loop de revisar-e-revisar

O juiz termina e acabou, ou você alimenta o retorno dele de volta ao agente para uma revisão e julga de novo? Esse loop é tentador, e vira facilmente um moto-perpétuo queimando tokens.

A orientação oficial dá dois sinais de quando esse workflow realmente encaixa[^S1]: primeiro, que as respostas do LLM podem ser demonstravelmente melhoradas quando um humano articula seu retorno; e segundo, que o LLM consegue fornecer esse tipo de retorno. A mesma passagem acrescenta um pré-requisito: esse workflow é particularmente eficaz quando temos critérios de avaliação claros e quando o refinamento iterativo entrega valor mensurável[^S1].

Use essas duas condições como testes de admissão. A abordagem é direta: seja você o juiz primeiro, escreva o retorno para o agente, veja se ele de fato melhora depois da revisão. **Se um retorno escrito por humano não move o ponteiro, um retorno escrito por LLM vai mover menos ainda**. Nesse ponto o que precisa de conserto é o prompt ou as ferramentas, não acrescentar uma camada de revisão. Por outro lado, se o retorno humano funciona claramente, cheque a segunda condição — peça a um LLM que escreva o retorno contra a rubrica e compare com o seu. Se as duas passarem, o loop vale a pena ser construído.

## Proporcionalidade: um juiz também é uma chamada de modelo

Volte à ordenação da Lição 3. O princípio para escolher um método de correção é o mais rápido, mais confiável e mais escalável[^S5]; a correção por código fica à frente da correção por LLM nos três[^S5]. Então os juízes vão onde as verificações determinísticas não alcançam, não como substitutas delas. Para o mesmo relatório, a estratificação correta fica assim:

```text
Camada 1 (determinística, milissegundos, custo zero)
  JSON / Markdown válido? Comprimento dentro da faixa exigida?
  Links das citações acessíveis (status HTTP)? Número de citações >= 3?
  Qualquer item falha → reprovado imediato, não invoque o juiz

Camada 2 (juiz LLM, segundos, cobrado por token)
  Pontuação pela rubrica de cinco dimensões + aprovado/reprovado
  Entrada: requisitos da tarefa + saída + logs brutos (chamadas e respostas de ferramenta)

Camada 3 (humano, lento e caro, apenas amostragem)
  O juiz disse reprovado mas você desconfia
  Amostra aleatória do que o juiz aprovou, para se proteger de brandura sistemática
```

Não mande para a camada 2 pagar o que a camada 1 já pega — uma saída que nem sequer é formato válido não precisa de uma chamada de modelo para lhe dizer que é inaceitável. A camada 3 não pode ser pulada: pessoas testando agentes encontram casos extremos que os evals deixam passar[^S2]; o viés anterior de “preferir consistentemente fazendas de conteúdo” foi pego por teste humano[^S2].

**A fronteira desta lição**: como organizar conjuntos de avaliação, com quantos casos rodar este juiz — isso é a Lição 5. Ligar o juiz a uma trilha de eval repetível que produz relatórios — isso é a Lição 6. Esta lição só resolve como tornar um único julgamento confiável.

## 💻 Exercícios

<!-- exercises -->

### Nível 1: Diagnosticar um prompt de juiz quebrado (sem código)

Alguém acrescentou uma “autoverificação” ao seu agente de pesquisa, com este prompt:

```text
Você acabou de terminar de escrever este relatório setorial. Agora avalie o seu próprio resumo:
Você acha que este resumo está bom? Avalie em detalhe os pontos fortes e fracos dele,
seja o mais abrangente possível, e liste todas as sugestões de melhoria em que conseguir pensar.
Obrigado!
```

**Sua tarefa:** ① Liste **pelo menos 4** falhas neste prompt, cada uma correspondendo a uma regra coberta nesta lição (escreva qual regra e por que isso a viola); ② Reescreva-o em uma versão funcional diretamente utilizável, não uma descrição de “como deveria ser escrito”.

<!-- hint -->
Dica 1: Varra de três ângulos — **quem julga** (há problema na identidade deste juiz), **julga o quê** (ele sabe o que significa bom), **saída como** (seu programa consegue tratar o que volta). Cada ângulo rende pelo menos uma falha.
<!-- /hint -->

<!-- hint -->
Dica 2: Repare naquela parte final, “seja o mais abrangente possível”, “liste todas as sugestões em que conseguir pensar”. Volte ao primeiro modo de “Como os juízes quebram”, pense no que isso produz e o que acontece quando você implementa tudo. Depois pergunte a si mesmo: onde neste prompt está o **material de origem** que o juiz precisa para verificar fatos?
<!-- /hint -->

<!-- rubric -->
Critérios de autoavaliação:
- Identificou pelo menos 4 falhas, cada uma mapeada para uma regra da lição; cobriu pelo menos 4 destes problemas: ① fazer o modelo que trabalhou se autocorrigir viola “separar quem faz de quem guarda o portão”; ② sem rubrica, “bom” não é quebrado em dimensões respondíveis separadamente; ③ sem restrição de formato de saída, retorno puramente qualitativo não pode ser apurado rapidamente em escala; ④ sem nota e sem aprovado/reprovado, nada para comparar entre versões; ⑤ sem a ordem “primeiro a evidência, depois a nota”; ⑥ “seja abrangente / liste todas as sugestões” incentiva implicância, e perseguir cada uma leva a superengenharia; ⑦ não dá ao juiz a entrada de que ele precisa — sem requisitos da tarefa, sem materiais de origem, sem logs de chamadas de ferramenta.
- A reescrita é um **prompt completo diretamente utilizável**, não uma lista de tópicos, e inclui no mínimo: identidade de revisor em contexto novo (declarando que este prompt vai para uma chamada nova e independente, não anexada à chamada que escreveu), placeholders para a saída sob revisão e seus materiais de origem/logs, rubrica declarando o que cada dimensão pergunta, nota de 0.0 a 1.0 por dimensão, aprovado/reprovado geral, exigência de ordem “primeiro a evidência de apoio, depois a nota”, restrição “sinalizar apenas problemas que afetam a correção ou os requisitos declarados, o resto vai para sugestões opcionais e não conta na nota”, formato de saída JSON fixo.
- A reescrita não contém perguntas do tipo “você acha que … está bom”, que não têm linha de base.
<!-- /rubric -->

<!-- answer -->
**Parte 1: falhas e regras correspondentes**

1. “Você acabou de terminar de escrever … agora avalie o seu próprio” — o modelo que trabalhou julga a si mesmo. Viola: implementar guardrails em que uma instância do modelo processa as consultas do usuário enquanto outra as filtra tende a funcionar melhor do que a mesma chamada de LLM cuidar das duas coisas[^S1]; um revisor em contexto novo não consegue ver o raciocínio que produziu o resultado, e por isso avalia o resultado nos termos dele mesmo[^S4].
2. “Você acha que este resumo está bom” — sem rubrica. Viola: a maioria dos casos de uso precisa de avaliação multidimensional ao longo de vários critérios de sucesso[^S5], e um dado critério pode até exigir várias rubricas[^S5].
3. “Avalie em detalhe os pontos fortes e fracos” — retorno puramente qualitativo, sem nota, sem formato. Viola: instrua o LLM a devolver 'correct'/'incorrect' ou 1–5; avaliações puramente qualitativas são difíceis de apurar rapidamente e em escala[^S5].
4. Não exige “primeiro a evidência, depois a nota”. Viola: peça ao LLM que raciocine antes de produzir uma nota de avaliação e então descarte o raciocínio — isso aumenta o desempenho da avaliação, particularmente em tarefas que exigem julgamento complexo[^S5].
5. “Seja o mais abrangente possível”, “liste todas as sugestões em que conseguir pensar” — incentivo à implicância. Viola: um revisor instruído a encontrar lacunas normalmente vai reportar algumas mesmo quando o trabalho está sólido; perseguir cada achado leva a superengenharia[^S4]; a correção é sinalizar apenas lacunas que afetam a correção ou os requisitos declarados[^S4].
6. Sem requisitos originais da tarefa, sem materiais de origem, sem logs de chamadas de ferramenta. Viola: o que os agentes omitem pode ser mais importante do que o que incluem; revise as transcrições brutas (chamadas e respostas de ferramenta) para pegar comportamento que não está na autodescrição do agente[^S3].

**Parte 2: reescrita (diretamente utilizável)**

```text
Você é um revisor independente. Você não participou da escrita do relatório setorial abaixo
e não consegue ver o processo de escrita dele. Julgue o relatório em si baseando-se apenas nos
requisitos da tarefa, nos materiais de origem e nos logs de execução abaixo.

[Requisitos originais da tarefa] {{task_spec}}
[Relatório sob revisão] {{report}}
[Texto completo das fontes citadas no relatório] {{source_documents}}
[Logs brutos desta execução: chamadas e respostas de ferramenta] {{raw_transcript}}

[Rubrica] Responda cada dimensão separadamente:
1. factual_accuracy: toda afirmação do relatório pode ser encontrada nos materiais de origem?
   Números, datas, nomes e conclusões ausentes das fontes contam como imprecisos; resumir
   e parafrasear não contam.
2. citation_accuracy: a fonte ligada a cada citação de fato discute a afirmação que ela sustenta?
   Fonte existe mas conteúdo não bate com a afirmação desconta aqui (não afeta a dimensão 1).
3. completeness: todos os aspectos nomeados nos requisitos da tarefa foram cobertos? Confira
   os requisitos linha a linha.
4. source_quality: foram usadas fontes primárias (documentos originais, publicações oficiais,
   materiais acadêmicos) ou recontagens secundárias bem ranqueadas porém de baixa qualidade?
5. tool_efficiency: com base nos logs de execução, as ferramentas certas foram usadas, o número
   de chamadas é obviamente redundante? Baseie-se apenas nos logs, não confie na autodescrição
   que o relatório faz do próprio processo.

[Exigências de pontuação]
- Ordem: para cada dimensão, escreva primeiro a evidência (é obrigatório citar especificamente
  qual frase do relatório, qual parte das fontes ou qual chamada dos logs; se não encontrar
  problema, escreva "nenhum encontrado"). Escreva a evidência completa e só então dê a nota.
- score: de 0.0 a 1.0. 1.0 significa nenhum problema encontrado nesta dimensão, 0.0 significa
  falha grave.
- verdict: "pass" se todas as dimensões >= 0.7 E factual_accuracy >= 0.9, caso contrário "fail".
- Sinalize apenas problemas que afetam a correção ou o cumprimento dos requisitos da tarefa.
  Redação, estrutura e preferências de formatação vão todas para optional_notes; esse campo não
  participa da pontuação e não afeta o verdict.
- Devolva estritamente na estrutura JSON abaixo, sem nenhum texto fora do JSON.

[Formato de saída]
{
  "factual_accuracy":  { "evidence": "", "score": 0.0 },
  "citation_accuracy": { "evidence": "", "score": 0.0 },
  "completeness":      { "evidence": "", "score": 0.0 },
  "source_quality":    { "evidence": "", "score": 0.0 },
  "tool_efficiency":   { "evidence": "", "score": 0.0 },
  "optional_notes": [],
  "verdict": "<pass ou fail>"
}
```

Mais uma coisa que não está no prompt mas é igualmente crítica: envie este prompt em uma **chamada nova e independente** (inicie uma nova conversa ou subagente sem histórico de escrita). Por mais convincente que você declare “você é um revisor independente” na identidade, se anexá-lo à chamada que escreveu, ele ainda vai ver todo o raciocínio da escrita.

Aqueles dois limiares finais (0.7 e 0.9) são escolha sua; nenhuma fonte oficial dá esses números. A finalidade deles é tornar o aprovado/reprovado computável. Depois de completar a validação do juiz do nível 2, volte e ajuste-os.

<!-- /answer -->

### Nível 2: Projetar um esquema completo de julgamento para “resumo de reunião a partir da transcrição”

Cenário: seu agente comprime diariamente transcrições de reunião em notas-resumo com conclusões e itens de ação. Os resumos são texto livre sem resposta padrão, mas erros são caros — perca um item de ação e ninguém executa aquela tarefa.

**Sua tarefa:** ① Projete uma rubrica de três dimensões (fidelidade aos fatos, cobertura dos pontos-chave, nenhum item de ação faltando), cada dimensão de 0.0 a 1.0 mais um aprovado/reprovado geral, escrevendo com clareza o que cada dimensão pergunta e o que conta como desconto; ② Escreva o **prompt de juiz completo**, incluindo a ordem primeiro-raciocínio-depois-nota e restrições estritas de formato de saída; ③ Projete as etapas de “validar o próprio juiz”: prepare um conjunto pequeno de exemplos bons/ruins rotulados por humanos, rode o juiz, compare a taxa de concordância e especifique **o que corrigir primeiro e o que corrigir depois** quando a concordância for insuficiente. Não é preciso chamar APIs de verdade; as entregas são o prompt, o JSON e as próprias etapas.

<!-- hint -->
Dica 1: Três dimensões não são três slogans; cada uma precisa responder “o que conta como desconto, o que não conta”. Por exemplo, fidelidade: informação que não está na transcrição escrita no resumo conta como desconto, mas condensar três frases em uma não conta. Escreva essas fronteiras no prompt para o juiz ficar estável. A dimensão de itens de ação também precisa cobrir uma coisa a mais — se responsável e prazo foram trocados entre si.
<!-- /hint -->

<!-- hint -->
Dica 2: Os exemplos rotulados por humanos não podem ser todos exemplos bons. Fabrique exemplos ruins por dimensão: um enfia números que não estão na transcrição, um omite um item de pauta já concluído, um erra o responsável de um item de ação. Assim, quando o juiz discordar de você, fica imediatamente visível qual definição de dimensão não estava clara. Além disso, quando você e um colega julgam um caso de forma inconsistente, desconfie primeiro do caso, não do juiz.
<!-- /hint -->

<!-- rubric -->
Critérios de autoavaliação:
- **Rubrica**: cada uma das três dimensões tem fronteiras claras de “o que desconta / o que não desconta”, não apenas nomes de dimensão; a dimensão de itens de ação cobre tanto “omissão” quanto “responsável ou prazo errado”.
- **Prompt**: completo e diretamente utilizável, contém placeholders de transcrição e resumo; declara explicitamente que o revisor não é quem escreveu; exige que cada dimensão escreva primeiro a evidência de apoio (apontando um local específico da transcrição/resumo) e depois a nota; tem notas de 0.0 a 1.0, tem aprovado/reprovado com regra de julgamento; tem a restrição “sinalizar apenas problemas que afetam a correção, o resto vai para um campo que não pontua”; termina com formato JSON fixo e a exigência de não devolver nenhum outro conteúdo.
- **Esquema de validação**: contém um conjunto de exemplos rotulados por humanos (exemplos bons + exemplos ruins projetados separadamente por dimensão), humanos julgam primeiro linha a linha, o juiz roda o mesmo lote, compara-se a taxa de concordância por aprovado/reprovado e por notas de cada dimensão, olhando separadamente em qual dimensão as discordâncias se concentram.
- **Ordem de correção** especificada com justificativa; a ordem é: conferir primeiro os próprios exemplos/critérios (casos ambíguos em que até humanos discordam precisam ser reescritos ou removidos) → depois corrigir o prompt do juiz (acrescentar definições de dimensão, acrescentar exemplos positivos/negativos, apertar a saída) → só então considerar trocar de modelo ou acrescentar votação com múltiplos prompts.
- Declara explicitamente “não escale para o conjunto completo de casos antes de a validação do juiz passar”; limiares podem ser definidos por você, mas é preciso declarar que são seus, não invente números oficiais.
<!-- /rubric -->

<!-- answer -->
**1. Rubrica de três dimensões**

- **faithfulness**: toda afirmação do resumo pode ser encontrada na transcrição? Desconta: números, nomes, datas e conclusões que não estão na transcrição; promover “alguém propôs” a “a reunião decidiu” (escalada de força). Não desconta: resumir, fundir, reformular.
- **coverage**: todos os temas discutidos por várias pessoas ou com conclusão explícita foram mencionados? Desconta: omitir um item de pauta concluído; escrever a conclusão ao contrário. Não desconta: omitir conteúdo mencionado uma única vez de passagem e sem conclusão.
- **action_items**: todos os compromissos de “quem faz o quê até quando” da transcrição estão na lista? Desconta: faltar um item; responsável errado; prazo errado ou inventar um prazo que a transcrição não declarou. Não desconta: a transcrição genuinamente não declarou prazo e o resumo marca com precisão “não definido”.

Veredito geral: qualquer dimensão abaixo de 0.6, ou faithfulness abaixo de 0.8, o veredito é reprovado; caso contrário, aprovado. Esses dois limiares são pontos de partida definidos por você; ajuste depois da validação da etapa 3.

**2. Prompt de juiz completo**

```text
Você é um revisor independente de notas-resumo de reunião. Você não participou da escrita deste
resumo e não consegue ver o processo de geração dele. Julgue este resumo baseando-se apenas na
transcrição da reunião e na rubrica abaixo.

[Transcrição original da reunião] {{transcript}}
[Resumo sob revisão] {{summary}}

[Rubrica]
1. faithfulness: toda afirmação do resumo pode ser encontrada na transcrição?
   - Desconta: números, nomes, datas e conclusões que não estão na transcrição escritos no resumo;
     expressar "alguém propôs" como "a reunião decidiu" (escalar a força da conclusão).
   - Não desconta: condensar várias frases em uma; reformular; omitir conversa paralela
     sem relação com a pauta.
2. coverage: todos os temas discutidos por várias pessoas ou com conclusão explícita na
   transcrição foram mencionados no resumo?
   - Desconta: omitir um item de pauta que chegou a conclusão; escrever ao contrário a conclusão
     de um tema.
   - Não desconta: omitir conteúdo mencionado uma única vez de passagem e sem conclusão.
3. action_items: para todo compromisso de "quem faz o quê até quando" na transcrição, ele está na
   lista de itens de ação do resumo, com responsável e prazo não errados nem trocados?
   - Desconta: faltar um item de ação; responsável escrito como outra pessoa; prazo errado;
     inventar um prazo quando a transcrição não declarou nenhum.
   - Não desconta: a transcrição genuinamente não definiu prazo e o resumo escreve com precisão
     "prazo não definido".

[Exigências de pontuação]
- Ordem: para cada dimensão, escreva primeiro a evidência, depois dê a nota. A evidência precisa
  ser específica — aponte qual frase do resumo corresponde a qual parte da transcrição (citar o
  fragmento original basta); se a dimensão não tiver problema, escreva "nenhum encontrado".
- score: de 0.0 a 1.0. 1.0 significa que esta dimensão está completamente bem, 0.0 significa
  falha grave.
- verdict: qualquer dimensão abaixo de 0.6, ou faithfulness abaixo de 0.8, devolva "fail";
  caso contrário, "pass".
- Sinalize apenas problemas que afetam a correção ou que afetam o uso destas notas como
  referência de trabalho. Estilo de linguagem, ordem dos itens e preferências de detalhe vão
  todos em optional_notes; esse campo não participa da pontuação e não afeta o verdict.
- Devolva estritamente na estrutura JSON abaixo, sem texto fora do JSON, sem explicações,
  sem cercas de código.

[Formato de saída]
{
  "faithfulness": { "evidence": "", "score": 0.0 },
  "coverage":     { "evidence": "", "score": 0.0 },
  "action_items": { "evidence": "", "score": 0.0 },
  "optional_notes": [],
  "verdict": "<pass ou fail>"
}
```

Do lado do programa, pegue apenas os três valores de `score` e o `verdict` para as estatísticas; `evidence` e `optional_notes` são persistidos em disco para revisão quando as notas parecerem suspeitas. Igual ao nível 1: envie este prompt para uma chamada nova e independente, não anexe à chamada que gerou o resumo.

**3. Etapas para validar o próprio juiz**

Etapa um, fabricar o conjunto de exemplos. Pegue de 12 a 20 transcrições reais de reunião (essa escala é um ponto de partida definido por você, não vem de nenhuma fonte oficial) e emparelhe cada reunião com 2 resumos, um bom e um ruim, com os ruins projetados por dimensão:

```json
{
  "cases": [
    { "id": "m01-good", "summary": "s/m01-good.md", "human_verdict": "pass",
      "human_notes": "As três dimensões estão bem" },
    { "id": "m01-bad-faith", "summary": "s/m01-bad-faith.md", "human_verdict": "fail",
      "broken_dimension": "faithfulness",
      "human_notes": "O resumo diz “orçamento de 800 mil aprovado”, a transcrição só menciona “submetido para aprovação”" },
    { "id": "m02-bad-coverage", "summary": "s/m02-bad-cov.md", "human_verdict": "fail",
      "broken_dimension": "coverage",
      "human_notes": "A troca de fornecedor, um item de pauta concluído, some por inteiro" },
    { "id": "m03-bad-actions", "summary": "s/m03-bad-act.md", "human_verdict": "fail",
      "broken_dimension": "action_items",
      "human_notes": "O responsável por “rascunho até sexta” é a Lima, o resumo escreveu Wang" }
  ]
}
```

Etapa dois, humanos julgam primeiro. Você e um colega julgam cada um, de forma independente, aprovado/reprovado e escrevem a justificativa, **sem ver a saída do juiz**. Os casos em que vocês dois discordam são separados à parte — veja a etapa quatro.

Etapa três, rode o juiz e compare duas coisas: a **taxa de concordância do veredito** (percentual em que o `verdict` do juiz bate com o rótulo humano) e a **taxa de acerto da atribuição de dimensão** (para os exemplos ruins, a dimensão em que o juiz descontou mais forte é a `broken_dimension` que você etiquetou). A segunda costuma revelar mais — veredito correto por coincidência mas atribuição errada significa que as definições das dimensões não estão claras.

Etapa quatro, quando insuficiente, corrija nesta ordem, e **a ordem não pode ser invertida**:

1. **Confira primeiro os exemplos e os critérios.** As discordâncias se concentram nos casos em que você e o colega também discordaram — o problema está na pergunta, não no juiz. Casos de teste ambíguos, em que mesmo humanos teriam dificuldade de chegar a consenso, são o que o desenho de eval deve evitar[^S5]. Refine os critérios até os humanos concordarem, ou remova o caso se não conseguir.
2. **Depois corrija o prompt do juiz.** Critérios claros, humanos concordam, juiz ainda erra — isso é problema de prompt. Acrescente à dimensão em que as discordâncias se concentram: escreva “o que desconta / o que não desconta” de forma mais rígida, insira um ou dois exemplos positivos/negativos, restrinja mais o formato de saída. Rode o mesmo lote de novo.
3. **Só então mexa em modelo e estrutura.** Prompt já muito específico, juiz ainda instável — aí sim considere trocar por um modelo mais forte, ou usar vários prompts avaliando cada um uma dimensão e combinar os vereditos com um limiar de voto — o limiar de voto é exatamente o botão para equilibrar falsos positivos e falsos negativos[^S1]. Esta etapa fica por último porque eleva tanto o custo quanto a complexidade.

Etapa cinco, defina o limiar e então escale. Defina sua própria taxa de concordância mínima (nenhuma fonte oficial dá esse número; baseie-a no custo do erro de julgamento); antes de atingir o limiar, não escale o juiz para o conjunto completo de casos — a orientação oficial para correção por LLM é testar primeiro para garantir a confiabilidade e só então escalar[^S5]. Depois disso, toda vez que mudar o prompt do juiz, rode este lote pequeno de novo para confirmar que você não o quebrou.

<!-- /answer -->

<!-- /exercises -->

## Recapitulação

- Saídas em texto livre não têm uma única resposta correta e são difíceis de avaliar programaticamente; LLMs são um encaixe natural para corrigir saídas desse tipo[^S2]; mas o posicionamento oficial da correção por LLM é “rápida, flexível, escalável, adequada a julgamento complexo — pré-requisito: testar primeiro para garantir a confiabilidade e só então escalar”; a correção humana é a mais flexível e de maior qualidade, mas lenta e cara, evite se possível[^S5].
- Uma rubrica quebra “bom” em perguntas respondíveis separadamente. A decomposição pronta para tarefas de pesquisa são cinco dimensões: precisão factual, precisão de citação, completude, qualidade das fontes, eficiência de ferramentas[^S2]; um dado caso de uso, ou mesmo um único critério de sucesso dentro dele, pode exigir várias rubricas para uma avaliação holística[^S5].
- Quanto ao formato de saída, uma única chamada de LLM com um único prompt devolvendo notas de 0.0 a 1.0 e um aprovado/reprovado foi, na medição real, o mais consistente e mais alinhado com julgamentos humanos[^S2]; instrua o LLM a devolver 'correct'/'incorrect' ou 1–5; avaliações puramente qualitativas são difíceis de apurar rapidamente e em escala[^S5]. Peça ao LLM que raciocine antes de produzir a nota de avaliação e então descarte o raciocínio — isso aumenta o desempenho da avaliação, particularmente em julgamento complexo[^S5]; dimensões subjetivas podem usar escalas Likert baseadas em LLM[^S5].
- Quem faz não pode ser o juiz: implementar guardrails em que uma instância do modelo processa as consultas enquanto outra filtra tende a funcionar melhor do que a mesma chamada cuidar das duas coisas[^S1]; um revisor em contexto novo só vê a saída e os seus critérios, não consegue ver o raciocínio que produziu a saída, e por isso julga o resultado nos termos dele mesmo[^S4]. Avaliação com múltiplos prompts e limiares de voto equilibra falsos positivos e falsos negativos[^S1].
- Um revisor instruído a encontrar lacunas normalmente vai reportar algumas mesmo quando o trabalho está sólido, e perseguir cada achado leva a superengenharia; a correção é dizer a ele para sinalizar apenas lacunas que afetam a correção ou os requisitos declarados, e tratar o resto como opcional[^S4].
- Não alimente o juiz apenas com o autorrelato do agente: o que ele omite costuma ser mais importante do que o que inclui, LLMs nem sempre dizem o que querem dizer[^S3]; revise as transcrições brutas (chamadas e respostas de ferramenta) para pegar comportamento que não está na autodescrição[^S3].
- Se vale a pena construir um loop de revisar-e-revisar depende de dois sinais: as respostas do LLM podem ser demonstravelmente melhoradas quando um humano articula seu retorno, e o próprio LLM consegue fornecer esse retorno[^S1].
- Um juiz também é uma chamada de modelo, com custo e ruído. O princípio para escolher métodos de correção é o mais rápido, mais confiável e mais escalável; a correção por código fica à frente nos três[^S5] — verificações determinísticas que conseguem pegar algo não devem mandar isso para um juiz; além dos evals automatizados ainda são necessárias amostragens humanas, pessoas testando agentes encontram casos extremos que os evals deixam passar[^S2].

[>> Lição 5: Conjuntos de avaliação: comece com 20 tarefas reais](./05-eval-sets.md)
