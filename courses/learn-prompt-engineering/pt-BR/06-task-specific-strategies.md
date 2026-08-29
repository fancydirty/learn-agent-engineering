# Lição 6: Estratégias de prompt para tarefas diferentes

> Objetivos de aprendizado:
> - Dominar as boas práticas de prompt para tarefas de geração de código
> - Aprender estratégias eficazes para escrever e resumir documentos
> - Entender técnicas de prompt para análise e extração de dados
>
> Pré-requisitos: [<< 05 Depuração e melhoria de prompts](./05-debugging-prompts.md)

## Tarefas diferentes exigem estratégias de prompt diferentes

Você já aprendeu a estrutura básica de um prompt, few-shot, CoT e como depurar — essas são habilidades gerais. Mas tipos diferentes de tarefa têm suas próprias peculiaridades e armadilhas, e pedem estratégias direcionadas.

Geração de código precisa de entradas, saídas e casos-limite claros; escrita de documentos precisa de um público e um tom definidos; extração de dados precisa lidar com valores ausentes e manter o formato consistente. Esta lição percorre técnicas concretas para três tipos comuns de tarefa.[^S12]

## Tipo de tarefa 1: geração de código

Geração de código é uma das formas mais comuns de usar IA. O ponto é simples: **explicite os requisitos com clareza e a IA consegue escrever código que você realmente aproveita**.[^S12]

### Os seis elementos de um prompt de geração de código

Um bom prompt de geração de código deveria incluir:[^S12]

1. **Linguagem e versão**: Python 3.10, TypeScript 5.0
2. **Assinatura da função**: tipos dos parâmetros de entrada, tipo de retorno
3. **Lógica central**: o que a função deve fazer
4. **Casos-limite**: como tratar entrada vazia e condições de erro — isto é programação defensiva: parta do princípio de que a entrada pode ser inválida e decida de antemão como responder
5. **Estilo de código**: comentários, type hints, tratamento de erros
6. **Limites de dependências**: apenas a biblioteca padrão, ou quais bibliotecas de terceiros são permitidas

### Comparação: prompts de código vagos vs. claros

❌ **Prompt vago**:
```
Escreva uma função Python para processar dados de usuário
```

A IA só pode adivinhar: que dados? Processar como?

✅ **Prompt claro**:
```
Escreva uma função Python 3.10 com estes requisitos:

Comportamento:
- Entrada: uma lista de dicts, cada um com name (str), age (int), email (str)
- Saída: descarte usuários com age < 18, devolva os emails dos usuários restantes (sem duplicatas)

Requisitos:
- Inclua type hints
- Trate campos ausentes (se um dict não tiver age ou email, pule esse usuário)
- Use apenas a biblioteca padrão do Python
- Inclua uma docstring descrevendo o uso

Exemplo:
Entrada: [{"name": "Alice", "age": 20, "email": "a@example.com"},
          {"name": "Bob", "age": 15, "email": "b@example.com"},
          {"name": "Charlie", "age": 25, "email": "a@example.com"}]
Saída: ["a@example.com"]
```

Esse prompt amarra a entrada, a saída, os casos-limite e o estilo de código, então a IA consegue escrever código aproveitável já na primeira tentativa.

Há pesquisa por trás disso: "prompts with explicit specifications reduced the need for back-and-forth refinements by 68%" (prompts com especificações explícitas reduziram em 68% a necessidade de refinamentos de ida e volta)[^S12] — detalhe as coisas e a chance de receber código pronto para usar aumenta muito.

### Boas práticas de geração de código

**Prática 1: explicite as estruturas de dados de entrada e saída**

Não diga “processe os dados”. Diga “a entrada é List[Dict[str, Any]], a saída é Dict[str, int]”.

**Prática 2: use exemplos para esclarecer casos-limite**

```
Trate estes casos especiais:
- Lista vazia na entrada → devolva uma lista vazia
- Valor None → pule
- Valor duplicado → mantenha a primeira ocorrência
```

**Prática 3: especifique o estilo de código**

```
Requisitos de estilo de código:
- Use type hints
- Inclua uma docstring (estilo Google)
- Não comente demais (não explique código óbvio)
- Priorize legibilidade primeiro, desempenho depois
```

**Prática 4: diga o que você não quer**

```
Não faça:
- Não use variáveis globais
- Não puxe dependências externas (apenas a biblioteca padrão)
- Não escreva código de teste (apenas a função principal)
```

### Prompts de code review

Quando você pede uma revisão de código à IA, nomeie explicitamente as dimensões da revisão:

```
Revise o código Python abaixo, focando em:

1. Correção: erros de lógica, tratamento de casos-limite
2. Desempenho: análise de complexidade de tempo, possíveis gargalos
3. Segurança: SQL injection, XSS, validação de entrada

Não comente sobre estilo de código nem nomenclatura (esses já passam nas checagens de lint).

Para cada problema encontrado, informe:
- Localização (número da linha ou trecho de código)
- Tipo do problema (bug / desempenho / segurança)
- Impacto concreto (em que condições ele quebra)
- Correção sugerida

Código:
[cole o código]
```

Nomeie as dimensões da revisão e a IA não desperdiça tempo com detalhes que não importam.

## Tipo de tarefa 2: escrita e resumo de documentos

Trabalho com documentos abrange bastante coisa: documentação técnica, anotações de reunião, resumos de artigos, geração de relatórios.

### Os elementos-chave da escrita de documentos

1. **Público-alvo**: leitores técnicos vs. não técnicos
2. **Objetivo**: explicar como usar algo vs. convencer quem decide
3. **Tom e estilo**: formal vs. informal, detalhado vs. conciso
4. **Modelo de estrutura**: quais seções organizam o conteúdo

### Comparação: prompts de resumo de documento

❌ **Prompt vago**:
```
Resuma este documento técnico
```

✅ **Prompt claro**:
```
Você é um redator técnico, bom em transformar documentação técnica
complexa em resumos que qualquer pessoa acompanha.

Tarefa: resuma a documentação de API abaixo como um guia de início rápido
para pessoas desenvolvedoras frontend.

Público: pessoas de engenharia frontend que conhecem JavaScript, mas nunca usaram esta API.

Formato de saída:
1. Uma frase sobre o que esta API faz
2. Os três recursos mais usados (para cada um: objetivo + exemplo de código)
3. Um exemplo completo de cenário de uso
4. Erros comuns e como corrigi-los (2-3)

Tom: direto e prático, sem discurso de marketing.

Tamanho: no máximo 800 palavras.

Documento original:
[cole o documento]
```

Esse prompt amarra o público (pessoas de engenharia frontend), o objetivo (início rápido), a estrutura (quatro partes) e o tom (prático).

### Boas práticas de escrita de documentos

**Prática 1: explicite o repertório do público**

```
Público:
- Papel: gerente de produto
- Nível técnico: não programa, mas entende conceitos básicos de arquitetura de software
- Objetivo de leitura: decidir se adota esta abordagem
```

**Prática 2: forneça um modelo de estrutura**

```
Organize assim:

## Contexto
Por que esta abordagem é necessária (1 parágrafo)

## Opções comparadas
| Opção | Prós | Contras | Custo |
|--------|------|------|------|
| ...    | ...  | ...  | ...  |

## Recomendação
Qual opção escolher, e por quê (2-3 parágrafos)

## Riscos
Os principais riscos desta abordagem e como lidar com eles (lista)
```

**Prática 3: controle o nível de detalhe**

```
Nível de detalhe:
- Explique cada ponto em 1-2 frases, sem se estender
- Pule detalhes de implementação, cubra só o impacto no negócio
- Não cite código específico nem jargão técnico
```

### Prompts de anotações de reunião

```
Você é um assistente de projeto, bom em extrair os pontos
principais de gravações ou transcrições de reunião.

Tarefa: escreva as anotações da reunião a partir da transcrição abaixo.

Estrutura de saída:
1. Informações da reunião
   - Data: AAAA-MM-DD
   - Participantes: [lista]
   - Tema: [uma frase]

2. Discussão (ordenada por prioridade)
   Para cada item:
   - Enunciado do problema (1 frase)
   - Pontos discutidos (2-3)
   - Decisão (uma conclusão clara; se nenhuma foi alcançada, escreva "pendente")

3. Itens de ação
   Para cada um:
   - Descrição da tarefa (comece com um verbo, acionável)
   - Responsável
   - Prazo

Restrições:
- Registre apenas discussões com conclusão clara, pule o bate-papo informal
- Todo item de ação precisa ser verificável (tem uma entrega clara)
- Tamanho total de no máximo 500 palavras

Transcrição:
[cole a transcrição]
```

## Tipo de tarefa 3: análise e extração de dados

Análise de dados abrange extrair informação estruturada de texto, classificar, filtrar e contar.

### Os elementos-chave da extração de dados

Um prompt confiável de extração de dados explicita quatro coisas de antemão:

1. **Definições dos campos**: o que cada campo significa e qual a faixa de valores permitida
2. **Tratamento de valores ausentes**: o que fazer quando um campo não é encontrado
3. **Formato de saída**: JSON, CSV, tabela
4. **Validação de dados**: se os dados extraídos precisam de checagem

### Comparação: prompts de extração de dados

❌ **Prompt vago**:
```
Extraia as informações principais desta vaga de emprego
```

✅ **Prompt claro**:
```
Extraia os campos a seguir da vaga de emprego e devolva JSON.

Definições dos campos:
- position (string): título da vaga
- location (string): local de trabalho (cidade + bairro, se houver)
- experience (string): experiência exigida (mantenha a redação original, ex.: "3-5 anos", "indiferente")
- salary (string): faixa salarial (mantenha as unidades, ex.: "R$ 20-30 mil/mês", "a combinar")
- company (string): nome da empresa

Tratamento de valores ausentes:
- Se um campo não estiver no texto de origem, devolva null
- Não chute nem infira informação ausente

Exemplo 1:
Entrada: Contrata-se com urgência engenheiro Java, Vila Olímpia São Paulo, 3+ anos de experiência, R$ 25-35 mil/mês, XX Tech
Saída:
{
  "position": "Engenheiro Java",
  "location": "Vila Olímpia, São Paulo",
  "experience": "3+ anos",
  "salary": "R$ 25-35 mil/mês",
  "company": "XX Tech"
}

Exemplo 2:
Entrada: Desenvolvedor frontend, remoto, salário a combinar
Saída:
{
  "position": "Desenvolvedor frontend",
  "location": "remoto",
  "experience": null,
  "salary": "a combinar",
  "company": null
}

Agora processe:
[cole a vaga de emprego]
```

Os exemplos cobrem tanto o caso completo quanto o caso com campos ausentes, então a IA sabe devolver null quando não encontra algo, em vez de inventar — esse hábito de fabricar fatos com confiança se chama alucinação (hallucination).

### Boas práticas de extração de dados

**Prática 1: explicite os valores permitidos de cada campo**

```
Campo: sentiment
Valores permitidos: exatamente um entre "positivo" / "negativo" / "neutro"
Não devolva: coisas como bom, animado, favorável, ou qualquer outra palavra
```

**Prática 2: use few-shot para padronizar o formato**

Ao extrair dados estruturados, 2-3 exemplos funcionam melhor do que uma descrição escrita (a técnica de few-shot da Lição 3).

**Prática 3: diga como tratar casos-limite**

```
Casos especiais:
- Se um trecho carregar sentimento misto (“produto bom, mas caro demais”) → classifique como "neutro"
- Se for uma pergunta pura (“como isso funciona?”) → classifique como "neutro"
- Se o texto for curto demais (menos de 3 palavras) → devolva null
```

**Prática 4: acrescente validação de dados**

```
Regras de validação:
- O campo salary precisa conter um número
- Se experience não for null, precisa conter "ano" ou "indiferente"
- location não pode ser string vazia — ou tem um valor, ou é null

Se os dados extraídos violarem uma regra de validação, devolva uma mensagem de erro
em vez dos dados inválidos.
```

```agentmentor-check
{
  "id": "prompt-engineering-task-strategies-match",
  "label": "Combinação de tarefa e estratégia",
  "prompt": "Você quer que a IA extraia os prós e contras de um produto a partir de avaliações de usuários e liste cada um separadamente. Qual estratégia importa mais?\n\nA: Usar chain-of-thought para a IA mostrar a análise dela\nB: Fornecer 2-3 exemplos mostrando como tirar prós e contras de uma avaliação e como formatá-los\nC: Explicar em detalhe o que conta como pró e o que conta como contra\nD: Pedir para a IA assumir o papel de analista de produto",
  "whyHere": "Verifica se você consegue escolher a estratégia decisiva para uma tarefa de extração: aqui, exemplos few-shot ganham de um papel ou de uma definição escrita, porque a parte difícil é um mapeamento consistente de entrada para saída, não raciocínio nem especialidade.",
  "mode": "single",
  "choices": [
    {
      "id": "a",
      "text": "A - Usar CoT para mostrar as etapas da análise",
      "correct": false,
      "feedback": "❌ O CoT combina com tarefas de raciocínio (matemática, lógica), mas extrair prós e contras é reconhecimento de padrão, não raciocínio de várias etapas. Percorrer “primeiro encontre as palavras positivas, depois as negativas” pouco acrescenta à qualidade da extração e só deixa a saída mais longa."
    },
    {
      "id": "b",
      "text": "B - Fornecer exemplos de extração e formatação",
      "correct": true,
      "feedback": "✓ Correto. O cerne de uma tarefa de extração é fazer a IA entender o que conta como pró, o que conta como contra e em que formato devolver. Dois ou três bons exemplos cobrindo casos diferentes ganham de uma explicação escrita longa — eles deixam a IA ver diretamente o mapeamento de entrada para saída."
    },
    {
      "id": "c",
      "text": "C - Explicar as definições de prós e contras",
      "correct": false,
      "feedback": "❌ Uma explicação escrita não é tão clara quanto um exemplo. Você pode escrever um parágrafo dizendo “um pró é algo que o usuário considera bom”, mas um exemplo concreto (“ótima qualidade” → pró) torna muito mais fácil para a IA entender."
    },
    {
      "id": "d",
      "text": "D - Definir o papel da IA como analista de produto",
      "correct": false,
      "feedback": "❌ Um papel pouco acrescenta numa tarefa de extração. A dificuldade aqui não é um ponto de vista especialista, e sim reconhecimento e formatação precisos. Um analista de produto e uma pessoa comum julgam “ótima qualidade” como um pró do mesmo jeito."
    }
  ]
}
```

