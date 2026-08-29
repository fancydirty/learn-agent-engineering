# Lição 2: A estrutura básica de um prompt

> Objetivos de aprendizado:
> - Dominar os quatro elementos centrais de um prompt
> - Aprender a transformar um pedido vago numa instrução estruturada
> - Entender como cada elemento molda a saída da IA
>
> Pré-requisitos: [<< Lição 1: O que é um prompt e por que isso importa](./01-what-is-prompt.md) | Próxima: [Lição 3 >>](./03-few-shot-learning.md)

## Por que a IA vive respondendo à pergunta errada

Você pede à IA para “escrever um resumo do projeto” e ela te entrega um modelo genérico sem nenhum detalhe real do seu projeto. Onde foi que deu errado? Não é que falte capacidade à IA. Faltavam na sua instrução as peças que importam: que projeto é esse, para quem é, o que ele deve conter e que formato deve ter.

Um prompt eficaz não é uma linha jogada por cima do muro. É uma instrução completa construída a partir de quatro elementos. Esta lição cobre quais são esses quatro elementos, o que cada um faz e como combiná-los.

## Os quatro elementos de um prompt

Um prompt claro costuma conter quatro partes[^S2]:

1. **Papel** — diga à IA a partir de que identidade ela deve responder
2. **Tarefa** — declare exatamente o que você quer que ela faça
3. **Formato** — especifique a estrutura e o estilo da resposta
4. **Restrições** — defina os limites: escopo, tamanho, tom e por aí vai

Você não precisa dos quatro toda vez, mas quanto mais complexa a tarefa, mais elementos ela exige. Vamos olhar um por um.

### 1. Papel: a partir de que identidade a IA deve responder

O **papel** diz à IA com que perspectiva e nível de especialidade responder[^S3]. A mesma pergunta recebe uma resposta completamente diferente se quem responde é um especialista técnico ou uma professora do ensino fundamental.

Compare estes dois prompts:

Sem papel:
```
Explique o que é Docker.
```

A IA pode te dar:
- Uma definição de dicionário (“Docker é uma plataforma de conteinerização de código aberto...”)
- Uma resposta que presume que você já conhece Linux, virtualização e imagens

Com papel:
```
Você é um professor que explica bem conceitos técnicos por meio de
analogias do dia a dia. Explique o que é Docker para um gerente de
produto que não tem nenhuma formação em programação.
```

Agora a IA vai:
- Recorrer a analogias do dia a dia (“Docker é como um contêiner de carga padronizado...”)
- Evitar jargão, ou explicar cada termo que usar
- Focar no “por que você iria querer isso” em vez de “como isso é construído”

**Padrões comuns de papel:**
- Identidade profissional: “Você é um engenheiro Python sênior”
- Estilo de ensino: “Você é um mentor que ensina por meio de exemplos”
- Perspectiva do público: “Você está explicando isso para uma liderança não técnica”
- Tom: “Você é um assistente simpático e paciente”

### 2. Tarefa: declare exatamente o que você quer que seja feito

A **tarefa** é o coração do prompt. Ela responde à pergunta “o que você quer que seja feito”[^S2]. Uma descrição vaga da tarefa é o problema mais comum de todos.

Compare:

Tarefa vaga:
```
Analise este código.
```

A IA não faz ideia de que ângulo adotar: desempenho? segurança? legibilidade? bugs?

Tarefa clara:
```
Analise este código Python em busca de gargalos de desempenho. Aponte
quais operações podem ficar lentas com conjuntos de dados grandes e
sugira como corrigi-las.
```

Agora a IA sabe que:
- O foco é desempenho, não outras preocupações
- Ela deve raciocinar sobre o caso de conjuntos de dados grandes
- Ela não deve só apontar problemas, deve propor correções

**Uma tarefa tem três camadas:**
1. **Verbo** — resumir, analisar, gerar, editar, revisar...
2. **Objeto** — sobre que conteúdo ela age (código, um documento, dados...)
3. **Objetivo** — que resultado alcançar, que problema resolver

### 3. Formato: especifique a estrutura da resposta

O **formato** diz à IA como organizar a resposta[^S2]. Sem restrição de formato, a IA escolhe o que achar adequado: pode ser um bloco de texto corrido, pode ser uma lista, pode ser uma tabela.

Compare:

Sem requisito de formato:
```
Resuma os pontos principais deste artigo.
```

A IA pode te dar:
- Três parágrafos de descrição
- Uma lista de dez tópicos
- Uma única conclusão de uma frase

Formato especificado:
```
Resuma este artigo neste formato:

Argumento central: [uma frase]

Evidências de apoio (3 pontos):
1. [ponto 1, uma frase]
2. [ponto 2, uma frase]
3. [ponto 3, uma frase]

Conclusão: [uma frase]
```

