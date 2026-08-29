# Lição 2: Anatomia do contexto: system prompt, ferramentas e exemplos

> Objetivos de aprendizado:
> - Desmontar o contexto de uma única requisição a um LLM (system prompt, definições de ferramentas, exemplos, histórico de mensagens) e explicar por que os quatro gastam do mesmo orçamento de atenção
> - Diagnosticar o problema de “altitude” em um system prompt — hardcoded e frágil de um lado, vago e sem sinal do outro — e reescrevê-lo na altitude certa
> - Auditar definições de ferramentas e exemplos pela lente do custo de contexto: fundir funcionalidades sobrepostas, podar o que volta, e trocar uma lista de casos de borda por alguns exemplos canônicos
>
> Pré-requisitos: Você concluiu a Lição 1 e aceita a premissa de que o contexto é um recurso finito | Anterior: [Lição 1 <<](./01-from-prompt-to-context.md) | Próxima: [Lição 3 >>](./03-just-in-time-context.md)

## Abra o capô: o que de fato é carregado numa requisição

A Lição 1 tomou emprestada a definição da Anthropic: context engineering é "the set of strategies for curating and maintaining the optimal set of tokens (information) during LLM inference"[^S1] (o conjunto de estratégias para curar e manter o conjunto ótimo de tokens (informação) durante a inferência de um LLM). Isso ainda é abstrato — de quais tokens “o conjunto ótimo” é de fato feito? Esta lição faz uma coisa só: abre o capô para você ver o que é carregado na janela toda vez que uma requisição sai.

Você escreveu à mão um loop de harness lá em “Fundamentos do Harness de Agente: Laços e Controle”, então o formato de uma requisição deve ser familiar. Ordenado pelo que carrega, o contexto de uma única requisição é mais ou menos estes quatro blocos:

```text
Contexto de uma requisição
├── System prompt (papel, regras, conhecimento de fundo)
├── Definições de ferramentas (nome, descrição e schema de parâmetros de cada ferramenta)
├── Exemplos (few-shot: amostras de entrada/saída que retratam o comportamento esperado)
└── Histórico de mensagens (mensagens do usuário, respostas do modelo, chamadas e resultados de ferramenta de cada turno)
```

Eis o que importa: esses quatro não são quatro compartimentos lacrados, são vizinhos em uma mesma janela. "LLMs have an "attention budget" that they draw on when parsing large volumes of context," e "Every new token introduced depletes this budget by some amount"[^S1] (LLMs têm um “orçamento de atenção” do qual sacam ao processar grandes volumes de contexto, e cada novo token introduzido esgota esse orçamento em alguma medida). Um parágrafo a mais de enchimento no system prompt é atenção que o histórico de mensagens não recebe; dez ferramentas paradas no manifesto que ninguém nunca chama afinam a fatia que sobra para os exemplos. E, como a Lição 1 cobriu, "as the number of tokens in the context window increases, the model's ability to accurately recall information from that context decreases"[^S1] (conforme o número de tokens na janela de contexto aumenta, a capacidade do modelo de recuperar com precisão informações desse contexto diminui) — uma degradação que chega como uma ladeira, não como uma queda, já que "These factors create a performance gradient rather than a hard cliff"[^S1] (esses fatores criam um gradiente de desempenho, não um penhasco abrupto). É por isso que o desperdício em qualquer um dos blocos nunca se anuncia com um erro. Ele apenas deixa o conjunto todo um pouco mais burro, em silêncio, e quando você percebe já não consegue apontar a linha que fez aquilo.

Os quatro blocos também crescem em ritmos diferentes. System prompt, definições de ferramentas e exemplos são basicamente estáticos — do tamanho que você escreveu, é do tamanho que ficam. O histórico de mensagens, esse incha dentro do loop, porque "An agent running in a loop generates more and more data that could be relevant for the next turn of inference"[^S1] (um agente rodando em loop gera cada vez mais dados que poderiam ser relevantes para o próximo turno de inferência). No harness que você construiu em “Fundamentos do Harness de Agente: Laços e Controle”, a linha que empurra o resultado de ferramenta de cada turno para o array `messages` é esse inchaço, ao vivo. O que fazer com o histórico não é tarefa desta lição — a Lição 4, “Compactação e notas: gestão de contexto para tarefas longas”, é dedicada a isso. Esta lição põe sob controle os três blocos estáticos, porque eles são o custo fixo que você paga em cada turno, sem exceção.