## Aplicando os princípios gerais

Seja qual for a tarefa, os princípios gerais das lições anteriores continuam valendo:

- **Os quatro elementos** (Lição 2): papel, tarefa, formato, restrições
- **Few-shot** (Lição 3): dê 2-3 exemplos para tarefas complexas
- **CoT** (Lição 4): acrescente “vamos pensar passo a passo” em tarefas que exigem raciocínio
- **Depuração** (Lição 5): mude uma coisa de cada vez, verifique com casos de teste

As estratégias específicas por tarefa desta lição são **otimizações direcionadas** aplicadas em cima desses princípios gerais:

- Geração de código → enfatize tipos de entrada/saída, casos-limite, o que não fazer
- Escrita de documentos → enfatize o repertório do público, modelos de estrutura, tom
- Extração de dados → enfatize definições de campo, tratamento de valores ausentes, exemplos few-shot

## Recapitulação

Tarefas diferentes exigem estratégias de prompt diferentes:

- **Geração de código**: amarre tipos de entrada/saída, casos-limite, estilo de código, limites de dependências; use exemplos para esclarecer casos especiais
- **Escrita de documentos**: defina o repertório e o nível técnico do público, forneça um modelo de estrutura, controle o nível de detalhe e o tom
- **Extração de dados**: defina os valores permitidos de cada campo, diga como tratar valores ausentes, use few-shot para padronizar o formato, acrescente validação de dados

Essas estratégias se apoiam nas habilidades gerais das lições anteriores (os quatro elementos, few-shot, CoT, depuração) — são otimizações para tipos específicos de tarefa. Na prática, escolha a combinação que serve à tarefa que está na sua frente.

**Encerramento do curso**

Você concluiu as seis lições de Fundamentos de Engenharia de Prompt:

1. Entendeu o que um prompt realmente é e por que ele importa
2. Dominou os quatro elementos centrais de um prompt
3. Aprendeu a guiar a IA com exemplos usando few-shot
4. Aplicou chain-of-thought para fazer a IA mostrar o raciocínio dela
5. Construiu uma rotina sistemática para depurar e melhorar prompts
6. Aprendeu as estratégias específicas para tipos diferentes de tarefa

Agora você tem a caixa de ferramentas completa. O próximo passo é **praticar**: pegue uma tarefa real do seu próprio trabalho, aplique estas técnicas, observe o que acontece e siga refinando. Engenharia de prompt é uma habilidade que se afia fazendo — o curso termina aqui, mas o aprendizado de verdade começa quando você põe isso em uso.

<!-- exercises -->

## 💻 Exercícios

### Nível 1: Escolher a estratégia certa para a tarefa

Dadas três tarefas, escolha os pontos de estratégia mais importantes para cada uma e explique por quê.

**Tarefa A**: fazer a IA gerar uma função Python que implementa busca binária
**Tarefa B**: fazer a IA resumir um white paper técnico em um relatório de 2 páginas para a diretoria
**Tarefa C**: fazer a IA extrair nome do cliente, tipo do problema e urgência de um lote de e-mails de clientes

Para cada tarefa, responda:
1. De que tipo de tarefa se trata? (geração de código / escrita de documentos / extração de dados)
2. Quais são os 3 pontos de estratégia mais importantes?
3. Por que esses 3 pontos são os mais importantes para essa tarefa?

