# Lição 3: Few-shot learning: guiando a IA com exemplos

> Objetivos de aprendizado:
> - Entender a diferença entre zero-shot, one-shot e few-shot
> - Aprender a usar de 2 a 5 exemplos para fazer a IA captar um padrão
> - Dominar os princípios de escolha de exemplos de alta qualidade
>
> Pré-requisitos: [<< Lição 2: A estrutura básica de um prompt](./02-prompt-structure.md) | Próxima: [Lição 4 >>](./04-chain-of-thought.md)

## Quando uma descrição é menos clara que um exemplo

Você quer que a IA gere dados num formato específico — digamos, “extraia os fatos principais deste artigo e devolva em JSON”. Você passa um bom tempo no prompt detalhando nomes de campos, tipos de dados, aninhamento... e a IA ainda te devolve algo com um formato diferente do que você imaginava.

Tente de outro jeito. Pare de descrever o formato e **mostre à IA 2 ou 3 exemplos bem-feitos**. Ela lê, enxerga exatamente o que você quer e acerta o formato de primeira. Esse é o poder do few-shot learning: um exemplo é mais claro que um parágrafo de descrição[^S11].

## O que é few-shot learning

**Few-shot learning** é uma técnica de prompt que conduz a IA ao padrão que você quer colocando um pequeno número de exemplos (em geral de 2 a 5) dentro do prompt[^S4][^S11]. A IA aprende, a partir desses exemplos, a relação entre entrada e saída, o formato e o estilo, e depois aplica isso a uma nova entrada.

Três formas de comparar:

- **Zero-shot**: nenhum exemplo, apenas uma instrução[^S15]
- **One-shot**: um exemplo
- **Few-shot**: de 2 a 5 exemplos[^S4]

### Zero-shot: apenas a instrução

Prompt zero-shot:
```
Classifique a avaliação de usuário abaixo como “positiva”, “negativa” ou
“neutra”.

Avaliação: Este produto funciona bem, mas é um pouco caro.
Classificação:
```

A IA pode retornar:
- “neutra” (razoável)
- “negativa” (porque menciona que é “caro”)
- “positiva com ressalvas” (uma categoria que ela inventou na hora)

Sem exemplos, a IA só pode se apoiar no próprio julgamento para os casos-limite.

### Few-shot: dê exemplos a ela

Prompt few-shot:
```
Classifique avaliações de usuários como “positiva”, “negativa” ou
“neutra”.

Exemplos:

Avaliação: O acabamento é ótimo, estou muito satisfeito com ele.
Classificação: positiva

Avaliação: Completamente inutilizável, dinheiro jogado fora.
Classificação: negativa

Avaliação: As funcionalidades são boas, mas o suporte é lento.
Classificação: neutra

Agora classifique esta avaliação:

Avaliação: Este produto funciona bem, mas é um pouco caro.
Classificação:
```

Depois de ver os exemplos, a IA entende que:
- “positiva” é para uma avaliação plenamente satisfeita
- “negativa” é insatisfação séria
- “neutra” é uma avaliação mista, com um lado bom e um lado ruim
- a saída é uma única palavra, sem explicação

Então ela retorna “neutra”, porque esta avaliação corresponde ao padrão do terceiro exemplo.

## Como o few-shot learning funciona

O few-shot learning explora a capacidade de **aprendizado em contexto** (in-context learning) de um modelo de linguagem grande[^S4]. O modelo não é retreinado; ele apenas vê alguns exemplos na conversa atual, infere a regra e a aplica.

O modelo capta três tipos de informação a partir dos exemplos:

1. **O mapeamento de entrada para saída**: que tipo de entrada produz que tipo de saída
2. **O formato e o estilo da saída**: uma resposta curta ou detalhada, JSON ou texto puro
3. **O critério para casos-limite**: como um caso ambíguo deve ser classificado

**Uma descoberta importante**: pesquisas mostram que o **formato** e a **diversidade** dos exemplos importam mais do que o fato de cada exemplo estar correto[^S4]. Mesmo que alguns rótulos dos exemplos estejam errados, a IA ainda consegue aprender um padrão útil, desde que o formato seja consistente e os exemplos cubram tipos diferentes de entrada.

## Princípios para projetar exemplos de alta qualidade

Você não pode simplesmente jogar quaisquer exemplos ali. A qualidade dos seus exemplos molda diretamente a saída da IA[^S11].

### Princípio 1: pelo menos 2, e em geral não mais que 5