A IA vai seguir essa estrutura à risca, e você pode colar o resultado direto no seu próprio documento.

**Restrições de formato comuns:**
- Listas: “liste três pontos principais em tópicos”
- Tabelas: “compare os prós e contras das duas opções numa tabela”
- Código: “gere apenas código executável, sem explicação”
- Seções: “divida em contexto, análise e recomendação”
- Tamanho: “mantenha cada ponto abaixo de 50 palavras”

### 4. Restrições: defina os limites

As **restrições** são as regras de “não faça...” e “apenas...” que impedem a IA de sair do trilho[^S2].

Compare:

Sem restrições:
```
Recomende alguns recursos para aprender Python.
```

A IA pode te dar:
- Uma dúzia de livros, cursos e sites
- Coisas de iniciante a avançado
- Uma mistura de pago e gratuito, em português e em outros idiomas

Com restrições:
```
Recomende 3 recursos para aprender Python. Requisitos:
- Totalmente gratuitos
- Em português
- Adequados para quem está começando do zero
- Com projetos práticos

Descreva cada recurso em duas frases: a primeira diz o que ele é, a
segunda diz por que ele serve para quem está começando.
```

Agora a IA vai:
- Filtrar com precisão os recursos que se encaixam
- Deixar de fora cursos pagos e material em outro idioma
- Explicar cada escolha no formato que você pediu

**Tipos comuns de restrição:**
- Tamanho: “no máximo 200 palavras”
- Escopo: “cubra apenas métodos de 2023 em diante”
- Tom: “use linguagem acadêmica formal”
- Exclusão: “não inclua nenhuma opção paga”
- Prioridade: “prefira ferramentas de código aberto”

## Combinando os quatro elementos

Um prompt completo reúne os quatro elementos. Aqui vai um cenário real.

**Cenário: pedir à IA que redija a ata de uma reunião**

Só a tarefa, faltando os outros elementos:
```
Escreva a ata a partir desta transcrição de reunião.
```

Os quatro elementos:
```
[Papel] Você é um assistente de projetos experiente.

[Tarefa] Escreva a ata da reunião a partir da transcrição abaixo.

[Formato] Organize assim:
- Dados da reunião (horário, participantes)
- Questões discutidas (ordenadas por prioridade)
- A decisão tomada em cada questão
- Itens de ação (responsável + prazo)

[Restrições]
- Registre apenas discussões que chegaram a uma conclusão clara; pule o
  bate-papo informal
- Todo item de ação precisa ser acionável (um verbo + uma entrega
  verificável)
- Mantenha o texto todo abaixo de 500 palavras

Transcrição:
[cole a transcrição aqui]
```

Este prompt é claro, completo e reutilizável. Transforme a parte da transcrição num espaço reservado e você tem um modelo para rodar quantas vezes quiser. Na próxima reunião, você só troca a transcrição.

```agentmentor-check
{
  "id": "prompt-engineering-structure-identify-element",
  "label": "Identificação do elemento ausente no prompt",
  "prompt": "Qual elemento-chave está faltando no prompt abaixo?\n\n“Por favor, escreva um código JavaScript que implemente o login de usuário, usando um token JWT para autenticação.”\n\nA: Falta o papel\nB: Falta a tarefa\nC: Falta o formato\nD: Faltam as restrições",
  "whyHere": "Perceber qual elemento falta a um prompt é o primeiro movimento para melhorá-lo. Este prompt tem uma tarefa clara, mas deixa a forma da saída em aberto — e é exatamente essa a armadilha que quem está começando não enxerga.",
  "mode": "single",
  "choices": [
    {
      "id": "a",
      "text": "Falta o papel",
      "correct": false,
      "feedback": "❌ Não exatamente: a tarefa aqui já é específica (escrever JS, implementar o login, usar JWT). Para uma tarefa de geração de código, o papel não é o mais importante que está faltando."
    },
    {
      "id": "b",
      "text": "Falta a tarefa",
      "correct": false,
      "feedback": "❌ Não exatamente: a tarefa está detalhada — escrever JavaScript, implementar o login, usar um token JWT. Essa parte está presente."
    },
    {
      "id": "c",
      "text": "Falta o formato",
      "correct": true,
      "feedback": "✓ Correto. O prompt nunca diz que forma o código deve ter: um arquivo completo? só a função central? com comentários? com tratamento de erros? A IA só pode adivinhar. Acrescentar “gere apenas uma função executável, com tratamento de erros completo e comentários” deixa isso claro."
    },
    {
      "id": "d",
      "text": "Faltam as restrições",
      "correct": false,
      "feedback": "❌ Não exatamente: restrições (como “sem bibliotecas externas” ou “menos de 50 linhas”) não são obrigatórias aqui. A ausência delas não torna o prompt fundamentalmente pouco claro."
    }
  ]
}
```