<!-- rubric -->
- Identificação correta do tipo de cada tarefa
- Pontos de estratégia escolhidos para cada tarefa específicos (não conselhos genéricos de uso geral)
- Explicação clara de por que essas estratégias importam mais naquela tarefa
- Consideração do que há de particular na tarefa (ex.: a mudança de público na Tarefa B, a consistência de formato na Tarefa C)
- Pontos de estratégia vindos do que esta lição ensinou
<!-- answer -->
**Tarefa A: função Python de busca binária**

1. **Tipo de tarefa**: geração de código

2. **Estratégias principais**:
   - Amarrar a assinatura da função: tipo de entrada (uma List[int] ordenada, target: int), tipo de retorno (int — o índice, ou -1)
   - Explicitar os casos-limite: lista vazia, target ausente, elementos duplicados
   - Especificar o estilo de código: type hints, docstring, sem comentários linha a linha

3. **Por que isso importa**:
   - Busca binária tem várias implementações (recursiva vs. iterativa, intervalo semiaberto vs. fechado); sem especificidade você não sabe qual vai receber
   - Casos-limite são onde a busca binária mais gera bug (off-by-one), então precisam ser declarados
   - Código de algoritmo deve se explicar sozinho; comentar demais na verdade atrapalha a legibilidade

---

**Tarefa B: white paper técnico → relatório para a diretoria**

1. **Tipo de tarefa**: escrita de documentos

2. **Estratégias principais**:
   - Definir o público: diretoria (não quer detalhe técnico, se importa com valor de negócio e custo)
   - Fornecer um modelo de estrutura: resumo executivo → impacto no negócio → custo-benefício → riscos → recomendação
   - Controlar o nível de detalhe: pular detalhes de implementação, trocar jargão por linguagem de negócio, 2-3 frases por ponto

3. **Por que isso importa**:
   - White paper virando relatório para a diretoria é uma tarefa de “tradução”; o maior desafio é a mudança de público
   - A diretoria lê um relatório para decidir, então a estrutura deve girar em torno de “por que fazer, quanto custa, quais são os riscos”
   - Errar o nível de detalhe deixa o texto ou técnico demais (a diretoria não acompanha) ou raso demais (sem base para decidir)

---

**Tarefa C: extrair informação estruturada de e-mails de clientes**

1. **Tipo de tarefa**: extração de dados

2. **Estratégias principais**:
   - Definir os valores permitidos por campo: tipo do problema (defeito do produto / dúvida de cobrança / pergunta sobre funcionalidade), urgência (alta / média / baixa)
   - Usar few-shot para padronizar o formato: 2-3 exemplos mostrando como julgar tipo do problema e urgência a partir de um e-mail
   - Dizer como tratar valores ausentes: se o e-mail não mencionar o nome do cliente, devolva “não informado” — não deduza a partir do endereço de e-mail

3. **Por que isso importa**:
   - Clientes se expressam de todo jeito; sem exemplos mostrando os critérios de julgamento, a IA tem dificuldade de classificar de forma consistente
   - “Urgência” é uma avaliação subjetiva, e exemplos few-shot estabelecem um padrão comum (ex.: “sistema totalmente fora do ar” é urgência alta)
   - Sem tratamento de valores ausentes, a IA pode chutar o nome do cliente “Suporte” a partir de “support@company.com” e corromper os dados

<!-- hint -->
Cada tipo de tarefa tem um desafio central diferente: geração de código teme a ambiguidade (amarre a especificação), escrita de documentos teme o descompasso (mire no público), extração de dados teme a inconsistência (padronize o formato).
<!-- hint -->
Ao escolher uma estratégia, pergunte: onde esta tarefa tem mais chance de dar errado? Mire nessa maior armadilha com a estratégia correspondente.

### Nível 2: Projetar um prompt completo de tarefa

Escolha um dos cenários abaixo e projete um prompt completo que reúna tudo o que o curso ensinou.

**Opções de cenário**:

**Cenário 1**: assistente de code review
- Fazer a IA revisar um trecho de código Python em busca de possíveis problemas de desempenho e falhas de segurança
- Devolver um relatório de revisão estruturado, ordenado por severidade
- Cada problema inclui: localização, descrição, correção sugerida, prioridade

**Cenário 2**: gerador de anotações de estudo
- Dar à IA a transcrição de uma aula técnica
- Gerar anotações de estudo estruturadas: conceitos centrais, pontos-chave, dicas de prática, leitura complementar
- Voltadas a iniciantes, em linguagem simples