- **Um exemplo** (one-shot) às vezes não basta — a IA pode tratá-lo como um caso especial
- **2 ou 3 exemplos** costumam ser suficientes para a IA captar o padrão
- **4 ou 5 exemplos** ficam para tarefas mais complexas, ou com muitos casos-limite
- **Mais de 5** dá retorno decrescente e consome uma quantidade considerável de tokens a mais

Comece com 2 e acrescente um terceiro ou um quarto apenas se os resultados não estiverem bons o bastante[^S11].

### Princípio 2: os exemplos devem ser representativos e diversos

Seus exemplos devem cobrir os diferentes tipos de entrada que a tarefa pode encontrar — ou seja, a diversidade dos exemplos[^S4].

Exemplos sem diversidade:
```
Exemplo 1: iPhone 15 Pro → celular
Exemplo 2: iPhone 14 → celular
Exemplo 3: iPhone 13 → celular

Agora classifique: MacBook Pro
```

Todo exemplo é um celular. A IA nunca viu outro tipo de produto eletrônico, então pode não saber como lidar com um.

Exemplos com diversidade:
```
Exemplo 1: iPhone 15 Pro → celular
Exemplo 2: MacBook Air → notebook
Exemplo 3: AirPods Pro → fones de ouvido

Agora classifique: iPad Pro
```

Isso cobre categorias diferentes de produto, então a IA consegue aprender uma lógica de classificação mais geral.

### Princípio 3: mantenha o formato idêntico entre os exemplos

A consistência de formato é a chave de um prompt few-shot bem-sucedido[^S4].

Formato inconsistente:
```
Exemplo 1:
Entrada: Que dia bonito
Saída: positivo

Exemplo 2:
"Esse filme foi tão chato" --> sentimento negativo

Exemplo 3: é razoável → neutro
```

O formato está todo desencontrado, então a IA não sabe se deve gerar “positivo”, “sentimento positivo” ou outra coisa.

Formato consistente:
```
Exemplo 1:
Entrada: Que dia bonito
Saída: positivo

Exemplo 2:
Entrada: Esse filme foi tão chato
Saída: negativo

Exemplo 3:
Entrada: é razoável
Saída: neutro
```

Limpo e uniforme, então a IA sabe que a saída deve ser um único adjetivo.

### Princípio 4: inclua casos-limite e exemplos que confundem

Se a tarefa tem zonas cinzentas, coloque-as nos exemplos[^S11].

**Cenário: julgar se um comentário de código é útil**

Só os exemplos óbvios:
```
Exemplo 1:
Código: x = x + 1  # soma 1
Veredito: inútil (o comentário só repete o código)

Exemplo 2:
Código: result = calculate_tax(income, deductions)  # calcula o imposto devido
Veredito: útil (explica o significado de negócio)
```

Com casos-limite incluídos:
```
Exemplo 1:
Código: x = x + 1  # soma 1
Veredito: inútil (o comentário só repete o código)

Exemplo 2:
Código: result = calculate_tax(income, deductions)  # calcula o imposto devido
Veredito: útil (explica o significado de negócio)

Exemplo 3:
Código: time.sleep(2)  # espera o limite de requisições da API ser reiniciado
Veredito: útil (explica por que esperamos, o que não é óbvio)

Exemplo 4:
Código: users = users.filter(active=True)  # filtra usuários ativos
Veredito: inútil (o nome do método já deixa isso claro)
```

Os exemplos 3 e 4 ajudam a IA a enxergar a fronteira: nem todo comentário que “explica o que o código faz” é útil. O que importa é se o código já expressa a intenção com clareza por conta própria.