Transformar "context, therefore, must be treated as a finite resource with diminishing marginal returns"[^S1] (o contexto, portanto, precisa ser tratado como um recurso finito com retornos marginais decrescentes) em algo acionável significa fazer a cada bloco a mesma pergunta: quanta melhoria de comportamento esses tokens compraram? Vamos bloco a bloco.

## A altitude de um system prompt: duas formas de falhar

O artigo de engenharia da Anthropic usa “altitude” para o nível de abstração em que um system prompt se situa, e nomeia dois extremos de falha. De um lado, "engineers hardcoding complex, brittle logic in their prompts to elicit exact agentic behavior"[^S1] (engenheiros deixando lógica complexa e frágil hardcoded em seus prompts para arrancar um comportamento agêntico exato). Do outro, "vague, high-level guidance that fails to give the LLM concrete signals for desired outputs"[^S1] (orientação vaga e de alto nível que não dá ao LLM sinais concretos das saídas desejadas). Vamos escrever três versões de um system prompt para o mesmo agente de suporte a pedidos, para deixar as duas armadilhas e a boa resposta lado a lado.

**Voando baixo demais** — a lógica fica hardcoded:

```text
Você é um agente de suporte a pedidos. Siga estas regras à risca:
1. Se o usuário disser "nunca chegou", responda com o template A.
2. Se o usuário disser "chegou danificado", responda com o template B e emita um cupom de $10.
3. Números de pedido começando com TB: cheque a entrega primeiro. Começando com JD: cheque o estoque primeiro.
4. Se a mensagem do usuário contiver a palavra "reclamação", passe para um humano.
… (mais 14 regras omitidas)
19. Quando um usuário se encaixar na regra 2 e na regra 4, a regra 4 vence.
20. Se nada acima se encaixar, responda "Desculpe, acho que não entendi."
```

Cada regra cobre exatamente o caso que ela soletra. E quando o usuário escreve “a caixa veio amassada” em vez de “danificado”? Nenhuma regra pega isso, então cai na regra 20 e o agente se faz de bobo. Pior, as regras começam a brigar entre si, então você acrescenta a regra 19 para apitar o jogo — e a essa altura você está escrevendo um interpretador de if-else em linguagem natural. Cada acréscimo deixa o prompt mais longo, mais frágil e mais caro em atenção, enquanto os casos que você não escreveu sempre vão ser mais numerosos do que os que escreveu.

**Flutuando alto demais** — só palavra de ordem:

```text
Você é um agente de suporte a pedidos. Seja profissional e simpático, resolva os problemas dos usuários com flexibilidade e mantenha os usuários felizes.
```

Você economizou os tokens, mas o modelo não recebe sinal concreto nenhum. Onde fica a fronteira dos reembolsos? Quanta compensação ele pode autorizar? O que tem de ir para um humano? É tudo chute. “Mantenha os usuários felizes”, levado ao limite, pode significar devolver dinheiro que jamais deveria ter sido devolvido — e isso não é desobediência, é você não tendo dito nada.

**A altitude certa** — o padrão da Anthropic é um prompt "specific enough to guide behavior effectively, yet flexible enough to provide the model with strong heuristics"[^S1] (específico o bastante para guiar o comportamento com eficácia, e ainda assim flexível o bastante para dar ao modelo heurísticas fortes):

```text
Você é um agente de suporte a pedidos. Seu objetivo é resolver o problema pós-compra do usuário dentro de uma única conversa.

Princípios de julgamento:
- Se um pedido ainda não foi despachado, você pode reembolsar mediante solicitação; se já foi despachado, oriente o usuário a recusar a entrega ou abrir uma devolução.
- Dano, item errado e item faltando são culpa nossa: ofereça compensação de saída, não espere o usuário pedir.
- Quando a culpa não estiver clara, confirme os fatos-chave primeiro (número do pedido, fotos) e só então decida.

Limites rígidos (nunca ultrapasse):
- Nenhuma compensação isolada acima de $50 — acima disso, passe para um humano.
- Qualquer conversa envolvendo lesão física ou disputa jurídica: passe para um humano imediatamente e sinalize.
```