**Cenário 3**: analisador de feedback de clientes
- Extrair problemas comuns de 10-20 feedbacks de clientes
- Saída: categorias de problema, a frequência de cada categoria, exemplos concretos, direções de melhoria sugeridas
- Usado para decisões de iteração do produto

**Requisitos**:
Seu prompt precisa:
1. Incluir os quatro elementos (papel, tarefa, formato, restrições)
2. Fornecer 2-3 exemplos few-shot, se exemplos forem necessários
3. Acrescentar orientação de CoT, se houver raciocínio ou análise envolvidos
4. Contemplar casos-limite e tratamento de valores ausentes
5. Ter um formato de saída claro e fácil de usar mais adiante

<!-- rubric -->
- Prompt estruturalmente completo, com os quatro elementos de que precisa
- Descrição de tarefa clara, com público e objetivo definidos
- Formato de saída estruturado, com definições de campo claras
- Inclusão de exemplos ou orientação de CoT apropriados (compatíveis com o tipo de tarefa)
- Consideração dos casos-limite (ex.: “nenhum problema encontrado” num code review, “transcrição de baixa qualidade” em anotações de estudo)
- Restrições sensatas, descartando saída indesejada
- Praticidade geral, pronto para usar em uma tarefa real
<!-- answer -->
**Exemplo do Cenário 1: assistente de code review**

````
[Papel] Você é uma pessoa sênior de engenharia especializada em code review
de Python, focada em otimização de desempenho e reforço de segurança.

[Tarefa] Revise o código Python abaixo em busca de possíveis problemas de
desempenho e falhas de segurança.

[Dimensões da revisão] (por prioridade)
1. Falhas de segurança: SQL injection, XSS, entrada não validada, segredos hardcoded
2. Problemas de desempenho: algoritmos acima de O(n^2), computação repetida, uso desnecessário de memória
3. Problemas de concorrência: condições de corrida, risco de deadlock (se o código envolver multithreading)

[Formato de saída]
Para cada problema encontrado, devolva neste formato:

Severidade: [alta/média/baixa]
Localização: linha X / função Y
Tipo do problema: [segurança/desempenho/concorrência]
O problema: [descrição detalhada, em que condições ele quebra]
Correção sugerida: [concretamente o que mudar, com um trecho de código ou uma abordagem]

---

[Restrições]
- Prioridade: segurança > desempenho > todo o resto
- Aponte apenas problemas que afetam de verdade a produção; não implique com estilo
- Se o código não tiver problemas, devolva: "Nenhum problema de prioridade alta/média encontrado. A qualidade do código está boa."
- Toda sugestão de correção precisa ser concreta e acionável; não diga coisas vagas como “melhore o algoritmo”
- Devolva no máximo 10 problemas (ordenados por severidade)

[Código]
```python
[cole o código]
```
````

**Por que esse prompt funciona**:
1. **Papel + tarefa**: pessoa sênior de engenharia + um objetivo concreto de revisão dão à IA um ponto de vista claro
2. **Prioridades claras**: as três dimensões estão ordenadas por importância, então a IA sabe onde focar
3. **Saída estruturada**: cinco campos (severidade, localização, tipo, problema, correção) facilitam o processamento
4. **Tratamento de casos-limite**: o caso “sem problemas” tem uma saída definida, então a IA não inventa problemas
5. **Restrições claras**: “não implique com estilo”, “no máximo 10”, “correções precisam ser concretas” impedem a saída de derivar
6. **Juntando tudo**:
   - Os quatro elementos: papel (pessoa de revisão), tarefa (encontrar problemas), formato (estruturado), restrições (prioridade + quantidade)
   - Estratégia específica da tarefa: code review precisa de dimensões de revisão nomeadas, informação de localização na saída e sugestões acionáveis
   - Casos-limite: contempla a situação “sem problemas”

<!-- hint -->
Passos para projetar um prompt combinado: (1) enquadre primeiro com os quatro elementos, (2) acrescente estratégias específicas conforme o tipo (few-shot / CoT / definição de formato), (3) pense nos casos-limite e acrescente restrições, (4) verifique se o formato de saída é fácil de usar.
<!-- hint -->
Depois de projetar, leia o prompt como se você fosse a IA: dá para entender cada requisito de primeira? Tem algum ponto vago? O formato de saída pode ser copiado e colado direto num relatório?

<!-- /exercises -->