## Prática: reescrevendo um prompt vago

Agora vamos praticar a transformação de um prompt vago num prompt estruturado.

### Prompt original (vago)
```
Otimize este código para mim.
```

### Passos da reescrita

**Passo 1: fixe a tarefa**
- Otimizar em relação a quê? Desempenho, legibilidade ou segurança?
- Digamos que o objetivo é desempenho

**Passo 2: acrescente um papel**
- A perspectiva de quem revisa código é a que melhor se encaixa

**Passo 3: especifique o formato**
- Estruture a saída: liste primeiro os problemas, depois as correções

**Passo 4: acrescente restrições**
- Não mude o comportamento
- Priorize os ganhos de desempenho mais evidentes

### Prompt reescrito
```
Você é um engenheiro sênior de desempenho.

Analise o código Python abaixo em busca de problemas de desempenho e
sugira correções.

Gere a saída neste formato:
1. Gargalos atuais (ordenados por impacto, do maior para o menor)
   - Descrição do gargalo
   - A partir de que volume de dados ele vira problema
2. Plano de otimização
   - Mudança específica a fazer
   - O trecho de código otimizado
   - Ganho de desempenho esperado

Restrições:
- Não mude a interface de entrada/saída da função
- Não introduza novas dependências externas
- Priorize mudanças que deem pelo menos 2x de ganho

Código:
[cole o código aqui]
```

Comparada ao original, a reescrita diz à IA com clareza: que papel assumir, o que fazer, como gerar a saída e sob que limites.

## Usando os quatro elementos com flexibilidade

Os quatro elementos não são dogma, são uma lista de verificação:

- **Tarefas simples** podem usar só 2-3 elementos: “Resuma o argumento central deste artigo em três frases” (tarefa + formato)
- **Tarefas complexas** precisam dos quatro: “Você é um redator técnico. Reescreva esta documentação de API como um tutorial para iniciantes, com exemplos de código e observações sobre erros comuns, em menos de 1000 palavras”
- **Tarefas exploratórias** precisam de menos restrições: “Por que ângulos poderíamos abordar este problema?”
- **Tarefas de execução** precisam de mais restrições: “Gere a saída estritamente no formato JSON a seguir, sem explicação”

O teste é simples: **depois de ler seu prompt, a IA consegue saber exatamente o que fazer e que resultado produzir?** Se você mesmo não consegue responder isso com clareza, a IA tem ainda menos chance.

## Recapitulação

Um prompt eficaz contém quatro elementos: papel (que identidade), tarefa (o que fazer), formato (como organizar) e restrições (quais são os limites). Você não usa os quatro toda vez, mas quanto mais complexa a tarefa, mais completo precisa ser o conjunto de elementos.

O processo de reescrita: primeiro fixe a tarefa central, depois decida que papel, que formato de saída e que restrições ela exige. Expanda uma linha vaga numa instrução estruturada e a qualidade da saída da IA sobe drasticamente.

A próxima lição cobre few-shot learning: como usar de 2 a 5 exemplos para fazer a IA entender o padrão que você quer, em vez de descrevê-lo com palavras.

**Próxima lição** [Few-shot learning: guiando a IA com exemplos >>](./03-few-shot-learning.md)

<!-- exercises -->

## 💻 Exercícios

### Nível 1: Desmontar um prompt e reconstruí-lo

Aqui vai um prompt bagunçado:

```
Escreva uma função, a entrada é uma lista de strings, a saída é o
resultado sem duplicatas, faça rápido, use Python, coloque comentários.
```

Reorganize-o usando o modelo dos quatro elementos (papel, tarefa, formato, restrições) para que fique mais claro.

<!-- rubric -->
- Papel definido, se a tarefa pedir
- Tarefa clara: tipo de entrada, tipo de saída, função central
- Formato explícito: estilo de código, requisitos de comentário, necessidade ou não de exemplo
- Restrições razoáveis: requisito de desempenho, limites de dependências e assim por diante
- Estrutura geral clara o bastante para a IA captar todos os requisitos numa leitura
<!-- answer -->
**Prompt reconstruído:**