Olhe a estrutura dessa versão: **os princípios fazem a generalização, as linhas vermelhas fazem a conformidade**. “A caixa veio amassada” não está escrito literalmente em regra nenhuma, e ainda assim cai naturalmente sob “dano é culpa nossa”; as coisas que de fato não são negociáveis (o teto de compensação, disputas jurídicas) ficam fixadas como um punhado de limites rígidos. Tem menos da metade do comprimento da versão de 20 regras e cobre estritamente mais terreno.

Existe uma pergunta-atalho para julgar altitude: **diante de um caso que você não escreveu, este prompt dá ao modelo uma direção a partir da qual raciocinar?** A versão baixa não dá (ela só sabe cair no pega-tudo), a versão alta dá uma direção vazia (“felizes”), e a versão na altitude certa dá princípios que transferem.

```agentmentor-check
{
  "id": "ctx-zh-02-altitude-fix",
  "label": "Diagnosticar o problema de altitude em um system prompt hardcoded e escolher a correção",
  "prompt": "Um agente de análise de devoluções tem um system prompt com 18 regras no formato “se o usuário disser X, faça Y”, terminando com “se nada acima se encaixar, responda que o pedido não pode ser processado”. Em produção, toda solicitação cuja redação as regras não anteciparam cai nesse ramo pega-tudo. Qual abordagem de fato resolve isso pela raiz?",
  "whyHere": "A seção acabou de pôr lado a lado três versões de um prompt de suporte — baixa demais, alta demais e certa. Aqui entra um cenário novo para verificar se você consegue identificar sozinho a doença de fundo de um prompt de altitude baixa, e escolher entre “seguir acrescentando ramos” e “subir para princípios” sem ter a comparação diante dos olhos.",
  "mode": "single",
  "choices": [
    {
      "id": "a",
      "text": "Reescrever os 18 casos especiais como alguns princípios de julgamento mais um pequeno número de limites rígidos, para que os princípios cubram as redações que ninguém enumerou enquanto as verdadeiras linhas vermelhas de conformidade seguem fixadas.",
      "correct": true,
      "feedback": "Correto. Princípios generalizam para redações que nunca foram enumeradas, e limites rígidos seguram a linha no que não é negociável — é exatamente a altitude que é específica o bastante para guiar o comportamento e ainda deixa heurísticas fortes para o modelo. O prompt também fica mais curto, então o orçamento de atenção compra mais."
    },
    {
      "id": "b",
      "text": "Manter a estrutura e subdividir o pega-tudo: acompanhar quais redações escaparam em produção e acrescentar algumas regras se-então novas ao prompt toda semana.",
      "correct": false,
      "feedback": "Não exatamente. Acrescentar regras só corre atrás de redações que já apareceram; qualquer coisa nova continua caindo no pega-tudo. A lista cresce, os conflitos entre regras ficam mais prováveis, e cada turno de inferência paga atenção por um manifesto que só aumenta."
    },
    {
      "id": "c",
      "text": "Apagar as 18 regras e substituí-las por uma única linha, “trate as solicitações de devolução com flexibilidade e prudência”, para economizar o máximo de tokens.",
      "correct": false,
      "feedback": "Não exatamente. Isso pula de um extremo ao outro. Os tokens são economizados, mas “com flexibilidade e prudência” não carrega sinal concreto nenhum, então o modelo não faz ideia de onde ficam as fronteiras da devolução nem a sua alçada, e o comportamento deriva de forma imprevisível. Economizar tokens só funciona se as heurísticas que guiam o comportamento sobreviverem."
    }
  ]
}
```

## A camada sempre carregada: a disciplina do CLAUDE.md

O system prompt não é só a string que você digitou. Muitos harnesses estacionam configuração de nível de projeto permanentemente na camada de sistema, e o CLAUDE.md do Claude Code é o caso canônico: a documentação diz que "CLAUDE.md is a special file that Claude reads at the start of every conversation."[^S4] (o CLAUDE.md é um arquivo especial que o Claude lê no início de cada conversa.) “Lido toda vez” significa que cada linha dele gasta orçamento de atenção em cada sessão, e é por isso que a disciplina que a documentação impõe sobre ele é rigorosa.