```agentmentor-check
{
  "id": "prompt-engineering-few-shot-example-quality",
  "label": "Avaliação da diversidade de casos nos exemplos",
  "prompt": "Você quer que a IA transforme avaliações de produtos em JSON estruturado (com nota, prós e contras). Qual conjunto de exemplos é melhor?\n\nA:\nExemplo 1: Produto ótimo → {'score': 5, 'pros': ['boa qualidade'], 'cons': []}\nExemplo 2: É razoável → {'score': 3, 'pros': [], 'cons': []}\n\nB:\nExemplo 1: Boa qualidade, mas um pouco caro → {'score': 4, 'pros': ['boa qualidade'], 'cons': ['caro']}\nExemplo 2: Entrega rápida, embalagem intacta, produto conforme o anúncio → {'score': 5, 'pros': ['entrega rápida', 'embalagem boa', 'conforme o anúncio'], 'cons': []}\nExemplo 3: Funcionalidades de menos, não vale o preço → {'score': 2, 'pros': [], 'cons': ['poucas funcionalidades', 'custo-benefício ruim']}",
  "whyHere": "Você acabou de aprender que bons exemplos são diversos e correspondem à tarefa real. Esta verificação pega o instinto tentador de manter os exemplos curtos e simples — o que silenciosamente deixa de mostrar à IA como lidar com as avaliações de vários pontos que ela vai realmente encontrar.",
  "mode": "single",
  "choices": [
    {
      "id": "a",
      "text": "O A é melhor, porque os exemplos são curtos e não desperdiçam tokens",
      "correct": false,
      "feedback": "❌ Não exatamente: curto não é o mesmo que eficaz. Os exemplos do A são simples demais (“Produto ótimo”, “É razoável”) e nunca mostram como extrair vários prós e contras de uma avaliação complexa. Avaliações reais costumam trazer diversos pontos, e o A não cobre esse caso."
    },
    {
      "id": "b",
      "text": "O B é melhor, porque os exemplos são mais próximos de avaliações reais e cobrem casos diferentes",
      "correct": true,
      "feedback": "✓ Correto. O B mostra três casos: prós e contras juntos (exemplo 1), só prós (exemplo 2) e só contras (exemplo 3). Cada um também se aproxima de uma avaliação real em complexidade, com vários pontos reunidos. A IA consegue aprender com eles a lidar com a tarefa de verdade."
    }
  ]
}
```

## Exemplo prático: extraindo dados estruturados com few-shot

A tarefa mais comum aqui é extrair dados estruturados de um texto não estruturado.

### Tarefa: extrair campos-chave de uma vaga de emprego

Versão zero-shot (não confiável):
```
Extraia da vaga abaixo: cargo, faixa salarial, local, experiência
exigida. Devolva em JSON.

Vaga: Estamos contratando pessoa desenvolvedora Python sênior, com base
em São Paulo, 3-5 anos de experiência, R$ 140-160 mil por ano.
```

A IA pode retornar todo tipo de formato:
```json
{"title": "desenvolvedora Python", "pay": "140-160 mil", ...}
```
ou
```json
{"job": "desenvolvedora Python sênior", "salary": "R$ 140-160 mil/ano", ...}
```

Nomes de campo, formato e unidades estão todos inconsistentes.

Versão few-shot (formato estável):
```
Extraia os campos-chave de uma vaga de emprego e devolva no formato JSON
abaixo.

Exemplo 1:
Entrada: Contratando pessoa engenheira de frontend, Florianópolis, 2-3
anos de experiência, R$ 120-150 mil por ano
Saída:
{
  "position": "engenheira de frontend",
  "location": "Florianópolis",
  "experience": "2-3 anos",
  "salary": "R$ 120-150 mil/ano"
}

Exemplo 2:
Entrada: Urgente: backend Java, Belo Horizonte (Savassi), 5+ anos
obrigatórios, R$ 8-10 mil por mês
Saída:
{
  "position": "backend Java",
  "location": "Belo Horizonte (Savassi)",
  "experience": "5+ anos",
  "salary": "R$ 8-10 mil/mês"
}

Exemplo 3:
Entrada: Analista de dados, remoto, experiência não exigida, R$ 60-80 por
hora
Saída:
{
  "position": "analista de dados",
  "location": "remoto",
  "experience": "não exigida",
  "salary": "R$ 60-80/hora"
}

Agora processe esta:
Entrada: Estamos contratando pessoa desenvolvedora Python sênior, com
base em São Paulo, 3-5 anos de experiência, R$ 140-160 mil por ano.
Saída:
```

Os exemplos cobrem três unidades de salário (por ano, por mês, por hora) e três tipos de local (cidade, cidade mais região, remoto), então a IA aprende:
- usar nomes de campo em inglês
- manter a unidade de salário do texto original
- preservar o detalhe ao extrair o local
- “não exigida” também é um requisito de experiência válido

## Armadilhas comuns do few-shot

### Armadilha 1: exemplos de menos, cobertura incompleta

Dê um exemplo só e a IA verá uma instância única, não uma regra.

**Correção**: pelo menos 2, idealmente 3.

### Armadilha 2: formato inconsistente entre os exemplos

Uma seta → aqui, dois-pontos : ali, várias linhas em outro lugar.

**Correção**: escolha um formato e siga-o à risca em todos os exemplos.

### Armadilha 3: só casos fáceis, nenhum caso-limite