```
[Tarefa] Escreva uma função Python que remove duplicatas de uma lista de
strings.

[Entrada/saída]
- Entrada: List[str], pode conter strings repetidas
- Saída: List[str], sem duplicatas e preservando a ordem original

[Requisitos]
- Complexidade de tempo: O(n), implementada com uma tabela hash
- Preserve a ordem original de aparição (não basta fazer set() e depois
  list(), o que embaralha a ordem)
- Use apenas a biblioteca padrão do Python, sem dependências de terceiros

[Estilo de código]
- Inclua type hints
- Inclua uma docstring cobrindo o uso e a complexidade de tempo
- Sem comentários linha a linha dentro da função (o código deve se
  explicar sozinho)

Exemplo:
Entrada: ["maçã", "banana", "maçã", "cereja", "banana"]
Saída:   ["maçã", "banana", "cereja"]
```

**Por que isso é melhor:**
1. A tarefa está limpa e dividida em entrada/saída, requisitos e estilo de código
2. O requisito de desempenho é específico: não um vago “faça rápido”, mas um “O(n)” explícito e um método de implementação
3. Aponta uma armadilha comum: usar set() direto embaralha a ordem
4. Dá um exemplo, eliminando ambiguidade
5. O requisito de estilo de código é equilibrado: uma docstring, mas sem excesso de comentários

<!-- hint -->
O prompt original enfia todos os detalhes numa frase só, então nada se destaca. Tente dividir em alguns parágrafos: declare primeiro entrada/saída, depois o requisito de desempenho, depois o estilo de código.
<!-- hint -->
“Faça rápido” é subjetivo; a IA não sabe o quão rápido você quer. Troque por um padrão objetivo: uma complexidade de tempo, ou “processe 1 milhão de registros em menos de um segundo”.

### Nível 2: Projetar um prompt completo para uma tarefa complexa

Cenário: você precisa que a IA revise um documento técnico (um guia de uso de API), encontre os pontos em que iniciantes provavelmente vão se confundir e sugira melhorias.

Projete um prompt completo com os quatro elementos.

<!-- rubric -->
- Papel adequado: redator técnico, revisor de documentação ou a perspectiva do público-alvo
- Tarefa específica: dimensões de revisão claras (clareza, completude, precisão etc.)
- Formato de saída estruturado: fácil de revisar e tratar item por item
- Restrições razoáveis: prioridades da revisão, aspectos que não precisam ser checados
- Casos-limite considerados: como lidar com as partes que não têm problema
<!-- answer -->
**Exemplo de prompt:**

```
[Papel] Você é um revisor de documentação técnica focado em deixar a
documentação amigável para iniciantes.

[Tarefa] Revise o guia de uso de API abaixo e encontre os pontos em que
um iniciante provavelmente vai interpretar errado ou travar.

[Dimensões da revisão] (ordenadas por prioridade)
1. Clareza: os termos estão explicados, os exemplos estão completos e
   executáveis
2. Completude: faltam passos importantes, o tratamento de erros está
   descrito
3. Ordenação: segue a trajetória de aprendizado de um iniciante (do
   simples ao complexo)
4. Armadilhas comuns: avisa sobre os erros fáceis de cometer

[Formato de saída]
Para cada problema encontrado, gere:
- Local: qual parágrafo ou bloco de código
- Tipo de problema: clareza / completude / ordenação / armadilha
- O problema específico: onde um iniciante travaria, e por quê
- Correção sugerida: exatamente o que mudar (1-2 frases, sem reescrever
  a seção inteira)

[Restrições]
- Aponte apenas problemas que realmente atrapalham o entendimento de um
  iniciante; não implique com escolha de palavras
- Não revise o desempenho nem a segurança do código (esta documentação é
  para ensinar, não é código de produção)
- Se uma seção estiver bem escrita, apenas diga “esta parte está clara” e
  siga em frente
- Gere no máximo 10 problemas (os de maior prioridade)

Documento:
[cole o documento]
```

**Por que este prompt funciona:**
1. **Papel**: revisor de documentação + foco em ser amigável para iniciantes dá à IA uma perspectiva clara
2. **Divisão da tarefa**: quatro dimensões de revisão ordenadas por prioridade, para a IA saber onde concentrar atenção
3. **Formato de saída**: quatro campos estruturados, fáceis de processar depois
4. **Restrições claras**: diz o que NÃO fazer (não implicar com palavras, não revisar desempenho), o que mantém a IA no trilho
5. **Tratamento dos casos-limite**: diz como lidar com o caso sem problema, evitando textos inúteis de “esta parte está ótima”

<!-- hint -->
A chave para projetar um prompt de tarefa complexa: descubra de que ângulos você quer que a IA examine o problema e depois dê uma prioridade a cada ângulo. Não deixe a IA decidir sozinha o que importa.
<!-- hint -->
Projete o formato de saída em torno de “como você vai usar o resultado”. Se você vai editar o documento item por item, gere “local + problema + correção”. Se você vai gerar um relatório, gere “resumo + lista detalhada”.

<!-- /exercises -->