Regra um: coloque ali só o que se aplica de forma ampla — "CLAUDE.md is loaded every session, so only include things that apply broadly."[^S4] (o CLAUDE.md é carregado a cada sessão, então inclua apenas coisas que se aplicam de forma ampla.) Um comando de build de que só um subdiretório precisa, uma convenção de que só um tipo de tarefa precisa: nenhum dos dois conquistou uma cadeira na camada sempre carregada.

Regra dois: rode um teste de remoção linha a linha. "Keep it concise. For each line, ask: "Would removing this cause Claude to make mistakes?" If not, cut it."[^S4] (Seja conciso. Para cada linha, pergunte: remover isto faria o Claude cometer erros? Se não, corte.) Isso não é frescura. A documentação alerta de forma direta que "Bloated CLAUDE.md files cause Claude to ignore your actual instructions!"[^S4] (arquivos CLAUDE.md inchados fazem o Claude ignorar as suas instruções de verdade!) É o orçamento de atenção tornado concreto — cada linha opcional que você enfia ali dilui as poucas linhas que genuinamente importam. A mesma página vai a ponto de chamar a janela de contexto de "the most important resource to manage," (o recurso mais importante a gerenciar) observando que "Claude's context window fills up fast, and performance degrades as it fills."[^S4] (a janela de contexto do Claude enche rápido, e o desempenho se degrada conforme ela enche.)

Então onde mora o material raramente necessário mas ocasionalmente essencial? A resposta do Claude Code são as Skills: carregadas sob demanda, já que "Claude loads them on demand without bloating every conversation."[^S4] (o Claude as carrega sob demanda sem inchar cada conversa.) Esse par — mantenha a camada residente mínima, busque o resto quando precisar — é exatamente o assunto da Lição 3, então vamos só reservar o lugar aqui.

Um aparte: se o seu próprio projeto tem um AGENTS.md, um `system_prompt.txt` ou qualquer coisa parecida morando permanentemente no contexto, rode o mesmo teste de remoção nele. Inchaço na camada sempre carregada é o tipo mais traiçoeiro — ele nunca aparece em nenhum turno específico da conversa, e taxa todos eles.

## Ferramentas são contexto: a definição custa, e o retorno também

Uma ferramenta aparece no contexto duas vezes: a **definição** pega carona em cada requisição, e o **valor de retorno** entra no histórico de mensagens. As duas pontas gastam orçamento.

O curso anterior “Tool calling de agentes: fazendo agentes agirem de verdade” cobriu o lado funcional do design de ferramentas — como definir parâmetros, como tratar erros. Esta lição pega outro ângulo: cada definição de ferramenta é um trecho de tokens que o modelo tem de ler e entender. A régua da Anthropic é que "tools should be self-contained, robust to error, and extremely clear with respect to their intended use"[^S1] (as ferramentas devem ser autocontidas, robustas a erro e extremamente claras quanto ao uso pretendido), e que você está "building tools that are well understood by LLMs and have minimal overlap in functionality"[^S1] (construindo ferramentas que sejam bem compreendidas por LLMs e tenham sobreposição mínima de funcionalidade). Aqui está um par que falha nas duas coisas (schemas abreviados para facilitar a leitura):

```json
[
  {
    "name": "get_order_info",
    "description": "Consulta um pedido.",
    "parameters": { "order_id": "string" }
  },
  {
    "name": "search_order",
    "description": "Também consulta pedidos, suporta palavras-chave.",
    "parameters": { "keyword": "string" }
  }
]
```

As duas ferramentas conseguem consultar um pedido, as duas descrições são vagas, e a fronteira entre elas não é algo que nem o próprio autor fixou. É esse o ponto inteiro da exigência de "minimal overlap in functionality"[^S1] (sobreposição mínima de funcionalidade): empilhe ferramentas de fronteiras difusas e você entregou ao modelo a pergunta “qual delas eu uso?” fresquinha a cada turno. Funda as duas em uma só e enuncie o propósito e o comportamento com clareza, e a pergunta desaparece:

```json
[
  {
    "name": "search_orders",
    "description": "Consulta um pedido pelo número exato, ou busca pedidos por palavra-chave. Retorna no máximo 5 resultados por padrão, cada um com apenas quatro campos: número do pedido, status, valor, data do pedido. Para o conjunto completo de campos, reconsulte um único número de pedido com detail=true. Retorna uma lista vazia quando nada corresponde; não dá erro.",
    "parameters": {
      "query": "Número do pedido ou palavra-chave de busca",
      "detail": "Booleano, se deve retornar o conjunto completo de campos, padrão false"
    }
  }
]
```

Essa descrição diz mais do que “o que ela faz” — ela soletra o formato do que volta e o que acontece quando não há nada a retornar, que é o "robust to error"[^S1] (robusta a erro) tornado literal: o modelo não precisa adivinhar como é uma consulta sem resultado, então é bem menos provável que ele invente alguma recuperação estranha quando a busca vier vazia.

Agora o lado do retorno. A Anthropic pede ferramentas "returning information that is token efficient and by encouraging efficient agent behaviors"[^S1] (que retornem informação eficiente em tokens e que estimulem comportamentos eficientes do agente). Uma ferramenta que despeja de volta os mais de quarenta campos internos de um pedido junto com o log de auditoria completo derrama um balde de tokens de baixo valor no histórico de mensagens a cada chamada — e esses tokens ficam no histórico, taxados de novo em cada turno seguinte. “Podar por padrão, `detail=true` sob demanda”, como no exemplo acima, é o formato padrão da correção.

Por fim, o próprio manifesto de ferramentas precisa de subtração. Dez ferramentas no contexto que nunca são chamadas continuam sendo cobradas por inteiro a cada turno pelas suas definições. Auditar uma lista de ferramentas e auditar um CLAUDE.md são o mesmo movimento — remover isto causaria erros? Se não, corte.

## Exemplos: escolha os canônicos, não empilhe uma lista

Exemplos (few-shot) são o terceiro custo estático. O apodrecimento típico deles é assim: cada caso ruim que aparece em produção ganha um exemplo correspondente acrescentado ao prompt, e seis meses depois você é dono de um catálogo de 30 casos de borda. A Anthropic é direta a respeito — não "stuff a laundry list of edge cases into a prompt"[^S1] (enfie uma lista interminável de casos de borda em um prompt); em vez disso, "curate a set of diverse, canonical examples that effectively portray the expected behavior of the agent"[^S1] (cure um conjunto de exemplos diversos e canônicos que retratem com eficácia o comportamento esperado do agente).

“Canônico” significa que um exemplo representa uma **classe** de comportamento, não uma situação específica. De volta ao agente de suporte: três exemplos bastam para emoldurar todo o espaço de comportamento.

1. **O fluxo padrão**: o caminho completo de consultar o pedido, atribuir a culpa, oferecer uma solução.
2. **Assumir a responsabilidade de saída**: despachamos o item errado, e a compensação é oferecida antes de o usuário pedir.
3. **Escalonamento**: está além da alçada do agente, então ele explica com educação e passa para um humano.

“Diversos” significa que esses três cobrem ramos diferentes do julgamento, em vez de serem três variações do mesmo comportamento.

E onde ficam os casos de borda? A maioria deles deveria ser promovida de volta à camada de princípios do system prompt. “E se o usuário for agressivo” não precisa de um exemplo de conversa completa com 300 tokens; um princípio — “quando um usuário estiver irritado, mantenha o tom equilibrado e o foco em resolver o problema” — dá conta do recado. Exemplos ensinam qual é a cara do comportamento esperado; princípios ensinam em que direção raciocinar quando algo novo aparece. Você talvez já tenha notado: acrescentar um caso de borda à lista de exemplos e acrescentar um ramo ao system prompt são duas faces da mesma moeda — as duas são remendos em altitude baixa, e só subir para a camada de princípios de fato veda a brecha.

## Um checklist bloco a bloco: pondo a anatomia para trabalhar

Condensando esta lição em algo executável. Antes de acrescentar qualquer coisa ao contexto, rode a pergunta correspondente:

| Bloco | Pergunta a fazer |
|---|---|
| System prompt | A altitude está certa? Diante de um caso que você não escreveu, ele dá ao modelo uma direção a partir da qual julgar?[^S1] |
| Arquivos sempre carregados | Esta linha se aplica de forma ampla? Removê-la causaria erros?[^S4] |
| Definições de ferramentas | O propósito está claro o bastante? Ela se sobrepõe a outra ferramenta? O retorno é podado por padrão?[^S1] |
| Exemplos | Cada um representa uma classe de comportamento? A lista está crescendo de novo?[^S1] |
| Histórico de mensagens | Não tratado aqui — veja a Lição 4, “Compactação e notas: gestão de contexto para tarefas longas” |

Há mais um princípio que vale levar desta lição, além da tabela. Escrevendo sobre a construção de sistemas de agentes, a Anthropic oferece um senso de proporção: "you should consider adding complexity only when it demonstrably improves outcomes."[^S2] (você deveria considerar adicionar complexidade apenas quando ela comprovadamente melhora os resultados.) O contexto original é arquitetura de sistemas, mas vale igualmente para cada bloco do contexto — mais uma ferramenta, mais uma regra, mais um exemplo é tudo complexidade adicionada. Exija de cada acréscimo a prova de que ele compra melhoria de comportamento antes de deixá-lo embarcar.

Isso é uma passada por todos os três blocos estáticos. Mas há outra pergunta esperando: parte da informação não deveria ser carregada na janela de antemão de jeito nenhum — em vez de adivinhar do que o modelo vai precisar, deixe o agente ir buscar em tempo de execução. É disso que trata a próxima lição.

<!-- exercises -->
## 💻 Exercícios

### Nível 1: Reescreva uma lista de regras para a altitude certa

Aqui está o system prompt de um agente de aprovação de despesas:

```text
Você é um assistente de aprovação de despesas. Aprove de acordo com estas regras:
1. Recibos de táxi abaixo de $100: aprove diretamente.
2. Recibos de táxi de $100 ou mais: peça uma descrição do trajeto.
3. Recibos de refeição entre 12:00 e 14:00 em dia útil: aprove diretamente.
4. Recibos de refeição em fim de semana: recuse.
5. Material de escritório na categoria "eletrônicos": envie a um gerente.
6. Recibos cujo nome de faturamento não bate com o nome da empresa: recuse.
7. Se nada acima se encaixar, recuse com a observação "procure a administração do escritório".
```

Sob esse conjunto, um recibo de hotel de uma viagem a trabalho não é pego por regra nenhuma e é recusado pela regra 7 toda vez; um recibo de jantar em dia útil não satisfaz nem a regra 3 nem a regra 4 e cai no mesmo pega-tudo. Faça duas coisas: (1) nomeie em qual extremo de falha este prompt se situa, e explique por que esse sintoma é inevitável para esse tipo de prompt; (2) reescreva-o na altitude certa, com uma versão que cubra os dois casos não tratados acima.

<!-- rubric -->
- Identifica que o prompt se situa no extremo da “lógica hardcoded e frágil”, e explica que o pega-tudo engolindo casos novos é o resultado inevitável de regras enumeradas (os casos que você não escreveu sempre são mais numerosos do que os que escreveu)
- A reescrita é construída sobre dois ou três princípios de julgamento (tamanho do valor, quão rotineira é a categoria, se a documentação é consistente) em vez de enumerar cenários um a um, de modo que recibos de hotel, jantares em dia útil e outros casos novos caem dentro de um princípio
- Mantém os limites rígidos genuínos (um nome de faturamento divergente tem de ser recusado, valores altos vão para um gerente) e dá um caminho para os casos incertos (recusar com uma observação sobre o que está faltando) em vez de deixar o modelo adivinhar
<!-- answer -->
(1) Este prompt se situa no extremo da “lógica hardcoded e frágil”: ele define comportamento enumerando cenários específicos, e cada regra cobre apenas o caso que soletra. A enumeração nunca consegue alcançar as combinações que o mundo real produz — recibos de hotel e jantares em dia útil não estão na lista, então só podem cair no pega-tudo. Acrescentar a regra 8 e a regra 9 não toca no problema estrutural; só deixa a lista mais longa e os conflitos mais prováveis.

(2) Uma reescrita de referência na altitude certa:

```text
Você é um assistente de aprovação de despesas. Seu objetivo é destravar aprovações rapidamente sem violar a política.

Princípios de julgamento:
- Aprove diretamente quando o valor for baixo, a categoria for rotineira e a documentação estiver completa e consistente.
- Peça uma explicação antes de decidir quando o valor for mais alto, ou quando ele estiver fora do normal para aquela categoria (uma refeição cara de madrugada, por exemplo).
- Quando a documentação não bater com o que está sendo pedido, recuse e diga exatamente o que falta, para que a pessoa consiga corrigir de uma vez.

Limites rígidos (nunca ultrapasse):
- Um nome de faturamento que não bate com o nome da empresa é sempre recusado.
- Qualquer coisa acima de $1000 em um único pedido vai para um gerente.
- Não chute quando estiver em dúvida: recuse e diga qual documentação é necessária.
```

Um recibo de hotel de viagem a trabalho agora cai dentro do julgamento geral sobre valor, categoria e consistência da documentação. Um jantar em dia útil com valor normal em categoria rotineira cai no primeiro princípio e é aprovado; se for do tipo caro e de madrugada, que fica fora do normal, cai em “peça uma explicação”. As linhas vermelhas genuínas enterradas nas sete regras originais (nome de faturamento divergente, e categorias de valor alto como eletrônicos, que o teto de valor absorve) sobrevivem como limites rígidos, e todo o resto é promovido à camada de princípios.
<!-- hint -->
Vá regra a regra e pergunte: isto é “um princípio que vale para toda despesa” ou “um caso especial para um cenário específico”? Quanto mais casos especiais, mais baixa a altitude.
<!-- hint -->
Separe as linhas vermelhas de conformidade que precisam valer incondicionalmente e liste-as à parte como limites rígidos, depois tente dobrar as regras restantes em dois ou três princípios de julgamento — e faça o autoteste de cobertura perguntando em qual princípio um recibo de hotel cairia.

### Nível 2: Faça uma auditoria de custo de contexto em ferramentas e exemplos

Você herdou um agente de suporte de e-commerce. O contexto dele guarda as três definições de ferramenta abaixo (schemas abreviados), além de uma lista few-shot de 12 exemplos cujo conteúdo é todo de casos de borda como “o que fazer quando o usuário comete um erro de digitação” e “o que fazer quando o usuário faz a mesma pergunta duas vezes”:

```json
[
  {
    "name": "query_order",
    "description": "Consulta um pedido.",
    "parameters": { "order_id": "string" }
  },
  {
    "name": "search_order_by_text",
    "description": "Consulta pedidos, suporta busca aproximada.",
    "parameters": { "text": "string" }
  },
  {
    "name": "get_order_full_dump",
    "description": "Retorna todos os campos de um pedido, incluindo mais de 40 campos internos e o log de auditoria completo.",
    "parameters": { "order_id": "string" }
  }
]
```

Faça uma auditoria de custo de contexto: (1) aponte a sobreposição de funcionalidade na lista de ferramentas e apresente um plano de fusão; (2) explique como a ferramenta fundida torna seu retorno eficiente em tokens sem deixar a informação necessária fora de alcance; (3) apresente um plano de reformulação da lista de exemplos: que tipo de exemplo deve ficar, e quem deve cuidar dos casos de borda.

<!-- rubric -->
- Reconhece que as três ferramentas se sobrepõem em “consultar um pedido”, propõe fundi-las em uma única ferramenta, e explica que ferramentas duplicadas de fronteiras difusas empurram a decisão “qual delas?” para cada turno de inferência
- A ferramenta fundida retorna alguns campos-chave por padrão, com o conjunto completo disponível sob demanda (um parâmetro detail, por exemplo), e sua descrição enuncia o formato do retorno e o comportamento quando nada corresponde
- O plano de exemplos mantém um pequeno número de exemplos canônicos cobrindo comportamentos típicos distintos, com a maioria dos casos de borda promovida a princípios no system prompt em vez de enumerada um exemplo por vez
<!-- answer -->
(1) As três ferramentas fazem o mesmo trabalho — consultar um pedido: `query_order` por ID exato, `search_order_by_text` por texto aproximado, `get_order_full_dump` por ID para tudo. Cada definição é vaga por si só e sobreposta às outras, então antes de cada chamada o modelo tem de deduzir onde ficam as fronteiras entre elas — fronteiras que as definições nunca enunciam. Funda em uma ferramenta só:

```json
[
  {
    "name": "search_orders",
    "description": "Consulta um pedido pelo número exato, ou busca pedidos por texto. Retorna no máximo 5 resultados por padrão, cada um apenas com número do pedido, status, valor e data do pedido. Para o conjunto completo de campos, reconsulte um único número de pedido com detail=true. Retorna uma lista vazia quando nada corresponde; não dá erro.",
    "parameters": {
      "query": "Número do pedido ou texto de busca",
      "detail": "Booleano, se deve retornar o conjunto completo de campos, padrão false"
    }
  }
]
```

(2) A eficiência em tokens vem de “podar por padrão, conjunto completo sob demanda”: as perguntas do dia a dia só precisam de status e valor, então é só isso que volta por padrão; quando os campos internos forem genuinamente necessários, `detail=true` puxa o registro completo de um pedido em vez de inundar o histórico de mensagens com mais de quarenta campos e um log de auditoria a cada chamada — conteúdo que fica no histórico e é cobrado de novo em cada turno seguinte. Enunciar o teto de resultados e o comportamento de resultado vazio na descrição significa que o modelo nunca precisa adivinhar como é uma consulta sem resultado.

(3) Troque os 12 exemplos de casos de borda por 3 canônicos, cada um representando uma classe de comportamento: um exemplo de fluxo padrão que consulta um pedido e responde normalmente, um exemplo de julgamento em que a culpa é nossa e a compensação é oferecida de saída, e um exemplo de escalonamento em que a solicitação excede a alçada do agente e vai para um humano. Erros de digitação e perguntas repetidas não merecem um exemplo completo de algumas centenas de tokens cada; promova-os a um princípio no system prompt (“leia a intenção do usuário em vez da grafia literal; quando uma pergunta se repetir, cheque primeiro se a resposta anterior a resolveu”).
<!-- hint -->
Comece contando quantas ferramentas conseguem realizar o mesmo trabalho, depois cheque se as descrições delas deixam claro de bate-pronto qual usar em cada situação.
<!-- hint -->
“Canônico” significa um exemplo que representa uma classe de comportamento. Separe primeiro os comportamentos esperados em classes (fluxo padrão, assumir a responsabilidade, escalonamento…) e escolha o mais ilustrativo por classe; para casos de borda que não encaixam em classe nenhuma, considere um princípio em vez de um exemplo.
<!-- /exercises -->

## Recapitulação

- O contexto de uma requisição são quatro blocos — system prompt, definições de ferramentas, exemplos, histórico de mensagens. Eles compartilham um único orçamento de atenção, e cada novo token o esgota em alguma medida[^S1].
- O contexto é um recurso finito com retornos marginais decrescentes[^S1]; perguntar bloco a bloco “o que esses tokens compraram” é bem mais acionável do que vagamente “ajustar o prompt”.
- Um system prompt tem dois extremos de falha — ramos hardcoded e frágeis, e palavras de ordem vagas que não carregam sinal. A altitude certa é específica o bastante para guiar o comportamento e ainda flexível o bastante para deixar heurísticas fortes ao modelo[^S1], e “princípios mais limites rígidos” é a estrutura prática para chegar lá.
- Conteúdo sempre carregado como o CLAUDE.md é lido no início de cada conversa: inclua apenas o que se aplica de forma ampla, e rode o teste de remoção em cada linha, porque arquivos inchados fazem o modelo ignorar as suas instruções de verdade[^S4].
- Ferramentas gastam orçamento nas duas pontas, definição e retorno: mantenha o uso pretendido extremamente claro, a sobreposição mínima e os retornos eficientes em tokens[^S1]; ferramentas que nunca são chamadas continuam sendo cobradas por inteiro a cada turno.
- Cure alguns exemplos diversos e canônicos em vez de enfiar uma lista interminável de casos de borda[^S1]; a maioria dos casos de borda pertence de volta à camada de princípios.
- Antes de acrescentar qualquer complexidade ao contexto, lembre o senso de proporção da Anthropic: acrescente apenas quando ela comprovadamente melhora os resultados[^S2].

[>> Lição 3: Recuperação just-in-time: deixando o agente buscar o próprio contexto](./03-just-in-time-context.md)