Dados reais têm ruído, ambiguidade e lacunas. Se os exemplos mostram apenas o caso ideal, a IA trava assim que encontra um caso-limite.

**Correção**: pelo menos um exemplo deve incluir um caso-limite (um campo ausente, uma formulação ambígua).

### Armadilha 4: exemplos demais

Passando de 5 exemplos o ganho é mínimo, e você queima tokens a mais e alonga a resposta.

**Correção**: comece com 2 ou 3 e acrescente mais só se for necessário. Raramente você precisa de mais que 5.

## Quando usar few-shot

O few-shot se encaixa melhor nestas situações:

- **Conversão de formato**: texto não estruturado → JSON, Markdown, CSV
- **Classificação**: análise de sentimento, marcação de tema, detecção de intenção
- **Imitação de estilo**: reproduzir um estilo específico de escrita ou de código
- **Regras difíceis de colocar em palavras**: como “o que torna um comentário inútil”

Quando ele não se encaixa:

- **A tarefa já é simples por si só**: “traduza isto para o inglês” não precisa de exemplos
- **Cada entrada é única**: escrita criativa, brainstorming — os exemplos só te encaixotam
- **É preciso conhecimento externo**: “quem ganhou a Copa do Mundo de 2024” — exemplos não ajudam

Uma regra prática: se você poderia mostrar 2 ou 3 exemplos a um colega humano e ele entenderia o que fazer, o few-shot é uma boa escolha.

## Recapitulação

O few-shot learning usa de 2 a 5 exemplos para fazer a IA captar o padrão que você quer, o que é mais claro do que descrevê-lo com palavras. Exemplos de alta qualidade são: moderados em número (2 a 5), representativos e diversos, idênticos em formato e inclusivos de casos-limite.

O few-shot se encaixa melhor em conversão de formato, classificação e imitação de estilo. Ao projetar exemplos, comece com 2, garanta que cubram tipos diferentes de entrada e use o mesmo formato em todos eles.

A próxima lição cobre chain-of-thought — como fazer a IA mostrar seus passos de raciocínio e melhorar a precisão em tarefas complexas.

**Próxima lição** [Chain-of-Thought: fazendo a IA mostrar seu raciocínio >>](./04-chain-of-thought.md)

<!-- exercises -->

## 💻 Exercícios

### Nível 1: Projetar exemplos de alta qualidade

Tarefa: fazer a IA classificar feedback de usuários em três categorias — “pedido de funcionalidade”, “relato de bug” ou “dúvida de uso”.

Projete 3 exemplos few-shot que cubram casos diferentes e mantenham um formato consistente.

<!-- rubric -->
- Três exemplos representando cada um uma das três categorias
- Exemplos com um caso-limite que confunde (por exemplo, “a funcionalidade não funciona” pode ser um bug ou o usuário não saber usá-la)
- Formato exatamente igual em todos os exemplos (mesma estrutura, mesmos marcadores)
- Exemplos com cara de feedback real de usuário (não frases idealizadas de uma linha)
- Motivo da classificação claro o bastante em cada exemplo para a IA aprender o critério
<!-- answer -->
**Projeto dos exemplos:**

```
Classifique o feedback do usuário como: pedido de funcionalidade / relato
de bug / dúvida de uso

Exemplo 1:
Feedback: Queria que desse para exportar os dados em lote para o Excel.
Hoje eu preciso copiar linha por linha, o que é um saco.
Classificação: pedido de funcionalidade

Exemplo 2:
Feedback: Depois que clico em “Salvar” a página trava e não acontece
nada. Esperei 5 minutos, sem resposta, e depois de atualizar os dados não
tinham sido salvos.
Classificação: relato de bug

Exemplo 3:
Feedback: Não consigo achar onde troco o e-mail da minha conta. Tentei em
configurações pessoais e em gerenciamento de conta e não vi a opção.
Classificação: dúvida de uso

Agora classifique este feedback:
Feedback: [cole o feedback do usuário]
Classificação:
```

**Por que estes exemplos funcionam:**
1. **Diversidade**: três exemplos distintos cobrem as três categorias
2. **Fronteiras claras**:
   - O exemplo 1 diz “queria que desse para”, então é um pedido de funcionalidade
   - O exemplo 2 descreve uma falha concreta (trava, não salva), então é um bug
   - O exemplo 3 diz “não consigo achar”, então é uma dúvida de uso, não uma funcionalidade ausente
3. **Formato consistente**: todos usam o formato “Feedback: [texto] / Classificação: [categoria]”
4. **Linguagem real**: não um simples “quero uma funcionalidade nova”, mas o jeito como um usuário de fato escreve

<!-- hint -->
Quando você projeta exemplos, pergunte primeiro: qual caso é o mais fácil de classificar errado? Por exemplo, “não consigo achar uma funcionalidade” é uma dúvida de uso ou uma funcionalidade ausente? Use um exemplo para fixar essa fronteira.
<!-- hint -->
Confira se seus três exemplos compartilham exatamente o mesmo formato: mesma ordem de campos, mesma pontuação, mesmas quebras de linha. A IA copia de perto o formato dos exemplos.

### Nível 2: Melhorar um prompt few-shot existente

Aqui vai um prompt few-shot que não funciona bem. Encontre os problemas e melhore-o:

```
Extraia os prós e contras de uma avaliação de produto, gere JSON.

Exemplos:
"qualidade razoável" -> {"pros": ["qualidade"], "cons": []}
"caro demais, e entrega lenta" -> {"pros": [], "cons": ["caro", "entrega lenta"]}

Agora processe: [texto da avaliação]
```

Problema: a saída da IA é instável — às vezes os nomes dos campos saem em outro idioma, às vezes os prós vêm como adjetivos (“bom”) em vez de pontos concretos (“qualidade”).

<!-- rubric -->
- Identificação de pelo menos 3 problemas que causam a saída instável
- Exemplos melhorados perfeitamente consistentes e claros no formato
- Exemplos cobrindo o caso complexo (prós e contras juntos, vários pontos)
- Nomenclatura dos campos e estilo do conteúdo explicitados
- Explicação ou restrições necessárias acrescentadas
<!-- answer -->
**Problemas identificados:**
1. **Exemplos simples demais**: o primeiro exemplo é uma expressão curta e nunca mostra como extrair vários pontos de uma avaliação complexa
2. **Sem critério unificado**: “qualidade” e “caro” estão em níveis de abstração diferentes (um é substantivo, o outro é adjetivo)
3. **Exemplos insuficientes**: são só 2, poucos demais para estabelecer um padrão estável
4. **Sem casos-limite**: nunca mostra a situação complexa de “prós e contras juntos”

**Prompt melhorado:**

```
Extraia os prós e contras de uma avaliação de produto e gere JSON.

Observações sobre os campos:
- pros: lista de pontos fortes, como sintagmas nominais curtos (tipo
  "entrega rápida", "embalagem boa"), não adjetivos (não "bom" nem
  "legal")
- cons: lista de pontos fracos, mesmo formato

Exemplo 1:
Entrada: Qualidade ótima, acabamento caprichado, nenhum problema depois
de uma semana de uso.
Saída:
{
  "pros": ["boa qualidade", "acabamento caprichado", "confiável"],
  "cons": []
}

Exemplo 2:
Entrada: Um pouco caro, e a entrega demorou uma semana para chegar, mas o
produto em si é bem bom.
Saída:
{
  "pros": ["boa qualidade do produto"],
  "cons": ["caro", "entrega lenta"]
}

Exemplo 3:
Entrada: Funcionalidades de menos, só as operações básicas, todas as
avançadas estão atrás de paywall.
Saída:
{
  "pros": [],
  "cons": ["poucas funcionalidades", "funcionalidades avançadas atrás de paywall"]
}

Agora processe:
Entrada: [texto da avaliação]
Saída:
```

**O que melhorou:**
1. Acrescentadas observações sobre os campos, deixando explícito o uso de “sintagmas nominais”, não de adjetivos
2. Três exemplos cobrem três casos: só prós, prós e contras juntos, só contras
3. Os exemplos são mais complexos, mostrando como extrair vários pontos de uma frase longa
4. Formato perfeitamente consistente: todo exemplo tem um marcador “Entrada:” e “Saída:”, com indentação de JSON uniforme
5. Um marcador “Entrada:” antecede a saída, marcando onde a tarefa começa

<!-- hint -->
Quando um prompt few-shot está instável, confira primeiro: (1) O formato dos exemplos é consistente? (2) Os exemplos são simples demais? (3) Eles cobrem casos-limite?
<!-- hint -->
Se os nomes de campo ou o estilo do conteúdo da IA ficam mudando, acrescente um bloco de “observações sobre os campos” ou de “especificação da saída” no topo do prompt para fixar o formato que você quer. Os exemplos mostram a forma; a especificação declara o critério.

<!-- /exercises -->
